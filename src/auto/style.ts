/*
auto/style.ts — CSS の計算済みスタイルから、組めるかどうかの判定と組版オプションを決める（DOM に依存しない）。

オートモードは「CSS で決まった見た目のまま組む」ので、エンジンが再現できない CSS が効いている要素は、組まずに元の表示のまま残す。
見た目が変わるくらいなら何もしない、を既定にする。見送った理由は AutoSkipReason で分かる。
*/

import { JAPANESE_ASCENT_RATIO, JAPANESE_DESCENT_RATIO } from "../fonts.js";
import { fontStyleOf } from "../render/spans.js";
import { SCRIPTS, type Direction, type FontSpec, type StoneOptions, type TextAlign } from "../types.js";
import { whiteSpaceModeOf } from "./whitespace.js";

/** 組まずに見送った理由。 */
export type AutoSkipReason =
  /** Shadow DOM を付けられない要素（li、td など）。 */
  | "host"
  /** すでに別の Shadow DOM が付いている。 */
  | "shadow-root"
  /** contenteditable の中。 */
  | "editable"
  /** ブロックでない（display が block / flow-root / list-item 以外）。 */
  | "display"
  /** 行の中に置かれるリストマーカー（list-style-position: inside）。 */
  | "list-marker"
  /** 対応していない書字方向（vertical-lr、text-orientation: upright など）。 */
  | "writing-mode"
  /** 右から左（direction: rtl）。 */
  | "direction"
  /** 対応していない white-space。インライン要素では、親と違う white-space。 */
  | "white-space"
  /** text-wrap: balance。 */
  | "text-wrap"
  /** text-overflow: ellipsis など。 */
  | "text-overflow"
  /** 段組み（column-count / column-width）。 */
  | "columns"
  /** フロートが回り込んでいる。 */
  | "float"
  | "letter-spacing"
  | "word-spacing"
  | "text-indent"
  | "text-transform"
  /** font-feature-settings、font-variant-east-asian、font-stretch、font-variation-settings。 */
  | "font-feature"
  /** word-break: keep-all。 */
  | "word-break"
  /** text-shadow、圏点、-webkit-text-fill-color、文字の縁取り、透明度など。 */
  | "text-effect"
  /** ルビ。 */
  | "ruby"
  /** 画像・動画・SVG など。 */
  | "media"
  /** フォームの部品。 */
  | "form-control"
  /** カスタム要素。 */
  | "custom-element"
  /** インラインでない子要素（ブロック、inline-block、フロートなど）。 */
  | "non-inline"
  /** 文字サイズの違うインライン要素（small、sup など）。 */
  | "font-size"
  /** フォントの違うインライン要素（code など）。 */
  | "font-family"
  /** vertical-align が baseline でないインライン要素。 */
  | "vertical-align"
  /** 背景・枠・余白のあるインライン要素。 */
  | "inline-box"
  /** ::before / ::after で行の中に内容を足している。 */
  | "generated-content"
  /** 組む文字がない。 */
  | "empty"
  /** 組んでいる途中でエラーになった。 */
  | "error";

/**
 * 判定に使う計算済みスタイルの項目（CSSStyleDeclaration をそのまま渡せる）。
 * 省略できる項目は、対応していないブラウザでは無いものとして扱う。
 */
export interface AutoStyle {
  display: string;
  position: string;
  visibility: string;
  opacity: string;
  writingMode: string;
  textOrientation?: string;
  textCombineUpright?: string;
  direction: string;
  whiteSpace: string;
  textWrapStyle?: string;
  textOverflow?: string;
  columnCount?: string;
  columnWidth?: string;
  listStylePosition?: string;
  listStyleType?: string;
  textAlign: string;
  verticalAlign: string;
  color: string;
  fontSize: string;
  lineHeight: string;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  fontStretch?: string;
  fontFeatureSettings: string;
  fontVariantEastAsian?: string;
  fontVariationSettings?: string;
  letterSpacing: string;
  wordSpacing: string;
  textIndent: string;
  textTransform: string;
  wordBreak?: string;
  textShadow: string;
  textEmphasisStyle?: string;
  webkitTextFillColor?: string;
  webkitTextStrokeWidth?: string;
  backgroundColor: string;
  backgroundImage: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  borderTopWidth: string;
  borderRightWidth: string;
  borderBottomWidth: string;
  borderLeftWidth: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
}

