/*
promo.js — プロモーション動画のタイムライン。

日本語の作例はすべて、このパッケージの layoutText() で組み、glyphElements() が返す 1 文字ごとの位置を SVG に描いている。
各シーンの長さは、読ませる文の文字数から決める（1 秒に 4 文字。「読む時間」の節）。
動きは時刻 t（秒）だけで決まる（seek(t) が全シーンの状態を作り直す）ので、render.cjs が 1 フレームずつ seek して
スクリーンショットを撮れば、何度書き出しても同じ動画になる。ブラウザで開いたときは、そのまま再生する（スペースで一時停止、
←→ で 1 フレーム、Shift+←→ で 1 秒）。
*/

import {
  fontFeatureSettingsOf,
  getSharedCanvasMeasurer,
  glyphElements,
  isNotStartingChar,
  layoutText,
} from "../dist/index.js";

const NS = "http://www.w3.org/2000/svg";
const FPS = 30;

const C = {
  ink: "#1f1d1a",
  line: "#ddd7cc",
  accent: "#b8452f",
  accentSoft: "#f3dcd5",
};

/* ---------- 文言 ---------- */

const COPY = {
  hook: "印刷物基準の\n文字組みを\nウェブの\n世界で。",
  sub: "ブラウザのための日本語組版エンジン",
  vertical:
    "印刷物基準の文字組みを、ウェブの世界で。\n縦書き、縦中横、約物、禁則。\nstone-engine.jsは、それらをWebフォントのまま、ブラウザの上で組み直す。",
  lineage: "日本デザインセンター様から生まれた\niOS用文字組みエンジンを継承。",
  lineageFrom: "iOS / Swift",
  lineageTo: "Web / TypeScript",
  lineageShot: "stone ｜ 日本デザインセンター様",
  credit: "日本デザインセンター様の stone_engine を継承",
  kinsoku: "行頭に句読点を置かない。毎朝のおいしいコーヒーも、「ちょっと待って」も、行頭に来ない。",
  punct: "「約物」の連続（『』）は、\n前後を見て、「自然」に詰める。",
  tcy: "2026年11月12日、\n午前10時30分、\nRoom 205に集合。",
  inspect: "レイアウトの結果は、\n1文字ずつ取り出せる。",
  tipComment: "点の下の文字を引く",
  usageTitle: "コンポーネントを置くだけ。",
  novel: "吾輩は猫である。\n名前はまだ無い。\nどこで生れたかとんと見当がつかぬ。",
};

const FEATURES = [
  {
    no: "01",
    title: "縦書き",
    en: "VERTICAL WRITING",
    desc: "高さを変えれば、\nその場で組み直す。",
    chip: ['<i>direction</i>=<b>"tbRl"</b>'],
  },
  {
    no: "02",
    title: "禁則処理",
    en: "KINSOKU",
    desc: "句読点や「ー」を、\n行頭に置かない。",
    chip: ["<i>kinsoku</i>=<b>{false}</b>", "<i>kinsoku</i>=<b>{true}</b>"],
  },
  {
    no: "03",
    title: "約物の詰め",
    en: "PUNCTUATION SPACING",
    desc: "括弧や句読点の連続を、\n前後を見て詰める。",
    chip: ['<i>punctuationMode</i>=<b>"whole"</b>', '<i>punctuationMode</i>=<b>"stone"</b>'],
  },
  {
    no: "04",
    title: "縦中横",
    en: "TATE-CHU-YOKO",
    desc: "2桁までの数字は、\n回さず正体で組む。",
    chip: ["<i>allowsTateChuYoko</i>=<b>{false}</b>", "<i>allowsTateChuYoko</i>=<b>{true}</b>"],
  },
  {
    no: "05",
    title: "1文字ずつ",
    en: "PER-GLYPH LAYOUT",
    desc: "位置と矩形を、\nそのまま取り出せる。",
    chip: ["<i>onLayout</i>=<b>{(ctx) =&gt; …}</b>"],
  },
];

const TAGS = ["React", "SSR", "TypeScript", "MIT License"];

const CODE = [
  ["i", "import"],
  ["", " { StoneText } "],
  ["i", "from"],
  ["", "\n  "],
  ["b", '"@non-standardworld/stone-engine.js/react"'],
  ["", ";\n\n"],
  ["u", "<"],
  ["i", "StoneText"],
  ["", " direction="],
  ["b", '"tbRl"'],
  ["", " height="],
  ["b", "{480}"],
  ["u", ">"],
  ["", "\n  {text}\n"],
  ["u", "</"],
  ["i", "StoneText"],
  ["u", ">"],
];

/* ---------- フォント ---------- */

const MINCHO = '"Shippori Mincho", serif';
const GARAMOND = '"EB Garamond", serif';
const GOTHIC = '"Zen Kaku Gothic New", sans-serif';

const F = {
  mincho: {
    japanese: { family: MINCHO, weight: 500 },
    latin: { family: GARAMOND, weight: 400, scale: 1.06 },
  },
  minchoBold: {
    japanese: { family: MINCHO, weight: 700 },
    latin: { family: GARAMOND, weight: 700, scale: 1.06 },
  },
  gothic: {
    japanese: { family: GOTHIC, weight: 500 },
    latin: { family: GOTHIC, weight: 500, scale: 1 },
  },
};

const FONT_SPECS = [
  '500 40px "Shippori Mincho"',
  '700 40px "Shippori Mincho"',
  '500 40px "Zen Kaku Gothic New"',
  '700 40px "Zen Kaku Gothic New"',
  '400 40px "EB Garamond"',
  '500 40px "EB Garamond"',
  '700 40px "EB Garamond"',
  '400 40px "JetBrains Mono"',
  '500 40px "JetBrains Mono"',
  '700 40px "JetBrains Mono"',
];

