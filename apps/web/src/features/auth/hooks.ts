import { useMutation, useQuery } from "@tanstack/react-query";
import { api, bootRefresh, setAccessToken } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "./store";
import type { LoginResponse, User } from "./types";

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
