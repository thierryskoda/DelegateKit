#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { requireSupabaseData, type TableRow } from "@ai-assistants/control-db";
import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";
import { profileFileToolContracts } from "@ai-assistants/profile-files-contracts/contracts";
import { attachE2eSupabase } from "./helpers/processes/attach-supabase";
import { useE2eDb } from "./helpers/db/e2e-db";
import { createCapabilityToolCoverage } from "./helpers/capability/capability-tool-coverage";
import { createE2eRun, createMarker } from "./helpers/run/e2e-run";
import { requireTestingE2eAgent } from "./helpers/run/testing-launch-support";
import {
  listDirectAgentRuntimeToolEvents,
  sendDirectAgentRuntimeMessage,
  useDirectAgentRuntimeChannel,
} from "./helpers/channel/direct-agent-runtime";

const TEST_ID = "profile-files-direct";
const CAPABILITY_ID = "profile-files";
const coverage = createCapabilityToolCoverage(CAPABILITY_ID, profileFileToolContracts);
const profileFileDirectContracts = [
  ...profileFileToolContracts,
  ...fileAnalysisToolContracts.filter((contract) => contract.name === "file_extract_text"),
] as const;

async function cleanupArtifact(
  db: Awaited<ReturnType<typeof useE2eDb>>,
  artifact: Pick<TableRow<"artifacts">, "id" | "storage_bucket" | "storage_key">,
): Promise<void> {
  const removed = await db.storage.from(artifact.storage_bucket).remove([artifact.storage_key]);
  if (removed.error) throw removed.error;
  const deleted = await db.from("artifacts").delete().eq("id", artifact.id);
  if (deleted.error) throw deleted.error;
}

test("backend direct agent runtime saves inbound attachments and delivers saved files without runtime artifact plugins", async (t) => {
  const run = await createE2eRun(t, {
    id: TEST_ID,
    requiredEnv: ["DEEPSEEK_API_KEY"],
    clearDiagnosticLogs: true,
  });
  requireTestingE2eAgent();
  await attachE2eSupabase(run);

  const db = await useE2eDb();
  const channel = await useDirectAgentRuntimeChannel(run);
  const marker = createMarker("profile-file-direct");
  const attachmentText = [
    `Profile file direct E2E attachment marker: ${marker}`,
    "Client: Jordan Rowan",
    "Instruction: return this same saved note to the chat.",
  ].join("\n");
  const attachmentBytes = Buffer.from(attachmentText, "utf8");
  const attachmentSha256 = createHash("sha256").update(attachmentBytes).digest("hex");
  const attachmentFilename = `${marker}-jordan-rowan-note.txt`;

  const turn = await sendDirectAgentRuntimeMessage(
    channel,
    marker,
    [
      `This is E2E marker ${marker}.`,
      `First use profile_file_find with query "${attachmentFilename}" to find the saved note.`,
      "Inspect the attached text note with file_extract_text.",
      `Then send the same saved note back to this chat with profile_file_send and caption "${marker} returned note".`,
      "Reply with one short sentence that includes the marker from the note.",
    ],
    {
      maxSteps: 8,
      toolContracts: profileFileDirectContracts,
      inboundAttachments: [
        {
          filename: attachmentFilename,
          mimeType: "text/plain",
          contentBase64: attachmentBytes.toString("base64"),
          byteSize: attachmentBytes.byteLength,
          sha256: attachmentSha256,
          description: `Profile file direct E2E note ${marker}`,
        },
      ],
    },
  );

  const extractCalls = await listDirectAgentRuntimeToolEvents(turn, {
    eventType: "assistant.tool.call",
    toolName: "file_extract_text",
  });
  const findCalls = await listDirectAgentRuntimeToolEvents(turn, {
    eventType: "assistant.tool.call",
    toolName: "profile_file_find",
  });
  const sendCalls = await listDirectAgentRuntimeToolEvents(turn, {
    eventType: "assistant.tool.call",
    toolName: "profile_file_send",
  });
  assert.ok(findCalls.length >= 1, "expected direct runtime to search saved profile files");
  assert.ok(extractCalls.length >= 1, "expected direct runtime to inspect the saved attachment");
  assert.ok(
    sendCalls.length >= 1,
    "expected direct runtime to queue the saved attachment for delivery",
  );
  coverage.exercise("profile_file_find");
  coverage.exercise("profile_file_send");
  assert.ok(turn.outboundText.includes(marker), `expected outbound text to include ${marker}`);

  const returnedFile = turn.outboundFiles.find((file) => file.sha256 === attachmentSha256);
  assert.ok(
    returnedFile,
    "expected direct runtime to return the saved attachment as an outbound file action",
  );
  assert.equal(returnedFile.filename, attachmentFilename);
  assert.equal(returnedFile.mimeType, "text/plain");
  assert.equal(returnedFile.byteSize, attachmentBytes.byteLength);
  assert.equal(Buffer.from(returnedFile.contentBase64, "base64").toString("utf8"), attachmentText);
  assert.match(returnedFile.caption ?? "", new RegExp(marker, "u"));

  const artifactResult = await db
    .from("artifacts")
    .select("id,filename,artifact_type,mime_type,byte_size,sha256,storage_bucket,storage_key")
    .eq("id", returnedFile.profileFileId)
    .single();
  const artifact = requireSupabaseData(
    `Load returned profile file artifact ${returnedFile.profileFileId}`,
    artifactResult.data,
    artifactResult.error,
  );
  t.after(async () => {
    await cleanupArtifact(db, artifact);
  });
  assert.equal(artifact.filename, attachmentFilename);
  assert.equal(artifact.artifact_type, "inbound.media");
  assert.equal(artifact.mime_type, "text/plain");
  assert.equal(artifact.byte_size, attachmentBytes.byteLength);
  assert.equal(artifact.sha256, attachmentSha256);
  coverage.assertComplete();
});
