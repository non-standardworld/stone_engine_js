import { useCallback, useState } from "react";
import type { Route } from "./+types/home";
import { StoneText, type StoneContext } from "@non-standardworld/stone-engine/react";
import type {
  Direction,
  DirectionAlign,
  PunctuationMode,
  TextAlign,
} from "@non-standardworld/stone-engine";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "stone-engine × React Router" },
    { name: "description", content: "日本語組版エンジン stone_engine の JavaScript 版デモ" },
  ];
}

const SAMPLE = `stone_engineは、日本語の文字組版を実現する、テキストレンダリングエンジンである。
その第一義の目的は「日本語の高度な組版」を実現することだ。具体的には、縦書き、禁則処理、約物処理、文字種ごとのスケーリングが挙げられる（2024年12月、Ver.1.0）。
Hello, world! 縦書きでは2桁以下の数字は縦中横で、123のような3桁以上の数字とアルファベットは90度回転する。「約物」の連続（「『』」など）は、stoneモードで自然に詰まる。`;

const HERO = `紙ではなく、画面のための日本語組版。
縦書き、禁則、約物、縦中横。
stone_engineは、それらをブラウザの上で組み直す。`;

const JP_FONTS = [
  { label: "ヒラギノ角ゴ（macOS）", value: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif' },
  { label: "ヒラギノ明朝（macOS）", value: '"Hiragino Mincho ProN", "Noto Serif JP", serif' },
  { label: "Noto Sans JP（Google Fonts）", value: '"Noto Sans JP", sans-serif' },
  { label: "Noto Serif JP（Google Fonts）", value: '"Noto Serif JP", serif' },
  { label: "Zen Kaku Gothic New（Google Fonts）", value: '"Zen Kaku Gothic New", sans-serif' },
  { label: "Shippori Mincho（Google Fonts）", value: '"Shippori Mincho", serif' },
];

const LATIN_FONTS = [
  { label: "Helvetica Neue", value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "和文フォントと同じ", value: "" },
];

export default function Home() {
  const [text, setText] = useState(SAMPLE);
  const [direction, setDirection] = useState<Direction>("lrTb");
  const [fontSize, setFontSize] = useState(20);
  const [lineHeightScale, setLineHeightScale] = useState(1.8);
  const [textAlign, setTextAlign] = useState<TextAlign>("leading");
  const [directionAlign, setDirectionAlign] = useState<DirectionAlign>("start");
  const [punctuationMode, setPunctuationMode] = useState<PunctuationMode>("stone");
  const [kinsoku, setKinsoku] = useState(true);
  const [dividesByWords, setDividesByWords] = useState(true);
  const [allowsTateChuYoko, setAllowsTateChuYoko] = useState(true);
  const [jpFont, setJpFont] = useState(JP_FONTS[0].value);
  const [latinFont, setLatinFont] = useState(LATIN_FONTS[0].value);
  const [latinScale, setLatinScale] = useState(0.95);
  const [showFrames, setShowFrames] = useState(false);
  const [boxHeight, setBoxHeight] = useState(420);
  const [info, setInfo] = useState<{ lines: number; width: number; height: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const [layout, setLayout] = useState<StoneContext | null>(null);
  const onLayout = useCallback((ctx: StoneContext) => {
    setLayout(ctx);
    setInfo({
      lines: ctx.lineCount,
      width: Math.round(ctx.renderedSize.width),
      height: Math.round(ctx.renderedSize.height),
    });
  }, []);

  // 「玩具箱」として: クリックした位置の文字をレイアウト結果から引く
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!layout) return;
    const svg = e.currentTarget.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const id = layout.hitRunIndex(point);
    if (id === null) {
      setPicked(null);
      return;
    }
    const run = layout.runs[id];
    setPicked(
      `run #${id} "${run.char}" line ${run.line} token ${run.tokenId} frame (${run.frame.x.toFixed(1)}, ${run.frame.y.toFixed(1)}, ${run.frame.width.toFixed(1)}, ${run.frame.height.toFixed(1)})`,
    );
  };

  const fonts = {
    japanese: { family: jpFont },
    latin: { family: latinFont || jpFont, scale: latinScale },
  };

  return (
    <main className="page">
      <section className="hero">
        <div className="hero__vertical">
          <StoneText
            text={HERO}
            direction="tbRl"
            height="container"
            width="auto"
            fontSize={22}
            lineHeightScale={2}
            fonts={{ japanese: { family: '"Hiragino Mincho ProN", "Noto Serif JP", serif' } }}
            style={{ height: "100%" }}
          />
        </div>
        <div className="hero__body">
          <h1>stone-engine × React Router</h1>
          <p>
            iOS 向け日本語組版エンジン <code>stone_engine</code> の JavaScript 移植です。左の縦書きは
            <code>&lt;StoneText direction="tbRl"&gt;</code> でサーバーサイドレンダリングされたページ上に組まれています。
          </p>
          <p>
            レイアウトはエンジンが 1 文字ずつ決め、描画はブラウザのフォントレンダリング（SVG）に任せています。
            Web フォント（Google Fonts など）もそのまま使えます。
          </p>
          <p>下のプレイグラウンドで設定を変えて試せます。文字をクリックすると、その文字のレイアウト情報を表示します。</p>
        </div>
      </section>

      <section className="playground">
        <div className="controls">
          <label>
            テキスト
            <textarea value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="row">
            <label>
              文字方向
              <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
                <option value="lrTb">横書き (lrTb)</option>
                <option value="tbRl">縦書き (tbRl)</option>
              </select>
            </label>
            <label>
              約物
              <select value={punctuationMode} onChange={(e) => setPunctuationMode(e.target.value as PunctuationMode)}>
                <option value="stone">stone</option>
                <option value="whole">常に全角</option>
                <option value="half">常に半角</option>
              </select>
            </label>
          </div>
          <div className="row">
            <label>
              文字寄せ
              <select value={textAlign} onChange={(e) => setTextAlign(e.target.value as TextAlign)}>
                <option value="leading">行頭</option>
                <option value="center">中央</option>
                <option value="trailing">行末</option>
                <option value="justify">均等</option>
              </select>
            </label>
            <label>
              行の寄せ
              <select value={directionAlign} onChange={(e) => setDirectionAlign(e.target.value as DirectionAlign)}>
                <option value="start">start</option>
                <option value="middle">middle</option>
                <option value="end">end</option>
              </select>
            </label>
          </div>
          <label>
            フォントサイズ <span className="value">{fontSize}px</span>
            <input type="range" min={10} max={48} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
          </label>
          <label>
            行送り <span className="value">×{lineHeightScale.toFixed(2)}</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={lineHeightScale}
              onChange={(e) => setLineHeightScale(Number(e.target.value))}
            />
          </label>
          <label>
            和文フォント
            <select value={jpFont} onChange={(e) => setJpFont(e.target.value)}>
              {JP_FONTS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            欧文フォント
            <select value={latinFont} onChange={(e) => setLatinFont(e.target.value)}>
              {LATIN_FONTS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            欧文スケール <span className="value">×{latinScale.toFixed(2)}</span>
            <input
              type="range"
              min={0.6}
              max={1.2}
              step={0.01}
              value={latinScale}
              onChange={(e) => setLatinScale(Number(e.target.value))}
            />
          </label>
          {direction === "tbRl" && (
            <label>
              縦書きの高さ <span className="value">{boxHeight}px</span>
              <input type="range" min={200} max={800} step={10} value={boxHeight} onChange={(e) => setBoxHeight(Number(e.target.value))} />
            </label>
          )}
          <label className="inline">
            <input type="checkbox" checked={kinsoku} onChange={(e) => setKinsoku(e.target.checked)} />
            禁則処理
          </label>
          <label className="inline">
            <input type="checkbox" checked={dividesByWords} onChange={(e) => setDividesByWords(e.target.checked)} />
            単語で改行（単語を分割しない）
          </label>
          <label className="inline">
            <input type="checkbox" checked={allowsTateChuYoko} onChange={(e) => setAllowsTateChuYoko(e.target.checked)} />
            縦中横
          </label>
          <label className="inline">
            <input type="checkbox" checked={showFrames} onChange={(e) => setShowFrames(e.target.checked)} />
            文字の枠を表示
          </label>
        </div>

        <div className="stage">
          <div className="stage__frame" data-direction={direction} onClick={onClick}>
            <StoneText
              text={text}
              direction={direction}
              fontSize={fontSize}
              lineHeightScale={lineHeightScale}
              textAlign={textAlign}
              directionAlign={directionAlign}
              punctuationMode={punctuationMode}
              kinsoku={kinsoku}
              dividesByWords={dividesByWords}
              allowsTateChuYoko={allowsTateChuYoko}
              fonts={fonts}
              showFrames={showFrames}
              width={direction === "tbRl" ? "auto" : "container"}
              height={direction === "tbRl" ? boxHeight : "auto"}
              onLayout={onLayout}
              style={direction === "tbRl" ? { height: boxHeight } : undefined}
            />
          </div>
          <div className="stage__info">
            {info && (
              <>
                <span>
                  行数 <code>{info.lines}</code>
                </span>
                <span>
                  描画サイズ <code>{info.width} × {info.height}</code>
                </span>
              </>
            )}
            {picked && <span>{picked}</span>}
          </div>
        </div>
      </section>
    </main>
  );
}
