import { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Info,
  ClipboardCheck,
  Compass,
  History,
  GitBranch,
  Locate,
  Loader2 as SpinnerIcon,
  XCircle,
} from "lucide-react";
import { useFeature } from "./hooks";
import { useSelectionStore } from "./store";
import { useLayers } from "@/features/layers/hooks";
import { useLayersStore } from "@/features/layers/store";
import { useSpatialStore } from "@/features/spatial/store";
import { useContentsCounts, useQueryFeatures } from "@/features/spatial/hooks";
import { useTableStore } from "@/features/spatial/tableStore";
import type { Layer } from "@/features/layers/types";
import type { Feature } from "./types";

import { useMapContext } from "@/features/map/context/MapContext";
import { useLayoutStore } from "@/app/layout/store/layoutStore";
import { useTraceFeeder, isTraceable, companionLabel } from "./traceHooks";
import { useTraceStore, type FeederSegmentInfo } from "./traceStore";

// ─── helpers ─────────────────────────────────────────────

function isAuditField(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k === "created_by" ||
    k === "created_at" ||
    k === "created_date" ||
    k === "created_user" ||
    k === "updated_by" ||
    k === "updated_at" ||
    k === "last_edited_date" ||
    k === "last_edited_user"
  );
}

function isGnssField(key: string): boolean {
  return key.toLowerCase().startsWith("esrignss");
}

function isConditionField(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.startsWith("cv_") || k.startsWith("ct_") || k === "condition_comments"
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}

function humanKey(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/\bid\b/gi, "ID")
    .replace(/^./, (c) => c.toUpperCase());
}

function isPolygon(feature: Feature | undefined): boolean {
  const t = feature?.geometry?.type;
  return t === "Polygon" || t === "MultiPolygon";
}

// ─── main drawer ─────────────────────────────────────────

type DrawerTab = "attributes" | "condition" | "trace";

