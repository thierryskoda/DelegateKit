import {
  boldsignSendDocumentForSignatureOutputSchema,
  boldsignSendDocumentForSignatureInputSchema,
  boldsignSignatureRequestCancelInputSchema,
  boldsignSignatureRequestCancelOutputSchema,
  boldsignSignatureRequestRemindInputSchema,
  boldsignSignatureRequestRemindOutputSchema,
} from "@ai-assistants/boldsign-contracts/schemas";
import {
  body,
  detail,
  field,
  fields,
  preview,
  recordValue,
  section,
  textValue,
} from "../../product/actions/external-write-contracts/connect-detail";
import {
  buildExternalWriteAgentResult,
  lifecycleResultSentence,
  providerErrorMessage,
  quote,
  textField,
} from "../../product/actions/external-write-contracts/agent-result";
import {
  defineExternalWriteActionContract,
  type ExternalWriteActionContract,
} from "../../product/actions/external-write-contracts/types";
import { requireProfileArtifact } from "../../product/artifacts/artifact-validation";
import {
  executeBoldSignCancelPayload,
  executeBoldSignRemindPayload,
  executeBoldSignSendPayload,
} from "./send-payload-action";
import { requireBackendSecretProviderCapabilityAccount } from "../../integrations/provider-runtime";
import { requireOwnedBoldSignDocument } from "./document-ownership";

function buildBoldSignAgentResult(
  kind: "send" | "remind" | "cancel",
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  return buildExternalWriteAgentResult({
    action: input.action,
    payload: input.payload as Record<string, unknown>,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, payload, status, providerError }) => {
      const evidenceTitle = textField(recordValue(recordValue(action.review_payload)?.evidence)?.title);
      const document =
        textField(payload.title) ??
        evidenceTitle ??
        textField(payload.documentId) ??
        textField(payload.profileFileId);
      const documentLabel = document ? quote(document) : "the BoldSign document";
      const signerEmail = textField(payload.signerEmail);
      const target = signerEmail ? `${documentLabel} to ${signerEmail}` : documentLabel;
      const description =
        kind === "send"
          ? {
              completed: `Sent ${target} for signature.`,
              needsReview: `Sending ${target} for signature is waiting for review.`,
              processing: `Sending ${target} for signature is processing.`,
              failed: `Could not send ${target} for signature.`,
              unknown: `${target} may or may not have been sent for signature.`,
            }
          : kind === "remind"
            ? {
                completed: `Sent a BoldSign reminder for document ${textField(payload.documentId) ?? documentLabel}.`,
                needsReview: `Sending a BoldSign reminder for document ${textField(payload.documentId) ?? documentLabel} is waiting for review.`,
                processing: `Sending a BoldSign reminder for document ${textField(payload.documentId) ?? documentLabel} is processing.`,
                failed: `Could not send the BoldSign reminder for document ${textField(payload.documentId) ?? documentLabel}.`,
                unknown: `The BoldSign reminder for document ${textField(payload.documentId) ?? documentLabel} may or may not have been sent.`,
              }
            : {
                completed: `Canceled BoldSign signature request ${textField(payload.documentId) ?? documentLabel}.`,
                needsReview: `Canceling BoldSign signature request ${textField(payload.documentId) ?? documentLabel} is waiting for review.`,
                processing: `Canceling BoldSign signature request ${textField(payload.documentId) ?? documentLabel} is processing.`,
                failed: `Could not cancel BoldSign signature request ${textField(payload.documentId) ?? documentLabel}.`,
                unknown: `BoldSign signature request ${textField(payload.documentId) ?? documentLabel} may or may not have been canceled.`,
              };
      const failure = providerErrorMessage(providerError);
      return lifecycleResultSentence({
        status,
        actionId: action.id,
        ...description,
        failed: failure ? `${description.failed} ${failure}` : description.failed,
        unknown: failure ? `${description.unknown} ${failure}` : description.unknown,
      });
    },
  });
}

