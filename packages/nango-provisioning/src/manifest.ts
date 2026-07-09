import { z } from "zod";

import {
  CAPABILITY_ACTIVATION_POLICIES,
  profileCapabilitySlugSchema,
} from "@ai-assistants/capability-catalog";

const oauth2CredentialEnvSchema = z
  .object({
    type: z.literal("OAUTH2"),
    clientIdEnv: z.string().trim().min(1),
    clientSecretEnv: z.string().trim().min(1),
    /** Comma-separated requested OAuth scopes sent to Nango. */
    scopes: z.string().trim().min(1).optional(),
  })
  .strict();

const oauthReadinessSchema = z
  .object({
    requiredGrantedScopes: z.array(z.string().trim().min(1)).default([]),
    requiresRefreshToken: z.boolean().default(false),
  })
  .strict();

const sharedAccountSchema = z
  .object({
    provider: z.string().trim().min(1),
    label: z.string().trim().min(1),
    capabilityLabels: z
      .partialRecord(profileCapabilitySlugSchema, z.string().trim().min(1))
      .default({}),
    capabilitySortOrder: z.array(profileCapabilitySlugSchema).default([]),
  })
  .strict();

const nangoProvisioningEntrySchema = z
  .object({
    /** Nango integration unique key (`provider_config_key` / Connect `allowed_integrations`). */
    uniqueKey: z.string().trim().min(1),
    /** Nango API configuration template id (POST `provider` field). */
    nangoProvider: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    profileCapabilityMappings: z
      .array(
        z
          .object({
            slug: profileCapabilitySlugSchema,
            provider: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
    sharedAccount: sharedAccountSchema.optional(),
    credentials: oauth2CredentialEnvSchema,
    readiness: oauthReadinessSchema.default({
      requiredGrantedScopes: [],
      requiresRefreshToken: false,
    }),
  })
  .strict();

export type NangoProvisioningEntry = z.infer<typeof nangoProvisioningEntrySchema>;

/**
 * Canonical Nango integrations provisioned per Nango environment (literal tuple for derived types).
 * Secrets live only in env vars referenced by `credentials.*Env` — never in source.
 *
 * Nango `provider` values match Nango’s public API configuration keys (see Nango docs / `providers.yaml`).
 */
const NANGO_PROVISIONING_MANIFEST = [
  {
    uniqueKey: "ai-assistants-google",
    nangoProvider: "google",
    displayName: "AI Assistants Google",
    profileCapabilityMappings: [
      { slug: "gmail", provider: "gmail" },
      { slug: "google-calendar", provider: "google-calendar" },
      { slug: "google-drive", provider: "google-drive" },
    ],
    sharedAccount: {
      provider: "google",
      label: "Google",
      capabilityLabels: {
        gmail: "Gmail",
        "google-calendar": "Calendar",
        "google-drive": "Drive",
      },
      capabilitySortOrder: ["gmail", "google-calendar", "google-drive"],
    },
    credentials: {
      type: "OAUTH2",
      clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
      clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
      scopes:
        "https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/drive",
    },
    readiness: {
      requiredGrantedScopes: [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/drive",
      ],
      requiresRefreshToken: false,
    },
  },
  {
    uniqueKey: "ai-assistants-outlook",
    nangoProvider: "outlook",
    displayName: "AI Assistants Outlook",
    profileCapabilityMappings: [
      {
        slug: "outlook-mail",
        provider: "outlook-mail",
      },
      {
        slug: "outlook-calendar",
        provider: "outlook-calendar",
      },
      {
        slug: "microsoft-todo",
        provider: "microsoft-todo",
      },
    ],
    sharedAccount: {
      provider: "outlook",
      label: "Outlook",
      capabilityLabels: {
        "outlook-mail": "Mail",
        "outlook-calendar": "Calendar",
        "microsoft-todo": "To Do",
      },
      capabilitySortOrder: ["outlook-mail", "outlook-calendar", "microsoft-todo"],
    },
    credentials: {
      type: "OAUTH2",
      clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
      clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
      scopes:
        "offline_access,User.Read,Mail.Read,Mail.ReadWrite,Mail.Send,Calendars.ReadWrite,Tasks.ReadWrite",
    },
    readiness: {
      requiredGrantedScopes: [
        "User.Read",
        "Mail.Read",
        "Mail.ReadWrite",
        "Mail.Send",
        "Calendars.ReadWrite",
        "Tasks.ReadWrite",
      ],
      requiresRefreshToken: true,
    },
  },
  {
    uniqueKey: "ai-assistants-monday",
    nangoProvider: "monday",
    displayName: "AI Assistants Monday",
    profileCapabilityMappings: [{ slug: "monday", provider: "monday" }],
    credentials: {
      type: "OAUTH2",
      clientIdEnv: "MONDAY_OAUTH_CLIENT_ID",
      clientSecretEnv: "MONDAY_OAUTH_CLIENT_SECRET",
      scopes:
        "account:read,assets:read,boards:read,boards:write,departments:read,departments:write,docs:read,docs:write,me:read,notifications:write,tags:read,teams:read,teams:write,updates:read,updates:write,users:read,users:write,webhooks:read,webhooks:write,workspaces:read,workspaces:write",
    },
    readiness: {
      requiredGrantedScopes: [
        "account:read",
        "assets:read",
        "boards:read",
        "boards:write",
        "departments:read",
        "departments:write",
        "docs:read",
        "docs:write",
        "me:read",
        "notifications:write",
        "tags:read",
        "teams:read",
        "teams:write",
        "updates:read",
        "updates:write",
        "users:read",
        "users:write",
        "webhooks:read",
        "webhooks:write",
        "workspaces:read",
        "workspaces:write",
      ],
      requiresRefreshToken: false,
    },
  },
  {
    uniqueKey: "ai-assistants-microsoft-onedrive",
    nangoProvider: "one-drive",
    displayName: "AI Assistants Microsoft OneDrive for Business",
    profileCapabilityMappings: [{ slug: "microsoft-onedrive", provider: "microsoft-onedrive" }],
    credentials: {
      type: "OAUTH2",
      clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
      clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
      scopes: "offline_access,User.Read,Files.ReadWrite.All,Sites.ReadWrite.All",
    },
    readiness: {
      requiredGrantedScopes: ["User.Read", "Files.ReadWrite.All", "Sites.ReadWrite.All"],
      requiresRefreshToken: true,
    },
  },
  {
    uniqueKey: "ai-assistants-microsoft-sharepoint",
    nangoProvider: "sharepoint-online",
    displayName: "AI Assistants SharePoint Online",
    profileCapabilityMappings: [{ slug: "microsoft-sharepoint", provider: "microsoft-sharepoint" }],
    credentials: {
      type: "OAUTH2",
      clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
      clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
      scopes: "offline_access,User.Read,Files.ReadWrite.All,Sites.ReadWrite.All",
    },
    readiness: {
      requiredGrantedScopes: ["User.Read", "Files.ReadWrite.All", "Sites.ReadWrite.All"],
      requiresRefreshToken: true,
    },
  },
] as const;

export type NangoProvisioningManifest = typeof NANGO_PROVISIONING_MANIFEST;

function scopeTokens(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function comparableScope(scope: string): string {
  const normalized = scope.trim().toLowerCase();
  const graphPrefix = "https://graph.microsoft.com/";
  if (normalized.startsWith(graphPrefix)) return normalized.slice(graphPrefix.length);
  return normalized;
}

function assertProvisioningManifestValid(manifest: typeof NANGO_PROVISIONING_MANIFEST): void {
  const seenKeys = new Set<string>();
  const seenMappings = new Map<string, string>();
  for (const raw of manifest) {
    const entry = nangoProvisioningEntrySchema.parse(raw);
    if (seenKeys.has(entry.uniqueKey))
      throw new Error(`Duplicate Nango provisioning uniqueKey: ${entry.uniqueKey}`);
    seenKeys.add(entry.uniqueKey);
    for (const m of entry.profileCapabilityMappings) {
      const k = `${m.slug}:${m.provider}`;
      if (seenMappings.has(k)) {
        throw new Error(
          `Duplicate capability slug/provider mapping ${k} (entries ${seenMappings.get(k)} vs ${entry.uniqueKey}).`,
        );
      }
      seenMappings.set(k, entry.uniqueKey);
    }
  }
}

assertProvisioningManifestValid(NANGO_PROVISIONING_MANIFEST);

/** Zod-validated manifest entries for runtime consumers (widened from the literal manifest). */
export const NANGO_PROVISIONING_ENTRIES: readonly NangoProvisioningEntry[] =
  NANGO_PROVISIONING_MANIFEST.map((raw) => nangoProvisioningEntrySchema.parse(raw));

const bySlugProvider = new Map<string, string>();
for (const entry of NANGO_PROVISIONING_ENTRIES) {
  for (const m of entry.profileCapabilityMappings) {
    bySlugProvider.set(`${m.slug}\0${m.provider}`, entry.uniqueKey);
  }
}

/** Returns the canonical Nango integration unique key for a capability slug + provider, if provisioned. */
export function nangoProviderConfigKeyForCapabilityProvider(
  slug: string,
  provider: string,
): string | undefined {
  return bySlugProvider.get(`${slug}\0${provider}`);
}

export function nangoProvisioningEntryByUniqueKey(
  uniqueKey: string,
): NangoProvisioningEntry | undefined {
  return NANGO_PROVISIONING_ENTRIES.find((e) => e.uniqueKey === uniqueKey);
}

export function assertNangoOAuthReadinessSemantics(): void {
  for (const entry of NANGO_PROVISIONING_ENTRIES) {
    const requestedScopes = entry.credentials.scopes ? scopeTokens(entry.credentials.scopes) : [];
    const requestsOfflineAccess = requestedScopes.some(
      (scope) => comparableScope(scope) === "offline_access",
    );
    const requiresOfflineAccessAsGrantedScope = entry.readiness.requiredGrantedScopes.some(
      (scope) => comparableScope(scope) === "offline_access",
    );
    if (requiresOfflineAccessAsGrantedScope) {
      throw new Error(
        `${entry.uniqueKey} must not list offline_access in readiness.requiredGrantedScopes; use readiness.requiresRefreshToken.`,
      );
    }
    if (requestsOfflineAccess && !entry.readiness.requiresRefreshToken) {
      throw new Error(
        `${entry.uniqueKey} requests offline_access but does not set readiness.requiresRefreshToken=true.`,
      );
    }
  }
}

/** Every `credentialMode: "oauth"` activation provider must map to a provisioned Nango integration unique key. */
export function assertNangoProvisioningCoversOAuthActivationPolicies(): void {
  for (const policy of Object.values(CAPABILITY_ACTIVATION_POLICIES)) {
    if (policy.credentialMode !== "oauth") continue;
    for (const provider of policy.providers) {
      const key = nangoProviderConfigKeyForCapabilityProvider(policy.slug, provider);
      if (!key) {
        throw new Error(
          `Nango provisioning manifest missing mapping for oauth policy slug=${policy.slug} provider=${provider}.`,
        );
      }
    }
  }
}

assertNangoProvisioningCoversOAuthActivationPolicies();
assertNangoOAuthReadinessSemantics();
