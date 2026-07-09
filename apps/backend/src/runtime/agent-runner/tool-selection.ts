import { ASSISTANT_CAPABILITIES } from "@ai-assistants/assistant-capability-surface";
import type { Profile } from "@ai-assistants/control-db";
import type { ToolContract } from "@ai-assistants/tool-contracts";
import { z } from "zod";
import {
  CHEAP_STRUCTURED_DECISION_MODEL,
  cheapStructuredDecision,
  renderSanitizedJsonForLlm,
  truncateForLlmPrompt,
} from "../../product/llm-decisions/cheap-structured-decision";
import type { ProfileAssistantTaskGuidanceContext } from "./guidance-selection";

const TOOL_SELECTION_TIMEOUT_MS = 4_000;
const TOOL_SELECTION_MAX_OUTPUT_TOKENS = 700;
const TOOL_LABEL_MAX_CHARS = 96;
const CURRENT_PROMPT_MAX_CHARS = 4_000;
const RECENT_MESSAGES_MAX_CHARS = 8_000;
const TASK_CONTEXT_MAX_CHARS = 6_000;

const toolSelectionSchema = z
  .object({
    toolSurfaceIds: z
      .array(z.string().trim().min(1))
      .max(30)
      .default([])
      .describe("Candidate tool surface ids to grant to the main assistant."),
    toolNames: z
      .array(z.string().trim().min(1))
      .max(80)
      .default([])
      .describe("Exact candidate tool names to grant when a whole surface is unnecessary."),
  })
  .strict();

type ToolSelectionLlmOutput = z.infer<typeof toolSelectionSchema>;

export type ProfileAssistantToolSelectionMode = "explicit" | "llm" | "fallback_all";

export type ProfileAssistantToolSelection = {
  mode: ProfileAssistantToolSelectionMode;
  toolContracts: readonly ToolContract[];
  candidateToolCount: number;
  candidateToolSurfaceCount: number;
  selectedToolSurfaceIds: string[];
  selectedToolNames: string[];
  ignoredToolSurfaceIds: string[];
  ignoredToolNames: string[];
  model: string | null;
  error: Record<string, unknown> | null;
};

const TOOL_SURFACE_DESCRIPTIONS: Record<string, string> = {
  "actions-tools":
    "Approval and external-action lifecycle tools for profile actions that require review or durable outcome tracking.",
  "boldsign-tools":
    "BoldSign document-signature tools for finding templates, preparing signature requests, sending them, and checking signature status.",
  "document-tools":
    "Document generation and conversion tools for producing structured files such as PDFs or document artifacts.",
  "file-analysis-tools":
    "File/media inspection tools for extracting text, summaries, and structured facts from saved attachments or profile files.",
  "gmail-tools":
    "Gmail tools for searching, reading, drafting, sending, labeling, archiving, and managing Gmail messages.",
  "google-calendar-tools":
    "Google Calendar tools for calendar discovery, event lookup, availability, creating, updating, and deleting calendar events.",
  "google-drive-tools":
    "Google Drive tools for finding, reading, creating, updating, organizing, sharing, and exporting Drive files.",
  "microsoft-onedrive-tools":
    "Microsoft OneDrive tools for browsing, reading, creating, updating, moving, sharing, and deleting OneDrive files.",
  "microsoft-sharepoint-tools":
    "Microsoft SharePoint tools for site/drive/file discovery and SharePoint document writes.",
  "microsoft-todo-tools": "Microsoft To Do tools for reading and changing task lists and tasks.",
  "monday-tools":
    "Monday.com tools for reading boards/items/columns/users and creating or updating Monday work records.",
  "outlook-calendar-tools":
    "Outlook Calendar tools for calendar discovery, event lookup, availability, creating, updating, and deleting calendar events.",
  "outlook-mail-tools":
    "Outlook Mail tools for searching, reading, drafting, sending, moving, and managing Outlook messages.",
  "phone-tools": "Phone-call tools for placing, inspecting, and managing assistant-owned calls.",
  "profile-context-tools":
    "Profile context tools for reading or updating durable assistant/client context and profile facts.",
  "profile-files":
    "Profile file tools for listing, saving, reading metadata, and sending stored files or current-turn attachments.",
  "profile-links-tools":
    "Profile link tools for managing durable links and references associated with the client profile.",
  "proposals-tools":
    "Proposal tools for creating, reviewing, updating, and tracking proposal records.",
  "public-web-tools":
    "Public web tools for live web research, page fetching, browser-backed extraction, and public internet lookup.",
  "scheduled-tasks-tools":
    "Scheduled task and reminder tools for creating, listing, updating, pausing, or deleting assistant schedules.",
  "time-tools":
    "Time tools for current date/time, timezone-aware time calculations, and scheduling interpretation.",
  "work-tools":
    "Work item and route tools for durable assistant work queues, provider-event routes, and work item status.",
};

