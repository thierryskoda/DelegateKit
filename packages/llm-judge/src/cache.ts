import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export function cacheFilePath(cacheDir: string, key: string): string {
  return path.join(cacheDir, `${key}.json`);
}

export async function readCachedResult<T>(
  schema: z.ZodType<T>,
  filePath: string,
): Promise<T | null> {
  if (!existsSync(filePath)) return null;
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  const envelope = z.object({ result: z.unknown() }).passthrough().parse(parsed);
  return schema.parse(envelope.result);
}

export async function writeCachedResult(
  filePath: string,
  envelope: Record<string, unknown>,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  await rename(tmp, filePath);
}
