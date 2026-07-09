import {
  connectPublicConfigPath,
  connectPublicConfigSchema,
  type ConnectPublicConfig,
} from "@ai-assistants/connect-api-contracts/public-config";
import { formatUnknownError } from "@ai-assistants/errors";

export type ConnectConfig = ConnectPublicConfig;

class ConnectConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectConfigError";
  }
}

let activeConfig: ConnectConfig | null = null;

function parseConnectConfig(rawConfig: unknown): ConnectConfig {
  const parsed = connectPublicConfigSchema.safeParse(rawConfig);
  if (!parsed.success) throw new ConnectConfigError(formatUnknownError(parsed.error));
  return parsed.data;
}

export async function loadConnectConfig(): Promise<ConnectConfig> {
  const response = await fetch(connectPublicConfigPath, { cache: "no-store" });
  if (!response.ok) {
    throw new ConnectConfigError(`Connect public config returned HTTP ${response.status}.`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ConnectConfigError(
      `Connect public config is not valid JSON. ${formatUnknownError(error)}`,
    );
  }
  return parseConnectConfig(payload);
}

export function configureConnectConfig(config: ConnectConfig): void {
  activeConfig = config;
}

export function requireConnectConfig(): ConnectConfig {
  if (!activeConfig) throw new ConnectConfigError("Connect config was not initialized.");
  return activeConfig;
}
