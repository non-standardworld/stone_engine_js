/*
engine.ts — 解析・計測・レイアウトをまとめた入口。Swift 版 STLabel の parseAndLayout / adjust / sizeThatFits に対応。
*/

import { StoneContext } from "./context.js";
import { Layouter } from "./layout.js";
import { parseText } from "./parser.js";
import type { FontMeasurer, Size, StoneOptions } from "./types.js";

export interface LayoutSize {
  /** 折り返し幅（px）。省略または Infinity で折り返しなし。 */
  width?: number;
  /** 高さ（px）。縦書きではこれが折り返しの基準になる。省略または Infinity で無制限。 */
  height?: number;
}

/** runs の送り幅を現在の adjustFontSize で計測して埋める。 */
export function measureRuns(ctx: StoneContext): void {
  const size = ctx.adjustFontSize;
  for (const run of ctx.runs) {
    run.advance = run.isNewline ? 0 : ctx.fontManager.advance(run.fontId, size, run.char);
  }
}

function layoutWithScale(ctx: StoneContext, scale: number): boolean {
  ctx.adjustFontScale = scale;
  measureRuns(ctx);
  new Layouter(ctx).layout();
  return !ctx.isTruncated;
}

/** adjustsFontSizeToFitWidth: 収まるまで二分探索でフォントを縮小する。 */
function adjust(ctx: StoneContext): void {
  if (!(ctx.minimumScaleFactor > 0)) {
    layoutWithScale(ctx, 1);
    return;
  }
  let maxScale = 1;
  if (layoutWithScale(ctx, maxScale)) return;
  let minScale = ctx.minimumScaleFactor;
  if (!layoutWithScale(ctx, minScale)) return;

  let prevScale = minScale;
  let scale = minScale + (maxScale - minScale) * 0.5;
  let isAdjusted = false;
  let guard = 0;
  while ((Math.abs(1 - prevScale / scale) > 0.05 || !isAdjusted) && guard++ < 64) {
    prevScale = scale;
    isAdjusted = layoutWithScale(ctx, scale);
    if (isAdjusted) {
      scale = scale + (maxScale - scale) * 0.5;
      minScale = prevScale;
    } else {
      scale = minScale + (scale - minScale) * 0.5;
      maxScale = prevScale;
    }
  }
  if (!isAdjusted) layoutWithScale(ctx, minScale);
}

/**
 * テキストをレイアウトする。
 * @param text 対象テキスト
 * @param options レイアウト設定
 * @param measurer フォント計測（ブラウザなら getSharedCanvasMeasurer()）
 * @param size レイアウト領域
 */
export function layoutText(
  text: string | null | undefined,
  options: StoneOptions,
  measurer: FontMeasurer,
  size: LayoutSize = {},
): StoneContext {
  const ctx = new StoneContext(options, measurer);
  ctx.renderSize = normalizeSize(size);
  const parsed = parseText(text, ctx.dividesByWords);
  ctx.runs = parsed.runs;
  ctx.tokens = parsed.tokens;
  ctx.lineCount = 0;
  ctx.adjustFontScale = 1;

  if (ctx.adjustsFontSizeToFitWidth) adjust(ctx);
  else layoutWithScale(ctx, 1);

  return ctx;
}

/** 既存のコンテキストを別のサイズでレイアウトし直す（Swift 版 layoutThatFits）。 */
export function relayout(ctx: StoneContext, size: LayoutSize): StoneContext {
  ctx.renderSize = normalizeSize(size);
  if (ctx.adjustsFontSizeToFitWidth) adjust(ctx);
  else layoutWithScale(ctx, 1);
  return ctx;
}

/** テキストが占めるサイズだけを求める（Swift 版 sizeThatFits）。 */
export function sizeThatFits(
  text: string | null | undefined,
  options: StoneOptions,
  measurer: FontMeasurer,
  size: LayoutSize = {},
): Size {
  return layoutText(text, options, measurer, size).renderedSize;
}

function normalizeSize(size: LayoutSize): Size {
  const width = size.width;
  const height = size.height;
  return {
    width: typeof width === "number" && width > 0 && Number.isFinite(width) ? width : Infinity,
    height: typeof height === "number" && height > 0 && Number.isFinite(height) ? height : Infinity,
  };
}
