import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "../features/user-profiles/profile.page";
import { profilesQueryOptions } from "../features/user-profiles/profiles.queries";

function RouteComponent() {
  const { profileId } = Route.useParams();
  return <ProfilePage profileId={profileId} />;
}

export const Route = createFileRoute("/assistants/$profileId/profile")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(profilesQueryOptions());
  },
  component: RouteComponent,
});
