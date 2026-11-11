/*
auto/style.ts — CSS の計算済みスタイルから、組めるかどうかの判定と組版オプションを決める（DOM に依存しない）。

オートモードは「CSS で決まった見た目のまま組む」ので、エンジンが再現できない CSS が効いている要素は、組まずに元の表示のまま残す。
見た目が変わるくらいなら何もしない、を既定にする。見送った理由は AutoSkipReason で分かる。
*/

import { JAPANESE_ASCENT_RATIO, JAPANESE_DESCENT_RATIO } from "../fonts.js";
import { fontStyleOf } from "../render/spans.js";
import { SCRIPTS, type Direction, type FontSpec, type Script, type StoneOptions, type TextAlign } from "../types.js";
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
  /** ブロックと字間の違うインライン要素。px にならない letter-spacing（パーセントなど）。 */
  | "letter-spacing"
  | "word-spacing"
  /** px にならない text-indent（パーセントなど）と、text-indent の hanging。 */
  | "text-indent"
  | "text-transform"
  /** font-feature-settings、font-variant-east-asian、font-stretch、font-variation-settings。 */
  | "font-feature"
  /** word-break: keep-all。 */
  | "word-break"
  /** text-shadow、圏点、-webkit-text-fill-color、文字の縁取り、透明度など。 */
  | "text-effect"
  /** 線の種類（点線・波線・二重線）、太さ、下線の位置の指定（text-decoration-style / -thickness、text-underline-offset）と、上線。 */
  | "text-decoration"
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
  textDecorationLine?: string;
  textDecorationStyle?: string;
  textDecorationThickness?: string;
  textUnderlineOffset?: string;
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

/** px の長さの計算値（"2.04px"、"-17px"）。 */
const PX_LENGTH_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?px$/i;

