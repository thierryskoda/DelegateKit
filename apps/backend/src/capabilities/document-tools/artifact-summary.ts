import type { TableRow } from "@ai-assistants/control-db";

export function documentArtifactSummary(artifact: TableRow<"artifacts">) {
  return {
    profileFileId: artifact.id,
    filename: artifact.filename,
    artifactType: artifact.artifact_type,
    mimeType: artifact.mime_type,
    byteSize: artifact.byte_size,
    sha256: artifact.sha256,
    createdAt: artifact.created_at,
  };
}