const capabilityBySurfaceId = new Map(
  ASSISTANT_CAPABILITIES.map((capability) => [capability.toolSurfaceId, capability]),
);

function uniqSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function contractSurfaceId(contract: ToolContract): string {
  return contract.pluginId;
}

function renderProfileContext(profile: Profile): string {
  return renderSanitizedJsonForLlm(
    {
      profileId: profile.id,
      displayName: profile.display_name,
      timezone: profile.timezone,
    },
    2_000,
  );
}

function renderTaskContext(context: ProfileAssistantTaskGuidanceContext | undefined): string {
  if (!context) return "(none)";
  return renderSanitizedJsonForLlm(
    {
      kind: context.kind,
      title: context.title ?? null,
      detail: context.detail ?? null,
      instructions: context.instructions ?? null,
      payload: context.payload ?? null,
    },
    TASK_CONTEXT_MAX_CHARS,
  );
}

function surfaceDescription(toolSurfaceId: string): string {
  const explicitDescription = TOOL_SURFACE_DESCRIPTIONS[toolSurfaceId];
  if (explicitDescription) return explicitDescription;
  const capability = capabilityBySurfaceId.get(toolSurfaceId);
  return capability
    ? `Tools owned by the ${capability.slug} capability.`
    : `Tools owned by the ${toolSurfaceId} capability surface.`;
}

function groupContractsBySurface(
  contracts: readonly ToolContract[],
): Array<{ toolSurfaceId: string; contracts: ToolContract[] }> {
  const groups = new Map<string, ToolContract[]>();
  for (const contract of contracts) {
    const toolSurfaceId = contractSurfaceId(contract);
    const existing = groups.get(toolSurfaceId);
    if (existing) {
      existing.push(contract);
    } else {
      groups.set(toolSurfaceId, [contract]);
    }
  }
  return [...groups.entries()].map(([toolSurfaceId, groupedContracts]) => ({
    toolSurfaceId,
    contracts: groupedContracts,
  }));
}

function renderToolCandidateSurface(input: {
  toolSurfaceId: string;
  contracts: readonly ToolContract[];
}): string {
  const capability = capabilityBySurfaceId.get(input.toolSurfaceId);
  const toolLines = input.contracts
    .map((contract) => {
      const label = truncateForLlmPrompt(contract.label, TOOL_LABEL_MAX_CHARS).replace(/\n/g, " ");
      return `  - ${contract.name} (${contract.effect}; ${label})`;
    })
    .join("\n");
  return [
    `Surface id: ${input.toolSurfaceId}`,
    `Capability slug: ${capability?.slug ?? "(unknown)"}`,
    `Use when: ${surfaceDescription(input.toolSurfaceId)}`,
    `Tools (${input.contracts.length}):`,
    toolLines,
  ].join("\n");
}

function renderToolSelectionPrompt(input: {
  profile: Profile;
  currentPrompt: string;
  recentMessages: readonly unknown[];
  taskContext?: ProfileAssistantTaskGuidanceContext | undefined;
  candidateToolContracts: readonly ToolContract[];
}): string {
  const surfaces = groupContractsBySurface(input.candidateToolContracts)
    .map((surface) => renderToolCandidateSurface(surface))
    .join("\n\n");
  return [
    "Choose which backend tools the main profile assistant should receive for this one turn.",
    "",
    "Rules:",
    "- Return only candidate surface ids or candidate tool names listed below.",
    "- Return empty arrays when the assistant can answer conversationally without backend tools.",
    "- Greetings, thanks, acknowledgements, short small talk, and simple clarification questions usually need no backend tools.",
    "- Select a surface when the user likely needs live provider data, durable profile state, files, scheduling, reminders, approvals, external writes, or web research from that surface.",
    "- Select exact tool names when one or two narrow tools are enough and the whole surface is unnecessary.",
    "- If provider ownership is ambiguous, include the plausible provider surfaces rather than guessing.",
    "- Do not select tools just because they might be useful later; select tools for the current user turn.",
    "",
    "Profile:",
    renderProfileContext(input.profile),
    "",
    "Current user message:",
    truncateForLlmPrompt(input.currentPrompt, CURRENT_PROMPT_MAX_CHARS),
    "",
    "Recent messages:",
    renderSanitizedJsonForLlm(input.recentMessages.slice(-8), RECENT_MESSAGES_MAX_CHARS),
    "",
    "Task context:",
    renderTaskContext(input.taskContext),
    "",
    "Candidate tool surfaces:",
    surfaces || "(none)",
  ].join("\n");
}

