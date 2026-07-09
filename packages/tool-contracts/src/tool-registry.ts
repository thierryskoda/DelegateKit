import { formatUnknownError } from "@ai-assistants/errors";
import { z } from "zod";

import {
  TOOL_EFFECTS,
  TOOL_EXECUTION_KINDS,
  type ToolContract,
  type ToolInput,
  type ToolNameFor,
} from "./contract";
import { assertToolContractNamesMatchPluginDomain } from "./plugin-tool-name-prefix";
import type { BackendToolResult } from "./backend-result";

export class ToolParamsValidationError extends Error {
  readonly status = 400;
  readonly details: unknown;
  readonly toolName: string;

  constructor(toolName: string, error: z.ZodError) {
    super(`Invalid params for ${toolName}: ${formatUnknownError(error)}`);
    this.toolName = toolName;
    this.details = z.flattenError(error);
  }
}

export class ToolOutputValidationError extends Error {
  readonly toolName: string;
  readonly details: unknown;

  constructor(toolName: string, error: z.ZodError) {
    super(`Invalid tool output data for ${toolName}: ${formatUnknownError(error)}`);
    this.toolName = toolName;
    this.details = z.flattenError(error);
  }
}

/**
 * When a result succeeds, replaces `data` with output-schema–parsed data (strict shapes, no silent extra keys unless schema uses passthrough).
 * Failed results are returned unchanged.
 */
export function validateSuccessfulToolResult(
  contract: ToolContract,
  result: BackendToolResult,
): BackendToolResult {
  if ("error" in result) return result;
  const parsed = contract.outputSchema.safeParse(result.data);
  if (!parsed.success) throw new ToolOutputValidationError(contract.name, parsed.error);
  return { ...result, data: parsed.data as typeof result.data };
}

export function parseToolParams<TContract extends ToolContract>(
  contract: TContract,
  params: unknown,
): ToolInput<TContract> {
  const parsed = contract.inputSchema.safeParse(params ?? {});
  if (!parsed.success) throw new ToolParamsValidationError(contract.name, parsed.error);
  return parsed.data as ToolInput<TContract>;
}

export function assertUniqueToolNames(contracts: readonly ToolContract[]): void {
  const seen = new Set<string>();
  for (const contract of contracts) {
    if (seen.has(contract.name))
      throw new Error(`Duplicate agent tool contract name: ${contract.name}`);
    seen.add(contract.name);
  }
}

export function assertToolExecutionKinds(contracts: readonly ToolContract[]): void {
  for (const contract of contracts) {
    if (!(TOOL_EXECUTION_KINDS as readonly string[]).includes(contract.executionKind)) {
      throw new Error(
        `Tool contract ${contract.name} has unknown executionKind: ${JSON.stringify(contract.executionKind)}.`,
      );
    }
  }
}

export function assertToolEffects(contracts: readonly ToolContract[]): void {
  for (const contract of contracts) {
    const externalAction = (contract as ToolContract & { externalAction?: unknown }).externalAction;
    if (!(TOOL_EFFECTS as readonly string[]).includes(contract.effect)) {
      throw new Error(
        `Tool contract ${contract.name} has unknown effect: ${JSON.stringify(contract.effect)}.`,
      );
    }
    if (contract.effect === "read" && externalAction) {
      throw new Error(`Read tool ${contract.name} must not declare externalAction.`);
    }
    if (externalAction && contract.effect !== "write") {
      throw new Error(`External-write tool ${contract.name} must use effect "write".`);
    }
  }
}

/** Params the backend injects or that must never be accepted from untrusted tool args. */
const BACKEND_OWNED_INPUT_PARAM_NAME_PATTERNS = [
  /^profile_?id$/i,
  /^connection_?id$/i,
  /^client_?id$/i,
  /^(?:access|refresh|auth|bearer)?_?token$/i,
  /secret/i,
  /credential/i,
  /^vault/i,
  /^api_?key$/i,
  /^workspace(dir|path)?$/i,
  /^local(path)?$/i,
  /^file(path)?$/i,
  /^path$/i,
] as const;

function isBackendOwnedInputParamName(key: string): boolean {
  return BACKEND_OWNED_INPUT_PARAM_NAME_PATTERNS.some((pattern) => pattern.test(key));
}

export function assertNoBackendOwnedParamNames(contracts: readonly ToolContract[]): void {
  for (const contract of contracts) {
    const keys = Object.keys(contract.inputSchema.shape);
    for (const key of keys) {
      if (isBackendOwnedInputParamName(key)) {
        throw new Error(
          `Tool contract ${contract.name} must not declare backend-owned parameter "${key}".`,
        );
      }
    }
  }
}

