import { ClipboardList } from "lucide-react";

export function AuditTabPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-12 text-center">
      <ClipboardList className="mb-3 h-8 w-8 text-slate-300" />
      <h3 className="text-sm font-semibold text-slate-700">Audit log</h3>
      <p className="mt-1 max-w-sm text-xs text-slate-500">
        Coming soon. Track user and layer changes across the platform.
      </p>
    </div>
  );
}
