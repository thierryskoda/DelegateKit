import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type Json,
  type SupabaseServiceClient,
  type TableInsert,
  type TableRow,
  type TableUpdate,
} from "@ai-assistants/control-db";
import { boldSignDocumentRowSchema } from "@ai-assistants/control-plane-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { BackendSecretProviderCapabilityAccountBinding } from "../../integrations/provider-runtime";

export type BoldSignDocumentOwnershipSource =
  | "assistant_send"
  | "maintainer_import"
  | "webhook_observed";
export type BoldSignDocumentOwnershipStatus =
  | "assigned"
  | "pending_provider_confirmation"
  | "unassigned_review";

const BOLDSIGN_PROFILE_SCOPE_LABEL_PREFIX = "ai-assistants-profile";

function normalizeLabelPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new DomainError(domainCodes.BAD_REQUEST, "BoldSign profile scope requires a profile id.");
  }
  return normalized.slice(0, 80);
}

function boldSignProfileScopeLabel(profileId: string): string {
  return `${BOLDSIGN_PROFILE_SCOPE_LABEL_PREFIX}-${normalizeLabelPart(profileId)}`;
}

export function boldSignAssistantLabels(profileId: string): string[] {
  return [boldSignProfileScopeLabel(profileId)];
}

export type NormalizedBoldSignDocumentSummary = {
  documentId: string;
  providerStatus: string | null;
  title: string | null;
  signerEmail: string | null;
  sentAt: string | null;
  completedAt: string | null;
};

export function normalizeBoldSignDocumentSummary(input: {
  documentId: string;
  providerStatus?: string | null;
  title?: string | null;
  signerEmail?: string | null;
  sentAt?: string | null;
  completedAt?: string | null;
}): NormalizedBoldSignDocumentSummary {
  const documentId = input.documentId.trim();
  if (!documentId) {
    throw new DomainError(domainCodes.BAD_REQUEST, "BoldSign document id is required.");
  }
  return {
    documentId,
    providerStatus: input.providerStatus?.trim() || null,
    title: input.title?.trim() || null,
    signerEmail: input.signerEmail?.trim() || null,
    sentAt: input.sentAt ?? null,
    completedAt: input.completedAt ?? null,
  };
}

function bindingIds(binding: BackendSecretProviderCapabilityAccountBinding): {
  capabilityAccountLinkId: string;
  connectedProviderAccountId: string;
} {
  if (binding.link.profile_id !== binding.account.profile_id) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "BoldSign capability link and connected account belong to different profiles.",
      {
        details: {
          capabilityAccountLinkId: binding.link.id,
          connectedProviderAccountId: binding.account.id,
          linkProfileId: binding.link.profile_id,
          accountProfileId: binding.account.profile_id,
        },
      },
    );
  }
  return {
    capabilityAccountLinkId: binding.link.id,
    connectedProviderAccountId: binding.account.id,
  };
}

export async function upsertBoldSignDocumentOwnership(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    binding: BackendSecretProviderCapabilityAccountBinding;
    document: NormalizedBoldSignDocumentSummary;
    source: BoldSignDocumentOwnershipSource;
    ownershipStatus: BoldSignDocumentOwnershipStatus;
    providerMetadata?: Record<string, unknown>;
  },
): Promise<TableRow<"boldsign_documents">> {
  const ids = bindingIds(input.binding);
  if (input.binding.link.profile_id !== input.profileId) {
    throw new DomainError(domainCodes.CONFLICT, "BoldSign ownership profile does not match link.");
  }
  const providerMetadata = requireJsonObject(
    input.providerMetadata ?? {},
    "boldsignDocument.providerMetadata",
  ) as Record<string, Json>;
  const providerAccountId = input.binding.account.provider_account_id;
  const existingResult = await db
    .from("boldsign_documents")
    .select("id, profile_id, ownership_status")
    .eq("provider_account_id", providerAccountId)
    .eq("document_id", input.document.documentId)
    .maybeSingle();
  if (existingResult.error) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Could not inspect existing BoldSign document ownership.",
      {
        cause: existingResult.error,
        details: {
          providerAccountId,
          documentId: input.document.documentId,
        },
      },
    );
  }
  if (existingResult.data && existingResult.data.profile_id !== input.profileId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "BoldSign document is already assigned to another profile.",
      {
        details: {
          providerAccountId,
          documentId: input.document.documentId,
          existingOwnershipId: existingResult.data.id,
          existingProfileId: existingResult.data.profile_id,
          existingOwnershipStatus: existingResult.data.ownership_status,
          requestedProfileId: input.profileId,
        },
      },
    );
  }
  const row = {
    profile_id: input.profileId,
    capability_account_link_id: ids.capabilityAccountLinkId,
    connected_provider_account_id: ids.connectedProviderAccountId,
    provider_account_id: providerAccountId,
    document_id: input.document.documentId,
    source: input.source,
    ownership_status: input.ownershipStatus,
    provider_status: input.document.providerStatus,
    title: input.document.title,
    signer_email: input.document.signerEmail,
    sent_at: input.document.sentAt,
    completed_at: input.document.completedAt,
    provider_metadata: providerMetadata,
  } satisfies TableInsert<"boldsign_documents">;
  const result = await db
    .from("boldsign_documents")
    .upsert(row, { onConflict: "provider_account_id,document_id" })
    .select()
    .single();
  return boldSignDocumentRowSchema.parse(
    requireSupabaseData("Upsert BoldSign document ownership", result.data, result.error),
  );
}

