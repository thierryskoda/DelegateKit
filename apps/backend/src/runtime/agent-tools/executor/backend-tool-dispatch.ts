import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { BackendToolResult } from "@ai-assistants/tool-contracts";
import { backendCapabilityImmediateHandlerForTool } from "../../../capabilities/registry/backend-capability-modules";
import { backendToolRegistry } from "../registry";
import type { ExecutorContext } from "./context";

export async function dispatchNonSyncTool(ctx: ExecutorContext): Promise<BackendToolResult> {
  const moduleHandler = backendCapabilityImmediateHandlerForTool(ctx.input.toolName);
  if (moduleHandler) return moduleHandler(ctx);

  const contract = backendToolRegistry.contractForTool(ctx.input.toolName);
  if (!contract) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `dispatchNonSyncTool reached unregistered tool: ${ctx.input.toolName}`,
    );
  }
  throw new DomainError(
    domainCodes.INTERNAL,
    `Backend executor has no handler branch for registered tool "${ctx.input.toolName}". Add a handler in the owning backend capability module.`,
  );
}
