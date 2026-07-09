import { z } from "zod";

const nangoConnectionHealthPayloadSchema = z
  .object({
    errors: z
      .array(
        z
          .object({
            type: z.string().optional(),
            log_id: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const nangoInvalidCredentialsPayloadSchema = z
  .object({
    error: z
      .object({
        code: z.string().optional(),
        payload: z
          .object({
            connection: nangoConnectionHealthPayloadSchema.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type NangoConnectionHealthStatus =
  | "valid"
  | "auth_error_reconnect_required"
  | "missing_from_nango"
  | "request_failed";

export type NangoConnectionHealth = {
  status: NangoConnectionHealthStatus;
  detail: string;
  httpStatus: number | null;
  authErrorLogId?: string;
};

export function classifyNangoConnectionHealth(input: {
  httpStatus: number;
  bodyText: string;
}): NangoConnectionHealth {
  const snippet =
    input.bodyText.length > 600 ? `${input.bodyText.slice(0, 600)}...` : input.bodyText;
  if (input.httpStatus === 404) {
    return {
      status: "missing_from_nango",
      detail: snippet || "Nango returned 404.",
      httpStatus: input.httpStatus,
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.bodyText) as unknown;
  } catch {
    if (!String(input.httpStatus).startsWith("2")) {
      return {
        status: "request_failed",
        detail: snippet,
        httpStatus: input.httpStatus,
      };
    }
    return { status: "valid", detail: "Nango returned connection.", httpStatus: input.httpStatus };
  }
  if (!String(input.httpStatus).startsWith("2")) {
    const parsedError = nangoInvalidCredentialsPayloadSchema.safeParse(parsedJson);
    if (parsedError.success && parsedError.data.error?.code === "invalid_credentials") {
      const authError = parsedError.data.error.payload?.connection?.errors?.find(
        (error) => error.type === "auth",
      );
      return {
        status: "auth_error_reconnect_required",
        detail: authError?.log_id
          ? `Nango returned invalid credentials for this connection (log ${authError.log_id}).`
          : "Nango returned invalid credentials for this connection.",
        httpStatus: input.httpStatus,
        ...(authError?.log_id ? { authErrorLogId: authError.log_id } : {}),
      };
    }
    return {
      status: "request_failed",
      detail: snippet,
      httpStatus: input.httpStatus,
    };
  }
  const parsed = nangoConnectionHealthPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { status: "valid", detail: "Nango returned connection.", httpStatus: input.httpStatus };
  }
  const authError = parsed.data.errors?.find((error) => error.type === "auth");
  if (authError) {
    return {
      status: "auth_error_reconnect_required",
      detail: authError.log_id
        ? `Nango returned an auth error for this connection (log ${authError.log_id}).`
        : "Nango returned an auth error for this connection.",
      httpStatus: input.httpStatus,
      ...(authError.log_id ? { authErrorLogId: authError.log_id } : {}),
    };
  }
  return { status: "valid", detail: "Nango returned connection.", httpStatus: input.httpStatus };
}
