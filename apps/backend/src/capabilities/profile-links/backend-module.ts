import { profileLinksToolContracts } from "@ai-assistants/profile-links-contracts/contracts";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import { profileLinkHandlers } from "./handlers";

export const profileLinksBackendCapabilityModule = defineBackendCapabilityModule({
  id: "profile-links",
  contracts: profileLinksToolContracts,
  immediateHandlers: profileLinkHandlers,
  externalWriteContracts: [],
});
