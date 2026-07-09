import { Hono } from "hono";
import { cors } from "hono/cors";
import { httpErrorHandler } from "./middleware/http-error-handler";
import { requestDiagnosticsMiddleware } from "./middleware/request-diagnostics";
import { registerHealthAndPublicContractRoutes } from "./routes/health";
import { registerChannelRoutes } from "./routes/channels";
import { registerInternalAgentContextRoutes } from "./routes/internal-agent-context";
import { registerInternalAgentEventRoutes } from "./routes/internal-agent-events";
import { registerInternalArtifactRoutes } from "./routes/internal-artifacts";
import { registerInternalChannelMessageRoutes } from "./routes/internal-channel-messages";
import { registerInternalLearningReviewRoutes } from "./routes/internal-learning-reviews";
import { registerInternalRuntimeGuidanceRoutes } from "./routes/internal-runtime-guidance";
import { registerInternalToolRoutes } from "./routes/internal-tools";
import { registerPortalActionRoutes } from "./routes/portal-actions";
import { registerPortalBrowserHandoffRoutes } from "./routes/portal-browser-handoffs";
import { registerPortalCapabilityRoutes } from "./routes/portal-capabilities";
import { registerPortalConnectedAccountRoutes } from "./routes/portal-connected-accounts";
import { registerPortalProfileRoutes } from "./routes/portal-profiles";
import { registerPortalProposalRoutes } from "./routes/portal-proposals";
import { registerPortalLearningRecommendationRoutes } from "./routes/portal-learning-recommendations";
import { registerTelegramMiniAppRoutes } from "./routes/telegram-mini-app";
import { registerNangoWebhookRoutes } from "./routes/webhooks-nango";
import { registerBoldSignWebhookRoutes } from "./routes/webhooks-boldsign";
import { registerMondayWebhookRoutes } from "./routes/webhooks-monday";
import { registerOutlookMailWebhookRoutes } from "./routes/webhooks-outlook-mail";
import { registerGoogleCalendarWebhookRoutes } from "./routes/webhooks-google-calendar";
import { registerGoogleDriveWebhookRoutes } from "./routes/webhooks-google-drive";
import { registerOutlookCalendarWebhookRoutes } from "./routes/webhooks-outlook-calendar";
import { registerMicrosoftOnedriveWebhookRoutes } from "./routes/webhooks-microsoft-onedrive";
import { registerMicrosoftSharepointWebhookRoutes } from "./routes/webhooks-microsoft-sharepoint";
import { registerTwilioWebhookRoutes } from "./routes/webhooks-twilio";
import { registerProviderSandboxOperationFixtures } from "../capabilities/registry/register-provider-sandbox-operation-fixtures";
import { registerAppsSdkMcpRoutes } from "../apps-sdk/mcp-app";

const app = new Hono();

registerProviderSandboxOperationFixtures();

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "x-ai-assistants-machine-token",
      "x-boldsign-event",
      "x-boldsign-signature",
      "x-goog-channel-id",
      "x-goog-channel-token",
      "x-goog-message-number",
      "x-goog-resource-id",
      "x-goog-resource-state",
      "x-nango-hmac-sha256",
      "x-telegram-bot-api-secret-token",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.use("*", requestDiagnosticsMiddleware);
app.onError(httpErrorHandler);

registerHealthAndPublicContractRoutes(app);
registerChannelRoutes(app);
registerAppsSdkMcpRoutes(app);
registerPortalProfileRoutes(app);
registerPortalCapabilityRoutes(app);
registerPortalConnectedAccountRoutes(app);
registerTelegramMiniAppRoutes(app);
registerNangoWebhookRoutes(app);
registerBoldSignWebhookRoutes(app);
registerMondayWebhookRoutes(app);
registerOutlookMailWebhookRoutes(app);
registerGoogleCalendarWebhookRoutes(app);
registerGoogleDriveWebhookRoutes(app);
registerOutlookCalendarWebhookRoutes(app);
registerMicrosoftOnedriveWebhookRoutes(app);
registerMicrosoftSharepointWebhookRoutes(app);
registerTwilioWebhookRoutes(app);
registerPortalActionRoutes(app);
registerPortalBrowserHandoffRoutes(app);
registerPortalProposalRoutes(app);
registerPortalLearningRecommendationRoutes(app);
registerInternalToolRoutes(app);
registerInternalArtifactRoutes(app);
registerInternalAgentContextRoutes(app);
registerInternalAgentEventRoutes(app);
registerInternalRuntimeGuidanceRoutes(app);
registerInternalChannelMessageRoutes(app);
registerInternalLearningReviewRoutes(app);

export { app };
