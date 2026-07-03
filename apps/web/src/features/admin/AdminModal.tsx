import { useEffect } from "react";
import { X, Users, Layers as LayersIcon, ClipboardList } from "lucide-react";
import { useAdminStore, type AdminTab } from "./store";
import { UsersTab } from "./tabs/UsersTab";
import { LayersTab } from "./tabs/LayersTab";
import { AuditTabPlaceholder } from "./tabs/AuditTabPlaceholder";

interface TabDef {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { id: "users", label: "Users", icon: Users },
  { id: "layers", label: "Layers", icon: LayersIcon },
  { id: "audit", label: "Audit", icon: ClipboardList },
];

export function AdminModal() {
  const open = useAdminStore((s) => s.open);
  const activeTab = useAdminStore((s) => s.activeTab);
  const setTab = useAdminStore((s) => s.setTab);
  const closeModal = useAdminStore((s) => s.closeModal);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeModal]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-full max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar within the modal */}
        <aside className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Admin
          </div>

          <nav className="space-y-0.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={[
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition",
                  activeTab === id
                    ? "bg-emerald-100 text-emerald-800"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Right pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800">
                {TABS.find((t) => t.id === activeTab)?.label}
              </h2>
            </div>
            <button
              onClick={closeModal}
              className="rounded p-1.5 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-slate-600" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {activeTab === "users" && <UsersTab />}
            {activeTab === "layers" && <LayersTab />}
            {activeTab === "audit" && <AuditTabPlaceholder />}
          </div>
        </div>
      </div>
    </div>
  );
}
