import {
  mondayBoardCreateInputSchema,
  mondayBoardDeleteInputSchema,
  mondayBoardRenameInputSchema,
  mondayColumnCreateInputSchema,
  mondayColumnDeleteInputSchema,
  mondayColumnRenameInputSchema,
  mondayFileAddToColumnInputSchema,
  mondayFileAddToUpdateInputSchema,
  mondayGroupCreateInputSchema,
  mondayGroupDeleteInputSchema,
  mondayGroupRenameInputSchema,
  mondayItemArchiveInputSchema,
  mondayItemCreateInputSchema,
  mondayItemMoveToGroupInputSchema,
  mondayItemUpdateInputSchema,
  mondaySubitemArchiveInputSchema,
  mondaySubitemCreateInputSchema,
  mondaySubitemUpdateInputSchema,
  mondayUpdateCreateInputSchema,
  mondayUpdateDeleteInputSchema,
  mondayUpdateEditInputSchema,
} from "@ai-assistants/monday-contracts/schemas";

export const mondayItemCreatePayloadSchema = mondayItemCreateInputSchema;
export const mondayItemUpdatePayloadSchema = mondayItemUpdateInputSchema;
export const mondayItemArchivePayloadSchema = mondayItemArchiveInputSchema;
export const mondayItemMoveToGroupPayloadSchema = mondayItemMoveToGroupInputSchema;
export const mondayUpdateCreatePayloadSchema = mondayUpdateCreateInputSchema;
export const mondayUpdateEditPayloadSchema = mondayUpdateEditInputSchema;
export const mondayUpdateDeletePayloadSchema = mondayUpdateDeleteInputSchema;
export const mondaySubitemCreatePayloadSchema = mondaySubitemCreateInputSchema;
export const mondaySubitemUpdatePayloadSchema = mondaySubitemUpdateInputSchema;
export const mondaySubitemArchivePayloadSchema = mondaySubitemArchiveInputSchema;
export const mondayFileAddToColumnPayloadSchema = mondayFileAddToColumnInputSchema;
export const mondayFileAddToUpdatePayloadSchema = mondayFileAddToUpdateInputSchema;
export const mondayBoardCreatePayloadSchema = mondayBoardCreateInputSchema;
export const mondayBoardRenamePayloadSchema = mondayBoardRenameInputSchema;
export const mondayBoardDeletePayloadSchema = mondayBoardDeleteInputSchema;
export const mondayColumnCreatePayloadSchema = mondayColumnCreateInputSchema;
export const mondayColumnRenamePayloadSchema = mondayColumnRenameInputSchema;
export const mondayColumnDeletePayloadSchema = mondayColumnDeleteInputSchema;
export const mondayGroupCreatePayloadSchema = mondayGroupCreateInputSchema;
export const mondayGroupRenamePayloadSchema = mondayGroupRenameInputSchema;
export const mondayGroupDeletePayloadSchema = mondayGroupDeleteInputSchema;
