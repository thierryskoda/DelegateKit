import type { ClientGuidance } from "./schema";

const sharedMandateFields =
  "`mandate_date`, `client_company_name`, `client_company_address`, `client_name`, `opening_fee`, `success_fee`, `interest_fee`, `termination_notice_days`, and `today_signature_date`";

function mandateGuidance(input: {
  key: string;
  title: string;
  selectorDescription: string;
  clientName: string;
  includesMondayColumnApproval?: boolean;
}): ClientGuidance {
  const mondayColumnApproval = input.includesMondayColumnApproval
    ? [
        `- If mandate fields are missing from Monday, confirm the gap with Monday first. Only add a Monday column after ${input.clientName} explicitly approves tracking that field.`,
      ]
    : [];
  return {
    key: input.key,
    title: input.title,
    selectorDescription: input.selectorDescription,
    bodyMarkdown: [
      `## ${input.title}`,
      "",
      `- ${input.clientName} may ask you to generate, preview, send, or follow up on a mandate for a client.`,
      `- ${input.clientName} has separate French and English mandate templates. Choose from the client's known language preference when reliable; otherwise ask which language to use before rendering.`,
      `- A mandate requires explicit client, company, fee, signer, date, and template details. Do not guess missing or ambiguous facts; ask only for the facts needed to continue.`,
      `- The mandate template field keys are ${sharedMandateFields}. Use these exact keys with the document template renderer; do not invent alternate field names.`,
      ...mondayColumnApproval,
      "- Resolve CRM facts from Monday before relying on assumptions.",
      "- The template should be a DOCX file in Google Drive. Search Drive for the requested or selected template first, save the chosen Drive file as a document artifact, then render that artifact with explicit field values.",
      "- Mandate templates that may be sent for signature must include tiny hidden signing definition tags at the exact signing locations: `{{@clientSig}}` for the client signature field and `{{@clientDate}}` when the signing service should populate the signing date. Do not place signature fields by coordinates.",
      "- Do not convert a mandate template to PDF to fill, inspect, validate, or preview it. Render the template directly; if template fields and provided values do not match, treat the render error as the source of truth and explain the missing or extra fields plainly.",
      "- After rendering, verify the generated PDF itself before saying it is ready. Confirm the requested values are present and no template placeholders remain. Expected hidden signing markers are not normal template fields and must not count as unreplaced placeholders.",
      "- If a client signature date line is intentionally blank for signing, say that plainly instead of claiming nothing is blank. Do not show raw signing marker strings in visible status, verification summaries, or previews.",
      `- Send the rendered PDF preview in the current chat for ${input.clientName}'s review first. ${input.clientName} must review the exact preview before you send for signature, deliver externally, or update CRM states.`,
      "- Keep the preview reply concise and client-facing: use normal labels, do not show raw template field keys, do not show raw signing marker syntax, do not name the signature provider unless asked, and never paste artifact delivery references or media directives.",
      `- Send the document for signature only after ${input.clientName}'s explicit approval of the preview. If the rendered PDF is missing required signing markers, explain that the selected template must be updated and re-rendered; do not use another file or guess a placement.`,
      "- Deliver externally only after preview review and recipient confirmation.",
      "- If a manually signed mandate arrives by email, identify the file and match it to the right client and mandate. If ambiguous, ask for confirmation rather than guessing.",
    ].join("\n"),
  };
}

export const testingInitialGuidance = [
  {
    key: "testing_client_work_sources",
    title: "John's Client Work Sources",
    selectorDescription:
      "Use when John asks about client work, deal documents, files, CRM records, email attachments, workspace organization, or provider source-of-truth choices.",
    bodyMarkdown: [
      "## John's Client Work Sources",
      "",
      "- John uses this assistant for client and deal work across email, CRM, files, calendar, document, and signature workflows.",
      "- Google Drive is John's source of truth for client and deal documents. When John asks about a named client, deal, mandate, contract, signed document, or attachment, search Drive before saying the file is unavailable.",
      "- Monday is John's CRM. Use Monday for deal status, next actions, owners, missing information, and client pipeline questions.",
      "- When John receives or forwards a deal-related email with attachments, identify the likely client or deal, save clearly relevant attachments to the matching Drive folder when the destination is clear, and tell John what was saved.",
      "- John is comfortable with workspace organization work such as creating Drive folders, renaming files, and adding missing Monday columns when the target and purpose are clear.",
    ].join("\n"),
  },
  mandateGuidance({
    key: "testing_mandate_flow",
    title: "John's Mandate Flow",
    selectorDescription:
      "Use when John asks to generate, preview, send, sign, verify, or follow up on a client mandate package.",
    clientName: "John",
    includesMondayColumnApproval: true,
  }),
] satisfies ClientGuidance[];

const initialGuidanceByProfileId = {
  testing: testingInitialGuidance,
} as const satisfies Record<string, readonly ClientGuidance[]>;

export function initialGuidanceForProfileId(profileId: string): readonly ClientGuidance[] {
  const guidanceByProfileId: Record<string, readonly ClientGuidance[]> =
    initialGuidanceByProfileId;
  return guidanceByProfileId[profileId] ?? [];
}
