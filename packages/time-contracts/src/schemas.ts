import { z } from "zod";

const isoTimestampExample = "2026-05-21T14:30:00.000Z";
const isoDateExample = "2026-05-31";
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Profile-local calendar date in YYYY-MM-DD format.");

export const profileTimeResolveQuerySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instant"), instant: z.string().datetime({ offset: true }).describe("Absolute timestamp to interpret in the profile timezone.") }).strict(),
  z.object({ kind: z.literal("local_date"), date: isoDateSchema.describe("Profile-local date to convert to a UTC query interval.") }).strict(),
  z.object({ kind: z.literal("local_date_range"), startDate: isoDateSchema.describe("Inclusive profile-local start date."), endDateExclusive: isoDateSchema.describe("Exclusive profile-local end date.") }).strict(),
  z.object({ kind: z.literal("month"), year: z.number().int().min(1970).max(9999).describe("Profile-local calendar year."), month: z.number().int().min(1).max(12).describe("Profile-local calendar month number.") }).strict(),
  z.object({ kind: z.literal("relative_date"), value: z.enum(["today", "yesterday", "tomorrow"]).describe("Relative date evaluated from the current time in the profile timezone.") }).strict(),
]);
export type ProfileTimeResolveQuery = z.infer<typeof profileTimeResolveQuerySchema>;

export const profileTimeResolveInputSchema = z
  .object({ queries: z.array(profileTimeResolveQuerySchema).min(1).max(20).describe("Timestamps or local civil dates to resolve deterministically in the profile timezone.") })
  .strict();
export type ProfileTimeResolveInput = z.infer<typeof profileTimeResolveInputSchema>;

export const profileResolvedInstantSchema = z
  .object({
    kind: z.literal("instant"),
    instant: z.string().datetime({ offset: true }).describe("Original absolute timestamp.").meta({ examples: [isoTimestampExample] }),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Profile-local calendar date for the instant.").meta({ examples: [isoDateExample] }),
    localTime: z.string().regex(/^\d{2}:\d{2}$/).describe("Profile-local 24-hour clock time for the instant.").meta({ examples: ["20:10"] }),
    localDateTime: z.string().describe("Profile-local date and time without a numeric offset.").meta({ examples: ["2026-05-31 20:10"] }),
    label: z.string().describe("Concise human-readable local timestamp.").meta({ examples: ["May 31, 2026, 8:10 PM EDT"] }),
  })
  .strict()
  .describe("Profile-local interpretation of an absolute timestamp.");

export const profileResolvedIntervalSchema = z
  .object({
    kind: z.enum(["local_date", "local_date_range", "month", "relative_date"]),
    localStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Inclusive profile-local start date.").meta({ examples: ["2026-05-01"] }),
    localEndDateExclusive: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Exclusive profile-local end date.").meta({ examples: ["2026-06-01"] }),
    utcStart: z.string().datetime({ offset: true }).describe("Inclusive UTC instant for querying provider timestamps.").meta({ examples: ["2026-05-01T04:00:00.000Z"] }),
    utcEndExclusive: z.string().datetime({ offset: true }).describe("Exclusive UTC instant for querying provider timestamps.").meta({ examples: ["2026-06-01T04:00:00.000Z"] }),
    label: z.string().describe("Concise human-readable local date or period label."),
  })
  .strict()
  .describe("Profile-local civil date interval with UTC query bounds.");

export const profileTimeResolveOutputSchema = z
  .object({
    timezone: z.string().describe("Profile IANA timezone used for every resolution.").meta({ examples: ["America/Toronto"] }),
    resolvedAt: z.string().datetime({ offset: true }).describe("UTC timestamp when the resolver ran.").meta({ examples: [isoTimestampExample] }),
    results: z.array(z.discriminatedUnion("kind", [profileResolvedInstantSchema, profileResolvedIntervalSchema])).describe("Resolved timestamp or local civil date range results, in input order."),
  })
  .strict();
export type ProfileTimeResolveOutput = z.infer<typeof profileTimeResolveOutputSchema>;

