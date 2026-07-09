import { stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

const isoTimestampExample = "2026-05-21T14:30:00.000Z";

export const portalAccessLinkCreateInputSchema = z
  .object({
    section: z.enum(["integrations", "approvals"]).default("integrations").describe("Portal section to open after sign-in."),
  })
  .strict();
export type PortalAccessLinkCreateInput = z.infer<typeof portalAccessLinkCreateInputSchema>;

export const miniAppLaunchSectionSchema = z.enum(["integrations", "approvals"]);
export const miniAppLaunchIntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("section") }).strict(),
  z.object({ type: z.literal("approval"), approvalId: stringField("Backend profile approval/action id.") }).strict(),
  z.object({ type: z.literal("integration"), connectedAccountId: stringField("Connected provider account id for the integration target.") }).strict(),
]);
export const miniAppLinkCreateInputSchema = z
  .object({
    section: miniAppLaunchSectionSchema.default("approvals").describe("Connect portal section to open after Telegram Mini App sign-in."),
    intent: miniAppLaunchIntentSchema.default({ type: "section" }).describe("Token-free Telegram Mini App launch target."),
  })
  .strict();
export type MiniAppLinkCreateInput = z.infer<typeof miniAppLinkCreateInputSchema>;

export const profilePortalLinkOutputSchema = z
  .object({
    link: z.object({
      url: z.string().url().describe("Short-lived profile portal access URL.").meta({ examples: ["https://portal.example.com/assistants/profile-1/approvals"] }),
      section: z.enum(["integrations", "approvals"]).describe("Portal section the link opens."),
    }).strict().describe("Portal access link."),
  })
  .strict();

export const profileMiniAppLinkOutputSchema = z
  .object({
    link: z.object({
      url: z.string().url().describe("Short-lived Telegram Mini App launch URL.").meta({ examples: ["https://t.me/example_assistant_bot?startapp=abc123"] }),
      section: z.enum(["integrations", "approvals"]).describe("Portal section the app opens."),
      surface: z.literal("telegram_mini_app").describe("Launch surface for this link."),
      expiresAt: z.string().datetime({ offset: true }).describe("Timestamp when this Mini App launch link expires.").meta({ examples: [isoTimestampExample] }),
    }).strict().describe("Telegram Mini App launch link."),
  })
  .strict();

