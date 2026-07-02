import { Lasso, Check, X, RotateCcw } from "lucide-react";
import { useSelectStore } from "./selectStore";
import { useSelectionStore } from "@/features/features/store";
import type { Feature } from "@/features/features/types";

export function SelectToolbar() {
  const mode = useSelectStore((s) => s.mode);
  const frozen = useSelectStore((s) => s.frozen);
  const vertices = useSelectStore((s) => s.vertices);
  const setMode = useSelectStore((s) => s.setMode);
  const finish = useSelectStore((s) => s.finish);
  const cancel = useSelectStore((s) => s.cancel);
  const setLocal = useSelectionStore((s) => s.setLocal);

  const canFinish = !frozen && mode === "polygon" && vertices.length >= 3;

  const onFinish = () => {
    // Build the synthesized feature FIRST while we still have vertices
    const ring: [number, number][] = [...vertices, vertices[0]];
    const synth: Feature = {
      type: "Feature",
      id: Date.now(),
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: {},
    };
    finish();
    setLocal({ layerName: "Custom Selection", feature: synth });
  };

  const startAgain = () => {
    setMode("polygon");
  };

  const fullCancel = () => {
    cancel();
  };

  return (
    <div className="absolute left-1/2 top-14 z-10 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-lg bg-white/95 px-2 py-1.5 text-sm shadow-md backdrop-blur">
        <button
          onClick={() =>
            setMode(mode === "polygon" && !frozen ? "off" : "polygon")
          }
          className={[
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
            mode === "polygon"
              ? "bg-cyan-100 text-cyan-700"
              : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
          title="Draw selection"
        >
          <Lasso className="h-3.5 w-3.5" />
          Select area
        </button>

        {mode !== "off" && (
          <>
            <div className="h-4 w-px bg-slate-200" />
            <div className="min-w-[70px] text-xs text-slate-600">
              {vertices.length} pt{vertices.length === 1 ? "" : "s"}
            </div>

            {!frozen ? (
              <button
                onClick={onFinish}
                disabled={!canFinish}
                className={[
                  "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                  canFinish
                    ? "bg-cyan-600 text-white hover:bg-cyan-700"
                    : "cursor-not-allowed bg-slate-100 text-slate-400",
                ].join(" ")}
                title="Finish (Enter)"
              >
                <Check className="h-3.5 w-3.5" />
                Done
              </button>
            ) : (
              <button
                onClick={startAgain}
                className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200"
                title="Start a new selection"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New
              </button>
            )}

            <button
              onClick={fullCancel}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Clear (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {mode !== "off" && (
        <div className="mt-1.5 text-center text-[11px] text-slate-500">
          {frozen
            ? "Selection locked · New to draw again · Esc to clear"
            : "Click to add vertices · Done (Enter) when ≥ 3 points · Esc to cancel"}
        </div>
      )}
    </div>
  );
}
