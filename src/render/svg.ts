/*
render/svg.ts — レイアウト結果を SVG に変換する（フレームワーク非依存）。

Swift 版は CoreText でグリフを直接描いていたが、Web ではブラウザのフォント描画をそのまま使う。
1 文字ごとに <tspan x y> を置き、縦書きの欧文は rotate="90"、和文は font-feature-settings の vert で縦組み用グリフに置き換える。
縦書きの和文の引用符「“」「”」「‘」「’」は、fwid で全角の字形にしてから vert で縦組み用グリフ（〝〟の形）にする。
vert が効かない Safari などの WebKit では、縦組み用グリフを横組みのグリフの回転と移動で描く（render/vertical.ts）。
リンク・文字色の範囲（render/spans.ts）は、その範囲の文字の <tspan> を <a> / <tspan> で囲み、線は <text> の後ろに矩形で描く。

<text> は改行で区切った段落ごとに 1 つにまとめる。Chrome / Safari は SVG の <text> をブロックとして扱い、
選択範囲をコピーするときに <text> の境目ごとに改行を入れるため、1 文字ごとに <text> を分けると
コピーしたテキストが 1 文字ずつ改行されてしまう（縦書きのようになる）。
空白の run も <tspan> として xml:space="preserve" で残し、コピーしたときに単語間の空白が消えないようにする。
*/

import type { StoneContext } from "../context.js";
import { HORIZONTAL_ELLIPSIS, isSpaceChar, VERTICAL_ELLIPSIS } from "../punctuation.js";
import { SCRIPTS, type Run, type Size } from "../types.js";
import { columnLeft, decorationRects, spanStacks, type StoneSpan } from "./spans.js";
import { resolveVerticalForms, verticalGlyphTransform, type VerticalForms, type VerticalFormsOption } from "./vertical.js";

/** 和文フォントの ID（フォント ID は SCRIPTS の添字と一致する）。縦書きの省略記号はこのフォントで描く。 */
const JAPANESE_FONT_ID = SCRIPTS.indexOf("japanese");

/** 縦組み用グリフを有効にする CSS 値。 */
export const VERTICAL_FEATURE_SETTINGS = '"vert" 1, "vrt2" 1';

/**
 * 全角の字形の縦組み用グリフを使う CSS 値（縦書きの和文の引用符）。和文フォント（ヒラギノなど）の「“」などはプロポーショナルな
 * 字形で、vert の置き換え先がない（vrt2 だと回転した字形になる）。全角の字形（fwid）には縦組み用グリフ（〝〟の形）がある。
 */
export const FULL_WIDTH_VERTICAL_FEATURE_SETTINGS = '"fwid" 1, "vert" 1, "vrt2" 1';

/** 全角の字形だけを使う CSS 値（vert を使わずに回して描く縦書きの和文の引用符）。 */
export const FULL_WIDTH_FEATURE_SETTINGS = '"fwid" 1';

/** showFrames で描く矩形の既定の色。 */
export const DEFAULT_FRAME_COLOR = "rgba(0,128,255,0.6)";

export interface GlyphElement {
  runId: number;
  run: Run;
  /** グリフ原点（ベースライン左端）の x。 */
  x: number;
  /** ベースラインの y。 */
  y: number;
  /** 描画する文字列（省略記号に置き換わることがある）。 */
  text: string;
  fontId: number;
  fontFamily: string;
  /** 文字種スケール適用後のフォントサイズ（px）。 */
  fontSize: number;
  fontWeight: number | string;
  fontStyle: string;
  /** 縦書きで 90 度時計回りに回転する場合 90。 */
  rotate: 0 | 90;
  /** 縦組み用グリフ（vert）を使う。 */
  vertical: boolean;
  /** 全角の字形（fwid）を使う（縦書きの和文の引用符）。 */
  fullWidth: boolean;
  line: number;
  /** この文字を含む範囲（GlyphOptions の spans の添字、外側から順）。 */
  spans: readonly number[];
}

export interface GlyphGroup {
  fontId: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fontStyle: string;
  vertical: boolean;
  /** 全角の字形（fwid）を使う。 */
  fullWidth: boolean;
  /** グループの文字を含む範囲（GlyphOptions の spans の添字、外側から順）。 */
  spans: readonly number[];
  glyphs: GlyphElement[];
}

