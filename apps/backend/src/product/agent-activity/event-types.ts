export const AGENT_ACTIVITY_EVENT_TYPES = {
  artifactCreated: "artifact.created",
  workItemCompleted: "work_item.completed",
  workItemFailed: "work_item.failed",
  workItemIgnored: "work_item.ignored",
  providerEventRouteTriaged: "provider_event.route_triaged",
} as const;

const PROFILE_ACTION_TERMINAL_OUTCOMES = [
  "blocked",
  "failed",
  "rejected",
  "succeeded",
  "unknown",
] as const;

type ProfileActionTerminalOutcome = (typeof PROFILE_ACTION_TERMINAL_OUTCOMES)[number];

export function profileActionActivityEventType(input: {
  toolName: string;
  outcome: ProfileActionTerminalOutcome;
}): string {
  return `${input.toolName.replaceAll("_", ".")}.${input.outcome}`;
}
