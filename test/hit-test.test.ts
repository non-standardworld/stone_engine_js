import { describe, expect, it } from "vitest";
import type { StoneContext, StoneOptions } from "../src/index.js";
import { lay, runOf } from "./helpers.js";

// 行送り方向に寄せたレイアウト（directionAlign の middle / end、縦書きで幅を決めたときの右端への寄せ）での
// firstRunFrame / closestRunIndex / hitRunIndex。fontSize 10、全角 10px（helpers.ts）なので、行送りは 10px。

const FIVE_LINES = "あ\nい\nう\nえ\nお"; // run ID は あ 0、い 2、う 4、え 6、お 8（間は改行）

/** 各行の firstRunFrame の、行送り方向の位置（横書きは y、縦書きは x）。 */
function linePositions(ctx: StoneContext): number[] {
  const positions: number[] = [];
  for (let line = 0; line < ctx.lineCount; line++) {
    const frame = ctx.firstRunFrame(line);
    positions.push(ctx.direction === "lrTb" ? frame.y : frame.x);
  }
  return positions;
}

/**
 * 各文字の矩形の前半・後半の中心を指したときに、closestRunIndex がその文字の位置（前半）・次の位置（後半）を
 * 返さなかったものの一覧。改行と、大きさが 0 の矩形（均等配置で幅 0 にした行末の空白）は除く。隠れた行の文字も含める。
 */
function misplacedHalves(ctx: StoneContext): string[] {
  const horizontal = ctx.direction === "lrTb";
  const failures: string[] = [];
  ctx.runs.forEach((run, id) => {
    const f = run.frame;
    if (run.isNewline || f.width === 0 || f.height === 0) return;
    [0.25, 0.75].forEach((t, half) => {
      const point = horizontal
        ? { x: f.x + f.width * t, y: f.y + f.height * 0.5 }
        : { x: f.x + f.width * 0.5, y: f.y + f.height * t };
      const index = ctx.closestRunIndex(point);
      if (index !== id + half) failures.push(`${run.char}(${id}) ${half === 0 ? "前半" : "後半"} → ${index}`);
    });
  });
  return failures;
}

