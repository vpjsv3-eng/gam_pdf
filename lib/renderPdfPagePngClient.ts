"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfVisionSectionHint } from "@/lib/pdfSectionPages";
import { getPdfjs } from "@/lib/pdfjsClient";

const MAX_CSS_WIDTH = 900;

/** PDF 한 페이지를 PNG data URL로 렌더(비전 API용, 브라우저 전용) */
export async function renderPdfPageToPngDataUrl(
  doc: PDFDocumentProxy,
  pageNum: number,
): Promise<string | null> {
  const pdfjs = await getPdfjs();
  const page = await doc.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  const cssScale = Math.min(1.5, MAX_CSS_WIDTH / base.width);
  const vp = page.getViewport({ scale: cssScale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  await page.render({
    canvasContext: ctx,
    viewport: vp,
    canvas,
    intent: "display",
  }).promise;
  return canvas.toDataURL("image/png");
}

/** `/api/detect-section` 호출 — PNG data URL 또는 raw base64 */
export async function requestVisionSectionType(
  pngDataUrlOrBase64: string,
): Promise<PdfVisionSectionHint | null> {
  const base64 = pngDataUrlOrBase64.replace(/^data:image\/\w+;base64,/, "");
  const res = await fetch("/api/detect-section", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64 }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { sectionType?: string | null; error?: string };
  if (j.sectionType === "land_use_plan" || j.sectionType === "building_registry") {
    return j.sectionType;
  }
  return null;
}
