import { actionsToolContracts } from "@ai-assistants/actions-contracts/contracts";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import { actionHandlers } from "./handlers";

export const actionsBackendCapabilityModule = defineBackendCapabilityModule({
  id: "actions",
  contracts: actionsToolContracts,
  immediateHandlers: actionHandlers,
  externalWriteContracts: [],
});
