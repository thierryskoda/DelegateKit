import { randomUUID } from "node:crypto";
import {
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes, formatUnknownError } from "@ai-assistants/errors";
import type { ToolContract } from "@ai-assistants/tool-contracts";
import { timedFetch } from "@ai-assistants/workspace-shared/timed-fetch";
import { requireAssistantProfileByProfileId } from "../../auth/assistant-resolution";
import { recordAgentEvent } from "../agent-events/agent-event-ledger";
import { safeAgentEventJsonObject } from "../agent-events/evidence-identity";
import {
  listProfileChannelMessages,
  recordProfileChannelMessage,
} from "../channel-messages/channel-message-ledger";
import { backendApiEnv } from "../../shared/env";
import {
  runProfileAssistantTurn,
  type ProfileAssistantInboundAttachment,
  type ProfileAssistantOutboundAction,
  type ProfileAssistantOutboundFileAction,
  type ProfileAssistantOutboundTextAction,
  type ProfileAssistantRunMetadata,
  type RunProfileAssistantTurnResult,
} from "../../runtime/agent-runner/profile-assistant-runner";
import type { ProfileAssistantTaskGuidanceContext } from "../../runtime/agent-runner/guidance-selection";
import {
  selectConversationContext,
  type ConversationContextCandidateMessage,
  type ConversationContextSelection,
} from "./conversation-context-selection";

export const BACKEND_E2E_CHANNEL_PROVIDER = "e2e-test";

const backendChannelProviderValues = [
  "telegram",
  "webchat",
  BACKEND_E2E_CHANNEL_PROVIDER,
] as const;
export type BackendChannelProvider = (typeof backendChannelProviderValues)[number];

type ProfileChannel = TableRow<"profile_channels">;

export type BackendChannelResolution = {
  profileChannel: ProfileChannel;
  accountId: string;
};

export type RunBackendChannelTurnInput = {
  db: SupabaseServiceClient;
  provider: BackendChannelProvider;
  senderId: string;
  inputText: string;
  accountId?: string | undefined;
  requestId?: string | undefined;
  sessionKey?: string | undefined;
  sessionId?: string | undefined;
  inboundExternalMessageId?: string | undefined;
  inboundOccurredAt?: string | undefined;
  deliveryContext?: Record<string, unknown> | undefined;
  inboundAttachments?: readonly ProfileAssistantInboundAttachment[] | undefined;
  instructions?: string | undefined;
  maxSteps?: number | undefined;
  workspaceDir?: string | null | undefined;
  recentMessages?: readonly unknown[] | undefined;
  taskContext?: ProfileAssistantTaskGuidanceContext | undefined;
  toolContracts?: readonly ToolContract[] | undefined;
  resolvedChannel?: BackendChannelResolution | undefined;
  senderIsOwner?: boolean | undefined;
};

type BackendChannelOutboundDelivery = {
  actionKind: ProfileAssistantOutboundAction["kind"];
  provider: BackendChannelProvider;
  status: "sent" | "failed";
  externalMessageId?: string | undefined;
  contentText: string;
  failureReason?: string | undefined;
};

export type BackendChannelTurnResult = {
  profileId: string;
  agentId: string;
  sessionKey: string;
  requestId: string;
  text: string;
  outboundActions: readonly ProfileAssistantOutboundAction[];
  deliveries: readonly BackendChannelOutboundDelivery[];
  metadata: ProfileAssistantRunMetadata;
};

type TelegramApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string; error_code?: number };

type TelegramMessageResult = {
  message_id?: number;
};

const TELEGRAM_API_TIMEOUT_MS = 30_000;
const TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS = 60_000;
const CONVERSATION_CONTEXT_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1_000;
const CONVERSATION_CONTEXT_QUERY_LIMIT = 50;
const CONVERSATION_CONTEXT_CANDIDATE_LIMIT = 20;

function requiredTrimmed(value: string | undefined, label: string): string {
  const clean = value?.trim();
  if (!clean) throw new DomainError(domainCodes.BAD_REQUEST, `${label} is required.`);
  return clean;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const clean = value?.trim();
  return clean || undefined;
}

