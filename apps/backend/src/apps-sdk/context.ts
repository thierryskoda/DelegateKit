import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { chatGptAppContextErrorResult } from "./errors";

type AppsSdkToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

type ChatGptAppInvocationContext = {
  profileId: string;
  requestId: string;
  auth: {
    kind: "prototype-dev";
    developerId: string;
  };
  correlation: {
    mcpSessionId: string | null;
    conversationId: string | null;
  };
};

export type ChatGptAppDiagnosticContext = {
  profileId: string | null;
  developerId: string | null;
  conversationId: string | null;
};

type ContextResolution =
  | { ok: true; context: ChatGptAppInvocationContext }
  | { ok: false; result: ReturnType<typeof chatGptAppContextErrorResult> };

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function header(extra: AppsSdkToolExtra, name: string): string | null {
  const headers = extra.requestInfo?.headers;
  if (!headers) return null;
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return firstHeaderValue(value);
  }
  return null;
}

function queryParam(extra: AppsSdkToolExtra, name: string): string | null {
  return extra.requestInfo?.url?.searchParams.get(name)?.trim() || null;
}

function resolveProfileId(extra: AppsSdkToolExtra): string | null {
  return header(extra, "x-ai-assistants-profile-id") ?? queryParam(extra, "profileId");
}

function resolveDeveloperId(extra: AppsSdkToolExtra): string | null {
  return header(extra, "x-ai-assistants-dev-identity") ?? queryParam(extra, "devIdentity");
}

function resolveConversationId(extra: AppsSdkToolExtra): string | null {
  return header(extra, "x-openai-conversation-id") ?? queryParam(extra, "conversationId");
}

export function resolveChatGptAppDiagnosticContext(
  extra: AppsSdkToolExtra,
): ChatGptAppDiagnosticContext {
  return {
    profileId: resolveProfileId(extra),
    developerId: resolveDeveloperId(extra),
    conversationId: resolveConversationId(extra),
  };
}

export function resolveChatGptAppInvocationContext(extra: AppsSdkToolExtra): ContextResolution {
  const profileId = resolveProfileId(extra);
  const developerId = resolveDeveloperId(extra);

  if (!profileId) {
    return {
      ok: false,
      result: chatGptAppContextErrorResult(
        "This assistant tool needs a profile context. Reconnect the app with a profileId before using profile-specific tools.",
      ),
    };
  }

  if (!developerId) {
    return {
      ok: false,
      result: chatGptAppContextErrorResult(
        "This assistant tool needs prototype developer identity. Reconnect the app with devIdentity before using profile-specific tools.",
      ),
    };
  }

  return {
    ok: true,
    context: {
      profileId,
      requestId: String(extra.requestId),
      auth: {
        kind: "prototype-dev",
        developerId,
      },
      correlation: {
        mcpSessionId: extra.sessionId ?? null,
        conversationId: resolveConversationId(extra),
      },
    },
  };
}
