export const INSTALL = `npm install @non-standardworld/stone-engine.js

# 補足: GitHub から直接インストールする場合
npm install github:non-standardworld/stone_engine_js`;

export const QUICK_START = `import { StoneText } from "@non-standardworld/stone-engine.js/react";

export function Lead() {
  return (
    <StoneText
      fontSize={18}
      lineHeightScale={1.9}
      textAlign="justify"
      fonts={{
        japanese: { family: '"Noto Serif JP", serif' },
        latin: { family: "Georgia, serif", scale: 0.92 },
      }}
    >
      {"stone_engineは、日本語の文字組版を実現する、テキストレンダリングエンジンである。"}
    </StoneText>
  );
}`;

export const VERTICAL = `// 折り返しの基準になる高さを与える。幅は内容に合わせて左に伸びる
<StoneText direction="tbRl" height={480} fontSize={20} lineHeightScale={2}>
  {text}
</StoneText>

// コンテナの高さに合わせる場合
<StoneText direction="tbRl" height="container" style={{ height: "60vh" }}>
  {text}
</StoneText>`;

export const SPACING_USAGE = `// どちらも px で指定する。1 字下げて、字間を 0.05em 空ける
<StoneText fontSize={18} textIndent={18} letterSpacing={18 * 0.05}>
  {"一つめの段落。\\n二つめの段落も、1 行目を下げる。"}
</StoneText>

// CSS の text-indent の既定と同じく、テキストの先頭の行だけを下げる
<StoneText fontSize={18} textIndent={18} textIndentEachLine={false}>
  {text}
</StoneText>`;

export const TATE_CHU_YOKO = `<StoneText direction="tbRl" height={280} fontSize={18} lineHeightScale={1.9}>
  {"令和6年12月31日、Ver.2.0を公開した。数字は2桁まで縦中横、3桁以上の123と英字は回転する。"}
</StoneText>`;

export const KINSOKU = `// 比べやすいように 1 文字単位で折り返す（dividesByWords={false}）
<StoneText width={220} dividesByWords={false} kinsoku>{text}</StoneText>
<StoneText width={220} dividesByWords={false} kinsoku={false}>{text}</StoneText>`;

export const PUNCTUATION = `<StoneText punctuationMode="whole">{text}</StoneText>  // 常に全角
<StoneText punctuationMode="half">{text}</StoneText>   // 常に半角
<StoneText punctuationMode="stone">{text}</StoneText>  // 前後関係で判断（既定）`;

export const FONTS = `<StoneText
  fonts={{
    japanese: { family: '"Noto Serif JP", serif' },
    latin: { family: "Georgia, serif", scale: 0.9 },
  }}
>
  {"日本語の中に English や 2024 を混ぜても、文字種ごとにフォントとスケールを選べる。"}
</StoneText>`;

export const RICH_TEXT = `// children の要素から、リンク・文字色・下線・打ち消し線・太字・斜体を読み取って組む
<StoneText direction="tbRl" height={240}>
  詳しくは<a href="https://github.com/non-standardworld/stone_engine_js">GitHub</a>へ。
  <span style={{ color: "#2f6f9f" }}>文字色</span>や<u>下線</u>、<s>打ち消し線</s>、
  <strong>太字 Bold</strong>、<em>斜体 Italic</em>も組める。
</StoneText>`;

export const RICH_TEXT_USAGE = `import { Link } from "react-router";

<StoneText direction="tbRl" height={360}>
  詳しくは<a href="/docs">ドキュメント</a>を、更新情報は<Link to="/news">お知らせ</Link>をご覧ください。
  <br />
  <span style={{ color: "crimson" }}>赤い文字</span>と<u>下線</u>、<strong>太字 Bold</strong>も組めます。
</StoneText>

/* SVG のリンクと線にはスタイルを当てられる */
.stone-text svg a:hover { fill: crimson; }
.stone-text svg .stone-decorations rect { fill: currentColor; }`;

export const RICH_TEXT_VANILLA = `import { mountStoneText, readStoneSource } from "@non-standardworld/stone-engine.js";

// 描画されている（display: none ではない）HTML の要素から、テキストと範囲を読み取る
const { text, spans } = readStoneSource(document.querySelector("#source")!);
mountStoneText(document.querySelector("#text")!, { text, spans, direction: "tbRl", height: 360 });

// layoutText を直接使うときは、太さ・スタイルを組みに反映するため spans をレイアウトにも渡す
const layout = layoutText(text, options, getSharedCanvasMeasurer()!, { height: 360 }, spans);
element.innerHTML = svgString(layout, { spans });`;

