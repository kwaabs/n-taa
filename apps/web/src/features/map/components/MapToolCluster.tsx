import { useEffect, useState } from "react";
import {
  Ruler,
  Square,
  Lasso,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  RotateCcw,
  Waypoints,
  MousePointer2,
  Copy,
  Ruler as ScaleIcon,
} from "lucide-react";
import { useMapContext } from "../context/MapContext";
import { useToolClusterStore } from "../store/toolClusterStore";

// Existing tool stores
import { useMeasureStore } from "@/features/spatial/measureStore";
import {
  totalDistanceMeters,
  polygonAreaMeters,
  polygonPerimeterMeters,
  formatDistance,
  formatArea,
} from "@/features/spatial/measureUtils";
import { useSelectStore } from "@/features/spatial/selectStore";
import { useSelectionStore } from "@/features/features/store";
import type { Feature } from "@/features/features/types";

interface ScaleReading {
  meters: number;
  pixels: number;
  label: string;
}

function computeScale(map: maplibregl.Map, targetPx = 80): ScaleReading {
  const center = map.getCenter();
  const metersPerPixel =
    (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) /
    Math.pow(2, map.getZoom() + 8);
  const rawMeters = metersPerPixel * targetPx;
  const nice = niceRound(rawMeters);
  const pixels = nice / metersPerPixel;
  return { meters: nice, pixels, label: formatDist(nice) };
}
function niceRound(value: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / magnitude;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * magnitude;
}
function formatDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
  return `${Math.round(m)} m`;
}

