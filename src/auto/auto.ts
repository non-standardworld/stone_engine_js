/*
auto/auto.ts — オートモード。ページの中の段落や見出しを探して、CSS で決まった見た目のまま自動で組む（ブラウザ専用、試験的）。

使い方は 2 通り:
- import "@non-standardworld/stone-engine.js/auto" … 読み込むだけで、data-stone 属性を付けた範囲の中を組む（auto/index.ts）
- autoStone({ ... }) … 範囲や対象、組版オプションを指定して始める

仕組み:
- 対象の要素（既定は p / h1〜h6 / blockquote）に Shadow DOM を付け、その中に組版結果の SVG を描く。元の DOM（子ノード）には触らない。
  元の中身は <slot> で、視覚的に隠した要素の中に表示したままにする（スクリーンリーダー・検索エンジン・リンクのキーボード操作のため）。
  サイトの CSS のセレクターは元の DOM にそのまま当たり、React などが中身を書き換えても壊れない。Shadow DOM は外せないので、
  やめるときは中身を <slot> でそのまま表示する状態に戻す。
- 設定は CSS の計算値から決める（auto/style.ts）。フォント・サイズ・行送り・行揃え・縦書き。
- エンジンが再現できないもの（ルビ、画像、文字サイズやフォントの違うインライン要素、letter-spacing など）を含む要素は、
  何もせずに元の表示のまま残す（見た目が変わるくらいなら何もしない）。
- CSS の行の高さとベースラインを測り、SVG の文字が元のテキストと同じ位置に来るように置く。ブロックの高さは「行数 × 行送り」で
  CSS と同じになるので、組んでも前後の要素の位置は（行数が変わらない限り）動かない。
- 要素の幅が内容で決まる場合（フレックスの子、inline-block の中など）のために、テキストを折り返さずに組んだ長さを intrinsic な
  大きさとして置く（ghost）。SVG 自体は絶対配置にして、要素の最小幅を押し広げないようにする。
- 幅の変化は ResizeObserver、DOM の追加・変更は MutationObserver、Web フォントの読み込みは document.fonts で追いかける。
  画面から遠い要素は IntersectionObserver で、近づいてから組む。
- SVG のリンクのクリックは、元の <a> のクリックにする（ルーターのリンクもそのまま動く）。キーボードのフォーカスは元の <a> が受け、
  SVG に枠を描く。選択をコピーしたときは、元のテキスト（複数の要素にまたがる選択では、組んでいないときと同じ HTML も）を
  クリップボードに入れる。

レイアウトの読み書きはまとめて行う（読み取り → 書き込みの順にそろえ、要素ごとの強制レイアウトを避ける）。
*/

import type { StoneContext } from "../context.js";
import { layoutText, type LayoutSize } from "../engine.js";
import { getSharedCanvasMeasurer } from "../measure/canvas.js";
import { runRangeOfSelection, textOfRunRange } from "../render/copy.js";
import { columnLeft, spanRects } from "../render/spans.js";
import { svgSize, svgString } from "../render/svg.js";
import type { Direction, FontMeasurer, StoneOptions } from "../types.js";
import { readAutoSource, type AutoSource } from "./source.js";
import { blockSkipReason, directionOf, mergeAutoOptions, optionsFromStyle, type AutoSkipReason } from "./style.js";
import { whiteSpaceModeOf, wrapsLines } from "./whitespace.js";

/** 既定の範囲。data-stone 属性を付けた要素の中を組む。 */
export const DEFAULT_AUTO_SCOPE = "[data-stone]";

/** 既定の対象。Shadow DOM を付けられる、文章のブロック。 */
export const DEFAULT_AUTO_TARGETS = "p, h1, h2, h3, h4, h5, h6, blockquote";

export interface AutoStoneOptions {
  /** 探す場所。既定は document。 */
  root?: Document | Element;
  /**
   * 自動で組む範囲を示すセレクター。既定 "[data-stone]"。範囲の中でも、data-stone="off" を付けた要素の中は組まない
   * （その中で data-stone を付け直せば、また組む）。
   */
  scope?: string;
  /** 範囲の中で組む要素のセレクター。既定 DEFAULT_AUTO_TARGETS。範囲の要素自身も、直下にテキストがあれば組む。 */
  targets?: string;
  /** CSS から決めた設定に重ねる組版オプション（約物の扱い、禁則、欧文のスケールなど）。direction は CSS のものを使う。 */
  options?: StoneOptions;
  /** 画面に近い要素から組み、遠い要素は近づいてから組む。既定 true。 */
  lazy?: boolean;
  /** DOM の追加・変更を監視して、組み直す。既定 true。 */
  observe?: boolean;
  /**
   * 組んだ要素に data-stone-state="typeset"、見送った要素に data-stone-state="skipped" と data-stone-reason を付ける。
   * 既定は <html> に data-stone-debug 属性があるときだけ。
   */
  debug?: boolean;
  /** フォント計測。省略時はブラウザ用の共有 CanvasMeasurer。 */
  measurer?: FontMeasurer | null;
}

/** 要素の状態。typeset: 組んだ、waiting: 大きさが分かるのを待っている、queued: 画面に近づくのを待っている、skipped: 見送った。 */
export type AutoStoneState = "typeset" | "waiting" | "queued" | "skipped";

export interface AutoStoneReport {
  element: Element;
  state: AutoStoneState;
  /** 見送った理由（state が "skipped" のとき）。 */
  reason?: AutoSkipReason;
}

export interface AutoStoneHandle {
  /** 範囲を探し直し、すべての要素の CSS と中身を読み直す。CSS だけを変えたとき（クラスの切り替えなど）に呼ぶ。 */
  refresh(): void;
  /** 見つけた要素と、その状態。 */
  report(): AutoStoneReport[];
  /** 監視をやめ、組んだ要素を元の表示に戻す。 */
  destroy(): void;
}

const SCOPE_ATTRIBUTE = "data-stone";
const STATE_ATTRIBUTE = "data-stone-state";
const REASON_ATTRIBUTE = "data-stone-reason";
const DEBUG_ATTRIBUTE = "data-stone-debug";

/** data-stone の値のうち、「ここは組まない」を表すもの。 */
const OFF_VALUES: ReadonlySet<string> = new Set(["off", "false", "none"]);

/** attachShadow できる要素（HTML の仕様で決まっている。ほかにカスタム要素）。 */
const SHADOW_HOSTS: ReadonlySet<string> = new Set([
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BODY",
  "DIV",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "MAIN",
  "NAV",
  "P",
  "SECTION",
  "SPAN",
]);

const XHTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";

/** 元の中身をそのまま表示する（組む前と、やめた後）。 */
const SOURCE_VISIBLE = "display:contents";

/** 元の中身を視覚的に隠す（スクリーンリーダーには読ませる）。SVG のテキストと二重に選択されないよう、選択の対象から外す。 */
const SOURCE_HIDDEN =
  "position:absolute;inline-size:1px;block-size:1px;margin:-1px;padding:0;border:0;overflow:hidden;" +
  "clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;user-select:none;-webkit-user-select:none";

