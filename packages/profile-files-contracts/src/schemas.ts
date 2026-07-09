import { integerField, profileFileSchema, stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

const profileFileIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe("Durable profile file id.");

const sha256String = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 hex digest.")
  .describe("SHA-256 hex digest for stale-content protection.");

const profileFileContentSchema = z.discriminatedUnion("available", [
  z
    .object({
      available: z.literal(false),
      reason: z.enum(["not_requested", "too_large_for_inline_base64", "not_materialized"]),
    })
    .strict(),
  z
    .object({
      available: z.literal(true),
      base64: z.string(),
      isBase64: z.literal(true),
    })
    .strict(),
]);

export const profileFileFindInputSchema = z
  .object({
    profileFileId: profileFileIdSchema.optional(),
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("Case-insensitive text to match against profile-file metadata.")
      .optional(),
    limit: integerField("Maximum number of matching profile files to return.", 1, 50, 10).optional(),
    includeContent: z
      .enum(["metadata_only", "inline_if_small"])
      .describe("Whether to return only metadata or inline small content.")
      .default("metadata_only"),
    expectedSha256: sha256String
      .describe("Expected SHA-256 for stale-file protection when profileFileId is used.")
      .optional(),
  })
  .strict()
  .refine((input) => !(input.profileFileId && input.query), {
    message: "Use either profileFileId or query, not both.",
  });
export type ProfileFileFindInput = z.infer<typeof profileFileFindInputSchema>;

export const profileFileFindOutputSchema = z
  .object({
    query: z.string().trim().min(1).optional().describe("Metadata query used for the search."),
    files: z
      .array(
        profileFileSchema.extend({
          content: profileFileContentSchema.optional().describe("Inline content result when requested."),
        }),
      )
      .describe("Saved profile files matching the request."),
  })
  .strict();
export type ProfileFileFindOutput = z.infer<typeof profileFileFindOutputSchema>;

export const profileFileSendInputSchema = z
  .object({
    profileFileId: profileFileIdSchema,
    expectedSha256: sha256String.describe("Expected SHA-256 for stale-content protection.").optional(),
    filename: stringField("Optional display filename override.").max(200).optional(),
    caption: stringField("Short client-visible caption to send with the attachment.").max(500).optional(),
  })
  .strict();
export type ProfileFileSendInput = z.infer<typeof profileFileSendInputSchema>;

export const profileFileSendOutputSchema = z
  .object({
    status: z.enum(["queued_for_current_chat"]).describe("Current-channel attachment delivery status."),
    profileFile: profileFileSchema
      .pick({
        profileFileId: true,
        filename: true,
        mimeType: true,
        byteSize: true,
        sha256: true,
      })
      .describe("Profile file queued for native chat delivery."),
    channel: z.string().trim().min(1).describe("Resolved current channel target."),
    caption: z.string().trim().min(1).nullable().describe("Caption requested for delivery."),
  })
  .strict();
export type ProfileFileSendOutput = z.infer<typeof profileFileSendOutputSchema>;
