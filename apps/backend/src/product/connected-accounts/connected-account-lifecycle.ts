import { randomUUID } from "node:crypto";
import { markCapabilityNotConnected } from "@ai-assistants/capability-lifecycle";
import type { Json, SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { requireSupabaseRows } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { activateCapabilityAfterNangoConnection } from "./nango-connected-capability-activation";

export type OAuthLifecycleTarget =
  | {
      mode: "connect_intent";
      connectIntentId: string;
      intent: TableRow<"provider_connect_intents">;
      existingLink: TableRow<"capability_account_links"> | null;
    }
  | {
      mode: "reconnect";
      capabilityAccountLinkId: string;
      link: TableRow<"capability_account_links">;
    };

export type OAuthConnectionLifecycleEvidence = {
  source: "nango";
  providerConfigKey: string;
  connectionId: string;
  providerAccountId: string;
  accountEmail: string | null;
  displayLabel: string | null;
  accountProvider: string;
  scopes: readonly string[];
  credentialStatus: string;
  lastError: string | null;
  metadata: Json;
};

export type OAuthLifecycleSiblingMapping = {
  slug: string;
  provider: string;
};

type ConnectedAccountLifecycleResultKind =
  | "created_link"
  | "reconnected_link"
  | "duplicate_existing_account"
  | "idempotent_already_completed"
  | "sibling_links_bound";

export type ConnectedAccountLifecycleResult = {
  kind: ConnectedAccountLifecycleResultKind;
  connectedAccount: TableRow<"connected_provider_accounts">;
  primaryLink: TableRow<"capability_account_links">;
  linkedCapabilityLinks: TableRow<"capability_account_links">[];
};

export type DeleteRemoteOAuthConnection = (input: {
  providerConfigKey: string;
  connectionId: string;
  profileId: string;
  capabilityAccountLinkId: string;
}) => Promise<void>;

type OAuthLifecycleSiblingTarget =
  | { kind: "existing"; link: TableRow<"capability_account_links"> }
  | {
      kind: "enabled_capability";
      mapping: OAuthLifecycleSiblingMapping;
      profileCapability: TableRow<"profile_capabilities">;
      existingLink: TableRow<"capability_account_links"> | null;
    };

function trimmed(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function metadataObject(value: Json | undefined): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Json>;
}

async function ensurePendingIntentNotExpired(
  db: SupabaseServiceClient,
  intent: TableRow<"provider_connect_intents">,
): Promise<void> {
  if (Date.parse(intent.expires_at) > Date.now()) return Promise.resolve();
  const expired = await db
    .from("provider_connect_intents")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", intent.id)
    .eq("status", "pending");
  if (expired.error) throw expired.error;
  throw new DomainError(domainCodes.CONFLICT, "Provider connect intent has expired.");
}

async function loadCapabilityAccountLinkById(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilityAccountLinkId: string;
  requireEnabled: boolean;
}): Promise<TableRow<"capability_account_links"> | null> {
  let query = input.db
    .from("capability_account_links")
    .select()
    .eq("profile_id", input.profileId)
    .eq("id", input.capabilityAccountLinkId);
  if (input.requireEnabled) query = query.eq("status", "enabled");
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function requireCapabilityAccountLinkById(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilityAccountLinkId: string;
  requireEnabled: boolean;
}): Promise<TableRow<"capability_account_links">> {
  const link = await loadCapabilityAccountLinkById(input);
  if (!link) throw new DomainError(domainCodes.NOT_FOUND, "Capability account link not found.");
  return link;
}

