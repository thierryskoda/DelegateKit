import { type RuntimeProfile } from "@ai-assistants/repo-layout";
import { z } from "zod";
import { parseCli, parseOutputFormat } from "@ai-assistants/workspace-shared";
import { optionalProfileFlag } from "@ai-assistants/workspace-shared";

const runtimeFlags = {
  profile: { type: "string" as const },
  "runtime-root": { type: "string" as const },
} as const;

export type DiagnosticRuntimeCli = {
  profile: RuntimeProfile | undefined;
  runtimeRoot: string | undefined;
};

function runtimeTransform(values: Record<string, unknown>): DiagnosticRuntimeCli {
  const runtimeRoot = values["runtime-root"];
  return {
    profile: optionalProfileFlag(values.profile),
    runtimeRoot:
      typeof runtimeRoot === "string" && runtimeRoot.trim() ? runtimeRoot.trim() : undefined,
  };
}

export function parseDiagnosticPruneArgv(
  argv: readonly string[],
): DiagnosticRuntimeCli & { days: number } {
  return parseCli(argv, {
    options: {
      ...runtimeFlags,
      days: { type: "string" },
    },
    schema: z
      .object({
        profile: z.unknown().optional(),
        "runtime-root": z.unknown().optional(),
        days: z.string().optional(),
      })
      .transform((v) => {
        const base = runtimeTransform(v);
        const raw = v.days?.trim();
        if (!raw) return { ...base, days: 30 };
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
          throw new Error(`--days must be a positive integer; got ${JSON.stringify(raw)}.`);
        }
        return { ...base, days: n };
      }),
  });
}

function durationMs(raw: string): number {
  const match = raw.trim().match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`--since must look like 15m, 1h, or 7d; got ${JSON.stringify(raw)}.`);
  const value = Number(match[1]);
  if (!Number.isInteger(value) || value < 1)
    throw new Error("--since duration must be a positive integer.");
  const unit = match[2];
  if (unit === "m") return value * 60_000;
  if (unit === "h") return value * 3_600_000;
  return value * 86_400_000;
}

export type DiagnosticQueryCli = DiagnosticRuntimeCli & {
  days: number;
  sinceMs: number | null;
  format: "json" | "markdown";
  service?: string;
  kind?: string;
  agentId?: string;
  sessionId?: string;
  runId?: string;
  requestId?: string;
  jobId?: string;
  toolCallId?: string;
  limit: number;
};

export function parseDiagnosticQueryArgv(argv: readonly string[]): DiagnosticQueryCli {
  return parseCli(argv, {
    options: {
      ...runtimeFlags,
      days: { type: "string" },
      since: { type: "string" },
      format: { type: "string" },
      service: { type: "string" },
      kind: { type: "string" },
      agent: { type: "string" },
      session: { type: "string" },
      run: { type: "string" },
      request: { type: "string" },
      job: { type: "string" },
      "tool-call": { type: "string" },
      limit: { type: "string" },
    },
    schema: z
      .object({
        profile: z.unknown().optional(),
        "runtime-root": z.unknown().optional(),
        days: z.string().optional(),
        since: z.string().optional(),
        format: z.string().optional(),
        service: z.string().optional(),
        kind: z.string().optional(),
        agent: z.string().optional(),
        session: z.string().optional(),
        run: z.string().optional(),
        request: z.string().optional(),
        job: z.string().optional(),
        "tool-call": z.string().optional(),
        limit: z.string().optional(),
      })
      .transform((v) => {
        const base = runtimeTransform(v);
        const daysRaw = v.days?.trim();
        const days = Math.max(1, Number(daysRaw ?? "7") || 7);
        const since = v.since?.trim();
        const format = parseOutputFormat(v.format, "json");
        const agentPick = v.agent?.trim();
        const sessionPick = v.session?.trim();
        const runPick = v.run?.trim();
        const requestPick = v.request?.trim();
        const jobPick = v.job?.trim();
        const toolPick = v["tool-call"]?.trim();
        const limitRaw = v.limit?.trim();
        const limit = Math.max(1, Math.min(1000, Number(limitRaw ?? "200") || 200));
        return {
          ...base,
          days,
          sinceMs: since ? durationMs(since) : null,
          format,
          service: v.service?.trim() || undefined,
          kind: v.kind?.trim() || undefined,
          agentId: agentPick || undefined,
          sessionId: sessionPick || undefined,
          runId: runPick || undefined,
          requestId: requestPick || undefined,
          jobId: jobPick || undefined,
          toolCallId: toolPick || undefined,
          limit,
        };
      }),
  });
}
