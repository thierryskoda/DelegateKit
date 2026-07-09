import { backendToolDiagnosticsSince } from "../channel/diagnostics";

export function diagnosticAttrs(record: { attrs?: unknown }): Record<string, unknown> {
  return typeof record.attrs === "object" && record.attrs !== null && !Array.isArray(record.attrs)
    ? (record.attrs as Record<string, unknown>)
    : {};
}

export function diagnosticResult(record: { attrs?: unknown }): Record<string, unknown> {
  const attrs = diagnosticAttrs(record);
  return typeof attrs.result === "object" && attrs.result !== null && !Array.isArray(attrs.result)
    ? (attrs.result as Record<string, unknown>)
    : {};
}

export function diagnosticMatchesWorkItem(record: { attrs?: unknown }, workItemId: string): boolean {
  const attrs = diagnosticAttrs(record);
  if (attrs.work_item_id === workItemId) return true;
  return JSON.stringify(diagnosticResult(record)).includes(workItemId);
}

export function backendToolDiagnosticsForWorkItemSince(
  runtimeRoot: string,
  sinceMs: number,
  toolName: string,
  workItemId: string,
) {
  return backendToolDiagnosticsSince(runtimeRoot, sinceMs, toolName).filter((record) =>
    diagnosticMatchesWorkItem(record, workItemId),
  );
}
