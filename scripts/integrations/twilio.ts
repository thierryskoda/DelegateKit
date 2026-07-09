#!/usr/bin/env tsx

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { profileEnvPath, type RuntimeProfile } from "@ai-assistants/repo-layout";
import {
  parseCli,
  parseCliCommand,
  runCliMain,
  type CliParseOptions,
} from "@ai-assistants/workspace-shared";
import twilio from "twilio";
import { z } from "zod";
import {
  compactProfileEnvFile,
  parseProfileArg,
  profileSourceEnvPath,
  syncProfileSourceEnv,
} from "../profiles/profile";
import { writeSecretFileAtomic } from "../profiles/profile-env-blocks";

type TwilioCommand = "status" | "numbers";
type TwilioNumbersCommand = "list" | "search" | "purchase" | "configure";

const commands = ["status", "numbers"] as const;
const numberCommands = ["list", "search", "purchase", "configure"] as const;

const e164Schema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{1,14}$/, "Expected an E.164 phone number, for example +15551234567.");
const countrySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}$/, "Country must be an ISO 3166-1 alpha-2 code, for example US or CA.");
const urlSchema = z
  .url()
  .refine(
    (value) => ["https:", "http:"].includes(new URL(value).protocol),
    "URL must use http or https.",
  );
const publicWebhookUrlSchema = urlSchema.refine(
  (value) => new URL(value).protocol === "https:",
  "Twilio public webhook URLs must use https.",
);

function usage(): string {
  return [
    "Usage:",
    "  npm run integrations -- twilio status --profile=dev",
    "  npm run integrations -- twilio numbers list --profile=dev",
    "  npm run integrations -- twilio numbers search --profile=dev --country=US --area-code=415 --voice --limit=5",
    "  npm run integrations -- twilio numbers purchase --profile=dev --phone-number=+15551234567 --voice-url=https://voice.example.com/voice/webhook --sms-url=https://api.example.com/webhooks/twilio/sms --yes --write-env",
    "  npm run integrations -- twilio numbers configure --profile=dev --phone-number=+15551234567 --voice-url=https://voice.example.com/voice/webhook --sms-url=https://api.example.com/webhooks/twilio/sms --yes",
    "",
    "Paid or provider-mutating commands are dry-run by default. Pass --yes to apply.",
  ].join("\n");
}

function parseCommand(argv: readonly string[]): {
  command: TwilioCommand | "help";
  args: string[];
} {
  const parsed = parseCliCommand<TwilioCommand>(argv, { commands, usage });
  if (parsed.command === "help") console.log(usage());
  return parsed;
}

function parseNumbersCommand(argv: readonly string[]): {
  command: TwilioNumbersCommand | "help";
  args: string[];
} {
  const parsed = parseCliCommand<TwilioNumbersCommand>(argv, {
    commands: numberCommands,
    usage,
  });
  if (parsed.command === "help") console.log(usage());
  return parsed;
}

function commonCliOptions(extra: CliParseOptions = {}): CliParseOptions {
  return {
    profile: { type: "string" },
    help: { type: "boolean", short: "h" },
    ...extra,
  };
}

function loadProfileEnv(profile: RuntimeProfile): NodeJS.ProcessEnv {
  syncProfileSourceEnv(profile);
  compactProfileEnvFile(profile);
  const envPath = profileEnvPath(profile);
  if (!existsSync(envPath)) {
    throw new Error(`${envPath} does not exist. Add Twilio credentials to the profile env first.`);
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function requireTwilioCredentials(profile: RuntimeProfile): {
  accountSid: string;
  authToken: string;
} {
  const env = loadProfileEnv(profile);
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error(
      `TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required in ${profileEnvPath(profile)}.`,
    );
  }
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) {
    throw new Error(`TWILIO_ACCOUNT_SID in ${profileEnvPath(profile)} is not a valid Account SID.`);
  }
  return { accountSid, authToken };
}

function createTwilioClient(profile: RuntimeProfile): ReturnType<typeof twilio> {
  const credentials = requireTwilioCredentials(profile);
  return twilio(credentials.accountSid, credentials.authToken);
}

function maybeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function capabilityFlags(capabilities: unknown): Record<string, boolean> {
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) return {};
  const entries = Object.entries(capabilities).filter(
    (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
  );
  return Object.fromEntries(entries);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function phoneNumberProjection(record: {
  sid?: string;
  phoneNumber?: string;
  friendlyName?: string | null;
  capabilities?: unknown;
  voiceUrl?: string | null;
  smsUrl?: string | null;
  statusCallback?: string | null;
}) {
  return {
    sid: maybeString(record.sid),
    phoneNumber: maybeString(record.phoneNumber),
    friendlyName: maybeString(record.friendlyName),
    capabilities: capabilityFlags(record.capabilities),
    voiceUrl: maybeString(record.voiceUrl),
    smsUrl: maybeString(record.smsUrl),
    statusCallback: maybeString(record.statusCallback),
  };
}

async function runTwilioStatus(args: readonly string[]): Promise<void> {
  const parsed = parseCli(args, {
    options: commonCliOptions(),
    schema: z.object({ profile: z.string().optional(), help: z.boolean().optional() }),
  });
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const profile = parseProfileArg([`--profile=${parsed.profile ?? "dev"}`]);
  const env = loadProfileEnv(profile);
  const client = createTwilioClient(profile);
  const numbers = await client.incomingPhoneNumbers.list({ limit: 20 });
  const configuredFromNumber = env.TWILIO_FROM_NUMBER?.trim() || null;
  const configuredNumber = configuredFromNumber
    ? numbers.find((number) => number.phoneNumber === configuredFromNumber)
    : null;
  const blockers = [
    configuredFromNumber ? null : "TWILIO_FROM_NUMBER is not configured.",
    configuredFromNumber && !configuredNumber
      ? `TWILIO_FROM_NUMBER ${configuredFromNumber} is not owned by this Twilio account.`
      : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  printJson({
    ok: blockers.length === 0,
    profile,
    configuredFromNumber,
    blockers,
    activeNumbers: numbers.map(phoneNumberProjection),
  });
}

const listSchema = z.object({
  profile: z.string().optional(),
  help: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

async function runNumbersList(args: readonly string[]): Promise<void> {
  const parsed = parseCli(args, {
    options: commonCliOptions({ limit: { type: "string" } }),
    schema: listSchema,
  });
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const profile = parseProfileArg([`--profile=${parsed.profile ?? "dev"}`]);
  const client = createTwilioClient(profile);
  const numbers = await client.incomingPhoneNumbers.list({ limit: parsed.limit });
  printJson({
    ok: true,
    profile,
    numbers: numbers.map(phoneNumberProjection),
  });
}

const searchSchema = z.object({
  profile: z.string().optional(),
  help: z.boolean().optional(),
  country: countrySchema.default("US"),
  "area-code": z.coerce.number().int().min(100).max(999).optional(),
  contains: z.string().trim().min(1).optional(),
  region: z.string().trim().min(1).optional(),
  "postal-code": z.string().trim().min(1).optional(),
  voice: z.boolean().optional(),
  sms: z.boolean().optional(),
  mms: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

function availableNumberProjection(record: {
  phoneNumber?: string;
  friendlyName?: string | null;
  locality?: string | null;
  region?: string | null;
  isoCountry?: string | null;
  capabilities?: unknown;
}) {
  return {
    phoneNumber: maybeString(record.phoneNumber),
    friendlyName: maybeString(record.friendlyName),
    locality: maybeString(record.locality),
    region: maybeString(record.region),
    isoCountry: maybeString(record.isoCountry),
    capabilities: capabilityFlags(record.capabilities),
  };
}

type SearchOptions = {
  areaCode?: number;
  contains?: string;
  inRegion?: string;
  inPostalCode?: string;
  voiceEnabled?: boolean;
  smsEnabled?: boolean;
  mmsEnabled?: boolean;
  limit: number;
};

function searchOptions(parsed: z.infer<typeof searchSchema>): SearchOptions {
  return {
    ...(parsed["area-code"] ? { areaCode: parsed["area-code"] } : {}),
    ...(parsed.contains ? { contains: parsed.contains } : {}),
    ...(parsed.region ? { inRegion: parsed.region } : {}),
    ...(parsed["postal-code"] ? { inPostalCode: parsed["postal-code"] } : {}),
    ...(parsed.voice ? { voiceEnabled: true } : {}),
    ...(parsed.sms ? { smsEnabled: true } : {}),
    ...(parsed.mms ? { mmsEnabled: true } : {}),
    limit: parsed.limit,
  };
}

async function searchAvailableLocalNumbers(input: {
  client: ReturnType<typeof twilio>;
  country: string;
  options: SearchOptions;
}) {
  // Twilio official docs: AvailablePhoneNumbers Local list searches local purchasable inventory.
  // Source: https://www.twilio.com/docs/phone-numbers/api/availablephonenumberlocal-resource
  return input.client.availablePhoneNumbers(input.country).local.list(input.options);
}

async function runNumbersSearch(args: readonly string[]): Promise<void> {
  const parsed = parseCli(args, {
    options: commonCliOptions({
      country: { type: "string" },
      "area-code": { type: "string" },
      contains: { type: "string" },
      region: { type: "string" },
      "postal-code": { type: "string" },
      voice: { type: "boolean" },
      sms: { type: "boolean" },
      mms: { type: "boolean" },
      limit: { type: "string" },
    }),
    schema: searchSchema,
  });
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const profile = parseProfileArg([`--profile=${parsed.profile ?? "dev"}`]);
  const client = createTwilioClient(profile);
  const numbers = await searchAvailableLocalNumbers({
    client,
    country: parsed.country,
    options: searchOptions(parsed),
  });
  printJson({
    ok: true,
    profile,
    dryRun: true,
    numbers: numbers.map(availableNumberProjection),
  });
}

const mutationBaseSchema = z.object({
  profile: z.string().optional(),
  help: z.boolean().optional(),
  "phone-number": e164Schema.optional(),
  "voice-url": publicWebhookUrlSchema.optional(),
  "sms-url": publicWebhookUrlSchema.optional(),
  "status-callback": publicWebhookUrlSchema.optional(),
  "friendly-name": z.string().trim().min(1).optional(),
  yes: z.boolean().optional(),
  "write-env": z.boolean().optional(),
});

const purchaseSchema = mutationBaseSchema.extend({
  country: countrySchema.default("US"),
  "area-code": z.coerce.number().int().min(100).max(999).optional(),
  voice: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(1),
});

function purchaseCreateParams(input: {
  phoneNumber: string;
  friendlyName?: string;
  voiceUrl?: string;
  smsUrl?: string;
  statusCallback?: string;
}) {
  return {
    phoneNumber: input.phoneNumber,
    ...(input.friendlyName ? { friendlyName: input.friendlyName } : {}),
    ...(input.voiceUrl ? { voiceUrl: input.voiceUrl, voiceMethod: "POST" as const } : {}),
    ...(input.smsUrl ? { smsUrl: input.smsUrl, smsMethod: "POST" as const } : {}),
    ...(input.statusCallback
      ? { statusCallback: input.statusCallback, statusCallbackMethod: "POST" as const }
      : {}),
  };
}

function updateParams(input: {
  friendlyName?: string;
  voiceUrl?: string;
  smsUrl?: string;
  statusCallback?: string;
}) {
  return {
    ...(input.friendlyName ? { friendlyName: input.friendlyName } : {}),
    ...(input.voiceUrl ? { voiceUrl: input.voiceUrl, voiceMethod: "POST" as const } : {}),
    ...(input.smsUrl ? { smsUrl: input.smsUrl, smsMethod: "POST" as const } : {}),
    ...(input.statusCallback
      ? { statusCallback: input.statusCallback, statusCallbackMethod: "POST" as const }
      : {}),
  };
}

function upsertEnvValue(filePath: string, key: string, value: string): void {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (line.match(new RegExp(`^${key}=`))) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) {
    if (nextLines.length && nextLines.at(-1) !== "") nextLines.push("");
    nextLines.push(`${key}=${value}`);
  }
  writeSecretFileAtomic(filePath, `${nextLines.join("\n").trimEnd()}\n`);
}

function upsertProfileEnvValue(profile: RuntimeProfile, key: string, value: string): void {
  upsertEnvValue(profileSourceEnvPath(profile) ?? profileEnvPath(profile), key, value);
  syncProfileSourceEnv(profile);
  compactProfileEnvFile(profile);
}

async function choosePurchaseNumber(input: {
  client: ReturnType<typeof twilio>;
  parsed: z.infer<typeof purchaseSchema>;
}): Promise<string> {
  if (input.parsed["phone-number"]) return input.parsed["phone-number"];
  if (!input.parsed["area-code"]) {
    throw new Error("Pass --phone-number or --area-code for purchase.");
  }
  const matches = await searchAvailableLocalNumbers({
    client: input.client,
    country: input.parsed.country,
    options: {
      areaCode: input.parsed["area-code"],
      voiceEnabled: input.parsed.voice ?? true,
      limit: input.parsed.limit,
    },
  });
  const first = matches[0]?.phoneNumber;
  if (!first) {
    throw new Error(`No Twilio local numbers found for area code ${input.parsed["area-code"]}.`);
  }
  return first;
}

async function runNumbersPurchase(args: readonly string[]): Promise<void> {
  const parsed = parseCli(args, {
    options: commonCliOptions({
      "phone-number": { type: "string" },
      "voice-url": { type: "string" },
      "sms-url": { type: "string" },
      "status-callback": { type: "string" },
      "friendly-name": { type: "string" },
      country: { type: "string" },
      "area-code": { type: "string" },
      voice: { type: "boolean" },
      limit: { type: "string" },
      yes: { type: "boolean" },
      "write-env": { type: "boolean" },
    }),
    schema: purchaseSchema,
  });
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const profile = parseProfileArg([`--profile=${parsed.profile ?? "dev"}`]);
  const client = createTwilioClient(profile);
  const phoneNumber = await choosePurchaseNumber({ client, parsed });
  const createParams = purchaseCreateParams({
    phoneNumber,
    friendlyName: parsed["friendly-name"],
    voiceUrl: parsed["voice-url"],
    smsUrl: parsed["sms-url"],
    statusCallback: parsed["status-callback"],
  });
  if (!parsed.yes) {
    printJson({
      ok: true,
      dryRun: true,
      profile,
      action: "purchase",
      createParams,
      note: "Pass --yes to provision this paid Twilio number.",
    });
    return;
  }
  // Twilio official docs: POST IncomingPhoneNumbers provisions a selected available number.
  // Source: https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource
  const created = await client.incomingPhoneNumbers.create(createParams);
  if (parsed["write-env"] && created.phoneNumber) {
    upsertProfileEnvValue(profile, "TWILIO_FROM_NUMBER", created.phoneNumber);
  }
  printJson({
    ok: true,
    dryRun: false,
    profile,
    number: phoneNumberProjection(created),
    wroteEnv: Boolean(parsed["write-env"] && created.phoneNumber),
  });
}

const configureSchema = mutationBaseSchema.extend({
  "phone-number": e164Schema,
});

async function findIncomingNumber(input: {
  client: ReturnType<typeof twilio>;
  phoneNumber: string;
}) {
  const matches = await input.client.incomingPhoneNumbers.list({
    phoneNumber: input.phoneNumber,
    limit: 2,
  });
  if (matches.length === 0) {
    throw new Error(`Twilio account does not own ${input.phoneNumber}.`);
  }
  if (matches.length > 1) {
    throw new Error(`Twilio account returned multiple records for ${input.phoneNumber}.`);
  }
  return matches[0]!;
}

async function runNumbersConfigure(args: readonly string[]): Promise<void> {
  const parsed = parseCli(args, {
    options: commonCliOptions({
      "phone-number": { type: "string" },
      "voice-url": { type: "string" },
      "sms-url": { type: "string" },
      "status-callback": { type: "string" },
      "friendly-name": { type: "string" },
      yes: { type: "boolean" },
      "write-env": { type: "boolean" },
    }),
    schema: configureSchema,
  });
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const profile = parseProfileArg([`--profile=${parsed.profile ?? "dev"}`]);
  const client = createTwilioClient(profile);
  const current = await findIncomingNumber({ client, phoneNumber: parsed["phone-number"] });
  const params = updateParams({
    friendlyName: parsed["friendly-name"],
    voiceUrl: parsed["voice-url"],
    smsUrl: parsed["sms-url"],
    statusCallback: parsed["status-callback"],
  });
  if (Object.keys(params).length === 0 && !parsed["write-env"]) {
    throw new Error(
      "Pass at least one of --voice-url, --sms-url, --status-callback, --friendly-name, or --write-env.",
    );
  }
  if (!parsed.yes) {
    printJson({
      ok: true,
      dryRun: true,
      profile,
      action: "configure",
      current: phoneNumberProjection(current),
      updateParams: params,
      writeEnv: parsed["write-env"] ? { TWILIO_FROM_NUMBER: parsed["phone-number"] } : null,
      note: "Pass --yes to update this Twilio number.",
    });
    return;
  }
  const updated = Object.keys(params).length > 0 ? await current.update(params) : current;
  if (parsed["write-env"]) {
    upsertProfileEnvValue(profile, "TWILIO_FROM_NUMBER", parsed["phone-number"]);
  }
  printJson({
    ok: true,
    dryRun: false,
    profile,
    number: phoneNumberProjection(updated),
    wroteEnv: Boolean(parsed["write-env"]),
  });
}

export async function runTwilioCli(argv = process.argv.slice(2)): Promise<void> {
  const { command, args } = parseCommand(argv);
  if (command === "help") return;
  if (command === "status") {
    await runTwilioStatus(args);
    return;
  }
  const { command: numbersCommand, args: numbersArgs } = parseNumbersCommand(args);
  if (numbersCommand === "help") return;
  if (numbersCommand === "list") {
    await runNumbersList(numbersArgs);
    return;
  }
  if (numbersCommand === "search") {
    await runNumbersSearch(numbersArgs);
    return;
  }
  if (numbersCommand === "purchase") {
    await runNumbersPurchase(numbersArgs);
    return;
  }
  await runNumbersConfigure(numbersArgs);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runTwilioCli());
}
