/**
 * PDF 텍스트 레이어(페이지별 span)로 등기·대장·부속 문서 섹션 구간 추정.
 * sectionKey: `토지 296-3`, `건물 1`, …, `건축물대장`, `토지이용계획` 등.
 * (지적도·토지대장·공유지연명부·주요등기사항요약 페이지는 구간으로 잡지 않음)
 */

import { normalizeText } from "@/lib/pdfSearchNormalize";

/** 원본 검색·탭과 동일한 섹션 키 */
export const LAND_USE_PLAN_SECTION_KEY = "토지이용계획";
export const LAND_REGISTER_SECTION_KEY = "토지대장";
export const JOINT_OWNERSHIP_SECTION_KEY = "공유지연명부";
export const CADASTRAL_MAP_SECTION_KEY = "지적도";

/** 비전 API로만 구분되는 빈 텍스트 페이지 힌트 */
export type PdfVisionSectionHint = "land_use_plan" | "building_registry";

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

/** PdfViewerPanel 등에서 빈 페이지 판별용 */
export function getPageTextForSectionDetection(data: PageStrings | undefined): string {
  return pageTextForSectionHeader(data);
}

/** 공백만 제거 — `[토지]`, 지번 등 괄호·하이픈 보존 */
function flatWsOnly(text: string): string {
  return text.replace(/\s/g, "");
}

function normalizeForDetection(text: string): string {
  return text.replace(/\s/g, "").toLowerCase();
}

function isNewSectionStart(pageText: string, normalized: string): boolean {
  const has등기사항 = normalized.includes("등기사항전부증명서");
  const has1ofN =
    /1\/\d+/.test(pageText) || /1\s*\/\s*\d+/.test(pageText) || /1\/\d+/.test(normalized);
  const has토지이용계획확인서 =
    normalized.includes("토지이용계획확인서") ||
    normalized.includes("토지이용계획확") ||
    (normalized.includes("신청토지") && normalized.includes("소재지") && normalized.includes("지목"));
  const has건축물대장키워드 = normalized.includes("건축물대장");
  const 결과 = has등기사항 || has1ofN || has토지이용계획확인서 || has건축물대장키워드;

  console.log("[isNewSectionStart]", {
    has등기사항,
    has1ofN,
    has토지이용계획확인서,
    has건축물대장키워드,
    결과,
    텍스트앞50자: pageText.slice(0, 50),
  });

  return 결과;
}

type DetectKind =
  | "IGNORE"
  | "parcel"
  | "building"
  | "building_registry"
  | "land_use_plan"
  | null;

function detectSectionKey(pageText: string): DetectKind {
  const n = normalizeForDetection(pageText);
  const isNew = isNewSectionStart(pageText, n);

  // 토지이용계획확인서: 정상 키워드 + 폰트 깨짐 대응 보조 키워드
  const is토지이용계획 =
    n.includes("토지이용계획확인서") ||
    n.includes("토지이용계획확") ||
    n.includes("국토의계획및이용에관한법률") ||
    (n.includes("토지이용계획") && n.includes("지역·지구등")) ||
    (n.includes("신청토지") &&
      n.includes("소재지") &&
      n.includes("지번") &&
      n.includes("지목") &&
      n.includes("면적")) ||
    n.includes("지구등지정여부") ||
    n.includes("지역·지구등지정여부");

  const checks = {
    주요등기사항요약: n.includes("주요등기사항요약"),
    지적도등본: n.includes("지적도등본"),
    공유지연명부: n.includes("공유지연명부"),
    토지대장무건축물: n.includes("토지대장") && !n.includes("건축물"),
    토지이용계획: is토지이용계획,
    건물헤더: n.includes("[건물]"),
    건물제출용: n.includes("-건물[제출용]-") || n.includes("건물[제출용]"),
    등기사항전부증명서: n.includes("등기사항전부증명서"),
    토지헤더: n.includes("[토지]"),
    토지제출용: n.includes("-토지[제출용]-") || n.includes("토지[제출용]"),
    일반건축물대장: n.includes("일반건축물대장"),
    집합건축물대장: n.includes("집합건축물대장"),
    건축물대장총괄: n.includes("건축물대장총괄표제부"),
    지적도: n.includes("지적도"),
    isNewSection: isNew,
  };
  console.log("[detectSectionKey] 체크 결과:", checks);

  if (n.includes("주요등기사항요약")) return "IGNORE";
  if (n.includes("지적도등본")) return "IGNORE";
  if (n.includes("공유지연명부")) return "IGNORE";
  if (n.includes("토지대장") && !n.includes("건축물")) return "IGNORE";

  if (is토지이용계획) return "land_use_plan";

  if (
    n.includes("건축물대장총괄표제부") ||
    n.includes("일반건축물대장") ||
    n.includes("집합건축물대장")
  ) {
    return "building_registry";
  }

  if (!isNew) return null;

  if (
    n.includes("[건물]") ||
    n.includes("-건물-") ||
    n.includes("-건물[제출용]-") ||
    (n.includes("등기사항전부증명서") && n.includes("건물") && !n.includes("토지"))
  ) {
    return "building";
  }

  if (
    n.includes("[토지]") ||
    n.includes("-토지-") ||
    n.includes("-토지[제출용]-") ||
    (n.includes("등기사항전부증명서") && n.includes("토지") && !n.includes("건물"))
  ) {
    return "parcel";
  }

  if (n.includes("지적도")) return "IGNORE";

  return null;
}

