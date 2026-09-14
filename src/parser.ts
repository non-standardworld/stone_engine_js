/*
parser.ts — テキストをトークン（単語）と run（書記素）に分解する。Swift 版 STParser.swift に対応。

Swift 版は String.enumerateSubstrings(.byWords / .byComposedCharacterSequences) を使っていた。
ここでは Intl.Segmenter（word / grapheme）を使う。word 分割は ICU の辞書ベースで、日本語も単語単位に分かれる。
*/

import { fontIdForChar } from "./fonts.js";
import { isNewlineChar, isNumberChar, punctuationOf } from "./punctuation.js";
import type { Run, Token } from "./types.js";

export interface ParseResult {
  runs: Run[];
  tokens: Token[];
}

type SegmenterLike = { segment(input: string): Iterable<{ segment: string }> };

let wordSegmenter: SegmenterLike | null | undefined;
let graphemeSegmenter: SegmenterLike | null | undefined;

/** 単語分割用の Intl.Segmenter（無ければ null）。 */
function getWordSegmenter(): SegmenterLike | null {
  if (wordSegmenter !== undefined) return wordSegmenter;
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (locale: string, opts: object) => SegmenterLike }).Segmenter;
    wordSegmenter = Seg ? new Seg("ja", { granularity: "word" }) : null;
  } catch {
    wordSegmenter = null;
  }
  return wordSegmenter;
}

/** 書記素分割用の Intl.Segmenter（無ければ null）。 */
function getGraphemeSegmenter(): SegmenterLike | null {
  if (graphemeSegmenter !== undefined) return graphemeSegmenter;
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (locale: string, opts: object) => SegmenterLike }).Segmenter;
    graphemeSegmenter = Seg ? new Seg("ja", { granularity: "grapheme" }) : null;
  } catch {
    graphemeSegmenter = null;
  }
  return graphemeSegmenter;
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
  const seg = getGraphemeSegmenter();
  if (!seg) return fallbackGraphemes(text);
  const out: string[] = [];
  for (const s of seg.segment(text)) out.push(s.segment);
  return out;
}

/** 単語（と、単語の間の句読点・空白・改行）に分割する。Intl.Segmenter が無い環境では書記素分割にフォールバックする。 */
export function splitWords(text: string): string[] {
  if (text.length === 0) return [];
  const seg = getWordSegmenter();
  if (!seg) return splitGraphemes(text);
  const out: string[] = [];
  for (const s of seg.segment(text)) out.push(s.segment);
  return out;
}

/** Intl.Segmenter による単語分割が使えるかどうか。 */
export function supportsWordSegmentation(): boolean {
  return getWordSegmenter() !== null;
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
  return { runs, tokens };
}
