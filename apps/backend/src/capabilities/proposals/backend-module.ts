import { proposalsToolContracts } from "@ai-assistants/proposals-contracts/contracts";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import { proposalHandlers } from "./handlers";

export const proposalsBackendCapabilityModule = defineBackendCapabilityModule({
  id: "proposals",
  contracts: proposalsToolContracts,
  immediateHandlers: proposalHandlers,
  externalWriteContracts: [],
});
