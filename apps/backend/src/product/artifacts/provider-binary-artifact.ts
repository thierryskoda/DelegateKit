import { createHash, randomUUID } from "node:crypto";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { uploadStorageObject } from "../actions/execution/artifact-storage";
import { recordArtifact } from "./artifact-store";

export type SavedProviderBinaryArtifact = {
  artifactId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
};

export async function recordProviderBinaryArtifact(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    body: Uint8Array;
    contentType: string | null | undefined;
    filename: string;
    storagePrefix: string;
    artifactType: string;
    metadata: Record<string, unknown>;
    incompleteMetadataMessage: string;
  },
): Promise<SavedProviderBinaryArtifact> {
  const sha256 = createHash("sha256").update(input.body).digest("hex");
  const filename = input.filename.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 200);
  const mimeType = input.contentType?.split(";")[0]?.trim() || "application/octet-stream";
  const storageKey = `${input.profileId}/${input.storagePrefix}/${randomUUID()}/${filename}`;
  await uploadStorageObject(db, { key: storageKey, body: input.body, contentType: mimeType });
  const artifact = await recordArtifact(db, {
    profileId: input.profileId,
    storageKey,
    filename,
    artifactType: input.artifactType,
    mimeType,
    byteSize: input.body.byteLength,
    sha256,
    metadata: input.metadata,
  });
  if (
    artifact.filename === null ||
    artifact.mime_type === null ||
    artifact.byte_size === null ||
    artifact.sha256 === null
  ) {
    throw new DomainError(domainCodes.CONFLICT, input.incompleteMetadataMessage);
  }
  return {
    artifactId: artifact.id,
    filename: artifact.filename,
    mimeType: artifact.mime_type,
    byteSize: artifact.byte_size,
    sha256: artifact.sha256,
  };
}
