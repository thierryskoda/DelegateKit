import * as z from "zod";

const DEFAULT_MAX_LEN = 8_000;

export type FormatUnknownErrorOptions = {
  /**
   * `log` — one line (metrics, log files, HTTP summaries).
   * `block` — multiline Zod output for CLI / terminal (uses `z.prettifyError`).
   */
  mode?: "log" | "block";
  maxLength?: number;
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Stable string for any thrown or API-style value. Avoids `[object Object]`.
 * `ZodError` uses [Zod's `prettifyError`](https://zod.dev/error-formatting).
 */
export function formatUnknownError(error: unknown, options?: FormatUnknownErrorOptions): string {
  const max = options?.maxLength ?? DEFAULT_MAX_LEN;
  const mode = options?.mode ?? "log";

  if (error instanceof z.ZodError) {
    const pretty = z.prettifyError(error);
    if (mode === "block") {
      return truncate(pretty.replace(/\n{3,}/g, "\n\n"), max);
    }
    return truncate(pretty.replace(/\s+/g, " ").trim(), max);
  }

  if (error instanceof Error) {
    return truncate(error.message, max);
  }

  if (typeof error === "string") return truncate(error, max);
  if (typeof error === "number" || typeof error === "boolean") return truncate(String(error), max);
  if (typeof error === "bigint") return truncate(String(error), max);
  if (error == null) return truncate(String(error), max);
  if (error instanceof Date) return truncate(error.toISOString(), max);
  if (error instanceof RegExp) return truncate(String(error), max);

  try {
    const json = JSON.stringify(error);
    if (json !== "{}") return truncate(json, max);
  } catch {
    /* circular / BigInt in object / non-JSON */
  }

  // Browser-safe (no `util.inspect`); last resort for exotic objects.
  return truncate(Object.prototype.toString.call(error), max);
}
