import { create } from "zustand";
import type { Filter } from "./types";
import { emptyGroup, hasAnyCondition } from "./types";

interface FiltersState {
  /** Filter tree per layer id. Missing key = no filter for that layer. */
  byLayer: Record<string, Filter | undefined>;

  set: (layerId: string, filter: Filter | undefined) => void;
  clear: (layerId: string) => void;
  clearAll: () => void;
  get: (layerId: string | null | undefined) => Filter | undefined;
  isActive: (layerId: string | null | undefined) => boolean;
}

export const useFiltersStore = create<FiltersState>((set, get) => ({
  byLayer: {},

  set: (layerId, filter) =>
    set((s) => ({
      byLayer: { ...s.byLayer, [layerId]: filter },
    })),

  clear: (layerId) =>
    set((s) => {
      const next = { ...s.byLayer };
      delete next[layerId];
      return { byLayer: next };
    }),

  clearAll: () => set({ byLayer: {} }),

  get: (layerId) => (layerId ? get().byLayer[layerId] : undefined),

  isActive: (layerId) => {
    if (!layerId) return false;
    return hasAnyCondition(get().byLayer[layerId]);
  },
}));

// Small convenience for creating a fresh top-level group in the UI later.
export const freshFilter = () => emptyGroup("and");
