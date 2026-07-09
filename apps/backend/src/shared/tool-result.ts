import { DomainError } from "@ai-assistants/errors";
import {
  toolContractByName,
  toolDataForContract,
  toolError,
  type BackendToolResult,
  type ImmediateToolNameFor,
  type ToolContract,
  type ToolContractByName,
  type ToolOutput,
} from "@ai-assistants/tool-contracts";

export function backendToolDomainError(error: DomainError): BackendToolResult<never> {
  return toolError({ message: error.message });
}

export function backendToolData<
  const TContracts extends readonly ToolContract[],
  Name extends ImmediateToolNameFor<TContracts>,
>(
  contracts: TContracts,
  toolName: Name,
  data: ToolOutput<ToolContractByName<TContracts, Name>>,
): BackendToolResult<ToolOutput<ToolContractByName<TContracts, Name>>> {
  const contract = toolContractByName(contracts, toolName);
  return toolDataForContract(contract, data) as BackendToolResult<
    ToolOutput<ToolContractByName<TContracts, Name>>
  >;
}
