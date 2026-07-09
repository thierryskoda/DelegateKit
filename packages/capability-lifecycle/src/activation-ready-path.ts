import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import type {
  CapabilityActivationPolicy,
  CapabilityActivationTrigger,
} from "@ai-assistants/capability-catalog";
import type { CapabilityActivationOutcome } from "./activation-types";
import { recordOutcome } from "./activation-record-outcome";
import { publicMessage } from "./activation-messages";

export async function completeWithoutSync(
  db: SupabaseServiceClient,
  input: {
    link: TableRow<"capability_account_links">;
    policy: CapabilityActivationPolicy;
    trigger: CapabilityActivationTrigger;
    metadata?: Record<string, unknown>;
  },
): Promise<CapabilityActivationOutcome> {
  const { link, policy, trigger } = input;
  const readiness = await recordOutcome(db, {
    link,
    policy,
    status: "ready",
    lastError: null,
    metadata: { trigger, ...(input.metadata ?? {}) },
  });
  const outcome = {
    status: "ready" as const,
    blockerCode: null,
    job: null,
    joinedExistingJob: false,
    message: publicMessage({ link, status: "ready" }),
  };
  return { ...outcome, readiness };
}
