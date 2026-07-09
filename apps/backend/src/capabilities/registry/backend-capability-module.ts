import { DomainError, domainCodes } from "@ai-assistants/errors";
import type {
  BackendToolResult,
  ImmediateToolContract,
  ImmediateToolNameFor,
  ToolContract,
  ToolInput,
  ToolOutput,
} from "@ai-assistants/tool-contracts";
import type { ExternalWriteActionContract } from "../../product/actions/external-write-contracts/types";
import type { ExecutorContext } from "../../runtime/agent-tools/executor/context";

type BackendImmediateToolHandler<TContract extends ToolContract> = (
  ctx: ExecutorContext & { params: ToolInput<TContract> },
) => Promise<BackendToolResult<ToolOutput<TContract>>> | BackendToolResult<ToolOutput<TContract>>;

export type BackendImmediateToolHandlers<TContracts extends readonly ToolContract[]> = {
  [Name in ImmediateToolNameFor<TContracts>]: BackendImmediateToolHandler<
    Extract<ImmediateToolContract<TContracts>, { name: Name }>
  >;
};

export type BackendCapabilityModuleInput<TContracts extends readonly ToolContract[]> = {
  id: string;
  contracts: TContracts;
  immediateHandlers: BackendImmediateToolHandlers<TContracts>;
  externalWriteContracts: readonly ExternalWriteActionContract[];
};

export type BackendCapabilityModule = {
  id: string;
  contracts: readonly ToolContract[];
  immediateHandlers: ReadonlyMap<string, BackendImmediateToolHandler<ToolContract>>;
  externalWriteContracts: readonly ExternalWriteActionContract[];
};

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assertSameSet(label: string, actual: Iterable<string>, expected: Iterable<string>): void {
  const actualSorted = sorted(actual);
  const expectedSorted = sorted(expected);
  const missing = expectedSorted.filter((value) => !actualSorted.includes(value));
  const extra = actualSorted.filter((value) => !expectedSorted.includes(value));
  if (missing.length === 0 && extra.length === 0) return;
  throw new DomainError(
    domainCodes.INTERNAL,
    `${label} coverage drift. missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`,
  );
}

function immediateHandlerMap<TContracts extends readonly ToolContract[]>(
  handlers: BackendImmediateToolHandlers<TContracts>,
): ReadonlyMap<string, BackendImmediateToolHandler<ToolContract>> {
  return new Map(
    Object.entries(handlers).map(([toolName, handler]) => [
      toolName,
      handler as BackendImmediateToolHandler<ToolContract>,
    ]),
  );
}

/**
 * Registers the same dispatch function for every immediate (non-external-write) tool in a module.
 * Prefer explicit per-tool handlers when outputs differ; runtime validation still applies at execute time.
 */
export function backendImmediateHandlersFromDispatch<
  const TContracts extends readonly ToolContract[],
>(
  contracts: TContracts,
  dispatch: (
    ctx: ExecutorContext & { params: Record<string, unknown> },
  ) => Promise<BackendToolResult> | BackendToolResult,
): BackendImmediateToolHandlers<TContracts> {
  const handlers: Record<string, BackendImmediateToolHandler<ToolContract>> = {};
  for (const contract of contracts) {
    if (contract.externalAction) continue;
    handlers[contract.name] = (ctx) => dispatch(ctx);
  }
  return handlers as BackendImmediateToolHandlers<TContracts>;
}

export function defineBackendCapabilityModule<const TContracts extends readonly ToolContract[]>(
  module: BackendCapabilityModuleInput<TContracts>,
): BackendCapabilityModule {
  const immediateToolNames = module.contracts
    .filter((contract) => !Boolean(contract.externalAction))
    .map((contract) => contract.name);
  const externalWriteToolNames = module.contracts
    .filter((contract) => Boolean(contract.externalAction))
    .map((contract) => contract.name);

  assertSameSet(
    `${module.id} immediate tool handler`,
    Object.keys(module.immediateHandlers),
    immediateToolNames,
  );
  assertSameSet(
    `${module.id} external action contract`,
    module.externalWriteContracts.map((contract) => contract.toolName),
    externalWriteToolNames,
  );
  return {
    id: module.id,
    contracts: module.contracts,
    immediateHandlers: immediateHandlerMap(module.immediateHandlers),
    externalWriteContracts: module.externalWriteContracts,
  };
}
