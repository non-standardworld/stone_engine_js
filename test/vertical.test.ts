import { describe, expect, it } from "vitest";
import {
  detectVerticalForms,
  fontFeatureSettingsOf,
  glyphElements,
  glyphParagraphs,
  svgString,
  verticalGlyphTransform,
  type GlyphElement,
  type StoneContext,
} from "../src/index.js";
import { lay, runOf } from "./helpers.js";

/** 文字の描画要素。 */
function glyphOf(ctx: StoneContext, char: string, forms: "feature" | "emulated"): GlyphElement {
  const { id } = runOf(ctx, char);
  const el = glyphElements(ctx, { verticalForms: forms }).find((g) => g.runId === id);
  if (!el) throw new Error(`glyph not found: ${char}`);
  return el;
}

describe("detectVerticalForms", () => {
  it("emulates the vertical glyphs only in Apple's WebKit, where font-feature-settings: vert has no effect", () => {
    const safari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
    const iosChrome =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1";
    const chrome =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    const edge = `${chrome} Edg/140.0.0.0`;
    const firefox = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0";
    expect(detectVerticalForms(safari)).toBe("emulated");
    expect(detectVerticalForms(iosChrome)).toBe("emulated"); // iOS のブラウザはすべて WebKit
    expect(detectVerticalForms(chrome)).toBe("feature");
    expect(detectVerticalForms(edge)).toBe("feature");
    expect(detectVerticalForms(firefox)).toBe("feature");
    expect(detectVerticalForms("")).toBe("feature");
  });
});

describe("emulated vertical glyphs", () => {
  it("rotates brackets and the prolonged sound mark around the center of the em box", () => {
    // 和文のアセントは 8.8（fontSize 10 × 0.88）。原点を (x + 1em − アセント, y − アセント) に移して 90 度回す
    const ctx = lay("あ「い」ー", { direction: "tbRl" });
    for (const char of ["「", "」", "ー"]) {
      const { run } = runOf(ctx, char);
      const el = glyphOf(ctx, char, "emulated");
      expect(el).toMatchObject({ text: char, rotate: 90, vertical: false });
      expect(el.x).toBeCloseTo(run.position.x + 1.2, 5);
      expect(el.y).toBeCloseTo(run.position.y - 8.8, 5);
    }
  });

  it("moves the comma, the full stop and small kana to the upper right", () => {
    const ctx = lay("あ、い。っゃ", { direction: "tbRl" });
    const expected: Record<string, [number, number]> = { "、": [6.5, -6.35], "。": [5.9, -5.9], "っ": [1.2, -1.65], "ゃ": [1, -1] };
    for (const [char, [dx, dy]] of Object.entries(expected)) {
      const { run } = runOf(ctx, char);
      const el = glyphOf(ctx, char, "emulated");
      expect(el).toMatchObject({ text: char, rotate: 0, vertical: false });
      expect(el.x).toBeCloseTo(run.position.x + dx, 5);
      expect(el.y).toBeCloseTo(run.position.y + dy, 5);
    }
  });

  it("leaves other characters where they are and keeps the source text", () => {
    const ctx = lay("あ「い、う」", { direction: "tbRl" });
    const emulated = glyphElements(ctx, { verticalForms: "emulated" });
    expect(emulated.map((el) => el.text).join("")).toBe("あ「い、う」");
    const a = emulated[0];
    expect(a).toMatchObject({ x: ctx.runs[0].position.x, y: ctx.runs[0].position.y, rotate: 0, vertical: false });
  });

  it("does not use vert at all, and rotates the full-width quotation marks", () => {
    const ctx = lay("あ“い”う", { direction: "tbRl" });
    const svg = svgString(ctx, { verticalForms: "emulated" });
    expect(svg).not.toContain("vert");
    expect(svg).toContain('style="font-feature-settings:&quot;fwid&quot; 1"');
    expect(glyphOf(ctx, "“", "emulated")).toMatchObject({ rotate: 90, fullWidth: true, vertical: false });
    // 1 つの段落の <text> にまとまったまま
    expect((svg.match(/<text /g) ?? []).length).toBe(1);
  });

  it("keeps using vert in the feature mode", () => {
    const ctx = lay("あ「い、っ」", { direction: "tbRl" });
    const groups = glyphParagraphs(ctx, { verticalForms: "feature" })[0].groups;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ vertical: true });
    expect(groups[0].glyphs.every((el) => el.rotate === 0)).toBe(true);
    expect(svgString(ctx, { verticalForms: "feature" })).toContain("&quot;vert&quot; 1");
  });

  it("does not change horizontal text or rotated latin text", () => {
    const horizontal = lay("あ「い、っ」");
    expect(glyphElements(horizontal, { verticalForms: "emulated" })).toEqual(
      glyphElements(horizontal, { verticalForms: "feature" }),
    );
    const latin = lay("Hello", { direction: "tbRl" });
    expect(glyphElements(latin, { verticalForms: "emulated" })).toEqual(
      glyphElements(latin, { verticalForms: "feature" }),
    );
  });
});

