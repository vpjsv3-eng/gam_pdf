"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnalysisResult } from "@/lib/analysisTypes";
import { safeParseAnalysisResult } from "@/lib/formatExport";
import {
  deleteSavedAnalysis,
  listSavedAnalyses,
  loadSavedAnalysisJson,
  type SavedAnalysisIndexEntry,
} from "@/lib/savedAnalysisStorage";

type Props = {
  refreshTrigger: number;
  onLoaded: (data: AnalysisResult) => void;
};

function formatSavedDate(savedAt: number): string {
  try {
    return new Date(savedAt).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function SavedAnalysesSection({ refreshTrigger, onLoaded }: Props) {
  const [items, setItems] = useState<SavedAnalysisIndexEntry[]>([]);

  const reload = useCallback(() => {
    setItems(listSavedAnalyses());
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshTrigger]);

  const handleLoad = useCallback(
    (entry: SavedAnalysisIndexEntry) => {
      const raw = loadSavedAnalysisJson(entry.storageKey);
      if (!raw) {
        reload();
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      const data = safeParseAnalysisResult(parsed);
      if (data) onLoaded(data);
    },
    [onLoaded, reload],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, storageKey: string) => {
      e.stopPropagation();
      deleteSavedAnalysis(storageKey);
      reload();
    },
    [reload],
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
      <h2 className="text-sm font-semibold text-zinc-800">저장된 분석</h2>
      <p className="mt-1 text-xs text-zinc-500">
        최대 20건까지 브라우저에 보관됩니다. 항목을 누르면 결과만 불러옵니다.
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">저장된 분석이 없습니다.</p>
      ) : (
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.storageKey}>
            <div className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-300 hover:bg-zinc-50/90">
              <button
                type="button"
                onClick={() => handleLoad(item)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="text-xs font-medium text-zinc-500">
                  {formatSavedDate(item.savedAt)}
                </div>
                <div className="mt-0.5 truncate text-sm font-medium text-zinc-900">
                  {item.fileLabel}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.address}</div>
              </button>
              <button
                type="button"
                onClick={(ev) => handleDelete(ev, item.storageKey)}
                className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
                aria-label="삭제"
              >
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
      )}
    </section>
  );
}
