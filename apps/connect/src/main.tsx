import "./styles.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { ConnectApp } from "./app/app";
import { FatalConfigPage } from "./app/fatal-config.page";
import {
  configureAuthService,
  logoutDueToUnauthorized,
  requireAccessToken,
} from "./features/auth/auth.service";
import {
  configureBackendAccessTokenProvider,
  configureUnauthorizedHandler,
} from "./shared/api/backend-api";
import { configureConnectConfig, loadConnectConfig } from "./shared/api/config";

async function bootstrap() {
  const config = await loadConnectConfig();
  configureConnectConfig(config);
  configureAuthService(config);
  configureBackendAccessTokenProvider(requireAccessToken);
  configureUnauthorizedHandler(logoutDueToUnauthorized);
  return <ConnectApp />;
}

const root = createRoot(document.getElementById("root") as HTMLElement);

bootstrap()
  .then((app) => {
    root.render(<React.StrictMode>{app}</React.StrictMode>);
  })
  .catch((error: unknown) => {
    root.render(<FatalConfigPage error={error} />);
  });
