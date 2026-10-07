/*
render/svg.ts — レイアウト結果を SVG に変換する（フレームワーク非依存）。

Swift 版は CoreText でグリフを直接描いていたが、Web ではブラウザのフォント描画をそのまま使う。
1 文字ごとに <tspan x y> を置き、縦書きの欧文は rotate="90"、和文は font-feature-settings の vert で縦組み用グリフに置き換える。

<text> は改行で区切った段落ごとに 1 つにまとめる。Chrome / Safari は SVG の <text> をブロックとして扱い、
選択範囲をコピーするときに <text> の境目ごとに改行を入れるため、1 文字ごとに <text> を分けると
コピーしたテキストが 1 文字ずつ改行されてしまう（縦書きのようになる）。
空白の run も <tspan> として xml:space="preserve" で残し、コピーしたときに単語間の空白が消えないようにする。
*/

import type { StoneContext } from "../context.js";
import { isSpaceChar } from "../punctuation.js";
import type { Run, Size } from "../types.js";

/** 横書きの省略記号 (U+2026)。 */
export const HORIZONTAL_ELLIPSIS = "…";
/** 縦書きの省略記号 (U+FE19 PRESENTATION FORM FOR VERTICAL HORIZONTAL ELLIPSIS)。 */
export const VERTICAL_ELLIPSIS = "︙";

/** 縦組み用グリフを有効にする CSS 値。 */
export const VERTICAL_FEATURE_SETTINGS = '"vert" 1, "vrt2" 1';

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
  line: number;
}

export interface GlyphGroup {
  fontId: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fontStyle: string;
  vertical: boolean;
  glyphs: GlyphElement[];
}

/** 改行で区切られた段落。SVG では段落ごとに 1 つの <text> にする。 */
export interface GlyphParagraph {
  /** 段落内の描画要素を、連続する同じフォント設定ごとにまとめたもの。 */
  groups: GlyphGroup[];
}

/** run を描画要素にする。text は実際に描く文字列。 */
function toGlyphElement(ctx: StoneContext, runId: number, text: string): GlyphElement {
  const run = ctx.runs[runId];
  const font = ctx.fontManager.font(run.fontId);
  return {
    runId,
    run,
    x: run.position.x,
    y: run.position.y,
    text,
    fontId: run.fontId,
    fontFamily: font.family,
    fontSize: ctx.fontManager.scaledSize(run.fontId, ctx.adjustFontSize),
    fontWeight: font.weight,
    fontStyle: font.style,
    rotate: ctx.isClockwise(run) ? 90 : 0,
    vertical: ctx.usesVerticalGlyph(run),
    line: run.line,
  };
}

/** 省略記号になった run に描く文字。 */
function ellipsisOf(ctx: StoneContext): string {
  return ctx.direction === "lrTb" ? HORIZONTAL_ELLIPSIS : VERTICAL_ELLIPSIS;
}

/** 描画対象の run を描画要素に変換する。改行や空白、非表示の run は含まれない。 */
export function glyphElements(ctx: StoneContext): GlyphElement[] {
  const elements: GlyphElement[] = [];
  for (let i = 0; i < ctx.runs.length; i++) {
    const run = ctx.runs[i];
    if (run.visibility === "invisible") continue;
    if (run.isNewline) continue;
    if (run.visibility === "ellipsis") {
      elements.push(toGlyphElement(ctx, i, ellipsisOf(ctx)));
    } else if (!isSpaceChar(run.char)) {
      elements.push(toGlyphElement(ctx, i, run.char));
    }
  }
  return elements;
}

/**
 * 描画要素を段落（改行で区切られた範囲）ごとにまとめる。SVG の出力はこれを使う。
 * glyphElements と違って空白の run も含める（見た目は変わらないが、選択してコピーしたときに空白が残る）。
 * 空行は、その行の改行の run を空白 1 つとして置く（コピーしたときに空行が詰まらないように）。
 */
export function glyphParagraphs(ctx: StoneContext): GlyphParagraph[] {
  const paragraphs: GlyphParagraph[] = [];
  let glyphs: GlyphElement[] = [];
  for (let i = 0; i < ctx.runs.length; i++) {
    const run = ctx.runs[i];
    if (run.isNewline) {
      if (glyphs.length === 0 && run.visibility === "visible") glyphs.push(toGlyphElement(ctx, i, " "));
      if (glyphs.length > 0) paragraphs.push({ groups: groupGlyphs(glyphs) });
      glyphs = [];
      continue;
    }
    if (run.visibility === "invisible") continue;
    glyphs.push(toGlyphElement(ctx, i, run.visibility === "ellipsis" ? ellipsisOf(ctx) : run.char));
  }
  if (glyphs.length > 0) paragraphs.push({ groups: groupGlyphs(glyphs) });
  return paragraphs;
}

/** glyphElements の結果を、連続する同じフォント設定ごとにまとめる（段落には分けない）。 */
export function glyphGroups(ctx: StoneContext): GlyphGroup[] {
  return groupGlyphs(glyphElements(ctx));
}

/** 連続する同じフォント設定の描画要素をまとめる（font 属性 1 組ごと）。 */
function groupGlyphs(elements: GlyphElement[]): GlyphGroup[] {
  const groups: GlyphGroup[] = [];
  let current: GlyphGroup | null = null;
  for (const el of elements) {
    if (
      current &&
      current.fontId === el.fontId &&
      current.vertical === el.vertical &&
      current.fontSize === el.fontSize
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
      glyphs: [el],
    };
    groups.push(current);
  }
  return groups;
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

  for (const paragraph of glyphParagraphs(ctx)) {
    parts.push('<text xml:space="preserve">');
    for (const group of paragraph.groups) {
      const gAttrs = [
        `font-family="${escapeAttr(group.fontFamily)}"`,
        `font-size="${num(group.fontSize)}"`,
        `font-weight="${escapeAttr(String(group.fontWeight))}"`,
        `font-style="${escapeAttr(group.fontStyle)}"`,
      ];
      if (group.vertical) gAttrs.push(`style="font-feature-settings:${escapeAttr(VERTICAL_FEATURE_SETTINGS)}"`);
      parts.push(`<tspan ${gAttrs.join(" ")}>`);
      for (const el of group.glyphs) {
        // rotate 属性はグリフをその原点（x, y）を中心に回す。1 文字ごとの <text> に transform="rotate(90 x y)" を付けたのと同じ見た目になる
        const rotate = el.rotate ? ` rotate="${el.rotate}"` : "";
        parts.push(
          `<tspan x="${num(el.x)}" y="${num(el.y)}"${rotate} data-run="${el.runId}">${escapeText(el.text)}</tspan>`,
        );
      }
      parts.push("</tspan>");
    }
    parts.push("</text>");
  }

  parts.push("</svg>");
  return parts.join("");
}
