/*
render/svg.ts — レイアウト結果を SVG に変換する（フレームワーク非依存）。

Swift 版は CoreText でグリフを直接描いていたが、Web ではブラウザのフォント描画をそのまま使う。
1 文字ごとに <text x y> を置き、縦書きの欧文は rotate(90)、和文は font-feature-settings の vert で縦組み用グリフに置き換える。
*/

import type { StoneContext } from "../context.js";
import type { Run, Size } from "../types.js";

/** 横書きの省略記号 (U+2026)。 */
export const HORIZONTAL_ELLIPSIS = "…";
/** 縦書きの省略記号 (U+FE19 PRESENTATION FORM FOR VERTICAL HORIZONTAL ELLIPSIS)。 */
export const VERTICAL_ELLIPSIS = "︙";

/** 縦組み用グリフを有効にする CSS 値。 */
export const VERTICAL_FEATURE_SETTINGS = '"vert" 1, "vrt2" 1';

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

const WHITESPACE_RE = /^\s+$/u;

/** 描画対象の run を描画要素に変換する。改行や空白、非表示の run は含まれない。 */
export function glyphElements(ctx: StoneContext): GlyphElement[] {
  const elements: GlyphElement[] = [];
  const size = ctx.adjustFontSize;
  for (let i = 0; i < ctx.runs.length; i++) {
    const run = ctx.runs[i];
    if (run.visibility === "invisible") continue;
    if (run.isNewline) continue;
    let text = run.char;
    if (run.visibility === "ellipsis") {
      text = ctx.direction === "lrTb" ? HORIZONTAL_ELLIPSIS : VERTICAL_ELLIPSIS;
    } else if (WHITESPACE_RE.test(text)) {
      continue;
    }
    const font = ctx.fontManager.font(run.fontId);
    elements.push({
      runId: i,
      run,
      x: run.position.x,
      y: run.position.y,
      text,
      fontId: run.fontId,
      fontFamily: font.family,
      fontSize: ctx.fontManager.scaledSize(run.fontId, size),
      fontWeight: font.weight,
      fontStyle: font.style,
      rotate: ctx.isClockwise(run) ? 90 : 0,
      vertical: ctx.usesVerticalGlyph(run),
      line: run.line,
    });
  }
  return elements;
}

/** 連続する同じフォント設定の描画要素をまとめる（<g> 1 つにつき font 属性 1 組）。 */
export function glyphGroups(ctx: StoneContext): GlyphGroup[] {
  const groups: GlyphGroup[] = [];
  let current: GlyphGroup | null = null;
  for (const el of glyphElements(ctx)) {
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
    parts.push(`<g fill="none" stroke="${escapeAttr(options.frameColor ?? "rgba(0,128,255,0.6)")}" stroke-width="1">`);
    for (const run of ctx.runs) {
      if (run.visibility === "invisible") continue;
      const f = run.frame;
      parts.push(`<rect x="${num(f.x)}" y="${num(f.y)}" width="${num(f.width)}" height="${num(f.height)}"/>`);
    }
    parts.push("</g>");
  }

  for (const group of glyphGroups(ctx)) {
    const gAttrs = [
      `font-family="${escapeAttr(group.fontFamily)}"`,
      `font-size="${num(group.fontSize)}"`,
      `font-weight="${escapeAttr(String(group.fontWeight))}"`,
      `font-style="${escapeAttr(group.fontStyle)}"`,
    ];
    if (group.vertical) gAttrs.push(`style="font-feature-settings:${escapeAttr(VERTICAL_FEATURE_SETTINGS)}"`);
    parts.push(`<g ${gAttrs.join(" ")}>`);
    for (const el of group.glyphs) {
      const transform = el.rotate ? ` transform="rotate(90 ${num(el.x)} ${num(el.y)})"` : "";
      parts.push(
        `<text x="${num(el.x)}" y="${num(el.y)}"${transform} data-run="${el.runId}">${escapeText(el.text)}</text>`,
      );
    }
    parts.push("</g>");
  }

  parts.push("</svg>");
  return parts.join("");
}
