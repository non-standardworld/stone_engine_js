import { describe, expect, it } from "vitest";
import { glyphElements, glyphParagraphs, svgString, textOfRunRange, type StoneContext } from "../src/index.js";
import { lay } from "./helpers.js";

/** 段落ごとに、描画する文字列をつなげたもの。 */
function paragraphTexts(ctx: StoneContext): string[] {
  return glyphParagraphs(ctx).map((p) => p.groups.flatMap((g) => g.glyphs.map((el) => el.text)).join(""));
}

describe("SVG output", () => {
  it("puts each paragraph in a single <text> with one <tspan> per character", () => {
    // 1 文字ごとに <text> を分けると、コピーしたテキストが 1 文字ずつ改行される
    const ctx = lay("日本語 Hello\n二行目");
    const svg = svgString(ctx);
    expect((svg.match(/<text /g) ?? []).length).toBe(2);
    expect(svg).toContain('<text xml:space="preserve">');
    expect(svg).toContain('<tspan x="0" y="8.8" data-run="0">日</tspan>');
    expect(paragraphTexts(ctx)).toEqual(["日本語 Hello", "二行目"]);
  });

  it("keeps spaces as characters, while glyphElements still skips them", () => {
    const ctx = lay("a b");
    expect(svgString(ctx)).toContain('data-run="1"> </tspan>');
    expect(glyphElements(ctx).map((el) => el.text)).toEqual(["a", "b"]);
  });

  it("keeps wrapped lines in the same paragraph", () => {
    const ctx = lay("あいうえおかきくけこ", {}, { width: 55 });
    expect(ctx.lineCount).toBe(2);
    expect(paragraphTexts(ctx)).toEqual(["あいうえおかきくけこ"]);
  });

  it("writes a blank line as a space on its newline run", () => {
    const ctx = lay("あ\n\nい\n");
    expect(paragraphTexts(ctx)).toEqual(["あ", " ", "い"]);
    expect(glyphParagraphs(ctx)[1].groups[0].glyphs[0].runId).toBe(2);
  });

  it("omits hidden characters and draws the ellipsis", () => {
    expect(paragraphTexts(lay("あいうえおかきくけこ", {}, { width: 55, height: 10 }))).toEqual(["あいうえ…"]);
    expect(
      paragraphTexts(lay("あいうえおかきくけこ", { direction: "tbRl" }, { width: 10, height: 55 })),
    ).toEqual(["あいうえ︙"]);
  });
});

describe("textOfRunRange", () => {
  it("returns the source text between the selected characters, with newlines and spaces", () => {
    const ctx = lay("日本語 Hello\n\n二行目");
    expect(textOfRunRange(ctx, 0, ctx.runs.length)).toBe("日本語 Hello\n\n二行目");
    expect(textOfRunRange(ctx, 2, 6)).toBe("語 He");
  });

  it("includes the truncated rest when the ellipsis is selected", () => {
    const ctx = lay("あいうえおかきくけこ", {}, { width: 55, height: 10 });
    const ellipsis = ctx.runs.findIndex((run) => run.visibility === "ellipsis");
    expect(textOfRunRange(ctx, 0, ellipsis)).toBe("あいうえ");
    expect(textOfRunRange(ctx, 1, ellipsis + 1)).toBe("いうえおかきくけこ");
  });

  it("includes the newline and blank lines after the ellipsis", () => {
    // 改行や空行の手前の文字が省略記号になり、その後ろの改行・空行は隠れる
    const newline = lay("あ\nい", {}, { height: 10 });
    expect(textOfRunRange(newline, 0, 1)).toBe("あ\nい");
    const blank = lay("あいう\n\nえお", {}, { height: 20 });
    expect(textOfRunRange(blank, 0, 2)).toBe("あい");
    expect(textOfRunRange(blank, 0, 3)).toBe("あいう\n\nえお");
  });
});
