import { describe, expect, it } from "vitest";
import { lay, lines, runOf } from "./helpers.js";

describe("layout lrTb", () => {
  it("wraps at the given width and lays out lines top to bottom", () => {
    const ctx = lay("あいうえおかきくけこ", { kinsoku: false }, { width: 55 });
    expect(ctx.lineCount).toBe(2);
    expect(lines(ctx)).toEqual(["あいうえお", "かきくけこ"]);
    expect(ctx.runs[0].frame).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(ctx.runs[0].position).toEqual({ x: 0, y: 8.8 }); // baseline = ascent 0.88em
    expect(ctx.runs[5].frame).toEqual({ x: 0, y: 10, width: 10, height: 10 });
    expect(ctx.renderedSize).toEqual({ width: 50, height: 20 });
  });

  it("does not wrap when width is unlimited", () => {
    const ctx = lay("あいうえおかきくけこ");
    expect(ctx.lineCount).toBe(1);
    expect(ctx.renderedSize).toEqual({ width: 100, height: 10 });
  });

  it("applies line height scale", () => {
    const ctx = lay("あい\nうえ", { lineHeightScale: 1.5 });
    expect(ctx.lineCount).toBe(2);
    expect(ctx.runs[3].frame.y).toBe(15);
    expect(ctx.renderedSize.height).toBe(30);
  });

  it("counts a trailing newline as an empty line", () => {
    const ctx = lay("あ\n");
    expect(ctx.lineCount).toBe(2);
    expect(ctx.renderedSize.height).toBe(20);
  });

  it("keeps words together when dividing by words", () => {
    const ctx = lay("日本語の組版です", { dividesByWords: true }, { width: 45 });
    // 日本語(3) の(1) → 40px、組版(2) は入らないので次行へ
    expect(lines(ctx)).toEqual(["日本語の", "組版です"]);
  });

  it("uses latin scale and measured metrics for latin runs", () => {
    const ctx = lay("あA");
    const { run } = runOf(ctx, "A");
    expect(run.advance).toBeCloseTo(9.5 * 0.55);
    expect(run.frame.height).toBeCloseTo(9.5);
    expect(run.frame.y).toBeCloseTo(8.8 - 9.5 * 0.9); // 共有ベースラインからアセント分上
    expect(run.position.y).toBe(8.8);
  });
});

describe("kinsoku", () => {
  it("moves a not-starting char to the previous line's content", () => {
    const off = lay("あいうえ。かき", { kinsoku: false }, { width: 40 });
    expect(lines(off)).toEqual(["あいうえ", "。かき"]);
    const on = lay("あいうえ。かき", {}, { width: 40 });
    expect(lines(on)).toEqual(["あいう", "え。かき"]);
  });

  it("does not end a line with an opening bracket", () => {
    const ctx = lay("あいう「えお", {}, { width: 40 });
    expect(lines(ctx)).toEqual(["あいう", "「えお"]);
  });

  it("walks back by whole tokens when dividing by words", () => {
    // 「組版」の後ろに来る「。」を行頭にできないので、トークン「組版」ごと次行へ送る
    const ctx = lay("日本語の組版。です", { dividesByWords: true }, { width: 60 });
    expect(lines(ctx)).toEqual(["日本語の", "組版。です"]);
  });
});

describe("punctuation", () => {
  it("whole mode keeps every glyph at full width", () => {
    const ctx = lay("「あ」。", { punctuationMode: "whole" });
    expect(ctx.runs.map((r) => r.frame.width)).toEqual([10, 10, 10, 10]);
  });

  it("half mode compresses every punctuation glyph", () => {
    const ctx = lay("「あ」。・", { punctuationMode: "half" });
    expect(ctx.runs.map((r) => r.frame.width)).toEqual([5, 10, 5, 5, 5]);
    expect(ctx.runs[0].position.x).toBe(-5); // 「 のインクは後半にあるので左へずらす
    expect(ctx.runs[0].frame.x).toBe(0);
    expect(ctx.runs[4].position.x).toBeCloseTo(25 - 2.5); // ・ は中央
    expect(ctx.renderedSize.width).toBe(30);
  });

  it("stone mode compresses only where punctuation marks meet", () => {
    const ctx = lay("あ「い」。う", { punctuationMode: "stone" });
    // 「 は前が約物でないので全角、」 は後ろが 。 なので半角、。 は行末（テキスト末尾）なので全角
    expect(ctx.runs.map((r) => r.frame.width)).toEqual([10, 10, 10, 5, 10, 10]);
  });

  it("stone mode halves an opening bracket at the start of a broken line and its closing at the end", () => {
    const ctx = lay("あ」「いう", { punctuationMode: "stone" }, { width: 20 });
    expect(lines(ctx)).toEqual(["あ」", "「い", "う"]);
    const close = runOf(ctx, "」").run;
    expect(close.frame.width).toBe(5); // 行末の 」 は半角
    const open = runOf(ctx, "「").run;
    expect(open.frame).toEqual({ x: 0, y: 10, width: 5, height: 10 });
    expect(open.position.x).toBe(-5); // 二重に詰めない
    expect(runOf(ctx, "い").run.frame.x).toBe(5);
  });

  it("stone mode shifts a whole line when it starts with an opening bracket", () => {
    const ctx = lay("あい「うえ」", { punctuationMode: "stone" }, { width: 20 });
    expect(lines(ctx)).toEqual(["あい", "「う", "え」"]);
    const open = runOf(ctx, "「").run;
    expect(open.position.x).toBe(-5);
    expect(open.frame.width).toBe(5);
    expect(runOf(ctx, "う").run.frame.x).toBe(5);
  });
});

