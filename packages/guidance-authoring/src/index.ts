import type { ToolContract, ToolNameFor } from "@ai-assistants/tool-contracts";

export const SKILL_REF_METADATA_COMMENT = "skill-refs";
export const SKILL_GENERATED_COMMENT = "GENERATED: edit the typed guidance source.";

// Guidance-only allowlist for rare assistant builtins that are not modeled by capability contracts.
export const REFERENCEABLE_BUILTIN_TOOL_NAMES = ["message"] as const;

export type ReferenceableBuiltinToolName = (typeof REFERENCEABLE_BUILTIN_TOOL_NAMES)[number];
export type SkillSourceKind = "capability" | "client" | "maintainer" | "generic";
export type SkillReferenceKind =
  | "tool"
  | "builtin_tool"
  | "guidance"
  | "plugin"
  | "npm_script"
  | "repo_path"
  | "focused_skill"
  | "judge";

export type SkillReference = {
  kind: SkillReferenceKind;
  name: string;
  pluginId?: string;
};
export type GuidanceReference = SkillReference;
export type SkillToolCoverage = {
  pluginId: string;
  toolNames: readonly string[];
};

export type SkillTemplateRef = SkillReference & {
  markdown: string;
};

export type SkillTemplate = {
  markdown: string;
  refs: readonly SkillReference[];
  toolCoverage?: readonly SkillToolCoverage[];
};

export type PluginRef<TName extends string = string> = SkillTemplateRef & {
  kind: "plugin";
  name: TName;
};

export type SkillSpecBase = {
  name: string;
  description: string;
  body: SkillTemplate;
};

export type PluginSkillSpec = SkillSpecBase & {
  sourceKind: "capability";
  plugin: PluginRef;
  allowedPlugins: readonly PluginRef[];
  references: readonly SkillTemplateRef[];
};

export type ClientSkillSpec = SkillSpecBase & {
  sourceKind: "client";
  profileId: string;
  references: readonly SkillTemplateRef[];
};

export type MaintainerSkillSpec = SkillSpecBase & {
  sourceKind: "maintainer";
  references: readonly SkillTemplateRef[];
};

export type GenericGuidanceSpec = SkillSpecBase & {
  sourceKind: "generic";
  references: readonly SkillTemplateRef[];
};

export type AuthoredSkillSpec =
  | PluginSkillSpec
  | ClientSkillSpec
  | MaintainerSkillSpec
  | GenericGuidanceSpec;
export type AuthoredGuidanceSpec = AuthoredSkillSpec;

type SkillRefMetadata = {
  schemaVersion: 1;
  sourceKind: SkillSourceKind;
  refs: {
    tools: string[];
    builtinTools: string[];
    guidance: string[];
    plugins: string[];
    npmScripts: string[];
    repoPaths: string[];
    focusedSkills: string[];
    judges: string[];
  };
  toolCoverage?: Array<{
    pluginId: string;
    toolNames: string[];
  }>;
};

function uniqSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function ref(
  kind: SkillReferenceKind,
  name: string,
  extra: Partial<Omit<SkillTemplateRef, "kind" | "name">> = {},
): SkillTemplateRef {
  return { kind, name, markdown: name, ...extra };
}

function isTemplateRef(value: unknown): value is SkillTemplateRef {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    "name" in value &&
    "markdown" in value &&
    typeof (value as SkillTemplateRef).kind === "string" &&
    typeof (value as SkillTemplateRef).name === "string" &&
    typeof (value as SkillTemplateRef).markdown === "string",
  );
}

function isSkillTemplate(value: unknown): value is SkillTemplate {
  return Boolean(
    value &&
    typeof value === "object" &&
    "markdown" in value &&
    "refs" in value &&
    typeof (value as SkillTemplate).markdown === "string" &&
    Array.isArray((value as SkillTemplate).refs),
  );
}

