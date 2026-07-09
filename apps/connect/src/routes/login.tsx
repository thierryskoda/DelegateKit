import { createFileRoute } from "@tanstack/react-router";
import { PublicOnlyRoute } from "../features/auth/auth-gate";
import { LoginPage } from "../features/auth/login.page";

export const Route = createFileRoute("/login")({
  component: () => (
    <PublicOnlyRoute>
      <LoginPage />
    </PublicOnlyRoute>
  ),
});
