import { useMutation, useQuery } from "@tanstack/react-query";
import { api, bootRefresh, setAccessToken } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "./store";
import type { LoginResponse, User } from "./types";
import { toastSuccess, toastError } from "@/features/notifications/store";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/api/v1/auth/me"),
    retry: false,
  });
}

export function useLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const setStatus = useAuthStore((s) => s.setStatus);

  return useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      api<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: creds,
        auth: false,
      }),
    onSuccess: (res) => {
      setAccessToken(res.access_token);
      setUser(res.user);
      setStatus("authenticated");
      queryClient.setQueryData(["me"], res.user);
      toastSuccess("Welcome back", res.user.display_name);
    },
    onError: (err) => {
      toastError(
        "Sign-in failed",
        (err as { message?: string })?.message ?? "Check your credentials",
      );
    },
  });
}

export function useLogout() {
  const setUser = useAuthStore((s) => s.setUser);
  const setStatus = useAuthStore((s) => s.setStatus);

  return useMutation({
    mutationFn: () =>
      api<void>("/api/v1/auth/logout", { method: "POST", auth: false }),
    onSettled: () => {
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
      queryClient.clear();
      toastSuccess("Signed out");
    },
  });
}

// Called once at app start
export async function bootstrapAuth(): Promise<User | null> {
  const token = await bootRefresh();
  if (!token) return null;
  try {
    return await api<User>("/api/v1/auth/me");
  } catch {
    return null;
  }
}

// Add to existing imports if not there

export function useAzureLoginURL() {
  return useMutation({
    mutationFn: () =>
      api<{ login_url: string }>("/api/v1/auth/azure/login", {
        method: "GET",
        auth: false,
      }),
  });
}

export function useAzureCallback() {
  const setUser = useAuthStore((s) => s.setUser);
  const setStatus = useAuthStore((s) => s.setStatus);

  return useMutation({
    mutationFn: (vars: { code: string; state: string }) =>
      api<AzureCallbackResponse>("/api/v1/auth/azure/callback", {
        method: "POST",
        body: vars,
        auth: false,
      }),
    onSuccess: (res) => {
      if (res.pending) {
        // Don't set auth state — user is pending
        return;
      }
      if (res.access_token) {
        setAccessToken(res.access_token);
      }
      if (res.user && res.user.id && res.user.role) {
        setUser(res.user as User);
        setStatus("authenticated");
        toastSuccess("Welcome", res.user.display_name);
      }
    },
    onError: (err) => {
      toastError(
        "Sign-in failed",
        (err as { message?: string })?.message ?? "Azure sign-in failed",
      );
    },
  });
}
