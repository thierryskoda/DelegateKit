import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  googleDriveToolContracts,
  type GoogleDriveToolName,
} from "@ai-assistants/google-drive-contracts/contracts";
import { googleDriveFileStateSourceSchema } from "../../../../apps/backend/src/test-support/capabilities/google-drive";
import { approveAndExecuteProfileAction } from "../capability/approve-profile-action";
import type { E2eFixtureScope } from "./e2e-fixture-scope";
import { requireSingleTestingNangoConnection } from "../readiness/testing-provider-readiness";
import { executeTypedCapabilityTool } from "../run/execute-capability-backend-tool";
import { asRecord } from "../utils/as-record";
import { requireTestingProviderSandboxBinding } from "../provider-runtime/testing-provider-runtime";
import {
  listProviderSandboxResources,
  upsertProviderSandboxResource,
  type ProviderSandboxBinding,
} from "../../../../apps/backend/src/test-support/provider-sandbox";
import { providerSandboxBinaryResponse } from "../provider-runtime/provider-sandbox-fixtures";
import { seedProviderSandboxOperationResponses } from "../provider-runtime/provider-sandbox-fixtures";

const GOOGLE_DRIVE_CAPABILITY_ID = "google-drive";
const GOOGLE_DRIVE_PROVIDER = "google-drive";
const GOOGLE_DRIVE_PROVIDER_KEY = "ai-assistants-google";
const GOOGLE_DRIVE_SANDBOX_FILE_RESOURCE_TYPE = "google_drive_file";
const GOOGLE_DRIVE_PDF_MIME_TYPE = "application/pdf";
const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

type SeededGoogleDriveFolderFixture = {
  fileId: string;
  name: string;
  connectedAccountId: string;
};

type SeededGoogleDriveFileFixture = {
  fileId: string;
  name: string;
  connectedAccountId: string;
  folderId?: string;
};

async function requireTestingDriveDecisionUserId(db: SupabaseServiceClient): Promise<string> {
  const profileResult = await db.from("profiles").select("user_id").eq("id", "testing").single();
  const testingProfile = requireSupabaseData(
    "Load testing profile user for Google Drive fixture approvals",
    profileResult.data,
    profileResult.error,
  );
  assert.ok(
    testingProfile.user_id,
    "testing profile must have a portal user_id for Google Drive fixture approvals",
  );
  return testingProfile.user_id;
}

function recordIdFromProviderResult(toolName: string, value: unknown): string {
  const result = asRecord(value, `${toolName} provider result`);
  const id = result.id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(
      `${toolName} provider result.id must be a non-empty string; got ${JSON.stringify(result)}`,
    );
  }
  return id;
}

function providerResultFromExecutedAction(
  action: TableRow<"profile_actions">,
  label: string,
): Record<string, unknown> {
  const payload = asRecord(action.result_payload, `${label} result_payload`);
  assert.equal(payload.provider, "google-drive");
  return asRecord(payload.result, `${label} provider result`);
}

function executedProviderId(action: TableRow<"profile_actions">, label: string): string {
  return recordIdFromProviderResult(label, providerResultFromExecutedAction(action, label));
}

async function approveGoogleDriveWrite(input: {
  db: SupabaseServiceClient;
  toolName: GoogleDriveToolName;
  write: { actionId: string };
  decisionUserId: string;
}): Promise<TableRow<"profile_actions">> {
  const actionResult = await input.db
    .from("profile_actions")
    .select()
    .eq("id", input.write.actionId)
    .single();
  const action = requireSupabaseData(
    `Load Google Drive write action ${input.write.actionId}`,
    actionResult.data,
    actionResult.error,
  );
  return approveAndExecuteProfileAction({
    db: input.db,
    action,
    decisionUserId: input.decisionUserId,
  });
}

function isIgnorableCleanupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found|file not found|permission not found|404/i.test(message);
}

function isCleanupTrashFallbackError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /status code 424|delete-file failed|Nango Google Drive action "delete-file" failed/i.test(
    message,
  );
}

