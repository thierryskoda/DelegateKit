import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";

export type CapabilityKind =
  | "external_integration"
  | "backend_secret"
  | "backend_document"
  | "backend_workflow";
export type CapabilityCredentialMode = "oauth" | "backend_secret" | "none";

export const capabilityActivationTriggerSchema = z.enum([
  "oauth_connected",
  "backend_secret_connected",
  "manual_retry",
  "scheduled_poll",
]);
export type CapabilityActivationTrigger = z.infer<typeof capabilityActivationTriggerSchema>;

export const capabilityReadinessStatusSchema = z.enum([
  "not_connected",
  "blocked",
  "queued",
  "running",
  "ready",
  "error",
]);
export type CapabilityReadinessStatus = z.infer<typeof capabilityReadinessStatusSchema>;

export type CapabilityReadinessStatusAgentSemantic = {
  meaning: string;
  agentResponse: string;
};

export const capabilityReadinessStatusAgentSemantics = {
  not_connected: {
    meaning: "The required provider account or credential is not connected.",
    agentResponse: "State that setup or reconnection is needed before using that capability.",
  },
  blocked: {
    meaning: "The capability is connected but missing required setup or disambiguation.",
    agentResponse: "Explain the blocker from the readiness fields instead of trying the tool.",
  },
  queued: {
    meaning: "Backend setup or verification is waiting to run.",
    agentResponse: "Say setup is queued and avoid claiming the capability is ready.",
  },
  running: {
    meaning: "Backend setup or verification is currently running.",
    agentResponse: "Say setup is still running and avoid starting dependent provider work.",
  },
  ready: {
    meaning: "The capability is ready for normal assistant tool use.",
    agentResponse: "Use the relevant tools when the user asks for that workflow.",
  },
  error: {
    meaning: "The latest capability setup or readiness check failed.",
    agentResponse: "Explain the readiness error and avoid pretending the capability is usable.",
  },
} satisfies Record<CapabilityReadinessStatus, CapabilityReadinessStatusAgentSemantic>;

export const capabilityReadinessBlockerCodeSchema = z.enum([
  "credential_required",
  "reconnect_required",
  "provider_setup_required",
  // Monday: activation metadata lacks the schema fingerprint the worker expects.
  "monday_activation_metadata_incomplete",
  "ambiguous_account",
]);
export type CapabilityReadinessBlockerCode = z.infer<typeof capabilityReadinessBlockerCodeSchema>;

export function parseCapabilityReadinessBlockerCode(
  raw: string | null | undefined,
): CapabilityReadinessBlockerCode | null {
  if (raw == null || raw === "") return null;
  const parsed = capabilityReadinessBlockerCodeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Unknown capability readiness blocker_code: ${JSON.stringify(raw)}`,
    );
  }
  return parsed.data;
}

export const capabilityInstanceStatusSchema = z.enum(["enabled", "disabled"]);
export type CapabilityInstanceStatus = z.infer<typeof capabilityInstanceStatusSchema>;
