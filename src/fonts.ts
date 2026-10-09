/*
fonts.ts — 文字種ごとのフォント解決とメトリクス取得。Swift 版 STFontManager.swift に対応。

Swift 版はフォント名のリストから「そのグリフを持つ最初のフォント」を選んでいたが、
ブラウザでは CSS の font-family リストがグリフ単位のフォールバックを担うため、
ここでは文字種（Script）ごとに 1 つのフォントスタックを持ち、fontId = 文字種の添字とする。
<strong> などで太さ・スタイルを変えた文字は、文字種のフォントの太さ・スタイルだけを変えた変種で組む。変種は 3 文字種ぶんを
まとめて作り、フォント ID は「変種の番号 × SCRIPTS.length + 文字種の添字」にする（通常のフォントは変種 0）。
*/

import { SCRIPTS } from "./types.js";
import type { FontMeasurer, FontMetrics, FontSpec, FontStyle, ResolvedFont, Script, StoneOptions } from "./types.js";
import { scriptOfChar } from "./unicode.js";

/** 既定のフォント。Swift 版の HelveticaNeue / HiraginoSans-W3 / AppleColorEmoji に相当する Web 向けスタック。 */
export const DEFAULT_FONTS: Record<Script, FontSpec> = {
  latin: {
    family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    scale: 0.95,
  },
  japanese: {
    family:
      '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", YuGothic, Meiryo, sans-serif',
    scale: 1,
  },
  emoji: {
    family: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
    scale: 1,
  },
};

/** 和文フォントの仮想ボディ。ベースラインから上 0.88em、下 0.12em に置く（主要な和文フォントの設計値）。 */
export const JAPANESE_ASCENT_RATIO = 0.88;
export const JAPANESE_DESCENT_RATIO = 0.12;

/** オプションのフォント指定を SCRIPTS 順の ResolvedFont 配列に解決する。 */
export function resolveFonts(fonts?: StoneOptions["fonts"]): ResolvedFont[] {
  return SCRIPTS.map((script, id) => {
    const base = DEFAULT_FONTS[script];
    const spec = fonts?.[script];
    const family = spec?.family?.trim() ? spec.family : base.family;
    const resolved: ResolvedFont = {
      id,
      script,
      family,
      scale: spec?.scale ?? base.scale ?? 1,
      weight: spec?.weight ?? base.weight ?? "normal",
      style: spec?.style ?? base.style ?? "normal",
    };
    const ascent = spec?.ascent ?? base.ascent ?? (script === "japanese" ? JAPANESE_ASCENT_RATIO : undefined);
    const descent = spec?.descent ?? base.descent ?? (script === "japanese" ? JAPANESE_DESCENT_RATIO : undefined);
    if (ascent !== undefined) resolved.ascent = ascent;
    if (descent !== undefined) resolved.descent = descent;
    return resolved;
  });
}

/** 文字に使うフォント ID。文字種が判定できない場合は 0（latin）を使う（Swift 版と同じ）。 */
export function fontIdForChar(char: string): number {
  const script = scriptOfChar(char);
  if (script === null) return 0;
  const id = SCRIPTS.indexOf(script);
  return id < 0 ? 0 : id;
}

/** フォント ID の文字種の添字（SCRIPTS の添字）。変種（太字・斜体）のフォント ID でも、その文字種の添字を返す。 */
export function scriptIndexOfFontId(fontId: number): number {
  return fontId >= 0 ? fontId % SCRIPTS.length : 0;
}

/** フォント ID の文字種。 */
export function scriptOfFontId(fontId: number): Script {
  return SCRIPTS[scriptIndexOfFontId(fontId)];
}

/** fontId と同じ変種（太さ・スタイル）のまま、文字種を script にしたフォント ID。 */
export function fontIdWithScript(fontId: number, script: Script): number {
  return fontId - scriptIndexOfFontId(fontId) + SCRIPTS.indexOf(script);
}

/** font-weight を比べられる形にそろえる（"normal" は "400"、"bold" は "700"、数値は文字列）。 */
function weightKey(weight: number | string): string {
  const s = String(weight).trim().toLowerCase();
  if (s === "normal") return "400";
  if (s === "bold") return "700";
  return s;
}

/** CSS の font ショートハンド文字列（canvas の ctx.font や document.fonts.load 用）。 */
export function cssFontString(font: ResolvedFont, size: number): string {
  return `${font.style} ${font.weight} ${size}px ${font.family}`;
}

