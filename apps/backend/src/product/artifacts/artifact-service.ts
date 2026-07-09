import { createHash, randomUUID } from "node:crypto";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { recordArtifact } from "./artifact-store";
import { requireProfileArtifact } from "./artifact-validation";

export const PROFILE_ARTIFACTS_BUCKET = "profile-artifacts";

type SaveProfileArtifactBytesInput = {
  profileId: string;
  browserTaskId?: string | null;
  profileActionId?: string | null;
  filename: string;
  description?: string | null;
  artifactType: string;
  mimeType: string;
  bytes: Uint8Array;
  expectedSha256?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

export type SavedProfileArtifact = {
  artifact: TableRow<"artifacts">;
  sha256: string;
  byteSize: number;
};

export type PreparedProfileArtifactDelivery = {
  artifact: TableRow<"artifacts">;
  filename: string;
  bytes: Uint8Array;
};

function safeArtifactFilename(filename: string): string {
  const normalized = filename
    .trim()
    .replace(/[^\w.\-()+ ]+/g, "_")
    .replace(/\s+/g, " ");
  const safe = normalized.slice(0, 200).trim();
  if (!safe || safe === "." || safe === "..") {
    throw new DomainError(domainCodes.BAD_REQUEST, "Artifact filename is required.");
  }
  return safe;
}

async function findIdempotentArtifact(
  db: SupabaseServiceClient,
  input: { profileId: string; idempotencyKey?: string | null },
): Promise<TableRow<"artifacts"> | null> {
  const key = input.idempotencyKey?.trim();
  if (!key) return null;
  const result = await db
    .from("artifacts")
    .select()
    .eq("profile_id", input.profileId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

function requireIdempotentArtifactMatches(
  artifact: TableRow<"artifacts">,
  input: {
    filename: string;
    artifactType: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
  },
): void {
  const mismatches = [
    artifact.filename === input.filename ? null : "filename",
    artifact.artifact_type === input.artifactType ? null : "artifactType",
    artifact.mime_type === input.mimeType ? null : "mimeType",
    artifact.byte_size === input.byteSize ? null : "byteSize",
    artifact.sha256 === input.sha256 ? null : "sha256",
  ].filter((value): value is string => value !== null);
  if (mismatches.length === 0) return;
  throw new DomainError(
    domainCodes.CONFLICT,
    `Artifact idempotency key already exists with different ${mismatches.join(", ")}.`,
  );
}

async function requireProfileBrowserTask(
  db: SupabaseServiceClient,
  input: { profileId: string; browserTaskId?: string | null },
): Promise<void> {
  if (!input.browserTaskId) return;
  const result = await db
    .from("browser_tasks")
    .select()
    .eq("id", input.browserTaskId)
    .eq("profile_id", input.profileId)
    .maybeSingle();
  requireSupabaseData(`Load browser task ${input.browserTaskId}`, result.data, result.error);
}

export async function saveProfileArtifactBytes(
  db: SupabaseServiceClient,
  input: SaveProfileArtifactBytesInput,
): Promise<SavedProfileArtifact> {
  if (input.bytes.byteLength === 0) {
    throw new DomainError(domainCodes.BAD_REQUEST, "Artifact bytes must not be empty.");
  }
  await requireProfileBrowserTask(db, input);

  const filename = safeArtifactFilename(input.filename);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  if (input.expectedSha256 && input.expectedSha256 !== sha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Artifact content does not match the expected SHA-256 hash.",
    );
  }

  const existing = await findIdempotentArtifact(db, {
    profileId: input.profileId,
    idempotencyKey: input.idempotencyKey ?? null,
  });
  if (existing) {
    requireIdempotentArtifactMatches(existing, {
      filename,
      artifactType: input.artifactType,
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
      sha256,
    });
    return { artifact: existing, sha256, byteSize: input.bytes.byteLength };
  }

  const storageKey = `${input.profileId}/artifacts/${randomUUID()}/${filename}`;
  await ensureProfileArtifactsBucket(db);
  const uploaded = await db.storage.from(PROFILE_ARTIFACTS_BUCKET).upload(storageKey, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (uploaded.error) throw uploaded.error;

  const artifact = await recordArtifact(db, {
    profileId: input.profileId,
    browserTaskId: input.browserTaskId ?? null,
    profileActionId: input.profileActionId ?? null,
    storageBucket: PROFILE_ARTIFACTS_BUCKET,
    storageKey,
    filename,
    description: input.description ?? null,
    artifactType: input.artifactType,
    mimeType: input.mimeType,
    byteSize: input.bytes.byteLength,
    sha256,
    metadata: input.metadata ?? {},
    idempotencyKey: input.idempotencyKey ?? null,
  });

  return { artifact, sha256, byteSize: input.bytes.byteLength };
}

export async function ensureProfileArtifactsBucket(db: SupabaseServiceClient): Promise<void> {
  const existing = await db.storage.getBucket(PROFILE_ARTIFACTS_BUCKET);
  if (!existing.error) return;

  const created = await db.storage.createBucket(PROFILE_ARTIFACTS_BUCKET, {
    public: false,
  });
  if (!created.error) return;
  if (/already exists/iu.test(created.error.message)) return;
  throw created.error;
}

export async function prepareProfileArtifactDeliveryBytes(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    artifactId: string;
    expectedSha256?: string | null;
    filename?: string | null;
  },
): Promise<PreparedProfileArtifactDelivery> {
  const { artifact } = await requireProfileArtifact(db, {
    profileId: input.profileId,
    artifactId: input.artifactId,
    expectedSha256: input.expectedSha256 ?? null,
  });
  const filename = input.filename ? safeArtifactFilename(input.filename) : artifact.filename;
  const downloaded = await db.storage.from(artifact.storage_bucket).download(artifact.storage_key);
  if (downloaded.error) throw downloaded.error;
  return {
    artifact,
    filename,
    bytes: new Uint8Array(await downloaded.data.arrayBuffer()),
  };
}
