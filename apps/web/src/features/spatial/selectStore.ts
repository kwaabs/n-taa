import { create } from "zustand";

export type SelectMode = "off" | "polygon";

interface SelectState {
  mode: SelectMode;
  frozen: boolean;
  vertices: [number, number][];
  cursor: [number, number] | null;

  setMode: (mode: SelectMode) => void;
  addVertex: (v: [number, number]) => void;
  setCursor: (c: [number, number] | null) => void;
  finish: () => void;
  cancel: () => void;
}

export const useSelectStore = create<SelectState>((set) => ({
  mode: "off",
  frozen: false,
  vertices: [],
  cursor: null,

  setMode: (mode) =>
    set(() => ({ mode, frozen: false, vertices: [], cursor: null })),

  addVertex: (v) =>
    set((s) => (s.frozen ? s : { vertices: [...s.vertices, v] })),

  setCursor: (c) => set((s) => (s.frozen ? { cursor: null } : { cursor: c })),

  finish: () =>
    set((s) => (s.vertices.length >= 3 ? { frozen: true, cursor: null } : s)),

  cancel: () => set({ mode: "off", frozen: false, vertices: [], cursor: null }),
}));
