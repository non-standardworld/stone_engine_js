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

  it("gives newline runs the previous run's font", () => {
    const { runs } = parseText("あ\nA\n", false);
    expect(runs[1].fontId).toBe(1);
    expect(runs[3].fontId).toBe(0);
  });
});
