import { readFileSync } from "node:fs";
import { z } from "zod";

import { readDotEnvFile } from "./dotenv";

export type EnvSchemaOptions = {
  allowPlaceholders: boolean;
};

export type EnvVarDefinition = {
  schema: (options: EnvSchemaOptions) => z.ZodType<string>;
};

const placeholderValues = new Set([
  "change-me",
  "change-this-long-random-secret",
  "recipient@example.com",
  "your_monday_oauth_app_client_id",
  "your_elevenlabs_api_key",
  "your_hedra_api_key",
  "your_runway_api_key",
]);

function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  return (
    placeholderValues.has(lower) ||
    /^your[_-][a-z0-9_-]+$/i.test(trimmed) ||
    /^0{6,}$/.test(trimmed) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(trimmed) ||
    /^0+:a+$/i.test(trimmed) ||
    /^\+?10000000000$/.test(trimmed)
  );
}

function nonEmpty(name: string, options: EnvSchemaOptions): z.ZodType<string> {
  let schema: z.ZodType<string> = z.string().trim().min(1, `${name} must not be empty.`);
  if (!options.allowPlaceholders) {
    schema = schema.refine(
      (value) => !isPlaceholderValue(value),
      `${name} still has a placeholder value from .env.example.`,
    );
  }
  return schema;
}