function deliveryConfigRecord(channel: ProfileChannel): Record<string, unknown> {
  const config = channel.delivery_config;
  return config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

function deliveryConfigString(channel: ProfileChannel, key: string): string | undefined {
  const value = deliveryConfigRecord(channel)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function deliveryConfigAccountId(channel: ProfileChannel): string {
  return deliveryConfigString(channel, "accountId") ?? "default";
}

function normalizeSenderCandidates(provider: BackendChannelProvider, senderId: string): string[] {
  const clean = requiredTrimmed(senderId, "senderId");
  const candidates = new Set([clean]);
  if (provider === "telegram") {
    const withoutPrefix = clean.replace(/^telegram:/i, "").replace(/^tg:/i, "");
    if (withoutPrefix) candidates.add(withoutPrefix);
  }
  return [...candidates];
}

function assertBackendChannelProvider(provider: string): asserts provider is BackendChannelProvider {
  if (!(backendChannelProviderValues as readonly string[]).includes(provider)) {
    throw new DomainError(domainCodes.BAD_REQUEST, `Unsupported channel provider ${provider}.`);
  }
}

function defaultSessionKey(input: {
  agentId: string;
  provider: BackendChannelProvider;
  externalIdentity: string;
}): string {
  return `agent:${input.agentId}:${input.provider}:${input.externalIdentity}`;
}

function mergedDeliveryContext(input: {
  channel: ProfileChannel;
  accountId: string;
  deliveryContext?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  return {
    ...(input.deliveryContext ?? {}),
    provider: input.channel.provider,
    profileChannelId: input.channel.id,
    accountId: input.accountId,
  };
}

function outboundContentText(action: ProfileAssistantOutboundAction): string {
  if (action.kind === "send_text") return action.text;
  return action.caption?.trim()
    ? `${action.caption.trim()}\n\n${action.filename}`
    : `Sent file: ${action.filename}`;
}

function candidateRole(input: {
  direction: string | null;
  status: string | null;
}): ConversationContextCandidateMessage["role"] | null {
  if (input.direction === "inbound" && input.status === "received") return "user";
  if (input.direction === "outbound" && input.status === "sent") return "assistant";
  return null;
}

async function loadConversationContextCandidates(input: {
  db: SupabaseServiceClient;
  profileId: string;
  conversationId: string;
  sessionKey: string;
}): Promise<ConversationContextCandidateMessage[]> {
  const now = Date.now();
  const listed = await listProfileChannelMessages(input.db, {
    profileId: input.profileId,
    conversationId: input.conversationId,
    since: new Date(now - CONVERSATION_CONTEXT_LOOKBACK_MS).toISOString(),
    until: new Date(now + 60_000).toISOString(),
    limit: CONVERSATION_CONTEXT_QUERY_LIMIT,
  });
  return listed.messages
    .filter((message) => message.sessionKey === input.sessionKey)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .flatMap((message) => {
      const role = candidateRole({ direction: message.direction, status: message.status });
      const text = message.contentText.trim();
      return role && text
        ? [
            {
              id: message.id,
              role,
              occurredAt: message.occurredAt,
              text,
            },
          ]
        : [];
    })
    .slice(-CONVERSATION_CONTEXT_CANDIDATE_LIMIT);
}

async function selectBackendChannelConversationContext(input: {
  db: SupabaseServiceClient;
  profile: TableRow<"profiles">;
  channel: ProfileChannel;
  sessionKey: string;
  currentPrompt: string;
}): Promise<ConversationContextSelection> {
  const candidates = await loadConversationContextCandidates({
    db: input.db,
    profileId: input.profile.id,
    conversationId: input.channel.external_identity,
    sessionKey: input.sessionKey,
  });
  return selectConversationContext({
    profile: input.profile,
    currentPrompt: input.currentPrompt,
    candidates,
  });
}

async function recordConversationContextSelection(input: {
  db: SupabaseServiceClient;
  profileId: string;
  agentRunId: string;
  selection: ConversationContextSelection;
}): Promise<void> {
  await recordAgentEvent(input.db, {
    profileId: input.profileId,
    agentRunId: input.agentRunId,
    eventType: "assistant.conversation_context.selection",
    source: "backend",
    sourceEventKey: `agent_run:${input.agentRunId}:assistant.conversation_context.selection`,
    occurredAt: new Date().toISOString(),
    visibility: "internal",
    payload: {
      eventType: "assistant.conversation_context.selection",
      mode: input.selection.mode,
      selectedContextMode: input.selection.selectedContextMode,
      candidateMessageCount: input.selection.candidateMessageCount,
      selectedMessageCount: input.selection.selectedMessageIds.length,
      selectedMessageIds: input.selection.selectedMessageIds,
      ignoredMessageIds: input.selection.ignoredMessageIds,
      summary: input.selection.summary,
      contextCharCount: input.selection.contextCharCount,
      model: input.selection.model,
      error: input.selection.error ? safeAgentEventJsonObject(input.selection.error) : null,
    },
  });
}

async function recordOutboundDelivery(input: {
  db: SupabaseServiceClient;
  channel: ProfileChannel;
  accountId: string;
  sessionKey: string;
  sessionId?: string | undefined;
  agentId: string;
  agentRunId: string;
  action: ProfileAssistantOutboundAction;
  delivery: BackendChannelOutboundDelivery;
}): Promise<void> {
  await recordProfileChannelMessage(input.db, {
    kind: input.delivery.status === "sent" ? "outbound_sent" : "outbound_failed",
    channelId: input.channel.provider,
    conversationId: input.channel.external_identity,
    accountId: input.accountId,
    contentText: input.delivery.contentText,
    agentId: input.agentId,
    agentRunId: input.agentRunId,
    sessionKey: input.sessionKey,
    source: "backend",
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.delivery.externalMessageId
      ? { externalMessageId: input.delivery.externalMessageId }
      : {}),
    ...(input.delivery.failureReason ? { failureReason: input.delivery.failureReason } : {}),
  });
}

function telegramApiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function telegramFileUrl(token: string, filePath: string): string {
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}

async function parseTelegramApiResponse<T>(response: Response, method: string): Promise<T> {
  const raw = (await response.json()) as TelegramApiResponse<T>;
  if (raw.ok) return raw.result;
  const code = raw.error_code === 429 ? domainCodes.RATE_LIMITED : domainCodes.SERVICE_UNAVAILABLE;
  throw new DomainError(
    code,
    `Telegram ${method} failed: ${raw.description ?? `HTTP ${response.status}`}.`,
  );
}

async function callTelegramJson<T>(input: {
  token: string;
  method: string;
  body: Record<string, unknown>;
}): Promise<T> {
  const response = await timedFetch.fetch(telegramApiUrl(input.token, input.method), {
    method: "POST",
    timeoutMs: TELEGRAM_API_TIMEOUT_MS,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.body),
  });
  return parseTelegramApiResponse<T>(response, input.method);
}

async function callTelegramForm<T>(input: {
  token: string;
  method: string;
  form: FormData;
}): Promise<T> {
  const response = await timedFetch.fetch(telegramApiUrl(input.token, input.method), {
    method: "POST",
    timeoutMs: TELEGRAM_API_TIMEOUT_MS,
    body: input.form,
  });
  return parseTelegramApiResponse<T>(response, input.method);
}

function telegramExternalMessageId(result: TelegramMessageResult, fallback: string): string {
  return typeof result.message_id === "number" ? `telegram:${result.message_id}` : fallback;
}

function telegramTargetChatId(channel: ProfileChannel): string {
  return deliveryConfigString(channel, "chatId") ?? channel.external_identity;
}

function telegramTextChunks(text: string): string[] {
  const max = 3900;
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, max));
    remaining = remaining.slice(max);
  }
  return chunks;
}