function collectReference(refs: SkillReference[], value: SkillTemplateRef): string {
  const { kind, name, pluginId } = value;
  refs.push(pluginId ? { kind, name, pluginId } : { kind, name });
  return value.markdown;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countIdentifierOccurrences(text: string, identifier: string): number {
  const pattern = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(identifier)}(?![A-Za-z0-9_-])`, "g");
  return [...text.matchAll(pattern)].length;
}

function stringifyInterpolation(value: unknown, refs: SkillReference[]): string {
  if (isTemplateRef(value)) return collectReference(refs, value);
  if (isSkillTemplate(value)) {
    refs.push(...value.refs);
    return value.markdown;
  }
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return String(value ?? "");
  }
  throw new Error(
    `Unsupported skill markdown interpolation: ${Object.prototype.toString.call(value)}.`,
  );
}

export function md(strings: TemplateStringsArray, ...values: unknown[]): SkillTemplate {
  const refs: SkillReference[] = [];
  const toolCoverage: SkillToolCoverage[] = [];
  let markdown = strings[0] ?? "";
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (isSkillTemplate(value)) toolCoverage.push(...(value.toolCoverage ?? []));
    markdown += stringifyInterpolation(value, refs);
    markdown += strings[index + 1] ?? "";
  }
  return {
    markdown: markdown.trim(),
    refs,
    ...(toolCoverage.length ? { toolCoverage } : {}),
  };
}

export function joinSkillTemplates(
  templates: readonly SkillTemplate[],
  separator: string,
): SkillTemplate {
  const toolCoverage = templates.flatMap((template) => template.toolCoverage ?? []);
  return {
    markdown: templates.map((template) => template.markdown).join(separator),
    refs: templates.flatMap((template) => template.refs),
    ...(toolCoverage.length ? { toolCoverage } : {}),
  };
}

export function plugin<const TName extends string>(name: TName): PluginRef<TName> {
  return ref("plugin", name) as PluginRef<TName>;
}

export function guidance<const TName extends string>(
  name: TName,
): SkillTemplateRef & { kind: "guidance"; name: TName } {
  return ref("guidance", name) as SkillTemplateRef & { kind: "guidance"; name: TName };
}

export function builtinTool<const TName extends ReferenceableBuiltinToolName>(
  name: TName,
): SkillTemplateRef & { kind: "builtin_tool"; name: TName } {
  return ref("builtin_tool", name) as SkillTemplateRef & { kind: "builtin_tool"; name: TName };
}

export function npmScript<const TName extends string>(
  name: TName,
): SkillTemplateRef & { kind: "npm_script"; name: TName } {
  return ref("npm_script", name, { markdown: `npm run ${name}` }) as SkillTemplateRef & {
    kind: "npm_script";
    name: TName;
  };
}

export function repoPath<const TName extends string>(
  name: TName,
): SkillTemplateRef & { kind: "repo_path"; name: TName } {
  return ref("repo_path", name) as SkillTemplateRef & { kind: "repo_path"; name: TName };
}

export function focusedSkill<const TName extends string>(
  name: TName,
): SkillTemplateRef & { kind: "focused_skill"; name: TName } {
  return ref("focused_skill", name) as SkillTemplateRef & { kind: "focused_skill"; name: TName };
}

export function judge<const TName extends string>(
  name: TName,
): SkillTemplateRef & { kind: "judge"; name: TName } {
  return ref("judge", name) as SkillTemplateRef & { kind: "judge"; name: TName };
}

export function tool<const TContracts extends readonly ToolContract[]>(
  contracts: TContracts,
  name: ToolNameFor<TContracts>,
): SkillTemplateRef & { kind: "tool"; name: ToolNameFor<TContracts> } {
  const contract = contracts.find((candidate) => candidate.name === name);
  if (!contract) throw new Error(`Tool ${name} is not present in the supplied contract list.`);
  return ref("tool", name, {
    markdown: `\`${name}\``,
    pluginId: contract.pluginId,
  }) as SkillTemplateRef & {
    kind: "tool";
    name: ToolNameFor<TContracts>;
  };
}

export function toolList<const TContracts extends readonly ToolContract[]>(
  contracts: TContracts,
): SkillTemplate {
  return joinSkillTemplates(
    contracts.map((contract) => {
      const template = md`- ${tool(contracts, contract.name)}: ${contract.description}`;
      const descriptionRefs: SkillReference[] = [];
      for (const candidate of contracts) {
        const mentions = countIdentifierOccurrences(contract.description, candidate.name);
        for (let index = 0; index < mentions; index += 1) {
          const { kind, name, pluginId } = tool(contracts, candidate.name);
          descriptionRefs.push(pluginId ? { kind, name, pluginId } : { kind, name });
        }
      }
      return { markdown: template.markdown, refs: [...template.refs, ...descriptionRefs] };
    }),
    "\n",
  );
}

export function toolNameList<const TContracts extends readonly ToolContract[]>(
  contracts: TContracts,
): SkillTemplate {
  return joinSkillTemplates(
    contracts.map((contract) => md`- ${tool(contracts, contract.name)}`),
    "\n",
  );
}

export type ToolGuidanceCoverage<TContracts extends readonly ToolContract[]> = {
  readonly [Name in ToolNameFor<TContracts>]: true;
};

export type ToolGuidanceSubset<TContracts extends readonly ToolContract[]> = {
  readonly include: Partial<ToolGuidanceCoverage<TContracts>>;
  readonly omit: Partial<Record<ToolNameFor<TContracts>, string>>;
};

type ToolGuidanceSubsetInput<
  TContracts extends readonly ToolContract[],
  TSubset extends ToolGuidanceSubset<TContracts>,
