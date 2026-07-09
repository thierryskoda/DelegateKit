import { outlookCalendarToolContracts } from "@ai-assistants/outlook-calendar-contracts/contracts";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { outlookCalendarExternalWriteActionContracts } from "./external-write-contracts";
import { executeOutlookCalendarReadTool } from "./read-tools";

export const outlookCalendarBackendCapabilityModule = defineBackendCapabilityModule({
  id: "outlook-calendar",
  contracts: outlookCalendarToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(
    outlookCalendarToolContracts,
    (ctx) => executeOutlookCalendarReadTool(ctx.db, ctx.profile.id, ctx.input.toolName, ctx.params),
  ),
  externalWriteContracts: outlookCalendarExternalWriteActionContracts,
});
