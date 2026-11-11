import { describe, expect, it } from "vitest";
import { svgSize, svgString } from "../src/index.js";
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

  it("leaves only the first character of the column's first token when the push-out walks back to it", () => {
    // 現状の挙動を固定するテスト（横書きと同じ。経緯は layout-lrtb.test.ts の同じ趣旨のテストを参照）。
    // 追い出しが列の最初のトークンに届くと、その 1 文字目だけを列に残して改行する。まとまりのまま列に残すのは、縦中横だけ
    const options = { direction: "tbRl", dividesByWords: true } as const;
    // 3 桁の数字は回転する欧文で、縦中横ではない。123(15.675) + 々(10) = 25.675px で、「）」は入らない。追い出しは 123 まで戻って
    // 「1」だけを列に残し、次の列でも同じことが起きるので、1 桁ずつの列になる
    expect(lines(lay("123々）", options, { height: 27 }))).toEqual(["1", "2", "3々）"]);
    // 欧文の単語と和文の単語も同じ
    expect(lines(lay("English、」と", options, { height: 50 }))).toEqual(["E", "nglish、」", "と"]);
    expect(lines(lay("東京。", options, { height: 20 }))).toEqual(["東", "京。"]);
    // 行揃えが何であっても同じ分かれ方で、切り詰めにはならない
    for (const textAlign of ["leading", "center", "trailing", "justify"] as const) {
      const digits = lay("123々）", { ...options, textAlign }, { height: 27 });
      expect(lines(digits)).toEqual(["1", "2", "3々）"]);
      expect(digits.isTruncated).toBe(false);
      expect(shown(digits)).toBe("123々）");
      const word = lay("English、」と", { ...options, textAlign }, { height: 50 });
      expect(lines(word)).toEqual(["E", "nglish、」", "と"]);
      expect(word.isTruncated).toBe(false);
      expect(shown(word)).toBe("English、」と");
    }
    // 列の最初のトークンでなければ、トークンごと次の列へ送る
    expect(lines(lay("あ123々）", options, { height: 37 }))).toEqual(["あ", "123々）"]);
    // 禁則を切れば追い出さない
    expect(lines(lay("123々）", { ...options, kinsoku: false }, { height: 27 }))).toEqual(["123々", "）"]);
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

  it("does not set a two-digit token that mixes half-width and full-width digits as a tate-chu-yoko", () => {
    const options = { direction: "tbRl", dividesByWords: true } as const;
    // 「1２」は 1 つのトークン。半角の「1」だけを縦中横にすると、「２」が「1」の横に置かれ、後ろの文字の列が「1」の幅だけ右にずれる
    const ctx = lay("あ1２いう", options);
    const one = runOf(ctx, "1").run;
    const two = runOf(ctx, "２").run;
    expect(ctx.tokenString(one.tokenId)).toBe("1２");
    expect(two.tokenId).toBe(one.tokenId);
    expect(ctx.isTateChuYokoToken(ctx.tokens[one.tokenId])).toBe(false);
    for (const run of [one, two]) expect(ctx.isTateChuYoko(run)).toBe(false);
    // 半角の数字は回転する欧文、全角の数字は正立の和文として、1 文字ずつ送る（3 桁以上の数字と同じ）
    expect(ctx.isClockwise(one)).toBe(true);
    expect(ctx.isClockwise(two)).toBe(false);
    expect(ctx.usesVerticalGlyph(two)).toBe(true);
    expect(one.frame.x).toBe(0);
    expect(one.frame.y).toBe(10);
    expect(one.frame.width).toBe(10);
    expect(one.frame.height).toBeCloseTo(5.225);
    expect(two.frame.x).toBe(0);
    expect(two.frame.y).toBeCloseTo(15.225);
    expect(two.frame.width).toBe(10);
    expect(two.frame.height).toBe(10);
    expect(runOf(ctx, "い").run.frame.y).toBeCloseTo(25.225);
    for (const run of ctx.runs) expect(run.frame.x).toBe(0); // 後ろの文字も同じ列に並ぶ
    expect(ctx.renderedSize.width).toBe(10);
    expect(ctx.renderedSize.height).toBeCloseTo(45.225);

    // 全角の数字が先でも同じ
    const reversed = lay("あ２1い", options);
    const last = runOf(reversed, "1").run;
    expect(reversed.tokenString(last.tokenId)).toBe("２1");
    expect(reversed.isTateChuYoko(last)).toBe(false);
    expect(reversed.isClockwise(last)).toBe(true);
    expect(last.frame.x).toBe(0);
    expect(last.frame.y).toBe(20);
    expect(last.frame.width).toBe(10);
    expect(last.frame.height).toBeCloseTo(5.225);
    expect(runOf(reversed, "い").run.frame.y).toBeCloseTo(25.225);

    // 数字（\p{N}）のうち欧文フォントで組むローマ数字も、全角の数字と混ざったトークンでは縦中横にしない
    const roman = lay("あⅡ２い", options);
    const numeral = runOf(roman, "Ⅱ").run;
    expect(roman.tokenString(numeral.tokenId)).toBe("Ⅱ２");
    expect(roman.isTateChuYoko(numeral)).toBe(false);
    expect(roman.isClockwise(numeral)).toBe(true);
    // 半角だけ・全角だけの 2 桁は今までどおり（半角は縦中横、全角は 1 文字ずつ正立）
    const half = lay("あ12い", options);
    expect(half.isTateChuYoko(runOf(half, "1").run)).toBe(true);
    expect(half.isTateChuYoko(runOf(half, "2").run)).toBe(true);
    const full = lay("あ１２い", options);
    for (const char of ["１", "２"]) {
      const { run } = runOf(full, char);
      expect(full.isTateChuYoko(run)).toBe(false);
      expect(full.isClockwise(run)).toBe(false);
    }
    expect(runOf(full, "２").run.frame.y).toBe(20);
  });

  it("keeps the columns in place after a mixed-width two-digit token", () => {
    // 「1２」の横の位置が戻らないと、後ろの列が「1」の幅だけ右にずれ、次の縦中横「12」の後ろの文字が「1２」の列まで戻って重なる
    const ctx = lay("あ1２いうえおか12きく", { direction: "tbRl", dividesByWords: true }, { height: 40 });
    expect(lines(ctx)).toEqual(["あ1２い", "うえおか", "12きく"]);
    const columns = ["あ", "う", "き"].map((char) => runOf(ctx, char).run.frame.x);
    expect(columns[0] - columns[1]).toBeCloseTo(10);
    expect(columns[1] - columns[2]).toBeCloseTo(10);
    for (const run of ctx.runs) {
      if (ctx.isTateChuYoko(run)) continue;
      expect(run.frame.x).toBeCloseTo(columns[run.line]);
    }
    // 縦中横「12」は、同じ列の文字と中心がそろう
    const one = runOf(ctx, "1", 1).run;
    const two = runOf(ctx, "2").run;
    expect(ctx.isTateChuYoko(one)).toBe(true);
    expect((one.frame.x + two.frame.x + two.frame.width) / 2).toBeCloseTo(columns[2] + 5);
  });

  it("keeps a mixed-width two-digit token inside the area with every textAlign", () => {
    const options = { direction: "tbRl", dividesByWords: true } as const;
    for (const textAlign of ["leading", "center", "trailing", "justify"] as const) {
      // 「1２」を 1 文字ぶん多く数えると、行末寄せで列が領域の上にはみ出して、全部の文字が隠れる
      const ctx = lay("あ1２いう", { ...options, textAlign }, { height: 20 });
      expect(lines(ctx)).toEqual(["あ", "1２", "いう"]);
      // 「２1」の「1」を数え落とすと、中央寄せ・行末寄せで 1 列目が領域の下にはみ出して切り詰めになる
      const reversed = lay("あ２1い", { ...options, textAlign }, { height: 30 });
      expect(lines(reversed)).toEqual(["あ２1", "い"]);
      for (const [layout, height] of [[ctx, 20], [reversed, 30]] as const) {
        expect(layout.isTruncated).toBe(false);
        expect(shown(layout)).toBe(layout.text);
        for (const run of layout.runs) {
          expect(run.frame.y).toBeGreaterThanOrEqual(-1e-9);
          expect(run.frame.y + run.frame.height).toBeLessThanOrEqual(height + 1e-9);
        }
      }
    }
    // 行末寄せでは、列の最後の文字が下端にそろう
    const trailing = lay("あ２1い", { ...options, textAlign: "trailing" }, { height: 30 });
    const digit = runOf(trailing, "1").run;
    expect(runOf(trailing, "あ").run.frame.y).toBeCloseTo(4.775);
    expect(digit.frame.y + digit.frame.height).toBeCloseTo(30);
    const center = lay("あ２1い", { ...options, textAlign: "center" }, { height: 30 });
    expect(runOf(center, "あ").run.frame.y).toBeCloseTo(2.3875);
  });

  it("sets every run of a token the same way, whatever the column height and textAlign", () => {
    // 半角と全角の数字（とローマ数字）が混ざった 2 桁のトークンを、1 文字ぶんから 6 文字ぶんまでの高さで組む
    const texts = ["あ1２いう", "あ２1い", "1２々）", "２1、3４。5６」", "第1２回と２1世紀の12月", "Ⅱ２ー！」２Ⅱゝ々。"];
    for (const text of texts) {
      for (let height = 10; height <= 60; height += 2.5) {
        for (const textAlign of ["leading", "center", "trailing", "justify"] as const) {
          const ctx = lay(text, { direction: "tbRl", dividesByWords: true, textAlign }, { height });
          // 縦中横かどうかは、トークンの中でそろう
          for (const token of ctx.tokens) {
            for (let i = token.start; i < token.end; i++) {
              expect(ctx.isTateChuYoko(ctx.runs[i])).toBe(ctx.isTateChuYokoToken(token));
            }
          }
          // 縦中横でない文字は、列ごとに同じ横の位置に並び、列は 1 文字ぶんずつ左へ進む
          const right = ctx.runs[0].frame.x;
          for (const run of ctx.runs) {
            if (!ctx.isTateChuYoko(run)) expect(run.frame.x).toBeCloseTo(right - run.line * 10);
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

  it("shows every column whose 1em box fits, even with a tate-chu-yoko wider than 1em in the rightmost or leftmost column", () => {
    const options = { direction: "tbRl", dividesByWords: true } as const;
    // 幅 20px は 2 列ちょうど。2 桁の縦中横（10.45px）は列の中央に寄せるので、列の 1em の箱から両側に 0.225px はみ出す。
    // はみ出しまで領域に収めると、右端の列に縦中横があるだけで左端の列が領域から 0.225px 出て、その列が隠れていた
    const right = lay("78\nあい", options, { width: 20 });
    expect(right.isTruncated).toBe(false);
    expect(shown(right)).toBe("78\nあい");
    expect(runOf(right, "あ").run.frame.x).toBeCloseTo(0); // 列の箱は領域にちょうど収まる
    const eight = runOf(right, "8").run;
    expect(eight.frame.x + eight.frame.width).toBeCloseTo(20.225); // 数字は領域の右にはみ出す
    // 左端の列に縦中横があるときは、数字が領域の左にはみ出す
    const left = lay("あい\n78", options, { width: 20 });
    expect(left.isTruncated).toBe(false);
    expect(shown(left)).toBe("あい\n78");
    expect(runOf(left, "あ").run.frame.x).toBeCloseTo(10);
    expect(runOf(left, "7").run.frame.x).toBeCloseTo(-0.225);
    // 縦中横だけを 1 列ぶんの幅に組んでも表示する（省略記号も出ず、何も描かれなかった）
    const alone = lay("78", options, { width: 10 });
    expect(alone.isTruncated).toBe(false);
    expect(shown(alone)).toBe("78");
    expect(runOf(alone, "7").run.frame.x).toBeCloseTo(-0.225);
    expect(svgString(alone)).not.toContain("︙");
    // 行送りを空けた 3 列も、列数ちょうどの幅（行送り 15px × 2 + 1em）に収まる
    const spaced = lay("12月24日\n夜の東京\n初雪", { ...options, lineHeightScale: 1.5 }, { width: 40 });
    expect(spaced.isTruncated).toBe(false);
    expect(shown(spaced)).toBe("12月24日\n夜の東京\n初雪");
    expect(runOf(spaced, "月").run.frame.x).toBeCloseTo(30);
    expect(runOf(spaced, "初").run.frame.x).toBeCloseTo(0);
    // 1 桁でも、1em より広ければ同じ（欧文のスケール 2 で 11px）
    const big = lay("7\nあ", { ...options, fonts: { latin: { family: "", scale: 2 } } }, { width: 20 });
    expect(big.isTruncated).toBe(false);
    expect(runOf(big, "7").run.frame.x).toBeCloseTo(9.5);
    expect(runOf(big, "あ").run.frame.x).toBeCloseTo(0);
  });

  it("keeps the column boxes inside the area with every directionAlign when the width is exactly the columns", () => {
    const options = { direction: "tbRl", dividesByWords: true } as const;
    for (const directionAlign of ["start", "middle", "end"] as const) {
      for (const text of ["78\nあい", "あい\n78", "78\n90", "78"]) {
        const columns = text.split("\n");
        const width = columns.length * 10;
        const ctx = lay(text, { ...options, directionAlign }, { width });
        expect(ctx.isTruncated).toBe(false);
        expect(shown(ctx)).toBe(text);
        // 列は右から 1em ずつ並ぶ。縦中横は、数字の並びの中央が列の中央に来る（はみ出しは左右に同じだけ）
        columns.forEach((column, line) => {
          const first = runOf(ctx, column[0]).run;
          const last = runOf(ctx, column[column.length - 1]).run;
          expect(first.line).toBe(line);
          const center = ctx.isTateChuYoko(first)
            ? (first.frame.x + last.frame.x + last.frame.width) / 2
            : first.frame.x + 5;
          expect(center).toBeCloseTo(width - 5 - line * 10);
        });
      }
    }
  });

  it("keeps the overhang of a tate-chu-yoko inside the area while there is room, and still truncates a column whose box does not fit", () => {
    const options = { direction: "tbRl", dividesByWords: true } as const;
    // 余裕（1px）がはみ出し（0.225px）より大きければ、今までどおり数字の右端を領域の右端に合わせる
    const roomy = lay("78\nあい", options, { width: 21 });
    const eight = runOf(roomy, "8").run;
    expect(eight.frame.x + eight.frame.width).toBeCloseTo(21);
    expect(runOf(roomy, "あ").run.frame.x).toBeCloseTo(0.775);
    // 余裕（0.1px）がはみ出しより小さければ、列の箱を領域に収めて、数字が足りない分（0.125px）だけはみ出す
    const tight = lay("78\nあい", options, { width: 20.1 });
    expect(tight.isTruncated).toBe(false);
    expect(runOf(tight, "あ").run.frame.x).toBeCloseTo(0);
    const digit = runOf(tight, "8").run;
    expect(digit.frame.x + digit.frame.width).toBeCloseTo(20.225);
    // 中央寄せ・左寄せでも、数字のはみ出しを含めた並びを寄せてから、列の箱を領域に収める
    const middle = lay("78\n90", { ...options, directionAlign: "middle" }, { width: 20.2 });
    expect(runOf(middle, "9").run.frame.x).toBeCloseTo(-0.125); // 左右に 0.125px ずつはみ出す
    const rightmost = runOf(middle, "8").run;
    expect(rightmost.frame.x + rightmost.frame.width).toBeCloseTo(20.325);
    const end = lay("78\n90", { ...options, directionAlign: "end" }, { width: 20.3 });
    expect(runOf(end, "9").run.frame.x).toBeCloseTo(0); // 左端の数字は領域に収まり、右端の数字が 0.15px はみ出す
    // 列の箱が収まらない幅では、今までどおりその列から後ろを隠す
    const narrow = lay("78\nあい", options, { width: 19.9 });
    expect(narrow.isTruncated).toBe(true);
    expect(shown(narrow)).toBe("…");
    expect(runOf(narrow, "7").run.visibility).toBe("ellipsis");
    // 1em に収まる縦中横（欧文のスケール 0.9 で 2 桁 9.9px）は、はみ出さない
    const fits = lay("78\nあい", { ...options, fonts: { latin: { family: "", scale: 0.9 } } }, { width: 20 });
    expect(fits.isTruncated).toBe(false);
    expect(runOf(fits, "7").run.frame.x).toBeCloseTo(10.05);
  });

  it("does not shrink the text because a tate-chu-yoko sticks out of its column", () => {
    // 幅が列数ちょうどだと切り詰めとみなされて、収まるまで縮小されていた（縮小率 0.9375）
    const ctx = lay(
      "78\nあい",
      { direction: "tbRl", dividesByWords: true, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 },
      { width: 20 },
    );
    expect(ctx.adjustFontScale).toBe(1);
    expect(ctx.isTruncated).toBe(false);
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

describe("columns that hold only a tate-chu-yoko narrower than 1em", () => {
  // 1 桁の縦中横（5.225px）は列の中央に寄せるので、矩形の両側に 2.3875px ずつ空きがある。数字だけの列（改行の run も、ほかの文字も
  // 無い列）が端にあっても、列を寄せる位置と renderedSize は、数字の矩形ではなく列の 1em の箱で決める
  const options = { direction: "tbRl" } as const;

  it("aligns the 1em box of the column, not the digit, with the edge of the area", () => {
    // 幅 20px は 2 列ちょうど。数字の矩形で寄せると、「7」が領域の右端に付いて、「あ」の列が 2.3875px 右にずれた
    const right = lay("7あ", options, { height: 10, width: 20 });
    expect(lines(right)).toEqual(["7", "あ"]);
    expect(runOf(right, "7").run.frame.x).toBeCloseTo(12.3875);
    expect(runOf(right, "あ").run.frame.x).toBeCloseTo(0);
    // 左寄せで左端の列が数字だけのときは、「7」が領域の左端に付いて、列の箱が左に 2.3875px 出た
    const left = lay("あ7", { ...options, directionAlign: "end" }, { height: 10, width: 20 });
    expect(runOf(left, "あ").run.frame.x).toBeCloseTo(10);
    expect(runOf(left, "7").run.frame.x).toBeCloseTo(2.3875);
    // 数字だけを 1 列ぶんの幅に組むと、列の中央に来る（右端に付いた）
    expect(runOf(lay("7", options, { width: 10 }), "7").run.frame.x).toBeCloseTo(2.3875);
    // 中央寄せは、列の箱の並び（20px）を領域の中央に置く（数字の矩形までの 17.6125px を中央に置いた）
    const middle = lay("7あ", { ...options, directionAlign: "middle" }, { height: 10, width: 30 });
    expect(runOf(middle, "あ").run.frame.x).toBeCloseTo(5);
    expect(runOf(middle, "7").run.frame.x).toBeCloseTo(17.3875);
    // 行送りを空けても、列は右端から行送りずつ並ぶ（行送り 15px + 1em = 25px）
    const spaced = lay("7あ", { ...options, lineHeightScale: 1.5 }, { height: 10, width: 25 });
    expect(runOf(spaced, "7").run.frame.x).toBeCloseTo(17.3875);
    expect(runOf(spaced, "あ").run.frame.x).toBeCloseTo(0);
  });

  it("puts every column where it would be if the digits were full-width characters, with every directionAlign", () => {
    // 数字を全角の文字に置き換えたテキストと、列の位置・renderedSize が同じになる（縦中横は、数字の中央が列の中央）
    for (const directionAlign of ["start", "middle", "end"] as const) {
      for (const width of [undefined, 30, 40, 47.5]) {
        for (const text of ["7あい", "あい7", "7あ8", "あ7い", "7"]) {
          const size = { height: 10, width };
          const ctx = lay(text, { ...options, directionAlign }, size);
          const reference = lay(text.replace(/\d/g, "字"), { ...options, directionAlign }, size);
          expect(ctx.isTruncated).toBe(false);
          // 列の箱の左端は run の矩形から求め直さないので、丸め誤差も出ない
          expect(ctx.renderedSize.width).toBe(reference.renderedSize.width);
          ctx.runs.forEach((run, i) => {
            const frame = reference.runs[i].frame;
            expect(run.line).toBe(reference.runs[i].line);
            expect(run.frame.x + run.frame.width / 2).toBeCloseTo(frame.x + frame.width / 2);
          });
        }
      }
    }
  });

  it("measures renderedSize by the column boxes when the width is not fixed", () => {
    // 数字の矩形で測ると 17.6125px（2 列ぶんより 2.3875px 狭い）で、「7」が x = 0 に付いた
    const ctx = lay("あ7", options, { height: 10 });
    expect(ctx.renderedSize.width).toBe(20);
    expect(svgSize(ctx).width).toBe(20);
    expect(runOf(ctx, "あ").run.frame.x).toBe(10);
    expect(runOf(ctx, "7").run.frame.x).toBeCloseTo(2.3875);
    // 数字だけなら 1 列ぶん（5.225px だった）
    const alone = lay("7", options);
    expect(alone.renderedSize).toEqual({ width: 10, height: 10 });
    expect(runOf(alone, "7").run.frame.x).toBeCloseTo(2.3875);
    // 改行で区切った番号は、最後の列だけ改行の run が無い（27.6125px だった）
    const list = lay("1\n2\n3", options);
    expect(list.renderedSize.width).toBe(30);
    expect(runOf(list, "1").run.frame.x).toBeCloseTo(22.3875);
    expect(runOf(list, "3").run.frame.x).toBeCloseTo(2.3875);
    // 2 桁でも、1em より狭ければ同じ（欧文のスケール 0.9 で 9.9px。19.95px だった）
    const pair = lay("あ78", { ...options, dividesByWords: true, fonts: { latin: { family: "", scale: 0.9 } } }, { height: 10 });
    expect(pair.renderedSize.width).toBe(20);
    expect(runOf(pair, "7").run.frame.x).toBeCloseTo(0.05);
  });

  it("still shows a column whose digit fits when its 1em box does not, keeping the digit inside the area", () => {
    // 幅 18px は、列の箱の並び（20px）には足りないが、数字の矩形までの並び（17.6125px）は収まる。今までどおり 2 列とも表示する。
    // 列の箱を領域の右端に合わせると「あ」の列が左に 2px 出るので、収まるところまで戻す（「7」の列の箱の空きが、右に 2px 出る）
    const right = lay("7あ", options, { height: 10, width: 18 });
    expect(right.isTruncated).toBe(false);
    expect(shown(right)).toBe("7あ");
    expect(runOf(right, "あ").run.frame.x).toBeCloseTo(0);
    const seven = runOf(right, "7").run;
    expect(seven.frame.x).toBeCloseTo(12.3875);
    expect(seven.frame.x + seven.frame.width).toBeLessThan(18);
    // 中央寄せ・左寄せでも同じ位置になる
    for (const directionAlign of ["middle", "end"] as const) {
      const ctx = lay("7あ", { ...options, directionAlign }, { height: 10, width: 18 });
      expect(shown(ctx)).toBe("7あ");
      expect(runOf(ctx, "あ").run.frame.x).toBeCloseTo(0);
      expect(runOf(ctx, "7").run.frame.x).toBeCloseTo(12.3875);
    }
    // 左端の列が数字だけなら、列の箱の空きが左に 2px 出て、数字は領域の中に残る
    const left = lay("あ7", options, { height: 10, width: 18 });
    expect(shown(left)).toBe("あ7");
    expect(runOf(left, "あ").run.frame.x).toBeCloseTo(8);
    expect(runOf(left, "7").run.frame.x).toBeCloseTo(0.3875);
    // 数字だけの 1 列も、数字が収まる幅（6px）なら表示する
    const alone = lay("7", options, { width: 6 });
    expect(shown(alone)).toBe("7");
    expect(runOf(alone, "7").run.frame.x).toBeCloseTo(0);
    // 収めるための縮小もしない
    const shrink = { ...options, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 };
    expect(lay("7あ", shrink, { height: 10, width: 18 }).adjustFontScale).toBe(1);
    // 数字の矩形も収まらない幅（17.6px）では、今までどおりその列から後ろを隠す。省略記号を置く 1 列目の箱は、領域の右端にそろう
    const narrow = lay("7あ", options, { height: 10, width: 17.6 });
    expect(narrow.isTruncated).toBe(true);
    expect(shown(narrow)).toBe("…");
    expect(runOf(narrow, "あ").run.visibility).toBe("invisible");
    expect(runOf(narrow, "7").run.frame.x).toBeCloseTo(9.9875);
    expect(lay("7", options, { width: 5 }).isTruncated).toBe(true);
  });

  it("leaves a column alone when a newline or another character already spans its 1em box", () => {
    // 改行で終わる列は、改行の run の矩形が列の箱（幅 1em）になっている
    const newline = lay("7\nあい", options, { width: 20 });
    expect(newline.renderedSize.width).toBe(20);
    expect(runOf(newline, "7").run.frame.x).toBeCloseTo(12.3875);
    expect(runOf(newline, "あ").run.frame.x).toBe(0);
    // 真ん中の列が数字だけでも、端の列は文字の矩形で決まる
    const inner = lay("あ7い", options, { height: 10, width: 30 });
    expect(runOf(inner, "あ").run.frame.x).toBe(20);
    expect(runOf(inner, "7").run.frame.x).toBeCloseTo(12.3875);
    expect(runOf(inner, "い").run.frame.x).toBe(0);
    // 縦中横にしない数字は回転して、矩形が列の幅を持つ
    const rotated = lay("7あ", { ...options, allowsTateChuYoko: false }, { height: 10, width: 20 });
    expect(runOf(rotated, "7").run.frame).toMatchObject({ x: 10, width: 10 });
    expect(runOf(rotated, "あ").run.frame.x).toBe(0);
  });

  it("does not move anything, not even by a rounding error, when the digit shares its column with other characters", () => {
    // 数字と文字が同じ列にあれば、列の端は今までどおり文字の矩形で決まる。列の箱の左端を、中央に寄せた数字の矩形から求め直すと
    // 丸め誤差が出て、renderedSize の幅が 82.35000000000001 から 82.35000000000002 に変わるようなことが起きる（SVG の幅は
    // renderedSize を切り上げて決める）。数字を全角の文字に置き換えたテキストと、ほかの文字の位置と renderedSize が、
    // 1 ビットも違わないことを確かめる
    for (const fontSize of [10, 13.5, 16, 17]) {
      for (const lineHeightScale of [1, 1.2, 1.7]) {
        for (const directionAlign of ["start", "middle", "end"] as const) {
          for (const width of [undefined, 200]) {
            const style = { ...options, fontSize, lineHeightScale, directionAlign };
            const ctx = lay("7月\n晴れ7\nあ7い\n月7", style, { width });
            const reference = lay("字月\n晴れ字\nあ字い\n月字", style, { width });
            expect(ctx.renderedSize.width).toBe(reference.renderedSize.width);
            ctx.runs.forEach((run, i) => {
              if (run.char !== "7") expect(run.frame.x).toBe(reference.runs[i].frame.x);
            });
          }
        }
      }
    }
  });

  it("keeps the overhang of a wider tate-chu-yoko inside the area as before when another edge column holds only a narrow one", () => {
    // 右端の列は 2 桁（10.45px。列の箱の両側に 0.225px はみ出す）、左端の列は 1 桁だけ。列の箱の並びは 30px
    const mixed = { ...options, dividesByWords: true } as const;
    // 幅を決めないとき: 左は「7」の列の箱から、右は「78」のはみ出しまで（数字の矩形で測ると 27.8375px だった）
    const auto = lay("78あ7", mixed, { height: 10 });
    expect(auto.renderedSize.width).toBeCloseTo(30.225);
    expect(runOf(auto, "7", 1).run.frame.x).toBeCloseTo(2.3875);
    expect(runOf(auto, "あ").run.frame.x).toBeCloseTo(10);
    // 幅 30px・右寄せ: 「78」のはみ出しを領域に収めるので、列が 0.225px 左に寄る（「7」の列の箱の空きが左に出るが、数字は収まっている）
    const start = lay("78あ7", mixed, { height: 10, width: 30 });
    expect(start.isTruncated).toBe(false);
    const eight = runOf(start, "8").run;
    expect(eight.frame.x + eight.frame.width).toBeCloseTo(30);
    expect(runOf(start, "あ").run.frame.x).toBeCloseTo(9.775);
    expect(runOf(start, "7", 1).run.frame.x).toBeCloseTo(2.1625);
    // 左寄せ: 「7」の列の箱を領域の左端に合わせる（列の箱の並びがちょうど収まり、「78」が右に 0.225px はみ出す）
    const end = lay("78あ7", { ...mixed, directionAlign: "end" }, { height: 10, width: 30 });
    expect(end.isTruncated).toBe(false);
    expect(runOf(end, "7", 1).run.frame.x).toBeCloseTo(2.3875);
    expect(runOf(end, "あ").run.frame.x).toBeCloseTo(10);
    const last = runOf(end, "8").run;
    expect(last.frame.x + last.frame.width).toBeCloseTo(30.225);
  });
});

describe("columns that hold only upright characters whose frame is not 1em wide", () => {
  // 正立の文字の矩形は、列の左端から横書きの送り幅ぶん。半角カナ（5.5px）、スケールを変えた和文・絵文字、送り幅が 1em でない絵文字
  // （Apple Color Emoji は 24px 未満で 1.1〜1.3em。ここでは絵文字のスケール 1.24 で 12.4px にする）は、矩形が列の 1em の箱と違う。
  // こういう文字だけの列（改行の run も、全角の文字も、回転する欧文も無い列）が右端にあっても、列を寄せる位置と renderedSize は、
  // 矩形ではなく列の 1em の箱（矩形の左端から 1em）で決める。描く位置と矩形は変えない
  const options = { direction: "tbRl" } as const;
  const smallJapanese = { ...options, fonts: { japanese: { family: "", scale: 0.9 } } } as const;
  const largeJapanese = { ...options, fonts: { japanese: { family: "", scale: 1.1 } } } as const;
  const smallEmoji = { ...options, fonts: { emoji: { family: "", scale: 0.8 } } } as const;
  const wideEmoji = { ...options, fonts: { emoji: { family: "", scale: 1.24 } } } as const;

  it("aligns the 1em box of a column of half-width kana, not its advance, with the edge of the area", () => {
    // 幅 20px は 2 列ちょうど。矩形で寄せると、「ｱ」の矩形（5.5px）が領域の右端に付いて、どの列も 4.5px 右にずれた
    // （「ｱ」の列の箱が領域の右に 4.5px 出た）
    const right = lay("ｱあ", options, { height: 10, width: 20 });
    expect(lines(right)).toEqual(["ｱ", "あ"]);
    expect(runOf(right, "ｱ").run.frame).toEqual({ x: 10, y: 0, width: 5.5, height: 10 });
    expect(runOf(right, "あ").run.frame.x).toBe(0);
    // 文字は今までどおり列の左端から描く（矩形も動かさない）
    expect(runOf(right, "ｱ").run.position.x).toBe(10);
    // 1 列ぶんの幅に組むと、列の左端に来る（右端に付いて、x = 4.5 だった）
    expect(runOf(lay("ｱ", options, { width: 10 }), "ｱ").run.frame.x).toBe(0);
    // 中央寄せは、列の箱の並び（20px）を領域の中央に置く（矩形までの 15.5px を中央に置いて、2.25px 右にずれた）
    const middle = lay("ｱあ", { ...options, directionAlign: "middle" }, { height: 10, width: 30 });
    expect(runOf(middle, "あ").run.frame.x).toBe(5);
    expect(runOf(middle, "ｱ").run.frame.x).toBe(15);
    // 行送りを空けても、列は右端から行送りずつ並ぶ（行送り 15px + 1em = 25px）
    const spaced = lay("ｱあ", { ...options, lineHeightScale: 1.5 }, { height: 10, width: 25 });
    expect(runOf(spaced, "ｱ").run.frame.x).toBe(15);
    expect(runOf(spaced, "あ").run.frame.x).toBe(0);
    // どの列も半角カナだけ
    const kana = lay("ﾊﾝｶｸｶﾅ", options, { height: 20, width: 30 });
    expect(lines(kana)).toEqual(["ﾊﾝ", "ｶｸ", "ｶﾅ"]);
    expect(kana.runs.map((run) => run.frame.x)).toEqual([20, 20, 10, 10, 0, 0]);
  });

  it("does the same for Japanese characters and emoji set at a scale other than 1", () => {
    // 和文のスケール 0.9（9px）: 矩形で寄せると 1px 右にずれた
    const japanese = lay("あい", smallJapanese, { height: 10, width: 20 });
    expect(runOf(japanese, "あ").run.frame).toMatchObject({ x: 10, width: 9 });
    expect(runOf(japanese, "い").run.frame.x).toBe(0);
    // 絵文字のスケール 0.8（8px）: 2px 右にずれた
    const emoji = lay("😀あ", smallEmoji, { height: 10, width: 20 });
    expect(runOf(emoji, "😀").run.frame).toMatchObject({ x: 10, width: 8 });
    expect(runOf(emoji, "あ").run.frame.x).toBe(0);
    // 1em より広い文字（12.4px）: 矩形で寄せると、箱の右にはみ出す送り幅（2.4px）のぶん、どの列も左にずれた
    const wide = lay("😀と書く", wideEmoji, { height: 20, width: 30 });
    expect(lines(wide)).toEqual(["😀と", "書く"]);
    expect(runOf(wide, "😀").run.frame).toMatchObject({ x: 20, width: 12.4 });
    expect(runOf(wide, "と").run.frame.x).toBe(20);
    expect(runOf(wide, "書").run.frame.x).toBe(10);
    // 中央寄せも、列の箱の並び（20px）を中央に置く（送り幅のはみ出しを含む 22.4px を中央に置いて、1.2px 左にずれた）
    const middle = lay("😀と書く", { ...wideEmoji, directionAlign: "middle" }, { height: 20, width: 30 });
    expect(runOf(middle, "😀").run.frame.x).toBe(15);
    expect(runOf(middle, "書").run.frame.x).toBe(5);
  });

  it("puts every column where it would be if the characters were full-width, with every directionAlign", () => {
    // 半角カナ・絵文字を全角の文字に置き換えたテキストと、列の位置（矩形の左端）・renderedSize が同じになる。
    // 矩形の左端はもともと列の左端なので、丸め誤差も出ない
    const cases = [
      [options, ["ｱあい", "あいｱ", "ｱあｲ", "あｱい", "ｱ", "ｱｲｳ"]],
      [wideEmoji, ["😀あい", "あい😀", "😀あ😀", "あ😀い", "😀"]],
      [smallEmoji, ["😀あい", "😀あ😀", "😀"]],
    ] as const;
    for (const [style, texts] of cases) {
      for (const directionAlign of ["start", "middle", "end"] as const) {
        for (const width of [undefined, 30, 40, 47.5]) {
          for (const text of texts) {
            const size = { height: 10, width };
            const ctx = lay(text, { ...style, directionAlign }, size);
            const reference = lay(text.replace(/[ｱ-ﾝ]|😀/gu, "字"), { ...style, directionAlign }, size);
            const label = JSON.stringify({ text, directionAlign, width });
            expect(ctx.isTruncated, label).toBe(false);
            expect(ctx.renderedSize.width, label).toBe(reference.renderedSize.width);
            ctx.runs.forEach((run, i) => {
              expect(run.line, label).toBe(reference.runs[i].line);
              expect(run.frame.x, label).toBe(reference.runs[i].frame.x);
            });
          }
        }
      }
    }
    // スケールを変えた和文は、スケール 1 で組んだときと同じ列の位置になる
    for (const style of [smallJapanese, largeJapanese]) {
      for (const directionAlign of ["start", "middle", "end"] as const) {
        for (const width of [undefined, 30, 40, 47.5]) {
          const size = { height: 10, width };
          const ctx = lay("あいう", { ...style, directionAlign }, size);
          const reference = lay("あいう", { ...options, directionAlign }, size);
          expect(ctx.isTruncated).toBe(false);
          expect(ctx.renderedSize.width).toBe(reference.renderedSize.width);
          expect(ctx.runs.map((run) => run.frame.x)).toEqual(reference.runs.map((run) => run.frame.x));
        }
      }
    }
  });

  it("measures renderedSize by the column boxes when the width is not fixed", () => {
    // 矩形で測ると 5.5px（1 列ぶんより 4.5px 狭い）だった
    const alone = lay("ｱ", options);
    expect(alone.renderedSize).toEqual({ width: 10, height: 10 });
    expect(svgSize(alone).width).toBe(10);
    expect(runOf(alone, "ｱ").run.frame.x).toBe(0);
    expect(lay("ｶﾅ", options).renderedSize).toEqual({ width: 10, height: 20 });
    // 右端の列が半角カナだけ（15.5px だった。文字の位置は、どちらも変わらない）
    const first = lay("ｱあ", options, { height: 10 });
    expect(first.renderedSize.width).toBe(20);
    expect(runOf(first, "ｱ").run.frame.x).toBe(10);
    expect(runOf(first, "あ").run.frame.x).toBe(0);
    // スケールを下げた和文（19px だった）
    expect(lay("あい", smallJapanese, { height: 10 }).renderedSize.width).toBe(20);
    // 1em より広い文字は、箱の右にはみ出す送り幅を数えない（22.4px と 12.4px だった）
    const wide = lay("😀あ", wideEmoji, { height: 10 });
    expect(wide.renderedSize.width).toBe(20);
    expect(svgSize(wide).width).toBe(20);
    expect(runOf(wide, "😀").run.frame).toMatchObject({ x: 10, width: 12.4 });
    expect(lay("😀", wideEmoji).renderedSize.width).toBe(10);
    expect(lay("あい", largeJapanese, { height: 10 }).renderedSize.width).toBe(20);
  });

  it("shows every column whose 1em box fits when a character wider than 1em is in the rightmost column", () => {
    // 幅 20px は 2 列ちょうど。矩形で見ると、「😀」の送り幅が箱の右に 2.4px はみ出すぶん 2 列目が収まらず、「😀…」になった
    const emoji = lay("😀と書く", wideEmoji, { height: 20, width: 20 });
    expect(emoji.isTruncated).toBe(false);
    expect(shown(emoji)).toBe("😀と書く");
    // 列の箱を領域に収める。「😀」の矩形は、領域の右に 2.4px 出る（描く位置は列の左端のまま）
    expect(runOf(emoji, "😀").run.frame).toMatchObject({ x: 10, width: 12.4 });
    expect(runOf(emoji, "と").run.frame.x).toBe(10);
    expect(runOf(emoji, "書").run.frame.x).toBe(0);
    // 中央寄せ・左寄せでも同じ
    for (const directionAlign of ["middle", "end"] as const) {
      const ctx = lay("😀と書く", { ...wideEmoji, directionAlign }, { height: 20, width: 20 });
      expect(shown(ctx)).toBe("😀と書く");
      expect(runOf(ctx, "😀").run.frame.x).toBe(10);
      expect(runOf(ctx, "書").run.frame.x).toBe(0);
    }
    // スケールを上げた和文（11px）。どの列も箱の右に 1px はみ出す。「あ…」になった
    const japanese = lay("あい\nうえ", largeJapanese, { width: 20 });
    expect(japanese.isTruncated).toBe(false);
    expect(shown(japanese)).toBe("あい\nうえ");
    expect(runOf(japanese, "あ").run.frame).toMatchObject({ x: 10, width: 11 });
    expect(runOf(japanese, "う").run.frame.x).toBe(0);
    // 1 列ぶんの幅に 1 文字（何も表示されなかった）
    const alone = lay("あ", largeJapanese, { width: 10 });
    expect(shown(alone)).toBe("あ");
    expect(runOf(alone, "あ").run.frame.x).toBe(0);
    // 収めるための縮小もしない（0.89 倍に縮小していた）
    const shrink = { ...wideEmoji, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 };
    expect(lay("😀あ", shrink, { height: 10, width: 20 }).adjustFontScale).toBe(1);
    // 列の箱が収まらない幅（19.9px）では、今までどおりその列から後ろを隠す。省略記号を置く 1 列目の箱は、領域の右端にそろう
    const narrow = lay("😀あ", wideEmoji, { height: 10, width: 19.9 });
    expect(narrow.isTruncated).toBe(true);
    expect(shown(narrow)).toBe("…");
    expect(runOf(narrow, "😀").run.frame.x).toBeCloseTo(9.9);
    // 1em より広い縦中横（10.45px）が左端の列にあっても、どちらの列も箱で見る（「😀…」になった）
    const mixed = lay("😀12", { ...wideEmoji, dividesByWords: true }, { height: 10, width: 20 });
    expect(shown(mixed)).toBe("😀12");
    expect(runOf(mixed, "😀").run.frame.x).toBe(10);
    expect(runOf(mixed, "1").run.frame.x).toBeCloseTo(-0.225);
  });

  it("still shows a column whose characters fit when its 1em box does not, keeping the characters inside the area", () => {
    // 幅 18px は、列の箱の並び（20px）には足りないが、矩形までの並び（15.5px）は収まる。今までどおり 2 列とも表示する。
    // 列の箱を領域の右端に合わせると「あ」の列が左に 2px 出るので、収まるところまで戻す（「ｱ」の列の箱の空きが、右に 2px 出る）
    for (const directionAlign of ["start", "middle", "end"] as const) {
      const ctx = lay("ｱあ", { ...options, directionAlign }, { height: 10, width: 18 });
      expect(ctx.isTruncated).toBe(false);
      expect(shown(ctx)).toBe("ｱあ");
      expect(runOf(ctx, "あ").run.frame.x).toBeCloseTo(0);
      expect(runOf(ctx, "ｱ").run.frame.x).toBeCloseTo(10);
    }
    // 矩形がちょうど収まる幅（15.5px）でも表示する
    expect(shown(lay("ｱあ", options, { height: 10, width: 15.5 }))).toBe("ｱあ");
    // 1 列だけでも、文字が収まる幅（6px）なら表示して、領域の左端に置く
    const alone = lay("ｱ", options, { width: 6 });
    expect(shown(alone)).toBe("ｱ");
    expect(runOf(alone, "ｱ").run.frame.x).toBeCloseTo(0);
    // 収めるための縮小もしない
    const shrink = { ...options, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 };
    expect(lay("ｱあ", shrink, { height: 10, width: 18 }).adjustFontScale).toBe(1);
    // 矩形も収まらない幅（15.4px）では、今までどおりその列から後ろを隠す。省略記号（1em）を置く 1 列目の箱は、領域の右端にそろう
    // （矩形を右端に合わせていたので、省略記号が領域の右に 4.5px 出ていた）
    const narrow = lay("ｱあ", options, { height: 10, width: 15.4 });
    expect(narrow.isTruncated).toBe(true);
    expect(shown(narrow)).toBe("…");
    expect(runOf(narrow, "あ").run.visibility).toBe("invisible");
    expect(runOf(narrow, "ｱ").run.frame.x).toBeCloseTo(5.4);
    expect(lay("ｱ", options, { width: 5 }).isTruncated).toBe(true);
  });

  it("leaves a column alone when a newline, a full-width character or a rotated run already spans its 1em box", () => {
    // 改行で終わる列は、改行の run の矩形が列の箱（幅 1em）になっている
    const newline = lay("ｱ\nあい", options, { width: 20 });
    expect(newline.renderedSize.width).toBe(20);
    expect(runOf(newline, "ｱ").run.frame.x).toBe(10);
    expect(runOf(newline, "あ").run.frame.x).toBe(0);
    // 改行で区切った半角カナ。最後の列は改行の run が無いが、矩形の左端が列の左端なので、左端の列では位置が変わらない
    const list = lay("ｱ\nｲ\nｳ", options);
    expect(list.renderedSize.width).toBe(30);
    expect(runOf(list, "ｱ").run.frame.x).toBe(20);
    expect(runOf(list, "ｳ").run.frame.x).toBe(0);
    // 左端や真ん中の列にあるとき
    const left = lay("あｱ", options, { height: 10, width: 20 });
    expect(runOf(left, "あ").run.frame.x).toBe(10);
    expect(runOf(left, "ｱ").run.frame.x).toBe(0);
    const inner = lay("あｱい", options, { height: 10, width: 30 });
    expect(inner.runs.map((run) => run.frame.x)).toEqual([20, 10, 0]);
    // 1em より広い文字が左端の列にあるとき（矩形は、右の列の箱に 2.4px 重なる）
    const wideLeft = lay("あ😀", wideEmoji, { height: 10, width: 20 });
    expect(wideLeft.isTruncated).toBe(false);
    expect(runOf(wideLeft, "あ").run.frame.x).toBe(10);
    expect(runOf(wideLeft, "😀").run.frame).toMatchObject({ x: 0, width: 12.4 });
    expect(lay("あ😀", wideEmoji, { height: 10 }).renderedSize.width).toBe(20);
    // 回転する欧文と同じ列
    const rotated = lay("aｱ", options, { width: 10 });
    expect(rotated.runs.map((run) => run.frame.x)).toEqual([0, 0]);
    expect(rotated.renderedSize.width).toBe(10);
  });

  it("does not move anything, not even by a rounding error, when the characters share their column with full-width ones", () => {
    // 半角カナや絵文字が全角の文字と同じ列にあれば、列の端は今までどおり全角の文字の矩形で決まる。全角の文字に置き換えたテキストと、
    // どの文字の位置も renderedSize も、1 ビットも違わないことを確かめる
    for (const style of [options, wideEmoji, smallEmoji]) {
      for (const fontSize of [10, 13.5, 16, 17]) {
        for (const lineHeightScale of [1, 1.2, 1.7]) {
          for (const directionAlign of ["start", "middle", "end"] as const) {
            for (const width of [undefined, 200]) {
              const settings = { ...style, fontSize, lineHeightScale, directionAlign };
              const ctx = lay("ｱ月\n晴れ😀\nあｱい\n月😀", settings, { width });
              const reference = lay("字月\n晴れ字\nあ字い\n月字", settings, { width });
              expect(ctx.renderedSize.width).toBe(reference.renderedSize.width);
              expect(ctx.runs.map((run) => run.frame.x)).toEqual(reference.runs.map((run) => run.frame.x));
            }
          }
        }
      }
    }
  });
});
