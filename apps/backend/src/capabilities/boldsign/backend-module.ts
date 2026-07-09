import { boldsignToolContracts } from "@ai-assistants/boldsign-contracts/contracts";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { boldsignExternalWriteActionContracts } from "./external-write-contracts";
import { executeBoldSignReadTool } from "./read-tools";

export const boldsignBackendCapabilityModule = defineBackendCapabilityModule({
  id: "boldsign",
  contracts: boldsignToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(
    boldsignToolContracts,
    (ctx) => executeBoldSignReadTool(ctx.db, ctx.profile.id, ctx.input.toolName, ctx.params),
  ),
  externalWriteContracts: boldsignExternalWriteActionContracts,
});
