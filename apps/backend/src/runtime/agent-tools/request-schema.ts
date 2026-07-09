import { createBackendToolExecuteRequestSchema } from "@ai-assistants/tool-contracts";
import { z, type ZodType } from "zod";

export const backendToolExecuteRequestSchema = createBackendToolExecuteRequestSchema(
  z.string().trim().min(1) satisfies ZodType<string>,
);

export type BackendToolExecuteRequest = z.infer<typeof backendToolExecuteRequestSchema>;
