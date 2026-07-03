import type maplibregl from "maplibre-gl";
import type {
  Layer,
  PointStyle,
  LineStyle,
  PolygonStyle,
} from "@/features/layers/types";

const DEFAULT_POINT: Required<PointStyle> = {
  icon: "dot",
  size: 1,
  color: "#059669",
  halo_color: "#ffffff",
  halo_width: 1.25,
  opacity: 1,
  minzoom: 8,
  render_as: "symbol",
};

const DEFAULT_LINE: Required<LineStyle> = {
  color: "#2563eb",
  width: 1.5,
  opacity: 0.9,
  dash: [],
};

const DEFAULT_POLYGON: Required<PolygonStyle> = {
  fill_color: "#f59e0b",
  fill_opacity: 0.35,
  outline_color: "#b45309",
  outline_width: 1,
};

const mergePoint = (s?: PointStyle) => ({ ...DEFAULT_POINT, ...(s ?? {}) });
const mergeLine = (s?: LineStyle) => ({ ...DEFAULT_LINE, ...(s ?? {}) });
const mergePolygon = (s?: PolygonStyle) => ({
  ...DEFAULT_POLYGON,
  ...(s ?? {}),
});

export function applyLayerStyle(
  map: maplibregl.Map,
  layer: Layer,
  sourceId: string,
  sourceLayer: string,
) {
  const p = mergePoint(layer.style?.point);
  const l = mergeLine(layer.style?.line);
  const poly = mergePolygon(layer.style?.polygon);

  // ─── Point ────────────────────────────────────────
  // Symbol for icon-style layers, circle for dense datasets
  // (customer meters, support structures) to avoid MapLibre's
  // symbol atlas overflow.
  if (p.render_as === "circle") {
    map.addLayer({
      id: `${sourceId}__circle`,
      type: "circle",
      source: sourceId,
      "source-layer": sourceLayer,
      filter: ["==", ["geometry-type"], "Point"],
      minzoom: p.minzoom,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          1.5,
          14,
          2.5,
          18,
          4,
        ],
        "circle-color": p.color,
        "circle-stroke-color": p.halo_color,
        "circle-stroke-width": 0.5,
        "circle-opacity": p.opacity,
      },
    });
  } else {
    map.addLayer({
      id: `${sourceId}__circle`,
      type: "symbol",
      source: sourceId,
      "source-layer": sourceLayer,
      filter: ["==", ["geometry-type"], "Point"],
      minzoom: p.minzoom,
      layout: {
        "icon-image": p.icon,
        "icon-size": p.size,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-color": p.color as never,
        "icon-halo-color": p.halo_color,
        "icon-halo-width": p.halo_width,
        "icon-opacity": p.opacity,
      },
    });
  }

  // ─── Line ─────────────────────────────────────────
  const linePaint: Record<string, unknown> = {
    "line-color": l.color,
    "line-width": l.width,
    "line-opacity": l.opacity,
  };
  if (l.dash.length > 0) linePaint["line-dasharray"] = l.dash;

  map.addLayer({
    id: `${sourceId}__line`,
    type: "line",
    source: sourceId,
    "source-layer": sourceLayer,
    filter: ["==", ["geometry-type"], "LineString"],
    minzoom: l.minzoom ?? 6, // ← reads from style
    paint: linePaint,
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });

  // ─── Polygon fill ─────────────────────────────────
  // ─── Polygon fill (zoom-scoped when centroid mode is on) ──
  const hasCentroid = poly.centroid?.enabled === true;
  const switchZoom = poly.centroid?.switch_zoom ?? 12;

  map.addLayer({
    id: `${sourceId}__fill`,
    type: "fill",
    source: sourceId,
    "source-layer": sourceLayer,
    filter: ["==", ["geometry-type"], "Polygon"],
    minzoom: hasCentroid ? switchZoom : 0,
    paint: {
      "fill-color": poly.fill_color,
      "fill-opacity": poly.fill_opacity,
    },
  });

  map.addLayer({
    id: `${sourceId}__outline`,
    type: "line",
    source: sourceId,
    "source-layer": sourceLayer,
    filter: ["==", ["geometry-type"], "Polygon"],
    minzoom: hasCentroid ? switchZoom : 0,
    paint: {
      "line-color": poly.outline_color,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        6,
        0.4,
        10,
        poly.outline_width,
        14,
        poly.outline_width * 1.5,
      ],
      "line-opacity": 0.85,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  // ─── Polygon centroid (only when centroid mode is on) ──
  // MapLibre auto-places symbols at polygon centroids.
  if (hasCentroid) {
    const c = poly.centroid!;
    map.addLayer({
      id: `${sourceId}__centroid`,
      type: "symbol",
      source: sourceId,
      "source-layer": sourceLayer,
      filter: ["==", ["geometry-type"], "Polygon"],
      maxzoom: switchZoom,
      layout: {
        "icon-image": c.icon ?? "dot",
        "icon-size": c.size ?? 0.4,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-placement": "point",
      },
      paint: {
        "icon-color": (c.color ?? "#78350f") as never,
        "icon-halo-color": c.halo_color ?? "#ffffff",
        "icon-halo-width": c.halo_width ?? 1,
      },
    });
  }
}
