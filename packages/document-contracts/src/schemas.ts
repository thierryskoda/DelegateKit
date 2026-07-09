import { stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const documentJsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const documentTemplateFieldValuesSchema = z.record(
  z.string().trim().min(1),
  documentJsonScalarSchema,
);

export const documentTemplateSourceRefsSchema = z.record(z.string().trim().min(1), z.unknown());

export const documentCreatePdfContentFormatSchema = z.enum(["plain_text", "html", "markdown"]);

const sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .describe("Expected SHA-256 hex digest for stale-file protection.");

export const documentCreatePdfInputSchema = z
  .object({
    contentFormat: documentCreatePdfContentFormatSchema.describe(
      "Source content format to render into a PDF.",
    ),
    content: z
      .string()
      .trim()
      .min(1)
      .max(500_000)
      .describe("Plain text, Markdown, or safe self-contained HTML content to render into a PDF."),
    filename: stringField("Output PDF filename. .pdf is added when omitted."),
    title: stringField("Optional document title for PDF metadata/description.").optional(),
    description: stringField("Optional durable profile-file description.").optional(),
    sourceRefs: documentTemplateSourceRefsSchema
      .optional()
      .describe("Optional caller-supplied provenance for the source content."),
  })
  .strict();

export const documentProfileFileSummarySchema = z
  .object({
    profileFileId: z
      .string()
      .min(1)
      .describe("Durable profile file id for this document file.")
      .meta({ examples: ["550e8400-e29b-41d4-a716-446655440000"] }),
    filename: z
      .string()
      .min(1)
      .describe("Profile file filename including extension.")
      .meta({ examples: ["rendered-document.pdf"] }),
    artifactType: z
      .string()
      .min(1)
      .describe("Internal document file kind, such as source, docx, pdf, or preview."),
    mimeType: z
      .string()
      .nullable()
      .describe("MIME type of the profile file.")
      .meta({ examples: ["application/pdf"] }),
    byteSize: z.number().nullable().describe("Profile file size in bytes, when known."),
    sha256: z
      .string()
      .nullable()
      .describe("SHA-256 hex digest for stale-artifact protection, when known.")
      .meta({
        examples: ["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
      }),
    createdAt: z
      .string()
      .describe("Timestamp when the profile file was created.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
  })
  .strict()
  .describe("Generated or source document profile file summary.");

export const documentTemplateRenderInputSchema = z
  .object({
    templateProfileFileId: stringField(
      "Profile file id for the DOCX template to render. Use this exact field name.",
    ),
    fieldValues: documentTemplateFieldValuesSchema.describe(
      "Explicit replacement values supplied by the assistant from user input, provider reads, or file evidence. Use this exact field name, not fields or values.",
    ),
    outputFilename: stringField(
      "Optional output filename for the generated PDF; .pdf is added when omitted.",
    ).optional(),
    sourceRefs: documentTemplateSourceRefsSchema
      .optional()
      .describe(
        "Optional caller-supplied provenance for field values; document tools do not fetch these sources.",
      ),
  })
  .strict();

export const documentTemplateRenderOutputSchema = z
  .object({
    provider: z
      .literal("document-tools")
      .describe("Provider/tool surface that rendered the document."),
    template: documentProfileFileSummarySchema.describe("Template profile file used for rendering."),
    files: z
      .object({
        docx: documentProfileFileSummarySchema.describe("Generated DOCX profile file."),
        pdf: documentProfileFileSummarySchema.describe("Generated PDF profile file."),
      })
      .strict()
      .describe("Profile files created by the render operation."),
    render: z
      .object({
        renderedAt: z
          .string()
          .describe("Timestamp when the document was rendered.")
          .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
        fieldKeys: z.array(z.string().min(1)).describe("Template field keys populated."),
        templateFieldKeys: z
          .array(z.string().min(1))
          .describe("Template field keys found in the DOCX before rendering."),
        sourceRefKeys: z
          .array(z.string().min(1))
          .describe("Source reference keys supplied for provenance."),
        boldSignTextTags: z
          .array(
            z
              .object({
                raw: z
                  .string()
                  .min(1)
                  .describe(
                    "Internal signing marker text preserved from the DOCX template. Never show this raw marker in client-visible replies.",
                  ),
                fieldType: z
                  .string()
                  .min(1)
                  .describe("Signing field kind represented by the marker, such as sign or date."),
                signerIndex: z
                  .number()
                  .int()
                  .positive()
                  .nullable()
                  .describe(
                    "One-based signer index targeted by the marker, when encoded.",
                  ),
                isRequired: z
                  .boolean()
                  .describe("Whether the BoldSign marker requires signer input before completion."),
                fieldId: z
                  .string()
                  .min(1)
                  .nullable()
                  .describe("Stable field id encoded by the BoldSign marker, when provided."),
                definitionId: z
                  .string()
                  .min(1)
                  .nullable()
                  .describe(
                    "Internal signing definition id, such as clientSig or clientDate, when the marker uses a definition tag. Never show this id in client-visible replies.",
                  ),
              })
              .strict(),
          )
          .describe(
            "Internal signing tags preserved in the rendered document for signature placement. Use this metadata for tool calls and verification, but describe it to clients only as signature fields being ready or configured.",
          ),
      })
      .strict()
      .describe("Render metadata for the document generation."),
  })
  .strict();

export const documentCreatePdfOutputSchema = z
  .object({
    provider: z.literal("document-tools").describe("Provider/tool surface that created the PDF."),
    sourceFile: documentProfileFileSummarySchema.describe(
      "Editable source profile file used to generate the PDF.",
    ),
    pdfFile: documentProfileFileSummarySchema.describe("Generated PDF profile file."),
    createdAt: z
      .string()
      .describe("Timestamp when the PDF was created.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    source: z
      .object({
        contentFormat: documentCreatePdfContentFormatSchema.describe("Source content format."),
        contentSha256: sha256HexSchema.describe("SHA-256 hex digest of the source content."),
        sourceRefKeys: z.array(z.string().min(1)).describe("Source reference keys supplied."),
      })
      .strict()
      .describe("Source content provenance and hash metadata."),
  })
  .strict();

export const documentSourceGetInputSchema = z
  .object({
    sourceProfileFileId: stringField(
      "Source profile file id returned by document_create_pdf. Use this exact field name.",
    ),
    expectedSha256: sha256HexSchema.describe(
      "Expected SHA-256 from the source file summary or document_create_pdf source.contentSha256.",
    ),
  })
  .strict();

export const documentSourceGetOutputSchema = z
  .object({
    provider: z
      .literal("document-tools")
      .describe("Provider/tool surface that retrieved the source."),
    sourceFile: documentProfileFileSummarySchema.describe("Editable source profile file retrieved."),
    retrievedAt: z
      .string()
      .describe("Timestamp when the source content was retrieved.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    source: z
      .object({
        contentFormat: documentCreatePdfContentFormatSchema.describe("Editable source format."),
        content: z
          .string()
          .min(1)
          .max(500_000)
          .describe("Editable UTF-8 source content for revision and regeneration."),
        contentSha256: sha256HexSchema.describe(
          "SHA-256 hex digest of the returned source content.",
        ),
      })
      .strict()
      .describe("Retrieved editable source content."),
  })
  .strict();

export const documentPdfPreviewPageSelectionSchema = z
  .object({
    kind: z.literal("first_page").describe("Render only the first PDF page."),
  })
  .strict();

export const documentPdfPreviewCreateInputSchema = z
  .object({
    pdfProfileFileId: stringField(
      "PDF profile file id to preview. Use this exact field name.",
    ),
    expectedSha256: sha256HexSchema.describe("Expected SHA-256 from the PDF profile file summary."),
    pageSelection: documentPdfPreviewPageSelectionSchema
      .describe("Optional preview page selection. v1 supports first_page only.")
      .default({ kind: "first_page" }),
  })
  .strict();

export const documentPdfPreviewCreateOutputSchema = z
  .object({
    provider: z
      .literal("document-tools")
      .describe("Provider/tool surface that created the preview."),
    sourcePdfFile: documentProfileFileSummarySchema.describe("PDF profile file used for preview."),
    previewFile: documentProfileFileSummarySchema.describe("Generated PNG preview profile file."),
    createdAt: z
      .string()
      .describe("Timestamp when the preview profile file was created.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    preview: z
      .object({
        pageSelection: documentPdfPreviewPageSelectionSchema.describe(
          "Preview page selection used.",
        ),
        pageNumber: z.number().int().positive().describe("One-based PDF page number rendered."),
        widthPx: z.number().int().positive().describe("Preview image width in pixels."),
        heightPx: z.number().int().positive().describe("Preview image height in pixels."),
        sourcePdfSha256: sha256HexSchema.describe("SHA-256 hex digest of the previewed PDF bytes."),
        renderer: z.literal("pdfjs").describe("Backend PDF preview renderer used."),
      })
      .strict()
      .describe("Preview rendering metadata."),
  })
  .strict();

export const documentConvertToPdfInputSchema = z
  .object({
    profileFileId: stringField("Profile file id for the document to convert to PDF."),
  })
  .strict();

export const documentConvertToPdfOutputSchema = z
  .object({
    provider: z
      .literal("document-tools")
      .describe("Provider/tool surface that converted the document."),
    sourceFile: documentProfileFileSummarySchema.describe("Original document profile file."),
    pdfFile: documentProfileFileSummarySchema.describe("Generated PDF profile file."),
    convertedAt: z
      .string()
      .describe("Timestamp when the document was converted.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
  })
  .strict();
