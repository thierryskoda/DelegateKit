import { formatUnknownError } from "@ai-assistants/errors";
import { safeParsePublicApiErrorBody, type DomainCode } from "@ai-assistants/errors";
import { z } from "zod";
import { requireConnectConfig } from "./config";

type AccessTokenProvider = () => string;
type UnauthorizedHandler = () => void | Promise<void>;

let accessTokenProvider: AccessTokenProvider | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;
let unauthorizedInFlight: Promise<void> | null = null;

export class BackendApiError extends Error {
  readonly code?: DomainCode;

  constructor(
    message: string,
    readonly status?: number,
    readonly details?: unknown,
    code?: DomainCode,
  ) {
    super(message);
    this.name = "BackendApiError";
    this.code = code;
  }
}

function validationMessage(error: z.ZodError): string {
  return formatUnknownError(error);
}

function requireAccessTokenForBackend(): string {
  if (!accessTokenProvider)
    throw new BackendApiError("Backend API access token provider was not initialized.");
  const token = accessTokenProvider();
  if (!token)
    throw new BackendApiError(
      "Authenticated Supabase session is required before calling the backend.",
    );
  return token;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new BackendApiError(
      `Backend returned non-JSON response for HTTP ${response.status}.`,
      response.status,
    );
  }
}

export function configureBackendAccessTokenProvider(provider: AccessTokenProvider): void {
  accessTokenProvider = provider;
}

/** Clears session + cache when the backend rejects the bearer (single interception point for all `backendFetch` calls). */
export function configureUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

async function notifyUnauthorized(): Promise<void> {
  if (!unauthorizedHandler) return;
  if (!unauthorizedInFlight) {
    unauthorizedInFlight = Promise.resolve(unauthorizedHandler()).finally(() => {
      unauthorizedInFlight = null;
    });
  }
  await unauthorizedInFlight;
}

export async function backendFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/")) throw new BackendApiError(`Backend path must start with "/": ${path}`);
  const config = requireConnectConfig();
  const response = await fetch(`${config.backendUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${requireAccessTokenForBackend()}`,
      ...init.headers,
    },
  });
  const payload = await readJson(response);
  if (!response.ok) {
    if (response.status === 401) {
      await notifyUnauthorized();
    }
    const parsed = safeParsePublicApiErrorBody(payload);
    if (parsed.success) {
      throw new BackendApiError(
        parsed.data.error,
        response.status,
        parsed.data.details,
        parsed.data.code,
      );
    }
    throw new BackendApiError(
      `Backend returned HTTP ${response.status} without a recognized error body.`,
      response.status,
      payload,
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new BackendApiError(
      `Backend response failed validation. ${validationMessage(parsed.error)}`,
      response.status,
      payload,
    );
  return parsed.data;
}
