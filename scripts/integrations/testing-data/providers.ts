import {
  CONNECTED_TESTING_CAPABILITIES,
  type TestingCapabilityRequirement,
} from "../../../tests/e2e/helpers/readiness/testing-capability-readiness";

/** Providers included in testing-data audit/cleanup (excludes email). */
export const AUDITED_TESTING_CAPABILITIES = {
  googleCalendar: CONNECTED_TESTING_CAPABILITIES.googleCalendar,
  googleDrive: CONNECTED_TESTING_CAPABILITIES.googleDrive,
  monday: CONNECTED_TESTING_CAPABILITIES.monday,
  boldsign: CONNECTED_TESTING_CAPABILITIES.boldsign,
  microsoftOneDrive: {
    capabilitySlug: "microsoft-onedrive",
    provider: "microsoft-onedrive",
    label: "Microsoft OneDrive",
  },
} as const satisfies Record<string, TestingCapabilityRequirement>;

export const AUDIT_SEARCH_QUERIES = [
  "Jordan Rowan",
  "Rowan",
  "E2E",
  "AI Assistants",
  "testing-",
  "example.test",
] as const;
