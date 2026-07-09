import { toPublicApiErrorBody } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import type { ErrorHandler } from "hono";
import {
  isHttpServerFailureStatus,
  normalizeControlPlaneError,
  toHttpError,
} from "../../shared/http-error";
import { backendDiagnosticLogger } from "../../shared/diagnostics";

export const httpErrorHandler: ErrorHandler = (error, c) => {
  const httpError = toHttpError(error);
  const url = new URL(c.req.url);
  if (isHttpServerFailureStatus(httpError.status)) {
    emitDiagnostic(backendDiagnosticLogger(), "http.request.error", {
      ok: false,
      level: "error",
      err: error,
      attrs: { method: c.req.method, path: url.pathname, status: httpError.status },
    });
  }
  return Response.json(toPublicApiErrorBody(normalizeControlPlaneError(error)), {
    status: httpError.status,
  });
};
