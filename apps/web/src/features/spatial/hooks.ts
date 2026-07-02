import {
  useInfiniteQuery,
  useMutation,
  useQueries,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GeoJsonGeometry } from "./types";
import type { Feature, FeatureCollection } from "@/features/features/types";
import type { Layer } from "@/features/layers/types";

interface CountResponse {
  count: number;
}

interface PageResponse {
  type: "FeatureCollection";
  features: Feature[];
  total_count?: number;
  estimated_count?: boolean;
  next_cursor?: string;
}

export interface Sort {
  column: string;
  direction: "asc" | "desc";
}

/**
 * Parallel counts per layer for the drawer's Contents panel.
 */
export function useContentsCounts(
  layers: Layer[],
  geometry: GeoJsonGeometry | null,
) {
  return useQueries({
    queries: layers.map((layer) => ({
      queryKey: ["features-count", layer.id, geometry],
      queryFn: () =>
        api<CountResponse>(`/api/v1/layers/${layer.id}/features/count`, {
          method: "POST",
          body: { within: geometry },
        }),
      enabled: !!geometry,
      staleTime: 60_000,
    })),
    combine: (results) =>
      results.map((r, i) => ({
        layer: layers[i],
        count: r.data?.count,
        isLoading: r.isLoading,
        isError: r.isError,
      })),
  });
}

/**
 * One-shot fetch used by the map "Show" (highlight) path.
 * Capped at 5000 by the backend — good enough for rendering markers.
 */

export function useQueryFeatures() {
  return useMutation({
    mutationFn: (vars: {
      layerId: string;
      geometry: GeoJsonGeometry;
      limit?: number;
    }) =>
      api<FeatureCollection>(`/api/v1/layers/${vars.layerId}/features/query`, {
        method: "POST",
        body: { within: vars.geometry, limit: vars.limit ?? 5000 },
      }),
  });
}

/**
 * Paginated fetch used by the results table.
 * Server sorts + counts. Client pages via cursor. 100 rows per page.
 */
interface PagedVars {
  layerId: string | null;
  geometry: GeoJsonGeometry | null;
  sort: Sort | null;
}

export function usePagedFeatures({ layerId, geometry, sort }: PagedVars) {
  // Reactive filter for this layer.

  return useInfiniteQuery({
    // include filter in the key so changes trigger a refetch
    queryKey: ["features-page", layerId, geometry, sort],
    enabled: !!layerId && !!geometry,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const body: Record<string, unknown> = {
        within: geometry,
        limit: 100,
      };
      if (pageParam) body.cursor = pageParam;
      if (sort) body.sort = [sort];
      if (!pageParam) body.include_count = true;

      return api<PageResponse>(`/api/v1/layers/${layerId}/features/query`, {
        method: "POST",
        body,
      });
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 60_000,
  });
}
