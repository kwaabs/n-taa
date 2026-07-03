import { useRef } from "react";
import { X, Printer, Download, Loader2 } from "lucide-react";
import { usePrintStore } from "./store";
import { PrintPreview } from "./PrintPreview";
import { exportPrintView } from "./exportMap";
import { useSearchStore } from "@/features/search/store";

import {
  toastProgress,
  toastCompleteProgress,
  toastFailProgress,
} from "@/features/notifications/store";

export function PrintModal() {
  const open = usePrintStore((s) => s.open);
  const settings = usePrintStore((s) => s.settings);
  const update = usePrintStore((s) => s.update);
  const exporting = usePrintStore((s) => s.exporting);
  const setExporting = usePrintStore((s) => s.setExporting);
  const closeModal = usePrintStore((s) => s.closeModal);

  const searchHasResults = useSearchStore((s) => s.results.length > 0);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const onDownload = async () => {
    if (!surfaceRef.current) return;
    setExporting(true);

    const toastId = toastProgress(
      `Preparing ${settings.format.toUpperCase()}`,
      settings.title || "Map export",
    );

    try {
      await exportPrintView({
        printSurface: surfaceRef.current,
        settings,
      });
      toastCompleteProgress(
        toastId,
        "Map exported",
        `${settings.title || "Map"}.${settings.format}`,
      );
    } catch (e) {
      console.error("export failed", e);
      toastFailProgress(
        toastId,
        "Export failed",
        (e as { message?: string })?.message ?? "Unknown error",
      );
    } finally {
      setExporting(false);
    }
  };

  const onPrint = () => {
    if (!surfaceRef.current) return;
    // Open a print-only window with the surface's HTML
    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) return;

    const styles = Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules)
            .map((r) => r.cssText)
            .join("\n");
        } catch {
          return "";
        }
      })
      .join("\n");

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
<head>
<title>${settings.title || "Map export"}</title>
<style>
${styles}
@page { margin: 8mm; size: A4 ${settings.orientation}; }
body { margin: 0; }
</style>
</head>
<body>${surfaceRef.current.outerHTML}</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    // Delay to allow images (map snapshot) to paint
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={closeModal}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Print / Export map
            </h2>
            <p className="text-xs text-slate-500">
              Configure your export, then download or print.
            </p>
          </div>
          <button
            onClick={closeModal}
            className="rounded p-1.5 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-slate-600" />
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar controls */}
          <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Title
                </label>
                <input
                  type="text"
                  value={settings.title}
                  onChange={(e) => update({ title: e.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Orientation
                </label>
                <div className="flex gap-1">
                  <OrientationButton
                    active={settings.orientation === "landscape"}
                    onClick={() => update({ orientation: "landscape" })}
                    label="Landscape"
                  />
                  <OrientationButton
                    active={settings.orientation === "portrait"}
                    onClick={() => update({ orientation: "portrait" })}
                    label="Portrait"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Format
                </label>
                <div className="flex gap-1">
                  <FormatButton
                    active={settings.format === "pdf"}
                    onClick={() => update({ format: "pdf" })}
                    label="PDF"
                  />
                  <FormatButton
                    active={settings.format === "png"}
                    onClick={() => update({ format: "png" })}
                    label="PNG"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Include
                </label>
                <div className="space-y-1">
                  <Toggle
                    checked={settings.includeLegend}
                    onChange={(v) => update({ includeLegend: v })}
                    label="Legend"
                  />
                  <Toggle
                    checked={settings.includeScale}
                    onChange={(v) => update({ includeScale: v })}
                    label="Scale bar"
                  />
                  <Toggle
                    checked={settings.includeNorthArrow}
                    onChange={(v) => update({ includeNorthArrow: v })}
                    label="North arrow"
                  />
                  <Toggle
                    checked={settings.includeTimestamp}
                    onChange={(v) => update({ includeTimestamp: v })}
                    label="Timestamp"
                  />
                  {searchHasResults && (
                    <Toggle
                      checked={settings.includeAttributeTable}
                      onChange={(v) => update({ includeAttributeTable: v })}
                      label="Search results table"
                    />
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* Preview area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-auto bg-slate-100 p-4">
              <div className="mx-auto max-w-4xl">
                <PrintPreview surfaceRef={surfaceRef} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
              <button
                onClick={onPrint}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </button>
              <button
                onClick={onDownload}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download {settings.format.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrientationButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex-1 rounded-md border px-2 py-1 text-xs transition",
        active
          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function FormatButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition",
        active
          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-700 hover:bg-slate-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-emerald-600"
      />
      {label}
    </label>
  );
}
