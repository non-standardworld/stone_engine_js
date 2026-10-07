import { describe, expect, it } from "vitest";
import { parseText, splitGraphemes, fontIdForChar, punctuationOf, isNewlineChar } from "../src/index.js";

describe("parser", () => {
  it("splits Japanese text into words with Intl.Segmenter", () => {
    const { runs, tokens } = parseText("日本語の組版", true);
    expect(runs.map((r) => r.char).join("")).toBe("日本語の組版");
    expect(tokens.length).toBe(3);
    expect(tokens.map((t) => runs.slice(t.start, t.end).map((r) => r.char).join(""))).toEqual(["日本語", "の", "組版"]);
    expect(runs[1].tokenRunIndex).toBe(1);
  });

  it("splits into graphemes when dividesByWords is false", () => {
    const { runs, tokens } = parseText("日本語の組版", false);
    expect(tokens.length).toBe(6);
    expect(runs.every((r, i) => r.tokenId === i && r.tokenRunIndex === 0)).toBe(true);
  });

  it("keeps grapheme clusters together", () => {
    expect(splitGraphemes("👨‍👩‍👧‍👦ｶﾞ\r\n国")).toEqual(["👨‍👩‍👧‍👦", "ｶﾞ", "\r\n", "国"]);
    const { runs } = parseText("a\r\nb", true);
    expect(runs.map((r) => r.isNewline)).toEqual([false, true, false]);
  });

  it("classifies scripts, punctuation and numbers", () => {
    expect(fontIdForChar("A")).toBe(0);
    expect(fontIdForChar("あ")).toBe(1);
    expect(fontIdForChar("漢")).toBe(1);
    expect(fontIdForChar("😀")).toBe(2);
    expect(fontIdForChar("é")).toBe(0); // 未分類は latin 扱い
    expect(punctuationOf("。")).toBe("firstHalf");
    expect(punctuationOf("「")).toBe("secondHalf");
    expect(punctuationOf("・")).toBe("quarter");
    expect(punctuationOf("あ")).toBe("whole");
    expect(isNewlineChar("\n")).toBe(true);
    expect(isNewlineChar(String.fromCharCode(0x2028))).toBe(true);
    const { runs } = parseText("12年", true);
    expect(runs[0].isNumber).toBe(true);
    expect(runs[2].isNumber).toBe(false);
  });

  it("treats dashes and leaders as Japanese, but not the rest of general punctuation", async () => {
    const { scriptOfChar, isFullWidthCodePoint } = await import("../src/index.js");
    // 「—」「―」「‥」「…」は一般句読点のブロックにあるが、和文フォントで組む（縦書きで回転させない）
    for (const char of ["—", "―", "‥", "…"]) {
      expect(scriptOfChar(char)).toBe("japanese");
      expect(fontIdForChar(char)).toBe(1);
      expect(isFullWidthCodePoint(char.codePointAt(0)!)).toBe(true);
    }
    // 欧文の単語の後ろでも和文
    expect(parseText("Hello…", true).runs.map((r) => r.fontId)).toEqual([0, 0, 0, 0, 0, 1]);
    // 引用符・ハイフン・ダッシュ（二分）・ビュレットは今までどおり欧文
    for (const char of ["“", "‐", "–", "•"]) {
      expect(scriptOfChar(char)).toBeNull();
      expect(fontIdForChar(char)).toBe(0);
    }
  });

  it("treats general punctuation that stays upright in vertical text as Japanese", async () => {
    const { scriptOfChar, isFullWidthCodePoint } = await import("../src/index.js");
    // UTR #50 で正立（U）の一般句読点のうち JIS X 0213 にある文字。和文フォントで組む（縦書きで回転させない）
    for (const char of Array.from("‖†‡‰※‼⁂⁇⁈⁉⁑")) {
      expect(scriptOfChar(char)).toBe("japanese");
      expect(fontIdForChar(char)).toBe(1);
      expect(isFullWidthCodePoint(char.codePointAt(0)!)).toBe(true);
    }
    // 欧文の単語や数字の後ろでも和文
    expect(parseText("Wow‼", true).runs.map((r) => r.fontId)).toEqual([0, 0, 0, 1]);
    expect(parseText("5‰", true).runs.map((r) => r.fontId)).toEqual([0, 1]);
    // 和文フォントにない「‱」と、UTR #50 で回転（R）のプライム「′」「″」は今までどおり欧文
    for (const char of ["‱", "′", "″"]) {
      expect(scriptOfChar(char)).toBeNull();
      expect(fontIdForChar(char)).toBe(0);
    }
  });

  it("gives newline runs the previous run's font", () => {
    const { runs } = parseText("あ\nA\n", false);
    expect(runs[1].fontId).toBe(1);
    expect(runs[3].fontId).toBe(0);
  });
});

describe("unicode blocks", () => {
  it("classifies supplementary-plane CJK and enclosed symbols", async () => {
    const { scriptOfChar, unicodeCategoryOf, isFullWidthCodePoint } = await import("../src/index.js");
    expect(unicodeCategoryOf(0x20000)).toBe("cjkUnifiedIdeographsExtensionB");
    expect(scriptOfChar("𠀀")).toBe("japanese"); // U+20000
    expect(fontIdForChar("𠀀")).toBe(1);
    expect(isFullWidthCodePoint(0x20000)).toBe(true);
    expect(unicodeCategoryOf(0x1f1e6)).toBe("enclosedAlphanumericSupplement"); // regional indicator
    expect(scriptOfChar("🈚")).toBe("emoji"); // U+1F21A
    expect(scriptOfChar("🇯")).toBe("emoji");
    expect(unicodeCategoryOf(0x2fa1f)).toBe("cjkCompatibilityIdeographsSupplement");
    expect(unicodeCategoryOf(0x2ee5f)).toBe("cjkUnifiedIdeographsExtensionI");
    expect(unicodeCategoryOf(0x2ee60)).toBeNull();
  });

  it("clamps ranges passed to hit-testing helpers", async () => {
    const { layoutText, FixedMeasurer } = await import("../src/index.js");
    const ctx = layoutText("あい", { fontSize: 10, dividesByWords: false }, new FixedMeasurer());
    expect(ctx.hitRunIndex({ x: 15, y: 5 }, [0, 99])).toBe(1);
    expect(ctx.closestRunIndex({ x: 18, y: 5 }, [0, 99])).toBe(2);
    expect(ctx.closestRunIndex({ x: 3, y: 5 }, [-5, 99])).toBe(0);
  });

  it("uses adjusted metrics for first-run frames after shrinking", async () => {
    const { layoutText, FixedMeasurer } = await import("../src/index.js");
    const ctx = layoutText(
      "あいうえおかきくけこ",
      { fontSize: 20, dividesByWords: false, adjustsFontSizeToFitWidth: true, minimumScaleFactor: 0.5 },
      new FixedMeasurer(),
      { width: 100, height: 20 },
    );
    expect(ctx.adjustFontScale).toBeLessThan(1);
    expect(ctx.firstRunFrame(0).height).toBeCloseTo(ctx.adjustFontSize);
    expect(ctx.firstRunFrame(1).y).toBeCloseTo(ctx.adjustLineHeight);
  });
});
