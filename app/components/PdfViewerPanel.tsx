"use client";

import "pdfjs-dist/web/pdf_viewer.css";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getPdfjs } from "@/lib/pdfjsClient";
import { isPdfTextSpanStruckOrCancelled } from "@/lib/pdfTextLayerStrike";
import { pdfHighlightDevLog } from "@/lib/pdfHighlightDev";
import {
  computePdfSectionRanges,
  getBuildingRegistryStartPage,
  getPageTextForSectionDetection,
  type PdfSectionRange,
  type PdfVisionSectionHint,
} from "@/lib/pdfSectionPages";
import { renderPdfPageToPngDataUrl, requestVisionSectionType } from "@/lib/renderPdfPagePngClient";
import {
  findNormalizedNeedleRanges,
  findNormalizedValueRanges,
  normalizeText,
  pdfHighlightQueryFromDisplayValue,
  sortCharRangesByStartDesc,
} from "@/lib/pdfSearchNormalize";
import {
  PDF_HIGHLIGHT_BG,
  collectPdfTextMatchRanges,
  spanIndicesForCharRange,
} from "@/lib/pdfTextMatch";

/** anchor가 포함된 페이지에서, anchor 이후 구간부터 값 하이라이트 시도 */
function tryHighlightValueAfterAnchorOnPage(
  strings: string[],
  divs: HTMLElement[],
  joined: string,
  value: string,
  anchor: string,
  tryApplyHighlight: (s: string[], d: HTMLElement[], cand: { start: number; end: number }) => boolean,
): boolean {
  const a = anchor.trim();
  if (!a) return false;
  const pageNorm = normalizeText(joined);
  const anchorNorm = normalizeText(a);
  if (!pageNorm.includes(anchorNorm)) return false;

  const anchorRanges = findNormalizedNeedleRanges(joined, a);
  const byStart = [...anchorRanges].sort((x, y) => x.start - y.start);
  for (const ar of byStart) {
    const tail = joined.slice(ar.start);
    const normHits = findNormalizedValueRanges(tail, value).map((r) => ({
      start: r.start + ar.start,
      end: r.end + ar.start,
    }));
    for (const vr of normHits) {
      if (tryApplyHighlight(strings, divs, vr)) return true;
    }
    for (const cand of sortCharRangesByStartDesc(
      collectPdfTextMatchRanges(strings, value).filter((c) => c.start >= ar.start),
    )) {
      if (tryApplyHighlight(strings, divs, cand)) return true;
    }
  }
  return false;
}

type UploadedFile = {
  id: string;
  name: string;
  size: number;
};

export type PdfViewerHandle = {
  findTextAndHighlight: (
    fileIndex: number,
    query: string,
    sectionKey: string,
    anchor?: string | null,
  ) => void;
  /** 건축물대장 구간 첫 페이지로만 이동(텍스트 검색·하이라이트 없음) */
  scrollToBuildingRegistrySection: (fileIndex: number) => void;
  /** 마지막으로 계산된 섹션 키 목록(렌더 전이면 빈 배열) */
  getDetectedSectionKeys: () => string[];
  /** 지정 섹션(예: 지적도) 페이지를 합쳐 PNG data URL로보냄. 미렌더·구간 없음이면 null */
  exportSectionPngDataUrl: (sectionKey: string) => Promise<string | null>;
};

type PageLayerData = {
  strings: string[];
  divs: HTMLElement[];
};

/** hit: 하이라이트 성공 · miss: 검색 실패(토스트) */
export type PdfHighlightSearchResult = "hit" | "miss";

type Props = {
  files: UploadedFile[];
  buffers: Map<string, ArrayBuffer>;
  activeFileIndex: number;
  onActiveFileIndexChange: (index: number) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTextNotFound?: () => void;
  /** PDF 섹션 범위 계산 직후(렌더 완료 시) */
  onSectionRangesComputed?: (ranges: PdfSectionRange[]) => void;
};

