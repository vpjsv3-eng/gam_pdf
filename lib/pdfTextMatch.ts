/** PDF 텍스트 레이어: span 순서대로 이어붙인 문자열 기준 매칭 */

export const PDF_HIGHLIGHT_BG = "rgba(255, 235, 0, 0.6)";

export type CharRange = { start: number; end: number };

/** 숫자·금액·면적 등 쿼리가 더 큰 수의 일부로 붙지 않게 할 때 */
function queryHasDigit(q: string): boolean {
  return /\d/.test(q);
}

function isDigitLikeBoundaryChar(c: string): boolean {
  return c !== "" && /[\d.,]/.test(c);
}

/**
 * joined 전체에서 [start,end)가 q와 일치할 때,
 * 숫자성 쿼리는 앞뒤에 숫자/콤마/점이 붙어 있으면 무효 (1384.12 안의 384.12 방지)
 */
export function isExactNumericBoundaryOk(
  joined: string,
  start: number,
  end: number,
  q: string,
): boolean {
  if (!queryHasDigit(q)) return true;
  const before = start > 0 ? joined[start - 1] ?? "" : "";
  const after = end < joined.length ? joined[end] ?? "" : "";
  if (isDigitLikeBoundaryChar(before)) return false;
  if (isDigitLikeBoundaryChar(after)) return false;
  return true;
}

function joinedFromSpans(strings: string[]): string {
  return strings.join("");
}

function spanCharRange(strings: string[], spanIndex: number): CharRange {
  let start = 0;
  for (let j = 0; j < spanIndex; j++) {
    start += (strings[j] ?? "").length;
  }
  const len = (strings[spanIndex] ?? "").length;
  return { start, end: start + len };
}

/**
 * 1) 인접 span을 이어붙인 전체 문자열에서 **완전 일치**만 (숫자성 쿼리는 경계 검사)
 * 2) 없으면 **단일 span** 중 검색어를 포함하는 것 중 **가장 짧은 span** (동일 길이는 문서 순)
 * 부분 문자열만 맞추는 longest-substring 매칭은 하지 않음.
 */
export function collectPdfTextMatchRanges(strings: string[], query: string): CharRange[] {
  const q = query.trim();
  if (q.length < 1 || strings.length === 0) return [];

  const joined = joinedFromSpans(strings);
  const out: CharRange[] = [];

  let pos = 0;
  while (pos <= joined.length - q.length) {
    const idx = joined.indexOf(q, pos);
    if (idx < 0) break;
    if (joined.slice(idx, idx + q.length) === q && isExactNumericBoundaryOk(joined, idx, idx + q.length, q)) {
      out.push({ start: idx, end: idx + q.length });
    }
    pos = idx + 1;
  }
  if (out.length > 0) return out;

  let bestLen = Infinity;
  const spanIdxs: number[] = [];
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i] ?? "";
    if (!substringMatchesWithNumericBoundaries(s, q)) continue;
    if (s.length < bestLen) {
      bestLen = s.length;
      spanIdxs.length = 0;
      spanIdxs.push(i);
    } else if (s.length === bestLen) {
      spanIdxs.push(i);
    }
  }
  for (const i of spanIdxs) {
    out.push(spanCharRange(strings, i));
  }
  return out;
}

/** span 문자열 안에서 q가 등장할 때마다 숫자성 쿼리는 해당 위치 경계 검사 */
function substringMatchesWithNumericBoundaries(s: string, q: string): boolean {
  if (!q) return false;
  let pos = 0;
  while (pos <= s.length - q.length) {
    const idx = s.indexOf(q, pos);
    if (idx < 0) break;
    if (
      s.slice(idx, idx + q.length) === q &&
      isExactNumericBoundaryOk(s, idx, idx + q.length, q)
    ) {
      return true;
    }
    pos = idx + 1;
  }
  return false;
}

/** @deprecated collectPdfTextMatchRanges 사용 */
export function findQueryMatchCandidates(strings: string[], query: string): CharRange[] {
  return collectPdfTextMatchRanges(strings, query);
}

/** @deprecated collectPdfTextMatchRanges 사용 */
export function findQueryRangeInJoinedStrings(
  strings: string[],
  query: string,
): CharRange | null {
  const r = collectPdfTextMatchRanges(strings, query);
  return r[0] ?? null;
}

/** [start, end)와 겹치는 문자 구간을 가진 span 인덱스 목록 */
export function spanIndicesForCharRange(
  strings: string[],
  start: number,
  end: number,
): number[] {
  const out: number[] = [];
  let pos = 0;
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i] ?? "";
    const divStart = pos;
    const divEnd = pos + s.length;
    if (divEnd > start && divStart < end) out.push(i);
    pos = divEnd;
  }
  return out;
}
