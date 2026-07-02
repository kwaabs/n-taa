import { useEffect, useRef, useState } from "react";
import {
  Download,
  ChevronDown,
  Loader2,
  FileSpreadsheet,
  FileJson,
  FileText,
} from "lucide-react";
import { downloadFile } from "@/lib/api";

export type ExportFormat = "csv" | "xlsx" | "geojson";

interface Props {
  /** Path template that ends with "/export" or "/features/export" (no format extension). */
  endpoint: string;
  /** Request body sent for each format. */
  body: Record<string, unknown>;
  /** Filename base (no extension, no timestamp). */
  filenameBase: string;
  /** Optional label; defaults to "Export". Pass "" for icon-only. */
  label?: string;
  /** Show a confirmation dialog before downloading (used for whole-layer). */
  confirmBeforeDownload?: boolean;
}

const FORMATS: {
  format: ExportFormat;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ext: string;
}[] = [
  { format: "csv", label: "CSV", icon: FileText, ext: "csv" },
  { format: "xlsx", label: "Excel", icon: FileSpreadsheet, ext: "xlsx" },
  { format: "geojson", label: "GeoJSON", icon: FileJson, ext: "geojson" },
];

export function ExportButton({
  endpoint,
  body,
  filenameBase,
  label,
  confirmBeforeDownload,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [open]);

  const doExport = async (fmt: ExportFormat, ext: string) => {
    if (confirmBeforeDownload) {
      const ok = window.confirm(
        `Export the entire layer as ${fmt.toUpperCase()}?\n\n` +
          "Large layers can produce large files and take a moment.",
      );
      if (!ok) return;
    }

    setBusy(fmt);
    setOpen(false);
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      await downloadFile(
        `${endpoint}.${fmt}`,
        body,
        `${filenameBase}_${stamp}.${ext}`,
      );
    } catch (e) {
      console.error("export failed", e);
    } finally {
      setBusy(null);
    }
  };

  const showLabel = label === undefined ? "Export" : label;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        title="Export data"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        {showLabel && <span>{showLabel}</span>}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {FORMATS.map(({ format, label, icon: Icon, ext }) => (
            <button
              key={format}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void doExport(format, ext);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
            >
              <Icon className="h-3.5 w-3.5 text-slate-500" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
