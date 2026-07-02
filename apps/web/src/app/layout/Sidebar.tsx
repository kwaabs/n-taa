import {
  Layers,
  Search,
  // Wrench,      // ← COMMENTED OUT — not in use
  // Settings,    // ← COMMENTED OUT — not in use
  Loader2,
  Lock,
} from "lucide-react";
import { useLayoutStore } from "./store/layoutStore";
import { useLayers } from "@/features/layers/hooks";
import { useLayersStore } from "@/features/layers/store";
import { LayerSwatch } from "@/features/layers/LayerSwatch";
import { SearchPanel } from "@/features/search/SearchPanel";
import { useSearchStore } from "@/features/search/store";
import { ExportButton } from "@/features/spatial/ExportButton";
import { ZoomToLayerButton } from "@/features/layers/ZoomToLayerButton";
import type { SidebarItem } from "./types";

const ITEMS: SidebarItem[] = [
  { id: "layers", label: "Layers", icon: Layers },
  { id: "search", label: "Search", icon: Search },
  // { id: "tools",    label: "Tools",    icon: Wrench   },   // TODO: enable when ready
  // { id: "settings", label: "Settings", icon: Settings },   // TODO: enable when ready
];

export function Sidebar() {
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const activeSection = useLayoutStore((s) => s.activeSection);
  const setActiveSection = useLayoutStore((s) => s.setActiveSection);
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen);

  const searchBadge = useSearchStore((s) => {
    const runnable = Object.values(s.drafts).filter(
      (f) => f && (f.column || (f.conditions?.length ?? 0) > 0),
    ).length;
    const hasResults = s.results.length > 0 ? 1 : 0;
    return runnable + hasResults;
  });

  const handleSelect = (id: SidebarItem["id"]) => {
    if (activeSection === id && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActiveSection(id as typeof activeSection);
      setSidebarOpen(true);
    }
  };

  return (
    <div className="flex h-full">
      {/* Icon rail — visible slate strip */}
      <nav className="flex w-12 flex-col items-center gap-1 border-r border-slate-300 bg-slate-200 py-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id && sidebarOpen;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={[
                "relative flex h-9 w-9 items-center justify-center rounded-md transition",
                active
                  ? "bg-emerald-600 text-white shadow-md"
                  : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm",
              ].join(" ")}
              title={item.label}
              aria-label={item.label}
            >
              <Icon className="h-5 w-5" />
              {item.id === "search" && searchBadge > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-600 px-1 text-[9px] font-semibold text-white ring-2 ring-slate-200">
                  {searchBadge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Content panel — clean white for reading */}
      {sidebarOpen && (
        <aside className="w-72 border-r border-slate-200 bg-white shadow-sm">
          <SidebarPanel />
        </aside>
      )}
    </div>
  );
}

function SidebarPanel() {
  const activeSection = useLayoutStore((s) => s.activeSection);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {activeSection}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-sm text-slate-600">
        {activeSection === "layers" && <LayersSection />}
        {activeSection === "search" && <SearchPanel />}
        {/* {activeSection === "tools"    && <ToolsSection />} */}
        {/* {activeSection === "settings" && <SettingsSection />} */}
      </div>
    </div>
  );
}

function LayersSection() {
  const { data, isLoading, isError } = useLayers();
  const visibleIds = useLayersStore((s) => s.visibleIds);
  const toggle = useLayersStore((s) => s.toggle);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-4 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading layers…
      </div>
    );
  }
  if (isError || !data) {
    return <div className="px-2 py-4 text-red-600">Failed to load layers</div>;
  }

  return (
    <ul className="space-y-0.5">
      {data.map((layer) => {
        const on = visibleIds.has(layer.id);
        return (
          <li key={layer.id} className="group">
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(layer.id)}
                className="h-4 w-4 accent-emerald-600"
              />
              <LayerSwatch layer={layer} />
              <span className="flex-1 truncate">{layer.display_name}</span>

              {on && (
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <ZoomToLayerButton layer={layer} />
                  <ExportButton
                    endpoint={`/api/v1/layers/${layer.id}/export`}
                    body={{}}
                    filenameBase={layer.name}
                    label=""
                    confirmBeforeDownload
                  />
                </div>
              )}

              {!layer.editable && (
                <Lock
                  className="h-3 w-3 shrink-0 text-slate-400"
                  aria-label="Read-only layer"
                />
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

// TODO: enable when Tools section is ready
// function ToolsSection() {
//   return (
//     <ul className="space-y-1 px-2">
//       <li className="rounded px-2 py-1.5 hover:bg-slate-100">Measure distance</li>
//       <li className="rounded px-2 py-1.5 hover:bg-slate-100">Measure area</li>
//       <li className="rounded px-2 py-1.5 hover:bg-slate-100">Draw feature</li>
//     </ul>
//   );
// }

// TODO: enable when Settings section is ready
// function SettingsSection() {
//   return <p className="px-2 text-slate-500">Settings will live here.</p>;
// }
