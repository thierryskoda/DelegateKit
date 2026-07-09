import { stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

const sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i)
  .describe("Expected SHA-256 hex digest for stale-file protection.");

export const profileFileIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe("Durable profile file id.");

export const fileAnalysisSourceFileSchema = z
  .object({
    profileFileId: profileFileIdSchema,
    filename: z.string().min(1).describe("Original or stored filename for the analyzed profile file."),
    mimeType: z.string().nullable().describe("Stored MIME type, or null when unavailable."),
    byteSize: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe("Stored file size in bytes, or null when unavailable."),
    sha256: sha256HexSchema.nullable().describe("Stored SHA-256 hex digest, or null when unavailable."),
    createdAt: z.string().describe("ISO timestamp when the profile file was saved."),
  })
  .describe("Durable profile file metadata for the analyzed source.")
  .strict();

export const fileAnalysisMethodUsedSchema = z
  .enum(["embedded_text", "utf8_text", "vision", "hybrid_text_and_vision"])
  .describe("Extraction method used internally for this analysis result.");

export const fileAnalysisWarningSchema = z
  .object({
    code: z.string().min(1).describe("Stable warning code."),
    message: z.string().min(1).describe("Human-readable warning message."),
  })
  .describe("Non-fatal warning about extraction quality, truncation, or unsupported content.")
  .strict();

export const fileExtractTextInputSchema = z
  .object({
    profileFileId: profileFileIdSchema,
    expectedSha256: sha256HexSchema,
  })
  .strict();

export const fileExtractTextOutputSchema = z
  .object({
    provider: z.literal("file-analysis").describe("Provider that produced this result."),
    sourceFile: fileAnalysisSourceFileSchema.describe("Durable profile file metadata for the analyzed source."),
    extractedAt: z.string().describe("ISO timestamp when text extraction ran."),
    methodUsed: fileAnalysisMethodUsedSchema,
    content: z
      .object({
        text: z.string().describe("Extracted text content."),
        charCount: z.number().int().nonnegative().describe("Character count of the returned text."),
        truncated: z.boolean().describe("Whether returned text was truncated to the tool limit."),
      })
      .strict()
      .describe("Extracted text payload."),
    warnings: z.array(fileAnalysisWarningSchema).describe("Non-fatal extraction warnings."),
  })
  .strict();

export const fileDescribeInputSchema = z
  .object({
    profileFileId: profileFileIdSchema,
    expectedSha256: sha256HexSchema,
    question: stringField("Question or description request to answer from the file content.")
      .max(4000)
      .default("Describe the file and note any visible details relevant to the current request."),
  })
  .strict();

export const fileDescribeOutputSchema = z
  .object({
    provider: z.literal("file-analysis").describe("Provider that produced this result."),
    sourceFile: fileAnalysisSourceFileSchema.describe("Durable profile file metadata for the analyzed source."),
    analyzedAt: z.string().describe("ISO timestamp when file description ran."),
    methodUsed: fileAnalysisMethodUsedSchema,
    answer: z.string().min(1).describe("Answer to the requested file description question."),
    evidence: z
      .string()
      .min(1)
      .describe("Brief evidence summary supporting the answer without exposing raw internal refs."),
    warnings: z.array(fileAnalysisWarningSchema).describe("Non-fatal analysis warnings."),
  })
  .strict();

export const fileExtractDataInputSchema = z
  .object({
    profileFileId: profileFileIdSchema,
    expectedSha256: sha256HexSchema,
    instructions: stringField("Specific structured data extraction instructions.").max(8000),
    schema: z
      .record(z.string(), z.unknown())
      .describe("JSON Schema-like object describing the exact structured data to return."),
  })
  .strict();

export const fileExtractDataOutputSchema = z
  .object({
    provider: z.literal("file-analysis").describe("Provider that produced this result."),
    sourceFile: fileAnalysisSourceFileSchema.describe("Durable profile file metadata for the analyzed source."),
    analyzedAt: z.string().describe("ISO timestamp when structured extraction ran."),
    methodUsed: fileAnalysisMethodUsedSchema,
    data: z.unknown().describe("Structured data extracted according to the requested schema."),
    evidence: z
      .string()
      .min(1)
      .describe("Brief evidence summary supporting the extracted data without exposing raw internal refs."),
    warnings: z.array(fileAnalysisWarningSchema).describe("Non-fatal extraction warnings."),
  })
  .strict();
