import { z } from "zod";

declare const standardToolDescriptionBrand: unique symbol;

export type StandardToolDescription = string & {
  readonly [standardToolDescriptionBrand]: true;
};

/**
 * Branded template tag for agent-visible tool descriptions.
 * Keep descriptions readable at the call site while allowing `${...}` references
 * to canonical tool names, field names, or shared wording constants.
 */
export function toolDescription(
  strings: TemplateStringsArray,
  ...values: readonly unknown[]
): StandardToolDescription {
  let text = strings[0] ?? "";
  for (let index = 0; index < values.length; index += 1) {
    text += String(values[index]);
    text += strings[index + 1] ?? "";
  }
  return text.replace(/\s+/g, " ").trim() as StandardToolDescription;
}

const nonEmptyDescriptionPart = z.string().trim().min(1);
const nonEmptyDescriptionPartArray = z.array(nonEmptyDescriptionPart).default([]);

export const readToolDescriptionPartsSchema = z
  .object({
    useWhen: nonEmptyDescriptionPart,
    operation: nonEmptyDescriptionPart,
    returns: nonEmptyDescriptionPart,
    doNotUse: nonEmptyDescriptionPart.optional(),
    notes: nonEmptyDescriptionPartArray,
  })
  .strict();

export const writeToolDescriptionPartsSchema = readToolDescriptionPartsSchema
  .extend({
    sideEffect: nonEmptyDescriptionPart,
    safety: nonEmptyDescriptionPart,
  })
  .strict();

export type ReadToolDescriptionParts = z.input<typeof readToolDescriptionPartsSchema>;
export type WriteToolDescriptionParts = z.input<typeof writeToolDescriptionPartsSchema>;

type ObjectSchemaKey<TSchema extends z.ZodObject<Record<string, z.ZodType>>> = Extract<
  keyof TSchema["shape"],
  string
>;

export function toolInputProperty<
  const TSchema extends z.ZodObject<Record<string, z.ZodType>>,
  const TKey extends ObjectSchemaKey<TSchema>,
>(schema: TSchema, key: TKey): TKey {
  if (!(key in schema.shape)) throw new Error(`Unknown tool input property: ${key}`);
  return key;
}

export function toolOutputProperty<
  const TSchema extends z.ZodObject<Record<string, z.ZodType>>,
  const TKey extends ObjectSchemaKey<TSchema>,
>(schema: TSchema, key: TKey): TKey {
  if (!(key in schema.shape)) throw new Error(`Unknown tool output property: ${key}`);
  return key;
}

function sentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function renderCommonDescription(parts: z.output<typeof readToolDescriptionPartsSchema>): string[] {
  return [
    `Use this when ${sentence(parts.useWhen)}`,
    sentence(parts.operation),
    `Returns ${sentence(parts.returns)}`,
    ...(parts.doNotUse ? [`Do not use this when ${sentence(parts.doNotUse)}`] : []),
    ...parts.notes.map(sentence),
  ];
}

export function readToolDescription(parts: ReadToolDescriptionParts): StandardToolDescription {
  const parsed = readToolDescriptionPartsSchema.parse(parts);
  return renderCommonDescription(parsed).join(" ") as StandardToolDescription;
}

export function writeToolDescription(parts: WriteToolDescriptionParts): StandardToolDescription {
  const parsed = writeToolDescriptionPartsSchema.parse(parts);
  return [
    ...renderCommonDescription(parsed),
    `External write: ${sentence(parsed.sideEffect)}`,
    `Before calling, ${sentence(parsed.safety)}`,
  ].join(" ") as StandardToolDescription;
}
