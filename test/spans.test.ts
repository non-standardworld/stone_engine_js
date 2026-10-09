import { describe, expect, it } from "vitest";
import { decorationRects, glyphParagraphs, isSafeHref, spanRects, spanStacks, svgString, type StoneSpan } from "../src/index.js";
import { lay, runOf } from "./helpers.js";

describe("spanStacks", () => {
  it("lists the spans of each character from the outside in", () => {
    const ctx = lay("あいうえお");
    const spans: StoneSpan[] = [
      { start: 1, end: 3, color: "red" }, // 「いう」（内側、後から渡しても外側の後ろに並ぶ）
      { start: 0, end: 4, href: "/a" }, // 「あいうえ」
    ];
    expect(spanStacks(ctx, spans)).toEqual([[1], [1, 0], [1, 0], [1], []]);
  });

  it("finds characters by their offset in the source text, including surrogate pairs", () => {
    const ctx = lay("𠮷野家です");
    expect(spanStacks(ctx, [{ start: 2, end: 4, color: "red" }])).toEqual([[], [0], [0], [], []]);
  });
});

describe("SVG with spans", () => {
  const text = "詳しくはこちらをご覧ください。";
  const link: StoneSpan = { start: 4, end: 7, href: "https://example.com/?a=1&b=2", target: "_blank", rel: "noopener" };

  it("wraps the characters of a link in <a> inside the paragraph's <text>", () => {
    const svg = svgString(lay(text), { spans: [link] });
    expect((svg.match(/<text /g) ?? []).length).toBe(1);
    expect(svg).toMatch(
      /<a href="https:\/\/example.com\/\?a=1&amp;b=2" data-span="0" target="_blank" rel="noopener"><tspan [^>]*>(<tspan [^>]*data-run="(4|5|6)">[こちら]<\/tspan>){3}<\/tspan><\/a>/,
    );
    // リンクの外の文字は <a> の外
    expect(svg).toMatch(/data-run="3">は<\/tspan><\/tspan><a /);
  });

  it("nests a colored span inside a link, and splits a link at the end of a paragraph", () => {
    const ctx = lay("あいう\nえお");
    const spans: StoneSpan[] = [
      { start: 1, end: 6, href: "/x" }, // 「いう\nえ」
      { start: 2, end: 3, color: "#c00", className: "hot" }, // 「う」
    ];
    const svg = svgString(ctx, { spans });
    expect(svg.match(/<a href="\/x"/g)).toHaveLength(2);
    expect(svg).toContain('<tspan data-span="1" class="hot" fill="#c00"><tspan ');
    const groups = glyphParagraphs(ctx, { spans })[0].groups;
    expect(groups.map((g) => [g.glyphs.map((el) => el.text).join(""), g.spans])).toEqual([
      ["あ", []],
      ["い", [0]],
      ["う", [0, 1]],
    ]);
  });

  it("does not make links of javascript: URLs", () => {
    const svg = svgString(lay(text), { spans: [{ start: 4, end: 7, href: " JavaScript:alert(1)" }] });
    expect(svg).not.toContain("<a ");
    expect(svg).not.toContain("alert");
    expect(isSafeHref("java\nscript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,x")).toBe(false);
    expect(isSafeHref("/path?q=javascript:")).toBe(true);
    expect(isSafeHref("mailto:hello@example.com")).toBe(true);
  });
});

describe("decorationRects", () => {
  it("underlines horizontal text at the bottom of the em box, per line and without the edge spaces", () => {
    // fontSize 10、和文のアセント 8.8。下線は太さ 1（最小値）で、仮想ボディの下端の内側
    const ctx = lay("あい うえおかきくけこ", {}, { width: 55 });
    const rects = decorationRects(ctx, [{ start: 1, end: 9, underline: true }]);
    expect(ctx.lineCount).toBe(2);
    expect(rects).toHaveLength(2);
    const i = runOf(ctx, "い").run;
    const o = runOf(ctx, "お").run;
    expect(rects[0]).toMatchObject({ kind: "underline", color: null, x: i.frame.x, width: o.frame.x + o.frame.width - i.frame.x });
    expect(rects[0].y).toBeCloseTo(i.position.y - 8.8 + 10 - 1, 5);
    expect(rects[0].height).toBe(1);
    const ka = runOf(ctx, "か").run;
    expect(rects[1].x).toBe(ka.frame.x);
    expect(rects[1].y).toBeCloseTo(ka.position.y - 8.8 + 9, 5);
  });

  it("draws the underline of vertical text on the right of the column, and the line-through in the middle", () => {
    const ctx = lay("あいうえ", { direction: "tbRl" });
    const [under, through] = decorationRects(ctx, [
      { start: 1, end: 3, underline: true, decorationColor: "blue" },
      { start: 1, end: 3, lineThrough: true, color: "red" },
    ]);
    const i = runOf(ctx, "い").run;
    const u = runOf(ctx, "う").run;
    expect(under).toMatchObject({ kind: "underline", color: "blue", x: i.frame.x + 9, y: i.frame.y, width: 1 });
    expect(under.height).toBeCloseTo(u.frame.y + u.frame.height - i.frame.y, 5);
    expect(through).toMatchObject({ kind: "lineThrough", color: "red", x: i.frame.x + 4.5 });
  });

  it("draws the lines and the focus rects in SVG", () => {
    const ctx = lay("あいうえ");
    const spans: StoneSpan[] = [{ start: 1, end: 3, href: "/x", underline: true }];
    expect(svgString(ctx, { spans })).toMatch(/<g class="stone-decorations"><rect [^>]*data-span="0"\/><\/g><\/svg>$/);
    expect(spanRects(ctx, spans, 0)).toEqual([{ x: 10, y: 0, width: 20, height: 10 }]);
  });
});
