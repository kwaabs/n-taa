import { useState } from "react";
import {
  Loader2,
  ShieldCheck,
  Cloud,
  Lock,
  CheckCircle2,
  Search,
} from "lucide-react";
import {
  useUsers,
  useUpdateUser,
  useApproveUser,
} from "@/features/users/hooks";
import type { AdminUser, Role } from "@/features/users/types";
import { useAuthStore } from "@/features/auth/store";

export function UsersTab() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const { data, isLoading, isError } = useUsers({
    q,
    status: statusFilter,
    auth_source: sourceFilter,
    role: roleFilter,
    limit: 200,
  });

  const currentUser = useAuthStore((s) => s.user);
  const users = data?.users ?? [];
  const pendingCount = users.filter((u) => u.pending).length;

  return (
    <div className="space-y-4">
      {/* Summary + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">
            {data?.total.toLocaleString() ?? 0} users
          </span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {pendingCount} pending approval
            </span>
          )}
        </div>

        <div className="relative ml-auto flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or name…"
            className="w-full rounded-md border border-slate-200 bg-white pl-7 pr-2 py-1.5 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
        >
          <option value="">All sources</option>
          <option value="azure">Azure AD</option>
          <option value="local">Local</option>
        </select>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
        >
          <option value="">All roles</option>
          <option value="superuser">Superuser</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading users…
        </div>
      )}

      {isError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Failed to load users.
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last login</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={currentUser?.id === u.id}
                />
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-slate-400"
                  >
                    No users match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<Role>(user.role);

  const updateUser = useUpdateUser();
  const approveUser = useApproveUser();

  const disabled = user.is_break_glass;

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
            {user.display_name
              .split(/\s+/)
              .slice(0, 2)
              .map((s) => s[0]?.toUpperCase() ?? "")
              .join("")}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-slate-800">
              <span className="truncate">{user.display_name}</span>
              {user.is_break_glass && (
                <span
                  title="Break-glass — env-managed"
                  className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500"
                >
                  <Lock className="h-2.5 w-2.5" />
                  Break-glass
                </span>
              )}
              {isSelf && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700">
                  You
                </span>
              )}
            </div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
          </div>
        </div>
      </td>

      <td className="px-3 py-2">
        {editing ? (
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
          >
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
            <option value="superuser">superuser</option>
          </select>
        ) : (
          <span
            className={[
              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
              roleBadgeClass(user.role),
            ].join(" ")}
          >
            {user.role}
          </span>
        )}
      </td>

      <td className="px-3 py-2">
        <span
          className={[
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
            user.auth_source === "azure"
              ? "bg-cyan-50 text-cyan-700"
              : "bg-slate-100 text-slate-600",
          ].join(" ")}
        >
          {user.auth_source === "azure" ? (
            <Cloud className="h-3 w-3" />
          ) : (
            <ShieldCheck className="h-3 w-3" />
          )}
          {user.auth_source}
        </span>
      </td>

      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          <span
            className={[
              "rounded-full px-2 py-0.5 text-xs",
              user.status === "active"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500",
            ].join(" ")}
          >
            {user.status}
          </span>
          {user.pending && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              Pending
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-2 text-xs text-slate-500">
        {user.last_login_at
          ? new Date(user.last_login_at).toLocaleDateString()
          : "—"}
      </td>

      <td className="px-3 py-2 text-right">
        <div className="flex flex-wrap justify-end gap-1">
          {disabled ? (
            <span className="text-xs text-slate-400">Read-only</span>
          ) : user.pending ? (
            <>
              <button
                onClick={() =>
                  approveUser.mutate({ id: user.id, role: "viewer" })
                }
                disabled={approveUser.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3 w-3" />
                Approve viewer
              </button>
              <button
                onClick={() =>
                  approveUser.mutate({ id: user.id, role: "editor" })
                }
                disabled={approveUser.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve editor
              </button>
            </>
          ) : editing ? (
            <>
              <button
                onClick={() =>
                  updateUser.mutate(
                    { id: user.id, patch: { role } },
                    { onSuccess: () => setEditing(false) },
                  )
                }
                disabled={updateUser.isPending}
                className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setRole(user.role);
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                disabled={isSelf}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                title={isSelf ? "You cannot change your own role" : ""}
              >
                Change role
              </button>
              <button
                onClick={() =>
                  updateUser.mutate({
                    id: user.id,
                    patch: {
                      status: user.status === "active" ? "inactive" : "active",
                    },
                  })
                }
                disabled={isSelf || updateUser.isPending}
                className={[
                  "rounded-md border px-2 py-1 text-xs",
                  user.status === "active"
                    ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
                    : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
                  "disabled:opacity-40",
                ].join(" ")}
                title={isSelf ? "You cannot deactivate yourself" : ""}
              >
                {user.status === "active" ? "Deactivate" : "Reactivate"}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function roleBadgeClass(role: Role): string {
  switch (role) {
    case "superuser":
      return "bg-purple-100 text-purple-700";
    case "editor":
      return "bg-blue-100 text-blue-700";
    case "viewer":
    default:
      return "bg-slate-100 text-slate-600";
  }
}
