import { describe, expect, it } from "vitest";
import { autoStone } from "../src/index.js";
import { autoStoneHandle } from "../src/auto/index.js";
import { readAutoSource, type AutoComputedStyle } from "../src/auto/source.js";
import {
  blockSkipReason,
  directionOf,
  inlineSkipReason,
  letterSpacingOf,
  mergeAutoOptions,
  optionsFromStyle,
  textAlignOf,
  textIndentOf,
} from "../src/auto/style.js";
import { CollapsedText, whiteSpaceModeOf, wrapsLines, type WhiteSpaceMode } from "../src/auto/whitespace.js";

/** ブラウザが返す計算済みスタイルの初期値に近いもの（16px、行送り 28.8px のブロック）。 */
const BLOCK: AutoComputedStyle = {
  display: "block",
  position: "static",
  visibility: "visible",
  opacity: "1",
  writingMode: "horizontal-tb",
  textOrientation: "mixed",
  textCombineUpright: "none",
  direction: "ltr",
  whiteSpace: "normal",
  textWrapStyle: "auto",
  textOverflow: "clip",
  columnCount: "auto",
  columnWidth: "auto",
  listStylePosition: "outside",
  listStyleType: "disc",
  textAlign: "start",
  verticalAlign: "baseline",
  color: "rgb(0, 0, 0)",
  fontSize: "16px",
  lineHeight: "28.8px",
  fontFamily: '"Noto Sans JP", sans-serif',
  fontWeight: "400",
  fontStyle: "normal",
  fontStretch: "100%",
  fontFeatureSettings: "normal",
  fontVariantEastAsian: "normal",
  fontVariantCaps: "normal",
  fontVariantNumeric: "normal",
  fontVariantAlternates: "normal",
  fontVariantPosition: "normal",
  fontVariantEmoji: "normal",
  fontVariationSettings: "normal",
  fontSizeAdjust: "none",
  fontOpticalSizing: "auto",
  letterSpacing: "normal",
  wordSpacing: "0px",
  textIndent: "0px",
  textTransform: "none",
  wordBreak: "normal",
  textShadow: "none",
  textEmphasisStyle: "none",
  webkitTextFillColor: "rgb(0, 0, 0)",
  webkitTextStrokeWidth: "0px",
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: "none",
  paddingTop: "0px",
  paddingRight: "0px",
  paddingBottom: "0px",
  paddingLeft: "0px",
  borderTopWidth: "0px",
  borderRightWidth: "0px",
  borderBottomWidth: "0px",
  borderLeftWidth: "0px",
  marginTop: "0px",
  marginRight: "0px",
  marginBottom: "0px",
  marginLeft: "0px",
  textDecorationLine: "none",
  textDecorationStyle: "solid",
  textDecorationThickness: "auto",
  textUnderlineOffset: "auto",
  textDecorationColor: "rgb(0, 0, 0)",
  content: "normal",
};

const INLINE: AutoComputedStyle = { ...BLOCK, display: "inline" };

/**
 * 親の計算済みスタイル parent に style を重ねる。ブラウザと同じく、-webkit-text-fill-color と text-decoration-color は
 * 指定しなければ color に従う（初期値が currentcolor）。
 */
function computed(parent: AutoComputedStyle, style: Partial<AutoComputedStyle>): AutoComputedStyle {
  const merged = { ...parent, ...style };
  if (style.color !== undefined) {
    if (style.webkitTextFillColor === undefined) merged.webkitTextFillColor = style.color;
    if (style.textDecorationColor === undefined) merged.textDecorationColor = style.color;
  }
  return merged;
}

/** テキストと <br>（"\n" ではなく BR）を順に足して、たたんだ結果を返す。 */
function collapse(mode: WhiteSpaceMode, ...pieces: (string | typeof BR)[]): string {
  const out = new CollapsedText(mode);
  for (const piece of pieces) {
    if (piece === BR) out.lineBreak();
    else out.add(piece);
  }
  return out.finish().text;
}
const BR = Symbol("br");

