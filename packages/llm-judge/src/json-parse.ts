function extractFirstJsonValue(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.search(/[\[{]/);
  if (start < 0) return null;
  const opening = text[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (!char) continue;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === opening) {
      depth += 1;
    } else if (char === closing) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

export function parseJsonFromAgentText(raw: string, label: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`${label} returned empty stdout.`);

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const primary = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(primary) as unknown;
  } catch (error) {
    const candidate = extractFirstJsonValue(primary);
    if (candidate) return JSON.parse(candidate) as unknown;
    throw error;
  }
}
