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

  it("sets quotation marks in Japanese text upright in full-width columns, and rotates those of latin words", () => {
    // 和文中の引用符は全角の縦組み用グリフ（〝〟の形）で 1em。欧文として回転すると送りが約 0.4em に詰まる
    const ctx = lay("あ“い”う‘え’お", { direction: "tbRl" });
    ctx.runs.forEach((run, i) => {
      expect(ctx.isClockwise(run)).toBe(false);
      expect(ctx.usesVerticalGlyph(run)).toBe(true);
      expect(ctx.usesFullWidthGlyph(run)).toBe(i % 2 === 1);
      expect(run.advance).toBe(10);
      expect(run.frame).toEqual({ x: 0, y: i * 10, width: 10, height: 10 });
    });
    // 欧文の単語の引用符とアポストロフィは、今までどおり欧文として回転する
    const latin = lay("“Hi” it’s", { direction: "tbRl" });
    for (const char of ["“", "”", "’"]) {
      const { run } = runOf(latin, char);
      expect(latin.isClockwise(run)).toBe(true);
      expect(latin.usesFullWidthGlyph(run)).toBe(false);
      expect(run.frame.height).toBeCloseTo(5.225);
    }
    // 列の残りが 1em に満たなければ次の列へ送る（プロポーショナルな字形の幅で判定すると列からはみ出して隠れる）
    const short = lay("ab“", { direction: "tbRl" }, { height: 20 });
    expect(lines(short)).toEqual(["ab", "“"]);
    expect(shown(short)).toBe("ab“");
    expect(lines(lay("あいうえ“お”か", { direction: "tbRl" }, { height: 50 }))).toEqual(["あいうえ", "“お”か"]);
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

  it("wraps a tate-chu-yoko by the 1em it takes in the column, not by the advance of its digits", () => {
    // 1 桁の縦中横は列の中で 1em を占める。送り幅（5.225px）で見積もると、残り 7px の列に置かれてはみ出し、その列から後ろが隠れる
    const one = lay("あいうえ1か", { direction: "tbRl", dividesByWords: true }, { height: 47 });
    expect(lines(one)).toEqual(["あいうえ", "1か"]);
    expect(shown(one)).toBe("あいうえ1か");
    expect(one.isTruncated).toBe(false);
    // 2 桁の縦中横も 1em（送り幅の合計は 10.45px）。残りがちょうど 1em の列に入る
    const two = lay("あいうえ12か", { direction: "tbRl", dividesByWords: true }, { height: 50 });
    expect(lines(two)).toEqual(["あいうえ12", "か"]);
    expect(runOf(two, "1").run.frame.y).toBe(40);
    expect(two.isTruncated).toBe(false);
    // 文字単位で分けたときの数字（1 桁ずつの縦中横）も同じ
    expect(lines(lay("あいうえ1か", { direction: "tbRl" }, { height: 47 }))).toEqual(["あいうえ", "1か"]);
  });

  it("wraps upright characters by 1em even when their advance is narrower", () => {
    // 半角カナは正立で 1em を占める（送り幅は 5.5px）
    const kana = lay("あいうえｱか", { direction: "tbRl" }, { height: 47 });
    expect(lines(kana)).toEqual(["あいうえ", "ｱか"]);
    expect(shown(kana)).toBe("あいうえｱか");
    // 和文のスケールを小さくしても、列の中では 1em ずつ送る（送り幅は 9px）
    const scaled = lay(
      "あいうえおか",
      { direction: "tbRl", fonts: { japanese: { family: "", scale: 0.9 } } },
      { height: 49 },
    );
    expect(lines(scaled)).toEqual(["あいうえ", "おか"]);
    expect(scaled.isTruncated).toBe(false);
    // 回転する欧文は送り幅（2 文字で 10.45px）で見積もる
    expect(lines(lay("あいうえab", { direction: "tbRl", dividesByWords: true }, { height: 51 }))).toEqual(["あいうえab"]);
    expect(lines(lay("あいうえab", { direction: "tbRl", dividesByWords: true }, { height: 50 }))).toEqual(["あいうえ", "ab"]);
    // 改行は長さを持たないので、いっぱいの列の最後にそのまま置く
    expect(lines(lay("あいうえ\nか", { direction: "tbRl" }, { height: 40 }))).toEqual(["あいうえ", "か"]);
  });

  it("does not split a rotated latin word that fits in the column", () => {
    // あい(20) + English(5.225 × 7 = 36.575) = 56.575px。次の文字を 1em と見積もると、収まる単語なのに「h」の前で折り返してしまう
    const ctx = lay("あいEnglishう", { direction: "tbRl", dividesByWords: true }, { height: 60 });
    expect(lines(ctx)).toEqual(["あいEnglish", "う"]);
    const h = runOf(ctx, "h").run;
    expect(h.frame.y + h.frame.height).toBeCloseTo(56.575);
    expect(lines(lay("Englishの単語", { direction: "tbRl", dividesByWords: true }, { height: 40 }))[0]).toBe("English");
    // 列より長い単語は、入るところ（5 文字で 26.125px）まで詰めてから折り返す
    expect(lines(lay("English", { direction: "tbRl", dividesByWords: true }, { height: 30 }))).toEqual(["Engli", "sh"]);
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

  it("does not break inside a tate-chu-yoko at the head of a column when kinsoku pushes characters out", () => {
    const options = { direction: "tbRl", dividesByWords: true } as const;
    // 12(10) + 々(10) = 20px で、「）」は入らない。「）」も「々」も列の先頭に置けないので、追い出しは列の先頭の縦中横まで戻る。
    // 列の最初の run（1 桁目）まで戻すと「1」「2」「々）」に分かれるので、縦中横のまとまりを列に残して改行する
    const ctx = lay("12々）", options, { height: 27 });
    expect(lines(ctx)).toEqual(["12", "々）"]);
    const one = runOf(ctx, "1").run;
    const two = runOf(ctx, "2").run;
    expect(two.frame.y).toBe(one.frame.y);
    expect(two.frame.x).toBeCloseTo(one.frame.x + one.advance); // 横に並んだまま
    // 1 桁の縦中横で始まる列と同じ分かれ方になる
    expect(lines(lay("1々）", options, { height: 27 }))).toEqual(["1", "々）"]);
    // 折り返して始まる列でも同じ（「字々」の次の列が「12」で始まり、「、」が入らず、「ぁ」も「、」も列の先頭に置けない）
    expect(lines(lay("字々12ぁ、", options, { height: 29.85 }))).toEqual(["字々", "12", "ぁ、"]);
    // 縦中横だけで列がいっぱいのときも、1 桁目の後ろでは改行しない
    expect(lines(lay("12）", options, { height: 10 }))).toEqual(["12", "）"]);
    expect(lines(lay("12、34。", options, { height: 15 }))).toEqual(["12", "、", "34", "。"]);
    // 縦中横の手前に文字があれば、今までどおり縦中横ごと次の列へ追い出す
    expect(lines(lay("あ12々）", options, { height: 37 }))).toEqual(["あ", "12々）"]);
    // 禁則を切れば追い出さない
    expect(lines(lay("12々）", { ...options, kinsoku: false }, { height: 27 }))).toEqual(["12々", "）"]);
  });

  it("keeps a tate-chu-yoko at the head of a column inside the area with every textAlign", () => {
    // 2 桁目だけの列は、行末寄せ（trailing）で列の長さが 0 と見積もられて領域の外に置かれ、その列から後ろが切り詰められていた
    for (const textAlign of ["leading", "center", "trailing", "justify"] as const) {
      const ctx = lay("12々）", { direction: "tbRl", dividesByWords: true, textAlign }, { height: 27 });
      expect(lines(ctx)).toEqual(["12", "々）"]);
      expect(ctx.isTruncated).toBe(false);
      expect(shown(ctx)).toBe("12々）");
      const one = runOf(ctx, "1").run;
      const two = runOf(ctx, "2").run;
      expect(two.frame.y).toBe(one.frame.y);
      for (const run of ctx.runs) {
        expect(run.frame.y).toBeGreaterThanOrEqual(0);
        expect(run.frame.y + run.frame.height).toBeLessThanOrEqual(27 + 1e-9);
      }
    }
    const trailing = lay("12々）", { direction: "tbRl", dividesByWords: true, textAlign: "trailing" }, { height: 27 });
    const digit = runOf(trailing, "2").run;
    expect(digit.frame.y + digit.frame.height).toBeCloseTo(27); // 列の下端にそろう
  });

  it("never puts the two digits of a tate-chu-yoko in different columns, whatever the column height", () => {
    // 縦中横の後ろに行頭禁則の文字が続く並びを、1 文字ぶんから 6 文字ぶんまでの高さで組む
    const texts = ["12々）", "字々12ぁ、", "12、34。56」", "あ12っ！？」い", "全12！？」と驚く", "12ー！」34ゝ々。"];
    for (const text of texts) {
      for (let height = 10; height <= 60; height += 2.5) {
        for (const textAlign of ["leading", "center", "trailing", "justify"] as const) {
          const ctx = lay(text, { direction: "tbRl", dividesByWords: true, textAlign }, { height });
          for (const token of ctx.tokens) {
            if (token.end - token.start !== 2 || !ctx.isTateChuYokoToken(token)) continue;
            expect(ctx.runs[token.start + 1].line).toBe(ctx.runs[token.start].line);
            expect(ctx.runs[token.start + 1].frame.y).toBe(ctx.runs[token.start].frame.y);
          }
          // 高さだけを決めた領域では、どの文字も列に収まる（切り詰めない）
          expect(ctx.isTruncated).toBe(false);
        }
      }
    }
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
