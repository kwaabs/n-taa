import { create } from "zustand";

export type AdminTab = "users" | "layers" | "audit";

interface AdminState {
  open: boolean;
  activeTab: AdminTab;
  openModal: (tab?: AdminTab) => void;
  closeModal: () => void;
  setTab: (tab: AdminTab) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  open: false,
  activeTab: "users",
  openModal: (tab) =>
    set((s) => ({ open: true, activeTab: tab ?? s.activeTab })),
  closeModal: () => set({ open: false }),
  setTab: (tab) => set({ activeTab: tab }),
}));