/** 描画要素の作り方。 */
export interface GlyphOptions {
  /** 縦書きの和文の縦組み用グリフの描き方（render/vertical.ts）。既定 "auto"（ブラウザに合わせる）。 */
  verticalForms?: VerticalFormsOption;
  /** リンク・文字色などを付ける範囲（render/spans.ts）。範囲が変わるところでグループを分ける。 */
  spans?: readonly StoneSpan[];
}

/** 改行で区切られた段落。SVG では段落ごとに 1 つの <text> にする。 */
export interface GlyphParagraph {
  /** 段落内の描画要素を、連続する同じフォント設定ごとにまとめたもの。 */
  groups: GlyphGroup[];
}

/** 描画要素の位置・フォント・向き。ふつうは run のものだが、省略記号は違うことがある。 */
type GlyphPlacement = Pick<GlyphElement, "x" | "y" | "fontId" | "rotate" | "vertical" | "fullWidth">;

/** run の描画要素を作る。text は実際に描く文字列。 */
function glyphElement(ctx: StoneContext, runId: number, text: string, placement: GlyphPlacement): GlyphElement {
  const run = ctx.runs[runId];
  const font = ctx.fontManager.font(placement.fontId);
  return {
    runId,
    run,
    x: placement.x,
    y: placement.y,
    text,
    fontId: placement.fontId,
    fontFamily: font.family,
    fontSize: ctx.fontManager.scaledSize(placement.fontId, ctx.adjustFontSize),
    fontWeight: font.weight,
    fontStyle: font.style,
    rotate: placement.rotate,
    vertical: placement.vertical,
    fullWidth: placement.fullWidth,
    line: run.line,
    spans: NO_SPANS,
  };
}

const NO_SPANS: readonly number[] = [];

/** run をそのフォント・位置で描く描画要素にする。text は実際に描く文字列。 */
function toGlyphElement(ctx: StoneContext, runId: number, text: string, forms: VerticalForms): GlyphElement {
  const run = ctx.runs[runId];
  const placement: GlyphPlacement = {
    x: run.position.x,
    y: run.position.y,
    fontId: run.fontId,
    rotate: ctx.isClockwise(run) ? 90 : 0,
    vertical: ctx.usesVerticalGlyph(run),
    fullWidth: ctx.usesFullWidthGlyph(run),
  };
  if (forms === "emulated" && placement.vertical) emulateVerticalGlyph(ctx, run, placement);
  return glyphElement(ctx, runId, text, placement);
}

/**
 * vert を使わずに、縦組み用グリフを横組みのグリフの回転と移動で描くよう placement を書き換える（render/vertical.ts）。
 * 回転は em ボックス（グリフ原点の上 ascent から 1em 四方）の中心で回す。rotate 属性はグリフ原点を中心に回すので、
 * 原点を (x + 1em − ascent, y − ascent) に移してから 90 度回すと、回した字形が元の em ボックスにちょうど重なる。
 */
function emulateVerticalGlyph(ctx: StoneContext, run: Run, placement: GlyphPlacement): void {
  placement.vertical = false;
  const transform = verticalGlyphTransform(run.char, placement.fullWidth);
  if (!transform) return;
  const em = ctx.fontManager.scaledSize(run.fontId, ctx.adjustFontSize);
  if (transform.type === "rotate") {
    const ascent = ctx.fontManager.ascent(run.fontId, ctx.adjustFontSize);
    placement.x += em - ascent;
    placement.y -= ascent;
    placement.rotate = 90;
  } else {
    placement.x += transform.dx * em;
    placement.y += transform.dy * em;
  }
}

/**
 * 省略記号になった run の描画要素。省略記号は run の矩形の先頭から描く（約物の詰めでずらしたグリフの位置は使わない）。
 * 横書きは run と同じフォントの「…」。縦書きは run の文字種にかかわらず、和文フォントの正立の「︙」を列の 1em 四方に描く
 * （回転する欧文の run と一緒に回すと点が横に並び、縦中横の位置に描くと列の中央からずれる）。
 * レイアウトは、この大きさの省略記号が領域に収まる run を選んでいる（Layouter の updateVisibility）。
 */
function toEllipsisElement(ctx: StoneContext, runId: number): GlyphElement {
  const run = ctx.runs[runId];
  if (ctx.direction === "lrTb") {
    return glyphElement(ctx, runId, HORIZONTAL_ELLIPSIS, {
      x: run.frame.x,
      y: run.position.y,
      fontId: run.fontId,
      rotate: 0,
      vertical: false,
      fullWidth: false,
    });
  }
  const size = ctx.adjustFontSize;
  return glyphElement(ctx, runId, VERTICAL_ELLIPSIS, {
    x: columnLeft(ctx, run),
    y: run.frame.y + size - ctx.fontManager.descent(JAPANESE_FONT_ID, size),
    fontId: JAPANESE_FONT_ID,
    rotate: 0,
    vertical: true,
    fullWidth: false,
  });
}

