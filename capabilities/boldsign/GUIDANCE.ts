import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { boldsignToolContracts } from "@ai-assistants/boldsign-contracts/contracts";

export default definePluginGuidance({
  name: "boldsign_signature",
  plugin: plugin("boldsign"),
  description:
    "Load when the user asks about BoldSign, signatures, signed-document blockers, missing documents, mandate/deal next actions, checking readiness, sending a PDF artifact for signature, reminding or cancelling a request, reading signature status, or downloading signed files.",
  body: md`
# BoldSign Signature

Use BoldSign tools when the user wants to send a finalized PDF for signature, check signature request status, or understand document blockers/next actions where live signature status may matter.

## Status Evidence

- For signature status, blockers, missing documents, next actions, verification, and update drafts, call \`boldsign_signature_requests_list\` and use live signature evidence.
- BoldSign list results are already limited to this profile's assigned documents. Treat an empty result as no assigned matching request, not as permission to broaden into another client's documents.
- CRM, Drive, profile activity, or prior chat are not enough for current signature status.
- If signatures are connected, check matching live requests before saying there are no active signature blockers or outstanding signature items.
- Answer each requested status dimension: sent, viewed, signed, declined, expired, filed, or any other explicit dimension.
- If \`summary.viewedStatusAvailable\` is false, say viewed/opened status is unavailable from the provider.
- \`InProgress\` means not completed; it does not prove the signer has not opened or viewed the request.
- When \`summary.latestRequest\` is newer than \`summary.latestCompletedRequest\`, foreground that the latest matching request is still outstanding.
- Do not call in-progress requests stale duplicates or recommend cancellation unless current evidence proves they were superseded and the user asked about cleanup.

## Reply Boundaries

- Treat BoldSign request ids, document ids, file ids, and provider record ids as internal execution details.
- Describe requests by signer, document name, human status, and dates unless the user explicitly asks for technical ids.
- When confirming a send, do not name BoldSign in the client-visible reply unless the user mentioned or asked about BoldSign by name; say the signature request or signature email was sent.
- Convert UTC ISO timestamps to the profile timezone before saying "today", "just now", "minutes ago", or "hours ago". If you did not calculate elapsed local time, use exact local date/time or avoid relative wording.
- For signed-copy filing claims, verify storage with the owning file provider, usually Google Drive, for the named client/deal/folder.
- Do not say a downloaded BoldSign PDF is the same file as a Drive result unless current evidence proves it, such as a matching checksum, matching byte size plus matching document facts, or another explicit provider link. Similar names alone are not enough.
- If the signed PDF and Drive candidate do not match or cannot be compared, send the requested signed PDF when appropriate and say the Drive filing/equivalence remains unverified.
- Profile activity and assistant-saved artifacts show past attempts, not live filing evidence.
- If the only evidence is tiny, invalid, ambiguous, or mismatched, say the signed copy is not verified as properly filed and offer the next concrete step.

${coveredToolCatalog(boldsignToolContracts, {
  boldsign_signature_requests_list: true,
  boldsign_file_download: true,
  boldsign_send_document_for_signature: true,
  boldsign_signature_request_remind: true,
  boldsign_signature_request_cancel: true,
})}
`,
});
