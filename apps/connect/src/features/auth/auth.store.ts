import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  error: string | null;
  setLoading: () => void;
  setSession: (session: Session | null) => void;
  setError: (error: string) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  status: "loading",
  session: null,
  error: null,
  setLoading: () => set({ status: "loading", error: null }),
  setSession: (session) =>
    set({ status: session ? "authenticated" : "anonymous", session, error: null }),
  setError: (error) => set({ status: "anonymous", session: null, error }),
  clearSession: () => set({ status: "anonymous", session: null, error: null }),
}));