describe("alignment", () => {
  it("centers and trails lines", () => {
    const center = lay("あい", { textAlign: "center" }, { width: 50 });
    expect(center.runs[0].frame.x).toBe(15);
    const trailing = lay("あい", { textAlign: "trailing" }, { width: 50 });
    expect(trailing.runs[0].frame.x).toBe(30);
    expect(trailing.runs[0].position.x).toBe(30);
  });

  it("justifies all lines but the last, spreading tokens to the full width", () => {
    const ctx = lay("あいうえおか", { textAlign: "justify" }, { width: 45 });
    expect(lines(ctx)).toEqual(["あいうえ", "おか"]);
    const gap = 5 / 3;
    expect(ctx.runs[1].frame.x).toBeCloseTo(10 + gap);
    expect(ctx.runs[3].frame.x + ctx.runs[3].frame.width).toBeCloseTo(45);
    expect(ctx.runs[3].position.x).toBeCloseTo(35);
    expect(ctx.runs[4].frame.x).toBe(0); // 最終行はそのまま
  });

  it("does not justify a line that ends with a newline", () => {
    const ctx = lay("あい\nうえおか", { textAlign: "justify" }, { width: 45 });
    expect(ctx.runs[1].frame.x).toBe(10);
  });

  it("aligns along the direction axis", () => {
    const middle = lay("あ", { directionAlign: "middle" }, { width: 100, height: 100 });
    expect(middle.runs[0].frame.y).toBe(45);
    const end = lay("あ", { directionAlign: "end" }, { width: 100, height: 100 });
    expect(end.runs[0].frame.y).toBe(90);
  });
});

describe("truncation", () => {
  it("marks runs that do not fit and reports isTruncated", () => {
    const ctx = lay("あいうえおかき", {}, { width: 40, height: 15 });
    expect(ctx.isTruncated).toBe(true);
    expect(ctx.runs[3].visibility).toBe("ellipsis");
    const fits = lay("あいうえ", {}, { width: 40, height: 15 });
    expect(fits.isTruncated).toBe(false);
    expect(fits.runs.every((r) => r.visibility === "visible")).toBe(true);
  });

  it("shrinks the font to fit when adjustsFontSizeToFitWidth is set", () => {
    const ctx = lay(
      "あいうえおかきくけこ",
      { fontSize: 20, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 },
      { width: 100, height: 20 },
    );
    expect(ctx.isTruncated).toBe(false);
    expect(ctx.runs.every((r) => r.visibility === "visible")).toBe(true);
    expect(ctx.adjustFontScale).toBeGreaterThanOrEqual(0.5);
    expect(ctx.adjustFontScale).toBeLessThanOrEqual(0.55);
    expect(ctx.runs[0].frame.width).toBeCloseTo(20 * ctx.adjustFontScale);
  });
});

describe("geometry helpers", () => {
  it("hit-tests and finds the closest caret index", () => {
    const ctx = lay("あい\nう");
    expect(ctx.hitRunIndex({ x: 15, y: 5 })).toBe(1);
    expect(ctx.hitRunIndex({ x: 5, y: 15 })).toBe(3);
    expect(ctx.hitRunIndex({ x: 50, y: 5 })).toBeNull();
    expect(ctx.closestRunIndex({ x: 3, y: 5 })).toBe(0);
    expect(ctx.closestRunIndex({ x: 18, y: 5 })).toBe(2);
    expect(ctx.lineRanges()).toEqual([
      { line: 0, start: 0, end: 3 },
      { line: 1, start: 3, end: 4 },
    ]);
    expect(ctx.text).toBe("あい\nう");
  });
});
