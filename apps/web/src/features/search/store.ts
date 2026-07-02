import { create } from "zustand";
import type { Feature } from "@/features/features/types";
import type { Filter } from "./types";
import { emptyGroup, hasAnyCondition } from "./types";

interface SearchState {
  /** Query tree being built, per layer. Not applied until user clicks Search. */
  drafts: Record<string, Filter | undefined>;

  /** Latest executed search result. Only one at a time. */
  activeLayerId: string | null;
  activeQuery: Filter | null;
  results: Feature[];
  totalCount: number | null;
  estimated: boolean;
  running: boolean;
  error: string | null;

  // Draft management
  setDraft: (layerId: string, filter: Filter | undefined) => void;
  clearDraft: (layerId: string) => void;
  getDraft: (layerId: string | null) => Filter | undefined;

  // Execution
  startSearch: (layerId: string, query: Filter) => void;
  setResults: (
    features: Feature[],
    totalCount: number | null,
    estimated: boolean,
  ) => void;
  setError: (err: string) => void;
  clearResults: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  drafts: {},
  activeLayerId: null,
  activeQuery: null,
  results: [],
  totalCount: null,
  estimated: false,
  running: false,
  error: null,

  setDraft: (layerId, filter) =>
    set((s) => ({ drafts: { ...s.drafts, [layerId]: filter } })),

  clearDraft: (layerId) =>
    set((s) => {
      const next = { ...s.drafts };
      delete next[layerId];
      return { drafts: next };
    }),

  getDraft: (layerId) => (layerId ? get().drafts[layerId] : undefined),

  startSearch: (layerId, query) =>
    set({
      activeLayerId: layerId,
      activeQuery: query,
      results: [],
      totalCount: null,
      estimated: false,
      running: true,
      error: null,
    }),

  setResults: (features, totalCount, estimated) =>
    set({
      results: features,
      totalCount,
      estimated,
      running: false,
      error: null,
    }),

  setError: (err) => set({ running: false, error: err }),

  clearResults: () =>
    set({
      activeLayerId: null,
      activeQuery: null,
      results: [],
      totalCount: null,
      estimated: false,
      running: false,
      error: null,
    }),
}));

/** Reactive helper — true if the draft for this layer has real conditions. */
export const draftIsRunnable = (f: Filter | undefined) =>
  !!f && hasAnyCondition(f);

export const freshDraft = () => emptyGroup("and");
