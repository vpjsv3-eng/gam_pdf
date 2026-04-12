/**
 * PDF 텍스트 레이어(페이지별 span)로 등기·건축물대장 섹션 구간 추정.
 * sectionKey는 탭 제목 규칙(`registryParcelTabTitle`)과 동일: `토지 296-3`, `건물 1동`, `건축물대장`.
 */

export type PdfSectionRange = {
  sectionKey: string;
  /** 1-based */
  startPage: number;
  /** 1-based, 다음 섹션 시작 전까지 포함 */
  endPage: number;
};

type PageStrings = { strings: string[] };

function pageCompactText(data: PageStrings | undefined): string {
  if (!data?.strings.length) return "";
  return data.strings.join("").replace(/\s+/g, "");
}

/**
 * 한 페이지 compact 텍스트에서 섹션 시작 키 감지.
 * 우선순위: [토지] → [건물] → 건축물대장 키워드.
 */
export function detectSectionKeyOnPage(compact: string): string | null {
  if (!compact) return null;
  if (/\[토지\]/.test(compact)) {
    const m = compact.match(/\[토지\][^\[]*?(\d+-\d+)/);
    if (m) return `토지 ${m[1]}`;
  }
  if (/\[건물\]/.test(compact)) {
    const m = compact.match(/\[건물\][^\[]*?(\d+)동/);
    if (m) return `건물 ${m[1]}동`;
  }
  if (
    compact.includes("일반건축물대장") ||
    compact.includes("건축물대장총괄표제부") ||
    (compact.includes("건축물대장") && compact.includes("총괄표제부"))
  ) {
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
    const c = pageCompactText(pageData.get(p));
    const key = detectSectionKeyOnPage(c);
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
  return br?.startPage ?? null;
}