function toolOutputSchemaIsForbiddenLoose(schema: ToolContract["outputSchema"]): boolean {
  const t = (schema as { _zod?: { def?: { type?: string } } })._zod?.def?.type;
  return t === "unknown" || t === "any";
}

function looseOutputJsonSchemaPath(schema: unknown, path = "$"): string | null {
  if (!schema || typeof schema !== "object") return null;
  const record = schema as Record<string, unknown>;
  if (record.additionalProperties === true) return `${path}.additionalProperties`;
  if (
    record.additionalProperties &&
    typeof record.additionalProperties === "object" &&
    Object.keys(record.additionalProperties).length === 0
  ) {
    return `${path}.additionalProperties`;
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "$schema") continue;
    const found = looseOutputJsonSchemaPath(value, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

export function assertContractsHaveConcreteOutputSchemas(contracts: readonly ToolContract[]): void {
  for (const contract of contracts) {
    if (typeof contract.outputSchema?.safeParse !== "function") {
      throw new Error(
        `Tool contract ${contract.name} must declare outputSchema (Zod with safeParse).`,
      );
    }
    if (toolOutputSchemaIsForbiddenLoose(contract.outputSchema)) {
      throw new Error(
        `Tool contract ${contract.name} must declare a concrete outputSchema (forbidden: z.unknown() / z.any()).`,
      );
    }
    if (!contract.outputParameters || typeof contract.outputParameters !== "object") {
      throw new Error(
        `Tool contract ${contract.name} must declare outputParameters derived from outputSchema.`,
      );
    }
    const looseOutputPath = looseOutputJsonSchemaPath(contract.outputParameters);
    if (looseOutputPath) {
      throw new Error(
        `Tool contract ${contract.name} outputSchema must not expose unconstrained object data (${looseOutputPath}). Use an explicit normalized DTO schema.`,
      );
    }
  }
}

export function assertToolContracts(contracts: readonly ToolContract[]): void {
  if (contracts.length === 0) throw new Error("Tool contract list must not be empty.");
  assertUniqueToolNames(contracts);
  assertToolExecutionKinds(contracts);
  assertToolEffects(contracts);
  assertToolContractNamesMatchPluginDomain(contracts);
  assertNoBackendOwnedParamNames(contracts);
  assertContractsHaveConcreteOutputSchemas(contracts);
}

export function toolNamesForContracts<TContracts extends readonly ToolContract[]>(
  contracts: TContracts,
): Array<TContracts[number]["name"]> {
  return contracts.map((contract) => contract.name);
}

export type ToolContractByName<
  TContracts extends readonly ToolContract[],
  TName extends ToolNameFor<TContracts>,
> = Extract<TContracts[number], { name: TName }>;

export function toolContractByName<
  const TContracts extends readonly ToolContract[],
  const TName extends ToolNameFor<TContracts>,
>(contracts: TContracts, name: TName): ToolContractByName<TContracts, TName> {
  const contract = contracts.find((item) => item.name === name);
  if (!contract) throw new Error(`Unknown agent tool contract: ${name}`);
  return contract as ToolContractByName<TContracts, TName>;
}

export type PublicToolContract = Omit<ToolContract, "inputSchema" | "outputSchema">;

export function publicToolContracts(contracts: readonly ToolContract[]): PublicToolContract[] {
  return contracts.map(
    ({ inputSchema: _inputSchema, outputSchema: _outputSchema, ...rest }) => rest,
  );
}

export function createToolRegistry<const TContracts extends readonly ToolContract[]>(
  contracts: TContracts,
) {
  assertToolContracts(contracts);
  const byName = new Map<string, TContracts[number]>();
  for (const contract of contracts) {
    byName.set(contract.name, contract);
  }

  const toolNameValues = toolNamesForContracts(contracts) as [
    TContracts[number]["name"],
    ...Array<TContracts[number]["name"]>,
  ];
  const toolNameSchema = z.enum(toolNameValues);

  function contractForTool(name: string): TContracts[number] | null {
    return byName.get(name) ?? null;
  }

  function requireToolContract(name: string): TContracts[number] {
    const contract = contractForTool(name);
    if (!contract) throw new Error(`Unknown agent tool contract: ${name}`);
    return contract;
  }

  function parseRegisteredToolParams(toolName: string, params: unknown): Record<string, unknown> {
    return parseToolParams(requireToolContract(toolName), params);
  }

  return {
    contracts,
    toolNameSchema,
    contractForTool,
    requireToolContract,
    parseToolParams: parseRegisteredToolParams,
    publicToolContracts: () => publicToolContracts(contracts),
  } as const;
}
