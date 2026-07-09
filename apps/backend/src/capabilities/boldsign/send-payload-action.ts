import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { requireBackendSecretProviderCapabilityAccount } from "../../integrations/provider-runtime";
import {
  boldsignApiRemindDocument,
  boldsignApiRevokeDocument,
  boldsignApiSendDocument,
  type BoldSignTextTagDefinition,
} from "./api-client";
import {
  markProviderExecutionStarted,
  providerIdempotencyKey,
} from "../../product/actions/execution/provider-runtime";
import {
  recordProviderActionWriteReceipt,
  recordProviderWriteReceipt,
} from "../../product/actions/execution/provider-write-receipts";
import type { ActionResult } from "../../product/actions/execution/types";
import { downloadArtifactBytes } from "../../product/actions/execution/artifact-storage";
import { requireProfileArtifact } from "../../product/artifacts/artifact-validation";
import { z } from "zod";
import type {
  boldsignSendDocumentForSignatureInputSchema,
  boldsignSignatureRequestCancelInputSchema,
  boldsignSignatureRequestRemindInputSchema,
} from "@ai-assistants/boldsign-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  boldSignAssistantLabels,
  normalizeBoldSignDocumentSummary,
  requireOwnedBoldSignDocument,
  upsertBoldSignDocumentOwnership,
} from "./document-ownership";

type BoldSignSendForSignatureActionPayload = z.infer<
  typeof boldsignSendDocumentForSignatureInputSchema
>;
type BoldSignSignatureRequestRemindActionPayload = z.infer<
  typeof boldsignSignatureRequestRemindInputSchema
>;
type BoldSignSignatureRequestCancelActionPayload = z.infer<
  typeof boldsignSignatureRequestCancelInputSchema
>;

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