function nonEmptyExact(name: string, options: EnvSchemaOptions): z.ZodType<string> {
  let schema: z.ZodType<string> = z
    .string()
    .min(1, `${name} must not be empty.`)
    .refine(
      (value) => value === value.trim(),
      `${name} must not have leading or trailing whitespace.`,
    );
  if (!options.allowPlaceholders) {
    schema = schema.refine(
      (value) => !isPlaceholderValue(value),
      `${name} still has a placeholder value from .env.example.`,
    );
  }
  return schema;
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function absoluteUrl(
  name: string,
  options: EnvSchemaOptions,
  protocols?: readonly string[],
): z.ZodType<string> {
  return nonEmpty(name, options)
    .pipe(z.url(`${name} must be an absolute URL.`))
    .refine(
      (value) => {
        if (!protocols) return true;
        return protocols.includes(new URL(value).protocol);
      },
      `${name} must use one of these protocols: ${protocols?.join(", ")}.`,
    );
}

function absoluteBaseUrl(
  name: string,
  options: EnvSchemaOptions,
  protocols?: readonly string[],
): z.ZodType<string> {
  return absoluteUrl(name, options, protocols).transform(cleanBaseUrl);
}

function integerString(
  name: string,
  options: EnvSchemaOptions,
  min: number,
  max: number,
): z.ZodType<string> {
  return nonEmpty(name, options).refine((value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max;
  }, `${name} must be an integer between ${min} and ${max}.`);
}

function oneOf(
  name: string,
  options: EnvSchemaOptions,
  values: readonly string[],
): z.ZodType<string> {
  return nonEmpty(name, options).refine(
    (value) => values.includes(value),
    `${name} must be one of: ${values.join(", ")}.`,
  );
}

function graphqlApiVersion(name: string, options: EnvSchemaOptions): z.ZodType<string> {
  return nonEmpty(name, options).refine(
    (value) => /^\d{4}-\d{2}$/.test(value),
    `${name} must use YYYY-MM format.`,
  );
}

function twilioAccountSid(name: string, options: EnvSchemaOptions): z.ZodType<string> {
  return nonEmpty(name, options).refine(
    (value) => /^AC[0-9a-fA-F]{32}$/.test(value),
    `${name} must look like a Twilio Account SID (AC followed by 32 hex characters).`,
  );
}

function e164PhoneNumber(name: string, options: EnvSchemaOptions): z.ZodType<string> {
  return nonEmpty(name, options).refine(
    (value) => /^\+[1-9]\d{1,14}$/.test(value),
    `${name} must be an E.164 phone number, for example +15551234567.`,
  );
}

/** Optional profile string: empty allowed; non-empty values reject placeholder tokens when validating real env. */
function optionalProfileString(name: string, options: EnvSchemaOptions): z.ZodType<string> {
  return z
    .string()
    .trim()
    .refine(
      (value) => options.allowPlaceholders || value === "" || !isPlaceholderValue(value),
      `${name} still has a placeholder value from .env.example.`,
    );
}

function nangoSecretString(name: string, options: EnvSchemaOptions): z.ZodType<string> {
  return nonEmpty(name, options).refine(
    (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
    `${name} must be the UUID-shaped secret from the Nango dashboard.`,
  );
}

export const profileEnvDefinitions = {
  SUPABASE_LOCAL_WORKDIR: { schema: (options) => nonEmpty("SUPABASE_LOCAL_WORKDIR", options) },
  SUPABASE_URL: { schema: (options) => absoluteUrl("SUPABASE_URL", options, ["http:", "https:"]) },
  SUPABASE_ANON_KEY: { schema: (options) => nonEmpty("SUPABASE_ANON_KEY", options) },
  SUPABASE_SERVICE_ROLE_KEY: {
    schema: (options) => nonEmpty("SUPABASE_SERVICE_ROLE_KEY", options),
  },
  OAUTH_STATE_SECRET: { schema: (options) => nonEmpty("OAUTH_STATE_SECRET", options) },
  BACKEND_PORT: { schema: (options) => integerString("BACKEND_PORT", options, 1, 65_535) },
  AI_ASSISTANTS_BACKEND_URL: {
    schema: (options) => absoluteBaseUrl("AI_ASSISTANTS_BACKEND_URL", options, ["http:", "https:"]),
  },
  AI_ASSISTANTS_BACKEND_MACHINE_TOKEN: {
    schema: (options) => nonEmptyExact("AI_ASSISTANTS_BACKEND_MACHINE_TOKEN", options),
  },
  OPENAI_API_KEY: { schema: (options) => nonEmpty("OPENAI_API_KEY", options) },
  DEEPSEEK_API_KEY: { schema: (options) => nonEmpty("DEEPSEEK_API_KEY", options) },
  PERPLEXITY_API_KEY: {
    schema: (options) =>
      nonEmpty("PERPLEXITY_API_KEY", options).refine(
        (value) => /^pplx-[A-Za-z0-9_-]+$/.test(value),
        "PERPLEXITY_API_KEY must look like a Perplexity API key (pplx-...).",
      ),
  },
  CONNECT_PUBLIC_URL: {
    schema: (options) => absoluteBaseUrl("CONNECT_PUBLIC_URL", options, ["http:", "https:"]),
  },
  SUPABASE_PUBLIC_URL: {
    schema: (options) => absoluteBaseUrl("SUPABASE_PUBLIC_URL", options, ["http:", "https:"]),
  },
  BACKEND_PUBLIC_URL: {
    schema: (options) => absoluteBaseUrl("BACKEND_PUBLIC_URL", options, ["http:", "https:"]),
  },
  OAUTH_PUBLIC_URL: {
    schema: (options) => absoluteUrl("OAUTH_PUBLIC_URL", options, ["http:", "https:"]),
  },
  VITE_BACKEND_URL: {
    schema: (options) => absoluteUrl("VITE_BACKEND_URL", options, ["http:", "https:"]),
  },
  VITE_CONNECT_HMR_HOST: { schema: (options) => nonEmpty("VITE_CONNECT_HMR_HOST", options) },
  VITE_SUPABASE_URL: {
    schema: (options) => absoluteUrl("VITE_SUPABASE_URL", options, ["http:", "https:"]),
  },
  VITE_SUPABASE_ANON_KEY: { schema: (options) => nonEmpty("VITE_SUPABASE_ANON_KEY", options) },
  AI_ASSISTANTS_WEB_BRIDGE_PORT: {
    schema: (options) => integerString("AI_ASSISTANTS_WEB_BRIDGE_PORT", options, 1_024, 65_000),
  },
  TELEGRAM_BOT_TOKEN: {
    schema: (options) =>
      nonEmpty("TELEGRAM_BOT_TOKEN", options).refine(
        (value) => /^\d+:[A-Za-z0-9_-]{20,}$/.test(value),
        "TELEGRAM_BOT_TOKEN must look like a Telegram bot token.",
      ),
  },
  TELEGRAM_MINI_APP_BOT_USERNAME: {
    schema: (options) =>
      nonEmpty("TELEGRAM_MINI_APP_BOT_USERNAME", options)
        .refine(
          (value) => /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value),
          "TELEGRAM_MINI_APP_BOT_USERNAME must look like a Telegram bot username.",
        )
        .transform((value) => value.replace(/^@/, "")),
  },
  TELEGRAM_WEBHOOK_SECRET: {
    schema: (options) =>
      nonEmptyExact("TELEGRAM_WEBHOOK_SECRET", options).refine(
        (value) => value.length <= 256,
        "TELEGRAM_WEBHOOK_SECRET must be 256 characters or fewer.",
      ),
  },
  GOOGLE_OAUTH_CLIENT_ID: { schema: (options) => nonEmpty("GOOGLE_OAUTH_CLIENT_ID", options) },
  GOOGLE_OAUTH_CLIENT_SECRET: {
    schema: (options) => nonEmpty("GOOGLE_OAUTH_CLIENT_SECRET", options),
  },
  GMAIL_PUBSUB_TOPIC_NAME: {
    schema: (options) =>
      nonEmpty("GMAIL_PUBSUB_TOPIC_NAME", options).refine(
        (value) => /^projects\/[^/]+\/topics\/[^/]+$/.test(value),
        "GMAIL_PUBSUB_TOPIC_NAME must look like projects/<project>/topics/<topic>.",
      ),
  },
  MICROSOFT_OAUTH_TENANT_ID: {
    schema: (options) =>
      nonEmpty("MICROSOFT_OAUTH_TENANT_ID", options).refine(
        (value) =>
          value === "common" ||
          value === "organizations" ||
          value === "consumers" ||
          !value.includes("/"),
        "MICROSOFT_OAUTH_TENANT_ID must be common, organizations, consumers, a tenant id, or a tenant domain.",
      ),
  },
  MICROSOFT_OAUTH_CLIENT_ID: {
    schema: (options) => nonEmpty("MICROSOFT_OAUTH_CLIENT_ID", options),
  },
  MICROSOFT_OAUTH_CLIENT_SECRET: {
    schema: (options) => nonEmpty("MICROSOFT_OAUTH_CLIENT_SECRET", options),
  },
  MONDAY_OAUTH_CLIENT_ID: { schema: (options) => nonEmpty("MONDAY_OAUTH_CLIENT_ID", options) },
  MONDAY_OAUTH_CLIENT_SECRET: {
    schema: (options) => nonEmpty("MONDAY_OAUTH_CLIENT_SECRET", options),
  },
  MONDAY_SIGNING_SECRET: {
    schema: (options) => nonEmpty("MONDAY_SIGNING_SECRET", options),
  },
  MONDAY_GRAPHQL_API_VERSION: {
    schema: (options) => graphqlApiVersion("MONDAY_GRAPHQL_API_VERSION", options),
  },
  BOLDSIGN_API_KEY: { schema: (options) => nonEmpty("BOLDSIGN_API_KEY", options) },
  BOLDSIGN_DATA_CENTER: {
    schema: (options) => oneOf("BOLDSIGN_DATA_CENTER", options, ["ca"]),
  },
  BOLDSIGN_API_BASE_URL: {
    schema: (options) => absoluteBaseUrl("BOLDSIGN_API_BASE_URL", options, ["http:", "https:"]),
  },
  BOLDSIGN_WEBHOOK_SIGNING_SECRET: {
    schema: (options) => nonEmpty("BOLDSIGN_WEBHOOK_SIGNING_SECRET", options),
  },
  BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD: {
    schema: (options) => optionalProfileString("BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD", options),
  },
  BROWSERBASE_API_KEY: { schema: (options) => nonEmpty("BROWSERBASE_API_KEY", options) },
  TWILIO_ACCOUNT_SID: { schema: (options) => twilioAccountSid("TWILIO_ACCOUNT_SID", options) },
  TWILIO_AUTH_TOKEN: { schema: (options) => nonEmptyExact("TWILIO_AUTH_TOKEN", options) },
  TWILIO_FROM_NUMBER: { schema: (options) => e164PhoneNumber("TWILIO_FROM_NUMBER", options) },
  AI_ASSISTANTS_E2E_GMAIL_TO: {
    schema: (options) =>
      nonEmpty("AI_ASSISTANTS_E2E_GMAIL_TO", options).pipe(
        z.email("AI_ASSISTANTS_E2E_GMAIL_TO must be an email address."),
      ),
  },
  NANGO_SECRET_KEY: { schema: (options) => nangoSecretString("NANGO_SECRET_KEY", options) },
  NANGO_WEBHOOK_SIGNING_SECRET: {
    schema: (options) => nangoSecretString("NANGO_WEBHOOK_SIGNING_SECRET", options),
  },
  NANGO_PROVIDER_CONFIG_KEY: {
    schema: (options) => optionalProfileString("NANGO_PROVIDER_CONFIG_KEY", options),
  },
  NANGO_HOST: {
    schema: (options) => absoluteUrl("NANGO_HOST", options, ["http:", "https:"]),
  },
  ELEVENLABS_API_KEY: { schema: (options) => nonEmpty("ELEVENLABS_API_KEY", options) },
  HEDRA_API_KEY: { schema: (options) => nonEmpty("HEDRA_API_KEY", options) },
  RUNWAY_API_KEY: { schema: (options) => nonEmpty("RUNWAY_API_KEY", options) },
  HEDRA_WEB_PUBLIC_BASE: {
    schema: (options) => absoluteUrl("HEDRA_WEB_PUBLIC_BASE", options, ["http:", "https:"]),
  },
  VIDEO_PRODUCTION_MOCK_PROVIDERS: {
    schema: (options) => oneOf("VIDEO_PRODUCTION_MOCK_PROVIDERS", options, ["0", "1"]),
  },
} satisfies Record<string, EnvVarDefinition>;

export type ProfileEnvName = keyof typeof profileEnvDefinitions;

export const runtimeEnvDefinitions = {
  PORT: { schema: (options) => integerString("PORT", options, 1, 65_535) },
  BACKEND_WORKER_ID: { schema: (options) => optionalProfileString("BACKEND_WORKER_ID", options) },
  BACKEND_WORKER_POLL_MS: {
    schema: (options) => integerString("BACKEND_WORKER_POLL_MS", options, 1, 86_400_000),
  },
  BACKEND_WORKER_LEASE_SECONDS: {
    schema: (options) => integerString("BACKEND_WORKER_LEASE_SECONDS", options, 1, 86_400),
  },
  BACKEND_WORKER_RECLAIM_SWEEP_MS: {
    schema: (options) => integerString("BACKEND_WORKER_RECLAIM_SWEEP_MS", options, 1, 86_400_000),
  },
  BACKEND_WORKER_RECLAIM_BATCH_LIMIT: {
    schema: (options) => integerString("BACKEND_WORKER_RECLAIM_BATCH_LIMIT", options, 1, 10_000),
  },
  SOFFICE_BIN: { schema: (options) => optionalProfileString("SOFFICE_BIN", options) },
  LIBREOFFICE_BIN: { schema: (options) => optionalProfileString("LIBREOFFICE_BIN", options) },
} satisfies Record<string, EnvVarDefinition>;

export type RuntimeEnvName = keyof typeof runtimeEnvDefinitions;
export type KnownEnvName = ProfileEnvName | RuntimeEnvName;

export const envDefinitions = {
  ...profileEnvDefinitions,
  ...runtimeEnvDefinitions,
} satisfies Record<KnownEnvName, EnvVarDefinition>;

const profileEnvNames = Object.keys(profileEnvDefinitions).sort() as ProfileEnvName[];

const ignoredLegacyProfileEnvNames = new Set<string>();

const startRequiredEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AI_ASSISTANTS_BACKEND_URL",
  "AI_ASSISTANTS_BACKEND_MACHINE_TOKEN",
  "OAUTH_STATE_SECRET",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "NANGO_SECRET_KEY",
  "NANGO_WEBHOOK_SIGNING_SECRET",
] as const satisfies readonly ProfileEnvName[];

