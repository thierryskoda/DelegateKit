import { randomUUID } from "node:crypto";
import { recordArtifact } from "../../product/artifacts/artifact-store";
import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import {
  documentTemplateRenderInputSchema,
  documentTemplateRenderOutputSchema,
} from "@ai-assistants/document-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import { toolContractByName, toolDataForContract, type BackendToolResult } from "@ai-assistants/tool-contracts";
import {
  downloadArtifactBytes,
  requireDocxTemplateArtifact,
  uploadArtifactBytes,
} from "./artifacts";
import type { z } from "zod";
import { sha256 } from "./canonical-json";
import { PROFILE_ARTIFACTS_BUCKET } from "./artifacts";
import { cleanFilename, defaultDocumentRenderer, type DocumentRenderer } from "./rendering";
import { renderMetadataSchema } from "./schemas";

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

function outputBaseFilename(template: TableRow<"artifacts">, requested?: string): string {
  const raw = requested?.trim() || template.filename.replace(/\.docx$/i, "") || "document";
  return cleanFilename(raw.replace(/\.pdf$/i, ""));
}

export async function documentTemplateRenderTool(
  db: SupabaseServiceClient,
  profileId: string,
  rawParams: Record<string, unknown>,
  renderer: DocumentRenderer = defaultDocumentRenderer,
): Promise<BackendToolResult<z.infer<typeof documentTemplateRenderOutputSchema>>> {
  const params = documentTemplateRenderInputSchema.parse(rawParams);
  const sourceRefs = params.sourceRefs ?? {};
  const templateArtifact = await requireDocxTemplateArtifact(
    db,
    profileId,
    params.templateProfileFileId,
  );
  const templateSha256 = templateArtifact.sha256;
  if (!templateSha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Template artifact ${templateArtifact.id} is missing a SHA-256 hash.`,
    );
  }
  const templateBytes = await downloadArtifactBytes(db, templateArtifact);
  const templateDigest = sha256(templateBytes);
  if (templateDigest !== templateSha256) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Stored template artifact ${templateArtifact.id} no longer matches its hash.`,
    );
  }

  const rendered = await renderer.render({ templateBytes, fields: params.fieldValues });
  const renderedAt = new Date().toISOString();
  const baseFilename = outputBaseFilename(templateArtifact, params.outputFilename);
  const pdfFilename = cleanFilename(`${baseFilename}.pdf`);
  const docxFilename = cleanFilename(`${baseFilename}.docx`);
  const storagePrefix = `${profileId}/document-renders/${randomUUID()}`;
  const docxStorageKey = `${storagePrefix}/${docxFilename}`;
  const pdfStorageKey = `${storagePrefix}/${pdfFilename}`;
  await uploadArtifactBytes(db, {
    storageKey: docxStorageKey,
    bytes: rendered.docx.bytes,
    mimeType: rendered.docx.mimeType,
  });
  await uploadArtifactBytes(db, {
    storageKey: pdfStorageKey,
    bytes: rendered.pdf.bytes,
    mimeType: rendered.pdf.mimeType,
  });

  const commonMetadata = renderMetadataSchema.parse({
    stage: "rendered",
    renderedAt,
    templateArtifactId: templateArtifact.id,
    templateSha256,
    fieldValues: params.fieldValues,
    fieldKeys: rendered.templateFieldKeys,
    boldSignTextTags: rendered.boldSignTextTags,
    sourceRefs,
  });
  const docxArtifact = await recordArtifact(db, {
    profileId,
    storageBucket: PROFILE_ARTIFACTS_BUCKET,
    storageKey: docxStorageKey,
    filename: docxFilename,
    description: `Rendered DOCX from ${templateArtifact.filename}`,
    artifactType: "document.rendered.docx",
    mimeType: rendered.docx.mimeType,
    byteSize: rendered.docx.bytes.byteLength,
    sha256: sha256(rendered.docx.bytes),
    metadata: {
      ...commonMetadata,
      outputFormat: "docx",
    },
  });
  const pdfArtifact = await recordArtifact(db, {
    profileId,
    storageBucket: PROFILE_ARTIFACTS_BUCKET,
    storageKey: pdfStorageKey,
    filename: pdfFilename,
    description: `Rendered PDF from ${templateArtifact.filename}`,
    artifactType: "document.rendered.pdf",
    mimeType: rendered.pdf.mimeType,
    byteSize: rendered.pdf.bytes.byteLength,
    sha256: sha256(rendered.pdf.bytes),
    metadata: {
      ...commonMetadata,
      outputFormat: "pdf",
      docxArtifactId: docxArtifact.id,
      docxSha256: docxArtifact.sha256,
    },
  });

  return toolDataForContract(toolContractByName(documentToolContracts, "document_template_render"), {
    provider: "document-tools",
    template: documentArtifactSummary(templateArtifact),
    files: {
      docx: documentArtifactSummary(docxArtifact),
      pdf: documentArtifactSummary(pdfArtifact),
    },
    render: {
      renderedAt,
      fieldKeys: commonMetadata.fieldKeys,
      templateFieldKeys: rendered.templateFieldKeys,
      sourceRefKeys: Object.keys(sourceRefs),
      boldSignTextTags: rendered.boldSignTextTags,
    },
  });
}
