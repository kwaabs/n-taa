import { useEffect, useMemo, useState } from "react";
import { Funnel, Loader2, Trash2 } from "lucide-react";
import { useLayers } from "@/features/layers/hooks";
import { useLayersStore } from "@/features/layers/store";
import { useLayerSchema } from "./hooks";
import { useFiltersStore } from "./store";
import { FilterGroup } from "./FilterGroup";
import { emptyGroup, hasAnyCondition } from "./types";
import type { Filter } from "./types";

function countConditions(f: Filter | undefined | null): number {
  if (!f) return 0;
  if (f.column) return 1;
  return (f.conditions ?? []).reduce((s, c) => s + countConditions(c), 0);
}

export function FilterPanel() {
  const { data: allLayers = [] } = useLayers();
  const visibleIds = useLayersStore((s) => s.visibleIds);
  const filtersByLayer = useFiltersStore((s) => s.byLayer);
  const setFilter = useFiltersStore((s) => s.set);
  const clearFilter = useFiltersStore((s) => s.clear);

  // Prefer visible layers first, but show all for pickability
  const orderedLayers = useMemo(
    () =>
      [...allLayers].sort((a, b) => {
        const av = visibleIds.has(a.id) ? 0 : 1;
        const bv = visibleIds.has(b.id) ? 0 : 1;
        if (av !== bv) return av - bv;
        return a.display_name.localeCompare(b.display_name);
      }),
    [allLayers, visibleIds],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first visible layer if nothing chosen
  // Auto-select first visible layer if nothing chosen
  useEffect(() => {
    if (selectedId) return;
    const firstVisible = orderedLayers.find((l) => visibleIds.has(l.id));
    if (firstVisible) setSelectedId(firstVisible.id);
  }, [orderedLayers, visibleIds, selectedId]);

  // NEW: whenever the selected layer changes, ensure an empty root exists
  useEffect(() => {
    if (!selectedId) return;
    const existing = filtersByLayer[selectedId];
    if (!existing) {
      setFilter(selectedId, emptyGroup("and"));
    }
  }, [selectedId, filtersByLayer, setFilter]);

  const currentLayer = orderedLayers.find((l) => l.id === selectedId) ?? null;
  const {
    data: schema,
    isLoading: schemaLoading,
    isError,
  } = useLayerSchema(selectedId);

  const filter = selectedId ? filtersByLayer[selectedId] : undefined;

  const updateFilter = (next: Filter) => {
    if (!selectedId) return;
    setFilter(selectedId, next);
  };

  const ensureRoot = () => {
    if (!filter) updateFilter(emptyGroup("and"));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Layer picker */}
      <div className="border-b border-slate-100 p-2">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Layer
        </label>
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-emerald-500"
        >
          <option value="">— select a layer —</option>
          {orderedLayers.map((l) => {
            const active = hasAnyCondition(filtersByLayer[l.id]);
            const visible = visibleIds.has(l.id);
            return (
              <option key={l.id} value={l.id}>
                {visible ? "● " : "○ "}
                {l.display_name}
                {active ? "  ⦿" : ""}
              </option>
            );
          })}
        </select>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2 text-sm">
        {!selectedId && (
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
            Pick a layer to build a filter.
          </div>
        )}

        {selectedId && schemaLoading && (
          <div className="flex items-center gap-2 px-2 py-6 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading fields…
          </div>
        )}

        {selectedId && isError && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            Failed to load fields for this layer.
          </div>
        )}

        {selectedId && schema && !filter && (
          <div className="rounded-md border border-dashed border-slate-200 p-3 text-center">
            <Funnel className="mx-auto mb-1 h-4 w-4 text-slate-400" />
            <div className="text-xs text-slate-500">No filter yet.</div>
            <button
              onClick={ensureRoot}
              className="mt-2 rounded-md bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-700"
            >
              + Start filtering
            </button>
          </div>
        )}

        {selectedId && schema && filter && (
          <FilterGroup
            fields={schema.filter(
              (f) =>
                f.name !== currentLayer?.id_column &&
                f.name !== currentLayer?.geometry_column,
            )}
            node={filter}
            onChange={updateFilter}
          />
        )}
      </div>

      {/* Status bar */}
      {selectedId && (
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
          <div>
            <span className="font-semibold">{countConditions(filter)}</span>{" "}
            condition{countConditions(filter) === 1 ? "" : "s"}
          </div>
          {filter && (
            <button
              onClick={() => selectedId && clearFilter(selectedId)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              title="Clear filter for this layer"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
