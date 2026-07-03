import { Layers as LayersIcon } from "lucide-react";

export function LayersTabPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-12 text-center">
      <LayersIcon className="mb-3 h-8 w-8 text-slate-300" />
      <h3 className="text-sm font-semibold text-slate-700">
        Layer permissions
      </h3>
      <p className="mt-1 max-w-sm text-xs text-slate-500">
        Coming soon. Control which roles can view or edit each layer.
      </p>
    </div>
  );
}
