import { describe, expect, it } from "vitest";
import { svgString } from "../src/index.js";
import { lay, lines, runOf, shown } from "./helpers.js";

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

  it("justifies all lines but the last, spreading characters to the full width", () => {
    const ctx = lay("あいうえおか", { textAlign: "justify" }, { width: 45 });
    expect(lines(ctx)).toEqual(["あいうえ", "おか"]);
    const gap = 5 / 3;
    expect(ctx.runs[1].frame.x).toBeCloseTo(10 + gap);
    expect(ctx.runs[3].frame.x + ctx.runs[3].frame.width).toBeCloseTo(45);
    expect(ctx.runs[3].position.x).toBeCloseTo(35);
    expect(ctx.runs[4].frame.x).toBe(0); // 最終行はそのまま
  });

  it("spreads the slack between characters, not between words, when dividing by words", () => {
    const ctx = lay("日本語の組版です", { dividesByWords: true, textAlign: "justify" }, { width: 45 });
    expect(lines(ctx)).toEqual(["日本語の", "組版です"]);
    // 日本語｜の の 1 か所ではなく、日｜本｜語｜の の 3 か所に 5px を配る
    const gap = 5 / 3;
    expect(runOf(ctx, "本").run.frame.x).toBeCloseTo(10 + gap);
    expect(runOf(ctx, "語").run.frame.x).toBeCloseTo(20 + gap * 2);
    expect(runOf(ctx, "の").run.frame.x).toBeCloseTo(30 + gap * 3);
    expect(runOf(ctx, "の").run.frame.x + runOf(ctx, "の").run.frame.width).toBeCloseTo(45);
  });

  it("does not open up the inside of a latin word", () => {
    // あ(10) abc(5.225×3) い(10) = 35.675、う は入らない
    const ctx = lay("あabcいうえおか", { textAlign: "justify", kinsoku: false }, { width: 40 });
    expect(lines(ctx)).toEqual(["あabcい", "うえおか"]);
    const a = runOf(ctx, "a").run;
    const b = runOf(ctx, "b").run;
    const c = runOf(ctx, "c").run;
    const i = runOf(ctx, "い").run;
    const gap = (40 - 35.675) / 2; // あ｜a と c｜い の 2 か所
    expect(a.frame.x).toBeCloseTo(10 + gap);
    expect(b.frame.x).toBeCloseTo(a.frame.x + a.frame.width);
    expect(c.frame.x).toBeCloseTo(b.frame.x + b.frame.width);
    expect(i.frame.x + i.frame.width).toBeCloseTo(40);
  });

  it("collapses a trailing space so the last glyph reaches the edge", () => {
    // あ(10) い(10) 空白(3) = 23、う は入らない → 行末に空白が残る
    const ctx = lay("あい うえおか", { textAlign: "justify" }, { width: 30 });
    expect(lines(ctx)).toEqual(["あい ", "うえお", "か"]);
    const i = runOf(ctx, "い").run;
    expect(i.frame.x + i.frame.width).toBeCloseTo(30);
    const space = runOf(ctx, " ").run;
    expect(space.frame.width).toBe(0);
    expect(space.frame.x).toBeCloseTo(30);
    expect(ctx.runs.every((r) => r.visibility === "visible")).toBe(true);
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

  it("hides a partly visible line and puts a single ellipsis at the end of the last full line", () => {
    // 2 行目は 2px（高さ 12）/ 9px（高さ 19）だけ見えるが、一部しか見えない行は描かない
    for (const height of [12, 19]) {
      const ctx = lay("あいうえおかきくけこ", {}, { width: 55, height });
      expect(shown(ctx)).toBe("あいうえ…");
      expect(ctx.isTruncated).toBe(true);
      expect(svgString(ctx).match(/…/g)).toHaveLength(1);
    }
  });

  it("puts the ellipsis on the character before a newline", () => {
    const ctx = lay("あ\nい", {}, { height: 10 });
    expect(ctx.runs.map((r) => r.visibility)).toEqual(["ellipsis", "invisible", "invisible"]);
    expect(svgString(ctx).match(/…/g)).toHaveLength(1);
  });

  it("skips blank lines at the end of the shown lines when placing the ellipsis", () => {
    // 空行の 2 行目までは収まるが、省略記号は 1 行目の最後の文字に付け、空行も隠す
    const ctx = lay("あいう\n\nえお", {}, { height: 20 });
    expect(shown(ctx)).toBe("あい…");
  });

  it("does not truncate when only blank lines overflow", () => {
    const ctx = lay("あいう\n\n", {}, { height: 10 });
    expect(shown(ctx)).toBe("あいう\n");
    expect(ctx.runs[4].visibility).toBe("invisible"); // はみ出した空行の改行
    expect(ctx.isTruncated).toBe(false);
  });

  it("shows nothing when not even the first line fits", () => {
    const ctx = lay("あいう", {}, { height: 9 });
    expect(shown(ctx)).toBe("");
    expect(ctx.isTruncated).toBe(true);
  });

  it("hides a line whose glyph is wider than the area", () => {
    const ctx = lay("あい", {}, { width: 8, height: 100 });
    expect(shown(ctx)).toBe("");
    expect(ctx.isTruncated).toBe(true);
    const fit = lay("あい", { adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 }, { width: 8, height: 100 });
    expect(fit.isTruncated).toBe(false);
    expect(shown(fit)).toBe("あい");
  });

  it("aligns only the lines that fit with directionAlign middle and end", () => {
    // 2 行目は収まらないので 1 行目だけを中央・下に寄せる（隠れる行は常に末尾側）
    const middle = lay("あいうえおかきくけこ", { directionAlign: "middle" }, { width: 55, height: 15 });
    expect(middle.runs[0].frame.y).toBe(2.5);
    expect(shown(middle)).toBe("あいうえ…");
    const end = lay("あいうえおかきくけこ", { directionAlign: "end" }, { width: 55, height: 15 });
    expect(end.runs[0].frame.y).toBe(5);
    expect(shown(end)).toBe("あいうえ…");
  });

  it("shrinks text that has a newline until every line fits", () => {
    // 改行の矩形が縮小前のフォントサイズ（20px）のままだと、どこまで縮小しても高さ 17px を超えて切り詰められていた
    const ctx = lay(
      "あいうえ\nか",
      { fontSize: 20, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.4 },
      { width: 40, height: 17 },
    );
    expect(ctx.isTruncated).toBe(false);
    expect(shown(ctx)).toBe("あいうえ\nか");
    expect(ctx.adjustFontScale).toBeGreaterThan(0.4);
    expect(ctx.adjustFontScale).toBeLessThanOrEqual(17 / 40); // 2 行 × 20px × 縮小率 ≤ 17px
    expect(ctx.runs[4].frame.height).toBeCloseTo(20 * ctx.adjustFontScale);
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
