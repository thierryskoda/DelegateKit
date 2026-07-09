import { workToolContracts } from "@ai-assistants/work-contracts/contracts";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import { workItemRouteHandlers } from "./handlers";

export const workBackendCapabilityModule = defineBackendCapabilityModule({
  id: "work",
  contracts: workToolContracts,
  immediateHandlers: workItemRouteHandlers,
  externalWriteContracts: [],
});
