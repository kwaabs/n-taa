import { Locate, Loader2 } from "lucide-react";
import { useMapContext } from "@/features/map/context/MapContext";
import { useLayoutStore } from "@/app/layout/store/layoutStore";
import { useLayerBounds } from "./useZoomToLayer";
import type { Layer } from "./types";

interface Props {
  layer: Layer;
}

export function ZoomToLayerButton({ layer }: Props) {
  const { getMap } = useMapContext();
  const { data: bounds, isLoading } = useLayerBounds(layer);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const map = getMap();
    if (!map || !bounds) return;

    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: {
          top: 40,
          bottom: 40,
          left: sidebarOpen ? 340 : 60, // accommodate 320px sidebar + 12px rail
          right: 40,
        },
        maxZoom: 16,
        duration: 600,
      },
    );
  };

  return (
    <button
      onClick={onClick}
      disabled={isLoading || !bounds}
      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
      title={
        isLoading
          ? "Loading extent…"
          : bounds
            ? `Zoom to ${layer.display_name}`
            : "No extent available"
      }
      aria-label="Zoom to layer"
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Locate className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
