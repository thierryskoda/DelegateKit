import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  publicWebAuthContextSchema,
  type PublicWebAuthContext,
} from "@ai-assistants/public-web-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";

export function browserAuthContextDto(
  row: TableRow<"browser_auth_contexts">,
): PublicWebAuthContext {
  return publicWebAuthContextSchema.parse({
    authContextId: row.id,
    label: row.label,
    primaryDomain: row.primary_domain,
    allowedDomains: row.allowed_domains,
    accountHint: row.account_hint,
    status: row.status,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listActiveBrowserAuthContexts(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<TableRow<"browser_auth_contexts">[]> {
  const result = await db
    .from("browser_auth_contexts")
    .select()
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  return requireSupabaseRows("List browser auth contexts", result.data, result.error);
}

export async function requireActiveBrowserAuthContext(
  db: SupabaseServiceClient,
  profileId: string,
  authContextId: string,
): Promise<TableRow<"browser_auth_contexts">> {
  const result = await db
    .from("browser_auth_contexts")
    .select()
    .eq("id", authContextId)
    .eq("profile_id", profileId)
    .maybeSingle();
  const row = requireSupabaseData("Load browser auth context", result.data, result.error);
  if (row.status !== "active") {
    throw new DomainError(domainCodes.CONFLICT, `Browser auth context ${authContextId} is deleted.`);
  }
  return row;
}

export async function createBrowserAuthContext(input: {
  db: SupabaseServiceClient;
  profileId: string;
  label: string;
  primaryDomain: string;
  allowedDomains: readonly string[];
  accountHint?: string | null;
  providerContextId: string;
}): Promise<TableRow<"browser_auth_contexts">> {
  const result = await input.db
    .from("browser_auth_contexts")
    .insert({
      profile_id: input.profileId,
      label: input.label,
      primary_domain: input.primaryDomain,
      allowed_domains: [...input.allowedDomains],
      account_hint: input.accountHint ?? null,
      browserbase_context_id: input.providerContextId,
      status: "active",
    })
    .select()
    .single();
  return requireSupabaseData("Create browser auth context", result.data, result.error);
}

export async function markBrowserAuthContextVerified(
  db: SupabaseServiceClient,
  row: TableRow<"browser_auth_contexts">,
): Promise<TableRow<"browser_auth_contexts">> {
  const result = await db
    .from("browser_auth_contexts")
    .update({
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("profile_id", row.profile_id)
    .select()
    .single();
  return requireSupabaseData("Mark browser auth context verified", result.data, result.error);
}

export async function markBrowserAuthContextDeleted(input: {
  db: SupabaseServiceClient;
  profileId: string;
  authContextId: string;
}): Promise<TableRow<"browser_auth_contexts">> {
  const now = new Date().toISOString();
  const result = await input.db
    .from("browser_auth_contexts")
    .update({
      status: "deleted",
      deleted_at: now,
      updated_at: now,
    })
    .eq("id", input.authContextId)
    .eq("profile_id", input.profileId)
    .select()
    .maybeSingle();
  return requireSupabaseData("Delete browser auth context", result.data, result.error);
}
