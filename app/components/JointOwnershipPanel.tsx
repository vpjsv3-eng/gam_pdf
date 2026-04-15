"use client";

import { memo } from "react";
import type { JointOwnershipBlock, JointOwnershipShareRow } from "@/lib/analysisTypes";
import { JOINT_OWNERSHIP_SECTION_KEY } from "@/lib/pdfSectionPages";
import { pdfHighlightQueryFromDisplayValue } from "@/lib/pdfSearchNormalize";

function fieldAnchor(data: Record<string, unknown>, fieldKey: string): string | undefined {
  const raw = data[`${fieldKey}_anchor`];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}

const JointOwnershipPanel = memo(function JointOwnershipPanel({
  block,
  fileCount,
  onGoToSource,
}: {
  block: JointOwnershipBlock;
  fileCount: number;
  onGoToSource: (
    fileIndex: number,
    highlightText: string,
    sectionKey: string,
    anchor?: string,
  ) => void;
}) {
  const rows = Array.isArray(block.공유자목록) ? block.공유자목록 : [];

  return (
    <div className="space-y-8">
      <h3 className="text-sm font-semibold text-zinc-800">공유지연명부</h3>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">기본 정보</p>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <span className="text-zinc-500">토지소재</span>
              <p className="mt-0.5 font-medium text-zinc-900">{String(block.토지소재 ?? "").trim() || "—"}</p>
            </div>
            <div>
              <span className="text-zinc-500">지번</span>
              <p className="mt-0.5 font-medium text-zinc-900">{String(block.지번 ?? "").trim() || "—"}</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">공유자 목록</p>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                <th className="px-3 py-2 font-medium">순번</th>
                <th className="px-3 py-2 font-medium">성명</th>
                <th className="px-3 py-2 font-medium">소유권지분</th>
                <th className="px-3 py-2 font-medium">변동일자</th>
                <th className="px-3 py-2 font-medium">변동원인</th>
                <th className="px-3 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                    공유자 목록이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((raw, i) => {
                  const row = raw as JointOwnershipShareRow;
                  const r = row as Record<string, unknown>;
                  const name = String(row.성명 ?? "").trim();
                  const q = pdfHighlightQueryFromDisplayValue(name);
                  const anchor =
                    fieldAnchor(r, "성명") ?? fieldAnchor(r, "등록번호") ?? undefined;
                  return (
                    <tr key={i} className="border-b border-zinc-100">
                      <td className="px-3 py-2 align-top text-zinc-800">{String(row.순번 ?? "").trim() || "—"}</td>
                      <td className="px-3 py-2 align-top font-medium text-zinc-900">{name || "—"}</td>
                      <td className="px-3 py-2 align-top text-zinc-800">{String(row.소유권지분 ?? "").trim() || "—"}</td>
                      <td className="px-3 py-2 align-top text-zinc-800">{String(row.변동일자 ?? "").trim() || "—"}</td>
                      <td className="px-3 py-2 align-top text-zinc-800">{String(row.변동원인 ?? "").trim() || "—"}</td>
                      <td className="px-3 py-2 align-top">
                        {fileCount > 0 && q ? (
                          <button
                            type="button"
                            onClick={() => onGoToSource(0, q, JOINT_OWNERSHIP_SECTION_KEY, anchor)}
                            className="text-xs text-sky-600 underline-offset-2 hover:underline"
                          >
                            🔍 원본
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
});

export default JointOwnershipPanel;
