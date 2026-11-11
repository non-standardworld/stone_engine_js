import { describe, expect, it } from "vitest";
import { decorationRects, DEFAULT_OPTIONS, svgString } from "../src/index.js";
import { lay, lines, runOf, shown } from "./helpers.js";

// fontSize 10、全角 10px、半角の欧文 5.225px（helpers.ts）。字間 2px なら、全角 1 文字の送りは 12px。

describe("letter spacing lrTb", () => {
  it("adds the spacing after every character, including the last one", () => {
    const ctx = lay("あいう", { letterSpacing: 2 });
    expect(ctx.runs.map((r) => r.frame.x)).toEqual([0, 12, 24]);
    expect(ctx.runs.map((r) => r.frame.width)).toEqual([12, 12, 12]);
    expect(ctx.runs.map((r) => r.position.x)).toEqual([0, 12, 24]);
    // 送り幅そのものは変えない（矩形が字間のぶん広がる）
    expect(ctx.runs.map((r) => r.advance)).toEqual([10, 10, 10]);
    // 行末の文字の後ろの字間も、描画サイズに含める（CSS の max-content と同じ）
    expect(ctx.renderedSize).toEqual({ width: 36, height: 10 });
    expect(svgString(ctx)).toContain('<tspan x="12" y="8.8" data-run="1">い</tspan>');
  });

  it("is off by default and ignores values that are not finite", () => {
    expect(DEFAULT_OPTIONS.letterSpacing).toBe(0);
    const plain = lay("あいう");
    expect(plain.runs.map((r) => r.frame.width)).toEqual([10, 10, 10]);
    expect(lay("あいう", { letterSpacing: NaN }).runs.map((r) => r.frame)).toEqual(plain.runs.map((r) => r.frame));
    expect(lay("あいう", { letterSpacing: Infinity }).renderedSize).toEqual(plain.renderedSize);
  });

  it("adds the spacing inside latin words and after spaces too", () => {
    const ctx = lay("ab c", { letterSpacing: 2 });
    for (const run of ctx.runs) expect(run.frame.width).toBeCloseTo(run.advance + 2);
    const b = runOf(ctx, "b").run;
    expect(b.frame.x).toBeCloseTo(5.225 + 2);
    const c = runOf(ctx, "c").run;
    expect(c.frame.x).toBeCloseTo(runOf(ctx, " ").run.frame.x + runOf(ctx, " ").run.advance + 2);
  });

  it("tightens with a negative value, but never makes a character shorter than zero", () => {
    const tight = lay("あいう", { letterSpacing: -2 });
    expect(tight.runs.map((r) => r.frame.x)).toEqual([0, 8, 16]);
    expect(tight.renderedSize.width).toBe(24);
    const collapsed = lay("あいう", { letterSpacing: -30 });
    expect(collapsed.runs.map((r) => r.frame.x)).toEqual([0, 0, 0]);
    expect(collapsed.runs.map((r) => r.frame.width)).toEqual([0, 0, 0]);
  });

  it("counts the spacing after the last character when wrapping, like CSS", () => {
    // 4 文字で 48px。幅 48 ならちょうど収まり、47 では行末の字間が収まらないので 3 文字で折り返す
    expect(lines(lay("あいうえおかき", { letterSpacing: 2 }, { width: 48 }))).toEqual(["あいうえ", "おかき"]);
    expect(lines(lay("あいうえおかき", { letterSpacing: 2 }, { width: 47 }))).toEqual(["あいう", "えおか", "き"]);
  });

  it("measures a whole word with its spacing when dividing by words", () => {
    // 日本語(36) の(12) → 48px、組版(24) は 72px まで。幅 71 では入らず、72 なら入る
    expect(lines(lay("日本語の組版です", { dividesByWords: true, letterSpacing: 2 }, { width: 71 }))).toEqual([
      "日本語の",
      "組版です",
    ]);
    expect(lines(lay("日本語の組版です", { dividesByWords: true, letterSpacing: 2 }, { width: 72 }))).toEqual([
      "日本語の組版",
      "です",
    ]);
  });

  it("does not add the spacing between leaders or dashes", () => {
    // 「……」「——」の間は空けない（点や線がつながって見えるように）。並びの後ろには足す
    const ctx = lay("あ……い——う", { letterSpacing: 2 });
    expect(ctx.runs.map((r) => r.frame.width)).toEqual([12, 10, 12, 12, 10, 12, 12]);
    expect(ctx.runs.map((r) => r.frame.x)).toEqual([0, 12, 22, 34, 46, 56, 68]);
    expect(ctx.renderedSize.width).toBe(80);
    // 分離禁止の並びは、間に字間を入れない長さ（22px）で次の行へ送る
    expect(lines(lay("あいうえ……か", { letterSpacing: 2 }, { width: 62 }))).toEqual(["あいうえ", "……か"]);
  });

  it("justifies with the spacing, keeping the spacing after the last character inside the line", () => {
    // 4 文字で 48px、余り 5px を あ｜い｜う｜え の 3 か所に配る。行末は「え」の後ろの字間まで含めて幅 53 にそろう
    const ctx = lay("あいうえおか", { textAlign: "justify", letterSpacing: 2 }, { width: 53 });
    expect(lines(ctx)).toEqual(["あいうえ", "おか"]);
    const gap = 5 / 3;
    expect(ctx.runs[1].frame.x).toBeCloseTo(12 + gap);
    expect(ctx.runs[2].frame.x).toBeCloseTo(24 + gap * 2);
    expect(ctx.runs[3].position.x).toBeCloseTo(41);
    expect(ctx.runs[3].frame.x + ctx.runs[3].frame.width).toBeCloseTo(53);
    // 最終行は字間だけ
    expect(ctx.runs[4].frame.x).toBe(0);
    expect(ctx.runs[5].frame.x).toBe(12);
  });

  it("centers and trails lines including the spacing after the last character", () => {
    // 2 文字で 24px。CSS と同じく、行末側に字間 1 つぶんの空きが残る
    const center = lay("あい", { textAlign: "center", letterSpacing: 2 }, { width: 50 });
    expect(center.runs[0].frame.x).toBe(13);
    const trailing = lay("あい", { textAlign: "trailing", letterSpacing: 2 }, { width: 50 });
    expect(trailing.runs[0].frame.x).toBe(26);
    expect(trailing.runs[1].position.x + 10).toBe(48);
  });

  it("halves punctuation by the advance without the spacing, then adds the spacing", () => {
    const half = lay("「あ」。・", { punctuationMode: "half", letterSpacing: 2 });
    expect(half.runs.map((r) => r.frame.width)).toEqual([7, 12, 7, 7, 7]);
    expect(half.runs.map((r) => r.frame.x)).toEqual([0, 7, 19, 26, 33]);
    expect(half.runs[0].position.x).toBe(-5); // 「 は送り幅（10px）の半分だけ左へ
    expect(half.runs[4].position.x).toBeCloseTo(33 - 2.5); // ・ は送り幅の 1/4
    expect(half.renderedSize.width).toBe(40);
    const stone = lay("あ「い」。う", { punctuationMode: "stone", letterSpacing: 2 });
    expect(stone.runs.map((r) => r.frame.width)).toEqual([12, 12, 12, 7, 12, 12]);
  });

  it("keeps the stone mode line start and line end rules", () => {
    // 行末の 」 は半角 + 字間。次の行頭の 「 は前行末との処理で半角になっていて、二重には詰めない
    const ctx = lay("あ」「いう", { punctuationMode: "stone", letterSpacing: 2 }, { width: 24 });
    expect(lines(ctx)).toEqual(["あ」", "「い", "う"]);
    expect(runOf(ctx, "」").run.frame.width).toBe(7);
    const open = runOf(ctx, "「").run;
    expect(open.frame).toEqual({ x: 0, y: 10, width: 7, height: 10 });
    expect(open.position.x).toBe(-5);
    expect(runOf(ctx, "い").run.frame.x).toBe(7);
    // 全角で置いた行頭の 「 は、行を閉じるときに半角にして行全体を詰める
    const shifted = lay("あい「うえ」", { punctuationMode: "stone", letterSpacing: 2 }, { width: 24 });
    expect(lines(shifted)).toEqual(["あい", "「う", "え」"]);
    expect(runOf(shifted, "「").run.position.x).toBe(-5);
    expect(runOf(shifted, "「").run.frame.width).toBe(7);
    expect(runOf(shifted, "う").run.frame.x).toBe(7);
  });

  it("needs room for a character and the spacing after it", () => {
    // 文字の矩形は後ろの字間を含む。1 文字（10px）+ 字間（2px）ずつ折り返す幅 12 なら、すべて表示する
    const fits = lay("あい", { letterSpacing: 2 }, { width: 12, height: 100 });
    expect(lines(fits)).toEqual(["あ", "い"]);
    expect(shown(fits)).toBe("あい");
    // 幅 11 では、文字（10px）は入っても後ろの字間が入らないので、その行から後ろを隠す
    const narrow = lay("あい", { letterSpacing: 2 }, { width: 11, height: 100 });
    expect(shown(narrow)).toBe("");
    expect(narrow.isTruncated).toBe(true);
    // adjustsFontSizeToFitWidth なら、字間ごと収まるまで縮める
    const shrunk = lay(
      "あい",
      { letterSpacing: 2, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 },
      { width: 11, height: 100 },
    );
    expect(shrunk.isTruncated).toBe(false);
    expect(shown(shrunk)).toBe("あい");
    expect(shrunk.runs[0].frame.width).toBeLessThanOrEqual(11);
  });

  it("places the ellipsis by the positions with the spacing", () => {
    // 1 行に 4 文字（48px）。最後の「え」（36px〜）を省略記号にする
    const ctx = lay("あいうえおかきくけこ", { letterSpacing: 2 }, { width: 50, height: 10 });
    expect(lines(ctx)[0]).toBe("あいうえ");
    expect(shown(ctx)).toBe("あいう…");
    expect(runOf(ctx, "え").run.frame.x).toBe(36);
    // 「e」（28.9px〜）に「…」（9.5px）を置くと 38.4px で幅 38 を越えるので、手前の「d」を省略記号にする
    const latin = lay("abcdefghijklmnopq", { letterSpacing: 2 }, { width: 38, height: 10 });
    expect(lines(latin)[0]).toBe("abcde");
    expect(shown(latin)).toBe("abc…");
    const d = runOf(latin, "d").run;
    expect(d.visibility).toBe("ellipsis");
    expect(d.frame.x).toBeCloseTo(7.225 * 3);
  });

  it("shrinks the spacing with the font when adjustsFontSizeToFitWidth is set", () => {
    // 等倍では 1 文字 24px。0.5 倍で 12px × 5 = 60px になり、1 行に収まる（字間を縮めなければ 70px で収まらない）
    const ctx = lay(
      "あいうえお",
      { fontSize: 20, letterSpacing: 4, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 },
      { width: 60, height: 15 },
    );
    expect(ctx.isTruncated).toBe(false);
    expect(ctx.lineCount).toBe(1);
    expect(ctx.adjustFontScale).toBe(0.5);
    expect(ctx.adjustLetterSpacing).toBe(2);
    expect(ctx.runs.map((r) => r.frame.width)).toEqual([12, 12, 12, 12, 12]);
  });

  it("extends hit testing and underlines over the spacing", () => {
    const ctx = lay("あいう", { letterSpacing: 2 });
    // 字間（10〜12px）は手前の文字の矩形に含まれる
    expect(ctx.hitRunIndex({ x: 11, y: 5 })).toBe(0);
    expect(ctx.hitRunIndex({ x: 12.5, y: 5 })).toBe(1);
    // 下線は、CSS と同じく範囲の最後の文字の後ろの字間まで引く
    const [underline] = decorationRects(ctx, [{ start: 0, end: 2, underline: true }]);
    expect(underline.x).toBe(0);
    expect(underline.width).toBe(24);
  });
});

