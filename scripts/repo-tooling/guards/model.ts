import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "@ai-assistants/repo-layout";
import type { ToolContract } from "@ai-assistants/tool-contracts";
import {
  ASSISTANT_CAPABILITIES,
  contractsForCapabilitySurfaceId,
  type AssistantCapabilitySpec,
} from "@ai-assistants/assistant-capability-surface";
import type { RuntimeProfileConfig } from "../build/profile-db-config";
import {
  assertUniqueGuidanceNames,
  loadGenericRuntimeGuidanceSpecs,
  loadMaintainerSkillSpecs,
  loadCapabilityGuidanceSpecs,
  type GuidanceSpec,
} from "../build/guidance-registry";

export type CapabilityManifest = {
  spec: AssistantCapabilitySpec;
  contracts: readonly ToolContract[];
};

export type GuardModel = {
  root: string;
  packageScripts: Record<string, string>;
  capabilityManifests: CapabilityManifest[];
  capabilityGuidance: GuidanceSpec[];
  genericGuidance: GuidanceSpec[];
  clientGuidance: GuidanceSpec[];
  maintainerSkills: GuidanceSpec[];
  runtimeProfileConfigs: readonly RuntimeProfileConfig[];
};

export type LoadGuardModelOptions = {
  root?: string;
  runtimeProfileConfigs?: readonly RuntimeProfileConfig[];
};

function readJsonRecord(filePath: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function packageScripts(packageJson: unknown): Record<string, string> {
  const record =
    packageJson && typeof packageJson === "object" && !Array.isArray(packageJson)
      ? (packageJson as Record<string, unknown>)
      : {};
  const scripts = record.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return {};
  return Object.fromEntries(
    Object.entries(scripts as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export async function loadGuardModel(options: LoadGuardModelOptions = {}): Promise<GuardModel> {
  const root = options.root ?? repoRoot(import.meta.url);
  const packageJson = readJsonRecord(path.join(root, "package.json"), "package.json");
  const capabilityManifests = ASSISTANT_CAPABILITIES.map((spec) => ({
    spec,
    contracts: contractsForCapabilitySurfaceId(spec.toolSurfaceId),
  }));
  const [capabilityGuidance, genericGuidance, maintainerSkills] = await Promise.all([
    loadCapabilityGuidanceSpecs(root, ASSISTANT_CAPABILITIES),
    loadGenericRuntimeGuidanceSpecs(root),
    loadMaintainerSkillSpecs(root),
  ]);
  assertUniqueGuidanceNames([...capabilityGuidance, ...genericGuidance, ...maintainerSkills]);
  return {
    root,
    packageScripts: packageScripts(packageJson),
    capabilityManifests,
    capabilityGuidance,
    genericGuidance,
    clientGuidance: [],
    maintainerSkills,
    runtimeProfileConfigs: options.runtimeProfileConfigs ?? [],
  };
}
