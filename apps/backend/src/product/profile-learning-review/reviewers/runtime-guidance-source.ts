import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { repoRelativePath, repoRoot } from "@ai-assistants/repo-layout";

const STATE_DESTINATION_ROUTER_SOURCE_PATH =
  "runtime-guidance/state_destination_router/GUIDANCE.ts";

function isAuthoredGuidance(value: unknown): value is {
  name: string;
  description: string;
  sourceKind: string;
  body: { markdown: string };
} {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { description?: unknown }).description === "string" &&
    typeof (value as { sourceKind?: unknown }).sourceKind === "string" &&
    (value as { body?: unknown }).body &&
    typeof (value as { body: { markdown?: unknown } }).body.markdown === "string",
  );
}

async function existingRepoRelativePath(relativePath: string): Promise<string> {
  const absolutePath = repoRelativePath(repoRoot(import.meta.url), relativePath);
  await access(absolutePath);
  return absolutePath;
}

export async function loadStateDestinationRouterGuidanceMarkdown(): Promise<string> {
  const sourcePath = await existingRepoRelativePath(STATE_DESTINATION_ROUTER_SOURCE_PATH);
  const module = (await import(pathToFileURL(sourcePath).href)) as { default?: unknown };
  if (!isAuthoredGuidance(module.default)) {
    throw new Error(
      `${STATE_DESTINATION_ROUTER_SOURCE_PATH} must default-export authored guidance.`,
    );
  }
  if (
    module.default.sourceKind !== "generic" ||
    module.default.name !== "state_destination_router"
  ) {
    throw new Error(
      `${STATE_DESTINATION_ROUTER_SOURCE_PATH} must export generic guidance named state_destination_router.`,
    );
  }
  return module.default.body.markdown.trim();
}
