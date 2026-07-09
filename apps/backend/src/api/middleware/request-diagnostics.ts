import { randomUUID } from "node:crypto";
import { DomainError } from "@ai-assistants/errors";
import { emitDiagnostic, withDiagnosticContext } from "@ai-assistants/runtime-diagnostics";
import type { MiddlewareHandler } from "hono";
import {
  isHttpServerFailureStatus,
  normalizeControlPlaneError,
  toHttpError,
} from "../../shared/http-error";
import { backendDiagnosticLogger } from "../../shared/diagnostics";

function requestDiagnosticsBase(pathname: string): {
  profile_id?: string;
  capability_account_link_id?: string;
} {
  const profileMatch = pathname.match(/^\/profiles\/([^/]+)/);
  const capabilityLinkMatch = pathname.match(
    /^\/profiles\/[^/]+\/(?:capabilities|capability-account-links)\/([0-9a-f-]{36})/i,
  );
  const connectIntentMatch = pathname.match(
    /^\/profiles\/[^/]+\/connect-intents\/([0-9a-f-]{36})/i,
  );
  const capabilityLinkId = capabilityLinkMatch?.[1] ?? connectIntentMatch?.[1];
  return {
    ...(profileMatch?.[1] ? { profile_id: decodeURIComponent(profileMatch[1]) } : {}),
    ...(capabilityLinkId
      ? { capability_account_link_id: decodeURIComponent(capabilityLinkId) }
      : {}),
  };
}

export const requestDiagnosticsMiddleware: MiddlewareHandler = async (c, next) => {
  const startedAt = Date.now();
  const requestId = c.req.header("x-request-id")?.trim() || randomUUID();
  const url = new URL(c.req.url);
  c.header("x-request-id", requestId);
  return withDiagnosticContext(
    { request_id: requestId, ...requestDiagnosticsBase(url.pathname) },
    async () => {
      let thrown: unknown;
      try {
        await next();
      } catch (error) {
        thrown = error;
        throw error;
      } finally {
        const status = thrown ? toHttpError(thrown).status : c.res.status || 200;
        const normalized = thrown ? normalizeControlPlaneError(thrown) : null;
        const domainCode = normalized instanceof DomainError ? normalized.code : undefined;
        emitDiagnostic(backendDiagnosticLogger(), "http.request.completed", {
          ok: status < 400,
          level: isHttpServerFailureStatus(status) ? "error" : "info",
          duration_ms: Date.now() - startedAt,
          attrs: {
            method: c.req.method,
            path: url.pathname,
            status,
            ...(domainCode ? { domain_code: domainCode } : {}),
          },
        });
      }
    },
  );
};
