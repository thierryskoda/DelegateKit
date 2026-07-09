import type {
  CapabilityCredentialMode,
  CapabilityReadinessBlockerCode,
} from "./capability-metadata";
import type { ProfileCapabilitySlug } from "./profile-capability-catalog";
import {
  isProfileCapabilitySlug,
  profileCapabilitySlugs,
  profileCapabilitySpec,
} from "./profile-capability-catalog";

export type CapabilityActivationPolicy = {
  slug: string;
  providers: readonly string[];
  credentialMode: CapabilityCredentialMode;
  setupBlocker: CapabilityReadinessBlockerCode | null;
};

export const CAPABILITY_ACTIVATION_POLICIES = {
  boldsign: {
    slug: "boldsign",
    providers: ["boldsign"],
    credentialMode: "backend_secret",
    setupBlocker: null,
  },
  "microsoft-onedrive": {
    slug: "microsoft-onedrive",
    providers: ["microsoft-onedrive"],
    credentialMode: "oauth",
    setupBlocker: null,
  },
  "microsoft-sharepoint": {
    slug: "microsoft-sharepoint",
    providers: ["microsoft-sharepoint"],
    credentialMode: "oauth",
    setupBlocker: null,
  },
  "microsoft-todo": {
    slug: "microsoft-todo",
    providers: ["microsoft-todo"],
    credentialMode: "oauth",
    setupBlocker: null,
  },
  "google-drive": {
    slug: "google-drive",
    providers: ["google-drive"],
    credentialMode: "oauth",
    setupBlocker: null,
  },
  "google-calendar": {
    slug: "google-calendar",
    providers: ["google-calendar"],
    credentialMode: "oauth",
    setupBlocker: null,
  },
  "outlook-calendar": {
    slug: "outlook-calendar",
    providers: ["outlook-calendar"],
    credentialMode: "oauth",
    setupBlocker: null,
  },
  gmail: {
    slug: "gmail",
    providers: ["gmail"],
    credentialMode: "oauth",
    setupBlocker: null,
  },
  "outlook-mail": {
    slug: "outlook-mail",
    providers: ["outlook-mail"],
    credentialMode: "oauth",
    setupBlocker: null,
  },
  monday: {
    slug: "monday",
    providers: ["monday"],
    credentialMode: "oauth",
    setupBlocker: null,
  },
  "document-tools": {
    slug: "document-tools",
    providers: ["document-tools"],
    credentialMode: "none",
    setupBlocker: null,
  },
  "file-analysis": {
    slug: "file-analysis",
    providers: ["file-analysis"],
    credentialMode: "none",
    setupBlocker: null,
  },
  "public-web": {
    slug: "public-web",
    providers: ["perplexity", "browserbase-stagehand"],
    credentialMode: "none",
    setupBlocker: null,
  },
  phone: {
    slug: "phone",
    providers: ["twilio-voice", "twilio-messaging"],
    credentialMode: "backend_secret",
    setupBlocker: null,
  },
} as const satisfies Record<ProfileCapabilitySlug, CapabilityActivationPolicy>;

export function capabilityActivationPolicyForSlug(
  slug: string,
): CapabilityActivationPolicy | undefined {
  return isProfileCapabilitySlug(slug) ? CAPABILITY_ACTIVATION_POLICIES[slug] : undefined;
}

export function requireCapabilityActivationPolicyForSlug(slug: string): CapabilityActivationPolicy {
  const policy = capabilityActivationPolicyForSlug(slug);
  if (!policy) throw new Error(`Unknown capability activation policy for capability slug: ${slug}`);
  return policy;
}

export function assertCapabilityActivationCatalogComplete(): void {
  for (const slug of profileCapabilitySlugs()) {
    requireCapabilityActivationPolicyForSlug(slug);
  }
  for (const policy of Object.values(
    CAPABILITY_ACTIVATION_POLICIES,
  ) as CapabilityActivationPolicy[]) {
    if (!profileCapabilitySpec(policy.slug))
      throw new Error(`Activation policy ${policy.slug} has no profile capability spec.`);
  }
}

assertCapabilityActivationCatalogComplete();