export const ALIGN = `// 余白は文字間に均等に配る。欧文の単語の途中と「……」「——」の間は空けない
<StoneText textAlign="justify" width={300}>{text}</StoneText>`;

export const SPACING = `// 字下げ（px）は、テキストの先頭の行と改行の直後の行に入る。行頭の始め括弧は、字下げの後ろで半角に詰める
<StoneText width={220} fontSize={16} textIndent={16}>
  {"段落の1行目を1字下げる。折り返して始まる行は下げない。\\n「括弧で始まる段落」も、字面が1字ぶん下がる。"}
</StoneText>

// 字間（px）は各文字の後ろに足す。「……」の間には足さない
<StoneText width={220} fontSize={16} letterSpacing={3}>
  {"字間を空けて組む。禁則や約物の詰めはそのまま働き、「……」の間は空けない。"}
</StoneText>`;

export const CSS_RESET = `// React: svgProps で <svg> に付け直す
<StoneText svgProps={{ style: { fontFeatureSettings: '"zero"' } }}>{text}</StoneText>

/* mountStoneText / svgString: 組版結果の <svg>（.stone-svg）に指定する */
.stone-svg { font-feature-settings: "zero" !important; }`;

export const TRUNCATE = `// 行送り方向（横書きは高さ、縦書きは幅）に収まらない行は表示せず、
// 最後に表示する文字を省略記号（横書き「…」、縦書き「︙」）にする
<StoneText width={260} height={84}>{text}</StoneText>
<StoneText direction="tbRl" width={96} height={220}>{text}</StoneText>`;

export const JAPANESE_PUNCTUATION = `// ダーシ・リーダーと「‼」「※」などは欧文の後ろでも和文フォントで組み、縦書きで回転させない。
// 引用符は欧文に付けば欧文、和文中なら和文として組む
<StoneText direction="tbRl" height={280}>
  {"「待って……」と言った——“了解”‼ ※欧文の“Hello”は回転する。"}
</StoneText>`;

export const FRAMES = `// showFrames で各文字の占有矩形を描く。
// onLayout で受け取る StoneContext から位置・矩形・行番号が取れる。
<StoneText showFrames onLayout={(layout) => console.log(layout.runs)}>
  {"文字ごとの位置と矩形が取れる。"}
</StoneText>`;

export const SSR = `// サーバーでは通常のテキスト（縦書きなら writing-mode: vertical-rl）を描画し、
// クライアントでフォントを計測できた時点で組版結果の SVG に置き換わる。
<StoneText fallback="text">{text}</StoneText>   // 既定。SEO / アクセシビリティに有利
<StoneText fallback="hidden">{text}</StoneText> // 場所だけ確保して見せない
<StoneText fallback="none">{text}</StoneText>   // 視覚表示をせず、スクリーンリーダー用テキストだけを残す`;

export const HOOK = `import { useRef } from "react";
import { useStoneLayout, StoneSVG } from "@non-standardworld/stone-engine.js/react";

function Custom({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const layout = useStoneLayout({ text, options: { fontSize: 24 }, containerRef: ref });
  return (
    <div ref={ref}>
      {layout && <StoneSVG layout={layout} />}
      {layout?.runs.map((run, i) => (
        <span key={i} style={{ position: "absolute", left: run.frame.x, top: run.frame.y }} />
      ))}
    </div>
  );
}`;

export const VANILLA = `import { mountStoneText } from "@non-standardworld/stone-engine.js";

const handle = mountStoneText(document.querySelector("#text")!, {
  text: "縦書きのテキスト",
  direction: "tbRl",
  height: 400,
});
handle.update({ fontSize: 24 });
handle.destroy();`;

export const LOW_LEVEL = `import { layoutText, svgString, handleStoneCopy, getSharedCanvasMeasurer } from "@non-standardworld/stone-engine.js";

const layout = layoutText(
  text,
  { direction: "tbRl", fontSize: 20 },
  getSharedCanvasMeasurer()!,
  { height: 400 },
);
element.innerHTML = svgString(layout);
// コピーしたときに元のテキスト（改行・空白を含む）が入るようにする。mountStoneText と StoneSVG は自動で行う
element.addEventListener("copy", (event) => handleStoneCopy(event, layout, element));

// layout.runs[i].frame     文字の占有矩形
// layout.runs[i].position  グリフ原点（ベースライン左端）
// layout.hitRunIndex({ x, y })      点を含む文字の ID
// layout.closestRunIndex({ x, y })  点にいちばん近い文字の ID`;

