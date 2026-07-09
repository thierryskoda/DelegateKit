import { DomainError, domainCodes } from "@ai-assistants/errors";

const MAX_TEXT_CHARS = 80_000;

export function boundedText(text: string): { text: string; charCount: number; truncated: boolean } {
  const normalized = text.replace(/\u0000/gu, "").trim();
  if (normalized.length <= MAX_TEXT_CHARS) {
    return { text: normalized, charCount: normalized.length, truncated: false };
  }
  return {
    text: normalized.slice(0, MAX_TEXT_CHARS),
    charCount: normalized.length,
    truncated: true,
  };
}

export function decodeUtf8Text(bytes: Uint8Array): { text: string; charCount: number; truncated: boolean } {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const nulCount = [...decoded].filter((char) => char === "\u0000").length;
  if (decoded.length > 0 && nulCount / decoded.length > 0.01) {
    throw new DomainError(domainCodes.BAD_REQUEST, "File does not look like readable UTF-8 text.");
  }
  return boundedText(decoded);
}
