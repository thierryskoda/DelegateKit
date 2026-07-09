import { isCapabilityOnlyProvider } from "@ai-assistants/connected-accounts";
import {
  profileCapabilitySlugSchema,
  profileCapabilitySpec,
  requireCapabilityActivationPolicyForSlug,
  type ProfileCapabilitySlug,
} from "@ai-assistants/capability-catalog";
import type {
  ConnectIntegrationAccountDto,
  ConnectIntegrationCapabilityDto,
  ConnectIntegrationGroupDto,
  ConnectIntegrationProviderOptionDto,
  ConnectIntegrationState,
} from "@ai-assistants/connect-api-contracts";
import {
  nangoProviderConfigKeyForCapabilityProvider,
  nangoProvisioningEntryByUniqueKey,
} from "@ai-assistants/nango-provisioning";
import { backendApiEnv } from "../../shared/env";
import type { capabilityOverviewForProfile } from "./profile-capability-overview";

type CapabilityOverview = Awaited<ReturnType<typeof capabilityOverviewForProfile>>;
type CapabilityItem = CapabilityOverview["capabilities"][number];

const PROVIDER_CONNECT_LABELS = {
  gmail: "Gmail",
  outlook: "Outlook",
  "outlook-mail": "Outlook Mail",
  "google-calendar": "Google Calendar",
  "outlook-calendar": "Outlook Calendar",
  "google-drive": "Google Drive",
  google: "Google",
  "microsoft-onedrive": "OneDrive",
  "microsoft-sharepoint": "SharePoint",
  "microsoft-todo": "Microsoft To Do",
  monday: "Monday",
  boldsign: "BoldSign",
} as const satisfies Partial<Record<string, string>>;

function preConnectInstallUrl(provider: string): string | null {
  if (provider !== "monday") return null;
  const clientId = backendApiEnv().mondayOauthClientId;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "install",
  });
  return `https://auth.monday.com/oauth2/authorize?${params.toString()}`;
}