describe("whiteSpaceModeOf / wrapsLines", () => {
  it("maps the computed white-space to how spaces collapse and whether lines wrap", () => {
    expect(whiteSpaceModeOf("normal")).toBe("collapse");
    expect(whiteSpaceModeOf("nowrap")).toBe("collapse");
    expect(whiteSpaceModeOf("pre-line")).toBe("preserve-breaks");
    expect(whiteSpaceModeOf("pre-wrap")).toBe("preserve");
    expect(whiteSpaceModeOf("")).toBeNull();
    expect(wrapsLines("normal")).toBe(true);
    expect(wrapsLines("nowrap")).toBe(false);
    expect(wrapsLines("pre")).toBe(false);
    expect(wrapsLines("pre-wrap")).toBe(true);
  });
});

describe("CollapsedText", () => {
  it("collapses runs of spaces, tabs and newlines and trims both ends of the block", () => {
    expect(collapse("collapse", "\n    Hello,   \t world!  \n  ")).toBe("Hello, world!");
  });

  it("drops a line break of the HTML source between Japanese characters, but keeps a plain space", () => {
    expect(collapse("collapse", "\n  吾輩は猫である。\n  名前はまだ無い。\n")).toBe("吾輩は猫である。名前はまだ無い。");
    expect(collapse("collapse", "吾輩は 猫である")).toBe("吾輩は 猫である");
    // サロゲートペアの漢字でも同じ
    expect(collapse("collapse", "𠮷\n野家")).toBe("𠮷野家");
  });

  it("turns a line break next to Latin text or Hangul into a space", () => {
    expect(collapse("collapse", "Hello\nworld")).toBe("Hello world");
    expect(collapse("collapse", "日本語\nEnglish\n日本語")).toBe("日本語 English 日本語");
    expect(collapse("collapse", "한국어\n한국어")).toBe("한국어 한국어");
  });

  it("collapses spaces across text nodes", () => {
    expect(collapse("collapse", "foo ", " bar", "\n", "baz")).toBe("foo bar baz");
  });

  it("makes <br> a line break, drops the spaces around it and ignores one at the end of the block", () => {
    expect(collapse("collapse", "一行目 ", BR, "\n  二行目", BR, "\n")).toBe("一行目\n二行目");
    expect(collapse("collapse", "一行目", BR, BR)).toBe("一行目\n");
    expect(collapse("collapse", BR, "二行目")).toBe("\n二行目");
  });

  it("keeps line breaks with pre-line and everything with pre-wrap", () => {
    expect(collapse("preserve-breaks", "  一行目  \n   二行目\n")).toBe("一行目\n二行目");
    expect(collapse("preserve", "  一行目  \r\n   二行目\n")).toBe("  一行目  \n   二行目");
  });

  it("moves marks back when the space or line break after them is taken back", () => {
    const out = new CollapsedText("collapse");
    out.add("あ\n");
    const start = out.mark(); // 空白（改行）の後ろ。次が和文なので空白ごと取り消される
    out.add("い ");
    const end = out.mark(); // 末尾の空白の後ろ
    out.lineBreak();
    const last = out.mark(); // 最後の改行の後ろ
    const { text, offsets } = out.finish();
    expect(text).toBe("あい");
    expect([offsets[start], offsets[end], offsets[last]]).toEqual([1, 2, 2]);
  });
});

