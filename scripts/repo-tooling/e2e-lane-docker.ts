import { repoRoot } from "@ai-assistants/repo-layout";
import {
  runBoundedCommand,
  runRequiredBoundedCommand,
  type BoundedCommandOptions,
  type BoundedCommandResult,
} from "./bounded-command";
import type { E2eLaneConfig } from "./e2e-lanes";

export type E2eLaneDockerCommandResult = BoundedCommandResult & {
  laneId: string;
  projectId: string;
  dockerContext: string;
};

type LaneDockerCommandOptions = Omit<BoundedCommandOptions, "env"> & {
  env?: NodeJS.ProcessEnv;
};

function envForE2eLaneDockerContext(
  lane: Pick<E2eLaneConfig, "dockerContext">,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...env,
    DOCKER_CONTEXT: lane.dockerContext,
  };
}

function annotateLaneDockerResult(
  lane: E2eLaneConfig,
  result: BoundedCommandResult,
): E2eLaneDockerCommandResult {
  return {
    ...result,
    laneId: lane.id,
    projectId: lane.projectId,
    dockerContext: lane.dockerContext,
  };
}

export function runE2eLaneDockerCommand(
  lane: E2eLaneConfig,
  args: readonly string[],
  options: LaneDockerCommandOptions,
): E2eLaneDockerCommandResult {
  return annotateLaneDockerResult(
    lane,
    runBoundedCommand("docker", args, {
      cwd: options.cwd ?? repoRoot(import.meta.url),
      timeoutMs: options.timeoutMs,
      maxBuffer: options.maxBuffer,
      input: options.input,
      env: envForE2eLaneDockerContext(lane, options.env),
    }),
  );
}

export function runRequiredE2eLaneDockerCommand(
  lane: E2eLaneConfig,
  args: readonly string[],
  options: LaneDockerCommandOptions,
): E2eLaneDockerCommandResult {
  return annotateLaneDockerResult(
    lane,
    runRequiredBoundedCommand("docker", args, {
      cwd: options.cwd ?? repoRoot(import.meta.url),
      timeoutMs: options.timeoutMs,
      maxBuffer: options.maxBuffer,
      input: options.input,
      env: envForE2eLaneDockerContext(lane, options.env),
    }),
  );
}