describe("half-width katakana in vertical text", () => {
  const FORMS = ["feature", "emulated"] as const;
  /** 半角カナ（U+FF61–FF9F）の 63 文字。 */
  const HALFWIDTH_KANA = Array.from({ length: 0xff9f - 0xff61 + 1 }, (_, i) => String.fromCodePoint(0xff61 + i));

  it("rotates every half-width katakana around the center of the em box in both forms, without the font's vertical glyphs", () => {
    // 和文のアセントは 8.8（fontSize 10 × 0.88）。原点を (x + 1em − アセント, y − アセント) に移して 90 度回すと、回した字形が
    // 列の 1em のますに重なる（半角カナは送り幅が 0.5em なので、字面はますの上半分に来る）。
    // vrt2 の横倒しの字形（横組みの送り幅が 1em）は、vert が使えるブラウザ（feature）でも使わない
    expect(HALFWIDTH_KANA).toHaveLength(63);
    for (const char of HALFWIDTH_KANA) {
      const ctx = lay(char, { direction: "tbRl" });
      expect(ctx.runs).toHaveLength(1);
      expect(ctx.runs[0].position).toEqual({ x: 0, y: 8.8 });
      for (const forms of FORMS) {
        const [el] = glyphElements(ctx, { verticalForms: forms });
        expect(el).toMatchObject({ text: char, rotate: 90, vertical: false, fullWidth: false });
        expect(el.x).toBeCloseTo(1.2, 5);
        expect(el.y).toBeCloseTo(0, 5);
      }
    }
  });

  it("rotates a kana with a voiced or semi-voiced sound mark as one cluster, so that the mark comes below the kana", () => {
    // 「ｶﾞ」「ﾊﾟ」は 1 つの書記素（1 つの run、1 つの <tspan>）。rotate 属性は書記素のまとまりごと回すので、「ｶ」の下に濁点が来る。
    // vrt2 の字形に置き換えると、2 文字目の濁点が 1em 右（右隣の列の位置）に描かれる
    const ctx = lay("ｶﾞﾊﾟ", { direction: "tbRl" });
    expect(ctx.runs.map((run) => run.char)).toEqual(["ｶﾞ", "ﾊﾟ"]);
    for (const forms of FORMS) {
      for (const char of ["ｶﾞ", "ﾊﾟ"]) {
        const { run } = runOf(ctx, char);
        const el = glyphOf(ctx, char, forms);
        expect(el).toMatchObject({ text: char, rotate: 90, vertical: false });
        expect(el.x).toBeCloseTo(run.position.x + 1.2, 5);
        expect(el.y).toBeCloseTo(run.position.y - 8.8, 5);
      }
      const svg = svgString(ctx, { verticalForms: forms });
      expect(svg).toContain('<tspan x="1.2" y="0" rotate="90" data-run="0">ｶﾞ</tspan><tspan x="1.2" y="10" rotate="90" data-run="1">ﾊﾟ</tspan>');
      expect(svg).not.toContain("vrt2");
    }
  });

  it("keeps vert for the other characters around them in the feature form", () => {
    // 半角カナだけが、vert を指定しないまとまり（<tspan>）に分かれる
    const ctx = lay("あｱｶﾞ｡い", { direction: "tbRl" });
    const feature = glyphParagraphs(ctx, { verticalForms: "feature" })[0].groups;
    expect(feature.map((g) => [g.glyphs.map((el) => el.text).join(""), g.vertical, fontFeatureSettingsOf(g)])).toEqual([
      ["あ", true, '"vert" 1, "vrt2" 1'],
      ["ｱｶﾞ｡", false, null],
      ["い", true, '"vert" 1, "vrt2" 1'],
    ]);
    expect(feature[1].glyphs.map((el) => el.rotate)).toEqual([90, 90, 90]);
    expect(feature[0].glyphs[0]).toMatchObject({ x: ctx.runs[0].position.x, y: ctx.runs[0].position.y, rotate: 0 });
    // vert を使わない描き方では、もともと 1 つのまとまり
    const emulated = glyphParagraphs(ctx, { verticalForms: "emulated" })[0].groups;
    expect(emulated.map((g) => [g.glyphs.map((el) => el.text).join(""), g.vertical])).toEqual([["あｱｶﾞ｡い", false]]);
    // 半角カナの描き方は、どちらでも同じ
    const kana = (forms: "feature" | "emulated") =>
      glyphElements(ctx, { verticalForms: forms }).filter((el) => /^[｡-ﾟ]/.test(el.text));
    expect(kana("feature")).toHaveLength(3);
    expect(kana("feature")).toEqual(kana("emulated"));
  });

  it("draws text of half-width katakana alone identically in both forms", () => {
    const ctx = lay("ﾃﾞｰﾀ｢ｺﾋﾟｰ｣､ﾊﾞｯｸｱｯﾌﾟ｡", { direction: "tbRl" }, { height: 60 });
    expect(ctx.lineCount).toBeGreaterThan(1);
    expect(svgString(ctx, { verticalForms: "feature" })).toBe(svgString(ctx, { verticalForms: "emulated" }));
    expect(svgString(ctx, { verticalForms: "feature" })).not.toContain("font-feature-settings:&quot;");
  });

  it("treats only U+FF61–FF9F as half-width katakana", () => {
    // 手前の「｠」(U+FF60) は全角の括弧、後ろの U+FFA0 は半角のハングル。全角のカナも、vert のまま
    const ctx = lay("｠ﾠアｱ", { direction: "tbRl" });
    expect(glyphElements(ctx, { verticalForms: "feature" }).map((el) => [el.text, el.rotate, el.vertical])).toEqual([
      ["｠", 0, true],
      ["ﾠ", 0, true],
      ["ア", 0, true],
      ["ｱ", 90, false],
    ]);
    // vert を使わない描き方では、「｠」は表にあるので回り、U+FFA0 と「ア」はそのまま
    expect(glyphElements(ctx, { verticalForms: "emulated" }).map((el) => [el.text, el.rotate, el.vertical])).toEqual([
      ["｠", 90, false],
      ["ﾠ", 0, false],
      ["ア", 0, false],
      ["ｱ", 90, false],
    ]);
  });

  it("does not rotate them in horizontal text", () => {
    const ctx = lay("あｱｶﾞｰ｡");
    for (const forms of FORMS) {
      const elements = glyphElements(ctx, { verticalForms: forms });
      expect(elements.map((el) => [el.text, el.rotate, el.vertical])).toEqual([
        ["あ", 0, false],
        ["ｱ", 0, false],
        ["ｶﾞ", 0, false],
        ["ｰ", 0, false],
        ["｡", 0, false],
      ]);
      expect(elements.map((el) => [el.x, el.y])).toEqual(ctx.runs.map((run) => [run.position.x, run.position.y]));
    }
  });

  it("draws the ellipsis that replaces a half-width katakana upright, like any other vertical ellipsis", () => {
    // 省略記号は run の文字にかかわらず、和文フォントの正立の「︙」を列の 1em 四方に描く（半角カナと一緒には回さない）
    const ctx = lay("ｱｲｳｴｵｶ", { direction: "tbRl" }, { width: 10, height: 35 });
    const ellipsis = ctx.runs.findIndex((run) => run.visibility === "ellipsis");
    expect(ctx.runs[ellipsis].char).toBe("ｳ");
    for (const forms of FORMS) {
      const elements = glyphElements(ctx, { verticalForms: forms });
      expect(elements.map((el) => [el.text, el.rotate])).toEqual([
        ["ｱ", 90],
        ["ｲ", 90],
        ["︙", 0],
      ]);
      expect(elements[2]).toMatchObject({ x: 0, y: 28.8, vertical: true });
    }
  });
});

