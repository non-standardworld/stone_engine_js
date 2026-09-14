/*
punctuation.ts — 約物の分類と禁則文字集合。Swift 版 STObject.swift の STPunctuation / STKinsoku に対応。
*/

import type { Punctuation } from "./types.js";

const FIRST_HALF = "、。）］｝〕〉》」』】〙〗〟｠";
const SECOND_HALF = "（［｛〔〈《「『【〘〖〝｟";
const QUARTER = "・：；";

const firstHalfSet = new Set(Array.from(FIRST_HALF));
const secondHalfSet = new Set(Array.from(SECOND_HALF));
const quarterSet = new Set(Array.from(QUARTER));

function firstCodePointString(char: string): string {
  const cp = char.codePointAt(0);
  return cp === undefined ? "" : String.fromCodePoint(cp);
}

/** 書記素の先頭コードポイントで約物種別を判定する。 */
export function punctuationOf(char: string): Punctuation {
  const c = firstCodePointString(char);
  if (firstHalfSet.has(c)) return "firstHalf";
  if (secondHalfSet.has(c)) return "secondHalf";
  if (quarterSet.has(c)) return "quarter";
  return "whole";
}

/** 行頭禁則文字（行頭に来てはいけない文字）。 */
export const KINSOKU_NOT_STARTING: ReadonlySet<string> = new Set(
  Array.from(
    " ,.?:;!)）]］｝、〕〉》」』】〙〗〟’”｠»ヽヾァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻？!‼⁇⁈⁉。.™",
  ),
);

/** 行末禁則文字（行末に来てはいけない文字）。 */
export const KINSOKU_NOT_ENDING: ReadonlySet<string> = new Set(
  Array.from(`(（[［｛〔〈《「『【〘〖〝‘“｟«"'`),
);

/** ぶら下げ対象文字。 */
export const KINSOKU_HANGING: ReadonlySet<string> = new Set(Array.from("、。"));

export function isNotStartingChar(char: string): boolean {
  return KINSOKU_NOT_STARTING.has(firstCodePointString(char));
}

export function isNotEndingChar(char: string): boolean {
  return KINSOKU_NOT_ENDING.has(firstCodePointString(char));
}

/** Swift の Character.isNewline と同じ集合: LF, CR, CRLF, VT, FF, NEL, LINE SEPARATOR, PARAGRAPH SEPARATOR。 */
const NEWLINES: ReadonlySet<string> = new Set([
  "\n",
  "\r",
  "\r\n",
  String.fromCharCode(0x0b),
  String.fromCharCode(0x0c),
  String.fromCharCode(0x85),
  String.fromCharCode(0x2028),
  String.fromCharCode(0x2029),
]);

export function isNewlineChar(char: string): boolean {
  return NEWLINES.has(char);
}

const NUMBER_RE = /^\p{N}+$/u;

/** Swift の Character.isNumber に相当（Unicode の Numeric 系カテゴリ）。 */
export function isNumberChar(char: string): boolean {
  return NUMBER_RE.test(char);
}
