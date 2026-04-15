"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult, RegistryParcel } from "@/lib/analysisTypes";
import AppraisalChecklist from "@/app/components/AppraisalChecklist";
import CadastralMapPanel from "@/app/components/CadastralMapPanel";
import JointOwnershipPanel from "@/app/components/JointOwnershipPanel";
import LandRegisterPanel from "@/app/components/LandRegisterPanel";
import LandUsePlanPanel from "@/app/components/LandUsePlanPanel";
import PdfViewerPanel, { type PdfViewerHandle } from "@/app/components/PdfViewerPanel";
import SavedAnalysesSection from "@/app/components/SavedAnalysesSection";
import {
  formatAnalysisAsPlainText,
  formatAnalysisAsTsv,
  safeParseAnalysisResult,
} from "@/lib/formatExport";
import { registryParcelTabTitle } from "@/lib/registryTabLabels";
import { SAMPLE_PDF_TEXT } from "@/lib/sampleText";
import { saveAnalysisToStorage } from "@/lib/savedAnalysisStorage";
import { extractTextFromPdfBuffer } from "@/lib/extractPdfText";
import { buildAnalyzeRequestJson } from "@/lib/analyzePayloadClient";
import { compareLandUseToFirstLandParcel, firstLandParcel } from "@/lib/landUsePlanCompare";
import {
  CADASTRAL_MAP_SECTION_KEY,
  JOINT_OWNERSHIP_SECTION_KEY,
  LAND_REGISTER_SECTION_KEY,
  LAND_USE_PLAN_SECTION_KEY,
  type PdfSectionRange,
} from "@/lib/pdfSectionPages";
import { getJibunSearchText } from "@/lib/pdfSearchNormalize";

function isPdfSectionTabKey(k: string): boolean {
  return (
    k.startsWith("토지 ") ||
    k.startsWith("건물 ") ||
    k === "건축물대장" ||
    k === LAND_USE_PLAN_SECTION_KEY ||
    k === LAND_REGISTER_SECTION_KEY ||
    k === JOINT_OWNERSHIP_SECTION_KEY ||
    k === CADASTRAL_MAP_SECTION_KEY
  );
}

function pdfTabLabel(sectionKey: string): string {
  if (sectionKey === LAND_USE_PLAN_SECTION_KEY) return "토지이용계획";
  if (sectionKey === LAND_REGISTER_SECTION_KEY) return "토지대장";
  if (sectionKey === JOINT_OWNERSHIP_SECTION_KEY) return "공유지연명부";
  if (sectionKey === CADASTRAL_MAP_SECTION_KEY) return "지적도";
  return sectionKey;
}

function parcelIndexForSectionKey(sectionKey: string, parcels: RegistryParcel[]): number {
  for (let i = 0; i < parcels.length; i++) {
    if (registryParcelTabTitle(parcels[i]!, i, parcels) === sectionKey) return i;
  }
  return -1;
}

type LegacySecondaryTab =
  | { idx: number; kind: "parcel"; parcelIndex: number; label: string }
  | { idx: number; kind: "building"; label: string }
  | { idx: number; kind: "land_use"; label: string }
  | { idx: number; kind: "land_register"; label: string }
  | { idx: number; kind: "joint"; label: string }
  | { idx: number; kind: "cadastral"; label: string };

type UploadedFile = {
  id: string;
  name: string;
  size: number;
};

