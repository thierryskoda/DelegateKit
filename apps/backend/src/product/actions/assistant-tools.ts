import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { actionIsExpired, expireProfileAction } from "./action-lifecycle";

export async function listProfileActionsForAssistantTool(
  db: SupabaseServiceClient,
  profileId: string,
  input: { scope: "pending" | "active" | "recent"; limit: number },
): Promise<TableRow<"profile_actions">[]> {
  const limit = Math.max(1, Math.min(50, input.limit));
  let query = db.from("profile_actions").select().eq("profile_id", profileId);

  if (input.scope === "pending") {
    query = query.eq("status", "pending_approval").order("created_at", { ascending: false });
  } else if (input.scope === "active") {
    query = query
      .in("status", ["pending_approval", "processing", "failed", "unknown", "blocked"])
      .order("updated_at", { ascending: false });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  const result = await query.limit(limit);
  const rows = requireSupabaseRows(
    "List profile actions for assistant tool",
    result.data,
    result.error,
  );
  const actions: TableRow<"profile_actions">[] = [];
  for (const action of rows) {
    const normalized = await expirePendingActionIfStale(db, action);
    if (input.scope === "pending" && normalized.expired) continue;
    actions.push(normalized.action);
  }
  return actions;
}

export async function getProfileActionForAssistantTool(
  db: SupabaseServiceClient,
  profileId: string,
  actionId: string,
): Promise<TableRow<"profile_actions">> {
  const result = await db
    .from("profile_actions")
    .select()
    .eq("profile_id", profileId)
    .eq("id", actionId)
    .maybeSingle();
  const action = requireSupabaseData(
    `Load profile action ${actionId} for assistant tool`,
    result.data,
    result.error,
  );
  return (await expirePendingActionIfStale(db, action)).action;
}

async function expirePendingActionIfStale(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
): Promise<{ action: TableRow<"profile_actions">; expired: boolean }> {
  if (action.status !== "pending_approval" || !actionIsExpired(action)) {
    return { action, expired: false };
  }
  return { action: await expireProfileAction(db, action), expired: true };
}