> = TSubset &
  (Exclude<ToolNameFor<TContracts>, keyof TSubset["include"] | keyof TSubset["omit"]> extends never
    ? unknown
    : {
        readonly __missingToolCoverage: Exclude<
          ToolNameFor<TContracts>,
          keyof TSubset["include"] | keyof TSubset["omit"]
        >;
      }) &
  Record<Exclude<keyof TSubset["include"], ToolNameFor<TContracts>>, never> &
  Record<Exclude<keyof TSubset["omit"], ToolNameFor<TContracts>>, never> &
  (Extract<keyof TSubset["include"], keyof TSubset["omit"]> extends never
    ? unknown
    : {
        readonly __duplicateToolCoverage: Extract<keyof TSubset["include"], keyof TSubset["omit"]>;
      });

function assertCoveredToolNames(
  contracts: readonly ToolContract[],
  coverage: Readonly<Record<string, true>>,
): void {
  const expected = uniqSorted(contracts.map((contract) => contract.name));
  const actual = uniqSorted(Object.keys(coverage));
  if (expected.length !== actual.length || expected.some((name, index) => actual[index] !== name)) {
    const missing = expected.filter((name) => !actual.includes(name));
    const extra = actual.filter((name) => !expected.includes(name));
    const details = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
      extra.length > 0 ? `extra: ${extra.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`Tool guidance coverage must exactly match supplied contracts (${details}).`);
  }
}

function assertCoveredToolSubset(
  contracts: readonly ToolContract[],
  subset: {
    include: Readonly<Record<string, true>>;
    omit: Readonly<Record<string, string>>;
  },
): void {
  const expected = uniqSorted(contracts.map((contract) => contract.name));
  const include = uniqSorted(Object.keys(subset.include));
  const omit = uniqSorted(Object.keys(subset.omit));
  const actual = uniqSorted([...include, ...omit]);
  const duplicate = include.filter((name) => omit.includes(name));
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  const emptyReasons = omit.filter((name) => !subset.omit[name]?.trim());
  if (missing.length > 0 || extra.length > 0 || duplicate.length > 0 || emptyReasons.length > 0) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
      extra.length > 0 ? `extra: ${extra.join(", ")}` : null,
      duplicate.length > 0 ? `duplicate: ${duplicate.join(", ")}` : null,
      emptyReasons.length > 0 ? `empty omit reason: ${emptyReasons.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `Tool guidance subset coverage must exactly include or omit supplied contracts (${details}).`,
    );
  }
}

export const TOOL_COVERAGE_MARKER = "<!-- generated-tool-coverage -->";

export function coveredToolCatalog<
  const TContracts extends readonly ToolContract[],
  const TCoverage extends ToolGuidanceCoverage<TContracts>,
>(
  contracts: TContracts,
  coverage: TCoverage & Record<Exclude<keyof TCoverage, ToolNameFor<TContracts>>, never>,
): SkillTemplate {
  assertCoveredToolNames(contracts, coverage);
  const pluginIds = uniqSorted(contracts.map((contract) => contract.pluginId));
  if (pluginIds.length !== 1) {
    throw new Error(
      `Tool coverage catalog must cover exactly one plugin; got ${pluginIds.join(", ")}.`,
    );
  }
  const refs = contracts.map(({ name, pluginId }) => ({ kind: "tool" as const, name, pluginId }));
  return {
    markdown: TOOL_COVERAGE_MARKER,
    refs,
    toolCoverage: [{ pluginId: pluginIds[0], toolNames: uniqSorted(contracts.map((c) => c.name)) }],
  };
}

export function coveredToolSubset<
  const TContracts extends readonly ToolContract[],
  const TSubset extends ToolGuidanceSubset<TContracts>,
>(
  contracts: TContracts,
  subset: ToolGuidanceSubsetInput<TContracts, TSubset>,
): Array<Extract<TContracts[number], { name: keyof TSubset["include"] }>> {
  assertCoveredToolSubset(
    contracts,
    subset as {
      include: Readonly<Record<string, true>>;
      omit: Readonly<Record<string, string>>;
    },
  );
  const includedNames = new Set<string>(Object.keys(subset.include));
  return contracts.filter(
    (contract): contract is Extract<TContracts[number], { name: keyof TSubset["include"] }> =>
      includedNames.has(contract.name),
  );
}

export function definePluginSkill(input: {
  name: string;
  description: string;
  plugin: PluginRef;
  body: SkillTemplate;
  allowedPlugins?: readonly PluginRef[];
  references?: readonly SkillTemplateRef[];
}): PluginSkillSpec {
  return {
    sourceKind: "capability",
    name: input.name,
    description: input.description,
    plugin: input.plugin,
    allowedPlugins: input.allowedPlugins ?? [],
    references: input.references ?? [],
    body: input.body,
  };
}

