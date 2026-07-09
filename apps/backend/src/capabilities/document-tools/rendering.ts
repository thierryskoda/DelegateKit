import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import { jsonScalarSchema } from "./schemas";
import { defaultDocumentPdfConverter, type DocumentPdfConverter } from "./pdf-converter";

export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME_TYPE = "application/pdf";

type RenderedDocument = {
  docx: { bytes: Uint8Array; mimeType: typeof DOCX_MIME_TYPE };
  pdf: { bytes: Uint8Array; mimeType: typeof PDF_MIME_TYPE };
  templateFieldKeys: string[];
  boldSignTextTags: BoldSignTextTag[];
};

type BoldSignTextTag = {
  raw: string;
  fieldType: string;
  signerIndex: number | null;
  isRequired: boolean;
  fieldId: string | null;
  definitionId: string | null;
};

export type DocumentRenderer = {
  render(input: {
    templateBytes: Uint8Array;
    fields: Record<string, z.infer<typeof jsonScalarSchema>>;
  }): Promise<RenderedDocument>;
};

export function cleanFilename(value: string): string {
  const filename = value
    .replace(/[/:\\\0]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!filename)
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Document render output filename resolved to an empty value.",
    );
  return filename;
}

type DocxtemplaterTags = {
  document?: { tags?: Record<string, unknown> };
  headers?: Array<{ tags?: Record<string, unknown> }>;
  footers?: Array<{ tags?: Record<string, unknown> }>;
};

type DocxtemplaterWithTags = {
  getTags(): unknown;
};

function collectTagKeys(tags: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tags)) {
    const path = prefix ? `${prefix}.${key}` : key;
    keys.push(path);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectTagKeys(value as Record<string, unknown>, path));
    }
  }
  return keys;
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function extractTemplateFieldKeys(document: Docxtemplater): string[] {
  const tags = (document as unknown as DocxtemplaterWithTags).getTags() as DocxtemplaterTags;
  const keys = [
    ...collectTagKeys(tags.document?.tags ?? {}),
    ...(tags.headers ?? []).flatMap((header) => collectTagKeys(header.tags ?? {})),
    ...(tags.footers ?? []).flatMap((footer) => collectTagKeys(footer.tags ?? {})),
  ];
  return uniqueSorted(keys);
}

const wordContentXmlPattern = /^word\/(?:document|header\d+|footer\d+)\.xml$/u;
const boldSignTextTagPattern =
  /\{\{(?:@([a-zA-Z][a-zA-Z0-9_.-]*)(?::[^{}|]+)?(?:\|[^{}]*)?|(text|sign|init|date|editdate|title|company)(\|[^{}]*)?)\}\}/giu;

const boldSignDefinitionTags = {
  clientsig: {
    fieldType: "sign",
    signerIndex: 1,
    isRequired: true,
    fieldId: "client_signature",
  },
  clientdate: {
    fieldType: "date",
    signerIndex: 1,
    isRequired: true,
    fieldId: "client_signed_date",
  },
} as const satisfies Record<
  string,
  {
    fieldType: string;
    signerIndex: number;
    isRequired: boolean;
    fieldId: string;
  }
>;

function parseBoldSignTextTag(raw: string): BoldSignTextTag {
  const inner = raw.slice(2, -2);
  if (inner.startsWith("@")) {
    const definitionId = inner
      .slice(1)
      .split(":", 1)[0]
      ?.split("|", 1)[0]
      ?.trim();
    const normalizedDefinitionId = definitionId?.toLowerCase();
    const knownDefinition =
      normalizedDefinitionId && normalizedDefinitionId in boldSignDefinitionTags
        ? boldSignDefinitionTags[normalizedDefinitionId as keyof typeof boldSignDefinitionTags]
        : null;
    return {
      raw,
      fieldType: knownDefinition?.fieldType ?? "definition",
      signerIndex: knownDefinition?.signerIndex ?? null,
      isRequired: knownDefinition?.isRequired ?? true,
      fieldId: knownDefinition?.fieldId ?? null,
      definitionId: definitionId || null,
    };
  }

  const [fieldTypeRaw = "", signerIndexRaw = "", requiredRaw = "", _label = "", fieldIdRaw = ""] =
    inner.split("|");
  const signerIndex = Number(signerIndexRaw);
  return {
    raw,
    fieldType: fieldTypeRaw.trim().toLowerCase(),
    signerIndex: Number.isInteger(signerIndex) && signerIndex > 0 ? signerIndex : null,
    isRequired: requiredRaw.trim() === "*" || requiredRaw === " ",
    fieldId: fieldIdRaw.trim() || null,
    definitionId: null,
  };
}

