import { createHash } from "node:crypto";
import {
  sanitizeDiagnosticFields,
  type DiagnosticContext,
  type JsonObject,
  type JsonValue,
} from "@ai-assistants/runtime-diagnostics";
import type { BackendToolExecuteRequest } from "../request-schema";
import type { BackendToolResult } from "@ai-assistants/tool-contracts";

export type BackendToolExecutionDiagnosticContext = DiagnosticContext & {
  profile_id?: string;
};

function stableJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
}

function fullSanitizedPayload(value: unknown): JsonValue {
  return sanitizeDiagnosticFields(value, { maxStringLength: null, maxDepth: null });
}

function payloadDiagnostics(prefix: "params" | "result", value: unknown): JsonObject {
  const sanitized = fullSanitizedPayload(value);
  const json = stableJson(sanitized);
  return {
    [prefix]: sanitized,
    [`${prefix}_json_length`]: json.length,
    [`${prefix}_hash`]: createHash("sha256").update(json).digest("hex"),
  };
}

function providerForToolName(toolName: string): string | null {
  if (toolName.startsWith("gmail_")) return "gmail";
  if (toolName.startsWith("outlook_mail_")) return "outlook-mail";
  if (toolName.startsWith("google_calendar_")) return "google-calendar";
  if (toolName.startsWith("outlook_calendar_")) return "outlook-calendar";
  if (toolName.startsWith("monday_")) return "monday";
  if (toolName.startsWith("google_drive_")) return "google-drive";
  if (toolName.startsWith("microsoft_onedrive_")) return "microsoft-onedrive";
  if (toolName.startsWith("microsoft_sharepoint_")) return "microsoft-sharepoint";
  if (toolName.startsWith("microsoft_todo_")) return "microsoft-todo";
  if (toolName.startsWith("boldsign_")) return "boldsign";
  return null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function domainStatus(result: BackendToolResult): string {
  if ("error" in result) return "error";
  const data = recordValue(result.data);
  const action = recordValue(data?.action);
  const workItem = recordValue(data?.workItem);
  const job = recordValue(data?.job);
  return (
    stringValue(action?.status) ??
    stringValue(workItem?.status) ??
    stringValue(job?.status) ??
    "completed"
  );
}

export function backendToolCallDiagnosticAttrs(input: BackendToolExecuteRequest): JsonObject {
  return {
    tool_name: input.toolName,
    boundary: "backend",
    ...payloadDiagnostics("params", input.params ?? {}),
    origin_channel: input.trustedChannel?.messageChannel ?? null,
    has_invocation: Boolean(input.invocation),
    has_trusted_channel: Boolean(input.trustedChannel),
    has_session_key: Boolean(input.invocation.sessionKey),
    has_session_id: Boolean(input.invocation.sessionId),
    invocation_run_kind: input.invocation.runKind,
    invocation_run_kind_source: input.invocation.runKindSource,
    has_delivery_context: Boolean(input.trustedChannel?.deliveryContext),
  };
}

export function backendToolResultDiagnosticAttrs(input: {
  toolName: string;
  result: BackendToolResult;
}): JsonObject {
  return {
    tool_name: input.toolName,
    boundary: "backend",
    outcome: "error" in input.result ? "failed_result" : "success",
    result_status: domainStatus(input.result),
    ...payloadDiagnostics("result", input.result),
  };
}

export function backendToolFailureDiagnosticAttrs(input: BackendToolExecuteRequest): JsonObject {
  return {
    tool_name: input.toolName,
    boundary: "backend",
    outcome: "error",
    origin_channel: input.trustedChannel?.messageChannel ?? null,
    has_invocation: Boolean(input.invocation),
    has_trusted_channel: Boolean(input.trustedChannel),
    has_session_key: Boolean(input.invocation.sessionKey),
    has_session_id: Boolean(input.invocation.sessionId),
    invocation_run_kind: input.invocation.runKind,
    invocation_run_kind_source: input.invocation.runKindSource,
    has_delivery_context: Boolean(input.trustedChannel?.deliveryContext),
  };
}

export function backendToolDiagnosticContext(input: BackendToolExecuteRequest): DiagnosticContext {
  return {
    agent_id: input.agentId,
    tool_call_id: input.toolCallId,
    session_id: input.invocation.sessionId ?? input.invocation.sessionKey,
    provider: providerForToolName(input.toolName),
  };
}
