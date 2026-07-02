import { create } from "zustand";
import type { Layer } from "@/features/layers/types";
import type { GeoJsonGeometry } from "./types";

/**
 * The results table can be driven two ways:
 *   - "spatial" mode: paginated fetch bounded by a polygon (from Contents flow)
 *   - "search"  mode: displays whatever's in the search store
 */
export type TableMode = "spatial" | "search";

interface TableState {
  layer: Layer | null;
  geometry: GeoJsonGeometry | null;
  mode: TableMode;
  open: boolean;

  showSpatial: (layer: Layer, geometry: GeoJsonGeometry) => void;
  showSearch: (layer: Layer) => void;
  close: () => void;
}

export const useTableStore = create<TableState>((set) => ({
  layer: null,
  geometry: null,
  mode: "spatial",
  open: false,

  showSpatial: (layer, geometry) =>
    set({ layer, geometry, mode: "spatial", open: true }),

  showSearch: (layer) =>
    set({ layer, geometry: null, mode: "search", open: true }),

  close: () => set({ open: false }),
}));
