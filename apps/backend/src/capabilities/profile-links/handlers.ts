import { profileLinksToolContracts } from "@ai-assistants/profile-links-contracts/contracts";
import { DomainError } from "@ai-assistants/errors";
import type { BackendImmediateToolHandlers } from "../registry/backend-capability-module";
import { backendToolData, backendToolDomainError } from "../../shared/tool-result";
import { createPortalAccessLinkForProfile } from "../../product/profiles/portal-access-links";
import { createTelegramMiniAppLaunchLink } from "../../product/profiles/telegram-mini-app";

export const profileLinkHandlers = {
  async portal_link_create(ctx) {
    try {
      const link = await createPortalAccessLinkForProfile(ctx.db, ctx.profile, ctx.params, {
        assistantId: ctx.assistant.assistant_id,
        invocation: ctx.input.invocation,
        ...(ctx.resolvedTrustedChannelOrigin ? { trustedChannelOrigin: ctx.resolvedTrustedChannelOrigin } : {}),
        toolCallId: ctx.input.toolCallId,
      });
      return backendToolData(profileLinksToolContracts, "portal_link_create", { link });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
  async mini_app_link_create(ctx) {
    try {
      const link = await createTelegramMiniAppLaunchLink({
        db: ctx.db,
        profile: ctx.profile,
        params: ctx.params,
        assistantId: ctx.assistant.assistant_id,
        invocation: ctx.input.invocation,
        ...(ctx.resolvedTrustedChannelOrigin ? { trustedChannelOrigin: ctx.resolvedTrustedChannelOrigin } : {}),
        toolCallId: ctx.input.toolCallId,
      });
      return backendToolData(profileLinksToolContracts, "mini_app_link_create", {
        link: { ...link, surface: "telegram_mini_app" },
      });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
} satisfies BackendImmediateToolHandlers<typeof profileLinksToolContracts>;

