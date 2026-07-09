import type { TableRow } from "@ai-assistants/control-db";
import type {
  CapabilityReadinessBlockerCode,
  CapabilityReadinessStatus,
} from "@ai-assistants/capability-catalog";
import type { BackendJob } from "@ai-assistants/backend-jobs";

export function publicMessage(input: {
  link: TableRow<"capability_account_links">;
  status: CapabilityReadinessStatus;
  blockerCode?: CapabilityReadinessBlockerCode | null;
  job?: BackendJob | null;
  joinedExistingJob?: boolean;
}): string {
  if (input.status === "ready") return `${input.link.label} is ready.`;
  if (input.status === "queued") return `${input.link.label} connected and activation started.`;
  if (input.status === "running")
    return `${input.link.label} connected and activation is already running.`;
  if (input.status === "not_connected")
    return `${input.link.label} is enabled, but no connected provider account is available.`;
  if (input.status === "error") return `${input.link.label} activation failed.`;
  switch (input.blockerCode) {
    case "credential_required":
      return `${input.link.label} connected, but credentials are required.`;
    case "reconnect_required":
      return `${input.link.label} requires reconnecting the provider (stored credentials invalid or expired).`;
    case "provider_setup_required":
      return `${input.link.label} connected, but provider setup is incomplete.`;
    case "monday_activation_metadata_incomplete":
      return `${input.link.label} connected; Monday activation metadata needs to be refreshed before activation can complete.`;
    case "ambiguous_account":
      return `${input.link.label} needs a specific connected account selected before it can activate.`;
    default:
      return `${input.link.label} is blocked from activating.`;
  }
}
