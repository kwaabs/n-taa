import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import type { PrintSettings } from "./store";

/**
 * Capture a DOM node to a data-URL PNG.
 * Wraps html-to-image with sensible defaults for map rendering.
 */
async function captureNode(node: HTMLElement): Promise<string> {
  return toPng(node, {
    cacheBust: true,
    pixelRatio: 2, // high DPI for print
    backgroundColor: "#ffffff",
    // MapLibre uses webgl — we need to preserve it briefly for capture
    // (Chrome/Firefox default is to discard after render)
  });
}

/**
 * Trigger a browser download from a data URL.
 */
function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export interface ExportContext {
  printSurface: HTMLElement; // the node to capture
  settings: PrintSettings;
}

export async function exportPrintView(ctx: ExportContext): Promise<void> {
  const { printSurface, settings } = ctx;

  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const safeName = settings.title.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
  const basename = `${safeName || "map"}_${stamp}`;

  // Capture the composed print surface as PNG
  const dataUrl = await captureNode(printSurface);

  if (settings.format === "png") {
    downloadDataUrl(dataUrl, `${basename}.png`);
    return;
  }

  // PDF path
  const orientation = settings.orientation === "landscape" ? "l" : "p";
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8; // mm

  // Fit the captured image into the page with margins, preserving aspect
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load capture"));
    image.src = dataUrl;
  });

  const imgAspect = image.width / image.height;
  const maxW = pageWidth - margin * 2;
  const maxH = pageHeight - margin * 2;
  let renderW = maxW;
  let renderH = maxW / imgAspect;
  if (renderH > maxH) {
    renderH = maxH;
    renderW = maxH * imgAspect;
  }
  const offsetX = (pageWidth - renderW) / 2;
  const offsetY = (pageHeight - renderH) / 2;

  pdf.addImage(dataUrl, "PNG", offsetX, offsetY, renderW, renderH);
  pdf.save(`${basename}.pdf`);
}