describe("blockSkipReason", () => {
  it("accepts plain blocks, including vertical ones", () => {
    expect(blockSkipReason(BLOCK)).toBeNull();
    expect(blockSkipReason({ ...BLOCK, display: "flow-root", textAlign: "justify" })).toBeNull();
    expect(blockSkipReason({ ...BLOCK, writingMode: "vertical-rl" })).toBeNull();
    expect(blockSkipReason({ ...BLOCK, wordBreak: "break-all", whiteSpace: "nowrap" })).toBeNull();
  });

  it("accepts letter-spacing and text-indent in px, which the engine sets as options", () => {
    const reason = (style: Partial<AutoComputedStyle>) => blockSkipReason({ ...BLOCK, ...style });
    expect(reason({ letterSpacing: "2.04px" })).toBeNull();
    expect(reason({ letterSpacing: "-0.5px" })).toBeNull();
    expect(reason({ letterSpacing: "0px" })).toBeNull();
    expect(reason({ textIndent: "17px" })).toBeNull();
    expect(reason({ textIndent: "-17px" })).toBeNull();
    expect(reason({ textIndent: "17px each-line" })).toBeNull();
    expect(reason({ letterSpacing: "2.04px", textIndent: "17px", writingMode: "vertical-rl" })).toBeNull();
  });

  it("works without the properties that older browsers do not have", () => {
    const {
      textOrientation: _o,
      textCombineUpright: _c,
      textWrapStyle: _w,
      fontVariationSettings: _v,
      fontVariantCaps: _caps,
      fontVariantNumeric: _numeric,
      fontVariantAlternates: _alternates,
      fontVariantPosition: _position,
      fontVariantEmoji: _emoji,
      fontSizeAdjust: _adjust,
      fontOpticalSizing: _optical,
      webkitTextFillColor: _f,
      textDecorationThickness: _t,
      textUnderlineOffset: _u,
      ...old
    } = BLOCK;
    expect(blockSkipReason(old)).toBeNull();
    expect(blockSkipReason({ ...old, textDecorationLine: "underline" })).toBeNull();
    expect(directionOf({ writingMode: "vertical-rl" })).toBe("tbRl");
  });

  it("sets the block's own underline only when the engine can draw it as specified", () => {
    const underlined = { ...BLOCK, textDecorationLine: "underline" };
    expect(blockSkipReason(underlined)).toBeNull();
    expect(blockSkipReason({ ...underlined, textDecorationStyle: "dotted" })).toBe("text-decoration");
    expect(blockSkipReason({ ...underlined, textUnderlineOffset: "4px" })).toBe("text-decoration");
  });

  it("names the CSS that the engine cannot reproduce", () => {
    const reason = (style: Partial<AutoComputedStyle>) => blockSkipReason({ ...BLOCK, ...style });
    expect(reason({ display: "inline" })).toBe("display");
    expect(reason({ display: "flex" })).toBe("display");
    expect(reason({ display: "list-item", listStylePosition: "inside" })).toBe("list-marker");
    expect(reason({ display: "list-item" })).toBeNull();
    expect(reason({ writingMode: "vertical-lr" })).toBe("writing-mode");
    expect(reason({ writingMode: "vertical-rl", textOrientation: "upright" })).toBe("writing-mode");
    expect(reason({ direction: "rtl" })).toBe("direction");
    expect(reason({ whiteSpace: "" })).toBe("white-space");
    expect(reason({ textWrapStyle: "balance" })).toBe("text-wrap");
    expect(reason({ textOverflow: "ellipsis" })).toBe("text-overflow");
    expect(reason({ columnCount: "2" })).toBe("columns");
    // px にならない字間（パーセント）は渡せない
    expect(reason({ letterSpacing: "10%" })).toBe("letter-spacing");
    expect(reason({ wordSpacing: "2px" })).toBe("word-spacing");
    // パーセントの字下げ（幅で変わる）と、1 行目以外を下げる hanging は組めない
    expect(reason({ textIndent: "10%" })).toBe("text-indent");
    expect(reason({ textIndent: "calc(10% + 5px)" })).toBe("text-indent");
    expect(reason({ textIndent: "16px hanging" })).toBe("text-indent");
    expect(reason({ textIndent: "16px hanging each-line" })).toBe("text-indent");
    expect(reason({ textTransform: "uppercase" })).toBe("text-transform");
    expect(reason({ fontFeatureSettings: '"palt"' })).toBe("font-feature");
    expect(reason({ fontVariantEastAsian: "proportional-width" })).toBe("font-feature");
    expect(reason({ fontStretch: "75%" })).toBe("font-feature");
    // 組版結果の <svg> は、字形や文字の大きさを変える指定を初期値に戻して描く。組むと CSS の見た目と変わるので見送る
    expect(reason({ fontVariantCaps: "small-caps" })).toBe("font-feature");
    expect(reason({ fontVariantNumeric: "tabular-nums" })).toBe("font-feature");
    expect(reason({ fontVariantNumeric: "lining-nums proportional-nums" })).toBe("font-feature");
    expect(reason({ fontVariantAlternates: "historical-forms" })).toBe("font-feature");
    expect(reason({ fontVariantPosition: "sub" })).toBe("font-feature");
    expect(reason({ fontVariantEmoji: "text" })).toBe("font-feature");
    expect(reason({ fontVariationSettings: '"wght" 600' })).toBe("font-feature");
    expect(reason({ fontSizeAdjust: "0.5" })).toBe("font-feature");
    expect(reason({ fontOpticalSizing: "none" })).toBe("font-feature");
    expect(reason({ wordBreak: "keep-all" })).toBe("word-break");
    expect(reason({ textShadow: "rgb(0, 0, 0) 1px 1px 0px" })).toBe("text-effect");
    expect(reason({ webkitTextFillColor: "rgba(0, 0, 0, 0)" })).toBe("text-effect");
  });
});

