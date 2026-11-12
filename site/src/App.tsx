import { StoneText, type StoneTextProps } from "@non-standardworld/stone-engine.js/react";
import { CodeBlock } from "./CodeBlock";
import { Playground } from "./Playground";
import { PromoVideo } from "./PromoVideo";
import { Sample } from "./Sample";
import * as S from "./snippets";

const REPO = "https://github.com/non-standardworld/stone_engine_js";

const HERO = `紙ではなく、画面のための日本語組版。
縦書き、禁則、約物、縦中横。
stone-engine.jsは、それらをWebフォントのまま、ブラウザの上で組み直す。`;

const SERIF = { japanese: { family: '"Noto Serif JP", "Hiragino Mincho ProN", serif' } };
const SANS = { japanese: { family: '"Noto Sans JP", "Hiragino Sans", sans-serif' } };

const KINSOKU_TEXT = "行頭に「、」や「。」を置かない。長いコーヒーやチョコレートの「ー」や「ョ」も行頭に来ない。三点リーダー「……」も分けない。";
const PUNCT_TEXT = "「約物」の連続（『』）は、モードで詰まり方が変わる。";
const ALIGN_TEXT =
  "均等配置では、最終行を除いて文字の間を均等に広げ、行末を揃える。日本語と English が混ざっていても、欧文の単語の途中は空けない。";
const TRUNCATE_TEXT =
  "領域に収まらない行は表示せず、続きがあるときは最後に表示する文字を省略記号にする。途中まで見える行も隠すので、省略記号はいつも 1 つだけになる。";
const JAPANESE_PUNCTUATION_TEXT = "「待って……」と言った——“了解”‼ ※欧文の“Hello”は回転する。";
const INDENT_TEXT = "段落の1行目を1字下げる。折り返して始まる行は下げない。\n「括弧で始まる段落」も、字面が1字ぶん下がる。";
const SPACING_TEXT = "字間を空けて組む。禁則や約物の詰めはそのまま働き、「……」の間は空けない。";

/** children に要素を渡すサンプル。リンク・文字色・下線・打ち消し線・太字・斜体を組む。 */
function RichText(props: Omit<StoneTextProps, "children" | "text">) {
  return (
    <StoneText fontSize={17} lineHeightScale={1.9} fonts={SANS} {...props}>
      詳しくは
      <a href={REPO} target="_blank" rel="noreferrer">
        GitHub
      </a>
      へ。<span style={{ color: "#2f6f9f" }}>文字色</span>や<u>下線</u>、<s>打ち消し線</s>、<strong>太字 Bold</strong>、
      <em>斜体 Italic</em>も組める。
    </StoneText>
  );
}

