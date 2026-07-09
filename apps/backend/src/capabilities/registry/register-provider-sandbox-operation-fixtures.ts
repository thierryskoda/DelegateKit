import { providerSandboxOperationResponseSchemas } from "./provider-sandbox-operation-schemas";
import { registerProviderSandboxOperationFixture } from "../../integrations/provider-sandbox/operation-fixtures";

let registered = false;

export function registerProviderSandboxOperationFixtures(): void {
  if (registered) return;
  registered = true;
  for (const [providerKey, operations] of Object.entries(providerSandboxOperationResponseSchemas)) {
    for (const [operation, responseSchema] of Object.entries(operations)) {
      registerProviderSandboxOperationFixture({ providerKey, operation, responseSchema });
    }
  }
}
