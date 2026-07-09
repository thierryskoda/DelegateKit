import assert from "node:assert/strict";
import { gmailToolContracts } from "@ai-assistants/gmail-contracts/contracts";
import type { GmailMessageDetail } from "@ai-assistants/gmail-contracts/schemas";
import { toolContractByName } from "@ai-assistants/tool-contracts";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { executeE2eBackendTool } from "../../../../apps/backend/src/test-support/backend-tools";

function preflightToolCallId(toolName: string): string {
  return `e2e-preflight-${toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Fail setup when the connected testing mailbox has no message with an attachment from the
 * privately configured client fixture address.
 */
async function executePreflightEmailTool(
  input: {
    db: SupabaseServiceClient;
    agentId: string;
    sessionKeyPrefix: string;
  },
  toolName: "gmail_messages_search" | "gmail_message_get",
  params: Record<string, unknown>,
): Promise<unknown> {
  const toolCallId = preflightToolCallId(toolName);
  const result = await executeE2eBackendTool(input.db, {
    agentId: input.agentId,
    toolName,
    toolCallId,
    params,
    invocation: {
      agentId: input.agentId,
      toolCallId,
      sessionKey: `${input.sessionKeyPrefix}:preflight`,
      requestId: toolCallId,
      runKind: "manual",
      runKindSource: "default",
    },
  });
  assert.ok(
    "data" in result,
    `Client fixture email preflight: ${toolName}(${JSON.stringify(params)}) expected data, got ${JSON.stringify(result)}`,
  );
  return toolContractByName(gmailToolContracts, toolName).outputSchema.parse(result.data);
}

export async function loadTestingClientMessagesWithAttachments(input: {
  db: SupabaseServiceClient;
  agentId: string;
  sessionKeyPrefix: string;
  sourceEmail: string;
}): Promise<GmailMessageDetail[]> {
  const searchToolName = "gmail_messages_search";
  const getToolName = "gmail_message_get";
  const searchQueries = [`from:${input.sourceEmail}`, `from:${input.sourceEmail} has:attachment`];
  const candidateIds = new Set<string>();
  for (const query of searchQueries) {
    const data = (await executePreflightEmailTool(input, searchToolName, { query })) as {
      messages?: Array<{ id: string }>;
    };
    for (const message of data.messages ?? []) {
      candidateIds.add(message.id);
    }
  }
  if (candidateIds.size === 0) {
    throw new Error(
      [
        "Testing requires at least one client fixture email visible to gmail_messages_search.",
        `Send a client fixture email with a PDF attachment from ${input.sourceEmail} to the connected testing Gmail inbox, then rerun.`,
        `Searched: ${searchQueries.join(", ")}`,
      ].join(" "),
    );
  }

  const withAttachments: GmailMessageDetail[] = [];
  for (const messageId of candidateIds) {
    const data = (await executePreflightEmailTool(input, getToolName, { messageId })) as {
      message: GmailMessageDetail;
    };
    if (data.message.attachments.length > 0) {
      withAttachments.push(data.message);
    }
  }
  if (withAttachments.length === 0) {
    throw new Error(
      [
        "Testing requires a client fixture email with at least one attachment in the connected testing Gmail inbox.",
        "Gmail search summaries may omit attachment metadata; gmail_message_get found fixture messages but none had attachments.",
        `Searched: ${searchQueries.join(", ")}`,
      ].join(" "),
    );
  }
  return withAttachments;
}