function protectBoldSignTextTags(zip: PizZip): BoldSignTextTag[] {
  const textTags: BoldSignTextTag[] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir || !wordContentXmlPattern.test(path)) continue;
    const xml = file.asText();
    const protectedXml = xml.replace(boldSignTextTagPattern, (raw: string) => {
      const token = `__AI_ASSISTANTS_BOLDSIGN_TEXT_TAG_${textTags.length}__`;
      textTags.push(parseBoldSignTextTag(raw));
      return token;
    });
    if (protectedXml !== xml) zip.file(path, protectedXml);
  }

  return textTags;
}

function restoreBoldSignTextTags(zip: PizZip, textTags: readonly BoldSignTextTag[]): void {
  if (textTags.length === 0) return;

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir || !wordContentXmlPattern.test(path)) continue;
    let xml = file.asText();
    for (const [index, tag] of textTags.entries()) {
      xml = xml.split(`__AI_ASSISTANTS_BOLDSIGN_TEXT_TAG_${index}__`).join(tag.raw);
    }
    zip.file(path, xml);
  }
}

function assertTemplateFieldsMatchInput(input: {
  templateFieldKeys: readonly string[];
  providedFieldKeys: readonly string[];
}): void {
  const templateFields = new Set(input.templateFieldKeys);
  const providedFields = new Set(input.providedFieldKeys);
  const missingFieldValues = input.templateFieldKeys.filter((key) => !providedFields.has(key));
  const unknownFieldValues = input.providedFieldKeys.filter((key) => !templateFields.has(key));

  if (input.templateFieldKeys.length === 0) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "DOCX template contains no supported template fields. Use Docxtemplater tags such as {client_name}.",
      {
        details: {
          templateFieldKeys: input.templateFieldKeys,
          providedFieldKeys: input.providedFieldKeys,
        },
      },
    );
  }

  if (missingFieldValues.length > 0 || unknownFieldValues.length > 0) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      [
        "DOCX template fields do not match provided field values.",
        missingFieldValues.length > 0
          ? `Missing values for template fields: ${missingFieldValues.join(", ")}.`
          : null,
        unknownFieldValues.length > 0
          ? `Provided fields not found in template: ${unknownFieldValues.join(", ")}.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      {
        details: {
          templateFieldKeys: input.templateFieldKeys,
          providedFieldKeys: input.providedFieldKeys,
          missingFieldValues,
          unknownFieldValues,
        },
      },
    );
  }
}



function createDocxDocumentRenderer(
  converter: DocumentPdfConverter = defaultDocumentPdfConverter,
): DocumentRenderer {
  return {
    async render({ templateBytes, fields }) {
      let zip: PizZip;
      try {
        zip = new PizZip(Buffer.from(templateBytes));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `Template artifact is not a readable DOCX file: ${message}`,
        );
      }

      let document: Docxtemplater;
      let templateFieldKeys: string[];
      let boldSignTextTags: BoldSignTextTag[];
      try {
        boldSignTextTags = protectBoldSignTextTags(zip);
        document = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
        templateFieldKeys = extractTemplateFieldKeys(document);
        const providedFieldKeys = uniqueSorted(Object.keys(fields));
        assertTemplateFieldsMatchInput({ templateFieldKeys, providedFieldKeys });
        document.render(fields);
        restoreBoldSignTextTags(document.getZip(), boldSignTextTags);
      } catch (error) {
        if (error instanceof DomainError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `DOCX template rendering failed: ${message}`,
        );
      }

      const docxBytes = new Uint8Array(document.getZip().generate({ type: "nodebuffer" }));
      const pdfBytes = await converter.convert(docxBytes, ".docx");
      return {
        docx: { bytes: docxBytes, mimeType: DOCX_MIME_TYPE },
        pdf: { bytes: pdfBytes, mimeType: PDF_MIME_TYPE },
        templateFieldKeys,
        boldSignTextTags,
      };
    },
  };
}

export const defaultDocumentRenderer = createDocxDocumentRenderer();
