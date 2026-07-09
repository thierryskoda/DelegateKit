import { createHash, randomUUID } from "node:crypto";
import { Agent } from "@mastra/core/agent";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { createDeepSeekModel } from "@ai-assistants/llm-client";
import { DomainError, domainCodes, formatUnknownError } from "@ai-assistants/errors";
import { type Json } from "@ai-assistants/control-plane-contracts";
import { profileFileSendOutputSchema } from "@ai-assistants/profile-files-contracts/schemas";
import type { BackendToolExecuteRequest, ToolContract } from "@ai-assistants/tool-contracts";
import { requireAssistantProfile } from "../../auth/assistant-resolution";
import { recordAgentEvent, upsertAgentRun } from "../../product/agent-events/agent-event-ledger";
import { safeAgentEventJsonObject } from "../../product/agent-events/evidence-identity";
import {
  prepareProfileArtifactDeliveryBytes,
  saveProfileArtifactBytes,
} from "../../product/artifacts/artifact-service";
import { recordProfileChannelMessage } from "../../product/channel-messages/channel-message-ledger";
import { backendToolContracts } from "../agent-tools/registry";
import {
  PROFILE_ASSISTANT_MAX_STEPS,
  PROFILE_ASSISTANT_MODEL,
  profileAssistantBaseInstructions,
} from "./assistant-defaults";
import { loadProfileAssistantGuidanceRegistry } from "./guidance-registry";
import {
  renderProfileAssistantGuidanceTaskEvidence,
  selectProfileAssistantGuidance,
  type ProfileAssistantTaskGuidanceContext,
} from "./guidance-selection";
import { contractsToMastraTools } from "./mastra-tool-adapter";
import {
  explicitProfileAssistantToolSelection,
  selectProfileAssistantTools,
  type ProfileAssistantToolSelectionMode,
} from "./tool-selection";

type BackendToolInvocation = BackendToolExecuteRequest["invocation"];

const MAX_INBOUND_ATTACHMENTS = 10;
const MAX_INBOUND_ATTACHMENT_BYTES = 20_000_000;

export type ProfileAssistantOutboundTextAction = {
  kind: "send_text";
  text: string;
};

export type ProfileAssistantOutboundFileAction = {
  kind: "send_file";
  profileFileId: string;
  filename: string;
  mimeType: string | null;
  byteSize: number;
  sha256: string | null;
  contentBase64: string;
  channel: string;
  caption?: string | undefined;
};

export type ProfileAssistantOutboundAction =
  | ProfileAssistantOutboundTextAction
  | ProfileAssistantOutboundFileAction;

export type ProfileAssistantInboundAttachment = {
  filename: string;
  mimeType: string;
  contentBase64: string;
  byteSize?: number | undefined;
  sha256?: string | undefined;
  description?: string | null | undefined;
};

type ProfileAssistantChannelMessageContext = {
  channelId: string;
  conversationId: string;
  accountId?: string | undefined;
  inboundExternalMessageId?: string | undefined;
  outboundExternalMessageId?: string | undefined;
  inboundOccurredAt?: string | undefined;
  outboundOccurredAt?: string | undefined;
  recordInbound?: boolean | undefined;
  recordOutbound?: boolean | undefined;
};

export type RunProfileAssistantTurnInput = {
  db: SupabaseServiceClient;
  agentId: string;
  inputText: string;
  sessionKey: string;
  sessionId?: string | undefined;
  requestId?: string | undefined;
  runKind?: BackendToolInvocation["runKind"] | undefined;
  runKindSource?: BackendToolInvocation["runKindSource"] | undefined;
  instructions?: string | undefined;
  maxSteps?: number | undefined;
  workspaceDir?: string | null | undefined;
  recentMessages?: readonly unknown[] | undefined;
  taskContext?: ProfileAssistantTaskGuidanceContext | undefined;
  inboundAttachments?: readonly ProfileAssistantInboundAttachment[] | undefined;
  channelMessageContext?: ProfileAssistantChannelMessageContext | undefined;
  trustedChannel?: BackendToolExecuteRequest["trustedChannel"] | undefined;
  toolContracts?: readonly ToolContract[] | undefined;
};

export type ProfileAssistantRunMetadata = {
  agentRunId: string;
  mastraRunId: string | null;
  profileId: string;
  agentId: string;
  requestId: string;
  sessionKey: string;
  finishReason: string | undefined;
  toolCallCount: number;
  toolResultCount: number;
  candidateToolCount: number;
  selectedToolCount: number;
  toolSelectionMode: ProfileAssistantToolSelectionMode;
  usage: unknown;
};

