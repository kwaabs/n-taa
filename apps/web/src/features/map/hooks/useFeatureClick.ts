import { useEffect } from "react";
import { useMapContext } from "../context/MapContext";
import { useLayers } from "@/features/layers/hooks";
import { useLayersStore } from "@/features/layers/store";
import { useSelectionStore } from "@/features/features/store";
import { useMeasureStore } from "@/features/spatial/measureStore";
import { useSelectStore } from "@/features/spatial/selectStore";
import type { Layer } from "@/features/layers/types";

const STYLE_SUFFIXES = ["__circle", "__line", "__fill"] as const;

function styleLayerIdsFor(layer: Layer): string[] {
  return STYLE_SUFFIXES.map((s) => `${layer.name}${s}`);
}

/**
 * Handles feature clicks + hover cursor.
 * Stands down while the user is actively drawing a measurement or a selection
 * (both toolbars have a `frozen` state — during "frozen", feature clicks resume).
 */
export function useFeatureClick() {
  const { getMap } = useMapContext();
  const { data: layers } = useLayers();
  const visibleIds = useLayersStore((s) => s.visibleIds);
  const setSelection = useSelectionStore((s) => s.setSelection);

  const measureMode = useMeasureStore((s) => s.mode);
  const measureFrozen = useMeasureStore((s) => s.frozen);
  const selectMode = useSelectStore((s) => s.mode);
  const selectFrozen = useSelectStore((s) => s.frozen);

  useEffect(() => {
    const map = getMap();
    if (!map || !layers) return;

    // Bail while the user is actively drawing something.
    // "Frozen" means the tool is done, so clicks may resume.
    const measuring = measureMode !== "off" && !measureFrozen;
    const selecting = selectMode !== "off" && !selectFrozen;
    if (measuring || selecting) {
      map.getCanvas().style.cursor = "";
      return;
    }

    const visibleLayers = layers.filter((l) => visibleIds.has(l.id));
    const styleLayerIds = visibleLayers
      .flatMap(styleLayerIdsFor)
      .filter((id) => map.getLayer(id));

    if (styleLayerIds.length === 0) {
      map.getCanvas().style.cursor = "";
      return;
    }

    const styleIdToLayer = new Map<string, Layer>();
    for (const layer of visibleLayers) {
      for (const styleId of styleLayerIdsFor(layer)) {
        styleIdToLayer.set(styleId, layer);
      }
    }

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: styleLayerIds,
      });
      if (hits.length === 0) {
        setSelection(null);
        return;
      }

      const hit = hits[0];
      const layer = styleIdToLayer.get(hit.layer.id);
      if (!layer) return;

      const rawId = hit.id ?? (hit.properties?.ogc_fid as number | undefined);
      if (rawId == null) return;

      const ogcFid = Number(rawId);
      if (!Number.isFinite(ogcFid)) return;

      setSelection({
        layerId: layer.id,
        layerName: layer.display_name,
        ogcFid,
      });
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: styleLayerIds,
      });
      map.getCanvas().style.cursor = hits.length ? "pointer" : "";
    };

    map.on("click", onClick);
    map.on("mousemove", onMove);

    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
      map.getCanvas().style.cursor = "";
    };
  }, [
    getMap,
    layers,
    visibleIds,
    setSelection,
    measureMode,
    measureFrozen,
    selectMode,
    selectFrozen,
  ]);
}
