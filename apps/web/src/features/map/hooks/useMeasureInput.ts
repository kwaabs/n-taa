import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapContext } from "../context/MapContext";
import { useMeasureStore } from "@/features/spatial/measureStore";
import { useSelectStore } from "@/features/spatial/selectStore";

export function useMeasureInput() {
  const { getMap } = useMapContext();
  const mode = useMeasureStore((s) => s.mode);
  const frozen = useMeasureStore((s) => s.frozen);
  const addVertex = useMeasureStore((s) => s.addVertex);
  const setCursor = useMeasureStore((s) => s.setCursor);
  const finish = useMeasureStore((s) => s.finish);
  const cancel = useMeasureStore((s) => s.cancel);

  const selectMode = useSelectStore((s) => s.mode);
  const selectFrozen = useSelectStore((s) => s.frozen);

  useEffect(() => {
    const map = getMap();
    if (!map) return;

    const measuring = mode !== "off" && !frozen;
    const selecting = selectMode !== "off" && !selectFrozen;

    // Bail if measure is off/frozen OR if select is actively drawing
    if (!measuring || selecting) {
      map.getCanvas().style.cursor = "";
      return;
    }

    map.getCanvas().style.cursor = "crosshair";

    const onClick = (e: maplibregl.MapMouseEvent) => {
      addVertex([e.lngLat.lng, e.lngLat.lat]);
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      setCursor([e.lngLat.lng, e.lngLat.lat]);
    };
    const onLeave = () => setCursor(null);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") cancel();
      if (ev.key === "Enter") finish();
    };

    map.on("click", onClick);
    map.on("mousemove", onMove);
    map.on("mouseout", onLeave);
    window.addEventListener("keydown", onKey);

    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
      map.off("mouseout", onLeave);
      window.removeEventListener("keydown", onKey);
      map.getCanvas().style.cursor = "";
    };
  }, [
    getMap,
    mode,
    frozen,
    addVertex,
    setCursor,
    finish,
    cancel,
    selectMode,
    selectFrozen,
  ]);
}
