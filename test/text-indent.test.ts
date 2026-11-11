import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, sizeThatFits } from "../src/index.js";
import { lay, lines, measurer, runOf, shown } from "./helpers.js";

// fontSize 10、全角 10px（helpers.ts）。字下げ 10px は 1em。

describe("text indent lrTb", () => {
  it("indents the first line and not the lines that start by wrapping", () => {
    // 1 行目は 10px から始まり、幅 50 に 4 文字。折り返した 2 行目は行頭から 5 文字
    const ctx = lay("あいうえおかきくけ", { textIndent: 10 }, { width: 50 });
    expect(lines(ctx)).toEqual(["あいうえ", "おかきくけ"]);
    expect(ctx.runs[0].frame).toEqual({ x: 10, y: 0, width: 10, height: 10 });
    expect(ctx.runs[0].position).toEqual({ x: 10, y: 8.8 });
    expect(ctx.runs[3].frame.x).toBe(40);
    expect(ctx.runs[4].frame.x).toBe(0);
    expect(ctx.renderedSize).toEqual({ width: 50, height: 20 });
  });

  it("is off by default and ignores values that are not finite", () => {
    expect(DEFAULT_OPTIONS.textIndent).toBe(0);
    expect(DEFAULT_OPTIONS.textIndentEachLine).toBe(true);
    expect(lay("あい").runs[0].frame.x).toBe(0);
    expect(lay("あい", { textIndent: NaN }).runs[0].frame.x).toBe(0);
  });

  it("indents the line after every newline", () => {
    const ctx = lay("あい\nうえ\n\nお", { textIndent: 10 });
    expect(runOf(ctx, "あ").run.frame.x).toBe(10);
    expect(runOf(ctx, "う").run.frame.x).toBe(10);
    expect(runOf(ctx, "お").run.frame.x).toBe(10);
    // 改行の run は行末（字下げ 10px + 2 文字）に置く
    expect(ctx.runs[2].frame.x).toBe(30);
    expect(ctx.renderedSize.width).toBe(30);
  });

  it("indents only the first line of the text when textIndentEachLine is false, like CSS", () => {
    // CSS の text-indent は、each-line を付けない限り <br> の後ろの行を字下げしない
    const ctx = lay("あい\nうえ", { textIndent: 10, textIndentEachLine: false });
    expect(runOf(ctx, "あ").run.frame.x).toBe(10);
    expect(runOf(ctx, "う").run.frame.x).toBe(0);
  });

  it("includes the indent in the rendered size", () => {
    expect(lay("あい", { textIndent: 10 }).renderedSize).toEqual({ width: 30, height: 10 });
    expect(sizeThatFits("あい", { fontSize: 10, textIndent: 10 }, measurer)).toEqual({ width: 30, height: 10 });
  });

  it("aligns an indented line inside the width left after the indent, like CSS", () => {
    // 中央寄せ: 字下げ 10px + 2 文字 20px を幅 50 の中央に置くので、字下げの半分だけ右に寄る
    const center = lay("あい\nうえ", { textAlign: "center", textIndent: 10, textIndentEachLine: false }, { width: 50 });
    expect(runOf(center, "あ").run.frame.x).toBe(20);
    expect(runOf(center, "う").run.frame.x).toBe(15);
    // 行末寄せ: 字下げしても行末にそろう
    const trailing = lay("あい", { textAlign: "trailing", textIndent: 10 }, { width: 50 });
    expect(trailing.runs[0].frame.x).toBe(30);
    expect(trailing.runs[1].frame.x + trailing.runs[1].frame.width).toBe(50);
  });

  it("justifies an indented line from the indent to the end of the line", () => {
    // 1 行目は 10px から 4 文字（40px）。余り 5px を 3 か所に配り、行末は幅 55 にそろう
    const ctx = lay("あいうえおか", { textAlign: "justify", textIndent: 10 }, { width: 55 });
    expect(lines(ctx)).toEqual(["あいうえ", "おか"]);
    const gap = 5 / 3;
    expect(ctx.runs[0].frame.x).toBe(10);
    expect(ctx.runs[1].frame.x).toBeCloseTo(20 + gap);
    expect(ctx.runs[3].frame.x + ctx.runs[3].frame.width).toBeCloseTo(55);
    expect(ctx.runs[4].frame.x).toBe(0);
  });

  it("halves an opening bracket after the indent, and sets it flush at the start of a wrapped line (stone)", () => {
    // 段落の 1 行目: 字下げ 1em の後ろで 「 を半角にするので、字面（グリフの後ろ半分）が 1em の位置から始まる。
    // 折り返した行の行頭は、今までどおり天付き
    const ctx = lay("「あいうえ「お」かきく", { textIndent: 10 }, { width: 40 });
    expect(lines(ctx)).toEqual(["「あい", "うえ", "「お」か", "きく"]);
    const first = runOf(ctx, "「", 0).run;
    expect(first.frame).toEqual({ x: 10, y: 0, width: 5, height: 10 });
    expect(first.position.x).toBe(5); // グリフの原点は字下げより半角ぶん手前。字面は 10px から
    expect(runOf(ctx, "あ").run.frame.x).toBe(15);
    const wrapped = runOf(ctx, "「", 1).run;
    expect(wrapped.frame).toEqual({ x: 0, y: 20, width: 5, height: 10 });
    expect(wrapped.position.x).toBe(-5);
    expect(runOf(ctx, "お").run.frame.x).toBe(5);
  });

  it("combines the indent with the other punctuation modes", () => {
    // half は 「 を常に半角にするので、stone と同じ位置になる
    const half = lay("「あい」\nう", { textIndent: 10, punctuationMode: "half" });
    expect(half.runs[0].frame).toEqual({ x: 10, y: 0, width: 5, height: 10 });
    expect(half.runs[0].position.x).toBe(5);
    expect(half.runs[1].frame.x).toBe(15);
    // whole は全角のまま置く（字面は字下げ + 0.5em から）
    const whole = lay("「あい」\nう", { textIndent: 10, punctuationMode: "whole" });
    expect(whole.runs[0].frame).toEqual({ x: 10, y: 0, width: 10, height: 10 });
    expect(whole.runs[0].position.x).toBe(10);
    expect(whole.runs[1].frame.x).toBe(20);
    // stone は、改行で終わる 1 行だけの段落でも同じ
    const stone = lay("「あい」\nう", { textIndent: 10 });
    expect(stone.runs[0].frame).toEqual({ x: 10, y: 0, width: 5, height: 10 });
    expect(stone.runs[0].position.x).toBe(5);
    expect(stone.runs[1].frame.x).toBe(15);
  });

  it("lets the first line hang out with a negative indent, without truncating it", () => {
    // 1 行目は -10px から始まり、幅 40 に 5 文字入る
    const ctx = lay("あいうえおかき", { textIndent: -10 }, { width: 40, height: 100 });
    expect(lines(ctx)).toEqual(["あいうえお", "かき"]);
    expect(ctx.runs[0].frame.x).toBe(-10);
    expect(ctx.runs[5].frame.x).toBe(0);
    expect(shown(ctx)).toBe("あいうえおかき");
    expect(ctx.isTruncated).toBe(false);
    expect(ctx.renderedSize.width).toBe(40);
  });

  it("wraps with the indent and the letter spacing together", () => {
    // 10px から 12px ずつ 3 文字で 46px。4 文字目は入らない
    expect(lines(lay("あいうえ", { textIndent: 10, letterSpacing: 2 }, { width: 46 }))).toEqual(["あいう", "え"]);
    expect(lines(lay("あいうえ", { textIndent: 10, letterSpacing: 2 }, { width: 45 }))).toEqual(["あい", "うえ"]);
  });

  it("places the ellipsis on an indented line", () => {
    // 1 行目は 10px から 3 文字。最後の「う」（30px〜）を省略記号にする
    const ctx = lay("あいうえおかき", { textIndent: 10 }, { width: 40, height: 10 });
    expect(lines(ctx)[0]).toBe("あいう");
    expect(shown(ctx)).toBe("あい…");
    expect(runOf(ctx, "う").run.frame.x).toBe(30);
  });

  it("shrinks the indent with the font when adjustsFontSizeToFitWidth is set", () => {
    // 0.5 倍で字下げ 10px + 3 文字 30px = 40px になり、1 行に収まる
    const ctx = lay(
      "あいう",
      { fontSize: 20, textIndent: 20, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 },
      { width: 40, height: 15 },
    );
    expect(ctx.isTruncated).toBe(false);
    expect(ctx.adjustFontScale).toBe(0.5);
    expect(ctx.adjustTextIndent).toBe(10);
    expect(ctx.runs[0].frame.x).toBe(10);
  });
});

