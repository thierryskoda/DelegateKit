#!/usr/bin/env tsx

import { compactProfileEnvFile, parseProfileBuildOptions, syncProfileSourceEnv } from "./profile";
import { validateProfileRuntime } from "../repo-tooling/build/profile-runtime-validation";
import { pathToFileURL } from "node:url";

export async function runProfileBuildCli(argv = process.argv.slice(2)): Promise<void> {
  const { profile } = parseProfileBuildOptions(argv);
  syncProfileSourceEnv(profile);
  compactProfileEnvFile(profile);
  const result = await validateProfileRuntime({ profile });
  console.log(
    JSON.stringify({
      ok: true,
      profile: result.profile,
      profileCount: result.profileCount,
      defaultProfileId: result.defaultProfileId,
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runProfileBuildCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
