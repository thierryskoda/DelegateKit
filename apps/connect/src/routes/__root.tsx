import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Navigate, Outlet } from "@tanstack/react-router";
import { useAuthStore } from "../features/auth/auth.store";
import { authLandingDestination } from "../features/auth/auth-routing.service";
import { ErrorState, LoadingState } from "../shared/ui/page-state";

type RouterContext = {
  queryClient: QueryClient;
};

function RootError({ error }: { error: unknown }) {
  return (
    <main className="connect-canvas grid min-h-svh place-items-center p-4">
      <div className="w-full max-w-2xl">
        <ErrorState error={error} />
      </div>
    </main>
  );
}

function RootNotFound() {
  const status = useAuthStore((state) => state.status);
  const session = useAuthStore((state) => state.session);
  const destination = authLandingDestination(status, Boolean(session));
  if (!destination) {
    return (
      <main className="connect-canvas grid min-h-svh place-items-center p-4">
        <div className="w-full max-w-xl">
          <LoadingState label="Checking your session" />
        </div>
      </main>
    );
  }
  return <Navigate to={destination} replace />;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
});
