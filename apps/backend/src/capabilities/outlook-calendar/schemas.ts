import { z } from "zod";

export const graphCalendarSubscriptionResponseSchema = z
  .object({
    id: z.string().trim().min(1),
    resource: z.string().trim().min(1).optional(),
    changeType: z.string().trim().min(1).optional(),
    clientState: z.string().trim().min(1).optional(),
    expirationDateTime: z.string().trim().min(1),
  })
  .passthrough();

const outlookCalendarDateTimeSchema = z
  .object({
    dateTime: z.string().trim().min(1).nullable().optional(),
    timeZone: z.string().trim().min(1).nullable().optional(),
  })
  .passthrough();

export const outlookCalendarEventSchema = z
  .object({
    id: z.string().trim().min(1),
    iCalUId: z.string().trim().min(1).nullable().optional(),
    subject: z.string().nullable().optional(),
    bodyPreview: z.string().nullable().optional(),
    sensitivity: z.string().nullable().optional(),
    showAs: z.string().nullable().optional(),
    isCancelled: z.boolean().optional(),
    isDraft: z.boolean().optional(),
    createdDateTime: z.string().trim().min(1).nullable().optional(),
    lastModifiedDateTime: z.string().trim().min(1).nullable().optional(),
    start: outlookCalendarDateTimeSchema.optional(),
    end: outlookCalendarDateTimeSchema.optional(),
    organizer: z
      .object({
        emailAddress: z
          .object({
            name: z.string().nullable().optional(),
            address: z.string().nullable().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
