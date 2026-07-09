import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import {
  outlookMailMessageDeleteInputSchema,
  outlookMailMessageForwardInputSchema,
  outlookMailMessageMarkReadInputSchema,
  outlookMailMessageMoveInputSchema,
  outlookMailMessageReplyInputSchema,
} from "@ai-assistants/outlook-mail-contracts/schemas";
import {
  markProviderExecutionStarted,
  providerIdempotencyKey,
} from "../../product/actions/execution/provider-runtime";
import {
  providerWriteRecordValue,
  recordProviderActionWriteReceipt,
} from "../../product/actions/execution/provider-write-receipts";
import type { ActionResult } from "../../product/actions/execution/types";
import {
  executeOutlookMailNangoProxyOperation,
  outlookMailNangoProxyRecordSchema,
} from "../../integrations/nango/outlook-mail-proxy";
import { requireOutlookMailMailboxNango } from "./connection";
import { outlookSendMailBody } from "./message-format";
import {
  loadOutlookMailSendAttachments,
  preflightOutlookMailMessageSend,
  type OutlookMailMessageSendPayload,
} from "./message-send-payload";

type OutlookMailReplyInput = ReturnType<typeof outlookMailMessageReplyInputSchema.parse>;
type OutlookMailForwardInput = ReturnType<typeof outlookMailMessageForwardInputSchema.parse>;
type OutlookMailMoveInput = ReturnType<typeof outlookMailMessageMoveInputSchema.parse>;
type OutlookMailMarkReadInput = ReturnType<typeof outlookMailMessageMarkReadInputSchema.parse>;
type OutlookMailDeleteInput = ReturnType<typeof outlookMailMessageDeleteInputSchema.parse>;

async function recordOutlookMailWriteReceipt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  binding: Awaited<ReturnType<typeof requireOutlookMailMailboxNango>>,
  input: {
    toolName: string;
    externalResourceId: string;
    operation: string;
    startedAt: string;
    result: unknown;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await recordProviderActionWriteReceipt(db, action, binding, {
    providerKey: "outlook-mail",
    capabilitySlug: "outlook-mail",
    externalResourceType: "message",
    ...input,
  });
}

export async function executeOutlookMailEmailSendPayload(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: OutlookMailMessageSendPayload,
): Promise<ActionResult> {
  const preflight = await preflightOutlookMailMessageSend(db, action.profile_id, payload);
  const resolved = preflight.payload;
  const sandbox = { db, binding: preflight.connection };
  const attachments = await loadOutlookMailSendAttachments(db, action.profile_id, resolved);
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const body = outlookSendMailBody(resolved, attachments);
  const result = await executeOutlookMailNangoProxyOperation(
    preflight.connection.nangoProviderConfigKey,
    preflight.connection.nangoConnectionId,
    "send-mail",
    outlookMailNangoProxyRecordSchema,
    body,
    sandbox,
  );
  await recordOutlookMailWriteReceipt(db, action, preflight.connection, {
    toolName: action.tool_name,
    externalResourceId:
      providerWriteRecordValue(result, "id") ?? providerIdempotencyKey(executionAction),
    operation: "send",
    startedAt,
    result,
    metadata: { idempotencyKey: providerIdempotencyKey(executionAction) },
  });
  return {
    status: "executed",
    provider: "outlook-mail",
    result: { ...result, idempotencyKey: providerIdempotencyKey(executionAction) },
  };
}

export async function executeOutlookMailMessageReply(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: OutlookMailReplyInput,
): Promise<ActionResult> {
  const b = await requireOutlookMailMailboxNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const result = await executeOutlookMailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "reply-to-message",
    outlookMailNangoProxyRecordSchema,
    {
      messageId: params.replyToMessageId,
      comment: params.bodyText,
    },
    sandbox,
  );
  await recordOutlookMailWriteReceipt(db, action, b, {
    toolName: "outlook_mail_message_reply",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.replyToMessageId,
    operation: "reply",
    startedAt,
    result,
    metadata: { replyToMessageId: params.replyToMessageId },
  });
  return { status: "executed", provider: "outlook-mail", result };
}

export async function executeOutlookMailMessageForward(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: OutlookMailForwardInput,
): Promise<ActionResult> {
  const b = await requireOutlookMailMailboxNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const message = await executeOutlookMailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "get-message",
    outlookMailNangoProxyRecordSchema,
    { messageId: params.forwardMessageId },
    sandbox,
  );
  const subject = `Fwd: ${message.subject ?? ""}`.trim();
  const bodyText = `${params.additionalComment ? `${params.additionalComment}\n\n` : ""}${message.bodyPreview ?? ""}`;
  const payload: OutlookMailMessageSendPayload = {
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    subject,
    bodyText,
    profileFileIds: [],
    expectedProfileFileSha256ById: {},
  };
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const result = await executeOutlookMailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "send-mail",
    outlookMailNangoProxyRecordSchema,
    outlookSendMailBody(payload, []),
    sandbox,
  );
  await recordOutlookMailWriteReceipt(db, action, b, {
    toolName: "outlook_mail_message_forward",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.forwardMessageId,
    operation: "forward",
    startedAt,
    result,
    metadata: { forwardMessageId: params.forwardMessageId },
  });
  return { status: "executed", provider: "outlook-mail", result };
}

export async function executeOutlookMailMessageMove(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: OutlookMailMoveInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireOutlookMailMailboxNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeOutlookMailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "move-message",
    outlookMailNangoProxyRecordSchema,
    {
      messageId: params.messageId,
      destinationId: params.destinationMailboxId,
    },
    sandbox,
  );
  await recordOutlookMailWriteReceipt(db, action, b, {
    toolName: "outlook_mail_message_move",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.messageId,
    operation: "move",
    startedAt,
    result,
    metadata: { destinationMailboxId: params.destinationMailboxId },
  });
  return { status: "executed", provider: "outlook-mail", result };
}

export async function executeOutlookMailMessageMarkRead(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: OutlookMailMarkReadInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireOutlookMailMailboxNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeOutlookMailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "update-message",
    outlookMailNangoProxyRecordSchema,
    {
      messageId: params.messageId,
      isRead: params.isRead,
    },
    sandbox,
  );
  await recordOutlookMailWriteReceipt(db, action, b, {
    toolName: "outlook_mail_message_mark_read",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.messageId,
    operation: params.isRead ? "mark_read" : "mark_unread",
    startedAt,
    result,
  });
  return { status: "executed", provider: "outlook-mail", result };
}

export async function executeOutlookMailMessageDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: OutlookMailDeleteInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireOutlookMailMailboxNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeOutlookMailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "delete-message",
    outlookMailNangoProxyRecordSchema,
    { messageId: params.messageId },
    sandbox,
  );
  await recordOutlookMailWriteReceipt(db, action, b, {
    toolName: "outlook_mail_message_delete",
    externalResourceId: params.messageId,
    operation: "delete",
    startedAt,
    result,
  });
  return { status: "executed", provider: "outlook-mail", result };
}
