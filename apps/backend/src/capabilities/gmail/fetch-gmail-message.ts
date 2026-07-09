import type { GmailMessageDetail } from "@ai-assistants/gmail-contracts/schemas";
import {
  executeGmailNangoProxyOperation,
  gmailNangoProxyRecordSchema,
} from "../../integrations/nango/gmail-proxy";
import type { GmailConnectionContext } from "./connection";
import { normalizeGmailMessage } from "./message-normalization";

export async function fetchNormalizedGmailMessage(
  connection: GmailConnectionContext,
  messageId: string,
): Promise<GmailMessageDetail> {
  const providerData = await executeGmailNangoProxyOperation(
    connection.nangoProviderConfigKey,
    connection.nangoConnectionId,
    "get-message",
    gmailNangoProxyRecordSchema,
    { id: messageId, format: "full" },
  );
  return normalizeGmailMessage(providerData);
}
