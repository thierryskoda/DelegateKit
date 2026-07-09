import { googleCalendarToolContracts } from "@ai-assistants/google-calendar-contracts/contracts";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { googleCalendarExternalWriteActionContracts } from "./external-write-contracts";
import { executeGoogleCalendarReadTool } from "./read-tools";

export const googleCalendarBackendCapabilityModule = defineBackendCapabilityModule({
  id: "google-calendar",
  contracts: googleCalendarToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(
    googleCalendarToolContracts,
    (ctx) => executeGoogleCalendarReadTool(ctx.db, ctx.profile.id, ctx.input.toolName, ctx.params),
  ),
  externalWriteContracts: googleCalendarExternalWriteActionContracts,
});
