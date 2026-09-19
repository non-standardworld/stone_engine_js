/*
controller.ts — ブラウザでテキストをレイアウトし続けるための小さなコントローラ（フレームワーク非依存）。

- レイアウトは同期的に行う（フォールバックフォントのメトリクスでもまず描く）。
- Web フォントが未読み込みなら document.fonts.load() で読み込み、完了後に計測キャッシュを捨ててレイアウトし直す。
- 以後もフォントの読み込み完了（loadingdone）を監視してレイアウトし直す。
React フックと mountStoneText() の両方がこれを使う。
*/

import type { StoneContext } from "./context.js";
import { layoutText, type LayoutSize } from "./engine.js";
import { cssFontString } from "./fonts.js";
import { getSharedCanvasMeasurer } from "./measure/canvas.js";
import type { Direction, FontMeasurer, Size, StoneOptions } from "./types.js";

/** サイズ指定。number は px、"auto" は制限なし、"container" はコンテナ要素の大きさ。 */
export type SizeSpec = number | "auto" | "container";

export interface ControllerInput {
  text: string;
  options: StoneOptions;
  size: LayoutSize;
}

export interface ControllerOptions {
  /** 省略時はブラウザ用の共有 CanvasMeasurer。SSR など canvas が無い環境では null になりレイアウトは行われない。 */
  measurer?: FontMeasurer | null;
  onLayout: (ctx: StoneContext) => void;
}

/**
 * レイアウト領域を決める。"container" が必要なのにまだ計測できていなければ null。
 * 既定値: 横書きは幅 "container"・高さ "auto"、縦書きは幅 "auto"・高さ "auto"。
 * 縦書きで折り返したいときは高さを指定する。幅は内容に合わせて左に伸びる。
 */
export function resolveLayoutSize(
  direction: Direction,
  width: SizeSpec | undefined,
  height: SizeSpec | undefined,
  container: Size | null,
): LayoutSize | null {
  const w = width ?? (direction === "tbRl" ? "auto" : "container");
  const h = height ?? "auto";
  const resolve = (spec: SizeSpec, measured: number | null): number | undefined | typeof PENDING => {
    if (spec === "auto") return undefined;
    if (typeof spec === "number") return spec > 0 && Number.isFinite(spec) ? spec : undefined;
    if (measured === null) return PENDING;
    return measured > 0 ? measured : undefined;
  };
  const rw = resolve(w, container ? container.width : null);
  const rh = resolve(h, container ? container.height : null);
  if (rw === PENDING || rh === PENDING) return null;
  return { width: rw, height: rh };
}

const PENDING = Symbol("pending");

export class StoneTextController {
  private readonly measurer: FontMeasurer | null;
  private readonly onLayout: (ctx: StoneContext) => void;
  private input: ControllerInput | null = null;
  private pendingKey: string | null = null;
  private disposed = false;
  private readonly fontsListener: (() => void) | null = null;

  /** 計測器を決め、ブラウザならフォント読み込み完了イベントの監視を始める。 */
  constructor(options: ControllerOptions) {
    this.measurer = options.measurer === undefined ? getSharedCanvasMeasurer() : options.measurer;
    this.onLayout = options.onLayout;
    if (this.measurer && typeof document !== "undefined" && document.fonts?.addEventListener) {
      this.fontsListener = () => {
        this.invalidate();
        this.relayout();
      };
      document.fonts.addEventListener("loadingdone", this.fontsListener);
    }
  }

  /** レイアウトできる環境かどうか。 */
  get isAvailable(): boolean {
    return this.measurer !== null;
  }

  /** 入力を更新して同期的にレイアウトし、必要なら Web フォントの読み込みを開始する。 */
  update(input: ControllerInput): StoneContext | null {
    this.input = input;
    const ctx = this.relayout();
    if (ctx) this.ensureFonts(ctx, input.text);
    return ctx;
  }

  /** 現在の入力でレイアウトし、結果を onLayout に渡す。 */
  private relayout(): StoneContext | null {
    if (this.disposed || !this.measurer || !this.input) return null;
    const { text, options, size } = this.input;
    const ctx = layoutText(text, options, this.measurer, size);
    this.onLayout(ctx);
    return ctx;
  }

  /** 計測器のキャッシュを破棄する（CanvasMeasurer の場合）。 */
  private invalidate(): void {
    const m = this.measurer as { invalidate?: () => void } | null;
    m?.invalidate?.();
  }

  /** 未読み込みの Web フォントがあれば読み込み、完了後にレイアウトし直す。 */
  private ensureFonts(ctx: StoneContext, text: string): void {
    if (typeof document === "undefined" || !document.fonts?.load) return;
    const specs = new Set<string>();
    for (const font of ctx.fonts) specs.add(cssFontString(font, 16));
    const sample = text.length > 0 ? text : "あ";
    const needed: string[] = [];
    for (const spec of specs) {
      try {
        if (!document.fonts.check(spec, sample)) needed.push(spec);
      } catch {
        // 不正なフォント指定は無視する
      }
    }
    if (needed.length === 0) return;
    const key = needed.join("|") + "\n" + sample;
    if (this.pendingKey === key) return;
    this.pendingKey = key;
    Promise.all(needed.map((spec) => document.fonts.load(spec, sample)))
      .catch(() => undefined)
      .then(() => {
        if (this.disposed) return;
        if (this.pendingKey === key) this.pendingKey = null;
        this.invalidate();
        this.relayout();
      });
  }

  /** イベント監視を解除し、以後のレイアウトを止める。 */
  dispose(): void {
    this.disposed = true;
    if (this.fontsListener && typeof document !== "undefined" && document.fonts?.removeEventListener) {
      document.fonts.removeEventListener("loadingdone", this.fontsListener);
    }
  }
}
