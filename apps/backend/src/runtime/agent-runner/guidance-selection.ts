import type { Profile } from "@ai-assistants/control-db";
import {
  createDeepSeekModel,
  generateLlmObject,
  llmErrorDiagnostics,
} from "@ai-assistants/llm-client";
import {
  compactGuidanceIndex,
  compactProfileGuidanceIndex,
  guidanceSelectionSchema,
  renderGuidanceSelectorPrompt,
  renderTurnMessageEvidence,
  resolveRuntimeGuidance,
  sourceGuidanceIdsForExactToolNames,
  sourceGuidanceIdsForTaskKeywords,
  type ProfileGuidanceMarkdownRecord,
  type RuntimeGuidanceRegistry,
} from "@ai-assistants/runtime-guidance";
import type { ToolContract } from "@ai-assistants/tool-contracts";
import { CHEAP_STRUCTURED_DECISION_MODEL } from "../../product/llm-decisions/cheap-structured-decision";
import {
  loadProfileAssistantGuidanceMarkdown,
  type ProfileAssistantGuidanceRegistry,
} from "./guidance-registry";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";

const GUIDANCE_SELECTION_TIMEOUT_MS = 4_000;

export type ProfileAssistantTaskGuidanceContext = {
  kind: string;
  title?: string | undefined;
  detail?: string | null | undefined;
  instructions?: string | undefined;
  payload?: Record<string, unknown> | undefined;
};

export type ProfileAssistantGuidanceSelection = {
  sourceGuidanceIds: string[];
  profileGuidanceDbIds: string[];
  selectedProfileGuidance: ProfileGuidanceMarkdownRecord[];
  markdown: string | null;
  taskEvidence: string;
  model: string | null;
  error: Record<string, unknown> | null;
};

