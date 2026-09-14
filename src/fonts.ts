/*
fonts.ts — 文字種ごとのフォント解決とメトリクス取得。Swift 版 STFontManager.swift に対応。

Swift 版はフォント名のリストから「そのグリフを持つ最初のフォント」を選んでいたが、
ブラウザでは CSS の font-family リストがグリフ単位のフォールバックを担うため、
ここでは文字種（Script）ごとに 1 つのフォントスタックを持ち、fontId = 文字種の添字とする。
*/

import { SCRIPTS } from "./types.js";
import type { FontMeasurer, FontMetrics, FontSpec, ResolvedFont, Script, StoneOptions } from "./types.js";
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

/** CSS の font ショートハンド文字列（canvas の ctx.font や document.fonts.load 用）。 */
export function cssFontString(font: ResolvedFont, size: number): string {
  return `${font.style} ${font.weight} ${size}px ${font.family}`;
}

/**
 * フォントマネージャ。フォント ID からフォント・スケール・メトリクスを引く。
 * size にはレイアウト時のフォントサイズ（adjustFontSize）を渡す。文字種スケールは内部で掛ける。
 */
export class FontManager {
  constructor(
    public readonly fonts: ResolvedFont[],
    public readonly measurer: FontMeasurer,
  ) {}

  font(fontId: number): ResolvedFont {
    return this.fonts[fontId] ?? this.fonts[0];
  }

  script(fontId: number): Script {
    return this.font(fontId).script;
  }

  fontScale(fontId: number): number {
    return this.font(fontId).scale;
  }

  /** 文字種スケール適用後の実サイズ（px）。 */
  scaledSize(fontId: number, size: number): number {
    return size * this.fontScale(fontId);
  }

  advance(fontId: number, size: number, char: string): number {
    const font = this.font(fontId);
    return this.measurer.advance(font, this.scaledSize(fontId, size), char);
  }

  metrics(fontId: number, size: number): FontMetrics {
    const font = this.font(fontId);
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

  ascent(fontId: number, size: number): number {
    return this.metrics(fontId, size).ascent;
  }

  descent(fontId: number, size: number): number {
    return this.metrics(fontId, size).descent;
  }

  cssFont(fontId: number, size: number): string {
    return cssFontString(this.font(fontId), this.scaledSize(fontId, size));
  }
}
