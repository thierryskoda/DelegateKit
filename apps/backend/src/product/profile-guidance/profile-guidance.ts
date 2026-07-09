import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableInsert,
  type TableUpdate,
} from "@ai-assistants/control-db";
import { profileGuidanceRowSchema } from "@ai-assistants/control-plane-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";

const MAX_SELECTED_GUIDANCE_ROWS = 20;
const MAX_SELECTED_GUIDANCE_BODY_CHARACTERS = 200_000;

export type ProfileGuidance = z.infer<typeof profileGuidanceRowSchema>;

export type ProfileGuidanceIndexEntry = {
  id: string;
  key: string;
  title: string;
  selectorDescription: string;
  revision: number;
  updatedAt: string;
};

export type ProfileGuidanceMarkdown = ProfileGuidanceIndexEntry & {
  bodyMarkdown: string;
};

const profileGuidanceKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*$/);
const profileGuidanceTextSchema = z.string().trim().min(1);
const profileGuidanceIndexRowSchema = z
  .object({
    id: z.string().uuid(),
    key: profileGuidanceKeySchema,
    title: profileGuidanceTextSchema,
    selector_description: profileGuidanceTextSchema,
    revision: z.number().int().min(1),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const profileGuidanceCreateInputSchema = z
  .object({
    key: profileGuidanceKeySchema,
    title: profileGuidanceTextSchema.max(200),
    selectorDescription: profileGuidanceTextSchema.max(1_000),
    bodyMarkdown: profileGuidanceTextSchema.max(50_000),
  })
  .strict();

export const profileGuidanceUpdateInputSchema = z
  .object({
    guidanceId: z.string().uuid(),
    expectedRevision: z.number().int().min(1),
    key: profileGuidanceKeySchema.optional(),
    title: profileGuidanceTextSchema.max(200).optional(),
    selectorDescription: profileGuidanceTextSchema.max(1_000).optional(),
    bodyMarkdown: profileGuidanceTextSchema.max(50_000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.key !== undefined ||
      value.title !== undefined ||
      value.selectorDescription !== undefined ||
      value.bodyMarkdown !== undefined,
    { message: "At least one profile guidance field must be provided." },
  );

export const profileGuidanceArchiveInputSchema = z
  .object({
    guidanceId: z.string().uuid(),
    expectedRevision: z.number().int().min(1),
  })
  .strict();

function toProfileGuidance(row: unknown): ProfileGuidance {
  return profileGuidanceRowSchema.parse(row);
}

function toIndexEntry(
  row: z.infer<typeof profileGuidanceIndexRowSchema>,
): ProfileGuidanceIndexEntry {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    selectorDescription: row.selector_description,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function toMarkdown(row: ProfileGuidance): ProfileGuidanceMarkdown {
  return {
    ...toIndexEntry(row),
    bodyMarkdown: row.body_markdown,
  };
}

async function loadProfileGuidanceRow(
  db: SupabaseServiceClient,
  input: { profileId: string; guidanceId: string },
): Promise<ProfileGuidance> {
  const result = await db
    .from("profile_guidance")
    .select()
    .eq("profile_id", input.profileId)
    .eq("id", input.guidanceId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Profile guidance ${input.guidanceId} was not found for profile ${input.profileId}.`,
    );
  }
  return toProfileGuidance(result.data);
}

function assertActive(row: ProfileGuidance): void {
  if (row.status !== "active") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Profile guidance ${row.id} is archived and cannot be used.`,
    );
  }
}

function assertExpectedRevision(row: ProfileGuidance, expectedRevision: number): void {
  if (row.revision !== expectedRevision) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Profile guidance ${row.id} revision is ${row.revision}, not ${expectedRevision}.`,
    );
  }
}

export async function listActiveProfileGuidanceIndex(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<ProfileGuidanceIndexEntry[]> {
  const result = await db
    .from("profile_guidance")
    .select("id,key,title,selector_description,revision,updated_at")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(100);
  return requireSupabaseRows("List active profile guidance index", result.data, result.error).map(
    (row) => toIndexEntry(profileGuidanceIndexRowSchema.parse(row)),
  );
}

export async function loadActiveProfileGuidanceMarkdown(
  db: SupabaseServiceClient,
  input: { profileId: string; guidanceIds: readonly string[] },
): Promise<ProfileGuidanceMarkdown[]> {
  const uniqueIds = [...new Set(input.guidanceIds)];
  if (uniqueIds.length === 0) return [];
  if (uniqueIds.length > MAX_SELECTED_GUIDANCE_ROWS) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `At most ${MAX_SELECTED_GUIDANCE_ROWS} profile guidance rows may be loaded.`,
    );
  }

  const result = await db
    .from("profile_guidance")
    .select()
    .eq("profile_id", input.profileId)
    .eq("status", "active")
    .in("id", uniqueIds);
  const rows = requireSupabaseRows(
    "Load active profile guidance markdown",
    result.data,
    result.error,
  ).map(toProfileGuidance);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const missingIds = uniqueIds.filter((id) => !rowsById.has(id));
  if (missingIds.length > 0) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Profile guidance ids were missing, archived, or not part of profile ${input.profileId}: ${missingIds.join(", ")}.`,
    );
  }
  const totalBodyCharacters = rows.reduce((sum, row) => sum + row.body_markdown.length, 0);
  if (totalBodyCharacters > MAX_SELECTED_GUIDANCE_BODY_CHARACTERS) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Selected profile guidance body is ${totalBodyCharacters} characters; maximum is ${MAX_SELECTED_GUIDANCE_BODY_CHARACTERS}.`,
    );
  }
  return uniqueIds.map((id) => toMarkdown(rowsById.get(id)!));
}

export async function createProfileGuidance(
  db: SupabaseServiceClient,
  input: { profileId: string; guidance: z.infer<typeof profileGuidanceCreateInputSchema> },
): Promise<ProfileGuidance> {
  const parsed = profileGuidanceCreateInputSchema.parse(input.guidance);
  const insert = {
    profile_id: input.profileId,
    key: parsed.key,
    title: parsed.title,
    selector_description: parsed.selectorDescription,
    body_markdown: parsed.bodyMarkdown,
    status: "active",
    revision: 1,
  } satisfies TableInsert<"profile_guidance">;
  const result = await db.from("profile_guidance").insert(insert).select().single();
  return toProfileGuidance(requireSupabaseData("Create profile guidance", result.data, result.error));
}

export async function createSeedProfileGuidance(
  db: SupabaseServiceClient,
  input: { profileId: string; guidance: z.infer<typeof profileGuidanceCreateInputSchema> },
): Promise<ProfileGuidance> {
  return createProfileGuidance(db, input);
}

export async function updateProfileGuidance(
  db: SupabaseServiceClient,
  profileId: string,
  input: z.infer<typeof profileGuidanceUpdateInputSchema>,
): Promise<ProfileGuidance> {
  const parsed = profileGuidanceUpdateInputSchema.parse(input);
  const existing = await loadProfileGuidanceRow(db, {
    profileId,
    guidanceId: parsed.guidanceId,
  });
  assertActive(existing);
  assertExpectedRevision(existing, parsed.expectedRevision);

  const update = {
    revision: existing.revision + 1,
    ...(parsed.key === undefined ? {} : { key: parsed.key }),
    ...(parsed.title === undefined ? {} : { title: parsed.title }),
    ...(parsed.selectorDescription === undefined
      ? {}
      : { selector_description: parsed.selectorDescription }),
    ...(parsed.bodyMarkdown === undefined ? {} : { body_markdown: parsed.bodyMarkdown }),
  } satisfies TableUpdate<"profile_guidance">;

  const result = await db
    .from("profile_guidance")
    .update(update)
    .eq("id", existing.id)
    .eq("profile_id", profileId)
    .eq("revision", parsed.expectedRevision)
    .select()
    .single();
  return toProfileGuidance(
    requireSupabaseData("Update profile guidance", result.data, result.error),
  );
}

export async function archiveProfileGuidance(
  db: SupabaseServiceClient,
  profileId: string,
  input: z.infer<typeof profileGuidanceArchiveInputSchema>,
): Promise<ProfileGuidance> {
  const parsed = profileGuidanceArchiveInputSchema.parse(input);
  const existing = await loadProfileGuidanceRow(db, {
    profileId,
    guidanceId: parsed.guidanceId,
  });
  assertActive(existing);
  assertExpectedRevision(existing, parsed.expectedRevision);

  const update = {
    status: "archived",
    revision: existing.revision + 1,
  } satisfies TableUpdate<"profile_guidance">;
  const result = await db
    .from("profile_guidance")
    .update(update)
    .eq("id", existing.id)
    .eq("profile_id", profileId)
    .eq("revision", parsed.expectedRevision)
    .select()
    .single();
  return toProfileGuidance(
    requireSupabaseData("Archive profile guidance", result.data, result.error),
  );
}
