import assert from "node:assert/strict";
import type { ToolContract, ToolNameFor } from "@ai-assistants/tool-contracts";

function contractToolNames<const TContracts extends readonly ToolContract[]>(
  contracts: TContracts,
): ToolNameFor<TContracts>[] {
  return contracts.map((contract) => contract.name) as ToolNameFor<TContracts>[];
}

type CapabilityToolCoverage<TContracts extends readonly ToolContract[]> = {
  readonly capabilityId: string;
  readonly contracts: TContracts;
  exercise: (toolName: string) => void;
  assertComplete: (input?: { waived?: readonly ToolNameFor<TContracts>[] }) => void;
};

export function createCapabilityToolCoverage<const TContracts extends readonly ToolContract[]>(
  capabilityId: string,
  contracts: TContracts,
): CapabilityToolCoverage<TContracts> {
  const exercised = new Set<string>();

  return {
    capabilityId,
    contracts,
    exercise(toolName: string) {
      exercised.add(toolName);
    },
    assertComplete(input) {
      const waived = new Set(input?.waived ?? []);
      const missing = contractToolNames(contracts).filter(
        (toolName) => !exercised.has(toolName) && !waived.has(toolName),
      );
      assert.deepEqual(
        missing,
        [],
        [
          `${capabilityId} capability E2E must exercise every contract tool or declare it waived.`,
          `Missing: ${missing.join(", ") || "(none)"}`,
          `Contract tools: ${contractToolNames(contracts).join(", ")}`,
          `Exercised: ${[...exercised].sort().join(", ") || "(none)"}`,
          waived.size > 0 ? `Waived: ${[...waived].sort().join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  };
}
