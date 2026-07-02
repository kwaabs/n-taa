import { create } from "zustand";
import type { Feature } from "@/features/features/types";

export interface BufferMenuAnchor {
  x: number;
  y: number;
  clickLngLat: [number, number]; // ← ADD
  sourceFeature: Feature;
  sourceLayerName: string;
}

interface BufferState {
  menu: BufferMenuAnchor | null;
  openMenu: (anchor: BufferMenuAnchor) => void;
  closeMenu: () => void;
}

export const useBufferStore = create<BufferState>((set) => ({
  menu: null,
  openMenu: (anchor) => set({ menu: anchor }),
  closeMenu: () => set({ menu: null }),
}));
