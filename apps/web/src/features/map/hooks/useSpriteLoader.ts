import { useEffect } from "react";
import { useMapContext } from "../context/MapContext";
import { ICONS } from "../icons";

const RESOLUTION = 64;
const failedIcons = new Set<string>();
const loadingIcons = new Set<string>();

async function svgToImageData(svg: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const clean = svg.replace(/^\uFEFF/, "").trimStart();
    const blob = new Blob([clean], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    const done = (ok: boolean, payload?: ImageData | unknown) => {
      URL.revokeObjectURL(url);
      if (ok) resolve(payload as ImageData);
      else reject(payload);
    };

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = RESOLUTION;
        canvas.height = RESOLUTION;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.clearRect(0, 0, RESOLUTION, RESOLUTION);
        ctx.drawImage(img, 0, 0, RESOLUTION, RESOLUTION);
        done(true, ctx.getImageData(0, 0, RESOLUTION, RESOLUTION));
      } catch (err) {
        done(false, err);
      }
    };
    img.onerror = () => done(false, new Error("image decode failed"));
    img.src = url;
  });
}

async function ensureIcon(map: maplibregl.Map, name: string) {
  if (map.hasImage(name)) return;
  if (failedIcons.has(name)) return;
  if (loadingIcons.has(name)) return;
  const svg = ICONS[name];
  if (!svg) {
    failedIcons.add(name);
    console.warn(`[sprite] unknown icon "${name}"`);
    return;
  }
  loadingIcons.add(name);
  try {
    const data = await svgToImageData(svg);
    if (!map.hasImage(name)) {
      map.addImage(name, data, { sdf: true, pixelRatio: 2 });
      map.triggerRepaint();
    }
  } catch {
    failedIcons.add(name);
    console.warn(`[sprite] icon "${name}" failed to render; skipping`);
  } finally {
    loadingIcons.delete(name);
  }
}

/**
 * Registers all SVG icons with the map:
 *   - Eagerly on style-load so symbol layers can find them immediately
 *   - Reactively via `styleimagemissing` for any late requests
 * Both paths converge on the same ensureIcon() function.
 */
export function useSpriteLoader() {
  const { getMap } = useMapContext();

  useEffect(() => {
    const map = getMap();
    if (!map) return;

    let cancelled = false;

    const loadAll = async () => {
      for (const name of Object.keys(ICONS)) {
        if (cancelled) return;
        await ensureIcon(map, name);
      }
    };

    const onStyleData = () => {
      if (!cancelled) void loadAll();
    };

    const onImageMissing = (e: { id: string }) => {
      if (cancelled) return;
      void ensureIcon(map, e.id);
    };

    if (map.isStyleLoaded()) void loadAll();
    map.on("styledata", onStyleData);
    map.on("styleimagemissing", onImageMissing);

    return () => {
      cancelled = true;
      map.off("styledata", onStyleData);
      map.off("styleimagemissing", onImageMissing);
    };
  }, [getMap]);
}
