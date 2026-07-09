import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { evaluateCapabilityActivation } from "@ai-assistants/capability-lifecycle";
import { DomainError, domainCodes } from "@ai-assistants/errors";

export type ManagedBackendSecretCapabilityBindingInput = {
  profileId: string;
  capabilityAccountLink: TableRow<"capability_account_links">;
  provider: string;
  providerAccountId: string;
  displayLabel: string;
  managedCredential: string;
  metadata?: Record<string, unknown>;
};

export type ManagedBackendSecretProviderBindingSpec = {
  capabilitySlug: string;
  provider: string;
  providerAccountId: string;
  displayLabel: string;
  managedCredential: string;
  metadata?: Record<string, unknown>;
};

export const managedBackendSecretProviderBindings: readonly ManagedBackendSecretProviderBindingSpec[] = [
  {
    capabilitySlug: "boldsign",
    provider: "boldsign",
    providerAccountId: "ai-assistants-managed-boldsign",
    displayLabel: "AI Assistants managed BoldSign",
    managedCredential: "BOLDSIGN_API_KEY",
  },
  {
    capabilitySlug: "phone",
    provider: "twilio-voice",
    providerAccountId: "ai-assistants-managed-twilio-voice",
    displayLabel: "AI Assistants managed Twilio Voice",
    managedCredential: "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN",
  },
  {
    capabilitySlug: "phone",
    provider: "twilio-messaging",
    providerAccountId: "ai-assistants-managed-twilio-messaging",
    displayLabel: "AI Assistants managed Twilio Messaging",
    managedCredential: "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN",
  },
];

async function loadConnectedProviderAccount(
  db: SupabaseServiceClient,
  accountId: string,
): Promise<TableRow<"connected_provider_accounts">> {
  const result = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", accountId)
    .maybeSingle();
  const account = requireSupabaseData(
    `Load connected provider account ${accountId}`,
    result.data,
    result.error,
  );
  if (!account) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Connected provider account ${accountId} was not found.`,
    );
  }
  return account;
}

async function upsertManagedConnectedProviderAccount(
  db: SupabaseServiceClient,
  input: ManagedBackendSecretCapabilityBindingInput,
): Promise<TableRow<"connected_provider_accounts">> {
  const now = new Date().toISOString();
  const metadata = requireJsonObject(
    {
      ...input.metadata,
      managedCredential: input.managedCredential,
      managedBy: "ai-assistants",
    },
    `managedBackendSecret.${input.provider}.metadata`,
  );
  const existingResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("profile_id", input.profileId)
    .eq("provider", input.provider)
    .eq("provider_account_id", input.providerAccountId)
    .limit(2);
  const existingRows = requireSupabaseRows(
    `Load managed ${input.provider} connected provider account`,
    existingResult.data,
    existingResult.error,
  );
  if (existingRows.length > 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Multiple managed ${input.provider} connected provider accounts exist for profile ${input.profileId} and provider account ${input.providerAccountId}.`,
    );
  }
  const existing = existingRows[0] ?? null;
  if (existing) {
    const updateResult = await db
      .from("connected_provider_accounts")
      .update({
        account_email: null,
        display_label: input.displayLabel,
        scopes: [],
        connection_status: "connected",
        credential_kind: "backend_secret",
        nango_connection_id: null,
        nango_provider_config_key: null,
        credential_status: "healthy",
        connected_at: existing.connected_at ?? now,
        last_error: null,
        metadata,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select()
      .single();
    return requireSupabaseData(
      `Update managed ${input.provider} connected provider account`,
      updateResult.data,
      updateResult.error,
    );
  }

  const insertResult = await db
    .from("connected_provider_accounts")
    .insert({
      profile_id: input.profileId,
      provider: input.provider,
      provider_account_id: input.providerAccountId,
      account_email: null,
      display_label: input.displayLabel,
      scopes: [],
      connection_status: "connected",
      credential_kind: "backend_secret",
      nango_connection_id: null,
      nango_provider_config_key: null,
      credential_status: "healthy",
      connected_at: now,
      last_error: null,
      metadata,
      updated_at: now,
    })
    .select()
    .single();
  return requireSupabaseData(
    `Insert managed ${input.provider} connected provider account`,
    insertResult.data,
    insertResult.error,
  );
}

async function assertManagedLinkCanBind(
  db: SupabaseServiceClient,
  input: ManagedBackendSecretCapabilityBindingInput,
  account: TableRow<"connected_provider_accounts">,
): Promise<void> {
  const existingAccountId = input.capabilityAccountLink.connected_provider_account_id?.trim();
  if (!existingAccountId || existingAccountId === account.id) return;
  const existing = await loadConnectedProviderAccount(db, existingAccountId);
  if (
    existing.profile_id === input.profileId &&
    existing.provider === input.provider &&
    existing.provider_account_id === input.providerAccountId &&
    existing.credential_kind === "backend_secret"
  ) {
    return;
  }
  throw new DomainError(
    domainCodes.CONFLICT,
    `Capability account link ${input.capabilityAccountLink.id} is already bound to connected provider account ${existingAccountId}; refusing to replace it with managed ${input.provider}.`,
  );
}

export async function ensureManagedBackendSecretCapabilityAccount(
  db: SupabaseServiceClient,
  input: ManagedBackendSecretCapabilityBindingInput,
): Promise<TableRow<"connected_provider_accounts">> {
  if (input.capabilityAccountLink.profile_id !== input.profileId) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Capability account link ${input.capabilityAccountLink.id} belongs to profile ${input.capabilityAccountLink.profile_id}, expected ${input.profileId}.`,
    );
  }
  if (input.capabilityAccountLink.provider !== input.provider) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Capability account link ${input.capabilityAccountLink.id} provider ${input.capabilityAccountLink.provider} does not match managed provider ${input.provider}.`,
    );
  }
  const account = await upsertManagedConnectedProviderAccount(db, input);
  await assertManagedLinkCanBind(db, input, account);
  const linkUpdate = await db
    .from("capability_account_links")
    .update({
      connected_provider_account_id: account.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.capabilityAccountLink.id);
  requireSupabaseData(
    `Bind managed ${input.provider} connected provider account to capability link`,
    linkUpdate.data ?? [],
    linkUpdate.error,
  );
  await evaluateCapabilityActivation(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLink.id,
    trigger: "backend_secret_connected",
  });
  return account;
}
