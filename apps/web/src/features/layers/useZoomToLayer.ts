import { useQuery } from "@tanstack/react-query";
import type { Layer } from "./types";

interface TileJson {
  bounds?: [number, number, number, number]; // [xmin, ymin, xmax, ymax]
  center?: [number, number, number];
}

/**
 * Fetch a layer's cartographic bounds from Martin's TileJSON.
 * Cached for the session — bounds don't change.
 */
export function useLayerBounds(layer: Layer | null) {
  return useQuery({
    queryKey: ["layer-bounds", layer?.id],
    queryFn: async () => {
      if (!layer) return null;
      // Martin's TileJSON: same URL as the tile without {z}/{x}/{y}
      // e.g. tile_url = "http://localhost:5441/dbo.arrester_evw/{z}/{x}/{y}"
      const base = layer.tile_url.replace(/\/\{z\}\/\{x\}\/\{y\}.*$/, "");
      const res = await fetch(base);
      if (!res.ok) return null;
      const json = (await res.json()) as TileJson;
      return json.bounds ?? null;
    },
    enabled: !!layer,
    staleTime: Infinity, // never re-fetch during session
  });
}
