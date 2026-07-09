import { chmodSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Matches managed blocks written by profile startup scripts. */
export const MANAGED_ENV_BLOCK_PATTERN =
  /^# BEGIN AI ASSISTANTS [^\n]*\n[\s\S]*?^# END AI ASSISTANTS [^\n]*(?:\n|$)/gm;

export function writeSecretFileAtomic(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, content, { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, filePath);
  chmodSync(filePath, 0o600);
}

export function managedEnvBlockKey(block: string): string {
  return block.split(/\r?\n/, 1)[0]?.trim() ?? block;
}

export function managedEnvBlocks(text: string): string[] {
  return [...text.matchAll(MANAGED_ENV_BLOCK_PATTERN)].map((match) => match[0]!.trimEnd());
}

export function parseEnvAssignmentLines(text: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    entries[match[1]!] = match[2]!.trim();
  }
  return entries;
}

export function upsertManagedEnvBlock(input: {
  existingText: string;
  blockBegin: string;
  blockEnd: string;
  blockBodyLines: readonly string[];
}): string {
  const block = [input.blockBegin, ...input.blockBodyLines, input.blockEnd].join("\n");
  const managedPattern = new RegExp(
    `${escapeRegExp(input.blockBegin)}[\\s\\S]*?${escapeRegExp(input.blockEnd)}`,
    "g",
  );
  const next = managedPattern.test(input.existingText)
    ? input.existingText.replace(managedPattern, block)
    : [input.existingText, block].filter(Boolean).join("\n\n");
  return `${next.trimEnd()}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
