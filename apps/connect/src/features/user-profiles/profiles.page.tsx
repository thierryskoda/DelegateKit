import { Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, LogOut } from "lucide-react";
import { signOut } from "../auth/auth.service";
import { Button } from "../../shared/ui/button";
import { EmptyState, ErrorState } from "../../shared/ui/page-state";
import { useProfilesQuery } from "./profiles.queries";

export function ProfilesPage() {
  const q = useProfilesQuery();
  if (q.isPending) return null;
  if (q.error)
    return (
      <main className="connect-canvas grid min-h-svh place-items-center p-4">
        <ErrorState error={q.error} />
      </main>
    );
  const profiles = q.data ?? [];
  if (profiles.length === 1) {
    return (
      <Navigate
        to="/assistants/$profileId/approvals"
        params={{ profileId: profiles[0].id }}
        replace
      />
    );
  }

  return (
    <main className="connect-canvas min-h-svh px-4 py-5 text-default md:px-6 md:py-8">
      <div className="mx-auto grid max-w-3xl gap-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-tertiary">Connect</p>
            <h1 className="mt-1 heading-lg">Choose assistant</h1>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Open the assistant dashboard you want to review.
            </p>
          </div>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" />
          </Button>
        </header>
        {profiles.length === 0 ? (
          <EmptyState title="No assistant dashboard is available.">
            This sign-in does not have an assistant dashboard yet.
          </EmptyState>
        ) : (
          <div className="motion-state grid gap-3">
            {profiles.map((profile) => (
              <Link
                className="motion-surface group rounded-2xl border border-default bg-surface p-5 sm:p-6 shadow-sm hover:border-strong"
                params={{ profileId: profile.id }}
                to="/assistants/$profileId/approvals"
                key={profile.id}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="break-words heading-sm">{profile.display_name}</h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ArrowRight className="motion-icon-nudge size-4 text-tertiary group-hover:text-default" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