export type RunProfileAssistantTurnResult = {
  text: string;
  outboundActions: ProfileAssistantOutboundAction[];
  metadata: ProfileAssistantRunMetadata;
};

function defaultRunnerToolContracts(): readonly ToolContract[] {
  return backendToolContracts.filter((contract) => contract.executionKind === "backend_proxy");
}

function textOutboundActions(text: string): ProfileAssistantOutboundAction[] {
  const trimmed = text.trim();
  return trimmed ? [{ kind: "send_text", text: trimmed }] : [];
}

function mastraRuntimeRunId(runId: string | undefined): string | null {
  const trimmed = runId?.trim();
  return trimmed ? `mastra:${trimmed}` : null;
}

function jsonObject(value: unknown): Record<string, Json> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return safeAgentEventJsonObject(value);
}

function unknownRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requiredTrimmed(value: string, label: string): string {
  const clean = value.trim();
  if (!clean) throw new DomainError(domainCodes.BAD_REQUEST, `${label} is required.`);
  return clean;
}

function optionalTrimmed(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

function optionalSha256(value: string | undefined): string | null {
  const clean = optionalTrimmed(value);
  if (!clean) return null;
  if (!/^[a-f0-9]{64}$/i.test(clean)) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Attachment sha256 must be a SHA-256 hex digest.",
    );
  }
  return clean.toLowerCase();
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeAttachmentBytes(attachment: ProfileAssistantInboundAttachment): Uint8Array {
  const encoded = requiredTrimmed(attachment.contentBase64, "Attachment contentBase64");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength === 0) {
    throw new DomainError(domainCodes.BAD_REQUEST, "Attachment bytes must not be empty.");
  }
  if (bytes.byteLength > MAX_INBOUND_ATTACHMENT_BYTES) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Attachment is ${bytes.byteLength} bytes; max direct intake size is ${MAX_INBOUND_ATTACHMENT_BYTES} bytes.`,
    );
  }
  if (attachment.byteSize !== undefined) {
    if (!Number.isInteger(attachment.byteSize) || attachment.byteSize < 0) {
      throw new DomainError(
        domainCodes.BAD_REQUEST,
        "Attachment byteSize must be a non-negative integer.",
      );
    }
    if (attachment.byteSize !== bytes.byteLength) {
      throw new DomainError(
        domainCodes.CONFLICT,
        `Attachment byteSize ${attachment.byteSize} does not match decoded size ${bytes.byteLength}.`,
      );
    }
  }
  return bytes;
}

type SavedInboundAttachment = {
  profileFileId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  description: string | null;
};

function renderSavedAttachmentContext(
  attachments: readonly SavedInboundAttachment[],
): string | null {
  if (!attachments.length) return null;
  return [
    `Current user turn includes ${attachments.length} saved attachment(s):`,
    ...attachments.map((attachment, index) =>
      [
        `- attachmentIndex: ${index}`,
        `profileFileId: ${attachment.profileFileId}`,
        `filename: ${attachment.filename}`,
        `mimeType: ${attachment.mimeType}`,
        `byteSize: ${attachment.byteSize}`,
        `sha256: ${attachment.sha256}`,
      ].join("; "),
    ),
    "Use file analysis tools when the user asks to inspect attachment contents. Use profile_file_send when the user asks to send a saved attachment or profile file back in this chat.",
  ].join("\n");
}

function taskContextWithSavedAttachments(
  context: ProfileAssistantTaskGuidanceContext | undefined,
  attachments: readonly SavedInboundAttachment[],
): ProfileAssistantTaskGuidanceContext | undefined {
  if (!attachments.length) return context;
  const payload = {
    ...(context?.payload ?? {}),
    currentTurnSavedAttachments: attachments.map((attachment, index) => ({
      attachmentIndex: index,
      profileFileId: attachment.profileFileId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      byteSize: attachment.byteSize,
      sha256: attachment.sha256,
      description: attachment.description,
    })),
  };
  if (!context) {
    return {
      kind: "channel_attachments",
      title: "Current-turn saved attachments",
      detail: "The current user turn included saved file or media attachments.",
      payload,
    };
  }
  return {
    ...context,
    payload,
  };
}

function attachmentIdempotencyKey(input: {
  assistantId: string;
  sessionKey: string;
  requestId: string;
  channelMessageContext?: ProfileAssistantChannelMessageContext | undefined;
  index: number;
  sha256: string;
}): string {
  const messageKey =
    input.channelMessageContext?.inboundExternalMessageId?.trim() || input.requestId;
  return [
    "backend-channel-attachment",
    input.assistantId,
    input.sessionKey,
    messageKey,
    String(input.index),
    input.sha256,
  ].join(":");
}

async function saveInboundAttachments(input: {
  db: SupabaseServiceClient;
  profileId: string;
  assistantId: string;
  sessionKey: string;
  requestId: string;
  attachments?: readonly ProfileAssistantInboundAttachment[] | undefined;
  channelMessageContext?: ProfileAssistantChannelMessageContext | undefined;
}): Promise<SavedInboundAttachment[]> {
  const attachments = input.attachments ?? [];
  if (!attachments.length) return [];
  if (attachments.length > MAX_INBOUND_ATTACHMENTS) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Current turn included ${attachments.length} attachments; max is ${MAX_INBOUND_ATTACHMENTS}.`,
    );
  }

  const saved: SavedInboundAttachment[] = [];
  for (const [index, attachment] of attachments.entries()) {
    const filename = requiredTrimmed(attachment.filename, "Attachment filename");
    const mimeType = requiredTrimmed(attachment.mimeType, "Attachment MIME type");
    const bytes = decodeAttachmentBytes(attachment);
    const actualSha256 = sha256(bytes);
    const expectedSha256 = optionalSha256(attachment.sha256);
    if (expectedSha256 && expectedSha256 !== actualSha256) {
      throw new DomainError(
        domainCodes.CONFLICT,
        `Attachment ${filename} content does not match the expected SHA-256 hash.`,
      );
    }
    const description = optionalTrimmed(attachment.description);
    const result = await saveProfileArtifactBytes(input.db, {
      profileId: input.profileId,
      filename,
      description,
      artifactType: "inbound.media",
      mimeType,
      bytes,
      expectedSha256: actualSha256,
      idempotencyKey: attachmentIdempotencyKey({
        assistantId: input.assistantId,
        sessionKey: input.sessionKey,
        requestId: input.requestId,
        channelMessageContext: input.channelMessageContext,
        index,
        sha256: actualSha256,
      }),
      metadata: safeAgentEventJsonObject({
        intake: "backend_channel_attachment",
        attachmentIndex: index,
        origin: {
          channelId: input.channelMessageContext?.channelId ?? null,
          conversationId: input.channelMessageContext?.conversationId ?? null,
          accountId: input.channelMessageContext?.accountId ?? null,
          inboundExternalMessageId: input.channelMessageContext?.inboundExternalMessageId ?? null,
          sessionKey: input.sessionKey,
          requestId: input.requestId,
        },
      }),
    });
    saved.push({
      profileFileId: result.artifact.id,
      filename: result.artifact.filename,
      mimeType,
      byteSize: result.byteSize,
      sha256: result.sha256,
      description: result.artifact.description,
    });
  }
  return saved;
}

