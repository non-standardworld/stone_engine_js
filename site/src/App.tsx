import { StoneText } from "@non-standardworld/stone-engine/react";
import { CodeBlock } from "./CodeBlock";
import { Playground } from "./Playground";
import { Sample } from "./Sample";
import * as S from "./snippets";

const REPO = "https://github.com/non-standardworld/stone_engine_js";

const HERO = `紙ではなく、画面のための日本語組版。
縦書き、禁則、約物、縦中横。
stone-engineは、それらをWebフォントのまま、ブラウザの上で組み直す。`;

const SERIF = { japanese: { family: '"Noto Serif JP", "Hiragino Mincho ProN", serif' } };
const SANS = { japanese: { family: '"Noto Sans JP", "Hiragino Sans", sans-serif' } };

const KINSOKU_TEXT = "行頭に「、」や「。」を置かない。行末に「「」を置かない。これが禁則処理である。";
const PUNCT_TEXT = "「約物」の連続（『』）は、モードで詰まり方が変わる。";
const ALIGN_TEXT =
  "均等配置では、最終行を除いて単語の間を広げ、行末を揃える。日本語と English が混ざっていても、単語の境界で調整する。";

/** ドキュメントサイト本体。 */
export function App() {
  return (
    <>
      <header className="nav">
        <div className="wrap">
          <a className="nav__brand" href="#top">
            stone-engine
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
              stone-engine は、iOS 向け日本語組版エンジン{" "}
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
              <code>npm install github:non-standardworld/stone_engine_js</code>
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
              description="句読点や閉じ括弧を行頭に、開き括弧を行末に置きません。単語単位で行末を戻します。"
              code={S.KINSOKU}
            >
              <div className="sample__row">
                <div className="sample__col">
                  <div className="sample__label">kinsoku（既定）</div>
                  <StoneText width={220} fontSize={16} lineHeightScale={1.8} fonts={SANS} text={KINSOKU_TEXT} />
                </div>
                <div className="sample__col">
                  <div className="sample__label">kinsoku={"{false}"}</div>
                  <StoneText width={220} fontSize={16} lineHeightScale={1.8} fonts={SANS} kinsoku={false} text={KINSOKU_TEXT} />
                </div>
              </div>
            </Sample>

            <Sample
              title="約物の詰め"
              description="句読点や括弧の連続を半角にします。stone モードは前後の文字を見て、自然に見えるところだけ詰めます。"
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

            <Sample title="文字寄せ" description="行頭・中央・行末・均等。均等配置は最終行と改行で終わる行を除きます。" code={S.ALIGN}>
              <StoneText width={320} fontSize={15} lineHeightScale={1.9} fonts={SANS} textAlign="justify" text={ALIGN_TEXT} />
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
            <code>@non-standardworld/stone-engine/react</code> から <code>StoneText</code> を読み込みます。幅は既定でコンポーネント自身の幅に合わせて折り返します。
          </p>
          <CodeBlock code={S.QUICK_START} />

          <h3>縦書き</h3>
          <p>
            <code>direction="tbRl"</code> を指定し、折り返しの基準になる高さを与えます。幅は内容に合わせて左に伸びるので、右に寄せたいときはコンテナ側で <code>display: flex; justify-content: flex-end</code> などを指定します。
          </p>
          <CodeBlock code={S.VERTICAL} />

          <h3>サーバーサイドレンダリング</h3>
          <p>
            サーバーでは通常のテキストを描画し、クライアントでフォントの計測ができた時点で組版結果の SVG に置き換わります。ハイドレーションの不一致は起きません。Web フォントが未読み込みなら <code>document.fonts.load()</code> で読み込み、完了後に自動的にレイアウトし直します。
          </p>
          <CodeBlock code={S.SSR} />

          <h3>レイアウト結果を使う</h3>
          <p>
            <code>useStoneLayout</code> フックは Swift 版の <code>STContext</code> に相当する <code>StoneContext</code> を返します。文字ごとの <code>runs</code>、<code>tokens</code>、<code>lineCount</code>、<code>renderedSize</code>、当たり判定の <code>hitRunIndex()</code> などが使えます。
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
            <code>fonts</code> の既定値は、和文がヒラギノ角ゴ → Noto Sans JP → 游ゴシック、欧文が Helvetica Neue（スケール 0.95）です。和文フォントのアセント／ディセントは仮想ボディに合わせて 0.88 / 0.12 を使い、欧文はブラウザが返すフォントメトリクスを使います。フォントによって上下位置を調整したい場合は <code>ascent</code> / <code>descent</code> で上書きできます。
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
            <li>縦組み用グリフは GSUB を自前で辿る代わりに、ブラウザの font-feature-settings に任せています。</li>
            <li>Intl.Segmenter が無い環境では単語分割が書記素分割にフォールバックします。</li>
            <li>
              元実装の明らかな不具合をいくつか修正しています。詳細は{" "}
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
          MIT License. オリジナルの stone_engine の著作権は Nihon Design Center に帰属します。{" "}
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
