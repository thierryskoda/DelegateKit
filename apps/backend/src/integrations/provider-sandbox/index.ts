import { z } from "zod";
import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type Json,
  type SupabaseServiceClient,
  type TableInsert,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  providerSandboxRequestRowSchema,
  providerSandboxResourceRowSchema,
} from "@ai-assistants/control-plane-contracts";

export type ProviderSandboxBinding = {
  link: TableRow<"capability_account_links">;
  account: TableRow<"connected_provider_accounts">;
};

export type ProviderSandboxResource = TableRow<"provider_sandbox_resources">;
type ProviderSandboxRequest = TableRow<"provider_sandbox_requests">;

export type ProviderSandboxResourceKey = {
  providerKey: string;
  resourceType: string;
  resourceId: string;
};

type ProviderSandboxRequestResource = {
  resourceType: string;
  resourceId: string;
};

type ProviderSandboxOperationContext<TRequest> = {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  request: TRequest;
};

export type ProviderSandboxOperationDefinition<TRequest, TResponse> = {
  providerKey: string;
  operation: string;
  requestSchema: z.ZodType<TRequest>;
  responseSchema: z.ZodType<TResponse>;
  resolveResource?(request: TRequest): ProviderSandboxRequestResource | null;
  handle(input: ProviderSandboxOperationContext<TRequest>): Promise<TResponse>;
};

const sandboxOperations = new Map<string, ProviderSandboxOperationDefinition<unknown, unknown>>();

function operationKey(providerKey: string, operation: string): string {
  return `${providerKey}:${operation}`;
}

function jsonObject(value: Record<string, unknown>, label: string): Json {
  return requireJsonObject(value, label);
}

function parseSandboxResource(row: unknown): ProviderSandboxResource {
  return providerSandboxResourceRowSchema.parse(row);
}

function parseSandboxRequest(row: unknown): ProviderSandboxRequest {
  return providerSandboxRequestRowSchema.parse(row);
}

function providerSandboxScope(input: {
  binding: ProviderSandboxBinding;
  providerKey: string;
}): {
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccountId: string;
  providerKey: string;
} {
  if (input.binding.link.profile_id !== input.binding.account.profile_id) {
    throw new Error(
      `Provider sandbox binding profile mismatch: link ${input.binding.link.id} profile ${input.binding.link.profile_id}, account ${input.binding.account.id} profile ${input.binding.account.profile_id}.`,
    );
  }
  if (input.binding.link.connected_provider_account_id !== input.binding.account.id) {
    throw new Error(
      `Provider sandbox binding account mismatch: link ${input.binding.link.id} points to ${input.binding.link.connected_provider_account_id}, got account ${input.binding.account.id}.`,
    );
  }
  return {
    profileId: input.binding.link.profile_id,
    capabilityAccountLinkId: input.binding.link.id,
    connectedProviderAccountId: input.binding.account.id,
    providerKey: input.providerKey,
  };
}

export function registerProviderSandboxOperation<TRequest, TResponse>(
  definition: ProviderSandboxOperationDefinition<TRequest, TResponse>,
): ProviderSandboxOperationDefinition<TRequest, TResponse> {
  const key = operationKey(definition.providerKey, definition.operation);
  const existing = sandboxOperations.get(key);
  if (existing && existing !== definition) {
    throw new Error(`Provider sandbox operation already registered: ${key}.`);
  }
  sandboxOperations.set(
    key,
    definition as ProviderSandboxOperationDefinition<unknown, unknown>,
  );
  return definition;
}

export function requireProviderSandboxOperation(
  providerKey: string,
  operation: string,
): ProviderSandboxOperationDefinition<unknown, unknown> {
  const definition = sandboxOperations.get(operationKey(providerKey, operation));
  if (!definition) {
    throw new Error(`No provider sandbox operation registered for ${providerKey}/${operation}.`);
  }
  return definition;
}

