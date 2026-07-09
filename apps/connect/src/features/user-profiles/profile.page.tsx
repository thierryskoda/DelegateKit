import { LogOut, UserRound } from "lucide-react";
import { Button } from "../../shared/ui/button";
import { PageHeader, Panel } from "../../shared/ui/panel";
import { useAuthStore } from "../auth/auth.store";
import { signOut } from "../auth/auth.service";
import { useProfilesQuery } from "./profiles.queries";

export function ProfilePage({ profileId }: { profileId: string }) {
  const profilesQuery = useProfilesQuery();
  const session = useAuthStore((state) => state.session);
  const profile = profilesQuery.data?.find((candidate) => candidate.id === profileId);
  const signedInAs = session?.user.email ?? session?.user.phone ?? "Signed in";

  return (
    <section className="grid gap-4">
      <PageHeader
        description="See which assistant you're using and who's signed in."
        title="Profile"
      />
      {profilesQuery.isPending || !profile ? null : (
      <Panel>
        <div className="grid gap-5">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-tertiary text-secondary">
              <UserRound className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-normal text-tertiary">
                Assistant
              </p>
              <h2 className="mt-0.5 break-words heading-md text-default">
                {profile.display_name}
              </h2>
              <p className="mt-2 break-words text-sm text-secondary">{signedInAs}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-subtle pt-4">
            <Button variant="secondary" onClick={() => void signOut()}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </Panel>
      )}
    </section>
  );
}
