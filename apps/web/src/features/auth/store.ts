import { create } from "zustand";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  status: "loading" | "anonymous" | "authenticated";
  setUser: (u: User | null) => void;
  setStatus: (s: AuthState["status"]) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",
  setUser: (u) => set({ user: u }),
  setStatus: (s) => set({ status: s }),
}));
