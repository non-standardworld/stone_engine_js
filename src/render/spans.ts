/*
render/spans.ts — テキストの範囲に付けるリンク・文字色・線（下線・打ち消し線）・太さ・スタイル。

組版はプレーンテキストに対して行い、範囲ごとの装飾は描画のときに重ねる。文字色と線は送り幅を変えないので、レイアウトはそのまま使える。
太さ・スタイル（太字・斜体）は送り幅が変わるので、範囲を layoutText にも渡して、その文字を太さ・スタイルを変えた変種のフォントで組む
（engine.ts の applyFontStyleSpans）。描画は run のフォントのとおりなので、ここでは何もしない。
- リンクは SVG の <a> にする（<text> の中で、その範囲の文字の <tspan> を囲む）。
- 文字色は、その範囲を囲む要素の fill にする。
- 線は SVG の <text-decoration> ではなく、文字の占める矩形から自前で描く（クリックはリンクの文字に通す）。1 文字ずつ <tspan> に分けているので、ブラウザの下線は
  文字ごとに切れるうえ、縦書きでは横線になってしまう。横書きは仮想ボディの下端、縦書きは列の右（日本語の傍線の位置）に引く。

React の <StoneText> は、children を描画したスクリーンリーダー用の要素から readStoneSource でテキストと範囲を読み取る。
<a> の href や、CSS で決まった文字色・下線（ブラウザ標準のリンクの下線も含む）・太さ・スタイルがそのまま反映される。
*/

import type { StoneContext } from "../context.js";
import { isSpaceChar } from "../punctuation.js";
import { SCRIPTS, type FontStyle, type FontStyleSpan, type Rect, type Run } from "../types.js";

/**
 * テキストの範囲に付ける装飾。start / end は元のテキストの UTF-16 の位置。
 * fontWeight / fontStyle（太さ・スタイル）は、同じ範囲を layoutText にも渡したときに反映される。
 */
export interface StoneSpan extends FontStyleSpan {
  /** リンク先。指定すると SVG の <a> で囲む。 */
  href?: string;
  /** リンクの target。 */
  target?: string;
  /** リンクの rel。 */
  rel?: string;
  /** 範囲を囲む SVG の要素に付けるクラス。 */
  className?: string;
  /** 文字色（SVG の fill）。 */
  color?: string;
  /** 下線（縦書きでは列の右の傍線）を引く。 */
  underline?: boolean;
  /** 打ち消し線を引く。 */
  lineThrough?: boolean;
  /** 線の色。省略時は color、それも無ければ文字色。 */
  decorationColor?: string;
}

/** 和文フォントの ID（フォント ID は SCRIPTS の添字と一致する）。線の位置は和文の仮想ボディを基準にする。 */
const JAPANESE_FONT_ID = SCRIPTS.indexOf("japanese");

/** 線の太さ（フォントサイズに対する比）と最小値（px）。 */
const DECORATION_THICKNESS = 0.06;
const MIN_DECORATION_THICKNESS = 1;

/**
 * run ごとに、その run を含む範囲の添字を外側から順に並べたもの（範囲の入れ子）。
 * run は先頭の位置が範囲に入っていればその範囲に属する。範囲は開始が早い順、同じなら長い順を外側とする。
 */
export function spanStacks(ctx: StoneContext, spans: readonly StoneSpan[] | undefined): number[][] {
  const stacks: number[][] = ctx.runs.map(() => []);
  if (!spans || spans.length === 0) return stacks;
  const order = spans
    .map((span, index) => ({ span, index }))
    .filter(({ span }) => span.end > span.start)
    .sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end || a.index - b.index);
  let offset = 0;
  for (let i = 0; i < ctx.runs.length; i++) {
    for (const { span, index } of order) {
      if (span.start > offset) break;
      if (offset < span.end) stacks[i].push(index);
    }
    offset += ctx.runs[i].char.length;
  }
  return stacks;
}

/** 縦書きで run がある列の左端。縦中横は列の中央に寄せてあるので、そのトークンの中央から求める。 */
export function columnLeft(ctx: StoneContext, run: Run): number {
  if (!ctx.isTateChuYoko(run)) return run.frame.x;
  const token = ctx.tokens[run.tokenId];
  const first = ctx.runs[token.start].frame;
  const last = ctx.runs[token.end - 1].frame;
  return (first.x + last.x + last.width - ctx.adjustFontSize) * 0.5;
}

