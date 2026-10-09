import { describe, expect, it } from "vitest";
import {
  FixedMeasurer,
  FontManager,
  StoneTextController,
  fontIdWithScript,
  glyphElements,
  glyphParagraphs,
  readStoneSource,
  relayout,
  resolveFonts,
  scriptOfFontId,
  svgString,
  type FontStyleSpan,
  type Run,
  type StoneContext,
} from "../src/index.js";
import { sameSpans } from "../src/render/spans.js";
import { lay, runOf } from "./helpers.js";

// <StoneText>普通<strong>太字 Bold</strong></StoneText>
const TEXT = "普通太字 Bold";
const STRONG: FontStyleSpan[] = [{ start: 2, end: 9, fontWeight: "700" }];

/** 文字の run を順に並べたもの。 */
function runsOf(ctx: StoneContext, chars: string): Run[] {
  return Array.from(chars, (c) => runOf(ctx, c).run);
}

describe("font variants", () => {
  it("adds the variant of every script once per weight and style, keeping the script in the font ID", () => {
    const fm = new FontManager(resolveFonts(), new FixedMeasurer());
    const bold = fm.variantFontId(1, 700);
    expect(bold).toBe(4);
    expect(fm.fonts).toHaveLength(6);
    expect(fm.font(bold)).toMatchObject({ id: 4, script: "japanese", weight: 700, style: "normal" });
    expect(fm.font(3)).toMatchObject({ script: "latin", weight: 700 });
    // "bold" と 700 は同じ変種
    expect(fm.variantFontId(0, "bold")).toBe(3);
    expect(fm.variantFontId(2, 700, "italic")).toBe(8);
    expect(scriptOfFontId(8)).toBe("emoji");
    expect(fontIdWithScript(8, "latin")).toBe(6);
    // 通常のフォントと同じ太さ・スタイルは変種を作らない
    expect(fm.variantFontId(1, "400", "normal")).toBe(1);
    expect(fm.fonts).toHaveLength(9);
  });

  it("uses the metrics of the regular font for a variant, so the baseline does not move", () => {
    const fm = new FontManager(resolveFonts(), {
      advance: (_font, size) => size,
      metrics: (font, size) => ({ ascent: size * (font.weight === 700 ? 0.95 : 0.9), descent: size * 0.25 }),
    });
    expect(fm.ascent(fm.variantFontId(0, 700), 10)).toBe(fm.ascent(0, 10));
  });
});

