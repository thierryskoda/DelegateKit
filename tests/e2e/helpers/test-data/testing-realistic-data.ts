import { createHash } from "node:crypto";

/**
 * Client-visible testing fixture values that should read like real agency CRM/email data.
 *
 * Policy:
 * - Correlation `marker` values belong in harness IDs, storage keys, Monday item titles
 *   (for titleContains lookup), and internal metadata — not in fields the assistant may quote.
 * - Keep committed identities synthetic and use IANA-reserved domains. Live test addresses come
 *   from the E2E profile environment and must never be copied into this source file.
 */

const TESTING_CLIENT_EMAIL_LOCAL_PART = "jordan.rowan";
const TESTING_CLIENT_EMAIL_DOMAIN = "example.org";

type TestingFixtureClient = {
  readonly person: {
    readonly firstName: string;
    readonly lastName: string;
    readonly fullName: string;
    readonly email: string;
    readonly gmail: string;
    readonly phone: string | null;
  };
  readonly company: {
    readonly name: string;
  };
  readonly deal: {
    readonly stageLabel: string;
    readonly dealValue: number;
  };
  readonly assistantInboxEmail: string;
  readonly search: {
    readonly gmailQueries: readonly string[];
    readonly outlookInboxSearchForClientEmail: string;
  };
  readonly documents: {
    readonly mandateTitle: string;
    readonly signatureTitlePrefix: string;
    readonly driveFileBodyPrefix: string;
    readonly driveFileDescriptionPrefix: string;
  };
  readonly secondary: {
    readonly signer: {
      readonly name: string;
      readonly email: string;
      readonly gmail: string;
    };
  };
};

export const TESTING_FIXTURE_CLIENT = {
  person: {
    firstName: "Jordan",
    lastName: "Rowan",
    fullName: "Jordan Rowan",
    email: "jordan.rowan@example.org",
    gmail: "jordan.rowan@example.org",
    phone: null,
  },
  company: {
    name: "Jordan Rowan",
  },
  deal: {
    stageLabel: "Qualified",
    dealValue: 42_100,
  },
  assistantInboxEmail: "advisor+assistant@example.org",
  search: {
    gmailQueries: [
      "Jordan Rowan",
      "Rowan",
      "from:jordan.rowan@example.org",
      "from:jordan.rowan@example.org has:attachment",
    ],
    outlookInboxSearchForClientEmail: "jordan.rowan@example.org",
  },
  documents: {
    mandateTitle: "Jordan Rowan mandate agreement",
    signatureTitlePrefix: "Jordan Rowan mandate signature",
    driveFileBodyPrefix: "Jordan Rowan client file",
    driveFileDescriptionPrefix: "Client file for Jordan Rowan deal review",
  },
  secondary: {
    signer: {
      name: "Morgan Ellis",
      email: "jordan.rowan+signer@example.org",
      gmail: "jordan.rowan+signer@example.org",
    },
  },
} as const satisfies TestingFixtureClient;

/** Stable local-part suffix from a harness marker (no testing-hv- prefix in user-visible text). */
export function markerEmailLocalPart(marker: string): string {
  const token = marker.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return token.length > 0 ? token.slice(-24) : "run";
}

export function clientReferenceForMarker(marker: string): string {
  const digest = createHash("sha256").update(marker).digest("hex").slice(0, 6).toUpperCase();
  return `FC-${digest}`;
}

export function testingClientPlusEmail(tag: string): string {
  const normalized = tag
    .replace(/[^a-z0-9]+/gi, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();
  return normalized
    ? `${TESTING_CLIENT_EMAIL_LOCAL_PART}+${normalized}@${TESTING_CLIENT_EMAIL_DOMAIN}`
    : `${TESTING_CLIENT_EMAIL_LOCAL_PART}@${TESTING_CLIENT_EMAIL_DOMAIN}`;
}

export function signerNameForMarker(marker: string): string {
  return `${TESTING_FIXTURE_CLIENT.secondary.signer.name} (${markerEmailLocalPart(marker)})`;
}

export function signerEmailForMarker(marker: string): string {
  return testingClientPlusEmail(`signer.${markerEmailLocalPart(marker)}`);
}

export function senderEmailForMarker(marker: string): string {
  return testingClientPlusEmail(`contracts.${markerEmailLocalPart(marker)}`);
}

export function mandateSignatureTitleForMarker(marker: string): string {
  return `${TESTING_FIXTURE_CLIENT.documents.signatureTitlePrefix} ${markerEmailLocalPart(marker)}`;
}

export function clientFullName(): string {
  return TESTING_FIXTURE_CLIENT.person.fullName;
}

export function clientEmailForMarker(marker: string): string {
  return testingClientPlusEmail(`client.${markerEmailLocalPart(marker)}`);
}

export function driveRoundtripFileBody(marker: string): string {
  return `${TESTING_FIXTURE_CLIENT.documents.driveFileBodyPrefix} ${markerEmailLocalPart(marker)}\nQuarterly review notes for the Jordan Rowan mandate folder.`;
}

export function driveRoundtripFileDescription(marker: string): string {
  return `${TESTING_FIXTURE_CLIENT.documents.driveFileDescriptionPrefix} (${markerEmailLocalPart(marker)})`;
}

export function driveRoundtripUpdatedDescription(marker: string): string {
  return `Updated client file notes for Jordan Rowan (${markerEmailLocalPart(marker)})`;
}

export function testingJordanRowanMondayItemTitle(marker: string): string {
  return `${TESTING_FIXTURE_CLIENT.company.name} ${markerEmailLocalPart(marker)}`;
}

export function testingJordanRowanSignedMandatePdfFileName(): string {
  return `${TESTING_FIXTURE_CLIENT.documents.mandateTitle} signed.pdf`;
}

export function testingJordanRowanMandateDraftPdfFileName(): string {
  return `${TESTING_FIXTURE_CLIENT.documents.mandateTitle} draft.pdf`;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function createSinglePageTextPdf(lines: readonly string[]): string {
  const textCommands = lines
    .map((line, index) => `${index === 0 ? "" : "T* "}${`(${escapePdfText(line)})`} Tj`)
    .join("\n");
  const stream = `BT
/F1 12 Tf
72 720 Td
14 TL
${textCommands}
ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>
stream
${stream}
endstream`,
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = body.length;
  const xrefRows = offsets
    .map((offset, index) =>
      index === 0 ? "0000000000 65535 f " : `${String(offset).padStart(10, "0")} 00000 n `,
    )
    .join("\n");

  return `${body}xref
0 ${offsets.length}
${xrefRows}
trailer
<< /Size ${offsets.length} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF`;
}

export function testingJordanRowanMandatePdfContent(label: string, phoneLine: string): string {
  return createSinglePageTextPdf([
    TESTING_FIXTURE_CLIENT.documents.mandateTitle,
    label,
    "Document status: final signed mandate.",
    `Signed by client: ${TESTING_FIXTURE_CLIENT.person.fullName}.`,
    "Client signature date: 2026-06-02.",
    "Advisor signature: John Moreau.",
    `Company: ${TESTING_FIXTURE_CLIENT.company.name}.`,
    "Opening fee: $4,200.",
    "Success fee: 2.5 percent of funded amount.",
    "Interest fee: 1.0 percent annual servicing fee.",
    `Client contact phone: ${phoneLine}`,
    `Final mandate terms for the ${TESTING_FIXTURE_CLIENT.person.fullName} deal.`,
    "No unsigned placeholders remain in this executed copy.",
  ]);
}
