import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  referencesForSkill,
  renderSkill,
  type AuthoredGuidanceSpec,
  type GuidanceReference,
} from "@ai-assistants/guidance-authoring";
import type { AssistantCapabilitySpec } from "@ai-assistants/assistant-capability-surface";
import { format as formatWithPrettier } from "prettier";

type GuidanceSourceKind = "capability" | "client" | "maintainer" | "generic";

export type GuidanceSpec = {
  name: string;
  description: string;
  sourceDir: string;
  sourcePath: string;
  skillMdPath: string;
  sourceKind: GuidanceSourceKind;
  sourceId: string;
  authored: AuthoredGuidanceSpec;
  renderedContent: string;
  references: readonly GuidanceReference[];
};

const RUNTIME_GUIDANCE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAINTAINER_SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateGuidanceName(name: string, sourceKind: GuidanceSourceKind, source: string): void {
  const pattern =
    sourceKind === "maintainer" ? MAINTAINER_SKILL_NAME_PATTERN : RUNTIME_GUIDANCE_NAME_PATTERN;
  const label =
    sourceKind === "maintainer"
      ? "lowercase letters, numbers, and hyphens"
      : "snake_case letters, numbers, and underscores";
  const noun = sourceKind === "maintainer" ? "skill" : "guidance";
  if (!pattern.test(name)) {
    throw new Error(`${source} ${noun} name ${JSON.stringify(name)} must use ${label}.`);
  }
}

function assertNoStaleSpecialistLanguage(text: string, source: string): void {
  if (/\b(sessions_send|specialists?)\b/i.test(text)) {
    throw new Error(`${source} must not contain stale specialist/session routing instructions.`);
  }
}

function assertAuthoredGuidanceSpec(
  value: unknown,
  source: string,
): asserts value is AuthoredGuidanceSpec {
  if (!isRecord(value)) throw new Error(`${source} must default-export a guidance spec object.`);
  if (
    value.sourceKind !== "capability" &&
    value.sourceKind !== "client" &&
    value.sourceKind !== "maintainer" &&
    value.sourceKind !== "generic"
  ) {
    throw new Error(
      `${source} default export must come from definePluginGuidance, defineGenericGuidance, or defineMaintainerSkill.`,
    );
  }
  if (typeof value.name !== "string" || !value.name.trim())
    throw new Error(`${source} guidance spec must include name.`);
  if (typeof value.description !== "string" || !value.description.trim())
    throw new Error(`${source} guidance spec must include description.`);
  if (!isRecord(value.body) || typeof value.body.markdown !== "string")
    throw new Error(`${source} guidance spec must include md body.`);
}

async function importGuidanceSource(
  guidanceSourcePath: string,
  source: string,
): Promise<AuthoredGuidanceSpec> {
  const module = await import(pathToFileURL(guidanceSourcePath).href);
  assertAuthoredGuidanceSpec(module.default, source);
  return module.default;
}

