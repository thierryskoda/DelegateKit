import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { requireSupabaseData, type TableRow } from "@ai-assistants/control-db";
import {
  documentToolContracts,
  type DocumentToolName,
} from "@ai-assistants/document-contracts/contracts";
import { useE2eDb } from "../helpers/db/e2e-db";
import {
  cleanupDocumentTemplateArtifact,
  cleanupRenderedDocumentArtifacts,
  seedDocumentArtifact,
  seedDocumentTemplateArtifact,
} from "../helpers/fixtures/document-render-fixture";
import { downloadArtifactBytes } from "../../../apps/backend/src/test-support/capabilities/document-tools";
import {
  clientEmailForMarker,
  clientFullName,
  TESTING_FIXTURE_CLIENT,
} from "../helpers/test-data/testing-realistic-data";
import { createCapabilityToolCoverage } from "../helpers/capability/capability-tool-coverage";
import { E2E_TEST_CHANNEL_DEFAULT_PEER_ID } from "../helpers/run/e2e-run";
import { seedTestingTrustedE2eChannel } from "../helpers/fixtures/testing-trusted-channel-fixture";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import {
  buildCapabilityToolRequest,
  withTrustedChannel,
  executeCapabilityTool,
  parseCapabilityToolOutput,
} from "../helpers/run/execute-capability-backend-tool";
import { startBackend } from "../helpers/processes/start-backend";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import PizZip from "pizzip";

const CAPABILITY_ID = "document-tools";
const coverage = createCapabilityToolCoverage(CAPABILITY_ID, documentToolContracts);
const CREATE_PDF_TOOL_NAME = "document_create_pdf";
const SOURCE_GET_TOOL_NAME = "document_source_get";
const PREVIEW_CREATE_TOOL_NAME = "document_pdf_preview_create";
const RENDER_TOOL_NAME = "document_template_render";
const CONVERT_TOOL_NAME = "document_convert_to_pdf";

async function typedDocumentTool<const T extends DocumentToolName>(
  db: Awaited<ReturnType<typeof useE2eDb>>,
  toolName: T,
  params: Record<string, unknown>,
) {
  coverage.exercise(toolName);
  const result = await executeCapabilityTool(
    db,
    withTrustedChannel(
      buildCapabilityToolRequest({
        capabilityId: CAPABILITY_ID,
        toolName,
        params,
      }),
      CAPABILITY_ID,
    ),
  );
  return parseCapabilityToolOutput(result, documentToolContracts, toolName);
}

async function loadArtifact(
  db: Awaited<ReturnType<typeof useE2eDb>>,
  profileFileId: string,
): Promise<TableRow<"artifacts">> {
  const result = await db.from("artifacts").select().eq("id", profileFileId).single();
  return requireSupabaseData("Load rendered document artifact", result.data, result.error);
}

function extractDocxDocumentXml(bytes: Uint8Array): string {
  const zip = new PizZip(Buffer.from(bytes));
  const documentXml = zip.file("word/document.xml")?.asText();
  assert.ok(documentXml, "Rendered DOCX must contain word/document.xml");
  return documentXml;
}

