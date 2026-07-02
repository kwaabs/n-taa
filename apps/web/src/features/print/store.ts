import { create } from "zustand";

export type PrintOrientation = "landscape" | "portrait";
export type PrintFormat = "pdf" | "png";

export interface PrintSettings {
  title: string;
  orientation: PrintOrientation;
  format: PrintFormat;
  includeLegend: boolean;
  includeScale: boolean;
  includeNorthArrow: boolean;
  includeTimestamp: boolean;
  includeAttributeTable: boolean;
}

interface PrintState {
  open: boolean;
  settings: PrintSettings;
  exporting: boolean;

  openModal: () => void;
  closeModal: () => void;
  update: (patch: Partial<PrintSettings>) => void;
  setExporting: (v: boolean) => void;
}

const DEFAULT_SETTINGS: PrintSettings = {
  title: "Map Export",
  orientation: "landscape",
  format: "pdf",
  includeLegend: true,
  includeScale: true,
  includeNorthArrow: true,
  includeTimestamp: true,
  includeAttributeTable: false,
};

export const usePrintStore = create<PrintState>((set) => ({
  open: false,
  settings: DEFAULT_SETTINGS,
  exporting: false,

  openModal: () => set({ open: true }),
  closeModal: () => set({ open: false }),
  update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setExporting: (v) => set({ exporting: v }),
}));