/**
 * 高さ 0 のブロック。行方向の長さ（横書きなら幅）を測るために置く。
 * reference は中身の前に置き、フロートを避けない幅と、中身の始まりの位置を測る。sizer は view の中に置き、フロートを避けた幅を測る。
 */
const SIZER_STYLE = "display:block;block-size:0";

/** 組版結果を置くブロック。フロートを避けるように flow-root にする（回り込みは組めないので、避けた幅との差で見つける）。 */
const VIEW_STYLE = "display:flow-root;position:relative";

/**
 * テキストの intrinsic な大きさの代わり。置換要素にパーセントの max-inline-size を付けると、min-content には寄与せず、
 * max-content には inline-size が寄与する（img { max-width: 100% } と同じ）。幅が内容で決まる要素が、テキストのときと同じ幅になる。
 */
const GHOST_STYLE =
  "display:block;block-size:0;inline-size:0;max-inline-size:100%;visibility:hidden;pointer-events:none";

/** 1 行ぶんの見えないテキスト。行の高さとベースラインを測る。 */
const PROBE_STYLE =
  "position:absolute;inset-block-start:0;inset-inline-start:0;visibility:hidden;white-space:nowrap;" +
  "pointer-events:none;user-select:none;-webkit-user-select:none";

/** 中身のない inline-block は下端がベースラインに乗るので、その位置でベースラインを測る。 */
const MARK_STYLE = "display:inline-block;inline-size:0;block-size:0";

/** SVG を置く場所。絶対配置にして、要素の最小幅に寄与させない（高さは view に直接指定する）。 */
const CANVAS_STYLE = "display:block;position:absolute;inset-block-start:0;inset-inline-start:0";

/** フロートの回り込みとみなす幅の差（px）。 */
const FLOAT_TOLERANCE = 1;

/** フォーカスの枠と仮想ボディの間の余白（px）。 */
const FOCUS_RING_GAP = 2;

/** コピーする内容を作るときに、複製から取り除く要素（文書につなぐと読み込みや実行が起きるもの、表示されないもの）。 */
const UNCOPIED_TAGS = "script, style, template, noscript, iframe, object, embed, video, audio, link, meta";

/** コピーする内容を一時的に置く場所。画面の外に置き、オートモードの対象から外す。 */
const COPY_HOLDER_STYLE =
  "position:fixed;inset-block-start:0;inset-inline-start:-100000px;inline-size:1000px;opacity:0;pointer-events:none";

/** Shadow DOM の中に作る要素。要素ごとに 1 つだけ作り、組み直すときも使い回す。 */
interface Parts {
  root: ShadowRoot;
  source: HTMLElement;
  slot: HTMLSlotElement;
  reference: HTMLElement;
  view: HTMLElement;
  sizer: HTMLElement;
  ghost: SVGSVGElement;
  probe: HTMLElement;
  mark: HTMLElement;
  canvas: HTMLElement;
  /** この要素を今組んでいるブロック。組んでいなければ null。 */
  block: Block | null;
}

/** ブロックの CSS から決まるもの。 */
interface BlockStyle {
  direction: Direction;
  /** 行を折り返すかどうか（white-space が nowrap / pre でない）。 */
  wraps: boolean;
  /** CSS から決めた組版オプション。行送りは仮の値で、測った行の高さで決め直す。 */
  options: StoneOptions;
  /** CSS の line-height（px）。normal なら null（行の高さを測る）。 */
  cssLineHeight: number | null;
}

/** CSS の 1 行を測ったもの。 */
interface Metrics {
  /** 行の高さ（行送り、px）。 */
  lineHeight: number;
  /**
   * 行の中の文字の位置（px）。横書きは、行の上端から欧文ベースラインまでの距離。
   * 縦書きは、行の右端（行送り方向の始まり）から文字の中心（中央ベースライン）までの距離。
   * ブラウザは行送りの余りを上下（左右）に等分せずに整数に丸めて配るので、計算ではなく実際の行を測る。
   */
  baseline: number;
}

interface Block extends BlockStyle {
  owner: AutoStone;
  host: HTMLElement;
  parts: Parts;
  source: AutoSource;
  /** options に、測った行送りと利用者の上書きを反映した、実際に組むオプション。 */
  resolved: StoneOptions;
  /** 組版の入力（テキスト・範囲・オプション）を表す文字列。変わったら、折り返さない長さを求め直す。 */
  inputKey: string;
  /** 折り返さずに組んだときの行方向の長さ（px）。まだ求めていなければ null。 */
  naturalSize: number | null;
  /** ghost に指定してある行方向の長さ（px）。 */
  ghostSize: number;
  /** 元の中身を隠しているかどうか。 */
  sourceHidden: boolean;
  /** 行方向に使える長さ（px）。表示されていなければ null。 */
  inlineSize: number | null;
  /** 元の中身（組む前の表示）の行送り方向の大きさ（px）。組むまでのあいだ、ブロックの大きさを保つのに使う。 */
  contentSize: number | null;
  /** フロートが回り込んでいるかどうか。 */
  floats: boolean;
  metrics: Metrics | null;
  layout: StoneContext | null;
  /** 描いた内容（入力・長さ・位置）を表す文字列。同じなら描き直さない。 */
  layoutKey: string;
  /** 組んで表示しているかどうか。false のあいだは元の表示のまま。 */
  typeset: boolean;
  /** キーボードでフォーカスされている範囲（source.spans の添字）。 */
  focused: number | null;
}

type Inspection = { ok: true; style: BlockStyle; source: AutoSource } | { ok: false; reason: AutoSkipReason };

/** 要素ごとの Shadow DOM の中身。Shadow DOM は外せないので、オートモードをやめた後も残しておいて使い回す。 */
const partsOf = new WeakMap<Element, Parts>();

/** sizer から、それを持つ Parts を引く（ResizeObserver の通知用）。 */
const partsOfSizer = new WeakMap<Element, Parts>();

/** px の長さ。小数 3 桁に丸める。 */
function px(value: number): string {
  return `${Math.round(value * 1000) / 1000}px`;
}

/** 計算済みの長さ（"12.5px"）を数値にする。auto など数値でないものは 0。 */
function lengthOf(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** 要素の直下に、空白以外のテキストがあるかどうか。 */
function hasOwnText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && /\S/u.test((node as Text).data)) return true;
  }
  return false;
}

/** キーボードで移ったフォーカスかどうか（:focus-visible を知らない古いブラウザでは常に true）。 */
function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** 修飾キーを押していない、主ボタンのクリックかどうか（新しいタブで開くなどはブラウザに任せる）。 */
function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** ブロックの計算済みスタイルから、文字方向や組版オプションを決める。組めない値なら null。 */
function blockStyleOf(cs: CSSStyleDeclaration): BlockStyle | null {
  const direction = directionOf(cs);
  const fontSize = parseFloat(cs.fontSize);
  if (!direction || !(fontSize > 0)) return null;
  const cssLineHeight = cs.lineHeight.endsWith("px") ? parseFloat(cs.lineHeight) : null;
  return {
    direction,
    wraps: wrapsLines(cs.whiteSpace),
    options: optionsFromStyle(cs, cssLineHeight ?? fontSize),
    cssLineHeight,
  };
}

