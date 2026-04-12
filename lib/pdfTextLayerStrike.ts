/**
 * pdf.js 텍스트 레이어: 말소(취소선)·빨간 표시 등으로 보이는 span은 원본 검색에서 제외
 */

const MAX_ANCESTOR_DEPTH = 14;

function isReddishColor(cssColor: string): boolean {
  const m = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return false;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  return r > 150 && r > g + 35 && r > b + 35;
}

const STRIKE_CLASS_RE =
  /strike|line-through|strikethrough|cancel|deleted|removed|void|invalid|malso|말소/i;

/** span 또는 조상에 취소선·말소류 class·빨간 글자색이면 true */
export function isPdfTextSpanStruckOrCancelled(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  for (let d = 0; d < MAX_ANCESTOR_DEPTH && node; d++) {
    if (node.classList?.contains("textLayer")) break;

    const inlineDeco = `${node.style.textDecoration ?? ""} ${node.style.textDecorationLine ?? ""}`;
    if (inlineDeco.includes("line-through")) return true;

    let st: CSSStyleDeclaration;
    try {
      st = getComputedStyle(node);
    } catch {
      node = node.parentElement;
      continue;
    }

    const decoLine = st.textDecorationLine || "";
    const deco = st.textDecoration || "";
    if (decoLine.includes("line-through") || deco.includes("line-through")) {
      return true;
    }

    const cls =
      typeof node.className === "string"
        ? node.className
        : Array.from(node.classList ?? []).join(" ");
    if (cls && STRIKE_CLASS_RE.test(cls)) return true;

    if (isReddishColor(st.color)) return true;

    node = node.parentElement;
  }
  return false;
}
