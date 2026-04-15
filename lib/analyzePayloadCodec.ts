/**
 * 분석 API 요청 본문: gzip+base64 디코딩 (서버 전용).
 * 인코딩은 클라이언트(RealtyAnalyzer)에서 동일 알고리즘으로 수행.
 */

import { gunzipSync } from "node:zlib";

export type AnalyzePostBody = {
  pdfText?: string;
  text?: string;
  pdfTextGzipBase64?: string;
  /** data URL 접두사 없는 PNG base64 (지적도 섹션 렌더) */
  cadastralMapPngBase64?: string;
  /** data URL 접두사 없는 PNG base64 (건축물대장 섹션 렌더) */
  buildingRegistryPngBase64?: string;
};

export function decodeAnalyzePdfText(body: AnalyzePostBody): string {
  const raw = body.pdfTextGzipBase64?.trim();
  if (raw) {
    try {
      const bin = Buffer.from(raw, "base64");
      return gunzipSync(bin).toString("utf8").trim();
    } catch {
      throw new Error("gzip_decode");
    }
  }
  return (body.pdfText ?? body.text ?? "").trim();
}
