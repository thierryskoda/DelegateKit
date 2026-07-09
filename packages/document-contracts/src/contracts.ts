import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  type ToolContract,
  writeToolDescription,
} from "@ai-assistants/tool-contracts";
import { DOCUMENT_TOOLS_PLUGIN_ID } from "./constants";
import {
  documentCreatePdfInputSchema,
  documentCreatePdfOutputSchema,
  documentConvertToPdfInputSchema,
  documentConvertToPdfOutputSchema,
  documentPdfPreviewCreateInputSchema,
  documentPdfPreviewCreateOutputSchema,
  documentSourceGetInputSchema,
  documentSourceGetOutputSchema,
  documentTemplateRenderInputSchema,
  documentTemplateRenderOutputSchema,
} from "./schemas";

export const documentToolContracts = [
  defineWriteTool({
    name: "document_create_pdf",
    pluginId: DOCUMENT_TOOLS_PLUGIN_ID,
    label: "Create PDF Document",
    description: writeToolDescription({
      useWhen:
        "plain text, Markdown, or safe self-contained HTML content needs to become a durable PDF profile file, such as an email body, invoice text, report, note, or assistant-authored document",
      operation:
        "Creates a new internal PDF profile file from explicit plain text, Markdown, or safe HTML content",
      returns:
        "editable source file metadata, generated PDF file metadata, creation timestamp, and source content hash/provenance",
      notes: [
        "Use contentFormat=markdown for structured reports, contentFormat=plain_text for ordinary source-preserving text, and contentFormat=html only for self-contained HTML with no scripts or remote resources",
        "Keep the returned sourceFile when the PDF may need revision; retrieve that source with document_source_get, edit the source, then call document_create_pdf again",
        "Use document_template_render for existing DOCX templates and document_convert_to_pdf for existing document profile files",
      ],
      sideEffect: "creates a new internal editable source profile file and PDF profile file",
      safety:
        "the content, output filename, and source provenance must be clear to the assistant; optional sourceRefs can record provenance. Unsafe HTML is rejected instead of fetched or executed",
    }),
    inputSchema: documentCreatePdfInputSchema,
    outputSchema: documentCreatePdfOutputSchema,
  }),
  defineReadTool({
    name: "document_source_get",
    pluginId: DOCUMENT_TOOLS_PLUGIN_ID,
    label: "Get Document Source",
    description: readToolDescription({
      useWhen:
        "an editable source profile file returned by document_create_pdf needs to be retrieved so the assistant can revise and regenerate the PDF",
      operation:
        "Loads a profile-owned editable source artifact and returns its bounded UTF-8 plain text, Markdown, or HTML content",
      returns:
        "source file metadata, source content format, source content, and source content hash",
      notes: [
        "Use this instead of trying to mutate an existing PDF artifact",
        "After revising the returned content, call document_create_pdf again to create a new source/PDF pair",
      ],
    }),
    inputSchema: documentSourceGetInputSchema,
    outputSchema: documentSourceGetOutputSchema,
  }),
  defineWriteTool({
    name: "document_pdf_preview_create",
    pluginId: DOCUMENT_TOOLS_PLUGIN_ID,
    label: "Create PDF Preview",
    description: writeToolDescription({
      useWhen:
        "a PDF profile file needs visual inspection before sending, filing, or regenerating from source",
      operation:
        "Creates a PNG preview profile file for the first page of a profile-owned PDF file",
      returns:
        "source PDF file metadata, generated PNG preview file metadata, and preview dimensions",
      notes: [
        "Use this to inspect PDF layout; pass the PDF profile file id as pdfProfileFileId",
        "Use document_source_get plus document_create_pdf for revisions",
        "v1 supports pageSelection.kind=first_page only",
      ],
      sideEffect: "creates a new internal PNG preview profile file",
      safety:
        "requires the expected PDF hash and rejects missing, cross-profile, non-PDF, or stale artifacts",
    }),
    inputSchema: documentPdfPreviewCreateInputSchema,
    outputSchema: documentPdfPreviewCreateOutputSchema,
  }),
  defineWriteTool({
    name: "document_template_render",
    pluginId: DOCUMENT_TOOLS_PLUGIN_ID,
    label: "Render Document Template",
    description: writeToolDescription({
      useWhen:
        "an existing DOCX template profile file must be filled/rendered with explicit field values; use this for templates with placeholders, not document_convert_to_pdf",
      operation: "Renders the template into new internal DOCX and PDF profile files",
      returns:
        "rendered file metadata and safe failure details; if provided fields and template fields do not match, the error lists the template keys, missing values, and unknown provided values",
      notes: [
        "Input fields are templateProfileFileId and fieldValues; do not call this tool with profileFileId, fields, templateId, or values",
        "Before saying all placeholders were replaced, verify the result through the returned template field coverage or call file_extract_text on the returned PDF profile file when text-level PDF verification is needed",
        "If render metadata includes signing tags, treat them as internal signing-field placement metadata. In client-visible replies, say the signature fields are ready or configured; do not mention BoldSign, text tags, raw marker syntax, or definition ids unless the user explicitly asks for implementation details.",
      ],
      sideEffect: "creates new internal DOCX and PDF profile files",
      safety:
        "the template artifact and all field values must be explicit because this does not fetch source data by itself or send files",
    }),
    inputSchema: documentTemplateRenderInputSchema,
    outputSchema: documentTemplateRenderOutputSchema,
  }),
  defineWriteTool({
    name: "document_convert_to_pdf",
    pluginId: DOCUMENT_TOOLS_PLUGIN_ID,
    label: "Convert Document to PDF",
    description: writeToolDescription({
      useWhen:
        "a complete non-template document profile file needs to be converted to a PDF. Do not use this to fill/render templates or replace fields; use document_template_render for that. Supported formats: .docx, .doc, .odt, .rtf, .xlsx, .xls, .csv, .pptx, .ppt, .txt.",
      operation: "Converts the provided document profile file into a new PDF profile file",
      returns: "metadata for the original and newly generated PDF profile files",
      sideEffect: "creates a new internal PDF profile file",
      safety:
        "the source profile file must be a non-PDF file in one of the explicitly supported formats; never use this to inspect, fill, validate, or preview an unrendered template",
    }),
    inputSchema: documentConvertToPdfInputSchema,
    outputSchema: documentConvertToPdfOutputSchema,
  }),
] as const satisfies readonly ToolContract[];

export type DocumentToolName = (typeof documentToolContracts)[number]["name"];
