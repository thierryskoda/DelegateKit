import {
  capabilityActivationTriggerSchema,
  requireCapabilityActivationPolicyForSlug,
} from "@ai-assistants/capability-catalog";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type {
  EvaluateCapabilityActivationInput,
  CapabilityActivationOutcome,
} from "./activation-types";
import { requireEnabledCapabilityAccountLink } from "./activation-instance";
import { connectedCredentialState } from "./activation-credentials";
import { recordOutcome } from "./activation-record-outcome";
import { publicMessage } from "./activation-messages";
import { completeWithoutSync } from "./activation-ready-path";

export type {
  EvaluateCapabilityActivationInput,
  CapabilityActivationOutcome,
  CapabilityReadyPrerequisiteCheckInput,
  CapabilityReadyPrerequisiteCheckResult,
} from "./activation-types";

export async function evaluateCapabilityActivation(
  db: SupabaseServiceClient,
  input: EvaluateCapabilityActivationInput,
): Promise<CapabilityActivationOutcome> {
  const trigger = capabilityActivationTriggerSchema.parse(input.trigger);
  const link = await requireEnabledCapabilityAccountLink(
    db,
    input.profileId,
    input.capabilityAccountLinkId,
  );
  const policy = requireCapabilityActivationPolicyForSlug(link.capability_slug);
  if (!policy.providers.includes(link.provider)) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Capability account link ${link.id} provider ${link.provider} is not allowed by policy ${policy.slug}.`,
    );
  }

  const credentialState = await connectedCredentialState(db, link, policy);
  if (credentialState.status === "blocked") {
    const readiness = await recordOutcome(db, {
      link,
      policy,
      status: "blocked",
      blockerCode: credentialState.blockerCode,
      lastError: credentialState.lastError,
    });
    const outcome = {
      status: "blocked" as const,
      blockerCode: credentialState.blockerCode,
      job: null,
      joinedExistingJob: false,
      message: publicMessage({
        link,
        status: "blocked",
        blockerCode: credentialState.blockerCode,
      }),
    };
    return { ...outcome, readiness };
  }

  let readyMetadata: Record<string, unknown> | undefined;
  if (input.readyPrerequisiteCheck) {
    const readyCheck = await input.readyPrerequisiteCheck({
      link,
      account: credentialState.status === "ready" ? credentialState.account : null,
    });
    if (readyCheck.status === "blocked") {
      const readiness = await recordOutcome(db, {
        link,
        policy,
        status: "blocked",
        blockerCode: readyCheck.blockerCode,
        lastError: readyCheck.lastError,
        ...(readyCheck.metadata === undefined ? {} : { metadata: readyCheck.metadata }),
      });
      const outcome = {
        status: "blocked" as const,
        blockerCode: readyCheck.blockerCode,
        job: null,
        joinedExistingJob: false,
        message: publicMessage({
          link,
          status: "blocked",
          blockerCode: readyCheck.blockerCode,
        }),
      };
      return { ...outcome, readiness };
    }
    readyMetadata = readyCheck.metadata;
  }

  return completeWithoutSync(db, {
    link,
    policy,
    trigger,
    ...(readyMetadata === undefined ? {} : { metadata: readyMetadata }),
  });
}
