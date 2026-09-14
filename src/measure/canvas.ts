/*
measure/canvas.ts — ブラウザの Canvas 2D measureText によるフォント計測。

グリフの送り幅とフォントメトリクスをブラウザ自身のシェーピング結果から得る。
Web フォントの読み込み前に計測した値はフォールバックフォントのものなので、
document.fonts の読み込み完了後に invalidate() してレイアウトし直すこと（React フック / mount 関数が行う）。
*/

import { cssFontString } from "./../fonts.js";
import type { FontMeasurer, FontMetrics, ResolvedFont } from "./../types.js";

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// cssFont 文字列にはタブが含まれないので、キーの区切りに使える。
const SEP = "\t";

export class CanvasMeasurer implements FontMeasurer {
  private ctx: Ctx2D | null = null;
  private advanceCache = new Map<string, number>();
  private metricsCache = new Map<string, FontMetrics>();
  private currentFont = "";

  /** canvas が使える環境かどうか。 */
  static isSupported(): boolean {
    if (typeof OffscreenCanvas !== "undefined") return true;
    return typeof document !== "undefined" && typeof document.createElement === "function";
  }

  private context(): Ctx2D | null {
    if (this.ctx) return this.ctx;
    try {
      if (typeof OffscreenCanvas !== "undefined") {
        const ctx = new OffscreenCanvas(1, 1).getContext("2d");
        if (ctx) this.ctx = ctx;
      }
      if (!this.ctx && typeof document !== "undefined") {
        const ctx = document.createElement("canvas").getContext("2d");
        if (ctx) this.ctx = ctx;
      }
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private setFont(ctx: Ctx2D, cssFont: string): void {
    if (this.currentFont !== cssFont) {
      ctx.font = cssFont;
      this.currentFont = cssFont;
    }
  }

  /** フォント読み込み後などにキャッシュを破棄する。 */
  invalidate(): void {
    this.advanceCache.clear();
    this.metricsCache.clear();
    this.currentFont = "";
  }

  advance(font: ResolvedFont, size: number, char: string): number {
    const cssFont = cssFontString(font, size);
    const key = cssFont + SEP + char;
    const cached = this.advanceCache.get(key);
    if (cached !== undefined) return cached;
    const ctx = this.context();
    let width = 0;
    if (ctx) {
      this.setFont(ctx, cssFont);
      width = ctx.measureText(char).width;
    } else {
      width = size;
    }
    this.advanceCache.set(key, width);
    return width;
  }

  metrics(font: ResolvedFont, size: number): FontMetrics {
    const cssFont = cssFontString(font, size);
    const cached = this.metricsCache.get(cssFont);
    if (cached) return cached;
    const ctx = this.context();
    let metrics: FontMetrics = { ascent: size * 0.9, descent: size * 0.25 };
    if (ctx) {
      this.setFont(ctx, cssFont);
      const m = ctx.measureText("Hg国") as TextMetrics & {
        fontBoundingBoxAscent?: number;
        fontBoundingBoxDescent?: number;
      };
      const ascent = m.fontBoundingBoxAscent;
      const descent = m.fontBoundingBoxDescent;
      if (typeof ascent === "number" && typeof descent === "number" && ascent + descent > 0) {
        metrics = { ascent, descent };
      } else if (typeof m.actualBoundingBoxAscent === "number") {
        metrics = { ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
      }
    }
    this.metricsCache.set(cssFont, metrics);
    return metrics;
  }
}

let shared: CanvasMeasurer | null = null;

/** ブラウザ用の共有 CanvasMeasurer。canvas のない環境（SSR）では null。 */
export function getSharedCanvasMeasurer(): CanvasMeasurer | null {
  if (!CanvasMeasurer.isSupported()) return null;
  if (!shared) shared = new CanvasMeasurer();
  return shared;
}
