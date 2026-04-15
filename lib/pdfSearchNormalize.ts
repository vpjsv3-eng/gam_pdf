import type { CharRange } from "@/lib/pdfTextMatch";
import { isExactNumericBoundaryOk } from "@/lib/pdfTextMatch";

/**
 * 검색·페이지 포함 여부 판단에 공통 적용 (순서 고정)
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * PDF 원문 하이라이트용 검색어. GPT가 `김광현 외 1인`처럼 합쳐 반환한 경우
 * PDF에는 줄별로만 있을 수 있어 `외 N인` 접미를 제거한 대표 이름만 쓴다.
 */
export function pdfHighlightQueryFromDisplayValue(query: string): string {
  const t = query.trim();
  const stripped = t.replace(/\s*외\s*\d+인\s*$/, "").trim();
  return stripped.length > 0 ? stripped : t;
}

/**
 * 지분현황 요약값(예: `김광현 4분의 3, 황유란 4분의 1`)을 PDF에서 찾을 때는
 * 원문에 흔한 `지분 4분의 3` 형태로 첫 번째 분만 추출해 검색한다.
 */
export function getJibunSearchText(jibunValue: string): string {
  const t = jibunValue.trim();
  const m = t.match(/(\d+\s*분의\s*\d+)/);
  if (m) {
    const frac = m[1]!.replace(/\s+/g, " ").trim();
    return `지분 ${frac}`;
  }
  return t;
}

/** @deprecated `normalizeText` 사용 */
export function normalizeForSearch(s: string): string {
  return normalizeText(s);
}

function trimRange(s: string): { start: number; end: number } {
  let a = 0;
  let b = s.length;
  while (a < b && /\s/.test(s[a]!)) a++;
  while (b > a && /\s/.test(s[b - 1]!)) b--;
  return { start: a, end: b };
}

function codePointLen(s: string, i: number): number {
  const c = s.codePointAt(i);
  if (c === undefined) return 1;
  return c > 0xffff ? 2 : 1;
}

/** normalizeText와 동일한 전처리(인덱스는 원문 joined 기준 유지) */
function preprocessJoinedForNormWalk(joined: string): string {
  return joined.replace(/\r\n|\r|\n/g, " ").replace(/\u00a0/g, " ");
}

/**
 * joined와 동일한 규칙으로 만든 norm 문자열과,
 * norm[j]에 해당하는 원문 joined 내 시작 인덱스(코드 단위) 배열 (len = norm.length)
 */
export function buildNormCharOrigStarts(joined: string): { norm: string; starts: number[] } {
  const starts: number[] = [];
  let norm = "";
  const s = preprocessJoinedForNormWalk(joined);
  const { start: a, end: b } = trimRange(s);
  let i = a;
  let needSpace = false;
  let lastWsStart = a;

  while (i < b) {
    if (/\s/.test(s[i]!)) {
      lastWsStart = i;
      while (i < b && /\s/.test(s[i]!)) i++;
      needSpace = true;
      continue;
    }
    if (needSpace && norm.length > 0) {
      norm += " ";
      starts.push(lastWsStart);
      needSpace = false;
    }
    starts.push(i);
    norm += s[i]!;
    i += codePointLen(s, i);
  }
  return { norm, starts };
}

function origEndExclusive(joined: string, lastCharStart: number): number {
  const s = preprocessJoinedForNormWalk(joined);
  return lastCharStart + codePointLen(s, lastCharStart);
}

function origRangeForNormMatch(
  starts: number[],
  joined: string,
  mi: number,
  len: number,
): CharRange | null {
  if (len < 1 || mi + len > starts.length) return null;
  const start = starts[mi]!;
  const lastSt = starts[mi + len - 1]!;
  return { start, end: origEndExclusive(joined, lastSt) };
}

/** normalized needle이 등장하는 모든 (원문 joined 기준) [start,end) 구간 */
export function findNormalizedNeedleRanges(joined: string, needle: string): CharRange[] {
  const nq = normalizeText(needle);
  if (!nq) return [];
  const { norm, starts } = buildNormCharOrigStarts(joined);
  if (norm.length < nq.length) return [];
  const out: CharRange[] = [];
  for (let pos = 0; pos <= norm.length - nq.length; pos++) {
    if (norm.slice(pos, pos + nq.length) !== nq) continue;
    const r = origRangeForNormMatch(starts, joined, pos, nq.length);
    if (r) out.push(r);
  }
  return out;
}

/** 숫자·면적·금액 등 경계 검사 통과하는 구간만 */
export function findNormalizedValueRanges(joined: string, value: string): CharRange[] {
  const q = value.trim();
  if (!q) return [];
  return findNormalizedNeedleRanges(joined, q).filter((r) =>
    isExactNumericBoundaryOk(joined, r.start, r.end, q),
  );
}

/** 같은 시작 위치면 더 긴 구간이 앞서도록: 먼저 뒤쪽(보통 최신 행)부터 시도 */
export function sortCharRangesByStartDesc(ranges: CharRange[]): CharRange[] {
  return [...ranges].sort((a, b) => {
    if (b.start !== a.start) return b.start - a.start;
    return a.end - a.end - (b.end - b.start);
  });
}
