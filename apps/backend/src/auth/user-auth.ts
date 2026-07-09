import { createClient, type User } from "@supabase/supabase-js";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { backendApiEnv } from "../shared/env";
import { constantTimeStringEqual } from "../shared/security";

const AI_ASSISTANTS_MACHINE_TOKEN_HEADER = "x-ai-assistants-machine-token";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  raw: User;
};

function requireConfiguredMachineToken(expected = backendApiEnv().backendMachineToken): string {
  if (!expected)
    throw new DomainError(
      domainCodes.SERVICE_UNAVAILABLE,
      "AI_ASSISTANTS_BACKEND_MACHINE_TOKEN is not configured.",
    );
  return expected;
}

function machineTokenFromHeaders(headers: Headers): string | null {
  const fromHeader = headers.get(AI_ASSISTANTS_MACHINE_TOKEN_HEADER);
  if (fromHeader !== null) return fromHeader.trim() || null;

  const authorization = headers.get("authorization")?.trim();
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || null;
}

export function requireAiAssistantsMachineToken(
  headers: Headers,
  expectedMachineToken?: string,
): void {
  const expected = requireConfiguredMachineToken(expectedMachineToken);
  const actual = machineTokenFromHeaders(headers);
  if (!actual || !constantTimeStringEqual(actual, expected)) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Invalid AI assistants machine token.");
  }
}

export async function requireAuthenticatedUser(
  headers: Headers,
  env?: NodeJS.ProcessEnv,
): Promise<AuthenticatedUser> {
  const parsedEnv = env
    ? { supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY }
    : {
        supabaseUrl: backendApiEnv().supabaseUrl,
        supabaseAnonKey: backendApiEnv().supabaseAnonKey,
      };
  const supabaseUrl = parsedEnv.supabaseUrl;
  const supabaseAnonKey = parsedEnv.supabaseAnonKey;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new DomainError(
      domainCodes.SERVICE_UNAVAILABLE,
      "SUPABASE_URL and SUPABASE_ANON_KEY are required for user auth.",
    );
  }
  const accessToken = headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!accessToken)
    throw new DomainError(domainCodes.UNAUTHORIZED, "Missing Supabase bearer token.");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      error?.message || "Invalid Supabase user token.",
    );
  }
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    raw: data.user,
  };
}
