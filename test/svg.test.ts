import { describe, expect, it } from "vitest";
import { glyphElements, glyphParagraphs, svgString, textOfRunRange, type StoneContext } from "../src/index.js";
import { lay, runOf } from "./helpers.js";

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

  it("draws vertical dashes and leaders upright with the vertical glyphs of the Japanese font", () => {
    // 和文の文字と同じ <tspan>（vert）にまとまり、rotate を付けない
    const ctx = lay("あ……い——う", { direction: "tbRl" });
    expect(svgString(ctx)).not.toContain("rotate=");
    const groups = glyphParagraphs(ctx)[0].groups;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ fontId: 1, vertical: true });
    expect(groups[0].glyphs.map((el) => el.text).join("")).toBe("あ……い——う");
  });

  it("draws upright general punctuation such as ‼ and ※ in vertical text without rotating it", () => {
    // 和文の文字と同じ <tspan>（vert、スケール 1）にまとまり、rotate を付けない
    const ctx = lay("あ‼い※う", { direction: "tbRl" });
    expect(svgString(ctx)).not.toContain("rotate=");
    const groups = glyphParagraphs(ctx)[0].groups;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ fontId: 1, vertical: true, fontSize: 10 });
    // 欧文の単語の後ろでは、欧文だけを回転する
    const latin = lay("Wow‼", { direction: "tbRl" });
    expect(glyphElements(latin).map((el) => el.rotate)).toEqual([90, 90, 90, 0]);
  });

  it("draws quotation marks in vertical Japanese text with the vertical glyphs of the full-width forms", () => {
    // 和文フォントの「“」などはプロポーショナルな字形で vert の置き換え先がないので、fwid で全角にしてから vert を掛ける
    const ctx = lay("あ“い”う", { direction: "tbRl" });
    const svg = svgString(ctx);
    expect(svg).not.toContain("rotate=");
    expect(svg).toContain('<tspan font-family=');
    expect(svg).toContain('style="font-feature-settings:&quot;fwid&quot; 1, &quot;vert&quot; 1, &quot;vrt2&quot; 1"');
    const groups = glyphParagraphs(ctx)[0].groups;
    expect(groups.map((g) => [g.glyphs.map((el) => el.text).join(""), g.fontId, g.vertical, g.fullWidth])).toEqual([
      ["あ", 1, true, false],
      ["“", 1, true, true],
      ["い", 1, true, false],
      ["”", 1, true, true],
      ["う", 1, true, false],
    ]);
    // 横書きと、欧文の単語の引用符（縦書きで回転する）は全角にしない
    expect(glyphElements(lay("あ“い”")).some((el) => el.fullWidth)).toBe(false);
    const latin = lay("“Hi”", { direction: "tbRl" });
    expect(glyphElements(latin).map((el) => [el.rotate, el.fullWidth])).toEqual([[90, false], [90, false], [90, false], [90, false]]);
  });

  it("omits hidden characters and draws the ellipsis", () => {
    expect(paragraphTexts(lay("あいうえおかきくけこ", {}, { width: 55, height: 10 }))).toEqual(["あいうえ…"]);
    expect(
      paragraphTexts(lay("あいうえおかきくけこ", { direction: "tbRl" }, { width: 10, height: 55 })),
    ).toEqual(["あいうえ︙"]);
  });

  it("draws the vertical ellipsis upright in the Japanese font at the column of a rotated latin run", () => {
    // 回転する欧文の run と一緒に「︙」を回すと点が横に並ぶので、正立のまま和文フォントで列の位置に描く
    const ctx = lay("あいうえabcかきく", { direction: "tbRl" }, { width: 10, height: 56 });
    const b = runOf(ctx, "b");
    expect(b.run.visibility).toBe("ellipsis");
    expect(ctx.isClockwise(b.run)).toBe(true);
    const svg = svgString(ctx);
    expect(svg).not.toMatch(/rotate="90"[^>]*>︙/);
    expect(svg).toContain(`<tspan x="0" y="54.03" data-run="${b.id}">︙</tspan>`); // 45.225 + 1em - ディセント 1.2
    const group = glyphParagraphs(ctx)[0].groups.find((g) => g.glyphs.some((el) => el.runId === b.id));
    expect(group).toMatchObject({ fontId: ctx.runs[0].fontId, fontSize: 10, vertical: true }); // 和文の「あ」と同じ
    expect(group?.glyphs[0]).toMatchObject({ text: "︙", rotate: 0 });
  });

  it("draws the vertical ellipsis of a tate-chu-yoko at the column instead of the centered digit", () => {
    // 1 桁の縦中横は列の中央に寄せてある（x = 2.39）が、「︙」は和文の文字と同じく列の左端から 1em 四方に描く
    const ctx = lay("あいうえ1かき", { direction: "tbRl" }, { width: 10, height: 55 });
    const one = runOf(ctx, "1");
    expect(one.run.visibility).toBe("ellipsis");
    expect(one.run.frame.x).toBeCloseTo(2.39, 2);
    expect(svgString(ctx)).toContain(`<tspan x="0" y="48.8" data-run="${one.id}">︙</tspan>`);
    // 和文の文字なら、その文字を描く位置のまま
    const japanese = lay("あいうえおかきくけこ", { direction: "tbRl" }, { width: 10, height: 55 });
    expect(svgString(japanese)).toContain('<tspan x="0" y="48.8" data-run="4">︙</tspan>');
  });

  it("draws a tate-chu-yoko wider than 1em in an edge column where it is, sticking out of the area", () => {
    // 幅 20px は 2 列ちょうど。2 桁の縦中横（10.45px）は列の中央に置くので、端の列では数字の送り幅の箱が領域から 0.225px 出る。
    // 列は隠さず、数字もその位置に描く（幅と高さを両方決めた領域では、はみ出した分を SVG が切り取る）
    const right = lay("78\nあい", { direction: "tbRl", dividesByWords: true }, { width: 20, height: 30 });
    const svg = svgString(right);
    expect(svg).toContain('width="20" height="30"');
    expect(svg).toContain("overflow:hidden");
    expect(svg).not.toContain("︙");
    expect(paragraphTexts(right)).toEqual(["78", "あい"]);
    expect(svg).toContain('<tspan x="9.77" y="7.63" data-run="0">7</tspan><tspan x="15" y="7.63" data-run="1">8</tspan>'); // 「8」は 20.225px まで
    expect(svg).toContain('<tspan x="0" y="8.8" data-run="3">あ</tspan>');
    // 左端の列では、数字の原点が領域の左に出る
    const left = lay("あい\n78", { direction: "tbRl", dividesByWords: true }, { width: 20, height: 30 });
    expect(paragraphTexts(left)).toEqual(["あい", "78"]);
    expect(svgString(left)).toContain('<tspan x="-0.23" y="7.63" data-run="3">7</tspan><tspan x="5" y="7.63" data-run="4">8</tspan>');
    // 幅だけを決めた領域では、SVG は領域の外を切り取らない
    expect(svgString(lay("78\nあい", { direction: "tbRl", dividesByWords: true }, { width: 20 }))).toContain("overflow:visible");
  });

  it("draws the ellipsis from the start of the frame of a compressed opening bracket", () => {
    // 半角にした「は原点を左にずらして描くが、省略記号は矩形の先頭から描く（前の文字に重ねない）
    const ctx = lay("あ「\nい", { punctuationMode: "half" }, { height: 10 });
    const open = runOf(ctx, "「");
    expect(open.run.visibility).toBe("ellipsis");
    expect(open.run.position.x).toBe(5);
    expect(svgString(ctx)).toContain(`<tspan x="10" y="8.8" data-run="${open.id}">…</tspan>`);
  });

  it("resets the inherited text properties on the root, so that the page's CSS cannot move or change the glyphs", () => {
    // どれも継承されるプロパティ。ページ側の指定が SVG のテキストに届くと、文字の位置・向き・字形がレイアウトと食い違う
    for (const ctx of [lay("日本語 Hello"), lay("日本語 Hello", { direction: "tbRl" })]) {
      const style = (svgString(ctx).match(/^<svg [^>]* style="([^"]*)"/)?.[1] ?? "").split(";");
      // 縦書きの要素の中に置かれると、SVG の <text> が自分で文字を縦に並べ、<tspan x y> の原点が文字の上端の中央になる
      expect(style).toContain("writing-mode:horizontal-tb");
      // 原点の意味を変えるもの（direction: rtl では文字が x の左側に置かれる）
      expect(style).toEqual(expect.arrayContaining(["direction:ltr", "text-anchor:start", "dominant-baseline:auto"]));
      // 測ったものと違う文字・字形・送り幅で描かせるもの（合字とカーニングは、1 文字ずつ置くので使わない）
      expect(style).toEqual(
        expect.arrayContaining([
          "text-transform:none",
          "font-variant:none",
          "font-kerning:none",
          "font-feature-settings:normal",
          "font-variation-settings:normal",
          "font-optical-sizing:auto",
          "font-stretch:normal",
          "font-size-adjust:none",
        ]),
      );
    }
    // エンジンが使う font-feature-settings（縦組み用グリフ）は、文字のまとまりの <tspan> がルートの normal を上書きする
    const vertical = svgString(lay("日本語", { direction: "tbRl" }), { verticalForms: "feature" });
    expect(vertical).toContain('style="font-feature-settings:&quot;vert&quot; 1, &quot;vrt2&quot; 1"');
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

  it("includes the characters hidden to make room for the ellipsis", () => {
    const ctx = lay("abcdefghijklmnopq", {}, { width: 40, height: 10 });
    const ellipsis = ctx.runs.findIndex((run) => run.visibility === "ellipsis");
    expect(textOfRunRange(ctx, 0, ellipsis)).toBe("abcde");
    expect(textOfRunRange(ctx, 0, ellipsis + 1)).toBe("abcdefghijklmnopq");
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
