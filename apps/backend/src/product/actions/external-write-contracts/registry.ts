import { createHash } from "node:crypto";
import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { connectActionDetailSchema } from "@ai-assistants/connect-api-contracts";
import type { ConnectActionDetailDto } from "@ai-assistants/connect-api-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { requireRecordJson } from "../../../integrations/provider-runtime";
import { backendToolContracts } from "../../../runtime/agent-tools/registry";
import type { ActionResult } from "../execution/types";
import type { ExternalWriteActionContract, WriteActionPlan, BuildWritePlanContext } from "./types";
import { EXTERNAL_WRITE_ACTION_CONTRACTS } from "./all-external-write-action-contracts";
import { stripUndefinedProperties } from "./json-normalization";
import { externalWriteLifecycleStatus } from "./agent-result";

const externalActionContractByToolName = new Map<string, ExternalWriteActionContract>();
const backendToolContractByName = new Map(backendToolContracts.map((contract) => [contract.name, contract]));
for (const contract of EXTERNAL_WRITE_ACTION_CONTRACTS) {
  if (externalActionContractByToolName.has(contract.toolName)) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Duplicate external action contract for tool ${contract.toolName}.`,
    );
  }
  const toolContract = backendToolContractByName.get(contract.toolName);
  if (toolContract && toolContract.outputSchema !== contract.outputSchema) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `External write action contract output schema for ${contract.toolName} must be the same schema object exposed by the tool contract.`,
    );
  }
  externalActionContractByToolName.set(contract.toolName, contract);
}

function assertExternalWriteRegistryCoversExternalWrites(): void {
  const required = new Set<string>(
    backendToolContracts.filter((c) => Boolean(c.externalAction)).map((c) => c.name),
  );
  const registered = new Set(externalActionContractByToolName.keys());
  const missing = [...required].filter((name) => !registered.has(name));
  const extra = [...registered].filter((name) => !required.has(name));
  if (missing.length > 0 || extra.length > 0) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `External write action contract registry drift. missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`,
    );
  }
}

assertExternalWriteRegistryCoversExternalWrites();

function requireExternalWriteActionContract(toolName: string): ExternalWriteActionContract {
  const contract = externalActionContractByToolName.get(toolName);
  if (!contract) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `No external action contract registered for tool ${toolName}.`,
    );
  }
  return contract;
}

export function resolvedRequestHashForWritePlan(plan: WriteActionPlan): string {
  const trimmed = plan.requestHash?.trim();
  if (trimmed) return trimmed;
  return createHash("sha256").update(JSON.stringify(plan.actionPayload)).digest("hex");
}

export async function buildValidatedWritePlan(
  toolName: string,
  ctx: BuildWritePlanContext,
): Promise<WriteActionPlan> {
  const contract = requireExternalWriteActionContract(toolName);
  const plan = await contract.buildWritePlan(ctx);
  const parsedActionPayload = contract.actionPayloadSchema.parse(plan.actionPayload);
  if (
    !parsedActionPayload ||
    typeof parsedActionPayload !== "object" ||
    Array.isArray(parsedActionPayload)
  ) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `External write action payload for ${toolName} must be a JSON object.`,
    );
  }
  const actionPayload = stripUndefinedProperties(parsedActionPayload);
  contract.actionPayloadSchema.parse(actionPayload);
  return {
    ...plan,
    actionPayload,
    reviewPayload:
      plan.reviewPayload === null ? null : stripUndefinedProperties(plan.reviewPayload),
  };
}

export async function executeExternalWriteForProfileAction(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
): Promise<ActionResult> {
  const contract = requireExternalWriteActionContract(action.tool_name);
  const raw = requireRecordJson(action.execution_payload, `${action.tool_name} execution_payload`);
  const payload = contract.actionPayloadSchema.parse(raw);
  return contract.execute(db, action, payload);
}

export function connectActionDetailForProfileAction(
  action: TableRow<"profile_actions">,
): ConnectActionDetailDto {
  const contract = requireExternalWriteActionContract(action.tool_name);
  const raw = requireRecordJson(action.execution_payload, `${action.tool_name} execution_payload`);
  const payload = contract.actionPayloadSchema.parse(raw);
  return connectActionDetailSchema.parse(contract.buildReviewDetail({ action, payload }));
}

export function agentWriteResultForProfileAction(action: TableRow<"profile_actions">): unknown {
  const contract = requireExternalWriteActionContract(action.tool_name);
  const raw = requireRecordJson(action.execution_payload, `${action.tool_name} execution_payload`);
  const payload = contract.actionPayloadSchema.parse(raw);
  return contract.outputSchema.parse(
    contract.buildAgentResult({
      action,
      payload,
      status: externalWriteLifecycleStatus(action),
      resultPayload: action.result_payload,
      providerError: action.provider_error,
    }),
  );
}
