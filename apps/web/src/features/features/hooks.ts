import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Feature } from "./types";

export function useFeature(layerId: string | null, ogcFid: number | null) {
  return useQuery({
    queryKey: ["feature", layerId, ogcFid],
    queryFn: () => api<Feature>(`/api/v1/layers/${layerId}/features/${ogcFid}`),
    enabled: !!layerId && ogcFid != null,
  });
}
