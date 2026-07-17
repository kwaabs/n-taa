import { useEffect } from "react";
import type maplibregl from "maplibre-gl";

import { useMapContext } from "../context/MapContext";
import { useLayers } from "@/features/layers/hooks";
import { useLayersStore } from "@/features/layers/store";
import { applyLayerStyle } from "./layerStyle";
import { sortByPriority, layerPriority } from "./layerOrder";
import type { Layer } from "@/features/layers/types";

const STYLE_SUFFIXES = [
  "__circle",
  "__line",
  "__fill",
  "__outline",
  "__centroid",
] as const;

// A dummy top-of-stack layer. Every data layer is inserted BELOW it.
// Overlays (selection highlight, query, measure) are added AFTER data
// layers and naturally sit above the marker.
const TOP_MARKER = "__top_marker__";

function ensureTopMarker(map: maplibregl.Map) {
  if (map.getLayer(TOP_MARKER)) return;
  if (!map.getSource(TOP_MARKER)) {
    map.addSource(TOP_MARKER, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  map.addLayer({
    id: TOP_MARKER,
    type: "circle",
    source: TOP_MARKER,
    paint: { "circle-radius": 0 },
  });
}

function styleLayerIdsFor(layer: Layer): string[] {
  return STYLE_SUFFIXES.map((s) => `${layer.name}${s}`);
}

function addLayerToMap(map: maplibregl.Map, layer: Layer) {
  const sourceId = layer.name;
  if (map.getSource(sourceId)) return;

  map.addSource(sourceId, {
    type: "vector",
    tiles: [layer.tile_url],
    minzoom: 0,
    maxzoom: 22,
  });

  // const sourceLayer = `${layer.schema_name}.${layer.table_name}`;
  const sourceLayer = layer.table_name;
  applyLayerStyle(map, layer, sourceId, sourceLayer);
}

function removeLayerFromMap(map: maplibregl.Map, layer: Layer) {
  const sourceId = layer.name;
  for (const suffix of STYLE_SUFFIXES) {
    const id = `${sourceId}${suffix}`;
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

/**
 * Re-orders every currently mounted data layer so that the map draws:
 *   polygons  → lines → points
 * from bottom to top. All data layers stay below TOP_MARKER; overlays
 * (added after) stay above.
 */
function reorderMountedLayers(map: maplibregl.Map, sortedLayers: Layer[]) {
  ensureTopMarker(map);
  // Iterate in priority order and move each mounted style layer to just
  // BEFORE the top marker. The last one moved ends up nearest the marker.
  // Because we iterate low→high priority, higher priority ends up on top.
  for (const layer of sortedLayers) {
    for (const styleId of styleLayerIdsFor(layer)) {
      if (map.getLayer(styleId)) {
        try {
          map.moveLayer(styleId, TOP_MARKER);
        } catch {
          // ignore transient move errors during initial paint
        }
      }
    }
  }
}

export function useLayerRenderer() {
  const { getMap } = useMapContext();
  const { data: layers } = useLayers();
  const visibleIds = useLayersStore((s) => s.visibleIds);

  useEffect(() => {
    const map = getMap();
    if (!map || !layers) return;

    const applyAll = () => {
      if (!map.isStyleLoaded()) return;

      ensureTopMarker(map);

      const sorted = sortByPriority(layers);

      // Add missing + remove obsolete
      for (const layer of sorted) {
        const shouldBeOn = visibleIds.has(layer.id);
        const isOn = !!map.getSource(layer.name);
        if (shouldBeOn && !isOn) addLayerToMap(map, layer);
        if (!shouldBeOn && isOn) removeLayerFromMap(map, layer);
      }

      // Enforce z-order across every mounted layer, every reconcile.
      const mounted = sorted.filter((l) => visibleIds.has(l.id));
      reorderMountedLayers(map, mounted);
    };

    applyAll();

    const onStyle = () => applyAll();
    map.on("styledata", onStyle);
    map.on("idle", applyAll);

    return () => {
      map.off("styledata", onStyle);
      map.off("idle", applyAll);
    };
  }, [getMap, layers, visibleIds]);
}

// Re-export so consumers can inspect priority if useful.
export { layerPriority, sortByPriority };
