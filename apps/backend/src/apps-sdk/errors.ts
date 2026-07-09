import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function chatGptAppContextErrorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    structuredContent: {
      error: {
        code: "CHATGPT_APP_CONTEXT_REQUIRED",
        message,
      },
    },
  };
}
