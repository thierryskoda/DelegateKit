import { defineWriteTool, type ToolContract, writeToolDescription } from "@ai-assistants/tool-contracts";
import {
  miniAppLinkCreateInputSchema,
  portalAccessLinkCreateInputSchema,
  profileMiniAppLinkOutputSchema,
  profilePortalLinkOutputSchema,
} from "./schemas";

export const PROFILE_LINKS_PLUGIN_ID = "profile-links-tools";

export const profileLinksToolContracts = [
  defineWriteTool({
    name: "portal_link_create",
    pluginId: PROFILE_LINKS_PLUGIN_ID,
    label: "Create Portal Link",
    description: writeToolDescription({
      useWhen: "the user needs a browser portal link for integrations or approvals",
      operation: "Creates a short-lived one-time Connect portal sign-in link",
      returns: "portal link data safe to send in chat",
      sideEffect: "creates a short-lived portal access grant",
      safety: "the portal section intent must be clear",
    }),
    inputSchema: portalAccessLinkCreateInputSchema,
    outputSchema: profilePortalLinkOutputSchema,
    trustedChannelRequired: true,
  }),
  defineWriteTool({
    name: "mini_app_link_create",
    pluginId: PROFILE_LINKS_PLUGIN_ID,
    label: "Create Mini App Link",
    description: writeToolDescription({
      useWhen: "the user needs a Telegram Mini App link for integrations or approvals",
      operation: "Creates a short-lived Telegram Mini App launch link",
      returns: "Mini App link data safe to send in Telegram",
      doNotUse: "a non-Telegram browser portal link is needed; use portal_link_create",
      sideEffect: "creates a short-lived Mini App launch intent",
      safety: "the Telegram link target intent must be clear",
    }),
    inputSchema: miniAppLinkCreateInputSchema,
    outputSchema: profileMiniAppLinkOutputSchema,
    trustedChannelRequired: true,
  }),
] as const satisfies readonly ToolContract[];

export type ProfileLinksToolName = (typeof profileLinksToolContracts)[number]["name"];
