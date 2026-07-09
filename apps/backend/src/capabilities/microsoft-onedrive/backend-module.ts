import { microsoftOnedriveToolContracts } from "@ai-assistants/microsoft-onedrive-contracts/contracts";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { microsoftOnedriveExternalWriteActionContracts } from "./external-write-contracts";
import { executeMicrosoftOnedriveReadAndArtifactTool } from "./read-tools";

export const microsoftOnedriveBackendCapabilityModule = defineBackendCapabilityModule({
  id: "microsoft-onedrive",
  contracts: microsoftOnedriveToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(
    microsoftOnedriveToolContracts,
    (ctx) =>
      executeMicrosoftOnedriveReadAndArtifactTool(
        ctx.db,
        ctx.profile.id,
        ctx.input.toolName,
        ctx.params,
      ),
  ),
  externalWriteContracts: microsoftOnedriveExternalWriteActionContracts,
});
