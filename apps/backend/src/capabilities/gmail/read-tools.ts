import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { gmailToolContracts } from "@ai-assistants/gmail-contracts/contracts";
import {
  gmailAccountsListInputSchema,
  gmailAttachmentSaveInputSchema,
  gmailMessageDetailSchema,
  gmailMessageGetInputSchema,
  gmailMessageGetOutputSchema,
  gmailMessageListItemSchema,
  gmailMessagesSearchInputSchema,
  gmailMessagesSearchOutputSchema,
  type GmailMessageDetail,
  type GmailMessageListItem,
} from "@ai-assistants/gmail-contracts/schemas";
import {
  toolContractByName,
  toolData,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";
import {
  executeGmailNangoProxyOperation,
  gmailNangoProxyRecordSchema,
} from "../../integrations/nango/gmail-proxy";
import { recordProviderBinaryArtifact } from "../../product/artifacts/provider-binary-artifact";
import { PROVIDER_BINARY_ARTIFACT_MAX_BYTES } from "../../product/artifacts/provider-binary-limits";
import { listProviderAccountChoices } from "../../product/connected-accounts/provider-account-choices";
import { requireGmailMailboxNango } from "./connection";
import { hydrateGmailSearchListMessages } from "./hydrate-search-messages";
import { normalizeGmailMessage } from "./message-normalization";

const gmailAttachmentResponseSchema = z.object({ size: z.number(), data: z.string() });

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

async function loadProfileTimezone(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<string> {
  const result = await db.from("profiles").select("timezone").eq("id", profileId).maybeSingle();
  if (result.error) throw result.error;
  const timezone = result.data?.timezone?.trim();
  if (!timezone) {
    throw new DomainError(domainCodes.NOT_FOUND, `Profile ${profileId} has no timezone.`);
  }
  return timezone;
}

function formatProfileLocalTimestamp(timestamp: string | null, timezone: string): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function withDetailProfileLocalTimes(
  message: GmailMessageDetail,
  timezone: string,
): GmailMessageDetail {
  return {
    ...message,
    sentAtProfileLocal: formatProfileLocalTimestamp(message.sentAt, timezone),
    receivedAtProfileLocal: formatProfileLocalTimestamp(message.receivedAt, timezone),
  };
}

function withListItemProfileLocalTimes(
  message: GmailMessageListItem,
  timezone: string,
): GmailMessageListItem {
  return {
    ...message,
    receivedAtProfileLocal: formatProfileLocalTimestamp(message.receivedAt, timezone),
  };
}

async function listGmailAccounts(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<BackendToolResult> {
  return toolDataForContract(toolContractByName(gmailToolContracts, "gmail_accounts_list"), {
    accounts: await listProviderAccountChoices(db, {
      profileId,
      capabilitySlug: "gmail",
      label: "List Gmail capability instances",
    }),
  });
}

async function searchGmailMessages(
  db: SupabaseServiceClient,
  profileId: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  const p = gmailMessagesSearchInputSchema.parse(params);
  const maxResults = p.maxResults ?? p.limit ?? 25;
  const b = await requireGmailMailboxNango(db, profileId, p.connectedAccountId);
  const sandbox = { db, binding: b };
  const providerData = await executeGmailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "list-messages",
    gmailNangoProxyRecordSchema,
    {
      ...(p.query ? { q: p.query } : {}),
      maxResults,
      pageToken: p.messagesPageCursor,
    },
    sandbox,
  );
  const record = recordValue(providerData);
  const timezone = await loadProfileTimezone(db, profileId);
  const messages = await hydrateGmailSearchListMessages({
    nangoProviderConfigKey: b.nangoProviderConfigKey,
    nangoConnectionId: b.nangoConnectionId,
    messages: arrayValue(record.messages),
    includeAttachmentMetadata: p.includeAttachmentMetadata === true,
    sandbox,
  });
  return toolData(
    gmailMessagesSearchOutputSchema.parse({
      provider: "gmail",
      accountEmail: b.account.account_email,
      messages: messages.map((message) =>
        gmailMessageListItemSchema.parse(withListItemProfileLocalTimes(message, timezone)),
      ),
      attachmentMetadataIncluded: p.includeAttachmentMetadata === true,
      nextCursor: stringValue(record.nextPageToken) ?? stringValue(record.nextCursor),
    }),
  );
}

async function getGmailMessage(
  db: SupabaseServiceClient,
  profileId: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  const p = gmailMessageGetInputSchema.parse(params);
  const b = await requireGmailMailboxNango(db, profileId, p.connectedAccountId);
  const sandbox = { db, binding: b };
  const providerData = await executeGmailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "get-message",
    gmailNangoProxyRecordSchema,
    { id: p.messageId },
    sandbox,
  );
  const timezone = await loadProfileTimezone(db, profileId);
  return toolData(
    gmailMessageGetOutputSchema.parse({
      provider: "gmail",
      accountEmail: b.account.account_email,
      message: gmailMessageDetailSchema.parse(
        withDetailProfileLocalTimes(normalizeGmailMessage(providerData), timezone),
      ),
    }),
  );
}

async function saveGmailAttachment(
  db: SupabaseServiceClient,
  profileId: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  const p = gmailAttachmentSaveInputSchema.parse(params);
  const b = await requireGmailMailboxNango(db, profileId, p.connectedAccountId);
  const sandbox = { db, binding: b };
  const att = await executeGmailNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "get-attachment",
    gmailAttachmentResponseSchema,
    {
      messageId: p.messageId,
      attachmentId: p.attachmentId,
    },
    sandbox,
  );
  const bytes = Buffer.from(att.data, "base64url");
  if (bytes.byteLength > PROVIDER_BINARY_ARTIFACT_MAX_BYTES) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Attachment is ${bytes.byteLength} bytes; max allowed is ${PROVIDER_BINARY_ARTIFACT_MAX_BYTES} bytes.`,
    );
  }
  const artifact = await recordProviderBinaryArtifact(db, {
    profileId,
    body: bytes,
    contentType: "application/octet-stream",
    filename: p.filename ?? `attachment-${p.attachmentId}`,
    storagePrefix: "email-attachments",
    artifactType: "email.attachment",
    metadata: {
      source: "gmail_attachment_save",
      provider: b.link.provider,
      messageId: p.messageId,
      attachmentId: p.attachmentId,
    },
    incompleteMetadataMessage: "Email attachment artifact metadata is incomplete after save.",
  });
  return toolDataForContract(toolContractByName(gmailToolContracts, "gmail_attachment_save"), {
    provider: "gmail",
    accountEmail: b.account.account_email,
    profileFileId: artifact.artifactId,
    filename: artifact.filename,
    mimeType: artifact.mimeType,
    byteSize: artifact.byteSize,
    sha256: artifact.sha256,
  });
}

export async function executeGmailReadTool(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  switch (toolName) {
    case "gmail_accounts_list":
      gmailAccountsListInputSchema.parse(params);
      return listGmailAccounts(db, profileId);
    case "gmail_messages_search":
      return searchGmailMessages(db, profileId, params);
    case "gmail_message_get":
      return getGmailMessage(db, profileId, params);
    case "gmail_attachment_save":
      return saveGmailAttachment(db, profileId, params);
    default:
      throw new DomainError(domainCodes.INTERNAL, `Gmail read handler missing for ${toolName}.`);
  }
}