export function MapToolCluster() {
  const { getMap } = useMapContext();
  const expanded = useToolClusterStore((s) => s.expanded);
  const toggle = useToolClusterStore((s) => s.toggle);

  // Debug panel state
  const [lastCoord, setLastCoord] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [zoom, setZoom] = useState(0);
  const [scale, setScale] = useState<ScaleReading | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const map = getMap();
    if (!map) return;
    const onMove = (e: maplibregl.MapMouseEvent) =>
      setLastCoord({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    const onView = () => {
      setZoom(map.getZoom());
      setScale(computeScale(map));
    };
    map.on("mousemove", onMove);
    map.on("zoomend", onView);
    map.on("moveend", onView);
    setZoom(map.getZoom());
    setScale(computeScale(map));
    return () => {
      map.off("mousemove", onMove);
      map.off("zoomend", onView);
      map.off("moveend", onView);
    };
  }, [getMap]);

  const onCopy = async () => {
    if (!lastCoord) return;
    await navigator.clipboard.writeText(
      `${lastCoord.lat.toFixed(6)}, ${lastCoord.lng.toFixed(6)}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-1.5">
      {/* Cluster content */}
      {expanded && (
        <>
          <MeasureChips />
          <SelectChip />
        </>
      )}

      {/* Debug row (always visible when expanded, compact) */}
      {expanded && (
        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white/95 px-3 py-1.5 text-xs shadow-md backdrop-blur">
          <div className="flex items-center gap-1.5 text-slate-500">
            <MousePointer2 className="h-3 w-3" />
            {lastCoord ? (
              <span className="font-mono text-slate-800">
                {lastCoord.lat.toFixed(6)}, {lastCoord.lng.toFixed(6)}
              </span>
            ) : (
              <span className="text-slate-400">Move cursor over map</span>
            )}
          </div>
          <button
            onClick={onCopy}
            disabled={!lastCoord}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
            title="Copy coordinates"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
          <div className="h-3 w-px bg-slate-200" />
          <div className="text-slate-500">
            Zoom{" "}
            <span className="font-mono text-slate-800">{zoom.toFixed(2)}</span>
          </div>
          <div className="h-3 w-px bg-slate-200" />
          {scale && (
            <div className="flex items-center gap-1.5 text-slate-500">
              <ScaleIcon className="h-3 w-3" />
              <div
                className="border-y border-r border-slate-800"
                style={{
                  width: `${scale.pixels}px`,
                  height: "6px",
                  borderLeft: "1px solid #1e293b",
                }}
              />
              <span className="font-mono text-slate-800">{scale.label}</span>
            </div>
          )}
        </div>
      )}

      {/* Collapse toggle — always visible */}
      <button
        onClick={toggle}
        className="flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-md backdrop-blur hover:bg-slate-50"
        title={expanded ? "Hide map tools" : "Show map tools"}
      >
        {expanded ? (
          <>
            <ChevronDown className="h-3 w-3" />
            Hide
          </>
        ) : (
          <>
            <ChevronUp className="h-3 w-3" />
            Map tools
          </>
        )}
      </button>
    </div>
  );
}

/* ─── Measure chip (Distance + Area) ─────────────────── */

function MeasureChips() {
  const mode = useMeasureStore((s) => s.mode);
  const frozen = useMeasureStore((s) => s.frozen);
  const vertices = useMeasureStore((s) => s.vertices);
  const cursor = useMeasureStore((s) => s.cursor);
  const setMode = useMeasureStore((s) => s.setMode);
  const finish = useMeasureStore((s) => s.finish);
  const cancel = useMeasureStore((s) => s.cancel);

  const activePath = frozen || !cursor ? vertices : [...vertices, cursor];
  const distance = totalDistanceMeters(activePath);
  const area = polygonAreaMeters(activePath);
  const perimeter = polygonPerimeterMeters(activePath);

  const canFinish =
    !frozen &&
    ((mode === "distance" && vertices.length >= 2) ||
      (mode === "area" && vertices.length >= 3));

  const startAgain = () => setMode(mode);

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2 py-1.5 shadow-md backdrop-blur">
      <ToolButton
        active={mode === "distance"}
        activeTint="orange"
        icon={<Waypoints className="h-3.5 w-3.5" />}
        label="Distance"
        onClick={() =>
          setMode(mode === "distance" && !frozen ? "off" : "distance")
        }
      />
      <ToolButton
        active={mode === "area"}
        activeTint="orange"
        icon={<Ruler className="h-3.5 w-3.5" />}
        label="Area"
        onClick={() => setMode(mode === "area" && !frozen ? "off" : "area")}
      />

      {mode !== "off" && (
        <>
          <div className="h-4 w-px bg-slate-200" />
          <div className="min-w-[130px] font-mono text-xs text-slate-700">
            {mode === "distance" && <span>{formatDistance(distance)}</span>}
            {mode === "area" && (
              <span>
                {formatArea(area)}{" "}
                <span className="text-slate-400">
                  · {formatDistance(perimeter)}
                </span>
              </span>
            )}
          </div>

          {!frozen ? (
            <button
              onClick={finish}
              disabled={!canFinish}
              className={[
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                canFinish
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "cursor-not-allowed bg-slate-100 text-slate-400",
              ].join(" ")}
              title="Finish (Enter)"
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </button>
          ) : (
            <button
              onClick={startAgain}
              className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200"
              title="Start a new measurement"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New
            </button>
          )}

          <button
            onClick={cancel}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title="Clear (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

/* ─── Select chip ────────────────────────────────────── */

function SelectChip() {
  const mode = useSelectStore((s) => s.mode);
  const frozen = useSelectStore((s) => s.frozen);
  const vertices = useSelectStore((s) => s.vertices);
  const setMode = useSelectStore((s) => s.setMode);
  const finish = useSelectStore((s) => s.finish);
  const cancel = useSelectStore((s) => s.cancel);
  const setLocal = useSelectionStore((s) => s.setLocal);

  const canFinish = !frozen && mode === "polygon" && vertices.length >= 3;

  const onFinish = () => {
    const ring: [number, number][] = [...vertices, vertices[0]];
    const synth: Feature = {
      type: "Feature",
      id: Date.now(),
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: {},
    };
    finish();
    setLocal({ layerName: "Custom Selection", feature: synth });
  };

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2 py-1.5 shadow-md backdrop-blur">
      <ToolButton
        active={mode === "polygon"}
        activeTint="cyan"
        icon={<Lasso className="h-3.5 w-3.5" />}
        label="Select area"
        onClick={() =>
          setMode(mode === "polygon" && !frozen ? "off" : "polygon")
        }
      />

      {mode !== "off" && (
        <>
          <div className="h-4 w-px bg-slate-200" />
          <span className="text-xs text-slate-500">
            {vertices.length} pt{vertices.length === 1 ? "" : "s"}
          </span>

          {!frozen ? (
            <button
              onClick={onFinish}
              disabled={!canFinish}
              className={[
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                canFinish
                  ? "bg-cyan-600 text-white hover:bg-cyan-700"
                  : "cursor-not-allowed bg-slate-100 text-slate-400",
              ].join(" ")}
              title="Finish (Enter)"
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </button>
          ) : (
            <button
              onClick={() => setMode("polygon")}
              className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200"
              title="Start again"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New
            </button>
          )}

          <button
            onClick={cancel}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title="Clear (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

/* ─── Shared button ──────────────────────────────────── */

function ToolButton({
  active,
  activeTint,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  activeTint: "orange" | "cyan";
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const activeCls =
    activeTint === "orange"
      ? "bg-orange-100 text-orange-700"
      : "bg-cyan-100 text-cyan-700";

  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
        active ? activeCls : "text-slate-600 hover:bg-slate-100",
      ].join(" ")}
      title={label}
    >
      {icon}
      {label}
    </button>
  );
}
