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

半角カナ（U+FF61–FF9F。JIS X 0201 の片仮名で、半角の句読点「｡」「､」・括弧「｢」「｣」・中点「･」・長音「ｰ」・濁点「ﾞ」・半濁点「ﾟ」を含む）は、
vert が使えるブラウザでも縦組み用グリフを使わず、どのブラウザでも同じ回転（em ボックスの中心で時計回りに 90 度）で描く
（isHalfwidthKana、svg.ts の toGlyphElement）。CSS の縦書き（UTR #50 で R）と同じ横倒しになる。横組みの送り幅が 0.5em なので、
字面は列の幅いっぱい、1em のますの上半分に来る（「ｰ」は縦棒になり、「｡」「､」はますの左上に来る）。
- フォントの vrt2 にも半角カナの横倒しの字形があり、vrt2 を指定した Chrome はそれに置き換える（Swift 版も vrt2 を先に引く）。
  回した字形は、ヒラギノ角ゴシックの vrt2 の字形と 0.01em 以内で同じ位置になる（63 文字を Chrome と WebKit で描いて、字面の範囲を比べた）。
- vrt2 の横倒しの字形は、横組みの送り幅が 1em ある（0.5em なのは縦組みの送り）。濁点・半濁点の付いた「ｶﾞ」「ﾊﾟ」は 1 つの書記素
  （1 つの run、1 つの <tspan>）なので、vrt2 に置き換えると、2 文字目の濁点・半濁点が 1em 右（右隣の列の位置。右端の列では領域の外）に
  描かれる。回転なら、rotate 属性が書記素のまとまりごと回すので（Chrome も WebKit も）、「ｶ」の下に濁点が来る（CSS の縦書きと同じ位置）。
- vrt2 に半角カナの字形がないフォント（Osaka など）では、vrt2 を指定しても正立のまま列の左半分に描かれる。回転なら、フォントによらない。
（vrt2 に任せていた間は、Chrome では濁点・半濁点が右隣の列に描かれ、WebKit では回す文字の表に「｢」「｣」しか無かったので、ほかの 61 文字が
正立のまま列の左半分に描かれて、「ｰ」は横棒のままだった。Swift 版は書記素 1 つにグリフを 1 つしか持たないので、「ｶﾞ」の濁点が描かれない。）
レイアウトは変えていない。半角カナは、ほかの正立の文字と同じく 1 文字ごとに列を 1em 送り、矩形（frame）は「列の左端から、横書きの送り幅
（0.5em）ぶん」のまま（CSS の縦書きは 0.5em 送りなので、エンジンでは 1 文字ごとに 0.5em の空きができる）。
*/

/**
 * 縦組み用グリフの描き方。"feature" は font-feature-settings の vert、"emulated" は回転と移動で代用する。
 * 半角カナ（isHalfwidthKana）は、どちらでも回して描く。
 */
export type VerticalForms = "feature" | "emulated";

/** VerticalForms の指定。"auto" はブラウザに合わせる（detectVerticalForms）。 */
export type VerticalFormsOption = VerticalForms | "auto";

/**
 * 縦組み用グリフが、横組みのグリフを em ボックスの中心で時計回りに 90 度回したものになっている文字。
 * 半角カナ（半角の括弧「｢」「｣」と長音「ｰ」を含む）は、ここに並べずに範囲で見る（isHalfwidthKana）。
 */
const ROTATED: ReadonlySet<string> = new Set(
  Array.from(
    // ダーシ・リーダー・二重線
    "—―‖‥…" +
      // 括弧類
      "〈〉《》「」『』【】〔〕〖〗〘〙（）［］｛｝｟｠" +
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
 * 半角カナ（U+FF61–FF9F。半角の句読点「｡」「､」・括弧「｢」「｣」・中点「･」・長音「ｰ」・濁点「ﾞ」・半濁点「ﾟ」を含む）で始まる文字かどうか。
 * 濁点・半濁点の付いた「ｶﾞ」「ﾊﾟ」は 1 つの書記素（1 つの run）なので、先頭の文字で見る。
 * 縦書きでは、縦組み用グリフの描き方（VerticalForms）にかかわらず、回して描く（ファイル冒頭のコメント）。
 */
export function isHalfwidthKana(char: string): boolean {
  const cp = char.codePointAt(0);
  return cp !== undefined && cp >= 0xff61 && cp <= 0xff9f;
}

/**
 * 縦書きの和文の文字を vert を使わずに描くときの変形。そのままでよい文字は null。
 * fullWidth は全角の字形（fwid）で描く引用符「“」「”」「‘」「’」。縦組み用グリフ（〝〟の形）の代わりに回す
 * （CSS の縦書きでも、引用符は横倒しにする）。
 * 半角カナは回す。vert が使えるブラウザでも、この変形で描く。
 */
export function verticalGlyphTransform(char: string, fullWidth = false): VerticalGlyphTransform | null {
  if (fullWidth || ROTATED.has(char) || isHalfwidthKana(char)) return { type: "rotate" };
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
