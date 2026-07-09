import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import type { ConnectActionDetailDto } from "@ai-assistants/connect-api-contracts";
import type { z } from "zod";
import type { ActionResult } from "../execution/types";
import type { ExternalWriteStatus } from "@ai-assistants/tool-contracts";

export type BuildWritePlanContext = {
  db: SupabaseServiceClient;
  profileId: string;
  assistantId: string;
  toolCallId: string;
  params: Record<string, unknown>;
};

export type WriteActionPlan = {
  /** Canonical persisted `profile_actions.execution_payload` after approval. */
  actionPayload: object;
  /** When null, callers hash `actionPayload` only (SHA-256 of JSON stringification). */
  requestHash: string | null;
  reviewTitle: string | null;
  reviewSummary: string | null;
  reviewPayload: Record<string, unknown> | null;
};

export type ExternalWriteActionContract<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  toolName: string;
  actionPayloadSchema: TSchema;
  outputSchema: TOutputSchema;
  buildWritePlan: (ctx: BuildWritePlanContext) => Promise<WriteActionPlan>;
  buildReviewDetail: (input: {
    action: TableRow<"profile_actions">;
    payload: z.infer<TSchema>;
  }) => ConnectActionDetailDto;
  buildAgentResult: (input: {
    action: TableRow<"profile_actions">;
    payload: z.infer<TSchema>;
    status: ExternalWriteStatus;
    resultPayload: unknown;
    providerError: unknown;
  }) => z.infer<TOutputSchema>;
  execute: (
    db: SupabaseServiceClient,
    action: TableRow<"profile_actions">,
    payload: z.infer<TSchema>,
  ) => Promise<ActionResult>;
};

export function defineExternalWriteActionContract<
  TSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
>(
  def: ExternalWriteActionContract<TSchema, TOutputSchema>,
): ExternalWriteActionContract<TSchema, TOutputSchema> {
  return def;
}
