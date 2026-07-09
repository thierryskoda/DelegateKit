import { DomainError, domainCodes } from "@ai-assistants/errors";
import { backendJobKindSchema, type BackendJobKind } from "@ai-assistants/backend-jobs";
import { registerProviderWebhookAdapter } from "../../integrations/provider-webhooks/substrate";
import { providerWebhookAdapters } from "../../capabilities/registry/provider-webhook-adapters";
import { providerWebhookJobHandlers } from "../../integrations/provider-webhooks/job-handlers";
import { registerProviderSandboxOperationFixtures } from "../../capabilities/registry/register-provider-sandbox-operation-fixtures";
import { profileLearningReviewJobHandlers } from "../../product/profile-learning-review/job-handler";
import { agentRunJobHandlers } from "../agent-runner/job-handler";
import type { BackendJobHandler, BackendJobHandlerRegistry } from "./types";

for (const adapter of providerWebhookAdapters) {
  registerProviderWebhookAdapter(adapter);
}
registerProviderSandboxOperationFixtures();

export const backendJobHandlers = {
  ...agentRunJobHandlers,
  ...profileLearningReviewJobHandlers,
  ...providerWebhookJobHandlers,
} satisfies BackendJobHandlerRegistry;

export function requireHandler(
  handlers: BackendJobHandlerRegistry,
  kind: BackendJobKind,
): BackendJobHandler {
  const parsedKind = backendJobKindSchema.parse(kind);
  const handler = handlers[parsedKind];
  if (!handler)
    throw new DomainError(
      domainCodes.INTERNAL,
      `No backend job handler registered for kind: ${parsedKind}`,
    );
  return handler;
}
