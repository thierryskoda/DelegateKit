import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  fileDescribeInputSchema,
  fileDescribeOutputSchema,
  fileExtractDataInputSchema,
  fileExtractDataOutputSchema,
  fileExtractTextInputSchema,
  fileExtractTextOutputSchema,
} from "@ai-assistants/file-analysis-contracts/schemas";
import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";
import {
  toolContractByName,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { z } from "zod";
import { loadProfileFile, sourceFileSummary } from "./artifacts";
import { isImageFile, isPdfFile, isTextLikeFile, requireImageMimeType } from "./file-types";
import { extractPdfEmbeddedText } from "./pdf-text";
import { renderPdfPagesForVision, type VisionImagePart } from "./pdf-vision";
import { boundedText, decodeUtf8Text } from "./text";
import { generateVisionText } from "./openai-vision";

type Warning = { code: string; message: string };

function scannedPdfWarning(): Warning {
  return {
    code: "pdf_no_embedded_text",
    message:
      "This PDF has no deterministic embedded text. Use visual analysis for scanned or image-only PDF content.",
  };
}

async function deterministicTextForFile(input: {
  artifact: Awaited<ReturnType<typeof loadProfileFile>>["artifact"];
  bytes: Uint8Array;
}): Promise<{
  text: string;
  charCount: number;
  truncated: boolean;
  methodUsed: "embedded_text" | "utf8_text";
  warnings: Warning[];
}> {
  if (isPdfFile(input.artifact)) {
    const extracted = await extractPdfEmbeddedText(input.bytes);
    if (!extracted.text) {
      throw new DomainError(
        domainCodes.BAD_REQUEST,
      "PDF file has no deterministic embedded text. Use file_describe or file_extract_data for visual reading of scanned or image-only PDFs.",
        { details: { warnings: [scannedPdfWarning()] } },
      );
    }
    return {
      text: extracted.text,
      charCount: extracted.text.length,
      truncated: extracted.truncated,
      methodUsed: "embedded_text",
      warnings: [
        ...(extracted.truncated
          ? [{ code: "text_truncated", message: "Extracted PDF text was truncated." }]
          : []),
      ],
    };
  }
  if (isTextLikeFile(input.artifact)) {
    const decoded = decodeUtf8Text(input.bytes);
    return {
      ...decoded,
      methodUsed: "utf8_text",
      warnings: decoded.truncated
        ? [{ code: "text_truncated", message: "Extracted text was truncated." }]
        : [],
    };
  }
  throw new DomainError(
    domainCodes.BAD_REQUEST,
    `Profile file ${input.artifact.id} is not a supported deterministic text file.`,
  );
}

async function visualImagesForFile(input: {
  artifact: Awaited<ReturnType<typeof loadProfileFile>>["artifact"];
  bytes: Uint8Array;
}): Promise<{ images: VisionImagePart[]; warnings: Warning[] }> {
  if (isImageFile(input.artifact)) {
    return {
      images: [
        {
          mimeType: requireImageMimeType(input.artifact),
          base64: Buffer.from(input.bytes).toString("base64"),
          label: input.artifact.filename,
        },
      ],
      warnings: [],
    };
  }
  if (isPdfFile(input.artifact)) {
    const rendered = await renderPdfPagesForVision(input.bytes);
    return {
      images: rendered.images,
      warnings: [
        ...(rendered.truncated
          ? [
              {
                code: "pdf_pages_truncated",
                message: `Only the first ${rendered.pagesRendered} of ${rendered.pageCount} PDF pages were visually analyzed.`,
              },
            ]
          : []),
      ],
    };
  }
  throw new DomainError(
    domainCodes.BAD_REQUEST,
    `Profile file ${input.artifact.id} is not a supported visual analysis file.`,
  );
}

async function contextForAnalysis(input: {
  artifact: Awaited<ReturnType<typeof loadProfileFile>>["artifact"];
  bytes: Uint8Array;
}): Promise<{
  textContext: string | null;
  images: VisionImagePart[];
  methodUsed: "embedded_text" | "utf8_text" | "vision" | "hybrid_text_and_vision";
  warnings: Warning[];
}> {
  const warnings: Warning[] = [];
  let textContext: string | null = null;
  if (isPdfFile(input.artifact)) {
    const extracted = await extractPdfEmbeddedText(input.bytes);
    if (extracted.text) {
      const bounded = boundedText(extracted.text);
      textContext = bounded.text;
      if (bounded.truncated || extracted.truncated) {
        warnings.push({ code: "text_truncated", message: "Embedded PDF text was truncated." });
      }
    } else {
      warnings.push(scannedPdfWarning());
    }
  } else if (isTextLikeFile(input.artifact)) {
    const decoded = decodeUtf8Text(input.bytes);
    textContext = decoded.text;
    if (decoded.truncated) warnings.push({ code: "text_truncated", message: "Text was truncated." });
  }

  if (isTextLikeFile(input.artifact) && !isPdfFile(input.artifact)) {
    return { textContext, images: [], methodUsed: "utf8_text", warnings };
  }
  if (isPdfFile(input.artifact) && textContext) {
    const visual = await visualImagesForFile(input);
    return {
      textContext,
      images: visual.images,
      methodUsed: "hybrid_text_and_vision",
      warnings: [...warnings, ...visual.warnings],
    };
  }
  const visual = await visualImagesForFile(input);
  return {
    textContext,
    images: visual.images,
    methodUsed: textContext ? "hybrid_text_and_vision" : "vision",
    warnings: [...warnings, ...visual.warnings],
  };
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/iu, "").replace(/```$/u, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new DomainError(domainCodes.INTERNAL, "File analysis model did not return valid JSON.", {
      cause: error,
      details: { outputPreview: trimmed.slice(0, 2000) },
    });
  }
}

function schemaRecord(schema: unknown, path: string): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new DomainError(domainCodes.BAD_REQUEST, `${path} must be a JSON Schema object.`);
  }
  return schema as Record<string, unknown>;
}

function stringArray(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new DomainError(domainCodes.BAD_REQUEST, `${path} must be an array of strings.`);
  }
  return value;
}

function schemaType(schema: Record<string, unknown>, path: string): string | null {
  const value = schema.type;
  if (value === undefined) return null;
  if (typeof value !== "string") {
    throw new DomainError(domainCodes.BAD_REQUEST, `${path}.type must be a string when provided.`);
  }
  return value;
}

function objectProperties(schema: Record<string, unknown>, path: string): Record<string, unknown> {
  const properties = schema.properties;
  if (properties === undefined) return {};
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    throw new DomainError(domainCodes.BAD_REQUEST, `${path}.properties must be an object.`);
  }
  return properties as Record<string, unknown>;
}

function validateSupportedSchema(schema: unknown, path = "schema"): void {
  const record = schemaRecord(schema, path);
  const type = schemaType(record, path);
  if (
    type !== null &&
    !["object", "array", "string", "number", "integer", "boolean", "null"].includes(type)
  ) {
    throw new DomainError(domainCodes.BAD_REQUEST, `${path}.type is not supported.`);
  }
  stringArray(record.required, `${path}.required`);
  for (const [key, value] of Object.entries(objectProperties(record, path))) {
    validateSupportedSchema(value, `${path}.properties.${key}`);
  }
  if (record.items !== undefined) validateSupportedSchema(record.items, `${path}.items`);
}

function validateDataAgainstSchema(data: unknown, schema: unknown, path = "data"): void {
  const record = schemaRecord(schema, "schema");
  const type = schemaType(record, "schema");
  if (type === "object" || (type === null && record.properties !== undefined)) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new DomainError(domainCodes.INTERNAL, `${path} did not match schema: expected object.`);
    }
    const dataRecord = data as Record<string, unknown>;
    const properties = objectProperties(record, "schema");
    for (const requiredKey of stringArray(record.required, "schema.required")) {
      if (!(requiredKey in dataRecord)) {
        throw new DomainError(
          domainCodes.INTERNAL,
          `${path} did not match schema: missing required field ${requiredKey}.`,
        );
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (dataRecord[key] !== undefined) {
        validateDataAgainstSchema(dataRecord[key], propertySchema, `${path}.${key}`);
      }
    }
    return;
  }
  if (type === "array") {
    if (!Array.isArray(data)) {
      throw new DomainError(domainCodes.INTERNAL, `${path} did not match schema: expected array.`);
    }
    if (record.items !== undefined) {
      data.forEach((item, index) => validateDataAgainstSchema(item, record.items, `${path}[${index}]`));
    }
    return;
  }
  if (type === "string" && typeof data !== "string") {
    throw new DomainError(domainCodes.INTERNAL, `${path} did not match schema: expected string.`);
  }
  if (type === "number" && typeof data !== "number") {
    throw new DomainError(domainCodes.INTERNAL, `${path} did not match schema: expected number.`);
  }
  if (type === "integer" && (!Number.isInteger(data) || typeof data !== "number")) {
    throw new DomainError(domainCodes.INTERNAL, `${path} did not match schema: expected integer.`);
  }
  if (type === "boolean" && typeof data !== "boolean") {
    throw new DomainError(domainCodes.INTERNAL, `${path} did not match schema: expected boolean.`);
  }
  if (type === "null" && data !== null) {
    throw new DomainError(domainCodes.INTERNAL, `${path} did not match schema: expected null.`);
  }
}

export async function fileExtractTextTool(
  db: SupabaseServiceClient,
  profileId: string,
  rawParams: Record<string, unknown>,
): Promise<BackendToolResult<z.infer<typeof fileExtractTextOutputSchema>>> {
  const params = fileExtractTextInputSchema.parse(rawParams);
  const source = await loadProfileFile(db, {
    profileId,
    profileFileId: params.profileFileId,
    expectedSha256: params.expectedSha256,
  });
  const extracted = await deterministicTextForFile(source);
  return toolDataForContract(toolContractByName(fileAnalysisToolContracts, "file_extract_text"), {
    provider: "file-analysis",
    sourceFile: sourceFileSummary(source.artifact),
    extractedAt: new Date().toISOString(),
    methodUsed: extracted.methodUsed,
    content: {
      text: extracted.text,
      charCount: extracted.charCount,
      truncated: extracted.truncated,
    },
    warnings: extracted.warnings,
  });
}

export async function fileDescribeTool(
  db: SupabaseServiceClient,
  profileId: string,
  rawParams: Record<string, unknown>,
): Promise<BackendToolResult<z.infer<typeof fileDescribeOutputSchema>>> {
  const params = fileDescribeInputSchema.parse(rawParams);
  const source = await loadProfileFile(db, {
    profileId,
    profileFileId: params.profileFileId,
    expectedSha256: params.expectedSha256,
  });
  const context = await contextForAnalysis(source);
  const answer = await generateVisionText({
    responseKind: "text",
    images: context.images,
    instructions:
      "Analyze the supplied saved file evidence. Answer the user's question concisely. Do not mention internal tool names, storage ids, hashes, or implementation details.",
    prompt: [
      `Question: ${params.question}`,
      context.textContext ? `Embedded text context:\n${context.textContext}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  return toolDataForContract(toolContractByName(fileAnalysisToolContracts, "file_describe"), {
    provider: "file-analysis",
    sourceFile: sourceFileSummary(source.artifact),
    analyzedAt: new Date().toISOString(),
    methodUsed: context.methodUsed,
    answer,
    evidence:
      context.methodUsed === "hybrid_text_and_vision"
        ? "Answer is based on embedded text plus rendered visual evidence from the saved file."
        : context.methodUsed === "embedded_text" || context.methodUsed === "utf8_text"
          ? "Answer is based on deterministic text extracted from the saved file."
        : "Answer is based on rendered visual evidence from the saved file.",
    warnings: context.warnings,
  });
}

export async function fileExtractDataTool(
  db: SupabaseServiceClient,
  profileId: string,
  rawParams: Record<string, unknown>,
): Promise<BackendToolResult<z.infer<typeof fileExtractDataOutputSchema>>> {
  const params = fileExtractDataInputSchema.parse(rawParams);
  validateSupportedSchema(params.schema);
  const source = await loadProfileFile(db, {
    profileId,
    profileFileId: params.profileFileId,
    expectedSha256: params.expectedSha256,
  });
  const context = await contextForAnalysis(source);
  const rawJson = await generateVisionText({
    responseKind: "json",
    images: context.images,
    instructions:
      "Extract structured data from the supplied saved file evidence. Return only one JSON object. Do not include markdown.",
    prompt: [
      `Extraction instructions:\n${params.instructions}`,
      `Required JSON shape:\n${JSON.stringify(params.schema, null, 2)}`,
      context.textContext ? `Embedded text context:\n${context.textContext}` : null,
      "Return JSON with two top-level keys: data and evidence. data must follow the requested shape. evidence must be a short string explaining where the values came from.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  const parsed = parseJsonObject(rawJson);
  const parsedRecord =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  if (!parsedRecord || !("data" in parsedRecord)) {
    throw new DomainError(domainCodes.INTERNAL, "File analysis model JSON did not include data.");
  }
  validateDataAgainstSchema(parsedRecord.data, params.schema);
  return toolDataForContract(toolContractByName(fileAnalysisToolContracts, "file_extract_data"), {
    provider: "file-analysis",
    sourceFile: sourceFileSummary(source.artifact),
    analyzedAt: new Date().toISOString(),
    methodUsed: context.methodUsed,
    data: parsedRecord.data,
    evidence:
      typeof parsedRecord.evidence === "string"
        ? parsedRecord.evidence
        : "Extracted from saved file evidence.",
    warnings: context.warnings,
  });
}
