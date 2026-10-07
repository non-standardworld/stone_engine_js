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

/** 書記素の先頭コードポイントだけを取り出す。 */
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

/**
 * 行頭禁則文字（行頭に来てはいけない文字）。JLREQ の行頭禁則の文字クラスをすべて含む強い禁則
 * （JLREQ 付録 C.3 のレベル 4。CSS の line-break: strict と同じく「ー」や小書きの仮名も行頭に置かない）。
 * JLREQ は ASCII のコードポイントで挙げているので、全角形（「！」U+FF01 など）もあわせて含める。
 * Swift 版の集合（「？!‼」「。.」のように ASCII の「!」「.」を 2 回ずつ書き、全角の「！」「．」がない）に、
 * 「！」「，」「．」「：」「；」「・」「ー」「ゝ」「ゞ」「‐」「〜」「゠」「–」「}」「⦆」を足したもの。
 */
export const KINSOKU_NOT_STARTING: ReadonlySet<string> = new Set(
  Array.from(
    [
      " ™", // 空白・商標記号（Swift 版から）
      "’”)）]］}｝〕〉》」』】〙〗〟⦆｠»", // 終わり括弧類（cl-02）
      "‐〜゠–", // ハイフン類（cl-03）
      "?？!！‼⁇⁈⁉", // 区切り約物（cl-04）
      "・:：;；", // 中点類（cl-05）
      "。.．", // 句点類（cl-06）
      "、,，", // 読点類（cl-07）
      "ヽヾゝゞ々〻", // 繰返し記号（cl-09）
      "ー", // 長音記号（cl-10）
      "ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ", // 小書きの仮名（cl-11）
    ].join(""),
  ),
);

/** 行末禁則文字（行末に来てはいけない文字）。 */
export const KINSOKU_NOT_ENDING: ReadonlySet<string> = new Set(
  Array.from(`(（[［｛〔〈《「『【〘〖〝‘“｟«"'`),
);

/** ぶら下げ対象文字。 */
export const KINSOKU_HANGING: ReadonlySet<string> = new Set(Array.from("、。"));

/**
 * 分離禁止文字（JIS X 4051 / JLREQ の cl-08 に、JIS のダッシュを U+2015 に対応づける環境の「―」を加えたもの）。
 * 「……」「——」「〳〵」のように続けて並んだ間では改行せず、均等配置でも空けない。
 */
export const KINSOKU_INSEPARABLE: ReadonlySet<string> = new Set(Array.from("—―‥…〳〴〵"));

/** 横書きの省略記号 (U+2026)。 */
export const HORIZONTAL_ELLIPSIS = "…";
/** 縦書きの省略記号 (U+FE19 PRESENTATION FORM FOR VERTICAL HORIZONTAL ELLIPSIS)。 */
export const VERTICAL_ELLIPSIS = "︙";

/** 行頭禁則文字かどうか。 */
export function isNotStartingChar(char: string): boolean {
  return KINSOKU_NOT_STARTING.has(firstCodePointString(char));
}

/** 行末禁則文字かどうか。 */
export function isNotEndingChar(char: string): boolean {
  return KINSOKU_NOT_ENDING.has(firstCodePointString(char));
}

/** a と b が続けて並んだ間が分離禁止（どちらも分離禁止文字）かどうか。 */
export function isInseparablePair(a: string, b: string): boolean {
  return KINSOKU_INSEPARABLE.has(firstCodePointString(a)) && KINSOKU_INSEPARABLE.has(firstCodePointString(b));
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

/** 改行文字かどうか。 */
export function isNewlineChar(char: string): boolean {
  return NEWLINES.has(char);
}

const WHITESPACE_RE = /^\s+$/u;

/** 改行以外の空白文字（半角・全角スペース、タブなど）かどうか。 */
export function isSpaceChar(char: string): boolean {
  return WHITESPACE_RE.test(char) && !isNewlineChar(char);
}

/** 改行か空白（描くものがない文字）かどうか。 */
export function isBlankChar(char: string): boolean {
  return isNewlineChar(char) || isSpaceChar(char);
}

const NUMBER_RE = /^\p{N}+$/u;

/** Swift の Character.isNumber に相当（Unicode の Numeric 系カテゴリ）。 */
export function isNumberChar(char: string): boolean {
  return NUMBER_RE.test(char);
}