describe("layout with font style spans", () => {
  it("measures bold characters with the bold font and keeps their neighbours from overlapping", () => {
    const regular = lay(TEXT);
    const ctx = lay(TEXT, {}, {}, STRONG);
    const [B, o, l, d] = runsOf(ctx, "Bold");
    // 太字の欧文は 6px × latin scale 0.95、和文は全角のまま
    expect(B.advance).toBeCloseTo(5.7, 5);
    expect(runOf(regular, "B").run.advance).toBeCloseTo(5.225, 5);
    expect(runOf(ctx, "太").run.advance).toBe(10);
    for (const [prev, run] of [[B, o], [o, l], [l, d]]) expect(run.frame.x).toBeCloseTo(prev.frame.x + prev.frame.width, 5);
    expect(d.frame.x + d.frame.width).toBeCloseTo(runOf(regular, "d").run.frame.x + 5.225 + 4 * (5.7 - 5.225), 5);
    // 文字種は変わらず、ベースラインもそろう
    expect(scriptOfFontId(B.fontId)).toBe("latin");
    expect(scriptOfFontId(runOf(ctx, "太").run.fontId)).toBe("japanese");
    expect(runOf(ctx, "普").run.fontId).toBe(1);
    expect(B.position.y).toBe(runOf(regular, "B").run.position.y);
  });

  it("wraps a bold word that no longer fits on the line", () => {
    const options = { dividesByWords: true };
    expect(lay(TEXT, options, { width: 64 }).lineCount).toBe(1);
    const ctx = lay(TEXT, options, { width: 64 }, STRONG);
    expect(ctx.lineCount).toBe(2);
    expect(runOf(ctx, "B").run.line).toBe(1);
  });

  it("lays out bold vertical text: rotated latin by its bold advance and upright japanese in the bold font", () => {
    const ctx = lay(TEXT, { direction: "tbRl" }, {}, STRONG);
    const [B, o, l, d] = runsOf(ctx, "Bold");
    expect(ctx.isClockwise(B)).toBe(true);
    expect(B.frame.height).toBeCloseTo(5.7, 5);
    for (const [prev, run] of [[B, o], [o, l], [l, d]]) expect(run.frame.y).toBeCloseTo(prev.frame.y + prev.frame.height, 5);
    const ta = runOf(ctx, "太").run;
    expect(ctx.usesVerticalGlyph(ta)).toBe(true);
    expect(ta.frame.height).toBe(10);
  });

  it("keeps tate-chu-yoko and full-width quotation marks working in a variant", () => {
    const ctx = lay("第12回“はい”", { direction: "tbRl" }, {}, [{ start: 0, end: 8, fontWeight: 700 }]);
    const one = runOf(ctx, "1").run;
    expect(ctx.isTateChuYoko(one)).toBe(true);
    expect(one.advance).toBeCloseTo(5.7, 5);
    const quote = runOf(ctx, "“").run;
    expect(scriptOfFontId(quote.fontId)).toBe("japanese");
    expect(ctx.fontManager.font(quote.fontId).weight).toBe(700);
    expect(ctx.usesFullWidthGlyph(quote)).toBe(true);
    expect(quote.advance).toBe(10);
  });

  it("lets an inner span override the weight and style of an outer one", () => {
    // <strong>ab<span style="font-weight: normal">cd</span></strong><em>ef</em>
    const ctx = lay("abcdef", {}, {}, [
      { start: 0, end: 4, fontWeight: "700" },
      { start: 2, end: 4, fontWeight: "400" },
      { start: 4, end: 6, fontStyle: "italic" },
    ]);
    const fm = ctx.fontManager;
    expect(fm.font(runOf(ctx, "a").run.fontId).weight).toBe("700");
    expect(runOf(ctx, "c").run.fontId).toBe(0);
    expect(fm.font(runOf(ctx, "e").run.fontId)).toMatchObject({ weight: "normal", style: "italic" });
    // 太さとスタイルは別々に引き継ぐ
    const both = lay("abc", {}, {}, [
      { start: 0, end: 3, fontWeight: 700 },
      { start: 1, end: 2, fontStyle: "italic" },
    ]);
    expect(both.fontManager.font(runOf(both, "b").run.fontId)).toMatchObject({ weight: 700, style: "italic" });
  });

  it("keeps the variants when laying out again at another size, and lists them in the context's fonts", () => {
    const ctx = lay(TEXT, {}, {}, STRONG);
    expect(ctx.fonts.map((f) => f.weight)).toEqual(["normal", "normal", "normal", "700", "700", "700"]);
    relayout(ctx, { width: 64 });
    expect(runOf(ctx, "B").run.advance).toBeCloseTo(5.7, 5);
  });

  it("does not change the layout when no span sets a weight or a style", () => {
    const ctx = lay(TEXT, {}, {}, [{ start: 2, end: 9, fontWeight: undefined }]);
    expect(ctx.fonts).toHaveLength(3);
    expect(ctx.runs.map((r) => r.fontId)).toEqual(lay(TEXT).runs.map((r) => r.fontId));
  });
});

