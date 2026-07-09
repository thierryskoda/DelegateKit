import { z } from "zod";

import {
  envDefinitions,
  formatValidationError,
  profileEnvDefinitions,
  runtimeEnvDefinitions,
  zodIssues,
  type KnownEnvName,
} from "./env-validation";

const runtimeOptions = { allowPlaceholders: false } as const;

type EnvInput = NodeJS.ProcessEnv;

export type BackendApiEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  backendPort: number;
  backendMachineToken: string;
  backendPublicUrl: string;
  connectPublicUrl: string;
  oauthPublicUrl: string;
  nangoSecretKey: string;
  nangoWebhookSigningSecret: string;
  nangoProviderConfigKey?: string;
  nangoHost?: string;
  boldSignApiKey: string;
  boldSignDataCenter?: string;
  boldSignApiBaseUrl?: string;
  boldSignWebhookSigningSecret: string;
  boldSignWebhookSigningSecretOld?: string;
  telegramBotToken: string;
  telegramMiniAppBotUsername: string;
  telegramWebhookSecret?: string;
  gmailPubsubTopicName: string;
  mondayOauthClientId: string;
  mondaySigningSecret: string;
  mondayGraphqlApiVersion: string;
  sofficeBin?: string;
  libreOfficeBin: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  browserbaseApiKey: string;
  openAiApiKey: string;
  deepseekApiKey: string;
  perplexityApiKey: string;
};

export type BackendWorkerEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  deepseekApiKey: string;
  backendPublicUrl: string;
  connectPublicUrl: string;
  nangoSecretKey: string;
  nangoWebhookSigningSecret: string;
  gmailPubsubTopicName: string;
  mondaySigningSecret: string;
  mondayGraphqlApiVersion: string;
  boldSignApiKey: string;
  boldSignWebhookSigningSecret: string;
  boldSignWebhookSigningSecretOld?: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  workerId?: string;
  workerPollMs: number;
  workerLeaseSeconds: number;
  workerReclaimSweepMs: number;
  workerReclaimBatchLimit: number;
};

export type BackendProxyEnv = {
  backendUrl: string;
  machineToken: string;
};

export type ConnectWebEnv = {
  port: number;
  backendPublicUrl: string;
  supabasePublicUrl: string;
  supabaseAnonKey: string;
  hmrHost?: string;
};

export type DiagnosticsEnv = {
  captureText: boolean;
  logLevel: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";
};

export type BackendEnvService = "backend-api" | "backend-worker";

export type BackendServiceEnvMetadata = {
  required: readonly KnownEnvName[];
  optional: readonly KnownEnvName[];
};

export const backendApiRequiredEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AI_ASSISTANTS_BACKEND_MACHINE_TOKEN",
  "BACKEND_PUBLIC_URL",
  "CONNECT_PUBLIC_URL",
  "OAUTH_PUBLIC_URL",
  "NANGO_SECRET_KEY",
  "NANGO_WEBHOOK_SIGNING_SECRET",
  "BOLDSIGN_API_KEY",
  "BOLDSIGN_WEBHOOK_SIGNING_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_MINI_APP_BOT_USERNAME",
  "GMAIL_PUBSUB_TOPIC_NAME",
  "MONDAY_OAUTH_CLIENT_ID",
  "MONDAY_SIGNING_SECRET",
  "MONDAY_GRAPHQL_API_VERSION",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "BROWSERBASE_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "PERPLEXITY_API_KEY",
] as const satisfies readonly KnownEnvName[];

export const backendApiOptionalEnvNames = [
  "BACKEND_PORT",
  "NANGO_PROVIDER_CONFIG_KEY",
  "NANGO_HOST",
  "BOLDSIGN_DATA_CENTER",
  "BOLDSIGN_API_BASE_URL",
  "BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD",
  "TELEGRAM_WEBHOOK_SECRET",
  "SOFFICE_BIN",
  "LIBREOFFICE_BIN",
] as const satisfies readonly KnownEnvName[];

