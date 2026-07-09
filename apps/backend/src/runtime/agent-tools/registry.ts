import { ALL_LOCAL_AGENT_TOOL_CONTRACTS } from "@ai-assistants/assistant-capability-surface";
import {
  createToolRegistry,
  type PublicToolContract,
  type ToolContract,
  externalActionTypeSchema,
} from "@ai-assistants/tool-contracts";

export const backendToolContracts: readonly ToolContract[] = ALL_LOCAL_AGENT_TOOL_CONTRACTS;

for (const contract of backendToolContracts) {
  if (Boolean(contract.externalAction)) {
    externalActionTypeSchema.parse(contract.externalAction);
  }
}

export const backendToolRegistry = createToolRegistry(backendToolContracts);

export function publicBackendToolContracts(): PublicToolContract[] {
  return backendToolRegistry.publicToolContracts();
}
