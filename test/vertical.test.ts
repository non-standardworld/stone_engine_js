import { describe, expect, it } from "vitest";
import {
  detectVerticalForms,
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

describe("verticalGlyphTransform", () => {
  it("classifies the characters whose vertical glyphs are rotated or moved", () => {
    for (const char of Array.from("「」『』（）【】〔〕［］｛｝〈〉《》ー〜～―…‥：＝｜")) {
      expect(verticalGlyphTransform(char)).toEqual({ type: "rotate" });
    }
    expect(verticalGlyphTransform("“", true)).toEqual({ type: "rotate" });
    for (const char of Array.from("、。，．ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ〝〟")) {
      expect(verticalGlyphTransform(char)?.type).toBe("shift");
    }
    for (const char of Array.from("あ漢ア・！？※")) {
      expect(verticalGlyphTransform(char)).toBeNull();
    }
  });
});
