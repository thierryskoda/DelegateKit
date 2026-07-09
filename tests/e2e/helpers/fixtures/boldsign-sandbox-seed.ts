import { randomUUID } from "node:crypto";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { requireSupabaseData, type TableRow } from "@ai-assistants/control-db";
import { requireBackendSecretProviderCapabilityAccount } from "../../../../apps/backend/src/test-support/provider-runtime";
import {
  providerSandboxBinaryResponse,
  seedProviderSandboxOperationResponses,
} from "../provider-runtime/provider-sandbox-fixtures";
import {
  testingClientPlusEmail,
  testingJordanRowanMandatePdfContent,
} from "../test-data/testing-realistic-data";

const TESTING_PROFILE_ID = "testing";
const OTHER_PROFILE_ID = "testing-boldsign-ridgeway";

type BoldSignSandboxDocument = {
  documentId: string;
  title: string;
  status: string;
  sentDate: string;
  completedDate: string | null;
  signerEmail: string;
  labels: string[];
  metaData: Record<string, string>;
};

async function upsertOtherBoldSignProfile(db: SupabaseServiceClient): Promise<{
  profile: TableRow<"profiles">;
  capability: TableRow<"profile_capabilities">;
  account: TableRow<"connected_provider_accounts">;
  link: TableRow<"capability_account_links">;
}> {
  const authUserResult = await db.auth.admin.createUser({
    email: testingClientPlusEmail(`boldsign.ridgeway.${randomUUID().slice(0, 8)}`),
    email_confirm: true,
  });
  if (authUserResult.error) throw authUserResult.error;
  const authUser = authUserResult.data.user;
  if (!authUser) throw new Error("Create other BoldSign sandbox auth user returned no user.");
  const profileResult = await db
    .from("profiles")
    .upsert(
      {
        id: OTHER_PROFILE_ID,
        user_id: authUser.id,
        display_name: "Ridgeway Capital",
        status: "active",
        timezone: "America/Toronto",
        metadata: { e2eFixture: "boldsign-cross-profile" },
        preferences: {},
      },
      { onConflict: "id" },
    )
    .select()
    .single();
  const profile = requireSupabaseData(
    "Upsert other BoldSign sandbox profile",
    profileResult.data,
    profileResult.error,
  );

  const capabilityResult = await db
    .from("profile_capabilities")
    .upsert(
      {
        profile_id: OTHER_PROFILE_ID,
        capability_slug: "boldsign",
        status: "enabled",
        required: false,
        config: {},
      },
      { onConflict: "profile_id,capability_slug" },
    )
    .select()
    .single();
  const capability = requireSupabaseData(
    "Upsert other BoldSign sandbox capability",
    capabilityResult.data,
    capabilityResult.error,
  );

  const accountResult = await db
    .from("connected_provider_accounts")
    .upsert(
      {
        profile_id: OTHER_PROFILE_ID,
        provider: "boldsign",
        provider_account_id: "sandbox:boldsign:ridgeway",
        account_email: null,
        display_label: "Ridgeway BoldSign sandbox account",
        scopes: [],
        connection_status: "connected",
        credential_kind: "backend_secret",
        credential_status: "healthy",
        connected_at: new Date().toISOString(),
        nango_connection_id: null,
        nango_provider_config_key: null,
        metadata: { providerRuntime: "sandbox", capabilitySlug: "boldsign" },
      },
      { onConflict: "profile_id,provider,provider_account_id" },
    )
    .select()
    .single();
  const account = requireSupabaseData(
    "Upsert other BoldSign sandbox connected account",
    accountResult.data,
    accountResult.error,
  );

  const linkResult = await db
    .from("capability_account_links")
    .upsert(
      {
        profile_id: OTHER_PROFILE_ID,
        profile_capability_id: capability.id,
        connected_provider_account_id: account.id,
        capability_slug: "boldsign",
        provider: "boldsign",
        label: "Ridgeway BoldSign",
        status: "enabled",
        is_default: true,
        config: { providerRuntime: { mode: "sandbox" } },
        required: false,
        readiness_status: "ready",
        readiness_blocker_code: null,
        readiness_last_error: null,
        readiness_last_success_at: new Date().toISOString(),
        readiness_metadata: {},
      },
      { onConflict: "profile_capability_id,provider,label" },
    )
    .select()
    .single();
  const link = requireSupabaseData(
    "Upsert other BoldSign sandbox capability account link",
    linkResult.data,
    linkResult.error,
  );
  return { profile, capability, account, link };
}

function boldSignProviderDocument(document: BoldSignSandboxDocument): Record<string, unknown> {
  return {
    documentId: document.documentId,
    id: document.documentId,
    title: document.title,
    documentTitle: document.title,
    status: document.status,
    documentStatus: document.status,
    sentDate: document.sentDate,
    completedDate: document.completedDate,
    signerEmail: document.signerEmail,
    signerDetails: [{ signerEmail: document.signerEmail, status: document.status }],
    labels: document.labels,
    metaData: document.metaData,
  };
}

export async function seedBoldSignEmptyListSandboxForE2e(db: SupabaseServiceClient): Promise<void> {
  const binding = await requireBackendSecretProviderCapabilityAccount(db, {
    profileId: TESTING_PROFILE_ID,
    providers: ["boldsign"],
    capabilitySlugs: ["boldsign"],
  });
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey: "boldsign",
        operation: "boldsign.document.list",
        response: { result: [] },
      },
      {
        providerKey: "boldsign",
        operation: "boldsign.document.download",
        response: providerSandboxBinaryResponse({
          body: new TextEncoder().encode(
            testingJordanRowanMandatePdfContent("No active BoldSign request", "514-555-0198"),
          ),
          contentType: "application/pdf",
        }),
      },
    ],
  });
}

