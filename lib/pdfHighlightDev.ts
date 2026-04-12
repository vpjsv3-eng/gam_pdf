/** 개발 환경에서만 원본 하이라이트·섹션 범위 디버그 로그 */
export const PDF_HIGHLIGHT_DEV =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

export function pdfHighlightDevLog(...args: unknown[]): void {
  if (PDF_HIGHLIGHT_DEV) console.log("[pdf-highlight]", ...args);
}
