import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { agentSessionsDir, workspaceStateDir } from "@ai-assistants/repo-layout";

const MUTABLE_STATE_DIRS = [
  "workspaces",
  "agents",
  "tasks",
  "cron",
  "logs",
  "credentials",
  "identity",
  "devices",
  "plugins",
  "npm",
  "flows",
  "telegram",
  "delivery-queue",
  "media",
  "sandbox",
] as const;

type JsonRecord = Record<string, unknown>;

const EMPTY_CLONED_RUNTIME_DIRS = new Set<(typeof MUTABLE_STATE_DIRS)[number]>(["logs", "npm"]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function removePath(pathToRemove: string): void {
  if (!existsSync(pathToRemove)) return;
  try {
    execFileSync("chmod", ["-R", "-N", pathToRemove], { stdio: "ignore" });
  } catch {
    // Linux containers do not have macOS ACL flags; rmSync below is the real cleanup.
  }
  rmSync(pathToRemove, { recursive: true, force: true });
}

function relativePathSegments(root: string, candidate: string): readonly string[] {
  return path
    .relative(root, candidate)
    .split(path.sep)
    .filter(Boolean);
}

function shouldCloneRuntimeStatePath(
  rootDirName: (typeof MUTABLE_STATE_DIRS)[number],
  sourceRoot: string,
  candidate: string,
): boolean {
  if (rootDirName === "agents") {
    const segments = relativePathSegments(sourceRoot, candidate);
    if (segments[1] === "agent" && segments[2] === "codex-home") return false;
  }
  return true;
}

function cloneOrCreateDir(
  sourcePath: string,
  clonePath: string,
  rootDirName: (typeof MUTABLE_STATE_DIRS)[number],
): void {
  removePath(clonePath);
  if (EMPTY_CLONED_RUNTIME_DIRS.has(rootDirName)) {
    mkdirSync(clonePath, { recursive: true });
    return;
  }
  if (existsSync(sourcePath)) {
    cpSync(sourcePath, clonePath, {
      recursive: true,
      dereference: false,
      force: true,
      filter: (source) => shouldCloneRuntimeStatePath(rootDirName, sourcePath, source),
    });
  } else {
    mkdirSync(clonePath, { recursive: true });
  }
}

function grantAdminScopeToPairedDevices(pairedJsonPath: string): void {
  if (!existsSync(pairedJsonPath)) return;
  const E2E_SCOPES = ["operator.admin", "operator.read", "operator.write"] as const;
  const raw = readFileSync(pairedJsonPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error(`paired.json must be an object: ${pairedJsonPath}`);
  }
  for (const device of Object.values(parsed)) {
    if (!isRecord(device)) continue;
    device.scopes = [...E2E_SCOPES];
    device.approvedScopes = [...E2E_SCOPES];
    if (isRecord(device.tokens)) {
      for (const token of Object.values(device.tokens)) {
        if (!isRecord(token)) continue;
        token.scopes = [...E2E_SCOPES];
      }
    }
  }
  writeFileSync(pairedJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export function cloneE2eRuntimeState(sourceRuntimeRoot: string, runDir: string): void {
  for (const dir of MUTABLE_STATE_DIRS) {
    cloneOrCreateDir(path.join(sourceRuntimeRoot, dir), path.join(runDir, dir), dir);
  }
  grantAdminScopeToPairedDevices(path.join(runDir, "devices", "paired.json"));
}

export function ensureRequiredAgentRuntimeDirs(runDir: string, agentId: string): void {
  const requiredWorkspaceState = workspaceStateDir(runDir, agentId);
  if (!existsSync(requiredWorkspaceState)) mkdirSync(requiredWorkspaceState, { recursive: true });
  const requiredAgentSessions = agentSessionsDir(runDir, agentId);
  if (!existsSync(requiredAgentSessions)) mkdirSync(requiredAgentSessions, { recursive: true });
}

export function removeEmptyRootRuntimeDirs(rootDir: string): void {
  for (const dir of MUTABLE_STATE_DIRS) {
    const candidate = path.join(rootDir, dir);
    if (!existsSync(candidate)) continue;
    try {
      if (readdirSync(candidate).length === 0) rmdirSync(candidate);
    } catch {
      // Non-empty, busy, or unavailable source-root dirs are left untouched for inspection.
    }
  }
}