function successfulBackendToolData(result: unknown): Record<string, unknown> | null {
  const envelope = unknownRecord(result);
  if (!envelope) return null;
  const data = unknownRecord(envelope.data);
  if (data) return data;
  const output = unknownRecord(envelope.output);
  if (output && (envelope.status === undefined || envelope.status === "succeeded")) return output;
  const value = unknownRecord(envelope.value);
  if (value) return successfulBackendToolData(value);
  const details = unknownRecord(envelope.details);
  if (details) return successfulBackendToolData(details);
  return null;
}

function mastraToolResultName(toolResult: unknown): string | null {
  const record = unknownRecord(toolResult);
  if (!record) return null;
  const name = record.name ?? record.toolName;
  return typeof name === "string" ? name : null;
}

function mastraToolResultPayload(toolResult: unknown): unknown {
  const record = unknownRecord(toolResult);
  if (!record) return null;
  return "result" in record ? record.result : toolResult;
}

function profileFileSendDataFromToolResults(
  toolResults: readonly unknown[],
): Record<string, unknown>[] {
  return toolResults.flatMap((toolResult) => {
    if (mastraToolResultName(toolResult) !== "profile_file_send") return [];
    const data = successfulBackendToolData(mastraToolResultPayload(toolResult));
    return data ? [data] : [];
  });
}

