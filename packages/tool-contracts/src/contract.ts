import { z } from "zod";
import type { ExternalActionType } from "./write-policy";
import type { StandardToolDescription } from "./description";

export type JsonSchema = {
  type: "object";
  additionalProperties?: boolean;
  properties?: Record<string, unknown>;
  required?: string[];
};

/** JSON Schema document derived from Zod for successful tool `data` (may be object, array, union, etc.). */
export type ToolOutputJsonSchema = Record<string, unknown>;

export type ToolInputSchema = z.ZodObject<Record<string, z.ZodType>>;

/** Zod schema for successful `BackendToolResult.data` for one tool. */
export type ToolOutputSchema = z.ZodType;
export const TOOL_EXECUTION_KINDS = ["backend_proxy", "runtime_local", "builtin"] as const;
export type ToolExecutionKind = (typeof TOOL_EXECUTION_KINDS)[number];

export const TOOL_EFFECTS = ["read", "write"] as const;
export type ToolEffect = (typeof TOOL_EFFECTS)[number];

type BaseToolContract<
  TName extends string,
  TPluginId extends string,
  TSchema extends ToolInputSchema,
  TOutputSchema extends ToolOutputSchema,
> = {
  name: TName;
  pluginId: TPluginId;
  label: string;
  description: StandardToolDescription;
  executionKind: ToolExecutionKind;
  effect: ToolEffect;
  inputSchema: TSchema;
  parameters: JsonSchema;
  /** Validates successful tool calls' `data` only (`BackendToolResult.ok === true`). */
  outputSchema: TOutputSchema;
  outputParameters: ToolOutputJsonSchema;
  /** Override only for proven exceptions; default is derived from effect. */
  trustedChannelRequired?: boolean;
};

type ReadToolContract<
  TName extends string,
  TPluginId extends string,
  TSchema extends ToolInputSchema,
  TOutputSchema extends ToolOutputSchema,
> = BaseToolContract<TName, TPluginId, TSchema, TOutputSchema> & {
  effect: "read";
  externalAction?: never;
};

type WriteToolContract<
  TName extends string,
  TPluginId extends string,
  TSchema extends ToolInputSchema,
  TOutputSchema extends ToolOutputSchema,
> = BaseToolContract<TName, TPluginId, TSchema, TOutputSchema> & {
  effect: "write";
  externalAction?: ExternalActionType;
};

export type ToolContract<
  TName extends string = string,
  TPluginId extends string = string,
  TSchema extends ToolInputSchema = ToolInputSchema,
  TOutputSchema extends ToolOutputSchema = ToolOutputSchema,
> =
  | ReadToolContract<TName, TPluginId, TSchema, TOutputSchema>
  | WriteToolContract<TName, TPluginId, TSchema, TOutputSchema>;

export type ToolNameFor<TContracts extends readonly ToolContract[]> = TContracts[number]["name"];
export type ToolPluginIdFor<TContracts extends readonly ToolContract[]> =
  TContracts[number]["pluginId"];
export type ToolInput<TContract extends ToolContract> = z.infer<TContract["inputSchema"]>;

/** Successful `BackendToolResult.data` for one tool contract. */
export type ToolOutput<TContract extends ToolContract> = z.infer<TContract["outputSchema"]>;

type WithoutExternalAction<T extends ToolContract> = T extends { externalAction: infer A }
  ? [undefined] extends [A]
    ? T
    : [A] extends [never]
      ? T
      : [A] extends [ExternalActionType]
        ? never
        : T
  : T;

/** Immediate backend tools: every contract without an externalAction (reads and trusted writes). */
export type ImmediateToolContract<TContracts extends readonly ToolContract[]> =
  WithoutExternalAction<TContracts[number]>;

export type ImmediateToolNameFor<TContracts extends readonly ToolContract[]> =
  ImmediateToolContract<TContracts>["name"];

export function trustedChannelRequirementForContract(contract: ToolContract): boolean {
  return contract.trustedChannelRequired === true;
}

export function toolRequiresExternalAction(
  contract: ToolContract,
): contract is ToolContract & { externalAction: ExternalActionType } {
  return Boolean(contract.externalAction);
}

export const emptyParams = z.object({}).strict();
export const stringField = (description: string) => z.string().trim().min(1).describe(description);
export const integerField = (description: string, min: number, max: number, defaultValue: number) =>
  z.number().int().min(min).max(max).default(defaultValue).describe(description);

export function parametersFromSchema(schema: ToolInputSchema): JsonSchema {
  const json = z.toJSONSchema(schema) as JsonSchema & { $schema?: string };
  delete json.$schema;
  return json;
}

export function outputParametersFromSchema(schema: ToolOutputSchema): ToolOutputJsonSchema {
  const json = z.toJSONSchema(schema) as ToolOutputJsonSchema & { $schema?: string };
  delete json.$schema;
  return json;
}

export function defineReadTool<
  const TName extends string,
  const TPluginId extends string,
  const TSchema extends ToolInputSchema,
  const TOutputSchema extends ToolOutputSchema,
>(
  contract: Omit<
    ReadToolContract<TName, TPluginId, TSchema, TOutputSchema>,
    "effect" | "parameters" | "outputParameters" | "executionKind"
  > & {
    executionKind?: ToolExecutionKind;
  },
): ReadToolContract<TName, TPluginId, TSchema, TOutputSchema> {
  const { outputSchema, ...rest } = contract;
  return {
    ...rest,
    effect: "read",
    executionKind: rest.executionKind ?? "backend_proxy",
    outputSchema,
    parameters: parametersFromSchema(rest.inputSchema),
    outputParameters: outputParametersFromSchema(outputSchema),
  } as ReadToolContract<TName, TPluginId, TSchema, TOutputSchema>;
}

export function defineWriteTool<
  const TName extends string,
  const TPluginId extends string,
  const TSchema extends ToolInputSchema,
  const TOutputSchema extends ToolOutputSchema,
>(
  contract: Omit<
    WriteToolContract<TName, TPluginId, TSchema, TOutputSchema>,
    "effect" | "parameters" | "outputParameters" | "executionKind"
  > & {
    executionKind?: ToolExecutionKind;
  },
): WriteToolContract<TName, TPluginId, TSchema, TOutputSchema> {
  const { outputSchema, ...rest } = contract;
  return {
    ...rest,
    effect: "write",
    executionKind: rest.executionKind ?? "backend_proxy",
    outputSchema,
    parameters: parametersFromSchema(rest.inputSchema),
    outputParameters: outputParametersFromSchema(outputSchema),
  } as WriteToolContract<TName, TPluginId, TSchema, TOutputSchema>;
}