export const boldsignExternalWriteActionContracts: ExternalWriteActionContract[] = [
  defineExternalWriteActionContract({
    toolName: "boldsign_send_document_for_signature",
    actionPayloadSchema: boldsignSendDocumentForSignatureInputSchema,
    outputSchema: boldsignSendDocumentForSignatureOutputSchema,
    buildWritePlan: async (ctx) => {
      const actionPayload = boldsignSendDocumentForSignatureInputSchema.parse({
        profileFileId: Reflect.get(ctx.params, "profileFileId"),
        expectedSha256: Reflect.get(ctx.params, "expectedSha256"),
        signerEmail: Reflect.get(ctx.params, "signerEmail"),
        signerName: Reflect.get(ctx.params, "signerName"),
        title: Reflect.get(ctx.params, "title"),
      });
      const { artifact } = await requireProfileArtifact(ctx.db, {
        profileId: ctx.profileId,
        artifactId: actionPayload.profileFileId,
        allowedMimeTypes: ["application/pdf"],
        ...(actionPayload.expectedSha256 === undefined
          ? {}
          : { expectedSha256: actionPayload.expectedSha256 }),
      });
      return {
        actionPayload,
        requestHash: actionPayload.expectedSha256 ?? artifact.sha256,
        reviewTitle: `Send ${artifact.filename} for signature`,
        reviewSummary: `Send ${artifact.filename} to ${actionPayload.signerName} <${actionPayload.signerEmail}> for e-signature via BoldSign.`,
        reviewPayload: {
          type: "boldsign_send_document_for_signature",
          proposedChange: {
            signerName: actionPayload.signerName,
            signerEmail: actionPayload.signerEmail,
            title: actionPayload.title ?? artifact.filename,
          },
          evidence: {
            profileFileId: artifact.id,
            filename: artifact.filename,
            mimeType: artifact.mime_type,
            byteSize: artifact.byte_size,
            sha256: artifact.sha256,
          },
        },
      };
    },
    buildReviewDetail: ({ action, payload }) => {
      const evidence = recordValue(recordValue(action.review_payload)?.evidence);
      const filename = textValue(evidence?.filename);
      const title = textValue(payload.title) ?? filename ?? "this document";
      return detail(
        "boldsign_signature_request_send",
        `Do you approve sending "${title}" to ${payload.signerEmail} for signature?`,
        preview("View details", [
          section({
            title: "Signature request",
            fields: fields([
              field("Document", filename ?? title),
              field("Signer", payload.signerName),
              field("Signer email", payload.signerEmail),
              field("Title", payload.title),
            ]),
          }),
        ]),
      );
    },
    execute: async (db, action, payload) => {
      const p = boldsignSendDocumentForSignatureInputSchema.parse(payload);
      return executeBoldSignSendPayload(db, action, p);
    },
    buildAgentResult: (input) => buildBoldSignAgentResult("send", input),
  }),
  defineExternalWriteActionContract({
    toolName: "boldsign_signature_request_remind",
    actionPayloadSchema: boldsignSignatureRequestRemindInputSchema,
    outputSchema: boldsignSignatureRequestRemindOutputSchema,
    buildWritePlan: async (ctx) => {
      const actionPayload = boldsignSignatureRequestRemindInputSchema.parse({
        connectedAccountId: Reflect.get(ctx.params, "connectedAccountId"),
        documentId: Reflect.get(ctx.params, "documentId"),
        message: Reflect.get(ctx.params, "message"),
        onBehalfOf: Reflect.get(ctx.params, "onBehalfOf"),
      });
      const binding = await requireBackendSecretProviderCapabilityAccount(ctx.db, {
        profileId: ctx.profileId,
        providers: ["boldsign"],
        ...(actionPayload.connectedAccountId === undefined
          ? {}
          : { connectedAccountId: actionPayload.connectedAccountId }),
      });
      const ownership = await requireOwnedBoldSignDocument(ctx.db, {
        profileId: ctx.profileId,
        binding,
        documentId: actionPayload.documentId,
      });
      const documentLabel = ownership.title ?? "this BoldSign document";
      return {
        actionPayload,
        requestHash: actionPayload.documentId,
        reviewTitle: "Send BoldSign reminder",
        reviewSummary: `Send a BoldSign reminder for ${documentLabel}.`,
        reviewPayload: {
          type: "boldsign_signature_request_remind",
          proposedChange: {
            documentId: actionPayload.documentId,
            message: actionPayload.message,
            ...(actionPayload.onBehalfOf === undefined
              ? {}
              : { onBehalfOf: actionPayload.onBehalfOf }),
          },
          evidence: {
            title: ownership.title,
            signerEmail: ownership.signer_email,
            providerStatus: ownership.provider_status,
          },
        },
      };
    },
    buildReviewDetail: ({ payload }) =>
      detail(
        "boldsign_signature_request_remind",
        "Do you approve sending this BoldSign reminder?",
        preview("View details", [
          section({
            title: "Reminder",
            fields: fields([field("On behalf of", payload.onBehalfOf)]),
            body: body("Message", payload.message),
          }),
        ]),
      ),
    execute: async (db, action, payload) => {
      const p = boldsignSignatureRequestRemindInputSchema.parse(payload);
      return executeBoldSignRemindPayload(db, action, p);
    },
    buildAgentResult: (input) => buildBoldSignAgentResult("remind", input),
  }),
  defineExternalWriteActionContract({
    toolName: "boldsign_signature_request_cancel",
    actionPayloadSchema: boldsignSignatureRequestCancelInputSchema,
    outputSchema: boldsignSignatureRequestCancelOutputSchema,
    buildWritePlan: async (ctx) => {
      const actionPayload = boldsignSignatureRequestCancelInputSchema.parse({
        connectedAccountId: Reflect.get(ctx.params, "connectedAccountId"),
        documentId: Reflect.get(ctx.params, "documentId"),
        message: Reflect.get(ctx.params, "message"),
        onBehalfOf: Reflect.get(ctx.params, "onBehalfOf"),
      });
      const binding = await requireBackendSecretProviderCapabilityAccount(ctx.db, {
        profileId: ctx.profileId,
        providers: ["boldsign"],
        ...(actionPayload.connectedAccountId === undefined
          ? {}
          : { connectedAccountId: actionPayload.connectedAccountId }),
      });
      const ownership = await requireOwnedBoldSignDocument(ctx.db, {
        profileId: ctx.profileId,
        binding,
        documentId: actionPayload.documentId,
      });
      const documentLabel = ownership.title ?? "this BoldSign document";
      return {
        actionPayload,
        requestHash: actionPayload.documentId,
        reviewTitle: "Cancel BoldSign request",
        reviewSummary: `Cancel/revoke ${documentLabel}. Signers will no longer be able to view or sign it.`,
        reviewPayload: {
          type: "boldsign_signature_request_cancel",
          proposedChange: {
            documentId: actionPayload.documentId,
            message: actionPayload.message,
            ...(actionPayload.onBehalfOf === undefined
              ? {}
              : { onBehalfOf: actionPayload.onBehalfOf }),
          },
          evidence: {
            title: ownership.title,
            signerEmail: ownership.signer_email,
            providerStatus: ownership.provider_status,
          },
        },
      };
    },
    buildReviewDetail: ({ payload }) =>
      detail(
        "boldsign_signature_request_cancel",
        "Do you approve canceling this BoldSign request?",
        preview("View details", [
          section({
            title: "Cancellation",
            fields: fields([field("On behalf of", payload.onBehalfOf)]),
            body: body("Message", payload.message),
          }),
        ]),
      ),
    execute: async (db, action, payload) => {
      const p = boldsignSignatureRequestCancelInputSchema.parse(payload);
      return executeBoldSignCancelPayload(db, action, p);
    },
    buildAgentResult: (input) => buildBoldSignAgentResult("cancel", input),
  }),
];
