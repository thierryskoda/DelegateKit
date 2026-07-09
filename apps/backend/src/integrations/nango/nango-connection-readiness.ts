import {
  evaluateNangoOAuthReadiness,
  nangoProvisioningEntryByUniqueKey,
} from "@ai-assistants/nango-provisioning";
import type {
  CapabilityReadyPrerequisiteCheckInput,
  CapabilityReadyPrerequisiteCheckResult,
} from "@ai-assistants/capability-lifecycle";
import { oauthEvidenceFromConnectedAccount } from "./oauth-connection-evidence";

export async function checkNangoConnectionReady(
  input: CapabilityReadyPrerequisiteCheckInput,
): Promise<CapabilityReadyPrerequisiteCheckResult> {
  if (!input.account) {
    return {
      status: "blocked",
      blockerCode: "credential_required",
      lastError: `Capability account link ${input.link.id} has no connected provider account.`,
    };
  }

  const providerConfigKey = input.account?.nango_provider_config_key?.trim();
  if (!providerConfigKey) {
    return {
      status: "blocked",
      blockerCode: "provider_setup_required",
      lastError: `Capability account link ${input.link.id} has no Nango provider config key.`,
    };
  }

  const connectionId = input.account?.nango_connection_id?.trim();
  if (!connectionId) {
    return {
      status: "blocked",
      blockerCode: "provider_setup_required",
      lastError: `Capability account link ${input.link.id} has no Nango connection id.`,
    };
  }

  const entry = nangoProvisioningEntryByUniqueKey(providerConfigKey);
  if (!entry) {
    return {
      status: "blocked",
      blockerCode: "provider_setup_required",
      lastError: `Nango provider config ${providerConfigKey} is not declared in the provisioning manifest.`,
    };
  }

  const mapping = entry.profileCapabilityMappings.find(
    (m) => m.slug === input.link.capability_slug && m.provider === input.link.provider,
  );
  if (!mapping) {
    return {
      status: "blocked",
      blockerCode: "provider_setup_required",
      lastError: `Nango provider config ${providerConfigKey} has no mapping for ${input.link.capability_slug}/${input.link.provider}.`,
    };
  }

  const oauthEvidence = oauthEvidenceFromConnectedAccount(input.account);
  const readiness = evaluateNangoOAuthReadiness({
    providerConfigKey,
    grantedScopes: oauthEvidence.grantedScopes,
    refreshCapable: oauthEvidence.refreshCapable,
    credentialStatus: oauthEvidence.credentialStatus,
    nangoErrorTypes: oauthEvidence.nangoErrorTypes,
  });
  if (readiness.hasAuthError) {
    return {
      status: "blocked",
      blockerCode: "reconnect_required",
      lastError:
        input.account.last_error?.trim() ||
        `Nango reports auth errors for connected provider account ${input.account.id}. Reconnect the integration.`,
      metadata: {
        providerConfigKey,
        nangoErrorTypes: oauthEvidence.nangoErrorTypes,
        refreshCapable: oauthEvidence.refreshCapable,
      },
    };
  }
  if (readiness.missingRefreshToken) {
    return {
      status: "blocked",
      blockerCode: "reconnect_required",
      lastError: `Connected provider account ${input.account.id} is missing refresh-token capability. Reconnect the integration.`,
      metadata: {
        providerConfigKey,
        missingRefreshToken: true,
        refreshCapable: oauthEvidence.refreshCapable,
      },
    };
  }
  if (readiness.missingGrantedScopes.length > 0) {
    return {
      status: "blocked",
      blockerCode: "reconnect_required",
      lastError: `Connected provider account ${input.account.id} is missing required OAuth scope(s): ${readiness.missingGrantedScopes.join(", ")}. Reconnect the integration.`,
      metadata: {
        providerConfigKey,
        missingOAuthScopes: readiness.missingGrantedScopes,
        refreshCapable: oauthEvidence.refreshCapable,
      },
    };
  }

  return {
    status: "ready",
    metadata: {
      providerConfigKey,
      nangoConnectionChecked: true,
      refreshCapable: oauthEvidence.refreshCapable,
      grantedScopesCount: oauthEvidence.grantedScopes.length,
    },
  };
}
