import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { Database, Json } from "@ai-assistants/control-plane-contracts";
import { mapPostgrestErrorToDomainCode } from "./postgrest-domain-error";

export type { PostgrestError };
export type SupabaseServiceClient = SupabaseClient<Database>;

export type TableName = keyof Database["public"]["Tables"];
export type TableRow<TTable extends TableName> = Database["public"]["Tables"][TTable]["Row"];
export type TableInsert<TTable extends TableName> = Database["public"]["Tables"][TTable]["Insert"];
export type TableUpdate<TTable extends TableName> = Database["public"]["Tables"][TTable]["Update"];

export type Profile = TableRow<"profiles">;
export type Assistant = TableRow<"assistants">;

export type SupabaseServiceConfig = {
  url: string;
  serviceRoleKey: string;
};

let cached: SupabaseServiceClient | null = null;

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new DomainError(
      domainCodes.SERVICE_UNAVAILABLE,
      `${name} is required for the Supabase backend data plane.`,
    );
  }
  return value;
}

export function supabaseServiceConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseServiceConfig {
  return {
    url: requiredEnv(env, "SUPABASE_URL"),
    serviceRoleKey: requiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function createSupabaseServiceClient(
  config: SupabaseServiceConfig = supabaseServiceConfigFromEnv(),
): SupabaseServiceClient {
  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function configureSupabaseServiceClient(
  config: SupabaseServiceConfig,
): SupabaseServiceClient {
  cached = createSupabaseServiceClient(config);
  return cached;
}

export function getSupabaseServiceClient(): SupabaseServiceClient {
  cached ??= createSupabaseServiceClient();
  return cached;
}

export function formatSupabaseError(error: PostgrestError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" ");
}

export function throwSupabaseError(label: string, error: PostgrestError | null): never {
  if (!error) {
    throw new DomainError(domainCodes.INTERNAL, `${label}: Supabase returned an unknown error.`);
  }
  const code = mapPostgrestErrorToDomainCode(error);
  const message = `${label}: ${formatSupabaseError(error)}`;
  throw new DomainError(code, message, { cause: error, details: { label } });
}

export function requireSupabaseData<T>(
  label: string,
  data: T | null,
  error: PostgrestError | null,
): T {
  if (error) throwSupabaseError(label, error);
  if (data === null) {
    throw new DomainError(domainCodes.INTERNAL, `${label}: Supabase returned no data.`);
  }
  return data;
}

export function requireSupabaseRows<T>(
  label: string,
  data: T[] | null,
  error: PostgrestError | null,
): T[] {
  if (error) throwSupabaseError(label, error);
  if (!data) {
    throw new DomainError(domainCodes.INTERNAL, `${label}: Supabase returned no rows array.`);
  }
  return data;
}

export function requireJson(value: unknown, label: string): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (Array.isArray(value))
    return value.map((entry, index) => requireJson(entry, `${label}[${index}]`));
  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, requireJson(entry, `${label}.${key}`)]),
    );
  }
  throw new DomainError(domainCodes.BAD_REQUEST, `${label} must be JSON-serializable.`);
}

export function requireJsonObject(value: object, label: string): Json {
  return requireJson(value, label);
}
