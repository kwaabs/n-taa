import { useCallback } from "react";
import type maplibregl from "maplibre-gl";

// The basemap is a single raster layer with id "basemap" (see buildBasemapStyle).
const BASEMAP_LAYER_ID = "basemap";

export function useBasemapToggle() {
  const setBasemapVisible = useCallback(
    (map: maplibregl.Map | null, visible: boolean) => {
      if (!map) return;
      if (!map.getLayer(BASEMAP_LAYER_ID)) return;

      map.setLayoutProperty(
        BASEMAP_LAYER_ID,
        "visibility",
        visible ? "visible" : "none",
      );

      // White background when basemap is hidden (clean for printing);
      // restore default when shown again.
      map.getContainer().style.background = visible ? "" : "#ffffff";
    },
    [],
  );

  return { setBasemapVisible };
}