async function deliverTelegramText(input: {
  channel: ProfileChannel;
  action: ProfileAssistantOutboundTextAction;
  actionIndex: number;
}): Promise<BackendChannelOutboundDelivery[]> {
  const token = backendApiEnv().telegramBotToken;
  const deliveries: BackendChannelOutboundDelivery[] = [];
  for (const [chunkIndex, text] of telegramTextChunks(input.action.text).entries()) {
    const result = await callTelegramJson<TelegramMessageResult>({
      token,
      method: "sendMessage",
      body: {
        chat_id: telegramTargetChatId(input.channel),
        text,
      },
    });
    deliveries.push({
      actionKind: "send_text",
      provider: "telegram",
      status: "sent",
      externalMessageId: telegramExternalMessageId(
        result,
        `telegram:sendMessage:${input.actionIndex}:${chunkIndex}`,
      ),
      contentText: text,
    });
  }
  return deliveries;
}

async function deliverTelegramFile(input: {
  channel: ProfileChannel;
  action: ProfileAssistantOutboundFileAction;
  actionIndex: number;
}): Promise<BackendChannelOutboundDelivery> {
  const token = backendApiEnv().telegramBotToken;
  const bytes = Buffer.from(input.action.contentBase64, "base64");
  const form = new FormData();
  form.set("chat_id", telegramTargetChatId(input.channel));
  if (input.action.caption?.trim()) form.set("caption", input.action.caption.trim());
  form.set(
    "document",
    new Blob([bytes], { type: input.action.mimeType ?? "application/octet-stream" }),
    input.action.filename,
  );
  const result = await callTelegramForm<TelegramMessageResult>({
    token,
    method: "sendDocument",
    form,
  });
  return {
    actionKind: "send_file",
    provider: "telegram",
    status: "sent",
    externalMessageId: telegramExternalMessageId(
      result,
      `telegram:sendDocument:${input.actionIndex}`,
    ),
    contentText: outboundContentText(input.action),
  };
}

