import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type SweepManifest = {
  executionId: string;
  reportDir: string;
  passCount: number;
  failCount: number;
  blockedCount: number;
  notRunCount: number;
  total: number;
  resultsTsv: string;
};

export function resolvePassthroughArgs(metaUrl: string, scriptName: string): string[] {
  const argv = process.argv;
  const scriptPath = fileURLToPath(metaUrl);
  let scriptIndex = argv.findIndex((arg) => arg.replace(/\\/g, "/").endsWith(scriptName));
  if (scriptIndex < 0) {
    scriptIndex = argv.findIndex((arg) => arg === scriptPath);
  }
  if (scriptIndex < 0) {
    return argv.slice(2);
  }
  return argv.slice(scriptIndex + 1);
}

export function exitIfHelp(args: readonly string[], usage: string): void {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }
}

export function writeSweepManifest(
  reportDir: string,
  root: string,
  manifest: Omit<SweepManifest, "reportDir" | "resultsTsv">,
): void {
  const payload: SweepManifest = {
    ...manifest,
    reportDir: path.relative(root, reportDir),
    resultsTsv: path.relative(root, path.join(reportDir, "results.tsv")),
  };
  fs.writeFileSync(path.join(reportDir, "manifest.json"), `${JSON.stringify(payload, null, 2)}\n`);
}
