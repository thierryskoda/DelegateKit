import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LoadingState } from "../../shared/ui/page-state";
import { useAuthStore } from "./auth.store";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const session = useAuthStore((state) => state.session);

  if (status === "loading") {
    return (
      <main className="connect-canvas grid min-h-svh place-items-center p-4">
        <div className="w-full max-w-xl">
          <LoadingState label="Checking your session" />
        </div>
      </main>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const session = useAuthStore((state) => state.session);

  if (status === "loading") {
    return (
      <main className="connect-canvas grid min-h-svh place-items-center p-4">
        <div className="w-full max-w-xl">
          <LoadingState label="Checking your session" />
        </div>
      </main>
    );
  }

  if (session) return <Navigate to="/assistants" replace />;
  return children;
}
