import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  toolOutputProperty,
  type ToolContract,
  writeToolDescription,
} from "@ai-assistants/tool-contracts";
import {
  boldsignFileDownloadInputSchema,
  boldsignFileDownloadOutputSchema,
  boldsignSendDocumentForSignatureInputSchema,
  boldsignSendDocumentForSignatureOutputSchema,
  boldsignSignatureRequestCancelInputSchema,
  boldsignSignatureRequestCancelOutputSchema,
  boldsignSignatureRequestRemindInputSchema,
  boldsignSignatureRequestRemindOutputSchema,
  boldsignSignatureRequestsListInputSchema,
  boldsignSignatureRequestsListOutputSchema,
} from "./schemas";

export const BOLDSIGN_PLUGIN_ID = "boldsign-tools";

export const boldsignToolContracts = [
  defineReadTool({
    name: "boldsign_signature_requests_list",
    pluginId: BOLDSIGN_PLUGIN_ID,
    label: "List Signature Requests (BoldSign)",
    description: readToolDescription({
      useWhen:
        "the user needs BoldSign signature request statuses, document/signature blockers, missing/next-action evidence for signed documents, or deal update drafts where signed-document status may matter",
      operation: "Searches, filters, and reads BoldSign signature requests",
      returns:
        "profile-scoped assigned signature request summaries, ISO timestamps, status counts, latest request, latest completed request, and whether viewed/opened evidence is available",
      notes: [
        "Results are scoped to the current profile's assigned BoldSign documents; user filters narrow that assigned set and must not be used as a client isolation mechanism.",
        "For a deal, mandate, or document blocker request, use this to check live signature status before claiming there are no active signature blockers.",
        "If BoldSign auth, setup, quota, rate limit, or provider availability prevents the read, surface that structured failure instead of inferring signature state.",
        "Use query for search text; do not pass searchText. Use limit for result count; do not pass pageSize.",
        "Use page=1 for the first page; increase page for ordinary pagination. Use nextCursor only when BoldSign returns a cursor for deep pagination.",
        "Use dateFilterType only with both startDate and endDate.",
        "If viewedStatusAvailable is false, answer viewed/opened status as unavailable instead of guessing from InProgress or Completed. InProgress means not completed; it does not prove the signer has not opened or viewed the request.",
        "When multiple matching requests exist, compare latestRequest with latestCompletedRequest before summarizing current state.",
        "If latestRequest is InProgress and newer than latestCompletedRequest, treat that newest request as active outstanding evidence unless current data proves it was superseded.",
        "If any returned request or statusCounts entry is InProgress, do not conclude there is no valid outstanding signature request merely because latestRequest is Revoked or a completed request exists. Treat each InProgress request as active outstanding evidence until current provider data proves that exact request was revoked, completed, expired, or superseded.",
        "Do not call returned signature requests test data, test duplicates, fake data, mock data, or invalid duplicates unless current BoldSign fields prove those exact document ids are invalid or superseded.",
        "Do not recommend sending a fresh mandate or signature request while InProgress requests exist unless the user explicitly asked to replace them or current evidence proves they are invalid; the clean next step is owner confirmation, follow-up, reminder, or a cleanup decision.",
        "For ordinary next-action recommendations, make the practical next step a follow-up, reminder, or owner-confirmation around the newest active request; do not recommend canceling in-progress requests as duplicates or prioritizing unrelated email cleanup unless the user asked about cleanup and current evidence proves which requests are superseded.",
        "Use sentAtProfileLocal and completedAtProfileLocal for client-visible dates/times when present. sentAt and completedAt are UTC ISO strings; do not infer local dates from them mentally.",
        "Provider Completed status and PDF content can conflict. If PDF analysis says the client signature is missing, incomplete, or placeholder-only, do not call the document fully signed without naming that caveat.",
        "If the user asks whether a signed copy is filed or saved, also use Google Drive tools such as google_drive_search or google_drive_folder_list before making a positive or negative filing claim; BoldSign status and profile activity alone do not prove live Drive filing.",
        "Never expose full or shortened BoldSign document ids in client-visible replies; use ids only for follow-up tool calls.",
      ],
    }),
    inputSchema: boldsignSignatureRequestsListInputSchema,
    outputSchema: boldsignSignatureRequestsListOutputSchema,
  }),
  defineWriteTool({
    name: "boldsign_file_download",
    pluginId: BOLDSIGN_PLUGIN_ID,
    label: "Download Signed File (BoldSign)",
    description: writeToolDescription({
      useWhen:
        "a completed or signed BoldSign document PDF must be delivered, filed, or attached later",
      operation: "Downloads a BoldSign document PDF and stores it as a bounded profile artifact",
      returns: "saved artifact metadata and safe failure details",
      sideEffect:
        "creates a durable profile artifact but does not send the file to the user by itself",
      safety:
        "the BoldSign document id must come from a prior scoped BoldSign result for this profile and identify the intended completed or signed document",
    }),
    inputSchema: boldsignFileDownloadInputSchema,
    outputSchema: boldsignFileDownloadOutputSchema,
  }),
  defineWriteTool({
    name: "boldsign_send_document_for_signature",
    pluginId: BOLDSIGN_PLUGIN_ID,
    label: "Send For Signature (BoldSign)",
    description: writeToolDescription({
      useWhen: "the user wants to send a finalized PDF artifact for signature through BoldSign",
      operation:
        "Sends the PDF artifact for signature with artifact ownership, hash, and idempotency checks",
      returns: `the ${toolOutputProperty(boldsignSendDocumentForSignatureOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: [
        "expectedSha256 is optional; supply it when a known digest is available to verify the PDF artifact",
        "This send tool uses the profile default BoldSign account; it does not accept connectedAccountId or onBehalfOf.",
        "The PDF must come from a rendered mandate template that includes hidden BoldSign definition markers {{@clientSig}} and {{@clientDate}}; placement is template-owned, not coordinate-based.",
      ],
      sideEffect:
        "may create a BoldSign signature request or create an approval-governed signature action",
      safety:
        "the PDF content must be ready for signing, include the required BoldSign definition markers, and artifact id, signer email/name, and signing intent must be clear",
    }),
    inputSchema: boldsignSendDocumentForSignatureInputSchema,
    outputSchema: boldsignSendDocumentForSignatureOutputSchema,
    externalAction: "boldsign.signature_request.send",
  }),
  defineWriteTool({
    name: "boldsign_signature_request_remind",
    pluginId: BOLDSIGN_PLUGIN_ID,
    label: "Send Signature Reminder (BoldSign)",
    description: writeToolDescription({
      useWhen: "the user wants to remind signers for an in-progress BoldSign request",
      operation: "Sends a BoldSign reminder email for a signature request",
      returns: `the ${toolOutputProperty(boldsignSignatureRequestRemindOutputSchema, "write")} lifecycle status and safe failure details`,
      doNotUse: "the request is not pending or signers no longer need to act",
      notes: ["message is required and is sent to signers via BoldSign"],
      sideEffect:
        "may send a BoldSign reminder email or create an approval-governed signature action",
      safety:
        "the exact pending signature request must come from a prior scoped BoldSign result for this profile",
    }),
    inputSchema: boldsignSignatureRequestRemindInputSchema,
    outputSchema: boldsignSignatureRequestRemindOutputSchema,
    externalAction: "boldsign.signature_request.remind",
  }),
  defineWriteTool({
    name: "boldsign_signature_request_cancel",
    pluginId: BOLDSIGN_PLUGIN_ID,
    label: "Cancel Signature Request (BoldSign)",
    description: writeToolDescription({
      useWhen: "the user wants to cancel an incomplete BoldSign signature request",
      operation: "Revokes the signature request so signers can no longer view or sign it",
      returns: `the ${toolOutputProperty(boldsignSignatureRequestCancelOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: ["message is required and is sent to signers as the cancellation reason"],
      sideEffect:
        "may revoke a BoldSign signature request or create an approval-governed signature action",
      safety:
        "the correct document id must come from a prior scoped BoldSign result for this profile and be confirmed because this is a destructive external write",
    }),
    inputSchema: boldsignSignatureRequestCancelInputSchema,
    outputSchema: boldsignSignatureRequestCancelOutputSchema,
    externalAction: "boldsign.signature_request.cancel",
  }),
] as const satisfies readonly ToolContract[];

export type BoldSignToolName = (typeof boldsignToolContracts)[number]["name"];
