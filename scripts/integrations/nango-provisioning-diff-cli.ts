#!/usr/bin/env tsx

import { NANGO_PROVISIONING_ENTRIES } from "@ai-assistants/nango-provisioning";
import { parseOutputFormat } from "@ai-assistants/workspace-shared";

import { nangoListIntegrations } from "./nango-provisioning-client";
import { buildNangoProvisionPlan } from "./nango-provisioning-diff";
import {
  nangoApiBaseUrl,
  parseRuntimeProfileArg,
  resolveNangoSecretKey,
} from "./nango-provisioning-runtime";
import { envForProfile } from "../profiles/profile";

export async function runNangoProvisioningDiff(argv = process.argv.slice(2)): Promise<void> {
  const profile = parseRuntimeProfileArg(argv);
  const formatArg = argv.find((arg) => arg.startsWith("--format="))?.slice("--format=".length);
  const format = parseOutputFormat(formatArg, "markdown");
  const json = format === "json";
  const effectiveEnv = envForProfile(profile);
  const baseUrl = nangoApiBaseUrl(effectiveEnv);
  const secret = resolveNangoSecretKey(profile, effectiveEnv);
  const remote = await nangoListIntegrations({ baseUrl, secretKey: secret });
  const diff = buildNangoProvisionPlan({
    desired: NANGO_PROVISIONING_ENTRIES,
    remote,
    env: effectiveEnv,
  });

  if (json) {
    console.log(JSON.stringify({ profile, baseUrl, diff, ok: true }, null, 2));
    return;
  }

  for (const row of diff) {
    const credOk = row.credentialEnv.clientId && row.credentialEnv.clientSecret;
    const oauthLine = credOk
      ? "clientId+secret present"
      : row.credentialEnv.missingEnvVars.length
        ? `missing env: ${row.credentialEnv.missingEnvVars.join(", ")}`
        : "missing (set env vars listed in docs / manifest)";
    const lines = [
      `${row.action.toUpperCase().padEnd(6)} ${row.uniqueKey}`,
      `  nangoProvider=${row.nangoProvider} displayName=${row.displayName}`,
      `  oauthEnv=${oauthLine}`,
    ];
    for (const r of row.reasons) lines.push(`  - ${r}`);
    console.log(lines.join("\n"));
  }
}

if (process.argv[1]?.endsWith("nango-provisioning-diff-cli.ts")) {
  runNangoProvisioningDiff().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
