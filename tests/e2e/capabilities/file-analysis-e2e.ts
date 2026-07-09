import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { type TableRow } from "@ai-assistants/control-db";
import {
  fileAnalysisToolContracts,
  type FileAnalysisToolName,
} from "@ai-assistants/file-analysis-contracts/contracts";
import { useE2eDb } from "../helpers/db/e2e-db";
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
import { seedDocumentArtifact } from "../helpers/fixtures/document-render-fixture";

const CAPABILITY_ID = "file-analysis";
const coverage = createCapabilityToolCoverage(CAPABILITY_ID, fileAnalysisToolContracts);

async function typedFileAnalysisTool<const T extends FileAnalysisToolName>(
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
  return parseCapabilityToolOutput(result, fileAnalysisToolContracts, toolName);
}

async function cleanupArtifact(
  db: Awaited<ReturnType<typeof useE2eDb>>,
  artifact: TableRow<"artifacts">,
) {
  const removed = await db.storage.from(artifact.storage_bucket).remove([artifact.storage_key]);
  if (removed.error) throw removed.error;
  const deleted = await db.from("artifacts").delete().eq("id", artifact.id);
  if (deleted.error) throw deleted.error;
}

function mandateImagePng(marker: string): Buffer {
  const canvas = createCanvas(1100, 700);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1100, 700);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 40px Arial";
  ctx.fillText("Scanned mandate identity evidence", 70, 90);
  ctx.font = "28px Arial";
  ctx.fillText(`Run marker: ${marker}`, 70, 155);
  ctx.fillText("Full name: Casey Morgan", 70, 225);
  ctx.fillText("Residential address: 123 Example Street, Sample City ZZ 00000", 70, 285);
  ctx.fillText("Date of birth: 2000-01-01", 70, 345);
  ctx.fillText("License number: TEST-LICENSE-IMAGE-001", 70, 405);
  ctx.fillText("Document note: clear image-only intake file", 70, 465);
  return canvas.toBuffer("image/png");
}

test("File analysis capability extracts text, describes files, extracts structured data, and rejects stale or unsupported files.", async (t) => {
  const run = await createE2eRun(t, { id: CAPABILITY_ID });
  const supabase = await attachE2eSupabase(run);
  const db = await useE2eDb();
  const marker = createMarker("file-analysis");
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

  const text = [
    `File analysis E2E payload ${marker}`,
    "Client full name: Jordan Rowan",
    "Residential address: 456 Sample Avenue, Example City ZZ 00000",
    "Date of birth: 1990-01-01",
    "License number: TEST-LICENSE-TEXT-001",
    "Fee: 42100 CAD",
  ].join("\n");
  const textArtifact = await seedDocumentArtifact(db, {
    profileId: "testing",
    marker,
    filename: `file-analysis-${marker}.txt`,
    mimeType: "text/plain",
    bytes: new TextEncoder().encode(text),
    artifactType: "file-analysis.e2e.text",
  });
  const imageBytes = mandateImagePng(marker);
  const imageArtifact = await seedDocumentArtifact(db, {
    profileId: "testing",
    marker,
    filename: `file-analysis-${marker}-identity.png`,
    mimeType: "image/png",
    bytes: imageBytes,
    artifactType: "file-analysis.e2e.identity-image",
  });
  const unsupportedArtifact = await seedDocumentArtifact(db, {
    profileId: "testing",
    marker,
    filename: `file-analysis-${marker}.bin`,
    mimeType: "application/octet-stream",
    bytes: new Uint8Array([0, 1, 2, 3, 4, 5]),
    artifactType: "file-analysis.e2e.unsupported",
  });
  t.after(async () => {
    await cleanupArtifact(db, textArtifact);
    await cleanupArtifact(db, imageArtifact);
    await cleanupArtifact(db, unsupportedArtifact);
  });

  const extracted = await typedFileAnalysisTool(db, "file_extract_text", {
    profileFileId: textArtifact.id,
    expectedSha256: textArtifact.sha256,
  });
  assert.equal(extracted.provider, "file-analysis");
  assert.equal(extracted.sourceFile.profileFileId, textArtifact.id);
  assert.equal(extracted.methodUsed, "utf8_text");
  assert.match(extracted.content.text, new RegExp(marker, "u"));
  assert.match(extracted.content.text, /Jordan Rowan/u);
  assert.match(extracted.content.text, /42100 CAD/u);

  const described = await typedFileAnalysisTool(db, "file_describe", {
    profileFileId: textArtifact.id,
    expectedSha256: textArtifact.sha256,
    question: "Summarize the file in one sentence.",
  });
  assert.equal(described.methodUsed, "utf8_text");
  assert.match(described.answer, /Jordan Rowan/u);

  const extractionSchema = {
    type: "object",
    required: ["full_name", "address", "date_of_birth", "license_number"],
    properties: {
      full_name: { type: "string" },
      address: { type: "string" },
      date_of_birth: { type: "string" },
      license_number: { type: "string" },
    },
  };
  const textData = await typedFileAnalysisTool(db, "file_extract_data", {
    profileFileId: textArtifact.id,
    expectedSha256: textArtifact.sha256,
    instructions:
      "Extract the identity and address fields exactly as written in the saved mandate intake text.",
    schema: extractionSchema,
  });
  assert.equal(textData.methodUsed, "utf8_text");
  assert.equal((textData.data as Record<string, unknown>).full_name, "Jordan Rowan");
  assert.equal((textData.data as Record<string, unknown>).date_of_birth, "1984-05-13");
  assert.equal((textData.data as Record<string, unknown>).license_number, "TEST-LICENSE-TEXT-001");

  const imageData = await typedFileAnalysisTool(db, "file_extract_data", {
    profileFileId: imageArtifact.id,
    expectedSha256: imageArtifact.sha256,
    instructions: "Extract the identity and address fields exactly as written in the saved image.",
    schema: extractionSchema,
  });
  assert.equal(imageData.methodUsed, "vision");
  assert.equal((imageData.data as Record<string, unknown>).full_name, "Casey Morgan");
  assert.equal((imageData.data as Record<string, unknown>).date_of_birth, "1989-11-24");
  assert.equal(
    (imageData.data as Record<string, unknown>).license_number,
    "TEST-LICENSE-IMAGE-001",
  );

  const staleResult = await executeCapabilityTool(
    db,
    withTrustedChannel(
      buildCapabilityToolRequest({
        capabilityId: CAPABILITY_ID,
        toolName: "file_extract_text",
        params: {
          profileFileId: textArtifact.id,
          expectedSha256: "0".repeat(64),
        },
      }),
      CAPABILITY_ID,
    ),
  );
  assert.ok("error" in staleResult);
  assert.match(staleResult.error.message, /hash/i);

  const unsupportedResult = await executeCapabilityTool(
    db,
    withTrustedChannel(
      buildCapabilityToolRequest({
        capabilityId: CAPABILITY_ID,
        toolName: "file_extract_text",
        params: {
          profileFileId: unsupportedArtifact.id,
          expectedSha256: unsupportedArtifact.sha256,
        },
      }),
      CAPABILITY_ID,
    ),
  );
  assert.ok("error" in unsupportedResult);
  assert.match(unsupportedResult.error.message, /not a supported deterministic text file/);

  assert.equal(
    createHash("sha256").update(new TextEncoder().encode(text)).digest("hex"),
    textArtifact.sha256,
  );
  coverage.assertComplete();
});
