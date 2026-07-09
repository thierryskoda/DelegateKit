import type {
  RecordAgentRuntimeEventRequest,
  RecordAgentRuntimeEventResponse,
} from "@ai-assistants/control-plane-contracts";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { requireAssistantProfile } from "../../auth/assistant-resolution";
import { recordAgentEvent, upsertAgentRun } from "./agent-event-ledger";
import { eventVisibilityForPayload, runtimeRunId } from "./evidence-identity";

export async function recordAgentRuntimeEvent(
  db: SupabaseServiceClient,
  input: RecordAgentRuntimeEventRequest,
): Promise<RecordAgentRuntimeEventResponse> {
  const { profile } = await requireAssistantProfile(db, input.agentId);
  const resolvedRuntimeRunId = runtimeRunId({
    agentId: input.agentId,
    runId: input.runId,
    sessionId: input.sessionId,
    sessionKey: input.sessionKey,
  });
  const agentRun = resolvedRuntimeRunId
    ? await upsertAgentRun(db, {
        profileId: profile.id,
        agentId: input.agentId,
        sessionKey: input.sessionKey,
        sessionId: input.sessionId,
        runtimeRunId: resolvedRuntimeRunId,
        status: "unknown",
      })
    : null;

  const { event, created } = await recordAgentEvent(db, {
    profileId: profile.id,
    agentRunId: agentRun?.id ?? null,
    eventType: input.payload.eventType,
    source: "agent_runtime",
    sourceEventKey: input.sourceEventKey,
    occurredAt: input.occurredAt,
    visibility: eventVisibilityForPayload(input.payload),
    payload: input.payload,
  });

  return {
    recorded: true,
    eventId: event.id,
    agentRunId: agentRun?.id ?? null,
    created,
  };
}
