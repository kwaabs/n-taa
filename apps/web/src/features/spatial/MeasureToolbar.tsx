import { Ruler, Waypoints, X, Check, RotateCcw } from "lucide-react";
import { useMeasureStore } from "./measureStore";
import {
  totalDistanceMeters,
  polygonAreaMeters,
  polygonPerimeterMeters,
  formatDistance,
  formatArea,
} from "./measureUtils";

export function MeasureToolbar() {
  const mode = useMeasureStore((s) => s.mode);
  const frozen = useMeasureStore((s) => s.frozen);
  const vertices = useMeasureStore((s) => s.vertices);
  const cursor = useMeasureStore((s) => s.cursor);
  const setMode = useMeasureStore((s) => s.setMode);
  const finish = useMeasureStore((s) => s.finish);
  const cancel = useMeasureStore((s) => s.cancel);

  const activePath = frozen || !cursor ? vertices : [...vertices, cursor];
  const distance = totalDistanceMeters(activePath);
  const area = polygonAreaMeters(activePath);
  const perimeter = polygonPerimeterMeters(activePath);

  const canFinish =
    !frozen &&
    ((mode === "distance" && vertices.length >= 2) ||
      (mode === "area" && vertices.length >= 3));

  const startAgain = () => {
    const current = mode;
    setMode(current); // toggling to same mode resets
  };

  return (
    <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-lg bg-white/95 px-2 py-1.5 text-sm shadow-md backdrop-blur">
        <button
          onClick={() =>
            setMode(mode === "distance" && !frozen ? "off" : "distance")
          }
          className={[
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
            mode === "distance"
              ? "bg-orange-100 text-orange-700"
              : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
          title="Measure distance"
        >
          <Waypoints className="h-3.5 w-3.5" />
          Distance
        </button>

        <button
          onClick={() => setMode(mode === "area" && !frozen ? "off" : "area")}
          className={[
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
            mode === "area"
              ? "bg-orange-100 text-orange-700"
              : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
          title="Measure area"
        >
          <Ruler className="h-3.5 w-3.5" />
          Area
        </button>

        {mode !== "off" && (
          <>
            <div className="h-4 w-px bg-slate-200" />

            <div className="min-w-[140px] font-mono text-xs text-slate-700">
              {mode === "distance" && <span>{formatDistance(distance)}</span>}
              {mode === "area" && (
                <span>
                  {formatArea(area)}{" "}
                  <span className="text-slate-400">
                    · {formatDistance(perimeter)}
                  </span>
                </span>
              )}
            </div>

            {!frozen ? (
              <button
                onClick={finish}
                disabled={!canFinish}
                className={[
                  "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                  canFinish
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
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
                title="Start a new measurement"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New
              </button>
            )}

            <button
              onClick={cancel}
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
            ? "Measurement locked · New to measure again · Esc to clear"
            : "Click to add points · Done to finish · Esc to cancel"}
        </div>
      )}
    </div>
  );
}
