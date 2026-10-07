import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { svgString, type StoneContext } from "../src/index.js";
import { StoneSVG } from "../src/react/index.js";
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
function expectSameSvg(ctx: StoneContext, showFrames = false): void {
  const fromString = svgString(ctx, { showFrames });
  const fromReact = renderToStaticMarkup(createElement(StoneSVG, { layout: ctx, showFrames }));
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
});
