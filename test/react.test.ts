import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { svgString, type StoneContext, type StoneSpan } from "../src/index.js";
import { StoneSVG, StoneText } from "../src/react/index.js";
import { lay } from "./helpers.js";

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'" };

/** 属性値・テキストの実体参照を戻し、数値は小数 2 桁にそろえる（svgString は丸め、React はそのまま出力する）。 */
function value(raw: string): string {
  const decoded = raw.replace(/&(?:amp|lt|gt|quot|#x27);/g, (e) => ENTITIES[e]);
  return /^-?\d+(\.\d+)?$/.test(decoded) ? String(Math.round(Number(decoded) * 100) / 100) : decoded;
}

/** <svg> の中身を、タグ・属性（名前順）・テキストの列にする。 */
function contents(markup: string): string[] {
  const inner = markup.slice(markup.indexOf(">") + 1, markup.lastIndexOf("</svg>"));
  const out: string[] = [];
  for (const [, close, name, attrs, selfClose, text] of inner.matchAll(/<(\/?)([\w:]+)([^>]*?)(\/?)>([^<]*)/g)) {
    if (close) {
      out.push(`</${name}>`);
    } else {
      const list = Array.from(attrs.matchAll(/([\w:-]+)="([^"]*)"/g), ([, k, v]) => `${k}=${value(v)}`).sort();
      out.push(`<${name} ${list.join(" ")}>`);
      if (selfClose) out.push(`</${name}>`);
    }
    if (text) out.push(value(text));
  }
  return out;
}

/** 2 つの描画方法で同じ SVG になることを確かめる。 */
function expectSameSvg(ctx: StoneContext, showFrames = false, spans?: StoneSpan[]): void {
  const fromString = svgString(ctx, { showFrames, spans });
  const fromReact = renderToStaticMarkup(createElement(StoneSVG, { layout: ctx, showFrames, spans }));
  for (const attr of ["width", "height", "viewBox"]) {
    expect(fromReact.match(new RegExp(` ${attr}="([^"]*)"`))?.[1]).toBe(fromString.match(new RegExp(` ${attr}="([^"]*)"`))?.[1]);
  }
  expect(contents(fromReact)).toEqual(contents(fromString));
}

describe("StoneSVG", () => {
  it("renders the same SVG as svgString", () => {
    expectSameSvg(lay("日本語 Hello  world\n\n「二行目」です。 & <tag> \"quote\"", {}, { width: 80 }));
  });

  it("renders vertical text the same way, including rotation and vert features", () => {
    expectSameSvg(lay("令和6年12月31日、Ver.2.0を公開。123", { direction: "tbRl", dividesByWords: true }, { height: 60 }));
  });

  it("renders truncation and debug frames the same way", () => {
    expectSameSvg(lay("あいうえおかきくけこ", {}, { width: 55, height: 10 }), true);
  });

  it("renders the ellipsis that replaces latin and tate-chu-yoko runs the same way", () => {
    expectSameSvg(lay("abcdefghijklmnopq", {}, { width: 40, height: 10 }));
    // 回転する欧文の run と縦中横の省略記号は、和文フォントの正立の「︙」を列の位置に描く
    expectSameSvg(lay("あいうえabcかきく", { direction: "tbRl" }, { width: 10, height: 56 }), true);
    expectSameSvg(lay("あいうえ1かき", { direction: "tbRl" }, { width: 10, height: 55 }));
  });

  it("renders the full-width vertical glyphs of quotation marks the same way", () => {
    expectSameSvg(lay("彼は“はい”と“OK”と言った", { direction: "tbRl" }, { height: 60 }));
  });

  it("renders links, colored spans and lines the same way", () => {
    const spans: StoneSpan[] = [
      { start: 2, end: 9, href: "/docs?a=1&b=2", target: "_blank", rel: "noopener", underline: true },
      { start: 4, end: 6, color: "#c00", className: "hot", lineThrough: true, decorationColor: "blue" },
      { start: 12, end: 14, href: "javascript:alert(1)" },
    ];
    expectSameSvg(lay("詳細はリンク先\nを見て、ここも", {}, { width: 60 }), false, spans);
    expectSameSvg(lay("詳細はリンク先\nを見て、ここも", { direction: "tbRl" }, { height: 60 }), false, spans);
  });
});

describe("StoneText", () => {
  it("renders element children as they are until the layout is ready", () => {
    const html = renderToStaticMarkup(
      createElement(StoneText, null, "詳しくは", createElement("a", { href: "/docs" }, "こちら"), "へ"),
    );
    expect(html).toContain('<p class="stone-text__fallback"');
    expect(html).toContain('詳しくは<a href="/docs">こちら</a>へ</p>');
  });

  it("still takes plain strings, numbers and fragments as the text", () => {
    const html = renderToStaticMarkup(createElement(StoneText, null, "全", 3, createElement(Fragment, null, "件")));
    expect(html).toContain(">全3件</p>");
  });
});
