import { createFileRoute } from "@tanstack/react-router";
import { BrowserHandoffPage } from "../features/browser-handoff/browser-handoff.page";

function RouteComponent() {
  const { profileId, handoffId } = Route.useParams();
  return <BrowserHandoffPage profileId={profileId} handoffId={handoffId} />;
}

export const Route = createFileRoute("/assistants/$profileId/browser-handoff/$handoffId")({
  component: RouteComponent,
});
