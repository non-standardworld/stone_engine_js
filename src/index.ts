/*
@non-standardworld/stone-engine — 日本語組版エンジン stone_engine の JavaScript / TypeScript 移植。
*/

export * from "./types.js";
export { StoneContext, DEFAULT_OPTIONS, type LineRange } from "./context.js";
export { layoutText, relayout, sizeThatFits, measureRuns, type LayoutSize } from "./engine.js";
export { Layouter } from "./layout.js";
export { parseText, splitGraphemes, splitWords, supportsWordSegmentation, type ParseResult } from "./parser.js";
export {
  DEFAULT_FONTS,
  FontManager,
  JAPANESE_ASCENT_RATIO,
  JAPANESE_DESCENT_RATIO,
  cssFontString,
  fontIdForChar,
  resolveFonts,
} from "./fonts.js";
export {
  HORIZONTAL_ELLIPSIS,
  KINSOKU_HANGING,
  KINSOKU_INSEPARABLE,
  KINSOKU_NOT_ENDING,
  KINSOKU_NOT_STARTING,
  VERTICAL_ELLIPSIS,
  isInseparablePair,
  isNewlineChar,
  isNotEndingChar,
  isNotStartingChar,
  isNumberChar,
  isOpeningQuotationMark,
  isQuotationMark,
  isSpaceChar,
  punctuationOf,
} from "./punctuation.js";
export {
  UNICODE_BLOCKS,
  isJapanesePunctuationCodePoint,
  notNeedsToClockwiseInTbRl,
  scriptOfChar,
  scriptOfCodePoint,
  unicodeCategoryOf,
  type UnicodeCategory,
} from "./unicode.js";
export { CanvasMeasurer, getSharedCanvasMeasurer } from "./measure/canvas.js";
export { FixedMeasurer, isFullWidthCodePoint, type FixedMeasurerOptions } from "./measure/fixed.js";
export {
  FULL_WIDTH_VERTICAL_FEATURE_SETTINGS,
  VERTICAL_FEATURE_SETTINGS,
  fontFeatureSettingsOf,
  glyphElements,
  glyphGroups,
  glyphParagraphs,
  isSafeSvgAttributeName,
  svgOverflow,
  svgSize,
  svgString,
  type GlyphElement,
  type GlyphGroup,
  type GlyphParagraph,
  type SvgStringOptions,
} from "./render/svg.js";
export { handleStoneCopy, runRangeOfSelection, textOfRunRange, type CopyEventLike } from "./render/copy.js";
export {
  StoneTextController,
  resolveLayoutSize,
  type ControllerInput,
  type ControllerOptions,
  type SizeSpec,
} from "./controller.js";
export { mountStoneText, type MountOptions, type StoneTextHandle } from "./vanilla.js";
