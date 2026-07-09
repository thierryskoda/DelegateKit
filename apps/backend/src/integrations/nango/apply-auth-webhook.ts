import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { reconcileNangoAuthConnection } from "./reconcile-auth-connection";
import { parseNangoWebhookJson, verifyNangoWebhookRequest } from "./webhook-verification";
import { backendDiagnosticLogger } from "../../shared/diagnostics";

const nangoAuthWebhookBodySchema = z
  .object({
    type: z.literal("auth"),
    operation: z.enum(["creation", "override"]),
    success: z.boolean(),
    connectionId: z.string().min(1),
    providerConfigKey: z.string().min(1),
    tags: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

export async function applyNangoAuthWebhook(input: {
  db: SupabaseServiceClient;
  rawBody: string;
  headers: Headers;
}): Promise<{ ok: true; handled: boolean }> {
  verifyNangoWebhookRequest(input.rawBody, input.headers);
  const body = nangoAuthWebhookBodySchema.safeParse(parseNangoWebhookJson(input.rawBody));
  if (!body.success || body.data.type !== "auth") {
    emitDiagnostic(backendDiagnosticLogger(), "nango.auth_webhook.ignored", {
      ok: true,
      attrs: {
        reason: "unsupported_payload",
        body_bytes: input.rawBody.length,
      },
    });
    return { ok: true, handled: false };
  }

  emitDiagnostic(backendDiagnosticLogger(), "nango.auth_webhook.received", {
    ok: true,
    attrs: {
      operation: body.data.operation,
      success: body.data.success,
      provider_config_key: body.data.providerConfigKey,
      connection_id: body.data.connectionId,
      has_profile_tag: Boolean(body.data.tags?.profile_id?.trim()),
      has_connect_intent_tag: Boolean(body.data.tags?.connect_intent_id?.trim()),
      has_capability_account_link_tag: Boolean(
        body.data.tags?.capability_account_link_id?.trim(),
      ),
      body_bytes: input.rawBody.length,
    },
  });

  if (!body.data.success) {
    emitDiagnostic(backendDiagnosticLogger(), "nango.auth_webhook.ignored", {
      ok: true,
      attrs: {
        reason: "auth_not_successful",
        operation: body.data.operation,
        provider_config_key: body.data.providerConfigKey,
        connection_id: body.data.connectionId,
      },
    });
    return { ok: true, handled: false };
  }

  const tags = body.data.tags ?? {};
  const profileId = tags.profile_id?.trim();
  const connectIntentId = tags.connect_intent_id?.trim();
  const capabilityAccountLinkId = tags.capability_account_link_id?.trim();
  if (!profileId || (!connectIntentId && !capabilityAccountLinkId)) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Nango auth webhook missing required tags profile_id and connect_intent_id or capability_account_link_id (set them on the Connect session).",
    );
  }

  await reconcileNangoAuthConnection({
    db: input.db,
    profileId,
    ...(connectIntentId ? { connectIntentId } : { capabilityAccountLinkId: capabilityAccountLinkId! }),
    providerConfigKey: body.data.providerConfigKey,
    connectionId: body.data.connectionId,
  });

  return { ok: true, handled: true };
}
