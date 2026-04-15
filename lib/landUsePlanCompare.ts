import type { LandUsePlanBlock, RegistryParcel } from "@/lib/analysisTypes";
import { normalizeText } from "@/lib/pdfSearchNormalize";

function compact(s: string): string {
  return normalizeText(s).replace(/\s+/g, "");
}

/** 첫 번째 토지 등기 필지 */
export function firstLandParcel(parcels: RegistryParcel[]): RegistryParcel | undefined {
  return parcels.find((p) => p.type === "토지");
}

function parseAreaM2(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.replace(/[㎡m²]/gi, "").replace(/,/g, "").trim();
  const m = t.match(/[\d.]+/);
  if (!m) return null;
  const n = parseFloat(m[0]!);
  return Number.isFinite(n) ? n : null;
}

export type LandUseVsLandRegistry = {
  소재지지번_일치: boolean | null;
  지목_일치: boolean | null;
  면적_일치: boolean | null;
  이용계획_소재지지번: string;
  등기_주소: string;
  이용계획_지목: string;
  등기_지목: string;
  이용계획_면적: string;
  등기_면적: string;
};

export function compareLandUseToFirstLandParcel(
  plan: LandUsePlanBlock | null | undefined,
  land: RegistryParcel | undefined,
): LandUseVsLandRegistry | null {
  if (!plan || !land) return null;
  const bi = (land.basic_info ?? {}) as Record<string, unknown>;
  const regAddr = String(land.address ?? "").trim();
  const regJimok = bi["지목"] == null ? "" : String(bi["지목"]).trim();
  const regArea = bi["면적"] == null ? "" : String(bi["면적"]).trim();

  const pAddr = `${String(plan.소재지 ?? "").trim()} ${String(plan.지번 ?? "").trim()}`.trim();
  const pJimok = String(plan.지목 ?? "").trim();
  const pArea = String(plan.면적 ?? "").trim();

  const a = compact(pAddr);
  const b = compact(regAddr);
  let 소재지지번_일치: boolean | null = null;
  if (a.length > 0 && b.length > 0) {
    소재지지번_일치 = a === b || b.includes(a) || a.includes(b);
  }

  const j1 = normalizeText(pJimok);
  const j2 = normalizeText(regJimok);
  const 지목_일치 =
    j1.length > 0 && j2.length > 0 ? j1 === j2 : j1.length === 0 && j2.length === 0 ? true : null;

  const n1 = parseAreaM2(pArea);
  const n2 = parseAreaM2(regArea);
  let 면적_일치: boolean | null = null;
  if (n1 != null && n2 != null) {
    면적_일치 = Math.abs(n1 - n2) < 0.05;
  }

  return {
    소재지지번_일치,
    지목_일치,
    면적_일치,
    이용계획_소재지지번: pAddr || "—",
    등기_주소: regAddr || "—",
    이용계획_지목: pJimok || "—",
    등기_지목: regJimok || "—",
    이용계획_면적: pArea || "—",
    등기_면적: regArea || "—",
  };
}
