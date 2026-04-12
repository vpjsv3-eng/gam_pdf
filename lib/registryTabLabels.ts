import type { RegistryParcel } from "@/lib/analysisTypes";

/** 탭 제목: 토지 296-3, 건물 1동 등 */
export function registryParcelTabTitle(p: RegistryParcel, index: number): string {
  const addr = (p.address ?? "").trim();
  if (p.type === "토지") {
    const m = addr.match(/(\d+-\d+)\b/);
    return m ? `토지 ${m[1]}` : `토지 ${index + 1}`;
  }
  const m2 = addr.match(/(\d+)\s*동\b/) ?? addr.match(/(\d+)동/);
  return m2 ? `건물 ${m2[1]}동` : `건물 ${index + 1}`;
}
