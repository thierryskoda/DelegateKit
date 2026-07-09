import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  gmailMessageDeleteInputSchema,
  gmailMessageForwardInputSchema,
  gmailMessageMarkReadInputSchema,
  gmailMessageMoveInputSchema,
  gmailMessageReplyInputSchema,
} from "@ai-assistants/gmail-contracts/schemas";
import {
  markProviderExecutionStarted,
  providerIdempotencyKey,
  providerKeyHash,
} from "../../product/actions/execution/provider-runtime";
import {
  providerWriteRecordValue,
  recordProviderActionWriteReceipt,
} from "../../product/actions/execution/provider-write-receipts";
import type { ActionResult } from "../../product/actions/execution/types";
import {
  executeGmailNangoProxyOperation,
  gmailNangoProxyRecordSchema,
} from "../../integrations/nango/gmail-proxy";
import { requireGmailMailboxNango } from "./connection";
import { gmailMimePlain, gmailRawMessage } from "./message-format";
import {
  loadGmailSendAttachments,
  preflightGmailMessageSend,
  type GmailMessageSendPayload,
} from "./message-send-payload";

type GmailReplyInput = ReturnType<typeof gmailMessageReplyInputSchema.parse>;
type GmailForwardInput = ReturnType<typeof gmailMessageForwardInputSchema.parse>;
type GmailMoveInput = ReturnType<typeof gmailMessageMoveInputSchema.parse>;
type GmailMarkReadInput = ReturnType<typeof gmailMessageMarkReadInputSchema.parse>;
type GmailDeleteInput = ReturnType<typeof gmailMessageDeleteInputSchema.parse>;

function gmailMessageIdValue(action: TableRow<"profile_actions">): string {
  return `ai-assistants-${providerKeyHash(action)}@idempotency.ai-assistants.local`;
}

function gmailMessageIdHeader(action: TableRow<"profile_actions">): string {
  return `<${gmailMessageIdValue(action)}>`;
}

function gmailHeadersFromMeta(meta: Record<string, unknown>): Record<string, string> {
  const payload = meta.payload as { headers?: { name: string; value: string }[] } | undefined;
  const map: Record<string, string> = {};
  for (const h of payload?.headers ?? []) {
    map[h.name.toLowerCase()] = h.value;
  }
  return map;
}

function extractEmailAddress(fromHeader: string | undefined): string {
  if (!fromHeader?.trim())
    throw new DomainError(domainCodes.BAD_REQUEST, "Could not parse sender address for reply.");
  const m = fromHeader.match(/<([^>]+)>/);
  if (m?.[1]) return m[1].trim();
  return fromHeader.trim();
}

async function recordGmailWriteReceipt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  binding: Awaited<ReturnType<typeof requireGmailMailboxNango>>,
  input: {
    toolName: string;
    externalResourceType: string;
    externalResourceId: string;
    operation: string;
    startedAt: string;
    result: unknown;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await recordProviderActionWriteReceipt(db, action, binding, {
    providerKey: "gmail",
    capabilitySlug: "gmail",
    ...input,
  });
}

