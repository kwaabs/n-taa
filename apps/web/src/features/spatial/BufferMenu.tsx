import { useEffect, useState } from "react";
import { CircleDot } from "lucide-react";
import { useBufferStore } from "./bufferStore";
import { useSelectionStore } from "@/features/features/store";
import { bufferAround, formatRadius } from "./bufferUtils";

const PRESETS = [100, 500, 1000, 2000, 5000];

export function BufferMenu() {
  const menu = useBufferStore((s) => s.menu);
  const closeMenu = useBufferStore((s) => s.closeMenu);
  const setLocal = useSelectionStore((s) => s.setLocal);
  const [custom, setCustom] = useState("");
  const [wholeFeature, setWholeFeature] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    const onClickOutside = (e: MouseEvent) => {
      const el = document.getElementById("__buffer_menu");
      if (el && !el.contains(e.target as Node)) closeMenu();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(
      () => window.addEventListener("click", onClickOutside),
      0,
    );
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClickOutside);
      clearTimeout(t);
    };
  }, [menu, closeMenu]);

  if (!menu) return null;

  const sourceType = menu.sourceFeature.geometry?.type;
  const shapeApplies = sourceType && sourceType !== "Point";

  const apply = (radius: number) => {
    if (radius <= 0 || !Number.isFinite(radius)) return;
    const feat = bufferAround(
      menu.clickLngLat,
      menu.sourceFeature,
      radius,
      wholeFeature && !!shapeApplies,
    );
    if (!feat) return;

    const label = wholeFeature && shapeApplies ? "along" : "around";
    setLocal({
      layerName: `${formatRadius(radius)} buffer ${label} ${menu.sourceLayerName} #${menu.sourceFeature.id}`,
      feature: feat,
    });
    closeMenu();
  };

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(menu.x, window.innerWidth - 240),
    top: Math.min(menu.y, window.innerHeight - 260),
    zIndex: 40,
  };

  return (
    <div
      id="__buffer_menu"
      style={style}
      className="w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
    >
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <CircleDot className="h-3.5 w-3.5 text-cyan-600" />
        Buffer
      </div>

      <ul className="mt-1 space-y-0.5">
        {PRESETS.map((m) => (
          <li key={m}>
            <button
              onClick={() => apply(m)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              <span>{formatRadius(m)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 border-t border-slate-100 pt-2">
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
          Custom (metres)
        </label>
        <div className="flex gap-1">
          <input
            type="number"
            min={1}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply(Number(custom));
            }}
            placeholder="e.g. 250"
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
          />
          <button
            onClick={() => apply(Number(custom))}
            disabled={!custom}
            className="rounded-md bg-cyan-600 px-2 text-xs text-white hover:bg-cyan-700 disabled:opacity-40"
          >
            Go
          </button>
        </div>
      </div>

      {shapeApplies && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={wholeFeature}
            onChange={(e) => setWholeFeature(e.target.checked)}
            className="h-3 w-3"
          />
          Whole {sourceType.toLowerCase()} (not just this point)
        </label>
      )}
    </div>
  );
}