async function deliverAction(input: {
  channel: ProfileChannel;
  action: ProfileAssistantOutboundAction;
  actionIndex: number;
}): Promise<BackendChannelOutboundDelivery[]> {
  assertBackendChannelProvider(input.channel.provider);
  if (input.channel.provider === "telegram") {
    if (input.action.kind === "send_text") {
      return deliverTelegramText({
        channel: input.channel,
        action: input.action,
        actionIndex: input.actionIndex,
      });
    }
    return [
      await deliverTelegramFile({
        channel: input.channel,
        action: input.action,
        actionIndex: input.actionIndex,
      }),
    ];
  }

  return [
    {
      actionKind: input.action.kind,
      provider: input.channel.provider,
      status: "sent",
      externalMessageId: `backend-channel:${input.actionIndex}:${randomUUID()}`,
      contentText: outboundContentText(input.action),
    },
  ];
}

export async function resolveBackendChannel(
  db: SupabaseServiceClient,
  input: {
    provider: BackendChannelProvider;
    senderId: string;
    accountId?: string | undefined;
  },
): Promise<BackendChannelResolution> {
  const senderCandidates = normalizeSenderCandidates(input.provider, input.senderId);
  const result = await db
    .from("profile_channels")
    .select()
    .eq("provider", input.provider)
    .eq("status", "active")
    .in("external_identity", senderCandidates);
  const rows = requireSupabaseRows("Resolve backend channel sender", result.data, result.error);
  const matched = input.accountId
    ? rows.filter((channel) => deliveryConfigAccountId(channel) === input.accountId)
    : rows;
  if (matched.length === 0) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `No active ${input.provider} channel is mapped to sender ${input.senderId}.`,
    );
  }
  if (matched.length > 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `${input.provider}:${input.senderId} maps to ${matched.length} active profile channels.`,
    );
  }
  const profileChannel = matched[0];
  if (!profileChannel) {
    throw new DomainError(domainCodes.INTERNAL, "Resolved channel row was unexpectedly missing.");
  }
  return {
    profileChannel,
    accountId: deliveryConfigAccountId(profileChannel),
  };
}

async function deliverBackendChannelOutboundActions(input: {
  db: SupabaseServiceClient;
  channel: ProfileChannel;
  accountId: string;
  sessionKey: string;
  sessionId?: string | undefined;
  agentId: string;
  agentRunId: string;
  actions: readonly ProfileAssistantOutboundAction[];
}): Promise<BackendChannelOutboundDelivery[]> {
  const deliveries: BackendChannelOutboundDelivery[] = [];
  for (const [actionIndex, action] of input.actions.entries()) {
    try {
      const actionDeliveries = await deliverAction({
        channel: input.channel,
        action,
        actionIndex,
      });
      for (const delivery of actionDeliveries) {
        await recordOutboundDelivery({
          ...input,
          action,
          delivery,
        });
        deliveries.push(delivery);
      }
    } catch (error) {
      const delivery = {
        actionKind: action.kind,
        provider: input.channel.provider as BackendChannelProvider,
        status: "failed" as const,
        contentText: outboundContentText(action),
        failureReason: formatUnknownError(error),
      } satisfies BackendChannelOutboundDelivery;
      await recordOutboundDelivery({
        ...input,
        action,
        delivery,
      });
      deliveries.push(delivery);
      throw error;
    }
  }
  return deliveries;
}

