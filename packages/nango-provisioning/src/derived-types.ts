import { NANGO_PROVISIONING_ENTRIES, type NangoProvisioningManifest } from "./manifest";

/** Canonical manifest tuple with literal `uniqueKey` values. */
export type { NangoProvisioningManifest };

export type NangoProvisionedUniqueKey = NangoProvisioningManifest[number]["uniqueKey"];

export type NangoMicrosoftDriveIntegrationKey =
  | "ai-assistants-microsoft-onedrive"
  | "ai-assistants-microsoft-sharepoint";

export function isNangoProvisionedUniqueKey(value: string): value is NangoProvisionedUniqueKey {
  return NANGO_PROVISIONING_ENTRIES.some((e) => e.uniqueKey === value);
}
