export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface Feature {
  type: "Feature";
  id: number;
  geometry: GeoJsonGeometry | null;
  properties: Record<string, unknown>;
}
