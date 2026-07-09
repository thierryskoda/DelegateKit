import { randomUUID } from "node:crypto";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  publicWebHandoffSchema,
  type PublicWebHandoff,
  type PublicWebHandoffReason,
} from "@ai-assistants/public-web-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { ToolInvocationContext } from "../../product/actions/schemas";
import type { ResolvedTrustedChannelOrigin } from "../../product/actions/channel-resolution";
import { createPortalAccessLinkForPath } from "../../product/profiles/portal-access-links";

const BROWSER_HANDOFF_TTL_MS = 15 * 60_000;

export function browserHandoffDto(
  row: TableRow<"browser_handoffs">,
  options: { includeClientUrl: boolean },
): PublicWebHandoff {
  return publicWebHandoffSchema.parse({
    handoffId: row.id,
    reason: row.reason,
    clientUrl: options.includeClientUrl && row.status === "waiting" ? row.client_url : null,
    expiresAt: row.expires_at,
    status: row.status,
  });
}

export async function createBrowserHandoff(input: {
  db: SupabaseServiceClient;
  profile: TableRow<"profiles">;
  browserTaskId: string;
  authContextId: string | null;
  providerSessionId: string;
  reason: PublicWebHandoffReason;
  assistantId: string;
  invocation: ToolInvocationContext;
  trustedChannelOrigin: ResolvedTrustedChannelOrigin;
  toolCallId: string;
}): Promise<TableRow<"browser_handoffs">> {
  const handoffId = randomUUID();
  const expiresAt = new Date(Date.now() + BROWSER_HANDOFF_TTL_MS).toISOString();
  const portalPath = `/assistants/${encodeURIComponent(input.profile.id)}/browser-handoff/${encodeURIComponent(handoffId)}`;
  const link = await createPortalAccessLinkForPath(input.db, input.profile, {
    portalPath,
    section: "integrations",
    options: {
      assistantId: input.assistantId,
      invocation: input.invocation,
      trustedChannelOrigin: input.trustedChannelOrigin,
      toolCallId: input.toolCallId,
    },
  });
  const result = await input.db
    .from("browser_handoffs")
    .insert({
      id: handoffId,
      profile_id: input.profile.id,
      browser_task_id: input.browserTaskId,
      browser_auth_context_id: input.authContextId,
      browserbase_session_id: input.providerSessionId,
      reason: input.reason,
      status: "waiting",
      client_url: link.url,
      expires_at: expiresAt,
    })
    .select()
    .single();
  return requireSupabaseData("Create browser handoff", result.data, result.error);
}

export async function requireBrowserHandoffForProfile(input: {
  db: SupabaseServiceClient;
  profileId: string;
  handoffId: string;
}): Promise<TableRow<"browser_handoffs">> {
  const result = await input.db
    .from("browser_handoffs")
    .select()
    .eq("id", input.handoffId)
    .eq("profile_id", input.profileId)
    .maybeSingle();
  return requireSupabaseData("Load browser handoff", result.data, result.error);
}

export async function latestBrowserHandoffForTask(input: {
  db: SupabaseServiceClient;
  profileId: string;
  browserTaskId: string;
}): Promise<TableRow<"browser_handoffs"> | null> {
  const result = await input.db
    .from("browser_handoffs")
    .select()
    .eq("profile_id", input.profileId)
    .eq("browser_task_id", input.browserTaskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ?? null;
}

export async function expireBrowserHandoffIfNeeded(
  db: SupabaseServiceClient,
  row: TableRow<"browser_handoffs">,
): Promise<TableRow<"browser_handoffs">> {
  if (row.status !== "waiting") return row;
  if (new Date(row.expires_at).getTime() > Date.now()) return row;
  const result = await db
    .from("browser_handoffs")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "waiting")
    .select()
    .single();
  return requireSupabaseData("Expire browser handoff", result.data, result.error);
}

async function requireOpenBrowserHandoff(input: {
  db: SupabaseServiceClient;
  profileId: string;
  handoffId: string;
}): Promise<TableRow<"browser_handoffs">> {
  const row = await expireBrowserHandoffIfNeeded(
    input.db,
    await requireBrowserHandoffForProfile(input),
  );
  if (row.status !== "waiting") {
    throw new DomainError(domainCodes.CONFLICT, `Browser handoff ${row.id} is ${row.status}.`);
  }
  return row;
}

export async function completeBrowserHandoff(input: {
  db: SupabaseServiceClient;
  profileId: string;
  handoffId: string;
}): Promise<TableRow<"browser_handoffs">> {
  const row = await requireOpenBrowserHandoff(input);
  const now = new Date().toISOString();
  const result = await input.db
    .from("browser_handoffs")
    .update({ status: "completed", completed_at: now, updated_at: now })
    .eq("id", row.id)
    .eq("status", "waiting")
    .select()
    .single();
  return requireSupabaseData("Complete browser handoff", result.data, result.error);
}

export async function cancelBrowserHandoff(input: {
  db: SupabaseServiceClient;
  profileId: string;
  handoffId: string;
}): Promise<TableRow<"browser_handoffs">> {
  const row = await requireOpenBrowserHandoff(input);
  const now = new Date().toISOString();
  const result = await input.db
    .from("browser_handoffs")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("id", row.id)
    .eq("status", "waiting")
    .select()
    .single();
  return requireSupabaseData("Cancel browser handoff", result.data, result.error);
}
