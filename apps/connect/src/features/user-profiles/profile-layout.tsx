import { Link } from "@tanstack/react-router";
import { CheckSquare, PlugZap, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../shared/lib/cx";
import { ErrorState } from "../../shared/ui/page-state";
import { useProfilesQuery } from "./profiles.queries";

export type AssistantSection = "integrations" | "approvals" | "profile";

const active =
  "motion-action relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary-solid px-4 py-2.5 text-sm font-medium text-primary-solid shadow-sm";
const inactive =
  "motion-action relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-secondary hover:bg-surface-secondary hover:text-default";

const navItems = [
  {
    section: "approvals",
    label: "Approvals",
    icon: CheckSquare,
    to: "/assistants/$profileId/approvals",
  },
  {
    section: "integrations",
    label: "Integrations",
    icon: PlugZap,
    to: "/assistants/$profileId/integrations",
  },
  {
    section: "profile",
    label: "Profile",
    icon: UserRound,
    to: "/assistants/$profileId/profile",
  },
] as const satisfies ReadonlyArray<{
  icon: typeof CheckSquare;
  label: string;
  section: AssistantSection;
  to:
    | "/assistants/$profileId/approvals"
    | "/assistants/$profileId/integrations"
    | "/assistants/$profileId/profile";
}>;

function AssistantNav({
  profileId,
  className,
  iconsOnly = false,
}: {
  profileId: string;
  className?: string;
  iconsOnly?: boolean;
}) {
  return (
    <nav
      className={cx(
        "relative grid grid-cols-3 gap-1 rounded-full bg-surface-tertiary p-1",
        className,
      )}
      aria-label="Assistant dashboard"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            activeProps={{ className: active }}
            inactiveProps={{ className: inactive }}
            aria-label={iconsOnly ? item.label : undefined}
            params={{ profileId }}
            to={item.to}
            key={item.section}
          >
            <Icon className="size-4" />
            {iconsOnly ? null : item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AssistantDashboardLayout({
  profileId,
  section,
  focused = false,
  children,
}: {
  profileId: string;
  section: AssistantSection;
  focused?: boolean;
  children: ReactNode;
}) {
  const q = useProfilesQuery();
  const profiles = q.data;
  const profileAccessError =
    q.error ??
    (profiles !== undefined && profiles.length === 0
      ? new Error("No assistant is available for the signed-in user.")
      : profiles !== undefined && !profiles.some((candidate) => candidate.id === profileId)
        ? new Error(`Assistant "${profileId}" is not available for the signed-in user.`)
        : null);

  return (
    <div className="connect-canvas min-h-svh text-default">
      {focused ? null : (
        <header className="sticky top-0 z-40 hidden border-b border-subtle bg-surface/95 backdrop-blur md:block">
          <div className="mx-auto grid w-full max-w-5xl gap-3 px-6 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <AssistantNav profileId={profileId} className="hidden md:inline-grid" />
          </div>
        </header>
      )}
      <main
        className={cx(
          "motion-reveal mx-auto grid w-full content-start gap-5 px-4 py-5 md:px-6 md:pb-10",
          focused
            ? "max-w-4xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            : "max-w-5xl pb-[calc(6rem+env(safe-area-inset-bottom))]",
        )}
        aria-labelledby={`${section}-title`}
      >
        {profileAccessError ? <ErrorState error={profileAccessError} /> : children}
      </main>
      {focused ? null : (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-subtle bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
          <div className="mx-auto max-w-md">
            <AssistantNav profileId={profileId} iconsOnly />
          </div>
        </div>
      )}
    </div>
  );
}
