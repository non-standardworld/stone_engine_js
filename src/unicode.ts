/*
unicode.ts — Unicode ブロックによる文字種判定。Swift 版 STObject.swift の STUnicodeCategory / STScript に対応。
判定順序（先に一致したものを採用）も Swift 版の宣言順に合わせている。
*/

import type { Script } from "./types.js";

export type UnicodeCategory = (typeof UNICODE_BLOCKS)[number][0];

/** [名前, 開始, 終了（含まない）] */
export const UNICODE_BLOCKS = [
  ["c0Control", 0x0000, 0x0020],
  ["basicLatin", 0x0020, 0x0080],
  ["c1Control", 0x0080, 0x009f],
  ["latin1Supplement", 0x00a0, 0x0100],
  ["latinExtendedA", 0x0100, 0x0180],
  ["latinExtendedB", 0x0180, 0x0250],
  ["ipaExtensions", 0x0250, 0x02b0],
  ["spacingModifierLetters", 0x02b0, 0x0300],
  ["combiningDiacriticalMarks", 0x0300, 0x0370],
  ["greekAndCoptic", 0x0370, 0x0400],
  ["cyrillic", 0x0400, 0x0500],
  ["cyrillicSupplement", 0x0500, 0x0530],
  ["armenian", 0x0530, 0x0590],
  ["hebrew", 0x0590, 0x0600],
  ["arabic", 0x0600, 0x0700],
  ["syriac", 0x0700, 0x0750],
  ["arabicSupplement", 0x0750, 0x0780],
  ["thaana", 0x0780, 0x07c0],
  ["nko", 0x07c0, 0x0800],
  ["samaritan", 0x0800, 0x0840],
  ["mandaic", 0x0840, 0x0860],
  ["syriacSupplement", 0x0860, 0x0870],
  ["arabicExtendedB", 0x0870, 0x08a0],
  ["arabicExtendedA", 0x08a0, 0x0900],
  ["devanagari", 0x0900, 0x0980],
  ["gurmukhi", 0x0a00, 0x0a80],
  ["gujarati", 0x0a80, 0x0b00],
  ["oriya", 0x0b00, 0x0b80],
  ["tamil", 0x0b80, 0x0c00],
  ["telugu", 0x0c00, 0x0c80],
  ["kannada", 0x0c80, 0x0d00],
  ["malayalam", 0x0d00, 0x0d80],
  ["sinhala", 0x0d80, 0x0e00],
  ["thai", 0x0e00, 0x0e80],
  ["lao", 0x0e80, 0x0f00],
  ["tibetan", 0x0f00, 0x1000],
  ["myanmar", 0x1000, 0x10a0],
  ["georgian", 0x10a0, 0x1100],
  ["hangulJamo", 0x1100, 0x1200],
  ["ethiopic", 0x1200, 0x1380],
  ["ethiopicSupplement", 0x1380, 0x13a0],
  ["cherokee", 0x13a0, 0x1400],
  ["unifiedCanadianAboriginalSyllabics", 0x1400, 0x1680],
  ["ogham", 0x1680, 0x16a0],
  ["runic", 0x1680, 0x1700],
  ["tagalog", 0x1700, 0x1720],
  ["hanunoo", 0x1720, 0x1740],
  ["buhid", 0x1740, 0x1760],
  ["tagbanwa", 0x1760, 0x1780],
  ["khmer", 0x1780, 0x1800],
  ["mongolian", 0x1800, 0x18b0],
  ["unifiedCanadianAboriginalSyllabicsExtended", 0x18b0, 0x1900],
  ["limbu", 0x1900, 0x1950],
  ["taiLe", 0x1950, 0x1980],
  ["newTaiLue", 0x1980, 0x19e0],
  ["khmerSymbols", 0x19a0, 0x1a00],
  ["buginese", 0x1a00, 0x1a20],
  ["taiTham", 0x1a20, 0x1ab0],
  ["combiningDiacriticalMarksExtended", 0x1ab0, 0x1b00],
  ["balinese", 0x1b00, 0x1b80],
  ["sundanese", 0x1b80, 0x1bc0],
  ["batak", 0x1bc0, 0x1c00],
  ["lepcha", 0x1c00, 0x1c50],
  ["olChiki", 0x1c50, 0x1c80],
  ["cyrillicExtendedC", 0x1c80, 0x1c90],
  ["georgianExtended", 0x1c90, 0x1cc0],
  ["sundaneseSupplement", 0x1cc0, 0x1cd0],
  ["vedicExtensions", 0x1cd0, 0x1d00],
  ["phoneticExtensions", 0x1d00, 0x1d80],
  ["phoneticExtensionsSupplement", 0x1d80, 0x1dc0],
  ["combiningDiacriticalMarksSupplement", 0x1dc0, 0x1e00],
  ["latinExtendedAdditional", 0x1e00, 0x1f00],
  ["greekExtended", 0x1f00, 0x2000],
  ["generalPunctuation", 0x2000, 0x2070],
  ["superscriptsAndSubscripts", 0x2070, 0x20a0],
  ["currencySymbols", 0x20a0, 0x20d0],
  ["combiningDiacriticalMarksForSymbols", 0x20d0, 0x2100],
  ["letterlikeSymbols", 0x2100, 0x2150],
  ["numberForms", 0x2150, 0x2190],
  ["arrows", 0x2190, 0x2200],
  ["mathematicalOperators", 0x2200, 0x2300],
  ["miscellaneousTechnical", 0x2300, 0x2400],
  ["controlPictures", 0x2400, 0x2440],
  ["opticalCharacterRecognition", 0x2440, 0x2460],
  ["enclosedAlphanumerics", 0x2460, 0x2500],
  ["boxDrawing", 0x2500, 0x2580],
  ["blockElements", 0x2580, 0x25a0],
  ["geometricShapes", 0x25a0, 0x2600],
  ["miscellaneousSymbols", 0x2600, 0x2700],
  ["dingbats", 0x2700, 0x27c0],
  ["miscellaneousMathematicalSymbolsA", 0x27c0, 0x27f0],
  ["supplementalArrowsA", 0x27f0, 0x2800],
  ["braillePatterns", 0x2800, 0x2900],
  ["supplementalArrowsB", 0x2900, 0x2980],
  ["miscellaneousMathematicalSymbolsB", 0x2980, 0x2a00],
  ["supplementalMathematicalOperators", 0x2a00, 0x2b00],
  ["miscellaneousSymbolsAndArrows", 0x2b00, 0x2c00],
  ["glagolitic", 0x2c00, 0x2c60],
  ["latinExtendedC", 0x2c60, 0x2c80],
  ["coptic", 0x2c80, 0x2d00],
  ["georgianSupplement", 0x2d00, 0x2d30],
  ["tifinagh", 0x2d30, 0x2d80],
  ["ethiopicExtended", 0x2d80, 0x2de0],
  ["cyrillicExtendedA", 0x2de0, 0x2e00],
  ["supplementalPunctuation", 0x2e00, 0x2e80],
  ["cjkRadicalsSupplement", 0x2e80, 0x2f00],
  ["kangxiRadicals", 0x2f00, 0x2fe0],
  ["ideographicDescriptionCharacters", 0x2ff0, 0x3000],
  ["cjkSymbolsAndPunctuation", 0x3000, 0x3040],
  ["hiragana", 0x3040, 0x30a0],
  ["katakana", 0x30a0, 0x3100],
  ["bopomofo", 0x3100, 0x3130],
  ["hangulCompatibilityJamo", 0x3130, 0x3190],
  ["kanbun", 0x3190, 0x31a0],
  ["bopomofoExtended", 0x31a0, 0x31c0],
  ["cjkStrokes", 0x31c0, 0x31f0],
  ["katakanaPhoneticExtensions", 0x31f0, 0x3200],
  ["enclosedCjkLettersAndMonths", 0x3200, 0x3300],
  ["cjkCompatibility", 0x3300, 0x3400],
  ["cjkUnifiedIdeographsExtensionA", 0x3400, 0x4dc0],
  ["yijingHexagramSymbols", 0x4dc0, 0x4e00],
  ["cjkUnifiedIdeographs", 0x4e00, 0xa000],
  ["yiSyllables", 0xa000, 0xa490],
  ["yiRadicals", 0xa490, 0xa4d0],
  ["lisu", 0xa4d0, 0xa500],
  ["vai", 0xa500, 0xa640],
  ["cyrillicExtendedB", 0xa640, 0xa6a0],
  ["bamum", 0xa6a0, 0xa700],
  ["modifierToneLetters", 0xa700, 0xa720],
  ["latinExtendedD", 0xa720, 0xa800],
  ["sylotiNagri", 0xa800, 0xa830],
  ["commonIndicNumberForms", 0xa830, 0xa840],
  ["phagsPa", 0xa840, 0xa880],
  ["saurashtra", 0xa880, 0xa8e0],
  ["devanagariExtended", 0xa8e0, 0xa900],
  ["kayahLi", 0xa900, 0xa930],
  ["rejang", 0xa930, 0xa960],
  ["hangulJamoExtendedA", 0xa960, 0xa980],
  ["javanese", 0xa980, 0xa9e0],
  ["myanmarExtendedB", 0xa9e0, 0xaa00],
  ["cham", 0xaa00, 0xaa60],
  ["myanmarExtendedA", 0xaa60, 0xaa80],
  ["taiViet", 0xaa80, 0xaae0],
  ["meeteiMayekExtensions", 0xaae0, 0xab00],
  ["ethiopicExtendedA", 0xab00, 0xab30],
  ["latinExtendedE", 0xab30, 0xab70],
  ["cherokeeSupplement", 0xab70, 0xabc0],
  ["meeteiMayek", 0xabc0, 0xac00],
  ["hangulSyllables", 0xac00, 0xd7b0],
  ["hangulJamoExtendedB", 0xd7b0, 0xd800],
  ["highSurrogates", 0xd800, 0xdb80],
  ["highPrivateUseSurrogates", 0xdb80, 0xdc00],
  ["lowSurrogates", 0xdc00, 0xe000],
  ["privateUseArea", 0xe000, 0xf900],
  ["cjkCompatibilityIdeographs", 0xf900, 0xfb00],
  ["alphabeticPresentationForms", 0xfb00, 0xfb50],
  ["arabicPresentationFormsA", 0xfb50, 0xfe00],
  ["variationSelectors", 0xfe00, 0xfe10],
  ["verticalForms", 0xfe10, 0xfe20],
  ["combiningHalfMarks", 0xfe20, 0xfe30],
  ["cjkCompatibilityForms", 0xfe30, 0xfe50],
  ["smallFormVariants", 0xfe50, 0xfe70],
  ["arabicPresentationFormsB", 0xfe70, 0xff00],
  ["halfwidthAndFullwidthForms", 0xff00, 0xfff0],
  ["specials", 0xfff0, 0x10000],
  ["enclosedAlphanumericSupplement", 0x1f100, 0x1f200],
  ["enclosedIdeographicSupplement", 0x1f200, 0x1f300],
  ["miscellaneousSymbolsAndPictographs", 0x1f300, 0x1f600],
  ["emoticons", 0x1f600, 0x1f650],
  ["ornamentalDingbats", 0x1f650, 0x1f680],
  ["transportAndMapSymbols", 0x1f680, 0x1f700],
  ["alchemicalSymbols", 0x1f700, 0x1f780],
  ["geometricShapesExtended", 0x1f780, 0x1f800],
  ["supplementalArrowsC", 0x1f800, 0x1f900],
  ["supplementalSymbolsAndPictographs", 0x1f900, 0x1fa00],
  ["chessSymbols", 0x1fa00, 0x1fa70],
  ["symbolsAndPictographsExtendedA", 0x1fa70, 0x1fb00],
  ["symbolsForLegacyComputing", 0x1fb00, 0x1fc00],
  ["unassigned", 0x1ff80, 0x20000],
  ["cjkUnifiedIdeographsExtensionB", 0x20000, 0x2a6e0],
  ["cjkUnifiedIdeographsExtensionC", 0x2a700, 0x2b740],
  ["cjkUnifiedIdeographsExtensionD", 0x2b740, 0x2b820],
  ["cjkUnifiedIdeographsExtensionE", 0x2b820, 0x2ceb0],
  ["cjkUnifiedIdeographsExtensionF", 0x2ceb0, 0x2ebf0],
  ["cjkUnifiedIdeographsExtensionI", 0x2ebf0, 0x2ee60],
  ["cjkCompatibilityIdeographsSupplement", 0x2f800, 0x2fa20],
  ["cjkUnifiedIdeographsExtensionG", 0x30000, 0x31350],
  ["cjkUnifiedIdeographsExtensionH", 0x31350, 0x323b0],
] as const;

