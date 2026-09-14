import { describe, expect, it } from "vitest";
import { svgString } from "../src/index.js";
import { lay, lines, runOf } from "./helpers.js";

describe("layout tbRl", () => {
  it("lays out columns top to bottom, right to left", () => {
    const ctx = lay("あいうえおかきくけこ", { direction: "tbRl" }, { height: 55 });
    expect(ctx.lineCount).toBe(2);
    expect(lines(ctx)).toEqual(["あいうえお", "かきくけこ"]);
    // 幅が無制限なので左端が 0 になるようにずらす: 2 行目（左の列）が x=0
    expect(ctx.runs[5].frame).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(ctx.runs[0].frame).toEqual({ x: 10, y: 0, width: 10, height: 10 });
    expect(ctx.runs[1].frame.y).toBe(10);
    expect(ctx.runs[0].position).toEqual({ x: 10, y: 8.8 }); // 仮想ボディの下端にディセントを合わせる
    expect(ctx.renderedSize).toEqual({ width: 20, height: 50 });
  });

  it("right-aligns columns inside a finite width (directionAlign start)", () => {
    const ctx = lay("あいうえおかきくけこ", { direction: "tbRl" }, { width: 100, height: 55 });
    expect(ctx.runs[0].frame.x).toBe(90);
    expect(ctx.runs[5].frame.x).toBe(80);
    const end = lay("あい", { direction: "tbRl", directionAlign: "end" }, { width: 100, height: 55 });
    expect(end.runs[0].frame.x).toBe(0);
    const middle = lay("あい", { direction: "tbRl", directionAlign: "middle" }, { width: 100, height: 55 });
    expect(middle.runs[0].frame.x).toBe(45);
  });

  it("rotates latin runs clockwise and uses their advance as height", () => {
    const ctx = lay("あAb", { direction: "tbRl" });
    const a = runOf(ctx, "A").run;
    expect(ctx.isClockwise(a)).toBe(true);
    expect(ctx.isClockwise(ctx.runs[0])).toBe(false);
    expect(a.frame.width).toBe(10);
    expect(a.frame.height).toBeCloseTo(9.5 * 0.55);
    expect(a.frame.y).toBe(10);
    expect(a.position.x).toBeCloseTo(a.frame.x + 9.5 * 0.25); // 回転後のベースラインはディセント分右
    expect(ctx.usesVerticalGlyph(ctx.runs[0])).toBe(true);
    expect(ctx.usesVerticalGlyph(a)).toBe(false);
  });

  it("sets two-digit numbers upright side by side (tate-chu-yoko)", () => {
    const ctx = lay("あ12い345う", { direction: "tbRl", dividesByWords: true });
    const one = runOf(ctx, "1").run;
    const two = runOf(ctx, "2").run;
    expect(ctx.isTateChuYoko(one)).toBe(true);
    expect(ctx.isClockwise(one)).toBe(false);
    expect(two.frame.y).toBe(one.frame.y);
    expect(two.frame.x).toBeGreaterThan(one.frame.x);
    expect(one.frame.height).toBe(10);
    expect(runOf(ctx, "い").run.frame.y).toBe(one.frame.y + 10);
    // 3 桁は回転
    const three = runOf(ctx, "3").run;
    expect(ctx.isTateChuYoko(three)).toBe(false);
    expect(ctx.isClockwise(three)).toBe(true);
    // 縦中横は列の中央に寄せる
    const total = one.advance + two.advance;
    expect(one.frame.x).toBeCloseTo(one.frame.x); // sanity
    expect(one.position.x).toBeCloseTo(two.position.x - one.advance);
    expect((one.frame.x + two.frame.x + two.frame.width) / 2).toBeCloseTo(ctx.runs[0].frame.x + 5 + (one.frame.x - (ctx.runs[0].frame.x + (10 - total) / 2)));
  });

  it("can turn tate-chu-yoko off", () => {
    const ctx = lay("あ12", { direction: "tbRl", dividesByWords: true, allowsTateChuYoko: false });
    expect(ctx.isClockwise(runOf(ctx, "1").run)).toBe(true);
  });

  it("applies kinsoku and punctuation compression vertically", () => {
    const ctx = lay("あいうえ。かき", { direction: "tbRl" }, { height: 40 });
    expect(lines(ctx)).toEqual(["あいう", "え。かき"]);
    const stone = lay("あ」「いう", { direction: "tbRl", punctuationMode: "stone" }, { height: 20 });
    expect(lines(stone)).toEqual(["あ」", "「い", "う"]);
    expect(runOf(stone, "」").run.frame.height).toBe(5);
    const open = runOf(stone, "「").run;
    expect(open.frame.height).toBe(5);
    expect(open.position.y).toBeCloseTo(8.8 - 5);
    expect(runOf(stone, "い").run.frame.y).toBe(5);
  });

  it("justifies columns", () => {
    const ctx = lay("あいうえおか", { direction: "tbRl", textAlign: "justify" }, { height: 45 });
    expect(lines(ctx)).toEqual(["あいうえ", "おか"]);
    expect(ctx.runs[3].frame.y + ctx.runs[3].frame.height).toBeCloseTo(45);
    expect(ctx.runs[4].frame.y).toBe(0);
    const tcy = lay("あ1い", { direction: "tbRl", dividesByWords: true, textAlign: "justify" }, { height: 40 });
    // 1 桁の縦中横の後でも送りが進む
    expect(tcy.lineCount).toBe(1);
  });

  it("renders vertical text as SVG with rotation and vert features", () => {
    const ctx = lay("あA", { direction: "tbRl" });
    const svg = svgString(ctx);
    expect(svg).toContain("rotate(90");
    expect(svg).toContain("font-feature-settings");
    expect((svg.match(/<text /g) ?? []).length).toBe(2);
    expect(svg).toContain('data-run="0"');
  });
});
