import type { CharRange } from "@/lib/pdfTextMatch";
import { isExactNumericBoundaryOk } from "@/lib/pdfTextMatch";

/** trim + 연속 공백 → 단일 공백 (검색어·PDF joined 동일 적용) */
export function normalizeForSearch(s: string): string {
  return s.trim().replace(/\s+/g, " ");
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

/**
 * joined와 동일한 규칙으로 만든 norm 문자열과,
 * norm[j]에 해당하는 원문 joined 내 시작 인덱스(코드 단위) 배열 (len = norm.length)
 */
export function buildNormCharOrigStarts(joined: string): { norm: string; starts: number[] } {
  const starts: number[] = [];
  let norm = "";
  const { start: a, end: b } = trimRange(joined);
  let i = a;
  let needSpace = false;
  let lastWsStart = a;

  while (i < b) {
    if (/\s/.test(joined[i]!)) {
      lastWsStart = i;
      while (i < b && /\s/.test(joined[i]!)) i++;
      needSpace = true;
      continue;
    }
    if (needSpace && norm.length > 0) {
      norm += " ";
      starts.push(lastWsStart);
      needSpace = false;
    }
    starts.push(i);
    norm += joined[i]!;
    i += codePointLen(joined, i);
  }
  return { norm, starts };
}

function origEndExclusive(joined: string, lastCharStart: number): number {
  return lastCharStart + codePointLen(joined, lastCharStart);
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
  const nq = normalizeForSearch(needle);
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
