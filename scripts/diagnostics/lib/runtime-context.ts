import {
  diagnosticsLogDir,
  profileRuntimeDir,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";

export type DiagnosticRuntimeContext = {
  repoRoot: string;
  profile?: RuntimeProfile;
  runtimeRoot: string;
  diagnosticsDir: string;
};

export type DiagnosticRuntimeOptions = {
  profile?: RuntimeProfile;
  runtimeRoot?: string;
};

export function resolveDiagnosticRuntimeContext(
  repoRoot: string,
  options: DiagnosticRuntimeOptions = {},
): DiagnosticRuntimeContext {
  const envRuntimeRoot = process.env.AI_ASSISTANTS_RUNTIME_DIR?.trim();
  const runtimeRoot =
    options.runtimeRoot?.trim() ??
    envRuntimeRoot ??
    (options.profile ? profileRuntimeDir(options.profile) : undefined);
  if (!runtimeRoot) {
    throw new Error(
      "Diagnostics runtime root is required. Pass --runtime-root, pass --profile, or set AI_ASSISTANTS_RUNTIME_DIR.",
    );
  }
  return {
    repoRoot,
    ...(options.profile ? { profile: options.profile } : {}),
    runtimeRoot,
    diagnosticsDir: diagnosticsLogDir(runtimeRoot),
  };
}
