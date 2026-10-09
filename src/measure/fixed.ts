/*
measure/fixed.ts — 決定的な固定メトリクスによる計測。テスト、SSR のプレースホルダ、ワーカーなど canvas のない環境用。
*/

import type { FontMeasurer, FontMetrics, ResolvedFont } from "./../types.js";
import { isJapanesePunctuationCodePoint, unicodeCategoryOf } from "./../unicode.js";

export interface FixedMeasurerOptions {
  /** 全角文字の送り幅（em）。既定 1。 */
  fullWidth?: number;
  /** 半角英数の送り幅（em）。既定 0.55。 */
  halfWidth?: number;
  /** 太字（font-weight が 600 以上か "bold" / "bolder"）の半角英数の送り幅（em）。既定 0.6。全角と空白は太字でも変えない。 */
  boldHalfWidth?: number;
  /** 空白の送り幅（em）。既定 0.3。 */
  spaceWidth?: number;
  /** 欧文フォントのアセント／ディセント（em）。既定 0.9 / 0.25。 */
  ascent?: number;
  descent?: number;
}

const FULL_WIDTH_CATEGORIES = new Set([
  "cjkRadicalsSupplement",
  "kangxiRadicals",
  "ideographicDescriptionCharacters",
  "cjkSymbolsAndPunctuation",
  "hiragana",
  "katakana",
  "bopomofo",
  "hangulCompatibilityJamo",
  "kanbun",
  "bopomofoExtended",
  "cjkStrokes",
  "katakanaPhoneticExtensions",
  "enclosedCjkLettersAndMonths",
  "cjkCompatibility",
  "cjkUnifiedIdeographsExtensionA",
  "yijingHexagramSymbols",
  "cjkUnifiedIdeographs",
  "hangulSyllables",
  "cjkCompatibilityIdeographs",
  "cjkCompatibilityIdeographsSupplement",
  "cjkUnifiedIdeographsExtensionB",
  "cjkUnifiedIdeographsExtensionC",
  "cjkUnifiedIdeographsExtensionD",
  "cjkUnifiedIdeographsExtensionE",
  "cjkUnifiedIdeographsExtensionF",
  "cjkUnifiedIdeographsExtensionG",
  "cjkUnifiedIdeographsExtensionH",
  "cjkUnifiedIdeographsExtensionI",
  "verticalForms",
  "cjkCompatibilityForms",
  "smallFormVariants",
  "miscellaneousSymbolsAndPictographs",
  "emoticons",
  "transportAndMapSymbols",
  "supplementalSymbolsAndPictographs",
  "symbolsAndPictographsExtendedA",
  "enclosedAlphanumericSupplement",
  "enclosedIdeographicSupplement",
]);

/** East Asian Width の近似。全角なら true。 */
export function isFullWidthCodePoint(cp: number): boolean {
  if (cp >= 0xff01 && cp <= 0xff60) return true; // 全角英数・記号
  if (cp >= 0xffe0 && cp <= 0xffe6) return true;
  if (cp >= 0xff61 && cp <= 0xffdc) return false; // 半角カナ・半角ハングル
  // 和文として扱う一般句読点（「—」「―」「‥」「…」「‼」「※」「†」「‰」など）。和文フォントでは全角で、「…」は欧文フォントでも
  // ほぼ 1em（切り詰めでは欧文の run のフォントで省略記号の幅を測る）
  if (isJapanesePunctuationCodePoint(cp)) return true;
  // 引用符「“」「”」「‘」「’」は半角のまま（和文フォントでもプロポーショナルな字形。縦書きで全角の字形にする和文の引用符は measureRuns が 1em にする）
  const category = unicodeCategoryOf(cp);
  return category !== null && FULL_WIDTH_CATEGORIES.has(category);
}

/** font-weight が太字（600 以上か "bold" / "bolder"）かどうか。 */
function isBoldWeight(weight: number | string): boolean {
  const s = String(weight).trim().toLowerCase();
  if (s === "bold" || s === "bolder") return true;
  const n = Number(s);
  return Number.isFinite(n) && n >= 600;
}

export class FixedMeasurer implements FontMeasurer {
  private readonly fullWidth: number;
  private readonly halfWidth: number;
  private readonly boldHalfWidth: number;
  private readonly spaceWidth: number;
  private readonly ascentRatio: number;
  private readonly descentRatio: number;

  /** 固定値の設定を受け取る。 */
  constructor(options: FixedMeasurerOptions = {}) {
    this.fullWidth = options.fullWidth ?? 1;
    this.halfWidth = options.halfWidth ?? 0.55;
    this.boldHalfWidth = options.boldHalfWidth ?? 0.6;
    this.spaceWidth = options.spaceWidth ?? 0.3;
    this.ascentRatio = options.ascent ?? 0.9;
    this.descentRatio = options.descent ?? 0.25;
  }

  /** 全角 / 半角 / 空白の固定幅を返す。太字の半角は boldHalfWidth。 */
  advance(font: ResolvedFont, size: number, char: string): number {
    const cp = char.codePointAt(0);
    if (cp === undefined) return 0;
    if (char === "\n" || char === "\r" || char === "\r\n") return 0;
    if (cp === 0x20 || cp === 0x09) return size * this.spaceWidth;
    if (cp === 0x3000) return size * this.fullWidth;
    if (isFullWidthCodePoint(cp)) return size * this.fullWidth;
    return size * (isBoldWeight(font.weight) ? this.boldHalfWidth : this.halfWidth);
  }

  /** 固定のアセント／ディセントを返す。 */
  metrics(_font: ResolvedFont, size: number): FontMetrics {
    return { ascent: size * this.ascentRatio, descent: size * this.descentRatio };
  }
}