/** 使う文字をすべて読み込む（Google Fonts の和文は unicode-range で分割されているので、文字を渡して読み込ませる）。 */
async function loadFonts() {
  let ascii = "";
  for (let c = 0x20; c < 0x7f; c++) ascii += String.fromCharCode(c);
  const text =
    Object.values(COPY).join("") + FEATURES.map((f) => f.title + f.desc).join("") + TAGS.join("") + "行頭…→" + ascii;
  // 一致するフォントが定義されていないとき（Google Fonts の CSS を取れなかったときなど）、load() は空の配列を返し、check() は true を返す。
  // 読み込めた書体が 1 つも無い指定は、読み込めなかったものとして扱う（render.cjs が、代替フォントのまま書き出さずに止める）
  const loaded = await Promise.all(FONT_SPECS.map((spec) => document.fonts.load(spec, text)));
  await document.fonts.ready;
  window.__fonts = FONT_SPECS.map((spec, i) => [spec, loaded[i].length > 0 && document.fonts.check(spec, text)]);
}

/* ---------- 小さな道具 ---------- */

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
/** t が a から b へ進む間に 0 → 1。 */
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  out: (p) => 1 - Math.pow(1 - p, 3),
  in: (p) => p * p * p,
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  outBack: (p) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2),
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, p) => {
  const A = rgb(a);
  const B = rgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp(p)))).join(",")})`;
};

function $(tag, props = {}, parent) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style") Object.assign(el.style, v);
    else el.setAttribute(k, v);
  }
  if (parent) parent.appendChild(el);
  return el;
}

function S(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

/* ---------- エンジンで組んで描く ---------- */

let measurer = null;

/** テキストを組む。glyphs は描く文字（位置・向き・フォント）、byRun は run の番号から引く表。 */
function lay(text, options, size = {}) {
  const ctx = layoutText(text, options, measurer, size);
  const glyphs = glyphElements(ctx);
  return {
    ctx,
    glyphs,
    byRun: new Map(glyphs.map((g) => [g.runId, g])),
    w: ctx.renderedSize.width,
    h: ctx.renderedSize.height,
  };
}

/** 組んだ結果を 1 文字ずつ <text> にして持つ SVG。draw() に渡す関数で、文字ごとの位置・向き・色・濃さを上書きできる。 */
class Stone {
  constructor(parent) {
    this.svg = S("svg", { class: "st" }, parent);
    this.back = S("g", {}, this.svg);
    this.front = S("g", {}, this.svg);
    this.over = S("g", {}, this.svg);
    this.L = null;
    this.nodes = [];
  }

  place(x, y) {
    this.svg.style.left = `${x}px`;
    this.svg.style.top = `${y}px`;
    return this;
  }

  setLayout(L) {
    if (this.L === L) return this;
    this.L = L;
    this.svg.setAttribute("width", Math.max(1, Math.ceil(L.w)));
    this.svg.setAttribute("height", Math.max(1, Math.ceil(L.h)));
    this.front.replaceChildren();
    this.nodes = L.glyphs.map((g) => {
      const node = S(
        "text",
        {
          "font-family": g.fontFamily,
          "font-size": g.fontSize,
          "font-weight": g.fontWeight,
          "font-style": g.fontStyle,
        },
        this.front,
      );
      const features = fontFeatureSettingsOf(g);
      if (features) node.style.fontFeatureSettings = features;
      node.textContent = g.text;
      return node;
    });
    return this;
  }

  draw(fn) {
    const glyphs = this.L.glyphs;
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const node = this.nodes[i];
      const s = (fn && fn(g, i)) || {};
      const rotate = s.rotate ?? g.rotate;
      node.setAttribute("x", (s.x ?? g.x).toFixed(2));
      node.setAttribute("y", (s.y ?? g.y).toFixed(2));
      if (Math.abs(rotate) > 0.01) node.setAttribute("rotate", rotate.toFixed(2));
      else node.removeAttribute("rotate");
      node.setAttribute("opacity", clamp(s.opacity ?? 1).toFixed(3));
      node.setAttribute("fill", s.fill ?? C.ink);
    }
    return this;
  }
}

/**
 * 同じテキストの 2 つの組み（a → b）の間の、1 文字の位置。同じ行の中では動かし、行が変わる文字は、
 * 行末の外へ消えて次の行頭の外から入る（斜めに飛ばさない）。
 */
function morph(a, b, p, slide = 44) {
  if (a.line === b.line) return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), opacity: 1 };
  if (p < 0.5) {
    const q = E.in(p * 2);
    return { x: a.x + slide * q, y: a.y, opacity: 1 - q };
  }
  const q = E.out((p - 0.5) * 2);
  return { x: b.x - slide * (1 - q), y: b.y, opacity: q };
}

/* ---------- 読む時間 ---------- */

/*
尺は「1 秒に 4 文字読める」として決める（字幕の目安と同じ）。数えるのは、読ませるための日本語の文（見出し・説明・クレジット）。
全角は 1 文字、文の中の半角の英数字は 0.5 文字。組版の作例（組んで見せるための文章）、コード、英語のラベル、パッケージ名・コマンド・
URL は数えず、見るための時間を別に取る（LOOK / HOLD と、各シーンの glance）。
各シーンは、説明を読み終える時刻（LEAD + 読む時間）のあとで作例を動かし、動かしたあとに HOLD だけ止める。
*/

/** 1 秒に読める文字数。 */
const CPS = 4;
/** シーンが出てから、文字が読める濃さになるまでの時間。 */
const LEAD = 0.6;
/** シーンの終わりの、消えていく時間（読む時間に数えない）。 */
const TAIL = 0.3;
/** 作例が変わる前に、作例を見る時間。 */
const LOOK = 1.2;
/** 作例が変わったあと、結果を見る時間。 */
const HOLD = 2.2;

/** 読む文字数。全角は 1 文字、半角は 0.5 文字、空白と改行は数えない。 */
function readChars(...texts) {
  let count = 0;
  for (const text of texts) {
    for (const ch of text) {
      if (/\s/.test(ch)) continue;
      count += ch.codePointAt(0) < 0x80 ? 0.5 : 1;
    }
  }
  return count;
}

const readTime = (...texts) => readChars(...texts) / CPS;
/** シーンの長さを 0.1 秒単位に切り上げる。 */
const roundUp = (seconds) => Math.ceil(seconds * 10 - 1e-6) / 10;

/* ---------- 左の説明 ---------- */

/** 機能のシーンの左の説明。返す関数の read は、見出しと説明を読むのにかかる秒数。 */
function panel(root, f) {
  const el = $("div", { class: "panel" }, root);
  const no = $("div", { class: "panel__no", text: f.no }, el);
  const rule = $("div", { class: "panel__rule" }, el);
  const title = new Stone(el).setLayout(lay(f.title, { fontSize: 96, fonts: F.minchoBold })).place(0, 54);
  const en = $("div", { class: "panel__en", text: f.en }, el);
  const desc = new Stone(el)
    .setLayout(lay(f.desc, { fontSize: 40, lineHeightScale: 1.75, fonts: F.gothic }, { width: 620 }))
    .place(0, 262);
  desc.draw();
  const chip = $("div", { class: "chip" }, el);
  const a = $("span", { html: f.chip[0] }, chip);
  const b = f.chip[1] ? $("span", { html: f.chip[1] }, chip) : null;

  const update = (t, swap = 0) => {
    no.style.opacity = E.out(seg(t, 0.05, 0.4));
    rule.style.transform = `scaleX(${E.out(seg(t, 0.1, 0.7))})`;
    title.draw((g, i) => {
      const t0 = 0.12 + i * 0.05;
      const p = E.out(seg(t, t0, t0 + 0.45));
      return { opacity: p, y: g.y + 26 * (1 - p) };
    });
    en.style.opacity = E.out(seg(t, 0.35, 0.8));
    const d = E.out(seg(t, 0.45, 0.95));
    desc.svg.style.opacity = d;
    desc.svg.style.transform = `translateY(${18 * (1 - d)}px)`;
    const c = E.out(seg(t, 0.6, 1.05));
    chip.style.opacity = c;
    chip.style.transform = `translateY(${18 * (1 - c)}px)`;
    a.style.opacity = 1 - swap;
    a.style.transform = `translateY(${-22 * swap}px)`;
    if (b) {
      b.style.opacity = swap;
      b.style.transform = `translateY(${22 * (1 - swap)}px)`;
    }
  };
  update.read = readTime(f.title, f.desc);
  update.counted = [["見出しと説明", readChars(f.title, f.desc)]];
  return update;
}

/* ---------- シーン ---------- */

/*
シーンを作る関数は { update, duration, counted } を返す。update(t) はシーンの中の時刻 t（秒）の状態を作る。duration はシーンの長さ、
counted は読む文字数の内訳（書き出しのときに表にして出す）。
*/

/** フック。原稿用紙のますに、見出しを読む速さで 1 文字ずつ置く。 */
function hook(root) {
  const L = lay(
    COPY.hook,
    { direction: "tbRl", fontSize: 128, lineHeightScale: 1.5, punctuationMode: "whole", fonts: F.minchoBold },
    { height: 900 },
  );
  const st = new Stone(root).setLayout(L).place(1750 - L.w, 156);
  const cells = S("g", { fill: "none", stroke: C.line, "stroke-width": 2 }, st.back);
  for (const g of L.glyphs) {
    const f = g.run.frame;
    S("rect", { x: f.x, y: f.y, width: f.width, height: f.height }, cells);
  }

  const rule = $("div", { class: "hook__rule" }, root);
  $("div", { class: "hook__kicker", text: "JAPANESE TYPESETTING FOR THE WEB" }, root);
  $("div", { class: "hook__mark", text: "stone-engine.js" }, root);
  const sub = new Stone(root).setLayout(lay(COPY.sub, { fontSize: 46, fonts: F.mincho })).place(144, 618);
  sub.draw();

  // 見出しは 1 秒に 4 文字ずつ置く（置かれるそばから読める）。置き終えてから下の 1 行を出して、それを読む時間を取る
  const typeFrom = 0.4;
  const typeTo = typeFrom + L.glyphs.length / CPS;
  const subAt = typeTo + 0.15;
  const duration = roundUp(subAt + 0.25 + readTime(COPY.sub) + TAIL);

  const update = (t) => {
    root.style.transform = `scale(${(1 + 0.012 * (t / duration)).toFixed(5)})`;
    rule.style.transform = `scaleX(${E.out(seg(t, 0, 0.8))})`;
    st.draw((g, i) => {
      const t0 = typeFrom + i / CPS;
      const p = E.out(seg(t, t0, t0 + 0.34));
      return { opacity: p, y: g.y - 30 * (1 - p) };
    });
    cells.setAttribute("opacity", (1 - E.inOut(seg(t, typeTo + 0.5, typeTo + 1.3))).toFixed(3));
    const s = E.out(seg(t, subAt, subAt + 0.5));
    sub.svg.style.opacity = s;
    sub.svg.style.transform = `translateY(${14 * (1 - s)}px)`;
  };
  return {
    update,
    duration,
    counted: [
      ["見出し", readChars(COPY.hook)],
      ["下の 1 行", readChars(COPY.sub)],
    ],
  };
}

/**
 * 出自。日本デザインセンター様から生まれた iOS 用のエンジン stone_engine を継承したことを伝える。
 * promo/assets/stone-site.png（stone のサイトのスクリーンショット）があれば、図の左端に置く。
 */
function lineage(root, assets) {
  const shot = assets.stoneSite;
  if (shot) root.classList.add("lineage--shot");
  $("div", { class: "lineage__kicker", text: "ORIGIN" }, root);
  const L = lay(
    COPY.lineage,
    { fontSize: shot ? 76 : 84, lineHeightScale: 1.55, textAlign: "center", fonts: F.minchoBold },
    { width: 1680 },
  );
  const st = new Stone(root).setLayout(L).place(120, shot ? 196 : 322);

  // 図。左から順に出す箱と、その間の矢印
  const row = $("div", { class: "lineage__row" }, root);
  const nodes = [];
  const arrows = [];
  const node = (mark, note) => {
    const el = $("div", { class: "lineage__node" }, row);
    $("div", { class: "lineage__mark", text: mark }, el);
    $("div", { class: "lineage__note", text: note }, el);
    nodes.push(el);
  };
  const arrow = () => {
    const el = $("div", { class: "lineage__arrow" }, row);
    arrows.push({ shaft: $("i", {}, el), head: $("b", {}, el) });
  };
  if (shot) {
    const card = $("div", { class: "lineage__node" }, row);
    const frame = $("div", { class: "lineage__frame" }, card);
    shot.alt = "";
    frame.appendChild(shot);
    $("div", { class: "lineage__note", text: COPY.lineageShot }, card);
    nodes.push(card);
    arrow();
  }
  node("stone_engine", COPY.lineageFrom);
  arrow();
  node("stone-engine.js", COPY.lineageTo);

  // 見出しを読み終えるころに図を出す。図の名前（英字）は見る時間として 2.5 秒、スクリーンショットがあれば、見る時間と注記を読む時間を足す
  const readEnd = LEAD + readTime(COPY.lineage);
  const step = 0.75;
  const drawFrom = readEnd - 0.9;
  const drawn = drawFrom + (nodes.length - 1) * step + 0.5;
  const glance = 2.5 + (shot ? 1.5 + readTime(COPY.lineageShot) : 0);
  const duration = roundUp(drawn + glance + TAIL);

  const update = (t) => {
    root.style.transform = `scale(${(1 + 0.012 * (t / duration)).toFixed(5)})`;
    st.draw((g, i) => {
      const t0 = 0.15 + i * 0.03;
      const p = E.out(seg(t, t0, t0 + 0.45));
      return { opacity: p, y: g.y + 26 * (1 - p) };
    });
    nodes.forEach((el, k) => {
      const p = E.out(seg(t, drawFrom + k * step, drawFrom + k * step + 0.5));
      el.style.opacity = p;
      el.style.transform = `translateY(${22 * (1 - p)}px)`;
    });
    arrows.forEach(({ shaft, head }, k) => {
      const t0 = drawFrom + 0.3 + k * step;
      shaft.style.transform = `scaleX(${E.inOut(seg(t, t0, t0 + 0.6))})`;
      head.style.opacity = E.out(seg(t, t0 + 0.45, t0 + 0.7));
    });
  };
  const counted = [["見出し", readChars(COPY.lineage)]];
  if (shot) counted.push(["スクリーンショットの注記", readChars(COPY.lineageShot)]);
  return { update, duration, counted };
}

/** 01 縦書き。紙の高さを変えて、そのたびに組み直す。 */
function tategaki(root) {
  const p = panel(root, FEATURES[0]);
  const box = { x: 780, y: 150, w: 1020, pad: 60 };
  const page = $("div", { class: "page", style: { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px` } }, root);
  const st = new Stone(root);
  const grip = $("div", { class: "grip", style: { left: `${box.x + box.w / 2 - 66}px` } }, root);
  const dim = $("div", { class: "dim", style: { left: `${box.x}px` } }, root);

  const options = { direction: "tbRl", fontSize: 48, lineHeightScale: 1.9, fonts: F.mincho };
  const cache = new Map();
  const layAt = (height) => {
    if (!cache.has(height)) cache.set(height, lay(COPY.vertical, options, { height }));
    return cache.get(height);
  };
  // いちばん低くするときの高さ。列が紙の幅に収まる範囲で決める
  let minInner = 380;
  while (layAt(minInner).w > box.w - box.pad * 2 && minInner < 640) minInner += 2;
  const H0 = 800;
  const H1 = minInner + box.pad * 2 + 6;
  // 最初と最後は、どの段落も読点の後ろか文節で折り返す高さにする（実際のフォントで調べた値。語の途中で折り返さない）
  const H2 = 700;

  // 説明を読み終えてから、紙を縮めて、戻す
  const moveFrom = LEAD + p.read + 0.6;
  const duration = roundUp(moveFrom + 2.9 + HOLD + TAIL);

  const update = (t) => {
    p(t);
    let h = lerp(H0, H1, E.inOut(seg(t, moveFrom, moveFrom + 1.2)));
    h = lerp(h, H2, E.inOut(seg(t, moveFrom + 1.8, moveFrom + 2.9)));
    const inner = Math.round(h - box.pad * 2);
    const L = layAt(inner);
    st.setLayout(L).place(box.x + box.w - box.pad - L.w, box.y + box.pad);
    st.draw((g, i) => {
      const t0 = 0.25 + i * 0.011;
      const q = E.out(seg(t, t0, t0 + 0.3));
      return { opacity: q, y: g.y - 14 * (1 - q) };
    });
    page.style.height = `${h}px`;
    grip.style.top = `${box.y + h - 5}px`;
    dim.style.top = `${box.y + h + 24}px`;
    dim.textContent = `height={${inner}}`;
    const ui = E.out(seg(t, moveFrom - 0.6, moveFrom - 0.1));
    grip.style.opacity = ui;
    dim.style.opacity = ui;
  };
  return { update, duration, counted: p.counted };
}

