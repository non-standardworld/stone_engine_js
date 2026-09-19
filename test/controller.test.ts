import { describe, expect, it } from "vitest";
import { resolveLayoutSize, svgString, isSafeSvgAttributeName, layoutText, FixedMeasurer } from "../src/index.js";

describe("resolveLayoutSize", () => {
  it("defaults horizontal text to the container width and vertical text to auto width", () => {
    expect(resolveLayoutSize("lrTb", undefined, undefined, { width: 320, height: 0 })).toEqual({
      width: 320,
      height: undefined,
    });
    expect(resolveLayoutSize("tbRl", undefined, undefined, { width: 320, height: 0 })).toEqual({
      width: undefined,
      height: undefined,
    });
  });

  it("waits for the container when a container dimension is requested", () => {
    expect(resolveLayoutSize("lrTb", "container", "auto", null)).toBeNull();
    expect(resolveLayoutSize("tbRl", "auto", "container", null)).toBeNull();
    expect(resolveLayoutSize("tbRl", "auto", 400, null)).toEqual({ width: undefined, height: 400 });
  });

  it("treats zero, negative and non-finite sizes as unlimited", () => {
    expect(resolveLayoutSize("lrTb", 0, -1, null)).toEqual({ width: undefined, height: undefined });
    expect(resolveLayoutSize("lrTb", "container", "container", { width: 0, height: 0 })).toEqual({
      width: undefined,
      height: undefined,
    });
  });
});

describe("svgString attributes", () => {
  it("rejects unsafe attribute names", () => {
    expect(isSafeSvgAttributeName("data-x")).toBe(true);
    expect(isSafeSvgAttributeName("onload")).toBe(false);
    expect(isSafeSvgAttributeName('a="b" onload')).toBe(false);
    const ctx = layoutText("あ", { fontSize: 10 }, new FixedMeasurer());
    const svg = svgString(ctx, { attributes: { "data-ok": "1", onload: "alert(1)", 'x y="': "z" } });
    expect(svg).toContain('data-ok="1"');
    expect(svg).not.toContain("onload");
    expect(svg).not.toContain("x y=");
  });
});
