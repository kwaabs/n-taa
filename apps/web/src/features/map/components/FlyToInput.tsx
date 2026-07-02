import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Navigation } from "lucide-react";
import { useMapContext } from "../context/MapContext";

interface Parsed {
  lat: number;
  lng: number;
}

function parseLatLng(raw: string): Parsed | null {
  if (!raw) return null;
  const nums = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  if (nums.length !== 2) return null;

  const [a, b] = nums;

  const validLatLng = Math.abs(a) <= 90 && Math.abs(b) <= 180;
  const validLngLat = Math.abs(a) <= 180 && Math.abs(b) <= 90;

  if (validLatLng) return { lat: a, lng: b };
  if (validLngLat) return { lat: b, lng: a };
  return null;
}

export function FlyToInput() {
  const { getMap } = useMapContext();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // Remove marker if input becomes empty
  useEffect(() => {
    if (value.trim() === "" && markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, []);

  const flyTo = () => {
    const map = getMap();
    if (!map) return;

    const parsed = parseLatLng(value);
    if (!parsed) {
      setError("Enter as: lat, lng");
      return;
    }
    setError(null);

    map.flyTo({
      center: [parsed.lng, parsed.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 800,
    });

    if (markerRef.current) {
      markerRef.current.setLngLat([parsed.lng, parsed.lat]);
    } else {
      markerRef.current = new maplibregl.Marker({ color: "#059669" })
        .setLngLat([parsed.lng, parsed.lat])
        .addTo(map);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <Navigation className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") flyTo();
            if (e.key === "Escape") setValue(""); // clears input → useEffect removes marker
          }}
          placeholder="lat, lng"
          className={[
            "w-40 rounded-md border bg-white pl-7 pr-2 py-1 text-xs outline-none transition",
            error
              ? "border-red-300 focus:border-red-500"
              : "border-slate-200 focus:border-emerald-500",
          ].join(" ")}
          title="Fly to coordinates (Esc to clear)"
        />
      </div>
      <button
        onClick={flyTo}
        disabled={!value.trim()}
        className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"
        title="Fly to (Enter)"
      >
        Go
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
