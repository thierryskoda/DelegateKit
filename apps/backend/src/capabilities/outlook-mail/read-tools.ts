import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { outlookMailToolContracts } from "@ai-assistants/outlook-mail-contracts/contracts";
import {
  outlookMailAccountsListInputSchema,
  outlookMailAttachmentSaveInputSchema,
  outlookMailMessageGetInputSchema,
  outlookMailMessageGetOutputSchema,
  outlookMailMessagesSearchInputSchema,
  outlookMailMessagesSearchOutputSchema,
} from "@ai-assistants/outlook-mail-contracts/schemas";
import {
  toolContractByName,
  toolData,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";
import {
  executeOutlookMailNangoProxyOperation,
  outlookMailNangoProxyRecordSchema,
} from "../../integrations/nango/outlook-mail-proxy";
import { recordProviderBinaryArtifact } from "../../product/artifacts/provider-binary-artifact";
import { PROVIDER_BINARY_ARTIFACT_MAX_BYTES } from "../../product/artifacts/provider-binary-limits";
import { listProviderAccountChoices } from "../../product/connected-accounts/provider-account-choices";
import { requireOutlookMailMailboxNango } from "./connection";
import {
  normalizeOutlookMailMessage,
  normalizeOutlookMailMessageListItem,
} from "./message-normalization";

const outlookAttachmentResponseSchema = z.object({
  content: z.string(),
  contentType: z.string(),
  name: z.string().optional(),
});

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function listOutlookMailAccounts(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<BackendToolResult> {
  return toolDataForContract(
    toolContractByName(outlookMailToolContracts, "outlook_mail_accounts_list"),
    {
      accounts: await listProviderAccountChoices(db, {
        profileId,
        capabilitySlug: "outlook-mail",
        label: "List Outlook Mail capability instances",
      }),
    },
  );
}

async function searchOutlookMailMessages(
  db: SupabaseServiceClient,
  profileId: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  const p = outlookMailMessagesSearchInputSchema.parse(params);
  const maxResults = p.maxResults ?? p.limit ?? 25;
  const b = await requireOutlookMailMailboxNango(db, profileId, p.connectedAccountId);
  const sandbox = { db, binding: b };
  const providerData = await executeOutlookMailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "list-messages",
    outlookMailNangoProxyRecordSchema,
    {
      folderId: p.folderId ?? "inbox",
      ...(p.query ? { filter: p.query } : {}),
      limit: Math.min(50, maxResults),
      cursor: p.messagesPageCursor,
    },
    sandbox,
  );
  const record = recordValue(providerData);
  return toolData(
    outlookMailMessagesSearchOutputSchema.parse({
      provider: "outlook-mail",
      accountEmail: b.account.account_email,
      messages: arrayValue(record.messages).map((message) =>
        normalizeOutlookMailMessageListItem(message),
      ),
      nextCursor: stringValue(record.next_cursor) ?? stringValue(record.nextCursor),
    }),
  );
}

async function getOutlookMailMessage(
  db: SupabaseServiceClient,
  profileId: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  const p = outlookMailMessageGetInputSchema.parse(params);
  const b = await requireOutlookMailMailboxNango(db, profileId, p.connectedAccountId);
  const sandbox = { db, binding: b };
  const providerData = await executeOutlookMailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "get-message",
    outlookMailNangoProxyRecordSchema,
    { messageId: p.messageId },
    sandbox,
  );
  return toolData(
    outlookMailMessageGetOutputSchema.parse({
      provider: "outlook-mail",
      accountEmail: b.account.account_email,
      message: normalizeOutlookMailMessage(providerData),
    }),
  );
}

async function saveOutlookMailAttachment(
  db: SupabaseServiceClient,
  profileId: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  const p = outlookMailAttachmentSaveInputSchema.parse(params);
  const b = await requireOutlookMailMailboxNango(db, profileId, p.connectedAccountId);
  const sandbox = { db, binding: b };
  const att = await executeOutlookMailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "download-message-attachment",
    outlookAttachmentResponseSchema,
    {
      messageId: p.messageId,
      attachmentId: p.attachmentId,
    },
    sandbox,
  );
  const bytes = Buffer.from(att.content, "base64");
  if (bytes.byteLength > PROVIDER_BINARY_ARTIFACT_MAX_BYTES) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Attachment is ${bytes.byteLength} bytes; max allowed is ${PROVIDER_BINARY_ARTIFACT_MAX_BYTES} bytes.`,
    );
  }
  const artifact = await recordProviderBinaryArtifact(db, {
    profileId,
    body: bytes,
    contentType: att.contentType || "application/octet-stream",
    filename: p.filename ?? att.name ?? `attachment-${p.attachmentId}`,
    storagePrefix: "email-attachments",
    artifactType: "email.attachment",
    metadata: {
      source: "outlook_mail_attachment_save",
      provider: b.link.provider,
      messageId: p.messageId,
      attachmentId: p.attachmentId,
    },
    incompleteMetadataMessage: "Email attachment artifact metadata is incomplete after save.",
  });
  return toolDataForContract(
    toolContractByName(outlookMailToolContracts, "outlook_mail_attachment_save"),
    {
      provider: "outlook-mail",
      accountEmail: b.account.account_email,
      profileFileId: artifact.artifactId,
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      byteSize: artifact.byteSize,
      sha256: artifact.sha256,
    },
  );
}

export async function executeOutlookMailReadTool(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  switch (toolName) {
    case "outlook_mail_accounts_list":
      outlookMailAccountsListInputSchema.parse(params);
      return listOutlookMailAccounts(db, profileId);
    case "outlook_mail_messages_search":
      return searchOutlookMailMessages(db, profileId, params);
    case "outlook_mail_message_get":
      return getOutlookMailMessage(db, profileId, params);
    case "outlook_mail_attachment_save":
      return saveOutlookMailAttachment(db, profileId, params);
    default:
      throw new DomainError(
        domainCodes.INTERNAL,
        `Outlook Mail read handler missing for ${toolName}.`,
      );
  }
}
