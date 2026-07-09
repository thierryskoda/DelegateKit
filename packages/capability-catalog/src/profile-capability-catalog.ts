import type { CapabilityKind } from "./capability-metadata";

export type ProfileCapabilitySpec = {
  slug: string;
  pluginId: string;
  label: string;
  kind: CapabilityKind;
  defaultProvider: string;
  requiredExternalActions: readonly string[];
};

export const PROFILE_CAPABILITY_CATALOG = {
  boldsign: {
    slug: "boldsign",
    pluginId: "boldsign-tools",
    label: "BoldSign",
    kind: "external_integration",
    defaultProvider: "boldsign",
    requiredExternalActions: [
      "boldsign.signature_request.send",
      "boldsign.signature_request.remind",
      "boldsign.signature_request.cancel",
    ],
  },
  "microsoft-onedrive": {
    slug: "microsoft-onedrive",
    pluginId: "microsoft-onedrive-tools",
    label: "Microsoft OneDrive",
    kind: "external_integration",
    defaultProvider: "microsoft-onedrive",
    requiredExternalActions: [
      "microsoft_onedrive.folder.create",
      "microsoft_onedrive.item.update",
      "microsoft_onedrive.item.move",
      "microsoft_onedrive.item.copy",
      "microsoft_onedrive.item.delete",
      "microsoft_onedrive.file.upload",
      "microsoft_onedrive.sharing_link.create",
      "microsoft_onedrive.invitation.send",
      "microsoft_onedrive.permission.delete",
    ],
  },
  "microsoft-sharepoint": {
    slug: "microsoft-sharepoint",
    pluginId: "microsoft-sharepoint-tools",
    label: "Microsoft SharePoint",
    kind: "external_integration",
    defaultProvider: "microsoft-sharepoint",
    requiredExternalActions: [],
  },
  "microsoft-todo": {
    slug: "microsoft-todo",
    pluginId: "microsoft-todo-tools",
    label: "Microsoft To Do",
    kind: "external_integration",
    defaultProvider: "microsoft-todo",
    requiredExternalActions: [
      "microsoft_todo.task.create",
      "microsoft_todo.task.update",
      "microsoft_todo.task.complete",
      "microsoft_todo.task.delete",
    ],
  },
  "google-drive": {
    slug: "google-drive",
    pluginId: "google-drive-tools",
    label: "Google Drive",
    kind: "external_integration",
    defaultProvider: "google-drive",
    requiredExternalActions: [
      "google_drive.folder.create",
      "google_drive.file.rename",
      "google_drive.file.update_description",
      "google_drive.file.move",
      "google_drive.file.copy",
      "google_drive.file.upload",
      "google_drive.file.trash",
      "google_drive.file.restore",
      "google_drive.file.delete",
      "google_drive.file.share",
      "google_drive.permission.update",
      "google_drive.permission.delete",
    ],
  },
  "google-calendar": {
    slug: "google-calendar",
    pluginId: "google-calendar-tools",
    label: "Google Calendar",
    kind: "external_integration",
    defaultProvider: "google-calendar",
    requiredExternalActions: [
      "google_calendar.event.create",
      "google_calendar.event.modify",
      "google_calendar.event.cancel",
    ],
  },
  "outlook-calendar": {
    slug: "outlook-calendar",
    pluginId: "outlook-calendar-tools",
    label: "Outlook Calendar",
    kind: "external_integration",
    defaultProvider: "outlook-calendar",
    requiredExternalActions: [
      "outlook_calendar.event.create",
      "outlook_calendar.event.modify",
      "outlook_calendar.event.cancel",
    ],
  },
  gmail: {
    slug: "gmail",
    pluginId: "gmail-tools",
    label: "Gmail",
    kind: "external_integration",
    defaultProvider: "gmail",
    requiredExternalActions: [
      "gmail.message.send",
      "gmail.message.reply",
      "gmail.message.forward",
      "gmail.message.move",
      "gmail.message.mark_read",
      "gmail.message.delete",
    ],
  },
  "outlook-mail": {
    slug: "outlook-mail",
    pluginId: "outlook-mail-tools",
    label: "Outlook Mail",
    kind: "external_integration",
    defaultProvider: "outlook-mail",
    requiredExternalActions: [
      "outlook_mail.message.send",
      "outlook_mail.message.reply",
      "outlook_mail.message.forward",
      "outlook_mail.message.move",
      "outlook_mail.message.mark_read",
      "outlook_mail.message.delete",
    ],
  },
  monday: {
    slug: "monday",
    pluginId: "monday-tools",
    label: "Monday",
    kind: "external_integration",
    defaultProvider: "monday",
    requiredExternalActions: [
      "monday.item.create",
      "monday.item.update",
      "monday.item.archive",
      "monday.item.move_to_group",
      "monday.update.create",
      "monday.update.edit",
      "monday.update.delete",
      "monday.subitem.create",
      "monday.subitem.update",
      "monday.subitem.archive",
      "monday.file.add_to_column",
      "monday.file.add_to_update",
      "monday.board.create",
      "monday.board.rename",
      "monday.board.delete",
      "monday.column.create",
      "monday.column.rename",
      "monday.column.delete",
      "monday.group.create",
      "monday.group.rename",
      "monday.group.delete",
    ],
  },
  "document-tools": {
    slug: "document-tools",
    pluginId: "document-tools",
    label: "Document Tools",
    kind: "backend_document",
    defaultProvider: "document-tools",
    requiredExternalActions: [],
  },
  "file-analysis": {
    slug: "file-analysis",
    pluginId: "file-analysis-tools",
    label: "File Analysis",
    kind: "backend_document",
    defaultProvider: "file-analysis",
    requiredExternalActions: [],
  },
  "public-web": {
    slug: "public-web",
    pluginId: "public-web-tools",
    label: "Public Web",
    kind: "backend_workflow",
    defaultProvider: "perplexity",
    requiredExternalActions: [],
  },
  phone: {
    slug: "phone",
    pluginId: "phone-tools",
    label: "Phone",
    kind: "backend_workflow",
    defaultProvider: "twilio-voice",
    requiredExternalActions: ["phone.call.start", "phone.sms.send"],
  },
} as const satisfies Record<string, ProfileCapabilitySpec>;

export type ProfileCapabilitySlug = keyof typeof PROFILE_CAPABILITY_CATALOG;

export function isProfileCapabilitySlug(slug: string): slug is ProfileCapabilitySlug {
  return Object.prototype.hasOwnProperty.call(PROFILE_CAPABILITY_CATALOG, slug);
}

export function profileCapabilitySpec(slug: string): ProfileCapabilitySpec | undefined {
  return isProfileCapabilitySlug(slug) ? PROFILE_CAPABILITY_CATALOG[slug] : undefined;
}

export function profileCapabilitySlugs(): string[] {
  return Object.keys(PROFILE_CAPABILITY_CATALOG).sort((a, b) => a.localeCompare(b));
}