test("Documents capability tool works end-to-end.", async (t) => {
  const run = await createE2eRun(t, { id: CAPABILITY_ID });
  const supabase = await attachE2eSupabase(run);
  const db = await useE2eDb();
  const marker = createMarker("document-tools");
  let templateArtifact: Awaited<ReturnType<typeof seedDocumentTemplateArtifact>> | null = null;
  let renderedArtifacts: TableRow<"artifacts">[] = [];
  let createdPdfArtifacts: TableRow<"artifacts">[] = [];
  let createdSourceArtifacts: TableRow<"artifacts">[] = [];
  let previewArtifacts: TableRow<"artifacts">[] = [];
  let sourceFile: Awaited<ReturnType<typeof seedDocumentTemplateArtifact>> | null = null;
  let convertedArtifact: TableRow<"artifacts"> | null = null;
  let invalidTemplateArtifact: Awaited<ReturnType<typeof seedDocumentTemplateArtifact>> | null =
    null;
  let noFieldTemplateArtifact: Awaited<ReturnType<typeof seedDocumentTemplateArtifact>> | null =
    null;
  let unsupportedArtifact: Awaited<ReturnType<typeof seedDocumentArtifact>> | null = null;
  let pdfSourceArtifact: Awaited<ReturnType<typeof seedDocumentArtifact>> | null = null;

  try {
    await startBackend(run, { supabase });
    const trustedChannel = await seedTestingTrustedE2eChannel({
      db,
      profileId: "testing",
      peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
      marker,
      purpose: CAPABILITY_ID,
    });
    t.after(async () => {
      await trustedChannel.cleanup();
    });
    templateArtifact = await seedDocumentTemplateArtifact(db, {
      profileId: "testing",
      marker,
    });

    const plainTextContent = [
      `Invoice summary ${marker}`,
      `Client: ${clientFullName()}`,
      `Company: ${TESTING_FIXTURE_CLIENT.company.name}`,
      "Subtotal: $1,250.00",
      "Due on receipt",
    ].join("\n");
    const plainTextCreateData = await typedDocumentTool(db, CREATE_PDF_TOOL_NAME, {
      contentFormat: "plain_text",
      content: plainTextContent,
      filename: `invoice-summary-${marker}`,
      title: `Invoice summary ${marker}`,
      description: `Created PDF from invoice email body ${marker}`,
      sourceRefs: {
        emailMessageId: `gmail-message-${marker}`,
      },
    });
    assert.equal(plainTextCreateData.provider, "document-tools");
    assert.equal(plainTextCreateData.source.contentFormat, "plain_text");
    assert.equal(
      plainTextCreateData.source.contentSha256,
      createHash("sha256").update(new TextEncoder().encode(plainTextContent)).digest("hex"),
    );
    assert.deepEqual(plainTextCreateData.source.sourceRefKeys, ["emailMessageId"]);
    const plainTextPdfArtifact = await loadArtifact(db, plainTextCreateData.pdfFile.profileFileId);
    const plainTextSourceArtifact = await loadArtifact(
      db,
      plainTextCreateData.sourceFile.profileFileId,
    );
    createdPdfArtifacts.push(plainTextPdfArtifact);
    createdSourceArtifacts.push(plainTextSourceArtifact);
    assert.equal(plainTextSourceArtifact.artifact_type, "document.created.source.plain_text");
    assert.equal(plainTextSourceArtifact.mime_type, "text/plain");
    assert.equal(plainTextSourceArtifact.filename, `invoice-summary-${marker}.txt`);
    assert.equal(plainTextSourceArtifact.sha256, plainTextCreateData.source.contentSha256);
    assert.equal(
      new TextDecoder().decode(await downloadArtifactBytes(db, plainTextSourceArtifact)),
      plainTextContent,
    );
    assert.equal(plainTextPdfArtifact.artifact_type, "document.created.pdf");
    assert.equal(plainTextPdfArtifact.mime_type, "application/pdf");
    assert.equal(plainTextPdfArtifact.filename, `invoice-summary-${marker}.pdf`);
    assert.ok((plainTextPdfArtifact.byte_size ?? 0) > 0);
    const plainTextPdfBytes = await downloadArtifactBytes(db, plainTextPdfArtifact);
    assert.equal(
      createHash("sha256").update(plainTextPdfBytes).digest("hex"),
      plainTextPdfArtifact.sha256,
    );

    const htmlContent = [
      "<!doctype html>",
      '<html><head><meta charset="utf-8"></head><body>',
      `<h1>Invoice ${marker}</h1>`,
      `<p>Client: ${clientFullName()}</p>`,
      "<table><tr><th>Description</th><th>Amount</th></tr><tr><td>Advisory retainer</td><td>$2,400.00</td></tr></table>",
      "</body></html>",
    ].join("");
    const htmlCreateData = await typedDocumentTool(db, CREATE_PDF_TOOL_NAME, {
      contentFormat: "html",
      content: htmlContent,
      filename: `invoice-html-${marker}.pdf`,
      title: `Invoice HTML ${marker}`,
    });
    const htmlPdfArtifact = await loadArtifact(db, htmlCreateData.pdfFile.profileFileId);
    const htmlSourceArtifact = await loadArtifact(db, htmlCreateData.sourceFile.profileFileId);
    createdPdfArtifacts.push(htmlPdfArtifact);
    createdSourceArtifacts.push(htmlSourceArtifact);
    assert.equal(htmlCreateData.source.contentFormat, "html");
    assert.equal(htmlSourceArtifact.artifact_type, "document.created.source.html");
    assert.equal(htmlSourceArtifact.mime_type, "text/html");
    assert.equal(htmlPdfArtifact.artifact_type, "document.created.pdf");
    assert.equal(htmlPdfArtifact.mime_type, "application/pdf");
    assert.ok((htmlPdfArtifact.byte_size ?? 0) > 0);

    const markdownContent = [
      `# Morning Financing Report ${marker}`,
      "",
      `Prepared for **${clientFullName()}**`,
      "",
      "## Priorities",
      "",
      "- Review the Jordan Rowan mandate status.",
      "- Confirm today's lender follow-ups.",
      "- Flag any missing Drive documents.",
      "",
      "## Deal Snapshot",
      "",
      "| Item | Status | Owner |",
      "| --- | --- | --- |",
      "| Mandate PDF | Filed | John |",
      "| Bank package | In progress | Finance team |",
      "",
      "> Keep this report short enough to read on mobile, but structured enough to archive.",
    ].join("\n");
    const markdownCreateData = await typedDocumentTool(db, CREATE_PDF_TOOL_NAME, {
      contentFormat: "markdown",
      content: markdownContent,
      filename: `morning-report-${marker}`,
      title: `Morning Financing Report ${marker}`,
      description: `Created PDF from markdown report ${marker}`,
    });
    const markdownPdfArtifact = await loadArtifact(db, markdownCreateData.pdfFile.profileFileId);
    const markdownSourceArtifact = await loadArtifact(
      db,
      markdownCreateData.sourceFile.profileFileId,
    );
    createdPdfArtifacts.push(markdownPdfArtifact);
    createdSourceArtifacts.push(markdownSourceArtifact);
    assert.equal(markdownCreateData.source.contentFormat, "markdown");
    assert.equal(markdownSourceArtifact.artifact_type, "document.created.source.markdown");
    assert.equal(markdownSourceArtifact.mime_type, "text/markdown");
    assert.equal(markdownSourceArtifact.filename, `morning-report-${marker}.md`);
    assert.equal(markdownPdfArtifact.artifact_type, "document.created.pdf");
    assert.equal(markdownPdfArtifact.mime_type, "application/pdf");
    assert.equal(markdownPdfArtifact.filename, `morning-report-${marker}.pdf`);
    assert.ok((markdownPdfArtifact.byte_size ?? 0) > 0);

    const sourceGetData = await typedDocumentTool(db, SOURCE_GET_TOOL_NAME, {
      sourceProfileFileId: markdownCreateData.sourceFile.profileFileId,
      expectedSha256: markdownCreateData.source.contentSha256,
    });
    assert.equal(sourceGetData.provider, "document-tools");
    assert.equal(sourceGetData.sourceFile.profileFileId, markdownSourceArtifact.id);
    assert.equal(sourceGetData.source.contentFormat, "markdown");
    assert.equal(sourceGetData.source.content, markdownContent);
    assert.equal(sourceGetData.source.contentSha256, markdownCreateData.source.contentSha256);

    assert.ok(markdownCreateData.pdfFile.sha256);
    const previewCreateData = await typedDocumentTool(db, PREVIEW_CREATE_TOOL_NAME, {
      pdfProfileFileId: markdownCreateData.pdfFile.profileFileId,
      expectedSha256: markdownCreateData.pdfFile.sha256,
      pageSelection: { kind: "first_page" },
    });
    const previewFile = await loadArtifact(db, previewCreateData.previewFile.profileFileId);
    previewArtifacts.push(previewFile);
    assert.equal(previewCreateData.provider, "document-tools");
    assert.equal(previewCreateData.sourcePdfFile.profileFileId, markdownPdfArtifact.id);
    assert.equal(previewCreateData.preview.sourcePdfSha256, markdownPdfArtifact.sha256);
    assert.equal(previewCreateData.preview.pageSelection.kind, "first_page");
    assert.equal(previewCreateData.preview.pageNumber, 1);
    assert.ok(previewCreateData.preview.widthPx > 0);
    assert.ok(previewCreateData.preview.heightPx > 0);
    assert.equal(previewFile.artifact_type, "document.pdf.preview.png");
    assert.equal(previewFile.mime_type, "image/png");
    assert.equal(previewFile.filename, `morning-report-${marker}-page-1.png`);
    const previewBytes = await downloadArtifactBytes(db, previewFile);
    assert.equal(Buffer.from(previewBytes.slice(0, 8)).toString("hex"), "89504e470d0a1a0a");

    const staleSourceGetResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: SOURCE_GET_TOOL_NAME,
          params: {
            sourceProfileFileId: markdownCreateData.sourceFile.profileFileId,
            expectedSha256: "0".repeat(64),
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in staleSourceGetResult);
    assert.match(staleSourceGetResult.error.message, /expected hash/);

    const emptyCreateResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: CREATE_PDF_TOOL_NAME,
          params: {
            contentFormat: "plain_text",
            content: "",
            filename: `empty-${marker}.pdf`,
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in emptyCreateResult);

    const unsupportedFormatResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: CREATE_PDF_TOOL_NAME,
          params: {
            contentFormat: "yaml",
            content: "Invoice content",
            filename: `unsupported-${marker}.pdf`,
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in unsupportedFormatResult);

    const unsafeHtmlResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: CREATE_PDF_TOOL_NAME,
          params: {
            contentFormat: "html",
            content: '<html><body><script>alert("x")</script><p>Invoice</p></body></html>',
            filename: `unsafe-${marker}.pdf`,
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in unsafeHtmlResult);
    assert.match(unsafeHtmlResult.error.message, /script tags/);

    const unsafeMarkdownResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: CREATE_PDF_TOOL_NAME,
          params: {
            contentFormat: "markdown",
            content: "![Remote report logo](https://assets.example.invalid/logo.png)",
            filename: `unsafe-markdown-${marker}.pdf`,
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in unsafeMarkdownResult);
    assert.match(
      unsafeMarkdownResult.error.message,
      /external-loading elements|external, data, file, or javascript URLs/,
    );

    const renderData = await typedDocumentTool(db, RENDER_TOOL_NAME, {
      templateProfileFileId: templateArtifact.id,
      outputFilename: `Jordan Rowan mandate ${marker}.pdf`,
      fieldValues: {
        client_name: clientFullName(),
        company_name: TESTING_FIXTURE_CLIENT.company.name,
        company_address: "123 Rue Saint-Denis, Montréal",
        onboarding_fee: "$1,000",
        success_fee: "5%",
        client_email: clientEmailForMarker(marker),
      },
    });

    assert.equal(renderData.template.profileFileId, templateArtifact.id);
    const pdfFile = await loadArtifact(db, renderData.files.pdf.profileFileId);
    const docxArtifact = await loadArtifact(db, renderData.files.docx.profileFileId);
    renderedArtifacts = [pdfFile, docxArtifact];

    assert.equal(pdfFile.artifact_type, "document.rendered.pdf");
    assert.equal(docxArtifact.artifact_type, "document.rendered.docx");
    assert.equal(renderData.files.pdf.sha256, pdfFile.sha256);
    assert.equal(renderData.files.docx.profileFileId, docxArtifact.id);
    assert.deepEqual(renderData.render.templateFieldKeys, [
      "client_email",
      "client_name",
      "company_address",
      "company_name",
      "onboarding_fee",
      "success_fee",
    ]);

    const renderedDocxXml = extractDocxDocumentXml(await downloadArtifactBytes(db, docxArtifact));
    assert.ok(renderedDocxXml.includes(clientFullName()));
    assert.ok(renderedDocxXml.includes(TESTING_FIXTURE_CLIENT.company.name));
    assert.ok(renderedDocxXml.includes("123 Rue Saint-Denis, Montréal"));
    assert.ok(renderedDocxXml.includes("$1,000"));
    assert.ok(renderedDocxXml.includes("5%"));
    assert.ok(renderedDocxXml.includes(clientEmailForMarker(marker)));

    noFieldTemplateArtifact = await seedDocumentTemplateArtifact(db, {
      profileId: "testing",
      marker: createMarker("document-tools-no-fields"),
      documentBodyXml:
        "<w:p><w:r><w:t>This mandate template has no placeholders.</w:t></w:r></w:p>",
    });
    const noFieldRenderResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: RENDER_TOOL_NAME,
          params: {
            templateProfileFileId: noFieldTemplateArtifact.id,
            fieldValues: {
              client_name: clientFullName(),
            },
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in noFieldRenderResult);
    assert.match(noFieldRenderResult.error.message, /contains no supported template fields/);
    assert.deepEqual(noFieldRenderResult.error.details?.templateFieldKeys, []);
    assert.deepEqual(noFieldRenderResult.error.details?.providedFieldKeys, ["client_name"]);

    invalidTemplateArtifact = await seedDocumentTemplateArtifact(db, {
      profileId: "testing",
      marker: createMarker("document-tools-invalid-template"),
      documentBodyXml:
        "<w:p><w:r><w:t>Mandate for {client_nam} at {company_name}.</w:t></w:r></w:p>",
    });
    const invalidRenderResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: RENDER_TOOL_NAME,
          params: {
            templateProfileFileId: invalidTemplateArtifact.id,
            fieldValues: {
              client_name: clientFullName(),
              company_name: TESTING_FIXTURE_CLIENT.company.name,
            },
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in invalidRenderResult);
    assert.match(
      invalidRenderResult.error.message,
      /DOCX template fields do not match provided field values/,
    );
    assert.deepEqual(invalidRenderResult.error.details?.missingFieldValues, ["client_nam"]);
    assert.deepEqual(invalidRenderResult.error.details?.unknownFieldValues, ["client_name"]);

    // --- CONVERT ---
    const markerConvert = createMarker("document-tools-convert");
    sourceFile = await seedDocumentTemplateArtifact(db, {
      profileId: "testing",
      marker: markerConvert,
    });

    const convertData = await typedDocumentTool(db, CONVERT_TOOL_NAME, {
      profileFileId: sourceFile.id,
    });

    assert.equal(convertData.sourceFile.profileFileId, sourceFile.id);
    convertedArtifact = await loadArtifact(db, convertData.pdfFile.profileFileId);

    assert.equal(convertedArtifact.artifact_type, "document.converted.pdf");
    assert.equal(convertData.pdfFile.sha256, convertedArtifact.sha256);

    unsupportedArtifact = await seedDocumentArtifact(db, {
      profileId: "testing",
      marker: createMarker("document-tools-unsupported-convert"),
      filename: "unsupported-template.bin",
      artifactType: "document.source",
      mimeType: "application/octet-stream",
      bytes: new Uint8Array(Buffer.from("not a supported office document")),
    });
    const unsupportedConvertResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: CONVERT_TOOL_NAME,
          params: {
            profileFileId: unsupportedArtifact.id,
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in unsupportedConvertResult);
    assert.match(unsupportedConvertResult.error.message, /Unsupported file extension '.bin'/);

    pdfSourceArtifact = await seedDocumentArtifact(db, {
      profileId: "testing",
      marker: createMarker("document-tools-already-pdf"),
      filename: "already-rendered.pdf",
      artifactType: "document.source",
      mimeType: "application/pdf",
      bytes: new Uint8Array(Buffer.from("%PDF-1.4\n% document-tools e2e already pdf\n")),
    });
    const alreadyPdfConvertResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: CONVERT_TOOL_NAME,
          params: {
            profileFileId: pdfSourceArtifact.id,
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in alreadyPdfConvertResult);
    assert.match(alreadyPdfConvertResult.error.message, /is already a PDF/);

    coverage.assertComplete();

    console.log(
      JSON.stringify(
        {
          ok: true,
          capabilityId: CAPABILITY_ID,
          marker,
          templateProfileFileId: templateArtifact.id,
          renderedArtifactIds: renderedArtifacts.map((artifact) => artifact.id),
          createdSourceArtifactIds: createdSourceArtifacts.map((artifact) => artifact.id),
          previewArtifactIds: previewArtifacts.map((artifact) => artifact.id),
          markerConvert,
          sourceProfileFileId: sourceFile.id,
          convertedArtifactId: convertedArtifact.id,
        },
        null,
        2,
      ),
    );
  } finally {
    if (pdfSourceArtifact) {
      await cleanupDocumentTemplateArtifact(db, pdfSourceArtifact);
    }
    if (unsupportedArtifact) {
      await cleanupDocumentTemplateArtifact(db, unsupportedArtifact);
    }
    if (convertedArtifact) {
      await cleanupRenderedDocumentArtifacts(db, [convertedArtifact]);
    }
    await cleanupRenderedDocumentArtifacts(db, previewArtifacts);
    await cleanupRenderedDocumentArtifacts(db, createdSourceArtifacts);
    await cleanupRenderedDocumentArtifacts(db, createdPdfArtifacts);
    if (sourceFile) {
      await cleanupDocumentTemplateArtifact(db, sourceFile);
    }
    if (invalidTemplateArtifact) {
      await cleanupDocumentTemplateArtifact(db, invalidTemplateArtifact);
    }
    if (noFieldTemplateArtifact) {
      await cleanupDocumentTemplateArtifact(db, noFieldTemplateArtifact);
    }
    await cleanupRenderedDocumentArtifacts(db, renderedArtifacts);
    if (templateArtifact) {
      await cleanupDocumentTemplateArtifact(db, templateArtifact);
    }
  }
});
