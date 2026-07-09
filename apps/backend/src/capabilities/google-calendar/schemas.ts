import { z } from "zod";

export const googleCalendarListResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().trim().min(1),
            summary: z.string().nullable().optional(),
            deleted: z.boolean().optional(),
            hidden: z.boolean().optional(),
            accessRole: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    nextPageToken: z.string().trim().min(1).optional(),
  })
  .passthrough();

export const googleCalendarEventsResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().trim().min(1),
            iCalUID: z.string().trim().min(1).optional(),
            etag: z.string().trim().min(1).optional(),
            status: z.string().trim().min(1).optional(),
            summary: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            visibility: z.string().nullable().optional(),
            updated: z.string().trim().min(1).nullable().optional(),
            created: z.string().trim().min(1).nullable().optional(),
            recurringEventId: z.string().trim().min(1).nullable().optional(),
            start: z
              .object({
                dateTime: z.string().trim().min(1).optional(),
                date: z.string().trim().min(1).optional(),
                timeZone: z.string().trim().min(1).optional(),
              })
              .passthrough()
              .optional(),
            end: z
              .object({
                dateTime: z.string().trim().min(1).optional(),
                date: z.string().trim().min(1).optional(),
                timeZone: z.string().trim().min(1).optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    nextPageToken: z.string().trim().min(1).optional(),
    nextSyncToken: z.string().trim().min(1).optional(),
  })
  .passthrough();

export const googleCalendarWatchResponseSchema = z
  .object({
    id: z.string().trim().min(1),
    resourceId: z.string().trim().min(1),
    resourceUri: z.string().trim().min(1).optional(),
    expiration: z.union([z.string().trim().min(1), z.number().int().nonnegative()]).optional(),
  })
  .passthrough();
