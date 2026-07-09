import {
  requireJsonObject,
  requireSupabaseData,
  type Json,
  type SupabaseServiceClient,
  type TableInsert,
  type TableRow,
} from "@ai-assistants/control-db";
import { providerFileStateRowSchema } from "@ai-assistants/control-plane-contracts";

export type ProviderFileState = TableRow<"provider_file_states">;

export type ProviderFileStateUpsertInput = {
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccountId: string;
  providerKey: string;
  resourceType: string;
  resourceId: string;
  externalFileId: string;
  name?: string | null;
  webUrl?: string | null;
  mimeType?: string | null;
  etag?: string | null;
  ctag?: string | null;
  parentReference?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  lastModifiedAt?: string | null;
  deletedAt?: string | null;
};

function parseProviderFileState(row: unknown): ProviderFileState {
  return providerFileStateRowSchema.parse(row);
}

export async function loadProviderFileState(input: {
  db: SupabaseServiceClient;
  connectedProviderAccountId: string;
  providerKey: string;
  resourceType: string;
  resourceId: string;
  externalFileId: string;
}): Promise<ProviderFileState | null> {
  const result = await input.db
    .from("provider_file_states")
    .select()
    .eq("connected_provider_account_id", input.connectedProviderAccountId)
    .eq("provider_key", input.providerKey)
    .eq("resource_type", input.resourceType)
    .eq("resource_id", input.resourceId)
    .eq("external_file_id", input.externalFileId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? parseProviderFileState(result.data) : null;
}

export async function upsertProviderFileState(
  db: SupabaseServiceClient,
  input: ProviderFileStateUpsertInput,
): Promise<ProviderFileState> {
  const row = {
    profile_id: input.profileId,
    capability_account_link_id: input.capabilityAccountLinkId,
    connected_provider_account_id: input.connectedProviderAccountId,
    provider_key: input.providerKey,
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    external_file_id: input.externalFileId,
    name: input.name ?? null,
    web_url: input.webUrl ?? null,
    mime_type: input.mimeType ?? null,
    etag: input.etag ?? null,
    ctag: input.ctag ?? null,
    parent_reference: requireJsonObject(
      input.parentReference ?? {},
      "providerFileState.parentReference",
    ) as Json,
    metadata: requireJsonObject(input.metadata ?? {}, "providerFileState.metadata") as Json,
    last_modified_at: input.lastModifiedAt ?? null,
    deleted_at: input.deletedAt ?? null,
  } satisfies TableInsert<"provider_file_states">;
  const result = await db
    .from("provider_file_states")
    .upsert(row, {
      onConflict:
        "connected_provider_account_id,provider_key,resource_type,resource_id,external_file_id",
    })
    .select()
    .single();
  return parseProviderFileState(
    requireSupabaseData("Upsert provider file state", result.data, result.error),
  );
}
