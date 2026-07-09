import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { prepareProfileArtifactDeliveryBytes } from "./artifact-service";
import { PROVIDER_BINARY_ARTIFACT_MAX_BYTES } from "./provider-binary-limits";

export type PreparedProviderUploadSource = {
  artifact: TableRow<"artifacts"> | null;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

export async function prepareArtifactProviderUploadSource(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    artifactId: string;
    expectedSha256?: string | null;
    filename?: string | null;
    mimeType?: string | null;
    providerLabel: string;
  },
): Promise<PreparedProviderUploadSource> {
  const delivery = await prepareProfileArtifactDeliveryBytes(db, {
    profileId: input.profileId,
    artifactId: input.artifactId,
    expectedSha256: input.expectedSha256 ?? null,
    filename: input.filename ?? null,
  });
  if (delivery.bytes.byteLength > PROVIDER_BINARY_ARTIFACT_MAX_BYTES) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `${input.providerLabel} upload artifact ${input.artifactId} is ${delivery.bytes.byteLength} bytes; max is ${PROVIDER_BINARY_ARTIFACT_MAX_BYTES} bytes.`,
    );
  }
  return {
    artifact: delivery.artifact,
    filename: delivery.filename,
    mimeType: input.mimeType ?? delivery.artifact.mime_type ?? "application/octet-stream",
    bytes: delivery.bytes,
  };
}
