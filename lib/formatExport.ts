import type { AnalysisResult, RegistryParcel } from "@/lib/analysisTypes";

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function parcelBlock(p: RegistryParcel, i: number): string[] {
  const lines: string[] = [];
  lines.push(`=== ${p.type} ${i + 1} : ${p.address} ===`);
  lines.push("[basic_info]");
  const bi = p.basic_info ?? {};
  for (const [k, v] of Object.entries(bi)) {
    lines.push(`${k}: ${str(v)}`);
  }
  lines.push("");
  lines.push("[ownership]");
  const o = p.ownership ?? {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "이전이력" && Array.isArray(v)) {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${k}: ${str(v)}`);
    }
  }
  lines.push("");
  lines.push("[rights]");
  const r = p.rights ?? {};
  lines.push(`근저당권: ${JSON.stringify(r.근저당권 ?? [])}`);
  lines.push(`지상권: ${str(r.지상권)}`);
  lines.push(`압류가압류: ${str(r.압류가압류)}`);
  lines.push("");
  lines.push("[special_notes]");
  (p.special_notes ?? []).forEach((n) => lines.push(`- ${n}`));
  lines.push("");
  return lines;
}

export function formatAnalysisAsPlainText(data: AnalysisResult): string {
  const lines: string[] = [];
  data.parcels.forEach((p, i) => {
    lines.push(...parcelBlock(p, i));
  });
  if (data.building_registry && Object.keys(data.building_registry).length) {
    lines.push("=== 건축물대장 (집계) ===");
    lines.push(JSON.stringify(data.building_registry, null, 2));
    lines.push("");
  }
  if (data.summary) {
    lines.push("=== summary ===");
    lines.push(JSON.stringify(data.summary, null, 2));
  }
  return lines.join("\n").trim();
}

export function formatAnalysisAsTsv(data: AnalysisResult): string {
  const rows: string[] = [];
  rows.push(["구분", "항목", "내용"].join("\t"));
  data.parcels.forEach((p, idx) => {
    const prefix = `${p.type}${idx + 1}`;
    const bi = p.basic_info ?? {};
    Object.entries(bi).forEach(([k, v]) => {
      rows.push([prefix, `basic_info.${k}`, str(v).replace(/\t/g, " ")].join("\t"));
    });
    const o = p.ownership ?? {};
    Object.entries(o).forEach(([k, v]) => {
      const content = Array.isArray(v) ? JSON.stringify(v) : str(v);
      rows.push([prefix, `ownership.${k}`, content.replace(/\t/g, " ")].join("\t"));
    });
    const r = p.rights ?? {};
    rows.push([prefix, "rights.근저당권", JSON.stringify(r.근저당권 ?? []).replace(/\t/g, " ")].join("\t"));
    rows.push([prefix, "rights.지상권", str(r.지상권)].join("\t"));
    rows.push([prefix, "rights.압류가압류", str(r.압류가압류)].join("\t"));
    (p.special_notes ?? []).forEach((n, ni) => {
      rows.push([prefix, `special_notes.${ni + 1}`, n.replace(/\t/g, " ")].join("\t"));
    });
  });
  if (data.building_registry) {
    rows.push(["건축물대장", "raw", JSON.stringify(data.building_registry).replace(/\t/g, " ")].join("\t"));
  }
  if (data.summary) {
    rows.push(["summary", "raw", JSON.stringify(data.summary).replace(/\t/g, " ")].join("\t"));
  }
  return rows.join("\n");
}

export function safeParseAnalysisResult(raw: unknown): AnalysisResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { parcels?: unknown };
  if (!Array.isArray(o.parcels)) return null;
  const br = (o as { building_registry?: unknown }).building_registry;
  const sm = (o as { summary?: unknown }).summary;
  return {
    parcels: o.parcels as RegistryParcel[],
    building_registry:
      br && typeof br === "object" ? (br as AnalysisResult["building_registry"]) : null,
    summary: sm && typeof sm === "object" ? (sm as AnalysisResult["summary"]) : null,
  };
}
