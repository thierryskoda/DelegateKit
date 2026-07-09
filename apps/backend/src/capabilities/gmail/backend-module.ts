import { gmailToolContracts } from "@ai-assistants/gmail-contracts/contracts";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { gmailExternalWriteActionContracts } from "./external-write-contracts";
import { executeGmailReadTool } from "./read-tools";

export const gmailBackendCapabilityModule = defineBackendCapabilityModule({
  id: "gmail",
  contracts: gmailToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(
    gmailToolContracts,
    (ctx) => executeGmailReadTool(ctx.db, ctx.profile.id, ctx.input.toolName, ctx.params),
  ),
  externalWriteContracts: gmailExternalWriteActionContracts,
});
