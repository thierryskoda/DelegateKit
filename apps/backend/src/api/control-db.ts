import { getSupabaseServiceClient } from "@ai-assistants/control-db";

export function controlDb() {
  return getSupabaseServiceClient();
}