export const definePluginGuidance = definePluginSkill;

export function defineClientSkill(input: {
  name: string;
  description: string;
  profileId: string;
  body: SkillTemplate;
  references?: readonly SkillTemplateRef[];
}): ClientSkillSpec {
  return {
    sourceKind: "client",
    name: input.name,
    description: input.description,
    profileId: input.profileId,
    references: input.references ?? [],
    body: input.body,
  };
}

export const defineClientGuidance = defineClientSkill;

export function defineMaintainerSkill(input: {
  name: string;
  description: string;
  body: SkillTemplate;
  references?: readonly SkillTemplateRef[];
}): MaintainerSkillSpec {
  return {
    sourceKind: "maintainer",
    name: input.name,
    description: input.description,
    body: input.body,
    references: input.references ?? [],
  };
}

export function defineGenericGuidance(input: {
  name: string;
  description: string;
  body: SkillTemplate;
  references?: readonly SkillTemplateRef[];
}): GenericGuidanceSpec {
  return {
    sourceKind: "generic",
    name: input.name,
    description: input.description,
    body: input.body,
    references: input.references ?? [],
  };
}

export function referencesForSkill(spec: AuthoredSkillSpec): SkillReference[] {
  const refs = [...spec.body.refs];
  if (spec.sourceKind === "capability") {
    refs.push({ kind: "plugin", name: spec.plugin.name });
    refs.push(
      ...spec.allowedPlugins.map((entry) => ({ kind: "plugin" as const, name: entry.name })),
    );
    refs.push(
      ...spec.references.map(({ kind, name, pluginId }) =>
        pluginId ? { kind, name, pluginId } : { kind, name },
      ),
    );
  } else if (spec.sourceKind === "client") {
    refs.push(
      ...spec.references.map(({ kind, name, pluginId }) =>
        pluginId ? { kind, name, pluginId } : { kind, name },
      ),
    );
  } else if (spec.sourceKind === "maintainer") {
    refs.push(
      ...spec.references.map(({ kind, name, pluginId }) =>
        pluginId ? { kind, name, pluginId } : { kind, name },
      ),
    );
  } else if (spec.sourceKind === "generic") {
    refs.push(
      ...spec.references.map(({ kind, name, pluginId }) =>
        pluginId ? { kind, name, pluginId } : { kind, name },
      ),
    );
  }
  return refs;
}

export function toolCoverageForSkill(spec: AuthoredSkillSpec): SkillToolCoverage[] {
  return [...(spec.body.toolCoverage ?? [])];
}

export function skillReferenceMetadata(spec: AuthoredSkillSpec): SkillRefMetadata {
  const refs = referencesForSkill(spec);
  const toolCoverage = toolCoverageForSkill(spec);
  return {
    schemaVersion: 1,
    sourceKind: spec.sourceKind,
    refs: {
      tools: uniqSorted(refs.filter((entry) => entry.kind === "tool").map((entry) => entry.name)),
      builtinTools: uniqSorted(
        refs.filter((entry) => entry.kind === "builtin_tool").map((entry) => entry.name),
      ),
      guidance: uniqSorted(
        refs.filter((entry) => entry.kind === "guidance").map((entry) => entry.name),
      ),
      plugins: uniqSorted(
        refs.filter((entry) => entry.kind === "plugin").map((entry) => entry.name),
      ),
      npmScripts: uniqSorted(
        refs.filter((entry) => entry.kind === "npm_script").map((entry) => entry.name),
      ),
      repoPaths: uniqSorted(
        refs.filter((entry) => entry.kind === "repo_path").map((entry) => entry.name),
      ),
      focusedSkills: uniqSorted(
        refs.filter((entry) => entry.kind === "focused_skill").map((entry) => entry.name),
      ),
      judges: uniqSorted(refs.filter((entry) => entry.kind === "judge").map((entry) => entry.name)),
    },
    ...(toolCoverage.length
      ? {
          toolCoverage: toolCoverage.map((coverage) => ({
            pluginId: coverage.pluginId,
            toolNames: uniqSorted(coverage.toolNames),
          })),
        }
      : {}),
  };
}

export const guidanceReferenceMetadata = skillReferenceMetadata;

export function renderSkill(spec: AuthoredSkillSpec): string {
  const metadata = JSON.stringify(skillReferenceMetadata(spec));
  return [
    "---",
    `name: ${spec.name}`,
    `description: ${JSON.stringify(spec.description)}`,
    "---",
    `<!-- ${SKILL_GENERATED_COMMENT} -->`,
    `<!-- ${SKILL_REF_METADATA_COMMENT}: ${metadata} -->`,
    "",
    spec.body.markdown.trim(),
    "",
  ].join("\n");
}