async function cleanupGoogleDriveFileId(input: {
  db: SupabaseServiceClient;
  connectedAccountId: string;
  fileId: string;
  decisionUserId: string;
}): Promise<void> {
  try {
    const write = await executeTypedCapabilityTool(input.db, googleDriveToolContracts, {
      capabilityId: GOOGLE_DRIVE_CAPABILITY_ID,
      toolName: "google_drive_file_delete",
      params: {
        connectedAccountId: input.connectedAccountId,
        fileId: input.fileId,
      },
      trusted: true,
    });
    await approveGoogleDriveWrite({
      db: input.db,
      toolName: "google_drive_file_delete",
      write: write.write,
      decisionUserId: input.decisionUserId,
    });
  } catch (error) {
    if (isIgnorableCleanupError(error)) return;
    if (!isCleanupTrashFallbackError(error)) throw error;
    try {
      const write = await executeTypedCapabilityTool(input.db, googleDriveToolContracts, {
        capabilityId: GOOGLE_DRIVE_CAPABILITY_ID,
        toolName: "google_drive_file_trash",
        params: {
          connectedAccountId: input.connectedAccountId,
          fileId: input.fileId,
        },
        trusted: true,
      });
      await approveGoogleDriveWrite({
        db: input.db,
        toolName: "google_drive_file_trash",
        write: write.write,
        decisionUserId: input.decisionUserId,
      });
    } catch (trashError) {
      if (!isIgnorableCleanupError(trashError)) throw trashError;
    }
  }
}

async function requireGoogleDriveFixtureBinding(db: SupabaseServiceClient): Promise<{
  connectedAccountId: string;
  decisionUserId: string;
}> {
  const fixture = await requireSingleTestingNangoConnection(db, {
    capabilitySlug: GOOGLE_DRIVE_CAPABILITY_ID,
    provider: GOOGLE_DRIVE_PROVIDER,
    label: "Google Drive",
  });
  assert.equal(fixture.capabilityAccountLink.profile_id, "testing");
  return {
    connectedAccountId: fixture.connectedAccount.id,
    decisionUserId: await requireTestingDriveDecisionUserId(db),
  };
}

async function requireGoogleDriveSandboxBinding(db: SupabaseServiceClient): Promise<{
  binding: ProviderSandboxBinding;
  connectedAccountId: string;
  providerKey: typeof GOOGLE_DRIVE_PROVIDER_KEY;
}> {
  const fixture = await requireTestingProviderSandboxBinding(db, {
    capabilitySlug: "google-drive",
    provider: "google-drive",
  });
  return {
    binding: {
      link: fixture.capabilityAccountLink,
      account: fixture.connectedAccount,
    },
    connectedAccountId: fixture.connectedAccount.id,
    providerKey: GOOGLE_DRIVE_PROVIDER_KEY,
  };
}