/** 02 禁則処理。行頭に来た「。」「ー」「」」を、kinsoku で前の文字ごと送る。 */
function kinsoku(root) {
  const p = panel(root, FEATURES[1]);
  const fontSize = 80;
  const options = { fontSize, lineHeightScale: 1.7, dividesByWords: false, punctuationMode: "whole", fonts: F.gothic };
  const size = { width: fontSize * 11 + 4 };
  const A = lay(COPY.kinsoku, { ...options, kinsoku: false }, size);
  const B = lay(COPY.kinsoku, { ...options, kinsoku: true }, size);
  const ox = 830;
  const oy = 262;
  const st = new Stone(root).setLayout(A).place(ox, oy);

  // 禁則なしの組みで、行頭に来ている行頭禁則の文字
  const heads = new Map();
  for (const g of A.glyphs) if (!heads.has(g.line)) heads.set(g.line, g);
  const offenders = [...heads.values()].filter((g) => isNotStartingChar(g.text));
  const offenderIds = new Set(offenders.map((g) => g.runId));
  const marks = offenders.map(() =>
    S("rect", { rx: 14, fill: C.accentSoft, stroke: C.accent, "stroke-width": 3 }, st.back),
  );

  const guide = $(
    "div",
    {
      style: {
        position: "absolute",
        left: `${ox - 34}px`,
        top: `${oy - 10}px`,
        width: "3px",
        height: `${A.h + 20}px`,
        background: C.accent,
        transformOrigin: "50% 0",
      },
    },
    root,
  );
  const label = $("div", { class: "guide-label", text: "行頭", style: { left: `${ox - 62}px`, top: `${oy - 52}px` } }, root);

  // 説明を読み終えてから、行頭の文字に印を付け、それを見る時間を置いて、禁則を効かせる
  const popFrom = LEAD + p.read + 0.1;
  const popStep = 0.28;
  const morphFrom = popFrom + (offenders.length - 1) * popStep + 0.35 + LOOK;
  const morphTo = morphFrom + 0.9;
  const duration = roundUp(morphTo + HOLD + TAIL);

  const update = (t) => {
    const m = E.inOut(seg(t, morphFrom, morphTo));
    p(t, E.inOut(seg(t, morphFrom - 0.15, morphFrom + 0.3)));
    const g0 = E.out(seg(t, 0.45, 0.95));
    guide.style.transform = `scaleY(${g0})`;
    label.style.opacity = g0;
    const pops = offenders.map((_, k) => seg(t, popFrom + k * popStep, popFrom + k * popStep + 0.35));

    st.draw((a) => {
      const s = morph(a, B.byRun.get(a.runId), m);
      if (offenderIds.has(a.runId)) {
        const k = offenders.findIndex((o) => o.runId === a.runId);
        s.fill = mix(C.ink, C.accent, pops[k]);
      }
      return s;
    });

    marks.forEach((mark, k) => {
      const fa = offenders[k].run.frame;
      const fb = B.byRun.get(offenders[k].runId).run.frame;
      const scale = E.outBack(pops[k]);
      const w = fa.width * scale;
      const h = fa.height * scale;
      const cx = lerp(fa.x, fb.x, m) + fa.width / 2;
      const cy = lerp(fa.y, fb.y, m) + fa.height / 2;
      mark.setAttribute("x", (cx - w / 2).toFixed(2));
      mark.setAttribute("y", (cy - h / 2).toFixed(2));
      mark.setAttribute("width", Math.max(0, w).toFixed(2));
      mark.setAttribute("height", Math.max(0, h).toFixed(2));
      mark.setAttribute("opacity", (seg(pops[k], 0, 0.4) * (1 - seg(t, morphTo, morphTo + 0.5))).toFixed(3));
    });
  };
  return { update, duration, counted: p.counted };
}

