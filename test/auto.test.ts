import { describe, expect, it } from "vitest";
import { autoStone } from "../src/index.js";
import { autoStoneHandle } from "../src/auto/index.js";
import { readAutoSource, type AutoComputedStyle } from "../src/auto/source.js";
import {
  blockSkipReason,
  directionOf,
  inlineSkipReason,
  mergeAutoOptions,
  optionsFromStyle,
  textAlignOf,
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
  fontVariationSettings: "normal",
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

  it("works without the properties that older browsers do not have", () => {
    const {
      textOrientation: _o,
      textCombineUpright: _c,
      textWrapStyle: _w,
      fontVariationSettings: _v,
      webkitTextFillColor: _f,
      ...old
    } = BLOCK;
    expect(blockSkipReason(old)).toBeNull();
    expect(directionOf({ writingMode: "vertical-rl" })).toBe("tbRl");
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
    expect(reason({ letterSpacing: "0.8px" })).toBe("letter-spacing");
    expect(reason({ letterSpacing: "0px" })).toBeNull();
    expect(reason({ wordSpacing: "2px" })).toBe("word-spacing");
    expect(reason({ textIndent: "16px" })).toBe("text-indent");
    expect(reason({ textTransform: "uppercase" })).toBe("text-transform");
    expect(reason({ fontFeatureSettings: '"palt"' })).toBe("font-feature");
    expect(reason({ fontVariantEastAsian: "proportional-width" })).toBe("font-feature");
    expect(reason({ fontStretch: "75%" })).toBe("font-feature");
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
  });

  it("compares white-space with what the element inherits, not with the block", () => {
    // 組んだ後は、中身を隠している要素から nowrap を継承する
    const hidden = { ...BLOCK, whiteSpace: "nowrap" };
    expect(reason({ whiteSpace: "nowrap" }, hidden)).toBeNull();
    expect(reason({ whiteSpace: "normal" }, hidden)).toBe("white-space");
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
function read(children: (FakeNode | string)[], block: Partial<AutoComputedStyle> = {}, base?: AutoComputedStyle) {
  const blockStyle = { ...BLOCK, ...block };
  const host = el("P", {}, children, {}, blockStyle);
  return readAutoSource(host as unknown as Element, {
    blockStyle,
    baseStyle: base ?? blockStyle,
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

  it("does not set elements whose ::before or ::after adds content", () => {
    const link = el("A", {}, ["外部リンク"], { href: "/" });
    link.pseudo = { "::after": { ...INLINE, content: '"↗"' } };
    expect(read([link])).toEqual({ ok: false, reason: "generated-content" });
    link.pseudo = { "::after": { ...INLINE, content: "none" } };
    expect(read([link]).ok).toBe(true);
  });

  it("compares the children of the block with what they inherit once the source is hidden", () => {
    const hiddenBase = { ...BLOCK, whiteSpace: "nowrap" };
    const child = el("EM", { fontStyle: "italic", whiteSpace: "nowrap" }, ["斜体"]);
    const result = read(["普通", child], {}, hiddenBase);
    // 空白のたたみ方はブロックの white-space（normal）のまま
    expect(result.ok && result.source.text).toBe("普通斜体");
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
