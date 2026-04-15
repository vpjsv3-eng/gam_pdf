"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { AnalysisResult } from "@/lib/analysisTypes";
import {
  MANUAL_CHECKLIST_ITEMS,
  computeAppraisalAutoChecks,
  loadManualChecks,
  manualChecklistStorageKey,
  saveManualChecks,
  type AutoCheckStatus,
} from "@/lib/appraisalChecklistLogic";

function emojiFor(status: AutoCheckStatus): string {
  if (status === "ok") return "✅";
  if (status === "warning") return "⚠️";
  return "❌";
}

function autoRowClass(status: AutoCheckStatus): string {
  if (status === "ok") return "border-emerald-200 bg-emerald-50/90 text-emerald-950";
  if (status === "warning") return "border-amber-200 bg-amber-50/90 text-amber-950";
  return "border-red-200 bg-red-50/90 text-red-950";
}

type Props = {
  result: AnalysisResult;
  /** localStorage 구분용 (첫 PDF 파일명 권장) */
  fileKey: string;
};

function AppraisalChecklistInner({ result, fileKey }: Props) {
  const storageKey = useMemo(() => manualChecklistStorageKey(fileKey), [fileKey]);
  const [manual, setManual] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setManual(loadManualChecks(storageKey));
  }, [storageKey]);

  const autoRows = useMemo(() => computeAppraisalAutoChecks(result), [result]);

  const setManualOne = useCallback(
    (id: string, checked: boolean) => {
      setManual((prev) => {
        const next = { ...prev, [id]: checked };
        saveManualChecks(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const autoOk = autoRows.filter((r) => r.status === "ok").length;
  const manualDone = MANUAL_CHECKLIST_ITEMS.filter((m) => manual[m.id]).length;
  const total = autoRows.length + MANUAL_CHECKLIST_ITEMS.length;
  const done = autoOk + manualDone;

  return (
    <section className="mt-10 rounded-xl border border-zinc-300 bg-zinc-50/60 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold text-zinc-900">📋 감정평가 체크리스트</h2>
        <p className="text-sm font-medium text-zinc-600">
          {total}개 중 {done}개 완료
          <span className="ml-2 text-xs font-normal text-zinc-500">
            (자동 {autoOk}/{autoRows.length} · 수동 {manualDone}/{MANUAL_CHECKLIST_ITEMS.length})
          </span>
        </p>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-800">
          🤖 자동 확인
        </h3>
        <ul className="space-y-2">
          {autoRows.map((row) => (
            <li
              key={row.id}
              className={`rounded-lg border px-3 py-2.5 text-sm ${autoRowClass(row.status)}`}
            >
              <div className="font-medium">{row.title}</div>
              <div className="mt-1 text-[0.8125rem] leading-snug opacity-95">
                {row.detail} {emojiFor(row.status)}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-5">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-sky-900">
          ✍️ 수동 확인
        </h3>
        <ul className="space-y-2">
          {MANUAL_CHECKLIST_ITEMS.map((item) => {
            const checked = !!manual[item.id];
            return (
              <li
                key={item.id}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                  checked
                    ? "border-zinc-200 bg-zinc-100 text-zinc-500 line-through"
                    : "border-zinc-200 bg-white text-zinc-900"
                }`}
              >
                <input
                  type="checkbox"
                  id={`chk-${item.id}`}
                  checked={checked}
                  onChange={(e) => setManualOne(item.id, e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300"
                />
                <label htmlFor={`chk-${item.id}`} className="cursor-pointer text-sm leading-snug">
                  {item.label}
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          수동 항목은 이 PDF 파일명 기준으로 브라우저에 저장됩니다.
        </p>
      </div>
    </section>
  );
}

const AppraisalChecklist = memo(AppraisalChecklistInner);
export default AppraisalChecklist;
