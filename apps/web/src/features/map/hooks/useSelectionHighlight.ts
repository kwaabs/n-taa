import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapContext } from "../context/MapContext";
import { useSelectionStore } from "@/features/features/store";
import { useFeature } from "@/features/features/hooks";

const SRC_ID = "__selection__";
const CIRCLE_ID = "__selection_circle";
const LINE_ID = "__selection_line";
const FILL_ID = "__selection_fill";
const FILL_OUTLINE_ID = "__selection_fill_outline";

function ensureLayers(map: maplibregl.Map) {
  if (!map.getSource(SRC_ID)) {
    map.addSource(SRC_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(CIRCLE_ID)) {
    map.addLayer({
      id: CIRCLE_ID,
      type: "circle",
      source: SRC_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 7,
        "circle-color": "#facc15",
        "circle-stroke-color": "#111827",
        "circle-stroke-width": 2,
      },
    });
  }
  if (!map.getLayer(LINE_ID)) {
    map.addLayer({
      id: LINE_ID,
      type: "line",
      source: SRC_ID,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#facc15",
        "line-width": 4,
      },
    });
  }
  if (!map.getLayer(FILL_ID)) {
    map.addLayer({
      id: FILL_ID,
      type: "fill",
      source: SRC_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": "#facc15",
        "fill-opacity": 0.35,
      },
    });
    map.addLayer({
      id: FILL_OUTLINE_ID,
      type: "line",
      source: SRC_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": "#f59e0b",
        "line-width": 2,
      },
    });
  }
}

function isBufferFeature(props: unknown): boolean {
  if (!props || typeof props !== "object") return false;
  const p = props as Record<string, unknown>;
  return typeof p.buffer_radius_m === "number";
}

export function useSelectionHighlight() {
  const { getMap } = useMapContext();
  const selection = useSelectionStore((s) => s.selection);
  const local = useSelectionStore((s) => s.local);

  const { data: apiFeature } = useFeature(
    selection?.layerId ?? null,
    selection?.ogcFid ?? null,
  );

  useEffect(() => {
    const map = getMap();
    if (!map) return;

    const paint = () => {
      try {
        ensureLayers(map);
      } catch {
        return;
      }
      const src = map.getSource(SRC_ID) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      // Determine what (if anything) to highlight:
      //   - API-fetched selection → the fetched feature
      //   - Non-buffer local selection → the local feature (draw polygon, etc.)
      //   - Buffer local selection → NOTHING (useBufferRenderer handles it)
      let geometry: GeoJSON.Geometry | null = null;

      if (local?.feature) {
        if (isBufferFeature(local.feature.properties)) {
          // Skip — buffer renderer owns this
        } else if (local.feature.geometry) {
          geometry = local.feature.geometry as GeoJSON.Geometry;
        }
      } else if (apiFeature?.geometry) {
        geometry = apiFeature.geometry as GeoJSON.Geometry;
      }

      if (geometry) {
        src.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry, properties: {} }],
        });
      } else {
        src.setData({ type: "FeatureCollection", features: [] });
      }
    };

    if (map.isStyleLoaded()) paint();
    const onStyle = () => paint();
    map.on("styledata", onStyle);

    return () => {
      map.off("styledata", onStyle);
    };
  }, [getMap, apiFeature, local]);
}