describe("inlineSkipReason", () => {
  const reason = (style: Partial<AutoComputedStyle>, parent: AutoComputedStyle = BLOCK) =>
    inlineSkipReason(computed(INLINE, style), parent, BLOCK);

  it("accepts inline elements that only change color, weight, style or decoration", () => {
    expect(reason({})).toBeNull();
    expect(reason({ color: "rgb(200, 0, 0)", fontWeight: "700", fontStyle: "italic", textDecorationLine: "underline" })).toBeNull();
    expect(reason({ display: "contents", position: "relative" })).toBeNull();
  });

  it("names what cannot be set in the same line", () => {
    expect(reason({ display: "inline-block" })).toBe("non-inline");
    expect(reason({ display: "block" })).toBe("non-inline");
    expect(reason({ position: "absolute" })).toBe("non-inline");
    expect(reason({ fontSize: "12px" })).toBe("font-size");
    expect(reason({ fontFamily: "monospace" })).toBe("font-family");
    expect(reason({ whiteSpace: "nowrap" })).toBe("white-space");
    expect(reason({ textCombineUpright: "all" })).toBe("writing-mode");
    expect(reason({ verticalAlign: "super" })).toBe("vertical-align");
    expect(reason({ backgroundColor: "rgb(255, 255, 0)" })).toBe("inline-box");
    expect(reason({ backgroundColor: "rgba(255, 255, 0, 0.5)" })).toBe("inline-box");
    expect(reason({ backgroundColor: "color(srgb 1 1 0 / 0)" })).toBeNull();
    expect(reason({ paddingLeft: "4px" })).toBe("inline-box");
    expect(reason({ borderBottomWidth: "1px" })).toBe("inline-box");
    expect(reason({ opacity: "0.5" })).toBe("text-effect");
    expect(reason({ letterSpacing: "1px" })).toBe("letter-spacing");
    // 一部の文字だけ字形を変える指定（等幅の数字、スモールキャップ）も、組むと初期値の字形になる
    expect(reason({ fontVariantNumeric: "tabular-nums" })).toBe("font-feature");
    expect(reason({ fontVariantCaps: "all-small-caps" })).toBe("font-feature");
    expect(reason({ fontSizeAdjust: "0.55" })).toBe("font-feature");
  });

  it("accepts the letter-spacing of the block, and names an inline element that changes it", () => {
    // 字間はブロックの値 1 つで組むので、インライン要素がブロックと同じ字間（継承した値）なら組める
    const tracked = { ...BLOCK, letterSpacing: "2px" };
    const inTracked = (style: Partial<AutoComputedStyle>) =>
      inlineSkipReason(computed({ ...tracked, display: "inline" }, style), tracked, tracked);
    expect(inTracked({})).toBeNull();
    expect(inTracked({ letterSpacing: "3px" })).toBe("letter-spacing");
    expect(inTracked({ letterSpacing: "normal" })).toBe("letter-spacing");
    // normal と 0px は同じ字間
    expect(reason({ letterSpacing: "0px" })).toBeNull();
    // text-indent はブロックの 1 行目に入るもので、インライン要素の値は効かない
    expect(reason({ textIndent: "10%" })).toBeNull();
    const indented = { ...BLOCK, textIndent: "16px" };
    expect(inlineSkipReason(computed({ ...indented, display: "inline" }, {}), indented, indented)).toBeNull();
  });

  it("compares white-space with the parent element", () => {
    // 入れ子の要素は、親の要素と比べる（ブロックの直下の要素は、ブロックと比べる）
    const parent = { ...INLINE, whiteSpace: "nowrap" };
    expect(reason({ whiteSpace: "nowrap" }, parent)).toBeNull();
    expect(reason({ whiteSpace: "normal" }, parent)).toBe("white-space");
  });

  it("does not set lines that the engine cannot draw as specified", () => {
    const underline = { textDecorationLine: "underline" };
    expect(reason(underline)).toBeNull();
    expect(reason({ textDecorationLine: "line-through" })).toBeNull();
    expect(reason({ textDecorationLine: "underline line-through" })).toBeNull();
    // エンジンは実線を、自分で決めた太さと位置に描く
    expect(reason({ ...underline, textDecorationStyle: "wavy" })).toBe("text-decoration");
    expect(reason({ ...underline, textDecorationThickness: "3px" })).toBe("text-decoration");
    expect(reason({ ...underline, textDecorationThickness: "from-font" })).toBe("text-decoration");
    expect(reason({ ...underline, textUnderlineOffset: "3.4px" })).toBe("text-decoration");
    // 打ち消し線に、下線の位置は関係ない
    expect(reason({ textDecorationLine: "line-through", textUnderlineOffset: "3.4px" })).toBeNull();
    // 上線は描けない
    expect(reason({ textDecorationLine: "overline" })).toBe("text-decoration");
    expect(reason({ textDecorationLine: "underline overline" })).toBe("text-decoration");
    // 線を引いていない要素では、線の指定（継承した text-underline-offset など）を見ない
    expect(reason({ textUnderlineOffset: "3.4px", textDecorationStyle: "dotted", textDecorationThickness: "2px" })).toBeNull();
  });
});

