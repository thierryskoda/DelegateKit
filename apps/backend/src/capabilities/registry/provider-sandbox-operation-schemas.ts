import { z } from "zod";
import {
  boldsignDocumentDownloadSandboxResponseSchema,
  boldsignDocumentListResponseSchema,
  boldsignDocumentSendResponseSchema,
  boldsignEmptyResponseSchema,
} from "../boldsign/api-client";
import {
  googleDriveNangoProxyIdResponseSchema,
  googleDriveNangoProxyResponseSchemas,
} from "../google-drive/nango-client";
import { mondayGraphqlEnvelopeSchema } from "../monday/graphql-proxy";
import { gmailNangoProxyResponseSchemas } from "../../integrations/nango/gmail-proxy";
import { googleCalendarNangoProxyResponseSchemas } from "../../integrations/nango/google-calendar-proxy";

const sandboxJsonResponseSchema = z.record(z.string(), z.unknown());

export const providerSandboxBinaryResponseSchema = z
  .object({
    bodyBase64: z.string().min(1),
    contentType: z.string().min(1).optional(),
  })
  .strict();

const mondaySandboxResponseSchemas = {
  "monday.board.create": mondayGraphqlEnvelopeSchema,
  "monday.board.delete": mondayGraphqlEnvelopeSchema,
  "monday.board.rename": mondayGraphqlEnvelopeSchema,
  "monday.column.create": mondayGraphqlEnvelopeSchema,
  "monday.column.delete": mondayGraphqlEnvelopeSchema,
  "monday.column.rename": mondayGraphqlEnvelopeSchema,
  "monday.discovery": mondayGraphqlEnvelopeSchema,
  "monday.file.add_to_column": mondayGraphqlEnvelopeSchema,
  "monday.file.add_to_update": mondayGraphqlEnvelopeSchema,
  "monday.group.create": mondayGraphqlEnvelopeSchema,
  "monday.group.delete": mondayGraphqlEnvelopeSchema,
  "monday.group.rename": mondayGraphqlEnvelopeSchema,
  "monday.item.archive": mondayGraphqlEnvelopeSchema,
  "monday.item.create": mondayGraphqlEnvelopeSchema,
  "monday.item.get": mondayGraphqlEnvelopeSchema,
  "monday.item.list": mondayGraphqlEnvelopeSchema,
  "monday.item.list.next": mondayGraphqlEnvelopeSchema,
  "monday.item.move_to_group": mondayGraphqlEnvelopeSchema,
  "monday.item.rename": mondayGraphqlEnvelopeSchema,
  "monday.item.update": mondayGraphqlEnvelopeSchema,
  "monday.subitem.create": mondayGraphqlEnvelopeSchema,
  "monday.subitem.list": mondayGraphqlEnvelopeSchema,
  "monday.update.create": mondayGraphqlEnvelopeSchema,
  "monday.update.delete": mondayGraphqlEnvelopeSchema,
  "monday.update.edit": mondayGraphqlEnvelopeSchema,
  "monday.update.list": mondayGraphqlEnvelopeSchema,
} as const;

const outlookMailSandboxResponseSchemas = {
  "nango.outlook_mail.proxy.delete-message": sandboxJsonResponseSchema,
  "nango.outlook_mail.proxy.download-message-attachment": sandboxJsonResponseSchema,
  "nango.outlook_mail.proxy.get-message": sandboxJsonResponseSchema,
  "nango.outlook_mail.proxy.list-messages": sandboxJsonResponseSchema,
  "nango.outlook_mail.proxy.move-message": sandboxJsonResponseSchema,
  "nango.outlook_mail.proxy.reply-to-message": sandboxJsonResponseSchema,
  "nango.outlook_mail.proxy.send-mail": sandboxJsonResponseSchema,
  "nango.outlook_mail.proxy.update-message": sandboxJsonResponseSchema,
} as const;

