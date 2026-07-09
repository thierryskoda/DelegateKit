import { z } from "zod";

/** Provider-originated events that can be routed into assistant work items. */
export const PROVIDER_ASSISTANT_WORK_EVENT_TYPES = [
  "google_calendar.event.changed",
  "outlook_calendar.event.changed",
  "gmail.email.received",
  "outlook_mail.email.received",
  "twilio.sms.received",
  "monday.item.created",
  "monday.item.updated",
  "boldsign.signature_request.changed",
  "google_drive.file.created",
  "google_drive.file.updated",
  "google_drive.file.deleted",
  "microsoft_onedrive.file.created",
  "microsoft_onedrive.file.updated",
  "microsoft_onedrive.file.deleted",
  "microsoft_sharepoint.file.created",
  "microsoft_sharepoint.file.updated",
  "microsoft_sharepoint.file.deleted",
] as const;

export type ProviderAssistantWorkEventType = (typeof PROVIDER_ASSISTANT_WORK_EVENT_TYPES)[number];

export const providerAssistantWorkEventTypeSchema = z.enum(PROVIDER_ASSISTANT_WORK_EVENT_TYPES);

const PROVIDER_ASSISTANT_WORK_EVENT_TYPE_SET = new Set<string>(PROVIDER_ASSISTANT_WORK_EVENT_TYPES);

export function isProviderAssistantWorkEventType(
  eventType: string,
): eventType is ProviderAssistantWorkEventType {
  return PROVIDER_ASSISTANT_WORK_EVENT_TYPE_SET.has(eventType);
}
