#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { connectProfileActionDtoSchema } from "@ai-assistants/connect-api-contracts";

test("Connect action DTO exposes the approval expiration timestamp.", () => {
  const expiresAt = "2026-07-23T19:00:00.000Z";
  const action = connectProfileActionDtoSchema.parse({
    id: randomUUID(),
    status: "pending_approval",
    expiresAt,
    detail: {
      kind: "phone_sms_send",
      headline: "Send the prepared client update",
      preview: null,
    },
  });

  assert.equal(action.expiresAt, expiresAt);
});
