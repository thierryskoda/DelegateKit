import { randomUUID } from "node:crypto";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  documentCreatePdfInputSchema,
  documentCreatePdfOutputSchema,
} from "@ai-assistants/document-contracts/schemas";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import {
  toolContractByName,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { marked } from "marked";
import { recordArtifact } from "../../product/artifacts/artifact-store";
import type { z } from "zod";
import { sha256 } from "./canonical-json";
import { cleanFilename } from "./rendering";
import { defaultDocumentPdfConverter } from "./pdf-converter";
import { PROFILE_ARTIFACTS_BUCKET, uploadArtifactBytes } from "./artifacts";
import { documentArtifactSummary } from "./artifact-summary";
import {
  sourceArtifactTypeForContentFormat,
  sourceFilenameForPdfFilename,
  sourceMimeTypeForContentFormat,
} from "./source-artifacts";

const PDF_MIME_TYPE = "application/pdf";
const DOCUMENT_CSS =
  "body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.45;color:#111;margin:36pt;}" +
  "h1,h2,h3{line-height:1.2;margin:0 0 10pt;}" +
  "h1{font-size:22pt;}h2{font-size:17pt;margin-top:18pt;}h3{font-size:14pt;margin-top:14pt;}" +
  "p,ul,ol,blockquote,table,pre{margin-top:0;margin-bottom:10pt;}" +
  "ul,ol{padding-left:24pt;}" +
  "blockquote{border-left:3pt solid #ccc;padding-left:10pt;color:#333;}" +
  "table{border-collapse:collapse;width:100%;}" +
  "th,td{border:1pt solid #ccc;padding:5pt 6pt;text-align:left;vertical-align:top;}" +
  "th{background:#f2f2f2;}" +
  "code{font-family:Menlo,Consolas,monospace;font-size:10pt;}" +
  "pre{white-space:pre-wrap;background:#f6f6f6;padding:8pt;border:1pt solid #ddd;}";

function pdfFilename(requested: string): string {
  const clean = cleanFilename(requested.trim());
  return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean}.pdf`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextHtml(input: { content: string; title?: string }): string {
  const title = escapeHtml(input.title?.trim() || "Document");
  const body = escapeHtml(input.content);
  return documentHtml({
    title,
    body: `<pre>${body}</pre>`,
    preserveWhitespace: true,
  });
}

function documentHtml(input: {
  title: string;
  body: string;
  preserveWhitespace?: boolean;
}): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    `<title>${input.title}</title>`,
    "<style>",
    DOCUMENT_CSS,
    input.preserveWhitespace
      ? "pre{font-family:Arial,sans-serif;background:transparent;border:0;padding:0;}"
      : "",
    "</style>",
    "</head>",
    "<body>",
    input.body,
    "</body>",
    "</html>",
  ].join("");
}

function rejectUnsafeHtml(html: string): void {
  const checks: Array<{ pattern: RegExp; message: string }> = [
    { pattern: /<\s*script\b/iu, message: "HTML content must not include script tags." },
    {
      pattern: /\son[a-z]+\s*=/iu,
      message: "HTML content must not include event handler attributes.",
    },
    {
      pattern: /\b(?:href|src)\s*=\s*["']?\s*(?:https?:|file:|data:|javascript:)/iu,
      message: "HTML content must not include external, data, file, or javascript URLs.",
    },
    { pattern: /@import\b/iu, message: "HTML content must not include CSS imports." },
    { pattern: /url\s*\(/iu, message: "HTML content must not include CSS URL references." },
    {
      pattern: /<\s*(?:iframe|object|embed|link|img)\b/iu,
      message: "HTML content must not include embedded or external-loading elements.",
    },
  ];
  for (const check of checks) {
    if (check.pattern.test(html)) {
      throw new DomainError(domainCodes.BAD_REQUEST, check.message);
    }
  }
}

function markdownHtml(input: { content: string; title?: string }): string {
  const rendered = marked.parse(input.content, {
    async: false,
    breaks: false,
    gfm: true,
  });
  rejectUnsafeHtml(rendered);
  return documentHtml({
    title: escapeHtml(input.title?.trim() || "Document"),
    body: rendered,
  });
}

function sourceHtml(input: z.infer<typeof documentCreatePdfInputSchema>): string {
  if (input.contentFormat === "plain_text") {
    return plainTextHtml({
      content: input.content,
      ...(input.title ? { title: input.title } : {}),
    });
  }
  if (input.contentFormat === "markdown") {
    return markdownHtml({ content: input.content, ...(input.title ? { title: input.title } : {}) });
  }
  rejectUnsafeHtml(input.content);
  return input.content;
}

export async function documentCreatePdfTool(
  db: SupabaseServiceClient,
  profileId: string,
  rawParams: Record<string, unknown>,
): Promise<BackendToolResult<z.infer<typeof documentCreatePdfOutputSchema>>> {
  const params = documentCreatePdfInputSchema.parse(rawParams);
  const sourceRefs = params.sourceRefs ?? {};
  const createdAt = new Date().toISOString();
  const sourceBytes = new TextEncoder().encode(params.content);
  const contentSha256 = sha256(sourceBytes);
  const html = sourceHtml(params);
  const pdfBytes = await defaultDocumentPdfConverter.convert(
    new TextEncoder().encode(html),
    ".html",
  );
  const filename = pdfFilename(params.filename);
  const sourceFilename = sourceFilenameForPdfFilename(filename, params.contentFormat);
  const sourceMimeType = sourceMimeTypeForContentFormat(params.contentFormat);
  const storagePrefix = `${profileId}/document-created-documents/${randomUUID()}`;
  const sourceStorageKey = `${storagePrefix}/${sourceFilename}`;
  const pdfStorageKey = `${storagePrefix}/${filename}`;

  await uploadArtifactBytes(db, {
    storageKey: sourceStorageKey,
    bytes: sourceBytes,
    mimeType: sourceMimeType,
  });

  await uploadArtifactBytes(db, {
    storageKey: pdfStorageKey,
    bytes: pdfBytes,
    mimeType: PDF_MIME_TYPE,
  });

  const sourceArtifact = await recordArtifact(db, {
    profileId,
    storageBucket: PROFILE_ARTIFACTS_BUCKET,
    storageKey: sourceStorageKey,
    filename: sourceFilename,
    description: `Editable source for ${filename}`,
    artifactType: sourceArtifactTypeForContentFormat(params.contentFormat),
    mimeType: sourceMimeType,
    byteSize: sourceBytes.byteLength,
    sha256: contentSha256,
    metadata: {
      stage: "source",
      createdAt,
      title: params.title ?? null,
      contentFormat: params.contentFormat,
      contentSha256,
      sourceRefs,
      sourceRefKeys: Object.keys(sourceRefs),
      outputFilename: filename,
    },
  });

  const pdfArtifact = await recordArtifact(db, {
    profileId,
    storageBucket: PROFILE_ARTIFACTS_BUCKET,
    storageKey: pdfStorageKey,
    filename,
    description: params.description ?? params.title ?? `Created PDF ${filename}`,
    artifactType: "document.created.pdf",
    mimeType: PDF_MIME_TYPE,
    byteSize: pdfBytes.byteLength,
    sha256: sha256(pdfBytes),
    metadata: {
      stage: "created",
      createdAt,
      title: params.title ?? null,
      contentFormat: params.contentFormat,
      contentSha256,
      sourceArtifactId: sourceArtifact.id,
      sourceRefs,
      sourceRefKeys: Object.keys(sourceRefs),
      outputFormat: "pdf",
      converter: "libreoffice",
    },
  });

  return toolDataForContract(toolContractByName(documentToolContracts, "document_create_pdf"), {
    provider: "document-tools",
    sourceFile: documentArtifactSummary(sourceArtifact),
    pdfFile: documentArtifactSummary(pdfArtifact),
    createdAt,
    source: {
      contentFormat: params.contentFormat,
      contentSha256,
      sourceRefKeys: Object.keys(sourceRefs),
    },
  });
}