export function FeatureDrawer() {
  const selection = useSelectionStore((s) => s.selection);
  const local = useSelectionStore((s) => s.local);
  const clearSel = useSelectionStore((s) => s.clear);
  const clearSpatial = useSpatialStore((s) => s.clear);

  const { data: allLayers = [] } = useLayers();

  const {
    data: apiFeature,
    isLoading,
    isError,
    error,
  } = useFeature(selection?.layerId ?? null, selection?.ogcFid ?? null);

  const [tab, setTab] = useState<DrawerTab>("attributes");

  // Must run every render before any early return.
  const feature = local ? local.feature : apiFeature;

  const currentLayer = useMemo(() => {
    if (!selection) return null;
    return allLayers.find((l) => l.id === selection.layerId) ?? null;
  }, [allLayers, selection]);

  const { attrEntries, conditionEntries, auditEntries, gnssEntries } =
    useMemo(() => {
      if (!feature) {
        return {
          attrEntries: [] as [string, unknown][],
          conditionEntries: [] as [string, unknown][],
          auditEntries: [] as [string, unknown][],
          gnssEntries: [] as [string, unknown][],
        };
      }

      const attrEntries: [string, unknown][] = [];
      const conditionEntries: [string, unknown][] = [];
      const auditEntries: [string, unknown][] = [];
      const gnssEntries: [string, unknown][] = [];

      for (const [k, v] of Object.entries(feature.properties)) {
        if (isConditionField(k)) conditionEntries.push([k, v]);
        else if (isAuditField(k)) auditEntries.push([k, v]);
        else if (isGnssField(k)) gnssEntries.push([k, v]);
        else attrEntries.push([k, v]);
      }

      return { attrEntries, conditionEntries, auditEntries, gnssEntries };
    }, [feature]);

  const canTrace = !local && !!selection && isTraceable(currentLayer?.name);
  const hasConditionData = conditionEntries.length > 0;
  const showTabs = !local && (hasConditionData || canTrace);

  // When selected feature changes, always reset to Attributes and clear old trace.
  useEffect(() => {
    setTab("attributes");
    useTraceStore.getState().clear();
  }, [selection?.layerId, selection?.ogcFid, local?.feature?.id]);

  // Safety: if current tab is no longer valid, force back to Attributes.
  useEffect(() => {
    if (tab === "trace" && !canTrace) {
      setTab("attributes");
    }

    if (tab === "condition" && conditionEntries.length === 0) {
      setTab("attributes");
    }
  }, [tab, canTrace, conditionEntries.length]);

  // Safe early return — all hooks above have already run.
  if (!selection && !local) return null;

  const layerName = local ? local.layerName : selection?.layerName;
  const heading = local ? "Custom selection" : `Feature #${selection?.ogcFid}`;

  const onClose = () => {
    clearSel();
    clearSpatial();
    useTraceStore.getState().clear();
    setTab("attributes");
  };

  return (
    <aside className="absolute right-0 top-0 z-20 flex h-full w-96 flex-col border-l border-slate-200 bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {layerName}
          </div>
          <div className="truncate font-semibold text-slate-800">{heading}</div>
        </div>

        <button
          onClick={onClose}
          className="rounded p-1.5 hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-slate-600" />
        </button>
      </header>

      {showTabs && (
        <div className="flex border-b border-slate-200 bg-slate-50">
          <TabButton
            active={tab === "attributes"}
            onClick={() => setTab("attributes")}
            icon={<Info className="h-3.5 w-3.5" />}
            label="Attributes"
            count={
              attrEntries.length + auditEntries.length + gnssEntries.length
            }
          />

          {hasConditionData && (
            <TabButton
              active={tab === "condition"}
              onClick={() => setTab("condition")}
              icon={<ClipboardCheck className="h-3.5 w-3.5" />}
              label="Condition"
              count={conditionEntries.length}
            />
          )}

          {canTrace && (
            <TabButton
              active={tab === "trace"}
              onClick={() => setTab("trace")}
              icon={<GitBranch className="h-3.5 w-3.5" />}
              label="Feeder"
              count={0}
            />
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {!local && isLoading && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {!local && isError && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {(error as { message?: string })?.message ?? "Failed to load"}
          </div>
        )}

        {feature && (
          <>
            {/* Custom selection / drawn area / buffer */}
            {local && (
              <ContentsPanel selectionLayerId="__local__" feature={feature} />
            )}

            {/* Normal feature drawer */}
            {!local && selection && (
              <>
                {tab === "attributes" && (
                  <AttributeList
                    entries={attrEntries}
                    auditEntries={auditEntries}
                    gnssEntries={gnssEntries}
                  />
                )}

                {tab === "condition" && hasConditionData && (
                  <ConditionList entries={conditionEntries} />
                )}

                {tab === "trace" && canTrace && (
                  <TracePanel
                    layerId={selection.layerId}
                    ogcFid={selection.ogcFid}
                    layerName={currentLayer?.display_name ?? ""}
                    layerTableName={currentLayer?.name ?? ""}
                  />
                )}

                {/* Polygon contents panel only belongs under Attributes */}
                {tab === "attributes" && isPolygon(feature) && (
                  <div className="mt-6">
                    <ContentsPanel
                      selectionLayerId={selection.layerId}
                      feature={feature}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

// ─── Attribute sections ─────────────────────────────────

function AttributeList({
  entries,
  auditEntries,
  gnssEntries,
}: {
  entries: [string, unknown][];
  auditEntries: [string, unknown][];
  gnssEntries: [string, unknown][];
}) {
  if (
    entries.length === 0 &&
    auditEntries.length === 0 &&
    gnssEntries.length === 0
  ) {
    return <p className="text-sm text-slate-500">No attributes to show.</p>;
  }

  return (
    <div>
      {entries.length > 0 && (
        <dl className="divide-y divide-slate-100 text-sm">
          {entries.map(([k, v]) => (
            <div
              key={k}
              className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-3 py-1.5"
            >
              <dt className="truncate text-slate-500" title={k}>
                {humanKey(k)}
              </dt>
              <dd className="truncate text-slate-800" title={formatValue(v)}>
                {formatValue(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {auditEntries.length > 0 && (
        <>
          <hr className="my-4 border-t border-slate-200" />
          <SectionHeader icon={<History className="h-3 w-3" />}>
            Record history
          </SectionHeader>
          <MetadataList entries={auditEntries} />
        </>
      )}

      {gnssEntries.length > 0 && (
        <>
          <hr className="my-4 border-t border-slate-200" />
          <SectionHeader icon={<Locate className="h-3 w-3" />}>
            Location metadata
          </SectionHeader>
          <MetadataList entries={gnssEntries} />
        </>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      {icon}
      {children}
    </div>
  );
}

function MetadataList({ entries }: { entries: [string, unknown][] }) {
  return (
    <dl className="divide-y divide-slate-100 text-xs">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-3 py-1"
        >
          <dt className="truncate text-slate-400" title={k}>
            {humanKey(k)}
          </dt>
          <dd className="truncate text-slate-600" title={formatValue(v)}>
            {formatValue(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Condition assessment ───────────────────────────────

function ConditionList({ entries }: { entries: [string, unknown][] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500">
        No condition assessment data.
      </div>
    );
  }

  const commentsIdx = entries.findIndex(
    ([k]) => k.toLowerCase() === "condition_comments",
  );

  const comments = commentsIdx >= 0 ? entries[commentsIdx][1] : null;
  const checks =
    commentsIdx >= 0 ? entries.filter((_, i) => i !== commentsIdx) : entries;

  return (
    <div className="space-y-4">
      {comments !== null &&
        comments !== undefined &&
        String(comments).trim() !== "" && (
          <section className="rounded-lg bg-slate-50 p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Inspector notes
            </div>
            <p className="text-sm text-slate-800">{String(comments)}</p>
          </section>
        )}

      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Checks
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {checks.map(([k, v]) => (
            <li
              key={k}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <span className="truncate text-slate-700" title={k}>
                {humanKey(k)}
              </span>
              <ConditionValue value={v} field={k} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ConditionValue({ value, field }: { value: unknown; field: string }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-xs text-slate-400">—</span>;
  }

  const isCvCheck = field.toLowerCase().startsWith("cv_");
  const isCtCheck = field.toLowerCase().startsWith("ct_");

  if (typeof value === "number") {
    if (isCvCheck || isCtCheck) {
      if (value === 0) {
        return (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            OK
          </span>
        );
      }

      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          Flag {value > 1 ? `(${value})` : ""}
        </span>
      );
    }

    return <span className="text-slate-800">{value.toLocaleString()}</span>;
  }

  return (
    <span className="truncate text-slate-800" title={String(value)}>
      {String(value)}
    </span>
  );
}

// ─── Tabs ───────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs transition",
        active ? "text-emerald-700" : "text-slate-500 hover:text-slate-800",
      ].join(" ")}
    >
      {icon}
      <span className="font-medium">{label}</span>

      {count > 0 && (
        <span
          className={[
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-200 text-slate-600",
          ].join(" ")}
        >
          {count}
        </span>
      )}

      {active && (
        <span className="absolute bottom-0 left-0 h-0.5 w-full bg-emerald-600" />
      )}
    </button>
  );
}

// ─── ContentsPanel ──────────────────────────────────────

function ContentsPanel({
  selectionLayerId,
  feature,
}: {
  selectionLayerId: string;
  feature: Feature;
}) {
  const { data: allLayers = [] } = useLayers();
  const visibleIds = useLayersStore((s) => s.visibleIds);
  const setSpatial = useSpatialStore((s) => s.setResult);
  const showTable = useTableStore((s) => s.showSpatial);

  const targetLayers: Layer[] = allLayers.filter(
    (l) => visibleIds.has(l.id) && l.id !== selectionLayerId,
  );

  const counts = useContentsCounts(targetLayers, feature.geometry ?? null);
  const query = useQueryFeatures();

  if (targetLayers.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <div className="flex items-center gap-2 font-medium text-slate-700">
          <Compass className="h-4 w-4" />
          Contents
        </div>
        <p className="mt-1 text-xs">
          Turn on more layers to see what's inside this area.
        </p>
      </section>
    );
  }

  const onShow = (layer: Layer, openTable: boolean) => {
    if (!feature.geometry) return;

    if (openTable) {
      showTable(layer, feature.geometry);
      return;
    }

    query.mutate(
      { layerId: layer.id, geometry: feature.geometry, limit: 5000 },
      {
        onSuccess: (fc) => {
          setSpatial({
            layerId: layer.id,
            layerName: layer.display_name,
            geometry: feature.geometry,
            features: fc.features,
          });
        },
      },
    );
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Compass className="h-3.5 w-3.5" />
        Contents
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {counts.map(({ layer, count, isLoading, isError }) => (
          <li
            key={layer.id}
            className="flex items-center gap-2 px-3 py-2 text-sm"
          >
            <span className="flex-1 truncate text-slate-800">
              {layer.display_name}
            </span>

            <span className="min-w-[3ch] text-right font-mono text-slate-500">
              {isLoading
                ? "…"
                : isError
                  ? "?"
                  : (count?.toLocaleString() ?? "0")}
            </span>

            <button
              onClick={() => onShow(layer, false)}
              disabled={!count || query.isPending}
              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              title="Highlight on map"
            >
              Show
            </button>

            <button
              onClick={() => onShow(layer, true)}
              disabled={!count || query.isPending}
              className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs text-cyan-700 hover:bg-cyan-100 disabled:opacity-40 disabled:hover:bg-cyan-50"
              title="Show as table"
            >
              Table
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── TracePanel ─────────────────────────────────────────

function TracePanel({
  layerId,
  ogcFid,
  layerName,
  layerTableName,
}: {
  layerId: string;
  ogcFid: number;
  layerName: string;
  layerTableName: string;
}) {
  const trace = useTraceFeeder();
  const traceStore = useTraceStore();
  const { getMap } = useMapContext();
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);

  const [includeCompanion, setIncludeCompanion] = useState(false);
  const [includeTransformers, setIncludeTransformers] = useState(false);

  const companionText = companionLabel(layerTableName);
  const hasResult = !!traceStore.feederKey;

  const onTrace = () => {
    trace.mutate(
      {
        layerId,
        ogcFid,
        includeCompanion,
        includeTransformers,
      },
      {
        onSuccess: (r) => {
          traceStore.set({
            feederKey: r.feeder_key,
            keySource: r.key_source,
            totalLength: r.total_length_m,
            segmentCount: r.segment_count,
            bounds: r.bounds,
            primary: {
              layerName: r.primary.layer_name,
              tableName: r.primary.table_name,
              lengthM: r.primary.length_m,
              segmentCount: r.primary.segment_count,
              geometry: r.primary.geometry,
            },
            companions: (r.companions ?? []).map((c) => ({
              layerName: c.layer_name,
              tableName: c.table_name,
              lengthM: c.length_m,
              segmentCount: c.segment_count,
              geometry: c.geometry,
            })),
            transformerCount: r.transformer_count,
            transformers: r.transformers,
          });
        },
      },
    );
  };

  const onZoom = () => {
    const map = getMap();
    if (!map || !traceStore.bounds) return;

    map.fitBounds(
      [
        [traceStore.bounds[0], traceStore.bounds[1]],
        [traceStore.bounds[2], traceStore.bounds[3]],
      ],
      {
        padding: {
          top: 40,
          bottom: 40,
          left: sidebarOpen ? 340 : 60,
          right: 40 + 384,
        },
        maxZoom: 15,
        duration: 600,
      },
    );
  };

  const onClear = () => {
    traceStore.clear();
    trace.reset();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="flex items-center gap-2 text-slate-700">
          <GitBranch className="h-4 w-4 text-cyan-600" />
          <span className="font-medium">Feeder trace</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Find all segments in {layerName} that share this feeder's circuit ID.
        </p>
      </div>

      {!hasResult && !trace.isPending && (
        <div className="space-y-2">
          {companionText && (
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={includeCompanion}
                onChange={(e) => setIncludeCompanion(e.target.checked)}
                className="h-3.5 w-3.5 accent-cyan-600"
              />
              <div className="flex-1">
                <div className="font-medium">{companionText}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  Include the matching medium at the same voltage
                </div>
              </div>
            </label>
          )}

          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={includeTransformers}
              onChange={(e) => setIncludeTransformers(e.target.checked)}
              className="h-3.5 w-3.5 accent-cyan-600"
            />
            <div className="flex-1">
              <div className="font-medium">
                Include distribution transformers
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                Also find DSS transformers on this feeder
              </div>
            </div>
          </label>
        </div>
      )}

      {trace.isError && (
        <div className="flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          <XCircle className="h-3.5 w-3.5" />
          {(trace.error as { message?: string })?.message ?? "Trace failed"}
        </div>
      )}

      {!hasResult && !trace.isPending && (
        <button
          onClick={onTrace}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-cyan-600 py-2 text-sm font-medium text-white hover:bg-cyan-700"
        >
          <GitBranch className="h-4 w-4" />
          Trace this feeder
        </button>
      )}

      {trace.isPending && (
        <div className="flex items-center justify-center gap-2 rounded-md bg-slate-100 py-2 text-sm text-slate-500">
          <SpinnerIcon className="h-4 w-4 animate-spin" />
          Tracing…
        </div>
      )}

      {hasResult && (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Feeder ID
            </div>

            <div className="mb-3 truncate text-sm font-semibold text-slate-800">
              {traceStore.feederKey}
            </div>

            <div className="mb-3 space-y-1 text-xs">
              {traceStore.primary && (
                <SegmentRow segment={traceStore.primary} />
              )}

              {traceStore.companions.map((c) => (
                <SegmentRow key={c.tableName} segment={c} />
              ))}

              {traceStore.companions.length > 0 && (
                <>
                  <div className="my-1 border-t border-slate-200" />
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>Total</span>
                    <span>
                      {formatLength(traceStore.totalLength)}
                      {" · "}
                      {traceStore.segmentCount.toLocaleString()} seg
                    </span>
                  </div>
                </>
              )}
            </div>

            {traceStore.transformerCount > 0 && (
              <>
                <div className="my-1 border-t border-slate-200" />
                <div className="flex justify-between text-xs text-slate-800">
                  <span className="font-medium">DSS transformers</span>
                  <span>{traceStore.transformerCount.toLocaleString()}</span>
                </div>
              </>
            )}

            <div className="mt-3 text-[10px] text-slate-400">
              Key source: {traceStore.keySource}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onZoom}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Locate className="h-3.5 w-3.5" />
              Zoom to feeder
            </button>

            <button
              onClick={onClear}
              className="flex items-center justify-center gap-1.5 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1.5 text-xs text-cyan-700 hover:bg-cyan-100"
            >
              <XCircle className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SegmentRow({ segment }: { segment: FeederSegmentInfo }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-slate-700">
      <span className="truncate">{segment.layerName}</span>
      <span className="shrink-0 font-mono text-slate-500">
        {formatLength(segment.lengthM)}
        {" · "}
        {segment.segmentCount.toLocaleString()} seg
      </span>
    </div>
  );
}

function formatLength(m: number): string {
  if (m < 1000) return `${m.toFixed(1)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}
