import type { AnalysisResult, RegistryParcel } from "@/lib/analysisTypes";

export type AutoCheckStatus = "ok" | "warning" | "danger";

export type AutoCheckRow = {
  id: string;
  title: string;
  status: AutoCheckStatus;
  detail: string;
};

const MS_DAY = 86400000;
const YEAR_DAYS = 365;

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function landParcels(parcels: RegistryParcel[]) {
  return parcels.filter((p) => p.type === "토지");
}

function buildingParcels(parcels: RegistryParcel[]) {
  return parcels.filter((p) => p.type === "건물");
}

function parseTimeMs(raw: string): number | null {
  const t = raw.trim().replace(/년|\.|\//g, "-").replace(/월/g, "-").replace(/일/g, "");
  const d = Date.parse(t);
  if (!Number.isNaN(d)) return d;
  const m = raw.match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/);
  if (!m) return null;
  const x = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(x.getTime()) ? null : x.getTime();
}

function normalizeOwner(x: string): string {
  return x.replace(/\s+/g, "").replace(/[㈜()（）\[\]·.]/g, "").toLowerCase();
}

function coOwnerCountHint(지분현황: string, 소유형태: string): number {
  const j = 지분현황.trim();
  if (j) {
    const parts = j.split(/[,，、/]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 3) return parts.length;
  }
  const m = 소유형태.match(/(\d+)\s*인/);
  if (m) return Number(m[1]);
  return 0;
}

function hasPositiveMortgage(parcels: RegistryParcel[]): boolean {
  for (const p of parcels) {
    const list = p.rights?.근저당권 ?? [];
    for (const row of list) {
      const st = s(row.상태);
      if (st.includes("말소")) continue;
      if (s(row.채권최고액)) return true;
    }
  }
  return false;
}

function formatMortgageList(parcels: RegistryParcel[]): string {
  const bits: string[] = [];
  for (const p of parcels) {
    const list = p.rights?.근저당권 ?? [];
    for (const row of list) {
      if (s(row.상태).includes("말소")) continue;
      const line = [s(row.채권최고액), s(row.채권자), s(row.채무자)].filter(Boolean).join(" / ");
      if (line) bits.push(line);
    }
  }
  return bits.join(" · ");
}

function 압류있음(parcels: RegistryParcel[]): { hit: boolean; detail: string } {
  for (const p of parcels) {
    const t = s(p.rights?.압류가압류);
    if (!t) continue;
    if (/없음|없\s|해당\s*없|미해당|아니오|no/i.test(t) && !/있음|있\s|여/.test(t)) continue;
    if (/있음|있\s|가압류|압류/.test(t)) return { hit: true, detail: t };
  }
  return { hit: false, detail: "" };
}

function 지상권있음(parcels: RegistryParcel[]): { hit: boolean; detail: string } {
  for (const p of parcels) {
    const t = s(p.rights?.지상권);
    if (!t) continue;
    if (/없음|없\s|해당\s*없|설정\s*없|미설정|아니오/i.test(t)) continue;
    if (/설정|있음|있\s|지상권/.test(t)) return { hit: true, detail: t };
  }
  return { hit: false, detail: "" };
}

function mortgageWithinYearAfterTransfer(parcels: RegistryParcel[]): boolean {
  for (const p of landParcels(parcels)) {
    const t0 = parseTimeMs(s(p.ownership?.최근이전일));
    if (t0 === null) continue;
    const list = p.rights?.근저당권 ?? [];
    for (const row of list) {
      if (s(row.상태).includes("말소")) continue;
      const t1 = parseTimeMs(s(row.설정일));
      if (t1 === null) continue;
      const delta = t1 - t0;
      if (delta > 0 && delta <= YEAR_DAYS * MS_DAY) return true;
    }
  }
  return false;
}

