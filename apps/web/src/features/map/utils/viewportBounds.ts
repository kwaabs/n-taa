import type maplibregl from "maplibre-gl";
import type { GeoJsonGeometry } from "@/features/spatial/types";

/**
 * Returns the current map viewport as a GeoJSON Polygon usable as a spatial
 * "within" filter.
 */
export function viewportPolygon(map: maplibregl.Map): GeoJsonGeometry {
  const b = map.getBounds();
  const w = b.getWest();
  const s = b.getSouth();
  const e = b.getEast();
  const n = b.getNorth();

  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  } as GeoJsonGeometry;
}