describe("drawing font style spans", () => {
  it("draws the bold characters in a group with the bold weight, horizontally and vertically", () => {
    for (const direction of ["lrTb", "tbRl"] as const) {
      const ctx = lay(TEXT, { direction }, {}, STRONG);
      const groups = glyphParagraphs(ctx)[0].groups.map((g) => [g.glyphs.map((el) => el.text).join(""), g.fontWeight]);
      expect(groups).toEqual([
        ["普通", "normal"],
        ["太字", "700"],
        [" Bold", "700"],
      ]);
      const svg = svgString(ctx, { spans: STRONG });
      expect(svg).toMatch(/font-weight="700"[^>]*>(<tspan [^>]*data-run="(2|3)">[太字]<\/tspan>){2}<\/tspan>/);
      expect(svg).toMatch(/font-weight="normal"[^>]*><tspan [^>]*data-run="0">普/);
    }
  });

  it("draws the italic style", () => {
    const svg = svgString(lay("ab", {}, {}, [{ start: 1, end: 2, fontStyle: "italic" }]));
    expect(svg).toMatch(/font-style="italic"[^>]*><tspan [^>]*data-run="1">b</);
  });

  it("draws the vertical ellipsis of a bold run in the bold japanese font", () => {
    const ctx = lay("あいうえabcかきく", { direction: "tbRl" }, { width: 10, height: 56 }, [{ start: 0, end: 10, fontWeight: 700 }]);
    const ellipsis = glyphElements(ctx).find((el) => el.text === "︙");
    expect(ellipsis).toBeDefined();
    expect(scriptOfFontId(ellipsis!.fontId)).toBe("japanese");
    expect(ellipsis!.fontWeight).toBe(700);
  });
});

describe("StoneTextController", () => {
  it("passes the font style spans to the layout", () => {
    const layouts: StoneContext[] = [];
    const controller = new StoneTextController({ measurer: new FixedMeasurer(), onLayout: (ctx) => layouts.push(ctx) });
    controller.update({ text: TEXT, options: { fontSize: 10 }, size: {}, spans: STRONG });
    expect(runOf(layouts[0], "B").run.advance).toBeCloseTo(5.7, 5);
    controller.dispose();
  });
});

/** readStoneSource が使うだけの、DOM の要素とテキストノードの代わり。 */
type FakeStyle = Partial<CSSStyleDeclaration>;
interface FakeNode {
  nodeType: number;
  data?: string;
  tagName?: string;
  childNodes?: FakeNode[];
  style?: FakeStyle;
  ownerDocument?: unknown;
  getAttribute?: (name: string) => string | null;
}

const BASE_STYLE: FakeStyle = {
  display: "inline",
  color: "rgb(0, 0, 0)",
  fontWeight: "400",
  fontStyle: "normal",
  textDecorationLine: "none",
};

/** 親の計算済みスタイルを引き継いだ要素を作る。 */
function el(tagName: string, style: FakeStyle, children: (FakeNode | string)[], parent: FakeStyle = BASE_STYLE): FakeNode {
  const computed = { ...parent, ...style };
  return {
    nodeType: 1,
    tagName,
    style: computed,
    getAttribute: () => null,
    childNodes: children.map((c) => (typeof c === "string" ? { nodeType: 3, data: c } : c)),
  };
}

describe("readStoneSource", () => {
  it("reads the weight and style of <strong>, <em> and inline CSS that differ from the parent", () => {
    const bold = { fontWeight: "700" };
    const view = { getComputedStyle: (node: FakeNode) => node.style };
    const root = el("SPAN", {}, [
      "普通",
      el("STRONG", bold, ["太字 ", el("SPAN", { fontWeight: "400" }, ["細"], { ...BASE_STYLE, ...bold }), "Bold"]),
      el("EM", { fontStyle: "oblique 10deg" }, ["斜め"]),
      el("B", bold, [el("SPAN", {}, ["同じ"], { ...BASE_STYLE, ...bold })]),
    ]);
    root.ownerDocument = { defaultView: view };
    const source = readStoneSource(root as unknown as Element);
    expect(source.text).toBe("普通太字 細Bold斜め同じ");
    expect(source.spans).toEqual([
      { start: 2, end: 10, fontWeight: "700" },
      { start: 5, end: 6, fontWeight: "400" },
      { start: 10, end: 12, fontStyle: "oblique" },
      { start: 12, end: 14, fontWeight: "700" },
    ]);
    expect(sameSpans(source.spans, [...source.spans.slice(0, 3), { start: 12, end: 14, fontWeight: "800" }])).toBe(false);
  });
});