/** 長さの計算値が 0（か normal、未対応）かどうか。 */
function isZeroLength(value: string | undefined): boolean {
  if (value === undefined || value === "" || value === "normal") return true;
  return parseFloat(value) === 0;
}

/** 値が指定されていて、初期値（initial）と違うかどうか。 */
function differsFrom(value: string | undefined, initial: string): boolean {
  return value !== undefined && value !== "" && value !== initial;
}

/** 色の計算値が完全な透明かどうか。アルファは rgba(r, g, b, a) の 4 つ目か、rgb(r g b / a) や color(... / a) の「/」の後ろ。 */
function isTransparent(color: string): boolean {
  if (color === "transparent") return true;
  const alpha = /^rgba\([^,]+,[^,]+,[^,]+,([^)]+)\)$/.exec(color) ?? /\/([^/)]+)\)$/.exec(color);
  return alpha !== null && parseFloat(alpha[1]) === 0;
}

/** CSS の writing-mode / text-orientation から文字方向を決める。対応していない組み合わせは null。 */
export function directionOf(style: Pick<AutoStyle, "writingMode" | "textOrientation">): Direction | null {
  if (style.writingMode === "horizontal-tb") return "lrTb";
  if (style.writingMode === "vertical-rl" && !differsFrom(style.textOrientation, "mixed")) return "tbRl";
  return null;
}

/** エンジンが再現できない文字まわりの CSS が効いていれば、その理由。ブロックにもインライン要素にも使う。 */
function textSkipReason(style: AutoStyle): AutoSkipReason | null {
  if (!isZeroLength(style.letterSpacing)) return "letter-spacing";
  if (!isZeroLength(style.wordSpacing)) return "word-spacing";
  if (!isZeroLength(style.textIndent)) return "text-indent";
  if (style.textTransform !== "none") return "text-transform";
  if (style.fontFeatureSettings !== "normal") return "font-feature";
  if (differsFrom(style.fontVariantEastAsian, "normal")) return "font-feature";
  if (differsFrom(style.fontVariationSettings, "normal")) return "font-feature";
  if (differsFrom(style.fontStretch, "normal") && style.fontStretch !== "100%") return "font-feature";
  if (style.wordBreak === "keep-all") return "word-break";
  if (style.textShadow !== "none") return "text-effect";
  if (differsFrom(style.textEmphasisStyle, "none")) return "text-effect";
  if (differsFrom(style.webkitTextFillColor, style.color)) return "text-effect";
  if (!isZeroLength(style.webkitTextStrokeWidth)) return "text-effect";
  return null;
}

/** ブロック（段落や見出し）のスタイルで組めない理由。組めるなら null。 */
export function blockSkipReason(style: AutoStyle): AutoSkipReason | null {
  if (style.display !== "block" && style.display !== "flow-root" && style.display !== "list-item") return "display";
  if (style.display === "list-item" && style.listStylePosition === "inside" && style.listStyleType !== "none") {
    return "list-marker";
  }
  if (directionOf(style) === null) return "writing-mode";
  if (style.direction === "rtl") return "direction";
  if (whiteSpaceModeOf(style.whiteSpace) === null) return "white-space";
  if (style.textWrapStyle === "balance") return "text-wrap";
  if (differsFrom(style.textOverflow, "clip")) return "text-overflow";
  if (differsFrom(style.columnCount, "auto") || differsFrom(style.columnWidth, "auto")) return "columns";
  return textSkipReason(style);
}