describe("letter spacing tbRl", () => {
  it("adds the spacing below every character", () => {
    const ctx = lay("あいう", { direction: "tbRl", letterSpacing: 2 });
    expect(ctx.runs.map((r) => r.frame.y)).toEqual([0, 12, 24]);
    expect(ctx.runs.map((r) => r.frame.height)).toEqual([12, 12, 12]);
    expect(ctx.runs.map((r) => r.frame.width)).toEqual([10, 10, 10]);
    expect(ctx.runs[1].position.y).toBeCloseTo(12 + 8.8);
    expect(ctx.renderedSize).toEqual({ width: 10, height: 36 });
  });

  it("counts the spacing after the last character when wrapping columns", () => {
    expect(lines(lay("あいうえおかき", { direction: "tbRl", letterSpacing: 2 }, { height: 48 }))).toEqual([
      "あいうえ",
      "おかき",
    ]);
    expect(lines(lay("あいうえおかき", { direction: "tbRl", letterSpacing: 2 }, { height: 47 }))).toEqual([
      "あいう",
      "えおか",
      "き",
    ]);
  });

  it("adds the spacing to the advance of rotated latin runs", () => {
    const ctx = lay("あAb", { direction: "tbRl", letterSpacing: 2 });
    const a = runOf(ctx, "A").run;
    const b = runOf(ctx, "b").run;
    expect(a.frame.y).toBe(12);
    expect(a.frame.height).toBeCloseTo(5.225 + 2);
    expect(b.frame.y).toBeCloseTo(12 + 5.225 + 2);
    expect(a.frame.width).toBe(10);
  });

  it("does not add the spacing between the digits of a tate-chu-yoko, only after it", () => {
    const ctx = lay("あ12い", { direction: "tbRl", dividesByWords: true, letterSpacing: 2 });
    const one = runOf(ctx, "1").run;
    const two = runOf(ctx, "2").run;
    expect(ctx.isTateChuYoko(one)).toBe(true);
    // 2 つの数字は字間なしで横に並び、列の中央に寄る
    expect(two.frame.y).toBe(one.frame.y);
    expect(two.position.x).toBeCloseTo(one.position.x + one.advance);
    expect(one.frame.width).toBeCloseTo(one.advance);
    expect((one.frame.x + two.frame.x + two.frame.width) / 2).toBeCloseTo(ctx.runs[0].frame.x + 5);
    // まとまり（1em）の後ろに字間を 1 回だけ足す。どの数字の矩形も、その字間を含む高さ
    expect(one.frame.y).toBe(12);
    expect(one.frame.height).toBe(12);
    expect(two.frame.height).toBe(12);
    expect(runOf(ctx, "い").run.frame.y).toBe(24);
    expect(ctx.renderedSize.height).toBe(36);
  });

  it("measures a tate-chu-yoko with one spacing when wrapping", () => {
    // あいう(36) の後ろの「12」は、1em のまとまり（10px）+ 字間 2px = 12px として収まるかを見る
    const options = { direction: "tbRl", dividesByWords: true, letterSpacing: 2 } as const;
    expect(lines(lay("あいう12え", options, { height: 47 }))).toEqual(["あいう", "12え"]);
    expect(lines(lay("あいう12え", options, { height: 48 }))).toEqual(["あいう12", "え"]);
    // 1 桁でも同じ 1em + 字間
    expect(lines(lay("あいう1え", options, { height: 47 }))).toEqual(["あいう", "1え"]);
    expect(lines(lay("あいう1え", options, { height: 48 }))).toEqual(["あいう1", "え"]);
  });

  it("keeps tate-chu-yoko digits together when justifying with the spacing", () => {
    // 東(12) 京(12) 12(12) 月(12) = 48、の は入らない。余り 5px を 東｜京、京｜12、12｜月 の 3 か所に配る
    const ctx = lay(
      "東京12月の空",
      { direction: "tbRl", dividesByWords: true, textAlign: "justify", letterSpacing: 2 },
      { height: 53 },
    );
    expect(lines(ctx)).toEqual(["東京12月", "の空"]);
    const gap = 5 / 3;
    const one = runOf(ctx, "1").run;
    const two = runOf(ctx, "2").run;
    expect(one.frame.y).toBeCloseTo(24 + gap * 2);
    expect(two.frame.y).toBe(one.frame.y);
    const month = runOf(ctx, "月").run;
    expect(month.frame.y).toBeCloseTo(41);
    expect(month.frame.y + month.frame.height).toBeCloseTo(53);
  });

  it("does not add the spacing between leaders in a column", () => {
    const ctx = lay("あ……い", { direction: "tbRl", letterSpacing: 2 });
    expect(ctx.runs.map((r) => r.frame.y)).toEqual([0, 12, 22, 34]);
    expect(ctx.runs.map((r) => r.frame.height)).toEqual([12, 10, 12, 12]);
  });

  it("halves punctuation by the font size without the spacing, then adds the spacing", () => {
    const ctx = lay("あ」「いう", { direction: "tbRl", punctuationMode: "stone", letterSpacing: 2 }, { height: 24 });
    expect(lines(ctx)).toEqual(["あ」", "「い", "う"]);
    expect(runOf(ctx, "」").run.frame.height).toBe(7);
    const open = runOf(ctx, "「").run;
    expect(open.frame.height).toBe(7);
    expect(open.position.y).toBeCloseTo(8.8 - 5);
    expect(runOf(ctx, "い").run.frame.y).toBe(7);
  });

  it("needs room for a character and the spacing below it", () => {
    const fits = lay("あい", { direction: "tbRl", letterSpacing: 2 }, { width: 100, height: 12 });
    expect(lines(fits)).toEqual(["あ", "い"]);
    expect(shown(fits)).toBe("あい");
    // 高さ 11 では、文字は入っても後ろの字間が入らないので隠す
    const narrow = lay("あい", { direction: "tbRl", letterSpacing: 2 }, { width: 100, height: 11 });
    expect(shown(narrow)).toBe("");
    expect(narrow.isTruncated).toBe(true);
  });
});