/** 計算値が px の長さなら、その数値。それ以外（パーセント、calc() など）は null。 */
function pxLengthOf(value: string): number | null {
  if (!PX_LENGTH_RE.test(value)) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * CSS の letter-spacing の計算値を字間（px）にする。normal（か、値のない未対応のブラウザ）は 0。
 * px にならない値（パーセントなど）は、エンジンに渡せないので null。
 */
export function letterSpacingOf(style: Pick<AutoStyle, "letterSpacing">): number | null {
  const value = (style.letterSpacing ?? "").trim();
  if (value === "" || value === "normal") return 0;
  return pxLengthOf(value);
}

/** CSS の text-indent から決まる字下げ。 */
export interface AutoTextIndent {
  /** 字下げ（px）。 */
  length: number;
  /** 強制改行（<br> など）の直後の行にも入れるかどうか（text-indent の each-line）。 */
  eachLine: boolean;
}

/**
 * CSS の text-indent の計算値を字下げにする。値がなければ 0。
 * px にならない値（パーセントは幅が変わるたびに変わる）と、1 行目以外を下げる hanging は、エンジンに渡せないので null。
 */
export function textIndentOf(style: Pick<AutoStyle, "textIndent">): AutoTextIndent | null {
  const [first = "", ...keywords] = (style.textIndent ?? "").trim().split(/\s+/);
  if (first === "") return { length: 0, eachLine: false };
  const length = pxLengthOf(first);
  if (length === null || keywords.some((keyword) => keyword !== "each-line")) return null;
  return { length, eachLine: keywords.length > 0 };
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

/**
 * その要素が引いている線（下線・打ち消し線）のうち、エンジンが描けない指定があれば、その理由。
 * エンジンは実線を、自分で決めた太さと位置に描く（render/spans.ts の decorationRects）。線の種類（点線・波線・二重線）、
 * 太さ、下線の位置を指定している線は、組むと見た目が変わるので組まない。上線も描けない。線を引いていない要素では見ない。
 */
function decorationSkipReason(style: AutoStyle): AutoSkipReason | null {
  const line = style.textDecorationLine;
  if (line === undefined || line === "" || line === "none") return null;
  const lines = line.split(/\s+/);
  if (lines.some((name) => name !== "underline" && name !== "line-through")) return "text-decoration";
  if (differsFrom(style.textDecorationStyle, "solid")) return "text-decoration";
  if (differsFrom(style.textDecorationThickness, "auto")) return "text-decoration";
  if (lines.includes("underline") && differsFrom(style.textUnderlineOffset, "auto")) return "text-decoration";
  return null;
}

/**
 * エンジンが再現できない文字まわりの CSS が効いていれば、その理由。ブロックにもインライン要素にも使う。
 * block は、style がインライン要素のものなら、その要素のあるブロックのスタイル。style がブロック自身のものなら null。
 * 字間（letter-spacing）と 1 行目の字下げ（text-indent）は、ブロックの値を組版オプションにして組む（optionsFromStyle）。
 */
function textSkipReason(style: AutoStyle, block: AutoStyle | null): AutoSkipReason | null {
  // 字間はブロックの値 1 つで組むので、インライン要素だけ字間が違うものは組めない
  const letterSpacing = letterSpacingOf(style);
  if (letterSpacing === null || (block !== null && letterSpacing !== letterSpacingOf(block))) return "letter-spacing";
  if (!isZeroLength(style.wordSpacing)) return "word-spacing";
  // 字下げはブロックの 1 行目に入るもので、インライン要素の値は効かない
  if (block === null && textIndentOf(style) === null) return "text-indent";
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
  return decorationSkipReason(style);
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
  return textSkipReason(style, null);
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
 * parent は親の要素（ブロックの直下の要素では、ブロック自身）、block はブロック。
 * 文字色、太さ・スタイル（太字・斜体）、実線の下線・打ち消し線は、範囲として組めるので見送らない。
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
  return textSkipReason(style, block);
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
 * 字間（letter-spacing）と 1 行目の字下げ（text-indent）は、px の計算値をそのまま渡す。CSS の text-indent は、each-line を
 * 付けない限りブロックの最初の行だけに入り、<br> の後ろの行には入らないので、textIndentEachLine もそれに合わせる。
 */
export function optionsFromStyle(style: AutoStyle, lineHeight: number): StoneOptions {
  const fontSize = parseFloat(style.fontSize);
  const font: FontSpec = { family: style.fontFamily, weight: style.fontWeight, style: fontStyleOf(style.fontStyle) };
  const indent = textIndentOf(style);
  return {
    direction: directionOf(style) ?? "lrTb",
    fontSize,
    lineHeightScale: fontSize > 0 && lineHeight > 0 ? lineHeight / fontSize : 1,
    textAlign: textAlignOf(style.textAlign),
    letterSpacing: letterSpacingOf(style) ?? 0,
    textIndent: indent?.length ?? 0,
    textIndentEachLine: indent?.eachLine ?? false,
    fonts: {
      japanese: { ...font },
      latin: { ...font, scale: 1, ascent: JAPANESE_ASCENT_RATIO, descent: JAPANESE_DESCENT_RATIO },
    },
  };
}

/**
 * CSS から決めた設定に重ねる組版オプション。
 * fonts は文字種ごとに項目単位で重ねるので、scale だけのように一部の項目だけを指定できる（family を省くと、CSS の font-family のまま）。
 * direction は CSS の writing-mode で決まるので、指定できない。
 */
export type AutoStoneOverrides = Omit<StoneOptions, "direction" | "fonts"> & {
  fonts?: Partial<Record<Script, Partial<FontSpec>>>;
};

/** CSS から作ったオプションに、利用者の上書きを重ねる。fonts は文字種ごとに項目単位で重ねる。 */
export function mergeAutoOptions(base: StoneOptions, overrides: AutoStoneOverrides | undefined): StoneOptions {
  if (!overrides) return base;
  const fonts: NonNullable<StoneOptions["fonts"]> = { ...base.fonts };
  for (const script of SCRIPTS) {
    const override = overrides.fonts?.[script];
    if (override) fonts[script] = { ...base.fonts?.[script], ...override } as FontSpec;
  }
  return { ...base, ...overrides, fonts };
}
