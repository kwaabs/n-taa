import { useEffect, useRef, useState } from "react";
import {
  Download,
  ChevronDown,
  Loader2,
  FileSpreadsheet,
  FileJson,
  FileText,
  Map as MapIcon,
  Lasso,
} from "lucide-react";
import { downloadFile } from "@/lib/api";
import { useMapContext } from "@/features/map/context/MapContext";
import { useSelectionStore } from "@/features/features/store";
import { viewportPolygon } from "@/features/map/utils/viewportBounds";
import type { GeoJsonGeometry } from "@/features/spatial/types";

import {
  toastProgress,
  toastCompleteProgress,
  toastFailProgress,
} from "@/features/notifications/store";

export type ExportFormat = "csv" | "xlsx" | "geojson";
type ExportMode = "viewport" | "selection";

interface Props {
  /** Path template that ends with "/export" or "/features/export". */
  endpoint: string;
  /** Extra body fields (sort, filters, etc.). "within" is added by this component. */
  extraBody?: Record<string, unknown>;
  /** Filename base — no extension, no timestamp. */
  filenameBase: string;
  /** Optional label; "" for icon-only. */
  label?: string;
  /**
   * When true, always requires a bounding polygon (viewport or drawn selection).
   * Used for whole-layer exports from the sidebar.
   *
   * When false, "extraBody" is expected to contain a `within` already
   * (e.g. table exports use the spatial context they were opened with).
   */
  requireBounds?: boolean;
}

const FORMATS: {
  format: ExportFormat;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ext: string;
}[] = [
  { format: "csv", label: "CSV", icon: FileText, ext: "csv" },
  { format: "xlsx", label: "Excel", icon: FileSpreadsheet, ext: "xlsx" },
  { format: "geojson", label: "GeoJSON", icon: FileJson, ext: "geojson" },
];

export function ExportButton({
  endpoint,
  extraBody = {},
  filenameBase,
  label,
  requireBounds = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [mode, setMode] = useState<ExportMode>("viewport");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { getMap } = useMapContext();
  const local = useSelectionStore((s) => s.local);
  const hasDrawnSelection = !!local?.feature?.geometry;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [open]);

  const doExport = async (fmt: ExportFormat, ext: string) => {
    setBusy(fmt);
    setOpen(false);

    const toastId = toastProgress(
      `Preparing ${fmt.toUpperCase()} export`,
      `${filenameBase}`,
    );

    try {
      let body: Record<string, unknown> = { ...extraBody };

      if (requireBounds) {
        let within: GeoJsonGeometry | null = null;

        if (mode === "selection" && hasDrawnSelection) {
          within = local!.feature.geometry;
        } else {
          const map = getMap();
          if (map) within = viewportPolygon(map);
        }

        if (!within) {
          throw new Error("Could not resolve export bounds");
        }
        body = { ...body, within };
      }

      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");

      await downloadFile(
        `${endpoint}.${fmt}`,
        body,
        `${filenameBase}_${stamp}.${ext}`,
      );

      toastCompleteProgress(
        toastId,
        "Export complete",
        `${filenameBase}_${stamp}.${ext}`,
      );
    } catch (e) {
      console.error("export failed", e);
      toastFailProgress(
        toastId,
        "Export failed",
        (e as { message?: string })?.message ?? "Unknown error",
      );
    } finally {
      setBusy(null);
    }
  };

  const showLabel = label === undefined ? "Export" : label;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        title="Export data"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        {showLabel && <span>{showLabel}</span>}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {/* Bounds picker — only for whole-layer exports */}
          {requireBounds && (
            <>
              <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Extent
              </div>

              <ModeOption
                active={mode === "viewport"}
                icon={<MapIcon className="h-3.5 w-3.5" />}
                label="From visible area"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMode("viewport");
                }}
              />

              <ModeOption
                active={mode === "selection"}
                disabled={!hasDrawnSelection}
                icon={<Lasso className="h-3.5 w-3.5" />}
                label="From drawn selection"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (hasDrawnSelection) setMode("selection");
                }}
              />

              <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Format
              </div>
            </>
          )}

          {FORMATS.map(({ format, label, icon: Icon, ext }) => (
            <button
              key={format}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void doExport(format, ext);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
            >
              <Icon className="h-3.5 w-3.5 text-slate-500" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModeOption({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition",
        disabled
          ? "cursor-not-allowed text-slate-300"
          : active
            ? "bg-emerald-50 text-emerald-700"
            : "text-slate-700 hover:bg-slate-100",
      ].join(" ")}
      title={disabled ? "Draw a selection first" : undefined}
    >
      <span className={active ? "text-emerald-600" : "text-slate-500"}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {active && <span className="text-[10px]">✓</span>}
    </button>
  );
}
