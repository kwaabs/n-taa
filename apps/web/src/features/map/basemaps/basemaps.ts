import type { StyleSpecification } from "maplibre-gl";

export interface BasemapConfig {
  id: string;
  label: string;
  attribution: string;
  tiles: string[];
  tileSize: number;
  maxZoom: number;
  unofficial?: boolean;
}

export const BASEMAPS: Record<string, BasemapConfig> = {
  "esri-topo": {
    id: "esri-topo",
    label: "ESRI Topographic",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    maxZoom: 19,
    attribution:
      "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, USGS, METI/NASA, USGS, EPA, GEBCO, NOAA, iPC",
  },

  "esri-satellite": {
    id: "esri-satellite",
    label: "ESRI Satellite",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    maxZoom: 19,
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  },

  "google-streets": {
    id: "google-streets",
    label: "Google Streets",
    tiles: [
      "https://mt0.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
      "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
      "https://mt2.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
      "https://mt3.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    ],
    tileSize: 256,
    maxZoom: 20,
    attribution: "&copy; Google",
    unofficial: true,
  },

  "google-satellite": {
    id: "google-satellite",
    label: "Google Satellite",
    tiles: [
      "https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      "https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      "https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    ],
    tileSize: 256,
    maxZoom: 21,
    attribution: "&copy; Google",
    unofficial: true,
  },
};

export const DEFAULT_BASEMAP_ID = "esri-topo";

export function buildBasemapStyle(basemap: BasemapConfig): StyleSpecification {
  return {
    version: 8,
    name: basemap.label,
    sources: {
      basemap: {
        type: "raster",
        tiles: basemap.tiles,
        tileSize: basemap.tileSize,
        maxzoom: basemap.maxZoom,
        attribution: basemap.attribution,
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
      },
    ],
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  };
}
