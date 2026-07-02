import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface FeederSegment {
  layer_name: string;
  table_name: string;
  length_m: number;
  segment_count: number;
  geometry: {
    type: "MultiLineString";
    coordinates: number[][][];
  };
}

interface TraceResult {
  feeder_key: string;
  key_source: "circuit_id" | "other_circuit_id";
  bounds: [number, number, number, number];
  primary: FeederSegment;
  companions?: FeederSegment[];
  total_length_m: number;
  segment_count: number;
  transformer_count?: number;
  transformers?: {
    type: "MultiPoint";
    coordinates: [number, number][];
  };
}

const TRACEABLE_TABLES = new Set<string>([
  "dbo_oh_conductor_11kv_evw",
  "dbo_oh_conductor_33kv_evw",
  "dbo_ug_cable_11kv_evw",
  "dbo_ug_cable_33kv_evw",
]);

/** For a given source layer name, return the label for its companion. */
export function companionLabel(sourceTable: string | undefined): string | null {
  if (!sourceTable) return null;
  const map: Record<string, string> = {
    dbo_oh_conductor_11kv_evw: "Include underground cable (11kV)",
    dbo_oh_conductor_33kv_evw: "Include underground cable (33kV)",
    dbo_ug_cable_11kv_evw: "Include overhead conductor (11kV)",
    dbo_ug_cable_33kv_evw: "Include overhead conductor (33kV)",
  };
  return map[sourceTable] ?? null;
}

export function isTraceable(layerName: string | undefined): boolean {
  return !!layerName && TRACEABLE_TABLES.has(layerName);
}

export function useTraceFeeder() {
  return useMutation({
    mutationFn: (vars: {
      layerId: string;
      ogcFid: number;
      includeCompanion?: boolean;
      includeTransformers?: boolean;
    }) =>
      api<TraceResult>(
        `/api/v1/layers/${vars.layerId}/features/${vars.ogcFid}/trace`,
        {
          method: "POST",
          body: {
            include_companion: vars.includeCompanion ?? false,
            include_transformers: vars.includeTransformers ?? false,
          },
        },
      ),
  });
}
