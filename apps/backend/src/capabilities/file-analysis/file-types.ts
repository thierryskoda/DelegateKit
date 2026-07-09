import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { TableRow } from "@ai-assistants/control-db";

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/tab-separated-values",
  "text/markdown",
  "application/json",
  "application/xml",
  "text/xml",
]);

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function isPdfFile(artifact: TableRow<"artifacts">): boolean {
  return artifact.mime_type === "application/pdf" || artifact.filename.toLowerCase().endsWith(".pdf");
}

export function isTextLikeFile(artifact: TableRow<"artifacts">): boolean {
  const mimeType = artifact.mime_type?.toLowerCase() ?? "";
  if (TEXT_MIME_TYPES.has(mimeType)) return true;
  return /\.(txt|csv|tsv|md|markdown|json|xml)$/iu.test(artifact.filename);
}

export function isImageFile(artifact: TableRow<"artifacts">): boolean {
  const mimeType = artifact.mime_type?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES.has(mimeType);
}

export function requireImageMimeType(artifact: TableRow<"artifacts">): string {
  const mimeType = artifact.mime_type?.toLowerCase();
  if (!mimeType || !IMAGE_MIME_TYPES.has(mimeType)) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Profile file ${artifact.id} is not a supported image file.`,
    );
  }
  return mimeType;
}
