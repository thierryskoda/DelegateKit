import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  documentSourceGetInputSchema,
  documentSourceGetOutputSchema,
} from "@ai-assistants/document-contracts/schemas";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import {
  toolContractByName,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { z } from "zod";
import { downloadArtifactBytes, loadArtifact } from "./artifacts";
import { sha256 } from "./canonical-json";
import { documentArtifactSummary } from "./artifact-summary";
import { sourceContentFormatForArtifactType } from "./source-artifacts";

const MAX_SOURCE_BYTES = 500_000;

function decodeUtf8Source(bytes: Uint8Array, artifactId: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Source artifact ${artifactId} is not valid UTF-8 text.`,
      { cause: error },
    );
  }
}

export async function documentSourceGetTool(
  db: SupabaseServiceClient,
  profileId: string,
  rawParams: Record<string, unknown>,
): Promise<BackendToolResult<z.infer<typeof documentSourceGetOutputSchema>>> {
  const params = documentSourceGetInputSchema.parse(rawParams);
  const sourceArtifact = await loadArtifact(db, profileId, params.sourceProfileFileId);
  const contentFormat = sourceContentFormatForArtifactType(sourceArtifact.artifact_type);

  if (!sourceArtifact.sha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Source artifact ${sourceArtifact.id} is missing a SHA-256 hash.`,
    );
  }
  if (sourceArtifact.sha256 !== params.expectedSha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Source artifact ${sourceArtifact.id} does not match the expected hash.`,
    );
  }
  if (sourceArtifact.byte_size === null || sourceArtifact.byte_size > MAX_SOURCE_BYTES) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Source artifact ${sourceArtifact.id} is too large to return as editable source content.`,
    );
  }

  const bytes = await downloadArtifactBytes(db, sourceArtifact);
  const contentSha256 = sha256(bytes);
  if (contentSha256 !== params.expectedSha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Stored source artifact ${sourceArtifact.id} no longer matches its hash.`,
    );
  }

  const content = decodeUtf8Source(bytes, sourceArtifact.id);
  const retrievedAt = new Date().toISOString();

  return toolDataForContract(toolContractByName(documentToolContracts, "document_source_get"), {
    provider: "document-tools",
    sourceFile: documentArtifactSummary(sourceArtifact),
    retrievedAt,
    source: {
      contentFormat,
      content,
      contentSha256,
    },
  });
}
