import type {
  AnalysisResult,
  CadastralMapBlock,
  JointOwnershipBlock,
  LandRegisterBlock,
  LandUsePlanBlock,
  RegistryParcel,
} from "@/lib/analysisTypes";

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
  if (data.land_use_plan && Object.keys(data.land_use_plan).length) {
    lines.push("=== 토지이용계획확인서 ===");
    lines.push(JSON.stringify(data.land_use_plan, null, 2));
    lines.push("");
  }
  if (data.land_register && Object.keys(data.land_register).length) {
    lines.push("=== 토지대장 ===");
    lines.push(JSON.stringify(data.land_register, null, 2));
    lines.push("");
  }
  if (data.joint_ownership && Object.keys(data.joint_ownership).length) {
    lines.push("=== 공유지연명부 ===");
    lines.push(JSON.stringify(data.joint_ownership, null, 2));
    lines.push("");
  }
  if (data.cadastral_map && Object.keys(data.cadastral_map).length) {
    lines.push("=== 지적도 ===");
    lines.push(JSON.stringify(data.cadastral_map, null, 2));
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
  if (data.land_use_plan) {
    rows.push(["토지이용계획", "raw", JSON.stringify(data.land_use_plan).replace(/\t/g, " ")].join("\t"));
  }
  if (data.land_register) {
    rows.push(["토지대장", "raw", JSON.stringify(data.land_register).replace(/\t/g, " ")].join("\t"));
  }
  if (data.joint_ownership) {
    rows.push(["공유지연명부", "raw", JSON.stringify(data.joint_ownership).replace(/\t/g, " ")].join("\t"));
  }
  if (data.cadastral_map) {
    rows.push(["지적도", "raw", JSON.stringify(data.cadastral_map).replace(/\t/g, " ")].join("\t"));
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
  const rawLup = (o as { land_use_plan?: unknown }).land_use_plan;
  const rawLr = (o as { land_register?: unknown }).land_register;
  const rawJo = (o as { joint_ownership?: unknown }).joint_ownership;
  const rawCm = (o as { cadastral_map?: unknown }).cadastral_map;
  const sm = (o as { summary?: unknown }).summary;
  let land_use_plan: LandUsePlanBlock | null | undefined;
  if ("land_use_plan" in o) {
    land_use_plan =
      rawLup === null
        ? null
        : rawLup && typeof rawLup === "object"
          ? (rawLup as LandUsePlanBlock)
          : null;
  }
  let land_register: LandRegisterBlock | null | undefined;
  if ("land_register" in o) {
    land_register =
      rawLr === null
        ? null
        : rawLr && typeof rawLr === "object"
          ? (rawLr as LandRegisterBlock)
          : null;
  }
  let joint_ownership: JointOwnershipBlock | null | undefined;
  if ("joint_ownership" in o) {
    joint_ownership =
      rawJo === null
        ? null
        : rawJo && typeof rawJo === "object"
          ? (rawJo as JointOwnershipBlock)
          : null;
  }
  let cadastral_map: CadastralMapBlock | null | undefined;
  if ("cadastral_map" in o) {
    cadastral_map =
      rawCm === null
        ? null
        : rawCm && typeof rawCm === "object"
          ? (rawCm as CadastralMapBlock)
          : null;
  }
  return {
    parcels: o.parcels as RegistryParcel[],
    building_registry:
      br && typeof br === "object" ? (br as AnalysisResult["building_registry"]) : null,
    land_use_plan,
    land_register,
    joint_ownership,
    cadastral_map,
    summary: sm && typeof sm === "object" ? (sm as AnalysisResult["summary"]) : null,
  };
}
