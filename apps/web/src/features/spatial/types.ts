import type { Feature, FeatureCollection } from "@/features/features/types";

export type GeoJsonGeometry = Feature["geometry"];

export interface CountResponse {
  count: number;
}

export type { Feature, FeatureCollection };
