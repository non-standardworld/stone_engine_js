# @non-standardworld/stone-engine.js

日本語組版エンジン [stone_engine](https://github.com/ndc-stone/stone_engine)（Nihon Design Center、iOS / Swift 製）の JavaScript / TypeScript 移植です。
縦書き、禁則処理、約物の半角詰め、縦中横、文字種ごとのフォントとスケール指定といったエンジンの機能を、ブラウザ標準のフォント描画の上で再現します。React 用のコンポーネントと、フレームワークを使わない DOM 用 API を同梱しています。

ライブサンプル付きのドキュメントサイト: https://non-standardworld.github.io/stone_engine_js/

オリジナル（Swift 版）の設計思想と機能説明は [README.original.md](./README.original.md) を参照してください。Swift のソースは `Sources/` にそのまま残しています。

## 仕組み

Swift 版は CoreText でグリフを取り出し、`STLayout` が 1 文字ずつ位置を決め、`STLabel` が CoreGraphics で描画していました。この移植では

- 解析（`STParser`）は `Intl.Segmenter` で単語／書記素に分割
- 計測（CoreText の送り幅・アセント／ディセント）は Canvas 2D の `measureText` で取得
- レイアウト（`STLayout` / `STContext`）は TypeScript にそのまま移植
- 描画は SVG。改行で区切った段落ごとに `<text>` を 1 つ置き、その中に 1 文字ずつ位置を指定した `<tspan>` を並べる。縦書きの欧文は `rotate="90"`、和文は `font-feature-settings: "vert"` で縦組み用グリフに置換。`vert` が効かない Safari などの WebKit では、縦組み用グリフを横組みのグリフの回転と移動で描く

という構成です。フォントファイルを読み込む必要はなく、CSS で使える Web フォント（Google Fonts など）やシステムフォントがそのまま使えます。レイアウト結果は 1 文字ごとの位置・矩形・行番号として取り出せるので、Swift 版と同じく「内部構造を直接触れる」エンジンになっています。

## インストール

```bash
npm install @non-standardworld/stone-engine.js
```

React は peer dependency（任意）です。React 用コンポーネントを使う場合は、`react` と `react-dom` もインストールしてください。

補足: GitHub から直接インストールすることもできます。

```bash
npm install github:non-standardworld/stone_engine_js
```

## React で使う

```tsx
import { StoneText } from "@non-standardworld/stone-engine.js/react";

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

### リンクと装飾

`children` には `<a>` や React Router の `<Link>`、`<span style>`、`<u>`、`<s>`、`<strong>`、`<em>` などの要素も渡せます。要素の中のテキストも組み、次のものを SVG に反映します。

- リンク（`<a href>`）。SVG の `<a>` になり、クリックすると元の `<a>` をクリックしたことになるので、`<Link>` などのクライアント側の遷移もそのまま動きます。修飾キー付きのクリックや中クリック（新しいタブで開くなど）はブラウザに任せます
- 文字色（CSS の `color` が親と違う要素）
- 下線・打ち消し線（CSS の `text-decoration-line`。ブラウザ標準のリンクの下線も含む）。1 文字ずつの `<tspan>` ではブラウザの下線が文字ごとに切れるので、行ごとに矩形で描きます。横書きの下線は仮想ボディの下端、縦書きでは列の右（傍線）に引きます
- 太さ・スタイル（CSS の `font-weight` / `font-style` が親と違う要素。`<strong>`、`<b>`、`<em>`、`<i>` も含む）。その文字は文字種のフォントの太さ・スタイルだけを変えたフォントで送り幅を測って組むので、太字の欧文も隣の文字と重なりません。ベースラインは通常の太さのフォントにそろえます

```tsx
<StoneText direction="tbRl" height={360}>
  詳しくは<a href="/docs">ドキュメント</a>を、更新情報は<Link to="/news">お知らせ</Link>をご覧ください。
  <br />
  <span style={{ color: "crimson" }}>赤い文字</span>と<u>下線</u>、<strong>太字 Bold</strong>も組めます。
</StoneText>
```

`<br>` は改行になり、`<rt>`（ルビの読み）は組みません。斜体は縦書きでも横書きと同じ向きに傾きます（斜体の字形がない和文フォントはブラウザが傾けて描きます）。
読み取りは、`children` をそのまま描画したスクリーンリーダー用の要素（レイアウト前はフォールバックの `<p>`）から行うので、CSS で決まった色や下線、太さ・スタイルがそのまま使われます。読み直すのはその要素の中の DOM が変わったとき（`children` の更新や、中の要素のクラス・スタイルの変更）だけで、スタイルシートや祖先のクラスなど外側の CSS だけが変わったときは反映されません（`key` を変えて作り直してください）。キーボードのフォーカスは元の `<a>` が受け、SVG 側のリンクに枠を描きます。SVG のリンクは `.stone-text svg a` で、線は `.stone-text svg .stone-decorations rect` でスタイルを当てられます（例: `.stone-text svg a:hover { fill: crimson }`）。

フレームワークを使わない場合は、`readStoneSource(element)` で HTML 要素からテキストと範囲（`spans`）を読み取り、`mountStoneText` / `svgString` の `spans` に渡します。`layoutText()` / `useStoneLayout` を直接使うときは、太さ・スタイルを組みに反映するために同じ `spans` をレイアウトにも渡します（`layoutText(text, options, measurer, size, spans)`、`useStoneLayout({ text, spans, ... })`。`mountStoneText` と `<StoneText>` は自動で渡します）。

### SSR（React Router / Next.js など）

コンポーネントはサーバーでは通常のテキスト（`<p>`、縦書きなら `writing-mode: vertical-rl`）を描画し、クライアントでフォントの計測ができた時点で組版結果の SVG に置き換わります。ハイドレーションの不一致は起きません。フォントが未読み込みなら `document.fonts.load()` で読み込み、完了後に自動的にレイアウトし直します。

`fallback` プロパティで置き換わる前の表示を選べます。

- `"text"`（既定）: 通常のテキストとして表示する。SEO / アクセシビリティ的に有利
- `"hidden"`: 場所だけ確保して見せない
- `"none"`: 視覚的には何も描かず、スクリーンリーダー用のテキストだけを残す

組版後も、スクリーンリーダーと検索エンジンのために元のテキストを視覚的に隠した要素として保持し、SVG は `aria-hidden` にしています。

### 選択とコピー

組版後の SVG のテキストも、通常のテキストと同じように選択してコピーできます。1 つのテキストの中で選択したときは、改行・空白・空行を含む元のテキストがそのままクリップボードに入ります（省略記号まで選択した場合は、切り詰められた残りも含みます）。ページの他の部分にまたがる選択はブラウザ標準のコピーになりますが、段落ごとに `<text>` をまとめているので、1 文字ずつ改行されることはありません。視覚的に隠した元のテキストは選択の対象外（`user-select: none`）にしているので、二重にコピーされることもありません。

SVG の中の 1 文字は `data-run`（run ID）を持つ `<tspan>` です。文字ごとにスタイルを当てるときは `.stone-text svg [data-run]` を対象にしてください（`svg text` は段落全体になります）。

### プロパティ

| プロパティ | 既定値 | 説明 |
| --- | --- | --- |
| `text` / `children` | | 組むテキスト。`children` には `<a>` などの要素も渡せる（リンクと装飾を参照） |
| `direction` | `"lrTb"` | `"lrTb"` 横書き、`"tbRl"` 縦書き |
| `fontSize` | `17` | フォントサイズ（px） |
| `lineHeightScale` | `1` | 行送り（フォントサイズに対する倍率） |
| `letterSpacing` | `0` | 字間（px）。CSS の `letter-spacing` と同じく、各文字の後ろに足す（行末の文字の後ろにも足すので、折り返しや行揃えは行末の字間を含めて計算する）。負の値なら詰める。縦中横の数字の間と「……」「——」の間には足さない |
| `textIndent` / `textIndentEachLine` | `0` / `true` | 段落の 1 行目の字下げ（px）。テキストの先頭の行と改行の直後の行の行頭を下げ、折り返して始まる行は下げない。負の値なら 1 行目が領域の手前に出る。`textIndentEachLine` を `false` にすると、CSS の `text-indent` の既定と同じく、テキストの先頭の行だけを下げる。`punctuationMode` が `stone` / `half` なら、字下げした行頭の始め括弧は字下げの後ろで半角に詰める（字下げが 1em なら、括弧の字面が 1em の位置から始まる） |
| `textAlign` | `"leading"` | `leading` / `center` / `trailing` / `justify`。`justify` は最終行と改行で終わる行を除いて行末をそろえる。余白は文字間に均等に配り、欧文の単語の途中と「……」「——」の間は空けない |
| `directionAlign` | `"start"` | 行送り方向の寄せ（横書きなら上下、縦書きなら左右） |
| `punctuationMode` | `"stone"` | 約物の扱い。`whole` 常に全角、`half` 常に半角、`stone` 前後関係で判断 |
| `kinsoku` | `true` | 行頭・行末禁則（「ー」や小書きの仮名も行頭に置かない強い禁則）と分離禁止（「……」「——」の途中で改行しない） |
| `dividesByWords` | `true` | 単語の途中で改行しない |
| `allowsTateChuYoko` | `true` | 縦書きで 2 桁以下の数字を正体にする |
| `adjustsFontSizeToFitWidth` / `minimumScaleFactor` | `false` / `0` | 収まらないときにフォントを縮小する |
| `fonts` | | 文字種（`latin` / `japanese` / `emoji`）ごとの `{ family, scale, weight, style, ascent, descent }` |
| `width` / `height` | 横書き `"container"` / `"auto"`、縦書き `"auto"` / `"auto"` | レイアウト領域。数値（px）、`"auto"`（制限なし）、`"container"`（コンポーネントの大きさ）。行送り方向（横書きは高さ、縦書きは幅）に収まらない行は表示せず、続きがあるときは最後に表示する文字を省略記号（横書き `…`、縦書き `︙`）にする |
| `color` | `currentColor` | 文字色 |
| `showFrames` | `false` | 各文字の占有矩形を描く（デバッグ用） |
| `fallback` | `"text"` | レイアウト前の表示 |
| `onLayout` | | レイアウト結果（`StoneContext`）を受け取る |

`fonts` の既定値は、和文がヒラギノ角ゴ → Noto Sans JP → 游ゴシック、欧文が Helvetica Neue（スケール 0.95）です。和文フォントのアセント／ディセントは仮想ボディに合わせて 0.88 / 0.12 を使い、欧文はブラウザが返すフォントメトリクスを使います。フォントによって上下位置を調整したい場合は `ascent` / `descent` で上書きできます。ダーシ「—」「―」とリーダー「‥」「…」、縦書きで正立する「‼」「⁉」「※」「†」「‰」などは、欧文の後ろでも和文フォントで組みます。引用符「“」「”」「‘」「’」は、欧文に付くもの（"“Hello”"、"it’s"）は欧文フォント、和文中のものは和文フォントで組みます。

### レイアウト結果を使う

`onLayout` または `useStoneLayout` フックで `StoneContext` が得られます。Swift 版の `STContext` に相当し、文字ごとの `runs`（`char`、`position`、`frame`、`line`、`tokenId` …）と `tokens`、`lineCount`、`renderedSize`、当たり判定の `hitRunIndex(point)` / `closestRunIndex(point)` などを持ちます。

```tsx
import { useRef } from "react";
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
}
```

## React 以外で使う

```ts
import { mountStoneText } from "@non-standardworld/stone-engine.js";

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
import { layoutText, svgString, handleStoneCopy, getSharedCanvasMeasurer } from "@non-standardworld/stone-engine.js";

