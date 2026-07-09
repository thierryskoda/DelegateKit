import {
  profileWorkItemGetInputSchema,
  profileWorkItemListInputSchema,
  profileWorkRouteCreateInputSchema,
  profileWorkRouteDeleteInputSchema,
  profileWorkRouteUpdateInputSchema,
  type ProfileWorkItemStatus,
} from "@ai-assistants/work-contracts/schemas";
import { workToolContracts } from "@ai-assistants/work-contracts/contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  getAssistantWorkItem,
  listAssistantWorkItems,
  type AssistantWorkItemStatus,
} from "../../product/assistant-work-items/assistant-work-items";
import {
  createProfileAssistantWorkRoute,
  deleteProfileAssistantWorkRoute,
  listProfileAssistantWorkRoutes,
  updateProfileAssistantWorkRoute,
} from "../../product/assistant-work-items/profile-assistant-work-routes";
import { resolvedWorkItemGuidanceMarkdown } from "../../product/assistant-work-items/runtime-guidance";
import type { BackendImmediateToolHandlers } from "../registry/backend-capability-module";
import { backendToolData, backendToolDomainError } from "../../shared/tool-result";
import { workItemDto, workItemListItemDto, workRouteDto } from "./dtos";

function dbWorkItemStatus(status: ProfileWorkItemStatus): AssistantWorkItemStatus {
  return status === "running" ? "claimed" : status;
}

export const workItemRouteHandlers = {
  async work_item_get(ctx) {
    const parsed = profileWorkItemGetInputSchema.parse(ctx.params);
    try {
      const workItem = await getAssistantWorkItem(ctx.db, {
        profileId: ctx.profile.id,
        workItemId: parsed.workItemId,
      });
      return backendToolData(workToolContracts, "work_item_get", {
        workItem: workItemDto(workItem),
        guidanceMarkdown: await resolvedWorkItemGuidanceMarkdown(ctx.db, workItem),
      });
    } catch (error) {
      if (error instanceof DomainError && error.code === domainCodes.NOT_FOUND) {
        return backendToolDomainError(error);
      }
      throw error;
    }
  },
  async work_item_list(ctx) {
    const parsed = profileWorkItemListInputSchema.parse(ctx.params);
    const workItems = await listAssistantWorkItems(ctx.db, {
      profileId: ctx.profile.id,
      statuses: parsed.statuses.map(dbWorkItemStatus),
      limit: parsed.limit,
    });
    return backendToolData(workToolContracts, "work_item_list", {
      workItems: workItems.map((workItem) => workItemListItemDto(workItem)),
    });
  },
  async work_route_list(ctx) {
    const workRoutes = await listProfileAssistantWorkRoutes(ctx.db, ctx.profile.id);
    return backendToolData(workToolContracts, "work_route_list", {
      workRoutes: workRoutes.map((route) => workRouteDto(route)),
    });
  },
  async work_route_create(ctx) {
    const parsed = profileWorkRouteCreateInputSchema.parse(ctx.params);
    try {
      const workRoute = await createProfileAssistantWorkRoute(ctx.db, {
        profileId: ctx.profile.id,
        eventType: parsed.eventType,
        ...(parsed.connectedProviderAccountId === undefined
          ? {}
          : { connectedProviderAccountId: parsed.connectedProviderAccountId }),
        instructions: parsed.instructions,
        ...(parsed.priority === undefined ? {} : { priority: parsed.priority }),
      });
      return backendToolData(workToolContracts, "work_route_create", {
        workRoute: workRouteDto(workRoute),
      });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
  async work_route_update(ctx) {
    const parsed = profileWorkRouteUpdateInputSchema.parse(ctx.params);
    try {
      const workRoute = await updateProfileAssistantWorkRoute(ctx.db, {
        profileId: ctx.profile.id,
        workRouteId: parsed.workRouteId,
        ...(parsed.instructions === undefined ? {} : { instructions: parsed.instructions }),
        ...(parsed.priority === undefined ? {} : { priority: parsed.priority }),
      });
      return backendToolData(workToolContracts, "work_route_update", {
        workRoute: workRouteDto(workRoute),
      });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
  async work_route_delete(ctx) {
    const parsed = profileWorkRouteDeleteInputSchema.parse(ctx.params);
    try {
      const workRoute = await deleteProfileAssistantWorkRoute(ctx.db, {
        profileId: ctx.profile.id,
        workRouteId: parsed.workRouteId,
      });
      return backendToolData(workToolContracts, "work_route_delete", {
        workRoute: workRouteDto(workRoute),
      });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
} satisfies BackendImmediateToolHandlers<typeof workToolContracts>;