const SCRIPT_CATEGORIES: Record<Script, ReadonlySet<UnicodeCategory>> = {
  latin: new Set<UnicodeCategory>(["basicLatin"]),
  japanese: new Set<UnicodeCategory>([
    "cjkCompatibility",
    "cjkCompatibilityForms",
    "cjkCompatibilityIdeographs",
    "cjkCompatibilityIdeographsSupplement",
    "cjkRadicalsSupplement",
    "cjkStrokes",
    "cjkSymbolsAndPunctuation",
    "cjkUnifiedIdeographs",
    "cjkUnifiedIdeographsExtensionA",
    "cjkUnifiedIdeographsExtensionB",
    "cjkUnifiedIdeographsExtensionC",
    "cjkUnifiedIdeographsExtensionD",
    "cjkUnifiedIdeographsExtensionE",
    "cjkUnifiedIdeographsExtensionF",
    "cjkUnifiedIdeographsExtensionG",
    "cjkUnifiedIdeographsExtensionH",
    "cjkUnifiedIdeographsExtensionI",
    "enclosedCjkLettersAndMonths",
    "halfwidthAndFullwidthForms",
    "hiragana",
    "katakana",
    "katakanaPhoneticExtensions",
  ]),
  emoji: new Set<UnicodeCategory>([
    "dingbats",
    "emoticons",
    "enclosedAlphanumericSupplement",
    "enclosedIdeographicSupplement",
    "miscellaneousSymbols",
    "miscellaneousSymbolsAndPictographs",
    "supplementalSymbolsAndPictographs",
    "symbolsAndPictographsExtendedA",
    "transportAndMapSymbols",
  ]),
};

