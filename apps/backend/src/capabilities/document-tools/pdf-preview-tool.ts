import { randomUUID } from "node:crypto";
import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import {
  documentPdfPreviewCreateInputSchema,
  documentPdfPreviewCreateOutputSchema,
} from "@ai-assistants/document-contracts/schemas";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import {
  toolContractByName,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { recordArtifact } from "../../product/artifacts/artifact-store";
import type { z } from "zod";
import {
  downloadArtifactBytes,
  loadArtifact,
  PROFILE_ARTIFACTS_BUCKET,
  uploadArtifactBytes,
} from "./artifacts";
import { sha256 } from "./canonical-json";
import { cleanFilename } from "./rendering";
import { documentArtifactSummary } from "./artifact-summary";
import { renderFirstPagePdfPreview } from "./pdf-preview-renderer";

const PDF_MIME_TYPE = "application/pdf";
const PNG_MIME_TYPE = "image/png";

function requirePdfArtifact(artifact: TableRow<"artifacts">): void {
  const isPdfMime = artifact.mime_type === PDF_MIME_TYPE;
  const isPdfFile = artifact.filename.toLowerCase().endsWith(".pdf");
  if (!isPdfMime && !isPdfFile) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Artifact ${artifact.id} must be a PDF file for preview.`,
    );
  }
}

function previewFilename(pdfFilename: string): string {
  const baseFilename = cleanFilename(pdfFilename.replace(/\.pdf$/iu, ""));
  return cleanFilename(`${baseFilename}-page-1.png`);
}

export async function documentPdfPreviewCreateTool(
  db: SupabaseServiceClient,
  profileId: string,
  rawParams: Record<string, unknown>,
): Promise<BackendToolResult<z.infer<typeof documentPdfPreviewCreateOutputSchema>>> {
  const params = documentPdfPreviewCreateInputSchema.parse(rawParams);
  const sourcePdfArtifact = await loadArtifact(db, profileId, params.pdfProfileFileId);
  requirePdfArtifact(sourcePdfArtifact);

  if (!sourcePdfArtifact.sha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `PDF artifact ${sourcePdfArtifact.id} is missing a SHA-256 hash.`,
    );
  }
  if (sourcePdfArtifact.sha256 !== params.expectedSha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `PDF artifact ${sourcePdfArtifact.id} does not match the expected hash.`,
    );
  }

  const sourcePdfBytes = await downloadArtifactBytes(db, sourcePdfArtifact);
  const sourcePdfSha256 = sha256(sourcePdfBytes);
  if (sourcePdfSha256 !== params.expectedSha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Stored PDF artifact ${sourcePdfArtifact.id} no longer matches its hash.`,
    );
  }

  const preview = await renderFirstPagePdfPreview(sourcePdfBytes);
  const createdAt = new Date().toISOString();
  const filename = previewFilename(sourcePdfArtifact.filename);
  const storageKey = `${profileId}/document-pdf-previews/${randomUUID()}/${filename}`;

  await uploadArtifactBytes(db, {
    storageKey,
    bytes: preview.pngBytes,
    mimeType: PNG_MIME_TYPE,
  });

  const previewArtifact = await recordArtifact(db, {
    profileId,
    storageBucket: PROFILE_ARTIFACTS_BUCKET,
    storageKey,
    filename,
    description: `First-page PDF preview for ${sourcePdfArtifact.filename}`,
    artifactType: "document.pdf.preview.png",
    mimeType: PNG_MIME_TYPE,
    byteSize: preview.pngBytes.byteLength,
    sha256: sha256(preview.pngBytes),
    metadata: {
      stage: "pdf_preview",
      createdAt,
      sourcePdfArtifactId: sourcePdfArtifact.id,
      sourcePdfSha256,
      pageSelection: params.pageSelection,
      pageNumber: preview.pageNumber,
      widthPx: preview.widthPx,
      heightPx: preview.heightPx,
      renderer: preview.renderer,
    },
  });

  return toolDataForContract(
    toolContractByName(documentToolContracts, "document_pdf_preview_create"),
    {
      provider: "document-tools",
      sourcePdfFile: documentArtifactSummary(sourcePdfArtifact),
      previewFile: documentArtifactSummary(previewArtifact),
      createdAt,
      preview: {
        pageSelection: params.pageSelection,
        pageNumber: preview.pageNumber,
        widthPx: preview.widthPx,
        heightPx: preview.heightPx,
        sourcePdfSha256,
        renderer: preview.renderer,
      },
    },
  );
}