/** ドキュメントサイト本体。 */
export function App() {
  return (
    <>
      <header className="nav">
        <div className="wrap">
          <a className="nav__brand" href="#top">
            stone-engine.js
          </a>
          <nav className="nav__links">
            <a href="#features">できること</a>
            <a href="#usage">使い方</a>
            <a href="#api">API</a>
            <a href="#playground">プレイグラウンド</a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main className="wrap" id="top">
        <section className="hero">
          <div>
            <p className="hero__kicker">JAPANESE TYPESETTING FOR THE WEB</p>
            <h1>
              縦書きも禁則も、
              <br />
              Web フォントのまま組む。
            </h1>
            <p>
              stone-engine.js は、iOS 向け日本語組版エンジン{" "}
              <a href="https://github.com/ndc-stone/stone_engine" target="_blank" rel="noreferrer">
                stone_engine
              </a>{" "}
              の JavaScript / TypeScript 移植です。レイアウトはエンジンが 1 文字ずつ決め、描画はブラウザのフォントレンダリングに任せます。
            </p>
            <p>React コンポーネントを同梱し、React Router や Next.js のサーバーサイドレンダリングでもそのまま使えます。</p>
            <div className="hero__actions">
              <a className="button button--primary" href="#usage">
                使い方を見る
              </a>
              <a className="button" href="#playground">
                プレイグラウンド
              </a>
              <code>npm install @non-standardworld/stone-engine.js</code>
            </div>
          </div>
          <div className="hero__vertical">
            <StoneText
              text={HERO}
              direction="tbRl"
              height="container"
              width="auto"
              fontSize={21}
              lineHeightScale={2.1}
              fonts={SERIF}
              style={{ height: "100%" }}
            />
          </div>
        </section>

        <section className="section" id="movie">
          <PromoVideo />
        </section>

        <section className="section" id="features">
          <h2>できること</h2>
          <p className="lead">
            すべてこのページ上で実際に組まれています。文字にマウスを乗せると赤くなるのは、1 文字ずつが SVG の要素になっているからです。
          </p>
          <div className="samples">
            <Sample
              title="縦書きと縦中横"
              description="2 桁以下の数字は正体で並べ、3 桁以上の数字と英字は 90 度回転します。句読点や括弧は縦組み用のグリフに置き換わります。"
              code={S.TATE_CHU_YOKO}
              vertical
            >
              <StoneText
                direction="tbRl"
                height={280}
                fontSize={18}
                lineHeightScale={1.9}
                fonts={SERIF}
                text="令和6年12月31日、Ver.2.0を公開した。数字は2桁まで縦中横、3桁以上の123と英字は回転する。"
              />
            </Sample>

            <Sample
              title="禁則処理"
              description="句読点や閉じ括弧を行頭に、開き括弧を行末に置きません。「ー」や小書きの仮名、全角の「！」「・」も行頭に置かない強い禁則（CSS の line-break: strict 相当）で、「……」「——」の途中でも改行しません。"
              code={S.KINSOKU}
            >
              <div className="sample__row">
                <div className="sample__col">
                  <div className="sample__label">kinsoku（既定）</div>
                  <StoneText width={220} fontSize={16} lineHeightScale={1.8} fonts={SANS} dividesByWords={false} text={KINSOKU_TEXT} />
                </div>
                <div className="sample__col">
                  <div className="sample__label">kinsoku={"{false}"}</div>
                  <StoneText width={220} fontSize={16} lineHeightScale={1.8} fonts={SANS} dividesByWords={false} kinsoku={false} text={KINSOKU_TEXT} />
                </div>
              </div>
            </Sample>

            <Sample
              title="字間と字下げ"
              description="字間と、段落の 1 行目の字下げを、CSS の letter-spacing / text-indent と同じ位置に組みます。字下げは改行の直後の行にも入り、字下げした行頭の始め括弧は半角に詰めます。字間は「……」の間と縦中横の数字の間には入りません。"
              code={S.SPACING}
            >
              <div className="sample__row">
                <div className="sample__col">
                  <div className="sample__label">textIndent={"{16}"}</div>
                  <StoneText width={220} fontSize={16} lineHeightScale={1.8} fonts={SANS} textIndent={16} text={INDENT_TEXT} />
                </div>
                <div className="sample__col">
                  <div className="sample__label">letterSpacing={"{3}"}</div>
                  <StoneText width={220} fontSize={16} lineHeightScale={1.8} fonts={SANS} letterSpacing={3} text={SPACING_TEXT} />
                </div>
              </div>
            </Sample>

            <Sample
              title="約物の詰め"
              description="句読点や括弧の連続を半角にします。stone モードは前後の文字を見て、自然に見えるところだけ詰めます。行頭の始め括弧は、どの行でも（1 行だけのテキストや最後の行でも）半角に詰め、折り返すかどうかは詰めたあとの長さで判断します。"
              code={S.PUNCTUATION}
              wide
            >
              <div className="sample__row">
                {(["whole", "half", "stone"] as const).map((mode) => (
                  <div className="sample__col" key={mode}>
                    <div className="sample__label">punctuationMode="{mode}"</div>
                    <StoneText width={300} fontSize={17} lineHeightScale={1.8} fonts={SERIF} punctuationMode={mode} text={PUNCT_TEXT} />
                  </div>
                ))}
              </div>
            </Sample>

            <Sample
              title="文字種ごとのフォントとスケール"
              description="和文・欧文・絵文字ごとにフォントとスケールを指定できます。ここでは欧文を Georgia にし、0.9 倍にしています。"
              code={S.FONTS}
            >
              <StoneText
                fontSize={17}
                lineHeightScale={1.9}
                fonts={{
                  japanese: { family: '"Noto Serif JP", serif' },
                  latin: { family: "Georgia, serif", scale: 0.9 },
                }}
                text="日本語の中に English や 2024 を混ぜても、文字種ごとにフォントとスケールを選べる。"
              />
            </Sample>

            <Sample
              title="リンクと装飾"
              description="children に <a> や <strong> などの要素を渡すと、リンク・文字色・下線・打ち消し線・太字・斜体を CSS で決まった見た目のまま組みます。太字は太字のフォントで送り幅を測るので、隣の文字と重なりません。リンクはクリックできます。"
              code={S.RICH_TEXT}
              wide
            >
              <div className="sample__row">
                <div className="sample__col">
                  <div className="sample__label">横書き</div>
                  <RichText width={300} />
                </div>
                <div className="sample__col">
                  <div className="sample__label">direction="tbRl"</div>
                  <RichText direction="tbRl" height={240} style={{ width: "fit-content", marginLeft: "auto" }} />
                </div>
              </div>
            </Sample>

            <Sample
              title="文字寄せ"
              description="行頭・中央・行末・均等。均等配置は最終行と改行で終わる行を除き、余白を文字間に均等に配ります。欧文の単語の途中と「……」「——」の間は空けません。"
              code={S.ALIGN}
            >
              <StoneText width={300} fontSize={15} lineHeightScale={1.9} fonts={SANS} textAlign="justify" text={ALIGN_TEXT} />
            </Sample>

            <Sample
              title="ダーシ・リーダー・引用符"
              description="「……」「——」や「‼」「※」は欧文の後ろでも和文フォントで組み、縦書きでは回転させずに列の中央に描きます。引用符は欧文に付けば欧文、和文中なら和文として組みます。"
              code={S.JAPANESE_PUNCTUATION}
              vertical
            >
              <StoneText
                direction="tbRl"
                height={280}
                fontSize={18}
                lineHeightScale={1.9}
                fonts={SERIF}
                text={JAPANESE_PUNCTUATION_TEXT}
              />
            </Sample>

            <Sample
              title="切り詰めと省略記号"
              description="行送り方向（横書きは高さ、縦書きは幅）に収まらない行は表示せず、最後に表示する文字を省略記号にします。縦書きでは正立の「︙」を描きます。"
              code={S.TRUNCATE}
            >
              <div className="sample__row">
                <div className="sample__col">
                  <div className="sample__label">height={"{84}"}</div>
                  <StoneText width={260} height={84} fontSize={15} lineHeightScale={1.8} fonts={SANS} text={TRUNCATE_TEXT} />
                </div>
                <div className="sample__col">
                  <div className="sample__label">direction="tbRl" width={"{96}"}</div>
                  <StoneText
                    direction="tbRl"
                    width={96}
                    height={220}
                    fontSize={15}
                    lineHeightScale={1.8}
                    fonts={SANS}
                    text={TRUNCATE_TEXT}
                  />
                </div>
              </div>
            </Sample>

            <Sample
              title="レイアウト情報に触れる"
              description="1 文字ごとの位置・矩形・行番号が取り出せます。showFrames は各文字の占有矩形を描きます。"
              code={S.FRAMES}
            >
              <StoneText fontSize={22} lineHeightScale={1.8} fonts={SERIF} showFrames text="文字ごとの位置と矩形が取れる。" />
            </Sample>
          </div>
        </section>

        <section className="section" id="usage">
          <h2>使い方</h2>
          <p className="lead">npm パッケージとしてインストールし、React なら {"<StoneText>"} を置くだけです。</p>

          <h3>インストール</h3>
          <CodeBlock code={S.INSTALL} />

          <h3>React で使う</h3>
          <p>
            <code>@non-standardworld/stone-engine.js/react</code> から <code>StoneText</code> を読み込みます。幅は既定でコンポーネント自身の幅に合わせて折り返します。
          </p>
          <CodeBlock code={S.QUICK_START} />

          <h3>縦書き</h3>
          <p>
            <code>direction="tbRl"</code> を指定し、折り返しの基準になる高さを与えます。幅は内容に合わせて左に伸びるので、右に寄せたいときはコンテナ側で <code>display: flex; justify-content: flex-end</code> などを指定します。
          </p>
          <CodeBlock code={S.VERTICAL} />

          <h3>字間と字下げ</h3>
          <p>
            <code>letterSpacing</code>（字間）と <code>textIndent</code>（段落の 1 行目の字下げ）は、CSS の <code>letter-spacing</code> / <code>text-indent</code> と同じ位置に組みます。どちらも px で指定します。
          </p>
          <ul>
            <li>
              字間は各文字の後ろに足します。行末の文字の後ろにも足すので、折り返しと行揃えは行末の字間を含めて計算します。負の値なら詰まります。縦中横の数字の間と「……」「——」の間には足しません。
            </li>
            <li>
              字下げは、テキストの先頭の行と改行の直後の行に入り、折り返して始まる行には入りません。<code>textIndentEachLine={"{false}"}</code> にすると、CSS の <code>text-indent</code> の既定と同じく、テキストの先頭の行だけを下げます。
            </li>
            <li>
              <code>punctuationMode</code> が <code>stone</code> / <code>half</code> なら、字下げした行頭の始め括弧は字下げの後ろで半角に詰めます。字下げが 1em なら、括弧の字面が 1em の位置から始まります。
            </li>
          </ul>
          <CodeBlock code={S.SPACING_USAGE} />

          <h3>リンクと装飾</h3>
          <p>
            <code>children</code> には <code>{"<a>"}</code> や React Router の <code>{"<Link>"}</code>、<code>{"<span style>"}</code>、<code>{"<u>"}</code>、<code>{"<s>"}</code>、<code>{"<strong>"}</code>、<code>{"<em>"}</code> などの要素も渡せます。要素の中のテキストも組み、リンク、親と違う文字色、下線・打ち消し線（<code>text-decoration-line</code>）、太さ・スタイル（<code>font-weight</code> / <code>font-style</code>）を SVG に反映します。
          </p>
          <ul>
            <li>
              リンクは SVG の <code>{"<a>"}</code> になり、クリックすると元の <code>{"<a>"}</code> をクリックしたことになるので、<code>{"<Link>"}</code> のクライアント側の遷移もそのまま動きます。キーボードのフォーカスは元の <code>{"<a>"}</code> が受け、SVG 側に枠を描きます。
            </li>
            <li>下線・打ち消し線は行ごとに矩形で描きます。縦書きの下線は列の右（傍線）に引きます。</li>
            <li>
              太字・斜体の文字は、文字種のフォントの太さ・スタイルだけを変えたフォントで送り幅を測って組みます。斜体は縦書きでも横書きと同じ向きに傾きます。
            </li>
            <li>
              <code>{"<br>"}</code> は改行になり、<code>{"<rt>"}</code>（ルビの読み）は組みません。読み取るのは <code>children</code> の中の DOM が変わったときだけなので、外側のスタイルシートだけを変えたときは <code>key</code> を変えて作り直してください。
            </li>
          </ul>
          <CodeBlock code={S.RICH_TEXT_USAGE} />
          <p>
            React 以外では、<code>readStoneSource(element)</code> で HTML の要素からテキストと範囲（<code>spans</code>）を読み取り、<code>mountStoneText</code> に渡します。
          </p>
          <CodeBlock code={S.RICH_TEXT_VANILLA} />

          <h3>サーバーサイドレンダリング</h3>
          <p>
            サーバーでは通常のテキストを描画し、クライアントでフォントの計測ができた時点で組版結果の SVG に置き換わります。ハイドレーションの不一致は起きません。Web フォントが未読み込みなら <code>document.fonts.load()</code> で読み込み、完了後に自動的にレイアウトし直します。
          </p>
          <CodeBlock code={S.SSR} />

          <h3>選択とコピー</h3>
          <p>
            組版後の SVG のテキストも、通常のテキストと同じように選択してコピーできます。1 つのテキストの中で選択したときは、改行・空白・空行を含む元のテキストがそのままクリップボードに入ります（省略記号まで選択した場合は、切り詰められた残りも含みます）。ページの他の部分にまたがる選択はブラウザ標準のコピーになりますが、段落ごとに <code>{"<text>"}</code> をまとめているので、1 文字ずつ改行されることはありません。
          </p>
          <p>
            SVG の中の 1 文字は <code>data-run</code>（run ID）を持つ <code>{"<tspan>"}</code> です。文字ごとにスタイルを当てるときは <code>.stone-text svg [data-run]</code> を対象にしてください。
          </p>
          <CodeBlock code={S.COPY} />

          <h3>ページの CSS との関係</h3>
          <p>
            ページの CSS のうち、継承されると SVG の文字の位置・向き・字形が変わるもの（<code>writing-mode</code>、<code>direction</code>、<code>text-transform</code>、<code>font-feature-settings</code>、<code>font-variant-*</code>、<code>font-stretch</code>、<code>font-size-adjust</code>、<code>font-variation-settings</code> など）は、組版結果の <code>{"<svg>"}</code> で初期値に戻しています。文字の位置はエンジンが 1 文字ずつ決め、送り幅はページの CSS が効かない Canvas で測っているので、SVG にだけ指定が届くと、描いた文字が測った結果と食い違うためです。たとえば <code>{'body { font-feature-settings: "palt" }'}</code> と指定しているページでも、組んだ文字には効きません（約物の詰めはエンジンが行います）。
          </p>
          <p>
            使いたい指定は <code>{"<svg>"}</code> に付け直せます。ただし、送り幅が変わる指定は、位置が測った幅のままなので文字の間隔がずれます。エンジンが <code>font-feature-settings</code> を指定している文字（Chromium などで縦組み用グリフに置き換えている縦書きの和文）には効きません。
          </p>
          <CodeBlock code={S.CSS_RESET} />

          <h3>レイアウト結果を使う</h3>
          <p>
            <code>useStoneLayout</code> フックは Swift 版の <code>STContext</code> に相当する <code>StoneContext</code> を返します。文字ごとの <code>runs</code>、<code>tokens</code>、<code>lineCount</code>、<code>renderedSize</code>、当たり判定の <code>hitRunIndex()</code> / <code>closestRunIndex()</code> などが使えます。
          </p>
          <CodeBlock code={S.HOOK} />

          <h3>React 以外で使う</h3>
          <p>
            <code>mountStoneText()</code> は DOM 要素の中に SVG を描画し、要素の大きさが変わると自動的にレイアウトし直します。Vue / Svelte / Astro などからも使えます。
          </p>
          <CodeBlock code={S.VANILLA} />

          <h3>低レベル API</h3>
          <p>
            <code>layoutText()</code> に計測器を渡して <code>StoneContext</code> を受け取り、<code>svgString()</code> で SVG 文字列にできます。計測器は <code>FontMeasurer</code> インターフェースなので、フォントファイルから計測する実装に差し替えればサーバー側で組版することもできます。
          </p>
          <CodeBlock code={S.LOW_LEVEL} />
        </section>

        <section className="section" id="api">
          <h2>API</h2>
          <p className="lead">{"<StoneText>"} のプロパティ。レイアウト設定は Swift 版の STLabel と同じ名前で揃えています。</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>プロパティ</th>
                  <th>既定値</th>
                  <th>説明</th>
                </tr>
              </thead>
              <tbody>
                {S.PROPS.map((row) => (
                  <tr key={row.name}>
                    <td>
                      <code>{row.name}</code>
                    </td>
                    <td>{row.def ? <code>{row.def}</code> : ""}</td>
                    <td>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 16 }}>
            <code>fonts</code> の既定値は、和文がヒラギノ角ゴ → Noto Sans JP → 游ゴシック、欧文が Helvetica Neue（スケール 0.95）です。和文フォントのアセント／ディセントは仮想ボディに合わせて 0.88 / 0.12 を使い、欧文はブラウザが返すフォントメトリクスを使います。絵文字は、アセントはブラウザが返す値、ディセントは和文と同じ 0.12 を使います（ディセントは、縦書きで文字を列の中のどこに置くかを決めます）。フォントによって上下位置を調整したい場合は <code>ascent</code> / <code>descent</code> で上書きできます。ダーシ「—」「―」とリーダー「‥」「…」、縦書きで正立する「‼」「⁉」「※」「†」「‰」などは、欧文の後ろでも和文フォントで組みます。引用符「“」「”」「‘」「’」は、欧文に付くもの（“Hello”、it’s）は欧文フォント、和文中のものは和文フォントで組みます。
          </p>
        </section>

        <section className="section" id="playground">
          <h2>プレイグラウンド</h2>
          <p className="lead">設定を変えて試せます。文字をクリックすると、その文字のレイアウト情報を表示します。</p>
          <Playground />
        </section>

        <section className="section" id="notes">
          <h2>Swift 版との違いと制限</h2>
          <ul className="notes">
            <li>編集機能（STTextView、カーソル、選択、ルーペ）は移植していません。表示（STLabel）に相当する機能のみです。</li>
            <li>フォントは名前の配列ではなく CSS の font-family リストで指定します。グリフ単位のフォールバックはブラウザが行います。</li>
            <li>
              縦組み用グリフは GSUB を自前で辿る代わりに、ブラウザの font-feature-settings に任せています。vert が効かない Safari などの WebKit では、括弧・句読点・小書きの仮名などを横組みのグリフの回転と移動で描きます（<code>verticalForms</code> で描き方を固定できます）。
            </li>
            <li>
              縦書きの半角カナ（「ｱ」「ｰ」「｡」「ｶﾞ」など）は、どのブラウザでも横組みのグリフを 90 度回して描きます。CSS の縦書きと同じ横倒しで、濁点・半濁点は文字の下に付き、隣の列には出ません。ほかの正立の文字と同じく 1 文字ごとに列を 1em 送るので（CSS の縦書きは 0.5em 送り）、1 文字ごとに 0.5em の空きができます。
            </li>
            <li>Intl.Segmenter が無い環境では単語分割が書記素分割にフォールバックします。</li>
            <li>
              均等配置の余白は、トークン（単語）間ではなく文字間に配ります。トークン間にだけ配ると、日本語の本文で文節ごとに大きな空きができるためです。
            </li>
            <li>
              切り詰めは行単位で、領域に完全に収まる行だけを表示し、省略記号は 1 つだけにします。省略記号は領域に収め、縦書きでは正立の「︙」を列の位置に描きます。
            </li>
            <li>
              縦書きの列を寄せる位置と、幅を決めないときの幅は、列の 1em の箱で決めます。1 桁の縦中横、半角カナ、送り幅が 1em でない絵文字だけの列が端にあっても、列の箱が領域の端にそろい、幅を決めないときの幅も列数ぶんになります。2 桁の縦中横は 1em より少し広いので（既定のフォントで約 1.06em）、列が幅に収まるかどうかも列の 1em の箱で見ます。幅が列数ちょうどでも最後の列は切り詰めず、端の列では数字が領域からわずかにはみ出すことがあります。
            </li>
            <li>
              縦書きの絵文字と、文字種が絵文字の記号（「★」「♪」など）は、列の中で和文と同じ位置（ベースラインが 1 文字ぶんのますの下端から 0.12em 上）に置きます。Swift 版と同じ「ますの下端 − フォントのディセント」のままブラウザで組むと、絵文字が列の手前に出て前の文字に重なるためです。Apple Color Emoji で確かめた値なので、ほかの絵文字フォントで位置が合わないときは <code>fonts.emoji.descent</code> で調整してください。
            </li>
            <li>
              ダーシ「—」「―」とリーダー「‥」「…」、縦書きで正立する「‼」「⁉」「※」「†」「‰」などは和文として扱い、縦書きでは回転させずに描きます。Swift 版は欧文として扱うため、縦書きでは欧文フォントのまま 90 度回転していました。分離禁止文字（「—」「―」「‥」「…」「〳」「〴」「〵」）が続く間では改行しません。
            </li>
            <li>
              引用符「“」「”」「‘」「’」は前後の文字で文字種を決め、和文中のものは和文フォントで組みます。縦書きでは全角の字形の縦組み用グリフ（〝〟の形）で 1em 送ります。
            </li>
            <li>
              行頭禁則は JLREQ の行頭禁則の文字クラスをすべて含む強い禁則です（CSS の line-break: strict 相当）。全角の「！」「．」「，」「：」「；」「・」や「ー」「ゝ」「ゞ」「〜」も行頭に置きません。ブラウザの既定（line-break: auto）とは改行位置が違うことがあります。
            </li>
            <li>
              組版した SVG を選択してコピーしても 1 文字ずつ改行されず、元のテキストがそのままコピーされます。
            </li>
            <li>
              点にいちばん近い文字位置を返す <code>closestRunIndex()</code> と、行の先頭位置を返す <code>firstRunFrame()</code> は、行送り方向に寄せたあとの行の位置で求めます。Swift 版は寄せる前の位置で行を選ぶため、寄せた量が行送りより大きいと、点とは違う行（縦書きは列）の文字位置を返します。
            </li>
            <li>
              字間（<code>letterSpacing</code>）と段落の 1 行目の字下げ（<code>textIndent</code>）は、Swift 版にない追加です。CSS の letter-spacing / text-indent と同じ位置に組めるようにしたもので、指定しなければ挙動は変わりません。
            </li>
            <li>
              半角と全角の数字が混ざった 2 桁の数字（「1２」「２1」）は縦中横にせず、3 桁以上の数字と同じように 1 文字ずつ送ります（半角の数字は回転し、全角の数字は正立します）。
            </li>
            <li>
              ほかにも元実装の明らかな不具合（禁則の追い出し単位、行頭約物の二重詰め、行頭の始め括弧を半角にする前の長さで折り返しを判定するため、折り返さずに組んだ長さの領域に組み直すと行が増える問題、均等配置の余り、縦書き均等配置での 1 桁縦中横、縦書きの折り返しでの縦中横・半角カナ・欧文の単語の長さの見積もり、禁則の追い出しで縦書きの列の先頭の縦中横が 2 つの列に分かれる問題、directionAlign: middle のずれ）を修正しています。詳細は{" "}
              <a href={`${REPO}/blob/main/src/layout.ts`} target="_blank" rel="noreferrer">
                src/layout.ts
              </a>{" "}
              冒頭のコメントを参照してください。
            </li>
          </ul>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <p>
            移植担当：
            <a href="https://www.non-standardworld.co.jp/" target="_blank" rel="noreferrer">
              non-standard world株式会社
            </a>
          </p>
          <p>
            MIT License. オリジナルの stone_engine の著作権は Nihon Design Center に帰属します。{" "}
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </p>
        </div>
      </footer>
    </>
  );
}
