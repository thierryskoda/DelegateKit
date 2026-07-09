import { requiresProdConfirmation, type RuntimeProfile } from "@ai-assistants/repo-layout";
import {
  installBackendRuntimeEnvForProfile,
  mergeResolvedProfileEnvIntoProcess,
} from "./bind-profile-nango.js";
import { defaultNangoBindingMappingPaths } from "./nango-binding-mapping-paths.js";
import { runNangoProvisioningApply } from "./nango-provisioning-apply.js";
import { runNangoProvisioningValidate } from "./nango-provisioning-validate.js";
import { runNangoSync } from "./nango-sync.js";
import { envForProfile } from "../profiles/profile.js";

function installProfileIntegrationEnv(profile: RuntimeProfile): void {
  mergeResolvedProfileEnvIntoProcess(envForProfile(profile));
  installBackendRuntimeEnvForProfile(profile);
}

function profileArgv(profile: RuntimeProfile): string {
  return `--profile=${profile}`;
}

function nangoSyncMappingArgv(profile: RuntimeProfile): string[] {
  return defaultNangoBindingMappingPaths(profile).map((mappingPath) => `--mapping=${mappingPath}`);
}

export function runNangoValidate(): void {
  runNangoProvisioningValidate();
}

export async function runNangoApply(profile: RuntimeProfile): Promise<void> {
  installProfileIntegrationEnv(profile);
  const argv = [profileArgv(profile)];
  if (requiresProdConfirmation(profile)) argv.push("--confirm-prod");
  await runNangoProvisioningApply(argv);
}

export async function runNangoSyncApply(profile: RuntimeProfile): Promise<void> {
  installProfileIntegrationEnv(profile);
  const argv = ["apply", profileArgv(profile), ...nangoSyncMappingArgv(profile)];
  if (requiresProdConfirmation(profile)) argv.push("--confirm-prod");
  await runNangoSync(argv);
}
