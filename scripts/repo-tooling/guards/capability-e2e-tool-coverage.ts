import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { capabilityE2eSpecs } from "../../../tests/e2e/helpers/capability/capability-e2e-specs";

const DEFAULT_WAIVED_TOOLS_EXPORT = "CAPABILITY_E2E_WAIVED_TOOLS";
const ASSERT_COMPLETE_RE = /\.assertComplete\(/;

function parseWaivedToolNames(source: string, exportName: string): Set<string> {
  const escapedExportName = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `export const ${escapedExportName} = (\\[[\\s\\S]*?\\]) as const satisfies readonly \\w+\\[\\];`,
      "m",
    ),
  );
  if (!match?.[1]) return new Set();
  const names = [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
  return new Set(names);
}

function toolNameConstAliases(source: string): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const match of source.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*"([^"]+)";/g)) {
    const constName = match[1];
    const value = match[2];
    if (!constName || !value) continue;
    aliases.set(constName, value);
  }
  return aliases;
}

function sourceInvokesTool(source: string, toolName: string): boolean {
  const cleanSource = source.replace(/\s+/g, "");
  const patterns = [
    `toolName:"${toolName}"`,
    `toolName:'${toolName}'`,
    `.exercise("${toolName}")`,
    `.exercise('${toolName}')`,
    `executeArtifactTool(harness,"${toolName}"`,
    `executeArtifactTool(harness,'${toolName}'`,
    `runMondayTool(db,"${toolName}"`,
    `runMondayTool(db,'${toolName}'`,
    `typedMondayTool(db,"${toolName}"`,
    `typedMondayTool(db,'${toolName}'`,
    `typedGoogleDriveTool(db,"${toolName}"`,
    `typedGoogleDriveTool(db,'${toolName}'`,
    `typedDocumentTool(db,"${toolName}"`,
    `typedDocumentTool(db,'${toolName}'`,
    `typedBoldSignTool(db,"${toolName}"`,
    `typedBoldSignTool(db,'${toolName}'`,
    `typedEmailTool(db,"${toolName}"`,
    `typedEmailTool(db,'${toolName}'`,
  ];
  if (patterns.some((pattern) => cleanSource.includes(pattern))) return true;

  const typedToolPattern = new RegExp(
    `typed[A-Za-z0-9]*Tool\\([^,]+,["']${toolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
  );
  if (typedToolPattern.test(cleanSource)) return true;
  const rawToolPattern = new RegExp(
    `raw[A-Za-z0-9]*Tool\\([^,]+,["']${toolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
  );
  if (rawToolPattern.test(cleanSource)) return true;

  for (const [constName, value] of toolNameConstAliases(source)) {
    if (value !== toolName) continue;
    if (
      cleanSource.includes(`toolName:${constName}`) ||
      cleanSource.includes(`executeArtifactTool(harness,${constName}`) ||
      new RegExp(`typed[A-Za-z0-9]*Tool\\([^,]+,${constName}[,)]`).test(cleanSource) ||
      new RegExp(`raw[A-Za-z0-9]*Tool\\([^,]+,${constName}[,)]`).test(cleanSource)
    ) {
      return true;
    }
  }
  return false;
}

export function assertCapabilityE2eToolCoverage(root: string): void {
  const problems: string[] = [];

  for (const spec of capabilityE2eSpecs) {
    const absolutePath = path.join(root, spec.e2eFile);
    const source = readFileSync(absolutePath, "utf8");
    if (!ASSERT_COMPLETE_RE.test(source)) {
      problems.push(`${spec.e2eFile}: expected coverage.assertComplete(...) before test end`);
    }

    const waived = parseWaivedToolNames(
      source,
      "waivedToolsExport" in spec
        ? spec.waivedToolsExport
        : DEFAULT_WAIVED_TOOLS_EXPORT,
    );
    const contractNames: string[] = spec.contracts.map((contract) => String(contract.name));
    for (const toolName of contractNames) {
      if (waived.has(toolName)) continue;
      if (!sourceInvokesTool(source, toolName)) {
        problems.push(
          `${spec.e2eFile}: missing invocation for contract tool ${toolName} (exercise it or add to CAPABILITY_E2E_WAIVED_TOOLS)`,
        );
      }
    }

    for (const waivedName of waived) {
      if (!contractNames.includes(waivedName)) {
        problems.push(`${spec.e2eFile}: waived unknown tool ${waivedName}`);
      }
    }
  }

  assert.deepEqual(
    problems,
    [],
    `Capability E2E contract tool coverage problems:\n${problems.join("\n")}`,
  );
}
