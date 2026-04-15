"use client";

import { memo } from "react";
import type { LandUsePlanBlock } from "@/lib/analysisTypes";
import { LAND_USE_PLAN_SECTION_KEY } from "@/lib/pdfSectionPages";

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
  anchor,
}: {
  fileCount: number;
  onGoTo: (fileIndex: number, highlightText: string, sectionKey: string, anchor?: string) => void;
  text: string;
  anchor?: string;
}) {
  const t = text.trim();
  if (fileCount <= 0 || !t) return null;
  return (
    <button
      type="button"
      onClick={() => onGoTo(0, t, LAND_USE_PLAN_SECTION_KEY, anchor)}
      className="shrink-0 text-xs text-sky-600 underline-offset-2 hover:underline"
    >
      🔍 원본
    </button>
  );
}

function Row({
  label,
  value,
  fileCount,
  onGoTo,
  fieldKey,
  data,
}: {
  label: string;
  value: string;
  fileCount: number;
  onGoTo: (fileIndex: number, highlightText: string, sectionKey: string, anchor?: string) => void;
  fieldKey: string;
  data: Record<string, unknown>;
}) {
  const v = value.trim();
  return (
    <div className="grid grid-cols-[minmax(8rem,11rem)_1fr] gap-3 border-b border-zinc-100 py-2.5 text-sm last:border-0">
      <div className="shrink-0 text-zinc-500">{label}</div>
      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
        <span className="min-w-0 break-words text-zinc-900">{v || "—"}</span>
        <SourceLink
          fileCount={fileCount}
          onGoTo={onGoTo}
          text={v}
          anchor={fieldAnchor(data, fieldKey)}
        />
      </div>
    </div>
  );
}

const LandUsePlanPanel = memo(function LandUsePlanPanel({
  plan,
  fileCount,
  onGoToSource,
}: {
  plan: LandUsePlanBlock;
  fileCount: number;
  onGoToSource: (
    fileIndex: number,
    highlightText: string,
    sectionKey: string,
    anchor?: string,
  ) => void;
}) {
  const d = plan as Record<string, unknown>;
  const 용도 = String(plan.국토계획법_용도지역 ?? "").trim();
  const 용도Lines = 용도
    ? 용도.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const 지구 = plan.지구단위계획구역_여부 === true;

  return (
    <div className="space-y-8">
      <h3 className="text-sm font-semibold text-zinc-800">토지이용계획확인서</h3>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">기본 정보</p>
        <div className="rounded-lg border border-zinc-200 bg-white px-4">
          <Row label="소재지" value={String(plan.소재지 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="소재지" data={d} />
          <Row label="지번" value={String(plan.지번 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="지번" data={d} />
          <Row label="지목" value={String(plan.지목 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="지목" data={d} />
          <Row label="면적" value={String(plan.면적 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="면적" data={d} />
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">용도지역·지구</p>
        <div className="rounded-lg border border-zinc-200 bg-white px-4">
          <div className="border-b border-zinc-100 py-2.5 text-sm last:border-0">
            <div className="shrink-0 text-zinc-500">국토계획법 용도지역</div>
            <div className="mt-1 flex min-w-0 flex-col gap-2">
              {용도Lines.length > 0 ? (
                용도Lines.map((line, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-x-2 gap-y-1">
                    <span className="min-w-0 break-words text-zinc-900">{line}</span>
                    <SourceLink
                      fileCount={fileCount}
                      onGoTo={onGoToSource}
                      text={line}
                      anchor={fieldAnchor(d, "국토계획법_용도지역")}
                    />
                  </div>
                ))
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <span className="text-zinc-500">지구단위계획구역 여부</span>
            <span className="font-medium text-zinc-900">{지구 ? "✅ 해당" : "❌ 미해당"}</span>
          </div>
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">기타 법령</p>
        <div className="rounded-lg border border-zinc-200 bg-white px-4">
          <div className="py-2.5 text-sm">
            <div className="text-zinc-500">기타 법령에 따른 지역·지구</div>
            <div className="mt-1 flex flex-wrap items-start gap-x-2 gap-y-1">
              <span className="min-w-0 whitespace-pre-wrap break-words text-zinc-900">
                {String(plan.기타_법령_지역지구 ?? "").trim() || "—"}
              </span>
              <SourceLink
                fileCount={fileCount}
                onGoTo={onGoToSource}
                text={String(plan.기타_법령_지역지구 ?? "").trim()}
                anchor={fieldAnchor(d, "기타_법령_지역지구")}
              />
            </div>
          </div>
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">기타 사항</p>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm">
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-zinc-900">
              {String(plan.기타_사항 ?? "").trim() || "—"}
            </span>
            <SourceLink
              fileCount={fileCount}
              onGoTo={onGoToSource}
              text={String(plan.기타_사항 ?? "").trim()}
              anchor={fieldAnchor(d, "기타_사항")}
            />
          </div>
        </div>
      </section>
    </div>
  );
});

export default LandUsePlanPanel;