/** 03 約物の詰め。全角のままの組みから、前後を見て詰める組みへ。 */
function punct(root) {
  const p = panel(root, FEATURES[2]);
  const options = { fontSize: 68, lineHeightScale: 1.9, fonts: F.mincho };
  const A = lay(COPY.punct, { ...options, punctuationMode: "whole" }, { width: 1100 });
  const B = lay(COPY.punct, { ...options, punctuationMode: "stone" }, { width: 1100 });
  const st = new Stone(root).setLayout(A).place(770, 372);

  const isPunctuation = (ch) => /[「」『』（）、。]/.test(ch);
  const boxes = A.glyphs
    .filter((g) => isPunctuation(g.text))
    .map((a) => {
      const b = B.byRun.get(a.runId);
      return {
        a,
        b,
        squeezed: Math.abs(a.run.frame.width - b.run.frame.width) > 1,
        fill: S("rect", { rx: 6, fill: C.accentSoft }, st.back),
        edge: S("rect", { rx: 6, fill: "none", stroke: C.accent, "stroke-width": 2 }, st.back),
      };
    });

  // 行の長さ。全角のままの長さ（薄い線）と、いまの長さ（赤い線）を行の下に引く
  const lineIds = [...new Set(A.glyphs.map((g) => g.line))];
  const extent = (L, line) =>
    Math.max(...L.glyphs.filter((g) => g.line === line).map((g) => g.run.frame.x + g.run.frame.width));
  const bars = lineIds.map((line) => {
    const first = A.glyphs.find((g) => g.line === line).run.frame;
    const y = first.y + first.height + 26;
    return {
      wa: extent(A, line),
      wb: extent(B, line),
      ghost: S("rect", { x: 0, y, height: 4, fill: C.line }, st.back),
      now: S("rect", { x: 0, y, height: 4, fill: C.accent }, st.back),
    };
  });

  // 説明を読み終えてから、約物の箱を出し、それを見る時間を置いて、詰める
  const showFrom = LEAD + p.read + 0.1;
  const morphFrom = showFrom + 0.5 + LOOK;
  const morphTo = morphFrom + 0.9;
  const duration = roundUp(morphTo + HOLD + TAIL);

  const update = (t) => {
    const m = E.inOut(seg(t, morphFrom, morphTo));
    p(t, E.inOut(seg(t, morphFrom - 0.15, morphFrom + 0.3)));
    st.draw((a) => morph(a, B.byRun.get(a.runId), m));
    const show = E.out(seg(t, showFrom, showFrom + 0.5));
    for (const box of boxes) {
      const fa = box.a.run.frame;
      const fb = box.b.run.frame;
      for (const el of [box.fill, box.edge]) {
        el.setAttribute("x", lerp(fa.x, fb.x, m).toFixed(2));
        el.setAttribute("y", lerp(fa.y, fb.y, m).toFixed(2));
        el.setAttribute("width", lerp(fa.width, fb.width, m).toFixed(2));
        el.setAttribute("height", lerp(fa.height, fb.height, m).toFixed(2));
      }
      box.edge.setAttribute("opacity", (0.55 * show).toFixed(3));
      box.fill.setAttribute("opacity", (box.squeezed ? m : 0).toFixed(3));
    }
    for (const bar of bars) {
      bar.ghost.setAttribute("width", (bar.wa * show).toFixed(2));
      bar.now.setAttribute("width", (lerp(bar.wa, bar.wb, m) * show).toFixed(2));
      bar.now.setAttribute("opacity", m.toFixed(3));
    }
  };
  return { update, duration, counted: p.counted };
}