/** 描画要素に、その文字を含む範囲を付ける。 */
function withSpans(el: GlyphElement, stacks: number[][]): GlyphElement {
  const stack = stacks[el.runId];
  if (stack && stack.length > 0) el.spans = stack;
  return el;
}

/** 描画対象の run を描画要素に変換する。改行や空白、非表示の run は含まれない。 */
export function glyphElements(ctx: StoneContext, options: GlyphOptions = {}): GlyphElement[] {
  const forms = resolveVerticalForms(options.verticalForms);
  const stacks = spanStacks(ctx, options.spans);
  const elements: GlyphElement[] = [];
  for (let i = 0; i < ctx.runs.length; i++) {
    const run = ctx.runs[i];
    if (run.visibility === "invisible") continue;
    if (run.isNewline) continue;
    if (run.visibility === "ellipsis") {
      elements.push(withSpans(toEllipsisElement(ctx, i), stacks));
    } else if (!isSpaceChar(run.char)) {
      elements.push(withSpans(toGlyphElement(ctx, i, run.char, forms), stacks));
    }
  }
  return elements;
}

/**
 * 描画要素を段落（改行で区切られた範囲）ごとにまとめる。SVG の出力はこれを使う。
 * glyphElements と違って空白の run も含める（見た目は変わらないが、選択してコピーしたときに空白が残る）。
 * 空行は、その行の改行の run を空白 1 つとして置く（コピーしたときに空行が詰まらないように）。
 */
export function glyphParagraphs(ctx: StoneContext, options: GlyphOptions = {}): GlyphParagraph[] {
  const forms = resolveVerticalForms(options.verticalForms);
  const stacks = spanStacks(ctx, options.spans);
  const paragraphs: GlyphParagraph[] = [];
  let glyphs: GlyphElement[] = [];
  for (let i = 0; i < ctx.runs.length; i++) {
    const run = ctx.runs[i];
    if (run.isNewline) {
      if (glyphs.length === 0 && run.visibility === "visible") glyphs.push(toGlyphElement(ctx, i, " ", forms)); // 空行は範囲に含めない
      if (glyphs.length > 0) paragraphs.push({ groups: groupGlyphs(glyphs) });
      glyphs = [];
      continue;
    }
    if (run.visibility === "invisible") continue;
    const el = run.visibility === "ellipsis" ? toEllipsisElement(ctx, i) : toGlyphElement(ctx, i, run.char, forms);
    glyphs.push(withSpans(el, stacks));
  }
  if (glyphs.length > 0) paragraphs.push({ groups: groupGlyphs(glyphs) });
  return paragraphs;
}

/** glyphElements の結果を、連続する同じフォント設定ごとにまとめる（段落には分けない）。 */
export function glyphGroups(ctx: StoneContext, options: GlyphOptions = {}): GlyphGroup[] {
  return groupGlyphs(glyphElements(ctx, options));
}

/** 2 つの範囲の並び（外側から順の添字）が同じかどうか。 */
function sameStack(a: readonly number[], b: readonly number[]): boolean {
  return a === b || (a.length === b.length && a.every((v, i) => v === b[i]));
}

/** 連続する同じフォント設定・同じ範囲の描画要素をまとめる（font 属性 1 組ごと）。 */
function groupGlyphs(elements: GlyphElement[]): GlyphGroup[] {
  const groups: GlyphGroup[] = [];
  let current: GlyphGroup | null = null;
  for (const el of elements) {
    if (
      current &&
      current.fontId === el.fontId &&
      current.vertical === el.vertical &&
      current.fullWidth === el.fullWidth &&
      current.fontSize === el.fontSize &&
      sameStack(current.spans, el.spans)
    ) {
      current.glyphs.push(el);
      continue;
    }
    current = {
      fontId: el.fontId,
      fontFamily: el.fontFamily,
      fontSize: el.fontSize,
      fontWeight: el.fontWeight,
      fontStyle: el.fontStyle,
      vertical: el.vertical,
      fullWidth: el.fullWidth,
      spans: el.spans,
      glyphs: [el],
    };
    groups.push(current);
  }
  return groups;
}

