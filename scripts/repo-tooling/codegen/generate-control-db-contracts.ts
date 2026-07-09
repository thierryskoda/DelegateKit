#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format as formatWithPrettier, resolveConfig as resolvePrettierConfig } from "prettier";
import ts from "typescript";
import { repoRoot } from "@ai-assistants/repo-layout";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { readSupabaseLocalDatabaseUrl } from "../../profiles/supabase-status";
import { runRequiredBoundedCommand } from "../bounded-command";

const SUPABASE_CLI = ["--yes", "supabase@2.98.1"] as const;
const SUPABASE_TYPEGEN_TIMEOUT_MS = 120_000;

type GenerationMode = "local" | "linked";

type RowContract = {
  table: string;
  interfaceName: string;
};

export const rowContracts = [
  { table: "profile_actions", interfaceName: "ProfileActionGeneratedRow" },
  { table: "profile_proposals", interfaceName: "ProfileProposalGeneratedRow" },
  { table: "browser_auth_contexts", interfaceName: "BrowserAuthContextGeneratedRow" },
  { table: "browser_tasks", interfaceName: "BrowserTaskGeneratedRow" },
  { table: "browser_task_events", interfaceName: "BrowserTaskEventGeneratedRow" },
  { table: "browser_handoffs", interfaceName: "BrowserHandoffGeneratedRow" },
  { table: "approval_policies", interfaceName: "ApprovalPolicyGeneratedRow" },
  {
    table: "profile_assistant_work_routes",
    interfaceName: "ProfileAssistantWorkRouteGeneratedRow",
  },
  { table: "artifacts", interfaceName: "ArtifactGeneratedRow" },
  { table: "agent_runs", interfaceName: "AgentRunGeneratedRow" },
  { table: "agent_events", interfaceName: "AgentEventGeneratedRow" },
  { table: "assistants", interfaceName: "AssistantGeneratedRow" },
  { table: "backend_jobs", interfaceName: "BackendJobGeneratedRow" },
  {
    table: "profile_learning_review_runs",
    interfaceName: "ProfileLearningReviewRunGeneratedRow",
  },
  {
    table: "profile_learning_review_cursors",
    interfaceName: "ProfileLearningReviewCursorGeneratedRow",
  },
  {
    table: "profile_learning_review_observations",
    interfaceName: "ProfileLearningReviewObservationGeneratedRow",
  },
  {
    table: "profile_learning_review_candidates",
    interfaceName: "ProfileLearningReviewCandidateGeneratedRow",
  },
  { table: "profile_guidance", interfaceName: "ProfileGuidanceGeneratedRow" },
  { table: "assistant_scheduled_tasks", interfaceName: "AssistantScheduledTaskGeneratedRow" },
  { table: "assistant_work_items", interfaceName: "AssistantWorkItemGeneratedRow" },
  {
    table: "provider_webhook_subscriptions",
    interfaceName: "ProviderWebhookSubscriptionGeneratedRow",
  },
  {
    table: "provider_file_states",
    interfaceName: "ProviderFileStateGeneratedRow",
  },
  {
    table: "provider_sandbox_resources",
    interfaceName: "ProviderSandboxResourceGeneratedRow",
  },
  {
    table: "provider_sandbox_requests",
    interfaceName: "ProviderSandboxRequestGeneratedRow",
  },
  {
    table: "provider_webhook_deliveries",
    interfaceName: "ProviderWebhookDeliveryGeneratedRow",
  },
  {
    table: "profile_portal_launch_intents",
    interfaceName: "ProfilePortalLaunchIntentGeneratedRow",
  },
  { table: "provider_write_receipts", interfaceName: "ProviderWriteReceiptGeneratedRow" },
  { table: "boldsign_documents", interfaceName: "BoldSignDocumentGeneratedRow" },
  {
    table: "connected_provider_accounts",
    interfaceName: "ConnectedProviderAccountGeneratedRow",
  },
  {
    table: "phone_call_attempts",
    interfaceName: "PhoneCallAttemptGeneratedRow",
  },
  {
    table: "phone_call_events",
    interfaceName: "PhoneCallEventGeneratedRow",
  },
  {
    table: "phone_call_transcript_entries",
    interfaceName: "PhoneCallTranscriptEntryGeneratedRow",
  },
  {
    table: "phone_sms_attempts",
    interfaceName: "PhoneSmsAttemptGeneratedRow",
  },
  {
    table: "phone_sms_events",
    interfaceName: "PhoneSmsEventGeneratedRow",
  },
  {
    table: "phone_inbound_sms_messages",
    interfaceName: "PhoneInboundSmsMessageGeneratedRow",
  },
  {
    table: "capability_account_links",
    interfaceName: "CapabilityAccountLinkGeneratedRow",
  },
  {
    table: "provider_connect_intents",
    interfaceName: "ProviderConnectIntentGeneratedRow",
  },
  { table: "profile_capabilities", interfaceName: "ProfileCapabilityGeneratedRow" },
  { table: "profile_channels", interfaceName: "ProfileChannelGeneratedRow" },
  { table: "profiles", interfaceName: "ProfileGeneratedRow" },
] as const satisfies readonly RowContract[];

