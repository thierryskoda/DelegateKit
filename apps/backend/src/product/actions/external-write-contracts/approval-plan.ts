import { createHash } from "node:crypto";

export type ExternalWriteApprovalPlan = {
  payload: object;
  requestHash: string;
  approvalTitle: string;
  approvalSummary: string;
  reviewPayload: Record<string, unknown>;
};

export function buildExternalWriteApprovalPlan(
  toolName: string,
  payload: object,
  title: string,
  summary: string,
  reviewType: string,
  extras: Record<string, unknown> = {},
): ExternalWriteApprovalPlan {
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ toolName, payload }))
    .digest("hex");
  return {
    payload,
    requestHash,
    approvalTitle: title,
    approvalSummary: summary,
    reviewPayload: {
      type: reviewType,
      executionPayloadHash: requestHash,
      ...extras,
    },
  };
}
