import { describe, expect, it } from "vitest";
import { svgString } from "../src/index.js";
import { lay, lines, runOf, shown } from "./helpers.js";

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
    // 縦中横は列の中央に寄せる（同じ列の先頭 run「あ」の中心と一致する）
    expect(one.position.x).toBeCloseTo(two.position.x - one.advance);
    const center = (one.frame.x + two.frame.x + two.frame.width) / 2;
    expect(center).toBeCloseTo(ctx.runs[0].frame.x + 5);
    expect(one.frame.x).toBeGreaterThan(ctx.runs[0].frame.x - 1); // 列からはみ出さない
  });

  it("sets dashes and leaders upright in the column like Japanese characters", () => {
    // 欧文として回転すると、点が列の左寄り（欧文のベースライン側）に並び、「——」は 2 本に切れる
    const ctx = lay("あ……い——う", { direction: "tbRl" });
    ctx.runs.forEach((run, i) => {
      expect(ctx.isClockwise(run)).toBe(false);
      expect(ctx.usesVerticalGlyph(run)).toBe(true);
      expect(run.frame).toEqual({ x: 0, y: i * 10, width: 10, height: 10 });
      expect(run.position.x).toBe(0);
      expect(run.position.y).toBeCloseTo(i * 10 + 8.8);
    });
    // 欧文の単語の後ろでも回転しない
    const latin = lay("Hello…", { direction: "tbRl" });
    expect(latin.isClockwise(runOf(latin, "o").run)).toBe(true);
    expect(latin.isClockwise(runOf(latin, "…").run)).toBe(false);
  });

  it("sets general punctuation such as ‼ and ※ upright in the column like CSS", () => {
    // UTR #50 で正立（U）。欧文として回転すると「‼」「⁉」が横倒しになり、「※」は欧文のスケール 0.95 で小さくなる
    const ctx = lay("あ‼い⁉う※え†‰", { direction: "tbRl" });
    ctx.runs.forEach((run, i) => {
      expect(ctx.isClockwise(run)).toBe(false);
      expect(ctx.usesVerticalGlyph(run)).toBe(true);
      expect(run.frame).toEqual({ x: 0, y: i * 10, width: 10, height: 10 });
      expect(run.position.y).toBeCloseTo(i * 10 + 8.8);
    });
    // 欧文の単語の後ろでも回転しない。2 文字の「!?」は縦中横（2 桁以下の数字だけ）にならず、欧文として回転する
    const latin = lay("Wow‼!?", { direction: "tbRl" });
    expect(latin.isClockwise(runOf(latin, "w").run)).toBe(true);
    expect(latin.isClockwise(runOf(latin, "‼").run)).toBe(false);
    for (const char of ["!", "?"]) {
      const { run } = runOf(latin, char);
      expect(latin.isTateChuYoko(run)).toBe(false);
      expect(latin.isClockwise(run)).toBe(true);
    }
    // 行頭禁則（「‼」を列の先頭にしない）
    expect(lines(lay("あいうえお‼か", { direction: "tbRl" }, { height: 50 }))).toEqual(["あいうえ", "お‼か"]);
  });

  it("does not break inside a run of leaders, dashes or kunojiten", () => {
    for (const pair of ["……", "——", "〳〵"]) {
      const ctx = lay(`あいうえ${pair}か`, { direction: "tbRl" }, { height: 50 });
      expect(lines(ctx)).toEqual(["あいうえ", `${pair}か`]);
    }
  });

  it("does not start a column with fullwidth ！，．：；・ or the prolonged sound mark", () => {
    for (const mark of Array.from("！，．：；・ーゝ〜")) {
      const off = lay(`あいうえお${mark}か`, { direction: "tbRl", kinsoku: false }, { height: 50 });
      expect(lines(off)).toEqual(["あいうえお", `${mark}か`]);
      const ctx = lay(`あいうえお${mark}か`, { direction: "tbRl" }, { height: 50 });
      expect(lines(ctx)).toEqual(["あいうえ", `お${mark}か`]);
      // 送った「お」は次の列の先頭
      const o = runOf(ctx, "お").run;
      expect(o.frame.y).toBe(0);
      expect(o.frame.x).toBeLessThan(runOf(ctx, "あ").run.frame.x);
    }
    expect(lines(lay("新しいコンピューターを", { direction: "tbRl" }, { height: 70 }))).toEqual([
      "新しいコン",
      "ピューターを",
    ]);
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

  it("spreads the slack between characters when dividing by words", () => {
    const ctx = lay("日本語の組版です", { direction: "tbRl", dividesByWords: true, textAlign: "justify" }, { height: 45 });
    expect(lines(ctx)).toEqual(["日本語の", "組版です"]);
    const gap = 5 / 3;
    expect(runOf(ctx, "本").run.frame.y).toBeCloseTo(10 + gap);
    expect(runOf(ctx, "の").run.frame.y + runOf(ctx, "の").run.frame.height).toBeCloseTo(45);
  });

  it("keeps tate-chu-yoko digits together when justifying", () => {
    // 東京(20) 12(10) 月(10) = 40、の は入らない
    const ctx = lay("東京12月の空", { direction: "tbRl", dividesByWords: true, textAlign: "justify" }, { height: 45 });
    expect(lines(ctx)).toEqual(["東京12月", "の空"]);
    const gap = 5 / 3; // 東｜京、京｜12、12｜月 の 3 か所
    const one = runOf(ctx, "1").run;
    const two = runOf(ctx, "2").run;
    expect(one.frame.y).toBeCloseTo(20 + gap * 2);
    expect(two.frame.y).toBe(one.frame.y);
    const month = runOf(ctx, "月").run;
    expect(month.frame.y + month.frame.height).toBeCloseTo(45);
  });

  it("renders vertical text as SVG with rotation and vert features", () => {
    const ctx = lay("あA", { direction: "tbRl" });
    const svg = svgString(ctx);
    expect(svg).toContain('rotate="90" data-run="1"');
    expect(svg).toContain("font-feature-settings");
    expect((svg.match(/<text /g) ?? []).length).toBe(1);
    expect(svg).toContain('data-run="0"');
  });
});

