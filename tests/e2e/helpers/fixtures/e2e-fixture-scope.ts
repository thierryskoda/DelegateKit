import { appendFileSync, mkdirSync } from "node:fs";
import path, { dirname } from "node:path";

export type E2eFixtureManifestResource =
  | {
      kind: "monday.item";
      providerConfigKey: string;
      connectionId: string;
      boardId: string;
      itemId: string;
      label: string;
    }
  | {
      kind: "monday.subitem";
      providerConfigKey: string;
      connectionId: string;
      parentItemId: string;
      subitemId: string;
      label: string;
    }
  | {
      kind: "monday.column";
      providerConfigKey: string;
      connectionId: string;
      boardId: string;
      columnId: string;
      title: string;
      label: string;
    }
  | {
      kind: "profile.artifact";
      profileId: string;
      artifactId: string;
      storageBucket: string;
      storageKey: string;
      label: string;
    }
  | {
      kind: "google-drive.file";
      connectedAccountId: string;
      fileId: string;
      name: string;
      label: string;
    };

export type E2eFixtureManifestEvent =
  | {
      event: "created";
      runId: string;
      label: string;
      at: string;
      resource: E2eFixtureManifestResource;
    }
  | {
      event: "cleaned";
      runId: string;
      label: string;
      at: string;
    };

/**
 * Cross-provider E2E fixture lifecycle: stack handles, reverse-order cleanup, runId-prefixed errors.
 * Provider-specific seeders return {@link E2eFixtureHandle}; tests pass them to {@link E2eFixtureScope.add}.
 */
export type E2eFixtureHandle = {
  /** Short label for logs (include provider + resource id when possible). */
  label: string;
  resource?: E2eFixtureManifestResource;
  cleanup: () => Promise<void>;
};

export type E2eFixtureScope = {
  add(handle: E2eFixtureHandle): E2eFixtureHandle;
  cleanup(): Promise<void>;
};

type E2eFixtureRun = {
  runId: string;
  runDir: string;
};

function appendManifestEvent(
  manifestPath: string | undefined,
  event: E2eFixtureManifestEvent,
): void {
  if (!manifestPath) return;
  mkdirSync(dirname(manifestPath), { recursive: true });
  appendFileSync(manifestPath, `${JSON.stringify(event)}\n`, "utf8");
}

export function createE2eFixtureScope(input: {
  run?: E2eFixtureRun;
  runId?: string;
  manifestPath?: string;
}): E2eFixtureScope {
  const stack: E2eFixtureHandle[] = [];
  let cleaned = false;
  const runId = input.run?.runId ?? input.runId;
  if (!runId) {
    throw new Error("createE2eFixtureScope requires either run or runId.");
  }
  const manifestPath =
    input.manifestPath ??
    (input.run ? path.join(input.run.runDir, "fixture-manifest.jsonl") : undefined);
  const prefix = `[e2e fixture runId=${runId}]`;

  return {
    add(handle: E2eFixtureHandle): E2eFixtureHandle {
      stack.push(handle);
      if (handle.resource) {
        appendManifestEvent(manifestPath, {
          event: "created",
          runId,
          label: handle.label,
          at: new Date().toISOString(),
          resource: handle.resource,
        });
      }
      console.log(`${prefix} seeded: ${handle.label}`);
      return handle;
    },
    async cleanup(): Promise<void> {
      if (cleaned) {
        throw new Error(`${prefix} cleanup() was called more than once.`);
      }
      cleaned = true;
      const errors: Error[] = [];
      for (const handle of [...stack].reverse()) {
        try {
          await handle.cleanup();
          if (handle.resource) {
            appendManifestEvent(manifestPath, {
              event: "cleaned",
              runId,
              label: handle.label,
              at: new Date().toISOString(),
            });
          }
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, `[e2e cleanup failed runId=${runId}]`);
      }
    },
  };
}