const outlookCalendarSandboxResponseSchemas = {
  "nango.outlook_calendar.proxy.cancel-event": sandboxJsonResponseSchema,
  "nango.outlook_calendar.proxy.create-event": sandboxJsonResponseSchema,
  "nango.outlook_calendar.proxy.delete-event": sandboxJsonResponseSchema,
  "nango.outlook_calendar.proxy.get-event": sandboxJsonResponseSchema,
  "nango.outlook_calendar.proxy.get.calendar_view": sandboxJsonResponseSchema,
  "nango.outlook_calendar.proxy.list-calendar-events": sandboxJsonResponseSchema,
  "nango.outlook_calendar.proxy.list-calendars": sandboxJsonResponseSchema,
  "nango.outlook_calendar.proxy.post.get_schedule": sandboxJsonResponseSchema,
  "nango.outlook_calendar.proxy.update-event": sandboxJsonResponseSchema,
} as const;

const microsoftTodoSandboxResponseSchemas = {
  "nango.microsoft_todo.proxy.create-task": sandboxJsonResponseSchema,
  "nango.microsoft_todo.proxy.delete-task": sandboxJsonResponseSchema,
  "nango.microsoft_todo.proxy.get-task": sandboxJsonResponseSchema,
  "nango.microsoft_todo.proxy.list-lists": sandboxJsonResponseSchema,
  "nango.microsoft_todo.proxy.list-tasks": sandboxJsonResponseSchema,
  "nango.microsoft_todo.proxy.update-task": sandboxJsonResponseSchema,
} as const;

const microsoftOnedriveSandboxResponseSchemas = {
  "nango.microsoft_onedrive_drive.proxy.copy_item": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.create-folder": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.create-sharing-link": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.delete-item": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.delete-permission": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.get.binary": providerSandboxBinaryResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.get-drive": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.get-item": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.get-permission": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.invite-recipients": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.list-children": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.list-drives": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.list-permissions": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.list-recent-items": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.list-shared-items": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.list-versions": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.move-item": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.search-items": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.update-item": sandboxJsonResponseSchema,
  "nango.microsoft_onedrive_drive.proxy.upload-small-file": sandboxJsonResponseSchema,
} as const;

const microsoftSharepointSandboxResponseSchemas = {
  "nango.microsoft_sharepoint_drive.proxy.fetch-file": sandboxJsonResponseSchema,
  "nango.microsoft_sharepoint_drive.proxy.get.binary": providerSandboxBinaryResponseSchema,
  "nango.microsoft_sharepoint_drive.proxy.list-shared-sites": sandboxJsonResponseSchema,
} as const;