/** 04 縦中横。寝ていた 2 桁の数字が、起きて横に並ぶ。 */
function tcy(root) {
  const p = panel(root, FEATURES[3]);
  const options = { direction: "tbRl", fontSize: 86, lineHeightScale: 1.75, fonts: F.mincho };
  const A = lay(COPY.tcy, { ...options, allowsTateChuYoko: false }, { height: 830 });
  const B = lay(COPY.tcy, { ...options, allowsTateChuYoko: true }, { height: 830 });
  const width = Math.max(A.w, B.w);
  // 縦書きは右端の列から並ぶので、2 つの組みを右端でそろえて比べる
  const st = new Stone(root).setLayout(A).place(1490 - width, 176);

  // 説明を読み終えてから、作例を見る時間を置いて、数字を起こす
  const morphFrom = LEAD + p.read + LOOK;
  const morphTo = morphFrom + 0.9;
  const duration = roundUp(morphTo + HOLD + TAIL);

  const update = (t) => {
    const m = E.inOut(seg(t, morphFrom, morphTo));
    p(t, E.inOut(seg(t, morphFrom - 0.15, morphFrom + 0.3)));
    st.draw((a) => {
      const b = B.byRun.get(a.runId);
      const turns = a.rotate !== b.rotate;
      return {
        x: lerp(a.x + width - A.w, b.x + width - B.w, m),
        y: lerp(a.y, b.y, m),
        rotate: lerp(a.rotate, b.rotate, m),
        fill: turns ? mix(C.ink, C.accent, m) : C.ink,
      };
    });
  };
  return { update, duration, counted: p.counted };
}