function providerConnectLabel(provider: string): string {
  const known = PROVIDER_CONNECT_LABELS[provider as keyof typeof PROVIDER_CONNECT_LABELS];
  if (known) return known;
  return provider
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isHealthyConnectedAccount(
  account: CapabilityItem["connectedAccount"],
): account is NonNullable<CapabilityItem["connectedAccount"]> {
  return (
    account !== null &&
    account.connection_status === "connected" &&
    account.credential_status === "healthy"
  );
}

function latestOauthFailureMessage(capability: CapabilityItem): string | null {
  const account = capability.connectedAccount;
  if (
    account &&
    account.connection_status === "failed" &&
    typeof account.last_error === "string" &&
    account.last_error.trim()
  ) {
    return account.last_error.trim();
  }
  return null;
}

function blockerState(blockerCode: string | null | undefined): {
  state: ConnectIntegrationState;
  statusLabel: string;
} {
  switch (blockerCode) {
    case "credential_required":
      return { state: "not_connected", statusLabel: "Not connected" };
    case "reconnect_required":
    case "ambiguous_account":
      return { state: "needs_attention", statusLabel: "Needs reconnect" };
    case "monday_activation_metadata_incomplete":
      return { state: "setup_blocked", statusLabel: "Not available yet" };
    default:
      return { state: "setup_blocked", statusLabel: "Not available yet" };
  }
}

function integrationState(capability: CapabilityItem): {
  state: ConnectIntegrationState;
  statusLabel: string;
} {
  const connected = isHealthyConnectedAccount(capability.connectedAccount);
  const hasConnectedAccount = capability.connectedAccount !== null;
  const failureMessage = latestOauthFailureMessage(capability);
  const readiness = capability.readiness;

  if (readiness?.status === "ready") {
    return capability.credentialMode === "backend_secret"
      ? { state: "connected", statusLabel: "Handled for you" }
      : { state: "connected", statusLabel: "Connected" };
  }
  if (readiness?.status === "blocked") return blockerState(readiness.blockerCode);
  if (readiness?.status === "queued" || readiness?.status === "running") {
    if (connected) return { state: "connected", statusLabel: "Setting up" };
    return { state: "syncing", statusLabel: "Checking" };
  }
  if (readiness?.status === "error") {
    if (connected) return { state: "connected", statusLabel: "Setup failed" };
    return { state: "needs_attention", statusLabel: "Needs reconnect" };
  }
  if (readiness?.status === "not_connected") {
    return { state: "not_connected", statusLabel: "Not connected" };
  }

  if (capability.credentialMode === "backend_secret") {
    if (connected) return { state: "connected", statusLabel: "Handled for you" };
    if (hasConnectedAccount) return { state: "needs_attention", statusLabel: "Needs reconnect" };
    return { state: "setup_blocked", statusLabel: "Handled for you" };
  }
  if (connected) {
    return { state: "connected", statusLabel: "Connected" };
  }
  if (hasConnectedAccount || (failureMessage && capability.oauthConnectable)) {
    return { state: "needs_attention", statusLabel: "Needs reconnect" };
  }
  if (!capability.oauthConnectable) {
    return { state: "setup_blocked", statusLabel: "Not available yet" };
  }
  return { state: "not_connected", statusLabel: "Not connected" };
}

function cleanSlotLabel(label: string): string {
  const index = label.indexOf("account-slot-defaults-");
  const withoutGeneratedSuffix = index !== -1 ? label.slice(0, index).trim() : label.trim();
  return withoutGeneratedSuffix
    .replace(/\s+connected-accounts-roundtrip-[a-f0-9]{12,}$/iu, "")
    .replace(/\s+[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu, "")
    .replace(/\s+[a-f0-9]{16,}$/iu, "")
    .trim();
}

function integrationDisplayLabel(
  capability: CapabilityItem,
  slotLabel: string,
): {
  displayLabel: string;
  connectedAccountEmail: string | null;
} {
  const account = capability.connectedAccount;
  const connectedAccountEmail = account?.account_email?.trim() || null;
  const connectedAccountLabel = connectedAccountEmail || account?.display_label?.trim() || null;

  if (connectedAccountLabel) {
    return {
      displayLabel: cleanSlotLabel(connectedAccountLabel) || slotLabel,
      connectedAccountEmail,
    };
  }

  return {
    displayLabel: slotLabel,
    connectedAccountEmail: null,
  };
}

export function connectIntegrationAccountPayload(
  capability: CapabilityItem,
): ConnectIntegrationAccountDto {
  const state = integrationState(capability);
  const linkLabel = cleanSlotLabel(capability.label);
  const display = integrationDisplayLabel(capability, linkLabel);
  const spec = profileCapabilitySpec(capability.capability_slug);
  if (!spec) throw new Error(`Missing profile capability spec for ${capability.capability_slug}.`);

  return {
    id: capability.id,
    capabilityAccountLinkId: capability.id,
    connectedAccountId: capability.connected_provider_account_id,
    linkLabel,
    displayLabel: display.displayLabel,
    connectedAccountEmail: display.connectedAccountEmail,
    state: state.state,
    statusLabel: state.statusLabel,
    connectable: capability.oauthConnectable,
    disconnectable:
      capability.disconnectable || isHealthyConnectedAccount(capability.connectedAccount),
    preConnectInstallUrl: preConnectInstallUrl(capability.provider),
    capabilities: [
      {
        capabilityAccountLinkId: capability.id,
        capabilitySlug: capability.capability_slug,
        capabilityLabel: conciseCapabilityLabel(capability.capability_slug, spec.label),
        state: state.state,
        statusLabel: state.statusLabel,
      },
    ],
  };
}

function isConnectUiProvider(provider: string): provider is keyof typeof PROVIDER_CONNECT_LABELS {
  return provider in PROVIDER_CONNECT_LABELS;
}

function connectableProvidersForCapability(
  capabilitySlug: string,
): ConnectIntegrationProviderOptionDto[] {
  const policy = requireCapabilityActivationPolicyForSlug(capabilitySlug);
  if (policy.credentialMode !== "oauth") return [];
  return policy.providers
    .filter((provider) => !isCapabilityOnlyProvider(provider))
    .filter(isConnectUiProvider)
    .filter(
      (provider) =>
        nangoProviderConfigKeyForCapabilityProvider(capabilitySlug, provider) !== undefined,
    )
    .map((provider) => ({
      capabilitySlug,
      provider,
      providerLabel: providerConnectLabel(provider),
      preConnectInstallUrl: preConnectInstallUrl(provider),
    }));
}

function providerConfigKeyForCapability(capability: CapabilityItem): string | null {
  return (
    nangoProviderConfigKeyForCapabilityProvider(capability.capability_slug, capability.provider) ??
    null
  );
}

function sharedProviderConfigKey(providerConfigKey: string | null): boolean {
  if (!providerConfigKey) return false;
  return Boolean(nangoProvisioningEntryByUniqueKey(providerConfigKey)?.sharedAccount);
}

function groupProviderForConfigKey(providerConfigKey: string | null, fallbackProvider: string) {
  const entry = providerConfigKey ? nangoProvisioningEntryByUniqueKey(providerConfigKey) : null;
  return entry?.sharedAccount?.provider ?? entry?.profileCapabilityMappings[0]?.provider ?? fallbackProvider;
}

function groupKeyForCapability(capability: CapabilityItem): string {
  const providerConfigKey = providerConfigKeyForCapability(capability);
  return providerConfigKey ? `nango:${providerConfigKey}` : `provider:${capability.provider}`;
}

function groupKeyForSlugProvider(capabilitySlug: string, provider: string): string {
  const providerConfigKey = nangoProviderConfigKeyForCapabilityProvider(capabilitySlug, provider);
  return providerConfigKey ? `nango:${providerConfigKey}` : `provider:${provider}`;
}

function accountKeyForCapability(capability: CapabilityItem): string {
  const providerConfigKey = providerConfigKeyForCapability(capability);
  const groupKey = groupKeyForCapability(capability);
  const connectedAccountId = capability.connected_provider_account_id?.trim();
  if (connectedAccountId) return `${groupKey}:connected:${connectedAccountId}`;
  if (sharedProviderConfigKey(providerConfigKey)) return `${groupKey}:pending`;
  return `${groupKey}:link:${capability.id}`;
}

function conciseCapabilityLabel(capabilitySlug: string, fallbackLabel: string): string {
  const slug = profileCapabilitySlugSchema.parse(capabilitySlug);
  const providerConfigKey = providerConfigKeyForSlug(slug);
  const entry = providerConfigKey ? nangoProvisioningEntryByUniqueKey(providerConfigKey) : null;
  const label = entry?.sharedAccount?.capabilityLabels[slug];
  if (label) return label;
  return fallbackLabel;
}

function capabilitySortRank(capabilitySlug: string): number {
  const slug = profileCapabilitySlugSchema.parse(capabilitySlug);
  const providerConfigKey = providerConfigKeyForSlug(slug);
  const order = providerConfigKey
    ? nangoProvisioningEntryByUniqueKey(providerConfigKey)?.sharedAccount?.capabilitySortOrder
    : undefined;
  const index = order?.indexOf(slug);
  if (index !== undefined && index >= 0) {
    return index;
  }
  return 10;
}

function providerConfigKeyForSlug(capabilitySlug: ProfileCapabilitySlug): string | null {
  const policy = requireCapabilityActivationPolicyForSlug(capabilitySlug);
  if (policy.credentialMode !== "oauth") return null;
  for (const provider of policy.providers) {
    const key = nangoProviderConfigKeyForCapabilityProvider(capabilitySlug, provider);
    if (key) return key;
  }
  return null;
}

function sortedCapabilities<T extends { capabilitySlug: string }>(capabilities: readonly T[]): T[] {
  return [...capabilities].sort((a, b) => {
    const rank = capabilitySortRank(a.capabilitySlug) - capabilitySortRank(b.capabilitySlug);
    if (rank !== 0) return rank;
    return a.capabilitySlug.localeCompare(b.capabilitySlug);
  });
}

function joinCapabilityLabels(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
}

function sharedGroupLabel(input: { providerConfigKey: string; capabilitySlugs: readonly string[] }): string {
  const entry = nangoProvisioningEntryByUniqueKey(input.providerConfigKey);
  const sharedAccount = entry?.sharedAccount;
  if (!sharedAccount) return "";
  const labels = sortedCapabilities(
    [...new Set(input.capabilitySlugs)].map((capabilitySlug) => ({
      capabilitySlug,
      label:
        sharedAccount.capabilityLabels[profileCapabilitySlugSchema.parse(capabilitySlug)] ??
        conciseCapabilityLabel(capabilitySlug, providerConnectLabel(capabilitySlug)),
    })),
  ).map((item) => item.label);
  const suffix = joinCapabilityLabels(labels);
  return suffix ? `${sharedAccount.label} ${suffix}` : sharedAccount.label;
}

function statePriority(state: ConnectIntegrationState): number {
  switch (state) {
    case "needs_attention":
      return 0;
    case "not_connected":
      return 1;
    case "syncing":
      return 2;
    case "setup_blocked":
      return 3;
    case "connected":
      return 4;
  }
}

function primaryCapability(capabilities: readonly CapabilityItem[]): CapabilityItem {
  const sorted = [...capabilities].sort((a, b) => {
    const priority =
      statePriority(integrationState(a).state) - statePriority(integrationState(b).state);
    if (priority !== 0) return priority;
    return a.id.localeCompare(b.id);
  });
  const primary = sorted[0];
  if (!primary) throw new Error("Integration account group must include at least one capability.");
  return primary;
}

function groupedCapabilitiesPayload(
  capabilities: readonly CapabilityItem[],
): ConnectIntegrationCapabilityDto[] {
  return sortedCapabilities(
    capabilities.map((capability) => {
      const spec = profileCapabilitySpec(capability.capability_slug);
      if (!spec) {
        throw new Error(`Missing profile capability spec for ${capability.capability_slug}.`);
      }
      const state = integrationState(capability);
      return {
        capabilityAccountLinkId: capability.id,
        capabilitySlug: capability.capability_slug,
        capabilityLabel: conciseCapabilityLabel(capability.capability_slug, spec.label),
        state: state.state,
        statusLabel: state.statusLabel,
      } satisfies ConnectIntegrationCapabilityDto;
    }),
  );
}

function groupedAccountPayload(
  accountKey: string,
  capabilities: readonly CapabilityItem[],
): ConnectIntegrationAccountDto {
  const primary = primaryCapability(capabilities);
  const state = integrationState(primary);
  const providerConfigKey = providerConfigKeyForCapability(primary);
  const sharedPendingGroup =
    sharedProviderConfigKey(providerConfigKey) && !primary.connected_provider_account_id;
  const sharedGroupLabel = groupLabelForCapabilities({
    providerConfigKey,
    provider: groupProviderForConfigKey(providerConfigKey, primary.provider),
    capabilitySlugs: capabilities.map((capability) => capability.capability_slug),
  });
  const linkLabel = sharedPendingGroup ? sharedGroupLabel : cleanSlotLabel(primary.label);
  const display = sharedPendingGroup
    ? { displayLabel: sharedGroupLabel, connectedAccountEmail: null }
    : integrationDisplayLabel(primary, linkLabel);

  return {
    id: accountKey,
    capabilityAccountLinkId: primary.id,
    connectedAccountId: primary.connected_provider_account_id,
    linkLabel,
    displayLabel: display.displayLabel,
    connectedAccountEmail: display.connectedAccountEmail,
    state: state.state,
    statusLabel: state.statusLabel,
    connectable: capabilities.some((capability) => capability.oauthConnectable),
    disconnectable:
      capabilities.some((capability) => capability.disconnectable) ||
      capabilities.some((capability) => isHealthyConnectedAccount(capability.connectedAccount)),
    preConnectInstallUrl: preConnectInstallUrl(primary.provider),
    capabilities: groupedCapabilitiesPayload(capabilities),
  };
}

function shouldHideSharedPendingAccount(input: {
  accountKey: string;
  capabilities: readonly CapabilityItem[];
  hasConnectedSharedAccount: boolean;
}): boolean {
  if (!input.hasConnectedSharedAccount) return false;
  if (!input.accountKey.endsWith(":pending")) return false;
  return input.capabilities.every(
    (capability) => integrationState(capability).state === "not_connected",
  );
}

function groupLabelForCapabilities(input: {
  providerConfigKey: string | null;
  provider: string;
  capabilitySlugs: readonly string[];
}): string {
  if (input.providerConfigKey) {
    const label = sharedGroupLabel({
      providerConfigKey: input.providerConfigKey,
      capabilitySlugs: input.capabilitySlugs,
    });
    if (label) return label;
  }
  return providerConnectLabel(input.provider);
}

function addAccountProviderForGroup(
  capabilities: readonly CapabilityItem[],
): ConnectIntegrationProviderOptionDto | null {
  const enabledCapabilitySlugs = [
    ...new Set(capabilities.map((capability) => capability.capability_slug)),
  ].sort((a, b) => {
    const rank = capabilitySortRank(a) - capabilitySortRank(b);
    if (rank !== 0) return rank;
    return a.localeCompare(b);
  });
  for (const capabilitySlug of enabledCapabilitySlugs) {
    const option = connectableProvidersForCapability(capabilitySlug)[0];
    if (option) return option;
  }
  return null;
}

function enabledCapabilitySlugsForGroup(
  sortedEnabledSlugs: readonly string[],
  groupKey: string,
): string[] {
  return sortedEnabledSlugs.filter((slug) => {
    const option = connectableProvidersForCapability(slug)[0] ?? null;
    return option ? groupKeyForSlugProvider(slug, option.provider) === groupKey : false;
  });
}

export function connectIntegrationGroupsPayload(
  overview: CapabilityOverview,
): ConnectIntegrationGroupDto[] {
  const capabilitiesByGroup = new Map<string, CapabilityItem[]>();

  for (const capability of overview.capabilities) {
    const groupKey = groupKeyForCapability(capability);
    const capabilities = capabilitiesByGroup.get(groupKey) ?? [];
    capabilities.push(capability);
    capabilitiesByGroup.set(groupKey, capabilities);
  }

  const enabledSlugs = new Set(overview.enabledCapabilitySlugs);
  const emptyGroups = new Map<string, ConnectIntegrationGroupDto>();

  const sortedEnabledSlugs = [...enabledSlugs].sort((a, b) => {
    const rank = capabilitySortRank(a) - capabilitySortRank(b);
    if (rank !== 0) return rank;
    return a.localeCompare(b);
  });

  for (const slug of sortedEnabledSlugs) {
    const spec = profileCapabilitySpec(slug);
    if (!spec) throw new Error(`Missing profile capability spec for ${slug}.`);
    const option = connectableProvidersForCapability(slug)[0] ?? null;
    if (!option) continue;
    const groupKey = groupKeyForSlugProvider(slug, option.provider);
    if (capabilitiesByGroup.has(groupKey) || emptyGroups.has(groupKey)) continue;
    const providerConfigKey =
      nangoProviderConfigKeyForCapabilityProvider(slug, option.provider) ?? null;
    const provider = groupProviderForConfigKey(providerConfigKey, option.provider);
    const capabilitySlugs = enabledCapabilitySlugsForGroup(sortedEnabledSlugs, groupKey);
    emptyGroups.set(groupKey, {
      groupKey,
      groupLabel: groupLabelForCapabilities({
        providerConfigKey,
        provider,
        capabilitySlugs,
      }),
      provider,
      providerLabel: providerConnectLabel(provider),
      providerConfigKey,
      addAccountProvider: option,
      accounts: [],
    } satisfies ConnectIntegrationGroupDto);
  }

  return [
    ...emptyGroups.values(),
    ...[...capabilitiesByGroup.entries()].map(([groupKey, capabilities]) => {
      const first = capabilities[0];
      if (!first) throw new Error(`Integration group ${groupKey} has no capabilities.`);
      const providerConfigKey = providerConfigKeyForCapability(first);
      const provider = groupProviderForConfigKey(providerConfigKey, first.provider);
      const accountsByKey = new Map<string, CapabilityItem[]>();

      for (const capability of capabilities) {
        if (!enabledSlugs.has(capability.capability_slug)) continue;
        const accountKey = accountKeyForCapability(capability);
        const accountCapabilities = accountsByKey.get(accountKey) ?? [];
        accountCapabilities.push(capability);
        accountsByKey.set(accountKey, accountCapabilities);
      }
      const hasConnectedSharedAccount =
        sharedProviderConfigKey(providerConfigKey) &&
        [...accountsByKey.keys()].some((accountKey) => accountKey.includes(":connected:"));

      return {
        groupKey,
        groupLabel: groupLabelForCapabilities({
          providerConfigKey,
          provider,
          capabilitySlugs: capabilities
            .filter((capability) => enabledSlugs.has(capability.capability_slug))
            .map((capability) => capability.capability_slug),
        }),
        provider,
        providerLabel: providerConnectLabel(provider),
        providerConfigKey,
        addAccountProvider: addAccountProviderForGroup(capabilities),
        accounts: [...accountsByKey.entries()]
          .filter(
            ([accountKey, accountCapabilities]) =>
              !shouldHideSharedPendingAccount({
                accountKey,
                capabilities: accountCapabilities,
                hasConnectedSharedAccount,
              }),
          )
          .map(([accountKey, accountCapabilities]) =>
            groupedAccountPayload(accountKey, accountCapabilities),
          )
          .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel)),
      } satisfies ConnectIntegrationGroupDto;
    }),
  ].sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
}