async function profileFileSendDataFromRecordedEvents(input: {
  db: SupabaseServiceClient;
  agentRunId: string;
}): Promise<Record<string, unknown>[]> {
  const result = await input.db
    .from("agent_events")
    .select("payload")
    .eq("agent_run_id", input.agentRunId)
    .eq("event_type", "assistant.tool.result")
    .order("occurred_at", { ascending: true });
  if (result.error) throw result.error;
  return (result.data ?? []).flatMap((row) => {
    const payload = unknownRecord(row.payload);
    if (!payload || payload.toolName !== "profile_file_send") return [];
    const data = successfulBackendToolData(payload);
    return data ? [data] : [];
  });
}

async function fileOutboundActionsFromToolResults(input: {
  db: SupabaseServiceClient;
  profileId: string;
  agentRunId: string;
  toolResults: readonly unknown[];
}): Promise<ProfileAssistantOutboundFileAction[]> {
  const actions: ProfileAssistantOutboundFileAction[] = [];
  let dataRecords = profileFileSendDataFromToolResults(input.toolResults);
  if (!dataRecords.length) {
    dataRecords = await profileFileSendDataFromRecordedEvents({
      db: input.db,
      agentRunId: input.agentRunId,
    });
  }
  for (const data of dataRecords) {
    const parsed = profileFileSendOutputSchema.safeParse(data);
    if (!parsed.success || parsed.data.status !== "queued_for_current_chat") continue;
    const delivery = await prepareProfileArtifactDeliveryBytes(input.db, {
      profileId: input.profileId,
      artifactId: parsed.data.profileFile.profileFileId,
      expectedSha256: parsed.data.profileFile.sha256 ?? null,
      filename: parsed.data.profileFile.filename,
    });
    actions.push({
      kind: "send_file",
      profileFileId: delivery.artifact.id,
      filename: delivery.filename,
      mimeType: delivery.artifact.mime_type,
      byteSize: delivery.bytes.byteLength,
      sha256: delivery.artifact.sha256,
      contentBase64: Buffer.from(delivery.bytes).toString("base64"),
      channel: parsed.data.channel,
      ...(parsed.data.caption ? { caption: parsed.data.caption } : {}),
    });
  }
  return actions;
}

