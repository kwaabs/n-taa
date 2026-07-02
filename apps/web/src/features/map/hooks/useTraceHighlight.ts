import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapContext } from "../context/MapContext";
import { useTraceStore } from "@/features/features/traceStore";

const SRC = "__trace__";
const LINE = "__trace_line";
const LINE_GLOW = "__trace_line_glow";
const XFMR_HALO = "__trace_xfmr_halo";
const XFMR_CIRCLE = "__trace_xfmr_circle";

function ensureLayers(map: maplibregl.Map) {
  if (!map.getSource(SRC)) {
    map.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(LINE_GLOW)) {
    map.addLayer({
      id: LINE_GLOW,
      type: "line",
      source: SRC,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#06b6d4",
        "line-width": 12,
        "line-opacity": 0.25,
        "line-blur": 2,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }
  if (!map.getLayer(LINE)) {
    map.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#0891b2",
        "line-width": 3,
        "line-opacity": 0.9,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }
  if (!map.getLayer(XFMR_HALO)) {
    map.addLayer({
      id: XFMR_HALO,
      type: "circle",
      source: SRC,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 10,
        "circle-color": "#06b6d4",
        "circle-opacity": 0.25,
        "circle-blur": 0.5,
      },
    });
  }
  if (!map.getLayer(XFMR_CIRCLE)) {
    map.addLayer({
      id: XFMR_CIRCLE,
      type: "circle",
      source: SRC,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#0891b2",
        "circle-stroke-width": 2,
      },
    });
  }
}

export function useTraceHighlight() {
  const { getMap } = useMapContext();
  const primary = useTraceStore((s) => s.primary);
  const companions = useTraceStore((s) => s.companions);
  const transformers = useTraceStore((s) => s.transformers);

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

      const features: GeoJSON.Feature[] = [];

      if (primary?.geometry) {
        features.push({
          type: "Feature",
          geometry: primary.geometry as GeoJSON.Geometry,
          properties: {},
        });
      }
      for (const c of companions) {
        if (c.geometry) {
          features.push({
            type: "Feature",
            geometry: c.geometry as GeoJSON.Geometry,
            properties: {},
          });
        }
      }
      if (transformers && transformers.coordinates.length > 0) {
        for (const coord of transformers.coordinates) {
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: coord },
            properties: {},
          });
        }
      }

      src.setData({ type: "FeatureCollection", features });
    };

    if (map.isStyleLoaded()) paint();
    const onStyle = () => paint();
    map.on("styledata", onStyle);

    return () => {
      map.off("styledata", onStyle);
    };
  }, [getMap, primary, companions, transformers]);
}
