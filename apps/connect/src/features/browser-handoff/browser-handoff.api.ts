import {
  browserHandoffResponseSchema,
  profileIdParamSchema,
  type ConnectBrowserHandoffDto,
} from "@ai-assistants/connect-api-contracts";
import { z } from "zod";
import { backendFetch } from "../../shared/api/backend-api";

const handoffIdParamSchema = z.string().trim().uuid();

const browserHandoffInputSchema = z
  .object({
    profileId: profileIdParamSchema,
    handoffId: handoffIdParamSchema,
  })
  .strict();

function handoffPath(input: unknown): string {
  const { profileId, handoffId } = browserHandoffInputSchema.parse(input);
  return `/profiles/${encodeURIComponent(profileId)}/browser-handoffs/${encodeURIComponent(handoffId)}`;
}

export async function getBrowserHandoff(input: unknown): Promise<ConnectBrowserHandoffDto> {
  const payload = await backendFetch(handoffPath(input), browserHandoffResponseSchema);
  return payload.handoff;
}

export async function completeBrowserHandoff(
  input: unknown,
): Promise<ConnectBrowserHandoffDto> {
  const payload = await backendFetch(
    `${handoffPath(input)}/complete`,
    browserHandoffResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return payload.handoff;
}

export async function cancelBrowserHandoff(input: unknown): Promise<ConnectBrowserHandoffDto> {
  const payload = await backendFetch(`${handoffPath(input)}/cancel`, browserHandoffResponseSchema, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return payload.handoff;
}
