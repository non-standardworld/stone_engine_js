/*
render/copy.ts — 組版した SVG を選択してコピーしたときに、元のテキストをクリップボードに入れる。

SVG は段落ごとの <text> と 1 文字ごとの <tspan data-run> でできているので、ブラウザ標準のコピーでもおおむね元のテキストになるが、
空行は空白 1 つの行になり、省略記号で切り詰めた部分は「…」のままになる。
選択範囲が 1 つの SVG の中に収まっているときは、選ばれた文字の run から元のテキストを切り出してクリップボードに書き込む。
ページの他の部分にまたがる選択はブラウザ標準のコピーに任せる。
*/

import type { StoneContext } from "../context.js";

/** handleStoneCopy に渡すイベント。DOM の ClipboardEvent でも React の ClipboardEvent でもよい。 */
export interface CopyEventLike {
  clipboardData: DataTransfer | null;
  preventDefault(): void;
}

/**
 * run ID の範囲 [start, end) の元のテキスト。
 * 省略記号になった run まで含まれていれば、切り詰められて表示されていない残りも含める（CSS の text-overflow: ellipsis と同じ）。
 */
export function textOfRunRange(ctx: StoneContext, start: number, end: number): string {
  const runs = ctx.runs;
  const lo = Math.max(0, start);
  let hi = Math.min(end, runs.length);
  if (hi > lo && runs[hi - 1].visibility === "ellipsis") hi = runs.length;
  let text = "";
  for (let i = lo; i < hi; i++) text += runs[i].char;
  return text;
}

/**
 * DOM の選択範囲と 1 文字以上重なる文字（root の中の data-run を持つ要素）の run ID の範囲 [start, end)。
 * 重なる文字が無ければ null。
 */
export function runRangeOfSelection(root: Element, range: Range): [number, number] | null {
  const glyph = root.ownerDocument.createRange();
  let start = -1;
  let end = -1;
  for (const el of root.querySelectorAll("[data-run]")) {
    const text = el.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) continue;
    glyph.setStart(text, 0);
    glyph.setEnd(text, (text as Text).length);
    // 選択の終わりが文字の先頭より後ろで、選択の始まりが文字の末尾より前なら重なっている
    // （文字の境目にちょうど接しているだけのものは含めない）
    if (range.compareBoundaryPoints(Range.START_TO_END, glyph) <= 0) continue;
    if (range.compareBoundaryPoints(Range.END_TO_START, glyph) >= 0) continue;
    const id = Number(el.getAttribute("data-run"));
    if (!Number.isInteger(id)) continue;
    if (start === -1 || id < start) start = id;
    if (id + 1 > end) end = id + 1;
  }
  return start === -1 ? null : [start, end];
}

/**
 * copy イベントを処理する。選択範囲が root の中に収まっていれば、選ばれた文字の元のテキスト
 * （改行・空白・空行を含む）をクリップボードに書き込んで true を返す。
 * 選択が root の外にまたがるときなどは何もせずに false を返し、ブラウザ標準のコピーに任せる。
 */
export function handleStoneCopy(event: CopyEventLike, ctx: StoneContext, root: Element): boolean {
  const data = event.clipboardData;
  if (!data) return false;
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return false;
  const runs = runRangeOfSelection(root, range);
  if (!runs) return false;
  data.setData("text/plain", textOfRunRange(ctx, runs[0], runs[1]));
  event.preventDefault();
  return true;
}
