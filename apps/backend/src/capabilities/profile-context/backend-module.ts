import { profileContextToolContracts } from "@ai-assistants/profile-context-contracts/contracts";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import { profileContextHandlers } from "./handlers";

export const profileContextBackendCapabilityModule = defineBackendCapabilityModule({
  id: "profile-context",
  contracts: profileContextToolContracts,
  immediateHandlers: profileContextHandlers,
  externalWriteContracts: [],
});
