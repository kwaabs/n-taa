import { create } from "zustand";
import type { Feature } from "./types";

export interface Selection {
  layerId: string;
  layerName: string;
  ogcFid: number;
}

export interface LocalSelection {
  layerName: string; // e.g. "Custom Selection"
  feature: Feature; // a synthesized GeoJSON Feature
}

interface SelectionState {
  selection: Selection | null;
  local: LocalSelection | null;

  setSelection: (s: Selection | null) => void;
  setLocal: (l: LocalSelection | null) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selection: null,
  local: null,

  setSelection: (s) => set({ selection: s, local: null }),
  setLocal: (l) => set({ selection: null, local: l }),
  clear: () => set({ selection: null, local: null }),
}));
