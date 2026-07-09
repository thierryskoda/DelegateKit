import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { z } from "zod";
import { envForProfile } from "../profiles/profile";

const NANGO_CLOUD_API = "https://api.nango.dev";

/** Nango Cloud / CLI secret keys are UUIDs (dashboard “Secret Key”). */
const nangoSecretKeySchema = z
  .string()
  .trim()
  .min(1)
  .uuid(
    "Nango secret key must be a UUID (use the Secret Key from the Nango dashboard for this environment).",
  );

/** Fail fast when a resolved Nango secret is missing or not shaped like a dashboard secret key. */
function assertValidNangoSecretKeyFormat(key: string): string {
  return nangoSecretKeySchema.parse(key);
}

function resolveNangoSecretKeyFromMerged(
  profile: RuntimeProfile,
  merged: NodeJS.ProcessEnv,
): string {
  const key = merged.NANGO_SECRET_KEY?.trim() ?? "";
  if (!key) {
    throw new Error(
      `Missing NANGO_SECRET_KEY for profile ${profile}. Set NANGO_SECRET_KEY in the profile env file (see repo-layout profile paths).`,
    );
  }
  return key;
}

/**
 * Process env for the official `nango` CLI (`deploy`, etc.).
 *
 * Reads only `NANGO_SECRET_KEY` from merged env (after `envForProfile`), validates with Zod, then sets that on the child env.
 */
/** Nango Cloud API base (provisioning scripts always target this host). */
export function nangoApiBaseUrl(_env: NodeJS.ProcessEnv): string {
  return NANGO_CLOUD_API;
}

export function resolveNangoSecretKey(profile: RuntimeProfile, env: NodeJS.ProcessEnv): string {
  return assertValidNangoSecretKeyFormat(resolveNangoSecretKeyFromMerged(profile, envForProfile(profile, env)));
}

export function nangoCliChildEnv(
  profile: RuntimeProfile,
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const childEnv = { ...env };
  const merged = envForProfile(profile, env);
  childEnv.NANGO_SECRET_KEY = assertValidNangoSecretKeyFormat(
    resolveNangoSecretKeyFromMerged(profile, merged),
  );
  delete childEnv.NANGO_SECRET_KEY_DEV;
  delete childEnv.NANGO_SECRET_KEY_E2E;
  delete childEnv.NANGO_SECRET_KEY_PROD;
  return childEnv;
}

export function parseRuntimeProfileArg(argv: readonly string[]): RuntimeProfile {
  const equalsArg = argv.find((a) => a.startsWith("--profile="));
  const profileIndex = argv.findIndex((a) => a === "--profile");
  const raw =
    equalsArg?.slice("--profile=".length).trim() ??
    (profileIndex >= 0 ? argv[profileIndex + 1]?.trim() : undefined);
  if (!raw) throw new Error("Missing --profile=dev|e2e|prod (e.g. --profile=dev).");
  assertRuntimeProfile(raw);
  return raw;
}
