import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapContext } from "../context/MapContext";
import { useSpatialStore } from "@/features/spatial/store";

const SRC = "__query_result__";
const CIRCLE = "__query_result_circle";
const LINE = "__query_result_line";
const FILL = "__query_result_fill";

function ensureLayers(map: maplibregl.Map) {
  if (!map.getSource(SRC)) {
    map.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(CIRCLE)) {
    map.addLayer({
      id: CIRCLE,
      type: "circle",
      source: SRC,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 8,
        "circle-color": "#06b6d4",
        "circle-stroke-color": "#0e7490",
        "circle-stroke-width": 2,
        "circle-opacity": 0.55,
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
        "line-opacity": 0.75,
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
        "fill-opacity": 0.35,
      },
    });
  }
}

function bboxOf(
  features: GeoJSON.Feature[],
): [number, number, number, number] | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const visit = (coords: unknown): void => {
    if (typeof (coords as number[])[0] === "number") {
      const [x, y] = coords as [number, number];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    for (const c of coords as unknown[]) visit(c);
  };
  for (const f of features) {
    if (!f.geometry) continue;
    // @ts-expect-error narrow geometry shape
    visit(f.geometry.coordinates);
  }
  if (!isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

export function useQueryHighlight() {
  const { getMap } = useMapContext();
  const result = useSpatialStore((s) => s.result);

  useEffect(() => {
    const map = getMap();
    if (!map) return;

    const paint = () => {
      // Always try to ensure layers first — safe to call repeatedly.
      try {
        ensureLayers(map);
      } catch {
        // style not ready yet; will retry on styledata below
        return;
      }

      const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      if (!result || result.features.length === 0) {
        src.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: result.features.map((f) => ({
          type: "Feature",
          geometry: f.geometry as GeoJSON.Geometry,
          properties: {},
        })),
      };
      src.setData(fc);

      const bbox = bboxOf(fc.features);
      if (bbox) {
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 80, duration: 500, maxZoom: 15 },
        );
      }
    };

    // Paint now if style is ready
    if (map.isStyleLoaded()) {
      paint();
    }

    // Also paint whenever the style becomes ready
    // (basemap swap, first-time load races, etc.)
    const onStyle = () => paint();
    map.on("styledata", onStyle);

    return () => {
      map.off("styledata", onStyle);
    };
  }, [getMap, result]);
}
