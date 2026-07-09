import {
  portalAccessLinkCreateInputSchema,
  type PortalAccessLinkCreateInput,
} from "@ai-assistants/profile-links-contracts/schemas";
import {
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { formatUnknownError } from "@ai-assistants/errors";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { backendApiEnv } from "../../shared/env";
import type { ToolInvocationContext } from "../actions/schemas";
import type { ResolvedTrustedChannelOrigin } from "../actions/channel-resolution";

function portalBaseUrl(): string | null {
  return backendApiEnv().connectPublicUrl;
}

export function portalAccessForProfile() {
  const baseUrl = portalBaseUrl();
  return {
    available: baseUrl !== null,
  };
}

function requirePortalBaseUrl(): string {
  return backendApiEnv().connectPublicUrl;
}

export function profilePortalPath(
  profileId: string,
  section: PortalAccessLinkCreateInput["section"],
): string {
  const profilePath = `/assistants/${encodeURIComponent(profileId)}`;
  if (section === "integrations") return `${profilePath}/integrations`;
  if (section === "approvals") return `${profilePath}/approvals`;
  const _exhaustive: never = section;
  throw new DomainError(
    domainCodes.INTERNAL,
    `Unhandled portal access link section ${String(_exhaustive)}.`,
  );
}

export async function createPortalAccessLinkForProfile(
  db: SupabaseServiceClient,
  profile: TableRow<"profiles">,
  input: unknown,
  options: {
    assistantId?: string | null;
    invocation?: ToolInvocationContext | null;
    trustedChannelOrigin?: ResolvedTrustedChannelOrigin | null;
    toolCallId?: string | null;
  } = {},
) {
  const parsed = portalAccessLinkCreateInputSchema.parse(input);
  return createPortalAccessLinkForPath(db, profile, {
    portalPath: profilePortalPath(profile.id, parsed.section),
    section: parsed.section,
    options,
  });
}

export async function createPortalAccessLinkForPath(
  db: SupabaseServiceClient,
  profile: TableRow<"profiles">,
  input: {
    portalPath: string;
    section: PortalAccessLinkCreateInput["section"];
    options?: {
      assistantId?: string | null;
      invocation?: ToolInvocationContext | null;
      trustedChannelOrigin?: ResolvedTrustedChannelOrigin | null;
      toolCallId?: string | null;
    };
  },
) {
  const baseUrl = requirePortalBaseUrl();
  const portalPath = input.portalPath;
  if (!portalPath.startsWith("/")) {
    throw new DomainError(domainCodes.BAD_REQUEST, "Portal access path must start with /.");
  }
  const targetUrl = `${baseUrl}${portalPath}`;
  const options = input.options ?? {};

  const authUserResult = await db.auth.admin.getUserById(profile.user_id);
  if (authUserResult.error) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Portal auth user ${profile.user_id} could not be loaded: ${formatUnknownError(authUserResult.error)}`,
    );
  }
  const authUser = authUserResult.data.user;
  if (!authUser)
    throw new DomainError(
      domainCodes.CONFLICT,
      `Portal auth user ${profile.user_id} does not exist.`,
    );
  if (authUser.id !== profile.user_id)
    throw new DomainError(
      domainCodes.CONFLICT,
      `Portal auth user ${authUser.id} does not match profile ${profile.id}.`,
    );
  if (!authUser.email)
    throw new DomainError(
      domainCodes.CONFLICT,
      `Portal auth user ${profile.user_id} has no email address.`,
    );

  const linkResult = await db.auth.admin.generateLink({
    type: "magiclink",
    email: authUser.email,
  });
  if (linkResult.error) {
    throw new DomainError(
      domainCodes.SERVICE_UNAVAILABLE,
      `Portal access link could not be created: ${formatUnknownError(linkResult.error)}`,
    );
  }
  const properties = linkResult.data.properties;
  if (!properties?.hashed_token)
    throw new DomainError(
      domainCodes.SERVICE_UNAVAILABLE,
      "Portal access link response did not include a token hash.",
    );

  const linkUrl = new URL(targetUrl);
  const hashParams = new URLSearchParams({
    oc_token_hash: properties.hashed_token,
    oc_auth_type: properties.verification_type,
    oc_next: portalPath,
  });
  if (options.assistantId) hashParams.set("oc_origin_agent_id", options.assistantId);
  if (options.assistantId && !options.trustedChannelOrigin) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      "Trusted channel origin is required before creating assistant portal access links.",
    );
  }
  if (options.invocation?.sessionKey)
    hashParams.set("oc_origin_session_key", options.invocation.sessionKey);
  if (options.invocation?.sessionId)
    hashParams.set("oc_origin_session_id", options.invocation.sessionId);
  if (options.toolCallId) hashParams.set("oc_origin_tool_call_id", options.toolCallId);
  linkUrl.hash = hashParams.toString();

  return {
    profileId: profile.id,
    section: input.section,
    url: linkUrl.toString(),
    targetUrl,
    auth: {
      provider: "supabase",
      type: properties.verification_type,
      delivery: "url_fragment",
      oneTime: true,
    },
  };
}
