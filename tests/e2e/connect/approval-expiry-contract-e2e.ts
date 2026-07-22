#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { connectProfileActionDtoSchema } from "@ai-assistants/connect-api-contracts";
import {
  expiringSoonDecisions,
  isDecisionExpiringSoon,
} from "../../../apps/connect/src/features/approvals/decision-urgency";

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

test("Only pending deadlines within the next 24 hours are expiring soon.", () => {
  const now = Date.parse("2026-07-22T19:00:00.000Z");

  assert.equal(isDecisionExpiringSoon("2026-07-22T19:00:01.000Z", now), true);
  assert.equal(isDecisionExpiringSoon("2026-07-23T19:00:00.000Z", now), true);
  assert.equal(isDecisionExpiringSoon("2026-07-23T19:00:00.001Z", now), false);
  assert.equal(isDecisionExpiringSoon("2026-07-22T18:59:59.999Z", now), false);
  assert.equal(isDecisionExpiringSoon(null, now), false);
  assert.equal(isDecisionExpiringSoon("not-a-date", now), false);
});

test("Expiring-soon decisions exclude other rows and sort by nearest deadline.", () => {
  const now = Date.parse("2026-07-22T19:00:00.000Z");
  const decisions = [
    { id: "later", expiresAt: "2026-07-23T18:00:00.000Z" },
    { id: "no-deadline", expiresAt: null },
    { id: "nearest", expiresAt: "2026-07-22T19:15:00.000Z" },
    { id: "expired", expiresAt: "2026-07-22T18:00:00.000Z" },
  ];

  assert.deepEqual(
    expiringSoonDecisions(decisions, now).map((decision) => decision.id),
    ["nearest", "later"],
  );
});