function googleDriveSandboxFile(input: {
  fileId: string;
  name: string;
  mimeType: string;
  folderId?: string;
  description?: string;
  size?: number;
}) {
  const timestamp = new Date().toISOString();
  return {
    id: input.fileId,
    name: input.name,
    mimeType: input.mimeType,
    parents: input.folderId ? [input.folderId] : [],
    createdTime: timestamp,
    modifiedTime: timestamp,
    size: String(input.size ?? 1280),
    webViewLink: `https://drive.google.com/file/d/${input.fileId}/view`,
    trashed: false,
    starred: false,
    ...(input.description ? { description: input.description } : {}),
  };
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildReadableSandboxPdf(input: { title: string; content: string }): Uint8Array {
  const paragraphs = [
    input.title,
    input.content,
    "Document type: final signed mandate.",
    "Client: Jordan Rowan.",
    "Status: signed final copy.",
    "This sandbox PDF is intentionally realistic enough for artifact size and PDF inspection checks.",
  ];
  const textCommands = paragraphs
    .flatMap((paragraph, index) => [
      "BT",
      "/F1 11 Tf",
      `72 ${720 - index * 24} Td`,
      `(${escapePdfText(paragraph)}) Tj`,
      "ET",
    ])
    .join("\n");
  const stream = `${textCommands}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

function googleDriveSandboxFileBody(input: {
  name: string;
  mimeType: string;
  content: string;
  isBase64?: boolean;
}): Uint8Array {
  if (input.isBase64) {
    return new Uint8Array(Buffer.from(input.content, "base64"));
  }
  const content = input.content.trim()
    ? input.content
    : `Sandbox Google Drive content for ${input.name}.`;
  if (input.mimeType === GOOGLE_DRIVE_PDF_MIME_TYPE && input.content.startsWith("%PDF-")) {
    return new TextEncoder().encode(input.content);
  }
  if (input.mimeType === GOOGLE_DRIVE_PDF_MIME_TYPE) {
    return buildReadableSandboxPdf({ title: input.name, content });
  }
  return new TextEncoder().encode(content);
}

async function refreshGoogleDriveSandboxOperationFixtures(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  providerKey: typeof GOOGLE_DRIVE_PROVIDER_KEY;
}): Promise<void> {
  const resources = await listProviderSandboxResources({
    db: input.db,
    binding: input.binding,
    providerKey: input.providerKey,
    resourceType: GOOGLE_DRIVE_SANDBOX_FILE_RESOURCE_TYPE,
  });
  const files = resources.map((resource) => googleDriveFileStateSourceSchema.parse(resource.state));
  const downloadableResource =
    resources.find((resource) => {
      const file = googleDriveFileStateSourceSchema.parse(resource.state);
      return file.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE;
    }) ?? resources[0];
  const latestResource = downloadableResource;
  const latest = latestResource
    ? googleDriveFileStateSourceSchema.parse(latestResource.state)
    : undefined;
  const latestContent =
    latestResource?.metadata &&
    typeof latestResource.metadata === "object" &&
    !Array.isArray(latestResource.metadata) &&
    typeof latestResource.metadata["content"] === "string"
      ? latestResource.metadata["content"]
      : "Jordan Rowan final signed mandate PDF. Client: Jordan Rowan. Status: signed final copy.";
  const latestContentBase64 =
    latestResource?.metadata &&
    typeof latestResource.metadata === "object" &&
    !Array.isArray(latestResource.metadata) &&
    typeof latestResource.metadata["contentBase64"] === "string"
      ? latestResource.metadata["contentBase64"]
      : null;
  const latestMimeType =
    typeof latest?.mimeType === "string" ? latest.mimeType : GOOGLE_DRIVE_PDF_MIME_TYPE;
  const latestBody =
    latestContentBase64 === null
      ? googleDriveSandboxFileBody({
          name:
            typeof latest?.name === "string"
              ? latest.name
              : "Jordan Rowan - Final Mandate Signed Copy.pdf",
          mimeType: latestMimeType,
          content: latestContent,
        })
      : new Uint8Array(Buffer.from(latestContentBase64, "base64"));
  await seedProviderSandboxOperationResponses({
    db: input.db,
    binding: input.binding,
    fixtures: [
      {
        providerKey: input.providerKey,
        operation: "nango.google_drive.proxy.find-file",
        response: { files, nextPageToken: null },
      },
      {
        providerKey: input.providerKey,
        operation: "nango.google_drive.proxy.list-files",
        response: { files, nextPageToken: null },
      },
      {
        providerKey: input.providerKey,
        operation: "nango.google_drive.proxy.get",
        response: latest ?? { id: "missing-drive-file", name: null, mimeType: null },
      },
      {
        providerKey: input.providerKey,
        operation: "nango.google_drive.proxy.get.binary",
        response: providerSandboxBinaryResponse({
          body: latestBody,
          contentType: latestMimeType,
        }),
      },
    ],
  });
}

export async function seedGoogleDriveEmptySearchSandboxForE2e(
  db: SupabaseServiceClient,
): Promise<void> {
  const { binding, providerKey } = await requireGoogleDriveSandboxBinding(db);
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey,
        operation: "nango.google_drive.proxy.find-file",
        response: { files: [], nextPageToken: null },
      },
      {
        providerKey,
        operation: "nango.google_drive.proxy.list-files",
        response: { files: [], nextPageToken: null },
      },
    ],
  });
}

async function seedGoogleDriveSandboxFile(input: {
  db: SupabaseServiceClient;
  name: string;
  mimeType: string;
  folderId?: string;
  description?: string;
  content?: string;
  isBase64?: boolean;
}): Promise<SeededGoogleDriveFileFixture> {
  const { binding, connectedAccountId, providerKey } = await requireGoogleDriveSandboxBinding(
    input.db,
  );
  const fileId = `sandbox-drive-${randomUUID()}`;
  const content = input.content ?? "";
  const fileBody = googleDriveSandboxFileBody({
    name: input.name,
    mimeType: input.mimeType,
    content,
    ...(input.isBase64 ? { isBase64: input.isBase64 } : {}),
  });
  const file = googleDriveSandboxFile({
    fileId,
    name: input.name,
    mimeType: input.mimeType,
    ...(input.folderId ? { folderId: input.folderId } : {}),
    ...(input.description ? { description: input.description } : {}),
    size: fileBody.byteLength,
  });
  await upsertProviderSandboxResource({
    db: input.db,
    binding,
    key: {
      providerKey,
      resourceType: GOOGLE_DRIVE_SANDBOX_FILE_RESOURCE_TYPE,
      resourceId: fileId,
    },
    state: file,
    metadata: {
      name: input.name,
      ...(input.content ? { content: input.content } : {}),
      ...(input.isBase64 ? { isBase64: true } : {}),
      contentBase64: Buffer.from(fileBody).toString("base64"),
    },
  });
  await refreshGoogleDriveSandboxOperationFixtures({
    db: input.db,
    binding,
    providerKey,
  });
  return {
    fileId,
    name: input.name,
    connectedAccountId,
    ...(input.folderId ? { folderId: input.folderId } : {}),
  };
}

export async function seedGoogleDriveSandboxFolderFixtureForE2e(
  db: SupabaseServiceClient,
  input: {
    name: string;
    parentId?: string;
  },
): Promise<SeededGoogleDriveFolderFixture> {
  const seeded = await seedGoogleDriveSandboxFile({
    db,
    name: input.name,
    mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
    ...(input.parentId ? { folderId: input.parentId } : {}),
    content: "",
  });
  return {
    fileId: seeded.fileId,
    name: seeded.name,
    connectedAccountId: seeded.connectedAccountId,
  };
}

export async function seedGoogleDriveFolderForE2e(
  scope: E2eFixtureScope,
  db: SupabaseServiceClient,
  input: {
    name: string;
    parentId?: string;
  },
): Promise<SeededGoogleDriveFolderFixture> {
  const { connectedAccountId, decisionUserId } = await requireGoogleDriveFixtureBinding(db);
  const write = await executeTypedCapabilityTool(db, googleDriveToolContracts, {
    capabilityId: GOOGLE_DRIVE_CAPABILITY_ID,
    toolName: "google_drive_folder_create",
    params: {
      connectedAccountId,
      name: input.name,
      ...(input.parentId ? { parentId: input.parentId } : {}),
    },
    trusted: true,
  });
  const executed = await approveGoogleDriveWrite({
    db,
    toolName: "google_drive_folder_create",
    write: write.write,
    decisionUserId,
  });
  const fileId = executedProviderId(executed, "google_drive_folder_create");

  scope.add({
    label: `google-drive:folder:${fileId}`,
    resource: {
      kind: "google-drive.file",
      connectedAccountId,
      fileId,
      name: input.name,
      label: `google-drive:folder:${fileId}`,
    },
    cleanup: async () => {
      await cleanupGoogleDriveFileId({ db, connectedAccountId, fileId, decisionUserId });
    },
  });

  return { fileId, name: input.name, connectedAccountId };
}

export async function seedGoogleDriveSandboxFileFixtureForE2e(
  db: SupabaseServiceClient,
  input: {
    name: string;
    mimeType: string;
    content: string;
    isBase64?: boolean;
    folderId?: string;
    description?: string;
  },
): Promise<SeededGoogleDriveFileFixture> {
  return seedGoogleDriveSandboxFile({
    db,
    name: input.name,
    mimeType: input.mimeType,
    ...(input.folderId ? { folderId: input.folderId } : {}),
    ...(input.description ? { description: input.description } : {}),
    content: input.content,
    ...(input.isBase64 ? { isBase64: input.isBase64 } : {}),
  });
}

export async function seedGoogleDriveFileForE2e(
  scope: E2eFixtureScope,
  db: SupabaseServiceClient,
  input: {
    name: string;
    mimeType: string;
    content: string;
    isBase64?: boolean;
    folderId?: string;
    description?: string;
  },
): Promise<SeededGoogleDriveFileFixture> {
  const { connectedAccountId, decisionUserId } = await requireGoogleDriveFixtureBinding(db);
  const write = await executeTypedCapabilityTool(db, googleDriveToolContracts, {
    capabilityId: GOOGLE_DRIVE_CAPABILITY_ID,
    toolName: "google_drive_file_upload",
    params: {
      connectedAccountId,
      name: input.name,
      source: {
        kind: "direct_content",
        content: input.content,
        mimeType: input.mimeType,
        ...(input.isBase64 ? { isBase64: true } : {}),
      },
      ...(input.folderId ? { folderId: input.folderId } : {}),
      ...(input.description ? { description: input.description } : {}),
    },
    trusted: true,
  });
  const executed = await approveGoogleDriveWrite({
    db,
    toolName: "google_drive_file_upload",
    write: write.write,
    decisionUserId,
  });
  const fileId = executedProviderId(executed, "google_drive_file_upload");

  scope.add({
    label: `google-drive:file:${fileId}`,
    resource: {
      kind: "google-drive.file",
      connectedAccountId,
      fileId,
      name: input.name,
      label: `google-drive:file:${fileId}`,
    },
    cleanup: async () => {
      await cleanupGoogleDriveFileId({ db, connectedAccountId, fileId, decisionUserId });
    },
  });

  return {
    fileId,
    name: input.name,
    connectedAccountId,
    ...(input.folderId ? { folderId: input.folderId } : {}),
  };
}
