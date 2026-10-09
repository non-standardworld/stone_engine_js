/*
vanilla.ts — フレームワークを使わずに DOM 要素へ描画する API。Vue / Svelte / Astro などからも使える。
*/

import { resolveLayoutSize, StoneTextController, type SizeSpec } from "./controller.js";
import type { StoneContext } from "./context.js";
import { handleStoneCopy } from "./render/copy.js";
import { svgString } from "./render/svg.js";
import type { StoneSpan } from "./render/spans.js";
import type { VerticalFormsOption } from "./render/vertical.js";
import type { FontMeasurer, Size, StoneOptions } from "./types.js";

export interface MountOptions extends StoneOptions {
  text: string;
  /** 既定: 横書きは "container"、縦書きは "auto"。 */
  width?: SizeSpec;
  /** 既定 "auto"。縦書きで折り返すには数値か "container"（コンテナに高さを与える）を指定する。 */
  height?: SizeSpec;
  color?: string;
  showFrames?: boolean;
  /** 縦書きの和文の縦組み用グリフの描き方。既定 "auto"（vert が効かない Safari などの WebKit では回転と移動で代用する）。 */
  verticalForms?: VerticalFormsOption;
  /**
   * リンク・文字色・線・太さ・スタイルを付ける範囲（text の位置で指定する）。HTML から作るときは readStoneSource(element) で
   * テキストと一緒に読み取れる。太さ・スタイル（fontWeight / fontStyle）の範囲は、そのフォントで送り幅を測って組む。
   */
  spans?: readonly StoneSpan[];
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
 * container の中だけを選択してコピーしたときは、改行や空白を含む元のテキストがクリップボードに入る。
 */
export function mountStoneText(container: HTMLElement, options: MountOptions): StoneTextHandle {
  let current: MountOptions = { ...options };
  let latest: StoneContext | null = null;
  let containerSize: Size | null = null;

  const onCopy = (event: ClipboardEvent): void => {
    if (latest && !event.defaultPrevented) handleStoneCopy(event, latest, container);
  };
  container.addEventListener("copy", onCopy);

  const controller = new StoneTextController({
    measurer: current.measurer,
    onLayout: (ctx) => {
      latest = ctx;
      container.innerHTML = svgString(ctx, {
        color: current.color,
        showFrames: current.showFrames,
        verticalForms: current.verticalForms,
        spans: current.spans,
      });
      current.onLayout?.(ctx);
    },
  });

  const run = (): void => {
    const {
      text,
      width,
      height,
      color: _c,
      showFrames: _s,
      verticalForms: _v,
      spans,
      measurer: _m,
      onLayout: _o,
      ...layoutOptions
    } = current;
    const size = resolveLayoutSize(layoutOptions.direction ?? "lrTb", width, height, containerSize);
    if (!size) return;
    controller.update({ text, options: layoutOptions, size, spans });
  };

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    // 初回と同じ基準（clientWidth / clientHeight）で計測する
    observer = new ResizeObserver(() => {
      const next: Size = { width: container.clientWidth, height: container.clientHeight };
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
      container.removeEventListener("copy", onCopy);
      container.innerHTML = "";
    },
  };
}
