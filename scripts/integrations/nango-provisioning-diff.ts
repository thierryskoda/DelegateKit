import type { NangoProvisioningEntry } from "@ai-assistants/nango-provisioning";

import { type NangoIntegrationRow } from "./nango-provisioning-client";
import { credentialEnvStatus } from "./nango-provisioning-credentials";

type NangoPlanAction = "create" | "update" | "noop" | "stale";

export type NangoProvisionPlanRow = {
  uniqueKey: string;
  nangoProvider: string;
  displayName: string;
  action: NangoPlanAction;
  reasons: string[];
  credentialEnv: { clientId: boolean; clientSecret: boolean; missingEnvVars: string[] };
};

function isAssistantManagedNangoKey(uniqueKey: string): boolean {
  return uniqueKey.startsWith("ai-assistants-");
}

export function buildNangoProvisionPlan(input: {
  desired: readonly NangoProvisioningEntry[];
  remote: readonly NangoIntegrationRow[];
  env: NodeJS.ProcessEnv;
}): NangoProvisionPlanRow[] {
  const byKey = new Map(input.remote.map((r) => [r.unique_key, r]));
  const desiredKeys = new Set(input.desired.map((entry) => entry.uniqueKey));
  const desiredRows: NangoProvisionPlanRow[] = input.desired.map((entry) => {
    const remote = byKey.get(entry.uniqueKey);
    const cred = credentialEnvStatus(entry, input.env);
    if (!remote) {
      return {
        uniqueKey: entry.uniqueKey,
        nangoProvider: entry.nangoProvider,
        displayName: entry.displayName,
        action: "create",
        reasons: ["Integration missing in this Nango environment."],
        credentialEnv: cred,
      };
    }
    const reasons: string[] = [];
    if (remote.provider !== entry.nangoProvider) {
      reasons.push(
        `Nango provider template differs (remote ${JSON.stringify(remote.provider)} vs manifest ${JSON.stringify(entry.nangoProvider)}).`,
      );
    }
    if (remote.display_name !== entry.displayName) {
      reasons.push("Display name differs from manifest.");
    }
    if (cred.missingEnvVars.length > 0) {
      reasons.push(`OAuth env missing: ${cred.missingEnvVars.join(", ")}`);
    }
    if (cred.clientId && cred.clientSecret) {
      reasons.push(
        "OAuth client env vars are set; apply will PATCH credentials (values are not compared remotely).",
      );
    }
    const needsMetaUpdate =
      remote.provider !== entry.nangoProvider || remote.display_name !== entry.displayName;
    const needsCredentialRefresh = cred.clientId && cred.clientSecret;
    const action: NangoPlanAction = needsMetaUpdate || needsCredentialRefresh ? "update" : "noop";
    return {
      uniqueKey: entry.uniqueKey,
      nangoProvider: entry.nangoProvider,
      displayName: entry.displayName,
      action,
      reasons: action === "noop" ? [] : reasons,
      credentialEnv: cred,
    };
  });
  const staleRows: NangoProvisionPlanRow[] = input.remote
    .filter((row) => isAssistantManagedNangoKey(row.unique_key) && !desiredKeys.has(row.unique_key))
    .map((row) => ({
      uniqueKey: row.unique_key,
      nangoProvider: row.provider,
      displayName: row.display_name,
      action: "stale" as const,
      reasons: [
        "Assistant-managed integration exists in Nango but is not present in the provisioning manifest.",
      ],
      credentialEnv: { clientId: false, clientSecret: false, missingEnvVars: [] },
    }));
  return [...desiredRows, ...staleRows];
}

export function assertNoBlockingNangoProvisioningDrift(input: {
  desired: readonly NangoProvisioningEntry[];
  remote: readonly NangoIntegrationRow[];
}): void {
  const desiredByKey = new Map(input.desired.map((entry) => [entry.uniqueKey, entry]));
  const providerMismatches = input.remote
    .map((row) => {
      const desired = desiredByKey.get(row.unique_key);
      if (!desired || desired.nangoProvider === row.provider) return undefined;
      return `${row.unique_key}: remote provider ${JSON.stringify(row.provider)} vs manifest ${JSON.stringify(desired.nangoProvider)}`;
    })
    .filter((message): message is string => message !== undefined);

  if (providerMismatches.length === 0) return;

  throw new Error(
    [
      "Refusing to apply Nango provisioning because remote assistant-managed integrations do not match the manifest.",
      ...providerMismatches.map((detail) => `- ${detail}`),
      "Review Nango manually, then update the remote integration or adjust the manifest before rerunning apply.",
    ].join("\n"),
  );
}
