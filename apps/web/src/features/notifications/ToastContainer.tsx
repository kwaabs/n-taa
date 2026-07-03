import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Info, Loader2, X } from "lucide-react";
import { useToastStore, type Toast, type ToastKind } from "./store";

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      className="pointer-events-none fixed right-4 top-16 z-50 flex w-80 flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!toast.duration || paused) return;
    // Compute remaining time based on when the toast was created.
    // If it's already older than duration, dismiss ASAP.
    const elapsed = Date.now() - toast.createdAt;
    const remaining = Math.max(0, toast.duration - elapsed);
    const t = setTimeout(() => dismiss(toast.id), remaining);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, toast.createdAt, paused, dismiss]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={[
        "pointer-events-auto overflow-hidden rounded-lg border shadow-lg transition-all",
        toneClasses(toast.kind),
      ].join(" ")}
      role="status"
    >
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 shrink-0">{iconFor(toast.kind)}</div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{toast.title}</div>
          {toast.description && (
            <div className="mt-0.5 text-xs opacity-80">{toast.description}</div>
          )}

          {toast.kind === "progress" && typeof toast.progress === "number" && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-emerald-600 transition-all duration-200"
                style={{ width: `${toast.progress}%` }}
              />
            </div>
          )}
        </div>

        <button
          onClick={() => dismiss(toast.id)}
          className="shrink-0 rounded p-0.5 opacity-60 hover:bg-black/5 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function iconFor(kind: ToastKind) {
  switch (kind) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "info":
      return <Info className="h-4 w-4 text-cyan-600" />;
    case "progress":
      return <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />;
  }
}

function toneClasses(kind: ToastKind) {
  switch (kind) {
    case "success":
      return "bg-white border-emerald-200 text-slate-800";
    case "error":
      return "bg-white border-red-200 text-slate-800";
    case "info":
      return "bg-white border-cyan-200 text-slate-800";
    case "progress":
      return "bg-white border-slate-200 text-slate-800";
  }
}
