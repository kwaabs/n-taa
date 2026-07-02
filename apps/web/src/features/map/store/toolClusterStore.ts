import { create } from "zustand";

interface ToolClusterState {
  expanded: boolean;
  toggle: () => void;
  setExpanded: (v: boolean) => void;
}

export const useToolClusterStore = create<ToolClusterState>((set) => ({
  expanded: true,
  toggle: () => set((s) => ({ expanded: !s.expanded })),
  setExpanded: (v) => set({ expanded: v }),
}));
