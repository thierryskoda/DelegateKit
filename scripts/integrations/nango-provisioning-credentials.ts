import type { NangoProvisioningEntry } from "@ai-assistants/nango-provisioning";

function readOptionalEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key]?.trim();
  return v || undefined;
}

export function credentialEnvStatus(
  entry: NangoProvisioningEntry,
  env: NodeJS.ProcessEnv,
): { clientId: boolean; clientSecret: boolean; missingEnvVars: string[] } {
  const clientId = Boolean(readOptionalEnv(env, entry.credentials.clientIdEnv));
  const clientSecret = Boolean(readOptionalEnv(env, entry.credentials.clientSecretEnv));
  const missingEnvVars: string[] = [];
  if (!clientId) missingEnvVars.push(entry.credentials.clientIdEnv);
  if (!clientSecret) missingEnvVars.push(entry.credentials.clientSecretEnv);
  return { clientId, clientSecret, missingEnvVars };
}

export function buildOAuthCredentialsPayload(
  entry: NangoProvisioningEntry,
  env: NodeJS.ProcessEnv,
): { type: "OAUTH2"; client_id: string; client_secret: string; scopes?: string | null } {
  const clientId = readOptionalEnv(env, entry.credentials.clientIdEnv);
  const clientSecret = readOptionalEnv(env, entry.credentials.clientSecretEnv);
  if (!clientId || !clientSecret) {
    throw new Error(
      `Missing OAuth env for ${entry.uniqueKey}: set ${entry.credentials.clientIdEnv} and ${entry.credentials.clientSecretEnv}.`,
    );
  }
  return {
    type: "OAUTH2",
    client_id: clientId,
    client_secret: clientSecret,
    scopes: entry.credentials.scopes ?? null,
  };
}
