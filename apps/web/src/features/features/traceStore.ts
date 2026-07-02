import { create } from "zustand";

export interface FeederSegmentInfo {
  layerName: string;
  tableName: string;
  lengthM: number;
  segmentCount: number;
  geometry: { type: "MultiLineString"; coordinates: number[][][] };
}

export interface TraceState {
  feederKey: string | null;
  keySource: string | null;
  totalLength: number;
  segmentCount: number;
  bounds: [number, number, number, number] | null;

  primary: FeederSegmentInfo | null;
  companions: FeederSegmentInfo[];

  transformerCount: number;
  transformers: { type: "MultiPoint"; coordinates: [number, number][] } | null;

  set: (result: {
    feederKey: string;
    keySource: string;
    totalLength: number;
    segmentCount: number;
    bounds: [number, number, number, number];
    primary: FeederSegmentInfo;
    companions: FeederSegmentInfo[];
    transformerCount?: number;
    transformers?: {
      type: "MultiPoint";
      coordinates: [number, number][];
    } | null;
  }) => void;
  clear: () => void;
}

export const useTraceStore = create<TraceState>((set) => ({
  feederKey: null,
  keySource: null,
  totalLength: 0,
  segmentCount: 0,
  bounds: null,
  primary: null,
  companions: [],
  transformerCount: 0,
  transformers: null,

  set: (r) =>
    set({
      feederKey: r.feederKey,
      keySource: r.keySource,
      totalLength: r.totalLength,
      segmentCount: r.segmentCount,
      bounds: r.bounds,
      primary: r.primary,
      companions: r.companions,
      transformerCount: r.transformerCount ?? 0,
      transformers: r.transformers ?? null,
    }),
  clear: () =>
    set({
      feederKey: null,
      keySource: null,
      totalLength: 0,
      segmentCount: 0,
      bounds: null,
      primary: null,
      companions: [],
      transformerCount: 0,
      transformers: null,
    }),
}));
