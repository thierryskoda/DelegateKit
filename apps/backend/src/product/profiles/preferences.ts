import { jsonSchema } from "@ai-assistants/control-plane-contracts";
import { type TableRow } from "@ai-assistants/control-db";
import { formatUnknownError } from "@ai-assistants/errors";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";

type ProfileRow = TableRow<"profiles">;
export type GroupedProfilePreferences = Record<string, Record<string, unknown>>;

const nonEmptyPreferenceText = z.string().trim().min(1);
const profilePreferenceValueSchemas = {
  "assistant.name": nonEmptyPreferenceText,
} as const satisfies Record<string, z.ZodType>;

const profilePreferenceValueSchema = jsonSchema;
export const profilePreferenceKeySchema = z.enum(["assistant.name"]);

export function parseProfilePreferenceValue(key: string, value: unknown): unknown {
  const cleanKey = profilePreferenceKeySchema.parse(key);
  const specificSchema =
    profilePreferenceValueSchemas[cleanKey as keyof typeof profilePreferenceValueSchemas];
  return (specificSchema ?? profilePreferenceValueSchema).parse(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProfilePreferences(
  value: unknown,
  label = "profile.preferences",
): GroupedProfilePreferences {
  if (!isRecord(value)) {
    throw new DomainError(domainCodes.CONFLICT, `${label} must be a JSON object.`);
  }

  const grouped: GroupedProfilePreferences = {};
  for (const [namespace, rawEntries] of Object.entries(value)) {
    if (!isRecord(rawEntries)) {
      throw new DomainError(
        domainCodes.CONFLICT,
        `${label}.${namespace} must be a JSON object of preference values.`,
      );
    }

    for (const [localKey, rawValue] of Object.entries(rawEntries)) {
      const key = `${namespace}.${localKey}`;
      try {
        const cleanKey = profilePreferenceKeySchema.parse(key);
        const [cleanNamespace, ...rest] = cleanKey.split(".");
        const cleanLocalKey = rest.join(".");
        grouped[cleanNamespace!] ??= {};
        grouped[cleanNamespace!]![cleanLocalKey] = parseProfilePreferenceValue(cleanKey, rawValue);
      } catch (error) {
        throw new DomainError(
          domainCodes.CONFLICT,
          `Profile preference ${key} is invalid: ${formatUnknownError(error)}`,
        );
      }
    }
  }
  return grouped;
}

export function stringPreference(
  grouped: GroupedProfilePreferences,
  namespace: string,
  key: string,
): string | null {
  const value = grouped[namespace]?.[key];
  return typeof value === "string" ? value : null;
}

export function preferencesFromProfile(profile: Pick<ProfileRow, "id" | "preferences">) {
  return parseProfilePreferences(profile.preferences, `profilePreferences.${profile.id}`);
}
