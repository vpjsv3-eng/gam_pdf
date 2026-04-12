/** AI가 반환하는 { value, page, file_index } 형태와 구형(문자열만) 모두 처리 */

export type Sourced = {
  value?: string | number | boolean | null;
  /** 해당 PDF 내 1부터 시작하는 페이지 (표시용·프롬프트용, 원본 검색에는 미사용) */
  page?: number | null;
  /** 업로드 순서 0부터 (첫 번째 파일 = 0) */
  file_index?: number | null;
};

export type MaybeSourced = string | number | boolean | null | Sourced | undefined;

export function displayField(v: MaybeSourced): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "value" in v) {
    const val = (v as Sourced).value;
    if (val === null || val === undefined) return "";
    if (typeof val === "boolean") return val ? "예" : "아니오";
    return String(val);
  }
  if (typeof v === "boolean") return v ? "예" : "아니오";
  return String(v);
}

/** 원본 PDF 탭 인덱스 (page는 사용하지 않음) */
export function getSourceFileIndex(v: MaybeSourced, fileCount: number): number {
  if (fileCount <= 0) return 0;
  if (v && typeof v === "object" && "value" in v) {
    const o = v as Sourced;
    const fi =
      typeof o.file_index === "number" && o.file_index >= 0 ? Math.floor(o.file_index) : 0;
    return Math.min(fi, fileCount - 1);
  }
  return 0;
}

/** 행 단위 file_index 폴백 (지상권·압류 등) */
export function resolveHighlightFileIndex(
  fileCount: number,
  field: MaybeSourced,
  rowFileIndex?: number | null,
): number {
  if (fileCount <= 0) return 0;
  if (field && typeof field === "object" && "file_index" in field) {
    return getSourceFileIndex(field, fileCount);
  }
  if (typeof rowFileIndex === "number" && rowFileIndex >= 0) {
    return Math.min(Math.floor(rowFileIndex), fileCount - 1);
  }
  return 0;
}
