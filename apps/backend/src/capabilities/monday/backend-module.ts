import { mondayToolContracts } from "@ai-assistants/monday-contracts/contracts";
import {
  mondayBoardGetInputSchema,
  mondayBoardGetOutputSchema,
  mondayBoardListInputSchema,
  mondayBoardListOutputSchema,
  mondayColumnTypeListOutputSchema,
  mondayItemGetInputSchema,
  mondayItemGetOutputSchema,
  mondayItemListInputSchema,
  mondayItemListOutputSchema,
  mondaySubitemListInputSchema,
  mondaySubitemListOutputSchema,
  mondayUpdateListInputSchema,
  mondayUpdateListOutputSchema,
  mondayWorkspaceListOutputSchema,
} from "@ai-assistants/monday-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { toolContractByName, toolDataForContract } from "@ai-assistants/tool-contracts";
import { mondayExternalWriteActionContracts } from "./external-write-contracts";
import {
  mondayBoardGet,
  mondayBoardList,
  mondayColumnTypeList,
  mondayItemGet,
  mondayItemList,
  mondaySubitemList,
  mondayUpdateList,
  mondayWorkspaceList,
} from "./raw-read-actions";

export const mondayBackendCapabilityModule = defineBackendCapabilityModule({
  id: "monday",
  contracts: mondayToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(mondayToolContracts, async (ctx) => {
    switch (ctx.input.toolName) {
      case "monday_workspace_list": {
        const result = await mondayWorkspaceList({ db: ctx.db, profileId: ctx.profile.id });
        return toolDataForContract(
          toolContractByName(mondayToolContracts, "monday_workspace_list"),
          mondayWorkspaceListOutputSchema.parse(result),
        );
      }
      case "monday_board_list": {
        const params = mondayBoardListInputSchema.parse(ctx.params);
        const result = await mondayBoardList({
          db: ctx.db,
          profileId: ctx.profile.id,
          ...(params.nameContains === undefined ? {} : { nameContains: params.nameContains }),
          ...(params.limit === undefined ? {} : { limit: params.limit }),
        });
        return toolDataForContract(
          toolContractByName(mondayToolContracts, "monday_board_list"),
          mondayBoardListOutputSchema.parse(result),
        );
      }
      case "monday_board_get": {
        const params = mondayBoardGetInputSchema.parse(ctx.params);
        const result = await mondayBoardGet({
          db: ctx.db,
          profileId: ctx.profile.id,
          boardId: params.boardId,
        });
        return toolDataForContract(
          toolContractByName(mondayToolContracts, "monday_board_get"),
          mondayBoardGetOutputSchema.parse(result),
        );
      }
      case "monday_column_type_list": {
        return toolDataForContract(
          toolContractByName(mondayToolContracts, "monday_column_type_list"),
          mondayColumnTypeListOutputSchema.parse(mondayColumnTypeList()),
        );
      }
      case "monday_item_list": {
        const params = mondayItemListInputSchema.parse(ctx.params);
        const result = await mondayItemList({
          db: ctx.db,
          profileId: ctx.profile.id,
          boardId: params.boardId,
          ...(params.groupId === undefined ? {} : { groupId: params.groupId }),
          ...(params.titleContains === undefined ? {} : { titleContains: params.titleContains }),
          ...(params.filters === undefined ? {} : { filters: params.filters }),
          ...(params.filtersOperator === undefined ? {} : { filtersOperator: params.filtersOperator }),
          ...(params.orderBy === undefined ? {} : { orderBy: params.orderBy }),
          ...(params.limit === undefined ? {} : { limit: params.limit }),
          ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        });
        return toolDataForContract(
          toolContractByName(mondayToolContracts, "monday_item_list"),
          mondayItemListOutputSchema.parse(result),
        );
      }
      case "monday_item_get": {
        const params = mondayItemGetInputSchema.parse(ctx.params);
        const result = await mondayItemGet({
          db: ctx.db,
          profileId: ctx.profile.id,
          itemId: params.itemId,
        });
        return toolDataForContract(
          toolContractByName(mondayToolContracts, "monday_item_get"),
          mondayItemGetOutputSchema.parse(result),
        );
      }
      case "monday_subitem_list": {
        const params = mondaySubitemListInputSchema.parse(ctx.params);
        const result = await mondaySubitemList({
          db: ctx.db,
          profileId: ctx.profile.id,
          parentItemId: params.parentItemId,
          ...(params.limit === undefined ? {} : { limit: params.limit }),
        });
        return toolDataForContract(
          toolContractByName(mondayToolContracts, "monday_subitem_list"),
          mondaySubitemListOutputSchema.parse(result),
        );
      }
      case "monday_update_list": {
        const params = mondayUpdateListInputSchema.parse(ctx.params);
        const result = await mondayUpdateList({
          db: ctx.db,
          profileId: ctx.profile.id,
          itemId: params.itemId,
          ...(params.includeReplies === undefined ? {} : { includeReplies: params.includeReplies }),
          ...(params.page === undefined ? {} : { page: params.page }),
          ...(params.limit === undefined ? {} : { limit: params.limit }),
        });
        return toolDataForContract(
          toolContractByName(mondayToolContracts, "monday_update_list"),
          mondayUpdateListOutputSchema.parse(result),
        );
      }
      default:
        throw new DomainError(
          domainCodes.INTERNAL,
          `Monday backend module has no handler for ${ctx.input.toolName}.`,
        );
    }
  }),
  externalWriteContracts: mondayExternalWriteActionContracts,
});
