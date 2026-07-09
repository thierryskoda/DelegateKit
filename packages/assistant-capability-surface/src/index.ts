import { PROFILE_CAPABILITY_CATALOG } from "@ai-assistants/capability-catalog";
import { actionsToolContracts } from "@ai-assistants/actions-contracts/contracts";
import { defineAgentCapabilityManifest, type AgentCapabilityManifest } from "./capability-manifest";
import { boldsignToolContracts } from "@ai-assistants/boldsign-contracts/contracts";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";
import { gmailToolContracts } from "@ai-assistants/gmail-contracts/contracts";
import { googleCalendarToolContracts } from "@ai-assistants/google-calendar-contracts/contracts";
import { googleDriveToolContracts } from "@ai-assistants/google-drive-contracts/contracts";
import { microsoftOnedriveToolContracts } from "@ai-assistants/microsoft-onedrive-contracts/contracts";
import { microsoftSharepointToolContracts } from "@ai-assistants/microsoft-sharepoint-contracts/contracts";
import { microsoftTodoToolContracts } from "@ai-assistants/microsoft-todo-contracts/contracts";
import { mondayToolContracts } from "@ai-assistants/monday-contracts/contracts";
import { outlookCalendarToolContracts } from "@ai-assistants/outlook-calendar-contracts/contracts";
import { outlookMailToolContracts } from "@ai-assistants/outlook-mail-contracts/contracts";
import { phoneToolContracts } from "@ai-assistants/phone-contracts/contracts";
import { profileContextToolContracts } from "@ai-assistants/profile-context-contracts/contracts";
import { profileFileToolContracts } from "@ai-assistants/profile-files-contracts/contracts";
import { profileLinksToolContracts } from "@ai-assistants/profile-links-contracts/contracts";
import { proposalsToolContracts } from "@ai-assistants/proposals-contracts/contracts";
import { publicWebToolContracts } from "@ai-assistants/public-web-contracts/contracts";
import { scheduledTasksToolContracts } from "@ai-assistants/scheduled-tasks-contracts/contracts";
import { timeToolContracts } from "@ai-assistants/time-contracts/contracts";
import { builtinToolContracts, type ToolContract } from "@ai-assistants/tool-contracts";
import { workToolContracts } from "@ai-assistants/work-contracts/contracts";

export type AssistantCapabilitySpec = {
  /** Profile-facing capability slug used by DB-owned capability instances. */
  slug: string;
  /** Contract surface id shared by this capability's tools. */
  toolSurfaceId: string;
  sourceDir: string;
  /**
   * Always granted to every agent (e.g. profile context), even if not listed on the profile.
   */
  grantToAllAgents?: boolean;
  /**
   * Granted only to profile main agents.
   */
  grantToMainAgents?: boolean;
};

function capabilitySpecFromManifest(manifest: AgentCapabilityManifest): AssistantCapabilitySpec {
  const { slug, toolSurfaceId, sourceDir, grantToAllAgents, grantToMainAgents } = manifest;
  return {
    slug,
    toolSurfaceId,
    sourceDir,
    ...(grantToAllAgents === undefined ? {} : { grantToAllAgents }),
    ...(grantToMainAgents === undefined ? {} : { grantToMainAgents }),
  };
}