async function recordRunnerChannelMessage(input: {
  db: SupabaseServiceClient;
  context: ProfileAssistantChannelMessageContext;
  kind: "inbound_received" | "outbound_sent";
  contentText: string;
  agentId: string;
  agentRunId: string;
  sessionKey: string;
  sessionId?: string | undefined;
  externalMessageId?: string | undefined;
  occurredAt?: string | undefined;
}): Promise<void> {
  await recordProfileChannelMessage(input.db, {
    kind: input.kind,
    channelId: input.context.channelId,
    conversationId: input.context.conversationId,
    contentText: input.contentText,
    agentId: input.agentId,
    agentRunId: input.agentRunId,
    sessionKey: input.sessionKey,
    source: "agent_runtime",
    ...(input.context.accountId ? { accountId: input.context.accountId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.externalMessageId ? { externalMessageId: input.externalMessageId } : {}),
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
  });
}

export async function runProfileAssistantTurn(
  input: RunProfileAssistantTurnInput,
): Promise<RunProfileAssistantTurnResult> {
  const requestId = input.requestId?.trim() || randomUUID();
  const { assistant, profile } = await requireAssistantProfile(input.db, input.agentId);
  const candidateToolContracts = input.toolContracts ?? defaultRunnerToolContracts();
  const hasExplicitToolContracts = input.toolContracts !== undefined;
  const agentRun = await upsertAgentRun(input.db, {
    profileId: profile.id,
    agentId: assistant.assistant_id,
    sessionKey: input.sessionKey,
    sessionId: input.sessionId,
    status: "running",
  });
  if (input.channelMessageContext && input.channelMessageContext.recordInbound !== false) {
    await recordRunnerChannelMessage({
      db: input.db,
      context: input.channelMessageContext,
      kind: "inbound_received",
      contentText: input.inputText,
      agentId: assistant.assistant_id,
      agentRunId: agentRun.id,
      sessionKey: input.sessionKey,
      sessionId: input.sessionId,
      externalMessageId: input.channelMessageContext.inboundExternalMessageId,
      occurredAt: input.channelMessageContext.inboundOccurredAt,
    });
  }
  const savedAttachments = await saveInboundAttachments({
    db: input.db,
    profileId: profile.id,
    assistantId: assistant.assistant_id,
    sessionKey: input.sessionKey,
    requestId,
    attachments: input.inboundAttachments,
    channelMessageContext: input.channelMessageContext,
  });
  const attachmentContextMarkdown = renderSavedAttachmentContext(savedAttachments);
  const taskContext = taskContextWithSavedAttachments(input.taskContext, savedAttachments);
  const guidanceRegistryInput = {
    profileId: profile.id,
    ...(input.workspaceDir === undefined ? {} : { workspaceDir: input.workspaceDir }),
  };
  const guidanceRegistry = await loadProfileAssistantGuidanceRegistry(
    input.db,
    guidanceRegistryInput,
  );
  const recentMessages = input.recentMessages ?? [];
  const guidanceSelectionPromise = selectProfileAssistantGuidance({
    db: input.db,
    profile,
    registry: guidanceRegistry,
    currentPrompt: input.inputText,
    recentMessages,
    taskContext,
    toolContracts: candidateToolContracts,
  });
  const toolSelectionPromise = hasExplicitToolContracts
    ? Promise.resolve(explicitProfileAssistantToolSelection(candidateToolContracts))
    : selectProfileAssistantTools({
        profile,
        currentPrompt: input.inputText,
        recentMessages,
        taskContext,
        candidateToolContracts,
      });
  const [selectedGuidance, selectedTools] = await Promise.all([
    guidanceSelectionPromise,
    toolSelectionPromise,
  ]);
  await recordAgentEvent(input.db, {
    profileId: profile.id,
    agentRunId: agentRun.id,
    eventType: "assistant.guidance.selection",
    source: "backend",
    sourceEventKey: `agent_run:${agentRun.id}:assistant.guidance.selection`,
    occurredAt: new Date().toISOString(),
    visibility: "internal",
    payload: {
      eventType: "assistant.guidance.selection",
      sourceGuidanceIds: selectedGuidance.sourceGuidanceIds,
      profileGuidanceDbIds: selectedGuidance.profileGuidanceDbIds,
      selectableSourceGuidanceCount: guidanceRegistry.sourceGuidance?.guidance.length ?? 0,
      selectableProfileGuidanceCount: guidanceRegistry.profileGuidanceIndex.length,
      model: selectedGuidance.model,
      error: selectedGuidance.error ? safeAgentEventJsonObject(selectedGuidance.error) : null,
    },
  });
  await recordAgentEvent(input.db, {
    profileId: profile.id,
    agentRunId: agentRun.id,
    eventType: "assistant.tool.selection",
    source: "backend",
    sourceEventKey: `agent_run:${agentRun.id}:assistant.tool.selection`,
    occurredAt: new Date().toISOString(),
    visibility: "internal",
    payload: {
      eventType: "assistant.tool.selection",
      mode: selectedTools.mode,
      candidateToolCount: selectedTools.candidateToolCount,
      candidateToolSurfaceCount: selectedTools.candidateToolSurfaceCount,
      selectedToolCount: selectedTools.toolContracts.length,
      selectedToolSurfaceIds: selectedTools.selectedToolSurfaceIds,
      selectedToolNames: selectedTools.selectedToolNames,
      ignoredToolSurfaceIds: selectedTools.ignoredToolSurfaceIds,
      ignoredToolNames: selectedTools.ignoredToolNames,
      model: selectedTools.model,
      error: selectedTools.error ? safeAgentEventJsonObject(selectedTools.error) : null,
    },
  });

  const selectedToolContracts = selectedTools.toolContracts;
  const selectedToolTaskEvidence = renderProfileAssistantGuidanceTaskEvidence({
    profile,
    currentPrompt: input.inputText,
    recentMessages,
    taskContext,
    toolContracts: selectedToolContracts,
  });
  const instructions = profileAssistantBaseInstructions({
    profileId: profile.id,
    profileDisplayName: profile.display_name,
    assistantDisplayName: `${profile.display_name} assistant`,
    timezone: profile.timezone,
    instructions: input.instructions,
    selectedGuidanceMarkdown: selectedGuidance.markdown,
    taskEvidenceMarkdown: [selectedToolTaskEvidence, attachmentContextMarkdown]
      .filter((part): part is string => Boolean(part?.trim()))
      .join("\n\n"),
  });
  const tools = contractsToMastraTools(selectedToolContracts, {
    db: input.db,
    profileId: profile.id,
    agentId: assistant.assistant_id,
    agentRunId: agentRun.id,
    sessionKey: input.sessionKey,
    sessionId: input.sessionId,
    requestId,
    runKind: input.runKind ?? "user",
    runKindSource: input.runKindSource ?? "default",
    trustedChannel: input.trustedChannel,
  });
  const agent = new Agent({
    id: assistant.assistant_id,
    name: `${profile.display_name} Assistant`,
    instructions,
    model: createDeepSeekModel({ model: PROFILE_ASSISTANT_MODEL }),
    tools,
  });

  try {
    const output = await agent.generate(input.inputText, {
      runId: agentRun.id,
      maxSteps: input.maxSteps ?? PROFILE_ASSISTANT_MAX_STEPS,
    });
    const endedAt = new Date().toISOString();
    const mastraRunId = mastraRuntimeRunId(output.runId);
    await upsertAgentRun(input.db, {
      id: agentRun.id,
      profileId: profile.id,
      agentId: assistant.assistant_id,
      sessionKey: input.sessionKey,
      sessionId: input.sessionId,
      runtimeRunId: mastraRunId,
      status: "succeeded",
      endedAt,
    });

    const text = output.text.trim();
    const fileOutboundActions = await fileOutboundActionsFromToolResults({
      db: input.db,
      profileId: profile.id,
      agentRunId: agentRun.id,
      toolResults: output.toolResults,
    });
    if (text) {
      await recordAgentEvent(input.db, {
        profileId: profile.id,
        agentRunId: agentRun.id,
        eventType: "assistant.message.text",
        source: "agent_runtime",
        sourceEventKey: `agent_run:${agentRun.id}:assistant.message.text:final`,
        occurredAt: endedAt,
        visibility: "internal",
        payload: {
          eventType: "assistant.message.text",
          text,
          role: "assistant",
          sessionKey: input.sessionKey,
          messageId: null,
        },
      });
      if (input.channelMessageContext && input.channelMessageContext.recordOutbound !== false) {
        await recordRunnerChannelMessage({
          db: input.db,
          context: input.channelMessageContext,
          kind: "outbound_sent",
          contentText: text,
          agentId: assistant.assistant_id,
          agentRunId: agentRun.id,
          sessionKey: input.sessionKey,
          sessionId: input.sessionId,
          externalMessageId: input.channelMessageContext.outboundExternalMessageId,
          occurredAt: input.channelMessageContext.outboundOccurredAt ?? endedAt,
        });
      }
    }
    await recordAgentEvent(input.db, {
      profileId: profile.id,
      agentRunId: agentRun.id,
      eventType: "assistant.model.response",
      source: "agent_runtime",
      sourceEventKey: `agent_run:${agentRun.id}:assistant.model.response:final`,
      occurredAt: endedAt,
      visibility: "internal",
      payload: {
        eventType: "assistant.model.response",
        model: PROFILE_ASSISTANT_MODEL,
        responseId: output.response?.id ?? null,
        usage: jsonObject(output.totalUsage ?? output.usage),
        finishReason: output.finishReason ?? null,
        sessionKey: input.sessionKey,
      },
    });

    return {
      text,
      outboundActions: [...fileOutboundActions, ...textOutboundActions(text)],
      metadata: {
        agentRunId: agentRun.id,
        mastraRunId,
        profileId: profile.id,
        agentId: assistant.assistant_id,
        requestId,
        sessionKey: input.sessionKey,
        finishReason: output.finishReason,
        toolCallCount: output.toolCalls.length,
        toolResultCount: output.toolResults.length,
        candidateToolCount: selectedTools.candidateToolCount,
        selectedToolCount: selectedTools.toolContracts.length,
        toolSelectionMode: selectedTools.mode,
        usage: output.totalUsage ?? output.usage,
      },
    };
  } catch (error) {
    await upsertAgentRun(input.db, {
      id: agentRun.id,
      profileId: profile.id,
      agentId: assistant.assistant_id,
      sessionKey: input.sessionKey,
      sessionId: input.sessionId,
      status: "failed",
      endedAt: new Date().toISOString(),
      failure: {
        message: formatUnknownError(error),
        ...safeAgentEventJsonObject(error),
      },
    });
    throw error;
  }
}
