import { createHash } from "node:crypto";
import { type Json, type SupabaseServiceClient, type TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { gmailMessageSendInputSchema } from "@ai-assistants/gmail-contracts/schemas";
import { isNangoBackedConnectedAccount } from "../../integrations/provider-runtime/credentials";
import {
  providerRuntimeModeForCapabilityLink,
  type NangoProviderCapabilityAccountBinding,
} from "../../integrations/provider-runtime";
import { requireProfileArtifacts } from "../../product/artifacts/artifact-validation";
import { PROVIDER_BINARY_ARTIFACT_MAX_BYTES } from "../../product/artifacts/provider-binary-limits";
import { requireGmailMailboxNango } from "./connection";

export type GmailMessageSendPayload = ReturnType<typeof gmailMessageSendInputSchema.parse>;

export type GmailMessageSendPreflight = {
  payload: GmailMessageSendPayload;
  connection: NangoProviderCapabilityAccountBinding;
  requestHash: string;
  senderLabel: string;
  approvalTitle: string;
  approvalSummary: string;
  reviewPayload: Record<string, unknown>;
};

export type GmailSendAttachment = {
  artifact: TableRow<"artifacts">;
  bytes: Uint8Array;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalEmailAddress(address: string): string {
  return address.trim().toLowerCase();
}

function gmailMessageSendRequestHash(payload: GmailMessageSendPayload): string {
  return createHash("sha256")
    .update(
      stableJson({
        connectedAccountId: payload.connectedAccountId ?? null,
        to: payload.to.map(canonicalEmailAddress),
        cc: payload.cc.map(canonicalEmailAddress),
        bcc: payload.bcc.map(canonicalEmailAddress),
        subject: payload.subject,
        bodyText: payload.bodyText,
        threadId: payload.threadId ?? null,
        artifactIds: payload.profileFileIds,
        expectedProfileFileSha256ById: payload.expectedProfileFileSha256ById,
      }),
    )
    .digest("hex");
}

function jsonStringArray(value: Json, label: string): string[] {
  if (!Array.isArray(value))
    throw new DomainError(domainCodes.INTERNAL, `${label} must be a JSON string array.`);
  return value.map((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new DomainError(domainCodes.INTERNAL, `${label}[${index}] must be a non-empty string.`);
    }
    return entry.trim();
  });
}

function hasAnyScope(scopes: readonly string[], accepted: readonly string[]): boolean {
  const normalized = new Set(scopes.map((scope) => scope.toLowerCase()));
  return accepted.some((scope) => normalized.has(scope.toLowerCase()));
}

function assertGmailSendScope(binding: NangoProviderCapabilityAccountBinding): void {
  const scopes = jsonStringArray(
    binding.account.scopes,
    `provider connection ${binding.account.id} scopes`,
  );
  if (
    hasAnyScope(scopes, [
      "https://mail.google.com/",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ])
  )
    return;
  throw new DomainError(
    domainCodes.INTERNAL,
    `Gmail connection ${binding.account.id} is missing a send-capable Gmail scope. Reconnect the provider capability.`,
  );
}

function senderLabel(binding: NangoProviderCapabilityAccountBinding): string {
  return (
    binding.account.display_label ||
    binding.account.account_email ||
    binding.link.label ||
    binding.link.provider
  );
}

function recipientSummary(payload: Pick<GmailMessageSendPayload, "to" | "cc" | "bcc">): string {
  const parts = [`to ${payload.to.join(", ")}`];
  if (payload.cc.length) parts.push(`cc ${payload.cc.join(", ")}`);
  if (payload.bcc.length) parts.push(`bcc ${payload.bcc.join(", ")}`);
  return parts.join("; ");
}

function gmailApprovalCopy(
  payload: GmailMessageSendPayload,
  binding: NangoProviderCapabilityAccountBinding,
) {
  const recipients = recipientSummary(payload);
  const from = senderLabel(binding);
  const attachmentNote =
    payload.profileFileIds.length === 1
      ? " with 1 attachment"
      : payload.profileFileIds.length > 1
        ? ` with ${payload.profileFileIds.length} attachments`
        : "";
  const summary = `From ${from} ${recipients}. Subject: ${payload.subject}${attachmentNote}.`;
  return {
    title: `Send email ${recipients}`,
    summary,
  };
}

async function validateGmailArtifactsForSend(
  db: SupabaseServiceClient,
  profileId: string,
  payload: Pick<GmailMessageSendPayload, "profileFileIds" | "expectedProfileFileSha256ById">,
): Promise<TableRow<"artifacts">[]> {
  if (payload.profileFileIds.length === 0) return [];
  const refs = await requireProfileArtifacts(db, {
    profileId,
    artifactIds: payload.profileFileIds,
    ...(payload.expectedProfileFileSha256ById === undefined
      ? {}
      : { expectedSha256ByArtifactId: payload.expectedProfileFileSha256ById }),
  });
  const rows = refs.map((ref) => ref.artifact);
  let totalBytes = 0;
  for (const row of rows) {
    if (row.byte_size === null)
      throw new DomainError(
        domainCodes.INTERNAL,
        `Gmail attachment artifact ${row.id} is missing byte_size.`,
      );
    totalBytes += row.byte_size;
  }
  if (totalBytes > PROVIDER_BINARY_ARTIFACT_MAX_BYTES) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Gmail attachments total ${totalBytes} bytes; max is ${PROVIDER_BINARY_ARTIFACT_MAX_BYTES} bytes.`,
    );
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  return payload.profileFileIds.map((id) => {
    const row = byId.get(id);
    if (!row)
      throw new DomainError(
        domainCodes.INTERNAL,
        `Gmail attachment artifact ${id} disappeared during validation.`,
      );
    return row;
  });
}

export async function preflightGmailMessageSend(
  db: SupabaseServiceClient,
  profileId: string,
  rawPayload: unknown,
): Promise<GmailMessageSendPreflight> {
  const payload = gmailMessageSendInputSchema.parse(rawPayload);
  const connection = await requireGmailMailboxNango(db, profileId, payload.connectedAccountId);
  const providerMode = providerRuntimeModeForCapabilityLink(connection.link);
  if (providerMode !== "sandbox" && !isNangoBackedConnectedAccount(connection.account)) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Gmail send requires a Nango-backed Gmail connection. Complete OAuth via Nango Connect for this profile.",
    );
  }
  if (providerMode !== "sandbox") assertGmailSendScope(connection);
  const attachments = await validateGmailArtifactsForSend(db, profileId, payload);
  const copy = gmailApprovalCopy(payload, connection);
  return {
    payload,
    connection,
    requestHash: gmailMessageSendRequestHash(payload),
    senderLabel: senderLabel(connection),
    approvalTitle: copy.title,
    approvalSummary: copy.summary,
    reviewPayload: {
      type: "gmail_message_send",
      from: {
        accountLabel: senderLabel(connection),
        provider: connection.link.provider,
        accountEmail: connection.account.account_email,
      },
      recipients: {
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
      },
      subject: payload.subject,
      bodyText: payload.bodyText,
      attachments: attachments.map((artifact) => ({
        artifactId: artifact.id,
        filename: artifact.filename,
        mimeType: artifact.mime_type,
        byteSize: artifact.byte_size,
        sha256: artifact.sha256,
      })),
      threadContext: payload.threadId ? { threadId: payload.threadId } : null,
      executionPayloadHash: gmailMessageSendRequestHash(payload),
    },
  };
}

export async function loadGmailSendAttachments(
  db: SupabaseServiceClient,
  profileId: string,
  payload: Pick<GmailMessageSendPayload, "profileFileIds" | "expectedProfileFileSha256ById">,
): Promise<GmailSendAttachment[]> {
  const artifacts = await validateGmailArtifactsForSend(db, profileId, payload);
  const attachments: GmailSendAttachment[] = [];
  for (const artifact of artifacts) {
    const downloaded = await db.storage
      .from(artifact.storage_bucket)
      .download(artifact.storage_key);
    if (downloaded.error) throw downloaded.error;
    attachments.push({ artifact, bytes: new Uint8Array(await downloaded.data.arrayBuffer()) });
  }
  return attachments;
}
