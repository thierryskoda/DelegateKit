import type { ExternalWriteActionContract } from "./types";
import { backendCapabilityExternalWriteContracts } from "../../../capabilities/registry/backend-capability-modules";

export const EXTERNAL_WRITE_ACTION_CONTRACTS: readonly ExternalWriteActionContract[] = [
  ...backendCapabilityExternalWriteContracts,
];