export async function resolveOAuthLifecycleTarget(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    connectIntentId?: string;
    capabilityAccountLinkId?: string;
  },
): Promise<OAuthLifecycleTarget> {
  if (Boolean(input.connectIntentId) === Boolean(input.capabilityAccountLinkId)) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "OAuth lifecycle target requires exactly one connect intent or capability account link.",
    );
  }

  if (input.connectIntentId) {
    const result = await db
      .from("provider_connect_intents")
      .select()
      .eq("profile_id", input.profileId)
      .eq("id", input.connectIntentId)
      .maybeSingle();
    if (result.error) throw result.error;
    const intent = result.data;
    if (!intent) throw new DomainError(domainCodes.NOT_FOUND, "Provider connect intent not found.");
    if (intent.status === "pending") await ensurePendingIntentNotExpired(db, intent);
    else if (intent.status !== "completed") {
      throw new DomainError(
        domainCodes.CONFLICT,
        `Provider connect intent ${intent.id} is ${intent.status}; expected pending or completed.`,
      );
    }

    const existingLink = intent.capability_account_link_id
      ? await loadCapabilityAccountLinkById({
          db,
          profileId: input.profileId,
          capabilityAccountLinkId: intent.capability_account_link_id,
          requireEnabled: true,
        })
      : null;
    if (intent.capability_account_link_id && !existingLink) {
      throw new DomainError(domainCodes.NOT_FOUND, "Connected capability account link not found.");
    }
    return {
      mode: "connect_intent",
      connectIntentId: input.connectIntentId,
      intent,
      existingLink,
    };
  }

  const link = await requireCapabilityAccountLinkById({
    db,
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId!,
    requireEnabled: true,
  });
  return {
    mode: "reconnect",
    capabilityAccountLinkId: input.capabilityAccountLinkId!,
    link,
  };
}

async function loadConnectedProviderAccountById(input: {
  db: SupabaseServiceClient;
  profileId: string;
  connectedProviderAccountId: string;
}): Promise<TableRow<"connected_provider_accounts">> {
  const result = await input.db
    .from("connected_provider_accounts")
    .select()
    .eq("profile_id", input.profileId)
    .eq("id", input.connectedProviderAccountId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new DomainError(domainCodes.NOT_FOUND, "Connected provider account not found.");
  }
  return result.data;
}

function assertCompletedIntentMatchesEvidence(input: {
  account: TableRow<"connected_provider_accounts">;
  evidence: OAuthConnectionLifecycleEvidence;
}): void {
  const remoteMismatch =
    input.account.nango_provider_config_key !== input.evidence.providerConfigKey ||
    input.account.nango_connection_id !== input.evidence.connectionId;
  const sameProviderIdentity =
    input.account.provider === input.evidence.accountProvider &&
    input.account.provider_account_id === input.evidence.providerAccountId;
  if (remoteMismatch && !sameProviderIdentity) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Completed connect intent points at a different OAuth connection.",
    );
  }
}

