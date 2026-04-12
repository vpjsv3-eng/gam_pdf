import type { AnalysisResult } from "@/lib/analysisTypes";

const STORAGE_PREFIX = "realty_analysis_";
const INDEX_KEY = "realty_analysis_index";
const MAX_SAVED = 20;

export type SavedAnalysisIndexEntry = {
  /** localStorage 키 전체 */
  storageKey: string;
  savedAt: number;
  /** 표시용 파일/출처 이름 */
  fileLabel: string;
  /** 첫 필지 소재지 요약 */
  address: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readIndex(): SavedAnalysisIndexEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedAnalysisIndexEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: SavedAnalysisIndexEntry[]) {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    /* quota 등 */
  }
}

/** 파일명·날짜에 안전한 토큰 (키 충돌·특수문자 방지) */
function sanitizeFileToken(label: string): string {
  const base = label.trim() || "analysis";
  const cleaned = base
    .replace(/\.pdf$/gi, "")
    .replace(/[^\w\uAC00-\uD7A3\u3040-\u30FF\u4E00-\u9FFF\-+.]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return (cleaned || "analysis").slice(0, 96);
}

/** 날짜 구간: YYYY-MM-DD_HH-mm-ss_mmm (같은 초 재저장 구분) */
function formatDateForKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = [d.getFullYear(), p(d.getMonth() + 1), p(d.getDate())].join("-");
  const time = [p(d.getHours()), p(d.getMinutes()), p(d.getSeconds())].join("-");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${date}_${time}_${ms}`;
}

/** realty_analysis_{파일명}_{날짜} */
export function buildSavedAnalysisStorageKey(fileLabel: string, savedAt: number): string {
  const token = sanitizeFileToken(fileLabel);
  const datePart = formatDateForKey(new Date(savedAt));
  return `${STORAGE_PREFIX}${token}_${datePart}`;
}

function firstParcelAddress(result: AnalysisResult): string {
  const p0 = result.parcels?.[0];
  const s = (p0?.address ?? "").trim();
  return s || "—";
}

export function listSavedAnalyses(): SavedAnalysisIndexEntry[] {
  const index = readIndex();
  const alive: SavedAnalysisIndexEntry[] = [];
  for (const e of index) {
    if (!e?.storageKey?.startsWith(STORAGE_PREFIX)) continue;
    try {
      if (localStorage.getItem(e.storageKey) === null) continue;
    } catch {
      continue;
    }
    alive.push(e);
  }
  if (alive.length !== index.length) {
    writeIndex(alive);
  }
  return [...alive].sort((a, b) => b.savedAt - a.savedAt);
}

export function saveAnalysisToStorage(result: AnalysisResult, fileLabel: string): void {
  if (!canUseStorage()) return;
  const savedAt = Date.now();
  const storageKey = buildSavedAnalysisStorageKey(fileLabel, savedAt);
  const address = firstParcelAddress(result);
  let json: string;
  try {
    json = JSON.stringify(result);
  } catch {
    return;
  }
  try {
    localStorage.setItem(storageKey, json);
  } catch {
    return;
  }

  let index = readIndex().filter((e) => e.storageKey !== storageKey);
  index.push({
    storageKey,
    savedAt,
    fileLabel: fileLabel.trim() || "분석",
    address,
  });
  index.sort((a, b) => a.savedAt - b.savedAt);
  while (index.length > MAX_SAVED) {
    const oldest = index.shift();
    if (oldest) {
      try {
        localStorage.removeItem(oldest.storageKey);
      } catch {
        /* ignore */
      }
    }
  }
  writeIndex(index);
}

export function deleteSavedAnalysis(storageKey: string): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
  const index = readIndex().filter((e) => e.storageKey !== storageKey);
  writeIndex(index);
}

export function loadSavedAnalysisJson(storageKey: string): string | null {
  if (!canUseStorage()) return null;
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
