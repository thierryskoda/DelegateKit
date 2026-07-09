import type { BackendJob } from "@ai-assistants/backend-jobs";
import type { TableRow } from "@ai-assistants/control-db";
import type {
  CapabilityActivationTrigger,
  CapabilityReadinessBlockerCode,
  CapabilityReadinessStatus,
} from "@ai-assistants/capability-catalog";

export type ConnectedCredentialState =
  | { status: "not_required" }
  | { status: "ready"; account: TableRow<"connected_provider_accounts"> }
  | { status: "blocked"; blockerCode: CapabilityReadinessBlockerCode; lastError: string };

export type CapabilityReadyPrerequisiteCheckInput = {
  link: TableRow<"capability_account_links">;
  account: TableRow<"connected_provider_accounts"> | null;
};

export type CapabilityReadyPrerequisiteCheckResult =
  | { status: "ready"; metadata?: Record<string, unknown> }
  | {
      status: "blocked";
      blockerCode: CapabilityReadinessBlockerCode;
      lastError: string;
      metadata?: Record<string, unknown>;
    };

export type CapabilityActivationOutcome = {
  status: CapabilityReadinessStatus;
  blockerCode: CapabilityReadinessBlockerCode | null;
  job: BackendJob | null;
  joinedExistingJob: boolean;
  readiness: TableRow<"capability_account_links"> | null;
  message: string;
};

export type EvaluateCapabilityActivationInput = {
  profileId: string;
  capabilityAccountLinkId: string;
  trigger: CapabilityActivationTrigger;
  readyPrerequisiteCheck?: (
    input: CapabilityReadyPrerequisiteCheckInput,
  ) => Promise<CapabilityReadyPrerequisiteCheckResult>;
};
