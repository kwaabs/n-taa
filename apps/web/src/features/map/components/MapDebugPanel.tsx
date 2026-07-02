import { useEffect, useState } from "react";
import { MousePointer2, Copy, Check, Ruler } from "lucide-react";
import { useMapContext } from "../context/MapContext";

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

  return {
    meters: nice,
    pixels,
    label: formatDistance(nice),
  };
}

function niceRound(value: number): number {
  const exponent = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exponent);
  const fraction = value / magnitude;
  let nice: number;
  if (fraction < 1.5) nice = 1;
  else if (fraction < 3.5) nice = 2;
  else if (fraction < 7.5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
  return `${Math.round(m)} m`;
}

export function MapDebugPanel() {
  const { getMap } = useMapContext();

  // Sticky coordinates — last known position from the map, kept visible
  // when the cursor moves onto the panel itself.
  const [lastCoord, setLastCoord] = useState<{
    lng: number;
    lat: number;
  } | null>(null);

  const [zoom, setZoom] = useState<number>(0);
  const [scale, setScale] = useState<ScaleReading | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const map = getMap();
    if (!map) return;

    const onMove = (e: maplibregl.MapMouseEvent) => {
      setLastCoord({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    };
    const onViewChange = () => {
      setZoom(map.getZoom());
      setScale(computeScale(map));
    };

    map.on("mousemove", onMove);
    map.on("zoomend", onViewChange);
    map.on("moveend", onViewChange);

    setZoom(map.getZoom());
    setScale(computeScale(map));

    return () => {
      map.off("mousemove", onMove);
      map.off("zoomend", onViewChange);
      map.off("moveend", onViewChange);
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
    <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-md border border-slate-200 bg-white/95 px-3 py-1.5 text-xs shadow-md backdrop-blur">
      {/* Coordinates — persist last known position */}
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

      {/* Copy button — always shown once we have a coord */}
      <button
        onClick={onCopy}
        disabled={!lastCoord}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        title={lastCoord ? "Copy coordinates" : "No coordinates yet"}
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-600" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>

      <div className="h-3 w-px bg-slate-200" />

      {/* Zoom */}
      <div className="text-slate-500">
        Zoom <span className="font-mono text-slate-800">{zoom.toFixed(2)}</span>
      </div>

      <div className="h-3 w-px bg-slate-200" />

      {/* Scale bar */}
      {scale && (
        <div className="flex items-center gap-1.5 text-slate-500">
          <Ruler className="h-3 w-3" />
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
  );
}
