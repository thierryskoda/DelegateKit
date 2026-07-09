import { createFileRoute } from "@tanstack/react-router";
import { ApprovalsPage } from "../features/approvals/approvals.page";

function RouteComponent() {
  const { profileId } = Route.useParams();
  return <ApprovalsPage profileId={profileId} />;
}

export const Route = createFileRoute("/assistants/$profileId/approvals")({
  component: RouteComponent,
});
