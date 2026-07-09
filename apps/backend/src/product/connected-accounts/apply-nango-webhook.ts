import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { applyForwardedGmailWebhook } from "../../capabilities/gmail/notification";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { applyNangoAuthWebhook } from "../../integrations/nango/apply-auth-webhook";
import {
  parseNangoWebhookJson,
  verifyNangoWebhookRequest,
} from "../../integrations/nango/webhook-verification";

const nangoWebhookKindSchema = z
  .object({
    type: z.string().optional(),
    from: z.string().optional(),
  })
  .passthrough();

export async function applyNangoWebhook(input: {
  db: SupabaseServiceClient;
  rawBody: string;
  headers: Headers;
}): Promise<{ ok: true; handled: boolean }> {
  verifyNangoWebhookRequest(input.rawBody, input.headers);
  const parsed = parseNangoWebhookJson(input.rawBody);
  const kind = nangoWebhookKindSchema.safeParse(parsed);
  if (kind.success && kind.data.type === "auth") {
    return applyNangoAuthWebhook(input);
  }
  const gmail = await applyForwardedGmailWebhook({ db: input.db, body: parsed, headers: input.headers });
  if (gmail.handled) return { ok: true, handled: true };

  emitDiagnostic(backendDiagnosticLogger(), "nango.webhook.ignored", {
    ok: true,
    attrs: {
      reason: "unsupported_payload",
      type: kind.success ? (kind.data.type ?? null) : null,
      from: kind.success ? (kind.data.from ?? null) : null,
      body_bytes: input.rawBody.length,
    },
  });
  return { ok: true, handled: false };
}
