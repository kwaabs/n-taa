import { inlineTintedSvg } from "@/features/map/icons";
import type { Layer } from "./types";

interface Props {
  layer: Layer;
}

export function LayerSwatch({ layer }: Props) {
  const point = layer.style?.point;
  const line = layer.style?.line;
  const poly = layer.style?.polygon;

  // ─── Point → inline tinted SVG ────────────────────
  if (point) {
    const svg = inlineTintedSvg(point.icon ?? "dot");
    if (svg) {
      return (
        <div
          className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full"
          style={{ color: point.color ?? "#059669" }}
          dangerouslySetInnerHTML={{ __html: svg }}
          aria-hidden
        />
      );
    }
    // Fallback dot if the icon name is unknown
    return (
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ background: point.color ?? "#059669" }}
        aria-hidden
      />
    );
  }

  // ─── Line → colored dash ──────────────────────────
  if (line) {
    return (
      <svg
        className="shrink-0"
        width={16}
        height={16}
        viewBox="0 0 16 16"
        aria-hidden
      >
        <line
          x1={1}
          y1={8}
          x2={15}
          y2={8}
          stroke={line.color ?? "#2563eb"}
          strokeWidth={2}
          strokeDasharray={line.dash?.join(" ") || undefined}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // ─── Polygon → filled square with outline ─────────
  if (poly) {
    return (
      <svg
        className="shrink-0"
        width={16}
        height={16}
        viewBox="0 0 16 16"
        aria-hidden
      >
        <rect
          x={2}
          y={2}
          width={12}
          height={12}
          rx={2}
          fill={poly.fill_color ?? "#f59e0b"}
          fillOpacity={poly.fill_opacity ?? 0.35}
          stroke={poly.outline_color ?? "#b45309"}
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  // Fallback swatch
  return (
    <span className="h-3 w-3 shrink-0 rounded-full bg-slate-300" aria-hidden />
  );
}
