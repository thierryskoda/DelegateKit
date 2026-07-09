import { readDiagnosticRecords, type DiagnosticRecord } from "@ai-assistants/runtime-diagnostics";
import { repoRoot } from "@ai-assistants/repo-layout";
import { parseDiagnosticQueryArgv, type DiagnosticQueryCli } from "./lib/diagnostics-cli";
import { resolveDiagnosticRuntimeContext } from "./lib/runtime-context";
import { kindCountsRecord } from "./lib/diagnostics-report-core";
import { pathToFileURL } from "node:url";

function matches(
  event: DiagnosticRecord,
  args: DiagnosticQueryCli,
  cutoff: number | null,
): boolean {
  if (cutoff != null && Date.parse(event.ts) < cutoff) return false;
  if (args.service && event.service !== args.service) return false;
  if (args.kind && event.kind !== args.kind) return false;
  if (args.agentId && event.agent_id !== args.agentId) return false;
  if (args.sessionId && event.session_id !== args.sessionId) return false;
  if (args.runId && event.run_id !== args.runId) return false;
  if (args.requestId && event.request_id !== args.requestId) return false;
  if (args.jobId && event.job_id !== args.jobId) return false;
  if (args.toolCallId && event.tool_call_id !== args.toolCallId) return false;
  return true;
}

function printMarkdown(events: DiagnosticRecord[]): void {
  console.log("| ts | service | kind | level | ok | id | message |");
  console.log("|----|---------|------|-------|----|----|---------|");
  for (const event of events) {
    const id = event.job_id ?? event.request_id ?? event.tool_call_id ?? event.session_id ?? "";
    const message = event.message ?? event.err?.message ?? "";
    console.log(
      `| ${event.ts} | ${event.service} | ${event.kind} | ${event.level} | ${String(event.ok ?? "")} | ${id} | ${message.replace(/\|/g, "\\|").slice(0, 240)} |`,
    );
  }
}

export async function runDiagnosticsQuery(argv = process.argv.slice(2)): Promise<void> {
  const root = repoRoot(import.meta.url);
  const args = parseDiagnosticQueryArgv(argv);
  const runtime = resolveDiagnosticRuntimeContext(root, {
    profile: args.profile,
    runtimeRoot: args.runtimeRoot,
  });
  const cutoff = args.sinceMs == null ? null : Date.now() - args.sinceMs;
  const events = readDiagnosticRecords(runtime.runtimeRoot, { days: args.days })
    .filter((event) => matches(event, args, cutoff))
    .slice(-args.limit);
  if (args.format === "json") {
    console.log(
      JSON.stringify(
        {
          schema_version: 1,
          runtime_root: runtime.runtimeRoot,
          count: events.length,
          kind_counts: kindCountsRecord(events),
          events,
        },
        null,
        2,
      ),
    );
    return;
  }
  printMarkdown(events);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runDiagnosticsQuery().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