function profileEnvSchema(
  options: EnvSchemaOptions,
): z.ZodObject<Record<ProfileEnvName, z.ZodOptional<z.ZodType<string>>>> {
  const shape = Object.fromEntries(
    profileEnvNames.map((name) => [name, profileEnvDefinitions[name].schema(options).optional()]),
  ) as Record<ProfileEnvName, z.ZodOptional<z.ZodType<string>>>;
  return z.object(shape).passthrough();
}

type EnvExampleEntries = {
  duplicates: string[];
  entries: Record<string, string>;
  keys: string[];
};

type EnvFileEntriesOptions = {
  includeCommentedAssignments: boolean;
};

function readEnvFileEntries(filePath: string, options: EnvFileEntriesOptions): EnvExampleEntries {
  const entries: Record<string, string> = {};
  const keys: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = options.includeCommentedAssignments
      ? trimmed.match(/^#?\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      : trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
    keys.push(key);
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }

  return { duplicates, entries, keys };
}

function readEnvExampleEntries(filePath: string): EnvExampleEntries {
  return readEnvFileEntries(filePath, { includeCommentedAssignments: true });
}

function readActiveEnvEntries(filePath: string): EnvExampleEntries {
  return readEnvFileEntries(filePath, { includeCommentedAssignments: false });
}

