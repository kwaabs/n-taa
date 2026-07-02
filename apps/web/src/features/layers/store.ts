import { create } from "zustand";

interface LayersState {
  visibleIds: Set<string>;
  toggle: (id: string) => void;
  setVisible: (id: string, visible: boolean) => void;
  clear: () => void;
}

export const useLayersStore = create<LayersState>((set) => ({
  visibleIds: new Set<string>(),
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.visibleIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { visibleIds: next };
    }),
  setVisible: (id, visible) =>
    set((state) => {
      const next = new Set(state.visibleIds);
      if (visible) next.add(id);
      else next.delete(id);
      return { visibleIds: next };
    }),
  clear: () => set({ visibleIds: new Set() }),
}));
