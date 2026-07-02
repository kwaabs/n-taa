import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useFiltersStore } from "./store";
import { hasAnyCondition } from "./types";
import type { FieldInfo, Filter } from "./types";

/**
 * Fetches the layer's field catalog (name, type, distinct values).
 * Cached ~10 minutes — schemas don't change during a session.
 */
export function useLayerSchema(layerId: string | null) {
  return useQuery({
    queryKey: ["layer-schema", layerId],
    queryFn: () => api<FieldInfo[]>(`/api/v1/layers/${layerId}/schema`),
    enabled: !!layerId,
    staleTime: 10 * 60_000,
  });
}

/**
 * Reactive filter for a layer.
 * Returns undefined if no effective filter is set — so we don't send noise
 * over the wire.
 */
export function useLayerFilter(
  layerId: string | null | undefined,
): Filter | undefined {
  const filter = useFiltersStore((s) =>
    layerId ? s.byLayer[layerId] : undefined,
  );
  if (!filter) return undefined;
  return hasAnyCondition(filter) ? filter : undefined;
}
