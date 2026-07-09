import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";

/** Minimatch-style glob if any of these appear (Knip uses similar globs). */
const GLOB_CHARS = /[*?[\{]/;

type KnipJsonResolvedPattern = {
  pattern: string;
  matchCount: number;
  samplePaths: string[];
};

export type KnipJsonDeterministicResult = {
  ok: boolean;
  knipJsonPath: string;
  errors: string[];
  warnings: string[];
  entry: KnipJsonResolvedPattern[];
  project: KnipJsonResolvedPattern[];
  ignore: KnipJsonResolvedPattern[];
};

function isGlobPattern(pattern: string): boolean {
  return GLOB_CHARS.test(pattern);
}

function countGlobMatches(root: string, pattern: string): { count: number; samplePaths: string[] } {
  const matches = globSync(pattern, {
    cwd: root,
  });
  const samplePaths = matches.slice(0, 5);
  return { count: matches.length, samplePaths };
}

function resolveLiteral(root: string, pattern: string): boolean {
  const target = path.join(root, pattern);
  return existsSync(target);
}

function readKnipJson(root: string): unknown {
  const knipJsonPath = path.join(root, "knip.json");
  if (!existsSync(knipJsonPath)) {
    throw new Error(`Missing ${path.relative(root, knipJsonPath) || "knip.json"} at repo root.`);
  }
  const raw = readFileSync(knipJsonPath, "utf8");
  return JSON.parse(raw) as unknown;
}

export function validateKnipJson(root: string): KnipJsonDeterministicResult {
  const knipJsonPath = path.join(root, "knip.json");
  const errors: string[] = [];
  const warnings: string[] = [];
  const entry: KnipJsonResolvedPattern[] = [];
  const project: KnipJsonResolvedPattern[] = [];
  const ignore: KnipJsonResolvedPattern[] = [];

  let parsed: unknown;
  try {
    parsed = readKnipJson(root);
  } catch (e) {
    return {
      ok: false,
      knipJsonPath,
      errors: [e instanceof Error ? e.message : String(e)],
      warnings: [],
      entry: [],
      project: [],
      ignore: [],
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push("knip.json must be a JSON object.");
    return { ok: false, knipJsonPath, errors, warnings, entry, project, ignore };
  }

  const doc = parsed as Record<string, unknown>;
  if (!Array.isArray(doc.entry) || doc.entry.length === 0) {
    errors.push('knip.json must include a non-empty "entry" array.');
  }
  if (!Array.isArray(doc.project) || doc.project.length === 0) {
    errors.push('knip.json must include a non-empty "project" array.');
  }

  const entryPatterns = Array.isArray(doc.entry)
    ? doc.entry.filter((x): x is string => typeof x === "string")
    : [];
  const projectPatterns = Array.isArray(doc.project)
    ? doc.project.filter((x): x is string => typeof x === "string")
    : [];
  const ignorePatterns = Array.isArray(doc.ignore)
    ? doc.ignore.filter((x): x is string => typeof x === "string")
    : [];

  for (const pattern of entryPatterns) {
    if (pattern === "package.json") {
      const okPkg = existsSync(path.join(root, "package.json"));
      entry.push({
        pattern,
        matchCount: okPkg ? 1 : 0,
        samplePaths: okPkg ? ["package.json"] : [],
      });
      if (!okPkg) errors.push(`entry: missing root package.json (listed as "${pattern}").`);
      continue;
    }

    if (isGlobPattern(pattern)) {
      const { count, samplePaths } = countGlobMatches(root, pattern);
      entry.push({ pattern, matchCount: count, samplePaths });
      if (count === 0) errors.push(`entry glob matched no files: ${JSON.stringify(pattern)}`);
      continue;
    }

    const ok = resolveLiteral(root, pattern);
    entry.push({
      pattern,
      matchCount: ok ? 1 : 0,
      samplePaths: ok ? [pattern] : [],
    });
    if (!ok) errors.push(`entry path does not exist: ${JSON.stringify(pattern)}`);
  }

  for (const pattern of projectPatterns) {
    if (!isGlobPattern(pattern)) {
      const ok = resolveLiteral(root, pattern);
      project.push({
        pattern,
        matchCount: ok ? 1 : 0,
        samplePaths: ok ? [pattern] : [],
      });
      if (!ok)
        errors.push(
          `project path does not exist (expected glob or file/dir): ${JSON.stringify(pattern)}`,
        );
      continue;
    }
    const { count, samplePaths } = countGlobMatches(root, pattern);
    project.push({ pattern, matchCount: count, samplePaths });
    if (count === 0) errors.push(`project glob matched no files: ${JSON.stringify(pattern)}`);
  }

  for (const pattern of ignorePatterns) {
    if (!isGlobPattern(pattern)) {
      const ok = resolveLiteral(root, pattern);
      ignore.push({
        pattern,
        matchCount: ok ? 1 : 0,
        samplePaths: ok ? [pattern] : [],
      });
      if (!ok)
        warnings.push(`ignore path matched nothing (stale ignore?): ${JSON.stringify(pattern)}`);
      continue;
    }
    const { count, samplePaths } = countGlobMatches(root, pattern);
    ignore.push({ pattern, matchCount: count, samplePaths });
    if (count === 0)
      warnings.push(`ignore glob matched no files (stale ignore?): ${JSON.stringify(pattern)}`);
  }

  const ok = errors.length === 0;
  return {
    ok,
    knipJsonPath,
    errors,
    warnings,
    entry,
    project,
    ignore,
  };
}
