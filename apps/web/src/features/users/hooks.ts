import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toastError, toastSuccess } from "@/features/notifications/store";
import type {
  AdminUser,
  Role,
  UpdateUserRequest,
  UsersListResponse,
} from "./types";

interface ListFilter {
  q?: string;
  auth_source?: string;
  status?: string;
  role?: string;
  page?: number;
  limit?: number;
}

export function useUsers(filter: ListFilter = {}) {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.auth_source) params.set("auth_source", filter.auth_source);
  if (filter.status) params.set("status", filter.status);
  if (filter.role) params.set("role", filter.role);
  if (filter.page) params.set("page", String(filter.page));
  if (filter.limit) params.set("limit", String(filter.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: ["users", filter],
    queryFn: () => api<UsersListResponse>(`/api/v1/users${qs ? `?${qs}` : ""}`),
    staleTime: 5000,
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateUserRequest }) =>
      api<AdminUser>(`/api/v1/users/${vars.id}`, {
        method: "PATCH",
        body: vars.patch,
      }),
    onSuccess: (u) => {
      toastSuccess("User updated", u.display_name);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => {
      toastError(
        "Update failed",
        (err as { message?: string })?.message ?? "Unknown error",
      );
    },
  });
}

export function useApproveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; role: Role }) =>
      api<AdminUser>(`/api/v1/users/${vars.id}/approve`, {
        method: "PATCH",
        body: { role: vars.role },
      }),
    onSuccess: (u) => {
      toastSuccess("User approved", `${u.display_name} · ${u.role}`);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => {
      toastError(
        "Approval failed",
        (err as { message?: string })?.message ?? "Unknown error",
      );
    },
  });
}
