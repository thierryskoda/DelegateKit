import { z } from "zod";
import type { PhoneCallBrief } from "@ai-assistants/phone-contracts/schemas";
import {
  cheapStructuredDecision,
  renderSanitizedJsonForLlm,
} from "../../../product/llm-decisions/cheap-structured-decision";

const phoneCallSafetyRiskCategorySchema = z.enum([
  "none",
  "payment",
  "credentials_or_verification_codes",
  "medical_or_legal_advice",
  "sensitive_identity_data",
  "other_sensitive_or_unsafe",
]);

const phoneCallSafetyDecisionSchema = z
  .object({
    allowed: z.boolean(),
    riskCategory: phoneCallSafetyRiskCategorySchema,
    reason: z.string().trim(),
    evidence: z.array(z.string().trim().min(1)).max(8),
  })
  .strict();

export type PhoneCallSafetyDecision = z.infer<typeof phoneCallSafetyDecisionSchema>;

export async function assessPhoneCallBriefSafety(input: {
  profileId: string;
  callBrief: PhoneCallBrief;
}): Promise<PhoneCallSafetyDecision | null> {
  const decision = await cheapStructuredDecision({
    profileId: input.profileId,
    diagnosticKind: "phone.call_brief_safety_assessed",
    schema: phoneCallSafetyDecisionSchema,
    outputName: "PhoneCallSafetyDecision",
    outputDescription: "Semantic safety decision for a bounded outbound phone call brief.",
    timeoutMs: 6_000,
    maxOutputTokens: 700,
    attrs: {
      to_phone_e164: input.callBrief.toPhoneE164,
      country: input.callBrief.country,
    },
    instructions: [
      "Classify whether this outbound phone call brief is safe to execute.",
      "Return allowed=false if the call asks the assistant to collect, provide, verify, or process payments, card details, deposits, credentials, passcodes, MFA/2FA/verification codes, medical advice, legal advice, social insurance/security numbers, passport data, or other sensitive identity data.",
      "Safety boundaries and stop conditions that refuse payment, credentials, or sensitive data are allowed when the call purpose itself is otherwise safe.",
      "Ordinary business scheduling, availability checks, restaurant reservations without payment collection, and provider-status calls are allowed.",
      "Use riskCategory=none only when allowed=true.",
      "When allowed=false, choose the closest riskCategory and cite brief text in evidence.",
    ].join("\n"),
    prompt: [
      "Phone call brief:",
      renderSanitizedJsonForLlm(input.callBrief, 12_000),
      "",
      'Return strict JSON: {"allowed":boolean,"riskCategory":"none|payment|credentials_or_verification_codes|medical_or_legal_advice|sensitive_identity_data|other_sensitive_or_unsafe","reason":string,"evidence":string[]}',
    ].join("\n"),
  });
  if (!decision.ok) return null;
  return decision.value;
}
