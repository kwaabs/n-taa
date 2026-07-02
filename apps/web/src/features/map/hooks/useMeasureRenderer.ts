import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapContext } from "../context/MapContext";
import { useMeasureStore } from "@/features/spatial/measureStore";

const SRC = "__measure__";
const LINE = "__measure_line";
const FILL = "__measure_fill";
const VERTICES = "__measure_vertices";
const CURSOR = "__measure_cursor";

function ensureLayers(map: maplibregl.Map) {
  if (!map.getSource(SRC)) {
    map.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(FILL)) {
    map.addLayer({
      id: FILL,
      type: "fill",
      source: SRC,
      filter: ["==", ["get", "kind"], "polygon"],
      paint: {
        "fill-color": "#f97316",
        "fill-opacity": 0.15,
      },
    });
  }
  if (!map.getLayer(LINE)) {
    map.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      filter: ["==", ["get", "kind"], "line"],
      paint: {
        "line-color": "#f97316",
        "line-width": 2.5,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }
  if (!map.getLayer(VERTICES)) {
    map.addLayer({
      id: VERTICES,
      type: "circle",
      source: SRC,
      filter: ["==", ["get", "kind"], "vertex"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#f97316",
        "circle-stroke-width": 2.5,
      },
    });
  }
  if (!map.getLayer(CURSOR)) {
    map.addLayer({
      id: CURSOR,
      type: "circle",
      source: SRC,
      filter: ["==", ["get", "kind"], "cursor"],
      paint: {
        "circle-radius": 4,
        "circle-color": "#f97316",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.75,
      },
    });
  }
}

export function useMeasureRenderer() {
  const { getMap } = useMapContext();
  const mode = useMeasureStore((s) => s.mode);
  const vertices = useMeasureStore((s) => s.vertices);
  const cursor = useMeasureStore((s) => s.cursor);

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

      if (mode === "off" || vertices.length === 0) {
        src.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      // Build the shape being measured (line or polygon-in-progress)
      const activePath = cursor ? [...vertices, cursor] : vertices;
      const features: GeoJSON.Feature[] = [];

      if (mode === "distance" && activePath.length >= 2) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: activePath },
          properties: { kind: "line" },
        });
      }

      if (mode === "area" && activePath.length >= 2) {
        // Draw a live-updating line while sketching
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: activePath },
          properties: { kind: "line" },
        });
      }
      if (mode === "area" && activePath.length >= 3) {
        // And a fill for the polygon-in-progress
        const ring = [...activePath, activePath[0]];
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [ring] },
          properties: { kind: "polygon" },
        });
      }

      // Vertices
      for (const v of vertices) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: v },
          properties: { kind: "vertex" },
        });
      }

      // Live cursor
      if (cursor) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: cursor },
          properties: { kind: "cursor" },
        });
      }

      src.setData({ type: "FeatureCollection", features });
    };

    if (map.isStyleLoaded()) paint();
    const onStyle = () => paint();
    map.on("styledata", onStyle);

    return () => {
      map.off("styledata", onStyle);
    };
  }, [getMap, mode, vertices, cursor]);
}
