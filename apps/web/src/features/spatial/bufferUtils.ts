import * as turf from "@turf/turf";
import type { Feature } from "@/features/features/types";

/**
 * Buffer a feature by `radiusMeters` and return a Polygon Feature.
 * Uses Turf's geodesic buffer (respects lat/lon accurately at any latitude).
 */
export function bufferFeature(
  source: Feature,
  radiusMeters: number,
): Feature | null {
  if (!source.geometry) return null;
  const km = radiusMeters / 1000;

  const buffered = turf.buffer(source.geometry as any, km, {
    units: "kilometers",
  });
  if (!buffered) return null;

  return {
    type: "Feature",
    id: Number(`buffer-${source.id}-${radiusMeters}`),
    geometry: buffered.geometry as Feature["geometry"],
    properties: {
      buffer_radius_m: radiusMeters,
      source_layer: (source.properties as any)?._source_layer ?? "",
      source_id: source.id,
    },
  };
}

/**
 * Format a metric distance for UI labels ("500 m", "1.5 km").
 */

/**
 * Buffer around either the source feature (respecting its shape)
 * or a single click point (always a circle).
 */
export function bufferAround(
  clickLngLat: [number, number],
  source: Feature,
  radiusMeters: number,
  wholeFeature: boolean,
): Feature | null {
  const km = radiusMeters / 1000;

  const target: any = wholeFeature
    ? source.geometry
    : { type: "Point", coordinates: clickLngLat };

  if (!target) return null;

  const buffered = turf.buffer(target, km, { units: "kilometers" });
  if (!buffered) return null;

  return {
    type: "Feature",
    id: `buffer-${source.id}-${radiusMeters}-${wholeFeature ? "whole" : "point"}`,
    geometry: buffered.geometry as Feature["geometry"],
    properties: {
      buffer_radius_m: radiusMeters,
      source_id: source.id,
      whole_feature: wholeFeature,
    },
  };
}

export function formatRadius(m: number): string {
  if (m < 1000) return `${m} m`;
  const km = m / 1000;
  return `${km % 1 === 0 ? km : km.toFixed(1)} km`;
}
