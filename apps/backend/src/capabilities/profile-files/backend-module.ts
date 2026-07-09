import { profileFileToolContracts } from "@ai-assistants/profile-files-contracts/contracts";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import { profileFilesHandlers } from "./handlers";

export const profileFilesBackendCapabilityModule = defineBackendCapabilityModule({
  id: "profile-files",
  contracts: profileFileToolContracts,
  immediateHandlers: profileFilesHandlers,
  externalWriteContracts: [],
});
