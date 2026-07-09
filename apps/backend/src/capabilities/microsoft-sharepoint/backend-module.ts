import { microsoftSharepointToolContracts } from "@ai-assistants/microsoft-sharepoint-contracts/contracts";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { executeMicrosoftSharepointReadAndArtifactTool } from "./read-tools";

export const microsoftSharepointBackendCapabilityModule = defineBackendCapabilityModule({
  id: "microsoft-sharepoint",
  contracts: microsoftSharepointToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(
    microsoftSharepointToolContracts,
    (ctx) =>
      executeMicrosoftSharepointReadAndArtifactTool(
        ctx.db,
        ctx.profile.id,
        ctx.input.toolName,
        ctx.params,
      ),
  ),
  externalWriteContracts: [],
});
