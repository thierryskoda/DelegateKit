import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { resolveChatGptAppInvocationContext } from "../context";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

export const contextStatusOutputSchema = z.object({
  profileId: z.string().min(1),
  authKind: z.literal("prototype-dev"),
  developerId: z.string().min(1),
  requestId: z.string().min(1),
  mcpSessionId: z.string().nullable(),
  conversationId: z.string().nullable(),
});

type ContextStatusOutput = z.infer<typeof contextStatusOutputSchema>;

type AppsSdkToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export function getContextStatus(extra: AppsSdkToolExtra): CallToolResult {
  const resolved = resolveChatGptAppInvocationContext(extra);
  if (!resolved.ok) return resolved.result;

  const structuredContent = {
    profileId: resolved.context.profileId,
    authKind: resolved.context.auth.kind,
    developerId: resolved.context.auth.developerId,
    requestId: resolved.context.requestId,
    mcpSessionId: resolved.context.correlation.mcpSessionId,
    conversationId: resolved.context.correlation.conversationId,
  } satisfies ContextStatusOutput;

  return {
    structuredContent,
    content: [
      {
        type: "text",
        text: "The AI Assistants Workbench profile context is available for profile-specific read-only tools.",
      },
    ],
  };
}
