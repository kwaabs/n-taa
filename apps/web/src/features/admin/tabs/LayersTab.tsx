import { useMemo, useState } from "react";
import { Loader2, Search, Shield, Download } from "lucide-react";
import { useLayers } from "@/features/layers/hooks";
import { useUpdateLayerPermissions } from "../hooks";
import type { Layer, LayerPermissions } from "@/features/layers/types";

type Role = "superuser" | "editor" | "viewer";
type Action = "view" | "export";

const ROLES: Role[] = ["editor", "viewer"];

export function LayersTab() {
  const [q, setQ] = useState("");
  const { data: layers = [], isLoading, isError } = useLayers();

  const filtered = useMemo(() => {
    if (!q.trim()) return layers;
    const needle = q.toLowerCase();
    return layers.filter(
      (l) =>
        l.display_name.toLowerCase().includes(needle) ||
        l.name.toLowerCase().includes(needle),
    );
  }, [layers, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-slate-700">
          <span className="font-medium">{layers.length}</span> layers ·
          superusers always have full access
        </div>

        <div className="relative ml-auto flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search layers…"
            className="w-full rounded-md border border-slate-200 bg-white pl-7 pr-2 py-1.5 text-sm outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading layers…
        </div>
      )}

      {isError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Failed to load layers.
        </div>
      )}

      {!isLoading && !isError && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Layer</th>
                <th className="px-3 py-2 font-medium">
                  <div className="inline-flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    View access
                  </div>
                </th>
                <th className="px-3 py-2 font-medium">
                  <div className="inline-flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    Export access
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((layer) => (
                <LayerRow key={layer.id} layer={layer} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-8 text-center text-sm text-slate-400"
                  >
                    No layers match your search.
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

function LayerRow({ layer }: { layer: Layer }) {
  const updatePerms = useUpdateLayerPermissions();

  const currentPerms: LayerPermissions = layer.permissions ?? {
    view_roles: ["superuser", "editor", "viewer"],
    export_roles: ["superuser", "editor", "viewer"],
  };

  const toggle = (action: Action, role: Role) => {
    const isView = action === "view";
    const currentList = isView
      ? currentPerms.view_roles
      : currentPerms.export_roles;

    const roles = new Set(currentList);
    if (roles.has(role)) {
      roles.delete(role);
    } else {
      roles.add(role);
    }
    // Superuser always included
    roles.add("superuser");

    const newList = Array.from(roles);

    const nextPerms: LayerPermissions = {
      view_roles: isView ? newList : currentPerms.view_roles,
      export_roles: isView ? currentPerms.export_roles : newList,
    };

    updatePerms.mutate({ layerId: layer.id, perms: nextPerms });
  };

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-800">
            {layer.display_name}
          </div>
          <div className="truncate text-xs text-slate-500">{layer.name}</div>
        </div>
      </td>

      <td className="px-3 py-2">
        <div className="flex gap-1.5">
          {ROLES.map((role) => (
            <RoleCheckbox
              key={role}
              role={role}
              checked={currentPerms.view_roles.includes(role)}
              disabled={updatePerms.isPending}
              onChange={() => toggle("view", role)}
            />
          ))}
        </div>
      </td>

      <td className="px-3 py-2">
        <div className="flex gap-1.5">
          {ROLES.map((role) => (
            <RoleCheckbox
              key={role}
              role={role}
              checked={currentPerms.export_roles.includes(role)}
              disabled={updatePerms.isPending}
              onChange={() => toggle("export", role)}
            />
          ))}
        </div>
      </td>
    </tr>
  );
}

function RoleCheckbox({
  role,
  checked,
  disabled,
  onChange,
}: {
  role: Role;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={[
        "inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs transition",
        checked
          ? role === "editor"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-slate-100 text-slate-700"
          : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="h-3 w-3 accent-emerald-600"
      />
      {role}
    </label>
  );
}
