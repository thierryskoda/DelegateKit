import { timeToolContracts } from "@ai-assistants/time-contracts/contracts";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import { timeResolveHandlers } from "./handlers";

export const timeBackendCapabilityModule = defineBackendCapabilityModule({
  id: "time",
  contracts: timeToolContracts,
  immediateHandlers: {
    time_resolve: timeResolveHandlers.time_resolve,
  },
  externalWriteContracts: [],
});
