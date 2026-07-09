import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";

export type ValidatedArtifactRef = {
  artifact: TableRow<"artifacts">;
  sha256: string;
  mimeType: string | null;
};

export async function requireProfileArtifact(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    artifactId: string;
    expectedSha256?: string | null;
    allowedMimeTypes?: readonly string[];
  },
): Promise<ValidatedArtifactRef> {
  const result = await db.from("artifacts").select().eq("id", input.artifactId).maybeSingle();
  const artifact = requireSupabaseData(
    `Load artifact ${input.artifactId}`,
    result.data,
    result.error,
  );
  if (artifact.profile_id !== input.profileId) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Artifact ${input.artifactId} belongs to another profile.`,
    );
  }
  if (!artifact.sha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Artifact ${input.artifactId} is missing a SHA-256 hash.`,
    );
  }
  if (input.expectedSha256 && artifact.sha256 !== input.expectedSha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Artifact ${input.artifactId} hash does not match the expected version.`,
    );
  }
  if (
    input.allowedMimeTypes?.length &&
    (!artifact.mime_type || !input.allowedMimeTypes.includes(artifact.mime_type))
  ) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Artifact ${input.artifactId} has unsupported MIME type ${artifact.mime_type ?? "unknown"}.`,
    );
  }
  return { artifact, sha256: artifact.sha256, mimeType: artifact.mime_type };
}

export async function requireProfileArtifacts(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    artifactIds: readonly string[];
    expectedSha256ByArtifactId?: Readonly<Record<string, string>>;
    allowedMimeTypes?: readonly string[];
  },
): Promise<ValidatedArtifactRef[]> {
  const uniqueIds = [...new Set(input.artifactIds)];
  if (uniqueIds.length !== input.artifactIds.length) {
    throw new DomainError(domainCodes.BAD_REQUEST, "Artifact ids must not contain duplicates.");
  }
  return Promise.all(
    uniqueIds.map((artifactId) =>
      requireProfileArtifact(db, {
        profileId: input.profileId,
        artifactId,
        ...(input.expectedSha256ByArtifactId?.[artifactId] === undefined
          ? {}
          : { expectedSha256: input.expectedSha256ByArtifactId[artifactId] }),
        ...(input.allowedMimeTypes === undefined
          ? {}
          : { allowedMimeTypes: input.allowedMimeTypes }),
      }),
    ),
  );
}
