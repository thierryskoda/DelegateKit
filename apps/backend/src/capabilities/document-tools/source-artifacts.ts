import type { z } from "zod";
import type { documentCreatePdfContentFormatSchema } from "@ai-assistants/document-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { cleanFilename } from "./rendering";

type DocumentCreatePdfContentFormat = z.infer<typeof documentCreatePdfContentFormatSchema>;

const SOURCE_BY_FORMAT = {
  plain_text: {
    extension: ".txt",
    mimeType: "text/plain",
    artifactType: "document.created.source.plain_text",
  },
  html: {
    extension: ".html",
    mimeType: "text/html",
    artifactType: "document.created.source.html",
  },
  markdown: {
    extension: ".md",
    mimeType: "text/markdown",
    artifactType: "document.created.source.markdown",
  },
} as const satisfies Record<
  DocumentCreatePdfContentFormat,
  { extension: string; mimeType: string; artifactType: string }
>;

export function sourceArtifactTypeForContentFormat(format: DocumentCreatePdfContentFormat): string {
  return SOURCE_BY_FORMAT[format].artifactType;
}

export function sourceMimeTypeForContentFormat(format: DocumentCreatePdfContentFormat): string {
  return SOURCE_BY_FORMAT[format].mimeType;
}

export function sourceContentFormatForArtifactType(
  artifactType: string,
): DocumentCreatePdfContentFormat {
  if (artifactType === SOURCE_BY_FORMAT.plain_text.artifactType) return "plain_text";
  if (artifactType === SOURCE_BY_FORMAT.html.artifactType) return "html";
  if (artifactType === SOURCE_BY_FORMAT.markdown.artifactType) return "markdown";
  throw new DomainError(
    domainCodes.BAD_REQUEST,
    `Artifact must be an editable document source artifact, got ${artifactType}.`,
  );
}

export function sourceFilenameForPdfFilename(
  pdfFilename: string,
  format: DocumentCreatePdfContentFormat,
): string {
  const withoutPdfExtension = pdfFilename.replace(/\.pdf$/iu, "");
  return cleanFilename(`${withoutPdfExtension}${SOURCE_BY_FORMAT[format].extension}`);
}
