import { describe, expect, it } from "vitest";
import { layoutText, type StoneContext, type StoneOptions } from "../src/index.js";
import { lay, lines, measurer, runOf } from "./helpers.js";

// 折り返さずに組んだ長さ（renderedSize。sizeThatFits と、オートモードが幅の決まらない要素に置く intrinsic な大きさ）の領域に
// 組み直しても、行が増えないこと。折り返しの判定（次の文字が行に入るかどうか）が、置いたときと同じ約物の詰めを見ていないと、
// 詰めたぶん（0.5em）だけ折り返さずに組んだ長さが足りなくなる。

/** 折り返さずに組む。 */
function natural(text: string, options: StoneOptions): StoneContext {
  return layoutText(text, { dividesByWords: false, ...options }, measurer);
}

/** 折り返さずに組んだ長さ（横書きは幅、縦書きは高さ）の領域に組み直す。 */
function relaidAtNaturalLength(text: string, options: StoneOptions, extra = 0): StoneContext {
  const ctx = natural(text, options);
  const length = (options.direction === "tbRl" ? ctx.renderedSize.height : ctx.renderedSize.width) + extra;
  const size = options.direction === "tbRl" ? { height: length } : { width: length };
  return layoutText(text, { dividesByWords: false, ...options }, measurer, size);
}

describe("layout at the natural length", () => {
  it("keeps the lines of a paragraph that starts with an opening bracket and ends with a forced line break (13px)", () => {
    // 1 行目の行頭の 「 は半角（6.5px）なので 45.5px。その幅に組んでも「」」が入る（元は「う」の後ろで折り返して 3 行になった）
    const ctx = natural("「いう」\nえ", { fontSize: 13 });
    expect(ctx.renderedSize.width).toBe(45.5);
    expect(lines(ctx)).toEqual(["「いう」", "え"]);
    const relaid = relaidAtNaturalLength("「いう」\nえ", { fontSize: 13 });
    expect(lines(relaid)).toEqual(["「いう」", "え"]);
    expect(relaid.renderedSize).toEqual(ctx.renderedSize);
    expect(relaid.isTruncated).toBe(false);
  });

  it("keeps a poem-like line broken with <br> on one line (13px)", () => {
    // yori.so の portraitly のページの冒頭。幅が内容で決まる要素で「造語」が次の行に送られていた（オートモードの intrinsic な大きさ）
    const text = "「肖像画のように」を表す造語\nい";
    const ctx = natural(text, { fontSize: 13 });
    expect(ctx.renderedSize.width).toBe(175.5);
    for (const extra of [0, 1.5]) {
      // オートモードは、小数の誤差に備えて 1px の余裕を持たせた大きさ（ceil + 1 = 177px）を置く
      const relaid = relaidAtNaturalLength(text, { fontSize: 13 }, extra);
      expect(lines(relaid)).toEqual(["「肖像画のように」を表す造語", "い"]);
    }
    // 括弧で始まらない行は元から変わらない
    const plain = relaidAtNaturalLength("いいいいいいいいいいいいいい\nい", { fontSize: 13 });
    expect(plain.renderedSize.width).toBe(182);
    expect(plain.lineCount).toBe(2);
  });

  it("keeps the lines of text with half-width punctuation (half)", () => {
    // half は約物をいつも半角に組む。折り返しの判定も半角で見る（元は「あいう。」の幅 35px に組むと「う。」が次の行に送られた）
    for (const text of ["あいう。", "「あい」", "あいう。\nえ"]) {
      for (const direction of ["lrTb", "tbRl"] as const) {
        const ctx = natural(text, { fontSize: 10, punctuationMode: "half", direction });
        const relaid = relaidAtNaturalLength(text, { fontSize: 10, punctuationMode: "half", direction });
        expect(lines(relaid)).toEqual(lines(ctx));
      }
    }
  });

  it("keeps the lines for every punctuation mode, direction, letter spacing and indent", () => {
    const texts = [
      "「いう」\nえ",
      "「肖像画のように」を表す造語\nい",
      "「あ」\n「いう」\n「えおか」",
      "あいう。」\n「え」「お」",
      "あ」「い」\n（う）",
      "あ」「\nい",
      "「Hello」と言う。\n“OK”",
      "「12月」の、\n「ｱｲｳ」。",
      "あいう・えお：\n「か」・き",
      "「……」\n――「あ」",
    ];
    const modes = ["stone", "half", "whole"] as const;
    const directions = ["lrTb", "tbRl"] as const;
    for (const text of texts) {
      for (const punctuationMode of modes) {
        for (const direction of directions) {
          for (const letterSpacing of [0, 2]) {
            for (const textIndent of [0, 10]) {
              const options: StoneOptions = { fontSize: 10, punctuationMode, direction, letterSpacing, textIndent };
              const label = JSON.stringify({ text, ...options });
              const ctx = natural(text, options);
              const relaid = relaidAtNaturalLength(text, options);
              expect(lines(relaid), label).toEqual(lines(ctx));
              expect(relaid.isTruncated, label).toBe(false);
            }
          }
        }
      }
    }
  });
});

describe("opening bracket at the start of a line (stone)", () => {
  it("halves the opening bracket at the start of the last line too", () => {
    // 1 行だけのテキストと、改行で終わらない最後の行も、ほかの行と同じく行頭の 「 を半角にする（元は全角のままだった）
    const single = lay("「あい」");
    expect(single.runs[0].frame).toEqual({ x: 0, y: 0, width: 5, height: 10 });
    expect(single.runs[0].position.x).toBe(-5);
    expect(runOf(single, "あ").run.frame.x).toBe(5);
    expect(single.renderedSize.width).toBe(35);

    const last = lay("「あ」\n「いう」");
    expect(runOf(last, "「", 0).run.frame.width).toBe(5);
    expect(runOf(last, "「", 1).run.frame).toEqual({ x: 0, y: 10, width: 5, height: 10 });
    expect(runOf(last, "い").run.frame.x).toBe(5);
    expect(last.renderedSize.width).toBe(35);

    // 縦書きも同じ
    const vertical = lay("「あい」", { direction: "tbRl" });
    expect(vertical.runs[0].frame.height).toBe(5);
    expect(runOf(vertical, "あ").run.frame.y).toBe(5);
    expect(vertical.renderedSize.height).toBe(35);
  });

  it("fits the line with the opening bracket already halved when wrapping", () => {
    // 行頭の 「 を半角にした長さで、次の文字が入るかどうかを見る。幅 45 には「「あいうえ」（45px）が入る
    // （元は 「 を全角のまま見積もって「え」を次の行に送り、行を閉じてから 「 を詰めていたので、行末に 1em 空いていた）
    const ctx = lay("「あいうえおかきく", {}, { width: 45 });
    expect(lines(ctx)).toEqual(["「あいうえ", "おかきく"]);
    expect(runOf(ctx, "え").run.frame.x).toBe(35);
    const vertical = lay("「あいうえおかきく", { direction: "tbRl" }, { height: 45 });
    expect(lines(vertical)).toEqual(["「あいうえ", "おかきく"]);
  });

  it("does not halve an opening bracket twice after a closing bracket at the end of the previous line", () => {
    const ctx = lay("あいう」「えお", {}, { width: 40 });
    expect(lines(ctx)).toEqual(["あいう」", "「えお"]);
    const open = runOf(ctx, "「").run;
    expect(open.frame).toEqual({ x: 0, y: 10, width: 5, height: 10 });
    expect(open.position.x).toBe(-5);
    expect(runOf(ctx, "え").run.frame.x).toBe(5);
  });
});
