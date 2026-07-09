import {
  connectPublicConfigSchema,
  type ConnectPublicConfig,
} from "@ai-assistants/connect-api-contracts/public-config";
import { parseConnectWebEnv } from "@ai-assistants/workspace-shared/env";

export function buildConnectPublicConfig(input: {
  env?: NodeJS.ProcessEnv;
} = {}): ConnectPublicConfig {
  const env = parseConnectWebEnv(input.env);
  const raw = {
    backendUrl: env.backendPublicUrl,
    supabaseUrl: env.supabasePublicUrl,
    supabaseAnonKey: env.supabaseAnonKey,
  } satisfies Record<keyof ConnectPublicConfig, string | undefined>;

  return connectPublicConfigSchema.parse(raw);
}
