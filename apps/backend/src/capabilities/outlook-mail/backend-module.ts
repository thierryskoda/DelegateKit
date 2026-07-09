import { outlookMailToolContracts } from "@ai-assistants/outlook-mail-contracts/contracts";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { outlookMailExternalWriteActionContracts } from "./external-write-contracts";
import { executeOutlookMailReadTool } from "./read-tools";

export const outlookMailBackendCapabilityModule = defineBackendCapabilityModule({
  id: "outlook-mail",
  contracts: outlookMailToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(
    outlookMailToolContracts,
    (ctx) => executeOutlookMailReadTool(ctx.db, ctx.profile.id, ctx.input.toolName, ctx.params),
  ),
  externalWriteContracts: outlookMailExternalWriteActionContracts,
});