export const COPY = `/* SVG の 1 文字は data-run（run ID）を持つ <tspan>。svg text は段落全体になる */
.stone-text svg [data-run]:hover {
  fill: crimson;
}`;

export interface PropRow {
  name: string;
  def: string;
  desc: string;
}

export const PROPS: PropRow[] = [
  { name: "text / children", def: "", desc: "組むテキスト。children には <a>（React Router の <Link> も）や <span style>、<u>、<s>、<strong>、<em> を含められ、リンク・文字色・下線・打ち消し線・太字・斜体を SVG に反映する（太字・斜体はそのフォントで送り幅を測って組む）" },
  { name: "direction", def: '"lrTb"', desc: '"lrTb" 横書き、"tbRl" 縦書き' },
  { name: "fontSize", def: "17", desc: "フォントサイズ（px）" },
  { name: "lineHeightScale", def: "1", desc: "行送り（フォントサイズに対する倍率）" },
  { name: "letterSpacing", def: "0", desc: "字間（px）。CSS の letter-spacing と同じく、各文字の後ろに足す（行末の文字の後ろにも足すので、折り返しや行揃えは行末の字間を含めて計算する）。負の値なら詰める。縦中横の数字の間と「……」「——」の間には足さない" },
  { name: "textIndent / textIndentEachLine", def: "0 / true", desc: "段落の 1 行目の字下げ（px）。テキストの先頭の行と改行の直後の行の行頭を下げ、折り返して始まる行は下げない。負の値なら 1 行目が領域の手前に出る。textIndentEachLine を false にすると、CSS の text-indent の既定と同じく、テキストの先頭の行だけを下げる。punctuationMode が stone / half なら、字下げした行頭の始め括弧は字下げの後ろで半角に詰める" },
  { name: "textAlign", def: '"leading"', desc: "leading / center / trailing / justify。justify は最終行と改行で終わる行を除いて行末をそろえる。余白は文字間に均等に配り、欧文の単語の途中と「……」「——」の間は空けない" },
  { name: "directionAlign", def: '"start"', desc: "行送り方向の寄せ（横書きなら上下、縦書きなら左右）" },
  { name: "punctuationMode", def: '"stone"', desc: "約物の扱い。whole 常に全角、half 常に半角、stone 前後関係で判断（行頭の始め括弧は、どの行でも半角に詰める）。half と stone は、折り返すかどうかを詰めたあとの長さで判断する" },
  { name: "kinsoku", def: "true", desc: "行頭・行末禁則（「ー」や小書きの仮名も行頭に置かない強い禁則）と分離禁止（「……」「——」の途中で改行しない）" },
  { name: "dividesByWords", def: "true", desc: "単語の途中で改行しない" },
  { name: "allowsTateChuYoko", def: "true", desc: "縦書きで 2 桁以下の数字を正体にする（縦中横）" },
  { name: "adjustsFontSizeToFitWidth / minimumScaleFactor", def: "false / 0", desc: "収まらないときにフォントを縮小する" },
  { name: "fonts", def: "", desc: "文字種（latin / japanese / emoji）ごとの { family, scale, weight, style, ascent, descent }" },
  { name: "width / height", def: '横書き "container" / "auto"、縦書き "auto" / "auto"', desc: 'レイアウト領域。数値（px）、"auto"（制限なし）、"container"（コンポーネントの大きさ）。縦書きの幅は内容に合わせて左に伸びる。行送り方向（横書きは高さ、縦書きは幅）に収まらない行は表示せず、続きがあるときは最後に表示する文字を省略記号（横書き「…」、縦書き「︙」）にする。縦書きの 2 桁の縦中横（1em より少し広い）は、列の 1em の幅に収まっているものとして扱う（端の列では、数字が領域からわずかにはみ出すことがある）。1 桁の縦中横だけの列も、列の位置と "auto" のときの幅は、数字の幅ではなく列の 1em の幅で決める' },
  { name: "color", def: "currentColor", desc: "文字色" },
  { name: "showFrames", def: "false", desc: "各文字の占有矩形を描く（デバッグ用）" },
  { name: "fallback", def: '"text"', desc: "レイアウト前（SSR・フォント読み込み前）の表示。text 通常のテキスト、hidden 場所だけ確保、none 視覚表示なし（スクリーンリーダー用テキストは残る）" },
  { name: "onLayout", def: "", desc: "レイアウト結果（StoneContext）を受け取る" },
];