describe("firstRunFrame", () => {
  it("keeps the unshifted line positions when the lines are not moved", () => {
    // 横書き: start と、高さを決めないときは、先頭の行の上端が 0
    for (const [options, size] of [
      [{}, {}],
      [{}, { height: 200 }],
      [{ directionAlign: "middle" }, {}],
      [{ directionAlign: "end" }, { width: 200 }],
    ] as [StoneOptions, { width?: number; height?: number }][]) {
      const ctx = lay(FIVE_LINES, options, size);
      expect(linePositions(ctx)).toEqual([0, 10, 20, 30, 40]);
      expect(ctx.firstRunFrame(1)).toEqual({ x: 0, y: 10, width: 0, height: 10 });
    }
    // 縦書き: 幅を決めないときは、いちばん左の列の左端が 0（directionAlign にかかわらず）
    for (const directionAlign of ["start", "middle", "end"] as const) {
      const ctx = lay(FIVE_LINES, { direction: "tbRl", directionAlign }, { height: 200 });
      expect(linePositions(ctx)).toEqual([40, 30, 20, 10, 0]);
      expect(ctx.firstRunFrame(1)).toEqual({ x: 30, y: 0, width: 10, height: 0 });
    }
  });

  it("follows directionAlign middle / end in horizontal text", () => {
    // 高さ 200 に 5 行（50px）。end は下端に付き、middle は上下の中央
    const end = lay(FIVE_LINES, { directionAlign: "end" }, { height: 200 });
    expect(end.runs.filter((run) => !run.isNewline).map((run) => run.frame.y)).toEqual([150, 160, 170, 180, 190]);
    expect(linePositions(end)).toEqual([150, 160, 170, 180, 190]);
    expect(end.firstRunFrame(0)).toEqual({ x: 0, y: 150, width: 0, height: 10 });

    const middle = lay(FIVE_LINES, { directionAlign: "middle" }, { height: 200 });
    expect(linePositions(middle)).toEqual([75, 85, 95, 105, 115]);
  });

  it("follows the columns of vertical text laid out in a width", () => {
    // 幅 200 に 5 列（50px）。幅を決めると、start でも列は領域の右端から並ぶ
    const start = lay(FIVE_LINES, { direction: "tbRl" }, { width: 200 });
    expect(start.runs.filter((run) => !run.isNewline).map((run) => run.frame.x)).toEqual([190, 180, 170, 160, 150]);
    expect(linePositions(start)).toEqual([190, 180, 170, 160, 150]);
    expect(start.firstRunFrame(0)).toEqual({ x: 190, y: 0, width: 10, height: 0 });

    const middle = lay(FIVE_LINES, { direction: "tbRl", directionAlign: "middle" }, { width: 200 });
    expect(linePositions(middle)).toEqual([115, 105, 95, 85, 75]);
    // end は左端に付くので、幅を決めないときと同じ位置
    const end = lay(FIVE_LINES, { direction: "tbRl", directionAlign: "end" }, { width: 200 });
    expect(linePositions(end)).toEqual([40, 30, 20, 10, 0]);
    // 幅が内容ちょうどなら、どこにも寄らない
    expect(linePositions(lay(FIVE_LINES, { direction: "tbRl" }, { width: 50 }))).toEqual([40, 30, 20, 10, 0]);
  });

  it("gives hidden lines the positions they were moved to", () => {
    // 高さ 25 に収まるのは 2 行。end は収まる 2 行（20px）を下端に付けるので、どの行も 5px 下がる
    // （3 行目から後ろは領域の外で、隠れる）
    const lrTb = lay(FIVE_LINES, { directionAlign: "end" }, { height: 25 });
    expect(lrTb.isTruncated).toBe(true);
    expect(lrTb.runs.map((run) => run.frame.y)).toEqual([5, 5, 15, 15, 25, 25, 35, 35, 45]);
    expect(linePositions(lrTb)).toEqual([5, 15, 25, 35, 45]);

    // 幅 25 に収まるのは 2 列。隠れる列は領域の左の外（x < 0）にある
    const size = { width: 25 };
    expect(linePositions(lay(FIVE_LINES, { direction: "tbRl" }, size))).toEqual([15, 5, -5, -15, -25]);
    expect(linePositions(lay(FIVE_LINES, { direction: "tbRl", directionAlign: "middle" }, size))).toEqual([
      12.5, 2.5, -7.5, -17.5, -27.5,
    ]);
    const end = lay(FIVE_LINES, { direction: "tbRl", directionAlign: "end" }, size);
    expect(end.runs.map((run) => run.frame.x)).toEqual([10, 10, 0, 0, -10, -10, -20, -20, -30]);
    expect(linePositions(end)).toEqual([10, 0, -10, -20, -30]);
  });

  it("places the empty last line after a trailing newline one line further", () => {
    // 末尾の空行には run が無い。寄せるのは run のある 3 行なので、空行は領域の下の外に出る
    const lrTb = lay("あ\nい\nう\n", { directionAlign: "end" }, { height: 100 });
    expect(lrTb.lineCount).toBe(4);
    expect(linePositions(lrTb)).toEqual([70, 80, 90, 100]);
    const tbRl = lay("あ\nい\nう\n", { direction: "tbRl" }, { width: 100 });
    expect(linePositions(tbRl)).toEqual([90, 80, 70, 60]);
  });

  it("ignores the indent and textAlign in the inline direction", () => {
    const centered: StoneOptions = { directionAlign: "middle", textIndent: 10, textAlign: "center" };
    const lrTb = lay("あい\nうえ", centered, { width: 100, height: 100 });
    expect(runOf(lrTb, "あ").run.frame).toEqual({ x: 45, y: 40, width: 10, height: 10 });
    expect(lrTb.firstRunFrame(0)).toEqual({ x: 0, y: 40, width: 0, height: 10 });
    expect(lrTb.firstRunFrame(1)).toEqual({ x: 0, y: 50, width: 0, height: 10 });

    const tbRl = lay("あい\nうえ", { direction: "tbRl", textIndent: 10 }, { width: 100 });
    expect(runOf(tbRl, "あ").run.frame).toEqual({ x: 90, y: 10, width: 10, height: 10 });
    expect(tbRl.firstRunFrame(0)).toEqual({ x: 90, y: 0, width: 10, height: 0 });
    expect(tbRl.firstRunFrame(1)).toEqual({ x: 80, y: 0, width: 10, height: 0 });
  });

  it("uses the shrunk line pitch from the shifted position", () => {
    const shrink: StoneOptions = { fontSize: 20, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.25 };
    const lrTb = lay("あいうえおかきくけこさしすせそ", { ...shrink, directionAlign: "end" }, { width: 100, height: 50 });
    expect(lrTb.adjustFontScale).toBeLessThan(1);
    expect(lrTb.lineCount).toBe(3);
    expect(lrTb.runs[0].frame.y).toBeGreaterThan(0); // 3 行は高さ 50 より少し低いので、下に寄っている
    linePositions(lrTb).forEach((y, line) => {
      expect(y).toBeCloseTo(lrTb.runs[0].frame.y + line * lrTb.adjustLineHeight);
    });
    expect(lrTb.firstRunFrame(2).y).toBeCloseTo(runOf(lrTb, "す").run.frame.y);
    expect(lrTb.firstRunFrame(0).height).toBeCloseTo(lrTb.adjustFontSize);

    const tbRl = lay("あいうえおかきくけこさしすせそたちつてと", { ...shrink, direction: "tbRl" }, { width: 80, height: 50 });
    expect(tbRl.adjustFontScale).toBeLessThan(1);
    expect(tbRl.lineCount).toBe(5);
    expect(tbRl.renderedSize.width).toBeLessThan(80); // 5 列は幅 80 より狭いので、右端から並ぶ
    expect(tbRl.firstRunFrame(0).x).toBeCloseTo(80 - tbRl.adjustFontSize);
    expect(tbRl.firstRunFrame(4).x).toBeCloseTo(runOf(tbRl, "ち").run.frame.x);
    expect(tbRl.firstRunFrame(0).width).toBeCloseTo(tbRl.adjustFontSize);
  });

  it("stays at the start for empty text, which has nothing to move", () => {
    const lrTb = lay("", { directionAlign: "end" }, { height: 100 });
    expect(lrTb.firstRunFrame(0)).toEqual({ x: 0, y: 0, width: 0, height: 10 });
    // 空のテキストの hitRunIndex は、先頭位置の左右 4px を当たりにする
    expect(lrTb.hitRunIndex({ x: 0, y: 5 })).toBe(0);
    expect(lrTb.hitRunIndex({ x: 0, y: 95 })).toBeNull();
    expect(lrTb.closestRunIndex({ x: 0, y: 95 })).toBe(0);

    const tbRl = lay("", { direction: "tbRl" }, { width: 100 });
    expect(tbRl.firstRunFrame(0)).toEqual({ x: -10, y: 0, width: 10, height: 0 });
    expect(tbRl.hitRunIndex({ x: 95, y: 0 })).toBeNull();
    expect(tbRl.closestRunIndex({ x: 95, y: 0 })).toBe(0);
  });
});

