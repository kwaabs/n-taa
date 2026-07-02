import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapContext } from "../context/MapContext";
import { useSearchStore } from "@/features/search/store";

const SRC = "__search__";
const CIRCLE = "__search_circle";
const CIRCLE_PULSE = "__search_circle_pulse";
const LINE = "__search_line";
const FILL = "__search_fill";
const FILL_OUTLINE = "__search_fill_outline";

function ensureLayers(map: maplibregl.Map) {
  if (!map.getSource(SRC)) {
    map.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(CIRCLE_PULSE)) {
    map.addLayer({
      id: CIRCLE_PULSE,
      type: "circle",
      source: SRC,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 14,
        "circle-color": "#06b6d4",
        "circle-opacity": 0.28,
        "circle-blur": 0.5,
      },
    });
  }
  if (!map.getLayer(CIRCLE)) {
    map.addLayer({
      id: CIRCLE,
      type: "circle",
      source: SRC,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 6,
        "circle-color": "#06b6d4",
        "circle-stroke-color": "#0e7490",
        "circle-stroke-width": 2,
      },
    });
  }
  if (!map.getLayer(LINE)) {
    map.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#06b6d4",
        "line-width": 4,
        "line-opacity": 0.85,
      },
    });
  }
  if (!map.getLayer(FILL)) {
    map.addLayer({
      id: FILL,
      type: "fill",
      source: SRC,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": "#06b6d4",
        "fill-opacity": 0.2,
      },
    });
    map.addLayer({
      id: FILL_OUTLINE,
      type: "line",
      source: SRC,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": "#0891b2",
        "line-width": 2,
      },
    });
  }
}

// Animate the outer pulse ring by cycling its radius + opacity.
function pulse(map: maplibregl.Map, phase: number) {
  if (!map.getLayer(CIRCLE_PULSE)) return;
  const r = 12 + Math.sin(phase) * 4;
  const o = 0.35 - Math.sin(phase) * 0.15;
  map.setPaintProperty(CIRCLE_PULSE, "circle-radius", r);
  map.setPaintProperty(CIRCLE_PULSE, "circle-opacity", Math.max(0.08, o));
}

export function useSearchHighlight() {
  const { getMap } = useMapContext();
  const results = useSearchStore((s) => s.results);

  useEffect(() => {
    const map = getMap();
    if (!map) return;

    const paint = () => {
      try {
        ensureLayers(map);
      } catch {
        return;
      }
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      if (!results || results.length === 0) {
        src.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      src.setData({
        type: "FeatureCollection",
        features: results.map((f) => ({
          type: "Feature",
          geometry: f.geometry as GeoJSON.Geometry,
          properties: {},
        })),
      });
    };

    if (map.isStyleLoaded()) paint();
    const onStyle = () => paint();
    map.on("styledata", onStyle);

    // ─── Pulse animation loop ─────────────────────────
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (results.length > 0) {
        pulse(map, (now - start) / 400);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      map.off("styledata", onStyle);
    };
  }, [getMap, results]);
}
