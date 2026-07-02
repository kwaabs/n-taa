import * as turf from "@turf/turf";

/** Total distance along a polyline in metres. */
export function totalDistanceMeters(vertices: [number, number][]): number {
  if (vertices.length < 2) return 0;
  const line = turf.lineString(vertices);
  return turf.length(line, { units: "kilometers" }) * 1000;
}

/** Polygon area in m². Turf treats the ring as closed by wrapping first-to-last. */
export function polygonAreaMeters(vertices: [number, number][]): number {
  if (vertices.length < 3) return 0;
  // Close the ring
  const ring = [...vertices, vertices[0]];
  const poly = turf.polygon([ring]);
  return turf.area(poly);
}

/** Perimeter of the (possibly not-yet-closed) polygon in metres. */
export function polygonPerimeterMeters(vertices: [number, number][]): number {
  if (vertices.length < 2) return 0;
  const ring = vertices.length >= 3 ? [...vertices, vertices[0]] : vertices;
  const line = turf.lineString(ring);
  return turf.length(line, { units: "kilometers" }) * 1000;
}

export function formatDistance(m: number): string {
  if (m < 1) return `${m.toFixed(2)} m`;
  if (m < 1000) return `${m.toFixed(1)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

export function formatArea(m2: number): string {
  if (m2 < 10_000) return `${m2.toFixed(1)} m²`;
  if (m2 < 1_000_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${(m2 / 1_000_000).toFixed(2)} km²`;
}
