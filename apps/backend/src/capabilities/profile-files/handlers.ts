import { DomainError, domainCodes } from "@ai-assistants/errors";
import { profileFileToolContracts } from "@ai-assistants/profile-files-contracts/contracts";
import {
  profileFileFindInputSchema,
  profileFileFindOutputSchema,
  profileFileSendInputSchema,
  profileFileSendOutputSchema,
} from "@ai-assistants/profile-files-contracts/schemas";
import type { ProfileArtifact } from "@ai-assistants/tool-contracts";
import type { BackendImmediateToolHandlers } from "../registry/backend-capability-module";
import { backendToolData } from "../../shared/tool-result";
import {
  getProfileArtifactMetadata,
  listProfileArtifactMetadata,
  searchProfileArtifactMetadata,
} from "../../product/artifacts/artifact-metadata";
import { prepareProfileArtifactDeliveryBytes } from "../../product/artifacts/artifact-service";

const MAX_INLINE_CONTENT_BYTES = 2_000_000;
const MAX_DIRECT_DELIVERY_BYTES = 20_000_000;

function profileFileFromArtifact(artifact: ProfileArtifact) {
  return {
    profileFileId: artifact.id,
    filename: artifact.filename,
    fileType: artifact.artifactType,
    mimeType: artifact.mimeType,
    byteSize: artifact.byteSize,
    sha256: artifact.sha256,
    description: artifact.description,
    relatedActionId: artifact.relatedActionId,
    relatedBrowserTaskId: artifact.relatedBrowserTaskId,
    createdAt: artifact.createdAt,
  };
}

function requireExpectedShaMatches(input: {
  artifact: ProfileArtifact;
  expectedSha256?: string | undefined;
}): void {
  if (!input.expectedSha256) return;
  if (input.artifact.sha256 === input.expectedSha256) return;
  throw new DomainError(
    domainCodes.CONFLICT,
    `Profile file ${input.artifact.id} hash does not match the expected version.`,
  );
}

export const profileFilesHandlers = {
  async profile_file_find(ctx) {
    const parsed = profileFileFindInputSchema.parse(ctx.params);
    if (parsed.profileFileId) {
      const artifact = await getProfileArtifactMetadata(ctx.db, ctx.profile.id, parsed.profileFileId);
      requireExpectedShaMatches({ artifact, expectedSha256: parsed.expectedSha256 });
      if (parsed.includeContent === "metadata_only") {
        return backendToolData(
          profileFileToolContracts,
          "profile_file_find",
          profileFileFindOutputSchema.parse({
            files: [profileFileFromArtifact(artifact)],
          }),
        );
      }

      const delivery = await prepareProfileArtifactDeliveryBytes(ctx.db, {
        profileId: ctx.profile.id,
        artifactId: parsed.profileFileId,
        expectedSha256: parsed.expectedSha256 ?? null,
      });
      const content =
        delivery.bytes.byteLength <= MAX_INLINE_CONTENT_BYTES
          ? {
              available: true as const,
              base64: Buffer.from(delivery.bytes).toString("base64"),
              isBase64: true as const,
            }
          : {
              available: false as const,
              reason: "too_large_for_inline_base64" as const,
            };
      return backendToolData(
        profileFileToolContracts,
        "profile_file_find",
        profileFileFindOutputSchema.parse({
          files: [
            {
              ...profileFileFromArtifact(artifact),
              content,
            },
          ],
        }),
      );
    }

    const artifacts = parsed.query
      ? await searchProfileArtifactMetadata(ctx.db, ctx.profile.id, parsed.query, parsed.limit ?? 10)
      : await listProfileArtifactMetadata(ctx.db, ctx.profile.id, parsed.limit ?? 10);
    return backendToolData(
      profileFileToolContracts,
      "profile_file_find",
      profileFileFindOutputSchema.parse({
        ...(parsed.query ? { query: parsed.query } : {}),
        files: artifacts.map(profileFileFromArtifact),
      }),
    );
  },
  async profile_file_send(ctx) {
    const parsed = profileFileSendInputSchema.parse(ctx.params);
    const delivery = await prepareProfileArtifactDeliveryBytes(ctx.db, {
      profileId: ctx.profile.id,
      artifactId: parsed.profileFileId,
      expectedSha256: parsed.expectedSha256 ?? null,
      filename: parsed.filename ?? null,
    });
    if (delivery.bytes.byteLength > MAX_DIRECT_DELIVERY_BYTES) {
      throw new DomainError(
        domainCodes.BAD_REQUEST,
        `Profile file is ${delivery.bytes.byteLength} bytes; max direct delivery size is ${MAX_DIRECT_DELIVERY_BYTES} bytes.`,
      );
    }
    const channel = ctx.input.trustedChannel?.messageChannel ?? "current_thread";
    return backendToolData(
      profileFileToolContracts,
      "profile_file_send",
      profileFileSendOutputSchema.parse({
        status: "queued_for_current_chat",
        profileFile: {
          profileFileId: delivery.artifact.id,
          filename: delivery.filename,
          mimeType: delivery.artifact.mime_type,
          byteSize: delivery.artifact.byte_size ?? delivery.bytes.byteLength,
          sha256: delivery.artifact.sha256,
        },
        channel,
        caption: parsed.caption ?? null,
      }),
    );
  },
} satisfies BackendImmediateToolHandlers<typeof profileFileToolContracts>;
