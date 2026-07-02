import { useEffect, useState } from "react";
import { Loader2, Search as SearchIcon, Trash2, XCircle } from "lucide-react";
import { useLayers } from "@/features/layers/hooks";
import { useLayersStore } from "@/features/layers/store";
import { useLayerSchema, useRunSearch } from "./hooks";
import { useSearchStore, draftIsRunnable, freshDraft } from "./store";
import { FilterGroup } from "./FilterGroup";
import { hasAnyCondition } from "./types";
import { useTableStore } from "@/features/spatial/tableStore";

export function SearchPanel() {
  const { data: allLayers = [] } = useLayers();
  const visibleIds = useLayersStore((s) => s.visibleIds);

  const searchableLayers = allLayers
    .filter((l) => visibleIds.has(l.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  const drafts = useSearchStore((s) => s.drafts);
  const setDraft = useSearchStore((s) => s.setDraft);
  const clearDraft = useSearchStore((s) => s.clearDraft);
  const runSearch = useRunSearch();

  const activeLayerId = useSearchStore((s) => s.activeLayerId);
  const totalCount = useSearchStore((s) => s.totalCount);
  const estimated = useSearchStore((s) => s.estimated);
  const running = useSearchStore((s) => s.running);
  const error = useSearchStore((s) => s.error);
  const results = useSearchStore((s) => s.results);
  const clearResults = useSearchStore((s) => s.clearResults);

  const showTable = useTableStore((s) => s.show);
  const closeTable = useTableStore((s) => s.close);

  const [selectedId, setSelectedId] = useState<string>("");

  const showSearchTable = useTableStore((s) => s.showSearch);

  // Keep selection valid as visible layers change
  useEffect(() => {
    if (searchableLayers.length === 0) {
      setSelectedId("");
      return;
    }
    if (!selectedId || !searchableLayers.find((l) => l.id === selectedId)) {
      setSelectedId(searchableLayers[0].id);
    }
  }, [searchableLayers, selectedId]);

  const currentLayer =
    searchableLayers.find((l) => l.id === selectedId) ?? null;
  const {
    data: schema,
    isLoading: schemaLoading,
    isError,
  } = useLayerSchema(selectedId || null);

  const draft = selectedId ? drafts[selectedId] : undefined;

  // Ensure an empty root exists when a layer is selected
  useEffect(() => {
    if (!selectedId) return;
    if (!drafts[selectedId]) setDraft(selectedId, freshDraft());
  }, [selectedId, drafts, setDraft]);

  const onSearch = () => {
    if (!selectedId || !draftIsRunnable(draft)) return;
    runSearch.mutate(
      { layerId: selectedId, query: draft! },
      {
        onSuccess: () => {
          const layer = searchableLayers.find((l) => l.id === selectedId);
          if (layer) showSearchTable(layer);
        },
      },
    );
  };

  const onClearResults = () => {
    clearResults();
    closeTable();
  };

  if (searchableLayers.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-500">
        Turn on at least one layer in <strong>Layers</strong> to search it.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Layer picker */}
      <div className="border-b border-slate-100 p-2">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Search in
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-emerald-500"
        >
          {searchableLayers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.display_name}
            </option>
          ))}
        </select>
      </div>

      {/* Query builder body */}
      <div className="flex-1 overflow-y-auto p-2 text-sm">
        {schemaLoading && (
          <div className="flex items-center gap-2 px-2 py-6 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading fields…
          </div>
        )}

        {isError && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            Failed to load fields for this layer.
          </div>
        )}

        {schema && draft && (
          <FilterGroup
            fields={schema.filter(
              (f) =>
                f.name !== currentLayer?.id_column &&
                f.name !== currentLayer?.geometry_column,
            )}
            node={draft}
            onChange={(next) => setDraft(selectedId, next)}
          />
        )}
      </div>

      {/* Action bar */}
      <div className="space-y-1.5 border-t border-slate-100 bg-slate-50 p-2">
        {error && (
          <div className="flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
            <XCircle className="h-3 w-3" />
            {error}
          </div>
        )}

        {activeLayerId === selectedId && totalCount != null && (
          <div className="rounded-md bg-cyan-50 px-2 py-1.5 text-center text-xs text-cyan-800">
            <strong>{totalCount.toLocaleString()}</strong>
            {estimated && " (~)"} matching · showing {results.length}
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={onSearch}
            disabled={!draftIsRunnable(draft) || running}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SearchIcon className="h-4 w-4" />
            )}
            Search
          </button>

          {draft && hasAnyCondition(draft) && (
            <button
              onClick={() => clearDraft(selectedId)}
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100"
              title="Clear query"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          {results.length > 0 && (
            <button
              onClick={onClearResults}
              className="rounded-md border border-cyan-200 bg-white p-1.5 text-cyan-700 hover:bg-cyan-50"
              title="Clear results and halos"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
