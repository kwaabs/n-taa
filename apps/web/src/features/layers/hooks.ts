import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Layer } from "./types";

export function useLayers() {
  return useQuery({
    queryKey: ["layers"],
    queryFn: () => api<Layer[]>("/api/v1/layers"),
  });
}
