import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapContext } from "../context/MapContext";
import { useSelectStore } from "@/features/spatial/selectStore";

const SRC = "__select__";
const FILL = "__select_fill";
const LINE = "__select_line";
const VERTICES = "__select_vertices";
const CURSOR = "__select_cursor";

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
      paint: { "fill-color": "#06b6d4", "fill-opacity": 0.12 },
    });
  }
  if (!map.getLayer(LINE)) {
    map.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      filter: ["==", ["get", "kind"], "line"],
      paint: {
        "line-color": "#0891b2",
        "line-width": 2.5,
        "line-dasharray": [2, 2],
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
        "circle-stroke-color": "#0891b2",
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
        "circle-color": "#0891b2",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.75,
      },
    });
  }
}

export function useSelectRenderer() {
  const { getMap } = useMapContext();
  const mode = useSelectStore((s) => s.mode);
  const vertices = useSelectStore((s) => s.vertices);
  const cursor = useSelectStore((s) => s.cursor);

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

      const activePath = cursor ? [...vertices, cursor] : vertices;
      const features: GeoJSON.Feature[] = [];

      if (activePath.length >= 2) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: activePath },
          properties: { kind: "line" },
        });
      }
      if (activePath.length >= 3) {
        const ring = [...activePath, activePath[0]];
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [ring] },
          properties: { kind: "polygon" },
        });
      }
      for (const v of vertices) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: v },
          properties: { kind: "vertex" },
        });
      }
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
