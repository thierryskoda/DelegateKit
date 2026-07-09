import { z } from "zod";
import type { ToolContract, ToolOutput } from "./contract";

export const backendToolErrorSchema = z
  .object({
    message: z.string().trim().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type BackendToolError = z.infer<typeof backendToolErrorSchema>;

export const backendToolResultSchema = z.union([
  z.object({ data: z.unknown() }).strict(),
  z.object({ error: backendToolErrorSchema }).strict(),
]);

export type BackendToolResultFieldKey = "data" | "error";

/** Declared keys for docs and prompts; must stay in sync with {@link backendToolResultSchema}. */
export const BACKEND_TOOL_RESULT_FIELD_KEYS = [
  "data",
  "error",
] as const satisfies readonly BackendToolResultFieldKey[];

type MissingBackendToolResultFieldKeys = Exclude<
  BackendToolResultFieldKey,
  (typeof BACKEND_TOOL_RESULT_FIELD_KEYS)[number]
>;
export const backendToolResultFieldKeysMustCoverSchema: MissingBackendToolResultFieldKeys extends never
  ? true
  : never = true;

export type FormatBackendToolResultFieldNamesInput = {
  /** Default: all fields from {@link BACKEND_TOOL_RESULT_FIELD_KEYS} in schema order. */
  keys?: readonly BackendToolResultFieldKey[];
  /** Join the last field with "and" (default) or "or" (e.g. "x, y, or z"). */
  lastJoiner?: "and" | "or";
};

/** Comma-separated backtick-wrapped field names for skills, AGENTS.md, and workspace context. */
export function formatBackendToolResultFieldNamesForMarkdown(
  input?: FormatBackendToolResultFieldNamesInput,
): string {
  const keys = (
    input?.keys?.length ? input.keys : BACKEND_TOOL_RESULT_FIELD_KEYS
  ) as readonly BackendToolResultFieldKey[];
  const lastJoiner = input?.lastJoiner ?? "and";
  const parts = keys.map((key) => `\`${String(key)}\``);
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} ${lastJoiner} ${parts[1]}`;
  const lastSep = lastJoiner === "or" ? ", or " : ", and ";
  return `${parts.slice(0, -1).join(", ")}${lastSep}${parts[parts.length - 1] ?? ""}`;
}

export type BackendToolResult<TData = unknown> = { data: TData } | { error: BackendToolError };

export function backendToolResultSchemaForContract<TContract extends ToolContract>(
  contract: TContract,
): z.ZodType<BackendToolResult<ToolOutput<TContract>>> {
  return z.union([
    z.object({ data: contract.outputSchema }).strict(),
    z.object({ error: backendToolErrorSchema }).strict(),
  ]) as z.ZodType<BackendToolResult<ToolOutput<TContract>>>;
}

function cleanToolResult<TData>(result: BackendToolResult<TData>): BackendToolResult<TData> {
  return backendToolResultSchema.parse(result) as BackendToolResult<TData>;
}

export function toolData<TData>(data: TData): BackendToolResult<TData> {
  return cleanToolResult({ data });
}

/** Parse successful tool data against the contract output schema, then wrap in the backend envelope. */
export function toolDataForContract<TContract extends ToolContract>(
  contract: TContract,
  data: ToolOutput<TContract>,
): BackendToolResult<ToolOutput<TContract>> {
  const parsed = contract.outputSchema.parse(data) as ToolOutput<TContract>;
  return { data: parsed };
}

export function toolError(error: BackendToolError): BackendToolResult<never> {
  return { error };
}

export type BackendToolExecuteRequest<TName extends string = string> = {
  agentId: string;
  toolName: TName;
  toolCallId: string;
  params?: Record<string, unknown>;
  invocation: {
    agentId: string;
    toolCallId: string;
    sessionKey: string;
    sessionId?: string;
    requestId: string;
    runKind: "user" | "cron" | "manual" | "unknown";
    runKindSource: "runtime_context" | "session_key" | "default";
  };
  trustedChannel?: {
    messageChannel: string;
    requesterSenderId: string;
    agentAccountId?: string;
    senderIsOwner?: boolean;
    deliveryContext?: Record<string, unknown>;
  };
};

export function createBackendToolExecuteRequestSchema<TToolNameSchema extends z.ZodType<string>>(
  toolNameSchema: TToolNameSchema,
) {
  return z
    .object({
      agentId: z.string().trim().min(1),
      toolName: toolNameSchema,
      toolCallId: z.string().trim().min(1),
      params: z.record(z.string(), z.unknown()).optional().default({}),
      invocation: z
        .object({
          agentId: z.string().trim().min(1),
          toolCallId: z.string().trim().min(1),
          sessionKey: z.string().trim().min(1),
          sessionId: z.string().trim().min(1).optional(),
          requestId: z.string().trim().min(1),
          runKind: z
            .enum(["user", "cron", "manual", "unknown"])
            .default("unknown"),
          runKindSource: z
            .enum(["runtime_context", "session_key", "default"])
            .default("default"),
        })
        .strict(),
      trustedChannel: z
        .object({
          messageChannel: z.string().trim().min(1),
          requesterSenderId: z.string().trim().min(1),
          agentAccountId: z.string().trim().min(1).optional(),
          senderIsOwner: z.boolean().optional(),
          deliveryContext: z.record(z.string(), z.unknown()).optional(),
        })
        .strict()
        .optional(),
    })
    .strict();
}
