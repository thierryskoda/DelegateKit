import { googleDriveToolContracts } from "@ai-assistants/google-drive-contracts/contracts";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { googleDriveExternalWriteActionContracts } from "./external-write-contracts";
import { executeGoogleDriveReadAndArtifactTool } from "./read-tools";

export const googleDriveBackendCapabilityModule = defineBackendCapabilityModule({
  id: "google-drive",
  contracts: googleDriveToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(
    googleDriveToolContracts,
    (ctx) =>
      executeGoogleDriveReadAndArtifactTool(
        ctx.db,
        ctx.profile.id,
        ctx.input.toolName,
        ctx.params,
      ),
  ),
  externalWriteContracts: googleDriveExternalWriteActionContracts,
});