function uniqTrimmed(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function availableSourceIds(registry: RuntimeGuidanceRegistry | null): Set<string> {
  return new Set((registry?.guidance ?? []).map((entry) => entry.id));
}

function renderProfileContext(profile: Profile): string {
  return JSON.stringify(
    {
      profileId: profile.id,
      displayName: profile.display_name,
      timezone: profile.timezone,
    },
    null,
    2,
  );
}

function renderTaskContext(context: ProfileAssistantTaskGuidanceContext | undefined): string {
  if (!context) return "(none)";
  return JSON.stringify(
    {
      kind: context.kind,
      title: context.title ?? null,
      detail: context.detail ?? null,
      instructions: context.instructions ?? null,
      payload: context.payload ?? null,
    },
    null,
    2,
  );
}

function renderToolCoverageForTurn(toolContracts: readonly ToolContract[]): string {
  const names = toolContracts
    .filter((contract) => contract.executionKind === "backend_proxy")
    .map((contract) => contract.name)
    .sort();
  return names.length ? names.join(", ") : "(none)";
}

export function renderProfileAssistantGuidanceTaskEvidence(input: {
  profile: Profile;
  currentPrompt: string;
  recentMessages: readonly unknown[];
  taskContext?: ProfileAssistantTaskGuidanceContext | undefined;
  toolContracts: readonly ToolContract[];
}): string {
  return [
    "Profile context:",
    renderProfileContext(input.profile),
    "",
    "Task context:",
    renderTaskContext(input.taskContext),
    "",
    "Available backend tools:",
    renderToolCoverageForTurn(input.toolContracts),
    "",
    renderTurnMessageEvidence({
      currentPrompt: input.currentPrompt,
      messages: input.recentMessages,
    }),
  ].join("\n");
}

function renderProfileAssistantGuidanceSelectorEvidence(input: {
  profile: Profile;
  currentPrompt: string;
  recentMessages: readonly unknown[];
  taskContext?: ProfileAssistantTaskGuidanceContext | undefined;
}): string {
  return [
    "Profile context:",
    renderProfileContext(input.profile),
    "",
    "Task context:",
    renderTaskContext(input.taskContext),
    "",
    renderTurnMessageEvidence({
      currentPrompt: input.currentPrompt,
      messages: input.recentMessages,
    }),
  ].join("\n");
}

async function selectGuidanceWithLlm(input: {
  profileId: string;
  registry: RuntimeGuidanceRegistry | null;
  profileGuidanceIndex: ProfileAssistantGuidanceRegistry["profileGuidanceIndex"];
  taskEvidence: string;
}): Promise<{ sourceGuidanceIds: string[]; profileGuidanceDbIds: string[] }> {
  const selection = await generateLlmObject({
    model: createDeepSeekModel({ model: CHEAP_STRUCTURED_DECISION_MODEL }),
    schema: guidanceSelectionSchema,
    outputName: "GuidanceSelection",
    outputDescription: "Runtime guidance ids selected from the supplied guidance index.",
    instructions: "Return only known source guidance ids and profile guidance ids that are useful.",
    input: renderGuidanceSelectorPrompt({
      profileId: input.profileId,
      compactGuidanceIndex: input.registry ? compactGuidanceIndex(input.registry) : "",
      compactProfileGuidanceIndex: compactProfileGuidanceIndex(input.profileGuidanceIndex),
      task: input.taskEvidence,
    }),
    temperature: 0,
    timeout: GUIDANCE_SELECTION_TIMEOUT_MS,
    callAttempts: 1,
    repairAttempts: 0,
  });
  return {
    sourceGuidanceIds: selection.guidanceIds,
    profileGuidanceDbIds: selection.profileGuidanceDbIds,
  };
}

export async function selectProfileAssistantGuidance(input: {
  db: SupabaseServiceClient;
  profile: Profile;
  registry: ProfileAssistantGuidanceRegistry;
  currentPrompt: string;
  recentMessages: readonly unknown[];
  taskContext?: ProfileAssistantTaskGuidanceContext | undefined;
  toolContracts: readonly ToolContract[];
}): Promise<ProfileAssistantGuidanceSelection> {
  const taskEvidence = renderProfileAssistantGuidanceSelectorEvidence({
    profile: input.profile,
    currentPrompt: input.currentPrompt,
    recentMessages: input.recentMessages,
    taskContext: input.taskContext,
  });
  const validSourceIds = availableSourceIds(input.registry.sourceGuidance);
  const validProfileGuidanceDbIds = new Set(
    input.registry.profileGuidanceIndex.map((entry) => entry.id),
  );
  const deterministicSourceIds = input.registry.sourceGuidance
    ? uniqTrimmed([
        ...sourceGuidanceIdsForExactToolNames(input.registry.sourceGuidance, taskEvidence),
        ...sourceGuidanceIdsForTaskKeywords(input.registry.sourceGuidance, taskEvidence),
      ])
    : [];

  let llmSourceGuidanceIds: string[] = [];
  let llmProfileGuidanceDbIds: string[] = [];
  let error: Record<string, unknown> | null = null;
  if ((input.registry.sourceGuidance?.guidance.length ?? 0) > 0 || validProfileGuidanceDbIds.size) {
    try {
      const selection = await selectGuidanceWithLlm({
        profileId: input.profile.id,
        registry: input.registry.sourceGuidance,
        profileGuidanceIndex: input.registry.profileGuidanceIndex,
        taskEvidence,
      });
      llmSourceGuidanceIds = selection.sourceGuidanceIds;
      llmProfileGuidanceDbIds = selection.profileGuidanceDbIds;
    } catch (selectionError) {
      error = llmErrorDiagnostics(selectionError);
    }
  }

  const sourceGuidanceIds = uniqTrimmed([
    ...deterministicSourceIds,
    ...llmSourceGuidanceIds.filter((id) => validSourceIds.has(id)),
  ]);
  const profileGuidanceDbIds = uniqTrimmed(
    llmProfileGuidanceDbIds.filter((id) => validProfileGuidanceDbIds.has(id)),
  );
  const selectedProfileGuidance =
    profileGuidanceDbIds.length > 0
      ? await loadProfileAssistantGuidanceMarkdown(input.db, {
          profileId: input.profile.id,
          profileGuidanceDbIds,
        })
      : [];
  const resolved = resolveRuntimeGuidance(
    input.registry.sourceGuidance,
    sourceGuidanceIds,
    selectedProfileGuidance,
  );
  return {
    sourceGuidanceIds: resolved.ids,
    profileGuidanceDbIds: resolved.profileGuidanceDbIds,
    selectedProfileGuidance,
    markdown: resolved.markdown,
    taskEvidence,
    model: CHEAP_STRUCTURED_DECISION_MODEL,
    error,
  };
}