describe("closestRunIndex", () => {
  it("picks the line under the point when horizontal text is moved down", () => {
    // 行は y = 150 … 190。寄せる前の位置（y = 0 … 40）で行を選ぶと、どの行を指しても 4 行目の「え」になった
    for (const [directionAlign, top] of [
      ["end", 150],
      ["middle", 75],
    ] as const) {
      const ctx = lay(FIVE_LINES, { directionAlign }, { height: 200 });
      expect(ctx.closestRunIndex({ x: 2, y: top + 5 })).toBe(0); // 「あ」の前
      expect(ctx.closestRunIndex({ x: 8, y: top + 5 })).toBe(1); // 「あ」の後ろ
      expect(ctx.closestRunIndex({ x: 2, y: top + 25 })).toBe(4); // 「う」の前
      expect(ctx.closestRunIndex({ x: 2, y: top + 45 })).toBe(8); // 「お」の前
      expect(misplacedHalves(ctx)).toEqual([]);
    }
  });

  it("picks the column under the point when vertical text has a width", () => {
    // 列は x = 190 … 150。寄せる前の位置（x = 40 … 0）で列を選ぶと、3 列目から後ろを指しても 2 列目の「い」になった
    const start = lay(FIVE_LINES, { direction: "tbRl" }, { width: 200 });
    expect(start.closestRunIndex({ x: 195, y: 2 })).toBe(0); // 「あ」の前
    expect(start.closestRunIndex({ x: 175, y: 2 })).toBe(4); // 「う」の前
    expect(start.closestRunIndex({ x: 175, y: 8 })).toBe(5); // 「う」の後ろ
    expect(start.closestRunIndex({ x: 155, y: 2 })).toBe(8); // 「お」の前
    expect(misplacedHalves(start)).toEqual([]);

    const middle = lay(FIVE_LINES, { direction: "tbRl", directionAlign: "middle" }, { width: 200 });
    expect(middle.closestRunIndex({ x: 100, y: 2 })).toBe(4); // 「う」の列は x = 95 … 105
    expect(misplacedHalves(middle)).toEqual([]);
  });

  it("finds characters on hidden lines where they were moved to", () => {
    const lrTb = lay(FIVE_LINES, { directionAlign: "end" }, { height: 25 });
    expect(lrTb.closestRunIndex({ x: 2, y: 47 })).toBe(8); // 領域の下の外にある「お」
    expect(misplacedHalves(lrTb)).toEqual([]);
    for (const directionAlign of ["start", "middle", "end"] as const) {
      const tbRl = lay(FIVE_LINES, { direction: "tbRl", directionAlign }, { width: 25 });
      expect(tbRl.closestRunIndex({ x: runOf(tbRl, "お").run.frame.x + 5, y: 2 })).toBe(8); // 領域の左の外にある「お」
      expect(misplacedHalves(tbRl)).toEqual([]);
    }
  });

  it("handles text that ends with a newline", () => {
    // 寄せる前の位置で行を選ぶと、末尾の空行（y = 30 と見積もられる）が最も近くなり、「あ」を指しても最後の行の「う」になった
    const lrTb = lay("あ\nい\nう\n", { directionAlign: "end" }, { height: 100 });
    expect(lrTb.closestRunIndex({ x: 2, y: 72 })).toBe(0);
    expect(lrTb.closestRunIndex({ x: 2, y: 104 })).toBe(4); // 末尾の空行を指したら、その手前の行の文字
    expect(misplacedHalves(lrTb)).toEqual([]);

    const tbRl = lay("あ\nい\nう\n", { direction: "tbRl" }, { width: 100 });
    expect(tbRl.closestRunIndex({ x: 95, y: 2 })).toBe(0);
    expect(tbRl.closestRunIndex({ x: 65, y: 2 })).toBe(4); // 末尾の空の列（x = 60 … 70）を指したら、その右の列の文字
    expect(misplacedHalves(tbRl)).toEqual([]);
  });

  it("keeps to the given range in shifted text", () => {
    const ctx = lay(FIVE_LINES, { directionAlign: "end" }, { height: 200 });
    // 「あ」（y = 150）を指しても、範囲が「い」から後ろなら、その中でいちばん近い「い」
    expect(ctx.closestRunIndex({ x: 2, y: 155 }, [2, 9])).toBe(2);
    expect(ctx.closestRunIndex({ x: 2, y: 165 }, [2, 9])).toBe(2);
    // 「お」（y = 190）を指しても、範囲が「え」までなら「え」
    expect(ctx.closestRunIndex({ x: 2, y: 195 }, [0, 7])).toBe(6);
    expect(ctx.hitRunIndex({ x: 2, y: 155 })).toBe(0);
    expect(ctx.hitRunIndex({ x: 2, y: 5 })).toBeNull();
  });

  it("works with indents, tate-chu-yoko, shrinking and justified lines in shifted text", () => {
    const text = "「吾輩」は猫である。名前はまだ無い。\nどこで生れたか、とんと見当がつかぬ。\n令和18年7月、ABC と書いた。";
    const sizes = [
      { width: 200, height: 200 }, // 余裕がある
      { width: 85, height: 85 }, // 行送り方向に収まらない行がある
    ];
    for (const direction of ["lrTb", "tbRl"] as const) {
      for (const directionAlign of ["start", "middle", "end"] as const) {
        for (const size of sizes) {
          const base: StoneOptions = { direction, directionAlign, dividesByWords: true };
          const variants: StoneOptions[] = [
            base,
            { ...base, textIndent: 10, textAlign: "justify" },
            { ...base, textIndent: -10, textAlign: "center", lineHeightScale: 1.5 },
            { ...base, letterSpacing: 2, textAlign: "trailing", punctuationMode: "half" },
            { ...base, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 },
          ];
          for (const options of variants) {
            const ctx = lay(text, options, size);
            expect(misplacedHalves(ctx), JSON.stringify({ options, size })).toEqual([]);
          }
        }
      }
    }
  });
});

