"use client";

import { memo } from "react";
import type { LandRegisterBlock } from "@/lib/analysisTypes";
import { LAND_REGISTER_SECTION_KEY } from "@/lib/pdfSectionPages";

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
      onClick={() => onGoTo(0, t, LAND_REGISTER_SECTION_KEY, anchor)}
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

const LandRegisterPanel = memo(function LandRegisterPanel({
  block,
  fileCount,
  onGoToSource,
}: {
  block: LandRegisterBlock;
  fileCount: number;
  onGoToSource: (
    fileIndex: number,
    highlightText: string,
    sectionKey: string,
    anchor?: string,
  ) => void;
}) {
  const d = block as Record<string, unknown>;
  const gijga = String(block.개별공시지가 ?? "").trim();
  const gijgaIl = String(block.개별공시지가기준일 ?? "").trim();

  return (
    <div className="space-y-8">
      <h3 className="text-sm font-semibold text-zinc-800">토지대장</h3>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">기본 정보</p>
        <div className="rounded-lg border border-zinc-200 bg-white px-4">
          <Row label="토지소재" value={String(block.토지소재 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="토지소재" data={d} />
          <Row label="지번" value={String(block.지번 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="지번" data={d} />
          <Row label="지목" value={String(block.지목 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="지목" data={d} />
          <Row label="면적" value={String(block.면적 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="면적" data={d} />
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">소유자 정보</p>
        <div className="rounded-lg border border-zinc-200 bg-white px-4">
          <Row label="소유자명" value={String(block.소유자명 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="소유자명" data={d} />
          <Row label="소유자주소" value={String(block.소유자주소 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="소유자주소" data={d} />
          <Row label="소유권변동일" value={String(block.소유권변동일 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="소유권변동일" data={d} />
          <Row label="소유권변동원인" value={String(block.소유권변동원인 ?? "")} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="소유권변동원인" data={d} />
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">개별공시지가</p>
        <div className="rounded-lg border border-zinc-200 bg-white px-4">
          <Row label="기준일" value={gijgaIl} fileCount={fileCount} onGoTo={onGoToSource} fieldKey="개별공시지가기준일" data={d} />
          <div className="grid grid-cols-[minmax(8rem,11rem)_1fr] gap-3 border-b border-zinc-100 py-2.5 text-sm last:border-0">
            <div className="shrink-0 text-zinc-500">공시지가 (원/㎡)</div>
            <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
              <span className="min-w-0 break-words text-zinc-900">{gijga || "—"}</span>
              <SourceLink
                fileCount={fileCount}
                onGoTo={onGoToSource}
                text={gijga}
                anchor={fieldAnchor(d, "개별공시지가") ?? fieldAnchor(d, "개별공시지가기준일")}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
});

export default LandRegisterPanel;
