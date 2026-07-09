import {
  executeGmailNangoProxyOperation,
  gmailNangoProxyRecordSchema,
} from "../../integrations/nango/gmail-proxy";
import type { NangoProxySandboxContext } from "../../integrations/nango/nango-proxy-client";
import { normalizeGmailMessageListItem } from "./message-normalization";

const GMAIL_SEARCH_METADATA_HEADERS = [
  "Subject",
  "From",
  "To",
  "Cc",
  "Date",
  "Message-ID",
  "Reply-To",
] as const;

const GMAIL_SEARCH_HYDRATION_CONCURRENCY = 5;

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function gmailListMessageId(message: Record<string, unknown>): string | null {
  return stringValue(message.id) ?? stringValue(message.messageId);
}

function gmailListItemNeedsMetadataHydration(message: Record<string, unknown>): boolean {
  if (stringValue(message.subject) || stringValue(message.snippet)) return false;
  const payload = recordValue(message.payload);
  const headers = payload.headers;
  if (Array.isArray(headers) && headers.length > 0) return false;
  return Boolean(gmailListMessageId(message));
}

async function fetchGmailMessageMetadata(input: {
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
  messageId: string;
  sandbox?: NangoProxySandboxContext;
}): Promise<Record<string, unknown>> {
  return recordValue(
    await executeGmailNangoProxyOperation(
      input.nangoProviderConfigKey,
      input.nangoConnectionId,
      "get-message",
      gmailNangoProxyRecordSchema,
      {
        id: input.messageId,
        format: "metadata",
        metadataHeaders: [...GMAIL_SEARCH_METADATA_HEADERS],
      },
      input.sandbox,
    ),
  );
}

async function fetchGmailMessageFull(input: {
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
  messageId: string;
  sandbox?: NangoProxySandboxContext;
}): Promise<Record<string, unknown>> {
  return recordValue(
    await executeGmailNangoProxyOperation(
      input.nangoProviderConfigKey,
      input.nangoConnectionId,
      "get-message",
      gmailNangoProxyRecordSchema,
      { id: input.messageId },
      input.sandbox,
    ),
  );
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/** Gmail list returns id stubs; hydrate each row with metadata before normalizing search summaries. */
export async function hydrateGmailSearchListMessages(input: {
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
  messages: readonly Record<string, unknown>[];
  includeAttachmentMetadata: boolean;
  sandbox?: NangoProxySandboxContext;
}) {
  return mapWithConcurrency(input.messages, GMAIL_SEARCH_HYDRATION_CONCURRENCY, async (message) => {
    const messageId = gmailListMessageId(message);
    if (input.includeAttachmentMetadata && messageId) {
      const fullMessage = await fetchGmailMessageFull({
        nangoProviderConfigKey: input.nangoProviderConfigKey,
        nangoConnectionId: input.nangoConnectionId,
        messageId,
        ...(input.sandbox === undefined ? {} : { sandbox: input.sandbox }),
      });
      return normalizeGmailMessageListItem(fullMessage);
    }
    if (!gmailListItemNeedsMetadataHydration(message)) {
      return normalizeGmailMessageListItem(message);
    }
    if (!messageId) {
      return normalizeGmailMessageListItem(message);
    }
    const metadata = await fetchGmailMessageMetadata({
      nangoProviderConfigKey: input.nangoProviderConfigKey,
      nangoConnectionId: input.nangoConnectionId,
      messageId,
      ...(input.sandbox === undefined ? {} : { sandbox: input.sandbox }),
    });
    return normalizeGmailMessageListItem(metadata);
  });
}