describe("text indent tbRl", () => {
  it("indents the first column from the top and not the columns that start by wrapping", () => {
    const ctx = lay("あいうえおかきくけ", { direction: "tbRl", textIndent: 10 }, { height: 50 });
    expect(lines(ctx)).toEqual(["あいうえ", "おかきくけ"]);
    expect(ctx.runs[0].frame).toEqual({ x: 10, y: 10, width: 10, height: 10 });
    expect(ctx.runs[0].position.y).toBeCloseTo(10 + 8.8);
    expect(ctx.runs[4].frame).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(ctx.renderedSize).toEqual({ width: 20, height: 50 });
  });

  it("includes the indent in the rendered height of a single column", () => {
    expect(lay("あい", { direction: "tbRl", textIndent: 10 }).renderedSize).toEqual({ width: 10, height: 30 });
  });

  it("indents the column after every newline unless textIndentEachLine is false", () => {
    const each = lay("あい\nうえ", { direction: "tbRl", textIndent: 10 });
    expect(runOf(each, "あ").run.frame.y).toBe(10);
    expect(runOf(each, "う").run.frame.y).toBe(10);
    const first = lay("あい\nうえ", { direction: "tbRl", textIndent: 10, textIndentEachLine: false });
    expect(runOf(first, "あ").run.frame.y).toBe(10);
    expect(runOf(first, "う").run.frame.y).toBe(0);
  });

  it("aligns and justifies an indented column inside the height left after the indent", () => {
    const center = lay("あい", { direction: "tbRl", textAlign: "center", textIndent: 10 }, { height: 50 });
    expect(center.runs[0].frame.y).toBe(20);
    const justify = lay("あいうえおか", { direction: "tbRl", textAlign: "justify", textIndent: 10 }, { height: 55 });
    expect(lines(justify)).toEqual(["あいうえ", "おか"]);
    expect(justify.runs[0].frame.y).toBe(10);
    expect(justify.runs[3].frame.y + justify.runs[3].frame.height).toBeCloseTo(55);
    expect(justify.runs[4].frame.y).toBe(0);
  });

  it("halves an opening bracket after the indent (stone)", () => {
    const ctx = lay("「あい」\nう", { direction: "tbRl", textIndent: 10 });
    expect(ctx.runs[0].frame).toEqual({ x: 10, y: 10, width: 10, height: 5 });
    expect(ctx.runs[0].position.y).toBeCloseTo(10 + 8.8 - 5);
    expect(ctx.runs[1].frame.y).toBe(15);
  });

  it("lets the first column hang out with a negative indent, without truncating it", () => {
    const ctx = lay("あいうえおかき", { direction: "tbRl", textIndent: -10 }, { width: 100, height: 40 });
    expect(lines(ctx)).toEqual(["あいうえお", "かき"]);
    expect(ctx.runs[0].frame.y).toBe(-10);
    expect(shown(ctx)).toBe("あいうえおかき");
    expect(ctx.isTruncated).toBe(false);
    // 高さは列の始まり（字下げの手前）から測るので、ぶら下げた分は含めない
    expect(ctx.renderedSize.height).toBe(40);
  });

  it("wraps columns with the indent and the letter spacing together", () => {
    const options = { direction: "tbRl", textIndent: 10, letterSpacing: 2 } as const;
    expect(lines(lay("あいうえ", options, { height: 46 }))).toEqual(["あいう", "え"]);
    expect(lines(lay("あいうえ", options, { height: 45 }))).toEqual(["あい", "うえ"]);
  });
});
