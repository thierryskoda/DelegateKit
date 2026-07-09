#!/usr/bin/env tsx
import { pathToFileURL } from "node:url";
import {
  createSupabaseServiceClient,
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { requiresProdConfirmation, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli, runCliMain, timedFetch } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  normalizeBoldSignDocumentSummary,
  requireBackendSecretProviderCapabilityAccount,
  upsertBoldSignDocumentOwnership,
} from "../../apps/backend/src/ops-support/boldsign-document-ownership";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";
import { envForProfile } from "../profiles/profile";
import {
  installBackendRuntimeEnvForProfile,
  mergeResolvedProfileEnvIntoProcess,
} from "./bind-profile-nango";

const commands = ["audit", "assign"] as const;
const BOLDSIGN_API_BASE_URL_CA = "https://api-ca.boldsign.com/v1" as const;
const BOLDSIGN_AUDIT_TIMEOUT_MS = 45_000;

const boldSignListResponseSchema = z
  .object({
    result: z.array(z.record(z.string(), z.unknown())).optional(),
    documents: z.array(z.record(z.string(), z.unknown())).optional(),
    documentRecords: z.array(z.record(z.string(), z.unknown())).optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

const argsSchema = z
  .object({
    command: z.enum(commands),
    profile: z.enum(["dev", "e2e", "prod"]),
    "profile-id": z.string().trim().min(1).optional(),
    "connected-account-id": z.string().trim().uuid().optional(),
    "document-id": z.string().trim().min(1).optional(),
    query: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    "confirm-assign": z.boolean().optional(),
    "confirm-prod": z.boolean().optional(),
  })
  .superRefine((args, ctx) => {
    if (args.command === "assign") {
      if (!args["profile-id"]) {
        ctx.addIssue({
          code: "custom",
          path: ["profile-id"],
          message: "assign requires --profile-id.",
        });
      }
      if (!args["document-id"]) {
        ctx.addIssue({
          code: "custom",
          path: ["document-id"],
          message: "assign requires --document-id.",
        });
      }
    }
  });

type Args = z.infer<typeof argsSchema>;

type ProviderDocumentSummary = {
  documentId: string;
  providerStatus: string | null;
  title: string | null;
  signerEmail: string | null;
  sentAt: string | null;
  completedAt: string | null;
};

type OwnershipRow = TableRow<"boldsign_documents">;

function usage(): string {
  return [
    "Usage:",
    "  npm run integrations -- boldsign-documents audit --profile=dev [--profile-id=testing] [--query=text] [--limit=25]",
    "  npm run integrations -- boldsign-documents assign --profile=dev --profile-id=testing --document-id=<boldsign-id> --confirm-assign",
    "  npm run integrations -- boldsign-documents assign --profile=prod --profile-id=<profile-id> --document-id=<boldsign-id> --confirm-assign --confirm-prod",
    "",
    "audit lists BoldSign provider documents and current assistant ownership assignment state.",
    "assign creates or updates one maintainer_import ownership row for a specific profile.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): Args {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(usage());
    process.exit(0);
  }
  return parseCli(argv, {
    options: {
      profile: { type: "string" },
      "profile-id": { type: "string" },
      "connected-account-id": { type: "string" },
      "document-id": { type: "string" },
      query: { type: "string" },
      limit: { type: "string" },
      "confirm-assign": { type: "boolean" },
      "confirm-prod": { type: "boolean" },
    },
    allowPositionals: true,
    transform: ({ values, positionals }) => {
      if (positionals.length !== 1 || !commands.includes(positionals[0] as Args["command"])) {
        throw new Error(`Expected subcommand audit or assign.\n\n${usage()}`);
      }
      return { ...values, command: positionals[0] };
    },
    schema: argsSchema,
  });
}

function installProfileRuntime(profile: RuntimeProfile): void {
  mergeResolvedProfileEnvIntoProcess(envForProfile(profile));
  installBackendRuntimeEnvForProfile(profile);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for BoldSign document ownership CLI.`);
  return value;
}

function boldSignApiBaseUrl(): string {
  const explicit = process.env.BOLDSIGN_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!explicit) return BOLDSIGN_API_BASE_URL_CA;
  if (explicit !== BOLDSIGN_API_BASE_URL_CA) {
    throw new Error(
      `BOLDSIGN_API_BASE_URL must be ${BOLDSIGN_API_BASE_URL_CA}; got ${JSON.stringify(explicit)}.`,
    );
  }
  return explicit;
}

function boldSignUrl(pathname: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${boldSignApiBaseUrl()}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : {};
}

function pickDocuments(body: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ["result", "documents", "documentRecords", "data"]) {
    const value = body[key];
    if (Array.isArray(value)) return value.map(asRecord);
  }
  return [];
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstStringOrInteger(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isInteger(value)) return String(value);
  }
  return null;
}

function normalizeProviderTimestamp(...values: unknown[]): string | null {
  const value = firstStringOrInteger(...values);
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && Number.isFinite(numeric)) {
    const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1_000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function providerDocumentSummary(document: Record<string, unknown>): ProviderDocumentSummary | null {
  const documentId = firstString(document.documentId, document.id);
  if (!documentId) return null;
  const signerDetails = Array.isArray(document.signerDetails)
    ? document.signerDetails.map(asRecord)
    : [];
  const firstSigner = signerDetails[0] ?? {};
  return {
    documentId,
    providerStatus: firstString(document.status, document.documentStatus),
    title: firstString(document.title, document.documentTitle, document.name),
    signerEmail: firstString(
      document.signerEmail,
      document.recipientEmail,
      firstSigner.signerEmail,
      firstSigner.emailAddress,
    ),
    sentAt: normalizeProviderTimestamp(document.sentDate, document.createdDate, document.createdAt),
    completedAt: normalizeProviderTimestamp(
      document.completedDate,
      document.completedAt,
      document.modifiedDate,
    ),
  };
}

async function listProviderDocumentSummaries(args: Args): Promise<ProviderDocumentSummary[]> {
  const response = await timedFetch.fetch(
    boldSignUrl("/document/list", {
      page: 1,
      pageSize: args.limit,
      searchKey: args.query,
    }),
    {
      timeoutMs: BOLDSIGN_AUDIT_TIMEOUT_MS,
      method: "GET",
      headers: {
        accept: "application/json",
        "X-API-KEY": requiredEnv("BOLDSIGN_API_KEY"),
      },
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `BoldSign document audit failed: HTTP ${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
    );
  }
  const parsed = boldSignListResponseSchema.parse(await response.json());
  return pickDocuments(parsed)
    .map(providerDocumentSummary)
    .filter((document): document is ProviderDocumentSummary => document !== null);
}

async function loadExistingOwnership(
  db: SupabaseServiceClient,
  input: {
    documentIds: readonly string[];
    profileId?: string;
  },
): Promise<Map<string, OwnershipRow[]>> {
  if (input.documentIds.length === 0) return new Map();
  let query = db
    .from("boldsign_documents")
    .select()
    .in("document_id", [...input.documentIds])
    .order("profile_id")
    .order("updated_at", { ascending: false });
  if (input.profileId) query = query.eq("profile_id", input.profileId);
  const result = await query;
  const rows = requireSupabaseRows(
    "Load BoldSign document ownership rows",
    result.data,
    result.error,
  ) as OwnershipRow[];
  const byDocumentId = new Map<string, OwnershipRow[]>();
  for (const row of rows) {
    const existing = byDocumentId.get(row.document_id) ?? [];
    existing.push(row);
    byDocumentId.set(row.document_id, existing);
  }
  return byDocumentId;
}

function auditSummary(
  document: ProviderDocumentSummary,
  ownershipRows: readonly OwnershipRow[],
): Record<string, unknown> {
  return {
    documentId: document.documentId,
    title: document.title,
    providerStatus: document.providerStatus,
    signerEmail: document.signerEmail,
    sentAt: document.sentAt,
    completedAt: document.completedAt,
    assignmentStatus:
      ownershipRows.length === 0
        ? "unassigned"
        : ownershipRows.length === 1
          ? "assigned"
          : "ambiguous",
    assignedProfiles: ownershipRows.map((row) => ({
      profileId: row.profile_id,
      ownershipStatus: row.ownership_status,
      source: row.source,
      connectedProviderAccountId: row.connected_provider_account_id,
      updatedAt: row.updated_at,
    })),
  };
}

async function runAudit(db: SupabaseServiceClient, args: Args): Promise<void> {
  const documents = await listProviderDocumentSummaries(args);
  if (args["profile-id"]) await loadProfile(db, args["profile-id"]);
  const ownershipByDocumentId = await loadExistingOwnership(db, {
    documentIds: documents.map((document) => document.documentId),
    ...(args["profile-id"] ? { profileId: args["profile-id"] } : {}),
  });
  const documentsWithAssignment = documents.map((document) =>
    auditSummary(document, ownershipByDocumentId.get(document.documentId) ?? []),
  );
  const unassignedCount = documentsWithAssignment.filter(
    (document) => document.assignmentStatus === "unassigned",
  ).length;
  console.log(
    JSON.stringify(
      {
        ok: true,
        profile: args.profile,
        profileId: args["profile-id"] ?? null,
        query: args.query ?? null,
        limit: args.limit,
        count: documentsWithAssignment.length,
        unassignedCount,
        documents: documentsWithAssignment,
      },
      null,
      2,
    ),
  );
}

async function loadProfile(db: SupabaseServiceClient, profileId: string): Promise<TableRow<"profiles">> {
  const result = await db.from("profiles").select().eq("id", profileId).maybeSingle();
  return requireSupabaseData(`Load profile ${profileId}`, result.data, result.error);
}

async function runAssign(db: SupabaseServiceClient, args: Args): Promise<void> {
  const runtimeProfile = args.profile as RuntimeProfile;
  if (!args["confirm-assign"]) {
    throw new Error(`Refusing BoldSign ownership assignment without --confirm-assign.\n\n${usage()}`);
  }
  if (requiresProdConfirmation(runtimeProfile) && !args["confirm-prod"]) {
    throw new Error(`Refusing prod BoldSign ownership assignment without --confirm-prod.\n\n${usage()}`);
  }
  const profileId = args["profile-id"];
  const documentId = args["document-id"];
  if (!profileId || !documentId) throw new Error(`assign requires --profile-id and --document-id.`);
  await loadProfile(db, profileId);
  const binding = await requireBackendSecretProviderCapabilityAccount(db, {
    profileId,
    providers: ["boldsign"],
    capabilitySlugs: ["boldsign"],
    connectedAccountId: args["connected-account-id"] ?? null,
  });

  const documents = await listProviderDocumentSummaries({ ...args, query: documentId, limit: 100 });
  const providerDocument = documents.find((document) => document.documentId === documentId);
  if (!providerDocument) {
    throw new Error(
      `BoldSign document ${JSON.stringify(documentId)} was not found in provider audit results. Run audit first and verify the id.`,
    );
  }

  const ownership = await upsertBoldSignDocumentOwnership(db, {
    profileId,
    binding,
    document: normalizeBoldSignDocumentSummary(providerDocument),
    source: "maintainer_import",
    ownershipStatus: "assigned",
    providerMetadata: {
      assignedBy: "boldsign-documents-cli",
      assignedAt: new Date().toISOString(),
      runtimeProfile,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        profile: runtimeProfile,
        assigned: {
          ownershipId: ownership.id,
          profileId: ownership.profile_id,
          connectedProviderAccountId: ownership.connected_provider_account_id,
          documentId: ownership.document_id,
          title: ownership.title,
          providerStatus: ownership.provider_status,
          ownershipStatus: ownership.ownership_status,
          source: ownership.source,
        },
      },
      null,
      2,
    ),
  );
}

export async function runBoldSignDocumentOwnershipCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  installProfileRuntime(args.profile);
  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));
  if (args.command === "audit") {
    await runAudit(db, args);
    return;
  }
  await runAssign(db, args);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runBoldSignDocumentOwnershipCli());
}