/** 2 つの BlockStyle が同じかどうか。 */
function sameBlockStyle(a: BlockStyle, b: BlockStyle): boolean {
  return (
    a.direction === b.direction &&
    a.wraps === b.wraps &&
    a.cssLineHeight === b.cssLineHeight &&
    JSON.stringify(a.options) === JSON.stringify(b.options)
  );
}

/**
 * SVG のリンクをクリックしたら、元の <a> をクリックしたことにする（ページのスクリプトやルーターには、元のリンクのクリックが届く）。
 * 修飾キーを押したクリックは、SVG の <a href> のままブラウザに任せる。
 */
function forwardLinkClick(parts: Parts, event: MouseEvent): void {
  const block = parts.block;
  const target = event.target as Element | null;
  const link = target && typeof target.closest === "function" ? target.closest("a[data-span]") : null;
  if (!block || !link || event.defaultPrevented || !isPlainClick(event)) return;
  const original = block.source.elements[Number(link.getAttribute("data-span"))] as HTMLElement | undefined;
  if (!original || original === block.host || typeof original.click !== "function") return;
  event.preventDefault();
  event.stopPropagation();
  original.click();
}

/** 要素に Shadow DOM を付けて、中の要素を作る。付けられなければ null。 */
function createParts(host: HTMLElement): Parts | null {
  if (host.shadowRoot) return null;
  let root: ShadowRoot;
  try {
    root = host.attachShadow({ mode: "open" });
  } catch {
    return null;
  }
  const doc = host.ownerDocument;
  const span = (name: string, style: string): HTMLElement => {
    const el = doc.createElement("span");
    el.className = `stone-auto__${name}`;
    el.style.cssText = style;
    return el;
  };
  const source = span("source", SOURCE_VISIBLE);
  const slot = doc.createElement("slot");
  source.append(slot);
  const reference = span("reference", SIZER_STYLE);
  const view = span("view", VIEW_STYLE);
  view.setAttribute("aria-hidden", "true");
  const sizer = span("sizer", SIZER_STYLE);
  const ghost = doc.createElementNS(SVG_NS, "svg");
  ghost.setAttribute("class", "stone-auto__ghost");
  ghost.style.cssText = GHOST_STYLE;
  const probe = span("probe", PROBE_STYLE);
  const mark = span("mark", MARK_STYLE);
  probe.append("国", mark);
  const canvas = span("canvas", CANVAS_STYLE);
  view.append(sizer, ghost, probe, canvas);
  root.append(reference, source, view);

  const parts: Parts = { root, source, slot, reference, view, sizer, ghost, probe, mark, canvas, block: null };
  view.addEventListener("click", (event) => forwardLinkClick(parts, event));
  partsOf.set(host, parts);
  partsOfSizer.set(sizer, parts);
  return parts;
}

class AutoStone implements AutoStoneHandle {
  private readonly doc: Document;
  private readonly win: Window & typeof globalThis;
  /** 自動で組む範囲のセレクター。 */
  private readonly scope: string;
  private readonly targets: string;
  /** 候補を探すセレクター（対象の要素と、範囲の要素そのもの）。 */
  private readonly candidates: string;
  /** 範囲の内外を決める要素を探すセレクター（範囲の要素と、data-stone で入り切りする要素）。 */
  private readonly markers: string;
  private readonly overrides: StoneOptions | undefined;
  private readonly lazy: boolean;
  private readonly observes: boolean;
  private readonly debug: boolean;

  private readonly blocks = new Map<Element, Block>();
  private readonly skipped = new Map<Element, AutoSkipReason>();
  /** 画面に近づくのを待っている要素。 */
  private readonly queued = new Set<Element>();
  /** 次のフレームで組み直すブロック。 */
  private readonly dirty = new Set<Block>();
  /** 次のフレームで、すべてのブロックの CSS を読み直す。 */
  private restyleAll = false;
  private frame = 0;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;
  private mo: MutationObserver | null = null;
  private destroyed = false;

  /** 設定を受け取る。監視は start() で始める。 */
  constructor(
    private readonly root: Document | Element,
    private readonly measurer: FontMeasurer,
    options: AutoStoneOptions,
  ) {
    this.doc = root.nodeType === 9 ? (root as Document) : (root.ownerDocument as Document);
    this.win = (this.doc.defaultView ?? window) as Window & typeof globalThis;
    this.scope = options.scope ?? DEFAULT_AUTO_SCOPE;
    this.targets = options.targets ?? DEFAULT_AUTO_TARGETS;
    this.candidates = `${this.targets}, ${this.scope}`;
    this.markers = `${this.scope}, [${SCOPE_ATTRIBUTE}]`;
    this.overrides = options.options;
    this.lazy = options.lazy ?? true;
    this.observes = options.observe ?? true;
    this.debug = options.debug ?? this.doc.documentElement.hasAttribute(DEBUG_ATTRIBUTE);
  }