function effectiveSectionKind(
  pageNum: number,
  pageText: string,
  visionHints: Map<number, PdfVisionSectionHint> | undefined,
): DetectKind {
  const trimmed = pageText.trim();
  if (trimmed === "" && visionHints?.has(pageNum)) {
    return visionHints.get(pageNum)!;
  }
  return detectSectionKey(pageText);
}

function parcelSectionKeyFromPage(pageNorm: string): string {
  const flatWs = flatWsOnly(pageNorm);
  const mBracket = flatWs.match(/\[토지\][^\[]*?(\d+-\d+)/);
  if (mBracket) return `토지 ${mBracket[1]}`;
  const nums = flatWs.match(/\d+-\d+(?:-\d+)?/g) ?? [];
  for (const c of nums) {
    if (/^\d{4}-\d{2}$/.test(c)) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(c)) continue;
    return `토지 ${c}`;
  }
  return "토지";
}

function buildingDongFromFlatWs(flatWs: string): number | null {
  const i = flatWs.indexOf("[건물]");
  if (i < 0) return null;
  const tail = flatWs.slice(i);
  let last: number | null = null;
  const re = /(\d+)동/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tail)) !== null) {
    last = parseInt(m[1]!, 10);
  }
  return last;
}

export function buildingDongFromPageNorm(pageNorm: string): number | null {
  return buildingDongFromFlatWs(flatWsOnly(pageNorm));
}

const BRACKET_BUILDING_MAX_INDEX = 900;

function hasBracketBuildingNearTopFlat(flatWs: string): boolean {
  const i = flatWs.indexOf("[건물]");
  if (i < 0) return false;
  return i < BRACKET_BUILDING_MAX_INDEX;
}

type InteriorRow =
  | { page: number; kind: "parcel"; sectionKey: string }
  | { page: number; kind: "building"; hardBreak: boolean }
  | { page: number; kind: "building_registry" }
  | { page: number; kind: "land_use_plan" };

function finalizeBuildingKeys(rows: Extract<InteriorRow, { kind: "building" }>[]): string[] {
  return rows.map((_, i) => `건물 ${i + 1}`);
}

function sectionRangesFromStarts(
  starts: { page: number; sectionKey: string }[],
  numPages: number,
  ignorePages: Set<number>,
): PdfSectionRange[] {
  if (starts.length === 0) return [];
  const ranges: PdfSectionRange[] = [];
  for (let i = 0; i < starts.length; i++) {
    const startPage = starts[i].page;
    const nextStart = i + 1 < starts.length ? starts[i + 1].page : numPages + 1;
    let endPage = nextStart - 1;
    for (let x = startPage; x <= endPage; x++) {
      if (ignorePages.has(x)) {
        endPage = x - 1;
        break;
      }
    }
    if (endPage >= startPage) {
      ranges.push({
        sectionKey: starts[i].sectionKey,
        startPage,
        endPage,
      });
    }
  }
  return ranges;
}

export function detectSectionKeyOnPage(pageNorm: string): string | null {
  const k = detectSectionKey(pageNorm);
  if (k === "IGNORE" || k === null) return null;
  if (k === "parcel") return parcelSectionKeyFromPage(pageNorm);
  if (k === "building") return "건물 1";
  if (k === "building_registry") return "건축물대장";
  if (k === "land_use_plan") return LAND_USE_PLAN_SECTION_KEY;
  return null;
}

