import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NANGO_PROVISIONING_ENTRIES } from "@ai-assistants/nango-provisioning";
import { z } from "zod";

const BASELINE_REL_PATH =
  "scripts/repo-tooling/guards/deterministic/nango-oauth-projection-baseline.json";

type OAuthProjectionBaselineEntry = {
  providerConfigKey: string;
  requestedScopes: string[];
  requiredGrantedScopes: string[];
  requiresRefreshToken: boolean;
  mappings: { slug: string; provider: string }[];
};

const oauthProjectionBaselineEntrySchema = z
  .object({
    providerConfigKey: z.string().trim().min(1),
    requestedScopes: z.array(z.string().trim().min(1)),
    requiredGrantedScopes: z.array(z.string().trim().min(1)),
    requiresRefreshToken: z.boolean(),
    mappings: z.array(
      z.object({ slug: z.string().trim().min(1), provider: z.string().trim().min(1) }).strict(),
    ),
  })
  .strict() satisfies z.ZodType<OAuthProjectionBaselineEntry>;

const oauthProjectionBaselineSchema = z.array(oauthProjectionBaselineEntrySchema);

function scopeTokens(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function nangoOAuthProjectionBaselinePath(root: string): string {
  return path.join(root, BASELINE_REL_PATH);
}

function renderNangoOAuthProjectionBaseline(): string {
  const entries: OAuthProjectionBaselineEntry[] = NANGO_PROVISIONING_ENTRIES.map((entry) => ({
    providerConfigKey: entry.uniqueKey,
    requestedScopes: scopeTokens(entry.credentials.scopes),
    requiredGrantedScopes: [...entry.readiness.requiredGrantedScopes].sort((a, b) =>
      a.localeCompare(b),
    ),
    requiresRefreshToken: entry.readiness.requiresRefreshToken,
    mappings: [...entry.profileCapabilityMappings].sort((a, b) =>
      `${a.slug}:${a.provider}`.localeCompare(`${b.slug}:${b.provider}`),
    ),
  })).sort((a, b) => a.providerConfigKey.localeCompare(b.providerConfigKey));
  return `${JSON.stringify(entries, null, 2)}\n`;
}

function changedProviderConfigKeys(actual: string, expected: string): string[] {
  const actualEntries = oauthProjectionBaselineSchema.parse(JSON.parse(actual));
  const expectedEntries = oauthProjectionBaselineSchema.parse(JSON.parse(expected));
  const actualByKey = new Map(actualEntries.map((entry) => [entry.providerConfigKey, entry]));
  const expectedByKey = new Map(expectedEntries.map((entry) => [entry.providerConfigKey, entry]));
  return [...new Set([...actualByKey.keys(), ...expectedByKey.keys()])]
    .filter(
      (key) =>
        JSON.stringify(actualByKey.get(key) ?? null) !==
        JSON.stringify(expectedByKey.get(key) ?? null),
    )
    .sort();
}

export function assertNangoOAuthProjectionBaselineCurrent(root: string): void {
  const baselinePath = nangoOAuthProjectionBaselinePath(root);
  if (!existsSync(baselinePath)) {
    throw new Error(
      `${path.relative(root, baselinePath)} is missing. Run npm run integrations -- nango oauth-baseline update.`,
    );
  }
  const actual = readFileSync(baselinePath, "utf8");
  const expected = renderNangoOAuthProjectionBaseline();
  if (actual === expected) return;

  const changedKeys = changedProviderConfigKeys(actual, expected);
  const scopedChecks = changedKeys.map(
    (key) =>
      `npm run integrations -- nango oauth-projection check --profile=prod --all-profiles --provider-config-key=${key}`,
  );
  throw new Error(
    [
      `${path.relative(root, baselinePath)} is stale relative to packages/nango-provisioning/src/manifest.ts.`,
      "",
      "Nango OAuth mappings/scopes changed. Existing connected accounts may not have newly required consent, so run scoped prod oauth-projection checks for affected client profiles before updating this baseline.",
      "",
      "Affected provider config key(s):",
      ...changedKeys.map((key) => `- ${key}`),
      "",
      "Suggested checks:",
      ...scopedChecks.map((command) => `- ${command}`),
      "",
      "After review/backfill, refresh the committed baseline with:",
      "- npm run integrations -- nango oauth-baseline update",
    ].join("\n"),
  );
}

export async function writeNangoOAuthProjectionBaseline(root: string): Promise<void> {
  await writeFile(nangoOAuthProjectionBaselinePath(root), renderNangoOAuthProjectionBaseline());
}
