import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { DOCX_MIME_TYPE } from "./rendering";

export const PROFILE_ARTIFACTS_BUCKET = "profile-artifacts";

export async function loadArtifact(
  db: SupabaseServiceClient,
  profileId: string,
  artifactId: string,
): Promise<TableRow<"artifacts">> {
  const result = await db.from("artifacts").select().eq("id", artifactId).maybeSingle();
  const artifact = requireSupabaseData(
    `Load document artifact ${artifactId}`,
    result.data,
    result.error,
  );
  if (artifact.profile_id !== profileId)
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Artifact ${artifactId} belongs to another profile.`,
    );
  return artifact;
}

export async function requireDocxTemplateArtifact(
  db: SupabaseServiceClient,
  profileId: string,
  artifactId: string,
): Promise<TableRow<"artifacts">> {
  const artifact = await loadArtifact(db, profileId, artifactId);
  const isDocxMime = artifact.mime_type === DOCX_MIME_TYPE;
  const isDocxFile = artifact.filename.toLowerCase().endsWith(".docx");
  if (!isDocxMime && !isDocxFile) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Template artifact ${artifactId} must be a DOCX file.`,
    );
  }
  if (!artifact.sha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Template artifact ${artifactId} is missing a SHA-256 hash.`,
    );
  }
  return artifact;
}

export async function downloadArtifactBytes(
  db: SupabaseServiceClient,
  artifact: TableRow<"artifacts">,
): Promise<Uint8Array> {
  const downloaded = await db.storage.from(artifact.storage_bucket).download(artifact.storage_key);
  if (downloaded.error) throw downloaded.error;
  return new Uint8Array(await downloaded.data.arrayBuffer());
}

export async function uploadArtifactBytes(
  db: SupabaseServiceClient,
  input: { storageKey: string; bytes: Uint8Array; mimeType: string },
): Promise<void> {
  await ensureProfileArtifactsBucket(db);
  const uploaded = await db.storage
    .from(PROFILE_ARTIFACTS_BUCKET)
    .upload(input.storageKey, input.bytes, {
      contentType: input.mimeType,
    });
  if (uploaded.error) throw uploaded.error;
}

async function ensureProfileArtifactsBucket(db: SupabaseServiceClient): Promise<void> {
  const existing = await db.storage.getBucket(PROFILE_ARTIFACTS_BUCKET);
  if (!existing.error) return;

  const created = await db.storage.createBucket(PROFILE_ARTIFACTS_BUCKET, {
    public: false,
  });
  if (!created.error) return;
  if (/already exists/iu.test(created.error.message)) return;
  throw created.error;
}
