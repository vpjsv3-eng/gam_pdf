"use client";

/** 브라우저용 pdfjs-dist 로드 및 worker URL 설정(한 번만) */
let workerSet = false;

export async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerSet) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    workerSet = true;
  }
  return pdfjs;
}
