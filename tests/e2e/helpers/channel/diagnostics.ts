import { readDiagnosticRecords, type DiagnosticRecord } from "@ai-assistants/runtime-diagnostics";
import { asRecord } from "../utils/as-record";

export function backendToolDiagnosticsSince(
  runtimeRoot: string,
  sinceMs: number,
  toolName: string,
): DiagnosticRecord[] {
  return readDiagnosticRecords(runtimeRoot, { service: "backend-api", days: 1 }).filter((event) => {
    if (Date.parse(event.ts) < sinceMs) return false;
    if (event.kind !== "tool.result" || event.ok !== true) return false;
    return asRecord(event.attrs ?? {}, "backend diagnostics attrs").tool_name === toolName;
  });
}
