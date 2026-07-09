import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { Assistant, Profile } from "@ai-assistants/control-db";
import type { BackendToolExecuteRequest } from "../request-schema";
import type { ResolvedTrustedChannelOrigin } from "../../../product/actions/channel-resolution";

/**
 * Parsed tool execution context after contract resolution and `requireAssistantProfile`.
 */
export type ExecutorContext = {
  db: SupabaseServiceClient;
  input: BackendToolExecuteRequest;
  assistant: Assistant;
  profile: Profile;
  params: Record<string, unknown>;
  resolvedTrustedChannelOrigin?: ResolvedTrustedChannelOrigin;
};
