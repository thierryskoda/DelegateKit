import { createHash } from "node:crypto";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";

export async function loadProfileFile(
  db: SupabaseServiceClient,
  input: { profileId: string; profileFileId: string; expectedSha256: string },
): Promise<{ artifact: TableRow<"artifacts">; bytes: Uint8Array; sha256: string }> {
  const result = await db.from("artifacts").select().eq("id", input.profileFileId).maybeSingle();
  const artifact = requireSupabaseData(
    `Load profile file ${input.profileFileId}`,
    result.data,
    result.error,
  );
  if (artifact.profile_id !== input.profileId) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Profile file ${input.profileFileId} belongs to another profile.`,
    );
  }
  if (!artifact.sha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Profile file ${input.profileFileId} is missing a SHA-256 hash.`,
    );
  }
  if (artifact.sha256 !== input.expectedSha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Profile file ${input.profileFileId} hash does not match the expected version.`,
    );
  }

  const downloaded = await db.storage.from(artifact.storage_bucket).download(artifact.storage_key);
  if (downloaded.error) throw downloaded.error;
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== input.expectedSha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Stored profile file ${input.profileFileId} no longer matches its hash.`,
    );
  }
  return { artifact, bytes, sha256 };
}

export function sourceFileSummary(artifact: TableRow<"artifacts">) {
  return {
    profileFileId: artifact.id,
    filename: artifact.filename,
    mimeType: artifact.mime_type,
    byteSize: artifact.byte_size,
    sha256: artifact.sha256,
    createdAt: artifact.created_at,
  };
}
