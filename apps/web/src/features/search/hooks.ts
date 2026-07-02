import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSearchStore } from "./store";
import type { FieldInfo, Filter } from "./types";
import type { Feature } from "@/features/features/types";

export function useLayerSchema(layerId: string | null) {
  return useQuery({
    queryKey: ["layer-schema", layerId],
    queryFn: () => api<FieldInfo[]>(`/api/v1/layers/${layerId}/schema`),
    enabled: !!layerId,
    staleTime: 10 * 60_000,
  });
}

/**
 * Explicit search: user clicks "Search" → runs one paginated query
 * (first page + total), stores results.
 *
 * NOTE: we intentionally fetch a single page (up to 500) here. If we
 * need more, the ResultsTable can call the paginated endpoint the
 * usual way. This mutation is for the FIRST hit that opens the table.
 */
export function useRunSearch() {
  const startSearch = useSearchStore((s) => s.startSearch);
  const setResults = useSearchStore((s) => s.setResults);
  const setError = useSearchStore((s) => s.setError);

  return useMutation({
    mutationFn: async (vars: { layerId: string; query: Filter }) => {
      startSearch(vars.layerId, vars.query);

      // World bounds so we don't need a spatial context — searches are attribute-only.
      const worldBounds = {
        type: "Polygon",
        coordinates: [
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ],
        ],
      };

      const res = await api<{
        type: "FeatureCollection";
        features: Feature[];
        total_count?: number;
        estimated_count?: boolean;
      }>(`/api/v1/layers/${vars.layerId}/features/query`, {
        method: "POST",
        body: {
          within: worldBounds,
          filters: vars.query,
          limit: 500,
          include_count: true,
        },
      });

      setResults(
        res.features,
        res.total_count ?? null,
        res.estimated_count ?? false,
      );
      return res;
    },
    onError: (err) =>
      setError((err as { message?: string }).message ?? "Search failed"),
  });
}