async function completedIntentLifecycleResult(input: {
  db: SupabaseServiceClient;
  profileId: string;
  target: Extract<OAuthLifecycleTarget, { mode: "connect_intent" }>;
  evidence: OAuthConnectionLifecycleEvidence;
}): Promise<ConnectedAccountLifecycleResult | null> {
  if (input.target.intent.status !== "completed") return null;
  const connectedProviderAccountId = trimmed(input.target.intent.connected_provider_account_id);
  const capabilityAccountLinkId = trimmed(input.target.intent.capability_account_link_id);
  if (!connectedProviderAccountId || !capabilityAccountLinkId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Completed provider connect intent ${input.target.intent.id} is missing linked account state.`,
    );
  }
  const [account, link] = await Promise.all([
    loadConnectedProviderAccountById({
      db: input.db,
      profileId: input.profileId,
      connectedProviderAccountId,
    }),
    requireCapabilityAccountLinkById({
      db: input.db,
      profileId: input.profileId,
      capabilityAccountLinkId,
      requireEnabled: true,
    }),
  ]);
  assertCompletedIntentMatchesEvidence({ account, evidence: input.evidence });
  return {
    kind: "idempotent_already_completed",
    connectedAccount: account,
    primaryLink: link,
    linkedCapabilityLinks: [link],
  };
}

async function persistConnectedProviderAccount(input: {
  db: SupabaseServiceClient;
  profileId: string;
  link: TableRow<"capability_account_links">;
  evidence: OAuthConnectionLifecycleEvidence;
}): Promise<TableRow<"connected_provider_accounts">> {
  const { db, profileId, link, evidence } = input;
  const now = new Date().toISOString();

  const existingResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("profile_id", profileId)
    .eq("nango_connection_id", evidence.connectionId)
    .eq("nango_provider_config_key", evidence.providerConfigKey);
  const existingRows = requireSupabaseRows(
    "List existing connected provider accounts for OAuth remote",
    existingResult.data,
    existingResult.error,
  );
  if (existingRows.length > 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Profile ${profileId} has ${existingRows.length} rows for OAuth connection ${evidence.connectionId}; expected at most one.`,
    );
  }

  const existingByIdentityResult =
    existingRows[0] === undefined
      ? await db
          .from("connected_provider_accounts")
          .select()
          .eq("profile_id", profileId)
          .eq("provider", evidence.accountProvider)
          .eq("provider_account_id", evidence.providerAccountId)
      : null;
  const existingByIdentityRows = existingByIdentityResult
    ? requireSupabaseRows(
        "List existing connected provider accounts for provider identity",
        existingByIdentityResult.data,
        existingByIdentityResult.error,
      )
    : [];
  if (existingByIdentityRows.length > 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Profile ${profileId} has ${existingByIdentityRows.length} rows for provider identity ${evidence.accountProvider}/${evidence.providerAccountId}; expected at most one.`,
    );
  }

  const existingAccount = existingRows[0] ?? existingByIdentityRows[0] ?? null;
  const existingMetadata = metadataObject(existingAccount?.metadata);
  const accountDisplayLabel =
    trimmed(evidence.accountEmail) ??
    trimmed(evidence.displayLabel) ??
    trimmed(existingAccount?.display_label);
  const accountValues = {
    profile_id: profileId,
    provider: evidence.accountProvider,
    provider_account_id: evidence.providerAccountId,
    account_email: trimmed(evidence.accountEmail),
    display_label: accountDisplayLabel,
    scopes: [...evidence.scopes] as Json,
    connection_status: "connected",
    nango_connection_id: evidence.connectionId,
    nango_provider_config_key: evidence.providerConfigKey,
    credential_status: evidence.credentialStatus,
    connected_at: now,
    last_error: evidence.lastError,
    metadata: {
      ...existingMetadata,
      oauth: evidence.metadata,
    } satisfies Record<string, Json>,
    updated_at: now,
  } as const;
  const savedResult = existingAccount
    ? await db
        .from("connected_provider_accounts")
        .update(accountValues)
        .eq("id", existingAccount.id)
        .select()
        .single()
    : await db
        .from("connected_provider_accounts")
        .insert({
          id: randomUUID(),
          ...accountValues,
          created_at: now,
        })
        .select()
        .single();
  if (savedResult.error) throw savedResult.error;
  const saved = savedResult.data as TableRow<"connected_provider_accounts">;

  emitDiagnostic(backendDiagnosticLogger(), "oauth.connected_account.reconciled", {
    ok: true,
    profile_id: profileId,
    capability_account_link_id: link.id,
    provider: link.provider,
    attrs: {
      profile_id: profileId,
      capability_account_link_id: link.id,
      provider: link.provider,
      provider_config_key: evidence.providerConfigKey,
      connection_id: evidence.connectionId,
      connected_provider_account_id: saved.id,
      created: existingAccount === null,
      account_email_present: Boolean(saved.account_email),
      display_label_present: Boolean(saved.display_label),
      credential_status: saved.credential_status,
      scopes_count: evidence.scopes.length,
    },
  });

  return saved;
}

async function findDuplicateCapabilityAccountLink(input: {
  db: SupabaseServiceClient;
  profileCapabilityId: string;
  connectedProviderAccountId: string;
  keepLinkId?: string | null;
}): Promise<TableRow<"capability_account_links"> | null> {
  let query = input.db
    .from("capability_account_links")
    .select()
    .eq("profile_capability_id", input.profileCapabilityId)
    .eq("connected_provider_account_id", input.connectedProviderAccountId)
    .eq("status", "enabled");
  if (input.keepLinkId) query = query.neq("id", input.keepLinkId);
  const duplicateResult = await query;
  const duplicates = requireSupabaseRows(
    "List duplicate capability account links for connected account",
    duplicateResult.data,
    duplicateResult.error,
  );
  if (duplicates.length > 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Multiple capability account links already point at this provider account.",
    );
  }
  return duplicates[0] ?? null;
}

function capabilityLinkLabel(input: {
  existingLink?: TableRow<"capability_account_links"> | null;
  intent?: TableRow<"provider_connect_intents"> | null;
  connectedAccount: TableRow<"connected_provider_accounts">;
  provider: string;
}): string {
  if (input.existingLink) return input.existingLink.label;
  return (
    trimmed(input.connectedAccount.account_email) ??
    trimmed(input.connectedAccount.display_label) ??
    trimmed(input.intent?.requested_label) ??
    input.provider
  );
}

async function uniqueCapabilityLinkLabel(input: {
  db: SupabaseServiceClient;
  profileCapabilityId: string;
  provider: string;
  preferredLabel: string;
}): Promise<string> {
  const existingResult = await input.db
    .from("capability_account_links")
    .select("label")
    .eq("profile_capability_id", input.profileCapabilityId)
    .eq("provider", input.provider);
  const existingRows = requireSupabaseRows(
    "List capability account link labels",
    existingResult.data,
    existingResult.error,
  );
  const existingLabels = new Set(existingRows.map((row) => row.label));
  if (!existingLabels.has(input.preferredLabel)) return input.preferredLabel;

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${input.preferredLabel} ${suffix}`;
    if (!existingLabels.has(candidate)) return candidate;
  }

  throw new DomainError(
    domainCodes.CONFLICT,
    `Profile capability ${input.profileCapabilityId} has too many ${input.provider} account links named ${JSON.stringify(input.preferredLabel)}.`,
  );
}

