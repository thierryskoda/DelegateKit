import { buildAndValidateProfile } from "../profiles/deploy";
import {
  computeE2eSupabaseRuntimeFingerprint,
  resetE2eSupabaseRuntime,
  resetE2eSupabaseRuntimeDataOnly,
  type E2eSupabaseRuntimeOptions,
} from "../profiles/supabase";
import { stableLockHash, withRepoLock } from "./repo-lock";
import {
  envForE2eLaneRuntime,
  materializeE2eLaneRuntime,
  type E2eLaneConfig,
} from "./e2e-lanes";
import {
  markLanePreparing,
  markLaneQuarantined,
  markLaneReadyAfterPrepare,
  type E2eLaneLease,
} from "./e2e-lane-state";

function e2eLaneSupabaseOperationLock(lane: E2eLaneConfig): string {
  return `e2e-lane-supabase-operation.${stableLockHash(lane.dockerContext)}`;
}

function supabaseRuntimeOptionsForLane(lane: E2eLaneConfig): E2eSupabaseRuntimeOptions {
  return {
    workdir: lane.supabaseWorkdir,
    envPath: lane.envPath,
    projectId: lane.projectId,
    dockerContext: lane.dockerContext,
    ports: lane.ports,
  };
}

async function buildE2eLaneRuntime(lane: E2eLaneConfig): Promise<void> {
  await buildAndValidateProfile({
    profile: "e2e",
    runtimeRoot: lane.runtimeRoot,
    env: envForE2eLaneRuntime(lane),
  });
}

type ResetAndBuildHooks = {
  afterResetBeforeBuild?: (lane: E2eLaneConfig) => Promise<void>;
};

async function fullResetAndBuildE2eLaneRuntime(
  lane: E2eLaneConfig,
  hooks?: ResetAndBuildHooks,
): Promise<string> {
  const options = supabaseRuntimeOptionsForLane(lane);
  const result = await resetE2eSupabaseRuntime(options);
  await hooks?.afterResetBeforeBuild?.(lane);
  await buildE2eLaneRuntime(lane);
  return result.fingerprint;
}

async function dataResetAndBuildE2eLaneRuntime(
  lane: E2eLaneConfig,
  hooks?: ResetAndBuildHooks,
): Promise<string> {
  const result = await resetE2eSupabaseRuntimeDataOnly(supabaseRuntimeOptionsForLane(lane));
  await hooks?.afterResetBeforeBuild?.(lane);
  await buildE2eLaneRuntime(lane);
  return result.fingerprint;
}

function attachQuarantineFailure(releaseFailure: unknown, quarantineFailure: unknown): void {
  if (!(releaseFailure instanceof Error)) return;
  Object.defineProperty(releaseFailure, "quarantineFailure", {
    value:
      quarantineFailure instanceof Error ? quarantineFailure.message : String(quarantineFailure),
    enumerable: false,
    configurable: true,
  });
}

export async function prepareE2eLane(lane: E2eLaneConfig): Promise<void> {
  materializeE2eLaneRuntime(lane);
  const generation = await markLanePreparing(lane);
  try {
    await withRepoLock(e2eLaneSupabaseOperationLock(lane), async () => {
      const fingerprint = await fullResetAndBuildE2eLaneRuntime(lane);
      await markLaneReadyAfterPrepare(lane, generation, {
        preparedFingerprint: fingerprint,
        resetMode: "full",
      });
    });
  } catch (error) {
    await markLaneQuarantined(
      lane,
      `Lane prepare failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

export async function resetLeasedE2eLaneBeforeRun(
  lease: E2eLaneLease,
  hooks?: ResetAndBuildHooks,
): Promise<void> {
  await withRepoLock(e2eLaneSupabaseOperationLock(lease.lane), async () => {
    const expectedFingerprint = computeE2eSupabaseRuntimeFingerprint(
      supabaseRuntimeOptionsForLane(lease.lane),
    );
    if (lease.preparedFingerprint === expectedFingerprint) {
      const fingerprint = await dataResetAndBuildE2eLaneRuntime(lease.lane, hooks);
      await lease.markResetComplete({ preparedFingerprint: fingerprint, resetMode: "data" });
      return;
    }
    const fingerprint = await fullResetAndBuildE2eLaneRuntime(lease.lane, hooks);
    await lease.markResetComplete({ preparedFingerprint: fingerprint, resetMode: "full" });
  });
}

export async function releaseLeasedE2eLaneAfterRun(lease: E2eLaneLease): Promise<void> {
  try {
    await lease.releaseReady();
  } catch (error) {
    try {
      await lease.quarantine(
        `Post-run release failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } catch (quarantineError) {
      attachQuarantineFailure(error, quarantineError);
    }
    throw error;
  }
}
