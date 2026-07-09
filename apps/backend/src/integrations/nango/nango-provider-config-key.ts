import type { TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  isNangoProvisionedUniqueKey,
  nangoProviderConfigKeyForCapabilityProvider,
} from "@ai-assistants/nango-provisioning";
import { configString, capabilityConfig } from "../provider-runtime";

/**
 * Nango "integration unique key" (provider config key) for this capability account link.
 * Prefer explicit link config, then the canonical provisioning manifest.
 */
export function requireNangoProviderConfigKeyForCapabilityLink(
  link: TableRow<"capability_account_links">,
): string {
  const fromConfig = configString(capabilityConfig(link), "nangoProviderConfigKey");
  if (fromConfig) {
    if (!isNangoProvisionedUniqueKey(fromConfig)) {
      throw new DomainError(
        domainCodes.CONFLICT,
        `capability_account_links.config.nangoProviderConfigKey ${JSON.stringify(fromConfig)} is not declared in @ai-assistants/nango-provisioning. Reconnect or migrate the account to a current Nango integration key.`,
      );
    }
    return fromConfig;
  }
  const fromManifest = nangoProviderConfigKeyForCapabilityProvider(
    link.capability_slug,
    link.provider,
  );
  if (fromManifest) return fromManifest;
  throw new DomainError(
    domainCodes.CONFLICT,
    `Missing Nango integration id for ${link.capability_slug} (${link.provider}). Add it to the provisioning manifest or set capability_account_links.config.nangoProviderConfigKey.`,
  );
}

export function requireNangoProviderConfigKeyForCapability(input: {
  capabilitySlug: string;
  provider: string;
  config?: TableRow<"capability_account_links">["config"];
}): string {
  if (input.config) {
    return requireNangoProviderConfigKeyForCapabilityLink({
      capability_slug: input.capabilitySlug,
      provider: input.provider,
      config: input.config,
    } as TableRow<"capability_account_links">);
  }
  const fromManifest = nangoProviderConfigKeyForCapabilityProvider(
    input.capabilitySlug,
    input.provider,
  );
  if (fromManifest) return fromManifest;
  throw new DomainError(
    domainCodes.CONFLICT,
    `Missing Nango integration id for ${input.capabilitySlug} (${input.provider}). Add it to the provisioning manifest or pass capability account link config.`,
  );
}
