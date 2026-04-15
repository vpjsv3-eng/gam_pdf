import type { RegistryParcel } from "@/lib/analysisTypes";

/** 탭 제목: 토지 296-3, 건물 1, 건물 2 … — PDF `computePdfSectionRanges`의 건물 sectionKey와 동일 */
export function registryParcelTabTitle(
  p: RegistryParcel,
  index: number,
  parcels: RegistryParcel[] = [],
): string {
  const addr = (p.address ?? "").trim();
  if (p.type === "토지") {
    const m = addr.match(/(\d+-\d+)\b/);
    return m ? `토지 ${m[1]}` : `토지 ${index + 1}`;
  }
  const ord = parcels.slice(0, index + 1).filter((x) => x.type === "건물").length;
  const nBuild = parcels.filter((x) => x.type === "건물").length;
  if (nBuild === 1) return "건물 1";
  return ord > 0 ? `건물 ${ord}` : `건물 ${index + 1}`;
}