describe("optionsFromStyle", () => {
  it("takes the font, size, line height and alignment from CSS", () => {
    const options = optionsFromStyle({ ...BLOCK, textAlign: "justify", fontWeight: "700", fontStyle: "oblique 10deg" }, 28.8);
    expect(options.direction).toBe("lrTb");
    expect(options.fontSize).toBe(16);
    expect(options.lineHeightScale).toBeCloseTo(1.8, 10);
    expect(options.textAlign).toBe("justify");
    expect(options.fonts?.japanese).toEqual({ family: '"Noto Sans JP", sans-serif', weight: "700", style: "oblique" });
    // 欧文も同じ font-family を等倍で使い、和文と同じ仮想ボディに置く
    expect(options.fonts?.latin).toEqual({
      family: '"Noto Sans JP", sans-serif',
      weight: "700",
      style: "oblique",
      scale: 1,
      ascent: 0.88,
      descent: 0.12,
    });
    expect(optionsFromStyle({ ...BLOCK, writingMode: "vertical-rl" }, 32).direction).toBe("tbRl");
  });

  it("takes the letter spacing and the first-line indent from CSS", () => {
    const plain = optionsFromStyle(BLOCK, 28.8);
    expect(plain.letterSpacing).toBe(0);
    expect(plain.textIndent).toBe(0);
    // CSS の text-indent は、each-line を付けない限り最初の行だけに入る（<br> の後ろの行は字下げしない）
    expect(plain.textIndentEachLine).toBe(false);
    const options = optionsFromStyle({ ...BLOCK, letterSpacing: "1.92px", textIndent: "16px" }, 28.8);
    expect(options.letterSpacing).toBe(1.92);
    expect(options.textIndent).toBe(16);
    expect(options.textIndentEachLine).toBe(false);
    const each = optionsFromStyle({ ...BLOCK, letterSpacing: "-0.5px", textIndent: "-16px each-line" }, 28.8);
    expect(each.letterSpacing).toBe(-0.5);
    expect(each.textIndent).toBe(-16);
    expect(each.textIndentEachLine).toBe(true);
  });

  it("reads px lengths and rejects what cannot be passed to the engine", () => {
    expect(letterSpacingOf({ letterSpacing: "normal" })).toBe(0);
    expect(letterSpacingOf({ letterSpacing: "2.04px" })).toBe(2.04);
    expect(letterSpacingOf({ letterSpacing: "1e-7px" })).toBe(1e-7);
    expect(letterSpacingOf({ letterSpacing: "10%" })).toBeNull();
    expect(letterSpacingOf({ letterSpacing: "0.1em" })).toBeNull();
    expect(textIndentOf({ textIndent: "0px" })).toEqual({ length: 0, eachLine: false });
    expect(textIndentOf({ textIndent: "17px each-line" })).toEqual({ length: 17, eachLine: true });
    expect(textIndentOf({ textIndent: "17px hanging" })).toBeNull();
    expect(textIndentOf({ textIndent: "10%" })).toBeNull();
    expect(textIndentOf({ textIndent: "calc(10% + 5px)" })).toBeNull();
  });

  it("maps text-align keywords", () => {
    expect(["start", "left", "center", "right", "end", "justify", "-webkit-center"].map(textAlignOf)).toEqual([
      "leading",
      "leading",
      "center",
      "trailing",
      "trailing",
      "justify",
      "center",
    ]);
  });

  it("lets the caller override single options and single font properties", () => {
    const base = optionsFromStyle(BLOCK, 28.8);
    expect(mergeAutoOptions(base, undefined)).toBe(base);
    const merged = mergeAutoOptions(base, { punctuationMode: "half", fonts: { latin: { family: "Georgia, serif", scale: 0.92 } } });
    expect(merged.punctuationMode).toBe("half");
    expect(merged.fontSize).toBe(16);
    expect(merged.fonts?.japanese).toEqual(base.fonts?.japanese);
    expect(merged.fonts?.latin).toMatchObject({ family: "Georgia, serif", scale: 0.92, weight: "400", ascent: 0.88 });
    // フォントは一部の項目だけでも指定できる（family は CSS の font-family のまま）
    const scaled = mergeAutoOptions(base, { fonts: { latin: { scale: 0.95 }, emoji: { scale: 0.9 } } });
    expect(scaled.fonts?.latin).toMatchObject({ family: '"Noto Sans JP", sans-serif', scale: 0.95, weight: "400" });
    expect(scaled.fonts?.japanese).toEqual(base.fonts?.japanese);
    expect(scaled.fonts?.emoji).toEqual({ scale: 0.9 });
  });
});

