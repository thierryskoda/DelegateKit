import { randomUUID } from "node:crypto";
import path from "node:path";
import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import {
  documentConvertToPdfInputSchema,
  documentConvertToPdfOutputSchema,
} from "@ai-assistants/document-contracts/schemas";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import { toolContractByName, toolDataForContract, type BackendToolResult } from "@ai-assistants/tool-contracts";
import { recordArtifact } from "../../product/artifacts/artifact-store";
import {
  downloadArtifactBytes,
  loadArtifact,
  uploadArtifactBytes,
  PROFILE_ARTIFACTS_BUCKET,
} from "./artifacts";
import type { z } from "zod";
import { sha256 } from "./canonical-json";
import { cleanFilename } from "./rendering";
import { defaultDocumentPdfConverter } from "./pdf-converter";
import { DomainError, domainCodes } from "@ai-assistants/errors";

const SUPPORTED_CONVERSION_EXTENSIONS = new Set([
  ".docx", ".doc", ".odt", ".rtf", 
  ".xlsx", ".xls", ".csv", 
  ".pptx", ".ppt", 
  ".txt"
]);

function documentArtifactSummary(artifact: TableRow<"artifacts">) {
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

export async function documentConvertToPdfTool(
  db: SupabaseServiceClient,
  profileId: string,
  rawParams: Record<string, unknown>,
): Promise<BackendToolResult<z.infer<typeof documentConvertToPdfOutputSchema>>> {
  const params = documentConvertToPdfInputSchema.parse(rawParams);
  
  const sourceArtifact = await loadArtifact(db, profileId, params.profileFileId);
  
  if (sourceArtifact.mime_type === "application/pdf" || sourceArtifact.filename.toLowerCase().endsWith(".pdf")) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Artifact ${sourceArtifact.id} is already a PDF.`,
    );
  }

  const sourceBytes = await downloadArtifactBytes(db, sourceArtifact);
  const downloadedSha256 = sha256(sourceBytes);
  if (sourceArtifact.sha256 && downloadedSha256 !== sourceArtifact.sha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Stored artifact ${sourceArtifact.id} no longer matches its hash.`,
    );
  }
  
  const extension = (path.extname(sourceArtifact.filename) || ".tmp").toLowerCase();
  
  if (!SUPPORTED_CONVERSION_EXTENSIONS.has(extension)) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Unsupported file extension '${extension}' for conversion. Supported formats: ${Array.from(SUPPORTED_CONVERSION_EXTENSIONS).join(", ")}.`,
    );
  }
  
  const pdfBytes = await defaultDocumentPdfConverter.convert(sourceBytes, extension);
  
  const convertedAt = new Date().toISOString();
  const baseFilename = cleanFilename(sourceArtifact.filename.replace(new RegExp(`\\${extension}$`, "i"), ""));
  const pdfFilename = cleanFilename(`${baseFilename}.pdf`);
  const storagePrefix = `${profileId}/document-conversions/${randomUUID()}`;
  const pdfStorageKey = `${storagePrefix}/${pdfFilename}`;
  
  await uploadArtifactBytes(db, {
    storageKey: pdfStorageKey,
    bytes: pdfBytes,
    mimeType: "application/pdf",
  });
  const pdfArtifact = await recordArtifact(db, {
    profileId,
    storageBucket: PROFILE_ARTIFACTS_BUCKET,
    storageKey: pdfStorageKey,
    filename: pdfFilename,
    description: `Converted PDF from ${sourceArtifact.filename}`,
    artifactType: "document.converted.pdf",
    mimeType: "application/pdf",
    byteSize: pdfBytes.byteLength,
    sha256: sha256(pdfBytes),
    metadata: {
      stage: "converted",
      convertedAt,
      sourceArtifactId: sourceArtifact.id,
      sourceSha256: sourceArtifact.sha256,
      outputFormat: "pdf",
      converter: "libreoffice",
    },
  });

  return toolDataForContract(toolContractByName(documentToolContracts, "document_convert_to_pdf"), {
    provider: "document-tools",
    sourceFile: documentArtifactSummary(sourceArtifact),
    pdfFile: documentArtifactSummary(pdfArtifact),
    convertedAt,
  });
}
