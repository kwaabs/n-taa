import { createContext, useContext, useRef, type ReactNode } from "react";
import type { MapInstance } from "../types";

interface MapContextValue {
  mapRef: React.MutableRefObject<MapInstance | null>;
  getMap: () => MapInstance | null;
  setMap: (map: MapInstance) => void;
}

const MapContext = createContext<MapContextValue | null>(null);

export function MapProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef<MapInstance | null>(null);

  const value: MapContextValue = {
    mapRef,
    getMap: () => mapRef.current,
    setMap: (map) => {
      mapRef.current = map;
    },
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMapContext must be used within MapProvider");
  return ctx;
}