/** インライン要素に、背景・枠・余白（行の中で場所を取るか、文字の後ろに描かれるもの）があるかどうか。 */
function hasInlineBox(style: AutoStyle): boolean {
  if (!isTransparent(style.backgroundColor) || style.backgroundImage !== "none") return true;
  return !(
    isZeroLength(style.paddingTop) &&
    isZeroLength(style.paddingRight) &&
    isZeroLength(style.paddingBottom) &&
    isZeroLength(style.paddingLeft) &&
    isZeroLength(style.borderTopWidth) &&
    isZeroLength(style.borderRightWidth) &&
    isZeroLength(style.borderBottomWidth) &&
    isZeroLength(style.borderLeftWidth) &&
    isZeroLength(style.marginTop) &&
    isZeroLength(style.marginRight) &&
    isZeroLength(style.marginBottom) &&
    isZeroLength(style.marginLeft)
  );
}

/**
 * ブロックの中の要素のスタイルで組めない理由。組めるなら null。
 * parent はその要素がプロパティを継承する元（親要素。ブロックの直下の要素では、ブロックの中身の継承元）、block はブロック。
 * 文字色・下線・打ち消し線・太さ・スタイル（太字・斜体）は範囲として組めるので、ここでは見ない。
 */
export function inlineSkipReason(style: AutoStyle, parent: AutoStyle, block: AutoStyle): AutoSkipReason | null {
  if (style.display !== "inline" && style.display !== "contents") return "non-inline";
  if (style.position !== "static" && style.position !== "relative") return "non-inline";
  if (style.fontSize !== block.fontSize) return "font-size";
  if (style.fontFamily !== block.fontFamily) return "font-family";
  if (style.whiteSpace !== parent.whiteSpace) return "white-space";
  if (style.writingMode !== block.writingMode || differsFrom(style.textCombineUpright, "none")) return "writing-mode";
  if ((style.textOrientation ?? "") !== (block.textOrientation ?? "")) return "writing-mode";
  if (style.verticalAlign !== "baseline") return "vertical-align";
  if (hasInlineBox(style)) return "inline-box";
  if (style.visibility !== block.visibility || style.opacity !== "1") return "text-effect";
  return textSkipReason(style);
}

/** CSS の text-align を textAlign にする（左から右の書字方向の前提）。 */
export function textAlignOf(value: string): TextAlign {
  switch (value) {
    case "center":
    case "-webkit-center":
    case "-moz-center":
      return "center";
    case "right":
    case "end":
    case "-webkit-right":
    case "-moz-right":
      return "trailing";
    case "justify":
      return "justify";
    default:
      return "leading";
  }
}

/**
 * ブロックの計算済みスタイルから組版オプションを作る。lineHeight は行送り（px）。
 * ページの見た目を変えないように、和文も欧文も CSS の font-family をそのまま使い、欧文のスケールは 1 にする。
 * 欧文も和文と同じ仮想ボディに置く（同じ font-family なので、欧文フォントのメトリクスで行の位置が変わらないようにする）。
 */
export function optionsFromStyle(style: AutoStyle, lineHeight: number): StoneOptions {
  const fontSize = parseFloat(style.fontSize);
  const font: FontSpec = { family: style.fontFamily, weight: style.fontWeight, style: fontStyleOf(style.fontStyle) };
  return {
    direction: directionOf(style) ?? "lrTb",
    fontSize,
    lineHeightScale: fontSize > 0 && lineHeight > 0 ? lineHeight / fontSize : 1,
    textAlign: textAlignOf(style.textAlign),
    fonts: {
      japanese: { ...font },
      latin: { ...font, scale: 1, ascent: JAPANESE_ASCENT_RATIO, descent: JAPANESE_DESCENT_RATIO },
    },
  };
}

/** CSS から作ったオプションに、利用者の上書きを重ねる。fonts は文字種ごとに項目単位で重ねる。 */
export function mergeAutoOptions(base: StoneOptions, overrides: StoneOptions | undefined): StoneOptions {
  if (!overrides) return base;
  const fonts: NonNullable<StoneOptions["fonts"]> = { ...base.fonts };
  for (const script of SCRIPTS) {
    const override = overrides.fonts?.[script];
    if (override) fonts[script] = { ...base.fonts?.[script], ...override } as FontSpec;
  }
  return { ...base, ...overrides, fonts };
}
