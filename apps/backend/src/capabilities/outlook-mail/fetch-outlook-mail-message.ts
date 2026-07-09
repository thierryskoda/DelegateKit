import type { OutlookMailMessageDetail } from "@ai-assistants/outlook-mail-contracts/schemas";
import {
  executeOutlookMailNangoProxyOperation,
  outlookMailNangoProxyRecordSchema,
} from "../../integrations/nango/outlook-mail-proxy";
import type { OutlookConnectionContext } from "./connection";
import { normalizeOutlookMailMessage } from "./message-normalization";

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function fetchNormalizedOutlookMailMessage(
  connection: OutlookConnectionContext,
  messageId: string,
): Promise<{
  message: OutlookMailMessageDetail;
  messageIdHeader: string | null;
  isDraft: boolean;
}> {
  const providerData = await executeOutlookMailNangoProxyOperation(
    connection.nangoProviderConfigKey,
    connection.nangoConnectionId,
    "get-message",
    outlookMailNangoProxyRecordSchema,
    { messageId },
  );
  const record = recordValue(providerData);
  return {
    message: normalizeOutlookMailMessage(providerData),
    messageIdHeader: stringValue(record.internetMessageId),
    isDraft: record.isDraft === true,
  };
}
