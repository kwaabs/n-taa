import { useMapContext } from "../context/MapContext";
import type { MapInstance } from "../types";

export function useMap(): MapInstance | null {
  const { getMap } = useMapContext();
  return getMap();
}
