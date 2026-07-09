import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import type { ActionResult } from "./types";
import { executeExternalWriteForProfileAction } from "../external-write-contracts/registry";

export async function executeActionByToolName(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
): Promise<ActionResult> {
  return executeExternalWriteForProfileAction(db, action);
}
