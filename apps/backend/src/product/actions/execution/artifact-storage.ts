import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  ensureProfileArtifactsBucket,
  PROFILE_ARTIFACTS_BUCKET,
} from "../../artifacts/artifact-service";

export async function uploadStorageObject(
  db: SupabaseServiceClient,
  input: {
    bucket?: string;
    key: string;
    body: Uint8Array | string;
    contentType: string;
  },
): Promise<void> {
  if (!input.bucket || input.bucket === PROFILE_ARTIFACTS_BUCKET) {
    await ensureProfileArtifactsBucket(db);
  }
  const uploaded = await db.storage
    .from(input.bucket ?? PROFILE_ARTIFACTS_BUCKET)
    .upload(input.key, input.body, {
      contentType: input.contentType,
      upsert: true,
    });
  if (uploaded.error) throw uploaded.error;
}

export async function loadArtifact(
  db: SupabaseServiceClient,
  profileId: string,
  artifactId: string,
): Promise<TableRow<"artifacts">> {
  const result = await db.from("artifacts").select().eq("id", artifactId).maybeSingle();
  const artifact = requireSupabaseData(`Load artifact ${artifactId}`, result.data, result.error);
  if (artifact.profile_id !== profileId)
    throw new DomainError(
      domainCodes.INTERNAL,
      `Artifact ${artifactId} belongs to another profile.`,
    );
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
