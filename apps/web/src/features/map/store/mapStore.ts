import { create } from "zustand";
import type { MapLayerConfig, MapViewState, SelectedFeature } from "../types";
import { DEFAULT_BASEMAP_ID } from "../basemaps/basemaps";

interface MapStoreState {
  view: MapViewState;
  layers: MapLayerConfig[];
  selectedFeature: SelectedFeature | null;
  activeTool: "pan" | "select" | "measure" | "draw";
  basemapId: string;

  setView: (view: Partial<MapViewState>) => void;
  toggleLayer: (layerId: string) => void;
  setSelectedFeature: (feature: SelectedFeature | null) => void;
  setActiveTool: (tool: MapStoreState["activeTool"]) => void;
  setBasemap: (basemapId: string) => void;
}

export const useMapStore = create<MapStoreState>((set) => ({
  view: {
    center: [-0.1869, 5.6037],
    zoom: 11,
  },
  layers: [],
  selectedFeature: null,
  activeTool: "pan",
  basemapId: DEFAULT_BASEMAP_ID,

  setView: (view) => set((state) => ({ view: { ...state.view, ...view } })),

  toggleLayer: (layerId) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === layerId ? { ...l, visible: !l.visible } : l,
      ),
    })),

  setSelectedFeature: (feature) => set({ selectedFeature: feature }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setBasemap: (basemapId) => set({ basemapId }),
}));