/** 範囲の文字を行ごとにまとめたもの。両端の空白と、非表示の文字・改行は含まない。 */
interface SpanSegment {
  first: Run;
  last: Run;
}

/** 範囲 spanIndex に属する文字を、行ごとの連続した並びにまとめる。 */
function spanSegments(ctx: StoneContext, stacks: number[][], spanIndex: number): SpanSegment[] {
  const segments: SpanSegment[] = [];
  let current: Run[] = [];
  const flush = (): void => {
    let lo = 0;
    let hi = current.length;
    while (lo < hi && isSpaceChar(current[lo].char)) lo++;
    while (hi > lo && isSpaceChar(current[hi - 1].char)) hi--;
    if (hi > lo) segments.push({ first: current[lo], last: current[hi - 1] });
    current = [];
  };
  for (let i = 0; i < ctx.runs.length; i++) {
    const run = ctx.runs[i];
    const inSpan = stacks[i].includes(spanIndex) && !run.isNewline && run.visibility !== "invisible";
    if (!inSpan || (current.length > 0 && current[current.length - 1].line !== run.line)) flush();
    if (inSpan) current.push(run);
  }
  flush();
  return segments;
}

/** 範囲の行ごとの矩形（横書きは仮想ボディの高さ、縦書きは列の幅）。フォーカスの枠などに使う。 */
export function spanRects(ctx: StoneContext, spans: readonly StoneSpan[], spanIndex: number): Rect[] {
  const stacks = spanStacks(ctx, spans);
  const size = ctx.adjustFontSize;
  const ascent = ctx.fontManager.ascent(JAPANESE_FONT_ID, size);
  return spanSegments(ctx, stacks, spanIndex).map(({ first, last }) => {
    if (ctx.direction === "lrTb") {
      const x = first.frame.x;
      return { x, y: first.position.y - ascent, width: last.frame.x + last.frame.width - x, height: size };
    }
    const y = first.frame.y;
    return { x: columnLeft(ctx, first), y, width: size, height: last.frame.y + last.frame.height - y };
  });
}

/** 範囲に引く線の矩形。 */
export interface DecorationRect extends Rect {
  spanIndex: number;
  kind: "underline" | "lineThrough";
  /** 線の色。null なら文字色を引き継ぐ。 */
  color: string | null;
}

/**
 * 範囲の線（下線・打ち消し線）の矩形。横書きの下線は仮想ボディの下端、縦書きの下線は列の右端（傍線）に、
 * 打ち消し線は仮想ボディの中央に引く。
 */
export function decorationRects(ctx: StoneContext, spans: readonly StoneSpan[] | undefined): DecorationRect[] {
  if (!spans || spans.length === 0) return [];
  const stacks = spanStacks(ctx, spans);
  const size = ctx.adjustFontSize;
  const ascent = ctx.fontManager.ascent(JAPANESE_FONT_ID, size);
  const thickness = Math.max(MIN_DECORATION_THICKNESS, size * DECORATION_THICKNESS);
  const rects: DecorationRect[] = [];
  spans.forEach((span, spanIndex) => {
    const kinds = (["underline", "lineThrough"] as const).filter((kind) => span[kind]);
    if (kinds.length === 0) return;
    const color = span.decorationColor ?? span.color ?? null;
    for (const { first, last } of spanSegments(ctx, stacks, spanIndex)) {
      for (const kind of kinds) {
        // 下線は仮想ボディ（縦書きは列）の内側の端、打ち消し線は中央に引く（領域の端で切り取られないよう内側に収める）
        const offset = kind === "underline" ? size - thickness : (size - thickness) * 0.5;
        if (ctx.direction === "lrTb") {
          const x = first.frame.x;
          const y = first.position.y - ascent + offset;
          rects.push({ spanIndex, kind, color, x, y, width: last.frame.x + last.frame.width - x, height: thickness });
        } else {
          const y = first.frame.y;
          const x = columnLeft(ctx, first) + offset;
          rects.push({ spanIndex, kind, color, x, y, width: thickness, height: last.frame.y + last.frame.height - y });
        }
      }
    }
  });
  return rects;
}

