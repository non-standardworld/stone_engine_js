/*
render/vertical.ts — 縦書きの和文の縦組み用グリフ（vert）を、横組みのグリフの回転と移動で描く。

Safari など Apple の WebKit は、横組みの文字列に vert / vrt2 を適用しない（CoreText が縦組み用グリフを縦書きのときにしか使わない）。
SVG で font-feature-settings: "vert" を指定しても、括弧や句読点が横組みの字形のまま描かれる（fwid などほかの機能は効く）。
SVG の <text> を writing-mode: vertical-rl にしても、括弧類が回転されるだけで「、。」や小書きの仮名は横組みの位置のままになる。

そこで WebKit では vert を使わず、縦組み用グリフが横組みのグリフの回転か平行移動になっている文字を、その変形で描く。
元の文字は変えない（縦書き用の互換文字「﹁」「︑」などに置き換えると、コピーやページ内検索で元の文字にならない）。
- 回転: 括弧類・長音・波ダッシュ・ダーシ・リーダーなど。全角の正方形（em ボックス）の中心で時計回りに 90 度回す。
- 移動: 「、。，．」と小書きの仮名・引用符「〝〟」。移動量はフォントサイズに対する比。
どちらの値も、Apple 環境の既定の和文フォントであるヒラギノ角ゴシックの vert / vrt2 のグリフを Chrome で描き、
横組みのグリフとインクの範囲を比べて求めたもの（ほかのフォントの縦組み用グリフも、おおむね同じ作りになっている）。
*/

/** 縦組み用グリフの描き方。"feature" は font-feature-settings の vert、"emulated" は回転と移動で代用する。 */
export type VerticalForms = "feature" | "emulated";

/** VerticalForms の指定。"auto" はブラウザに合わせる（detectVerticalForms）。 */
export type VerticalFormsOption = VerticalForms | "auto";

/** 縦組み用グリフが、横組みのグリフを em ボックスの中心で時計回りに 90 度回したものになっている文字。 */
const ROTATED: ReadonlySet<string> = new Set(
  Array.from(
    // ダーシ・リーダー・二重線
    "—―‖‥…" +
      // 括弧類
      "〈〉《》「」『』【】〔〕〖〗〘〙（）［］｛｝｟｠｢｣" +
      // 長音・波ダッシュ・ハイフンなど
      "ー〜～゠：＝＿｜￣",
  ),
);

/**
 * 縦組み用グリフが、横組みのグリフを平行移動したものになっている文字と、その移動量（フォントサイズに対する比、右と下が正）。
 * 句読点は右上の隅へ、小書きの仮名は右上へ少し寄せる。
 */
const SHIFTED: ReadonlyMap<string, readonly [number, number]> = new Map([
  ["、", [0.65, -0.635]],
  ["。", [0.59, -0.59]],
  ["，", [0.81, -0.71]],
  ["．", [0.81, -0.8]],
  ["〝", [0, 0.64]],
  ["〟", [0, -0.645]],
  ["ぁ", [0.1, -0.08]],
  ["ぃ", [0.095, -0.13]],
  ["ぅ", [0.14, -0.085]],
  ["ぇ", [0.12, -0.09]],
  ["ぉ", [0.12, -0.11]],
  ["っ", [0.12, -0.165]],
  ["ゃ", [0.1, -0.1]],
  ["ゅ", [0.11, -0.095]],
  ["ょ", [0.11, -0.09]],
  ["ゎ", [0.11, -0.1]],
  ["ゕ", [0.115, -0.11]],
  ["ゖ", [0.12, -0.09]],
  ["ァ", [0.1, -0.095]],
  ["ィ", [0.105, -0.095]],
  ["ゥ", [0.12, -0.09]],
  ["ェ", [0.1, -0.165]],
  ["ォ", [0.11, -0.095]],
  ["ッ", [0.11, -0.095]],
  ["ャ", [0.11, -0.1]],
  ["ュ", [0.105, -0.16]],
  ["ョ", [0.13, -0.135]],
  ["ヮ", [0.11, -0.1]],
  ["ヵ", [0.13, -0.1]],
  ["ヶ", [0.1, -0.09]],
  ["ㇰ", [0.12, -0.095]],
  ["ㇱ", [0.12, -0.09]],
  ["ㇲ", [0.11, -0.095]],
  ["ㇳ", [0.11, -0.095]],
  ["ㇴ", [0.105, -0.095]],
  ["ㇵ", [0.11, -0.095]],
  ["ㇶ", [0.115, -0.09]],
  ["ㇷ", [0.11, -0.09]],
  ["ㇸ", [0.115, -0.1]],
  ["ㇹ", [0.11, -0.1]],
  ["ㇺ", [0.115, -0.095]],
  ["ㇻ", [0.115, -0.1]],
  ["ㇼ", [0.11, -0.09]],
  ["ㇽ", [0.11, -0.095]],
  ["ㇾ", [0.11, -0.095]],
  ["ㇿ", [0.115, -0.1]],
]);

/** 縦組み用グリフの代わりにする変形。rotate は em ボックスの中心で 90 度回す、shift は [右, 下] へ移動する（フォントサイズに対する比）。 */
export type VerticalGlyphTransform = { type: "rotate" } | { type: "shift"; dx: number; dy: number };

/**
 * 縦書きの和文の文字を vert を使わずに描くときの変形。そのままでよい文字は null。
 * fullWidth は全角の字形（fwid）で描く引用符「“」「”」「‘」「’」。縦組み用グリフ（〝〟の形）の代わりに回す
 * （CSS の縦書きでも、引用符は横倒しにする）。
 */
export function verticalGlyphTransform(char: string, fullWidth = false): VerticalGlyphTransform | null {
  if (fullWidth || ROTATED.has(char)) return { type: "rotate" };
  const shift = SHIFTED.get(char);
  return shift ? { type: "shift", dx: shift[0], dy: shift[1] } : null;
}

/**
 * このブラウザで使う縦組み用グリフの描き方。Apple の WebKit（Safari と、iOS / iPadOS のすべてのブラウザ）は "emulated"、
 * それ以外（Chrome / Edge / Firefox など）とサーバーでは "feature"。
 * WebKit が vert を使うかどうかは描いたグリフを見ないと分からないので、ユーザーエージェントで判定する
 * （Chrome などの UA にも AppleWebKit が含まれるので、Chrome / Chromium を除く）。
 */
export function detectVerticalForms(userAgent?: string): VerticalForms {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!ua) return "feature";
  return /AppleWebKit\//.test(ua) && !/(?:Chrome|Chromium)\//.test(ua) ? "emulated" : "feature";
}

/** VerticalFormsOption を解決する。省略時と "auto" はブラウザに合わせる。 */
export function resolveVerticalForms(option: VerticalFormsOption = "auto"): VerticalForms {
  return option === "auto" ? detectVerticalForms() : option;
}