export function zodIssues(error: z.ZodError, prefix?: string): string[] {
  return error.issues.map((issue) => {
    const path = [...(prefix ? [prefix] : []), ...issue.path.map(String)];
    const field = path.join(".") || "<root>";
    return `${field}: ${issue.message}`;
  });
}

export function formatValidationError(title: string, errors: readonly string[]): Error {
  return new Error([title, ...errors.map((error) => `  - ${error}`)].join("\n"));
}

export function validateEnvExampleFile(filePath: string): void {
  const parsed = readEnvExampleEntries(filePath);
  const expected = new Set(profileEnvNames);
  const actual = new Set(parsed.keys);
  const errors: string[] = [];

  if (parsed.duplicates.length > 0) {
    errors.push(`duplicate key(s): ${[...new Set(parsed.duplicates)].sort().join(", ")}`);
  }

  const stale = [...actual].filter((key) => !expected.has(key as ProfileEnvName)).sort();
  if (stale.length > 0) {
    errors.push(`not in profile env schema: ${stale.join(", ")}`);
  }

  const missing = profileEnvNames.filter((key) => !actual.has(key));
  if (missing.length > 0) {
    errors.push(`missing from .env.example: ${missing.join(", ")}`);
  }

  const templateResult = profileEnvSchema({ allowPlaceholders: true }).safeParse(parsed.entries);
  if (!templateResult.success) {
    errors.push(...zodIssues(templateResult.error));
  }

  if (errors.length > 0) {
    throw formatValidationError(
      `${filePath} does not match @ai-assistants/workspace-shared env validation rules.`,
      errors,
    );
  }
}

