#!/usr/bin/env tsx

import { NANGO_PROVISIONING_ENTRIES } from "@ai-assistants/nango-provisioning";
import { requiresProdConfirmation } from "@ai-assistants/repo-layout";

import {
  nangoCreateIntegration,
  nangoListIntegrations,
  nangoPatchIntegration,
} from "./nango-provisioning-client";
import {
  buildOAuthCredentialsPayload,
  credentialEnvStatus,
} from "./nango-provisioning-credentials";
import {
  assertNoBlockingNangoProvisioningDrift,
} from "./nango-provisioning-diff";
import {
  nangoApiBaseUrl,
  parseRuntimeProfileArg,
  resolveNangoSecretKey,
} from "./nango-provisioning-runtime";
import { envForProfile } from "../profiles/profile";

export async function runNangoProvisioningApply(argv = process.argv.slice(2)): Promise<void> {
  const profile = parseRuntimeProfileArg(argv);
  if (requiresProdConfirmation(profile) && !argv.includes("--confirm-prod")) {
    throw new Error(
      `Refusing ${profile} apply without --confirm-prod. Run \`npm run integrations -- nango diff --profile=${profile}\`, review output, then re-run apply with --confirm-prod.`,
    );
  }
  const effectiveEnv = envForProfile(profile);
  const baseUrl = nangoApiBaseUrl(effectiveEnv);
  const secret = resolveNangoSecretKey(profile, effectiveEnv);
  const remote = await nangoListIntegrations({ baseUrl, secretKey: secret });
  assertNoBlockingNangoProvisioningDrift({ desired: NANGO_PROVISIONING_ENTRIES, remote });
  const byKey = new Map(remote.map((r) => [r.unique_key, r]));

  for (const entry of NANGO_PROVISIONING_ENTRIES) {
    const existing = byKey.get(entry.uniqueKey);
    const cred = credentialEnvStatus(entry, effectiveEnv);
    if (!existing && cred.missingEnvVars.length > 0) {
      throw new Error(
        `Refusing to create ${entry.uniqueKey} without OAuth credentials. Missing env: ${cred.missingEnvVars.join(", ")}.`,
      );
    }
  }

  for (const entry of NANGO_PROVISIONING_ENTRIES) {
    const existing = byKey.get(entry.uniqueKey);
    if (!existing) {
      const credentials = buildOAuthCredentialsPayload(entry, effectiveEnv);
      await nangoCreateIntegration({
        baseUrl,
        secretKey: secret,
        body: {
          unique_key: entry.uniqueKey,
          provider: entry.nangoProvider,
          display_name: entry.displayName,
          credentials,
        },
      });
      console.log(`CREATE  ${entry.uniqueKey} (${entry.nangoProvider})`);
      continue;
    }
    if (existing.provider !== entry.nangoProvider) {
      throw new Error(
        `${entry.uniqueKey}: Nango has provider ${JSON.stringify(existing.provider)} but manifest expects ${JSON.stringify(entry.nangoProvider)}. Delete the integration in Nango or adjust the manifest.`,
      );
    }
    const cred = credentialEnvStatus(entry, effectiveEnv);
    const patchBody: {
      display_name?: string;
      credentials?: ReturnType<typeof buildOAuthCredentialsPayload>;
    } = {};
    if (existing.display_name !== entry.displayName) {
      patchBody.display_name = entry.displayName;
    }
    if (cred.clientId && cred.clientSecret) {
      patchBody.credentials = buildOAuthCredentialsPayload(entry, effectiveEnv);
    }
    if (Object.keys(patchBody).length === 0) {
      console.log(`NOOP    ${entry.uniqueKey}`);
      continue;
    }
    await nangoPatchIntegration({
      baseUrl,
      secretKey: secret,
      uniqueKey: entry.uniqueKey,
      body: patchBody,
    });
    console.log(`UPDATE  ${entry.uniqueKey} (${Object.keys(patchBody).join(", ")})`);
  }
}

if (process.argv[1]?.endsWith("nango-provisioning-apply.ts")) {
  runNangoProvisioningApply().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