function selectedContractsFromLlmOutput(input: {
  candidateToolContracts: readonly ToolContract[];
  output: ToolSelectionLlmOutput;
}): {
  toolContracts: readonly ToolContract[];
  ignoredToolSurfaceIds: string[];
  ignoredToolNames: string[];
} {
  const candidateSurfaceIds = new Set(
    input.candidateToolContracts.map((contract) => contractSurfaceId(contract)),
  );
  const candidateToolNames = new Set(input.candidateToolContracts.map((contract) => contract.name));
  const requestedSurfaceIds = uniqSorted(input.output.toolSurfaceIds);
  const requestedToolNames = uniqSorted(input.output.toolNames);
  const validSurfaceIds = new Set(
    requestedSurfaceIds.filter((toolSurfaceId) => candidateSurfaceIds.has(toolSurfaceId)),
  );
  const validToolNames = new Set(
    requestedToolNames.filter((toolName) => candidateToolNames.has(toolName)),
  );
  const toolContracts = input.candidateToolContracts.filter(
    (contract) =>
      validSurfaceIds.has(contractSurfaceId(contract)) || validToolNames.has(contract.name),
  );
  return {
    toolContracts,
    ignoredToolSurfaceIds: requestedSurfaceIds.filter(
      (toolSurfaceId) => !candidateSurfaceIds.has(toolSurfaceId),
    ),
    ignoredToolNames: requestedToolNames.filter((toolName) => !candidateToolNames.has(toolName)),
  };
}

function selectionFromContracts(input: {
  mode: ProfileAssistantToolSelectionMode;
  candidateToolContracts: readonly ToolContract[];
  selectedToolContracts: readonly ToolContract[];
  ignoredToolSurfaceIds?: readonly string[] | undefined;
  ignoredToolNames?: readonly string[] | undefined;
  model: string | null;
  error?: Record<string, unknown> | null | undefined;
}): ProfileAssistantToolSelection {
  return {
    mode: input.mode,
    toolContracts: input.selectedToolContracts,
    candidateToolCount: input.candidateToolContracts.length,
    candidateToolSurfaceCount: new Set(
      input.candidateToolContracts.map((contract) => contractSurfaceId(contract)),
    ).size,
    selectedToolSurfaceIds: uniqSorted(
      input.selectedToolContracts.map((contract) => contractSurfaceId(contract)),
    ),
    selectedToolNames: uniqSorted(input.selectedToolContracts.map((contract) => contract.name)),
    ignoredToolSurfaceIds: uniqSorted(input.ignoredToolSurfaceIds ?? []),
    ignoredToolNames: uniqSorted(input.ignoredToolNames ?? []),
    model: input.model,
    error: input.error ?? null,
  };
}

export function explicitProfileAssistantToolSelection(
  toolContracts: readonly ToolContract[],
): ProfileAssistantToolSelection {
  return selectionFromContracts({
    mode: "explicit",
    candidateToolContracts: toolContracts,
    selectedToolContracts: toolContracts,
    model: null,
  });
}

export async function selectProfileAssistantTools(input: {
  profile: Profile;
  currentPrompt: string;
  recentMessages: readonly unknown[];
  taskContext?: ProfileAssistantTaskGuidanceContext | undefined;
  candidateToolContracts: readonly ToolContract[];
}): Promise<ProfileAssistantToolSelection> {
  if (!input.candidateToolContracts.length) {
    return selectionFromContracts({
      mode: "llm",
      candidateToolContracts: input.candidateToolContracts,
      selectedToolContracts: [],
      model: null,
    });
  }

  const result = await cheapStructuredDecision({
    profileId: input.profile.id,
    diagnosticKind: "profile_assistant_tool_selection",
    schema: toolSelectionSchema,
    outputName: "ProfileAssistantToolSelection",
    outputDescription:
      "Backend tool surface ids and exact tool names selected for one assistant turn.",
    instructions:
      "Return the smallest useful set of backend tools for the current turn. Return empty arrays when no backend tool is needed.",
    prompt: renderToolSelectionPrompt(input),
    timeoutMs: TOOL_SELECTION_TIMEOUT_MS,
    maxOutputTokens: TOOL_SELECTION_MAX_OUTPUT_TOKENS,
    model: CHEAP_STRUCTURED_DECISION_MODEL,
    attrs: {
      candidate_tool_count: input.candidateToolContracts.length,
      candidate_tool_surface_count: groupContractsBySurface(input.candidateToolContracts).length,
    },
  });

  if (!result.ok) {
    return selectionFromContracts({
      mode: "fallback_all",
      candidateToolContracts: input.candidateToolContracts,
      selectedToolContracts: input.candidateToolContracts,
      model: CHEAP_STRUCTURED_DECISION_MODEL,
      error: result.error,
    });
  }

  const selected = selectedContractsFromLlmOutput({
    candidateToolContracts: input.candidateToolContracts,
    output: result.value,
  });

  return selectionFromContracts({
    mode: "llm",
    candidateToolContracts: input.candidateToolContracts,
    selectedToolContracts: selected.toolContracts,
    ignoredToolSurfaceIds: selected.ignoredToolSurfaceIds,
    ignoredToolNames: selected.ignoredToolNames,
    model: CHEAP_STRUCTURED_DECISION_MODEL,
  });
}
