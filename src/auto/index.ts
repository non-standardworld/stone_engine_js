/*
auto/index.ts — 読み込むだけでオートモードを始める入口。

  import "@non-standardworld/stone-engine.js/auto";

data-stone 属性を付けた要素の中の段落や見出しを、CSS で決まった見た目のまま組む（auto/auto.ts）。
範囲や対象、組版オプションを指定したいときは、この入口の代わりに autoStone() を使う。
このモジュールは読み込むこと自体に意味がある（副作用を持つ）ので、package.json の sideEffects に入れてある。
*/

import { autoStone, type AutoStoneHandle } from "./auto.js";

/**
 * 読み込みで始めたオートモード。CSS だけを変えたとき（クラスの切り替えなど）は autoStoneHandle?.refresh() を呼ぶ。
 * ブラウザ以外（SSR）と、DOM の準備ができる前は null。
 */
export let autoStoneHandle: AutoStoneHandle | null = null;

/** オートモードを始める。 */
function start(): void {
  autoStoneHandle = autoStone();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
