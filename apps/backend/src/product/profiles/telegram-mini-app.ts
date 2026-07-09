import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  telegramMiniAppLaunchSectionSchema,
  type TelegramMiniAppLaunchSection,
} from "@ai-assistants/connect-api-contracts";
import {
  miniAppLinkCreateInputSchema,
  type MiniAppLinkCreateInput,
} from "@ai-assistants/profile-links-contracts/schemas";
import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import { backendApiEnv } from "../../shared/env";
import type { ToolInvocationContext } from "../actions/schemas";
import type { ResolvedTrustedChannelOrigin } from "../actions/channel-resolution";
import { createPortalAccessLinkForProfile, profilePortalPath } from "./portal-access-links";

const TELEGRAM_MINI_APP_AUTH_MAX_AGE_SECONDS = 24 * 60 * 60;
const MINI_APP_LAUNCH_INTENT_TTL_SECONDS = 15 * 60;
const TELEGRAM_MINI_APP_SURFACE = "telegram_mini_app";

const telegramMiniAppUserSchema = z
  .object({
    id: z.number().int().positive(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough();

type TelegramMiniAppIdentity = {
  telegramUserId: string;
  authDate: Date;
  startParam: string | null;
  username?: string;
};

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function equalHexDigest(actualHex: string, expected: Buffer): boolean {
  let actual: Buffer;
  try {
    actual = Buffer.from(actualHex, "hex");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function verifyTelegramMiniAppInitData(
  initData: string,
  options: {
    botToken?: string;
    now?: Date;
    maxAgeSeconds?: number;
  } = {},
): TelegramMiniAppIdentity {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash")?.trim();
  if (!hash) throw new DomainError(domainCodes.UNAUTHORIZED, "Telegram Mini App data is unsigned.");

  const botToken = options.botToken ?? backendApiEnv().telegramBotToken;
  const secretKey = hmacSha256("WebAppData", botToken);
  const expectedHash = hmacSha256(secretKey, dataCheckString(params));
  if (!equalHexDigest(hash, expectedHash)) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Telegram Mini App signature is invalid.");
  }

  const authDateSeconds = Number(params.get("auth_date"));
  if (!Number.isInteger(authDateSeconds) || authDateSeconds <= 0) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Telegram Mini App auth_date is invalid.");
  }
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const maxAgeSeconds = options.maxAgeSeconds ?? TELEGRAM_MINI_APP_AUTH_MAX_AGE_SECONDS;
  if (nowSeconds - authDateSeconds > maxAgeSeconds) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Telegram Mini App sign-in has expired.");
  }

  let rawUser: unknown;
  try {
    rawUser = JSON.parse(params.get("user") ?? "{}") as unknown;
  } catch {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Telegram Mini App user is invalid JSON.");
  }
  const parsedUser = telegramMiniAppUserSchema.safeParse(rawUser);
  if (!parsedUser.success) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Telegram Mini App user is invalid.");
  }

  const startParam = params.get("start_param")?.trim() || null;
  return {
    telegramUserId: String(parsedUser.data.id),
    authDate: new Date(authDateSeconds * 1000),
    startParam,
    ...(parsedUser.data.username ? { username: parsedUser.data.username } : {}),
  };
}

function parseTelegramMiniAppLaunchSection(
  input: unknown,
): TelegramMiniAppLaunchSection | null {
  const raw = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!raw) return "approvals";
  const parsed = telegramMiniAppLaunchSectionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function launchSectionForIntent(input: MiniAppLinkCreateInput): TelegramMiniAppLaunchSection {
  if (input.intent.type === "approval") return "approvals";
  if (input.intent.type === "integration") return "integrations";
  return input.section;
}

function launchIntentPayload(input: MiniAppLinkCreateInput["intent"]): Record<string, string> {
  if (input.type === "approval") return { approvalId: input.approvalId };
  if (input.type === "integration") return { connectedAccountId: input.connectedAccountId };
  return {};
}

function randomLaunchSlug(): string {
  return randomBytes(24).toString("base64url");
}

function miniAppUrl(botUsername: string, slug: string): string {
  const url = new URL(`https://t.me/${botUsername}`);
  url.searchParams.set("startapp", slug);
  return url.toString();
}

async function requireProfileForTelegramMiniAppUser(
  db: SupabaseServiceClient,
  telegramUserId: string,
): Promise<TableRow<"profiles">> {
  const channelResult = await db
    .from("profile_channels")
    .select()
    .eq("provider", "telegram")
    .eq("external_identity", telegramUserId)
    .eq("status", "active");
  const channels = requireSupabaseRows(
    "Resolve Telegram Mini App profile channel",
    channelResult.data,
    channelResult.error,
  );
  if (channels.length === 0) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Telegram user ${telegramUserId} is not mapped to an active assistant profile.`,
    );
  }
  if (channels.length > 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Telegram user ${telegramUserId} maps to ${channels.length} active assistant profiles.`,
    );
  }
  const channel = channels[0];
  if (!channel) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Telegram user ${telegramUserId} is not mapped to an active assistant profile.`,
    );
  }

  const profileResult = await db
    .from("profiles")
    .select()
    .eq("id", channel.profile_id)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Assistant profile ${channel.profile_id} does not exist.`,
    );
  }
  if (profileResult.data.status !== "active") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Assistant profile ${profileResult.data.id} is ${profileResult.data.status}.`,
    );
  }
  return profileResult.data;
}

async function resolveLaunchIntent(input: {
  db: SupabaseServiceClient;
  profile: TableRow<"profiles">;
  slug: string;
  now: Date;
}): Promise<TelegramMiniAppLaunchSection> {
  const result = await input.db
    .from("profile_portal_launch_intents")
    .select()
    .eq("slug", input.slug)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new DomainError(domainCodes.NOT_FOUND, "Telegram Mini App launch link was not found.");
  }
  if (result.data.profile_id !== input.profile.id) {
    throw new DomainError(domainCodes.FORBIDDEN, "Telegram Mini App launch link is not yours.");
  }
  if (result.data.status !== "active") {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      "Telegram Mini App launch link has already been used.",
    );
  }
  if (new Date(result.data.expires_at).getTime() <= input.now.getTime()) {
    await input.db
      .from("profile_portal_launch_intents")
      .update({ status: "expired" })
      .eq("id", result.data.id)
      .eq("status", "active");
    throw new DomainError(domainCodes.NOT_FOUND, "Telegram Mini App launch link has expired.");
  }

  const consumedResult = await input.db
    .from("profile_portal_launch_intents")
    .update({ status: "consumed", consumed_at: input.now.toISOString() })
    .eq("id", result.data.id)
    .eq("status", "active")
    .select()
    .single();
  requireSupabaseData(
    "Consume Telegram Mini App launch intent",
    consumedResult.data,
    consumedResult.error,
  );
  return telegramMiniAppLaunchSectionSchema.parse(result.data.section);
}

export async function createTelegramMiniAppSession(input: {
  db: SupabaseServiceClient;
  initData: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const identity = verifyTelegramMiniAppInitData(input.initData, { now });
  const profile = await requireProfileForTelegramMiniAppUser(input.db, identity.telegramUserId);
  const directSection = parseTelegramMiniAppLaunchSection(identity.startParam);
  const section =
    directSection ??
    (await resolveLaunchIntent({
      db: input.db,
      profile,
      slug: identity.startParam ?? "",
      now,
    }));
  const destinationPath = profilePortalPath(profile.id, section);
  const link = await createPortalAccessLinkForProfile(input.db, profile, { section });

  return {
    profileId: profile.id,
    destinationPath,
    portalAccessUrl: link.url,
  };
}

export async function createTelegramMiniAppLaunchLink(input: {
  db: SupabaseServiceClient;
  profile: TableRow<"profiles">;
  params: unknown;
  assistantId?: string | null;
  invocation?: ToolInvocationContext | null;
  trustedChannelOrigin?: ResolvedTrustedChannelOrigin | null;
  toolCallId?: string | null;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}) {
  if (input.assistantId && !input.trustedChannelOrigin) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      "Trusted channel origin is required before creating assistant Mini App links.",
    );
  }

  const parsed = miniAppLinkCreateInputSchema.parse(input.params);
  const section = launchSectionForIntent(parsed);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + MINI_APP_LAUNCH_INTENT_TTL_SECONDS * 1000);
  const slug = randomLaunchSlug();
  const rowResult = await input.db
    .from("profile_portal_launch_intents")
    .insert({
      profile_id: input.profile.id,
      slug,
      surface: TELEGRAM_MINI_APP_SURFACE,
      section,
      intent_type: parsed.intent.type,
      intent_payload: launchIntentPayload(parsed.intent),
      status: "active",
      expires_at: expiresAt.toISOString(),
      consumed_at: null,
      origin_agent_id: input.assistantId ?? null,
      origin_session_key: input.invocation?.sessionKey ?? null,
      origin_session_id: input.invocation?.sessionId ?? null,
      origin_tool_call_id: input.toolCallId ?? null,
    })
    .select()
    .single();
  requireSupabaseData("Create Telegram Mini App launch intent", rowResult.data, rowResult.error);

  const botUsername =
    input.env?.TELEGRAM_MINI_APP_BOT_USERNAME?.replace(/^@/, "") ??
    backendApiEnv().telegramMiniAppBotUsername;
  const url = miniAppUrl(botUsername, slug);
  return {
    url,
    section,
    surface: TELEGRAM_MINI_APP_SURFACE,
    expiresAt: expiresAt.toISOString(),
  };
}