/** 段落の中身の木。範囲（span）の節は、その範囲の文字のグループ（と内側の範囲）を子に持つ。 */
export type GlyphNode = { type: "span"; span: number; children: GlyphNode[] } | { type: "group"; group: GlyphGroup };

/**
 * 段落のグループを、範囲の入れ子に沿った木にする（SVG の <a> / <tspan> の入れ子）。
 * 入れ子にならない範囲どうしが重なるときは、外側の範囲を閉じて開き直すので、同じ範囲の節が複数できることがある。
 */
export function nestGlyphGroups(groups: readonly GlyphGroup[]): GlyphNode[] {
  const root: GlyphNode[] = [];
  const open: { span: number; children: GlyphNode[] }[] = [];
  for (const group of groups) {
    let common = 0;
    while (common < open.length && common < group.spans.length && open[common].span === group.spans[common]) common++;
    open.length = common;
    for (let i = common; i < group.spans.length; i++) {
      const node: GlyphNode = { type: "span", span: group.spans[i], children: [] };
      (open.length > 0 ? open[open.length - 1].children : root).push(node);
      open.push(node);
    }
    (open.length > 0 ? open[open.length - 1].children : root).push({ type: "group", group });
  }
  return root;
}

/** リンク先として使ってよい URL かどうか。スクリプトを実行する javascript: などは使わない。 */
export function isSafeHref(href: string): boolean {
  // ブラウザは URL の前後の空白と途中のタブ・改行を無視するので、取り除いてから見る
  const normalized = href.replace(/[\u0000-\u0020\u007f]/g, "").toLowerCase();
  return !/^(?:javascript|vbscript|data):/.test(normalized);
}

/** グループに指定する font-feature-settings。指定しないなら null。 */
export function fontFeatureSettingsOf(group: GlyphGroup): string | null {
  if (group.fullWidth) return group.vertical ? FULL_WIDTH_VERTICAL_FEATURE_SETTINGS : FULL_WIDTH_FEATURE_SETTINGS;
  return group.vertical ? VERTICAL_FEATURE_SETTINGS : null;
}

/** 幅と高さの両方が固定なら、Swift 版の STLabel と同じく領域外を切り取る。 */
export function svgOverflow(ctx: StoneContext): "hidden" | "visible" {
  return Number.isFinite(ctx.renderSize.width) && Number.isFinite(ctx.renderSize.height) ? "hidden" : "visible";
}

/** SVG 要素のサイズ。有限のレイアウト領域はその大きさ、無限（自動）の方向は実際の描画サイズを使う。 */
export function svgSize(ctx: StoneContext): Size {
  const rs = ctx.renderSize;
  const rd = ctx.renderedSize;
  return {
    width: Math.ceil(Number.isFinite(rs.width) ? rs.width : rd.width),
    height: Math.ceil(Number.isFinite(rs.height) ? rs.height : rd.height),
  };
}

export interface SvgStringOptions {
  /** 文字色。既定 currentColor。 */
  color?: string;
  /** 各 run の frame を矩形で描く（デバッグ用）。 */
  showFrames?: boolean;
  frameColor?: string;
  className?: string;
  /** svg 要素に付ける追加属性。 */
  attributes?: Record<string, string | number>;
  /**
   * 縦書きの和文の縦組み用グリフの描き方。"feature" は font-feature-settings の vert、"emulated" は横組みのグリフの
   * 回転と移動で代用する（vert が効かない Safari などの WebKit 用）。既定 "auto"（ブラウザに合わせる）。
   */
  verticalForms?: VerticalFormsOption;
  /** リンク・文字色・線を付ける範囲（元のテキストの位置で指定する）。 */
  spans?: readonly StoneSpan[];
}

/** テキストノード用に & < > をエスケープする。 */
function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 属性値用にエスケープする（escapeText に加えて二重引用符）。 */
function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

/** 座標を小数 2 桁に丸めた文字列にする。 */
function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 属性名として許す形。空白・引用符・記号による属性の注入を防ぐ。 */
const ATTR_NAME_RE = /^[A-Za-z_:][-A-Za-z0-9_:.]*$/;

/** 追加属性として出力してよい名前かどうか。不正な名前とイベントハンドラ（on*）は拒否する。 */
export function isSafeSvgAttributeName(name: string): boolean {
  return ATTR_NAME_RE.test(name) && !/^on/i.test(name);
}

