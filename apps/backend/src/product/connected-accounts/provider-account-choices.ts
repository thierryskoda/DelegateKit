import { requireSupabaseRows, type SupabaseServiceClient } from "@ai-assistants/control-db";

type ProviderAccountChoice = {
  connectedAccountId: string;
  provider: string;
  label: string | null;
  connected: boolean;
  credentialStatus: string | null;
  accountEmail: string | null;
  ready: boolean;
};

function trimmed(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function accountCredentialStatus(input: {
  accountCredentialStatus: string | null | undefined;
  linkReadinessStatus: string | null | undefined;
  linkReadinessBlockerCode: string | null | undefined;
}): string | null {
  if (input.linkReadinessStatus && input.linkReadinessStatus !== "ready") {
    return trimmed(input.linkReadinessBlockerCode) ?? input.linkReadinessStatus;
  }
  return input.accountCredentialStatus ?? null;
}

export async function listProviderAccountChoices(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilitySlug: string;
    provider?: string;
    label: string;
  },
): Promise<ProviderAccountChoice[]> {
  let query = db
    .from("capability_account_links")
    .select(
      "id, provider, label, status, connected_provider_account_id, readiness_status, readiness_blocker_code",
    )
    .eq("profile_id", input.profileId)
    .eq("capability_slug", input.capabilitySlug)
    .eq("status", "enabled");
  if (input.provider) query = query.eq("provider", input.provider);

  const instRes = await query;
  const instances = requireSupabaseRows(input.label, instRes.data, instRes.error);
  const accounts: ProviderAccountChoice[] = [];

  for (const inst of instances) {
    const connectedProviderAccountId = inst.connected_provider_account_id;
    if (!connectedProviderAccountId) continue;

    const accountResult = await db
      .from("connected_provider_accounts")
      .select(
        "credential_status, account_email, display_label, nango_provider_config_key, nango_connection_id, connection_status",
      )
      .eq("id", connectedProviderAccountId)
      .maybeSingle();
    if (accountResult.error) throw accountResult.error;
    const account = accountResult.data ?? null;
    const accountEmail = trimmed(account?.account_email);
    const hasHealthyConnectedAccount =
      account?.connection_status === "connected" &&
      account.credential_status === "healthy" &&
      Boolean(
        trimmed(account.nango_provider_config_key) && trimmed(account.nango_connection_id),
      );
    const linkReady = inst.readiness_status === "ready";

    accounts.push({
      connectedAccountId: connectedProviderAccountId,
      provider: inst.provider,
      label: accountEmail ?? trimmed(account?.display_label) ?? trimmed(inst.label),
      connected: Boolean(account),
      credentialStatus: accountCredentialStatus({
        accountCredentialStatus: account?.credential_status,
        linkReadinessStatus: inst.readiness_status,
        linkReadinessBlockerCode: inst.readiness_blocker_code,
      }),
      accountEmail,
      ready: hasHealthyConnectedAccount && linkReady,
    });
  }

  return accounts;
}
