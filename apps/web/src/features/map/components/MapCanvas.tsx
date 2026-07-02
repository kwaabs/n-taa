import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { useMapContext } from "../context/MapContext";
import { useMapStore } from "../store/mapStore";
import { useLayoutStore } from "@/app/layout/store/layoutStore";
import { BASEMAPS, buildBasemapStyle } from "../basemaps/basemaps";

import { useSpriteLoader } from "../hooks/useSpriteLoader";
import { useLayerRenderer } from "../hooks/useLayerRenderer";
import { useFeatureClick } from "../hooks/useFeatureClick";
import { useSelectionHighlight } from "../hooks/useSelectionHighlight";
import { useSelectionStore } from "@/features/features/store";

import { useQueryHighlight } from "../hooks/useQueryHighlight";

import { useMeasureRenderer } from "../hooks/useMeasureRenderer";
import { useMeasureInput } from "../hooks/useMeasureInput";

import { useSelectRenderer } from "../hooks/useSelectRenderer";
import { useSelectInput } from "../hooks/useSelectInput";

import { useTableStore } from "@/features/spatial/tableStore";

import { useFeatureContextMenu } from "../hooks/useFeatureContextMenu";

import { useBufferRenderer } from "../hooks/useBufferRenderer";

import { useTraceHighlight } from "../hooks/useTraceHighlight";
import { useSearchHighlight } from "../hooks/useSearchHighlight";

interface MapCanvasProps {
  className?: string;
}

export function MapCanvas({ className }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastBasemapRef = useRef<string | null>(null);
  const { setMap, mapRef } = useMapContext();

  const view = useMapStore((s) => s.view);
  const setView = useMapStore((s) => s.setView);
  const basemapId = useMapStore((s) => s.basemapId);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);

  // ─── Initialize map once ─────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const initialBasemap = BASEMAPS[basemapId] ?? Object.values(BASEMAPS)[0];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildBasemapStyle(initialBasemap),
      center: view.center,
      zoom: view.zoom,
      bearing: view.bearing ?? 0,
      pitch: view.pitch ?? 0,
      attributionControl: { compact: true },
      preserveDrawingBuffer: true, // ← ADD (small perf cost, enables map capture)
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("moveend", () => {
      const c = map.getCenter();
      setView({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
    });

    setMap(map);

    if (import.meta.env.DEV) (window as any).__map = map; // ← add this line

    return () => {
      map.remove();
      mapRef.current = null;
      lastBasemapRef.current = null;
    };
    // Intentionally mount-once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── React to basemap changes (guarded) ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const basemap = BASEMAPS[basemapId];
    if (!basemap) return;

    // Skip if this is already the loaded basemap.
    // Guards against React StrictMode double-invocation on mount.
    if (lastBasemapRef.current === basemapId) return;

    const applySwap = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();

      map.setStyle(buildBasemapStyle(basemap));

      map.once("styledata", () => {
        map.jumpTo({ center, zoom, bearing, pitch });
        lastBasemapRef.current = basemapId;
      });
    };

    if (map.isStyleLoaded()) {
      // First mount: current style IS the initial basemap.
      // Just record it and skip the swap so MapLibre doesn't warn.
      if (lastBasemapRef.current === null) {
        lastBasemapRef.current = basemapId;
        return;
      }
      applySwap();
    } else {
      // Style still loading — wait for idle, then decide.
      const onIdle = () => {
        if (lastBasemapRef.current === null) {
          lastBasemapRef.current = basemapId;
          return;
        }
        applySwap();
      };
      map.once("idle", onIdle);
    }
  }, [basemapId, mapRef]);

  // ─── Resize on sidebar toggle ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.resize(), 200);
    return () => clearTimeout(t);
  }, [sidebarOpen, mapRef]);

  // ─── Esc clears selection ────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        useSelectionStore.getState().clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Priority: close table first, then selection
        const table = useTableStore.getState();
        if (table.open) {
          table.close();
          return;
        }
        useSelectionStore.getState().clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ─── Data-layer wiring ───────────────────────────────
  // Order matters: sprites first, then layers, then click, then highlight.
  useSpriteLoader();
  useLayerRenderer();
  useFeatureClick();
  useSelectionHighlight();
  useQueryHighlight();
  useMeasureRenderer();
  useMeasureInput();
  useSelectRenderer(); // ← ADD
  useSelectInput(); // ← ADD
  useFeatureContextMenu(); // ← ADD
  useBufferRenderer(); // ← ADD

  useSearchHighlight();

  useTraceHighlight(); // ← ADD

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full"}
      data-testid="map-canvas"
      onContextMenu={(e) => e.preventDefault()} // ← ADD
    />
  );
}
