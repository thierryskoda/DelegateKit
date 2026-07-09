import {
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  trustedChannelOriginSchema,
  type ToolInvocationContext,
  type TrustedChannelOrigin,
} from "./schemas";

export type ResolvedTrustedChannelOrigin = {
  profileChannel: TableRow<"profile_channels">;
  provider: string;
  externalIdentity: string;
  sessionKey: string;
  sessionId?: string;
  agentAccountId?: string;
};

function normalizeSenderCandidates(provider: string, senderId: string): string[] {
  const clean = senderId.trim();
  const candidates = new Set([clean]);
  if (provider === "telegram") {
    const withoutPrefix = clean.replace(/^telegram:/i, "").replace(/^tg:/i, "");
    if (withoutPrefix) candidates.add(withoutPrefix);
  }
  return [...candidates];
}

async function resolveProfileChannelBySender(
  db: SupabaseServiceClient,
  input: { profileId?: string | null; provider: string; senderId: string },
): Promise<TableRow<"profile_channels"> | null> {
  const candidates = normalizeSenderCandidates(input.provider, input.senderId);
  let query = db
    .from("profile_channels")
    .select()
    .eq("provider", input.provider)
    .eq("status", "active")
    .in("external_identity", candidates);
  if (input.profileId) query = query.eq("profile_id", input.profileId);
  const result = await query;
  const rows = requireSupabaseRows(
    "Resolve profile action decision channel",
    result.data,
    result.error,
  );
  if (rows.length > 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Approval sender ${input.provider}:${input.senderId} maps to ${rows.length} active profile channels.`,
    );
  }
  return rows[0] ?? null;
}

export async function resolveTrustedChannelOrigin(
  db: SupabaseServiceClient,
  profileId: string,
  trustedChannel: TrustedChannelOrigin | null | undefined,
  invocation: ToolInvocationContext,
): Promise<ResolvedTrustedChannelOrigin> {
  const parsed = trustedChannelOriginSchema
    .nullable()
    .optional()
    .parse(trustedChannel ?? null);
  if (!parsed) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      "Trusted channel origin is required for this profile action.",
    );
  }
  const channel = await resolveProfileChannelBySender(db, {
    profileId,
    provider: parsed.messageChannel,
    senderId: parsed.requesterSenderId,
  });
  if (!channel) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `No active trusted channel is mapped to ${parsed.messageChannel}:${parsed.requesterSenderId}.`,
    );
  }
  return {
    profileChannel: channel,
    provider: parsed.messageChannel,
    externalIdentity: channel.external_identity,
    sessionKey: invocation.sessionKey,
    ...(invocation.sessionId ? { sessionId: invocation.sessionId } : {}),
    ...(parsed.agentAccountId ? { agentAccountId: parsed.agentAccountId } : {}),
  };
}

export async function requireDecisionChannelForAction(
  db: SupabaseServiceClient,
  profileId: string,
  action: TableRow<"profile_actions">,
  trustedChannel: TrustedChannelOrigin | null | undefined,
  invocation: ToolInvocationContext,
): Promise<TableRow<"profile_channels">> {
  const resolved = await resolveTrustedChannelOrigin(db, profileId, trustedChannel, invocation);
  const channel = resolved.profileChannel;
  if (!action.origin_profile_channel_id) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Profile action ${action.id} has no trusted origin channel and must be reviewed in the portal.`,
    );
  }
  if (action.origin_profile_channel_id !== channel.id) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Profile action ${action.id} belongs to a different trusted channel.`,
    );
  }
  const senderCandidates = normalizeSenderCandidates(resolved.provider, resolved.externalIdentity);
  if (!action.origin_sender_id || !senderCandidates.includes(action.origin_sender_id)) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Profile action ${action.id} belongs to a different sender.`,
    );
  }
  if (action.origin_session_key && action.origin_session_key !== invocation.sessionKey) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Profile action ${action.id} belongs to a different chat session.`,
    );
  }
  return channel;
}