export async function executeGmailEmailSendPayload(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: GmailMessageSendPayload,
): Promise<ActionResult> {
  const preflight = await preflightGmailMessageSend(db, action.profile_id, payload);
  const resolved = preflight.payload;
  const sandbox = { db, binding: preflight.connection };
  const attachments = await loadGmailSendAttachments(db, action.profile_id, resolved);
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const messageId = gmailMessageIdHeader(executionAction);
  const raw = gmailRawMessage(resolved, attachments, { messageId });
  const result = await executeGmailNangoProxyOperation(
    preflight.connection.nangoProviderConfigKey,
    preflight.connection.nangoConnectionId,
    "send-message",
    gmailNangoProxyRecordSchema,
    {
      raw,
      ...(resolved.threadId ? { threadId: resolved.threadId } : {}),
    },
    sandbox,
  );
  await recordGmailWriteReceipt(db, action, preflight.connection, {
    toolName: action.tool_name,
    externalResourceType: "message",
    externalResourceId:
      providerWriteRecordValue(result, "id") ?? gmailMessageIdValue(executionAction),
    operation: "send",
    startedAt,
    result,
    metadata: {
      messageId: gmailMessageIdValue(executionAction),
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  });
  return {
    status: "executed",
    provider: "gmail",
    result: {
      ...result,
      messageId: gmailMessageIdValue(executionAction),
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}

export async function executeGmailMessageReply(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: GmailReplyInput,
): Promise<ActionResult> {
  const b = await requireGmailMailboxNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const meta = await executeGmailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "get-message",
    gmailNangoProxyRecordSchema,
    {
      id: params.replyToMessageId,
      format: "metadata",
      metadataHeaders: ["Subject", "Message-ID", "From", "To"],
    },
    sandbox,
  );
  const headers = gmailHeadersFromMeta(meta);
  const threadId = typeof meta.threadId === "string" ? meta.threadId : undefined;
  const inReply = headers["message-id"];
  if (!inReply)
    throw new DomainError(domainCodes.INTERNAL, "Gmail reply: original Message-ID header missing.");
  const from = extractEmailAddress(headers.from);
  const toList = params.to?.length ? params.to : [from];
  const subjBase = headers.subject ?? "";
  const subj = subjBase.toLowerCase().startsWith("re:") ? subjBase : `Re: ${subjBase}`.trim();
  const extra = [`In-Reply-To: ${inReply}`, `References: ${inReply}`];
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const raw = gmailMimePlain(
    {
      to: toList,
      cc: params.cc,
      bcc: params.bcc,
      subject: subj || "Re:",
      bodyText: params.bodyText,
      headerLines: extra,
    },
    { messageId: gmailMessageIdHeader(executionAction) },
  );
  const result = await executeGmailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "send-message",
    gmailNangoProxyRecordSchema,
    {
      raw,
      ...(threadId ? { threadId } : {}),
    },
    sandbox,
  );
  await recordGmailWriteReceipt(db, action, b, {
    toolName: "gmail_message_reply",
    externalResourceType: "message",
    externalResourceId: providerWriteRecordValue(result, "id") ?? gmailMessageIdValue(executionAction),
    operation: "reply",
    startedAt,
    result,
    metadata: {
      replyToMessageId: params.replyToMessageId,
      threadId: threadId ?? null,
      messageId: gmailMessageIdValue(executionAction),
    },
  });
  return { status: "executed", provider: "gmail", result };
}

export async function executeGmailMessageForward(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: GmailForwardInput,
): Promise<ActionResult> {
  const b = await requireGmailMailboxNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const full = await executeGmailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "get-message",
    gmailNangoProxyRecordSchema,
    {
      id: params.forwardMessageId,
      format: "full",
    },
    sandbox,
  );
  const snippet = typeof full.snippet === "string" ? full.snippet : "";
  const bodyText = `${params.additionalComment ? `${params.additionalComment}\n\n` : ""}--- Forwarded message ---\n${snippet}`;
  const raw = gmailMimePlain({
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    subject: `Fwd: message ${params.forwardMessageId}`,
    bodyText,
  });
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const result = await executeGmailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "send-message",
    gmailNangoProxyRecordSchema,
    { raw },
    sandbox,
  );
  await recordGmailWriteReceipt(db, action, b, {
    toolName: "gmail_message_forward",
    externalResourceType: "message",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.forwardMessageId,
    operation: "forward",
    startedAt,
    result,
    metadata: { forwardMessageId: params.forwardMessageId },
  });
  return { status: "executed", provider: "gmail", result };
}

export async function executeGmailMessageMove(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: GmailMoveInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGmailMailboxNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGmailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "modify-message",
    gmailNangoProxyRecordSchema,
    {
      id: params.messageId,
      addLabelIds: [params.destinationMailboxId],
      removeLabelIds: ["INBOX"],
    },
    sandbox,
  );
  await recordGmailWriteReceipt(db, action, b, {
    toolName: "gmail_message_move",
    externalResourceType: "message",
    externalResourceId: params.messageId,
    operation: "move",
    startedAt,
    result,
    metadata: { destinationMailboxId: params.destinationMailboxId },
  });
  return { status: "executed", provider: "gmail", result };
}

export async function executeGmailMessageMarkRead(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: GmailMarkReadInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGmailMailboxNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const mod: { id: string; addLabelIds?: string[]; removeLabelIds?: string[] } = {
    id: params.messageId,
  };
  if (params.isRead) mod.removeLabelIds = ["UNREAD"];
  else mod.addLabelIds = ["UNREAD"];
  const result = await executeGmailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "modify-message",
    gmailNangoProxyRecordSchema,
    mod,
    sandbox,
  );
  await recordGmailWriteReceipt(db, action, b, {
    toolName: "gmail_message_mark_read",
    externalResourceType: "message",
    externalResourceId: params.messageId,
    operation: params.isRead ? "mark_read" : "mark_unread",
    startedAt,
    result,
  });
  return { status: "executed", provider: "gmail", result };
}

export async function executeGmailMessageDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: GmailDeleteInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGmailMailboxNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGmailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "trash-message",
    gmailNangoProxyRecordSchema,
    { id: params.messageId },
    sandbox,
  );
  await recordGmailWriteReceipt(db, action, b, {
    toolName: "gmail_message_delete",
    externalResourceType: "message",
    externalResourceId: params.messageId,
    operation: "trash",
    startedAt,
    result,
  });
  return { status: "executed", provider: "gmail", result };
}
