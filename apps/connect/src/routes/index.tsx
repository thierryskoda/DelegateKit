import { createFileRoute, Navigate } from "@tanstack/react-router";
import { LoadingState } from "../shared/ui/page-state";
import { authLandingDestination } from "../features/auth/auth-routing.service";
import { useAuthStore } from "../features/auth/auth.store";

function IndexRoute() {
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

export const Route = createFileRoute("/")({
  component: IndexRoute,
});
