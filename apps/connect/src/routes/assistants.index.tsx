import { createFileRoute } from "@tanstack/react-router";
import { ProfilesPage } from "../features/user-profiles/profiles.page";
import { profilesQueryOptions } from "../features/user-profiles/profiles.queries";

export const Route = createFileRoute("/assistants/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(profilesQueryOptions());
  },
  component: ProfilesPage,
});
