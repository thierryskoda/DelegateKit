import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const appStatusOutputSchema = z.object({
  status: z.literal("ok"),
  appName: z.literal("AI Assistants Workbench"),
  mode: z.literal("prototype"),
  capabilities: z.array(z.string()),
});

type AppStatusOutput = z.infer<typeof appStatusOutputSchema>;

export function getAppStatus(): CallToolResult {
  const structuredContent = {
    status: "ok",
    appName: "AI Assistants Workbench",
    mode: "prototype",
    capabilities: ["Read-only ChatGPT Apps SDK MCP endpoint", "Safe app health check"],
  } satisfies AppStatusOutput;

  return {
    structuredContent,
    content: [
      {
        type: "text",
        text: "AI Assistants Workbench is connected in prototype mode. Only read-only status is available right now.",
      },
    ],
  };
}