  /** 監視を始めて、今ある要素を組む。 */
  start(): void {
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver((entries) => this.onResize(entries));
    }
    if (this.lazy && typeof IntersectionObserver !== "undefined") {
      // 画面の上下に 1 画面ぶん広げた範囲に入ったら組む
      this.io = new IntersectionObserver((entries) => this.onIntersect(entries), { rootMargin: "100% 0px" });
    }
    if (this.observes && typeof MutationObserver !== "undefined") {
      this.mo = new MutationObserver((records) => this.onMutate(records));
      this.mo.observe(this.root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [SCOPE_ATTRIBUTE],
      });
    }
    this.doc.fonts?.addEventListener?.("loadingdone", this.onFontsLoaded);
    this.win.addEventListener("resize", this.onWindowResize);
    this.root.addEventListener("focusin", this.onFocusChange);
    this.root.addEventListener("focusout", this.onFocusChange);
    this.doc.addEventListener("copy", this.onCopy);

    const found = new Set<HTMLElement>();
    this.collect(this.root, found);
    this.enqueue(found);
  }

  //--------------------------------------------------------------//
  // 公開 API
  //--------------------------------------------------------------//

  refresh(): void {
    if (this.destroyed) return;
    for (const host of this.skipped.keys()) this.mark(host, null);
    this.skipped.clear();
    this.reinspect([...this.blocks.values()]);
    const found = new Set<HTMLElement>();
    this.collect(this.root, found);
    this.enqueue(found);
  }

  report(): AutoStoneReport[] {
    const out: AutoStoneReport[] = [];
    for (const block of this.blocks.values()) {
      out.push({ element: block.host, state: block.typeset ? "typeset" : "waiting" });
    }
    for (const element of this.queued) out.push({ element, state: "queued" });
    for (const [element, reason] of this.skipped) out.push({ element, state: "skipped", reason });
    return out;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame) this.win.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.io?.disconnect();
    this.ro?.disconnect();
    this.mo?.disconnect();
    this.doc.fonts?.removeEventListener?.("loadingdone", this.onFontsLoaded);
    this.win.removeEventListener("resize", this.onWindowResize);
    this.root.removeEventListener("focusin", this.onFocusChange);
    this.root.removeEventListener("focusout", this.onFocusChange);
    this.doc.removeEventListener("copy", this.onCopy);
    for (const block of [...this.blocks.values()]) this.release(block);
    for (const host of this.skipped.keys()) this.mark(host, null);
    this.skipped.clear();
    this.queued.clear();
    this.dirty.clear();
  }

  //--------------------------------------------------------------//
  // 探す
  //--------------------------------------------------------------//

  /** node とその中から、まだ扱っていない候補を found に集める。 */
  private collect(node: Document | Element, found: Set<HTMLElement>): void {
    if (node.nodeType === 1) this.consider(node as Element, found);
    for (const el of node.querySelectorAll(this.candidates)) this.consider(el, found);
  }

  /** el が候補なら found に入れる。 */
  private consider(el: Element, found: Set<HTMLElement>): void {
    if (this.blocks.has(el) || this.skipped.has(el) || this.queued.has(el)) return;
    if (el.namespaceURI !== XHTML_NS || !el.isConnected) return;
    if (this.claimedByOther(el)) return;
    if (!this.inScope(el)) return;
    // 範囲の要素そのものは、直下にテキストがあるときだけ組む
    if (!el.matches(this.targets) && !(el.matches(this.markers) && hasOwnText(el))) return;
    found.add(el as HTMLElement);
  }

  /** 別の autoStone がすでに組んでいる要素かどうか。 */
  private claimedByOther(el: Element): boolean {
    const block = partsOf.get(el)?.block;
    return block !== null && block !== undefined && block.owner !== this;
  }

  /**
   * el が自動で組む範囲の中にあるかどうか。いちばん近い「範囲の要素」か「data-stone の要素」で決まる。
   * data-stone="off" の中は範囲の外。その中で data-stone を付け直した要素の中は、また範囲の中になる。
   * 範囲を独自のセレクターにしたときは、data-stone を付けただけの要素（その範囲の外にあるもの）は範囲にならない。
   */
  private inScope(el: Element): boolean {
    const marker = el.closest(this.markers);
    if (!marker) return false;
    const value = marker.getAttribute(SCOPE_ATTRIBUTE);
    if (value !== null && OFF_VALUES.has(value.trim().toLowerCase())) return false;
    if (marker.matches(this.scope)) return true;
    // 入れ直しの data-stone: 範囲の中にあるときだけ有効
    return marker.parentElement !== null && marker.parentElement.closest(this.scope) !== null;
  }

  /** 候補を、画面に近いものはすぐに組み、遠いものは近づくのを待つ。 */
  private enqueue(found: Iterable<HTMLElement>): void {
    const elements = [...found];
    if (elements.length === 0) return;
    if (!this.io) {
      this.process(elements);
      return;
    }
    const near: HTMLElement[] = [];
    const height = this.win.innerHeight;
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 || rect.height > 0;
      if (visible && rect.bottom > -height && rect.top < height * 2) {
        near.push(el);
      } else {
        this.queued.add(el);
        this.io.observe(el);
      }
    }
    this.process(near);
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    if (this.destroyed) return;
    const ready: HTMLElement[] = [];
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      this.io?.unobserve(entry.target);
      if (this.queued.delete(entry.target)) ready.push(entry.target as HTMLElement);
    }
    this.process(ready);
  }

  //--------------------------------------------------------------//
  // 調べる・組み始める
  //--------------------------------------------------------------//

  /** 要素を調べて、組めるものを組む。調べる（読み取り）のをすべて済ませてから、DOM を書き換える。 */
  private process(elements: HTMLElement[]): void {
    // 画面に近づくのを待っているあいだに、別の autoStone が組んだ要素は除く
    elements = elements.filter((host) => !this.claimedByOther(host));
    if (elements.length === 0) return;
    const inspections = elements.map((host) => ({ host, inspection: this.inspect(host) }));
    const mounted: Block[] = [];
    for (const { host, inspection } of inspections) {
      if (!inspection.ok) {
        this.skip(host, inspection.reason);
        continue;
      }
      const block = this.mount(host, inspection);
      if (block) mounted.push(block);
    }
    this.flush(mounted);
  }

  /** 要素が組めるかどうかを調べて、CSS と中身を読み取る（読み取りだけ）。 */
  private inspect(host: HTMLElement): Inspection {
    try {
      const parts = partsOf.get(host);
      if (!parts) {
        if (!SHADOW_HOSTS.has(host.tagName) && !host.tagName.includes("-")) return { ok: false, reason: "host" };
        if (host.shadowRoot) return { ok: false, reason: "shadow-root" };
      }
      if (host.isContentEditable) return { ok: false, reason: "editable" };
      const cs = this.win.getComputedStyle(host);
      const reason = blockSkipReason(cs) ?? (this.hasInlineGeneratedContent(host) ? "generated-content" : null);
      if (reason) return { ok: false, reason };
      const style = blockStyleOf(cs);
      if (!style) return { ok: false, reason: "display" };
      // 中身を隠しているあいだは、中身は隠している要素から white-space などを継承する
      const baseStyle = parts?.block?.sourceHidden ? this.win.getComputedStyle(parts.slot) : cs;
      const read = readAutoSource(host, {
        blockStyle: cs,
        baseStyle,
        mode: whiteSpaceModeOf(cs.whiteSpace) ?? "collapse",
        styleOf: (el, pseudo) => this.win.getComputedStyle(el, pseudo),
      });
      return read.ok ? { ok: true, style, source: read.source } : read;
    } catch (error) {
      this.warn(host, error);
      return { ok: false, reason: "error" };
    }
  }

  /**
   * 要素の ::before / ::after が、行の中に内容を足しているかどうか。
   * 組んだ後は中身がブロックになるので、行の中の疑似要素（記号や引用符）は別の行に分かれてしまう。
   * ブロックや絶対配置の疑似要素（見出しの飾り線、clearfix など）は、行の外にあるので影響しない。
   */
  private hasInlineGeneratedContent(host: Element): boolean {
    for (const pseudo of ["::before", "::after"]) {
      const ps = this.win.getComputedStyle(host, pseudo);
      const content = ps.content;
      if (!content || content === "none" || content === "normal" || ps.display === "none") continue;
      if (ps.position === "absolute" || ps.position === "fixed") continue;
      if (ps.cssFloat !== "none") return true;
      if (ps.display.startsWith("inline") || ps.display === "contents" || ps.display === "ruby") return true;
    }
    return false;
  }

  /** 要素に Shadow DOM を用意して、組み始める（まだ元の表示のまま。flush で組む）。 */
  private mount(host: HTMLElement, inspection: Extract<Inspection, { ok: true }>): Block | null {
    const parts = partsOf.get(host) ?? createParts(host);
    if (!parts) {
      this.skip(host, "shadow-root");
      return null;
    }
    const block: Block = {
      ...inspection.style,
      owner: this,
      host,
      parts,
      source: inspection.source,
      resolved: inspection.style.options,
      inputKey: "",
      naturalSize: null,
      ghostSize: 0,
      sourceHidden: false,
      inlineSize: null,
      contentSize: null,
      floats: false,
      metrics: null,
      layout: null,
      layoutKey: "",
      typeset: false,
      focused: null,
    };
    parts.block = block;
    this.blocks.set(host, block);
    this.skipped.delete(host);
    this.ro?.observe(parts.sizer);
    return block;
  }

  /** 要素を見送る。 */
  private skip(host: Element, reason: AutoSkipReason): void {
    this.skipped.set(host, reason);
    this.mark(host, reason === "empty" ? null : "skipped", reason);
  }

  /** 組むのをやめて、元の表示に戻す。 */
  private release(block: Block): void {
    const { parts, host } = block;
    parts.source.style.cssText = SOURCE_VISIBLE;
    parts.canvas.replaceChildren();
    parts.canvas.style.insetBlockStart = "0";
    parts.view.style.blockSize = "";
    parts.ghost.style.inlineSize = "0";
    if (parts.block === block) parts.block = null;
    this.ro?.unobserve(parts.sizer);
    this.blocks.delete(host);
    this.dirty.delete(block);
    block.typeset = false;
    block.sourceHidden = false;
    this.mark(host, null);
  }

  /** デバッグ用の属性を付ける（debug のときだけ）。state が null なら外す。 */
  private mark(host: Element, state: "typeset" | "skipped" | null, reason?: AutoSkipReason): void {
    if (!this.debug) return;
    if (state === null) host.removeAttribute(STATE_ATTRIBUTE);
    else host.setAttribute(STATE_ATTRIBUTE, state);
    if (state === "skipped" && reason) host.setAttribute(REASON_ATTRIBUTE, reason);
    else host.removeAttribute(REASON_ATTRIBUTE);
  }

  /** 組めなかったことをコンソールに出す。 */
  private warn(host: Element, error: unknown): void {
    console.warn("[stone-engine.js] auto: failed to typeset an element", host, error);
  }

  //--------------------------------------------------------------//
  // 測る・組む・描く
  //--------------------------------------------------------------//

  /** block を今も組んでいるかどうか。 */
  private alive(block: Block): boolean {
    return this.blocks.get(block.host) === block;
  }

  /** fn を実行し、エラーになったら block を元の表示に戻して見送る。 */
  private guard<T>(block: Block, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (error) {
      this.warn(block.host, error);
      try {
        this.release(block);
      } catch {
        // 元に戻せなくても、ほかの要素は続ける
      }
      this.skip(block.host, "error");
      return undefined;
    }
  }

  /**
   * ブロックを組んで描く。レイアウトの読み書きをまとめるため、すべてのブロックについて
   * 1. 測る（読み取り）→ 2. intrinsic な大きさを置いて元の中身を隠す（書き込み）→ 3. それで長さが変わったものを測り直す（読み取り）
   * → 4. 組んで描く（書き込み）の順に進める。
   */
  private flush(blocks: Iterable<Block>): void {
    const list = [...blocks].filter((block) => this.alive(block));
    if (list.length === 0) return;
    for (const block of list) this.guard(block, () => this.measure(block));
    const refit = list.filter((block) => this.alive(block) && this.guard(block, () => this.fit(block)) === true);
    for (const block of refit) {
      if (this.alive(block)) this.guard(block, () => this.measure(block));
    }
    for (const block of list) {
      if (this.alive(block)) this.guard(block, () => this.render(block));
    }
  }

  /** 行方向に使える長さと、フロートの回り込み、行の高さとベースラインを測り、組むオプションを決める（読み取りだけ）。 */
  private measure(block: Block): void {
    const { parts } = block;
    const horizontal = block.direction === "lrTb";
    // getComputedStyle の width / height は、変形（transform）の影響を受けないレイアウト上の大きさ
    const length = (el: Element): number => {
      const cs = this.win.getComputedStyle(el);
      return lengthOf(horizontal ? cs.width : cs.height);
    };
    const inline = length(parts.sizer);
    block.floats = length(parts.reference) - inline > FLOAT_TOLERANCE;
    block.inlineSize = inline > 0 ? inline : null;
    if (!block.sourceHidden && block.inlineSize !== null) {
      // 元の中身は reference と view の間にある（view は中身の後ろに置かれた高さ 0 のブロック）
      const start = parts.reference.getBoundingClientRect();
      const end = parts.view.getBoundingClientRect();
      block.contentSize = Math.max(0, horizontal ? end.top - start.top : start.right - end.right);
    }
    if (!block.metrics && block.inlineSize !== null) block.metrics = this.measureMetrics(block);
    if (block.metrics) this.resolve(block);
  }

  /** 1 行ぶんのテキスト（probe）から、行の高さとベースラインの位置を測る。表示されていなければ null。 */
  private measureMetrics(block: Block): Metrics | null {
    const { parts } = block;
    const horizontal = block.direction === "lrTb";
    const cs = this.win.getComputedStyle(parts.probe);
    const thickness = lengthOf(horizontal ? cs.height : cs.width);
    if (!(thickness > 0)) return null;
    // 位置は getBoundingClientRect でしか取れないので、変形で拡大・縮小されていれば割り戻す
    const probe = parts.probe.getBoundingClientRect();
    let baseline: number;
    if (horizontal) {
      // 中身のない inline-block（mark）の下端が、欧文ベースラインの位置
      const mark = parts.mark.getBoundingClientRect();
      const scale = probe.height > 0 ? probe.height / thickness : 1;
      baseline = (mark.bottom - probe.top) / scale;
    } else {
      // 縦書きの文字は中央ベースラインにそろうので、文字の矩形の中心を測る
      const range = this.doc.createRange();
      range.selectNodeContents(parts.probe.firstChild as Node);
      const glyph = range.getBoundingClientRect();
      const scale = probe.width > 0 ? probe.width / thickness : 1;
      baseline = (probe.right - (glyph.left + glyph.width * 0.5)) / scale;
    }
    return { lineHeight: block.cssLineHeight ?? thickness, baseline };
  }

  /** CSS から決めたオプションに、測った行送りと利用者の上書きを重ねて、実際に組むオプションを決める。 */
  private resolve(block: Block): void {
    const metrics = block.metrics as Metrics;
    const fontSize = block.options.fontSize ?? 0;
    const base: StoneOptions = {
      ...block.options,
      lineHeightScale: fontSize > 0 ? metrics.lineHeight / fontSize : 1,
    };
    const resolved = { ...mergeAutoOptions(base, this.overrides), direction: block.direction };
    const key = JSON.stringify([block.source.text, block.source.spans, resolved]);
    if (key !== block.inputKey) {
      block.inputKey = key;
      block.naturalSize = null;
    }
    block.resolved = resolved;
  }

  /**
   * 折り返さずに組んだ長さを intrinsic な大きさとして置き、元の中身を隠す（書き込み）。
   * 要素の大きさが変わるかもしれないときは true を返す（測り直す）。表示されていない要素は、元の表示のまま待つ。
   */
  private fit(block: Block): boolean {
    if (block.inlineSize === null || !block.metrics || block.floats) return false;
    const { parts } = block;
    if (block.naturalSize === null) {
      const ctx = layoutText(block.source.text, block.resolved, this.measurer, {}, block.source.spans);
      block.naturalSize = block.direction === "lrTb" ? ctx.renderedSize.width : ctx.renderedSize.height;
    }
    let changed = false;
    // 小数の誤差で最後の文字が折り返さないよう、1px の余裕を持たせる
    const ghostSize = Math.ceil(block.naturalSize) + 1;
    if (ghostSize !== block.ghostSize) {
      parts.ghost.style.inlineSize = px(ghostSize);
      block.ghostSize = ghostSize;
      changed = true;
    }
    if (!block.sourceHidden) {
      // 隠した瞬間にブロックがつぶれると、後ろの要素がずれて、フロートの横に入り込んだように見えてしまう。
      // 組むまでのあいだは、元の中身と同じ大きさを保つ
      if (block.contentSize !== null) parts.view.style.blockSize = px(block.contentSize);
      parts.source.style.cssText = SOURCE_HIDDEN;
      block.sourceHidden = true;
      changed = true;
    }
    return changed;
  }

  /** 組んで SVG を描き、CSS のテキストと同じ位置に置く（書き込み）。 */
  private render(block: Block): void {
    const { parts, host } = block;
    if (block.floats) {
      this.release(block);
      this.skip(host, "float");
      return;
    }
    if (block.inlineSize === null || !block.metrics || block.naturalSize === null || !block.sourceHidden) return;
    const limit = Math.floor(block.inlineSize);
    if (limit < 1) return;
    const horizontal = block.direction === "lrTb";
    // 折り返さない指定（nowrap / pre）でも、収まるなら行揃えのために長さを渡す
    const unlimited = !block.wraps && block.naturalSize > limit;
    const size: LayoutSize = unlimited ? {} : horizontal ? { width: limit } : { height: limit };
    const key = `${block.inputKey}\n${unlimited ? "" : limit}\n${block.metrics.baseline}`;
    if (block.typeset && key === block.layoutKey) return;

    const ctx = layoutText(block.source.text, block.resolved, this.measurer, size, block.source.spans);
    parts.canvas.innerHTML = svgString(ctx, { spans: block.source.spans });
    // 縦書きの要素の中では writing-mode が SVG のテキストにも継承され、SVG が自分で縦に並べようとする
    // （文字の原点が上端の中央になり、位置がずれる）。位置はエンジンが 1 文字ずつ決めているので、SVG の中は横書きに戻す
    const svg = parts.canvas.querySelector("svg");
    if (svg) svg.style.writingMode = "horizontal-tb";
    // リンクのキーボード操作は元の <a> が受けるので、SVG のリンクは Tab の順序から外す
    for (const link of parts.canvas.querySelectorAll("a")) link.setAttribute("tabindex", "-1");

    // ブロックの高さは CSS と同じ「行数 × 行送り」にする
    const pitch = ctx.lineHeight;
    parts.view.style.blockSize = px(ctx.lineCount * pitch);
    let offset: number;
    if (horizontal) {
      // 1 行目のベースラインを、CSS の 1 行目のベースラインに合わせる
      offset = block.metrics.baseline - (ctx.runs[0]?.position.y ?? 0);
    } else {
      // 1 列目の仮想ボディの中心を、CSS の 1 列目の文字の中心に合わせる（列は SVG の右端から並ぶ）
      const width = svgSize(ctx).width;
      const first = ctx.runs[0];
      const center = first ? columnLeft(ctx, first) + ctx.fontSize * 0.5 : width - ctx.fontSize * 0.5;
      offset = block.metrics.baseline - (width - center);
    }
    parts.canvas.style.insetBlockStart = px(offset);

    block.layout = ctx;
    block.layoutKey = key;
    if (!block.typeset) {
      block.typeset = true;
      this.mark(host, "typeset");
    }
    this.drawFocusRing(block);
  }

  //--------------------------------------------------------------//
  // 変化を追いかける
  //--------------------------------------------------------------//

  /** 次のフレームで、dirty のブロックを組み直す。 */
  private schedule(): void {
    if (this.frame || this.destroyed) return;
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = 0;
      if (this.destroyed) return;
      const blocks = this.restyleAll ? [...this.blocks.values()] : [...this.dirty];
      const restyle = this.restyleAll;
      this.restyleAll = false;
      this.dirty.clear();
      if (restyle) this.restyle(blocks);
      this.flush(blocks);
    });
  }

  // 大きさが変わった直後（ResizeObserver の通知の中）で DOM を書き換えると、通知が同じフレームに収まらなくなるので、
  // ここでは印を付けるだけにして、次のフレームで組み直す
  private onResize(entries: ResizeObserverEntry[]): void {
    for (const entry of entries) {
      const block = partsOfSizer.get(entry.target)?.block;
      if (block && block.owner === this && this.alive(block)) this.dirty.add(block);
    }
    if (this.dirty.size > 0) this.schedule();
  }

  /** ウィンドウの大きさが変わると、メディアクエリで文字サイズなどが変わることがあるので、CSS を読み直す。 */
  private readonly onWindowResize = (): void => {
    this.restyleAll = true;
    this.schedule();
  };

  /** Web フォントが読み込まれたら、送り幅とメトリクスが変わるので、すべて測り直して組み直す。 */
  private readonly onFontsLoaded = (): void => {
    (this.measurer as { invalidate?: () => void }).invalidate?.();
    for (const block of this.blocks.values()) {
      block.metrics = null;
      block.naturalSize = null;
      block.inputKey = "";
      block.layoutKey = "";
      this.dirty.add(block);
    }
    this.schedule();
  };

  /** ブロックの CSS を読み直す（中身は読み直さない）。組めなくなったものは元の表示に戻す。 */
  private restyle(blocks: Block[]): void {
    const styles = blocks.map((block) => {
      const cs = this.win.getComputedStyle(block.host);
      const reason = blockSkipReason(cs);
      return { block, reason, style: reason ? null : blockStyleOf(cs) };
    });
    for (const { block, reason, style } of styles) {
      if (!this.alive(block)) continue;
      if (!style) {
        this.release(block);
        this.skip(block.host, reason ?? "display");
      } else {
        this.applyStyle(block, style);
      }
    }
  }

  /** 読み直した CSS をブロックに反映する。変わっていれば、行の高さを測り直す。 */
  private applyStyle(block: Block, style: BlockStyle): void {
    if (sameBlockStyle(block, style)) return;
    block.direction = style.direction;
    block.wraps = style.wraps;
    block.options = style.options;
    block.cssLineHeight = style.cssLineHeight;
    block.metrics = null;
  }

  /** 組んであるブロックの CSS と中身を読み直して、組み直す。組めなくなったものは元の表示に戻す。 */
  private reinspect(blocks: Block[]): void {
    if (blocks.length === 0) return;
    const inspections = blocks.map((block) => ({ block, inspection: this.inspect(block.host) }));
    const alive: Block[] = [];
    for (const { block, inspection } of inspections) {
      if (!this.alive(block)) continue;
      if (!inspection.ok) {
        this.release(block);
        this.skip(block.host, inspection.reason);
        continue;
      }
      this.applyStyle(block, inspection.style);
      block.source = inspection.source;
      block.focused = this.focusedSpan(block);
      alive.push(block);
    }
    this.flush(alive);
  }

  private onMutate(records: MutationRecord[]): void {
    if (this.destroyed) return;
    const touched = new Set<Element>();
    const found = new Set<HTMLElement>();
    let removed = false;
    for (const record of records) {
      const target = record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement;
      if (record.type === "attributes") {
        // data-stone が変わった: 範囲から外れたものを戻し、入ったものを探す
        if (target) this.rescope(target, found);
        continue;
      }
      if (record.type === "childList") {
        if (record.removedNodes.length > 0) removed = true;
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) this.collect(node as Element, found);
        }
      }
      if (!target) continue;
      const known = this.closestKnown(target);
      if (known) {
        touched.add(known);
      } else {
        // まだ扱っていない要素の中身が変わった（空だった段落にテキストが入ったなど）
        const candidate = target.closest(this.candidates);
        if (candidate) this.consider(candidate, found);
      }
    }
    if (removed) this.sweep();

    // 中身が変わった要素: 組んであるものは読み直し、見送ったものは調べ直す
    const changed: Block[] = [];
    for (const el of touched) {
      const block = this.blocks.get(el);
      if (block) {
        changed.push(block);
      } else if (this.skipped.has(el)) {
        this.skipped.delete(el);
        this.mark(el, null);
        this.consider(el, found);
      }
    }
    this.reinspect(changed);
    this.enqueue(found);
  }

  /** el か、その祖先のうち、すでに扱っている要素（組んだ・見送った・待っている）。 */
  private closestKnown(el: Element): Element | null {
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (this.blocks.has(node) || this.skipped.has(node) || this.queued.has(node)) return node;
    }
    return null;
  }

  /** el の中で、範囲から外れた要素を元に戻し、範囲に入った要素を found に集める。 */
  private rescope(el: Element, found: Set<HTMLElement>): void {
    for (const block of [...this.blocks.values()]) {
      if (el.contains(block.host) && !this.inScope(block.host)) this.release(block);
    }
    for (const host of [...this.skipped.keys()]) {
      if (el.contains(host) && !this.inScope(host)) this.forget(host);
    }
    for (const host of [...this.queued]) {
      if (el.contains(host) && !this.inScope(host)) this.forget(host);
    }
    this.collect(el, found);
  }

  /** 見送った要素・待っている要素を忘れる。 */
  private forget(host: Element): void {
    if (this.skipped.delete(host)) this.mark(host, null);
    if (this.queued.delete(host)) this.io?.unobserve(host);
  }

  /** 文書から外れた要素を片付ける。 */
  private sweep(): void {
    for (const block of [...this.blocks.values()]) {
      if (!block.host.isConnected) this.release(block);
    }
    for (const host of [...this.skipped.keys()]) {
      if (!host.isConnected) this.forget(host);
    }
    for (const host of [...this.queued]) {
      if (!host.isConnected) this.forget(host);
    }
  }

  //--------------------------------------------------------------//
  // コピー
  //--------------------------------------------------------------//

  /**
   * 選択が組んだブロックにかかっているときは、クリップボードに入れる内容を自分で作る。
   * ブラウザ標準のコピーでも SVG のテキストは取り出せるが、HTML 形式には Shadow DOM の中身（SVG と 1 文字ごとの <tspan>）が
   * そのまま入り、リッチテキストに貼り付けたときに元の段落・見出し・リンクにならない。
   * - 1 つのブロックの中の選択: 選ばれた文字の元のテキスト（改行・空白を含む）。
   * - 複数のブロックや普通の要素にまたがる選択: 元の DOM を複製して、組んでいないときと同じ内容（テキストと HTML）にする。
   * 組んだブロックにかからない選択と、入力欄の中のコピーは、ブラウザに任せる。
   */
  private readonly onCopy = (event: ClipboardEvent): void => {
    const data = event.clipboardData;
    if (!data || event.defaultPrevented || this.blocks.size === 0) return;
    const target = (typeof event.composedPath === "function" ? event.composedPath()[0] : event.target) as Element | null;
    if (target && target.nodeType === 1) {
      if ((target as HTMLElement).isContentEditable || target.matches("input, textarea, select")) return;
    }
    const range = this.selectedRange();
    if (!range) return;
    const first = this.blockAt(range.startContainer);
    const last = this.blockAt(range.endContainer);
    try {
      if (first && first === last) {
        const runs = this.selectedRuns(first, range.startContainer, range.startOffset, range.endContainer, range.endOffset);
        if (!runs || !first.layout) return;
        data.setData("text/plain", textOfRunRange(first.layout, runs[0], runs[1]));
        event.preventDefault();
        return;
      }
      const content = this.copyAcross(range, first, last);
      if (!content) return;
      data.setData("text/plain", content.text);
      data.setData("text/html", content.html);
      event.preventDefault();
    } catch (error) {
      // 内容を作れなければ、ブラウザ標準のコピーに任せる
      console.warn("[stone-engine.js] auto: failed to build the copied text", error);
    }
  };

  /**
   * 選択範囲を、Shadow DOM の中の位置のまま取り出す。
   * Selection の anchorNode などは Shadow DOM の外から見た位置に直されるので、getComposedRanges を使う。
   */
  private selectedRange(): AbstractRange | null {
    const selection = this.doc.getSelection();
    if (!selection) return null;
    let range: AbstractRange | null = null;
    const composed = (selection as Selection & { getComposedRanges?: (...args: unknown[]) => StaticRange[] }).getComposedRanges;
    if (typeof composed === "function") {
      const roots: ShadowRoot[] = [];
      for (const block of this.blocks.values()) {
        if (block.typeset) roots.push(block.parts.root);
      }
      // 引数の渡し方は 2 通りある（オプションのオブジェクトと、ShadowRoot を並べる古い書き方）
      for (const args of [[{ shadowRoots: roots }], roots]) {
        try {
          const found = composed.apply(selection, args)[0];
          if (found) {
            range = found;
            break;
          }
        } catch {
          // この書き方に対応していない
        }
      }
    }
    if (!range && selection.rangeCount > 0) range = selection.getRangeAt(0);
    return range && !range.collapsed ? range : null;
  }

  /** node が、組んだブロックの組版結果（SVG）の中にあれば、そのブロック。 */
  private blockAt(node: Node): Block | null {
    const root = node.getRootNode();
    const host = root.nodeType === 11 ? (root as ShadowRoot).host : null;
    const block = host ? this.blocks.get(host) : undefined;
    return block && block.typeset && block.parts.canvas.contains(node) ? block : null;
  }

  /** ブロックの中で、指定した範囲と重なる文字の run ID の範囲。重なる文字が無ければ null。 */
  private selectedRuns(
    block: Block,
    startNode: Node,
    startOffset: number,
    endNode: Node,
    endOffset: number,
  ): [number, number] | null {
    const range = this.doc.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return runRangeOfSelection(block.parts.canvas, range);
  }

  /**
   * 複数のブロックや普通の要素にまたがる選択の内容を作る。first / last は選択の始まり・終わりがあるブロック（普通の要素の中なら null）。
   * 選択にかかる元の DOM を複製して画面の外に置き、ブラウザにテキスト（innerText）と HTML を作らせる。組んだブロックの元の中身は
   * そのまま複製されるので、組んでいないページをコピーしたときと同じ内容になる。両端のブロックは、選ばれた文字だけにする。
   * 組んだブロックに 1 つもかからない選択なら null（ブラウザ標準のコピーに任せる）。
   */
  private copyAcross(range: AbstractRange, first: Block | null, last: Block | null): { text: string; html: string } | null {
    const doc = this.doc;
    const light = doc.createRange();
    if (first) light.setStartBefore(first.host);
    else light.setStart(range.startContainer, range.startOffset);
    if (last) light.setEndAfter(last.host);
    else light.setEnd(range.endContainer, range.endOffset);
    if (light.collapsed) return null;
    if (!first && !last) {
      let touches = false;
      for (const block of this.blocks.values()) {
        if (block.typeset && light.intersectsNode(block.host)) {
          touches = true;
          break;
        }
      }
      if (!touches) return null;
    }

    // 両端のブロックで選ばれている文字（ブロックの複製の中身を、これに置き換える）
    const partial = (block: Block, runs: [number, number] | null): string =>
      runs && block.layout ? textOfRunRange(block.layout, runs[0], runs[1]) : "";
    const firstText = first
      ? partial(first, this.selectedRuns(first, range.startContainer, range.startOffset, first.parts.canvas, first.parts.canvas.childNodes.length))
      : "";
    const lastText = last
      ? partial(last, this.selectedRuns(last, last.parts.canvas, 0, range.endContainer, range.endOffset))
      : "";

    const fragment = light.cloneContents();
    // 範囲はブロックの直前・直後で区切ってあるので、ブロックの複製は、祖先をたどった先の最初・最後の子になる
    const edge = (host: Element, side: "firstChild" | "lastChild"): Node | null => {
      let node: Node | null = fragment[side];
      for (let n = host.parentNode; node && n && n !== light.commonAncestorContainer; n = n.parentNode) node = node[side];
      return node;
    };
    const trim = (clone: Node | null, text: string): void => {
      if (!clone) return;
      if (text) clone.textContent = text;
      else clone.parentNode?.removeChild(clone);
    };
    const firstClone = first ? edge(first.host, "firstChild") : null;
    const lastClone = last ? edge(last.host, "lastChild") : null;
    trim(firstClone, firstText);
    trim(lastClone, lastText);

    for (const el of fragment.querySelectorAll(UNCOPIED_TAGS)) el.remove();
    // カスタム要素は、文書につなぐとそのコードが動いてしまうので、テキストだけにする
    for (const el of fragment.querySelectorAll("*")) {
      if (el.localName.includes("-")) el.replaceWith(doc.createTextNode(el.textContent ?? ""));
    }

    const holder = doc.createElement("div");
    holder.setAttribute(SCOPE_ATTRIBUTE, "off");
    holder.setAttribute("aria-hidden", "true");
    holder.style.cssText = COPY_HOLDER_STYLE;
    holder.append(fragment);
    (doc.body ?? doc.documentElement).append(holder);
    try {
      return { text: holder.innerText, html: holder.innerHTML };
    } finally {
      holder.remove();
    }
  }

  //--------------------------------------------------------------//
  // フォーカス
  //--------------------------------------------------------------//

  /** キーボードで元の <a> にフォーカスしたとき、SVG のリンクに枠を描く（元の <a> は隠れていて見えないため）。 */
  private readonly onFocusChange = (event: Event): void => {
    const target = event.target as Element | null;
    if (!target || target.nodeType !== 1) return;
    for (let node: Element | null = target; node; node = node.parentElement) {
      const block = this.blocks.get(node);
      if (!block) continue;
      block.focused = event.type === "focusin" ? this.focusedSpan(block, target) : null;
      this.drawFocusRing(block);
      return;
    }
  };

  /** フォーカスのある要素に対応する範囲の添字。無ければ null。 */
  private focusedSpan(block: Block, target: Element | null = this.doc.activeElement): number | null {
    if (!target || target === block.host || !block.host.contains(target)) return null;
    const index = block.source.elements.indexOf(target);
    return index >= 0 && isFocusVisible(target) ? index : null;
  }

  /** フォーカスの枠を描き直す。 */
  private drawFocusRing(block: Block): void {
    const svg = block.parts.canvas.querySelector("svg");
    if (!svg) return;
    svg.querySelector(".stone-focus-ring")?.remove();
    if (block.focused === null || !block.layout || !block.source.spans[block.focused]) return;
    const group = this.doc.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "stone-focus-ring");
    group.setAttribute("fill", "none");
    group.setAttribute("stroke", "Highlight");
    group.setAttribute("stroke-width", "2");
    group.setAttribute("pointer-events", "none");
    for (const r of spanRects(block.layout, block.source.spans, block.focused)) {
      const rect = this.doc.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(r.x - FOCUS_RING_GAP));
      rect.setAttribute("y", String(r.y - FOCUS_RING_GAP));
      rect.setAttribute("width", String(r.width + FOCUS_RING_GAP * 2));
      rect.setAttribute("height", String(r.height + FOCUS_RING_GAP * 2));
      rect.setAttribute("rx", "2");
      group.append(rect);
    }
    svg.append(group);
  }
}

/** 何もしないハンドル（ブラウザ以外や、必要な機能のない環境で返す）。 */
const NOOP_HANDLE: AutoStoneHandle = {
  refresh() {},
  report() {
    return [];
  },
  destroy() {},
};

/**
 * オートモードを始める。範囲（既定は data-stone 属性を付けた要素）の中の段落や見出しを探し、CSS で決まった見た目のまま組む。
 * 組めない要素は、何もせずに元の表示のまま残す。ブラウザ以外（SSR）では何もしない。
 */
export function autoStone(options: AutoStoneOptions = {}): AutoStoneHandle {
  if (typeof document === "undefined" || typeof Element === "undefined") return NOOP_HANDLE;
  if (typeof Element.prototype.attachShadow !== "function") return NOOP_HANDLE;
  const measurer = options.measurer === undefined ? getSharedCanvasMeasurer() : options.measurer;
  if (!measurer) return NOOP_HANDLE;
  const auto = new AutoStone(options.root ?? document, measurer, options);
  auto.start();
  return auto;
}