async function readGuidanceSpec(
  sourcePath: string,
  sourceKind: GuidanceSourceKind,
  sourceId: string,
  repoRootPath: string,
): Promise<GuidanceSpec> {
  const sourceDir = path.dirname(sourcePath);
  const skillMdPath =
    sourceKind === "maintainer"
      ? path.join(sourceDir, "SKILL.md")
      : path.join(sourceDir, `${path.basename(sourcePath, ".ts")}.md`);
  const source = path.relative(repoRootPath, sourcePath);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `${path.relative(repoRootPath, sourcePath)} must exist as the editable source.`,
    );
  }

  const authored = await importGuidanceSource(sourcePath, source);
  if (authored.sourceKind !== sourceKind) {
    throw new Error(
      `${source} declares sourceKind ${authored.sourceKind}, but it is loaded as ${sourceKind}.`,
    );
  }
  if (sourceKind === "capability") {
    if (authored.sourceKind !== "capability" || authored.plugin.name !== sourceId) {
      throw new Error(
        `${source} must declare plugin(${JSON.stringify(sourceId)}) to match its owning capability.`,
      );
    }
  } else if (
    sourceKind === "client" &&
    (authored.sourceKind !== "client" || authored.profileId !== sourceId)
  ) {
    throw new Error(
      `${source} must declare profileId ${JSON.stringify(sourceId)} to match its owning client.`,
    );
  } else if (sourceKind === "maintainer" && authored.sourceKind !== "maintainer") {
    throw new Error(`${source} must declare a maintainer skill source.`);
  } else if (sourceKind === "generic" && authored.sourceKind !== "generic") {
    throw new Error(`${source} must declare a generic runtime guidance source.`);
  }

  validateGuidanceName(authored.name, sourceKind, source);
  const expectedSourceName =
    sourceKind === "client" ? path.basename(sourcePath, ".ts") : path.basename(sourceDir);
  if (expectedSourceName !== authored.name) {
    const noun = sourceKind === "maintainer" ? "skill" : "guidance";
    if (sourceKind !== "capability") {
      throw new Error(
        `${source} ${noun} name must match its source name ${JSON.stringify(expectedSourceName)}; got ${JSON.stringify(authored.name)}.`,
      );
    }
  }
  if (authored.description.length < 40) {
    throw new Error(`${source} description is too short to route guidance usage clearly.`);
  }
  const renderedContent = await formatWithPrettier(renderSkill(authored), {
    parser: "markdown",
  });
  if (sourceKind !== "maintainer") {
    assertNoStaleSpecialistLanguage(renderedContent, source);
  }

  return {
    name: authored.name,
    description: authored.description,
    sourceDir,
    sourcePath,
    skillMdPath,
    sourceKind,
    sourceId,
    authored,
    renderedContent,
    references: referencesForSkill(authored),
  };
}

async function readDirectoryGuidanceRoot(
  guidanceRootDir: string,
  sourceKind: GuidanceSourceKind,
  sourceId: string,
  repoRootPath: string,
): Promise<GuidanceSpec[]> {
  let entries;
  try {
    entries = await readdir(guidanceRootDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const guidanceDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(guidanceRootDir, entry.name))
    .filter((guidanceDir) => {
      const sourceFileName = sourceKind === "maintainer" ? "SKILL.ts" : "GUIDANCE.ts";
      return sourceKind !== "maintainer" || existsSync(path.join(guidanceDir, sourceFileName));
    })
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  return Promise.all(
    guidanceDirs.map((guidanceDir) =>
      readGuidanceSpec(
        path.join(guidanceDir, sourceKind === "maintainer" ? "SKILL.ts" : "GUIDANCE.ts"),
        sourceKind,
        sourceId,
        repoRootPath,
      ),
    ),
  );
}

export async function loadCapabilityGuidanceSpecs(
  repoRootPath: string,
  specs: readonly AssistantCapabilitySpec[],
): Promise<GuidanceSpec[]> {
  const all: GuidanceSpec[] = [];
  for (const spec of specs) {
    all.push(
      await readGuidanceSpec(
        path.join(repoRootPath, spec.sourceDir, "GUIDANCE.ts"),
        "capability",
        spec.slug,
        repoRootPath,
      ),
    );
  }
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

function maintainerSkillsRoot(repoRootPath: string): string {
  return path.join(repoRootPath, ".agents", "skills");
}

function genericRuntimeGuidanceRoot(repoRootPath: string): string {
  return path.join(repoRootPath, "runtime-guidance");
}

export async function loadGenericRuntimeGuidanceSpecs(
  repoRootPath: string,
): Promise<GuidanceSpec[]> {
  return readDirectoryGuidanceRoot(
    genericRuntimeGuidanceRoot(repoRootPath),
    "generic",
    "generic",
    repoRootPath,
  );
}

export async function loadMaintainerSkillSpecs(repoRootPath: string): Promise<GuidanceSpec[]> {
  return readDirectoryGuidanceRoot(
    maintainerSkillsRoot(repoRootPath),
    "maintainer",
    "maintainer",
    repoRootPath,
  );
}

export function assertUniqueGuidanceNames(guidance: readonly GuidanceSpec[]): void {
  const byName = new Map<string, GuidanceSpec>();
  for (const entry of guidance) {
    const existing = byName.get(entry.name);
    if (!existing) {
      byName.set(entry.name, entry);
      continue;
    }
    throw new Error(
      `Duplicate guidance name ${JSON.stringify(entry.name)} loaded from ${existing.sourceKind}:${existing.sourceId} (${existing.sourcePath}) and ${entry.sourceKind}:${entry.sourceId} (${entry.sourcePath}). Runtime guidance names must be unique per profile.`,
    );
  }
}