export const providerSandboxOperationResponseSchemas = {
  "ai-assistants-google": {
    "nango.gmail.proxy.get-attachment": gmailNangoProxyResponseSchemas["get-attachment"],
    "nango.gmail.proxy.get-message": gmailNangoProxyResponseSchemas["get-message"],
    "nango.gmail.proxy.list-messages": gmailNangoProxyResponseSchemas["list-messages"],
    "nango.gmail.proxy.modify-message": gmailNangoProxyResponseSchemas["modify-message"],
    "nango.gmail.proxy.send-message": gmailNangoProxyResponseSchemas["send-message"],
    "nango.gmail.proxy.trash-message": gmailNangoProxyResponseSchemas["trash-message"],
    "nango.google_drive.proxy.copy-file": googleDriveNangoProxyResponseSchemas["copy-file"],
    "nango.google_drive.proxy.create-folder": googleDriveNangoProxyResponseSchemas["create-folder"],
    "nango.google_drive.proxy.delete-file": googleDriveNangoProxyResponseSchemas["delete-file"],
    "nango.google_drive.proxy.delete-permission":
      googleDriveNangoProxyResponseSchemas["delete-permission"],
    "nango.google_drive.proxy.find-file": googleDriveNangoProxyResponseSchemas["find-file"],
    "nango.google_drive.proxy.get": googleDriveNangoProxyResponseSchemas["update-file"],
    "nango.google_drive.proxy.get.binary": providerSandboxBinaryResponseSchema,
    "nango.google_drive.proxy.get-permission": googleDriveNangoProxyResponseSchemas["get-permission"],
    "nango.google_drive.proxy.list-drives": googleDriveNangoProxyResponseSchemas["list-drives"],
    "nango.google_drive.proxy.list-files": googleDriveNangoProxyResponseSchemas["list-files"],
    "nango.google_drive.proxy.list-permissions":
      googleDriveNangoProxyResponseSchemas["list-permissions"],
    "nango.google_drive.proxy.move-file": googleDriveNangoProxyResponseSchemas["move-file"],
    "nango.google_drive.proxy.post": sandboxJsonResponseSchema,
    "nango.google_drive.proxy.update-file": googleDriveNangoProxyResponseSchemas["update-file"],
    "nango.google_drive.proxy.update-permission":
      googleDriveNangoProxyResponseSchemas["update-permission"],
    "nango.google_drive.proxy.upload_document.create_metadata": googleDriveNangoProxyIdResponseSchema,
    "nango.google_drive.proxy.upload_document.media": googleDriveNangoProxyIdResponseSchema,
    "nango.google_calendar.proxy.create-event": googleCalendarNangoProxyResponseSchemas["create-event"],
    "nango.google_calendar.proxy.delete-event": googleCalendarNangoProxyResponseSchemas["delete-event"],
    "nango.google_calendar.proxy.find-free-slots":
      googleCalendarNangoProxyResponseSchemas["find-free-slots"],
    "nango.google_calendar.proxy.get-calendar": googleCalendarNangoProxyResponseSchemas["get-calendar"],
    "nango.google_calendar.proxy.get-event": googleCalendarNangoProxyResponseSchemas["get-event"],
    "nango.google_calendar.proxy.list-events": googleCalendarNangoProxyResponseSchemas["list-events"],
    "nango.google_calendar.proxy.list-calendar-events":
      googleCalendarNangoProxyResponseSchemas["list-events"],
    "nango.google_calendar.proxy.list-calendars":
      googleCalendarNangoProxyResponseSchemas["list-calendars"],
    "nango.google_calendar.proxy.patch-event": googleCalendarNangoProxyResponseSchemas["patch-event"],
    "nango.google_calendar.proxy.query-free-busy":
      googleCalendarNangoProxyResponseSchemas["query-free-busy"],
    "nango.google_calendar.proxy.search-events":
      googleCalendarNangoProxyResponseSchemas["search-events"],
  },
  "ai-assistants-outlook": {
    ...outlookMailSandboxResponseSchemas,
    ...outlookCalendarSandboxResponseSchemas,
    ...microsoftTodoSandboxResponseSchemas,
  },
  "ai-assistants-microsoft-onedrive": microsoftOnedriveSandboxResponseSchemas,
  "ai-assistants-microsoft-sharepoint": microsoftSharepointSandboxResponseSchemas,
  "ai-assistants-monday": mondaySandboxResponseSchemas,
  boldsign: {
    "boldsign.document.download": boldsignDocumentDownloadSandboxResponseSchema,
    "boldsign.document.list": boldsignDocumentListResponseSchema,
    "boldsign.document.remind": boldsignEmptyResponseSchema,
    "boldsign.document.revoke": boldsignEmptyResponseSchema,
    "boldsign.document.send": boldsignDocumentSendResponseSchema,
    "boldsign.document.update_metadata": boldsignEmptyResponseSchema,
  },
} as const;

export type ProviderSandboxOperationFixture = {
  [TProviderKey in keyof typeof providerSandboxOperationResponseSchemas]: {
    [TOperation in keyof (typeof providerSandboxOperationResponseSchemas)[TProviderKey]]: {
      providerKey: TProviderKey;
      operation: TOperation;
      response: z.input<(typeof providerSandboxOperationResponseSchemas)[TProviderKey][TOperation]>;
      marker?: string;
      metadata?: Record<string, unknown>;
    };
  }[keyof (typeof providerSandboxOperationResponseSchemas)[TProviderKey]];
}[keyof typeof providerSandboxOperationResponseSchemas];
