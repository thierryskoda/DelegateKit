import { scheduledTasksToolContracts } from "@ai-assistants/scheduled-tasks-contracts/contracts";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import { scheduledTaskHandlers } from "./handlers";

export const scheduledTasksBackendCapabilityModule = defineBackendCapabilityModule({
  id: "scheduled-tasks",
  contracts: scheduledTasksToolContracts,
  immediateHandlers: scheduledTaskHandlers,
  externalWriteContracts: [],
});
