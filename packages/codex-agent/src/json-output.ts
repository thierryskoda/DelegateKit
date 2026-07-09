export type CodexJsonEvent = {
  type: string;
  [key: string]: unknown;
};

export type CodexAgentMessageItem = {
  type: "agent_message";
  text: string;
  [key: string]: unknown;
};

export function parseCodexJsonEvents(raw: string): CodexJsonEvent[] {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("codex exec returned empty stdout.");
  return trimmed.split(/\r?\n/).map((line, index) => {
    try {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("event must be a JSON object");
      }
      const event = value as Record<string, unknown>;
      if (typeof event.type !== "string") {
        throw new Error("event.type must be a string");
      }
      return event as CodexJsonEvent;
    } catch (cause) {
      throw new Error(
        `Failed to parse codex JSONL event on line ${index + 1}: ${line.slice(0, 240)}`,
        {
          cause,
        },
      );
    }
  });
}

export function extractCodexAgentMessages(
  events: readonly CodexJsonEvent[],
): CodexAgentMessageItem[] {
  const messages: CodexAgentMessageItem[] = [];
  for (const event of events) {
    if (event.type !== "item.completed") continue;
    const item = event.item;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (record.type === "agent_message" && typeof record.text === "string") {
      messages.push(record as CodexAgentMessageItem);
    }
  }
  return messages;
}

export function extractLastCodexAgentMessage(events: readonly CodexJsonEvent[]): string | null {
  return extractCodexAgentMessages(events).at(-1)?.text ?? null;
}
