"use client";

import { memo } from "react";
import type { CadastralMapBlock } from "@/lib/analysisTypes";

const CadastralMapPanel = memo(function CadastralMapPanel({
  imageDataUrl,
  data,
}: {
  imageDataUrl: string | null;
  data: CadastralMapBlock | null;
}) {
  const 맹지 = data?.맹지여부 === true;

  return (
    <div className="space-y-8">
      <h3 className="text-sm font-semibold text-zinc-800">지적도</h3>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">지적도 이미지</p>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          {imageDataUrl ? (
            <img
              src={imageDataUrl}
              alt="지적도 구간 렌더"
              className="mx-auto max-h-[min(70vh,48rem)] w-auto max-w-full object-contain"
            />
          ) : (
            <p className="py-8 text-center text-sm text-zinc-500">이미지를 불러오지 못했습니다. 분석을 다시 실행해 보세요.</p>
          )}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">분석 결과</p>
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4 text-sm">
          <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
            <span className="text-zinc-500">대상 지번</span>
            <span className="text-zinc-900">{String(data?.대상지번 ?? "").trim() || "—"}</span>
          </div>
          <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
            <span className="text-zinc-500">인접 지번</span>
            <span className="text-zinc-900">
              {Array.isArray(data?.인접지번목록) && data!.인접지번목록!.length > 0
                ? data!.인접지번목록!.join(", ")
                : "—"}
            </span>
          </div>
          <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
            <span className="text-zinc-500">도로 접면</span>
            <span className="text-zinc-900">{String(data?.도로접면 ?? "").trim() || "—"}</span>
          </div>
          <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
            <span className="text-zinc-500">형상</span>
            <span className="text-zinc-900">{String(data?.형상 ?? "").trim() || "—"}</span>
          </div>
          <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
            <span className="text-zinc-500">맹지 여부</span>
            <span className="font-medium text-zinc-900">{맹지 ? "⚠️ 맹지" : "✅ 아님"}</span>
          </div>
          <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
            <span className="self-start text-zinc-500">특이사항</span>
            <span className="whitespace-pre-wrap break-words text-zinc-900">
              {String(data?.특이사항 ?? "").trim() || "—"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
});

export default CadastralMapPanel;