const layout = layoutText(text, { direction: "tbRl", fontSize: 20 }, getSharedCanvasMeasurer()!, { height: 400 });
element.innerHTML = svgString(layout);
// コピーしたときに元のテキスト（改行・空白を含む）が入るようにする。mountStoneText と StoneSVG は自動で行う
element.addEventListener("copy", (event) => handleStoneCopy(event, layout, element));
```

## オートモード（試験的）

コンポーネントを使わずに、ページの中のふつうの段落や見出しを、CSS で決まった見た目のまま自動で組みます。読み込むのは 1 行です。

```ts
import "@non-standardworld/stone-engine.js/auto";
```

組む範囲には `data-stone` 属性を付けます。その中の `p`、`h1`〜`h6`、`blockquote` が対象です。

```html
<article data-stone>
  <h1>見出し</h1>
  <p>段落の中の<a href="/about">リンク</a>や<strong>太字</strong>も、そのまま組まれます。</p>
</article>
```

`<body data-stone>` と書けばページ全体が範囲になります。範囲の中で組みたくない部分には `data-stone="off"` を付けます。

- フォント、文字サイズ、行送り、行揃え（`text-align`）、字間（`letter-spacing`）、1 行目の字下げ（`text-indent`）、縦書き（`writing-mode: vertical-rl`）は、その要素の CSS から読み取ります。和文も欧文も CSS の `font-family` をそのまま使い、欧文のスケールは 1 です。約物の詰め、禁則、縦中横などはエンジンの既定の設定です（字間を空けた段落でも、「……」「——」の間と縦中横の数字の間は空けません）。
- 元の DOM には触りません。要素に Shadow DOM を付けて、その中に組版結果の SVG を描きます。元の中身はスクリーンリーダーと検索エンジンのためにそのまま残るので、サイトの CSS のセレクターも、React などによる中身の書き換えも、そのまま動きます。React Router での例は `examples/react-router` の `/auto` です。
- CSS の行の高さとベースラインに合わせて置くので、組んでも文字の位置と前後の要素の位置は（改行位置が変わらない限り）動きません。
- 要素の幅の変化、後から追加・変更された要素、Web フォントの読み込みに自動で追従します。画面から遠い要素は、近づいてから組みます。
- HTML のソースの改行や字下げは、CSS と同じ規則で空白にたたみます。和文の途中でソースを改行しても、空白は入りません。
- リンクはそのままクリックでき（SPA のルーターのリンクも動きます）、キーボードのフォーカスには枠を描きます。選択してコピーすると、元のテキストがクリップボードに入ります。複数の要素にまたがる選択では、組んでいないときと同じ HTML も入ります。

### 組まれない要素

エンジンが再現できないものを含む要素は、何もせずに元の表示のまま残します（見た目が変わるくらいなら何もしない、という方針です）。

- ルビ、画像、フォームの部品、`<code>` や `<sup>` のようにフォントや大きさの違う文字、背景や枠のあるインライン要素を含むもの
- `text-transform`、`word-spacing`、`font-feature-settings`（`palt` など）、`text-wrap: balance`、`text-shadow`、段組みなどを使っているもの、`::before` / `::after` で行の中に内容を足しているもの
- 段落の中の一部の要素だけ `letter-spacing` を変えているもの、`text-indent` をパーセントで指定しているものと `hanging` を付けているもの（`letter-spacing` と `text-indent` は、段落全体に px や em で指定したものを組みます）
- 下線・打ち消し線の種類（点線や波線）、太さ、下線の位置（`text-underline-offset`）を指定しているもの、上線を引いているもの（エンジンは実線を、自分で決めた太さと位置に描くため）
- フロートが回り込んでいるもの
- 1 文字も入らないほど幅の狭いもの、幅より大きい `text-indent` を指定しているものなど、組むと文字が入りきらないもの（エンジンは入りきらない文字を隠しますが、CSS は隠さずにはみ出させるので、文字が消えないように元の表示のまま残します。その後で幅が広がっても、中身が変わるか `refresh()` を呼ぶまでは組み直しません）
- `li`、`td`、`dd`、`figcaption` など、Shadow DOM を付けられない要素（既定の対象に含めていません。中に `<p>` があれば、その `<p>` は組まれます）

`<html data-stone-debug>` を付けると、組んだ要素に `data-stone-state="typeset"`、見送った要素に `data-stone-state="skipped"` と理由（`data-stone-reason`）が付きます。

### 設定して使う

範囲や対象、組版オプションを指定するときは、`/auto` を読み込む代わりに `autoStone()` を呼びます。

```ts
import { autoStone } from "@non-standardworld/stone-engine.js";