function recentTransfersText(parcels: RegistryParcel[]): string {
  const rows: { ms: number; line: string }[] = [];
  for (const p of landParcels(parcels)) {
    const hist = p.ownership?.이전이력;
    if (Array.isArray(hist)) {
      for (const h of hist) {
        const ms = parseTimeMs(s(h.날짜));
        const line = `${s(h.날짜)} · ${s(h.원인)} · ${s(h.거래가액)}`;
        if (line.replace(/[·\s]/g, "")) rows.push({ ms: ms ?? 0, line });
      }
    }
    const one = `${s(p.ownership?.최근이전일)} · ${s(p.ownership?.이전원인)} · ${s(p.ownership?.거래가액)}`;
    if (one.replace(/[·\s]/g, "")) {
      const ms = parseTimeMs(s(p.ownership?.최근이전일));
      rows.push({ ms: ms ?? 0, line: one });
    }
  }
  rows.sort((a, b) => b.ms - a.ms);
  return rows
    .slice(0, 3)
    .map((r) => r.line)
    .join(" | ");
}

export function computeAppraisalAutoChecks(result: AnalysisResult): AutoCheckRow[] {
  const parcels = result.parcels ?? [];
  const lands = landParcels(parcels);
  const buildings = buildingParcels(parcels);
  const br = result.building_registry;
  const sm = result.summary;

  const rows: AutoCheckRow[] = [];

  const jimok = lands.map((p) => s(p.basic_info?.지목)).filter(Boolean);
  const yd = lands.map((p) => s(p.basic_info?.용도지역)).filter(Boolean);
  const miss = lands.some((p) => !s(p.basic_info?.지목) || !s(p.basic_info?.용도지역));
  rows.push({
    id: "zoning",
    title: "용도지역 / 지목 확인",
    status: miss ? "warning" : "ok",
    detail:
      miss
        ? `지목: ${jimok.join(", ") || "—"} / 용도지역: ${yd.join(", ") || "—"} (일부 null)`
        : `지목: ${jimok.join(", ")} / 용도지역: ${yd.join(", ")}`,
  });

  const firstLand = lands[0];
  const ownerName = s(firstLand?.ownership?.소유자명) || s(sm?.소유자);
  const shareType = s(firstLand?.ownership?.소유형태);
  const jibun = s(firstLand?.ownership?.지분현황);
  const co = coOwnerCountHint(jibun, shareType);
  rows.push({
    id: "owners",
    title: "소유자 확인",
    status: !ownerName ? "warning" : co >= 3 ? "warning" : "ok",
    detail: !ownerName
      ? "소유자명 없음"
      : co >= 3
        ? `소유자: ${ownerName} · ${shareType || "—"} — 공유자 다수 (${co}인 이상 추정)`
        : `소유자: ${ownerName} · ${shareType || "—"}`,
  });

  const landOwners = new Set(
    lands.map((p) => normalizeOwner(s(p.ownership?.소유자명))).filter(Boolean),
  );
  const bldOwners = new Set(
    buildings.map((p) => normalizeOwner(s(p.ownership?.소유자명))).filter(Boolean),
  );
  let ownMatch = true;
  if (landOwners.size && bldOwners.size) {
    for (const b of bldOwners) {
      if (!landOwners.has(b)) ownMatch = false;
    }
  }
  if (sm?.전체_소유자_일치 === false) ownMatch = false;
  if (sm?.전체_소유자_일치 === true) ownMatch = true;
  rows.push({
    id: "land_build_owner",
    title: "토지등기 ↔ 건물등기 소유자 일치",
    status: !landOwners.size || !bldOwners.size ? "warning" : ownMatch ? "ok" : "danger",
    detail:
      `토지: ${[...landOwners].join(", ") || "—"} / 건물: ${[...bldOwners].join(", ") || "—"}` +
      (ownMatch ? "" : " — 불일치"),
  });

  const landMatch =
    sm?.토지면적_대장면적_일치 === true
      ? true
      : sm?.토지면적_대장면적_일치 === false
        ? false
        : null;
  rows.push({
    id: "land_vs_site",
    title: "토지 면적 합계 ↔ 건축물대장 대지면적",
    status: landMatch === false ? "danger" : landMatch === true ? "ok" : "warning",
    detail: `등기·요약: ${s(sm?.총_토지_면적)} / 대장: ${s(br?.대지면적) || s(sm?.건축물대장_대지면적) || "—"}`,
  });

  const floorMatch =
    sm?.건물등기_연면적_대장_일치 === true
      ? true
      : sm?.건물등기_연면적_대장_일치 === false
        ? false
        : null;
  rows.push({
    id: "floor_area",
    title: "건물등기 연면적 ↔ 건축물대장 연면적",
    status: floorMatch === false ? "danger" : floorMatch === true ? "ok" : "warning",
    detail: `등기·요약: ${s(sm?.총_건물_연면적)} / 대장: ${s(br?.총연면적) || "—"}`,
  });

  const viol = s(br?.위반건축물);
  const violBad = /해당|위반|예|yes/i.test(viol) && !/해당\s*없|비해당|미해당|아니오|없음/i.test(viol);
  rows.push({
    id: "violation",
    title: "위반건축물 여부",
    status: !viol ? "warning" : violBad ? "danger" : "ok",
    detail: viol || "대장 위반건축물 항목 없음",
  });

  const hasM = hasPositiveMortgage(parcels);
  rows.push({
    id: "mortgage",
    title: "근저당권 현황",
    status: hasM ? "warning" : "ok",
    detail: hasM ? formatMortgageList(parcels) : "유효 근저당 없음",
  });

  const ap = 압류있음(parcels);
  rows.push({
    id: "seize",
    title: "압류 / 가압류 여부",
    status: ap.hit ? "danger" : "ok",
    detail: ap.hit ? ap.detail : "없음",
  });

  const es = 지상권있음(parcels);
  rows.push({
    id: "easement",
    title: "지상권 설정 여부",
    status: es.hit ? "warning" : "ok",
    detail: es.hit ? es.detail : "없음",
  });

  const multi = lands.length > 1 || buildings.length > 1;
  rows.push({
    id: "multi_plot",
    title: "토지 필지 수 / 건물 동 수",
    status: multi ? "warning" : "ok",
    detail: multi
      ? `토지 ${lands.length}필지 · 건물 ${buildings.length}동 — 일단지 여부 확인 필요`
      : `토지 ${lands.length}필지 · 건물 ${buildings.length}동`,
  });

  const histText = recentTransfersText(parcels);
  const mortSoon = mortgageWithinYearAfterTransfer(parcels);
  rows.push({
    id: "transfer_hist",
    title: "소유권 이전 이력",
    status: mortSoon ? "warning" : "ok",
    detail: (histText || "이전 이력 미추출") + (mortSoon ? " — 이전 후 1년 이내 근저당 설정 의심" : ""),
  });

  return rows;
}

export const MANUAL_CHECKLIST_ITEMS: { id: string; label: string }[] = [
  { id: "m1", label: "세움터 도면신청 / 전례요청" },
  { id: "m2", label: "현장조사 일정 약속 (임대차확인서, 매매계약서, 내부사진)" },
  { id: "m3", label: "전례 있는 경우 제시외 건물 / 위반건축물 추가 확인" },
  { id: "m5", label: "지적도상 맹지 여부 및 출입 가능성 확인" },
  { id: "m6", label: "제시외 건물 존재 여부 (현장 확인)" },
  { id: "m7", label: "도시철도 저촉 여부 (토지이음 확인)" },
  { id: "m8", label: "공부와 현황 불일치 여부 (현장 확인)" },
];

export function manualChecklistStorageKey(fileKey: string): string {
  const safe = fileKey.trim().replace(/[^\w\uAC00-\uD7A3\-+.]+/g, "_").slice(0, 120) || "default";
  return `appraisal_manual_v1_${safe}`;
}

export function loadManualChecks(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, boolean>;
    return typeof o === "object" && o ? o : {};
  } catch {
    return {};
  }
}

export function saveManualChecks(key: string, map: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
