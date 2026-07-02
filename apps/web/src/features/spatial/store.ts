import { create } from "zustand";
import type { Feature, GeoJsonGeometry } from "./types";

export interface QueryResult {
  layerId: string;
  layerName: string;
  geometry: GeoJsonGeometry;
  features: Feature[];
}

interface SpatialState {
  result: QueryResult | null;
  setResult: (r: QueryResult | null) => void;
  clear: () => void;
}

export const useSpatialStore = create<SpatialState>((set) => ({
  result: null,
  setResult: (r) => set({ result: r }),
  clear: () => set({ result: null }),
}));
