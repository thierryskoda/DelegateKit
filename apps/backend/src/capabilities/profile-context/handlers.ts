import { profileActivitySearchInputSchema } from "@ai-assistants/profile-context-contracts/schemas";
import { profileContextToolContracts } from "@ai-assistants/profile-context-contracts/contracts";
import type { BackendImmediateToolHandlers } from "../registry/backend-capability-module";
import { backendToolData } from "../../shared/tool-result";
import { searchProfileActivityForAssistantTool } from "../../product/agent-activity/agent-activity";
import { profileOverviewForAssistant } from "../../product/profiles/context-builder";

export const profileContextHandlers = {
  async profile_context_get(ctx) {
    return backendToolData(profileContextToolContracts, "profile_context_get", {
      overview: await profileOverviewForAssistant(ctx.db, ctx.profile.id, ctx.assistant.assistant_id),
    });
  },
  async profile_activity_search(ctx) {
    const parsed = profileActivitySearchInputSchema.parse(ctx.params);
    return backendToolData(profileContextToolContracts, "profile_activity_search", {
      query: parsed.query ?? null,
      activities: await searchProfileActivityForAssistantTool(ctx.db, ctx.profile.id, parsed),
    });
  },
} satisfies BackendImmediateToolHandlers<typeof profileContextToolContracts>;
