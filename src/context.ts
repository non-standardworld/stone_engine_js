/*
context.ts — レイアウトの設定と結果を保持するコンテキスト。Swift 版 STContext.swift に対応。
*/

import { FontManager, resolveFonts } from "./fonts.js";
import type {
  Direction,
  DirectionAlign,
  FontMeasurer,
  Point,
  PunctuationMode,
  Rect,
  ResolvedFont,
  Run,
  Size,
  StoneOptions,
  TextAlign,
  Token,
} from "./types.js";
import { notNeedsToClockwiseInTbRl } from "./unicode.js";

export const DEFAULT_OPTIONS: Required<Omit<StoneOptions, "fonts">> = {
  fontSize: 17,
  lineHeightScale: 1.0,
  textAlign: "leading",
  directionAlign: "start",
  direction: "lrTb",
  allowsTateChuYoko: true,
  adjustsFontSizeToFitWidth: false,
  minimumScaleFactor: 0,
  punctuationMode: "stone",
  kinsoku: true,
  dividesByWords: true,
};

export interface LineRange {
  line: number;
  /** この行の最初の run ID。 */
  start: number;
  /** この行の最後の run ID + 1。 */
  end: number;
}

function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function distance(rect: Rect, point: Point): number {
  const dx = point.x - (rect.x + rect.width * 0.5);
  const dy = point.y - (rect.y + rect.height * 0.5);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * レイアウトの入力（設定・フォント）と出力（runs / tokens / 行数 / 描画サイズ）をまとめたもの。
 * layoutText() が返すのはこのオブジェクト。座標系は左上原点・y 下向き・px。
 */
export class StoneContext {
  // Runs
  runs: Run[] = [];
  tokens: Token[] = [];
  lineCount = 0;

  // Font
  readonly fonts: ResolvedFont[];
  readonly fontManager: FontManager;

  // Layout
  fontSize: number;
  lineHeightScale: number;
  textAlign: TextAlign;
  directionAlign: DirectionAlign;
  direction: Direction;
  allowsTateChuYoko: boolean;
  adjustsFontSizeToFitWidth: boolean;
  minimumScaleFactor: number;

  /** adjustsFontSizeToFitWidth で決まった縮小率。 */
  adjustFontScale = 1;

  // Features
  punctuationMode: PunctuationMode;
  kinsoku: boolean;
  dividesByWords: boolean;

  // Render
  /** レイアウト対象の領域。無限（Infinity）なら折り返し／切り詰めなし。 */
  renderSize: Size = { width: Infinity, height: Infinity };
  /** 実際にテキストが占めるサイズ。 */
  renderedSize: Size = { width: 0, height: 0 };

  constructor(options: StoneOptions, measurer: FontMeasurer) {
    this.fontSize = options.fontSize ?? DEFAULT_OPTIONS.fontSize;
    this.lineHeightScale = options.lineHeightScale ?? DEFAULT_OPTIONS.lineHeightScale;
    this.textAlign = options.textAlign ?? DEFAULT_OPTIONS.textAlign;
    this.directionAlign = options.directionAlign ?? DEFAULT_OPTIONS.directionAlign;
    this.direction = options.direction ?? DEFAULT_OPTIONS.direction;
    this.allowsTateChuYoko = options.allowsTateChuYoko ?? DEFAULT_OPTIONS.allowsTateChuYoko;
    this.adjustsFontSizeToFitWidth =
      options.adjustsFontSizeToFitWidth ?? DEFAULT_OPTIONS.adjustsFontSizeToFitWidth;
    this.minimumScaleFactor = options.minimumScaleFactor ?? DEFAULT_OPTIONS.minimumScaleFactor;
    this.punctuationMode = options.punctuationMode ?? DEFAULT_OPTIONS.punctuationMode;
    this.kinsoku = options.kinsoku ?? DEFAULT_OPTIONS.kinsoku;
    this.dividesByWords = options.dividesByWords ?? DEFAULT_OPTIONS.dividesByWords;
    this.fonts = resolveFonts(options.fonts);
    this.fontManager = new FontManager(this.fonts, measurer);
  }

  get lineHeight(): number {
    return this.fontSize * this.lineHeightScale;
  }

  get lineGapHeight(): number {
    return this.fontSize * (this.lineHeightScale - 1);
  }

  /** 縮小適用後のフォントサイズ。 */
  get adjustFontSize(): number {
    return this.fontSize * this.adjustFontScale;
  }

  get adjustLineHeight(): number {
    return this.adjustFontSize * this.lineHeightScale;
  }

  /** 元のテキスト。 */
  get text(): string {
    let s = "";
    for (const run of this.runs) s += run.char;
    return s;
  }

  //--------------------------------------------------------------//
  // Advance
  //--------------------------------------------------------------//

  advanceOfToken(token: Token): number {
    let total = 0;
    for (let i = token.start; i < token.end; i++) total += this.runs[i].advance;
    return total;
  }

  //--------------------------------------------------------------//
  // Token and run
  //--------------------------------------------------------------//

  isLastInToken(run: Run): boolean {
    const token = this.tokens[run.tokenId];
    return run.tokenRunIndex >= token.end - token.start - 1;
  }

  /** 指定行に属する run ID の範囲 [start, end)。行に run が無ければ null。 */
  runRangeOfLine(line: number): [number, number] | null {
    let lower = -1;
    let upper = -1;
    for (let i = 0; i < this.runs.length; i++) {
      const run = this.runs[i];
      if (run.line === line) {
        if (lower === -1) lower = i;
        upper = i;
      } else if (run.line > line) {
        break;
      }
    }
    if (lower === -1) return null;
    return [lower, upper + 1];
  }

  /** 行ごとの run 範囲。空行は含まれない。 */
  lineRanges(): LineRange[] {
    const ranges: LineRange[] = [];
    let current: LineRange | null = null;
    for (let i = 0; i < this.runs.length; i++) {
      const line = this.runs[i].line;
      if (current && current.line === line) {
        current.end = i + 1;
      } else {
        current = { line, start: i, end: i + 1 };
        ranges.push(current);
      }
    }
    return ranges;
  }

  lineOf(runId: number): number {
    if (this.runs.length === 0) return 0;
    if (runId < this.runs.length - 1) return this.runs[runId].line;
    return this.runs[this.runs.length - 1].line;
  }

  isNewlineAt(runId: number): boolean {
    if (this.runs.length === 0) return false;
    if (runId < this.runs.length - 1) return this.runs[runId].isNewline;
    return this.runs[this.runs.length - 1].isNewline;
  }

  tokenString(tokenId: number): string | null {
    const token = this.tokens[tokenId];
    if (!token) return null;
    let s = "";
    for (let i = token.start; i < token.end; i++) s += this.runs[i].char;
    return s;
  }

  //--------------------------------------------------------------//
  // Geometry
  //--------------------------------------------------------------//

  /** 行の先頭位置（run が無い行のカーソル位置などに使う）。 */
  firstRunFrame(line: number): Rect {
    if (this.direction === "lrTb") {
      return { x: 0, y: line * this.lineHeight, width: 0, height: this.fontSize };
    }
    return {
      x: this.renderedSize.width - line * this.lineHeight - this.fontSize,
      y: 0,
      width: this.fontSize,
      height: 0,
    };
  }

  /** 行間を含めた run の矩形（選択範囲の描画などに使う）。 */
  runFrameWithLineGap(index: number): Rect {
    const run = this.runs[index];
    if (run.line === 0) return { ...run.frame };
    if (this.direction === "lrTb") {
      return {
        x: run.frame.x,
        y: run.frame.y - this.lineGapHeight,
        width: run.frame.width,
        height: run.frame.height + this.lineGapHeight,
      };
    }
    return {
      x: run.frame.x,
      y: run.frame.y,
      width: run.frame.width + this.lineGapHeight,
      height: run.frame.height,
    };
  }

  private closestRunIndexH(point: Point, range: [number, number] | null): number {
    const isAll = range === null;
    const [lo, hi] = range ?? [0, this.runs.length];

    // 最も近い行
    let minDy = Infinity;
    let line = -1;
    for (let i = lo; i < hi; i++) {
      if (this.runs[i].line === line) continue;
      const runFrame = this.firstRunFrame(this.runs[i].line);
      const dy = Math.abs(point.y - (runFrame.y + runFrame.height * 0.5));
      if (dy >= minDy) continue;
      minDy = dy;
      line = this.runs[i].line;
    }
    if (line === -1) line = 0;

    if (isAll && this.isNewlineAt(hi) && line < this.lineCount) {
      const runFrame = this.firstRunFrame(this.lineCount - 1);
      const dy = Math.abs(point.y - (runFrame.y + runFrame.height * 0.5));
      if (dy < minDy) {
        minDy = dy;
        line = this.lineCount - 1;
      }
    }

    // 最も近い run
    let minDistance = Infinity;
    let index = 0;
    for (let i = lo; i < hi; i++) {
      const run = this.runs[i];
      if (run.line < line - 1 || run.line > line + 1) continue;
      const f = run.frame;
      if (run.isNewline) {
        const d = distance(f, point);
        if (d < minDistance) {
          minDistance = d;
          index = i;
        }
      } else {
        const first: Rect = { x: f.x, y: f.y, width: f.width * 0.5, height: f.height };
        const fd = distance(first, point);
        if (fd < minDistance) {
          minDistance = fd;
          index = i;
        }
        const second: Rect = { x: f.x + f.width * 0.5, y: f.y, width: f.width * 0.5, height: f.height };
        const sd = distance(second, point);
        if (sd < minDistance) {
          minDistance = sd;
          index = i + 1;
        }
      }
    }
    if (minDistance === Infinity) index = this.runs.length;
    return index;
  }

  private closestRunIndexV(point: Point, range: [number, number] | null): number {
    const isAll = range === null;
    const [lo, hi] = range ?? [0, this.runs.length];

    let minDx = Infinity;
    let line = -1;
    for (let i = lo; i < hi; i++) {
      if (i >= this.runs.length) break;
      if (this.runs[i].line === line) continue;
      const runFrame = this.firstRunFrame(this.runs[i].line);
      const dx = Math.abs(point.x - (runFrame.x + runFrame.width * 0.5));
      if (dx >= minDx) continue;
      minDx = dx;
      line = this.runs[i].line;
    }
    if (line === -1) line = 0;

    if (isAll && this.isNewlineAt(hi) && line < this.lineCount) {
      const runFrame = this.firstRunFrame(this.lineCount - 1);
      const dx = Math.abs(point.x - (runFrame.x + runFrame.width * 0.5));
      if (dx < minDx) {
        minDx = dx;
        line = this.lineCount - 1;
      }
    }

    let minDistance = Infinity;
    let index = 0;
    for (let i = lo; i < hi; i++) {
      const run = this.runs[i];
      if (run.line < line - 1 || run.line > line + 1) continue;
      const f = run.frame;
      if (run.isNewline) {
        const d = distance(f, point);
        if (d < minDistance) {
          minDistance = d;
          index = i;
        }
      } else {
        const first: Rect = { x: f.x, y: f.y, width: f.width, height: f.height * 0.5 };
        const fd = distance(first, point);
        if (fd < minDistance) {
          minDistance = fd;
          index = i;
        }
        const second: Rect = { x: f.x, y: f.y + f.height * 0.5, width: f.width, height: f.height * 0.5 };
        const sd = distance(second, point);
        if (sd < minDistance) {
          minDistance = sd;
          index = i + 1;
        }
      }
    }
    if (minDistance === Infinity) index = this.runs.length;
    return index;
  }

  /** 点に最も近い文字位置（run ID。文字の後半なら +1）。カーソル位置の決定に使う。 */
  closestRunIndex(point: Point, range: [number, number] | null = null): number {
    if (this.runs.length === 0) return 0;
    return this.direction === "lrTb"
      ? this.closestRunIndexH(point, range)
      : this.closestRunIndexV(point, range);
  }

  /** 点を含む run の ID。無ければ null。 */
  hitRunIndex(point: Point, range: [number, number] | null = null): number | null {
    const [lo, hi] = range ?? [0, this.runs.length];
    if (this.runs.length === 0) {
      if (this.direction !== "lrTb") return null;
      const runFrame = this.firstRunFrame(0);
      const rect: Rect = { x: runFrame.x - 4, y: runFrame.y, width: 8, height: runFrame.height };
      return rectContains(rect, point) ? 0 : null;
    }
    for (let i = lo; i < hi; i++) {
      if (rectContains(this.runs[i].frame, point)) return i;
    }
    return null;
  }

  //--------------------------------------------------------------//
  // Tate chu yoko
  //--------------------------------------------------------------//

  isTateChuYokoToken(token: Token): boolean {
    if (token.start >= token.end || token.start >= this.runs.length) return false;
    return this.isTateChuYoko(this.runs[token.start]);
  }

  /** 縦中横（縦書き中に正体で組む 2 桁以下の数字）の run かどうか。 */
  isTateChuYoko(run: Run): boolean {
    if (!this.allowsTateChuYoko) return false;
    if (notNeedsToClockwiseInTbRl(this.fontManager.script(run.fontId))) return false;
    if (this.direction !== "tbRl") return false;
    const token = this.tokens[run.tokenId];
    if (!token) return false;
    for (let i = token.start; i < token.end; i++) {
      if (!this.runs[i].isNumber) return false;
    }
    return token.end - token.start <= 2;
  }

  //--------------------------------------------------------------//
  // Clockwise rotation
  //--------------------------------------------------------------//

  /** 縦書き時に 90 度時計回りに回転させる run（欧文など）かどうか。 */
  isClockwise(run: Run): boolean {
    if (notNeedsToClockwiseInTbRl(this.fontManager.script(run.fontId))) return false;
    if (this.direction !== "tbRl") return false;
    return !this.isTateChuYoko(run);
  }

  /** 縦書き時に縦組み用グリフ（vert）を使う run かどうか。 */
  usesVerticalGlyph(run: Run): boolean {
    return this.direction === "tbRl" && this.fontManager.script(run.fontId) === "japanese";
  }

  //--------------------------------------------------------------//
  // Adjust
  //--------------------------------------------------------------//

  /** 領域に収まらず、非表示または省略記号になった run があるかどうか。 */
  get isTruncated(): boolean {
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const v = this.runs[i].visibility;
      if (v === "invisible" || v === "ellipsis") return true;
    }
    return false;
  }
}