export const backendWorkerRequiredEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DEEPSEEK_API_KEY",
  "BACKEND_PUBLIC_URL",
  "CONNECT_PUBLIC_URL",
  "NANGO_SECRET_KEY",
  "NANGO_WEBHOOK_SIGNING_SECRET",
  "GMAIL_PUBSUB_TOPIC_NAME",
  "MONDAY_SIGNING_SECRET",
  "MONDAY_GRAPHQL_API_VERSION",
  "BOLDSIGN_API_KEY",
  "BOLDSIGN_WEBHOOK_SIGNING_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
] as const satisfies readonly KnownEnvName[];

export const backendWorkerOptionalEnvNames = [
  "BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD",
  "BACKEND_WORKER_ID",
  "BACKEND_WORKER_POLL_MS",
  "BACKEND_WORKER_LEASE_SECONDS",
  "BACKEND_WORKER_RECLAIM_SWEEP_MS",
  "BACKEND_WORKER_RECLAIM_BATCH_LIMIT",
] as const satisfies readonly KnownEnvName[];

export const backendServiceEnvMetadata = {
  "backend-api": {
    required: backendApiRequiredEnvNames,
    optional: backendApiOptionalEnvNames,
  },
  "backend-worker": {
    required: backendWorkerRequiredEnvNames,
    optional: backendWorkerOptionalEnvNames,
  },
} as const satisfies Record<BackendEnvService, BackendServiceEnvMetadata>;

