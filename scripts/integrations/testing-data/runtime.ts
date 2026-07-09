import { createSupabaseServiceClient, type SupabaseServiceClient } from "@ai-assistants/control-db";
import type { RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  installBackendRuntimeEnvForProfile,
  mergeResolvedProfileEnvIntoProcess,
} from "../bind-profile-nango";
import { envForProfile } from "../../profiles/profile";
import { supabaseConfigFromProfile } from "../../repo-tooling/build/profile-db-config";
import { TESTING_PROFILE_ID } from "./types";

type TestingDataRuntimeProfile = "dev" | "e2e" | "prod";

export function usage(): string {
  return [
    "Usage:",
    "  npm run integrations -- testing-data audit --profile=dev [--out=tmp/integration-audits/<id>.md] [--judge]",
    "  npm run integrations -- testing-data audit --profile=e2e [--out=tmp/integration-audits/<id>.md] [--judge]",
    "  npm run integrations -- testing-data cleanup --profile=dev --report=tmp/integration-audits/<id>.json [--candidate=id ...] [--execute]",
    "  npm run integrations -- testing-data cleanup --profile=e2e --report=tmp/integration-audits/<id>.json [--candidate=id ...] [--execute]",
    "",
    "Audit fetches live testing-profile integration data and writes markdown + JSON.",
    "Cleanup is dry-run by default; pass --execute to mutate providers for explicit candidates.",
    `Default profileId is ${TESTING_PROFILE_ID}; pass --profile-id=<id> only with maintainer intent.`,
  ].join("\n");
}

const sharedOptionsSchema = z.object({
  profile: z.enum(["dev", "e2e", "prod"]),
  "profile-id": z.string().trim().min(1).optional(),
});

export function parseTestingDataSharedArgs(argv: readonly string[]): {
  profile: TestingDataRuntimeProfile;
  profileId: string;
  rest: string[];
} {
  const parsed = parseCli(argv, {
    options: {
      profile: { type: "string" },
      "profile-id": { type: "string" },
    },
    allowPositionals: true,
    transform: ({ values, positionals }) => ({ ...values, positionals }),
    schema: sharedOptionsSchema.extend({
      positionals: z.array(z.string()),
    }),
  });

  const profileId = parsed["profile-id"] ?? TESTING_PROFILE_ID;
  if (profileId !== TESTING_PROFILE_ID) {
    throw new Error(
      `Refusing profile-id ${JSON.stringify(profileId)}. This workflow only supports ${JSON.stringify(TESTING_PROFILE_ID)} unless extended deliberately.`,
    );
  }

  return { profile: parsed.profile, profileId, rest: parsed.positionals };
}

export function profileFlagsFromArgv(argv: readonly string[]): string[] {
  return argv.filter((arg) => arg.startsWith("--profile=") || arg.startsWith("--profile-id="));
}

export function installTestingDataRuntime(profile: RuntimeProfile): SupabaseServiceClient {
  const resolvedEnv = envForProfile(profile);
  mergeResolvedProfileEnvIntoProcess(resolvedEnv);
  installBackendRuntimeEnvForProfile(profile);
  return createSupabaseServiceClient(supabaseConfigFromProfile(profile));
}