export async function seedBoldSignJordanRowanCompletedSandboxForE2e(
  db: SupabaseServiceClient,
): Promise<{ documentId: string; title: string }> {
  const documentId = "sandbox-boldsign-jordan-rowan-completed";
  const title = "Jordan Rowan mandate signature";
  const binding = await requireBackendSecretProviderCapabilityAccount(db, {
    profileId: TESTING_PROFILE_ID,
    providers: ["boldsign"],
    capabilitySlugs: ["boldsign"],
  });
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey: "boldsign",
        operation: "boldsign.document.list",
        response: {
          result: [
            boldSignProviderDocument({
              documentId,
              title,
              status: "Completed",
              sentDate: "2026-06-01T14:20:00.000Z",
              completedDate: "2026-06-02T18:45:00.000Z",
              signerEmail: "jordan.rowan@northstar-residential.example",
              labels: ["ai-assistants-profile-testing"],
              metaData: { assistantProfileId: TESTING_PROFILE_ID },
            }),
          ],
        },
      },
      {
        providerKey: "boldsign",
        operation: "boldsign.document.download",
        response: providerSandboxBinaryResponse({
          body: new TextEncoder().encode(
            testingJordanRowanMandatePdfContent("Completed signed mandate", "514-555-0198"),
          ),
          contentType: "application/pdf",
        }),
      },
    ],
  });
  const ownershipResult = await db.from("boldsign_documents").upsert(
    {
      profile_id: TESTING_PROFILE_ID,
      capability_account_link_id: binding.link.id,
      connected_provider_account_id: binding.account.id,
      provider_account_id: binding.account.provider_account_id,
      document_id: documentId,
      source: "maintainer_import",
      ownership_status: "assigned",
      provider_status: "Completed",
      title,
      signer_email: "jordan.rowan@northstar-residential.example",
      sent_at: "2026-06-01T14:20:00.000Z",
      completed_at: "2026-06-02T18:45:00.000Z",
      provider_metadata: { e2eFixture: "boldsign-jordan-rowan-completed" },
    },
    { onConflict: "provider_account_id,document_id" },
  );
  if (ownershipResult.error) throw ownershipResult.error;
  return { documentId, title };
}

export async function seedBoldSignCrossProfileSandboxForE2e(db: SupabaseServiceClient): Promise<{
  testingDocument: BoldSignSandboxDocument;
  otherDocument: BoldSignSandboxDocument;
}> {
  const binding = await requireBackendSecretProviderCapabilityAccount(db, {
    profileId: TESTING_PROFILE_ID,
    providers: ["boldsign"],
    capabilitySlugs: ["boldsign"],
  });
  const other = await upsertOtherBoldSignProfile(db);
  const testingDocument = {
    documentId: "sandbox-boldsign-jordan-rowan-profile-owned",
    title: "Jordan Rowan mandate signature",
    status: "Completed",
    sentDate: "2026-06-01T14:20:00.000Z",
    completedDate: "2026-06-02T18:45:00.000Z",
    signerEmail: "jordan.rowan@northstar-residential.example",
    labels: ["ai-assistants-profile-testing"],
    metaData: { assistantProfileId: TESTING_PROFILE_ID, clientMatter: "Jordan Rowan mandate" },
  } satisfies BoldSignSandboxDocument;
  const otherDocument = {
    documentId: "sandbox-boldsign-ridgeway-renewal-profile-owned",
    title: "Ridgeway Capital renewal authorization",
    status: "InProgress",
    sentDate: "2026-06-03T15:10:00.000Z",
    completedDate: null,
    signerEmail: "amelia.chen@ridgeway-capital.example",
    labels: ["ai-assistants-profile-testing-boldsign-ridgeway"],
    metaData: { assistantProfileId: OTHER_PROFILE_ID, clientMatter: "Ridgeway renewal" },
  } satisfies BoldSignSandboxDocument;
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey: "boldsign",
        operation: "boldsign.document.list",
        response: {
          result: [otherDocument].map(boldSignProviderDocument),
        },
      },
      {
        providerKey: "boldsign",
        operation: "boldsign.document.download",
        response: providerSandboxBinaryResponse({
          body: new TextEncoder().encode(
            testingJordanRowanMandatePdfContent("Completed signed mandate", "514-555-0198"),
          ),
          contentType: "application/pdf",
        }),
      },
    ],
  });
  const ownershipRows = [
    {
      profile_id: TESTING_PROFILE_ID,
      capability_account_link_id: binding.link.id,
      connected_provider_account_id: binding.account.id,
      provider_account_id: binding.account.provider_account_id,
      document_id: testingDocument.documentId,
      source: "maintainer_import",
      ownership_status: "assigned",
      provider_status: testingDocument.status,
      title: testingDocument.title,
      signer_email: testingDocument.signerEmail,
      sent_at: testingDocument.sentDate,
      completed_at: testingDocument.completedDate,
      provider_metadata: testingDocument.metaData,
    },
    {
      profile_id: OTHER_PROFILE_ID,
      capability_account_link_id: other.link.id,
      connected_provider_account_id: other.account.id,
      provider_account_id: other.account.provider_account_id,
      document_id: otherDocument.documentId,
      source: "maintainer_import",
      ownership_status: "assigned",
      provider_status: otherDocument.status,
      title: otherDocument.title,
      signer_email: otherDocument.signerEmail,
      sent_at: otherDocument.sentDate,
      completed_at: otherDocument.completedDate,
      provider_metadata: otherDocument.metaData,
    },
  ];
  const result = await db
    .from("boldsign_documents")
    .upsert(ownershipRows, { onConflict: "provider_account_id,document_id" });
  if (result.error) throw result.error;
  return { testingDocument, otherDocument };
}
