import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const LEGACY_NANGO_ROOT = path.join("nango-integrations", "ai-assistants-monday");

function normalizeRelPath(root: string, absPath: string): string {
  return path.relative(root, absPath).split(path.sep).join("/");
}

export function assertNangoActionProvisioningRemoved(root: string): void {
  const legacyMonday = path.join(root, LEGACY_NANGO_ROOT);
  if (existsSync(legacyMonday)) {
    throw new Error(`Remove legacy ${LEGACY_NANGO_ROOT}: Monday v1 has no custom Nango functions.`);
  }
  const functionsRoot = path.join(root, "apps", "backend", "nango-functions");
  if (existsSync(functionsRoot)) {
    throw new Error(`Remove ${path.relative(root, functionsRoot)}: backend provider operations are proxy-backed.`);
  }
  const checkedFiles = [
    "packages/nango-provisioning/src/manifest.ts",
    "scripts/integrations/integrations.ts",
    "scripts/profiles/start.ts",
  ];
  const offenders = checkedFiles.flatMap((file) => {
    const source = readSourceIfExists(root, file);
    return ["requiredCatalogActions", "requiredCustomActions", "nango functions", "nango readiness"]
      .filter((needle) => source.includes(needle))
      .map((needle) => `${file}: ${needle}`);
  });
  if (offenders.length) {
    throw new Error(
      [
        "Nango action provisioning/readiness must not be part of the source contract.",
        ...offenders.sort().map((offender) => `- ${offender}`),
      ].join("\n"),
    );
  }
}

function walkTsFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsFiles(full, out);
    else if (ent.isFile() && ent.name.endsWith(".ts") && !ent.name.endsWith(".test.ts"))
      out.push(full);
  }
}

function readSourceIfExists(root: string, relPath: string): string {
  const abs = path.join(root, relPath);
  return existsSync(abs) ? readFileSync(abs, "utf8") : "";
}

function assertCanonicalNangoSecretKeyEnv(root: string): void {
  const runtime = readSourceIfExists(root, "scripts/integrations/nango-provisioning-runtime.ts");
  const missingRuntimeContract = [
    "merged.NANGO_SECRET_KEY",
    "delete childEnv.NANGO_SECRET_KEY_DEV",
    "delete childEnv.NANGO_SECRET_KEY_PROD",
  ].filter((needle) => !runtime.includes(needle));
  if (missingRuntimeContract.length) {
    throw new Error(
      [
        "Nango CLI env handling must resolve canonical NANGO_SECRET_KEY and strip accidental profile-specific shell vars.",
        ...missingRuntimeContract.map((needle) => `- missing ${needle}`),
      ].join("\n"),
    );
  }

  const checkedFiles = [".env.example"];
  const offenders = checkedFiles.flatMap((file) => {
    const source = readSourceIfExists(root, file);
    return ["NANGO_SECRET_KEY_DEV", "NANGO_SECRET_KEY_PROD"]
      .filter((name) => source.includes(name))
      .map((name) => `${file}: ${name}`);
  });
  if (offenders.length) {
    throw new Error(
      [
        "Nango env handling must use only NANGO_SECRET_KEY; dev/prod are separated by profile env files.",
        ...offenders.sort().map((offender) => `- ${offender}`),
      ].join("\n"),
    );
  }
}

export function assertNangoEnvContract(root: string): void {
  assertCanonicalNangoSecretKeyEnv(root);
}

/** Only this file may call Nango proxy HTTP helpers (`get`/`post`/…) on the admin client. */
const ALLOWED_BACKEND_NANGO_PROXY_REL_PATHS = new Set([
  "apps/backend/src/integrations/nango/nango-proxy-client.ts",
]);

function backendNangoConsumerSourceRoots(root: string): string[] {
  return [
    path.join(root, "apps/backend/src/integrations/nango"),
    path.join(root, "apps/backend/src/capabilities"),
  ];
}

/**
 * Backend provider code must use `nangoProxyRequestJson` / `nangoProxyRequestBinary` instead of calling
 * `nango.get` / `nango.post` / etc. on a raw admin client (OAuth injection + retries stay centralized).
 */
export function assertBackendNangoProxyCallsAreWrapped(root: string): void {
  const files: string[] = [];
  for (const sourceRoot of backendNangoConsumerSourceRoots(root)) {
    walkTsFiles(sourceRoot, files);
  }
  const offenders: string[] = [];
  const proxyCall = /\bnango\.(get|post|put|patch|delete)\s*\(/;
  for (const abs of files) {
    const rel = normalizeRelPath(root, abs);
    if (ALLOWED_BACKEND_NANGO_PROXY_REL_PATHS.has(rel)) continue;
    const text = readFileSync(abs, "utf8");
    if (proxyCall.test(text)) {
      offenders.push(rel);
    }
  }
  if (offenders.length) {
    throw new Error(
      [
        "Raw Nango proxy HTTP calls must go through the shared transport:",
        "apps/backend/src/integrations/nango/nango-proxy-client.ts",
        "(use nangoProxyRequestJson, nangoProxyRequestJsonWithHeaders, or nangoProxyRequestBinary).",
        "Offenders:",
        ...offenders.sort().map((o) => `- ${o}`),
      ].join("\n"),
    );
  }
}

export function assertBackendNangoTriggersAreRemoved(root: string): void {
  const files: string[] = [];
  for (const sourceRoot of backendNangoConsumerSourceRoots(root)) {
    walkTsFiles(sourceRoot, files);
  }
  const offenders: string[] = [];
  for (const abs of files) {
    const rel = normalizeRelPath(root, abs);
    const text = readFileSync(abs, "utf8");
    if (/\bnango\.triggerAction\s*\(/.test(text)) {
      offenders.push(rel);
    }
  }
  if (offenders.length) {
    throw new Error(
      `Nango remote actions are no longer allowed in backend code. Offenders:\n${offenders.sort().join("\n")}`,
    );
  }
}