const categoryCache = new Map<number, UnicodeCategory | null>();

/** コードポイントの Unicode ブロック名。未知の場合は null。 */
export function unicodeCategoryOf(codePoint: number): UnicodeCategory | null {
  const cached = categoryCache.get(codePoint);
  if (cached !== undefined) return cached;
  let found: UnicodeCategory | null = null;
  for (const [name, start, end] of UNICODE_BLOCKS) {
    if (codePoint >= start && codePoint < end) {
      found = name;
      break;
    }
  }
  categoryCache.set(codePoint, found);
  return found;
}

/** コードポイントの文字種。latin / japanese / emoji のいずれにも属さない場合は null。 */
export function scriptOfCodePoint(codePoint: number): Script | null {
  const category = unicodeCategoryOf(codePoint);
  if (category === null) return null;
  if (SCRIPT_CATEGORIES.latin.has(category)) return "latin";
  if (SCRIPT_CATEGORIES.japanese.has(category)) return "japanese";
  if (SCRIPT_CATEGORIES.emoji.has(category)) return "emoji";
  return null;
}

/** 書記素の先頭コードポイントから文字種を判定する。 */
export function scriptOfChar(char: string): Script | null {
  const cp = char.codePointAt(0);
  return cp === undefined ? null : scriptOfCodePoint(cp);
}

/** 縦書き時に 90 度回転させない文字種。 */
export function notNeedsToClockwiseInTbRl(script: Script): boolean {
  return script === "japanese" || script === "emoji";
}
