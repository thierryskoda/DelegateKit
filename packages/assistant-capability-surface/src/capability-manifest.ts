import type { ToolContract } from "@ai-assistants/tool-contracts";

type CapabilitySourceDir = `capabilities/${string}`;

type CapabilityGuidanceManifest = {
  /** Repo-relative typed guidance source. */
  sourcePath: string;
};

type CapabilityAgentGrantPolicy = {
  /** Always granted to every agent, even if not listed on the profile. */
  grantToAllAgents?: boolean;
  /** Granted only to profile main agents. */
  grantToMainAgents?: boolean;
};

type CapabilityReadinessManifest = {
  /** Capability needs per-profile readiness/setup before agent use. */
  requiresSetup?: boolean;
};

export type AgentCapabilityManifest = CapabilityAgentGrantPolicy & {
  /** Profile-facing capability slug used by control-plane capability instances. */
  slug: string;
  /** Contract surface id shared by this capability's tools. */
  toolSurfaceId: string;
  /** Repo-relative capability guidance and contract source directory. */
  sourceDir: CapabilitySourceDir;
  contracts: readonly ToolContract[];
  guidance?: CapabilityGuidanceManifest;
  readiness?: CapabilityReadinessManifest;
};

export function defineAgentCapabilityManifest<const TManifest extends AgentCapabilityManifest>(
  manifest: TManifest,
): TManifest {
  assertManifestId(manifest.slug, "capability slug");
  assertManifestId(manifest.toolSurfaceId, `capability ${manifest.slug} toolSurfaceId`);
  assertCapabilitySourceDir(manifest.sourceDir, `capability ${manifest.slug}`);
  if (manifest.contracts.length === 0) {
    throw new Error(
      `Capability manifest ${manifest.slug} must declare at least one tool contract.`,
    );
  }
  for (const contract of manifest.contracts) {
    if (contract.pluginId !== manifest.toolSurfaceId) {
      throw new Error(
        `Capability manifest ${manifest.slug} declares toolSurfaceId ${manifest.toolSurfaceId} but contract ${contract.name} belongs to ${contract.pluginId}.`,
      );
    }
  }
  if (manifest.guidance) {
    if (manifest.guidance.sourcePath !== `${manifest.sourceDir}/GUIDANCE.ts`) {
      throw new Error(
        `Capability manifest ${manifest.slug} guidance sourcePath must be ${manifest.sourceDir}/GUIDANCE.ts.`,
      );
    }
  }
  return manifest;
}

function assertManifestId(value: string, label: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`${label} must be lowercase kebab-case; got ${JSON.stringify(value)}.`);
  }
}

function assertCapabilitySourceDir(value: string, label: string): void {
  if (!/^capabilities\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(
      `${label} sourceDir must be a repo-relative capabilities directory; got ${JSON.stringify(value)}.`,
    );
  }
}
