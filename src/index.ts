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
  KINSOKU_HANGING,
  KINSOKU_NOT_ENDING,
  KINSOKU_NOT_STARTING,
  isNewlineChar,
  isNotEndingChar,
  isNotStartingChar,
  isNumberChar,
  punctuationOf,
} from "./punctuation.js";
export {
  UNICODE_BLOCKS,
  notNeedsToClockwiseInTbRl,
  scriptOfChar,
  scriptOfCodePoint,
  unicodeCategoryOf,
  type UnicodeCategory,
} from "./unicode.js";
export { CanvasMeasurer, getSharedCanvasMeasurer } from "./measure/canvas.js";
export { FixedMeasurer, isFullWidthCodePoint, type FixedMeasurerOptions } from "./measure/fixed.js";
export {
  HORIZONTAL_ELLIPSIS,
  VERTICAL_ELLIPSIS,
  VERTICAL_FEATURE_SETTINGS,
  glyphElements,
  glyphGroups,
  isSafeSvgAttributeName,
  svgOverflow,
  svgSize,
  svgString,
  type GlyphElement,
  type GlyphGroup,
  type SvgStringOptions,
} from "./render/svg.js";
export {
  StoneTextController,
  resolveLayoutSize,
  type ControllerInput,
  type ControllerOptions,
  type SizeSpec,
} from "./controller.js";
export { mountStoneText, type MountOptions, type StoneTextHandle } from "./vanilla.js";
