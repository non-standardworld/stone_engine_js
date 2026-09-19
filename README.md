# @non-standardworld/stone-engine

日本語組版エンジン [stone_engine](https://github.com/ndc-stone/stone_engine)（Nihon Design Center、iOS / Swift 製）の JavaScript / TypeScript 移植です。
縦書き、禁則処理、約物の半角詰め、縦中横、文字種ごとのフォントとスケール指定といったエンジンの機能を、ブラウザ標準のフォント描画の上で再現します。React 用のコンポーネントと、フレームワークを使わない DOM 用 API を同梱しています。

ライブサンプル付きのドキュメントサイト: https://non-standardworld.github.io/stone_engine_js/

オリジナル（Swift 版）の設計思想と機能説明は [README.original.md](./README.original.md) を参照してください。Swift のソースは `Sources/` にそのまま残しています。

## 仕組み

Swift 版は CoreText でグリフを取り出し、`STLayout` が 1 文字ずつ位置を決め、`STLabel` が CoreGraphics で描画していました。この移植では

- 解析（`STParser`）は `Intl.Segmenter` で単語／書記素に分割
- 計測（CoreText の送り幅・アセント／ディセント）は Canvas 2D の `measureText` で取得
- レイアウト（`STLayout` / `STContext`）は TypeScript にそのまま移植
- 描画は SVG の `<text>` 要素を 1 文字ずつ置く。縦書きの欧文は `rotate(90)`、和文は `font-feature-settings: "vert"` で縦組み用グリフに置換

という構成です。フォントファイルを読み込む必要はなく、CSS で使える Web フォント（Google Fonts など）やシステムフォントがそのまま使えます。レイアウト結果は 1 文字ごとの位置・矩形・行番号として取り出せるので、Swift 版と同じく「内部構造を直接触れる」エンジンになっています。

## インストール

```bash
npm install github:non-standardworld/stone_engine_js
```

npm に公開する場合は `npm publish` 後に `npm install @non-standardworld/stone-engine` でも同じです。React は peer dependency（任意）です。

## React で使う

```tsx
import { StoneText } from "@non-standardworld/stone-engine/react";

export function Article() {
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
}
```

縦書きは `direction="tbRl"` を指定し、折り返しの基準になる高さを与えます。

```tsx
<StoneText direction="tbRl" height={480} fontSize={20} lineHeightScale={2}>
  {text}
</StoneText>

{/* コンテナの高さに合わせる場合 */}
<StoneText direction="tbRl" height="container" style={{ height: "60vh" }}>
  {text}
</StoneText>
```

### SSR（React Router / Next.js など）

コンポーネントはサーバーでは通常のテキスト（`<p>`、縦書きなら `writing-mode: vertical-rl`）を描画し、クライアントでフォントの計測ができた時点で組版結果の SVG に置き換わります。ハイドレーションの不一致は起きません。フォントが未読み込みなら `document.fonts.load()` で読み込み、完了後に自動的にレイアウトし直します。

`fallback` プロパティで置き換わる前の表示を選べます。

- `"text"`（既定）: 通常のテキストとして表示する。SEO / アクセシビリティ的に有利
- `"hidden"`: 場所だけ確保して見せない
- `"none"`: 視覚的には何も描かず、スクリーンリーダー用のテキストだけを残す

組版後も、スクリーンリーダーと検索エンジンのために元のテキストを視覚的に隠した要素として保持し、SVG は `aria-hidden` にしています。

### プロパティ

| プロパティ | 既定値 | 説明 |
| --- | --- | --- |
| `text` / `children` | | 組むテキスト |
| `direction` | `"lrTb"` | `"lrTb"` 横書き、`"tbRl"` 縦書き |
| `fontSize` | `17` | フォントサイズ（px） |
| `lineHeightScale` | `1` | 行送り（フォントサイズに対する倍率） |
| `textAlign` | `"leading"` | `leading` / `center` / `trailing` / `justify` |
| `directionAlign` | `"start"` | 行送り方向の寄せ（横書きなら上下、縦書きなら左右） |
| `punctuationMode` | `"stone"` | 約物の扱い。`whole` 常に全角、`half` 常に半角、`stone` 前後関係で判断 |
| `kinsoku` | `true` | 行頭・行末禁則 |
| `dividesByWords` | `true` | 単語の途中で改行しない |
| `allowsTateChuYoko` | `true` | 縦書きで 2 桁以下の数字を正体にする |
| `adjustsFontSizeToFitWidth` / `minimumScaleFactor` | `false` / `0` | 収まらないときにフォントを縮小する |
| `fonts` | | 文字種（`latin` / `japanese` / `emoji`）ごとの `{ family, scale, weight, style, ascent, descent }` |
| `width` / `height` | 横書き `"container"` / `"auto"`、縦書き `"auto"` / `"auto"` | レイアウト領域。数値（px）、`"auto"`（制限なし）、`"container"`（コンポーネントの大きさ） |
| `color` | `currentColor` | 文字色 |
| `showFrames` | `false` | 各文字の占有矩形を描く（デバッグ用） |
| `fallback` | `"text"` | レイアウト前の表示 |
| `onLayout` | | レイアウト結果（`StoneContext`）を受け取る |

`fonts` の既定値は、和文がヒラギノ角ゴ → Noto Sans JP → 游ゴシック、欧文が Helvetica Neue（スケール 0.95）です。和文フォントのアセント／ディセントは仮想ボディに合わせて 0.88 / 0.12 を使い、欧文はブラウザが返すフォントメトリクスを使います。フォントによって上下位置を調整したい場合は `ascent` / `descent` で上書きできます。

### レイアウト結果を使う

`onLayout` または `useStoneLayout` フックで `StoneContext` が得られます。Swift 版の `STContext` に相当し、文字ごとの `runs`（`char`、`position`、`frame`、`line`、`tokenId` …）と `tokens`、`lineCount`、`renderedSize`、当たり判定の `hitRunIndex(point)` / `closestRunIndex(point)` などを持ちます。

```tsx
import { useRef } from "react";
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
}
```

## React 以外で使う

```ts
import { mountStoneText } from "@non-standardworld/stone-engine";

const handle = mountStoneText(document.querySelector("#text")!, {
  text: "縦書きのテキスト",
  direction: "tbRl",
  height: 400,
});
handle.update({ fontSize: 24 });
handle.destroy();
```

さらに低いレベルでは、`layoutText()` に計測器（ブラウザなら `getSharedCanvasMeasurer()`）を渡して `StoneContext` を受け取り、`svgString()` で SVG 文字列にできます。計測器は `FontMeasurer` インターフェースなので、opentype.js などでフォントファイルから計測する実装に差し替えれば、サーバー側で組版して SVG を SSR することもできます。

```ts
import { layoutText, svgString, getSharedCanvasMeasurer } from "@non-standardworld/stone-engine";

const layout = layoutText(text, { direction: "tbRl", fontSize: 20 }, getSharedCanvasMeasurer()!, { height: 400 });
element.innerHTML = svgString(layout);
```

## Swift 版との違い

- 編集機能（`STTextView`、カーソル、選択、ルーペ）は移植していません。表示（`STLabel`）に相当する機能のみです。
- フォントは名前の配列ではなく CSS の `font-family` リストで指定します。グリフ単位のフォールバックはブラウザが行います。
- 縦組み用グリフは GSUB を自前で辿る代わりに、ブラウザの `font-feature-settings` に任せています。
- `Intl.Segmenter` が無い環境では単語分割が書記素分割にフォールバックします（`dividesByWords: false` 相当）。
- 元実装の明らかな不具合をいくつか修正しています（禁則の追い出し単位、行頭約物の二重詰め、均等配置の余り、縦書き均等配置での 1 桁縦中横、`directionAlign: middle` のずれ）。詳細は `src/layout.ts` 冒頭のコメントを参照してください。

## 開発

```bash
npm install          # 依存の取得とビルド
npm test             # ユニットテスト（vitest）
npm run build        # dist/ を生成
npm run example      # examples/react-router のデモを起動
```

`examples/react-router` は React Router（framework mode、SSR 有効）でこのパッケージを使う最小構成です。

`site/` はドキュメントサイト（Vite + React）で、`npm run site` で開発サーバーが起動します。`main` に push すると GitHub Actions（`.github/workflows/pages.yml`）が GitHub Pages にデプロイします。

## ライセンス

MIT License。オリジナルの著作権は Nihon Design Center に帰属します。[LICENSE](./LICENSE) を参照してください。
