/*
vanilla.ts — フレームワークを使わずに DOM 要素へ描画する API。Vue / Svelte / Astro などからも使える。
*/

import { resolveLayoutSize, StoneTextController, type SizeSpec } from "./controller.js";
import type { StoneContext } from "./context.js";
import { svgString } from "./render/svg.js";
import type { FontMeasurer, Size, StoneOptions } from "./types.js";

export interface MountOptions extends StoneOptions {
  text: string;
  /** 既定 "container"。 */
  width?: SizeSpec;
  /** 既定 "auto"。縦書きで折り返すには数値か "container"（コンテナに高さを与える）を指定する。 */
  height?: SizeSpec;
  color?: string;
  showFrames?: boolean;
  measurer?: FontMeasurer | null;
  onLayout?: (ctx: StoneContext) => void;
}

export interface StoneTextHandle {
  /** 設定を部分的に更新して再レイアウトする。 */
  update(patch: Partial<MountOptions>): void;
  /** 最新のレイアウト結果。 */
  layout(): StoneContext | null;
  destroy(): void;
}

/**
 * container の中にテキストを組んで SVG として描画する。
 * container の大きさが変わると自動的にレイアウトし直す。
 */
export function mountStoneText(container: HTMLElement, options: MountOptions): StoneTextHandle {
  let current: MountOptions = { ...options };
  let latest: StoneContext | null = null;
  let containerSize: Size | null = null;

  const controller = new StoneTextController({
    measurer: current.measurer,
    onLayout: (ctx) => {
      latest = ctx;
      container.innerHTML = svgString(ctx, { color: current.color, showFrames: current.showFrames });
      current.onLayout?.(ctx);
    },
  });

  const run = (): void => {
    const { text, width, height, color: _c, showFrames: _s, measurer: _m, onLayout: _o, ...layoutOptions } = current;
    const size = resolveLayoutSize(layoutOptions.direction ?? "lrTb", width, height, containerSize);
    if (!size) return;
    controller.update({ text, options: layoutOptions, size });
  };

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const box = entry?.contentRect;
      const next: Size = box
        ? { width: box.width, height: box.height }
        : { width: container.clientWidth, height: container.clientHeight };
      if (containerSize && containerSize.width === next.width && containerSize.height === next.height) return;
      containerSize = next;
      run();
    });
    observer.observe(container);
  }
  containerSize = { width: container.clientWidth, height: container.clientHeight };
  run();

  return {
    update(patch) {
      current = { ...current, ...patch };
      run();
    },
    layout() {
      return latest;
    },
    destroy() {
      observer?.disconnect();
      controller.dispose();
      container.innerHTML = "";
    },
  };
}