const backendApiEnvSchema = z
  .object({
    SUPABASE_URL: backendRequiredEnvSchema("backend-api", "SUPABASE_URL"),
    SUPABASE_ANON_KEY: backendRequiredEnvSchema("backend-api", "SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: backendRequiredEnvSchema("backend-api", "SUPABASE_SERVICE_ROLE_KEY"),
    BACKEND_PORT: optionalEnvSchema("BACKEND_PORT"),
    AI_ASSISTANTS_BACKEND_MACHINE_TOKEN: backendRequiredEnvSchema(
      "backend-api",
      "AI_ASSISTANTS_BACKEND_MACHINE_TOKEN",
    ),
    BACKEND_PUBLIC_URL: backendRequiredEnvSchema("backend-api", "BACKEND_PUBLIC_URL"),
    CONNECT_PUBLIC_URL: backendRequiredEnvSchema("backend-api", "CONNECT_PUBLIC_URL"),
    OAUTH_PUBLIC_URL: backendRequiredEnvSchema("backend-api", "OAUTH_PUBLIC_URL"),
    NANGO_SECRET_KEY: backendRequiredEnvSchema("backend-api", "NANGO_SECRET_KEY"),
    NANGO_WEBHOOK_SIGNING_SECRET: backendRequiredEnvSchema(
      "backend-api",
      "NANGO_WEBHOOK_SIGNING_SECRET",
    ),
    NANGO_PROVIDER_CONFIG_KEY: optionalEnvSchema("NANGO_PROVIDER_CONFIG_KEY"),
    NANGO_HOST: optionalEnvSchema("NANGO_HOST"),
    BOLDSIGN_API_KEY: backendRequiredEnvSchema("backend-api", "BOLDSIGN_API_KEY"),
    BOLDSIGN_DATA_CENTER: optionalEnvSchema("BOLDSIGN_DATA_CENTER"),
    BOLDSIGN_API_BASE_URL: optionalEnvSchema("BOLDSIGN_API_BASE_URL"),
    BOLDSIGN_WEBHOOK_SIGNING_SECRET: backendRequiredEnvSchema(
      "backend-api",
      "BOLDSIGN_WEBHOOK_SIGNING_SECRET",
    ),
    BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD: optionalEnvSchema("BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD"),
    TELEGRAM_BOT_TOKEN: backendRequiredEnvSchema("backend-api", "TELEGRAM_BOT_TOKEN"),
    TELEGRAM_MINI_APP_BOT_USERNAME: backendRequiredEnvSchema(
      "backend-api",
      "TELEGRAM_MINI_APP_BOT_USERNAME",
    ),
    TELEGRAM_WEBHOOK_SECRET: optionalEnvSchema("TELEGRAM_WEBHOOK_SECRET"),
    GMAIL_PUBSUB_TOPIC_NAME: backendRequiredEnvSchema("backend-api", "GMAIL_PUBSUB_TOPIC_NAME"),
    MONDAY_OAUTH_CLIENT_ID: backendRequiredEnvSchema("backend-api", "MONDAY_OAUTH_CLIENT_ID"),
    MONDAY_SIGNING_SECRET: backendRequiredEnvSchema("backend-api", "MONDAY_SIGNING_SECRET"),
    MONDAY_GRAPHQL_API_VERSION: backendRequiredEnvSchema(
      "backend-api",
      "MONDAY_GRAPHQL_API_VERSION",
    ),
    SOFFICE_BIN: optionalEnvSchema("SOFFICE_BIN"),
    LIBREOFFICE_BIN: optionalEnvSchema("LIBREOFFICE_BIN"),
    TWILIO_ACCOUNT_SID: backendRequiredEnvSchema("backend-api", "TWILIO_ACCOUNT_SID"),
    TWILIO_AUTH_TOKEN: backendRequiredEnvSchema("backend-api", "TWILIO_AUTH_TOKEN"),
    TWILIO_FROM_NUMBER: backendRequiredEnvSchema("backend-api", "TWILIO_FROM_NUMBER"),
    BROWSERBASE_API_KEY: backendRequiredEnvSchema("backend-api", "BROWSERBASE_API_KEY"),
    OPENAI_API_KEY: backendRequiredEnvSchema("backend-api", "OPENAI_API_KEY"),
    DEEPSEEK_API_KEY: backendRequiredEnvSchema("backend-api", "DEEPSEEK_API_KEY"),
    PERPLEXITY_API_KEY: backendRequiredEnvSchema("backend-api", "PERPLEXITY_API_KEY"),
  })
  .passthrough();

const backendWorkerEnvSchema = z
  .object({
    SUPABASE_URL: backendRequiredEnvSchema("backend-worker", "SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: backendRequiredEnvSchema(
      "backend-worker",
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
    DEEPSEEK_API_KEY: backendRequiredEnvSchema("backend-worker", "DEEPSEEK_API_KEY"),
    BACKEND_PUBLIC_URL: backendRequiredEnvSchema("backend-worker", "BACKEND_PUBLIC_URL"),
    CONNECT_PUBLIC_URL: backendRequiredEnvSchema("backend-worker", "CONNECT_PUBLIC_URL"),
    NANGO_SECRET_KEY: backendRequiredEnvSchema("backend-worker", "NANGO_SECRET_KEY"),
    NANGO_WEBHOOK_SIGNING_SECRET: backendRequiredEnvSchema(
      "backend-worker",
      "NANGO_WEBHOOK_SIGNING_SECRET",
    ),
    GMAIL_PUBSUB_TOPIC_NAME: backendRequiredEnvSchema("backend-worker", "GMAIL_PUBSUB_TOPIC_NAME"),
    MONDAY_SIGNING_SECRET: backendRequiredEnvSchema("backend-worker", "MONDAY_SIGNING_SECRET"),
    MONDAY_GRAPHQL_API_VERSION: backendRequiredEnvSchema(
      "backend-worker",
      "MONDAY_GRAPHQL_API_VERSION",
    ),
    BOLDSIGN_API_KEY: backendRequiredEnvSchema("backend-worker", "BOLDSIGN_API_KEY"),
    BOLDSIGN_WEBHOOK_SIGNING_SECRET: backendRequiredEnvSchema(
      "backend-worker",
      "BOLDSIGN_WEBHOOK_SIGNING_SECRET",
    ),
    BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD: optionalEnvSchema("BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD"),
    TWILIO_ACCOUNT_SID: backendRequiredEnvSchema("backend-worker", "TWILIO_ACCOUNT_SID"),
    TWILIO_AUTH_TOKEN: backendRequiredEnvSchema("backend-worker", "TWILIO_AUTH_TOKEN"),
    TWILIO_FROM_NUMBER: backendRequiredEnvSchema("backend-worker", "TWILIO_FROM_NUMBER"),
    BACKEND_WORKER_ID: optionalEnvSchema("BACKEND_WORKER_ID"),
    BACKEND_WORKER_POLL_MS: optionalEnvSchema("BACKEND_WORKER_POLL_MS"),
    BACKEND_WORKER_LEASE_SECONDS: optionalEnvSchema("BACKEND_WORKER_LEASE_SECONDS"),
    BACKEND_WORKER_RECLAIM_SWEEP_MS: optionalEnvSchema("BACKEND_WORKER_RECLAIM_SWEEP_MS"),
    BACKEND_WORKER_RECLAIM_BATCH_LIMIT: optionalEnvSchema("BACKEND_WORKER_RECLAIM_BATCH_LIMIT"),
  })
  .passthrough();

const backendProxyEnvSchema = z
  .object({
    AI_ASSISTANTS_BACKEND_URL: requiredEnvSchema("AI_ASSISTANTS_BACKEND_URL"),
    AI_ASSISTANTS_BACKEND_MACHINE_TOKEN: requiredEnvSchema("AI_ASSISTANTS_BACKEND_MACHINE_TOKEN"),
  })
  .passthrough();

const connectWebEnvSchema = z
  .object({
    PORT: optionalEnvSchema("PORT"),
    BACKEND_PUBLIC_URL: requiredEnvSchema("BACKEND_PUBLIC_URL"),
    SUPABASE_PUBLIC_URL: requiredEnvSchema("SUPABASE_PUBLIC_URL"),
    SUPABASE_ANON_KEY: requiredEnvSchema("SUPABASE_ANON_KEY"),
    VITE_CONNECT_HMR_HOST: optionalEnvSchema("VITE_CONNECT_HMR_HOST"),
  })
  .passthrough();

const diagnosticsEnvSchema = z
  .object({
    AI_ASSISTANTS_DIAGNOSTICS_CAPTURE_TEXT: z
      .preprocess(emptyStringToUndefined, z.string().optional()),
    AI_ASSISTANTS_DIAGNOSTICS_LOG_LEVEL: z.preprocess(
      emptyStringToUndefined,
      z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).optional(),
    ),
  })
  .passthrough();

let cachedBackendApiEnv: BackendApiEnv | null = null;
let cachedBackendWorkerEnv: BackendWorkerEnv | null = null;

function emptyStringToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function requiredEnvSchema(name: KnownEnvName): z.ZodType<string> {
  return envDefinitions[name].schema(runtimeOptions);
}

function backendRequiredEnvSchema(
  service: BackendEnvService,
  name: KnownEnvName,
): z.ZodType<string> {
  const requiredNames: readonly KnownEnvName[] = backendServiceEnvMetadata[service].required;
  if (!requiredNames.includes(name)) {
    throw new Error(`${name} is not declared as required for ${service}.`);
  }
  return requiredEnvSchema(name);
}

function optionalEnvSchema(name: KnownEnvName): z.ZodType<string | undefined> {
  return z.preprocess(
    emptyStringToUndefined,
    envDefinitions[name].schema(runtimeOptions).optional(),
  );
}

function parseWithSchema<T>(schema: z.ZodType<T>, env: EnvInput, title: string): T {
  const result = schema.safeParse(env);
  if (!result.success) throw formatValidationError(title, zodIssues(result.error));
  return result.data;
}

function integerValue(raw: string | undefined, defaultValue: number): number {
  return raw === undefined ? defaultValue : Number(raw);
}

function booleanValue(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  const clean = raw.toLowerCase();
  return clean === "1" || clean === "true" || clean === "yes" || clean === "on";
}

export function parseBackendApiEnv(env: EnvInput = process.env): BackendApiEnv {
  const parsed = parseWithSchema(
    backendApiEnvSchema,
    env,
    "Backend API environment is invalid (check the active profile `.env` under ~/.ai-assistants-<profile>/ or exported shell vars).",
  );
  return {
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseAnonKey: parsed.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    backendPort: integerValue(parsed.BACKEND_PORT, 8787),
    backendMachineToken: parsed.AI_ASSISTANTS_BACKEND_MACHINE_TOKEN,
    backendPublicUrl: parsed.BACKEND_PUBLIC_URL,
    connectPublicUrl: parsed.CONNECT_PUBLIC_URL,
    oauthPublicUrl: parsed.OAUTH_PUBLIC_URL,
    nangoSecretKey: parsed.NANGO_SECRET_KEY,
    nangoWebhookSigningSecret: parsed.NANGO_WEBHOOK_SIGNING_SECRET,
    ...(parsed.NANGO_PROVIDER_CONFIG_KEY
      ? { nangoProviderConfigKey: parsed.NANGO_PROVIDER_CONFIG_KEY }
      : {}),
    ...(parsed.NANGO_HOST ? { nangoHost: parsed.NANGO_HOST } : {}),
    boldSignApiKey: parsed.BOLDSIGN_API_KEY,
    ...(parsed.BOLDSIGN_DATA_CENTER ? { boldSignDataCenter: parsed.BOLDSIGN_DATA_CENTER } : {}),
    ...(parsed.BOLDSIGN_API_BASE_URL ? { boldSignApiBaseUrl: parsed.BOLDSIGN_API_BASE_URL } : {}),
    boldSignWebhookSigningSecret: parsed.BOLDSIGN_WEBHOOK_SIGNING_SECRET,
    ...(parsed.BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD
      ? { boldSignWebhookSigningSecretOld: parsed.BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD }
      : {}),
    telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
    telegramMiniAppBotUsername: parsed.TELEGRAM_MINI_APP_BOT_USERNAME,
    ...(parsed.TELEGRAM_WEBHOOK_SECRET
      ? { telegramWebhookSecret: parsed.TELEGRAM_WEBHOOK_SECRET }
      : {}),
    gmailPubsubTopicName: parsed.GMAIL_PUBSUB_TOPIC_NAME,
    mondayOauthClientId: parsed.MONDAY_OAUTH_CLIENT_ID,
    mondaySigningSecret: parsed.MONDAY_SIGNING_SECRET,
    mondayGraphqlApiVersion: parsed.MONDAY_GRAPHQL_API_VERSION,
    ...(parsed.SOFFICE_BIN ? { sofficeBin: parsed.SOFFICE_BIN } : {}),
    libreOfficeBin: parsed.LIBREOFFICE_BIN ?? "soffice",
    twilioAccountSid: parsed.TWILIO_ACCOUNT_SID,
    twilioAuthToken: parsed.TWILIO_AUTH_TOKEN,
    twilioFromNumber: parsed.TWILIO_FROM_NUMBER,
    browserbaseApiKey: parsed.BROWSERBASE_API_KEY,
    openAiApiKey: parsed.OPENAI_API_KEY,
    deepseekApiKey: parsed.DEEPSEEK_API_KEY,
    perplexityApiKey: parsed.PERPLEXITY_API_KEY,
  };
}

export function parseBackendWorkerEnv(env: EnvInput = process.env): BackendWorkerEnv {
  const parsed = parseWithSchema(
    backendWorkerEnvSchema,
    env,
    "Backend worker environment is invalid (check the active profile `.env` under ~/.ai-assistants-<profile>/ or exported shell vars).",
  );
  return {
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    deepseekApiKey: parsed.DEEPSEEK_API_KEY,
    backendPublicUrl: parsed.BACKEND_PUBLIC_URL,
    connectPublicUrl: parsed.CONNECT_PUBLIC_URL,
    nangoSecretKey: parsed.NANGO_SECRET_KEY,
    nangoWebhookSigningSecret: parsed.NANGO_WEBHOOK_SIGNING_SECRET,
    gmailPubsubTopicName: parsed.GMAIL_PUBSUB_TOPIC_NAME,
    mondaySigningSecret: parsed.MONDAY_SIGNING_SECRET,
    mondayGraphqlApiVersion: parsed.MONDAY_GRAPHQL_API_VERSION,
    boldSignApiKey: parsed.BOLDSIGN_API_KEY,
    boldSignWebhookSigningSecret: parsed.BOLDSIGN_WEBHOOK_SIGNING_SECRET,
    ...(parsed.BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD
      ? { boldSignWebhookSigningSecretOld: parsed.BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD }
      : {}),
    twilioAccountSid: parsed.TWILIO_ACCOUNT_SID,
    twilioAuthToken: parsed.TWILIO_AUTH_TOKEN,
    twilioFromNumber: parsed.TWILIO_FROM_NUMBER,
    ...(parsed.BACKEND_WORKER_ID ? { workerId: parsed.BACKEND_WORKER_ID } : {}),
    workerPollMs: integerValue(parsed.BACKEND_WORKER_POLL_MS, 5_000),
    workerLeaseSeconds: integerValue(parsed.BACKEND_WORKER_LEASE_SECONDS, 60),
    workerReclaimSweepMs: integerValue(parsed.BACKEND_WORKER_RECLAIM_SWEEP_MS, 10_000),
    workerReclaimBatchLimit: integerValue(parsed.BACKEND_WORKER_RECLAIM_BATCH_LIMIT, 50),
  };
}

export function parseBackendProxyEnv(env: EnvInput = process.env): BackendProxyEnv {
  const parsed = parseWithSchema(
    backendProxyEnvSchema,
    env,
    "Backend proxy environment is invalid.",
  );
  return {
    backendUrl: parsed.AI_ASSISTANTS_BACKEND_URL,
    machineToken: parsed.AI_ASSISTANTS_BACKEND_MACHINE_TOKEN,
  };
}

export function resolveBackendProxyEnv(
  overrides: Partial<BackendProxyEnv> = {},
  env: EnvInput = process.env,
): BackendProxyEnv {
  return parseBackendProxyEnv({
    ...env,
    ...(overrides.backendUrl ? { AI_ASSISTANTS_BACKEND_URL: overrides.backendUrl } : {}),
    ...(overrides.machineToken
      ? { AI_ASSISTANTS_BACKEND_MACHINE_TOKEN: overrides.machineToken }
      : {}),
  });
}

export function parseConnectWebEnv(env: EnvInput = process.env): ConnectWebEnv {
  const parsed = parseWithSchema(connectWebEnvSchema, env, "Connect web environment is invalid.");
  return {
    port: integerValue(parsed.PORT, 5173),
    backendPublicUrl: parsed.BACKEND_PUBLIC_URL,
    supabasePublicUrl: parsed.SUPABASE_PUBLIC_URL,
    supabaseAnonKey: parsed.SUPABASE_ANON_KEY,
    ...(parsed.VITE_CONNECT_HMR_HOST ? { hmrHost: parsed.VITE_CONNECT_HMR_HOST } : {}),
  };
}

export function parseDiagnosticsEnv(env: EnvInput = process.env): DiagnosticsEnv {
  const parsed = parseWithSchema(diagnosticsEnvSchema, env, "Diagnostics environment is invalid.");
  const logLevel = parsed.AI_ASSISTANTS_DIAGNOSTICS_LOG_LEVEL ?? "info";
  return {
    captureText: booleanValue(parsed.AI_ASSISTANTS_DIAGNOSTICS_CAPTURE_TEXT, false),
    logLevel: logLevel as DiagnosticsEnv["logLevel"],
  };
}

export function getBackendApiEnv(): BackendApiEnv {
  cachedBackendApiEnv ??= parseBackendApiEnv();
  return cachedBackendApiEnv;
}

export function getBackendWorkerEnv(): BackendWorkerEnv {
  cachedBackendWorkerEnv ??= parseBackendWorkerEnv();
  return cachedBackendWorkerEnv;
}

export function resetCachedEnvForTests(): void {
  cachedBackendApiEnv = null;
  cachedBackendWorkerEnv = null;
}

export function validateBackendApiEnv(env: EnvInput = process.env): void {
  parseBackendApiEnv(env);
}

export function validateBackendWorkerEnv(env: EnvInput = process.env): void {
  parseBackendWorkerEnv(env);
}

export const runtimeEnvSchemas = {
  profile: profileEnvDefinitions,
  runtime: runtimeEnvDefinitions,
} as const;
