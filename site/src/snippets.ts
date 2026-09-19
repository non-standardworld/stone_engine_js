export const INSTALL = `# GitHub から直接
npm install github:non-standardworld/stone_engine_js

# npm に公開している場合
npm install @non-standardworld/stone-engine`;

export const QUICK_START = `import { StoneText } from "@non-standardworld/stone-engine/react";

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

export const TATE_CHU_YOKO = `<StoneText direction="tbRl" height={280} fontSize={18} lineHeightScale={1.9}>
  {"令和6年12月31日、Ver.2.0を公開した。数字は2桁まで縦中横、3桁以上の123と英字は回転する。"}
</StoneText>`;

export const KINSOKU = `<StoneText width={220} kinsoku>{text}</StoneText>
<StoneText width={220} kinsoku={false}>{text}</StoneText>`;

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

export const ALIGN = `<StoneText textAlign="justify" width={320}>{text}</StoneText>`;

export const FRAMES = `// showFrames で各文字の占有矩形を描く。
// onLayout で受け取る StoneContext から位置・矩形・行番号が取れる。
<StoneText showFrames onLayout={(layout) => console.log(layout.runs)}>
  {"文字ごとの位置と矩形が取れる。"}
</StoneText>`;

export const SSR = `// サーバーでは通常のテキスト（縦書きなら writing-mode: vertical-rl）を描画し、
// クライアントでフォントを計測できた時点で組版結果の SVG に置き換わる。
<StoneText fallback="text">{text}</StoneText>   // 既定。SEO / アクセシビリティに有利
<StoneText fallback="hidden">{text}</StoneText> // 場所だけ確保して見せない
<StoneText fallback="none">{text}</StoneText>   // 何も描かない`;

export const HOOK = `import { useRef } from "react";
import { useStoneLayout, StoneSVG } from "@non-standardworld/stone-engine/react";

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

export const VANILLA = `import { mountStoneText } from "@non-standardworld/stone-engine";

const handle = mountStoneText(document.querySelector("#text")!, {
  text: "縦書きのテキスト",
  direction: "tbRl",
  height: 400,
});
handle.update({ fontSize: 24 });
handle.destroy();`;

export const LOW_LEVEL = `import { layoutText, svgString, getSharedCanvasMeasurer } from "@non-standardworld/stone-engine";

const layout = layoutText(
  text,
  { direction: "tbRl", fontSize: 20 },
  getSharedCanvasMeasurer()!,
  { height: 400 },
);
element.innerHTML = svgString(layout);

// layout.runs[i].frame     文字の占有矩形
// layout.runs[i].position  グリフ原点（ベースライン左端）
// layout.hitRunIndex({ x, y })  点を含む文字の ID`;

export interface PropRow {
  name: string;
  def: string;
  desc: string;
}

export const PROPS: PropRow[] = [
  { name: "text / children", def: "", desc: "組むテキスト" },
  { name: "direction", def: '"lrTb"', desc: '"lrTb" 横書き、"tbRl" 縦書き' },
  { name: "fontSize", def: "17", desc: "フォントサイズ（px）" },
  { name: "lineHeightScale", def: "1", desc: "行送り（フォントサイズに対する倍率）" },
  { name: "textAlign", def: '"leading"', desc: "leading / center / trailing / justify" },
  { name: "directionAlign", def: '"start"', desc: "行送り方向の寄せ（横書きなら上下、縦書きなら左右）" },
  { name: "punctuationMode", def: '"stone"', desc: "約物の扱い。whole 常に全角、half 常に半角、stone 前後関係で判断" },
  { name: "kinsoku", def: "true", desc: "行頭・行末禁則" },
  { name: "dividesByWords", def: "true", desc: "単語の途中で改行しない" },
  { name: "allowsTateChuYoko", def: "true", desc: "縦書きで 2 桁以下の数字を正体にする（縦中横）" },
  { name: "adjustsFontSizeToFitWidth / minimumScaleFactor", def: "false / 0", desc: "収まらないときにフォントを縮小する" },
  { name: "fonts", def: "", desc: "文字種（latin / japanese / emoji）ごとの { family, scale, weight, style, ascent, descent }" },
  { name: "width / height", def: '横書き "container" / "auto"、縦書き "auto" / "auto"', desc: 'レイアウト領域。数値（px）、"auto"（制限なし）、"container"（コンポーネントの大きさ）。縦書きの幅は内容に合わせて左に伸びる' },
  { name: "color", def: "currentColor", desc: "文字色" },
  { name: "showFrames", def: "false", desc: "各文字の占有矩形を描く（デバッグ用）" },
  { name: "fallback", def: '"text"', desc: "レイアウト前（SSR・フォント読み込み前）の表示。text / hidden / none" },
  { name: "onLayout", def: "", desc: "レイアウト結果（StoneContext）を受け取る" },
];
