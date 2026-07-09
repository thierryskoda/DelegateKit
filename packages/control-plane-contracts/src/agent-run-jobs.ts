import { z } from "zod";

export const agentRunExecuteBackendJobKind = "agent.run.execute" as const;

export const agentRunSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("work_item"),
      workItemId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("scheduled_task"),
      scheduledTaskId: z.string().uuid(),
      scheduledTaskRevision: z.number().int().min(1),
      scheduledFor: z.string().datetime({ offset: true }),
    })
    .strict(),
]);

export const agentRunExecuteJobPayloadSchema = z
  .object({
    source: agentRunSourceSchema,
  })
  .strict();

export type AgentRunSource = z.infer<typeof agentRunSourceSchema>;
export type AgentRunExecuteJobPayload = z.infer<typeof agentRunExecuteJobPayloadSchema>;