const generatedHeader = [
  "// GENERATED: run npm run db -- types. Do not edit by hand.",
  "// Source: packages/control-plane-contracts/src/database.types.ts",
  "// Purpose: intermediate row interfaces for ts-to-zod schema generation.",
  "// App code should use database.types.ts, TableRow<...>, or curated schemas.ts exports instead.",
  "",
].join("\n");

function usage(): string {
  return [
    "Usage: npm run db -- types [--mode=local|linked] [--skip-db-types]",
    "",
    "Regenerates Supabase database.types.ts and generated DB row Zod schemas.",
    "Use --mode=linked with SUPABASE_PROJECT_REF for linked project type generation.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): {
  mode: GenerationMode;
  skipDatabaseTypes: boolean;
  help: boolean;
} {
  return parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      mode: { type: "string" },
      "skip-db-types": { type: "boolean" },
    },
    schema: z
      .object({
        help: z.boolean().optional(),
        mode: z.enum(["local", "linked"]).default("local"),
        "skip-db-types": z.boolean().optional(),
      })
      .transform((value) => ({
        mode: value.mode,
        skipDatabaseTypes: value["skip-db-types"] === true,
        help: value.help ?? false,
      })),
  });
}

async function writeFormatted(filePath: string, text: string): Promise<void> {
  const prettierConfig = (await resolvePrettierConfig(filePath)) ?? {};
  const formatted = await formatWithPrettier(text, {
    ...prettierConfig,
    filepath: filePath,
    parser: "typescript",
  });
  writeFileSync(filePath, formatted, "utf8");
}

function generateDatabaseTypes(input: {
  root: string;
  workdir: string;
  mode: GenerationMode;
}): string {
  const args =
    input.mode === "local"
      ? [
          ...SUPABASE_CLI,
          "gen",
          "types",
          "typescript",
          "--db-url",
          readSupabaseLocalDatabaseUrl(input.workdir),
          "--schema",
          "public",
        ]
      : [
          ...SUPABASE_CLI,
          "gen",
          "types",
          "typescript",
          "--project-id",
          requiredEnv("SUPABASE_PROJECT_REF"),
          "--schema",
          "public",
        ];
  return runRequiredBoundedCommand("npx", args, {
    cwd: input.root,
    maxBuffer: 50_000_000,
    timeoutMs: SUPABASE_TYPEGEN_TIMEOUT_MS,
  }).stdout;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function findDatabaseMembers(sourceFile: ts.SourceFile): ts.NodeArray<ts.TypeElement> {
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === "Database")
      return statement.members;
    if (
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === "Database" &&
      ts.isTypeLiteralNode(statement.type)
    ) {
      return statement.type.members;
    }
  }
  throw new Error("Could not find Database object type in database.types.ts.");
}

function propertyTypeLiteral(
  sourceFile: ts.SourceFile,
  members: ts.NodeArray<ts.TypeElement>,
  name: string,
): ts.TypeLiteralNode {
  const property = members.find(
    (member): member is ts.PropertySignature =>
      ts.isPropertySignature(member) && ts.isIdentifier(member.name) && member.name.text === name,
  );
  if (!property?.type || !ts.isTypeLiteralNode(property.type)) {
    throw new Error(`Could not find object property ${name} in ${sourceFile.fileName}.`);
  }
  return property.type;
}