describe("truncation tbRl", () => {
  it("hides a partly visible column and puts a single ellipsis at the end of the last full column", () => {
    // 2 列目は 2px（幅 12）/ 9px（幅 19）だけ見えるが、一部しか見えない列は描かない
    for (const width of [12, 19]) {
      const ctx = lay("あいうえおかきくけこ", { direction: "tbRl" }, { width, height: 55 });
      expect(shown(ctx)).toBe("あいうえ…");
      expect(ctx.isTruncated).toBe(true);
      expect(svgString(ctx).match(/︙/g)).toHaveLength(1);
    }
  });

  it("hides rotated latin runs before the ellipsis until a 1em ellipsis fits", () => {
    // 「b」（45.225〜50.45px）を「︙」（1em）にすると 55.225px で高さ 55 を越えるので、手前の「a」を省略記号にする
    const ctx = lay("あいうえabcかきく", { direction: "tbRl" }, { width: 10, height: 55 });
    expect(lines(ctx)).toEqual(["あいうえab", "cかきく"]);
    expect(shown(ctx)).toBe("あいうえ…");
    expect(runOf(ctx, "a").run.visibility).toBe("ellipsis");
    // 高さ 56 なら「c」は収まらないが「b」は収まる
    const taller = lay("あいうえabcかきく", { direction: "tbRl" }, { width: 10, height: 56 });
    expect(lines(taller)).toEqual(["あいうえabc", "かきく"]);
    expect(shown(taller)).toBe("あいうえa…");
  });

  it("keeps the ellipsis on a full-width character that ends at the edge", () => {
    const ctx = lay("あいうえおかきくけこ", { direction: "tbRl" }, { width: 10, height: 50 });
    expect(lines(ctx)[0]).toBe("あいうえお");
    expect(shown(ctx)).toBe("あいうえ…");
  });

  it("puts the ellipsis on the character before a newline", () => {
    const ctx = lay("あ\nい", { direction: "tbRl" }, { width: 10 });
    expect(ctx.runs.map((r) => r.visibility)).toEqual(["ellipsis", "invisible", "invisible"]);
  });

  it("puts the ellipsis on the first digit of a tate-chu-yoko", () => {
    // 1 列目の最後が縦中横の「12」なので、2 桁目ではなく縦中横の先頭を省略記号にする
    const ctx = lay("あいうえ12かき", { direction: "tbRl", dividesByWords: true }, { width: 11, height: 51 });
    expect(lines(ctx)).toEqual(["あいうえ12", "かき"]);
    expect(runOf(ctx, "1").run.visibility).toBe("ellipsis");
    expect(shown(ctx)).toBe("あいうえ…");
  });

  it("does not truncate a tate-chu-yoko wider than 1em in the leftmost column", () => {
    // 2 桁で 10.45px の縦中横。中央寄せではみ出す分も含めて寄せるので、大きさを制限しなければ切り詰めない
    const ctx = lay("あ12い", { direction: "tbRl", dividesByWords: true });
    expect(ctx.isTruncated).toBe(false);
    expect(Math.min(...ctx.runs.map((r) => r.frame.x))).toBeCloseTo(0);
  });

  it("aligns only the columns that fit with directionAlign middle and end", () => {
    // 2 列目は収まらないので 1 列目だけを中央・左に寄せる（隠れる列は常に末尾側）
    const middle = lay("あいうえおかきくけこ", { direction: "tbRl", directionAlign: "middle" }, { width: 15, height: 55 });
    expect(middle.runs[0].frame.x).toBe(2.5);
    expect(shown(middle)).toBe("あいうえ…");
    const end = lay("あいうえおかきくけこ", { direction: "tbRl", directionAlign: "end" }, { width: 15, height: 55 });
    expect(end.runs[0].frame.x).toBe(0);
    expect(shown(end)).toBe("あいうえ…");
  });

  it("shrinks vertical text that has a newline until every column fits", () => {
    // 改行の矩形の幅が縮小前のフォントサイズ（20px）のままだと、1 列目が左にずれて 2 列目がはみ出していた
    const ctx = lay(
      "あいうえ\nか",
      { direction: "tbRl", fontSize: 20, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 },
      { width: 22, height: 44 },
    );
    expect(ctx.isTruncated).toBe(false);
    expect(shown(ctx)).toBe("あいうえ\nか");
    const first = ctx.runs[0].frame;
    expect(first.x + first.width).toBeCloseTo(22); // 1 列目は右端にそろう
  });
});
