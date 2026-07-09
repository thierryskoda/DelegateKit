import { z } from "zod";

export const EXTERNAL_ACTION_TYPES = [
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
  "microsoft_onedrive.folder.create",
  "microsoft_onedrive.item.update",
  "microsoft_onedrive.item.move",
  "microsoft_onedrive.item.copy",
  "microsoft_onedrive.item.delete",
  "microsoft_onedrive.file.upload",
  "microsoft_onedrive.sharing_link.create",
  "microsoft_onedrive.invitation.send",
  "microsoft_onedrive.permission.delete",
  "microsoft_todo.task.create",
  "microsoft_todo.task.update",
  "microsoft_todo.task.complete",
  "microsoft_todo.task.delete",
  "google_calendar.event.create",
  "google_calendar.event.modify",
  "google_calendar.event.cancel",
  "outlook_calendar.event.create",
  "outlook_calendar.event.modify",
  "outlook_calendar.event.cancel",
  "gmail.message.send",
  "gmail.message.reply",
  "gmail.message.forward",
  "gmail.message.move",
  "gmail.message.mark_read",
  "gmail.message.delete",
  "outlook_mail.message.send",
  "outlook_mail.message.reply",
  "outlook_mail.message.forward",
  "outlook_mail.message.move",
  "outlook_mail.message.mark_read",
  "outlook_mail.message.delete",
  "boldsign.signature_request.send",
  "boldsign.signature_request.remind",
  "boldsign.signature_request.cancel",
  "phone.call.start",
  "phone.sms.send",
] as const;

export type ExternalActionType = (typeof EXTERNAL_ACTION_TYPES)[number];
export const externalActionTypeSchema = z.enum(EXTERNAL_ACTION_TYPES);

export const WRITE_POLICY_MODES = ["auto_execute", "needs_review", "blocked"] as const;
export type WritePolicyMode = (typeof WRITE_POLICY_MODES)[number];
export const writePolicyModeSchema = z.enum(WRITE_POLICY_MODES);

export const writePolicyRulesSchema = z
  .object({
    defaultMode: writePolicyModeSchema.describe(
      "Fallback write policy mode for policy-controlled external writes without an explicit override.",
    ),
    actions: z
      .partialRecord(externalActionTypeSchema, writePolicyModeSchema)
      .default({})
      .describe("Per-action write policy mode overrides keyed by canonical external action type."),
  })
  .strict()
  .describe("Profile write policy rules.");
export type WritePolicyRules = z.infer<typeof writePolicyRulesSchema>;