const PdfViewerPanelInner = forwardRef<PdfViewerHandle, Props>(function PdfViewerPanel(
  {
    files,
    buffers,
    activeFileIndex,
    onActiveFileIndexChange,
    onDrop,
    onFileInputChange,
    onTextNotFound,
    onSectionRangesComputed,
  },
  ref,
) {
  const onSectionRangesComputedRef = useRef(onSectionRangesComputed);
  onSectionRangesComputedRef.current = onSectionRangesComputed;
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesHostRef = useRef<HTMLDivElement>(null);
  const pageDataRef = useRef<Map<number, PageLayerData>>(new Map());
  const sectionRangesRef = useRef<PdfSectionRange[]>([]);
  const highlightedElsRef = useRef<HTMLElement[]>([]);
  const textLayersRef = useRef<{ cancel: () => void }[]>([]);
  const renderGenRef = useRef(0);
  const pendingSearchRef = useRef<{
    query: string;
    sectionKey: string;
    anchor?: string | null;
  } | null>(null);
  const pendingRegistryScrollRef = useRef(false);
  const fullyRenderedRef = useRef(false);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const pageVisibilityRatiosRef = useRef<Map<number, number>>(new Map());

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visiblePage, setVisiblePage] = useState(1);
  const [hostWidth, setHostWidth] = useState(0);

  const activeFile = files[activeFileIndex] ?? null;

  const clearHighlights = useCallback(() => {
    for (const el of highlightedElsRef.current) {
      el.style.backgroundColor = "";
    }
    highlightedElsRef.current = [];
  }, []);

  const cancelTextLayers = useCallback(() => {
    for (const tl of textLayersRef.current) {
      try {
        tl.cancel();
      } catch {
        /* ignore */
      }
    }
    textLayersRef.current = [];
  }, []);

  const tryApplyHighlight = useCallback(
    (strings: string[], divs: HTMLElement[], cand: { start: number; end: number }): boolean => {
      const idxs = spanIndicesForCharRange(strings, cand.start, cand.end);
      const toHighlight: HTMLElement[] = [];
      for (const i of idxs) {
        const el = divs[i];
        if (!el || !(el instanceof HTMLElement)) return false;
        if (isPdfTextSpanStruckOrCancelled(el)) return false;
        toHighlight.push(el);
      }
      if (toHighlight.length === 0) return false;
      for (const el of toHighlight) {
        el.style.backgroundColor = PDF_HIGHLIGHT_BG;
      }
      highlightedElsRef.current = toHighlight;
      const first = toHighlight[0];
      requestAnimationFrame(() => {
        first.scrollIntoView({ behavior: "instant", block: "center" });
      });
      return true;
    },
    [],
  );

  const executeSearch = useCallback(
    (query: string, sectionKey: string, anchor?: string | null): PdfHighlightSearchResult => {
      const qRaw = query.trim();
      const q = pdfHighlightQueryFromDisplayValue(qRaw);
      if (q.length < 1) return "miss";
      clearHighlights();
      const sec = sectionRangesRef.current.find((r) => r.sectionKey === sectionKey);
      if (!sec) {
        pdfHighlightDevLog("no section range", { sectionKey, ranges: sectionRangesRef.current });
        return "miss";
      }
      if (process.env.NODE_ENV === "development") {
        console.log("원본 검색 섹션 범위:", {
          sectionKey,
          startPage: sec.startPage,
          endPage: sec.endPage,
        });
      }
      const anchorTrim = (anchor ?? "").trim();
      const valueNorm = normalizeText(q);

      pdfHighlightDevLog("executeSearch", {
        sectionKey,
        pages: [sec.startPage, sec.endPage],
        query: q,
        queryRaw: qRaw,
        hasAnchor: anchorTrim.length > 0,
        anchorPreview: anchorTrim.slice(0, 48),
      });

      if (anchorTrim) {
        const anchorNorm = normalizeText(anchorTrim);
        for (let p = sec.startPage; p <= sec.endPage; p++) {
          const data = pageDataRef.current.get(p);
          if (!data?.strings.length || !data.divs.length) continue;
          const { strings, divs } = data;
          const joined = strings.join("");
          const pageNorm = normalizeText(joined);
          if (!pageNorm.includes(anchorNorm)) continue;
          if (tryHighlightValueAfterAnchorOnPage(strings, divs, joined, q, anchorTrim, tryApplyHighlight)) {
            pdfHighlightDevLog("highlight ok (anchor path)", { page: p, sectionKey });
            return "hit";
          }
          pdfHighlightDevLog("anchor on page but highlight failed", { page: p, sectionKey });
        }
      }

      for (let p = sec.startPage; p <= sec.endPage; p++) {
        const data = pageDataRef.current.get(p);
        if (!data?.strings.length || !data.divs.length) continue;
        const { strings, divs } = data;
        const joined = strings.join("");
        const pageNorm = normalizeText(joined);
        if (!pageNorm.includes(valueNorm)) continue;

        for (const vr of sortCharRangesByStartDesc(findNormalizedValueRanges(joined, q))) {
          if (tryApplyHighlight(strings, divs, vr)) {
            pdfHighlightDevLog("highlight ok (value-only norm)", { page: p });
            return "hit";
          }
        }
        for (const cand of sortCharRangesByStartDesc(collectPdfTextMatchRanges(strings, q))) {
          if (tryApplyHighlight(strings, divs, cand)) {
            pdfHighlightDevLog("highlight ok (raw fallback)", { page: p });
            return "hit";
          }
        }
      }

      pdfHighlightDevLog("executeSearch miss", { sectionKey, query: q });
      return "miss";
    },
    [clearHighlights, tryApplyHighlight],
  );

  const scrollToBuildingRegistrySectionImpl = useCallback(() => {
    clearHighlights();
    const n = pdfDoc?.numPages ?? 0;
    const startPage = getBuildingRegistryStartPage(pageDataRef.current, n) ?? 1;
    const run = () => {
      const host = pagesHostRef.current;
      const scrollEl = scrollRef.current;
      const wrap = host?.querySelector<HTMLElement>(`[data-page-num="${startPage}"]`);
      if (wrap && scrollEl) {
        const w = wrap.getBoundingClientRect();
        const s = scrollEl.getBoundingClientRect();
        const nextTop = scrollEl.scrollTop + (w.top - s.top) - 12;
        scrollEl.scrollTo({ top: Math.max(0, nextTop), behavior: "instant" });
        pdfHighlightDevLog("registry scroll", { startPage, scrollTop: scrollEl.scrollTop });
      } else {
        wrap?.scrollIntoView({ behavior: "instant", block: "start" });
        pdfHighlightDevLog("registry scroll fallback", {
          startPage,
          hasWrap: Boolean(wrap),
          hasScrollEl: Boolean(scrollEl),
        });
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [pdfDoc, clearHighlights]);

  const exportSectionPngDataUrl = useCallback(
    async (sectionKey: string): Promise<string | null> => {
      const doc = pdfDoc;
      if (!doc || !fullyRenderedRef.current) return null;
      const sk = sectionKey.trim();
      const sec = sectionRangesRef.current.find((r) => r.sectionKey === sk);
      if (!sec) return null;

      const scrollEl = scrollRef.current;
      const cw = scrollEl?.clientWidth ?? hostWidth;
      const maxCssW = Math.max(280, (cw > 0 ? cw : 720) - 24);
      const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);

      const canvases: HTMLCanvasElement[] = [];
      const maxPages = 12;
      const endPg = Math.min(sec.endPage, sec.startPage + maxPages - 1);

      for (let p = sec.startPage; p <= endPg; p++) {
        const page = await doc.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const cssScale = Math.min(maxCssW / base.width, 2.0);
        const vp = page.getViewport({ scale: cssScale * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) continue;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        await page.render({ canvasContext: ctx, viewport: vp, canvas, intent: "display" }).promise;
        canvases.push(canvas);
      }

      if (canvases.length === 0) return null;

      const tw = Math.max(...canvases.map((c) => c.width));
      const th = canvases.reduce((s, c) => s + c.height, 0);
      const out = document.createElement("canvas");
      out.width = tw;
      out.height = th;
      const octx = out.getContext("2d", { alpha: false });
      if (!octx) return null;
      let y = 0;
      for (const c of canvases) {
        octx.drawImage(c, 0, y);
        y += c.height;
      }

      const maxDim = 2800;
      if (out.width > maxDim || out.height > maxDim) {
        const s = maxDim / Math.max(out.width, out.height);
        const sm = document.createElement("canvas");
        sm.width = Math.floor(out.width * s);
        sm.height = Math.floor(out.height * s);
        const sx = sm.getContext("2d", { alpha: false });
        if (sx) {
          sx.imageSmoothingEnabled = true;
          sx.imageSmoothingQuality = "high";
          sx.drawImage(out, 0, 0, sm.width, sm.height);
          return sm.toDataURL("image/png");
        }
      }
      return out.toDataURL("image/png");
    },
    [pdfDoc, hostWidth],
  );

  const executeSearchRef = useRef(executeSearch);
  executeSearchRef.current = executeSearch;
  const scrollToRegistryRef = useRef(scrollToBuildingRegistrySectionImpl);
  scrollToRegistryRef.current = scrollToBuildingRegistrySectionImpl;
  const onTextNotFoundRef = useRef(onTextNotFound);
  onTextNotFoundRef.current = onTextNotFound;

  useEffect(() => {
    setPdfDoc(null);
    setNumPages(0);
    setLoadError(null);
    clearHighlights();
    cancelTextLayers();
    pageDataRef.current = new Map();
    sectionRangesRef.current = [];
    fullyRenderedRef.current = false;
    pendingSearchRef.current = null;
    pendingRegistryScrollRef.current = false;
    if (pagesHostRef.current) pagesHostRef.current.innerHTML = "";
    ioRef.current?.disconnect();
    ioRef.current = null;
    pageVisibilityRatiosRef.current = new Map();

    if (!activeFile) return;

    const raw = buffers.get(activeFile.id);
    if (!raw) return;

    let cancelled = false;
    let docToDestroy: PDFDocumentProxy | null = null;

    void (async () => {
      try {
        const pdfjs = await getPdfjs();
        const copy = raw.slice(0);
        const task = pdfjs.getDocument({ data: new Uint8Array(copy) });
        const doc = await task.promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        docToDestroy = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch {
        if (!cancelled) setLoadError("PDF를 열 수 없습니다.");
      }
    })();

    return () => {
      cancelled = true;
      if (docToDestroy) void docToDestroy.destroy();
    };
  }, [activeFile?.id, buffers, activeFile, clearHighlights, cancelTextLayers]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setHostWidth(Math.max(0, el.clientWidth));
    });
    ro.observe(el);
    setHostWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [pdfDoc]);

  useEffect(() => {
    const doc = pdfDoc;
    const host = pagesHostRef.current;
    const scrollEl = scrollRef.current;
    if (!doc || !host || !scrollEl) return;

    const gen = ++renderGenRef.current;
    fullyRenderedRef.current = false;
    clearHighlights();
    cancelTextLayers();
    pageDataRef.current = new Map();
    sectionRangesRef.current = [];
    host.innerHTML = "";
    ioRef.current?.disconnect();
    ioRef.current = null;
    pageVisibilityRatiosRef.current = new Map();

    const cw = scrollEl.clientWidth || hostWidth;
    const maxW = Math.max(280, (cw > 0 ? cw : 720) - 24);

    let cancelled = false;

    void (async () => {
      try {
        const pdfjs = await getPdfjs();
        const TextLayer = pdfjs.TextLayer;

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          if (cancelled || gen !== renderGenRef.current) return;

          const pdfPage = await doc.getPage(pageNum);
          const base = pdfPage.getViewport({ scale: 1 });
          const devicePixelRatio = window.devicePixelRatio || 1;
          /** 레이아웃·텍스트 레이어용(CSS px). 상한 2.0으로 메모리·품질 균형 */
          const cssScale = Math.min(maxW / base.width, 2.0);
          const displayViewport = pdfPage.getViewport({ scale: cssScale });
          const renderViewport = pdfPage.getViewport({ scale: cssScale * devicePixelRatio });

          const pageWrap = document.createElement("div");
          pageWrap.dataset.pageNum = String(pageNum);
          pageWrap.style.marginBottom = pageNum < doc.numPages ? "8px" : "0";
          pageWrap.style.display = "flex";
          pageWrap.style.justifyContent = "center";

          const pageBox = document.createElement("div");
          pageBox.className = "relative shadow-md";
          pageBox.style.width = `${Math.ceil(displayViewport.width)}px`;
          pageBox.style.height = `${Math.ceil(displayViewport.height)}px`;
          pageBox.style.setProperty("--total-scale-factor", String(cssScale));

          const canvas = document.createElement("canvas");
          canvas.className = "block max-w-none";
          const pixelRatio = devicePixelRatio;
          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);
          canvas.style.width = `${Math.ceil(renderViewport.width / pixelRatio)}px`;
          canvas.style.height = `${Math.ceil(renderViewport.height / pixelRatio)}px`;

          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) continue;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          await pdfPage.render({
            canvasContext: ctx,
            viewport: renderViewport,
            canvas,
            intent: "display",
          }).promise;

          if (cancelled || gen !== renderGenRef.current) return;

          const textLayerDiv = document.createElement("div");
          textLayerDiv.className = "textLayer";

          const textContent = await pdfPage.getTextContent();
          const textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: displayViewport,
          });
          textLayersRef.current.push(textLayer);
          await textLayer.render();

          if (cancelled || gen !== renderGenRef.current) return;

          pageBox.appendChild(canvas);
          pageBox.appendChild(textLayerDiv);
          pageWrap.appendChild(pageBox);
          host.appendChild(pageWrap);

          pageDataRef.current.set(pageNum, {
            strings: [...textLayer.textContentItemsStr],
            divs: [...textLayer.textDivs] as HTMLElement[],
          });
        }

        if (cancelled || gen !== renderGenRef.current) return;

        const visionHints = new Map<number, PdfVisionSectionHint>();
        for (let p = 1; p <= doc.numPages; p++) {
          if (cancelled || gen !== renderGenRef.current) return;
          const t = getPageTextForSectionDetection(pageDataRef.current.get(p));
          if (t.trim() !== "") continue;
          console.log(`[페이지 ${p}] 텍스트 없음 → vision 감지 시도`);
          try {
            const dataUrl = await renderPdfPageToPngDataUrl(doc, p);
            if (!dataUrl) {
              console.log(`[페이지 ${p}] vision 감지 결과:`, null, "(렌더 실패)");
              continue;
            }
            const hint = await requestVisionSectionType(dataUrl);
            console.log(`[페이지 ${p}] vision 감지 결과:`, hint);
            if (hint) visionHints.set(p, hint);
          } catch {
            console.log(`[페이지 ${p}] vision 감지 결과:`, null, "(요청 실패)");
          }
        }

        if (cancelled || gen !== renderGenRef.current) return;

        const sectionRanges = computePdfSectionRanges(pageDataRef.current, doc.numPages, {
          visionHints,
        });
        sectionRangesRef.current = sectionRanges;
        pdfHighlightDevLog("section ranges computed", sectionRanges);
        onSectionRangesComputedRef.current?.(sectionRanges);

        fullyRenderedRef.current = true;
        setVisiblePage(1);

        const root = scrollEl;
        const ratiosRef = pageVisibilityRatiosRef;
        const io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              const n = parseInt((e.target as HTMLElement).dataset.pageNum ?? "1", 10);
              ratiosRef.current.set(n, e.intersectionRatio);
            }
            let best = 1;
            let bestR = 0;
            for (const [n, r] of ratiosRef.current) {
              if (r > bestR) {
                bestR = r;
                best = n;
              }
            }
            if (bestR > 0) setVisiblePage(best);
          },
          { root, threshold: [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1] },
        );
        ioRef.current = io;
        host.querySelectorAll<HTMLElement>("[data-page-num]").forEach((w) => io.observe(w));

        const pendingReg = pendingRegistryScrollRef.current;
        pendingRegistryScrollRef.current = false;
        if (pendingReg) {
          scrollToRegistryRef.current();
        } else {
          const pending = pendingSearchRef.current;
          pendingSearchRef.current = null;
          if (pending) {
            const outcome = executeSearchRef.current(
              pending.query,
              pending.sectionKey,
              pending.anchor,
            );
            if (outcome === "miss") onTextNotFoundRef.current?.();
          }
        }
      } catch {
        if (gen === renderGenRef.current) {
          setLoadError("PDF 페이지를 그릴 수 없습니다.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, hostWidth, clearHighlights, cancelTextLayers]);

  useImperativeHandle(
    ref,
    () => ({
      findTextAndHighlight: (
        fileIndex: number,
        query: string,
        sectionKey: string,
        anchor?: string | null,
      ) => {
        if (files.length === 0) {
          onTextNotFound?.();
          return;
        }
        const fi = Math.min(Math.max(0, fileIndex), files.length - 1);
        const q = query.trim();
        const sk = sectionKey.trim();
        if (q.length < 1 || sk.length < 1) {
          onTextNotFound?.();
          return;
        }

        clearHighlights();
        pendingRegistryScrollRef.current = false;

        if (fi !== activeFileIndex) {
          pendingSearchRef.current = { query: q, sectionKey: sk, anchor };
          onActiveFileIndexChange(fi);
          return;
        }

        if (!fullyRenderedRef.current || !pdfDoc) {
          pendingSearchRef.current = { query: q, sectionKey: sk, anchor };
          return;
        }

        const outcome = executeSearch(q, sk, anchor);
        if (outcome === "miss") onTextNotFound?.();
      },
      scrollToBuildingRegistrySection: (fileIndex: number) => {
        if (files.length === 0) return;
        const fi = Math.min(Math.max(0, fileIndex), files.length - 1);
        clearHighlights();
        pendingSearchRef.current = null;

        if (fi !== activeFileIndex) {
          pendingRegistryScrollRef.current = true;
          onActiveFileIndexChange(fi);
          return;
        }

        if (!fullyRenderedRef.current || !pdfDoc) {
          pendingRegistryScrollRef.current = true;
          return;
        }

        scrollToBuildingRegistrySectionImpl();
      },
      getDetectedSectionKeys: () => sectionRangesRef.current.map((r) => r.sectionKey),
      exportSectionPngDataUrl,
    }),
    [
      files.length,
      activeFileIndex,
      pdfDoc,
      onActiveFileIndexChange,
      clearHighlights,
      executeSearch,
      scrollToBuildingRegistrySectionImpl,
      onTextNotFound,
      exportSectionPngDataUrl,
    ],
  );

  if (files.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] flex-col">
        <div
          role="presentation"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={onDrop}
          className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-white p-8 text-center transition hover:border-sky-400 hover:bg-sky-50/50"
        >
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            id="pdf-input-viewer"
            onChange={onFileInputChange}
          />
          <label htmlFor="pdf-input-viewer" className="flex cursor-pointer flex-col gap-3">
            <span className="text-4xl font-light text-zinc-300">＋</span>
            <span className="text-base font-medium text-zinc-800">
              PDF를 끌어 놓거나 클릭하여 선택
            </span>
            <span className="text-sm text-zinc-500">
              등기사항전부증명서 + 건축물대장이 포함된 PDF를 업로드하세요
            </span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {files.length > 1 ? (
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-zinc-200 pb-2">
          {files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                pendingSearchRef.current = null;
                pendingRegistryScrollRef.current = false;
                clearHighlights();
                onActiveFileIndexChange(i);
              }}
              className={`max-w-[12rem] truncate rounded-md px-3 py-1.5 text-left text-xs font-medium transition ${
                i === activeFileIndex
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
              }`}
              title={f.name}
            >
              {f.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="shrink-0 truncate border-b border-zinc-200 pb-2 text-xs font-medium text-zinc-600">
          {files[0]?.name}
        </div>
      )}

      {loadError && (
        <p className="shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}
        </p>
      )}

      <div className="relative min-h-0 flex-1 rounded-lg bg-zinc-200/60 ring-1 ring-zinc-200">
        <div
          className="pointer-events-none absolute right-3 top-3 z-20 rounded-md bg-white/95 px-2.5 py-1 text-sm font-medium tabular-nums text-zinc-800 shadow-sm ring-1 ring-zinc-200"
          aria-live="polite"
        >
          {numPages > 0 ? `${visiblePage} / ${numPages}` : "—"}
        </div>
        <div
          ref={scrollRef}
          className="h-full max-h-[calc(100dvh-14rem)] min-h-[320px] overflow-y-auto overflow-x-auto p-2 lg:max-h-[calc(100dvh-12rem)]"
        >
          <div ref={pagesHostRef} className="flex flex-col items-center pb-2 pt-10" />
        </div>
      </div>
    </div>
  );
});

const PdfViewerPanel = memo(PdfViewerPanelInner);
export default PdfViewerPanel;
