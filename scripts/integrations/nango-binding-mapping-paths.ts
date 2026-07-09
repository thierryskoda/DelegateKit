import { existsSync } from "node:fs";
import path from "node:path";
import type { RuntimeProfile } from "@ai-assistants/repo-layout";
import { repoRoot } from "@ai-assistants/repo-layout";

const DEFAULT_DEV_MAPPING_PATHS = [
  "scripts/integrations/testing-nango-bindings-dev.local.json",
] as const;

const DEFAULT_E2E_MAPPING_PATHS = [
  "scripts/integrations/testing-nango-bindings-e2e.local.json",
] as const;

const DEFAULT_PROD_MAPPING_PATHS = [] as const;

function existingDefaults(relativePaths: readonly string[]): readonly string[] {
  const repoRootPath = repoRoot(import.meta.url);
  return relativePaths.filter((mappingPath) => existsSync(path.join(repoRootPath, mappingPath)));
}

export function defaultNangoBindingMappingPaths(profile: RuntimeProfile): readonly string[] {
  if (profile === "prod") return existingDefaults(DEFAULT_PROD_MAPPING_PATHS);
  if (profile === "e2e") return DEFAULT_E2E_MAPPING_PATHS;
  return DEFAULT_DEV_MAPPING_PATHS;
}
