/*
auto/whitespace.ts — HTML のテキストを、CSS の white-space の規則で空白をたたみながらつなげる（DOM に依存しない）。

オートモードは普通の HTML を組むので、ソースの改行や字下げの空白をブラウザと同じようにたたむ必要がある
（readStoneSource はテキストノードをそのままつなげる。React の children には余計な空白が入らないため）。
- たたむ（white-space: normal / nowrap）: 連続する空白・タブ・改行を 1 つの空白にし、行の先頭と末尾（ブロックの両端と <br> の前後）の
  空白は捨てる。改行を含む空白の両側が全角の文字（和文）なら、空白にせずに捨てる（CSS Text の segment break transformation。
  ソースを途中で改行しただけの和文の間に、空白が入らない）。
- 改行だけ残す（pre-line）: 空白とタブはたたみ、改行は強制改行にする。
- そのまま（pre / pre-wrap / break-spaces）: 何もたたまない。
どの場合も、ブロックの最後の強制改行 1 つは行を増やさない（CSS と同じ。<p>テキスト<br></p> は 1 行）。
*/

import { isFullWidthCodePoint } from "../measure/fixed.js";

/** 空白のたたみ方。 */
export type WhiteSpaceMode = "collapse" | "preserve-breaks" | "preserve";

/** CSS の white-space の計算値から、空白のたたみ方を決める。知らない値は null。 */
export function whiteSpaceModeOf(whiteSpace: string): WhiteSpaceMode | null {
  switch (whiteSpace) {
    case "normal":
    case "nowrap":
      return "collapse";
    case "pre-line":
      return "preserve-breaks";
    case "pre":
    case "pre-wrap":
    case "break-spaces":
      return "preserve";
    default:
      return null;
  }
}

/** CSS の white-space の計算値が、行の折り返しを許すかどうか。 */
export function wrapsLines(whiteSpace: string): boolean {
  return whiteSpace !== "nowrap" && whiteSpace !== "pre";
}

/** ハングル（単語を空白で区切るので、改行をはさんだら空白を入れる）。 */
function isHangulCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x3130 && cp <= 0x318f) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7ff) ||
    (cp >= 0xffa0 && cp <= 0xffdc)
  );
}

/** 改行をはさんで隣り合っても空白を入れない文字（全角の和文と半角カナ）。 */
function joinsAcrossLineBreak(char: string): boolean {
  const cp = char.codePointAt(0);
  if (cp === undefined || isHangulCodePoint(cp)) return false;
  if (cp >= 0xff61 && cp <= 0xff9f) return true; // 半角カナ・半角の句読点
  return isFullWidthCodePoint(cp);
}

/**
 * 空白をたたみながらテキストをつなげる。
 * mark() で覚えた位置は、あとで末尾の空白や改行が取り消されても、取り消した後のテキストの位置に直る。
 */
export class CollapsedText {
  private out = "";
  /** たたまれる空白を出した位置。out の最後の文字がその空白のあいだだけ有効（それ以外は -1）。 */
  private spaceAt = -1;
  /** その空白が改行を含んでいたかどうか。 */
  private spaceHasBreak = false;
  /** 行の先頭（ブロックの先頭か強制改行の直後）で、まだ文字を出していない。 */
  private atLineStart = true;
  private readonly marks: number[] = [];

  /** mode は空白のたたみ方。 */
  constructor(private readonly mode: WhiteSpaceMode) {}

  /** テキストノードの文字列を足す。 */
  add(data: string): void {
    const text = data.replace(/\r\n?/g, "\n");
    if (this.mode === "preserve") {
      this.out += text;
      if (text.length > 0) this.atLineStart = text.endsWith("\n");
      return;
    }
    for (const char of text) {
      if (char === "\n") {
        if (this.mode === "preserve-breaks") this.lineBreak();
        else this.space(true);
      } else if (char === " " || char === "\t" || char === "\f") {
        this.space(false);
      } else {
        this.visible(char);
      }
    }
  }

  /** 強制改行（<br> や pre-line の改行）を足す。直前の空白は捨てる。 */
  lineBreak(): void {
    this.dropTrailingSpace();
    this.out += "\n";
    this.atLineStart = true;
  }

  /** 現在の位置に印を付けて、その番号を返す。位置は finish() の offsets から引く。 */
  mark(): number {
    this.marks.push(this.out.length);
    return this.marks.length - 1;
  }

  /** 末尾の空白と、行を増やさない最後の強制改行を捨てて、テキストと印の位置を返す。 */
  finish(): { text: string; offsets: number[] } {
    this.dropTrailingSpace();
    if (this.out.endsWith("\n")) this.truncate(this.out.length - 1);
    return { text: this.out, offsets: this.marks.slice() };
  }

  /** たたまれる空白（fromBreak は改行かどうか）。行の先頭では捨て、連続したら 1 つにまとめる。 */
  private space(fromBreak: boolean): void {
    if (this.atLineStart) return;
    if (this.endsWithSpace()) {
      if (fromBreak) this.spaceHasBreak = true;
      return;
    }
    this.spaceAt = this.out.length;
    this.spaceHasBreak = fromBreak;
    this.out += " ";
  }

  /** 空白でない文字。改行を含む空白をはさんで和文どうしが隣り合うなら、その空白を取り消す。 */
  private visible(char: string): void {
    if (this.endsWithSpace() && this.spaceHasBreak) {
      const before = this.charBefore(this.spaceAt);
      if (before !== null && joinsAcrossLineBreak(before) && joinsAcrossLineBreak(char)) this.truncate(this.spaceAt);
    }
    this.out += char;
    this.atLineStart = false;
  }

  /** out の最後の文字が、たたまれる空白かどうか。 */
  private endsWithSpace(): boolean {
    return this.spaceAt >= 0 && this.spaceAt === this.out.length - 1;
  }

  /** 末尾のたたまれる空白を取り消す。 */
  private dropTrailingSpace(): void {
    if (this.endsWithSpace()) this.truncate(this.spaceAt);
  }

  /** index の直前の文字（サロゲートペアは 1 文字として返す）。 */
  private charBefore(index: number): string | null {
    if (index <= 0) return null;
    const unit = this.out.charCodeAt(index - 1);
    if (unit >= 0xdc00 && unit <= 0xdfff && index >= 2) return this.out.slice(index - 2, index);
    return this.out[index - 1];
  }

  /** out を length 文字に切り詰め、それより後ろに付けた印を末尾に寄せる。 */
  private truncate(length: number): void {
    this.out = this.out.slice(0, length);
    this.spaceAt = -1;
    for (let i = 0; i < this.marks.length; i++) {
      if (this.marks[i] > length) this.marks[i] = length;
    }
  }
}