async function upsertCapabilityAccountLink(input: {
  db: SupabaseServiceClient;
  profileId: string;
  intent?: TableRow<"provider_connect_intents">;
  existingLink?: TableRow<"capability_account_links">;
  profileCapability?: TableRow<"profile_capabilities">;
  mapping?: OAuthLifecycleSiblingMapping;
  connectedAccount: TableRow<"connected_provider_accounts">;
}): Promise<{
  link: TableRow<"capability_account_links">;
  duplicate: boolean;
}> {
  const now = new Date().toISOString();
  const label = capabilityLinkLabel({
    ...(input.existingLink ? { existingLink: input.existingLink } : {}),
    ...(input.intent ? { intent: input.intent } : {}),
    connectedAccount: input.connectedAccount,
    provider: input.connectedAccount.provider,
  });

  if (input.existingLink) {
    const duplicate = await findDuplicateCapabilityAccountLink({
      db: input.db,
      profileCapabilityId: input.existingLink.profile_capability_id,
      connectedProviderAccountId: input.connectedAccount.id,
      keepLinkId: input.existingLink.id,
    });
    if (duplicate) return { link: duplicate, duplicate: true };
    const updated = await input.db
      .from("capability_account_links")
      .update({
        connected_provider_account_id: input.connectedAccount.id,
        updated_at: now,
      })
      .eq("id", input.existingLink.id)
      .select()
      .single();
    if (updated.error) throw updated.error;
    return {
      link: updated.data as TableRow<"capability_account_links">,
      duplicate: false,
    };
  }

  if (!input.intent) {
    if (!input.profileCapability || !input.mapping) {
      throw new DomainError(
        domainCodes.INTERNAL,
        "Capability account link upsert missing intent or enabled sibling capability.",
      );
    }

    const duplicate = await findDuplicateCapabilityAccountLink({
      db: input.db,
      profileCapabilityId: input.profileCapability.id,
      connectedProviderAccountId: input.connectedAccount.id,
    });
    if (duplicate) return { link: duplicate, duplicate: true };

    const insertLabel = await uniqueCapabilityLinkLabel({
      db: input.db,
      profileCapabilityId: input.profileCapability.id,
      provider: input.mapping.provider,
      preferredLabel: label,
    });
    const inserted = await input.db
      .from("capability_account_links")
      .insert({
        id: randomUUID(),
        profile_id: input.profileId,
        profile_capability_id: input.profileCapability.id,
        capability_slug: input.mapping.slug,
        provider: input.mapping.provider,
        label: insertLabel,
        status: "enabled",
        is_default: false,
        config: {},
        required: false,
        connected_provider_account_id: input.connectedAccount.id,
        readiness_status: "not_connected",
        readiness_blocker_code: null,
        readiness_metadata: {},
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (inserted.error) throw inserted.error;
    return {
      link: inserted.data as TableRow<"capability_account_links">,
      duplicate: false,
    };
  }

  const duplicate = await findDuplicateCapabilityAccountLink({
    db: input.db,
    profileCapabilityId: input.intent.profile_capability_id,
    connectedProviderAccountId: input.connectedAccount.id,
  });
  if (duplicate) return { link: duplicate, duplicate: true };

  const insertLabel = await uniqueCapabilityLinkLabel({
    db: input.db,
    profileCapabilityId: input.intent.profile_capability_id,
    provider: input.intent.provider,
    preferredLabel: label,
  });
  const inserted = await input.db
    .from("capability_account_links")
    .insert({
      id: randomUUID(),
      profile_id: input.profileId,
      profile_capability_id: input.intent.profile_capability_id,
      capability_slug: input.intent.capability_slug,
      provider: input.intent.provider,
      label: insertLabel,
      status: "enabled",
      is_default: false,
      config: {},
      required: false,
      connected_provider_account_id: input.connectedAccount.id,
      readiness_status: "not_connected",
      readiness_blocker_code: null,
      readiness_metadata: {},
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (inserted.error) throw inserted.error;
  return {
    link: inserted.data as TableRow<"capability_account_links">,
    duplicate: false,
  };
}

function sameSiblingMapping(
  link: TableRow<"capability_account_links">,
  mapping: OAuthLifecycleSiblingMapping,
): boolean {
  return link.capability_slug === mapping.slug && link.provider === mapping.provider;
}

async function listMappedSiblingTargets(input: {
  db: SupabaseServiceClient;
  profileId: string;
  primaryLink: TableRow<"capability_account_links">;
  connectedAccount: TableRow<"connected_provider_accounts">;
  siblingMappings: readonly OAuthLifecycleSiblingMapping[];
}): Promise<OAuthLifecycleSiblingTarget[]> {
  if (input.siblingMappings.length <= 1) return [{ kind: "existing", link: input.primaryLink }];
  const siblingSlugs = [...new Set(input.siblingMappings.map((mapping) => mapping.slug))];
  const linksResult = await input.db
    .from("capability_account_links")
    .select()
    .eq("profile_id", input.profileId)
    .in("capability_slug", siblingSlugs)
    .eq("status", "enabled");
  const links = requireSupabaseRows(
    "List enabled capability account links for shared OAuth account",
    linksResult.data,
    linksResult.error,
  );

  const capabilitiesResult = await input.db
    .from("profile_capabilities")
    .select()
    .eq("profile_id", input.profileId)
    .in("capability_slug", siblingSlugs)
    .eq("status", "enabled");
  const profileCapabilities = requireSupabaseRows(
    "List enabled profile capabilities for shared OAuth account",
    capabilitiesResult.data,
    capabilitiesResult.error,
  );
  const profileCapabilitiesBySlug = new Map(
    profileCapabilities.map((capability) => [capability.capability_slug, capability]),
  );

  return input.siblingMappings.flatMap((mapping): OAuthLifecycleSiblingTarget[] => {
    if (sameSiblingMapping(input.primaryLink, mapping)) {
      return [{ kind: "existing", link: input.primaryLink }];
    }

    const profileCapability = profileCapabilitiesBySlug.get(mapping.slug);
    if (!profileCapability) return [];

    const sameAccountLink =
      links.find(
        (link) =>
          sameSiblingMapping(link, mapping) &&
          link.profile_capability_id === profileCapability.id &&
          link.connected_provider_account_id === input.connectedAccount.id,
      ) ?? null;
    if (sameAccountLink) return [{ kind: "existing", link: sameAccountLink }];

    const reusableLink =
      links.find(
        (link) =>
          sameSiblingMapping(link, mapping) &&
          link.profile_capability_id === profileCapability.id &&
          link.connected_provider_account_id === null,
      ) ?? null;

    return [
      {
        kind: "enabled_capability",
        mapping,
        profileCapability,
        existingLink: reusableLink,
      },
    ];
  });
}

async function linkSiblingCapabilities(input: {
  db: SupabaseServiceClient;
  profileId: string;
  primaryLink: TableRow<"capability_account_links">;
  connectedAccount: TableRow<"connected_provider_accounts">;
  evidence: OAuthConnectionLifecycleEvidence;
  siblingMappings: readonly OAuthLifecycleSiblingMapping[];
}): Promise<{
  links: TableRow<"capability_account_links">[];
  duplicate: boolean;
}> {
  const targets = await listMappedSiblingTargets({
    db: input.db,
    profileId: input.profileId,
    primaryLink: input.primaryLink,
    connectedAccount: input.connectedAccount,
    siblingMappings: input.siblingMappings,
  });
  const linked: TableRow<"capability_account_links">[] = [];
  let duplicate = false;
  for (const target of targets) {
    const saved =
      target.kind === "existing" && target.link.id === input.primaryLink.id
        ? { link: input.primaryLink, duplicate: false }
        : await upsertCapabilityAccountLink({
            db: input.db,
            profileId: input.profileId,
            ...(target.kind === "existing"
              ? { existingLink: target.link }
              : {
                  ...(target.existingLink ? { existingLink: target.existingLink } : {}),
                  profileCapability: target.profileCapability,
                  mapping: target.mapping,
                }),
            connectedAccount: input.connectedAccount,
          });
    duplicate = duplicate || saved.duplicate;
    linked.push(saved.link);
    emitDiagnostic(backendDiagnosticLogger(), "provider_connection.capability_bound", {
      ok: true,
      profile_id: input.profileId,
      capability_account_link_id: saved.link.id,
      provider: saved.link.provider,
      attrs: {
        profile_id: input.profileId,
        capability_account_link_id: saved.link.id,
        connected_provider_account_id: input.connectedAccount.id,
        provider_config_key: input.evidence.providerConfigKey,
        shared_from_link_id: input.primaryLink.id,
      },
    });
  }
  return { links: linked, duplicate };
}

function targetPrimaryLink(input: { target: OAuthLifecycleTarget }): TableRow<"capability_account_links"> {
  if (input.target.mode === "reconnect") return input.target.link;
  if (input.target.existingLink) return input.target.existingLink;
  return {
    id: randomUUID(),
    profile_id: input.target.intent.profile_id,
    profile_capability_id: input.target.intent.profile_capability_id,
    capability_slug: input.target.intent.capability_slug,
    provider: input.target.intent.provider,
    label: trimmed(input.target.intent.requested_label) ?? input.target.intent.provider,
    status: "enabled",
    is_default: false,
    config: {},
    required: false,
    connected_provider_account_id: null,
    readiness_status: "not_connected",
    readiness_blocker_code: null,
    readiness_latest_backend_job_id: null,
    readiness_last_success_at: null,
    readiness_last_error: null,
    readiness_metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } satisfies TableRow<"capability_account_links">;
}

async function completeIntent(input: {
  db: SupabaseServiceClient;
  intentId: string;
  connectedProviderAccountId: string;
  capabilityAccountLinkId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const update = await input.db
    .from("provider_connect_intents")
    .update({
      status: "completed",
      connected_provider_account_id: input.connectedProviderAccountId,
      capability_account_link_id: input.capabilityAccountLinkId,
      updated_at: now,
    })
    .eq("id", input.intentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (update.error) throw update.error;
  if (update.data) return;

  const current = await input.db
    .from("provider_connect_intents")
    .select("status, connected_provider_account_id, capability_account_link_id")
    .eq("id", input.intentId)
    .maybeSingle();
  if (current.error) throw current.error;
  const intent = current.data;
  if (
    intent?.status === "completed" &&
    intent.connected_provider_account_id === input.connectedProviderAccountId &&
    intent.capability_account_link_id === input.capabilityAccountLinkId
  ) {
    return;
  }
  throw new DomainError(
    domainCodes.CONFLICT,
    `Provider connect intent ${input.intentId} could not be completed from its current state.`,
  );
}

export async function completeOAuthConnectedAccountLifecycle(input: {
  db: SupabaseServiceClient;
  profileId: string;
  target: OAuthLifecycleTarget;
  evidence: OAuthConnectionLifecycleEvidence;
  siblingMappings: readonly OAuthLifecycleSiblingMapping[];
}): Promise<ConnectedAccountLifecycleResult> {
  if (input.target.mode === "connect_intent") {
    const idempotent = await completedIntentLifecycleResult({
      db: input.db,
      profileId: input.profileId,
      target: input.target,
      evidence: input.evidence,
    });
    if (idempotent) return idempotent;
  }

  const scaffoldLink = targetPrimaryLink({ target: input.target });
  const connectedAccount = await persistConnectedProviderAccount({
    db: input.db,
    profileId: input.profileId,
    link: scaffoldLink,
    evidence: input.evidence,
  });
  const savedPrimary = await upsertCapabilityAccountLink({
    db: input.db,
    profileId: input.profileId,
    ...(input.target.mode === "connect_intent"
      ? {
          intent: input.target.intent,
          ...(input.target.existingLink ? { existingLink: input.target.existingLink } : {}),
        }
      : { existingLink: input.target.link }),
    connectedAccount,
  });
  const linked = await linkSiblingCapabilities({
    db: input.db,
    profileId: input.profileId,
    primaryLink: savedPrimary.link,
    connectedAccount,
    evidence: input.evidence,
    siblingMappings: input.siblingMappings,
  });

  if (input.target.mode === "connect_intent") {
    await completeIntent({
      db: input.db,
      intentId: input.target.connectIntentId,
      connectedProviderAccountId: connectedAccount.id,
      capabilityAccountLinkId: savedPrimary.link.id,
    });
  }

  for (const link of linked.links) {
    await activateCapabilityAfterNangoConnection({
      db: input.db,
      profileId: input.profileId,
      capabilityAccountLinkId: link.id,
      providerConfigKey: input.evidence.providerConfigKey,
      connectionId: input.evidence.connectionId,
      link,
      connectedAccount,
    });
  }

  const kind: ConnectedAccountLifecycleResultKind = savedPrimary.duplicate
    ? "duplicate_existing_account"
    : linked.links.length > 1 || linked.duplicate
      ? "sibling_links_bound"
      : input.target.mode === "reconnect" || input.target.existingLink
        ? "reconnected_link"
        : "created_link";
  return {
    kind,
    connectedAccount,
    primaryLink: savedPrimary.link,
    linkedCapabilityLinks: linked.links,
  };
}

async function disconnectProviderAccountIfUnused(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    connectedAccountId: string | null;
    now: string;
    deleteRemoteConnection?: DeleteRemoteOAuthConnection;
  },
): Promise<void> {
  const connectedAccountId = trimmed(input.connectedAccountId);
  if (!connectedAccountId) return;

  const siblingLinksResult = await db
    .from("capability_account_links")
    .select()
    .eq("connected_provider_account_id", connectedAccountId)
    .eq("status", "enabled");
  const siblingLinks = requireSupabaseRows(
    "List capability account links sharing connected provider account",
    siblingLinksResult.data,
    siblingLinksResult.error,
  );
  const hasOtherActiveLink = siblingLinks.some((link) => link.id !== input.capabilityAccountLinkId);
  if (hasOtherActiveLink) return;

  const account = await loadConnectedProviderAccountById({
    db,
    profileId: input.profileId,
    connectedProviderAccountId: connectedAccountId,
  });
  const providerConfigKey = trimmed(account.nango_provider_config_key);
  const connectionId = trimmed(account.nango_connection_id);
  if (providerConfigKey && connectionId && input.deleteRemoteConnection) {
    await input.deleteRemoteConnection({
      providerConfigKey,
      connectionId,
      profileId: input.profileId,
      capabilityAccountLinkId: input.capabilityAccountLinkId,
    });
  }

  const connectionUpdate = await db
    .from("connected_provider_accounts")
    .update({
      connection_status: "disconnected",
      credential_status: null,
      last_error: null,
      updated_at: input.now,
    })
    .eq("id", account.id);
  if (connectionUpdate.error) throw connectionUpdate.error;
}

async function clearCapabilityAccountLinkConnection(
  db: SupabaseServiceClient,
  input: { capabilityAccountLinkId: string; now: string },
): Promise<void> {
  const unlink = await db
    .from("capability_account_links")
    .update({
      connected_provider_account_id: null,
      updated_at: input.now,
    })
    .eq("id", input.capabilityAccountLinkId);
  if (unlink.error) throw unlink.error;
}

async function ensureDefaultAfterDeletingLink(input: {
  db: SupabaseServiceClient;
  disabledLink: TableRow<"capability_account_links">;
  now: string;
}): Promise<void> {
  if (!input.disabledLink.is_default) return;
  const replacementResult = await input.db
    .from("capability_account_links")
    .select()
    .eq("profile_capability_id", input.disabledLink.profile_capability_id)
    .eq("status", "enabled")
    .neq("id", input.disabledLink.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (replacementResult.error) throw replacementResult.error;
  const replacement = replacementResult.data;
  if (!replacement) return;
  const update = await input.db
    .from("capability_account_links")
    .update({ is_default: true, updated_at: input.now })
    .eq("id", replacement.id);
  if (update.error) throw update.error;
}

export async function disconnectCapabilityAccountLinkCredential(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    deleteRemoteConnection?: DeleteRemoteOAuthConnection;
  },
): Promise<void> {
  const { profileId, capabilityAccountLinkId } = input;
  const link = await requireCapabilityAccountLinkById({
    db,
    profileId,
    capabilityAccountLinkId,
    requireEnabled: true,
  });
  const now = new Date().toISOString();

  await disconnectProviderAccountIfUnused(db, {
    profileId,
    capabilityAccountLinkId,
    connectedAccountId: link.connected_provider_account_id,
    now,
    ...(input.deleteRemoteConnection ? { deleteRemoteConnection: input.deleteRemoteConnection } : {}),
  });
  await clearCapabilityAccountLinkConnection(db, { capabilityAccountLinkId, now });
  await markCapabilityNotConnected(db, { profileId, capabilityAccountLinkId });
}

export async function deleteCapabilityAccountLink(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    deleteRemoteConnection?: DeleteRemoteOAuthConnection;
  },
): Promise<void> {
  const { profileId, capabilityAccountLinkId } = input;
  const link = await requireCapabilityAccountLinkById({
    db,
    profileId,
    capabilityAccountLinkId,
    requireEnabled: true,
  });
  const now = new Date().toISOString();

  await disconnectProviderAccountIfUnused(db, {
    profileId,
    capabilityAccountLinkId,
    connectedAccountId: link.connected_provider_account_id,
    now,
    ...(input.deleteRemoteConnection ? { deleteRemoteConnection: input.deleteRemoteConnection } : {}),
  });
  await clearCapabilityAccountLinkConnection(db, { capabilityAccountLinkId, now });
  await markCapabilityNotConnected(db, { profileId, capabilityAccountLinkId });

  const disable = await db
    .from("capability_account_links")
    .update({
      status: "disabled",
      is_default: false,
      updated_at: now,
    })
    .eq("profile_id", profileId)
    .eq("id", capabilityAccountLinkId);
  if (disable.error) throw disable.error;
  await ensureDefaultAfterDeletingLink({ db, disabledLink: link, now });
}
