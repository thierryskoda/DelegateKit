import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  requireNangoProviderCapabilityAccount,
  type NangoProviderCapabilityAccountBinding,
} from "../../integrations/provider-runtime";

const MICROSOFT_TODO_PROVIDER_KEY = "microsoft-todo";

export async function requireMicrosoftTodoNango(
  db: SupabaseServiceClient,
  profileId: string,
  connectedAccountId?: string | null,
): Promise<NangoProviderCapabilityAccountBinding> {
  return requireNangoProviderCapabilityAccount(db, {
    profileId,
    providers: [MICROSOFT_TODO_PROVIDER_KEY],
    capabilitySlugs: [MICROSOFT_TODO_PROVIDER_KEY],
    connectedAccountId: connectedAccountId ?? null,
  });
}
