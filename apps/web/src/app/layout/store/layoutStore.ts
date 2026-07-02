import { create } from "zustand";

type SidebarSection = "layers" | "search" | "tools" | "settings";

interface LayoutState {
  sidebarOpen: boolean;
  activeSection: SidebarSection;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveSection: (section: SidebarSection) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: true,
  activeSection: "layers",
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveSection: (section) => set({ activeSection: section }),
}));
