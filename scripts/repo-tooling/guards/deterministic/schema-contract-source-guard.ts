import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function* walkSourceFiles(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      yield* walkSourceFiles(full);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      yield full;
    }
  }
}

function filesContaining(
  substr: string,
  root: string,
  skipRelativePaths?: readonly string[],
): string[] {
  const matches: string[] = [];
  for (const file of walkSourceFiles(root)) {
    const rel = path.relative(root, file);
    if (skipRelativePaths?.some((p) => rel === p || rel.endsWith(`/${p}`))) continue;
    const text = readFileSync(file, "utf8");
    if (text.includes(substr)) matches.push(rel);
  }
  return matches;
}

/**
 * Fail fast on reintroduced schema contract smells (deleted import paths, duplicated enums).
 * Uses plain filesystem scans so CI/agents do not require `rg` on PATH.
 */
export function assertSchemaContractSourceLayout(repoRoot: string): void {
  const skipSelf = [
    "scripts/repo-tooling/guards/deterministic/schema-contract-source-guard.ts",
  ] as const;
  const bannedImport = ["from ", '"@ai-assistants/control-db', '/schemas"'].join("");
  const controlDbSchemas = filesContaining(bannedImport, repoRoot, skipSelf);
  if (controlDbSchemas.length) {
    throw new Error(`Banned control-db schemas subpath import in:\n${controlDbSchemas.join("\n")}`);
  }

  const approveRejectLiteral = 'z.enum(["approve", "reject"])';
  const approveRejectEnum = filesContaining(approveRejectLiteral, repoRoot, skipSelf);
  const badApproveReject = approveRejectEnum.filter(
    (file) =>
      !file.includes(
        `packages${path.sep}control-plane-contracts${path.sep}src${path.sep}profile-action-decisions.ts`,
      ),
  );
  if (badApproveReject.length) {
    throw new Error(
      `Duplicate ${approveRejectLiteral} outside control-plane contracts:\n${badApproveReject.join("\n")}`,
    );
  }
}