const auto = autoStone({
  scope: "article", // この中を組む（既定は "[data-stone]"）
  targets: "p, h2, h3", // 組む要素（既定は p / h1〜h6 / blockquote）
  // CSS から読み取った設定に重ねる
  options: { punctuationMode: "half", fonts: { latin: { scale: 0.95 } } },
});

auto.report(); // 見つけた要素と状態（typeset、skipped と理由、queued、waiting）
auto.refresh(); // クラスの切り替えなど、CSS だけを変えたときに読み直す
auto.destroy(); // やめて、元の表示に戻す
```

`options` の `fonts` は、CSS から読み取ったフォントに項目単位で重なります。上の例のように `scale` だけを指定すると、`family` は CSS の `font-family` のままです。`direction` は CSS の `writing-mode` で決まるので、指定できません。

`/auto` で始めた場合は、`import { autoStoneHandle } from "@non-standardworld/stone-engine.js/auto"` で同じものが取れます。

### 今の制限

- 試験的な機能です。Chromium と WebKit（Safari のエンジン）で確認しています。Firefox では確認していません。
- 普通の表示と比べると、かなのカーニングが掛からず、単語の途中では改行しません（`dividesByWords`）。そのため、改行位置が変わることがあります。
- クラスの切り替えのように CSS だけが変わったときは、自動では組み直しません（ウィンドウの大きさの変化と Web フォントの読み込みは追従します）。`refresh()` を呼んでください。
- リンクの `:hover` の色のように、状態で変わる見た目は反映しません。
- ページのスクリプトが `window.getSelection()` で選択範囲を読む機能（選択したテキストの共有ボタンなど）には、組んだ要素の中の選択が正しく伝わりません。Shadow DOM の中の選択は、外からは見えないためです。
- スクリプトの読み込みが最初の描画より遅いと、一瞬だけ普通の表示が見えてから組んだ表示に替わります。

## Swift 版との違い

- 編集機能（`STTextView`、カーソル、選択、ルーペ）は移植していません。表示（`STLabel`）に相当する機能のみです。
- フォントは名前の配列ではなく CSS の `font-family` リストで指定します。グリフ単位のフォールバックはブラウザが行います。
- 縦組み用グリフは GSUB を自前で辿る代わりに、ブラウザの `font-feature-settings` に任せています。ただし Safari と iOS / iPadOS のブラウザ（Apple の WebKit）は横組みの文字列に `vert` を適用しないので、縦組み用グリフが横組みのグリフの回転か平行移動になっている文字（括弧類・「ー」「〜」・ダーシ・リーダー・「、。，．」・小書きの仮名など）を、その変形で描きます。変形の値はヒラギノ角ゴシックの縦組み用グリフを計測したもので、元の文字は置き換えません（コピーやページ内検索はそのままです）。和文中の引用符「“」「”」は〝〟の形にはならず、CSS の縦書きと同じく横倒しになります。描き方は `StoneSVG` / `svgString` / `mountStoneText` の `verticalForms`（`"auto"` 既定、`"feature"`、`"emulated"`）で固定できます。
- `Intl.Segmenter` が無い環境では単語分割が書記素分割にフォールバックします（`dividesByWords: false` 相当）。
- 元実装の明らかな不具合をいくつか修正しています（禁則の追い出し単位、行頭約物の二重詰め、均等配置の余り、縦書き均等配置での 1 桁縦中横、縦書きの折り返しでの縦中横・半角カナ・欧文の単語の長さの見積もり、禁則の追い出しで縦書きの列の先頭の縦中横が 2 つの列に分かれる問題、半角と全角の数字が混ざった 2 桁の数字（「1２」「２1」）で縦書きの列がずれて切り詰められる問題、`directionAlign: middle` のずれ）。半角と全角の数字が混ざった 2 桁の数字は縦中横にせず、3 桁以上の数字と同じように 1 文字ずつ送ります（半角の数字は回転し、全角の数字は正立します）。詳細は `src/layout.ts` 冒頭のコメントを参照してください。
- 均等配置（`textAlign: "justify"`）の余白は、トークン（単語）間ではなく文字間に配ります。元実装のようにトークン間にだけ配ると、`dividesByWords` が有効なときに文節ごとに大きな空きができて日本語の本文としては不自然になるためです。欧文の単語の途中（空白を挟まない欧文どうし）、縦中横の途中、「……」「——」の間は空けず、行末の空白は幅 0 にして除きます。
- ダーシ「—」「―」とリーダー「‥」「…」は和文として扱い、縦書きでは回転させずに縦組み用グリフで列の中央に描きます。Swift 版は欧文として扱うため、縦書きでは欧文フォントのまま 90 度回転し、点が列の左寄りに並んで「——」も切れていました。あわせて、分離禁止文字（「—」「―」「‥」「…」「〳」「〴」「〵」）が続く間では改行しません（`kinsoku` が有効なとき）。
- 一般句読点のうち、UTR #50 で縦書きに正立（U）とされ JIS X 0213 にある「‼」「⁇」「⁈」「⁉」「※」「†」「‡」「‰」「‖」「⁂」「⁑」も和文として扱い、縦書きでは CSS（`writing-mode: vertical-rl`）と同じく回転させずに描きます（「‖」は縦組み用グリフの「═」）。横書きでも和文フォントの全角で組みます。Swift 版は欧文として扱うため、縦書きでは欧文フォントのまま 90 度回転し、「※」は欧文のスケール 0.95 で小さくなっていました。「‱」は和文フォントにないので欧文のままです（縦書きでは回転します）。縦中横は従来どおり 2 桁以下の数字だけなので、2 文字の「!?」は回転します。正立させたいときは「⁉」を使ってください。
- 引用符「“」「”」「‘」「’」は、前後の文字で文字種を決めます。始めの引用符（“ ‘）は後ろ、終わりの引用符（” ’）は前の文字が欧文フォントの文字なら欧文（"“Hello”"、"it’s"、和文中の「“OK”」）、それ以外は和文です。和文の引用符は和文フォントで組み、縦書きでは全角の字形の縦組み用グリフ（〝〟の形、`font-feature-settings: "fwid" 1, "vert" 1, "vrt2" 1`）で 1em 送ります。和文フォント（ヒラギノなど）の「“」などは字幅の詰まったプロポーショナルな字形で、縦組み用グリフがないためです。横書きはそのプロポーショナルな字形のままです。欧文の引用符は従来どおり縦書きで回転します。Swift 版はすべて欧文として扱うため、和文中の引用符も縦書きで欧文フォントのまま回転し、送りが約 0.4em に詰まっていました。なお CSS（`writing-mode: vertical-rl`）は和文フォントの引用符を正立させますが、Chromium は横書きの形のまま列の中央に 1em 送りで、Safari は送りを字幅に詰めて描くので、縦書きの和文中の見た目は CSS と違います。
- 行頭禁則は、JLREQ の行頭禁則の文字クラス（終わり括弧類・ハイフン類・区切り約物・中点類・句点類・読点類・繰返し記号・長音記号・小書きの仮名）をすべて含む強い禁則です（JLREQ 付録 C.3 のレベル 4、CSS の `line-break: strict` に相当）。Swift 版の集合は「？!‼」「。.」のように ASCII の「!」「.」を 2 回ずつ書いていて全角の「！」「．」がなく、「，」「：」「；」「・」もなかったため、これらが行頭に来ていました。あわせて「ー」「ゝ」「ゞ」「‐」「〜」「゠」「–」「}」「⦆」も行頭に置きません（Swift 版は小書きの仮名と「々」を行頭禁則にする一方で、「ー」などは行頭に来ていました）。ブラウザの既定（`line-break: auto`）は「ー」と小書きの仮名を行頭に置くので、同じ幅でも改行位置が違うことがあります。
- 字間（`letterSpacing`）と段落の 1 行目の字下げ（`textIndent`）は、Swift 版にない追加です。どちらも CSS の `letter-spacing` / `text-indent` と同じ位置に組めるようにしたもので、指定しなければ挙動は変わりません。字間は各文字の後ろに足し、行末の字間も含めて折り返しと行揃えを計算します（中央寄せと行末寄せでは、CSS と同じく行末側に字間 1 つぶんの空きが残ります）。字下げは改行の直後の行にも入れます（CSS の `each-line` に相当。`textIndentEachLine: false` で CSS の既定と同じになります）。

## 開発

```bash
npm install          # 依存の取得とビルド
npm test             # ユニットテスト（vitest）
npm run build        # dist/ を生成
npm run example      # examples/react-router のデモを起動
npm run example:auto # examples/auto（オートモードの静的 HTML のデモ）を起動
```

`examples/react-router` は React Router（framework mode、SSR 有効）でこのパッケージを使う最小構成です。`/auto` はオートモードのデモです。
`examples/auto` は、静的な HTML にスクリプトを 1 行足すだけのオートモードのデモです。

`site/` はドキュメントサイト（Vite + React）で、`npm run site` で開発サーバーが起動します。`main` に push すると GitHub Actions（`.github/workflows/pages.yml`）が GitHub Pages にデプロイします。

## ライセンス

MIT License。オリジナルの著作権は Nihon Design Center に帰属します。[LICENSE](./LICENSE) を参照してください。
