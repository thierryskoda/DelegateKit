import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { Context } from "hono";
import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.unknown());
type JsonObject = z.infer<typeof jsonObjectSchema>;

function parseRequestInput<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
  label: string,
): z.infer<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError(domainCodes.VALIDATION, `${label} is invalid.`, {
      details: z.flattenError(parsed.error),
    });
  }
  return parsed.data;
}

export function parseRouteParams<TSchema extends z.ZodType>(
  c: Context,
  schema: TSchema,
  label = "Route params",
): z.infer<TSchema> {
  return parseRequestInput(schema, c.req.param(), label);
}

export function parseQuery<TSchema extends z.ZodType>(
  c: Context,
  schema: TSchema,
  label = "Query string",
): z.infer<TSchema> {
  return parseRequestInput(schema, c.req.query(), label);
}

async function parseJsonObjectBody(c: Context, label: string): Promise<JsonObject> {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    throw new DomainError(domainCodes.BAD_REQUEST, `${label} must be valid JSON.`);
  }
  const parsed = jsonObjectSchema.safeParse(payload);
  if (!parsed.success) {
    throw new DomainError(domainCodes.VALIDATION, `${label} must be a JSON object.`, {
      details: z.flattenError(parsed.error),
    });
  }
  return parsed.data;
}

export async function parseJsonBody<TSchema extends z.ZodType>(
  c: Context,
  schema: TSchema,
  label: string,
): Promise<z.infer<TSchema>> {
  return parseRequestInput(schema, await parseJsonObjectBody(c, label), label);
}