/** readAutoSource が使うだけの、DOM の要素とテキストノードの代わり。 */
interface FakeNode {
  nodeType: number;
  data?: string;
  tagName?: string;
  childNodes?: FakeNode[];
  style?: AutoComputedStyle;
  pseudo?: Record<string, AutoComputedStyle>;
  attributes?: Record<string, string>;
  getAttribute?: (name: string) => string | null;
}

/** 親の計算済みスタイルを引き継いだ要素を作る。 */
function el(
  tagName: string,
  style: Partial<AutoComputedStyle>,
  children: (FakeNode | string)[],
  attributes: Record<string, string> = {},
  parent: AutoComputedStyle = INLINE,
): FakeNode {
  return {
    nodeType: 1,
    tagName,
    style: computed(parent, style),
    attributes,
    getAttribute: (name) => attributes[name] ?? null,
    childNodes: children.map((c) => (typeof c === "string" ? { nodeType: 3, data: c } : c)),
  };
}

/** ブロック（<p>）の中身を読み取る。 */
function read(children: (FakeNode | string)[], block: Partial<AutoComputedStyle> = {}) {
  const blockStyle = { ...BLOCK, ...block };
  const host = el("P", {}, children, {}, blockStyle);
  return readAutoSource(host as unknown as Element, {
    blockStyle,
    mode: whiteSpaceModeOf(blockStyle.whiteSpace) ?? "collapse",
    styleOf: (node, pseudo) => {
      const fake = node as unknown as FakeNode;
      return (pseudo ? fake.pseudo?.[pseudo] : fake.style) ?? null;
    },
  });
}