export async function runBackendChannelTurn(
  input: RunBackendChannelTurnInput,
): Promise<BackendChannelTurnResult> {
  const requestId = optionalTrimmed(input.requestId) ?? randomUUID();
  const resolution =
    input.resolvedChannel ??
    (await resolveBackendChannel(input.db, {
      provider: input.provider,
      senderId: input.senderId,
      ...(input.accountId ? { accountId: input.accountId } : {}),
    }));
  const channel = resolution.profileChannel;
  assertBackendChannelProvider(channel.provider);
  const { assistant, profile } = await requireAssistantProfileByProfileId(
    input.db,
    channel.profile_id,
  );
  const accountId = resolution.accountId;
  const sessionKey =
    optionalTrimmed(input.sessionKey) ??
    defaultSessionKey({
      agentId: assistant.assistant_id,
      provider: input.provider,
      externalIdentity: channel.external_identity,
    });
  const inputText = requiredTrimmed(input.inputText, "inputText");
  const conversationContextSelection =
    input.recentMessages === undefined
      ? await selectBackendChannelConversationContext({
          db: input.db,
          profile,
          channel,
          sessionKey,
          currentPrompt: inputText,
        })
      : null;
  const recentMessages = input.recentMessages ?? conversationContextSelection?.selectedMessages;

  const runnerResult: RunProfileAssistantTurnResult = await runProfileAssistantTurn({
    db: input.db,
    agentId: assistant.assistant_id,
    inputText,
    sessionKey,
    requestId,
    runKind: "user",
    runKindSource: "runtime_context",
    channelMessageContext: {
      channelId: input.provider,
      conversationId: channel.external_identity,
      accountId,
      recordOutbound: false,
      ...(optionalTrimmed(input.inboundExternalMessageId)
        ? { inboundExternalMessageId: optionalTrimmed(input.inboundExternalMessageId) }
        : {}),
      ...(optionalTrimmed(input.inboundOccurredAt)
        ? { inboundOccurredAt: optionalTrimmed(input.inboundOccurredAt) }
        : {}),
    },
    trustedChannel: {
      messageChannel: input.provider,
      requesterSenderId: channel.external_identity,
      agentAccountId: accountId,
      senderIsOwner: input.senderIsOwner ?? true,
      deliveryContext: mergedDeliveryContext({
        channel,
        accountId,
        deliveryContext: input.deliveryContext,
      }),
    },
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.instructions ? { instructions: input.instructions } : {}),
    ...(input.maxSteps ? { maxSteps: input.maxSteps } : {}),
    ...(input.workspaceDir === undefined ? {} : { workspaceDir: input.workspaceDir }),
    ...(recentMessages ? { recentMessages } : {}),
    ...(input.taskContext ? { taskContext: input.taskContext } : {}),
    ...(input.inboundAttachments ? { inboundAttachments: input.inboundAttachments } : {}),
    ...(input.toolContracts ? { toolContracts: input.toolContracts } : {}),
  });
  if (conversationContextSelection) {
    await recordConversationContextSelection({
      db: input.db,
      profileId: runnerResult.metadata.profileId,
      agentRunId: runnerResult.metadata.agentRunId,
      selection: conversationContextSelection,
    });
  }

  const deliveries = await deliverBackendChannelOutboundActions({
    db: input.db,
    channel,
    accountId,
    sessionKey,
    agentId: assistant.assistant_id,
    agentRunId: runnerResult.metadata.agentRunId,
    actions: runnerResult.outboundActions,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  return {
    profileId: runnerResult.metadata.profileId,
    agentId: assistant.assistant_id,
    sessionKey,
    requestId,
    text: runnerResult.text,
    outboundActions: runnerResult.outboundActions,
    deliveries,
    metadata: runnerResult.metadata,
  };
}

export async function downloadTelegramFileAttachment(input: {
  fileId: string;
  filename: string;
  mimeType: string;
  description?: string | null | undefined;
  byteSize?: number | undefined;
}): Promise<ProfileAssistantInboundAttachment> {
  const token = backendApiEnv().telegramBotToken;
  const file = await callTelegramJson<{ file_path?: string; file_size?: number }>({
    token,
    method: "getFile",
    body: { file_id: input.fileId },
  });
  if (!file.file_path) {
    throw new DomainError(domainCodes.SERVICE_UNAVAILABLE, "Telegram getFile returned no path.");
  }
  const response = await timedFetch.fetch(telegramFileUrl(token, file.file_path), {
    timeoutMs: TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new DomainError(
      response.status === 429 ? domainCodes.RATE_LIMITED : domainCodes.SERVICE_UNAVAILABLE,
      `Telegram file download failed with HTTP ${response.status}.`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    filename: input.filename,
    mimeType: input.mimeType,
    contentBase64: bytes.toString("base64"),
    byteSize: input.byteSize ?? file.file_size ?? bytes.byteLength,
    ...(input.description ? { description: input.description } : {}),
  };
}
