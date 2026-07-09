import { createHash } from "node:crypto";
import type { TableRow } from "@ai-assistants/control-db";
import type { JsonObject } from "@ai-assistants/runtime-diagnostics";

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");
}

function providerForToolName(toolName: string | null | undefined): string | null {
  const name = toolName?.trim() ?? "";
  if (name.startsWith("gmail_")) return "gmail";
  if (name.startsWith("outlook_mail_")) return "outlook-mail";
  if (name.startsWith("google_calendar_")) return "google-calendar";
  if (name.startsWith("outlook_calendar_")) return "outlook-calendar";
  if (name.startsWith("monday_")) return "monday";
  if (name.startsWith("google_drive_")) return "google-drive";
  if (name.startsWith("microsoft_onedrive_")) return "microsoft-onedrive";
  if (name.startsWith("microsoft_sharepoint_")) return "microsoft-sharepoint";
  if (name.startsWith("microsoft_todo_")) return "microsoft-todo";
  if (name.startsWith("boldsign_")) return "boldsign";
  if (name.startsWith("document_")) return "document-tools";
  return null;
}

export function profileActionDiagnosticAttrs(
  action: Pick<
    TableRow<"profile_actions">,
    | "id"
    | "profile_id"
    | "tool_call_id"
    | "tool_name"
    | "action_type"
    | "status"
    | "target_id"
    | "request_hash"
    | "idempotency_key"
    | "provider_execution_status"
    | "provider_execution_attempts"
    | "origin_channel_provider"
    | "requester_assistant_id"
  >,
  extra: Record<string, unknown> = {},
): JsonObject {
  return {
    action_id: action.id,
    profile_id: action.profile_id,
    tool_call_id: action.tool_call_id,
    tool_name: action.tool_name,
    action_type: action.action_type,
    status: action.status,
    target_id: action.target_id,
    request_hash_hash: hash(action.request_hash),
    idempotency_key_hash: hash(action.idempotency_key),
    provider: providerForToolName(action.tool_name),
    provider_execution_status: action.provider_execution_status,
    provider_execution_attempts: action.provider_execution_attempts,
    origin_channel: action.origin_channel_provider,
    agent_id: action.requester_assistant_id,
    ...extra,
  };
}

export function artifactDiagnosticAttrs(
  artifact: Pick<
    TableRow<"artifacts">,
    | "id"
    | "profile_id"
    | "browser_task_id"
    | "profile_action_id"
    | "filename"
    | "artifact_type"
    | "mime_type"
    | "byte_size"
    | "sha256"
  >,
  extra: Record<string, unknown> = {},
): JsonObject {
  return {
    artifact_id: artifact.id,
    profile_id: artifact.profile_id,
    browser_task_id: artifact.browser_task_id,
    action_id: artifact.profile_action_id,
    filename: artifact.filename,
    artifact_type: artifact.artifact_type,
    mime_type: artifact.mime_type,
    byte_size: artifact.byte_size,
    sha256: artifact.sha256,
    ...extra,
  };
}