describe("readAutoSource", () => {
  it("reads the collapsed text with links and bold text as spans", () => {
    const link = el("A", { color: "rgb(0, 0, 238)", textDecorationLine: "underline" }, ["GitHub"], {
      href: "https://example.com/",
      target: "_blank",
    });
    const strong = el("STRONG", { fontWeight: "700" }, ["太字"]);
    const result = read(["\n  ソースコードは\n  ", link, "\n  で公開しています。\n  ", strong, "も組めます。\n"]);
    expect(result).toEqual({
      ok: true,
      source: {
        // 和文と欧文の間の改行は空白になり、和文どうしの間の改行は消える
        text: "ソースコードは GitHub で公開しています。太字も組めます。",
        spans: [
          { start: 8, end: 14, href: "https://example.com/", target: "_blank", color: "rgb(0, 0, 238)", underline: true },
          { start: 24, end: 26, fontWeight: "700" },
        ],
        elements: [link, strong],
      },
    });
  });

  it("keeps a space that starts inside an element inside its span", () => {
    const outside = read(["foo ", el("B", { fontWeight: "700" }, [" bar"])]);
    expect(outside.ok && [outside.source.text, outside.source.spans]).toEqual(["foo bar", [{ start: 4, end: 7, fontWeight: "700" }]]);
    const inside = read(["foo", el("B", { fontWeight: "700" }, [" bar "]), "baz"]);
    expect(inside.ok && [inside.source.text, inside.source.spans]).toEqual(["foo bar baz", [{ start: 3, end: 8, fontWeight: "700" }]]);
  });

  it("turns <br> into a line break unless it is hidden", () => {
    const shown = read(["一行目", el("BR", {}, []), "二行目"]);
    expect(shown.ok && shown.source.text).toBe("一行目\n二行目");
    const hidden = read(["一行目", el("BR", { display: "none" }, []), "二行目"]);
    expect(hidden.ok && hidden.source.text).toBe("一行目二行目");
  });

  it("skips hidden elements and scripts, and keeps the offsets of what follows", () => {
    const result = read([
      "見える",
      el("SPAN", { display: "none" }, ["見えない"]),
      el("SCRIPT", {}, ["var x;"]),
      el("EM", { fontStyle: "italic" }, ["斜体"]),
    ]);
    expect(result.ok && [result.source.text, result.source.spans]).toEqual(["見える斜体", [{ start: 3, end: 5, fontStyle: "italic" }]]);
  });

  it("makes the underline of the block itself a span over the whole text", () => {
    const result = read(["見出し"], { textDecorationLine: "underline" });
    expect(result.ok && result.source.spans).toEqual([{ start: 0, end: 3, underline: true }]);
  });

  it("gives the reason when something in the block cannot be set", () => {
    const reason = (children: (FakeNode | string)[]) => {
      const result = read(children);
      return result.ok ? null : result.reason;
    };
    expect(reason(["漢", el("RUBY", { display: "ruby" }, ["字", el("RT", {}, ["じ"])])])).toBe("ruby");
    expect(reason(["図 ", el("IMG", {}, [])])).toBe("media");
    expect(reason(["図 ", el("svg", {}, [])])).toBe("media");
    expect(reason([el("INPUT", { display: "inline-block" }, [])])).toBe("form-control");
    expect(reason(["a", el("MY-CHIP", {}, ["b"])])).toBe("custom-element");
    expect(reason(["コード ", el("CODE", { fontFamily: "monospace" }, ["x"])])).toBe("font-family");
    expect(reason(["注", el("SUP", { fontSize: "12px", verticalAlign: "super" }, ["1"])])).toBe("font-size");
    expect(reason([el("SPAN", { display: "block" }, ["ブロック"])])).toBe("non-inline");
    expect(reason([el("EM", {}, [el("MARK", { backgroundColor: "rgb(255, 255, 0)" }, ["印"])])])).toBe("inline-box");
    expect(reason(["  \n ", el("SPAN", {}, [" "])])).toBe("empty");
    // 隠した画像は無いものとして扱う
    expect(reason(["図 ", el("IMG", { display: "none" }, [])])).toBeNull();
  });

  it("reads a block with letter-spacing whose inline elements inherit it, but not one that changes it", () => {
    const tracked = { ...INLINE, letterSpacing: "2px" };
    const strong = el("STRONG", { fontWeight: "700" }, ["太字"], {}, tracked);
    const same = read(["字間のある", strong], { letterSpacing: "2px" });
    expect(same.ok && [same.source.text, same.source.spans]).toEqual([
      "字間のある太字",
      [{ start: 5, end: 7, fontWeight: "700" }],
    ]);
    const wide = el("SPAN", { letterSpacing: "6px" }, ["広い"], {}, tracked);
    expect(read(["字間のある", wide], { letterSpacing: "2px" })).toEqual({ ok: false, reason: "letter-spacing" });
  });

  it("does not set elements whose ::before or ::after adds content", () => {
    const link = el("A", {}, ["外部リンク"], { href: "/" });
    link.pseudo = { "::after": { ...INLINE, content: '"↗"' } };
    expect(read([link])).toEqual({ ok: false, reason: "generated-content" });
    link.pseudo = { "::after": { ...INLINE, content: "none" } };
    expect(read([link]).ok).toBe(true);
  });

  it("compares the white-space of the block's children with the block itself", () => {
    // 折り返さない指定の要素は組めない。子が自分で normal を指定していても、ブロックと同じなら組める
    expect(read(["普通", el("SPAN", { whiteSpace: "nowrap" }, ["折り返さない"])])).toEqual({ ok: false, reason: "white-space" });
    const same = read(["普通", el("EM", { fontStyle: "italic", whiteSpace: "normal" }, ["斜体"])]);
    expect(same.ok && same.source.text).toBe("普通斜体");
    // ブロックが nowrap なら、継承した nowrap の子も組める
    const nowrap = read(["普通", el("EM", { fontStyle: "italic", whiteSpace: "nowrap" }, ["斜体"])], { whiteSpace: "nowrap" });
    expect(nowrap.ok && nowrap.source.text).toBe("普通斜体");
  });

  it("does not set a link whose underline has its own offset, thickness or style", () => {
    const link = (style: Partial<AutoComputedStyle>) =>
      read(["詳しくは", el("A", { textDecorationLine: "underline", ...style }, ["こちら"], { href: "/" })]);
    expect(link({}).ok).toBe(true);
    expect(link({ textUnderlineOffset: "3px" })).toEqual({ ok: false, reason: "text-decoration" });
    expect(link({ textDecorationStyle: "dotted" })).toEqual({ ok: false, reason: "text-decoration" });
  });
});

describe("autoStone outside the browser", () => {
  it("does nothing on the server", () => {
    const handle = autoStone();
    expect(handle.report()).toEqual([]);
    handle.refresh();
    handle.destroy();
    // 読み込むだけの入口も、サーバーでは始めない
    expect(autoStoneHandle).toBeNull();
  });
});
