/**
 * PDF 텍스트 레이어(페이지별 span)로 등기·건축물대장 섹션 구간 추정.
 * sectionKey는 탭 제목 규칙(`registryParcelTabTitle`)과 동일: `토지 296-3`, `건물 1동`, `건축물대장`.
 */

import { normalizeText } from "@/lib/pdfSearchNormalize";

export type PdfSectionRange = {
  sectionKey: string;
  /** 1-based */
  startPage: number;
  /** 1-based, 다음 섹션 시작 전까지 포함 */
  endPage: number;
};

type PageStrings = { strings: string[] };

/** 헤더 감지용: 공백·줄바꿈을 정규화한 페이지 전체 문자열 */
function pageTextForSectionHeader(data: PageStrings | undefined): string {
  if (!data?.strings.length) return "";
  return normalizeText(data.strings.join(""));
}

/** 공백 제거 후 건축물대장 구간으로 볼 만한 키워드 */
function isBuildingRegistryPageFlat(flat: string): boolean {
  if (!flat) return false;
  return (
    flat.includes("일반건축물대장") ||
    flat.includes("집합건축물대장") ||
    flat.includes("건축물대장총괄표제부") ||
    (flat.includes("건축물대장") && flat.includes("총괄표제부")) ||
    (flat.includes("건축물대장") && flat.includes("대장등록"))
  );
}

/**
 * 한 페이지 텍스트에서 섹션 시작 키 감지.
 * 우선순위: [토지] → [건물] → 건축물대장 키워드.
 */
export function detectSectionKeyOnPage(pageNorm: string): string | null {
  if (!pageNorm) return null;
  if (/\[토지\]/.test(pageNorm)) {
    const m = pageNorm.match(/\[토지\][^\[]*?(\d+-\d+)/);
    if (m) return `토지 ${m[1]}`;
  }
  if (/\[건물\]/.test(pageNorm)) {
    const m = pageNorm.match(/\[건물\][^\[]*?(\d+)동/);
    if (m) return `건물 ${m[1]}동`;
  }
  const flat = pageNorm.replace(/\s+/g, "");
  if (isBuildingRegistryPageFlat(flat)) {
    return "건축물대장";
  }
  return null;
}

/**
 * 전체 페이지를 순회해 섹션별 start/end 페이지(1-based) 목록을 만든다.
 * 같은 sectionKey가 연속 페이지에서 반복 감지되면 첫 페이지만 구간 시작으로 쓴다.
 */
export function computePdfSectionRanges(
  pageData: Map<number, PageStrings>,
  numPages: number,
): PdfSectionRange[] {
  const starts: { page: number; sectionKey: string }[] = [];
  for (let p = 1; p <= numPages; p++) {
    const pageNorm = pageTextForSectionHeader(pageData.get(p));
    const key = detectSectionKeyOnPage(pageNorm);
    if (!key) continue;
    const prev = starts[starts.length - 1];
    if (!prev || prev.sectionKey !== key) {
      starts.push({ page: p, sectionKey: key });
    }
  }
  if (starts.length === 0) return [];
  const ranges: PdfSectionRange[] = [];
  for (let i = 0; i < starts.length; i++) {
    const startPage = starts[i].page;
    const endPage = i + 1 < starts.length ? starts[i + 1].page - 1 : numPages;
    ranges.push({
      sectionKey: starts[i].sectionKey,
      startPage,
      endPage,
    });
  }
  return ranges;
}

/**
 * 건축물대장 구간으로 보이는 **첫** 페이지(1-based). 없으면 null.
 */
export function getBuildingRegistryStartPage(
  pageData: Map<number, PageStrings>,
  numPages: number,
): number | null {
  const ranges = computePdfSectionRanges(pageData, numPages);
  const br = ranges.find((r) => r.sectionKey === "건축물대장");
  if (br?.startPage != null) return br.startPage;
  for (let p = 1; p <= numPages; p++) {
    const pageNorm = pageTextForSectionHeader(pageData.get(p));
    const flat = pageNorm.replace(/\s+/g, "");
    if (isBuildingRegistryPageFlat(flat)) return p;
  }
  return null;
}
