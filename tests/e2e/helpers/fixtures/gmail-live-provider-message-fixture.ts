import assert from "node:assert/strict";
import {
  executeGmailNangoProxyOperation,
  gmailNangoProxyRecordSchema,
} from "../../../../apps/backend/src/test-support/capabilities/gmail";
import {
  requireTestingNangoConnectionIds,
  type TestingLiveNangoConnection,
} from "../readiness/testing-provider-readiness";
import { asRecord } from "../utils/as-record";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gmailMetadataHeaders(metadata: Record<string, unknown>): Record<string, string> {
  const payload = asRecord(metadata.payload, "Gmail message metadata payload");
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const normalized: Record<string, string> = {};
  for (const header of headers) {
    const record = asRecord(header, "Gmail message metadata header");
    const name = record.name;
    const value = record.value;
    if (typeof name === "string" && typeof value === "string") {
      normalized[name.toLowerCase()] = value;
    }
  }
  return normalized;
}

export async function assertLiveProviderHasSentGmailMessage(input: {
  fixture: TestingLiveNangoConnection;
  providerMessageId: string;
  recipientEmail: string;
  subject: string;
}): Promise<void> {
  const ids = requireTestingNangoConnectionIds(input.fixture, "sent Gmail message assertion");
  const metadata = await executeGmailNangoProxyOperation(
    ids.providerConfigKey,
    ids.connectionId,
    "get-message",
    gmailNangoProxyRecordSchema,
    {
      id: input.providerMessageId,
      format: "metadata",
      metadataHeaders: ["Subject", "To", "Message-ID"],
    },
  );
  const headers = gmailMetadataHeaders(metadata);
  assert.equal(headers.subject, input.subject);
  assert.match(headers.to ?? "", new RegExp(escapeRegExp(input.recipientEmail), "i"));
  assert.ok(
    (headers["message-id"] ?? "").trim(),
    "Gmail sent message metadata should include a Message-ID header",
  );
}

export async function cleanupSentLiveGmailMessage(input: {
  fixture: TestingLiveNangoConnection;
  providerMessageId: string | null;
}): Promise<void> {
  if (!input.providerMessageId) return;
  const ids = requireTestingNangoConnectionIds(input.fixture, "sent Gmail message cleanup");
  await executeGmailNangoProxyOperation(
    ids.providerConfigKey,
    ids.connectionId,
    "trash-message",
    gmailNangoProxyRecordSchema,
    { id: input.providerMessageId },
  );
}
