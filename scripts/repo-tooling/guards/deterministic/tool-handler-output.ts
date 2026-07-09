import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const BACKEND_HANDLER_ROOTS = [
  "apps/backend/src/capabilities",
  "apps/backend/src/runtime/agent-tools/executor/handlers",
] as const;

const ALLOWED_TOOL_DATA_PATTERNS = [
  /\btoolDataForContract\s*\(/,
  /\bprofileToolData\s*\(/,
  /\bprofileActionLifecycleToolData\s*\(/,
  /\btoolData\s*\(\s*[\w.]+\.parse\s*\(/,
  /\btoolData\s*\(\s*(?:filesResult|onedriveItemsResult|sharePointItemsResult)\s*\(/,
  /\btoolData\s*\(\s*\{\s*accounts\s*\}\s*\)/,
  /\bOutputSchema\.parse\s*\(/,
  /\boutputSchema\.parse\s*\(/,
  /\bexternalWriteResult\s*\(/,
  /\bnotFound\s*\(/,
  /\btoolError\s*\(/,
];

function collectTsFilesRecursive(root: string, relativeDir: string): string[] {
  const absoluteDir = path.join(root, relativeDir);
  if (!existsSync(absoluteDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absoluteDir)) {
    const relative = path.join(relativeDir, entry);
    const absolute = path.join(root, relative);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      out.push(...collectTsFilesRecursive(root, relative));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(relative);
    }
  }
  return out;
}

function lineAllowsRawToolData(line: string, following: string): boolean {
  const window = `${line}\n${following}`;
  if (ALLOWED_TOOL_DATA_PATTERNS.some((pattern) => pattern.test(window))) return true;
  if (/return\s+toolData\s*\(\s*$/.test(line.trimEnd()) && /\w+OutputSchema\.parse\s*\(/.test(following)) {
    return true;
  }
  return false;
}

function assertAgentVisibleHandlersAvoidRawToolData(root: string): void {
  const failures: string[] = [];
  const scanRoots = [...BACKEND_HANDLER_ROOTS];
  for (const relativeRoot of scanRoots) {
    for (const file of collectTsFilesRecursive(root, relativeRoot)) {
      if (file.includes("/external-write-contracts/")) continue;
      if (file.endsWith("backend-module.ts")) continue;
      if (file.includes("api/routes/internal-artifacts.ts")) continue;
      if (file.includes("action-prepare.ts")) continue;
      const text = readFileSync(path.join(root, file), "utf8");
      const lines = text.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (!/\btoolData\s*\(/.test(line)) continue;
        const following = lines.slice(index, index + 12).join("\n");
        if (lineAllowsRawToolData(line, following)) continue;
        failures.push(
          `${file}:${index + 1} uses raw toolData(); prefer toolDataForContract or *OutputSchema.parse`,
        );
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Agent-visible tool handlers must not return raw toolData payloads:\n${failures.join("\n")}`,
    );
  }
}

export function assertToolHandlerOutputGuards(root: string): void {
  assertAgentVisibleHandlersAvoidRawToolData(root);
}
