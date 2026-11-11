/*
auto/source.ts — オートモードで組む要素（ブロック）の中身を読み取る。

readStoneSource（render/spans.ts）と同じく、テキストと、リンク・文字色・線・太さ・スタイルの範囲を読み取るが、
- 空白は CSS の white-space の規則でたたむ（auto/whitespace.ts）。
- 組めないもの（ルビ、画像、文字サイズやフォントの違う要素、ブロックの子など）が 1 つでもあれば、読み取りをやめてその理由を返す。
計算済みスタイルは styleOf で受け取るので、DOM のないところ（テスト）でも動く。
*/

import { describeDecoration, describeElementSpan, isStyledSpan, type SpanStyle, type StoneSpan } from "../render/spans.js";
import { inlineSkipReason, type AutoSkipReason, type AutoStyle } from "./style.js";
import { CollapsedText, type WhiteSpaceMode } from "./whitespace.js";

/** 読み取った中身。 */
export interface AutoSource {
  /** 組むテキスト（空白をたたんだもの）。 */
  text: string;
  /** 範囲ごとの装飾（text の位置）。 */
  spans: StoneSpan[];
  /** spans と同じ順の、範囲のもとになった要素。 */
  elements: Element[];
}

export type AutoSourceResult = { ok: true; source: AutoSource } | { ok: false; reason: AutoSkipReason };

/** 要素（か疑似要素）の計算済みスタイル。 */
export type AutoComputedStyle = AutoStyle & SpanStyle & { content?: string };

export interface ReadAutoSourceOptions {
  /** ブロックの計算済みスタイル。 */
  blockStyle: AutoComputedStyle;
  /**
   * ブロックの直下の要素がプロパティを継承する元の計算済みスタイル。ふつうは blockStyle と同じ。
   * 組んだ後は、中身を隠している要素を通して white-space などを継承するので、その継承元を渡す。
   */
  baseStyle: AutoComputedStyle;
  /** 空白のたたみ方（ブロックの white-space から決める）。 */
  mode: WhiteSpaceMode;
  /** 要素の計算済みスタイル。pseudo を渡したときは、その疑似要素のもの。 */
  styleOf: (el: Element, pseudo?: string) => AutoComputedStyle | null;
}

/** 中身を組まずに無視する要素。 */
const IGNORED_TAGS: ReadonlySet<string> = new Set(["SCRIPT", "STYLE", "TEMPLATE", "WBR"]);

/** あるだけで組めない要素と、その理由。 */
const UNSUPPORTED_TAGS: ReadonlyMap<string, AutoSkipReason> = new Map([
  ...["RUBY", "RT", "RP", "RB", "RTC"].map((tag) => [tag, "ruby"] as const),
  ...["IMG", "PICTURE", "SVG", "CANVAS", "VIDEO", "AUDIO", "IFRAME", "OBJECT", "EMBED", "MATH"].map(
    (tag) => [tag, "media"] as const,
  ),
  ...["INPUT", "BUTTON", "SELECT", "TEXTAREA", "METER", "PROGRESS"].map((tag) => [tag, "form-control"] as const),
]);

/** 疑似要素が内容を生成しているかどうか。 */
function generatesContent(style: AutoComputedStyle | null): boolean {
  if (!style || style.display === "none") return false;
  const content = style.content;
  return content !== undefined && content !== "" && content !== "none" && content !== "normal";
}

/**
 * ブロック host の中身を読み取る。
 * テキストはテキストノードを順につなげ、<br> は改行にする（display: none の <br> は改行にしない）。
 * ブロック自身の下線・打ち消し線は、テキスト全体の範囲にする。
 */
export function readAutoSource(host: Element, options: ReadAutoSourceOptions): AutoSourceResult {
  const { blockStyle, baseStyle, mode, styleOf } = options;
  const out = new CollapsedText(mode);
  const entries: { span: StoneSpan; element: Element; start: number; end: number }[] = [];
  let reason: AutoSkipReason | null = null;

  const walk = (node: Node, parentStyle: AutoComputedStyle): void => {
    if (reason) return;
    if (node.nodeType === 3) {
      out.add((node as Text).data);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (IGNORED_TAGS.has(tag)) return;
    const cs = styleOf(el);
    if (cs?.display === "none") return;
    if (tag === "BR") {
      out.lineBreak();
      return;
    }
    const unsupported = UNSUPPORTED_TAGS.get(tag);
    if (unsupported) {
      reason = unsupported;
      return;
    }
    if (tag.includes("-") || el.shadowRoot) {
      reason = "custom-element";
      return;
    }
    if (!cs) {
      reason = "non-inline";
      return;
    }
    reason = inlineSkipReason(cs, parentStyle, blockStyle);
    if (!reason && (generatesContent(styleOf(el, "::before")) || generatesContent(styleOf(el, "::after")))) {
      reason = "generated-content";
    }
    if (reason) return;
    // 子より先に場所を取っておき、外側の要素が先に並ぶようにする
    const entry = { span: { start: 0, end: 0 } as StoneSpan, element: el, start: out.mark(), end: -1 };
    entries.push(entry);
    for (const child of Array.from(el.childNodes)) walk(child, cs);
    entry.end = out.mark();
    describeElementSpan(entry.span, el, cs, parentStyle);
  };
  for (const child of Array.from(host.childNodes)) walk(child, baseStyle);
  if (reason) return { ok: false, reason };

  const { text, offsets } = out.finish();
  if (!/\S/u.test(text)) return { ok: false, reason: "empty" };

  const spans: StoneSpan[] = [];
  const elements: Element[] = [];
  const whole: StoneSpan = { start: 0, end: text.length };
  describeDecoration(whole, blockStyle);
  if (isStyledSpan(whole)) {
    spans.push(whole);
    elements.push(host);
  }
  for (const entry of entries) {
    entry.span.start = offsets[entry.start];
    entry.span.end = offsets[entry.end];
    if (entry.span.end > entry.span.start && isStyledSpan(entry.span)) {
      spans.push(entry.span);
      elements.push(entry.element);
    }
  }
  return { ok: true, source: { text, spans, elements } };
}
