import { Nango } from "@nangohq/node";
import { backendApiEnv } from "../../shared/env";

const NANGO_CLOUD_API_URL = "https://api.nango.dev";
const NANGO_CLOUD_CONNECT_UI_URL = "https://connect.nango.dev";

/** Public API base URL used by browser clients (Connect app + Nango Frontend SDK). */
export function nangoPublicApiUrl(): string {
  return NANGO_CLOUD_API_URL;
}

/** Base URL for the hosted Connect UI iframe (Nango Cloud). */
export function nangoPublicConnectUiBaseUrl(): string {
  return NANGO_CLOUD_CONNECT_UI_URL;
}

export function createNangoAdminClient(): Nango {
  const env = backendApiEnv();
  return new Nango({
    secretKey: env.nangoSecretKey,
    ...(env.nangoHost ? { host: env.nangoHost } : {}),
  });
}
