import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function readSource(root: string, relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function tsFilesUnder(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...tsFilesUnder(fullPath));
      continue;
    }
    if (/\.[cm]?[tj]sx?$/.test(entry)) files.push(fullPath);
  }
  return files;
}

function relativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export function assertConnectWebEnvSource(root: string): void {
  const violations: string[] = [];
  const viteConfigPath = "apps/connect/vite.config.ts";
  const publicConfigPath = "scripts/profiles/connect-public-config.ts";
  const viteConfig = readSource(root, viteConfigPath);
  const publicConfig = readSource(root, publicConfigPath);

  if (viteConfig.includes("import.meta.env")) {
    violations.push(`${viteConfigPath} must not use client-bundled import.meta.env config.`);
  }
  if (!viteConfig.includes("connectPublicConfigSchema")) {
    violations.push(`${viteConfigPath} must validate Connect public config before serving Vite.`);
  }
  if (!publicConfig.includes("parseConnectWebEnv")) {
    violations.push(`${publicConfigPath} must build public config from parseConnectWebEnv().`);
  }
  if (publicConfig.includes("AI_ASSISTANTS_BACKEND_URL") || publicConfig.includes("SUPABASE_URL")) {
    violations.push(
      `${publicConfigPath} must not use fallback env chains; require BACKEND_PUBLIC_URL and SUPABASE_PUBLIC_URL.`,
    );
  }

  for (const filePath of tsFilesUnder(path.join(root, "apps/connect/src"))) {
    const relative = relativePath(root, filePath);
    const source = readFileSync(filePath, "utf8");
    if (source.includes("import.meta.env") || source.includes("process.env")) {
      violations.push(
        `${relative} browser code must load /connect-config.json instead of env variables.`,
      );
    }
  }

  if (violations.length === 0) return;
  throw new Error(["Connect web env source drift:", ...violations.map((v) => `  - ${v}`)].join("\n"));
}
