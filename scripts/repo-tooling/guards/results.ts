export type GuardJson = Record<string, unknown> & {
  ok: boolean;
};

export function printJson(value: GuardJson): void {
  console.log(JSON.stringify(value, null, 2));
}

export function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finds maintainer skill (or similar) names mentioned in prose without relying on a name prefix. */
export function extractKnownIdentifierMentions(
  text: string,
  knownNames: readonly string[],
): string[] {
  const found = new Set<string>();
  for (const name of knownNames) {
    const pattern = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(name)}(?![A-Za-z0-9_-])`, "g");
    if (pattern.test(text)) found.add(name);
  }
  return sorted(found);
}

export function sameStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}
