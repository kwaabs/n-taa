import type { Layer } from "@/features/layers/types";

/**
 * Priority for a data layer: lower = drawn first (bottom).
 *   1 = polygons
 *   2 = lines
 *   3 = points
 * Falls back to 3 for unknown types.
 */
export function layerPriority(layer: Layer): number {
  const t = layer.geometry_type;
  if (t === "Polygon" || t === "MultiPolygon") return 1;
  if (t === "LineString" || t === "MultiLineString") return 2;
  if (t === "Point" || t === "MultiPoint") return 3;
  return 3;
}

/**
 * Sort data layers by cartographic priority.
 * Ties broken by display_name for deterministic ordering.
 */
export function sortByPriority(layers: Layer[]): Layer[] {
  return [...layers].sort((a, b) => {
    const pa = layerPriority(a);
    const pb = layerPriority(b);
    if (pa !== pb) return pa - pb;
    return a.display_name.localeCompare(b.display_name);
  });
}