function fieldAnchor(data: Record<string, unknown>, fieldKey: string): string | undefined {
  const raw = data[`${fieldKey}_anchor`];
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

function SourceLink({
  fileCount,
  onGoTo,
  text,
  sectionKey,
  anchor,
  highlightQuery,
}: {
  fileCount: number;
  onGoTo: (fileIndex: number, highlightText: string, sectionKey: string, anchor?: string) => void;
  text: string;
  sectionKey: string;
  anchor?: string;
  /** PDF 검색에 쓸 문자열(표시 \`text\`와 다를 때, 예: 지분현황) */
  highlightQuery?: string;
}) {
  const t = text.trim();
  const q = (highlightQuery ?? text).trim();
  if (fileCount <= 0 || !t || !q) return null;
  return (
    <button
      type="button"
      onClick={() => onGoTo(0, q, sectionKey, anchor)}
      className="shrink-0 text-xs text-sky-600 underline-offset-2 hover:underline"
    >
      🔍 원본
    </button>
  );
}

function DetailRow({
  label,
  value,
  fileCount,
  onGoTo,
  sectionKey,
  anchor,
}: {
  label: string;
  value: string;
  fileCount: number;
  onGoTo: (fileIndex: number, highlightText: string, sectionKey: string, anchor?: string) => void;
  sectionKey: string;
  anchor?: string;
}) {
  const v = value.trim();
  const highlightQuery =
    label === "지분현황"
      ? getJibunSearchText(v)
      : label === "층수"
        ? v.match(/\d+층/)?.[0] ??
          (() => {
            const digits = v.replace(/[^0-9]/g, "");
            return digits.length > 0 ? `${digits}층` : undefined;
          })()
        : undefined;
  return (
    <div className="grid grid-cols-[minmax(8rem,11rem)_1fr] gap-3 border-b border-zinc-100 py-2.5 text-sm last:border-0">
      <div className="shrink-0 text-zinc-500">{label}</div>
      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
        <span className="min-w-0 break-words text-zinc-900">{v || "—"}</span>
        <SourceLink
          fileCount={fileCount}
          onGoTo={onGoTo}
          text={v}
          sectionKey={sectionKey}
          anchor={anchor}
          highlightQuery={highlightQuery}
        />
      </div>
    </div>
  );
}

/** 건축물대장 탭: 텍스트 검색 대신 대장 구간 첫 페이지로만 이동 */
function RegistrySectionSourceLink({
  fileCount,
  onScrollToRegistryPdfSection,
  hasValue,
}: {
  fileCount: number;
  onScrollToRegistryPdfSection: () => void;
  hasValue: boolean;
}) {
  if (fileCount <= 0 || !hasValue) return null;
  return (
    <button
      type="button"
      onClick={onScrollToRegistryPdfSection}
      className="shrink-0 text-xs text-sky-600 underline-offset-2 hover:underline"
    >
      🔍 원본
    </button>
  );
}

function RegistryDetailRow({
  label,
  value,
  fileCount,
  onScrollToRegistryPdfSection,
}: {
  label: string;
  value: string;
  fileCount: number;
  onScrollToRegistryPdfSection: () => void;
}) {
  const v = value.trim();
  return (
    <div className="grid grid-cols-[minmax(8rem,11rem)_1fr] gap-3 border-b border-zinc-100 py-2.5 text-sm last:border-0">
      <div className="shrink-0 text-zinc-500">{label}</div>
      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
        <span className="min-w-0 break-words text-zinc-900">{v || "—"}</span>
        <RegistrySectionSourceLink
          fileCount={fileCount}
          onScrollToRegistryPdfSection={onScrollToRegistryPdfSection}
          hasValue={Boolean(v)}
        />
      </div>
    </div>
  );
}

const RegistryParcelPanel = memo(function RegistryParcelPanel({
  parcel,
  parcelIndex,
  parcels,
  fileCount,
  onGoToSource,
}: {
  parcel: RegistryParcel;
  /** parcels 배열 기준 0-based — 탭 sectionKey와 동일한 키 계산용 */
  parcelIndex: number;
  parcels: RegistryParcel[];
  fileCount: number;
  onGoToSource: (
    fileIndex: number,
    highlightText: string,
    sectionKey: string,
    anchor?: string,
  ) => void;
}) {
  const bi = (parcel.basic_info ?? {}) as Record<string, unknown>;
  const o = (parcel.ownership ?? {}) as Record<string, unknown>;
  const r = parcel.rights ?? {};
  const list = r.근저당권 ?? [];
  const sectionKey = registryParcelTabTitle(parcel, parcelIndex, parcels);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-800">
          {parcel.type} — {parcel.address}
        </h3>
        <div className="rounded-lg border border-zinc-200 bg-white px-4">
          <p className="border-b border-zinc-100 py-2 text-xs font-medium uppercase text-zinc-400">
            기본 정보
          </p>
          {Object.entries(bi)
            .filter(([k]) => !k.endsWith("_anchor"))
            .map(([k, v]) => (
              <DetailRow
                key={k}
                label={k}
                value={v === null || v === undefined ? "" : String(v)}
                fileCount={fileCount}
                onGoTo={onGoToSource}
                sectionKey={sectionKey}
                anchor={fieldAnchor(bi, k)}
              />
            ))}
        </div>
      </section>

      <section>
        <div className="rounded-lg border border-zinc-200 bg-white px-4">
          <p className="border-b border-zinc-100 py-2 text-xs font-medium uppercase text-zinc-400">
            소유권
          </p>
          {Object.entries(o)
            .filter(([k]) => k !== "이전이력" && !k.endsWith("_anchor"))
            .map(([k, v]) => (
              <DetailRow
                key={k}
                label={k}
                value={v === null || v === undefined ? "" : String(v)}
                fileCount={fileCount}
                onGoTo={onGoToSource}
                sectionKey={sectionKey}
                anchor={fieldAnchor(o, k)}
              />
            ))}
          {Array.isArray(o.이전이력) && o.이전이력.length > 0 && (
            <div className="border-b border-zinc-100 py-3 text-sm last:border-0">
              <div className="mb-2 shrink-0 text-zinc-500">이전이력</div>
              <ul className="list-inside list-disc space-y-1 text-zinc-800">
                {o.이전이력.map((h, i) => (
                  <li key={i}>
                    {String(h?.날짜 ?? "")} · {String(h?.원인 ?? "")} · {String(h?.거래가액 ?? "")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-2">
          <p className="mb-2 text-xs font-medium uppercase text-zinc-400">권리관계</p>
          <DetailRow
            label="지상권"
            value={r.지상권 === null || r.지상권 === undefined ? "" : String(r.지상권)}
            fileCount={fileCount}
            onGoTo={onGoToSource}
            sectionKey={sectionKey}
            anchor={fieldAnchor(r as unknown as Record<string, unknown>, "지상권")}
          />
          <DetailRow
            label="압류·가압류"
            value={
              r.압류가압류 === null || r.압류가압류 === undefined ? "" : String(r.압류가압류)
            }
            fileCount={fileCount}
            onGoTo={onGoToSource}
            sectionKey={sectionKey}
            anchor={fieldAnchor(r as unknown as Record<string, unknown>, "압류가압류")}
          />
          <div className="py-2 text-sm">
            <div className="mb-2 font-medium text-zinc-700">근저당권</div>
            {list.length === 0 ? (
              <p className="text-zinc-500">—</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500">
                      <th className="py-2 pr-2 font-medium">상태</th>
                      <th className="py-2 pr-2 font-medium">채권최고액</th>
                      <th className="py-2 pr-2 font-medium">설정일</th>
                      <th className="py-2 pr-2 font-medium">채권자</th>
                      <th className="py-2 font-medium">채무자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((m, i) => (
                      <tr key={i} className="border-b border-zinc-100">
                        {(["상태", "채권최고액", "설정일", "채권자", "채무자"] as const).map((col) => {
                          const row = m as unknown as Record<string, unknown>;
                          return (
                            <td key={col} className="py-2 pr-2 align-top">
                              <div className="flex flex-wrap gap-1">
                                <span>{String(m[col] ?? "") || "—"}</span>
                                <SourceLink
                                  fileCount={fileCount}
                                  onGoTo={onGoToSource}
                                  text={String(m[col] ?? "")}
                                  sectionKey={sectionKey}
                                  anchor={fieldAnchor(row, col)}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase text-red-600">특이사항</h3>
        {(parcel.special_notes?.length ?? 0) === 0 ? (
          <p className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            없음
          </p>
        ) : (
          <ul className="space-y-2">
            {parcel.special_notes!.map((note, i) => (
              <li
                key={i}
                className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900"
              >
                {note}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
});

function BuildingRegistryPanel({
  br,
  fileCount,
  onScrollToRegistryPdfSection,
}: {
  br: NonNullable<AnalysisResult["building_registry"]>;
  fileCount: number;
  onScrollToRegistryPdfSection: () => void;
}) {
  const skip = new Set(["동별내역", "변동사항"]);
  const rows = Object.entries(br).filter(([k]) => !skip.has(k));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white px-4">
        <p className="border-b border-zinc-100 py-2 text-xs font-medium uppercase text-zinc-400">
          총괄표제부 요약
        </p>
        {rows.map(([k, v]) => (
          <RegistryDetailRow
            key={k}
            label={k}
            value={v === null || v === undefined ? "" : String(v)}
            fileCount={fileCount}
            onScrollToRegistryPdfSection={onScrollToRegistryPdfSection}
          />
        ))}
      </div>
      {(br.동별내역?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-zinc-800">동별 내역</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  {Object.keys(br.동별내역![0] ?? {}).map((h) => (
                    <th key={h} className="py-2 pr-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {br.동별내역!.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    {Object.values(row).map((cell, j) => (
                      <td key={j} className="py-2 pr-2 align-top">
                        <div className="flex flex-wrap gap-1">
                          <span>{String(cell ?? "")}</span>
                          <RegistrySectionSourceLink
                            fileCount={fileCount}
                            onScrollToRegistryPdfSection={onScrollToRegistryPdfSection}
                            hasValue={Boolean(String(cell ?? "").trim())}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {(br.변동사항?.length ?? 0) > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-800">변동사항</p>
          <ul className="list-inside list-disc text-sm text-zinc-700">
            {br.변동사항!.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const SummaryOverview = memo(function SummaryOverview({ result }: { result: AnalysisResult }) {
  const sm = result.summary;
  const mark = (v: boolean | null | undefined) =>
    v === true ? "✅" : v === false ? "❌" : "—";

  const land = firstLandParcel(result.parcels);
  const plan = result.land_use_plan;
  const landUseCmp = useMemo(
    () => (plan ? compareLandUseToFirstLandParcel(plan, land) : null),
    [plan, land],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">총 토지 필지 / 합산 면적</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            {sm?.총_토지_필지수 ?? "—"}필지
          </p>
          <p className="mt-1 text-sm text-zinc-700">{sm?.총_토지_면적 ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">총 건물 동 / 합산 연면적</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{sm?.총_건물_동수 ?? "—"}동</p>
          <p className="mt-1 text-sm text-zinc-700">{sm?.총_건물_연면적 ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">전체 소유자 일치</p>
          <p className="mt-1 text-2xl">{mark(sm?.전체_소유자_일치)}</p>
          <p className="mt-1 text-sm text-zinc-600">{sm?.소유자 ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">토지면적 ↔ 대장 대지면적</p>
          <p className="mt-1 text-2xl">{mark(sm?.토지면적_대장면적_일치)}</p>
          <p className="mt-1 text-xs text-zinc-500">대장: {sm?.건축물대장_대지면적 ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">건물등기 연면적 ↔ 대장 연면적</p>
          <p className="mt-1 text-2xl">{mark(sm?.건물등기_연면적_대장_일치)}</p>
        </div>
      </div>

      {plan && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">토지이용계획 ↔ 토지등기 (첫 필지)</p>
          {!land ? (
            <p className="mt-2 text-sm text-amber-800">토지 등기 필지가 없어 비교할 수 없습니다.</p>
          ) : landUseCmp ? (
            <ul className="mt-3 space-y-2 text-sm text-zinc-800">
              <li className="flex flex-wrap gap-x-2">
                <span className="font-medium text-zinc-600">소재지·지번 ↔ 등기 주소</span>
                <span>{mark(landUseCmp.소재지지번_일치)}</span>
                <span className="text-zinc-500">
                  이용: {landUseCmp.이용계획_소재지지번} / 등기: {landUseCmp.등기_주소}
                </span>
              </li>
              <li className="flex flex-wrap gap-x-2">
                <span className="font-medium text-zinc-600">지목</span>
                <span>{mark(landUseCmp.지목_일치)}</span>
                <span className="text-zinc-500">
                  이용: {landUseCmp.이용계획_지목} / 등기: {landUseCmp.등기_지목}
                </span>
              </li>
              <li className="flex flex-wrap gap-x-2">
                <span className="font-medium text-zinc-600">면적</span>
                <span>{mark(landUseCmp.면적_일치)}</span>
                <span className="text-zinc-500">
                  이용: {landUseCmp.이용계획_면적} / 등기: {landUseCmp.등기_면적}
                </span>
              </li>
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
});

const BuildingRegistryPanelMemo = memo(BuildingRegistryPanel);

export default function RealtyAnalyzer() {
  const pdfRef = useRef<PdfViewerHandle>(null);
  const sourceToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [buffers, setBuffers] = useState<Map<string, ArrayBuffer>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [mainTab, setMainTab] = useState(0);
  const [pdfFileIndex, setPdfFileIndex] = useState(0);
  const [sourceToast, setSourceToast] = useState<string | null>(null);
  const [savedAnalysesNonce, setSavedAnalysesNonce] = useState(0);
  const [pdfSectionKeys, setPdfSectionKeys] = useState<string[]>([]);
  const [pdfSectionRanges, setPdfSectionRanges] = useState<PdfSectionRange[]>([]);
  const [cadastralMapImageUrl, setCadastralMapImageUrl] = useState<string | null>(null);

  const showSourceTextNotFound = useCallback(() => {
    if (sourceToastTimerRef.current) clearTimeout(sourceToastTimerRef.current);
    setSourceToast("원본에서 해당 텍스트를 찾지 못했습니다");
    sourceToastTimerRef.current = setTimeout(() => {
      setSourceToast(null);
      sourceToastTimerRef.current = null;
    }, 4000);
  }, []);

  const goToSourceText = useCallback(
    (fileIndex: number, highlightText: string, sectionKey: string, anchor?: string) => {
      pdfRef.current?.findTextAndHighlight(fileIndex, highlightText, sectionKey, anchor);
    },
    [],
  );

  const scrollToBuildingRegistryPdfSection = useCallback(() => {
    pdfRef.current?.scrollToBuildingRegistrySection(0);
  }, []);

  const reset = useCallback(() => {
    setFiles([]);
    setBuffers(new Map());
    setError(null);
    setResult(null);
    setMainTab(0);
    setPdfFileIndex(0);
    setLoading(false);
    setPdfSectionKeys([]);
    setPdfSectionRanges([]);
    setCadastralMapImageUrl(null);
  }, []);

  const handlePdfSectionRanges = useCallback((ranges: PdfSectionRange[]) => {
    setPdfSectionKeys(ranges.map((r) => r.sectionKey));
    setPdfSectionRanges(ranges);
  }, []);

  useEffect(() => {
    if (files.length === 0) {
      setPdfSectionKeys([]);
      setPdfSectionRanges([]);
    }
  }, [files.length]);

  useEffect(() => {
    if (files.length === 0) setPdfFileIndex(0);
    else setPdfFileIndex((i) => (i >= files.length ? files.length - 1 : i));
  }, [files.length]);

  useEffect(() => {
    return () => {
      if (sourceToastTimerRef.current) clearTimeout(sourceToastTimerRef.current);
    };
  }, []);

  const addFiles = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list)
      .filter((f) => f.type === "application/pdf")
      .slice(0, 1);
    if (arr.length === 0) {
      setError("PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    setError(null);
    setResult(null);
    setCadastralMapImageUrl(null);
    const file = arr[0]!;
    void new Promise<{ id: string; name: string; size: number; buffer: ArrayBuffer }>(
      (resolve, reject) => {
        const id = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            id,
            name: file.name,
            size: file.size,
            buffer: reader.result as ArrayBuffer,
          });
        reader.onerror = () => reject(new Error("파일 읽기 실패"));
        reader.readAsArrayBuffer(file);
      },
    )
      .then((item) => {
        setBuffers(new Map([[item.id, item.buffer]]));
        setFiles([{ id: item.id, name: item.name, size: item.size }]);
      })
      .catch(() => setError("파일을 읽는 중 오류가 발생했습니다."));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const onPasteFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addFiles(e.target.files);
      e.target.value = "";
    },
    [addFiles],
  );

  const analyze = useCallback(
    async (
      pdfText: string,
      opts?: {
        cadastralMapPngBase64?: string | null;
        buildingRegistryPngBase64?: string | null;
        landUsePlanPngBase64?: string | null;
      },
    ): Promise<AnalysisResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const body = await buildAnalyzeRequestJson(pdfText, opts);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "분석에 실패했습니다.");
        return null;
      }
      const parsed = safeParseAnalysisResult(data);
      if (!parsed) {
        setError("응답 형식을 해석할 수 없습니다.");
        return null;
      }
      setResult(parsed);
      setMainTab(0);
      return parsed;
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const runFromPdfs = useCallback(async () => {
    if (files.length === 0) {
      setError("PDF를 먼저 업로드하세요.");
      return;
    }
    const f = files[0];
    const buf = buffers.get(f.id);
    if (!buf) {
      setError("파일 데이터를 찾을 수 없습니다.");
      return;
    }
    const text = await extractTextFromPdfBuffer(buf);
    if (!text.trim()) {
      setError("PDF에서 텍스트를 추출하지 못했습니다. 스캔 PDF일 수 있습니다.");
      return;
    }
    const merged = `\n\n--- 파일: ${f.name} ---\n\n${text}`.trim();

    console.log("[PDF 전체 텍스트 길이]", merged.length);
    console.log("[건축물대장 포함여부]", merged.includes("건축물대장"));
    console.log("[토지이용계획 포함여부]", merged.includes("토지이용계획확인서"));
    console.log("[PDF 텍스트 마지막 3000자]", merged.slice(-3000));

    setCadastralMapImageUrl(null);
    const keys = pdfRef.current?.getDetectedSectionKeys() ?? [];
    let cadastralB64: string | undefined;
    let cadPreview: string | null = null;
    if (keys.includes(CADASTRAL_MAP_SECTION_KEY) && pdfRef.current) {
      cadPreview = await pdfRef.current.exportSectionPngDataUrl(CADASTRAL_MAP_SECTION_KEY);
      if (cadPreview?.startsWith("data:image/png;base64,")) {
        cadastralB64 = cadPreview.slice("data:image/png;base64,".length);
      }
    }

    // 토지이용계획확인서 → 텍스트 깨짐 우회: 항상 vision으로 추출
    let landUsePlanB64: string | undefined;
    if (keys.includes(LAND_USE_PLAN_SECTION_KEY) && pdfRef.current) {
      const lupPreview = await pdfRef.current.exportSectionPngDataUrl(LAND_USE_PLAN_SECTION_KEY);
      if (lupPreview?.startsWith("data:image/png;base64,")) {
        landUsePlanB64 = lupPreview.slice("data:image/png;base64,".length);
      }
    }

    // 건축물대장 → 이미지 스캔이므로 vision으로 추출
    let buildingRegistryB64: string | undefined;
    if (keys.includes("건축물대장") && pdfRef.current) {
      const brPreview = await pdfRef.current.exportSectionPngDataUrl("건축물대장");
      if (brPreview?.startsWith("data:image/png;base64,")) {
        buildingRegistryB64 = brPreview.slice("data:image/png;base64,".length);
      }
    }

    setCadastralMapImageUrl(cadPreview);

    const parsed = await analyze(merged, {
      cadastralMapPngBase64: cadastralB64,
      buildingRegistryPngBase64: buildingRegistryB64,
      landUsePlanPngBase64: landUsePlanB64,
    });
    if (parsed) {
      saveAnalysisToStorage(parsed, f.name);
      setSavedAnalysesNonce((n) => n + 1);
    }
  }, [analyze, buffers, files]);

  const runSample = useCallback(async () => {
    setCadastralMapImageUrl(null);
    const parsed = await analyze(SAMPLE_PDF_TEXT);
    if (parsed) {
      saveAnalysisToStorage(parsed, "샘플 텍스트");
      setSavedAnalysesNonce((n) => n + 1);
    }
  }, [analyze]);

  const copyPlain = useCallback(() => {
    if (!result) return;
    void navigator.clipboard.writeText(formatAnalysisAsPlainText(result));
  }, [result]);

  const copyTsv = useCallback(() => {
    if (!result) return;
    void navigator.clipboard.writeText(formatAnalysisAsTsv(result));
  }, [result]);

  const handleLoadSavedAnalysis = useCallback((data: AnalysisResult) => {
    setResult(data);
    setMainTab(0);
    setError(null);
    setCadastralMapImageUrl(null);
  }, []);

  const parcels = result?.parcels ?? [];
  const showLandUsePlanTab =
    pdfSectionKeys.includes(LAND_USE_PLAN_SECTION_KEY) || !!result?.land_use_plan;
  const showLandRegisterTab = pdfSectionKeys.includes(LAND_REGISTER_SECTION_KEY);
  const showJointOwnershipTab = pdfSectionKeys.includes(JOINT_OWNERSHIP_SECTION_KEY);
  const showCadastralTab = pdfSectionKeys.includes(CADASTRAL_MAP_SECTION_KEY);

  const pdfTabOrder = useMemo(
    () => pdfSectionKeys.filter(isPdfSectionTabKey),
    [pdfSectionKeys],
  );

  const lastTabIndex = useMemo(() => {
    if (pdfTabOrder.length > 0) return pdfTabOrder.length;
    let cur = 1 + parcels.length;
    if (result?.building_registry) cur++;
    if (showLandUsePlanTab) cur++;
    if (showLandRegisterTab) cur++;
    if (showJointOwnershipTab) cur++;
    if (showCadastralTab) cur++;
    return Math.max(0, cur - 1);
  }, [
    pdfTabOrder,
    parcels.length,
    result?.building_registry,
    showLandUsePlanTab,
    showLandRegisterTab,
    showJointOwnershipTab,
    showCadastralTab,
  ]);

  const legacySecondaryTabs = useMemo((): LegacySecondaryTab[] => {
    if (pdfTabOrder.length > 0) return [];
    const out: LegacySecondaryTab[] = [];
    let idx = 1;
    parcels.forEach((p, i) => {
      out.push({
        idx: idx++,
        kind: "parcel",
        parcelIndex: i,
        label: registryParcelTabTitle(p, i, parcels),
      });
    });
    if (result?.building_registry) {
      out.push({ idx: idx++, kind: "building", label: "건축물대장" });
    }
    if (showLandUsePlanTab) {
      out.push({ idx: idx++, kind: "land_use", label: "토지이용계획" });
    }
    if (showLandRegisterTab) {
      out.push({ idx: idx++, kind: "land_register", label: "토지대장" });
    }
    if (showJointOwnershipTab) {
      out.push({ idx: idx++, kind: "joint", label: "공유지연명부" });
    }
    if (showCadastralTab) {
      out.push({ idx: idx++, kind: "cadastral", label: "지적도" });
    }
    return out;
  }, [
    pdfTabOrder.length,
    parcels,
    result?.building_registry,
    showLandUsePlanTab,
    showLandRegisterTab,
    showJointOwnershipTab,
    showCadastralTab,
  ]);

  useEffect(() => {
    if (!result) return;
    const tabsForLog =
      pdfTabOrder.length > 0
        ? pdfTabOrder.map(pdfTabLabel)
        : [
            ...parcels.map((p, i) => registryParcelTabTitle(p, i, parcels)),
            ...(result.building_registry ? ["건축물대장"] : []),
            ...(showLandUsePlanTab ? ["토지이용계획"] : []),
            ...(showLandRegisterTab ? ["토지대장"] : []),
            ...(showJointOwnershipTab ? ["공유지연명부"] : []),
            ...(showCadastralTab ? ["지적도"] : []),
          ];
    console.log("[탭 렌더링] sectionRanges:", pdfSectionRanges);
    console.log("[탭 렌더링] pdfSectionKeys:", pdfSectionKeys);
    console.log("[탭 렌더링] 생성될 탭 목록:", tabsForLog);
  }, [
    result,
    pdfSectionRanges,
    pdfSectionKeys,
    pdfTabOrder,
    parcels,
    showLandUsePlanTab,
    showLandRegisterTab,
    showJointOwnershipTab,
    showCadastralTab,
  ]);

  useEffect(() => {
    if (!result) return;
    if (mainTab > lastTabIndex) setMainTab(lastTabIndex);
  }, [result, mainTab, lastTabIndex]);

  const fileCount = files.length;
  const checklistKey = files[0]?.name ?? "saved-analysis";

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          등기사항전부증명서 · 건축물대장 PDF 분석
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-600">
          합본 PDF에서 토지·건물·건축물대장을 분리 추출합니다. 🔍 원본은 PDF 텍스트를 검색해
          강조합니다.
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section className="relative min-h-0 min-w-0 overflow-y-auto border-b border-zinc-200 bg-white p-6 lg:border-b-0 lg:border-r">
          {loading && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white/70 backdrop-blur-[1px]"
              aria-busy="true"
              aria-label="분석 중"
            >
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800" />
              <p className="text-sm font-medium text-zinc-600">분석 중입니다...</p>
            </div>
          )}
          {!result ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-zinc-800">분석 실행</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  오른쪽에서 합본 PDF를 올린 뒤 분석을 시작하세요.
                </p>
              </div>
              {files.length > 0 && (
                <ul className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between text-sm text-zinc-700"
                    >
                      <span className="truncate font-medium">{f.name}</span>
                      <span className="shrink-0 text-zinc-400">
                        {(f.size / 1024).toFixed(1)} KB
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void runFromPdfs()}
                  disabled={loading || files.length === 0}
                  className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  분석 시작
                </button>
                <button
                  type="button"
                  onClick={runSample}
                  disabled={loading}
                  className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-40"
                >
                  샘플 텍스트로 시험
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
                >
                  초기화
                </button>
              </div>
              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </p>
              )}
              <SavedAnalysesSection
                refreshTrigger={savedAnalysesNonce}
                onLoaded={handleLoadSavedAnalysis}
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={copyPlain}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  전체 복사
                </button>
                <button
                  type="button"
                  onClick={copyTsv}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  탭 구분(엑셀용) 복사
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  새로 분석
                </button>
              </div>

              <SavedAnalysesSection
                refreshTrigger={savedAnalysesNonce}
                onLoaded={handleLoadSavedAnalysis}
              />

              <div className="flex flex-wrap gap-1.5 border-b border-zinc-200 pb-2">
                <button
                  type="button"
                  onClick={() => setMainTab(0)}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${
                    mainTab === 0
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-200"
                  }`}
                >
                  전체 요약
                </button>
                {pdfTabOrder.length > 0
                  ? pdfTabOrder.map((sectionKey, i) => {
                      const idx = 1 + i;
                      return (
                        <button
                          key={`pdf-tab-${sectionKey}-${i}`}
                          type="button"
                          onClick={() => setMainTab(idx)}
                          className={`max-w-[12rem] truncate rounded-md px-3 py-2 text-sm font-medium ${
                            mainTab === idx
                              ? "bg-zinc-900 text-white"
                              : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-200"
                          }`}
                          title={pdfTabLabel(sectionKey)}
                        >
                          {pdfTabLabel(sectionKey)}
                        </button>
                      );
                    })
                  : legacySecondaryTabs.map((t) => (
                      <button
                        key={
                          t.kind === "parcel"
                            ? `${t.parcelIndex}-${t.label}`
                            : `${t.kind}-${t.idx}`
                        }
                        type="button"
                        onClick={() => setMainTab(t.idx)}
                        className={`${
                          t.kind === "parcel" ? "max-w-[10rem] truncate " : ""
                        }rounded-md px-3 py-2 text-sm font-medium ${
                          mainTab === t.idx
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-200"
                        }`}
                        title={t.label}
                      >
                        {t.label}
                      </button>
                    ))}
              </div>

              {mainTab === 0 && <SummaryOverview result={result} />}
              {pdfTabOrder.length > 0 ? (
                <>
                  {mainTab > 0 &&
                    mainTab <= pdfTabOrder.length &&
                    (() => {
                      const sk = pdfTabOrder[mainTab - 1]!;
                      if (sk.startsWith("토지 ") || sk.startsWith("건물 ")) {
                        const pi = parcelIndexForSectionKey(sk, parcels);
                        return pi >= 0 ? (
                          <RegistryParcelPanel
                            parcel={parcels[pi]!}
                            parcelIndex={pi}
                            parcels={parcels}
                            fileCount={fileCount}
                            onGoToSource={goToSourceText}
                          />
                        ) : (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            분석 결과에 「{sk}」에 해당하는 필지가 없습니다. 오른쪽 PDF에서 해당 구간을
                            확인할 수 있습니다.
                          </p>
                        );
                      }
                      if (sk === "건축물대장") {
                        return result.building_registry ? (
                          <BuildingRegistryPanelMemo
                            br={result.building_registry}
                            fileCount={fileCount}
                            onScrollToRegistryPdfSection={scrollToBuildingRegistryPdfSection}
                          />
                        ) : (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            PDF에 건축물대장 구간은 감지되었으나, 아직 추출된 데이터가 없습니다. 분석을 다시
                            실행해 보세요.
                          </p>
                        );
                      }
                      if (sk === LAND_USE_PLAN_SECTION_KEY) {
                        return result.land_use_plan ? (
                          <LandUsePlanPanel
                            plan={result.land_use_plan}
                            fileCount={fileCount}
                            onGoToSource={goToSourceText}
                          />
                        ) : (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            PDF에 토지이용계획확인서 구간은 있으나, 아직 추출된 데이터가 없습니다. 분석을 다시
                            실행해 보세요.
                          </p>
                        );
                      }
                      if (sk === LAND_REGISTER_SECTION_KEY) {
                        return result.land_register ? (
                          <LandRegisterPanel
                            block={result.land_register}
                            fileCount={fileCount}
                            onGoToSource={goToSourceText}
                          />
                        ) : (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            PDF에 토지대장 구간은 있으나, 아직 추출된 데이터가 없습니다. 분석을 다시 실행해
                            보세요.
                          </p>
                        );
                      }
                      if (sk === JOINT_OWNERSHIP_SECTION_KEY) {
                        return result.joint_ownership ? (
                          <JointOwnershipPanel
                            block={result.joint_ownership}
                            fileCount={fileCount}
                            onGoToSource={goToSourceText}
                          />
                        ) : (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            PDF에 공유지연명부 구간은 있으나, 아직 추출된 데이터가 없습니다. 분석을 다시 실행해
                            보세요.
                          </p>
                        );
                      }
                      if (sk === CADASTRAL_MAP_SECTION_KEY) {
                        return (
                          <CadastralMapPanel
                            imageDataUrl={cadastralMapImageUrl}
                            data={result.cadastral_map ?? null}
                          />
                        );
                      }
                      return null;
                    })()}
                </>
              ) : (
                <>
                  {(() => {
                    const t = legacySecondaryTabs.find((x) => x.idx === mainTab);
                    if (!t) return null;
                    if (t.kind === "parcel") {
                      const parcel = parcels[t.parcelIndex];
                      if (!parcel) return null;
                      return (
                        <RegistryParcelPanel
                          parcel={parcel}
                          parcelIndex={t.parcelIndex}
                          parcels={parcels}
                          fileCount={fileCount}
                          onGoToSource={goToSourceText}
                        />
                      );
                    }
                    if (t.kind === "building" && result.building_registry) {
                      return (
                        <BuildingRegistryPanelMemo
                          br={result.building_registry}
                          fileCount={fileCount}
                          onScrollToRegistryPdfSection={scrollToBuildingRegistryPdfSection}
                        />
                      );
                    }
                    if (t.kind === "land_use") {
                      return result.land_use_plan ? (
                        <LandUsePlanPanel
                          plan={result.land_use_plan}
                          fileCount={fileCount}
                          onGoToSource={goToSourceText}
                        />
                      ) : (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          PDF에 토지이용계획확인서 구간은 있으나, 아직 추출된 데이터가 없습니다. 분석을 다시
                          실행해 보세요.
                        </p>
                      );
                    }
                    if (t.kind === "land_register") {
                      return result.land_register ? (
                        <LandRegisterPanel
                          block={result.land_register}
                          fileCount={fileCount}
                          onGoToSource={goToSourceText}
                        />
                      ) : (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          PDF에 토지대장 구간은 있으나, 아직 추출된 데이터가 없습니다. 분석을 다시 실행해
                          보세요.
                        </p>
                      );
                    }
                    if (t.kind === "joint") {
                      return result.joint_ownership ? (
                        <JointOwnershipPanel
                          block={result.joint_ownership}
                          fileCount={fileCount}
                          onGoToSource={goToSourceText}
                        />
                      ) : (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          PDF에 공유지연명부 구간은 있으나, 아직 추출된 데이터가 없습니다. 분석을 다시 실행해
                          보세요.
                        </p>
                      );
                    }
                    if (t.kind === "cadastral") {
                      return (
                        <CadastralMapPanel
                          imageDataUrl={cadastralMapImageUrl}
                          data={result.cadastral_map ?? null}
                        />
                      );
                    }
                    return null;
                  })()}
                </>
              )}

              <AppraisalChecklist result={result} fileKey={checklistKey} />
            </div>
          )}
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-zinc-100 p-4">
          <PdfViewerPanel
            ref={pdfRef}
            files={files}
            buffers={buffers}
            activeFileIndex={files.length === 0 ? 0 : Math.min(pdfFileIndex, files.length - 1)}
            onActiveFileIndexChange={setPdfFileIndex}
            onDrop={onDrop}
            onFileInputChange={onPasteFiles}
            onTextNotFound={showSourceTextNotFound}
            onSectionRangesComputed={handlePdfSectionRanges}
          />
        </aside>
      </div>

      {sourceToast && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 max-w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg"
        >
          {sourceToast}
        </div>
      )}
    </div>
  );
}
