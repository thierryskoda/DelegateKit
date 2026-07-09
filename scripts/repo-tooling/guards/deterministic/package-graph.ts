import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

type PackageNode = {
  name: string;
  packageJsonPath: string;
  relativeDir: string;
  deps: string[];
  runtimeDeps: string[];
  devDeps: string[];
};

const workspaceRoots = ["apps", "packages", "capabilities"] as const;
const packageJsonSchema = z
  .object({
    name: z.unknown().optional(),
    dependencies: z.record(z.string(), z.unknown()).optional(),
    devDependencies: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

function collectPackageJsonPaths(root: string, dir: string, out: string[]): void {
  const absolute = path.join(root, dir);
  if (!existsSync(absolute)) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const child = path.join(dir, entry.name);
    const packageJsonPath = path.join(root, child, "package.json");
    if (existsSync(packageJsonPath)) out.push(packageJsonPath);
    collectPackageJsonPaths(root, child, out);
  }
}

function readPackageGraph(root: string): Map<string, PackageNode> {
  const packageJsonPaths: string[] = [];
  for (const workspaceRoot of workspaceRoots)
    collectPackageJsonPaths(root, workspaceRoot, packageJsonPaths);

  const nodes = new Map<string, PackageNode>();
  for (const packageJsonPath of packageJsonPaths) {
    const parsed = packageJsonSchema.parse(JSON.parse(readFileSync(packageJsonPath, "utf8")) as unknown);
    if (typeof parsed.name !== "string" || !parsed.name.trim()) {
      throw new Error(`${path.relative(root, packageJsonPath)} must declare a package name.`);
    }
    const runtimeDeps = Object.keys(parsed.dependencies ?? {}).filter((dep) =>
      dep.startsWith("@ai-assistants/"),
    );
    const devDeps = Object.keys(parsed.devDependencies ?? {}).filter((dep) =>
      dep.startsWith("@ai-assistants/"),
    );
    nodes.set(parsed.name, {
      name: parsed.name,
      packageJsonPath,
      relativeDir: path.dirname(path.relative(root, packageJsonPath)),
      deps: Object.keys({
        ...(parsed.dependencies ?? {}),
        ...(parsed.devDependencies ?? {}),
      }).filter((dep) => dep.startsWith("@ai-assistants/")),
      runtimeDeps,
      devDeps,
    });
  }

  for (const node of nodes.values()) {
    node.deps = node.deps.filter((dep) => nodes.has(dep));
    node.runtimeDeps = node.runtimeDeps.filter((dep) => nodes.has(dep));
    node.devDeps = node.devDeps.filter((dep) => nodes.has(dep));
  }
  return nodes;
}

function localPackageCycles(nodes: Map<string, PackageNode>): string[][] {
  const cycles: string[][] = [];
  const visiting: string[] = [];
  const visited = new Set<string>();

  function visit(name: string): void {
    visiting.push(name);
    visited.add(name);
    for (const dep of nodes.get(name)?.deps ?? []) {
      const existingIndex = visiting.indexOf(dep);
      if (existingIndex >= 0) {
        cycles.push([...visiting.slice(existingIndex), dep]);
        continue;
      }
      if (!visited.has(dep)) visit(dep);
    }
    visiting.pop();
  }

  for (const name of nodes.keys()) {
    if (!visited.has(name)) visit(name);
  }
  return cycles;
}

export function assertLocalPackageGraphIsAcyclic(root: string): void {
  assertCapabilityCatalogHasNoProviderSpecificSources(root);
  const nodes = readPackageGraph(root);
  const cycles = localPackageCycles(nodes);
  const forbidden = forbiddenDependencyViolations(nodes);
  if (cycles.length === 0 && forbidden.length === 0) return;

  const details = [
    cycles.length === 0
      ? null
      : `Cycles:\n${cycles.map((cycle) => `- ${cycle.join(" -> ")}`).join("\n")}`,
    forbidden.length === 0
      ? null
      : `Forbidden dependencies:\n${forbidden.map((violation) => `- ${violation}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  throw new Error(`Local @ai-assistants package dependency graph is invalid.\n${details}`);
}

function forbiddenDependencyViolations(nodes: Map<string, PackageNode>): string[] {
  const violations: string[] = [];
  const forbiddenEdges = [
    [
      "@ai-assistants/tool-contracts",
      "@ai-assistants/control-plane-contracts",
      "tool-contracts is the generic tool ABI and must not import control-plane row/job contracts",
    ],
    [
      "@ai-assistants/control-plane-contracts",
      "@ai-assistants/capability-catalog",
      "control-plane-contracts owns generated DB row contracts and must not import capability catalog policy",
    ],
    [
      "@ai-assistants/capability-catalog",
      "@ai-assistants/tool-contracts",
      "capability-catalog owns pure slugs/readiness/activation and must not import tool ABI contracts",
    ],
    [
      "@ai-assistants/connect",
      "@ai-assistants/control-db",
      "Connect must consume portal DTO contracts instead of database row types",
    ],
    [
      "@ai-assistants/connect",
      "@ai-assistants/control-plane-contracts",
      "Connect must consume portal DTO contracts instead of control-plane row contracts",
    ],
  ] as const;

  for (const [from, to, reason] of forbiddenEdges) {
    const node = nodes.get(from);
    if (node?.deps.includes(to)) violations.push(`${from} -> ${to}: ${reason}`);
  }

  for (const node of nodes.values()) {
    if (!node.name.endsWith("-contracts")) continue;
    for (const dep of node.deps) {
      const depNode = nodes.get(dep);
      const depIsRuntimePackage =
        depNode?.relativeDir.startsWith("apps/") ||
        depNode?.relativeDir.startsWith("capabilities/");
      if (dep.endsWith("-tools") || depIsRuntimePackage) {
        violations.push(
          `${node.name} -> ${dep}: pure contract packages must not depend on tools, apps, backend, or runtime adapter packages`,
        );
      }
    }
  }

  for (const node of nodes.values()) {
    if (!node.relativeDir.startsWith("capabilities/")) continue;
    for (const dep of node.runtimeDeps) {
      if (dep.endsWith("-contracts")) continue;
      violations.push(
        `${node.name} -> ${dep}: capability runtime adapters may only depend on contract packages and plugin-tools at runtime`,
      );
    }
  }

  const catalog = nodes.get("@ai-assistants/capability-catalog");
  if (catalog) {
    for (const dep of catalog.deps) {
      const depNode = nodes.get(dep);
      const forbiddenCatalogDep =
        dep === "@ai-assistants/tool-contracts" ||
        dep === "@ai-assistants/control-db" ||
        dep === "@ai-assistants/connect" ||
        dep === "@ai-assistants/backend" ||
        dep === "@ai-assistants/nango-provisioning" ||
        dep.endsWith("-contracts") ||
        dep.endsWith("-tools") ||
        depNode?.relativeDir.startsWith("apps/");
      if (forbiddenCatalogDep) {
        violations.push(
          `@ai-assistants/capability-catalog -> ${dep}: capability-catalog must stay provider-agnostic and independent of tool, contract, backend, Connect, and DB packages`,
        );
      }
    }
  }
  return violations;
}

function assertCapabilityCatalogHasNoProviderSpecificSources(root: string): void {
  const catalogSrc = path.join(root, "packages", "capability-catalog", "src");
  if (!existsSync(catalogSrc)) return;
  const forbidden = readdirSync(catalogSrc)
    .filter((entry) => /^(monday|nango)-/.test(entry))
    .sort((a, b) => a.localeCompare(b));
  if (forbidden.length > 0) {
    throw new Error(
      `@ai-assistants/capability-catalog must stay provider/provisioning agnostic. Move these files out: ${forbidden.join(", ")}.`,
    );
  }
}
