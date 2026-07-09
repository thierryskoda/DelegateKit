import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import {
  AssistantDashboardLayout,
  type AssistantSection,
} from "../features/user-profiles/profile-layout";
import { profilesQueryOptions } from "../features/user-profiles/profiles.queries";

function sectionFromPathname(pathname: string): AssistantSection {
  if (pathname.includes("/browser-handoff/")) return "integrations";
  if (pathname.endsWith("/integrations")) return "integrations";
  if (pathname.endsWith("/profile")) return "profile";
  return "approvals";
}

function RouteComponent() {
  const { profileId } = Route.useParams();
  const locationState = useLocation({
    select: (location) => ({
      focused: location.pathname.includes("/browser-handoff/"),
      section: sectionFromPathname(location.pathname),
    }),
  });

  return (
    <AssistantDashboardLayout
      profileId={profileId}
      section={locationState.section}
      focused={locationState.focused}
    >
      <Outlet />
    </AssistantDashboardLayout>
  );
}

export const Route = createFileRoute("/assistants/$profileId")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(profilesQueryOptions());
  },
  component: RouteComponent,
});
