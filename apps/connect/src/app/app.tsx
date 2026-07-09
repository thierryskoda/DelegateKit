import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AuthSessionProvider } from "../features/auth/auth-session-provider";
import { ConnectNotice } from "../shared/ui/connect-notice";
import { queryClient } from "./query-client";
import { router } from "./router";

export function ConnectApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider>
        <RouterProvider router={router} />
        <ConnectNotice />
      </AuthSessionProvider>
    </QueryClientProvider>
  );
}