/** 05 1 文字ずつ。文字の矩形を描き、点の下の文字を hitRunIndex で引く。 */
function inspect(root) {
  const p = panel(root, FEATURES[4]);
  const L = lay(
    COPY.inspect,
    { direction: "tbRl", fontSize: 72, lineHeightScale: 1.9, punctuationMode: "whole", fonts: F.mincho },
    { height: 830 },
  );
  const ox = 1750 - L.w;
  const oy = 150;
  const st = new Stone(root).setLayout(L).place(ox, oy);
  const hi = S("rect", { fill: C.accentSoft, stroke: C.accent, "stroke-width": 4 }, st.back);
  const frames = L.glyphs.map((g) => {
    const f = g.run.frame;
    return S(
      "rect",
      { x: f.x, y: f.y, width: f.width, height: f.height, fill: "none", stroke: C.accent, "stroke-width": 2 },
      st.back,
    );
  });
  const dot = S("circle", { r: 13, fill: C.accent, stroke: "#fffdf9", "stroke-width": 4 }, st.over);

  const tip = $("div", { class: "tip", style: { left: "800px", top: "292px", width: "590px" } }, root);
  const overlay = S("svg", { class: "overlay", width: 1920, height: 1080 }, root);
  const leader = S("line", { stroke: C.accent, "stroke-width": 2 }, overlay);

  const centre = (ch) => {
    const f = L.glyphs.find((g) => g.text === ch).run.frame;
    return { x: f.x + f.width / 2, y: f.y + f.height / 2 };
  };
  const from = centre("文");
  const to = centre("取");
  let last = -1;

  // 説明を読み終えてから、矩形を描き、点を動かす。点が止まってから、カードの注記を読む時間を取る
  const frameFrom = LEAD + p.read + 0.1;
  const onFrom = frameFrom + 0.9;
  const moveFrom = onFrom + 0.5;
  const moveTo = moveFrom + 2.0;
  const duration = roundUp(moveTo + Math.max(HOLD, readTime(COPY.tipComment) + 0.5) + TAIL);

  const update = (t) => {
    p(t);
    st.draw();
    frames.forEach((frame, i) => {
      const t0 = frameFrom + i * 0.045;
      frame.setAttribute("opacity", (0.6 * E.out(seg(t, t0, t0 + 0.3))).toFixed(3));
    });

    const u = E.inOut(seg(t, moveFrom, moveTo));
    const point = { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u) };
    const on = E.out(seg(t, onFrom, onFrom + 0.4));
    const index = L.ctx.hitRunIndex(point) ?? L.ctx.closestRunIndex(point);
    const run = L.ctx.runs[index];
    const f = run.frame;
    dot.setAttribute("cx", point.x.toFixed(2));
    dot.setAttribute("cy", point.y.toFixed(2));
    dot.setAttribute("opacity", on.toFixed(3));
    hi.setAttribute("x", f.x);
    hi.setAttribute("y", f.y);
    hi.setAttribute("width", f.width);
    hi.setAttribute("height", f.height);
    hi.setAttribute("opacity", on.toFixed(3));

    if (index !== last) {
      last = index;
      const n = (v) => `<b>${Math.round(v)}</b>`;
      tip.innerHTML = [
        `<em>// ${COPY.tipComment}</em>`,
        `ctx.<i>hitRunIndex</i>(point) <u>→</u> <b>${index}</b>`,
        ``,
        `ctx.runs[<b>${index}</b>]`,
        `{`,
        `  char: <b>"${run.char}"</b>,`,
        `  line: <b>${run.line}</b>,`,
        `  frame: {`,
        `    x: ${n(f.x)}, y: ${n(f.y)},`,
        `    width: ${n(f.width)}, height: ${n(f.height)},`,
        `  },`,
        `}`,
      ].join("\n");
    }
    tip.style.opacity = on;
    tip.style.transform = `translateY(${18 * (1 - on)}px)`;
    leader.setAttribute("x1", 1390);
    leader.setAttribute("y1", 292 + 150);
    leader.setAttribute("x2", (ox + f.x).toFixed(2));
    leader.setAttribute("y2", (oy + f.y + f.height / 2).toFixed(2));
    leader.setAttribute("opacity", (0.8 * on).toFixed(3));
  };
  return { update, duration, counted: [...p.counted, ["カードの注記", readChars(COPY.tipComment)]] };
}

