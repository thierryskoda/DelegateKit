import {
  profileArtifactSchema,
  type ProfileArtifact,
} from "@ai-assistants/tool-contracts";
import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";

function profileArtifactDto(artifact: TableRow<"artifacts">) {
  const dto = {
    id: artifact.id,
    filename: artifact.filename,
    artifactType: artifact.artifact_type,
    mimeType: artifact.mime_type,
    byteSize: artifact.byte_size,
    sha256: artifact.sha256,
    description: artifact.description,
    relatedActionId: artifact.profile_action_id,
    relatedBrowserTaskId: artifact.browser_task_id,
    createdAt: artifact.created_at,
  } satisfies ProfileArtifact;
  return profileArtifactSchema.parse(dto);
}

export async function listProfileArtifactMetadata(
  db: SupabaseServiceClient,
  profileId: string,
  limit: number,
) {
  const result = await db
    .from("artifacts")
    .select()
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return requireSupabaseRows("List profile artifacts", result.data, result.error).map(
    profileArtifactDto,
  );
}

export async function getProfileArtifactMetadata(
  db: SupabaseServiceClient,
  profileId: string,
  artifactId: string,
) {
  const result = await db.from("artifacts").select().eq("id", artifactId).maybeSingle();
  const artifact = requireSupabaseData(
    `Load profile artifact ${artifactId}`,
    result.data,
    result.error,
  );
  if (artifact.profile_id !== profileId) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Artifact ${artifactId} belongs to another profile.`,
    );
  }
  return profileArtifactDto(artifact);
}

export async function searchProfileArtifactMetadata(
  db: SupabaseServiceClient,
  profileId: string,
  query: string,
  limit: number,
) {
  const scanLimit = Math.min(250, Math.max(50, limit * 10));
  const recentArtifacts = await listProfileArtifactMetadata(db, profileId, scanLimit);
  const needle = query.toLocaleLowerCase();
  return recentArtifacts
    .filter((artifact) =>
      [artifact.filename, artifact.description, artifact.artifactType, artifact.mimeType].some(
        (value) => value?.toLocaleLowerCase().includes(needle),
      ),
    )
    .slice(0, limit);
}
