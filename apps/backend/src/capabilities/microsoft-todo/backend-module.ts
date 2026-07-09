import { microsoftTodoToolContracts } from "@ai-assistants/microsoft-todo-contracts/contracts";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { microsoftTodoExternalWriteActionContracts } from "./external-write-contracts";
import { executeMicrosoftTodoReadTool } from "./read-tools";

export const microsoftTodoBackendCapabilityModule = defineBackendCapabilityModule({
  id: "microsoft-todo",
  contracts: microsoftTodoToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(microsoftTodoToolContracts, (ctx) =>
    executeMicrosoftTodoReadTool(ctx.db, ctx.profile.id, ctx.input.toolName, ctx.params),
  ),
  externalWriteContracts: microsoftTodoExternalWriteActionContracts,
});