export function validateProfileEnvFile(filePath: string): void {
  const parsed = readActiveEnvEntries(filePath);
  const expected = new Set(profileEnvNames);
  const errors: string[] = [];

  if (parsed.duplicates.length > 0) {
    errors.push(`duplicate key(s): ${[...new Set(parsed.duplicates)].sort().join(", ")}`);
  }

  const stale = [...new Set(parsed.keys)]
    .filter((key) => !expected.has(key as ProfileEnvName) && !ignoredLegacyProfileEnvNames.has(key))
    .sort();
  if (stale.length > 0) {
    errors.push(`not in profile env schema: ${stale.join(", ")}`);
  }

  const entries = readDotEnvFile(filePath);
  const result = profileEnvSchema({ allowPlaceholders: true }).safeParse(entries);
  if (!result.success) {
    errors.push(...zodIssues(result.error));
  }

  if (errors.length > 0) {
    throw formatValidationError(`${filePath} has invalid profile env value(s).`, errors);
  }
}

export function validateResolvedStartEnv(input: {
  env: NodeJS.ProcessEnv;
  envPath: string;
  examplePath: string;
}): void {
  validateEnvExampleFile(input.examplePath);
  validateProfileEnvFile(input.envPath);

  const result = profileEnvSchema({ allowPlaceholders: true }).safeParse(input.env);
  const errors = result.success ? [] : zodIssues(result.error);
  const missing = startRequiredEnvNames.filter((name) => !input.env[name]?.trim());
  if (missing.length > 0) {
    errors.unshift(`missing required start env: ${missing.join(", ")}`);
  }
  for (const name of startRequiredEnvNames) {
    if (!input.env[name]?.trim()) continue;
    const valueResult = profileEnvDefinitions[name]
      .schema({ allowPlaceholders: false })
      .safeParse(input.env[name]);
    if (!valueResult.success) {
      errors.push(...zodIssues(valueResult.error, name));
    }
  }

  if (errors.length > 0) {
    throw formatValidationError(
      [
        "Resolved dev start env is invalid.",
        `Set required values in ${input.envPath}; values generated by npm run start:dev should appear there automatically.`,
      ].join(" "),
      errors,
    );
  }
}
