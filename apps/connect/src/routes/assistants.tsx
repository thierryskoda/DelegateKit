import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ProtectedRoute } from "../features/auth/auth-gate";

function ProtectedAssistantsLayout() {
  return (
    <ProtectedRoute>
      <Outlet />
    </ProtectedRoute>
  );
}

export const Route = createFileRoute("/assistants")({
  component: ProtectedAssistantsLayout,
});
