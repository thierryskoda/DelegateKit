import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "../features/integrations/integrations.page";

function RouteComponent() {
  const { profileId } = Route.useParams();
  return <IntegrationsPage profileId={profileId} />;
}

export const Route = createFileRoute("/assistants/$profileId/integrations")({
  component: RouteComponent,
});
