import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapContext } from "../context/MapContext";
import { useSelectStore } from "@/features/spatial/selectStore";
import { useMeasureStore } from "@/features/spatial/measureStore";

export function useSelectInput() {
  const { getMap } = useMapContext();
  const mode = useSelectStore((s) => s.mode);
  const frozen = useSelectStore((s) => s.frozen);
  const addVertex = useSelectStore((s) => s.addVertex);
  const setCursor = useSelectStore((s) => s.setCursor);
  const finish = useSelectStore((s) => s.finish);
  const cancel = useSelectStore((s) => s.cancel);

  const measureMode = useMeasureStore((s) => s.mode);
  const measureFrozen = useMeasureStore((s) => s.frozen);

  useEffect(() => {
    const map = getMap();
    if (!map) return;

    const selecting = mode !== "off" && !frozen;
    const measuring = measureMode !== "off" && !measureFrozen;

    if (!selecting || measuring) {
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
    measureMode,
    measureFrozen,
  ]);
}
