import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const disallowedTestFilePatterns = [
  /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mts|cts)$/,
  /\.type-test\.ts$/,
  /\.test-d\.ts$/,
  /(^|\/)(?:vitest|jest)\.config\.[^/]+$/,
] as const;

const disallowedTestDependencies = new Set([
  "@jest/globals",
  "@testing-library/jest-dom",
  "@testing-library/react",
  "@types/jest",
  "@vitest/coverage-v8",
  "jest",
  "ts-jest",
  "vitest",
]);

const allowedRootTestScripts = new Map([
  ["test", "npm run test:scripts"],
  ["test:scripts", "npm run guard -- e2e-harness"],
]);

const packageJsonSchema = z
  .object({
    scripts: z.record(z.string(), z.string()).optional(),
    dependencies: z.record(z.string(), z.unknown()).optional(),
    devDependencies: z.record(z.string(), z.unknown()).optional(),
    optionalDependencies: z.record(z.string(), z.unknown()).optional(),
    peerDependencies: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

function gitLines(root: string, args: readonly string[]): string[] {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function sourceAndUntrackedFiles(root: string): string[] {
  return [
    ...gitLines(root, ["ls-files"]),
    ...gitLines(root, ["ls-files", "--others", "--exclude-standard"]),
  ].sort((a, b) => a.localeCompare(b));
}

function packageJsonFiles(root: string): string[] {
  return sourceAndUntrackedFiles(root).filter(
    (file) => path.basename(file) === "package.json" && existsSync(path.join(root, file)),
  );
}

function isDisallowedTestFile(relativePath: string): boolean {
  return disallowedTestFilePatterns.some((pattern) => pattern.test(relativePath));
}

function isDisallowedTestDependency(name: string): boolean {
  return disallowedTestDependencies.has(name) || /\b(?:jest|vitest)\b/.test(name);
}

function assertNoDisallowedTestFiles(root: string): void {
  const bad = sourceAndUntrackedFiles(root).filter(isDisallowedTestFile);
  if (bad.length === 0) return;
  throw new Error(
    [
      "Only E2E tests are allowed. Do not add unit, schema, type, helper, guard, or package-local test files.",
      "Use tests/e2e/**/*-e2e.ts for real workflow coverage. Use TypeScript, Zod, guard scripts, build checks, or fail-fast runtime code for non-E2E invariants.",
      "",
      ...bad.map((file) => `- ${file}`),
    ].join("\n"),
  );
}

function assertNoDisallowedPackageTestScripts(root: string): void {
  const bad: string[] = [];
  for (const file of packageJsonFiles(root)) {
    const parsed = packageJsonSchema.parse(
      JSON.parse(readFileSync(path.join(root, file), "utf8")) as unknown,
    );
    for (const [name, value] of Object.entries(parsed.scripts ?? {})) {
      if (file === "package.json" && allowedRootTestScripts.get(name) === value) continue;
      if (name === "test" || name.startsWith("test:")) bad.push(`${file} scripts.${name}`);
    }
  }
  if (bad.length === 0) return;
  throw new Error(
    [
      "Package-local test scripts are not allowed. Use npm run e2e for real E2Es, npm run guard -- ... for repo rules, and npm run typecheck for type contracts.",
      "",
      ...bad.map((entry) => `- ${entry}`),
    ].join("\n"),
  );
}

function assertNoDisallowedTestDependencies(root: string): void {
  const bad: string[] = [];
  for (const file of packageJsonFiles(root)) {
    const parsed = packageJsonSchema.parse(
      JSON.parse(readFileSync(path.join(root, file), "utf8")) as unknown,
    );
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ] as const) {
      for (const name of Object.keys(parsed[section] ?? {})) {
        if (isDisallowedTestDependency(name)) bad.push(`${file} ${section}.${name}`);
      }
    }
  }
  if (bad.length === 0) return;
  throw new Error(
    [
      "Non-E2E test framework dependencies are not allowed. Do not reintroduce Jest/Vitest-style local test stacks.",
      "",
      ...bad.map((entry) => `- ${entry}`),
    ].join("\n"),
  );
}

export function assertTestPolicy(root: string): void {
  assertNoDisallowedTestFiles(root);
  assertNoDisallowedPackageTestScripts(root);
  assertNoDisallowedTestDependencies(root);
}
