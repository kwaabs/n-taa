import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapContext } from "../context/MapContext";
import { useLayers } from "@/features/layers/hooks";
import { useLayersStore } from "@/features/layers/store";
import { useBufferStore } from "@/features/spatial/bufferStore";
import { useMeasureStore } from "@/features/spatial/measureStore";
import { useSelectStore } from "@/features/spatial/selectStore";
import type { Layer } from "@/features/layers/types";
import type { Feature } from "@/features/features/types";

const STYLE_SUFFIXES = ["__circle", "__line", "__fill"] as const;

function styleLayerIdsFor(layer: Layer): string[] {
  return STYLE_SUFFIXES.map((s) => `${layer.name}${s}`);
}

export function useFeatureContextMenu() {
  const { getMap } = useMapContext();
  const { data: layers } = useLayers();
  const visibleIds = useLayersStore((s) => s.visibleIds);
  const openMenu = useBufferStore((s) => s.openMenu);

  const measureMode = useMeasureStore((s) => s.mode);
  const measureFrozen = useMeasureStore((s) => s.frozen);
  const selectMode = useSelectStore((s) => s.mode);
  const selectFrozen = useSelectStore((s) => s.frozen);

  useEffect(() => {
    const map = getMap();
    if (!map || !layers) return;

    // Bail while a tool is actively drawing.
    const drawing =
      (measureMode !== "off" && !measureFrozen) ||
      (selectMode !== "off" && !selectFrozen);
    if (drawing) return;

    const visibleLayers = layers.filter((l) => visibleIds.has(l.id));
    const styleLayerIds = visibleLayers
      .flatMap(styleLayerIdsFor)
      .filter((id) => map.getLayer(id));

    if (styleLayerIds.length === 0) return;

    const styleIdToLayer = new Map<string, Layer>();
    for (const layer of visibleLayers) {
      for (const styleId of styleLayerIdsFor(layer)) {
        styleIdToLayer.set(styleId, layer);
      }
    }

    const onContext = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      const hits = map.queryRenderedFeatures(e.point, {
        layers: styleLayerIds,
      });
      if (hits.length === 0) return;

      const hit = hits[0];
      const layer = styleIdToLayer.get(hit.layer.id);
      if (!layer) return;

      // Synthesize a Feature to pass into the buffer helper.
      const synth: Feature = {
        type: "Feature",
        id:
          typeof hit.id === "number"
            ? hit.id
            : Number(hit.properties?.ogc_fid ?? 0),
        geometry: hit.geometry as Feature["geometry"],
        properties: hit.properties as Feature["properties"],
      };

      // Position the popup at the mouse.
      openMenu({
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
        clickLngLat: [e.lngLat.lng, e.lngLat.lat],
        sourceFeature: synth,
        sourceLayerName: layer.display_name,
      });
    };

    map.on("contextmenu", onContext);
    return () => {
      map.off("contextmenu", onContext);
    };
  }, [
    getMap,
    layers,
    visibleIds,
    openMenu,
    measureMode,
    measureFrozen,
    selectMode,
    selectFrozen,
  ]);
}
