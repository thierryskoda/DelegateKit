import { Buffer } from "node:buffer";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  providerSandboxBinaryResponseSchema,
  providerSandboxOperationResponseResourceType,
  registerProviderSandboxOperationFixtures,
  requireProviderSandboxOperation,
  upsertProviderSandboxResource,
  type ProviderSandboxBinding,
  type ProviderSandboxOperationFixture,
} from "../../../../apps/backend/src/test-support/provider-sandbox";

export function providerSandboxBinaryResponse(input: {
  body: Uint8Array;
  contentType?: string;
}): ReturnType<typeof providerSandboxBinaryResponseSchema.parse> {
  return providerSandboxBinaryResponseSchema.parse({
    bodyBase64: Buffer.from(input.body).toString("base64"),
    ...(input.contentType === undefined ? {} : { contentType: input.contentType }),
  });
}

function providerSandboxFixtureResponseRecord(
  fixture: ProviderSandboxOperationFixture,
): Record<string, unknown> {
  const definition = requireProviderSandboxOperation(
    fixture.providerKey,
    String(fixture.operation),
  );
  const parsed = definition.responseSchema.parse(fixture.response);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Provider sandbox fixture ${fixture.providerKey}/${String(fixture.operation)} must parse to a JSON object.`,
    );
  }
  return parsed as Record<string, unknown>;
}

export async function seedProviderSandboxOperationResponse(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  fixture: ProviderSandboxOperationFixture;
}): Promise<void> {
  registerProviderSandboxOperationFixtures();
  const response = providerSandboxFixtureResponseRecord(input.fixture);
  await upsertProviderSandboxResource({
    db: input.db,
    binding: input.binding,
    key: {
      providerKey: input.fixture.providerKey,
      resourceType: providerSandboxOperationResponseResourceType,
      resourceId: input.fixture.operation,
    },
    state: { response },
    metadata: {
      ...(input.fixture.marker === undefined ? {} : { marker: input.fixture.marker }),
      ...(input.fixture.metadata ?? {}),
    },
  });
}

export async function seedProviderSandboxOperationResponses(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  fixtures: readonly ProviderSandboxOperationFixture[];
}): Promise<void> {
  for (const fixture of input.fixtures) {
    await seedProviderSandboxOperationResponse({
      db: input.db,
      binding: input.binding,
      fixture,
    });
  }
}
