#!/usr/bin/env tsx

/**
 * Non-network validation: importing the capability catalog runs manifest assertions.
 * Use in CI to fail fast if OAuth providers drift from Nango provisioning mappings.
 */
import {
  assertNangoProvisioningCoversOAuthActivationPolicies,
  NANGO_PROVISIONING_ENTRIES,
} from "@ai-assistants/nango-provisioning";

export function runNangoProvisioningValidate(): void {
  assertNangoProvisioningCoversOAuthActivationPolicies();
  console.log(
    `OK: Nango provisioning manifest valid (${NANGO_PROVISIONING_ENTRIES.length} integrations).`,
  );
}

if (process.argv[1]?.endsWith("nango-provisioning-validate.ts")) {
  runNangoProvisioningValidate();
}