const boldSignTextTagMetadataSchema = z
  .object({
    boldSignTextTags: z
      .array(
        z
          .object({
            raw: z.string().min(1),
            fieldType: z.string().min(1),
            signerIndex: z.number().int().positive().nullable(),
            isRequired: z.boolean(),
            fieldId: z.string().min(1).nullable(),
            definitionId: z.string().min(1).nullable().optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .passthrough();

const mandateTextTagDefinitions = {
  clientSig: {
    DefinitionId: "clientSig",
    Type: "Signature",
    SignerIndex: 1,
    IsRequired: true,
    FieldId: "client_signature",
    Size: { Width: 260, Height: 70 },
  },
  clientDate: {
    DefinitionId: "clientDate",
    Type: "DateSigned",
    SignerIndex: 1,
    IsRequired: true,
    FieldId: "client_signed_date",
    Size: { Width: 120, Height: 24 },
  },
} as const satisfies Record<string, BoldSignTextTagDefinition>;

const requiredMandateDefinitionTagIds = ["clientsig", "clientdate"] as const;

function requireBoldSignMandateDefinitionTags(
  artifact: TableRow<"artifacts">,
): { textTagDefinitions: BoldSignTextTagDefinition[] } {
  const metadata = boldSignTextTagMetadataSchema.parse(artifact.metadata);
  const textTags = metadata.boldSignTextTags ?? [];
  const definitionIds = new Set(
    textTags
      .map((tag) => tag.definitionId?.toLowerCase())
      .filter((definitionId): definitionId is string => definitionId !== undefined),
  );
  const missingDefinitionTags = requiredMandateDefinitionTagIds.filter(
    (definitionId) => !definitionIds.has(definitionId),
  );
  if (missingDefinitionTags.length === 0) {
    return {
      textTagDefinitions: [
        mandateTextTagDefinitions.clientSig,
        mandateTextTagDefinitions.clientDate,
      ],
    };
  }

  throw new DomainError(
    domainCodes.BAD_REQUEST,
    [
      "BoldSign signature send requires the rendered PDF to come from a mandate template with exact BoldSign definition markers.",
      "Add hidden definition tags {{@clientSig}} and {{@clientDate}} at the exact client signature and signing-date locations, then render the template again.",
    ].join(" "),
    {
      details: {
        profileFileId: artifact.id,
        filename: artifact.filename,
        missingDefinitionTags,
        boldSignTextTags: textTags,
        requiredDefinitionTags: ["{{@clientSig}}", "{{@clientDate}}"],
      },
    },
  );
}

export async function executeBoldSignSendPayload(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: BoldSignSendForSignatureActionPayload,
): Promise<ActionResult> {
  const { profileFileId, expectedSha256, signerEmail, signerName, title } = payload;
  const { artifact } = await requireProfileArtifact(db, {
    profileId: action.profile_id,
    artifactId: profileFileId,
    allowedMimeTypes: ["application/pdf"],
    ...(expectedSha256 === undefined ? {} : { expectedSha256 }),
  });
  if (artifact.mime_type !== "application/pdf") {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `BoldSign can only send PDF artifacts; artifact ${artifact.id} has mime_type=${JSON.stringify(artifact.mime_type)}.`,
    );
  }
  const { textTagDefinitions } = requireBoldSignMandateDefinitionTags(artifact);
  const bytes = await downloadArtifactBytes(db, artifact);
  const binding = await requireBackendSecretProviderCapabilityAccount(db, {
    profileId: action.profile_id,
    providers: ["boldsign"],
  });
  const executionAction = await markProviderExecutionStarted(db, action);
  const result = await boldsignApiSendDocument({
    title: title || artifact.filename,
    files: [{ fileName: artifact.filename, content: bytes, mimeType: artifact.mime_type }],
    signers: [{ name: signerName, emailAddress: signerEmail }],
    textTagDefinitions,
    labels: boldSignAssistantLabels(action.profile_id),
    metadata: {
      assistantProfileId: action.profile_id,
      assistantDocumentOwner: action.profile_id,
      assistantActionId: action.id,
    },
    sandbox: { db, binding },
  });
  const documentId = firstString(result.documentId, result.document_id, result.id);
  if (!documentId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "BoldSign send did not return a document id; refusing to mark the action executed without ownership.",
      {
        details: {
          profileId: action.profile_id,
          actionId: action.id,
          profileFileId: artifact.id,
        },
      },
    );
  }
  const ownership = await upsertBoldSignDocumentOwnership(db, {
    profileId: action.profile_id,
    binding,
    document: normalizeBoldSignDocumentSummary({
      documentId,
      providerStatus: firstString(result.status, result.documentStatus),
      title: title || artifact.filename,
      signerEmail,
      sentAt: new Date().toISOString(),
    }),
    source: "assistant_send",
    ownershipStatus: "pending_provider_confirmation",
    providerMetadata: {
      profileFileId: artifact.id,
      profileActionId: action.id,
      signatureFieldPlacementStrategy: "boldsign_text_tags",
    },
  });
  await recordProviderWriteReceipt(db, {
    profileId: action.profile_id,
    capabilityAccountLinkId: binding.link.id,
    connectedProviderAccountId: binding.account.id,
    providerKey: "boldsign",
    capabilitySlug: "boldsign",
    toolName: action.tool_name,
    profileActionId: action.id,
    externalResourceType: "boldsign.document",
    externalResourceId: documentId,
    operation: "send",
    startedAt:
      executionAction.provider_execution_started_at ??
      action.provider_execution_started_at ??
      new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    metadata: {
      boldsignDocumentOwnershipId: ownership.id,
      signerEmail,
      signerName,
      title: title || artifact.filename,
      profileFileId: artifact.id,
      signatureFieldPlacementStrategy: "boldsign_text_tags",
    },
  });
  return {
    status: "executed",
    provider: "boldsign",
    result: { ...result, idempotencyKey: providerIdempotencyKey(executionAction) },
  };
}

export async function executeBoldSignRemindPayload(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: BoldSignSignatureRequestRemindActionPayload,
): Promise<ActionResult> {
  const binding = await requireBackendSecretProviderCapabilityAccount(db, {
    profileId: action.profile_id,
    providers: ["boldsign"],
    ...(payload.connectedAccountId === undefined
      ? {}
      : { connectedAccountId: payload.connectedAccountId }),
  });
  await requireOwnedBoldSignDocument(db, {
    profileId: action.profile_id,
    binding,
    documentId: payload.documentId,
  });
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const result = await boldsignApiRemindDocument({
    documentId: payload.documentId,
    message: payload.message,
    ...(payload.onBehalfOf === undefined ? {} : { onBehalfOf: payload.onBehalfOf }),
    sandbox: { db, binding },
  });
  await recordProviderActionWriteReceipt(db, action, binding, {
    providerKey: "boldsign",
    capabilitySlug: "boldsign",
    toolName: "boldsign_signature_request_remind",
    externalResourceType: "boldsign.document",
    externalResourceId: payload.documentId,
    operation: "remind",
    startedAt,
    result,
    metadata: { idempotencyKey: providerIdempotencyKey(executionAction) },
  });
  return {
    status: "executed",
    provider: "boldsign",
    result: {
      ...result,
      documentId: payload.documentId,
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}

export async function executeBoldSignCancelPayload(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: BoldSignSignatureRequestCancelActionPayload,
): Promise<ActionResult> {
  const binding = await requireBackendSecretProviderCapabilityAccount(db, {
    profileId: action.profile_id,
    providers: ["boldsign"],
    ...(payload.connectedAccountId === undefined
      ? {}
      : { connectedAccountId: payload.connectedAccountId }),
  });
  await requireOwnedBoldSignDocument(db, {
    profileId: action.profile_id,
    binding,
    documentId: payload.documentId,
  });
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const result = await boldsignApiRevokeDocument({
    documentId: payload.documentId,
    message: payload.message,
    ...(payload.onBehalfOf === undefined ? {} : { onBehalfOf: payload.onBehalfOf }),
    sandbox: { db, binding },
  });
  await recordProviderActionWriteReceipt(db, action, binding, {
    providerKey: "boldsign",
    capabilitySlug: "boldsign",
    toolName: "boldsign_signature_request_cancel",
    externalResourceType: "boldsign.document",
    externalResourceId: payload.documentId,
    operation: "cancel",
    startedAt,
    result,
    metadata: { idempotencyKey: providerIdempotencyKey(executionAction) },
  });
  return {
    status: "executed",
    provider: "boldsign",
    result: {
      ...result,
      documentId: payload.documentId,
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}
