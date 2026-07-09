import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";
import { profileFileToolContracts } from "@ai-assistants/profile-files-contracts/contracts";

export default definePluginGuidance({
  name: "document_tools",
  plugin: plugin("document-tools"),
  allowedPlugins: [plugin("file-analysis"), plugin("profile-files")],
  references: [
    tool(profileFileToolContracts, "profile_file_send"),
    tool(fileAnalysisToolContracts, "file_extract_text"),
    tool(fileAnalysisToolContracts, "file_describe"),
  ],
  description:
    "Load when the user needs a PDF created from text/HTML/Markdown, a PDF visually previewed, a document converted to PDF, or a DOCX template rendered into DOCX/PDF artifacts.",
  body: md`
# Document Tools

Use document tools to create PDFs, preview PDFs, convert existing documents, or render explicit DOCX template fields.

- Use ${tool(documentToolContracts, "document_create_pdf")} when explicit plain text, Markdown, or safe self-contained HTML should become a durable PDF artifact.
- Use \`contentFormat="markdown"\` for structured reports, morning briefings, summaries, and mobile-readable archived documents.
- Use \`contentFormat="plain_text"\` when preserving source text matters, such as email-body invoices.
- Use \`contentFormat="html"\` only when you already have safe self-contained HTML.
- To revise a created PDF, retrieve the editable source with ${tool(documentToolContracts, "document_source_get")}, edit it, then call ${tool(documentToolContracts, "document_create_pdf")} again. Do not edit PDF bytes directly.
- Use ${tool(fileAnalysisToolContracts, "file_extract_text")} to read or check deterministic PDF text content.
- Use ${tool(fileAnalysisToolContracts, "file_describe")} when visual layout, signatures, scanned PDFs, or appearance checks matter.
- Use ${tool(documentToolContracts, "document_pdf_preview_create")} before filing, sending, or regenerating when visual layout matters.
- A PDF preview is an image artifact, not the PDF. If the user asks to receive, review, sign, send, or attach the PDF, deliver the rendered or converted PDF profile file with ${tool(profileFileToolContracts, "profile_file_send")}; do not substitute a preview PNG for the requested PDF.
- Use ${tool(documentToolContracts, "document_template_render")} only for existing DOCX template artifacts with explicit field values.
- When the source is an existing DOCX template or the user mentions placeholders/template fields, save or retrieve the template artifact and use ${tool(documentToolContracts, "document_template_render")}; do not rebuild it with ${tool(documentToolContracts, "document_create_pdf")}.
- Use ${tool(documentToolContracts, "document_convert_to_pdf")} only for converting an existing non-template document artifact.
- Do not quote raw template placeholders or signing markers such as \`{{@clientSig}}\`, \`{{@clientDate}}\`, \`{client_name}\`, or similar syntax in client-visible replies. Describe them in client language, such as "client signature field" or "client date field".
- For successful document creation, rendering, conversion, preview, and verification workflows, avoid sending visible interim progress messages. Do the work, then send one concise final reply or caption.
- When file-analysis tools were used to verify a generated PDF, the final reply should plainly say the generated PDF was verified and summarize only the user-relevant result.
- For successful render, conversion, preview, or PDF-verification work, do not use failure markers or failure wording such as \`❌\`, "failed", or "blocked" in the client-visible reply. Reserve failure markers for actual blockers found in the current evidence.
- Do not introduce e-signature guidance, signing next steps, or signing-readiness caveats for a generated or verified document unless the user asked to send it for signature, asked about signature fields, or current evidence shows a signing blocker for the requested action.
- Do not write raw file ids, hashes, local paths, delivery URLs, media references, or internal file references in client-visible text.
- If the user asked to receive the file, call ${tool(profileFileToolContracts, "profile_file_send")} with the generated profile file id and a short caption. Do not use a final text-only answer to deliver attachments.
- If the user did not ask to receive the file, confirm in plain language without artifact metadata.
- Client guidance owns workflow instructions, required fields, source selection, review rules, and external follow-up steps.

${coveredToolCatalog(documentToolContracts, {
  document_create_pdf: true,
  document_source_get: true,
  document_pdf_preview_create: true,
  document_template_render: true,
  document_convert_to_pdf: true,
})}
`,
});