describe("line positions with a column that holds only a one-digit tate-chu-yoko", () => {
  // 1 桁の縦中横（5.225px）だけの列は、列を寄せる位置と renderedSize を、数字の矩形ではなく列の 1em の箱で決める
  // （layout-tbrl.test.ts）。行の位置（firstRunFrame）も列の箱の位置になり、どの列を指しても、その列の文字が返る
  it("returns the column boxes when the rightmost or the leftmost column holds only the digit", () => {
    // 幅 40 に 2 列。列の箱は x = 30 と 20。「7」の矩形は 22.3875〜27.6125 で、寄せた量を矩形の左端で測ると 2.3875px ずれる
    const left = lay("あ7", { direction: "tbRl" }, { height: 10, width: 40 });
    expect(runOf(left, "7").run.frame.x).toBeCloseTo(22.3875);
    expect(linePositions(left)[0]).toBeCloseTo(30);
    expect(linePositions(left)[1]).toBeCloseTo(20);
    // 右端の列が数字だけのときは、renderedSize の幅を数字の矩形で測ると、同じだけ左にずれる
    const right = lay("7あ", { direction: "tbRl" }, { height: 10, width: 40 });
    expect(runOf(right, "7").run.frame.x).toBeCloseTo(32.3875);
    expect(linePositions(right)[0]).toBeCloseTo(30);
    expect(linePositions(right)[1]).toBeCloseTo(20);
    // 幅を決めないとき（寄せない）は、右端の列の箱が renderedSize の右端
    const auto = lay("7あ", { direction: "tbRl" }, { height: 10 });
    expect(linePositions(auto)).toEqual([10, 0]);
  });

  it("puts every line where it would be if the digits were full-width characters", () => {
    for (const directionAlign of ["start", "middle", "end"] as const) {
      for (const width of [undefined, 30, 40, 47.5]) {
        for (const text of ["7あい", "あい7", "7あ8", "あ7い", "7"]) {
          const options: StoneOptions = { direction: "tbRl", directionAlign };
          const ctx = lay(text, options, { height: 10, width });
          const reference = linePositions(lay(text.replace(/\d/g, "字"), options, { height: 10, width }));
          const label = JSON.stringify({ text, directionAlign, width });
          linePositions(ctx).forEach((x, line) => expect(x, label).toBeCloseTo(reference[line]));
          expect(misplacedHalves(ctx), label).toEqual([]);
        }
      }
    }
  });

  it("does not change the positions, not even by a rounding error, when the digit shares its column with other characters", () => {
    // 数字と文字が同じ列にあれば、寄せた量は今までどおり文字の矩形の左端で決まる（列の箱は数字の位置から求め直すので、使わない）
    for (const fontSize of [10, 13.5, 16, 17]) {
      for (const lineHeightScale of [1, 1.2, 1.7]) {
        const options: StoneOptions = { direction: "tbRl", fontSize, lineHeightScale };
        const ctx = lay("7月\n晴れ7\nあ7い\n月7", options, { width: 200 });
        const reference = lay("字月\n晴れ字\nあ字い\n月字", options, { width: 200 });
        expect(linePositions(ctx)).toEqual(linePositions(reference));
      }
    }
  });
});