/** readStoneSource の結果。 */
export interface StoneSource {
  /** 組むテキスト。 */
  text: string;
  /** 範囲ごとの装飾。 */
  spans: StoneSpan[];
  /** spans と同じ順の、範囲のもとになった要素。 */
  elements: Element[];
}

/** 計算済みの font-style（"oblique 10deg" など）を FontStyle にする。 */
function fontStyleOf(value: string): FontStyle {
  if (value === "italic") return "italic";
  return value.startsWith("oblique") ? "oblique" : "normal";
}

/** テキストに含めない要素（ルビの読みなど）。 */
const SKIPPED_TAGS: ReadonlySet<string> = new Set(["RT", "RP", "SCRIPT", "STYLE", "TEMPLATE"]);

/**
 * DOM 要素から、組むテキストと範囲ごとの装飾を読み取る（ブラウザ専用）。
 * テキストはテキストノードを順につなげたもので、<br> は改行にする。要素ごとに、リンク（<a href>）と、
 * 親と違う文字色、下線・打ち消し線（CSS の text-decoration-line。ブラウザ標準のリンクの下線も含む）、
 * 親と違う太さ・スタイル（CSS の font-weight / font-style。<strong> や <em> も含む）を範囲にする。
 */
export function readStoneSource(root: Element): StoneSource {
  const view = root.ownerDocument.defaultView;
  const style = (el: Element): CSSStyleDeclaration | null => (view ? view.getComputedStyle(el) : null);
  let text = "";
  const entries: { span: StoneSpan; element: Element }[] = [];

  const walk = (node: Node, parentStyle: CSSStyleDeclaration | null): void => {
    if (node.nodeType === 3) {
      text += (node as Text).data;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (SKIPPED_TAGS.has(el.tagName.toUpperCase())) return;
    if (el.tagName.toUpperCase() === "BR") {
      text += "\n";
      return;
    }
    const cs = style(el);
    if (cs?.display === "none") return;
    // 子より先に場所を取っておき、外側の要素が先に並ぶようにする
    const entry = el === root ? null : { span: { start: text.length, end: text.length } as StoneSpan, element: el };
    if (entry) entries.push(entry);
    for (const child of Array.from(el.childNodes)) walk(child, cs);
    if (!entry) return;
    entry.span.end = text.length;
    const span = entry.span;
    const href = el.tagName.toUpperCase() === "A" ? el.getAttribute("href") : null;
    if (href !== null) {
      span.href = href;
      const target = el.getAttribute("target");
      const rel = el.getAttribute("rel");
      if (target) span.target = target;
      if (rel) span.rel = rel;
    }
    if (cs) {
      if (parentStyle && cs.color !== parentStyle.color) span.color = cs.color;
      if (parentStyle && cs.fontWeight !== parentStyle.fontWeight) span.fontWeight = cs.fontWeight;
      if (parentStyle && cs.fontStyle !== parentStyle.fontStyle) span.fontStyle = fontStyleOf(cs.fontStyle);
      const line = cs.textDecorationLine || "";
      if (/\bunderline\b/.test(line)) span.underline = true;
      if (/\bline-through\b/.test(line)) span.lineThrough = true;
      if ((span.underline || span.lineThrough) && cs.textDecorationColor && cs.textDecorationColor !== cs.color) {
        span.decorationColor = cs.textDecorationColor;
      }
    }
  };
  walk(root, style(root));

  const kept = entries.filter(
    ({ span }) =>
      span.end > span.start &&
      (span.href !== undefined ||
        span.color !== undefined ||
        span.underline ||
        span.lineThrough ||
        span.fontWeight !== undefined ||
        span.fontStyle !== undefined),
  );
  return { text, spans: kept.map((e) => e.span), elements: kept.map((e) => e.element) };
}

/** 2 つの範囲の並びが同じかどうか（React の再描画で読み直した結果を比べる）。 */
export function sameSpans(a: readonly StoneSpan[], b: readonly StoneSpan[]): boolean {
  if (a.length !== b.length) return false;
  const keys: (keyof StoneSpan)[] = [
    "start",
    "end",
    "href",
    "target",
    "rel",
    "className",
    "color",
    "underline",
    "lineThrough",
    "decorationColor",
    "fontWeight",
    "fontStyle",
  ];
  return a.every((span, i) => keys.every((key) => span[key] === b[i][key]));
}