/** 使い方とエンドカード。 */
function outro(root) {
  /* 使い方 */
  const use = $("div", { class: "use" }, root);
  $("div", { class: "use__kicker", text: "USAGE" }, use);
  const title = new Stone(use).setLayout(lay(COPY.usageTitle, { fontSize: 84, fonts: F.minchoBold })).place(120, 252);

  const code = $("div", { class: "code" }, use);
  const chars = [];
  for (const [tag, text] of CODE) {
    const holder = tag ? $(tag, {}, code) : code;
    for (const ch of text) chars.push($("span", { text: ch }, holder));
  }
  const caret = $("span", { class: "caret" });

  const card = { x: 1340, y: 410, w: 460, h: 480, pad: 30 };
  $(
    "div",
    {
      class: "page",
      style: { left: `${card.x}px`, top: `${card.y}px`, width: `${card.w}px`, height: `${card.h}px` },
    },
    use,
  );
  const novel = lay(
    COPY.novel,
    { direction: "tbRl", fontSize: 41, lineHeightScale: 1.9, fonts: F.mincho },
    { height: card.h - card.pad * 2 },
  );
  const result = new Stone(use).setLayout(novel).place(card.x + (card.w - novel.w) / 2, card.y + card.pad);

  /* エンドカード */
  const end = $("div", { class: "end" }, root);
  const sub = lay(COPY.sub, { fontSize: 54, fonts: F.mincho });
  const subStone = new Stone(end).setLayout(sub).place((1920 - sub.w) / 2, 446);
  subStone.draw();
  const parts = [
    $("div", { class: "end__kicker", text: "JAPANESE TYPESETTING FOR THE WEB" }, end),
    $("div", { class: "end__mark", text: "stone-engine.js" }, end),
    subStone.svg,
    $("div", { class: "end__npm", html: "<span><i style='font-style:normal;color:var(--code-key)'>$</i> npm install @non-standardworld/stone-engine.js</span>" }, end),
    $("div", { class: "end__tags", html: TAGS.map((tag) => `<span>${tag}</span>`).join("") }, end),
    $("div", { class: "end__url", text: "non-standardworld.github.io/stone_engine_js" }, end),
    $("div", { class: "end__credit", text: COPY.credit }, end),
  ];

  // 使い方: 見出しを読み終えるころにコードを打ち始め、組んだ結果を出して、コードと結果を見る時間（3 秒）を取る
  const typeFrom = LEAD + readTime(COPY.usageTitle) - 0.3;
  const typeTo = typeFrom + 2.0;
  const resultFrom = typeTo - 0.3;
  const resultStep = 0.022;
  const cut = resultFrom + novel.glyphs.length * resultStep + 0.3 + 3.0;
  // エンドカード: 日本語の 2 行を読む時間に、パッケージ名・コマンド・タグ・URL を見る時間（3.5 秒）を足す
  const cardFrom = cut + 0.8;
  const duration = roundUp(cardFrom + readTime(COPY.sub, COPY.credit) + 3.5);

  const update = (t) => {
    /* 使い方 */
    const leave = E.inOut(seg(t, cut, cut + 0.35));
    use.style.opacity = 1 - leave;
    use.style.transform = `translateY(${-36 * leave}px)`;
    use.style.display = leave >= 1 ? "none" : "block";
    title.draw((g, i) => {
      const t0 = 0.1 + i * 0.04;
      const q = E.out(seg(t, t0, t0 + 0.45));
      return { opacity: q, y: g.y + 26 * (1 - q) };
    });
    const typed = Math.round(chars.length * seg(t, typeFrom, typeTo));
    chars.forEach((ch, i) => ch.classList.toggle("on", i < typed));
    if (typed > 0 && t < typeTo + 0.5) chars[typed - 1].after(caret);
    else caret.remove();
    result.draw((g, i) => {
      const t0 = resultFrom + i * resultStep;
      const q = E.out(seg(t, t0, t0 + 0.3));
      return { opacity: q, y: g.y - 14 * (1 - q) };
    });

    /* エンドカード */
    end.style.display = t < cut ? "none" : "block";
    end.style.transform = `scale(${(1 + 0.014 * seg(t, cut, duration)).toFixed(5)})`;
    parts.forEach((part, k) => {
      const t0 = cut + 0.2 + k * 0.1;
      const q = E.out(seg(t, t0, t0 + 0.6));
      part.style.opacity = q;
      part.style.transform = `translateY(${26 * (1 - q)}px)`;
    });
  };
  return {
    update,
    duration,
    headerOut: cut,
    counted: [
      ["使い方の見出し", readChars(COPY.usageTitle)],
      ["エンドカードの 2 行", readChars(COPY.sub, COPY.credit)],
    ],
  };
}

