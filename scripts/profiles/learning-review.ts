import { createSupabaseServiceClient } from "@ai-assistants/control-db";
import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { runProfileLearningReview } from "../../apps/backend/src/ops-support/profile-learning-review-run";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";

type LearningReviewArgs = {
  command: "run-cursor" | "replay-date";
  profile: RuntimeProfile;
  profileId: string;
  localDate?: string;
  confirmProd: boolean;
};

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

function usage(): string {
  return [
    "Usage:",
    "  npm run profile -- learning-review run-cursor --profile=dev --profile-id <id>",
    "  npm run profile -- learning-review replay-date --profile=dev --profile-id <id> --local-date YYYY-MM-DD",
    "  npm run profile -- learning-review run-cursor --profile=prod --profile-id <id> --confirm-prod",
    "  npm run profile -- learning-review replay-date --profile=prod --profile-id <id> --local-date YYYY-MM-DD --confirm-prod",
    "",
    "run-cursor uses the real scheduled cursor path for one profile.",
    "replay-date replays one local date without advancing the production cursor.",
  ].join("\n");
}

function cliSchemaForCommand(command: "run-cursor" | "replay-date") {
  return z
    .object({
      help: z.boolean().optional(),
      profile: z.string().optional(),
      "profile-id": z.string().trim().min(1, "--profile-id is required."),
      "local-date": localDateSchema.optional(),
      "confirm-prod": z.boolean().optional(),
    })
    .transform((raw, ctx) => {
      const profile = raw.profile?.trim() || "dev";
      assertRuntimeProfile(profile);
      if (command === "replay-date" && !raw["local-date"]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["local-date"],
          message: "replay-date requires --local-date YYYY-MM-DD.",
        });
        return z.NEVER;
      }
      if (command === "run-cursor" && raw["local-date"]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["local-date"],
          message: "run-cursor does not accept --local-date. Use replay-date.",
        });
        return z.NEVER;
      }
      return {
        help: raw.help ?? false,
        command,
        profile,
        profileId: raw["profile-id"],
        localDate: raw["local-date"],
        confirmProd: raw["confirm-prod"] === true,
      };
    });
}

function parseArgs(
  command: "run-cursor" | "replay-date",
  argv: readonly string[],
): LearningReviewArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      "profile-id": { type: "string" },
      "local-date": { type: "string" },
      "confirm-prod": { type: "boolean" },
    },
    schema: cliSchemaForCommand(command),
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  if (parsed.profile === "prod" && !parsed.confirmProd) {
    throw new Error("Running a production learning review requires --confirm-prod.");
  }
  return parsed;
}

export async function runProfileLearningReviewCli(argv = process.argv.slice(2)): Promise<void> {
  const [action, ...rest] = argv;
  if (!action || action === "--help" || action === "-h") {
    console.log(usage());
    return;
  }
  if (action !== "run-cursor" && action !== "replay-date") {
    throw new Error(`Unknown learning-review command ${JSON.stringify(action)}.\n\n${usage()}`);
  }

  const args = parseArgs(action, rest);
  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));
  const result = await runProfileLearningReview(db, {
    profileId: args.profileId,
    ...(args.command === "replay-date" ? { localDate: args.localDate } : {}),
  });

  console.log(
    JSON.stringify(
      {
        profile: args.profile,
        profileId: args.profileId,
        command: args.command,
        localDate: args.localDate,
        ...result,
      },
      null,
      2,
    ),
  );
}
