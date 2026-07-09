import type { AgentEventPayload } from "@ai-assistants/control-plane-contracts";
export {
  runtimeRunId,
  safeAgentEventJsonObject,
} from "@ai-assistants/control-plane-contracts/agent-evidence";

export function eventVisibilityForPayload(
  payload: AgentEventPayload,
): "internal" | "internal_sensitive" | "client_visible" {
  return payload.eventType === "assistant.reasoning" ? "internal_sensitive" : "internal";
}
