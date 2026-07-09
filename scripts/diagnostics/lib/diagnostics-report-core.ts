import type { DiagnosticRecord } from "@ai-assistants/runtime-diagnostics";

export function kindCountsRecord(events: DiagnosticRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  return counts;
}
