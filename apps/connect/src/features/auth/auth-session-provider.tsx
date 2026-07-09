import { useEffect, type ReactNode } from "react";
import { router } from "../../app/router";
import { queryClient } from "../../app/query-client";
import { clearConnectCache, prefetchConnectPortalData } from "../../app/connect-query-cache";
import { loadInitialSession, subscribeToAuthChanges } from "./auth.service";
import { useAuthStore } from "./auth.store";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const setError = useAuthStore((state) => state.setError);

  useEffect(() => {
    let mounted = true;
    const unsubscribeStore = useAuthStore.subscribe((state, previous) => {
      if (
        state.status === previous.status &&
        state.session?.access_token === previous.session?.access_token
      )
        return;
      if (!state.session) {
        clearConnectCache(queryClient);
        return;
      }
      const isNewUserSession =
        !previous.session || state.session.user.id !== previous.session.user.id;
      if (isNewUserSession) {
        void prefetchConnectPortalData(queryClient);
      }
    });
    void loadInitialSession()
      .then((destination) => {
        if (!mounted || !destination) return;
        void router.navigate({ href: destination, replace: true });
      })
      .catch((error) => {
        if (!mounted) return;
        setError(error instanceof Error ? error.message : String(error));
      });
    const unsubscribe = subscribeToAuthChanges();
    return () => {
      mounted = false;
      unsubscribeStore();
      unsubscribe();
    };
  }, [setError]);

  return children;
}