describe("verticalGlyphTransform", () => {
  it("classifies the characters whose vertical glyphs are rotated or moved", () => {
    for (const char of Array.from("「」『』（）【】〔〕［］｛｝〈〉《》ー〜～―…‥：＝｜")) {
      expect(verticalGlyphTransform(char)).toEqual({ type: "rotate" });
    }
    // 半角カナ（半角の括弧・句読点・長音・濁点を含む）は回す。濁点・半濁点の付いたまとまりも、先頭の文字で決まる
    for (const char of ["ｱ", "ﾝ", "ｯ", "ｰ", "｡", "､", "･", "｢", "｣", "ﾞ", "ﾟ", "ｶﾞ", "ﾊﾟ"]) {
      expect(verticalGlyphTransform(char)).toEqual({ type: "rotate" });
    }
    expect(verticalGlyphTransform("ﾠ")).toBeNull(); // 半角のハングルは対象外
    expect(verticalGlyphTransform("“", true)).toEqual({ type: "rotate" });
    for (const char of Array.from("、。，．ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ〝〟")) {
      expect(verticalGlyphTransform(char)?.type).toBe("shift");
    }
    for (const char of Array.from("あ漢ア・！？※")) {
      expect(verticalGlyphTransform(char)).toBeNull();
    }
  });
});
