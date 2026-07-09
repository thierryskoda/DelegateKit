import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const backendProcessEnvAllowlist = new Set([
  "apps/backend/src/bootstrap-env.ts",
  "apps/backend/src/shared/env.ts",
]);

const deletedEnvHelperCalls = [
  "parseBackendFeatureEnv",
  "parseOptionalKnownEnvString",
  "parseRequiredKnownEnvString",
  "requireBackendPublicUrl",
  "requireConnectPublicUrl",
  "requireBackendMachineToken",
  "requireBoldSignApiKey",
  "requireBoldSignWebhookSecrets",
  "requireNangoSecretKey",
  "requireNangoWebhookSigningSecret",
  "requireTelegramBotToken",
  "requireTelegramMiniAppBotUsername",
  "requireGmailPubsubTopicName",
  "requireMondaySigningSecret",
  "requireBrowserbaseApiKey",
  "requireOpenAiApiKey",
  "requirePerplexityApiKey",
] as const;

const nestedBackendEnvFields = [
  "publicWeb",
  "boldSign",
  "telegram",
  "monday",
  "documents",
  "backend",
  "supabase",
  "nango",
] as const;

function tsFilesUnder(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...tsFilesUnder(fullPath));
      continue;
    }
    if (entry.endsWith(".ts")) files.push(fullPath);
  }
  return files;
}

function relativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export function assertBackendServiceEnvSource(root: string): void {
  const backendRoot = path.join(root, "apps/backend/src");
  const violations: string[] = [];

  for (const filePath of tsFilesUnder(backendRoot)) {
    const relative = relativePath(root, filePath);
    const source = readFileSync(filePath, "utf8");
    if (source.includes("process.env") && !backendProcessEnvAllowlist.has(relative)) {
      violations.push(`${relative} reads process.env directly; use backendApiEnv() or backendWorkerEnv().`);
    }
    for (const helper of deletedEnvHelperCalls) {
      if (new RegExp(`\\b${helper}\\s*\\(`).test(source)) {
        violations.push(`${relative} references deleted env helper ${helper}.`);
      }
    }
    for (const field of nestedBackendEnvFields) {
      if (new RegExp(`\\bbackend(?:Api|Worker)?Env\\(\\)\\.${field}\\b|\\benv\\.${field}\\b`).test(source)) {
        violations.push(`${relative} references nested backend env field .${field}; use flat env fields.`);
      }
    }
  }

  if (violations.length === 0) return;
  throw new Error(["Backend service env source drift:", ...violations.map((v) => `  - ${v}`)].join("\n"));
}