export type ComputePdfSectionRangesOptions = {
  logDump?: boolean;
  visionHints?: Map<number, PdfVisionSectionHint>;
};

function computePdfSectionRangesCore(
  pageData: Map<number, PageStrings>,
  numPages: number,
  opts: ComputePdfSectionRangesOptions,
): PdfSectionRange[] {
  const logDump = opts.logDump !== false;
  const visionHints = opts.visionHints ?? new Map<number, PdfVisionSectionHint>();
  const ignorePages = new Set<number>();
  const interior: InteriorRow[] = [];
  let lastParcelKey: string | null = null;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const pageText = pageTextForSectionHeader(pageData.get(pageNum));
    const normalized = normalizeForDetection(pageText);

    if (logDump) {
      console.log(`\n=== 페이지 ${pageNum} ===`);
      console.log("원문(앞300자):", pageText.slice(0, 300));
      console.log("정규화(앞300자):", normalized.slice(0, 300));
    }

    const sig = effectiveSectionKind(pageNum, pageText, visionHints);
    if (sig === "IGNORE") {
      ignorePages.add(pageNum);
      continue;
    }

    if (sig === null) continue;

    if (sig === "parcel") {
      const sectionKey = parcelSectionKeyFromPage(pageText);
      if (lastParcelKey !== sectionKey) {
        interior.push({ page: pageNum, kind: "parcel", sectionKey });
        lastParcelKey = sectionKey;
      }
      continue;
    }

    if (sig === "building") {
      const flatWs = flatWsOnly(pageText);
      const hardBreak = hasBracketBuildingNearTopFlat(flatWs);
      const prev = interior[interior.length - 1];
      if (!hardBreak && prev?.kind === "building" && prev.page === pageNum - 1) {
        continue;
      }
      interior.push({ page: pageNum, kind: "building", hardBreak });
      lastParcelKey = null;
      continue;
    }

    if (sig === "building_registry") {
      const prev = interior[interior.length - 1];
      if (prev?.kind !== "building_registry") {
        interior.push({ page: pageNum, kind: "building_registry" });
      }
      lastParcelKey = null;
      continue;
    }

    if (sig === "land_use_plan") {
      const prev = interior[interior.length - 1];
      if (prev?.kind !== "land_use_plan") {
        interior.push({ page: pageNum, kind: "land_use_plan" });
      }
      lastParcelKey = null;
    }
  }

  const buildingRows = interior.filter((r): r is Extract<InteriorRow, { kind: "building" }> => r.kind === "building");
  const buildingKeys = finalizeBuildingKeys(buildingRows);
  let bi = 0;

  const starts: { page: number; sectionKey: string }[] = interior.map((row) => {
    switch (row.kind) {
      case "parcel":
        return { page: row.page, sectionKey: row.sectionKey };
      case "building": {
        const key = buildingKeys[bi]!;
        bi += 1;
        return { page: row.page, sectionKey: key };
      }
      case "building_registry":
        return { page: row.page, sectionKey: "건축물대장" };
      case "land_use_plan":
        return { page: row.page, sectionKey: LAND_USE_PLAN_SECTION_KEY };
    }
  });

  const sectionRanges = sectionRangesFromStarts(starts, numPages, ignorePages);
  if (logDump) {
    console.log("=== 최종 sectionRanges ===");
    console.log(JSON.stringify(sectionRanges, null, 2));
  }
  return sectionRanges;
}

export function computePdfSectionRanges(
  pageData: Map<number, PageStrings>,
  numPages: number,
  options?: ComputePdfSectionRangesOptions,
): PdfSectionRange[] {
  return computePdfSectionRangesCore(pageData, numPages, {
    visionHints: options?.visionHints,
    logDump: options?.logDump !== false,
  });
}

/**
 * 건축물대장 구간으로 보이는 **첫** 페이지(1-based). 없으면 null.
 * (비전 힌트 없음 — 스크롤 보조용)
 */
export function getBuildingRegistryStartPage(
  pageData: Map<number, PageStrings>,
  numPages: number,
): number | null {
  const ranges = computePdfSectionRangesCore(pageData, numPages, {
    logDump: false,
    visionHints: new Map(),
  });
  const br = ranges.find((r) => r.sectionKey === "건축물대장");
  if (br?.startPage != null) return br.startPage;
  for (let p = 1; p <= numPages; p++) {
    const pageNorm = pageTextForSectionHeader(pageData.get(p));
    if (detectSectionKey(pageNorm) === "building_registry") return p;
  }
  return null;
}