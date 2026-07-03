import { useMemo, useState } from "react";
import {
  X,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  MapPin,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useTableStore } from "./tableStore";
import { useMapContext } from "@/features/map/context/MapContext";
import { useSelectionStore } from "@/features/features/store";
import { useSearchStore } from "@/features/search/store";
import { usePagedFeatures, type Sort } from "./hooks";
import { downloadFile } from "@/lib/api";
import type { Feature } from "@/features/features/types";

import { ExportButton } from "./ExportButton";

type SortDir = "asc" | "desc" | null;

function pickColumns(features: Feature[]): string[] {
  if (features.length === 0) return [];
  const set = new Set<string>();
  for (const f of features.slice(0, 20)) {
    for (const k of Object.keys(f.properties)) set.add(k);
  }
  const skip = new Set([
    "ogc_fid",
    "globalid",
    "objectid",
    "created_date",
    "last_edited_date",
    "created_user",
    "last_edited_user",
  ]);
  const priority = [
    "name",
    "district",
    "region",
    "substation_name",
    "manufacturer",
    "rated_voltage",
    "phase",
    "serial_number",
  ];
  const rest = [...set].filter((k) => !skip.has(k) && !priority.includes(k));
  return [...priority.filter((k) => set.has(k)), ...rest].slice(0, 6);
}

function humanKey(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/\bid\b/gi, "ID")
    .replace(/^./, (c) => c.toUpperCase());
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString();
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

function centroidOf(f: Feature): [number, number] | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === "Point") return g.coordinates as [number, number];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const visit = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as [number, number];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    for (const cc of c as unknown[]) visit(cc);
  };
  // @ts-expect-error coords shape
  visit(g.coordinates);
  if (!isFinite(minX)) return null;
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

