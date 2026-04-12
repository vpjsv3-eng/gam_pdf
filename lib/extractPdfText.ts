"use client";

import { getPdfjs } from "@/lib/pdfjsClient";

/** 브라우저에서 PDF 바이너리(ArrayBuffer)로부터 텍스트 추출 */
export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean);
    parts.push(strings.join(" "));
  }

  return parts.join("\n\n").replace(/\s+/g, " ").trim();
}
