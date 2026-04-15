"use client";

function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export type BuildAnalyzeRequestOptions = {
  cadastralMapPngBase64?: string | null;
  buildingRegistryPngBase64?: string | null;
  landUsePlanPngBase64?: string | null;
};

/** 분석 API용 JSON 문자열. gzip으로 본문 크기를 줄여 Vercel 요청 한도 완화 */
export async function buildAnalyzeRequestJson(
  pdfText: string,
  opts?: BuildAnalyzeRequestOptions,
): Promise<string> {
  const cadastral =
    opts?.cadastralMapPngBase64 && opts.cadastralMapPngBase64.length > 0
      ? opts.cadastralMapPngBase64
      : undefined;
  const extra = {
    ...(cadastral ? { cadastralMapPngBase64: cadastral } : {}),
    ...(opts?.buildingRegistryPngBase64
      ? { buildingRegistryPngBase64: opts.buildingRegistryPngBase64 }
      : {}),
    ...(opts?.landUsePlanPngBase64 ? { landUsePlanPngBase64: opts.landUsePlanPngBase64 } : {}),
  };
  if (typeof CompressionStream === "undefined") {
    return JSON.stringify({ pdfText, ...extra });
  }
  try {
    const enc = new TextEncoder().encode(pdfText);
    const stream = new Blob([enc]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    const pdfTextGzipBase64 = uint8ToBase64(new Uint8Array(buf));
    return JSON.stringify({ pdfTextGzipBase64, ...extra });
  } catch {
    return JSON.stringify({ pdfText, ...extra });
  }
}
