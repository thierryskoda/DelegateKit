import { createSupabaseServiceClient } from "@ai-assistants/control-db";
import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { runProfileStateHygieneReview } from "../../apps/backend/src/ops-support/profile-state-hygiene";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";

type StateHygieneArgs = {
  command: "run";
  profile: RuntimeProfile;
  profileId: string;
  confirmProd: boolean;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run profile -- state-hygiene run --profile=dev --profile-id <id>",
    "  npm run profile -- state-hygiene run --profile=prod --profile-id <id> --confirm-prod",
    "",
    "Runs an on-demand whole-client durable-state hygiene audit.",
    "The command may persist proposed learning-review recommendations, but it never mutates durable profile state directly.",
  ].join("\n");
}

const cliSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
    "profile-id": z.string().trim().min(1, "--profile-id is required."),
    "confirm-prod": z.boolean().optional(),
  })
  .transform((raw) => {
    const profile = raw.profile?.trim() || "dev";
    assertRuntimeProfile(profile);
    return {
      help: raw.help ?? false,
      command: "run" as const,
      profile,
      profileId: raw["profile-id"],
      confirmProd: raw["confirm-prod"] === true,
    };
  });

function parseArgs(argv: readonly string[]): StateHygieneArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      "profile-id": { type: "string" },
      "confirm-prod": { type: "boolean" },
    },
    schema: cliSchema,
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  if (parsed.profile === "prod" && !parsed.confirmProd) {
    throw new Error("Running a production state hygiene audit requires --confirm-prod.");
  }
  return parsed;
}

export async function runProfileStateHygieneCli(argv = process.argv.slice(2)): Promise<void> {
  const [action, ...rest] = argv;
  if (!action || action === "--help" || action === "-h") {
    console.log(usage());
    return;
  }
  if (action !== "run") {
    throw new Error(`Unknown state-hygiene command ${JSON.stringify(action)}.\n\n${usage()}`);
  }

  const args = parseArgs(rest);
  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));
  const result = await runProfileStateHygieneReview(db, { profileId: args.profileId });

  console.log(
    JSON.stringify(
      {
        profile: args.profile,
        profileId: args.profileId,
        command: args.command,
        ...result,
      },
      null,
      2,
    ),
  );
}
