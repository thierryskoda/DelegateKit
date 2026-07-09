import { readFileSync } from "node:fs";
import path from "node:path";

export function assertNangoSyncInventoryPreservesMultipleProviderAccounts(root: string): void {
  const relativePath = "scripts/integrations/nango-sync-inventory.ts";
  const text = readFileSync(path.join(root, relativePath), "utf8");
  const syncCliPath = "scripts/integrations/nango-sync.ts";
  const syncCliText = readFileSync(path.join(root, syncCliPath), "utf8");
  const failures: string[] = [];

  if (text.includes("byProviderConfigKey")) {
    failures.push(
      `${relativePath} must not collapse Supabase connected accounts into a single connection per Nango provider config key.`,
    );
  }
  if (text.includes("pickCanonicalConnectionId")) {
    failures.push(
      `${relativePath} must not pick one canonical Nango connection from a provider-config group; multiple different accounts can share a provider config.`,
    );
  }
  if (text.includes("item.profileId}\\0${item.providerConfigKey")) {
    failures.push(
      `${relativePath} must not group cleanup candidates by only profile id and provider config key.`,
    );
  }
  if (text.includes("failOnMissingRemoteReferences")) {
    failures.push(
      `${relativePath} must always report Supabase rows that reference missing remote Nango connections.`,
    );
  }
  if (syncCliText.includes("deleteActions") || syncCliText.includes("deleteNangoConnection")) {
    failures.push(
      `${syncCliPath} must not delete remote Nango connections during sync; report drift for explicit review instead.`,
    );
  }

  if (failures.length > 0) throw new Error(failures.join("\n"));
}
