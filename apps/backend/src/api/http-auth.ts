import { requireAiAssistantsMachineToken, requireAuthenticatedUser } from "../auth/user-auth";

export async function authenticatedUser(c: { req: { raw: Request } }) {
  return requireAuthenticatedUser(c.req.raw.headers);
}

export function requireMachine(c: { req: { raw: Request } }) {
  requireAiAssistantsMachineToken(c.req.raw.headers);
}
