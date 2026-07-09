import path from "node:path";

export type DiagnosticRuntimeOptions = {
  runtimeRoot?: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
};

function requireAbsolutePath(value: string, label: string): string {
  const resolved = path.resolve(value);
  if (!path.isAbsolute(resolved)) throw new Error(`${label} must resolve to an absolute path.`);
  return resolved;
}

export function runtimeRootFromConfigPath(configPath: string): string {
  const resolved = requireAbsolutePath(configPath, "AI_ASSISTANTS_RUNTIME_CONFIG_PATH");
  return path.dirname(resolved);
}

export function runtimeRootFromWorkspaceDir(workspaceDir: string): string {
  const resolved = requireAbsolutePath(workspaceDir, "workspaceDir");
  const parts = resolved.split(path.sep);
  const index = parts.lastIndexOf("workspaces");
  if (index <= 0 || !parts[index + 1]) {
    throw new Error(
      `workspaceDir must be under a runtime workspaces/<assistant> directory; got ${resolved}.`,
    );
  }
  return parts.slice(0, index).join(path.sep) || path.sep;
}

export function resolveDiagnosticRuntimeRoot(options: DiagnosticRuntimeOptions = {}): string {
  if (options.runtimeRoot?.trim())
    return requireAbsolutePath(options.runtimeRoot.trim(), "runtimeRoot");
  if (options.configPath?.trim()) return runtimeRootFromConfigPath(options.configPath.trim());
  const env = options.env ?? process.env;
  const envRuntimeDir = env.AI_ASSISTANTS_RUNTIME_DIR?.trim();
  if (envRuntimeDir) return requireAbsolutePath(envRuntimeDir, "AI_ASSISTANTS_RUNTIME_DIR");
  const envConfigPath = env.AI_ASSISTANTS_RUNTIME_CONFIG_PATH?.trim();
  if (envConfigPath) return runtimeRootFromConfigPath(envConfigPath);
  throw new Error(
    "Diagnostic runtime root is required. Pass runtimeRoot, configPath, or set AI_ASSISTANTS_RUNTIME_DIR.",
  );
}