function rowTypeLiteral(sourceFile: ts.SourceFile, table: string): ts.TypeLiteralNode {
  const databaseMembers = findDatabaseMembers(sourceFile);
  const publicType = propertyTypeLiteral(sourceFile, databaseMembers, "public");
  const tablesType = propertyTypeLiteral(sourceFile, publicType.members, "Tables");
  const tableType = propertyTypeLiteral(sourceFile, tablesType.members, table);
  return propertyTypeLiteral(sourceFile, tableType.members, "Row");
}

function rowInterfaceText(sourceFile: ts.SourceFile, contract: RowContract): string {
  const row = rowTypeLiteral(sourceFile, contract.table);
  const members = row.members.map((member) =>
    member
      .getText(sourceFile)
      .replace(/\bJson\b/g, "DatabaseGeneratedJson")
      .replace(/Database\["public"\]\["Enums"\]\["[^"]+"\]/g, "string"),
  );
  return [
    `export interface ${contract.interfaceName} {`,
    ...members.map((m) => `  ${m}`),
    "}",
  ].join("\n");
}

async function generateRowTypes(input: { databaseTypesPath: string; rowTypesPath: string }) {
  const sourceText = readFileSync(input.databaseTypesPath, "utf8");
  const sourceFile = ts.createSourceFile(
    input.databaseTypesPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const rowInterfaces = rowContracts.map((contract) => rowInterfaceText(sourceFile, contract));
  const text = [
    generatedHeader,
    "export type DatabaseGeneratedJson =",
    "  | string",
    "  | number",
    "  | boolean",
    "  | null",
    "  | { [key: string]: DatabaseGeneratedJson }",
    "  | DatabaseGeneratedJson[];",
    "",
    ...rowInterfaces,
    "",
  ].join("\n");
  await writeFormatted(input.rowTypesPath, text);
}

async function generateRowSchemas(input: {
  root: string;
  rowTypesPath: string;
  rowSchemasPath: string;
}) {
  const binary = path.join(
    input.root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "ts-to-zod.cmd" : "ts-to-zod",
  );
  if (!existsSync(binary)) {
    throw new Error(`Missing ${binary}. Run npm install.`);
  }
  execFileSync(
    binary,
    [
      path.relative(input.root, input.rowTypesPath),
      path.relative(input.root, input.rowSchemasPath),
      "--skipValidation",
    ],
    {
      cwd: input.root,
      stdio: "inherit",
    },
  );
  const generated = readFileSync(input.rowSchemasPath, "utf8")
    .replace("// Generated by ts-to-zod\n", generatedHeader)
    .replace(
      'import { type DatabaseGeneratedJson } from "./database-row-types.generated";',
      'import { type DatabaseGeneratedJson } from "./database-row-types.generated";',
    );
  await writeFormatted(input.rowSchemasPath, generated);
}

export async function generateControlDbContracts(input?: {
  root?: string;
  workdir?: string;
  mode?: GenerationMode;
  skipDatabaseTypes?: boolean;
}): Promise<void> {
  const root = input?.root ?? repoRoot(import.meta.url);
  const workdir = input?.workdir ?? root;
  const mode = input?.mode ?? "local";
  const contractsSrc = path.join(root, "packages", "control-plane-contracts", "src");
  const databaseTypesPath = path.join(contractsSrc, "database.types.ts");
  const rowTypesPath = path.join(contractsSrc, "database-row-types.generated.ts");
  const rowSchemasPath = path.join(contractsSrc, "database-row-schemas.generated.ts");

  if (!input?.skipDatabaseTypes) {
    await writeFormatted(databaseTypesPath, generateDatabaseTypes({ root, workdir, mode }));
  }
  await generateRowTypes({ databaseTypesPath, rowTypesPath });
  await generateRowSchemas({ root, rowTypesPath, rowSchemasPath });
}

export async function runControlDbContractsCodegenCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  await generateControlDbContracts({
    mode: args.mode,
    skipDatabaseTypes: args.skipDatabaseTypes,
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runControlDbContractsCodegenCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
