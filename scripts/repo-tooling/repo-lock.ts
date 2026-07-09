import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { repoRoot } from "@ai-assistants/repo-layout";
import { z } from "zod";

export type RepoLockOptions = {
  lockRoot?: string;
  pollMs?: number;
  staleMs?: number;
};

const defaultPollMs = 250;
const defaultStaleMs = 10 * 60_000;
const lockOwnerSchema = z.object({ token: z.unknown().optional() }).passthrough();

function defaultLockRoot(): string {
  return path.join(repoRoot(import.meta.url), "tmp", "locks");
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function assertLockName(name: string): void {
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return;
  throw new Error(`Invalid repo lock name ${JSON.stringify(name)}.`);
}

function lockDirForName(name: string, lockRoot: string): string {
  assertLockName(name);
  return path.join(lockRoot, `${name}.lock`);
}

export function stableLockHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function removeStaleLock(lockDir: string, staleMs: number): Promise<boolean> {
  try {
    const lockStat = await stat(lockDir);
    if (Date.now() - lockStat.mtimeMs < staleMs) return false;
    await rm(lockDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return true;
    throw error;
  }
}

async function ownsLock(lockDir: string, token: string): Promise<boolean> {
  const ownerPath = path.join(lockDir, "owner.json");
  try {
    const owner = lockOwnerSchema.parse(JSON.parse(await readFile(ownerPath, "utf8")));
    return owner.token === token;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

async function acquireRepoLock(
  name: string,
  options: RepoLockOptions = {},
): Promise<() => Promise<void>> {
  const lockRoot = options.lockRoot ?? defaultLockRoot();
  const lockDir = lockDirForName(name, lockRoot);
  const pollMs = options.pollMs ?? defaultPollMs;
  const staleMs = options.staleMs ?? defaultStaleMs;

  await mkdir(lockRoot, { recursive: true });

  for (;;) {
    try {
      await mkdir(lockDir);
      const token = randomUUID();
      await writeFile(
        path.join(lockDir, "owner.json"),
        JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }, null, 2),
      );
      const keepFresh = setInterval(
        () => {
          void ownsLock(lockDir, token)
            .then(async (owned) => {
              if (!owned) return;
              const now = new Date();
              await utimes(lockDir, now, now);
            })
            .catch(() => undefined);
        },
        Math.max(1_000, Math.floor(staleMs / 4)),
      );
      keepFresh.unref();
      return async () => {
        clearInterval(keepFresh);
        if (!(await ownsLock(lockDir, token))) return;
        await rm(lockDir, { recursive: true, force: true });
      };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      await removeStaleLock(lockDir, staleMs);
      await delay(pollMs);
    }
  }
}

export async function withRepoLock<T>(
  name: string,
  action: () => Promise<T>,
  options: RepoLockOptions = {},
): Promise<T> {
  const release = await acquireRepoLock(name, options);
  try {
    return await action();
  } finally {
    await release();
  }
}
