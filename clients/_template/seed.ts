// Create-only bootstrap data: changing this file does not update an existing profile.
// For launched clients, change live DB state explicitly; runtime settings live in runtime.ts.
import { defineClientSeed } from "../../scripts/clients/schema";

export default defineClientSeed({
  schemaVersion: 1,
  profile: {
    id: "acme",
    displayName: "Acme Client",
    timezone: "America/Toronto",
    status: "active",
  },
  portalUser: {
    email: "client@example.com",
    password: "12345678",
  },
  initialAssistantName: "Acme Assistant",
  initialChannels: [
    {
      provider: "telegram",
      externalIdentity: "123456789",
      accountId: "default",
      status: "active",
      deliveryConfig: {},
    },
  ],
  initialCapabilities: [
    "google-drive",
    "gmail",
    "monday",
    "boldsign",
    "document-tools",
    "file-analysis",
  ],
  initialWritePolicy: {
    defaultMode: "auto_execute",
    actions: {
      "gmail.message.send": "needs_review",
      "gmail.message.reply": "needs_review",
      "gmail.message.forward": "needs_review",
      "boldsign.signature_request.send": "needs_review",
      "monday.item.create": "needs_review",
      "monday.item.update": "needs_review",
    },
  },
  initialAssistantWorkRoutes: [],
  initialScheduledTasks: null,
  initialGuidance: [
    {
      key: "acme_client_work_sources",
      title: "Acme Client Work Sources",
      selectorDescription:
        "Use when Acme Client asks about client work, deal files, CRM records, documents, signatures, email, or attachment handling.",
      bodyMarkdown: [
        "## Acme Client Work Sources",
        "",
        "- Acme Client uses this assistant for client and deal work across email, files, CRM, documents, and signatures.",
        "- Google Drive is the document source of truth. Search Drive when the client asks about a named client, deal, folder, document, signed file, or attachment.",
        "- Monday is the CRM source of truth. Use Monday for deal status, next actions, owners, missing information, and pipeline questions.",
        "- When an email or attachment appears related to a client or deal, identify the likely workspace location before saving or summarizing it.",
      ].join("\n"),
    },
  ],
});
