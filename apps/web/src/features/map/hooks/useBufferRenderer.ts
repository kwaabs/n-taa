import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapContext } from "../context/MapContext";
import { useSelectionStore } from "@/features/features/store";

const SRC = "__buffer__";
const FILL = "__buffer_fill";
const LINE = "__buffer_line";

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
      paint: {
        "fill-color": "#06b6d4",
        "fill-opacity": 0.1,
      },
    });
  }
  if (!map.getLayer(LINE)) {
    map.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      paint: {
        "line-color": "#0891b2",
        "line-width": 2,
        "line-dasharray": [3, 2],
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }
}

/**
 * Renders the CURRENT buffer feature (if any) as a distinct cyan-dashed overlay.
 * A buffer is a "local" selection whose properties include `buffer_radius_m`.
 */
export function useBufferRenderer() {
  const { getMap } = useMapContext();
  const local = useSelectionStore((s) => s.local);

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

      const isBuffer =
        local?.feature?.properties &&
        typeof (local.feature.properties as Record<string, unknown>)
          .buffer_radius_m === "number";

      if (!isBuffer || !local?.feature?.geometry) {
        src.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: local.feature.geometry as GeoJSON.Geometry,
            properties: {},
          },
        ],
      });
    };

    if (map.isStyleLoaded()) paint();
    const onStyle = () => paint();
    map.on("styledata", onStyle);

    return () => {
      map.off("styledata", onStyle);
    };
  }, [getMap, local]);
}
