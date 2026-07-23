import fs from "node:fs";
import path from "node:path";

export const E2E_DEFAULT_PATTERN = "tests/e2e/**/*-e2e.ts";

export const E2E_SUITE_DIRS = {
  capabilities: "tests/e2e/capabilities",
  scenarios: "tests/e2e/scenarios",
  connect: "tests/e2e/connect",
  others: "tests/e2e/others",
} as const;

export type E2eSuiteName = keyof typeof E2E_SUITE_DIRS;

export function isE2eSuiteName(value: string): value is E2eSuiteName {
  return Object.hasOwn(E2E_SUITE_DIRS, value);
}

export function e2eSuitePattern(suite: E2eSuiteName): string {
  return `${E2E_SUITE_DIRS[suite]}/**/*-e2e.ts`;
}

export function collectE2eFilesInDir(relativeDir: string, root: string): string[] {
  const dir = path.join(root, relativeDir);
  if (!fs.existsSync(dir)) {
    throw new Error(`E2E directory not found: ${relativeDir}`);
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith("-e2e.ts")) {
      continue;
    }
    files.push(path.join(relativeDir, entry.name).replace(/\\/g, "/"));
  }
  return files;
}

export function collectAllE2eFiles(root: string): string[] {
  return Object.values(E2E_SUITE_DIRS).flatMap((dir) => collectE2eFilesInDir(dir, root));
}

type E2eLiveBindingRequirement = {
  capabilitySlug: string;
  provider: string;
};

export type E2eSetupScope =
  | { kind: "sandbox-only" }
  | { kind: "live-bindings"; bindings: readonly E2eLiveBindingRequirement[] };

const LIVE_BINDING_E2E_FILES: ReadonlyMap<string, E2eLiveBindingRequirement> = new Map([
  ["tests/e2e/capabilities/gmail-e2e.ts", { capabilitySlug: "gmail", provider: "gmail" }],
  [
    "tests/e2e/capabilities/google-drive-e2e.ts",
    { capabilitySlug: "google-drive", provider: "google-drive" },
  ],
  [
    "tests/e2e/capabilities/google-calendar-e2e.ts",
    { capabilitySlug: "google-calendar", provider: "google-calendar" },
  ],
  ["tests/e2e/capabilities/monday-e2e.ts", { capabilitySlug: "monday", provider: "monday" }],
  [
    "tests/e2e/capabilities/outlook-mail-e2e.ts",
    { capabilitySlug: "outlook-mail", provider: "outlook-mail" },
  ],
  [
    "tests/e2e/capabilities/outlook-calendar-e2e.ts",
    { capabilitySlug: "outlook-calendar", provider: "outlook-calendar" },
  ],
  [
    "tests/e2e/capabilities/microsoft-todo-e2e.ts",
    { capabilitySlug: "microsoft-todo", provider: "microsoft-todo" },
  ],
  [
    "tests/e2e/capabilities/microsoft-onedrive-e2e.ts",
    { capabilitySlug: "microsoft-onedrive", provider: "microsoft-onedrive" },
  ],
  ["tests/e2e/capabilities/boldsign-e2e.ts", { capabilitySlug: "boldsign", provider: "boldsign" }],
  [
    "tests/e2e/others/monday-webhook-events-e2e.ts",
    { capabilitySlug: "monday", provider: "monday" },
  ],
] as const);

const SANDBOX_ONLY_E2E_FILES: ReadonlySet<string> = new Set([
  "tests/e2e/direct-agent-runtime-e2e.ts",
  "tests/e2e/work-items-direct-e2e.ts",
  "tests/e2e/profile-files-direct-e2e.ts",
  "tests/e2e/capabilities/artifacts-e2e.ts",
  "tests/e2e/capabilities/document-tools-e2e.ts",
  "tests/e2e/capabilities/phone-e2e.ts",
  "tests/e2e/capabilities/public-web-e2e.ts",
  "tests/e2e/connect/browser-handoff-e2e.ts",
  "tests/e2e/connect/connected-accounts-roundtrip-e2e.ts",
  "tests/e2e/connect/outlook-integration-grouping-e2e.ts",
  "tests/e2e/connect/portal-approval-expiry-e2e.ts",
  "tests/e2e/connect/telegram-mini-app-session-e2e.ts",
  "tests/e2e/others/agent-activity-context-e2e.ts",
  "tests/e2e/others/boldsign-webhook-isolation-e2e.ts",
  "tests/e2e/others/chatgpt-apps-sdk-mcp-e2e.ts",
  "tests/e2e/others/e2e-worker-lane-clean-state-e2e.ts",
  "tests/e2e/others/e2e-worker-lane-leasing-e2e.ts",
  "tests/e2e/others/google-drive-webhook-events-e2e.ts",
  "tests/e2e/others/microsoft-file-webhook-events-e2e.ts",
  "tests/e2e/others/proposal-email-follow-up-e2e.ts",
  "tests/e2e/others/provider-webhook-stale-callbacks-e2e.ts",
  "tests/e2e/others/twilio-phone-webhooks-e2e.ts",
] as const);

function isSandboxOnlyPattern(pattern: string): boolean {
  const normalized = normalizeE2ePattern(pattern);
  return (
    normalized === E2E_SUITE_DIRS.scenarios ||
    normalized.startsWith(`${E2E_SUITE_DIRS.scenarios}/`) ||
    normalized === e2eSuitePattern("scenarios") ||
    SANDBOX_ONLY_E2E_FILES.has(normalized)
  );
}

function normalizeE2ePattern(pattern: string): string {
  return pattern.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function resolveE2eSetupScope(patterns: readonly string[]): E2eSetupScope {
  if (patterns.length > 0 && patterns.every(isSandboxOnlyPattern)) return { kind: "sandbox-only" };

  const requirements: E2eLiveBindingRequirement[] = [];
  for (const pattern of patterns) {
    const normalized = normalizeE2ePattern(pattern);
    if (isSandboxOnlyPattern(normalized)) continue;
    const requirement = LIVE_BINDING_E2E_FILES.get(normalized);
    if (!requirement) return { kind: "live-bindings", bindings: [] };
    requirements.push(requirement);
  }
  if (requirements.length === 0) return { kind: "sandbox-only" };
  const seen = new Set<string>();
  return {
    kind: "live-bindings",
    bindings: requirements.filter((requirement) => {
      const key = `${requirement.capabilitySlug}/${requirement.provider}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}