export function ResultsTable() {
  const open = useTableStore((s) => s.open);
  const layer = useTableStore((s) => s.layer);
  const geometry = useTableStore((s) => s.geometry);
  const mode = useTableStore((s) => s.mode);
  const close = useTableStore((s) => s.close);

  const searchResults = useSearchStore((s) => s.results);
  const searchTotal = useSearchStore((s) => s.totalCount);
  const searchEstimated = useSearchStore((s) => s.estimated);

  const { getMap } = useMapContext();
  const setSelection = useSelectionStore((s) => s.setSelection);

  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [exporting, setExporting] = useState(false);

  const sort: Sort | null =
    sortDir && sortKey ? { column: sortKey, direction: sortDir } : null;

  // ─── Data source depends on mode ─────────────────────
  const paged = usePagedFeatures({
    layerId: mode === "spatial" ? (layer?.id ?? null) : null,
    geometry: mode === "spatial" ? (geometry ?? null) : null,
    sort: mode === "spatial" ? sort : null,
  });

  const spatialFeatures = paged.data?.pages.flatMap((p) => p.features) ?? [];

  const allFeatures: Feature[] =
    mode === "search" ? searchResults : spatialFeatures;

  const totalCount =
    mode === "search"
      ? searchTotal
      : (paged.data?.pages[0]?.total_count ?? null);

  const estimated =
    mode === "search"
      ? searchEstimated
      : (paged.data?.pages[0]?.estimated_count ?? false);

  const loaded = allFeatures.length;
  const isLoading = mode === "spatial" ? paged.isLoading : false;
  const isFetching = mode === "spatial" ? paged.isFetching : false;
  const isFetchingNextPage =
    mode === "spatial" ? paged.isFetchingNextPage : false;
  const hasNextPage = mode === "spatial" ? paged.hasNextPage : false;
  const error = mode === "spatial" ? paged.error : null;
  const fetchNextPage = paged.fetchNextPage;

  const columns = useMemo(() => pickColumns(allFeatures), [allFeatures]);

  // Client-side sort ONLY in search mode (server sort still used in spatial)
  const sortedFeatures = useMemo(() => {
    if (mode !== "search" || !sortDir || !sortKey) return allFeatures;
    const copy = [...allFeatures];
    copy.sort((a, b) => {
      const av = a.properties[sortKey];
      const bv = b.properties[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    if (sortDir === "desc") copy.reverse();
    return copy;
  }, [allFeatures, mode, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") setSortDir("desc");
    else if (sortDir === "desc") {
      setSortDir(null);
      setSortKey("");
    } else setSortDir("asc");
  };

  const onRowClick = (f: Feature) => {
    if (!layer) return;
    const map = getMap();
    const c = centroidOf(f);
    if (map && c) {
      map.flyTo({
        center: c,
        zoom: Math.max(map.getZoom(), 15),
        duration: 400,
      });
    }
    setSelection({
      layerId: layer.id,
      layerName: layer.display_name,
      ogcFid: Number(f.id),
    });
  };

  const onExport = async () => {
    if (!layer) return;
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      const fname = `${layer.name}_${stamp}.csv`;

      // For search mode: use world bounds + filter from search store
      // For spatial mode: use the polygon
      const activeQuery = useSearchStore.getState().activeQuery;
      const worldBounds = {
        type: "Polygon",
        coordinates: [
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ],
        ],
      };

      const body: Record<string, unknown> =
        mode === "search"
          ? {
              within: worldBounds,
              filters: activeQuery,
              sort: sort ? [sort] : undefined,
            }
          : { within: geometry, sort: sort ? [sort] : undefined };

      await downloadFile(
        `/api/v1/layers/${layer.id}/features/export.csv`,
        body,
        fname,
      );
    } catch (e) {
      console.error("csv export failed", e);
    } finally {
      setExporting(false);
    }
  };

  if (!open || !layer) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex max-h-[45vh] flex-col border-t border-slate-200 bg-white shadow-lg">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-cyan-600" />
          <span className="text-sm font-semibold text-slate-800">
            {layer.display_name}
          </span>
          <span className="text-xs text-slate-500">
            {loaded.toLocaleString()}
            {totalCount != null && (
              <>
                {" "}
                of {estimated && "~"}
                {totalCount.toLocaleString()}
              </>
            )}{" "}
            {mode === "search" ? "results" : "loaded"}
          </span>
          {mode === "search" && (
            <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-700">
              Search
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ExportButton
            endpoint={`/api/v1/layers/${layer.id}/features/export`}
            extraBody={
              mode === "search"
                ? {
                    within: {
                      type: "Polygon",
                      coordinates: [
                        [
                          [-180, -85],
                          [180, -85],
                          [180, 85],
                          [-180, 85],
                          [-180, -85],
                        ],
                      ],
                    },
                    filters: useSearchStore.getState().activeQuery,
                    sort: sort ? [sort] : undefined,
                  }
                : {
                    within: geometry,
                    sort: sort ? [sort] : undefined,
                  }
            }
            filenameBase={layer.name}
          />
          <button
            onClick={close}
            className="rounded p-1.5 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-slate-600" />
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          {(error as { message?: string })?.message ?? "Failed to load"}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-50 text-left">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 font-medium text-slate-600">
                ID
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => toggleSort(col)}
                  className="cursor-pointer border-b border-slate-200 px-3 py-2 font-medium text-slate-600 hover:bg-slate-100"
                >
                  <span className="inline-flex items-center gap-1">
                    {humanKey(col)}
                    {sortKey === col && sortDir === "asc" && (
                      <ArrowUp className="h-3 w-3" />
                    )}
                    {sortKey === col && sortDir === "desc" && (
                      <ArrowDown className="h-3 w-3" />
                    )}
                    {sortKey !== col && (
                      <ChevronsUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            )}
            {sortedFeatures.map((f) => (
              <tr
                key={String(f.id)}
                onClick={() => onRowClick(f)}
                className="cursor-pointer border-b border-slate-100 hover:bg-cyan-50"
              >
                <td className="px-3 py-1.5 font-mono text-slate-500">
                  {String(f.id)}
                </td>
                {columns.map((col) => (
                  <td key={col} className="px-3 py-1.5 text-slate-800">
                    {formatValue(f.properties[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {mode === "spatial" && hasNextPage && (
          <div className="p-3 text-center">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isFetchingNextPage && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              Load next 100
            </button>
          </div>
        )}

        {mode === "spatial" &&
          !hasNextPage &&
          !isLoading &&
          sortedFeatures.length > 0 && (
            <div className="p-3 text-center text-[11px] text-slate-400">
              End of results
            </div>
          )}
      </div>

      <footer className="border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-500">
        Click row → fly to feature · Sort headers refetch from server
        {isFetching && !isFetchingNextPage && (
          <span className="ml-2">· Loading…</span>
        )}
      </footer>
    </div>
  );
}
