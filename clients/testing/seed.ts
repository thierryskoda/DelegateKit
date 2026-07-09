// Create-only bootstrap data: changing this file does not update an existing profile.
// For launched clients, change live DB state explicitly; runtime settings live in runtime.ts.
import { defineClientSeed } from "../../scripts/clients/schema";
import { testingInitialGuidance } from "../../scripts/clients/initial-guidance";

const disableLiveProviderWebhookSubscriptions = {
  providerWebhooks: { manageSubscriptions: false },
};

export default defineClientSeed({
  schemaVersion: 1,
  profile: {
    id: "testing",
    displayName: "John",
    timezone: "America/Toronto",
    status: "active",
  },
  portalUser: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "john.tremblay@example.com",
    password: "12345678",
  },
  initialAssistantName: "Ava",
  initialCapabilities: [
    {
      slug: "microsoft-onedrive",
      config: disableLiveProviderWebhookSubscriptions,
    },
    {
      slug: "microsoft-sharepoint",
      config: disableLiveProviderWebhookSubscriptions,
    },
    "microsoft-todo",
    {
      slug: "google-drive",
      config: disableLiveProviderWebhookSubscriptions,
    },
    {
      slug: "google-calendar",
      config: disableLiveProviderWebhookSubscriptions,
    },
    {
      slug: "outlook-calendar",
      config: disableLiveProviderWebhookSubscriptions,
    },
    {
      slug: "boldsign",
      config: disableLiveProviderWebhookSubscriptions,
    },
    {
      slug: "gmail",
      config: disableLiveProviderWebhookSubscriptions,
    },
    {
      slug: "outlook-mail",
      config: disableLiveProviderWebhookSubscriptions,
    },
    {
      slug: "monday",
      config: disableLiveProviderWebhookSubscriptions,
    },
    "phone",
    {
      slug: "phone",
      provider: "twilio-messaging",
      config: {
        messaging: {
          fromNumber: "+14165550100",
        },
      },
    },
    "document-tools",
    "file-analysis",
  ],
  initialChannels: null,
  initialWritePolicy: {
    defaultMode: "auto_execute",
    actions: {
      "google_drive.file.trash": "needs_review",
    },
  },
  initialAssistantWorkRoutes: [
    {
      eventType: "gmail.email.received",
      config: {
        instructions:
          "Check whether the received email is relevant to John's client or deal work. When it includes attachments from a likely client or deal, save the relevant file to the matching Google Drive folder and update Monday when the destination is clear. If it is not relevant, ignore the work item.",
      },
    },
    {
      eventType: "twilio.sms.received",
      config: {
        instructions:
          "Handle inbound SMS replies related to John's client or deal work. If the answer is known and safe, reply by SMS. If John needs to decide, message John with the sender, their text, and the specific decision needed.",
      },
    },
  ],
  initialScheduledTasks: [
    {
      key: "weekday-morning-brief",
      title: "Weekday morning brief",
      instructions:
        "Prepare a concise morning brief for John. Review today's calendar, recent relevant email, open approvals, signatures, and CRM/deal items that may need attention. Create a short prioritized update with only actionable items.",
      schedule: {
        kind: "cron",
        expr: "0 8 * * 1-5",
        timezone: "America/Toronto",
      },
    },
    {
      key: "weekday-afternoon-follow-up-review",
      title: "Weekday afternoon follow-up review",
      instructions:
        "Review John's active client and deal work for follow-ups that may be needed before the end of the business day. Focus on unanswered important emails, pending signatures, open approvals, and CRM items that appear stalled. Summarize recommended next actions.",
      schedule: {
        kind: "cron",
        expr: "0 15 * * 1-5",
        timezone: "America/Toronto",
      },
    },
    {
      key: "weekly-client-deal-review",
      title: "Weekly client and deal review",
      instructions:
        "Review John's client and deal workspace for the week ahead. Look for active deals, missing documents, pending signatures, unresolved approvals, and calendar commitments. Produce a compact weekly priority list with concrete next steps.",
      schedule: {
        kind: "cron",
        expr: "0 9 * * 1",
        timezone: "America/Toronto",
      },
    },
  ],
  initialGuidance: testingInitialGuidance,
});
