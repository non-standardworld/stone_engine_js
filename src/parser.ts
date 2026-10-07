/*
parser.ts — テキストをトークン（単語）と run（書記素）に分解する。Swift 版 STParser.swift に対応。

Swift 版は String.enumerateSubstrings(.byWords / .byComposedCharacterSequences) を使っていた。
ここでは Intl.Segmenter（word / grapheme）を使う。word 分割は ICU の辞書ベースで、日本語も単語単位に分かれる。
*/

import { fontIdForChar } from "./fonts.js";
import {
  isNewlineChar,
  isNumberChar,
  isOpeningQuotationMark,
  isQuotationMark,
  isSpaceChar,
  punctuationOf,
} from "./punctuation.js";
import { SCRIPTS, type Run, type Token } from "./types.js";

export interface ParseResult {
  runs: Run[];
  tokens: Token[];
}

type SegmenterLike = { segment(input: string): Iterable<{ segment: string }> };
type Granularity = "word" | "grapheme";

const segmenters = new Map<Granularity, SegmenterLike | null>();

/** 指定した単位の Intl.Segmenter（無い環境では null）。一度作ったものを使い回す。 */
function getSegmenter(granularity: Granularity): SegmenterLike | null {
  const cached = segmenters.get(granularity);
  if (cached !== undefined) return cached;
  let segmenter: SegmenterLike | null = null;
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (locale: string, opts: object) => SegmenterLike }).Segmenter;
    if (Seg) segmenter = new Seg("ja", { granularity });
  } catch {
    segmenter = null;
  }
  segmenters.set(granularity, segmenter);
  return segmenter;
}

/** Intl.Segmenter で分割した文字列の配列。 */
function segment(segmenter: SegmenterLike, text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

const MARK_RE = /^\p{M}$/u;

/** Intl.Segmenter が無い環境向けの簡易書記素分割（結合文字・ZWJ・異体字セレクタ・CRLF をまとめる）。 */
function fallbackGraphemes(text: string): string[] {
  const out: string[] = [];
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    let g = chars[i];
    if (g === "\r" && chars[i + 1] === "\n") {
      g = "\r\n";
      i++;
    }
    while (i + 1 < chars.length) {
      const next = chars[i + 1];
      const cp = next.codePointAt(0) ?? 0;
      const isJoiner = cp === 0x200d;
      const isVariation = (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
      const isModifier = cp >= 0x1f3fb && cp <= 0x1f3ff;
      const isMark = MARK_RE.test(next);
      const afterJoiner = g.endsWith(String.fromCharCode(0x200d));
      if (isJoiner || isVariation || isModifier || isMark || afterJoiner) {
        g += next;
        i++;
      } else {
        break;
      }
    }
    out.push(g);
  }
  return out;
}

/** 書記素クラスタに分割する。 */
export function splitGraphemes(text: string): string[] {
  if (text.length === 0) return [];
  const segmenter = getSegmenter("grapheme");
  return segmenter ? segment(segmenter, text) : fallbackGraphemes(text);
}

/** 単語（と、単語の間の句読点・空白・改行）に分割する。Intl.Segmenter が無い環境では書記素分割にフォールバックする。 */
export function splitWords(text: string): string[] {
  if (text.length === 0) return [];
  const segmenter = getSegmenter("word");
  return segmenter ? segment(segmenter, text) : splitGraphemes(text);
}

/** Intl.Segmenter による単語分割が使えるかどうか。 */
export function supportsWordSegmentation(): boolean {
  return getSegmenter("word") !== null;
}

/** 1 書記素の Run を作る。改行は直前の run のフォントを引き継ぐ。 */
function createRun(char: string, tokenId: number, tokenRunIndex: number, prevFontId: number): Run {
  const isNewline = isNewlineChar(char);
  const fontId = isNewline ? prevFontId : fontIdForChar(char);
  return {
    tokenId,
    tokenRunIndex,
    fontId,
    char,
    isNewline,
    isNumber: !isNewline && isNumberChar(char),
    punctuation: punctuationOf(char),
    advance: 0,
    position: { x: 0, y: 0 },
    frame: { x: 0, y: 0, width: 0, height: 0 },
    visibility: "visible",
    line: 0,
  };
}

const LATIN_FONT_ID = SCRIPTS.indexOf("latin");
const JAPANESE_FONT_ID = SCRIPTS.indexOf("japanese");

/**
 * 引用符「“」「”」「‘」「’」のフォントを前後の文字で決める。始めの引用符は後ろ、終わりの引用符は前の文字（続く引用符は飛ばす）が
 * 欧文フォントの文字なら欧文（"“Hello”"、"it’s"、和文中の「“OK”」）、それ以外（和文・空白・改行・行頭／行末）なら和文にする。
 * 引用符の後ろの改行は、決めた引用符のフォントを引き継ぎ直す。
 */
function resolveQuotationMarkFonts(runs: Run[]): void {
  const isLatinNeighbor = (run: Run | undefined): boolean =>
    run !== undefined && !run.isNewline && !isSpaceChar(run.char) && run.fontId === LATIN_FONT_ID;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (run.isNewline) {
      run.fontId = i > 0 ? runs[i - 1].fontId : 0;
      continue;
    }
    if (!isQuotationMark(run.char)) continue;
    const step = isOpeningQuotationMark(run.char) ? 1 : -1;
    let j = i + step;
    while (j >= 0 && j < runs.length && isQuotationMark(runs[j].char)) j += step;
    run.fontId = isLatinNeighbor(runs[j]) ? LATIN_FONT_ID : JAPANESE_FONT_ID;
  }
}

/**
 * テキストを解析して runs / tokens を作る。送り幅（advance）はまだ 0 で、measureRuns で埋める。
 * @param dividesByWords true なら単語単位、false なら書記素単位でトークンを作る。
 */
export function parseText(text: string | null | undefined, dividesByWords: boolean): ParseResult {
  const runs: Run[] = [];
  const tokens: Token[] = [];
  const source = text ?? "";
  const segments = dividesByWords ? splitWords(source) : splitGraphemes(source);
  for (const segment of segments) {
    const tokenId = tokens.length;
    const start = runs.length;
    const graphemes = dividesByWords ? splitGraphemes(segment) : [segment];
    let tokenRunIndex = 0;
    for (const g of graphemes) {
      const prevFontId = runs.length > 0 ? runs[runs.length - 1].fontId : 0;
      runs.push(createRun(g, tokenId, tokenRunIndex, prevFontId));
      tokenRunIndex++;
    }
    tokens.push({ start, end: runs.length });
  }
  resolveQuotationMarkFonts(runs);
  return { runs, tokens };
}
