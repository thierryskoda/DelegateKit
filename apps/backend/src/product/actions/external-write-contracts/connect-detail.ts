import type { ConnectActionDetailDto } from "@ai-assistants/connect-api-contracts";

type DetailKind = ConnectActionDetailDto["kind"];
type DetailPreview = NonNullable<ConnectActionDetailDto["preview"]>;
type DetailSection = DetailPreview["sections"][number];
type DetailField = DetailSection["fields"][number];
type DetailChange = DetailSection["changes"][number];

export function textValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function listValue(values: unknown): string | null {
  if (!Array.isArray(values)) return null;
  const strings = values.map(textValue).filter((value): value is string => value !== null);
  return strings.length > 0 ? strings.join(", ") : null;
}

export function field(label: string, value: unknown): DetailField | null {
  const text = Array.isArray(value) ? listValue(value) : textValue(value);
  return text ? { label, value: text } : null;
}

export function fields(items: Array<DetailField | null>): DetailField[] {
  return items.filter((item): item is DetailField => item !== null);
}

export function body(label: string, value: unknown): DetailSection["body"] | null {
  return typeof value === "string" ? { label, value } : null;
}

export function change(label: string, before: unknown, after: unknown): DetailChange | null {
  const beforeText = textValue(before);
  const afterText = textValue(after);
  if (!beforeText && !afterText) return null;
  return {
    label,
    ...(beforeText === null ? {} : { before: beforeText }),
    ...(afterText === null ? {} : { after: afterText }),
  };
}

export function changes(items: Array<DetailChange | null>): DetailChange[] {
  return items.filter((item): item is DetailChange => item !== null);
}

export function section(input: {
  title: string;
  fields?: DetailField[];
  body?: DetailSection["body"] | null;
  changes?: DetailChange[];
}): DetailSection {
  return {
    title: input.title,
    fields: input.fields ?? [],
    ...(input.body === undefined ? {} : { body: input.body }),
    changes: input.changes ?? [],
  };
}

export function preview(label: string, sections: DetailSection[]): DetailPreview | null {
  const visibleSections = sections.filter(
    (item) => item.fields.length > 0 || item.body || item.changes.length > 0,
  );
  return visibleSections.length > 0 ? { label, sections: visibleSections } : null;
}

export function detail<TKind extends DetailKind>(
  kind: TKind,
  headline: string,
  detailPreview: DetailPreview | null,
): Extract<ConnectActionDetailDto, { kind: TKind }> {
  return { kind, headline, preview: detailPreview } as Extract<
    ConnectActionDetailDto,
    { kind: TKind }
  >;
}

export function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