export async function upsertProviderSandboxResource(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  key: ProviderSandboxResourceKey;
  state: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<ProviderSandboxResource> {
  const scope = providerSandboxScope({
    binding: input.binding,
    providerKey: input.key.providerKey,
  });
  const insert = {
    profile_id: scope.profileId,
    capability_account_link_id: scope.capabilityAccountLinkId,
    connected_provider_account_id: scope.connectedProviderAccountId,
    provider_key: scope.providerKey,
    resource_type: input.key.resourceType,
    resource_id: input.key.resourceId,
    state: jsonObject(input.state, "providerSandboxResource.state"),
    metadata: jsonObject(input.metadata ?? {}, "providerSandboxResource.metadata"),
  } satisfies TableInsert<"provider_sandbox_resources">;
  const result = await input.db
    .from("provider_sandbox_resources")
    .upsert(insert, {
      onConflict:
        "connected_provider_account_id,provider_key,resource_type,resource_id",
    })
    .select()
    .single();
  return parseSandboxResource(
    requireSupabaseData("Upsert provider sandbox resource", result.data, result.error),
  );
}

export async function listProviderSandboxResources(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  providerKey: string;
  resourceType?: string;
}): Promise<ProviderSandboxResource[]> {
  const scope = providerSandboxScope({
    binding: input.binding,
    providerKey: input.providerKey,
  });
  let query = input.db
    .from("provider_sandbox_resources")
    .select()
    .eq("connected_provider_account_id", scope.connectedProviderAccountId)
    .eq("provider_key", scope.providerKey)
    .order("updated_at", { ascending: false });
  if (input.resourceType) query = query.eq("resource_type", input.resourceType);
  const result = await query;
  return requireSupabaseRows(
    "List provider sandbox resources",
    result.data,
    result.error,
  ).map((row) => parseSandboxResource(row));
}

async function recordProviderSandboxRequest(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  providerKey: string;
  operation: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  resource?: ProviderSandboxRequestResource | null;
  metadata?: Record<string, unknown>;
  status?: "succeeded" | "failed";
  error?: Record<string, unknown> | null;
}): Promise<ProviderSandboxRequest> {
  const scope = providerSandboxScope({
    binding: input.binding,
    providerKey: input.providerKey,
  });
  const insert = {
    profile_id: scope.profileId,
    capability_account_link_id: scope.capabilityAccountLinkId,
    connected_provider_account_id: scope.connectedProviderAccountId,
    provider_key: scope.providerKey,
    operation: input.operation,
    resource_type: input.resource?.resourceType ?? null,
    resource_id: input.resource?.resourceId ?? null,
    request: jsonObject(input.request, "providerSandboxRequest.request"),
    response: jsonObject(input.response, "providerSandboxRequest.response"),
    status: input.status ?? "succeeded",
    error: input.error ? jsonObject(input.error, "providerSandboxRequest.error") : null,
    metadata: jsonObject(input.metadata ?? {}, "providerSandboxRequest.metadata"),
  } satisfies TableInsert<"provider_sandbox_requests">;
  const result = await input.db
    .from("provider_sandbox_requests")
    .insert(insert)
    .select()
    .single();
  return parseSandboxRequest(
    requireSupabaseData("Record provider sandbox request", result.data, result.error),
  );
}

export async function runProviderSandboxOperation<TRequest, TResponse>(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  definition: ProviderSandboxOperationDefinition<TRequest, TResponse>;
  request: unknown;
  metadata?: Record<string, unknown>;
}): Promise<TResponse> {
  const request = input.definition.requestSchema.parse(input.request);
  const response = input.definition.responseSchema.parse(
    await input.definition.handle({
      db: input.db,
      binding: input.binding,
      request,
    }),
  );
  const resource = input.definition.resolveResource?.(request) ?? null;
  await recordProviderSandboxRequest({
    db: input.db,
    binding: input.binding,
    providerKey: input.definition.providerKey,
    operation: input.definition.operation,
    request: input.request && typeof input.request === "object" && !Array.isArray(input.request)
      ? (input.request as Record<string, unknown>)
      : { value: input.request },
    response: response && typeof response === "object" && !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : { value: response },
    resource,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
  return response;
}
