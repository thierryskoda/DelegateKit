#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "@ai-assistants/repo-layout";
import {
  allAssistantCapabilityContracts,
  builtinToolContractsForInventory,
} from "@ai-assistants/assistant-capability-surface";
import type { ToolContract } from "@ai-assistants/tool-contracts";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";

const cliSchema = z
  .object({
    check: z.boolean().optional(),
    help: z.boolean().optional(),
  })
  .transform((value) => ({ ...value, check: value.check ?? false, help: value.help ?? false }));

function usage(): string {
  return [
    "Usage: npm run tools:inventory -- [--check]",
    "",
    "Generates tool-inventory.generated.md from all canonical agent tool contracts.",
  ].join("\n");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function schemaType(schema: unknown): string {
  const record = asRecord(schema);
  if (!record) return "unknown";
  if ("const" in record) return JSON.stringify(record.const);
  if (Array.isArray(record.enum))
    return record.enum.map((entry) => JSON.stringify(entry)).join(" | ");
  if (typeof record.type === "string") return record.type;
  if (Array.isArray(record.type)) return record.type.map(String).join(" | ");
  if (Array.isArray(record.anyOf)) return "union";
  if (Array.isArray(record.oneOf)) return "union";
  return "object";
}

function schemaDescription(schema: unknown): string {
  const record = asRecord(schema);
  return typeof record?.description === "string" && record.description.trim()
    ? record.description.trim()
    : "";
}

function schemaExamples(schema: unknown): unknown[] {
  const record = asRecord(schema);
  if (!record) return [];
  if (Array.isArray(record.examples) && record.examples.length > 0) return [record.examples[0]];
  if ("example" in record) return [record.example];
  return [];
}

function schemaExample(schema: unknown): unknown | undefined {
  const examples = schemaExamples(schema);
  return examples.length > 0 ? examples[0] : undefined;
}

type SchemaPropertyRow = {
  path: string;
  requirement?: "required" | "optional";
  type: string;
  description: string;
  examples: unknown[];
};

function withoutNullableUnion(schema: unknown): unknown {
  const record = asRecord(schema);
  const anyOf = Array.isArray(record?.anyOf) ? record.anyOf : null;
  if (!anyOf || anyOf.length !== 2) return schema;
  const nonNullEntries = anyOf.filter((entry) => asRecord(entry)?.type !== "null");
  return nonNullEntries.length === 1 ? nonNullEntries[0] : schema;
}

function schemaForObjectTraversal(schema: unknown): unknown {
  const unwrapped = withoutNullableUnion(schema);
  const record = asRecord(unwrapped);
  if (!record) return null;
  if (record.type === "array") return asRecord(record.items) ?? null;
  return record;
}

function nestedTraversal(schema: unknown): { schema: unknown; pathSuffix: string } | null {
  const unwrapped = withoutNullableUnion(schema);
  const record = asRecord(unwrapped);
  if (!record) return null;
  if (record.type === "array") {
    const items = asRecord(record.items);
    return items ? { schema: items, pathSuffix: "[]" } : null;
  }
  return { schema: record, pathSuffix: "" };
}

function collectObjectPropertyRows(input: {
  schema: unknown;
  includeRequirement: boolean;
  prefix?: string;
}): SchemaPropertyRow[] {
  const current = schemaForObjectTraversal(input.schema);
  const properties = asRecord(asRecord(current)?.properties);
  if (!properties) return [];

  const required = new Set(
    Array.isArray(asRecord(current)?.required) ? (asRecord(current)?.required as string[]) : [],
  );
  const rows: SchemaPropertyRow[] = [];
  for (const [name, schema] of Object.entries(properties).sort(([a], [b]) => a.localeCompare(b))) {
    const path = input.prefix ? `${input.prefix}.${name}` : name;
    rows.push({
      path,
      requirement: input.includeRequirement
        ? required.has(name)
          ? "required"
          : "optional"
        : undefined,
      type: schemaType(schema),
      description: schemaDescription(schema),
      examples: schemaExamples(schema),
    });

    const traversable = nestedTraversal(schema);
    if (!traversable) continue;
    const childPrefix = `${path}${traversable.pathSuffix}`;
    rows.push(
      ...collectObjectPropertyRows({
        schema: traversable.schema,
        includeRequirement: input.includeRequirement,
        prefix: childPrefix,
      }),
    );
  }
  return rows;
}

function humanizeSchemaPath(pathValue: string): string {
  return pathValue
    .replaceAll("[]", " item")
    .replaceAll(".", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fallbackDescription(row: SchemaPropertyRow, kind: "input" | "output"): string {
  const label = humanizeSchemaPath(row.path);
  return kind === "input" ? `Input value for ${label}.` : `Returned ${label} value.`;
}

function markdownCode(value: string): string {
  return value.replaceAll("`", "\\`");
}

function renderExample(value: unknown): string {
  return markdownCode(JSON.stringify(value));
}

function schemaTypeValues(schema: Record<string, unknown>): string[] {
  if (typeof schema.type === "string") return [schema.type];
  if (Array.isArray(schema.type)) return schema.type.map(String);
  return [];
}

function sampleStringForSchema(schema: Record<string, unknown>, pathValue: string): string {
  if (schema.format === "date-time") return "2026-05-21T14:30:00.000Z";
  if (schema.format === "date") return "2026-05-21";
  if (schema.format === "gmail") return "client@example.com";
  if (schema.format === "uri" || schema.format === "url") return "https://example.com/item";
  if (schema.format === "uuid") return "550e8400-e29b-41d4-a716-446655440000";
  const label = pathValue.split(".").at(-1)?.replace("[]", "") || "value";
  return `${label}_example`;
}

function firstUnionSchema(schema: Record<string, unknown>): unknown | null {
  const variants = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : null;
  if (!variants) return null;
  return variants.find((variant) => asRecord(variant)?.type !== "null") ?? variants[0] ?? null;
}

function sampleValueForSchema(schema: unknown, pathValue = "value"): unknown {
  const explicitExample = schemaExample(schema);
  if (explicitExample !== undefined) return explicitExample;

  const unwrapped = withoutNullableUnion(schema);
  const record = asRecord(unwrapped);
  if (!record) return null;

  if ("const" in record) return record.const;
  if (Array.isArray(record.enum) && record.enum.length > 0) return record.enum[0];
  if ("default" in record) return record.default;

  const unionSchema = firstUnionSchema(record);
  if (unionSchema) return sampleValueForSchema(unionSchema, pathValue);

  const properties = asRecord(record.properties);
  const types = schemaTypeValues(record);
  if (properties || types.includes("object")) {
    const sample: Record<string, unknown> = {};
    for (const [name, propertySchema] of Object.entries(properties ?? {}).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      sample[name] = sampleValueForSchema(
        propertySchema,
        pathValue ? `${pathValue}.${name}` : name,
      );
    }
    return sample;
  }

  if (types.includes("array")) {
    const itemSchema = "items" in record ? record.items : null;
    return itemSchema ? [sampleValueForSchema(itemSchema, `${pathValue}[]`)] : [];
  }

  if (types.includes("string")) return sampleStringForSchema(record, pathValue);
  if (types.includes("integer")) return 1;
  if (types.includes("number")) return 1;
  if (types.includes("boolean")) return true;
  if (types.includes("null")) return null;

  return null;
}

function renderJsonCodeBlock(value: unknown): string[] {
  return ["```json", JSON.stringify(value, null, 2) ?? "null", "```"];
}

function renderSchemaExample(schema: unknown): string[] {
  return renderJsonCodeBlock(sampleValueForSchema(schema));
}

function renderPropertyRows(
  rows: readonly SchemaPropertyRow[],
  kind: "input" | "output",
): string[] {
  if (rows.length === 0) return ["  - None"];
  return rows.map((row) => {
    const requirement = row.requirement ? `${row.requirement}, ` : "";
    const description = row.description || fallbackDescription(row, kind);
    return `  - \`${row.path}\` (${requirement}${row.type}): ${description}${
      row.examples.length > 0 ? ` Example: \`${renderExample(row.examples[0])}\`.` : ""
    }`;
  });
}

type ToolInventoryDescriptionGap = {
  toolName: string;
  kind: "input" | "output";
  path: string;
};

export function findToolInventoryDescriptionGaps(
  contracts: readonly ToolContract[],
): ToolInventoryDescriptionGap[] {
  return [...contracts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((contract) => [
      ...collectObjectPropertyRows({ schema: contract.parameters, includeRequirement: true })
        .filter((row) => !row.description)
        .map((row) => ({ toolName: contract.name, kind: "input" as const, path: row.path })),
      ...collectObjectPropertyRows({
        schema: contract.outputParameters,
        includeRequirement: false,
      })
        .filter((row) => !row.description)
        .map((row) => ({ toolName: contract.name, kind: "output" as const, path: row.path })),
    ]);
}

function renderInputArgs(contract: ToolContract): string[] {
  return renderPropertyRows(
    collectObjectPropertyRows({ schema: contract.parameters, includeRequirement: true }),
    "input",
  );
}

function renderOutputProperties(contract: ToolContract): string[] {
  return renderPropertyRows(
    collectObjectPropertyRows({ schema: contract.outputParameters, includeRequirement: false }),
    "output",
  );
}

function renderReturns(contract: ToolContract): string {
  const output = asRecord(contract.outputParameters);
  const properties = asRecord(output?.properties);
  if (!properties || Object.keys(properties).length === 0) {
    return schemaType(contract.outputParameters);
  }
  return Object.entries(properties)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, schema]) => `\`${name}\` (${schemaType(schema)})`)
    .join(", ");
}

type ToolInventoryExposure = "builtin" | "local_plugin";
const DISABLED_PROFILE_ASSISTANT_BUILTIN_TOOLS = new Map<string, string>([
  ["web_search", "disabled for profile assistants; use public_web_search"],
]);

type ToolAuditRow = {
  name: string;
  pluginId: string;
  exposure: ToolInventoryExposure;
  effect: ToolContract["effect"];
  executionKind: ToolContract["executionKind"];
  descriptionWords: number;
  inputCount: number;
  requiredInputCount: number;
  outputCount: number;
  flags: string[];
  runtimeNote: string | null;
};

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function inputRows(contract: ToolContract): SchemaPropertyRow[] {
  return collectObjectPropertyRows({ schema: contract.parameters, includeRequirement: true });
}

function topLevelPropertyCount(schema: unknown): number {
  const properties = asRecord(asRecord(schema)?.properties);
  return properties ? Object.keys(properties).length : 0;
}

function topLevelPropertyNames(schema: unknown): string[] {
  const properties = asRecord(asRecord(schema)?.properties);
  return properties ? Object.keys(properties).sort((a, b) => a.localeCompare(b)) : [];
}

function toolAuditFlags(input: {
  contract: ToolContract;
  descriptionWords: number;
  inputCount: number;
  requiredInputCount: number;
  outputTopLevelNames: readonly string[];
}): string[] {
  const flags: string[] = [];
  if (input.contract.effect === "write" && input.descriptionWords < 18) {
    flags.push("short write description");
  }
  if (input.inputCount >= 8) {
    flags.push("many inputs");
  }
  if (input.inputCount >= 6 && input.descriptionWords < 30) {
    flags.push("many inputs with short description");
  }
  if (input.requiredInputCount >= 6) {
    flags.push("many required inputs");
  }
  const returnsList =
    input.outputTopLevelNames.some((name) => /s$/.test(name) || name === "items") &&
    !input.outputTopLevelNames.some((name) => /cursor|truncated|hasMore/i.test(name));
  if (returnsList) {
    flags.push("list output without top-level cursor/truncation");
  }
  return flags;
}

function buildToolAuditRows(input: {
  coreContracts: readonly ToolContract[];
  toolSearchContracts: readonly ToolContract[];
}): ToolAuditRow[] {
  const rows: ToolAuditRow[] = [];
  for (const [exposure, contracts] of [
    ["builtin", input.coreContracts],
    ["local_plugin", input.toolSearchContracts],
  ] as const) {
    for (const contract of contracts) {
      const inputs = inputRows(contract);
      const outputTopLevelNames = topLevelPropertyNames(contract.outputParameters);
      const requiredInputCount = inputs.filter((row) => row.requirement === "required").length;
      const descriptionWords = wordCount(contract.description);
      rows.push({
        name: contract.name,
        pluginId: contract.pluginId,
        exposure,
        effect: contract.effect,
        executionKind: contract.executionKind,
        descriptionWords,
        inputCount: inputs.length,
        requiredInputCount,
        outputCount: topLevelPropertyCount(contract.outputParameters),
        runtimeNote:
          exposure === "builtin"
            ? (DISABLED_PROFILE_ASSISTANT_BUILTIN_TOOLS.get(contract.name) ?? null)
            : null,
        flags: toolAuditFlags({
          contract,
          descriptionWords,
          inputCount: inputs.length,
          requiredInputCount,
          outputTopLevelNames,
        }),
      });
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function incrementCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  if (rows.length === 0) return ["None."];
  const escapeCell = (value: string) => value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ];
}

function renderCountTable(title: string, counts: Map<string, number>): string[] {
  const rows = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => [`\`${key}\``, String(count)]);
  return [`### ${title}`, "", ...markdownTable(["Value", "Count"], rows), ""];
}

function renderAuditReport(input: {
  coreContracts: readonly ToolContract[];
  toolSearchContracts: readonly ToolContract[];
}): string[] {
  const rows = buildToolAuditRows(input);
  const pluginCounts = new Map<string, number>();
  const exposureCounts = new Map<string, number>();
  const effectCounts = new Map<string, number>();
  const executionCounts = new Map<string, number>();
  for (const row of rows) {
    incrementCount(pluginCounts, row.pluginId);
    incrementCount(exposureCounts, row.exposure);
    incrementCount(effectCounts, row.effect);
    incrementCount(executionCounts, row.executionKind);
  }

  const flaggedRows = rows
    .filter((row) => row.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length || a.name.localeCompare(b.name));
  const shortestDescriptions = [...rows]
    .sort((a, b) => a.descriptionWords - b.descriptionWords || a.name.localeCompare(b.name))
    .slice(0, 10);
  const mostInputs = [...rows]
    .sort((a, b) => b.inputCount - a.inputCount || a.name.localeCompare(b.name))
    .slice(0, 10);

  return [
    "## Audit Report",
    "",
    "Generated maintainer review surface for tool selection, input ergonomics, output usability, and prompt-footprint risk. Flags are heuristics for review; they are not correctness failures.",
    "",
    `- Total tools audited: ${rows.length}`,
    `- Tools with review flags: ${flaggedRows.length}`,
    `- Write tools: ${effectCounts.get("write") ?? 0}`,
    `- Read tools: ${effectCounts.get("read") ?? 0}`,
    "",
    ...renderCountTable("Exposure", exposureCounts),
    ...renderCountTable("Plugins", pluginCounts),
    ...renderCountTable("Effects", effectCounts),
    ...renderCountTable("Execution", executionCounts),
    "### Review Flags",
    "",
    ...markdownTable(
      ["Tool", "Plugin", "Exposure", "Effect", "Inputs", "Required", "Outputs", "Words", "Flags"],
      flaggedRows.map((row) => [
        `\`${row.name}\``,
        `\`${row.pluginId}\``,
        `\`${row.exposure}\``,
        `\`${row.effect}\``,
        String(row.inputCount),
        String(row.requiredInputCount),
        String(row.outputCount),
        String(row.descriptionWords),
        [...row.flags, ...(row.runtimeNote ? [row.runtimeNote] : [])].join(", "),
      ]),
    ),
    "",
    "### Shortest Descriptions",
    "",
    ...markdownTable(
      ["Tool", "Plugin", "Effect", "Inputs", "Words"],
      shortestDescriptions.map((row) => [
        `\`${row.name}\``,
        `\`${row.pluginId}\``,
        `\`${row.effect}\``,
        String(row.inputCount),
        String(row.descriptionWords),
      ]),
    ),
    "",
    "### Most Inputs",
    "",
    ...markdownTable(
      ["Tool", "Plugin", "Effect", "Inputs", "Required", "Words"],
      mostInputs.map((row) => [
        `\`${row.name}\``,
        `\`${row.pluginId}\``,
        `\`${row.effect}\``,
        String(row.inputCount),
        String(row.requiredInputCount),
        String(row.descriptionWords),
      ]),
    ),
    "",
  ];
}

function assertUniqueContracts(contracts: readonly ToolContract[]): void {
  const seen = new Set<string>();
  for (const contract of contracts) {
    if (seen.has(contract.name)) throw new Error(`Duplicate tool contract ${contract.name}.`);
    seen.add(contract.name);
  }
}

function renderToolSection(
  lines: string[],
  heading: string,
  contracts: readonly ToolContract[],
): void {
  lines.push(heading);
  lines.push("");
  if (contracts.length === 0) {
    lines.push("None.");
    lines.push("");
    return;
  }
  for (const contract of [...contracts].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`### \`${contract.name}\``);
    lines.push("");
    lines.push(contract.description);
    lines.push("");
    lines.push(`- Execution: \`${contract.executionKind}\``);
    lines.push(`- Effect: \`${contract.effect}\``);
    const disabledBuiltinNote = DISABLED_PROFILE_ASSISTANT_BUILTIN_TOOLS.get(contract.name);
    if (disabledBuiltinNote) lines.push(`- Runtime profile note: ${disabledBuiltinNote}.`);
    lines.push(`- Returns: ${renderReturns(contract)}`);
    lines.push("- Inputs:");
    lines.push(...renderInputArgs(contract));
    lines.push("- Outputs:");
    lines.push(...renderOutputProperties(contract));
    lines.push("");
    lines.push("Example input:");
    lines.push(...renderSchemaExample(contract.parameters));
    lines.push("");
    lines.push("Example output:");
    lines.push(...renderSchemaExample(contract.outputParameters));
    lines.push("");
  }
}

export function renderAggregateToolInventory(input: {
  builtinContracts: readonly ToolContract[];
  assistantCapabilityContracts: readonly ToolContract[];
}): string {
  assertUniqueContracts([...input.builtinContracts, ...input.assistantCapabilityContracts]);
  const lines: string[] = [
    "# Tool Inventory",
    "",
    "Generated from all canonical agent tool contracts.",
    "This inventory is a maintainer debugging aid for inspecting every canonical tool contract in one place; it is not runtime assistant guidance, client-facing documentation, or a source of truth for enabled runtime tool policy.",
    "Some canonical builtin contracts may be disabled for profile assistants by generated runtime config; runtime profile notes call those out.",
    "",
    `- Built-in tool count: ${input.builtinContracts.length}`,
    `- Assistant capability tool count: ${input.assistantCapabilityContracts.length}`,
    `- Total tool count: ${input.builtinContracts.length + input.assistantCapabilityContracts.length}`,
    "",
  ];
  lines.push(
    ...renderAuditReport({
      coreContracts: input.builtinContracts,
      toolSearchContracts: input.assistantCapabilityContracts,
    }),
  );
  renderToolSection(lines, "## Built-in Tools", input.builtinContracts);
  renderToolSection(lines, "## Assistant Capability Tools", input.assistantCapabilityContracts);
  return `${lines.join("\n").trimEnd()}\n`;
}

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2), {
    options: {
      check: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    schema: cliSchema,
  });
  if (args.help) {
    console.log(usage());
    return;
  }
  const root = repoRoot(import.meta.url);
  const markdown = renderAggregateToolInventory({
    builtinContracts: builtinToolContractsForInventory(),
    assistantCapabilityContracts: allAssistantCapabilityContracts(),
  });
  const outputPath = path.join(root, "tool-inventory.generated.md");
  if (args.check) {
    const current = await readFile(outputPath, "utf8").catch(() => null);
    if (current !== markdown) {
      throw new Error(`${path.relative(root, outputPath)} is stale. Run npm run tools:inventory.`);
    }
    console.log(JSON.stringify({ ok: true, checked: path.relative(root, outputPath) }));
    return;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  console.log(JSON.stringify({ ok: true, wrote: path.relative(root, outputPath) }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
