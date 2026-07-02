import { useEffect, useRef, useState } from "react";
import { useMapContext } from "@/features/map/context/MapContext";
import { useLayers } from "@/features/layers/hooks";
import { useLayersStore } from "@/features/layers/store";
import { useSearchStore } from "@/features/search/store";
import { usePrintStore } from "./store";
import { LayerSwatch } from "@/features/layers/LayerSwatch";
import type { Layer } from "@/features/layers/types";

interface Props {
  /** Ref that consumers use to grab the node for exporting. */
  surfaceRef: React.RefObject<HTMLDivElement | null>;
}

export function PrintPreview({ surfaceRef }: Props) {
  const settings = usePrintStore((s) => s.settings);
  const { getMap } = useMapContext();
  const { data: layers = [] } = useLayers();
  const visibleIds = useLayersStore((s) => s.visibleIds);
  const searchResults = useSearchStore((s) => s.results);

  const [mapImage, setMapImage] = useState<string | null>(null);
  const captureCanvas = useRef<HTMLCanvasElement | null>(null);

  const visibleLayers: Layer[] = layers.filter((l) => visibleIds.has(l.id));

  // Re-capture the map when the modal opens or preview changes
  useEffect(() => {
    const map = getMap();
    if (!map) return;

    // MapLibre may discard the WebGL back buffer after render.
    // Force one more render + read the canvas synchronously.
    const grab = () => {
      try {
        // triggerRepaint + read on next frame
        map.triggerRepaint();
        requestAnimationFrame(() => {
          const canvas = map.getCanvas();
          setMapImage(canvas.toDataURL("image/png"));
        });
      } catch (e) {
        console.warn("map capture failed", e);
      }
    };

    grab();
    // Re-grab if window resizes (preview aspect changes)
    const onResize = () => grab();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [getMap]);

  const orientationCls =
    settings.orientation === "landscape"
      ? "aspect-[297/210]"
      : "aspect-[210/297]";

  const now = new Date();
  const stampText = now.toISOString().slice(0, 19).replace("T", " ");

  return (
    <div
      ref={surfaceRef}
      className={`${orientationCls} w-full overflow-hidden bg-white`}
      style={{ minHeight: 300 }}
    >
      <div className="flex h-full flex-col p-4">
        {/* Title */}
        {settings.title && (
          <div className="mb-2 text-center">
            <h1 className="text-lg font-bold text-slate-800">
              {settings.title}
            </h1>
          </div>
        )}

        {/* Map area */}
        <div className="relative flex-1 overflow-hidden rounded border border-slate-200 bg-slate-100">
          {mapImage ? (
            <img
              src={mapImage}
              alt="Map"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              Preparing map…
            </div>
          )}

          {/* North arrow */}
          {settings.includeNorthArrow && (
            <div className="absolute right-3 top-3 rounded-full bg-white/90 p-1 shadow">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                className="text-slate-700"
              >
                <path d="M12 2 L18 20 L12 15 L6 20 Z" fill="currentColor" />
                <text
                  x="12"
                  y="10"
                  textAnchor="middle"
                  fontSize="6"
                  fill="white"
                  fontWeight="bold"
                >
                  N
                </text>
              </svg>
            </div>
          )}

          {/* Scale bar */}
          {settings.includeScale && <ScaleBar />}
        </div>

        {/* Bottom row: legend + timestamp */}
        <div className="mt-2 grid grid-cols-3 gap-3 text-[10px] text-slate-600">
          <div>
            {settings.includeLegend && visibleLayers.length > 0 && (
              <div>
                <div className="mb-1 font-semibold uppercase tracking-wide text-slate-500">
                  Legend
                </div>
                <ul className="space-y-0.5">
                  {visibleLayers.slice(0, 8).map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center gap-1.5 truncate"
                    >
                      <LayerSwatch layer={l} />
                      <span className="truncate">{l.display_name}</span>
                    </li>
                  ))}
                  {visibleLayers.length > 8 && (
                    <li className="text-slate-400">
                      +{visibleLayers.length - 8} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <div />

          <div className="text-right">
            {settings.includeTimestamp && (
              <div>
                <div className="font-semibold uppercase tracking-wide text-slate-500">
                  Generated
                </div>
                <div>{stampText}</div>
              </div>
            )}
          </div>
        </div>

        {/* Optional attribute table */}
        {settings.includeAttributeTable && searchResults.length > 0 && (
          <div className="mt-2 max-h-32 overflow-hidden rounded border border-slate-200">
            <div className="border-b border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Search results ({searchResults.length})
            </div>
            <div className="overflow-hidden">
              <table className="w-full text-[9px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-0.5 text-left font-medium">ID</th>
                    {Object.keys(searchResults[0].properties)
                      .slice(0, 5)
                      .map((k) => (
                        <th
                          key={k}
                          className="px-2 py-0.5 text-left font-medium"
                        >
                          {k}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {searchResults.slice(0, 8).map((f) => (
                    <tr
                      key={String(f.id)}
                      className="border-t border-slate-100"
                    >
                      <td className="px-2 py-0.5 font-mono text-slate-500">
                        {String(f.id)}
                      </td>
                      {Object.keys(f.properties)
                        .slice(0, 5)
                        .map((k) => (
                          <td key={k} className="px-2 py-0.5 text-slate-700">
                            {String(f.properties[k] ?? "")}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {searchResults.length > 8 && (
                <div className="border-t border-slate-100 px-2 py-0.5 text-[9px] text-slate-400">
                  +{searchResults.length - 8} more rows
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <canvas ref={captureCanvas} className="hidden" />
    </div>
  );
}

/**
 * Simple scale bar that reads MapLibre's current zoom + latitude
 * to compute a real-world distance for a 100px reference line.
 */
function ScaleBar() {
  const { getMap } = useMapContext();
  const [text, setText] = useState("100 m");

  useEffect(() => {
    const map = getMap();
    if (!map) return;
    const compute = () => {
      const bounds = map.getBounds();
      const center = map.getCenter();
      const canvasWidth = map.getCanvas().clientWidth;
      // metres per pixel at current center
      const metersPerPixel =
        (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) /
        Math.pow(2, map.getZoom() + 8);
      const targetPx = 100;
      const meters = metersPerPixel * targetPx;
      if (meters >= 1000) {
        setText(`${(meters / 1000).toFixed(1)} km`);
      } else {
        setText(`${Math.round(meters)} m`);
      }
      void bounds;
    };
    compute();
    map.on("moveend", compute);
    return () => {
      map.off("moveend", compute);
    };
  }, [getMap]);

  return (
    <div className="absolute bottom-3 left-3 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-700 shadow">
      <div className="mb-0.5 h-1 w-[100px] border border-slate-800 bg-transparent">
        <div className="h-full w-1/2 bg-slate-800" />
      </div>
      <div className="text-center">{text}</div>
    </div>
  );
}