export async function requireOwnedBoldSignDocument(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    binding: BackendSecretProviderCapabilityAccountBinding;
    documentId: string;
  },
): Promise<TableRow<"boldsign_documents">> {
  bindingIds(input.binding);
  const documentId = input.documentId.trim();
  if (!documentId) {
    throw new DomainError(domainCodes.BAD_REQUEST, "BoldSign document id is required.");
  }
  const result = await db
    .from("boldsign_documents")
    .select()
    .eq("profile_id", input.profileId)
    .eq("provider_account_id", input.binding.account.provider_account_id)
    .eq("document_id", documentId)
    .neq("ownership_status", "unassigned_review")
    .maybeSingle();
  if (result.error) {
    throw new DomainError(domainCodes.CONFLICT, "Could not verify BoldSign document ownership.", {
      cause: result.error,
      details: {
        profileId: input.profileId,
        providerAccountId: input.binding.account.provider_account_id,
        documentId,
      },
    });
  }
  if (!result.data) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      "BoldSign document is not assigned to this profile.",
      {
        details: {
          profileId: input.profileId,
          providerAccountId: input.binding.account.provider_account_id,
          documentId,
        },
      },
    );
  }
  return boldSignDocumentRowSchema.parse(result.data);
}

export async function listOwnedBoldSignDocumentIds(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    binding: BackendSecretProviderCapabilityAccountBinding;
    documentIds?: readonly string[];
  },
): Promise<Set<string>> {
  bindingIds(input.binding);
  let query = db
    .from("boldsign_documents")
    .select("document_id")
    .eq("profile_id", input.profileId)
    .eq("provider_account_id", input.binding.account.provider_account_id)
    .neq("ownership_status", "unassigned_review");
  const documentIds = input.documentIds?.map((id) => id.trim()).filter((id) => id.length > 0);
  if (documentIds && documentIds.length > 0) {
    query = query.in("document_id", documentIds);
  }
  const result = await query;
  const rows = requireSupabaseRows(
    "List owned BoldSign document ids",
    result.data,
    result.error,
  );
  return new Set(rows.map((row) => row.document_id));
}

export async function listOwnedBoldSignDocuments(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    binding: BackendSecretProviderCapabilityAccountBinding;
    limit: number;
  },
): Promise<Array<TableRow<"boldsign_documents">>> {
  bindingIds(input.binding);
  const result = await db
    .from("boldsign_documents")
    .select()
    .eq("profile_id", input.profileId)
    .eq("provider_account_id", input.binding.account.provider_account_id)
    .neq("ownership_status", "unassigned_review")
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(input.limit);
  return requireSupabaseRows(
    "List owned BoldSign documents",
    result.data,
    result.error,
  ).map((row) => boldSignDocumentRowSchema.parse(row));
}

export type BoldSignWebhookDocumentOwnershipResolution =
  | { status: "resolved"; document: TableRow<"boldsign_documents"> }
  | { status: "missing" }
  | { status: "ambiguous"; candidateCount: number };

export async function resolveBoldSignWebhookDocumentOwnership(
  db: SupabaseServiceClient,
  input: {
    documentId: string;
    connectedProviderAccountId?: string | null;
  },
): Promise<BoldSignWebhookDocumentOwnershipResolution> {
  const documentId = input.documentId.trim();
  if (!documentId) {
    throw new DomainError(domainCodes.BAD_REQUEST, "BoldSign document id is required.");
  }
  let query = db
    .from("boldsign_documents")
    .select()
    .eq("document_id", documentId)
    .neq("ownership_status", "unassigned_review")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (input.connectedProviderAccountId) {
    query = query.eq("connected_provider_account_id", input.connectedProviderAccountId);
  }
  const result = await query;
  const rows = requireSupabaseRows(
    "Resolve BoldSign webhook document ownership",
    result.data,
    result.error,
  ).map((row) => boldSignDocumentRowSchema.parse(row));
  if (rows.length === 0) return { status: "missing" };
  if (rows.length > 1) return { status: "ambiguous", candidateCount: rows.length };
  return { status: "resolved", document: rows[0]! };
}

export async function updateBoldSignDocumentOwnershipFromWebhook(
  db: SupabaseServiceClient,
  input: {
    ownershipId: string;
    providerStatus: string | null;
    title: string | null;
    completedAt: string | null;
  },
): Promise<TableRow<"boldsign_documents">> {
  const update = {
    provider_status: input.providerStatus,
    title: input.title,
    completed_at: input.completedAt,
    ownership_status: "assigned",
  } satisfies TableUpdate<"boldsign_documents">;
  const result = await db
    .from("boldsign_documents")
    .update(update)
    .eq("id", input.ownershipId)
    .select()
    .single();
  return boldSignDocumentRowSchema.parse(
    requireSupabaseData("Update BoldSign document ownership from webhook", result.data, result.error),
  );
}