/** レイアウト結果を SVG 文字列にする（innerHTML や SSR で使う）。attributes の不正な名前は無視する。 */
export function svgString(ctx: StoneContext, options: SvgStringOptions = {}): string {
  const size = svgSize(ctx);
  const color = options.color ?? "currentColor";
  const parts: string[] = [];
  const attrs: string[] = [
    'xmlns="http://www.w3.org/2000/svg"',
    `width="${size.width}"`,
    `height="${size.height}"`,
    `viewBox="0 0 ${size.width} ${size.height}"`,
    `class="${escapeAttr(options.className ?? "stone-svg")}"`,
    `style="display:block;overflow:${svgOverflow(ctx)};fill:${escapeAttr(color)};font-variant-ligatures:none;font-kerning:none"`,
    'aria-hidden="true"',
  ];
  for (const [k, v] of Object.entries(options.attributes ?? {})) {
    if (!isSafeSvgAttributeName(k)) continue;
    attrs.push(`${k}="${escapeAttr(String(v))}"`);
  }
  parts.push(`<svg ${attrs.join(" ")}>`);

  if (options.showFrames) {
    parts.push(`<g fill="none" stroke="${escapeAttr(options.frameColor ?? DEFAULT_FRAME_COLOR)}" stroke-width="1">`);
    for (const run of ctx.runs) {
      if (run.visibility === "invisible") continue;
      const f = run.frame;
      parts.push(`<rect x="${num(f.x)}" y="${num(f.y)}" width="${num(f.width)}" height="${num(f.height)}"/>`);
    }
    parts.push("</g>");
  }

  const spans = options.spans ?? [];
  const writeGroup = (group: GlyphGroup): void => {
    const gAttrs = [
      `font-family="${escapeAttr(group.fontFamily)}"`,
      `font-size="${num(group.fontSize)}"`,
      `font-weight="${escapeAttr(String(group.fontWeight))}"`,
      `font-style="${escapeAttr(group.fontStyle)}"`,
    ];
    const features = fontFeatureSettingsOf(group);
    if (features) gAttrs.push(`style="font-feature-settings:${escapeAttr(features)}"`);
    parts.push(`<tspan ${gAttrs.join(" ")}>`);
    for (const el of group.glyphs) {
      // rotate 属性はグリフをその原点（x, y）を中心に回す。1 文字ごとの <text> に transform="rotate(90 x y)" を付けたのと同じ見た目になる
      const rotate = el.rotate ? ` rotate="${el.rotate}"` : "";
      parts.push(
        `<tspan x="${num(el.x)}" y="${num(el.y)}"${rotate} data-run="${el.runId}">${escapeText(el.text)}</tspan>`,
      );
    }
    parts.push("</tspan>");
  };
  const writeNodes = (nodes: GlyphNode[]): void => {
    for (const node of nodes) {
      if (node.type === "group") {
        writeGroup(node.group);
        continue;
      }
      const span = spans[node.span];
      const link = span.href !== undefined && isSafeHref(span.href);
      const sAttrs = [`data-span="${node.span}"`];
      if (link) {
        sAttrs.unshift(`href="${escapeAttr(span.href as string)}"`);
        if (span.target) sAttrs.push(`target="${escapeAttr(span.target)}"`);
        if (span.rel) sAttrs.push(`rel="${escapeAttr(span.rel)}"`);
      }
      if (span.className) sAttrs.push(`class="${escapeAttr(span.className)}"`);
      if (span.color) sAttrs.push(`fill="${escapeAttr(span.color)}"`);
      const tag = link ? "a" : "tspan";
      parts.push(`<${tag} ${sAttrs.join(" ")}>`);
      writeNodes(node.children);
      parts.push(`</${tag}>`);
    }
  };

  for (const paragraph of glyphParagraphs(ctx, { verticalForms: options.verticalForms, spans })) {
    parts.push('<text xml:space="preserve">');
    writeNodes(nestGlyphGroups(paragraph.groups));
    parts.push("</text>");
  }

  const decorations = decorationRects(ctx, spans);
  if (decorations.length > 0) {
    parts.push('<g class="stone-decorations" pointer-events="none">');
    for (const d of decorations) {
      const fill = d.color ? ` fill="${escapeAttr(d.color)}"` : "";
      parts.push(
        `<rect x="${num(d.x)}" y="${num(d.y)}" width="${num(d.width)}" height="${num(d.height)}"${fill} data-span="${d.spanIndex}"/>`,
      );
    }
    parts.push("</g>");
  }

  parts.push("</svg>");
  return parts.join("");
}
