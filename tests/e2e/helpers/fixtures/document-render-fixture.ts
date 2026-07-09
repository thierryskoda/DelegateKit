import { createHash } from "node:crypto";
import { requireSupabaseData, type SupabaseServiceClient } from "@ai-assistants/control-db";
import { recordArtifact } from "../../../../apps/backend/src/test-support/artifacts";
import PizZip from "pizzip";

const E2E_PROFILE_ARTIFACTS_BUCKET = "profile-artifacts";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function ensureProfileArtifactsBucket(db: SupabaseServiceClient): Promise<void> {
  const existing = await db.storage.getBucket(E2E_PROFILE_ARTIFACTS_BUCKET);
  if (!existing.error) return;

  const created = await db.storage.createBucket(E2E_PROFILE_ARTIFACTS_BUCKET, {
    public: false,
  });
  if (!created.error) return;
  if (/already exists/i.test(created.error.message)) return;
  throw new Error(
    `Ensure ${E2E_PROFILE_ARTIFACTS_BUCKET} storage bucket: ${created.error.message}`,
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function e2eDocxTemplateBytes(input: { documentBodyXml?: string } = {}): Uint8Array {
  const documentBodyXml =
    input.documentBodyXml ??
    `<w:p><w:r><w:t>Mandate for {client_name} at {company_name}. Address: {company_address}. Fees: {onboarding_fee} and {success_fee}. Email: {client_email}.</w:t></w:r></w:p>`;
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder("_rels")!.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.folder("word")!.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${documentBodyXml}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`,
  );
  return new Uint8Array(zip.generate({ type: "nodebuffer" }));
}

export async function seedDocumentTemplateArtifact(
  db: SupabaseServiceClient,
  input: { profileId: string; marker: string; documentBodyXml?: string },
) {
  await ensureProfileArtifactsBucket(db);
  const bytes = e2eDocxTemplateBytes({ documentBodyXml: input.documentBodyXml });
  const storageKey = `${input.profileId}/e2e/document-renders/${input.marker}/mandate-template.docx`;
  const uploaded = await db.storage.from(E2E_PROFILE_ARTIFACTS_BUCKET).upload(storageKey, bytes, {
    contentType: DOCX_MIME_TYPE,
    upsert: true,
  });
  if (uploaded.error) throw uploaded.error;
  return recordArtifact(db, {
    profileId: input.profileId,
    storageBucket: E2E_PROFILE_ARTIFACTS_BUCKET,
    storageKey,
    filename: `mandate-template-${input.marker}.docx`,
    artifactType: "document.template",
    mimeType: DOCX_MIME_TYPE,
    byteSize: bytes.byteLength,
    sha256: sha256(bytes),
    metadata: { source: "document-tools-e2e", marker: input.marker },
  });
}

export async function seedDocumentArtifact(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    marker: string;
    filename: string;
    artifactType: string;
    mimeType: string;
    bytes: Uint8Array;
  },
) {
  await ensureProfileArtifactsBucket(db);
  const storageKey = `${input.profileId}/e2e/document-renders/${input.marker}/${input.filename}`;
  const uploaded = await db.storage.from(E2E_PROFILE_ARTIFACTS_BUCKET).upload(storageKey, input.bytes, {
    contentType: input.mimeType,
    upsert: true,
  });
  if (uploaded.error) throw uploaded.error;
  return recordArtifact(db, {
    profileId: input.profileId,
    storageBucket: E2E_PROFILE_ARTIFACTS_BUCKET,
    storageKey,
    filename: input.filename,
    artifactType: input.artifactType,
    mimeType: input.mimeType,
    byteSize: input.bytes.byteLength,
    sha256: sha256(input.bytes),
    metadata: { source: "document-tools-e2e", marker: input.marker },
  });
}

export async function cleanupDocumentTemplateArtifact(
  db: SupabaseServiceClient,
  artifact: { id: string; storage_bucket: string; storage_key: string } | null,
): Promise<void> {
  if (!artifact) return;
  const deletedArtifact = await db.from("artifacts").delete().eq("id", artifact.id).select("id");
  requireSupabaseData(
    "Delete E2E document template artifact",
    deletedArtifact.data ?? [],
    deletedArtifact.error,
  );
  await db.storage.from(artifact.storage_bucket).remove([artifact.storage_key]);
}

export async function cleanupRenderedDocumentArtifacts(
  db: SupabaseServiceClient,
  artifacts: readonly { id: string; storage_bucket: string; storage_key: string }[],
): Promise<void> {
  for (const artifact of artifacts) {
    const deletedArtifact = await db.from("artifacts").delete().eq("id", artifact.id).select("id");
    requireSupabaseData(
      "Delete E2E rendered document artifact",
      deletedArtifact.data ?? [],
      deletedArtifact.error,
    );
    await db.storage.from(artifact.storage_bucket).remove([artifact.storage_key]);
  }
}