/** Ordered consistently for tool inventory and stable generated guidance diffs. */
const AGENT_CAPABILITY_MANIFESTS: readonly AgentCapabilityManifest[] = [
  defineAgentCapabilityManifest({
    slug: "profile-context",
    toolSurfaceId: "profile-context-tools",
    sourceDir: "capabilities/profile-context",
    grantToAllAgents: true,
    contracts: profileContextToolContracts,
    guidance: {
      sourcePath: "capabilities/profile-context/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: "profile-files",
    toolSurfaceId: "profile-files",
    sourceDir: "capabilities/profile-files",
    grantToAllAgents: true,
    contracts: profileFileToolContracts,
    guidance: {
      sourcePath: "capabilities/profile-files/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: "time",
    toolSurfaceId: "time-tools",
    sourceDir: "capabilities/time",
    grantToAllAgents: true,
    contracts: timeToolContracts,
    guidance: { sourcePath: "capabilities/time/GUIDANCE.ts" },
  }),
  defineAgentCapabilityManifest({
    slug: "work",
    toolSurfaceId: "work-tools",
    sourceDir: "capabilities/work",
    grantToAllAgents: true,
    contracts: workToolContracts,
    guidance: { sourcePath: "capabilities/work/GUIDANCE.ts" },
  }),
  defineAgentCapabilityManifest({
    slug: "scheduled-tasks",
    toolSurfaceId: "scheduled-tasks-tools",
    sourceDir: "capabilities/scheduled-tasks",
    grantToAllAgents: true,
    contracts: scheduledTasksToolContracts,
    guidance: {
      sourcePath: "capabilities/scheduled-tasks/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: "actions",
    toolSurfaceId: "actions-tools",
    sourceDir: "capabilities/actions",
    grantToAllAgents: true,
    contracts: actionsToolContracts,
    guidance: { sourcePath: "capabilities/actions/GUIDANCE.ts" },
  }),
  defineAgentCapabilityManifest({
    slug: "proposals",
    toolSurfaceId: "proposals-tools",
    sourceDir: "capabilities/proposals",
    grantToAllAgents: true,
    contracts: proposalsToolContracts,
    guidance: { sourcePath: "capabilities/proposals/GUIDANCE.ts" },
  }),
  defineAgentCapabilityManifest({
    slug: "profile-links",
    toolSurfaceId: "profile-links-tools",
    sourceDir: "capabilities/profile-links",
    grantToAllAgents: true,
    contracts: profileLinksToolContracts,
    guidance: {
      sourcePath: "capabilities/profile-links/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG["public-web"].slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG["public-web"].pluginId,
    sourceDir: "capabilities/public-web",
    contracts: publicWebToolContracts,
    guidance: {
      sourcePath: "capabilities/public-web/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG["microsoft-onedrive"].slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG["microsoft-onedrive"].pluginId,
    sourceDir: "capabilities/microsoft-onedrive",
    contracts: microsoftOnedriveToolContracts,
    guidance: {
      sourcePath: "capabilities/microsoft-onedrive/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG["microsoft-sharepoint"].slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG["microsoft-sharepoint"].pluginId,
    sourceDir: "capabilities/microsoft-sharepoint",
    contracts: microsoftSharepointToolContracts,
    guidance: {
      sourcePath: "capabilities/microsoft-sharepoint/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG["microsoft-todo"].slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG["microsoft-todo"].pluginId,
    sourceDir: "capabilities/microsoft-todo",
    contracts: microsoftTodoToolContracts,
    guidance: {
      sourcePath: "capabilities/microsoft-todo/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG["google-drive"].slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG["google-drive"].pluginId,
    sourceDir: "capabilities/google-drive",
    contracts: googleDriveToolContracts,
    guidance: {
      sourcePath: "capabilities/google-drive/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG["google-calendar"].slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG["google-calendar"].pluginId,
    sourceDir: "capabilities/google-calendar",
    contracts: googleCalendarToolContracts,
    guidance: {
      sourcePath: "capabilities/google-calendar/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG["outlook-calendar"].slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG["outlook-calendar"].pluginId,
    sourceDir: "capabilities/outlook-calendar",
    contracts: outlookCalendarToolContracts,
    guidance: {
      sourcePath: "capabilities/outlook-calendar/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG.gmail.slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG.gmail.pluginId,
    sourceDir: "capabilities/gmail",
    contracts: gmailToolContracts,
    guidance: {
      sourcePath: "capabilities/gmail/GUIDANCE.ts",
    },
    readiness: {
      requiresSetup: true,
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG["outlook-mail"].slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG["outlook-mail"].pluginId,
    sourceDir: "capabilities/outlook-mail",
    contracts: outlookMailToolContracts,
    guidance: {
      sourcePath: "capabilities/outlook-mail/GUIDANCE.ts",
    },
    readiness: {
      requiresSetup: true,
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG.monday.slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG.monday.pluginId,
    sourceDir: "capabilities/monday",
    contracts: mondayToolContracts,
    guidance: {
      sourcePath: "capabilities/monday/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG["document-tools"].slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG["document-tools"].pluginId,
    sourceDir: "capabilities/document-tools",
    contracts: documentToolContracts,
    guidance: {
      sourcePath: "capabilities/document-tools/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG["file-analysis"].slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG["file-analysis"].pluginId,
    sourceDir: "capabilities/file-analysis",
    contracts: fileAnalysisToolContracts,
    guidance: {
      sourcePath: "capabilities/file-analysis/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG.boldsign.slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG.boldsign.pluginId,
    sourceDir: "capabilities/boldsign",
    contracts: boldsignToolContracts,
    guidance: {
      sourcePath: "capabilities/boldsign/GUIDANCE.ts",
    },
  }),
  defineAgentCapabilityManifest({
    slug: PROFILE_CAPABILITY_CATALOG.phone.slug,
    toolSurfaceId: PROFILE_CAPABILITY_CATALOG.phone.pluginId,
    sourceDir: "capabilities/phone",
    contracts: phoneToolContracts,
    guidance: {
      sourcePath: "capabilities/phone/GUIDANCE.ts",
    },
    readiness: {
      requiresSetup: true,
    },
  }),
];

export const INTERNAL_PROFILE_TOOL_CONTRACTS = [
  ...profileContextToolContracts,
  ...timeToolContracts,
  ...workToolContracts,
  ...scheduledTasksToolContracts,
  ...actionsToolContracts,
  ...proposalsToolContracts,
  ...profileLinksToolContracts,
] as const;

/** Ordered consistently for tool inventory and stable diffs. */
export const ASSISTANT_CAPABILITIES: readonly AssistantCapabilitySpec[] =
  AGENT_CAPABILITY_MANIFESTS.map(capabilitySpecFromManifest);

const contractsByCapabilitySurfaceId = Object.fromEntries(
  AGENT_CAPABILITY_MANIFESTS.map((entry) => [entry.toolSurfaceId, entry.contracts] as const),
) satisfies Record<string, readonly ToolContract[]>;

const contractBearingCapabilitySurfaceIds = new Set([
  ...ASSISTANT_CAPABILITIES.map((p) => p.toolSurfaceId),
]);

for (const toolSurfaceId of Object.keys(contractsByCapabilitySurfaceId)) {
  if (!contractBearingCapabilitySurfaceIds.has(toolSurfaceId)) {
    throw new Error(
      `assistant-capability-surface: contracts map has "${toolSurfaceId}" but ASSISTANT_CAPABILITIES has no matching toolSurfaceId (remove stale entry or add capability).`,
    );
  }
}
for (const toolSurfaceId of ASSISTANT_CAPABILITIES.map((p) => p.toolSurfaceId)) {
  if (!(toolSurfaceId in contractsByCapabilitySurfaceId)) {
    throw new Error(
      `assistant-capability-surface: ASSISTANT_CAPABILITIES includes toolSurfaceId "${toolSurfaceId}" but contractsByCapabilitySurfaceId has no entry (add contracts import).`,
    );
  }
}

/** Backend agent tool registry order follows the capability registry order. */
export const ALL_LOCAL_AGENT_TOOL_CONTRACTS: readonly ToolContract[] = [
  ...AGENT_CAPABILITY_MANIFESTS.flatMap((entry) => entry.contracts),
];

const bySlug = new Map(ASSISTANT_CAPABILITIES.map((p) => [p.slug, p]));

const capabilitySpecByToolSurfaceId = new Map(
  ASSISTANT_CAPABILITIES.map((spec) => [spec.toolSurfaceId, spec]),
);
const capabilitySpecBySlug = new Map(ASSISTANT_CAPABILITIES.map((spec) => [spec.slug, spec]));

function sortUniq(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function assistantCapabilityForProfileSlug(slug: string): AssistantCapabilitySpec {
  const spec = bySlug.get(slug);
  if (!spec) {
    throw new Error(
      `Unknown capability slug "${slug}". Add it to @ai-assistants/assistant-capability-surface ASSISTANT_CAPABILITIES (or fix the typo in profiles).`,
    );
  }
  return spec;
}

function assistantCapabilitiesForProfileSlugs(
  capabilitySlugs: readonly string[],
): AssistantCapabilitySpec[] {
  return capabilitySlugs.map(assistantCapabilityForProfileSlug);
}

function uniqueAssistantCapabilities(
  specs: readonly AssistantCapabilitySpec[],
): AssistantCapabilitySpec[] {
  const toolSurfaceIds = new Set(specs.map((spec) => spec.toolSurfaceId));
  return ASSISTANT_CAPABILITIES.filter((spec) => toolSurfaceIds.has(spec.toolSurfaceId));
}

export function allGrantToAllAgentCapabilities(): AssistantCapabilitySpec[] {
  return ASSISTANT_CAPABILITIES.filter((p) => p.grantToAllAgents);
}

export function allGrantToMainAgentCapabilities(): AssistantCapabilitySpec[] {
  return ASSISTANT_CAPABILITIES.filter((p) => p.grantToMainAgents);
}

export function assistantCapabilitiesForMainAgent(
  capabilitySlugs: readonly string[],
): AssistantCapabilitySpec[] {
  return uniqueAssistantCapabilities([
    ...allGrantToAllAgentCapabilities(),
    ...allGrantToMainAgentCapabilities(),
    ...assistantCapabilitiesForProfileSlugs(capabilitySlugs),
  ]);
}

export function coreCapabilitiesForMainAgent(): AssistantCapabilitySpec[] {
  return uniqueAssistantCapabilities([
    ...allGrantToAllAgentCapabilities(),
    ...allGrantToMainAgentCapabilities(),
  ]);
}

export function toolSearchEligibleCapabilitiesForMainAgent(
  capabilitySlugs: readonly string[],
): AssistantCapabilitySpec[] {
  const directToolSurfaceIds = new Set(
    coreCapabilitiesForMainAgent().map((spec) => spec.toolSurfaceId),
  );
  return uniqueAssistantCapabilities(assistantCapabilitiesForProfileSlugs(capabilitySlugs)).filter(
    (spec) => !directToolSurfaceIds.has(spec.toolSurfaceId),
  );
}

export function toolSurfaceIdsForProfileSlugs(capabilitySlugs: readonly string[]): string[] {
  return sortUniq(
    assistantCapabilitiesForProfileSlugs(capabilitySlugs).map((spec) => spec.toolSurfaceId),
  );
}

export function allGrantToAllAgentCapabilitySurfaceIds(): string[] {
  return ASSISTANT_CAPABILITIES.filter((p) => p.grantToAllAgents).map((p) => p.toolSurfaceId);
}

export function allGrantToMainAgentCapabilitySurfaceIds(): string[] {
  return ASSISTANT_CAPABILITIES.filter((p) => p.grantToMainAgents).map((p) => p.toolSurfaceId);
}

export function contractsForCapabilitySurfaceId(toolSurfaceId: string): readonly ToolContract[] {
  const contracts = (
    contractsByCapabilitySurfaceId as Record<string, readonly ToolContract[] | undefined>
  )[toolSurfaceId];
  if (!contracts)
    throw new Error(`No contract export registered for capability surface ${toolSurfaceId}.`);
  return contracts;
}

function assistantCapabilitySpecForToolSurfaceId(toolSurfaceId: string): AssistantCapabilitySpec {
  const spec = capabilitySpecByToolSurfaceId.get(toolSurfaceId);
  if (!spec)
    throw new Error(`No assistant capability spec registered for tool surface ${toolSurfaceId}.`);
  return spec;
}

export function assistantCapabilitySpecForSlug(slug: string): AssistantCapabilitySpec {
  const spec = capabilitySpecBySlug.get(slug);
  if (!spec) throw new Error(`No assistant capability spec registered for slug ${slug}.`);
  return spec;
}

export function allAssistantCapabilityContracts(): ToolContract[] {
  return [...ALL_LOCAL_AGENT_TOOL_CONTRACTS];
}

export function allAlwaysAvailableAgentToolContracts(): ToolContract[] {
  return [...builtinToolContractsForMainAgent(), ...profileFileToolContracts];
}

export function allAssistantCapabilityToolNames(): string[] {
  return sorted(allAssistantCapabilityContracts().map((contract) => contract.name));
}

export function allBuiltinContractToolNames(): string[] {
  return sorted(builtinToolContracts.map((contract) => contract.name));
}

export function builtinToolContractsForInventory(): ToolContract[] {
  return [...builtinToolContracts];
}

const MAIN_AGENT_BUILTIN_TOOL_NAMES = ["message", "llm-task"] as const;

export function builtinToolContractsForMainAgent(): ToolContract[] {
  const byName = new Map(builtinToolContracts.map((contract) => [contract.name, contract]));
  return MAIN_AGENT_BUILTIN_TOOL_NAMES.map((toolName) => {
    const contract = byName.get(toolName);
    if (!contract) throw new Error(`Unknown main-agent builtin tool ${toolName}.`);
    return contract;
  });
}

export function coreContractsForMainAgentCapabilities(): ToolContract[] {
  const contracts: ToolContract[] = [...builtinToolContractsForMainAgent()];
  for (const spec of coreCapabilitiesForMainAgent()) {
    contracts.push(...contractsForCapabilitySurfaceId(spec.toolSurfaceId));
  }
  return contracts;
}

export function toolSearchEligibleContractsForMainAgentCapabilities(
  capabilitySlugs: readonly string[],
): ToolContract[] {
  const contracts: ToolContract[] = [];
  for (const spec of toolSearchEligibleCapabilitiesForMainAgent(capabilitySlugs)) {
    contracts.push(...contractsForCapabilitySurfaceId(spec.toolSurfaceId));
  }
  return contracts;
}

export function contractsForMainAgentCapabilities(
  capabilitySlugs: readonly string[],
): ToolContract[] {
  return [
    ...coreContractsForMainAgentCapabilities(),
    ...toolSearchEligibleContractsForMainAgentCapabilities(capabilitySlugs),
  ];
}

export function toolNamesForMainAgentCapabilities(capabilitySlugs: readonly string[]): string[] {
  return sorted(
    contractsForMainAgentCapabilities(capabilitySlugs).map((contract) => contract.name),
  );
}

function capabilitySurfaceIdForToolName(toolName: string): string | null {
  let found: string | null = null;
  for (const [toolSurfaceId, contracts] of Object.entries(contractsByCapabilitySurfaceId)) {
    if (!contracts.some((contract) => contract.name === toolName)) continue;
    if (found)
      throw new Error(`Tool ${toolName} is registered by both ${found} and ${toolSurfaceId}.`);
    found = toolSurfaceId;
  }
  return found;
}

export function capabilitySlugForToolName(toolName: string): string | null {
  const toolSurfaceId = capabilitySurfaceIdForToolName(toolName);
  if (!toolSurfaceId) return null;
  return assistantCapabilitySpecForToolSurfaceId(toolSurfaceId).slug;
}