/* ---------- タイムライン ---------- */

/** シーンの並び。開始と終了の時刻は、各シーンが返す長さから boot() で決める。 */
const TIMELINE = [
  { name: "hook", build: hook, step: -1, noIn: true },
  { name: "lineage", build: lineage, step: -1 },
  { name: "tategaki", build: tategaki, step: 0 },
  { name: "kinsoku", build: kinsoku, step: 1 },
  { name: "punct", build: punct, step: 2 },
  { name: "tcy", build: tcy, step: 3 },
  { name: "inspect", build: inspect, step: 4 },
  { name: "outro", build: outro, step: -1, noOut: true },
];
let DURATION = 0;
/** ヘッダーを出す時刻（最初の機能のシーン）と、消す時刻（使い方からエンドカードへ切り替わるとき）。 */
let HEADER_IN = 0;
let HEADER_OUT = 0;

let header = null;

function buildHeader(stage) {
  const el = $("div", { id: "header" }, stage);
  $("div", { class: "brand", text: "stone-engine.js" }, el);
  const steps = $("div", { class: "steps" }, el);
  const marks = FEATURES.map(() => $("i", {}, steps));
  header = { el, marks };
}

function seek(time) {
  const t = clamp(time, 0, DURATION - 1 / FPS / 2);
  let step = -1;
  for (const scene of TIMELINE) {
    const local = t - scene.start;
    const duration = scene.end - scene.start;
    if (local < 0 || local >= duration) {
      scene.root.style.display = "none";
      continue;
    }
    scene.root.style.display = "block";
    const fadeIn = scene.noIn ? 1 : E.out(seg(local, 0, 0.35));
    const fadeOut = scene.noOut ? 1 : 1 - E.inOut(seg(local, duration - 0.28, duration));
    scene.root.style.opacity = (fadeIn * fadeOut).toFixed(3);
    scene.update(local);
    step = scene.step;
  }
  header.el.style.opacity = (
    E.out(seg(t, HEADER_IN, HEADER_IN + 0.4)) *
    (1 - E.inOut(seg(t, HEADER_OUT, HEADER_OUT + 0.3)))
  ).toFixed(3);
  header.marks.forEach((mark, i) => mark.classList.toggle("on", i === step));
}

/* ---------- 起動 ---------- */

/** 画像を読み込む。無ければ null（その画像を使う部分を出さない）。 */
function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const capture = params.has("capture");
  document.body.classList.toggle("capture", capture);
  const stage = document.getElementById("stage");

  await loadFonts();
  measurer = getSharedCanvasMeasurer();
  measurer.invalidate();
  // 任意の素材。リポジトリには入れていない（権利のある画像を置いたときだけ使う）
  const assets = { stoneSite: await loadImage("./assets/stone-site.png") };

  let at = 0;
  for (const scene of TIMELINE) {
    scene.root = $("div", { class: "scene", "data-scene": scene.name }, stage);
    const made = scene.build(scene.root, assets);
    scene.update = made.update;
    scene.counted = made.counted ?? [];
    scene.start = at;
    scene.end = Math.round((at + made.duration) * 1000) / 1000;
    if (made.headerOut !== undefined) HEADER_OUT = at + made.headerOut;
    at = scene.end;
  }
  DURATION = at;
  HEADER_IN = TIMELINE.find((scene) => scene.step === 0).start;
  buildHeader(stage);

  window.__fps = FPS;
  window.__duration = DURATION;
  window.__frames = Math.round(DURATION * FPS);
  window.__timeline = TIMELINE.map((scene) => ({
    name: scene.name,
    start: scene.start,
    end: scene.end,
    counted: scene.counted,
  }));
  window.__seek = seek;
  seek(Number(params.get("t") ?? 0));
  window.__ready = true;
  if (!capture) preview(stage, params);
}

/** ブラウザで開いたときの再生。ウィンドウに合わせて縮小し、繰り返し再生する。 */
function preview(stage, params) {
  const fit = () => {
    const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${(innerWidth - 1920 * scale) / 2}px`;
    stage.style.top = `${(innerHeight - 1080 * scale) / 2}px`;
  };
  fit();
  addEventListener("resize", fit);

  let time = Number(params.get("t") ?? 0);
  let playing = !params.has("t");
  let previous = performance.now();
  const tick = (now) => {
    if (playing) {
      time = (time + (now - previous) / 1000) % DURATION;
      seek(time);
    }
    previous = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  addEventListener("keydown", (event) => {
    if (event.key === " ") playing = !playing;
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const amount = (event.shiftKey ? 1 : 1 / FPS) * (event.key === "ArrowRight" ? 1 : -1);
      playing = false;
      time = clamp(time + amount, 0, DURATION - 1 / FPS);
      seek(time);
    } else return;
    event.preventDefault();
    document.title = `${time.toFixed(2)}s — stone-engine.js promo`;
  });
}

boot().catch((error) => {
  window.__error = String(error && error.stack ? error.stack : error);
  console.error(error);
});
