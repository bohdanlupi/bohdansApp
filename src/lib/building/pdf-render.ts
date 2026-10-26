"use client";

// Renders pages of an architect's PDF in the browser with pdf.js (no rasteriser on the server). The worker is served
// from /public (copied from node_modules/pdfjs-dist/build/pdf.worker.min.mjs by scripts/copy-pdf-worker.mjs).

import type { PDFDocumentProxy } from "pdfjs-dist";

export type RenderedPage = { blob: Blob; width: number; height: number };

/** Longest side of a plan snapshot [px]: ≈ 210 dpi on an A1 sheet, 1 px ≈ 6 mm at 1:50. */
export const SNAPSHOT_MAX_SIDE = 7000;

let lib: Promise<typeof import("pdfjs-dist")> | null = null;

async function pdfjs() {
  if (!lib) {
    lib = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return lib;
}

export type LoadedPdf = {
  numPages: number;
  /** Data URL of a small preview of the page. */
  thumbnail: (page: number, width: number) => Promise<string>;
  /** PNG of the page with its longest side at `maxSide` px. */
  render: (page: number, maxSide: number) => Promise<RenderedPage>;
  /** Printed scale «1:50» found in the page text, if any. */
  printedScale: (page: number) => Promise<number | null>;
  destroy: () => void;
};

export async function loadPdf(file: File): Promise<LoadedPdf> {
  const m = await pdfjs();
  const doc: PDFDocumentProxy = await m.getDocument({ data: await file.arrayBuffer() }).promise;

  const draw = async (page: number, targetWidth: number, maxSide?: number) => {
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const longest = Math.max(base.width, base.height);
    const scale = maxSide ? maxSide / longest : targetWidth / base.width;
    const viewport = p.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvasContext: ctx, viewport }).promise;
    p.cleanup();
    return canvas;
  };

  return {
    numPages: doc.numPages,
    thumbnail: async (page, width) => draw(page, width).then((c) => c.toDataURL("image/jpeg", 0.8)),
    render: async (page, maxSide) => {
      const canvas = await draw(page, 0, maxSide);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("toBlob");
      return { blob, width: canvas.width, height: canvas.height };
    },
    printedScale: async (page) => {
      const p = await doc.getPage(page);
      const text = (await p.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
      const match = /1\s*:\s*(\d{2,4})\b/.exec(text);
      return match ? Number(match[1]) : null;
    },
    destroy: () => void doc.destroy(),
  };
}

/** Size of an uploaded PNG / JPEG plan. */
export function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}
