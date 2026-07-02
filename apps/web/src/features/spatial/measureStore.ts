import { create } from "zustand";

export type MeasureMode = "off" | "distance" | "area";

interface MeasureState {
  mode: MeasureMode;
  frozen: boolean; // true = measurement locked, no more clicks
  vertices: [number, number][];
  cursor: [number, number] | null;

  setMode: (mode: MeasureMode) => void;
  addVertex: (v: [number, number]) => void;
  setCursor: (c: [number, number] | null) => void;
  finish: () => void;
  cancel: () => void;
}

export const useMeasureStore = create<MeasureState>((set) => ({
  mode: "off",
  frozen: false,
  vertices: [],
  cursor: null,

  // Toggling to a new mode resets everything
  setMode: (mode) =>
    set(() => ({ mode, frozen: false, vertices: [], cursor: null })),

  addVertex: (v) =>
    set((s) => (s.frozen ? s : { vertices: [...s.vertices, v] })),

  setCursor: (c) => set((s) => (s.frozen ? { cursor: null } : { cursor: c })),

  // Lock in the measurement, keep it on screen, stop capturing clicks
  finish: () =>
    set((s) => (s.vertices.length >= 2 ? { frozen: true, cursor: null } : s)),

  // Full reset back to off
  cancel: () => set({ mode: "off", frozen: false, vertices: [], cursor: null }),
}));