/**
 * フォントマネージャ。フォント ID からフォント・スケール・メトリクスを引く。
 * size にはレイアウト時のフォントサイズ（adjustFontSize）を渡す。文字種スケールは内部で掛ける。
 * 変種（variantFontId）は fonts の末尾に追加していく。
 */
export class FontManager {
  /** 太さ・スタイルの組から変種の番号へ。 */
  private readonly variants = new Map<string, number>();

  /** フォント一覧と計測器を持つ。 */
  constructor(
    public readonly fonts: ResolvedFont[],
    public readonly measurer: FontMeasurer,
  ) {}

  /** フォント ID のフォント。範囲外なら latin。 */
  font(fontId: number): ResolvedFont {
    return this.fonts[fontId] ?? this.fonts[0];
  }

  /**
   * fontId の文字種で、通常のフォントの太さを weight、スタイルを style に変えた変種のフォント ID（省略したほうは通常のまま）。
   * 初めての組なら 3 文字種ぶんの変種を fonts に追加する。どの文字種でも通常のフォントと同じになるなら通常のフォント ID を返す。
   */
  variantFontId(fontId: number, weight?: number | string, style?: FontStyle): number {
    const scriptIndex = scriptIndexOfFontId(fontId);
    const key = `${weight === undefined ? "" : weightKey(weight)}\t${style ?? ""}`;
    let variant = this.variants.get(key);
    if (variant === undefined) {
      variant = this.addVariant(weight, style);
      this.variants.set(key, variant);
    }
    return variant * SCRIPTS.length + scriptIndex;
  }

  /** 3 文字種ぶんの変種を fonts に追加して、その番号を返す。どの文字種でも通常のフォントと同じなら追加せずに 0 を返す。 */
  private addVariant(weight: number | string | undefined, style: FontStyle | undefined): number {
    const bases = SCRIPTS.map((_, i) => this.font(i));
    const fonts = bases.map((base) => ({ ...base, weight: weight ?? base.weight, style: style ?? base.style }));
    const same = fonts.every((font, i) => weightKey(font.weight) === weightKey(bases[i].weight) && font.style === bases[i].style);
    if (same) return 0;
    const variant = Math.ceil(this.fonts.length / SCRIPTS.length);
    fonts.forEach((font, i) => {
      font.id = variant * SCRIPTS.length + i;
      this.fonts[font.id] = font;
    });
    return variant;
  }

  /** フォント ID の文字種。 */
  script(fontId: number): Script {
    return this.font(fontId).script;
  }

  /** フォント ID の文字種スケール。 */
  fontScale(fontId: number): number {
    return this.font(fontId).scale;
  }

  /** 文字種スケール適用後の実サイズ（px）。 */
  scaledSize(fontId: number, size: number): number {
    return size * this.fontScale(fontId);
  }

  /** 文字の送り幅（px、文字種スケール適用後）。 */
  advance(fontId: number, size: number, char: string): number {
    const font = this.font(fontId);
    return this.measurer.advance(font, this.scaledSize(fontId, size), char);
  }

  /**
   * アセント／ディセント（px）。指定があれば比率、無ければ計測値を使う。
   * 変種（太字・斜体）は通常のフォントのメトリクスを使い、太さが変わってもベースラインの位置を変えない。
   */
  metrics(fontId: number, size: number): FontMetrics {
    const font = this.font(scriptIndexOfFontId(fontId));
    const scaled = this.scaledSize(fontId, size);
    if (font.ascent !== undefined && font.descent !== undefined) {
      return { ascent: scaled * font.ascent, descent: scaled * font.descent };
    }
    const measured = this.measurer.metrics(font, scaled);
    return {
      ascent: font.ascent !== undefined ? scaled * font.ascent : measured.ascent,
      descent: font.descent !== undefined ? scaled * font.descent : measured.descent,
    };
  }

  /** アセント（px）。 */
  ascent(fontId: number, size: number): number {
    return this.metrics(fontId, size).ascent;
  }

  /** ディセント（px）。 */
  descent(fontId: number, size: number): number {
    return this.metrics(fontId, size).descent;
  }

  /** canvas 用の CSS font 文字列。 */
  cssFont(fontId: number, size: number): string {
    return cssFontString(this.font(fontId), this.scaledSize(fontId, size));
  }
}
