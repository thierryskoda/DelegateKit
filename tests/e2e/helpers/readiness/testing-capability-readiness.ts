import {
  PROFILE_CAPABILITY_CATALOG,
  type ProfileCapabilitySlug,
} from "@ai-assistants/capability-catalog";
import { requireSupabaseData, type SupabaseServiceClient } from "@ai-assistants/control-db";
import { type TestingProviderRequirement } from "./testing-provider-readiness";

export type TestingCapabilityRequirement = TestingProviderRequirement;

function requireConnectedCapability(slug: ProfileCapabilitySlug): TestingCapabilityRequirement {
  const spec = PROFILE_CAPABILITY_CATALOG[slug];
  return {
    capabilitySlug: spec.slug,
    provider: spec.defaultProvider,
    label: spec.label,
  };
}

export const CONNECTED_TESTING_CAPABILITIES = {
  boldsign: requireConnectedCapability("boldsign"),
  googleCalendar: requireConnectedCapability("google-calendar"),
  gmail: requireConnectedCapability("gmail"),
  googleDrive: requireConnectedCapability("google-drive"),
  monday: requireConnectedCapability("monday"),
} as const;

/** Live E2E binding for testing profile Microsoft mail (requires the local E2E binding map). */
export const TESTING_OUTLOOK_EMAIL_CAPABILITY = {
  capabilitySlug: "outlook-mail",
  provider: "outlook-mail",
  label: "Outlook Mail",
  requiredOAuthScopes: ["Mail.Send", "https://graph.microsoft.com/Mail.Send"],
} as const satisfies TestingCapabilityRequirement;

/** Live E2E binding for testing profile Microsoft calendar (same Nango connection as Outlook mail). */
export const TESTING_OUTLOOK_CALENDAR_CAPABILITY = {
  capabilitySlug: "outlook-calendar",
  provider: "outlook-calendar",
  label: "Outlook Calendar",
} as const satisfies TestingCapabilityRequirement;

/** Live E2E binding for testing profile Microsoft To Do (shares ai-assistants-outlook OAuth scopes). */
export const TESTING_MICROSOFT_TODO_CAPABILITY = {
  capabilitySlug: "microsoft-todo",
  provider: "microsoft-todo",
  label: "Microsoft To Do",
  requiredOAuthScopes: ["Tasks.ReadWrite"],
} as const satisfies TestingCapabilityRequirement;

async function requireTestingCapabilityEnabled(
  db: SupabaseServiceClient,
  requirement: TestingCapabilityRequirement,
): Promise<void> {
  const linkResult = await db
    .from("capability_account_links")
    .select("id")
    .eq("profile_id", "testing")
    .eq("capability_slug", requirement.capabilitySlug)
    .eq("provider", requirement.provider)
    .eq("status", "enabled")
    .maybeSingle();
  requireSupabaseData(
    `Load enabled testing capability account link for ${requirement.capabilitySlug}/${requirement.provider}`,
    linkResult.data,
    linkResult.error,
  );
}

async function requireTestingCapabilitiesEnabled(
  db: SupabaseServiceClient,
  requirements: readonly TestingCapabilityRequirement[],
): Promise<void> {
  for (const requirement of requirements) {
    await requireTestingCapabilityEnabled(db, requirement);
  }
}

export const requireTestingCapabilityConnected = requireTestingCapabilityEnabled;
export const requireTestingCapabilitiesConnected = requireTestingCapabilitiesEnabled;
