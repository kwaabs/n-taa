import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

export type Coordinates = [number, number];

export interface MapViewState {
  center: Coordinates;
  zoom: number;
  bearing?: number;
  pitch?: number;
}

export interface MapLayerConfig {
  id: string;
  name: string;
  visible: boolean;
  // We'll expand this when we wire Martin in
  sourceUrl?: string;
  sourceLayer?: string;
  type: "fill" | "line" | "circle" | "symbol" | "raster";
}

export interface SelectedFeature {
  layerId: string;
  featureId: string | number;
  properties: Record<string, unknown>;
  coordinates?: Coordinates;
}

export type MapInstance = MapLibreMap;
export type MapStyle = StyleSpecification | string;
