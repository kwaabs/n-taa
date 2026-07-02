// Central registry of SDF-style symbol SVGs.
// Used by both the map sprite loader and the sidebar legend.

import dotSvg from "@/assets/symbols/dot.svg?raw";
import arresterSvg from "@/assets/symbols/arrester.svg?raw";
import breakerSvg from "@/assets/symbols/breaker.svg?raw";
import isolatorSvg from "@/assets/symbols/isolator.svg?raw";
import lbsSvg from "@/assets/symbols/lbs.svg?raw";
import sectionalizerSvg from "@/assets/symbols/sectionalizer.svg?raw";
import recloserSvg from "@/assets/symbols/recloser.svg?raw";
import switchgearSvg from "@/assets/symbols/switchgear.svg?raw";
import transformerSvg from "@/assets/symbols/transformer.svg?raw";
import ctSvg from "@/assets/symbols/ct.svg?raw";
import vtSvg from "@/assets/symbols/vt.svg?raw";
import meterSvg from "@/assets/symbols/meter.svg?raw";
import capacitorSvg from "@/assets/symbols/capacitor.svg?raw";
import busbarSvg from "@/assets/symbols/busbar.svg?raw";
import poleSvg from "@/assets/symbols/pole.svg?raw";
import panelSvg from "@/assets/symbols/panel.svg?raw";
import buildingSvg from "@/assets/symbols/building.svg?raw";
import batterySvg from "@/assets/symbols/battery.svg?raw";
import earthSvg from "@/assets/symbols/earth.svg?raw";
import scadaSvg from "@/assets/symbols/scada.svg?raw";
import relaySvg from "@/assets/symbols/relay.svg?raw";

export const ICONS: Record<string, string> = {
  dot: dotSvg,
  arrester: arresterSvg,
  breaker: breakerSvg,
  isolator: isolatorSvg,
  lbs: lbsSvg,
  sectionalizer: sectionalizerSvg,
  recloser: recloserSvg,
  switchgear: switchgearSvg,
  transformer: transformerSvg,
  ct: ctSvg,
  vt: vtSvg,
  meter: meterSvg,
  capacitor: capacitorSvg,
  busbar: busbarSvg,
  pole: poleSvg,
  panel: panelSvg,
  building: buildingSvg,
  battery: batterySvg,
  earth: earthSvg,
  scada: scadaSvg,
  relay: relaySvg,
};

/**
 * Prepare an SVG for inline React rendering:
 *  - Strips width/height so the container controls size.
 *  - Rewrites black fills/strokes to `currentColor` so a wrapping
 *    element can tint via `style={{ color }}`.
 */
export function inlineTintedSvg(name: string): string | null {
  const raw = ICONS[name];
  if (!raw) return null;
  return raw
    .replace(
      /<svg([^>]*)>/,
      (_, attrs) =>
        `<svg${attrs
          .replace(/\swidth="[^"]*"/gi, "")
          .replace(/\sheight="[^"]*"/gi, "")}>`,
    )
    .replace(/fill="(black|#000|#000000)"/gi, 'fill="currentColor"')
    .replace(/stroke="(black|#000|#000000)"/gi, 'stroke="currentColor"');
}
