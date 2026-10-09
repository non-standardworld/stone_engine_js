/*
react/index.tsx — React 用コンポーネントとフック。

<StoneText> はコンテナ div の中に、レイアウト結果を SVG として描画する。
SSR 時とフォント読み込み前は通常のテキスト（フォールバック）を描画し、クライアントでレイアウトできた時点で SVG に置き換わる。
children に要素（<a>、<strong>、<Link> など）を渡したときは、それを描画したスクリーンリーダー用の要素からテキストと
リンク・文字色・線・太さ・スタイルを読み取り（render/spans.ts の readStoneSource）、SVG に重ねる。太さ・スタイルの範囲は
レイアウトにも渡し、その文字を太字・斜体のフォントで測って組む。SVG のリンクをクリックすると、
元の <a> をクリックしたことにする（ルーターのリンクもそのまま動く）。キーボードのフォーカスは元の <a> が受け、SVG に枠を描く。
*/

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type SVGProps,
} from "react";
import { resolveLayoutSize, StoneTextController, type SizeSpec } from "../controller.js";
import type { StoneContext } from "../context.js";
import { handleStoneCopy } from "../render/copy.js";
import { decorationRects, readStoneSource, sameSpans, spanRects, type StoneSpan } from "../render/spans.js";
import {
  DEFAULT_FRAME_COLOR,
  fontFeatureSettingsOf,
  glyphParagraphs,
  isSafeHref,
  nestGlyphGroups,
  svgOverflow,
  svgSize,
  type GlyphGroup,
  type GlyphNode,
} from "../render/svg.js";
import type { VerticalFormsOption } from "../render/vertical.js";
import { resolveFonts } from "../fonts.js";
import type { FontMeasurer, FontStyleSpan, Size, StoneOptions } from "../types.js";

export type { SizeSpec } from "../controller.js";
export type { StoneContext } from "../context.js";
export type { StoneSpan } from "../render/spans.js";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** 組版後のスクリーンリーダー用テキスト。前後の文章ごと選択してコピーしたときに、SVG のテキストと二重にならないよう選択対象から外す。 */
const SR_SOURCE: CSSProperties = {
  ...SR_ONLY,
  WebkitUserSelect: "none",
  userSelect: "none",
};

/** オプションを比較用の文字列にする（オブジェクトの同一性ではなく内容で依存配列を作るため）。 */
function optionsKey(options: StoneOptions): string {
  return JSON.stringify(options);
}

/** 範囲のうちレイアウトに効くもの（太さ・スタイル）を比較用の文字列にする（文字色などが変わっただけでは組み直さないため）。 */
function fontSpansKey(spans: readonly FontStyleSpan[] | undefined): string {
  if (!spans) return "";
  const styled = spans.filter((span) => span.fontWeight !== undefined || span.fontStyle !== undefined);
  return JSON.stringify(styled.map((span) => [span.start, span.end, span.fontWeight ?? null, span.fontStyle ?? null]));
}

/** コンテナ要素の大きさ（clientWidth / clientHeight）を ResizeObserver で追跡する。 */
function useContainerSize(ref: RefObject<HTMLElement | null>, enabled: boolean): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const read = (): void => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => read());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return enabled ? size : null;
}

export interface UseStoneLayoutArgs {
  /** 組むテキスト。null のあいだはレイアウトしない。 */
  text: string | null;
  /** フォントの太さ・スタイルを変える範囲（<strong>、<em> など）。StoneSpan の配列をそのまま渡してもよい。 */
  spans?: readonly FontStyleSpan[];
  options?: StoneOptions;
  /** 既定: 横書きは "container"（containerRef の幅）、縦書きは "auto"（内容に合わせて伸びる）。 */
  width?: SizeSpec;
  /** 既定 "auto"。縦書きで折り返すには数値か "container" を指定する。 */
  height?: SizeSpec;
  /** "container" 指定の計測に使う要素。 */
  containerRef?: RefObject<HTMLElement | null>;
  measurer?: FontMeasurer | null;
}

/**
 * テキストをレイアウトして StoneContext を返す。SSR とフォント読み込み前は null。
 * フォントの読み込み完了やコンテナのリサイズで自動的に更新される。
 */
export function useStoneLayout(args: UseStoneLayoutArgs): StoneContext | null {
  const { text, spans, options = {}, width, height, containerRef, measurer } = args;
  const key = optionsKey(options);
  const stableOptions = useMemo(() => options, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const spansKey = fontSpansKey(spans);
  const stableSpans = useMemo(() => spans, [spansKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const defaultWidth = (stableOptions.direction ?? "lrTb") === "tbRl" ? "auto" : "container";
  const needsContainer = (width ?? defaultWidth) === "container" || height === "container";
  const fallbackRef = useRef<HTMLElement | null>(null);
  const containerSize = useContainerSize(containerRef ?? fallbackRef, needsContainer);
  const [layout, setLayout] = useState<StoneContext | null>(null);
  const controllerRef = useRef<StoneTextController | null>(null);

  useEffect(() => {
    const controller = new StoneTextController({
      measurer,
      onLayout: (ctx) => setLayout(ctx),
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [measurer]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !controller.isAvailable || text === null) return;
    const direction = stableOptions.direction ?? "lrTb";
    const size = resolveLayoutSize(direction, width, height, containerSize);
    if (!size) return;
    controller.update({ text, options: stableOptions, size, spans: stableSpans });
  }, [text, stableSpans, stableOptions, width, height, containerSize, measurer]);

  return layout;
}

export interface StoneSVGProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  layout: StoneContext;
  /** 文字色。既定 currentColor。 */
  color?: string;
  /** 各 run の frame を描く（デバッグ用）。 */
  showFrames?: boolean;
  frameColor?: string;
  /**
   * 縦書きの和文の縦組み用グリフの描き方。"feature" は font-feature-settings の vert、"emulated" は横組みのグリフの
   * 回転と移動で代用する（vert が効かない Safari などの WebKit 用）。既定 "auto"（ブラウザに合わせる）。
   */
  verticalForms?: VerticalFormsOption;
  /** リンク・文字色・線を付ける範囲（元のテキストの位置で指定する）。 */
  spans?: readonly StoneSpan[];
  /** フォーカスの枠を描く範囲（spans の添字）。 */
  focusedSpan?: number | null;
  /** SVG のリンクを Tab キーでフォーカスできるようにする。既定 true（<StoneText> は元の <a> がフォーカスを受けるので false）。 */
  linksFocusable?: boolean;
  /** SVG のリンクがクリックされたとき（spanIndex は spans の添字）。preventDefault すると移動しない。 */
  onLinkClick?: (event: MouseEvent<SVGAElement>, spanIndex: number) => void;
}

/** SVG の <a>。JSX の <a> は HTML の型になるので、同じ "a" を SVG の props で使えるようにする（描画は親の SVG の名前空間になる）。 */
const SvgAnchor = "a" as unknown as (props: SVGProps<SVGAElement> & { rel?: string }) => ReactElement;

/** 範囲の節を SVG の要素にする。リンクは <a>、それ以外は <tspan>。 */
function renderGlyphNodes(nodes: GlyphNode[], props: Pick<StoneSVGProps, "spans" | "linksFocusable" | "onLinkClick">): ReactNode {
  return nodes.map((node, i) => {
    if (node.type === "group") return renderGlyphGroup(node.group, i);
    const span = props.spans?.[node.span];
    const children = renderGlyphNodes(node.children, props);
    if (!span) return <Fragment key={i}>{children}</Fragment>;
    if (span.href !== undefined && isSafeHref(span.href)) {
      const index = node.span;
      return (
        <SvgAnchor
          key={i}
          href={span.href}
          target={span.target}
          rel={span.rel}
          className={span.className}
          fill={span.color}
          data-span={index}
          tabIndex={props.linksFocusable === false ? -1 : undefined}
          onClick={props.onLinkClick ? (e) => props.onLinkClick?.(e, index) : undefined}
        >
          {children}
        </SvgAnchor>
      );
    }
    return (
      <tspan key={i} className={span.className} fill={span.color} data-span={node.span}>
        {children}
      </tspan>
    );
  });
}

/** 同じフォント設定の文字のまとまりを <tspan> にする。 */
function renderGlyphGroup(group: GlyphGroup, key: number): ReactNode {
  const features = fontFeatureSettingsOf(group);
  return (
    <tspan
      key={key}
      fontFamily={group.fontFamily}
      fontSize={group.fontSize}
      fontWeight={group.fontWeight}
      fontStyle={group.fontStyle}
      style={features ? { fontFeatureSettings: features } : undefined}
    >
      {group.glyphs.map((el) => (
        <tspan key={el.runId} x={el.x} y={el.y} rotate={el.rotate || undefined} data-run={el.runId}>
          {el.text}
        </tspan>
      ))}
    </tspan>
  );
}

/** フォーカスの枠と仮想ボディの間の余白（px）。 */
const FOCUS_RING_GAP = 2;

/**
 * レイアウト結果を SVG として描画する表示専用コンポーネント。
 * SVG の中だけを選択してコピーしたときは、改行や空白を含む元のテキストがクリップボードに入る。
 */
export function StoneSVG({
  layout,
  color = "currentColor",
  showFrames = false,
  frameColor = DEFAULT_FRAME_COLOR,
  verticalForms,
  spans,
  focusedSpan = null,
  linksFocusable = true,
  onLinkClick,
  style,
  onCopy,
  ...rest
}: StoneSVGProps) {
  const size = svgSize(layout);
  const paragraphs = glyphParagraphs(layout, { verticalForms, spans });
  const decorations = decorationRects(layout, spans);
  const focusRects = spans && focusedSpan !== null && spans[focusedSpan] ? spanRects(layout, spans, focusedSpan) : [];
  const handleCopy = (e: ClipboardEvent<SVGSVGElement>) => {
    onCopy?.(e);
    if (e.isDefaultPrevented() || e.nativeEvent.defaultPrevented) return;
    handleStoneCopy(e, layout, e.currentTarget);
  };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${size.width} ${size.height}`}
      aria-hidden="true"
      style={{
        display: "block",
        overflow: svgOverflow(layout),
        fill: color,
        fontVariantLigatures: "none",
        fontKerning: "none",
        ...style,
      }}
      onCopy={handleCopy}
      {...rest}
    >
      {showFrames && (
        <g fill="none" stroke={frameColor} strokeWidth={1}>
          {layout.runs.map((run, i) =>
            run.visibility === "invisible" ? null : (
              <rect
                key={i}
                x={run.frame.x}
                y={run.frame.y}
                width={run.frame.width}
                height={run.frame.height}
              />
            ),
          )}
        </g>
      )}
      {paragraphs.map((paragraph, pi) => (
        <text key={pi} xmlSpace="preserve">
          {renderGlyphNodes(nestGlyphGroups(paragraph.groups), { spans, linksFocusable, onLinkClick })}
        </text>
      ))}
      {decorations.length > 0 && (
        <g className="stone-decorations">
          {decorations.map((d, i) => (
            <rect
              key={i}
              x={d.x}
              y={d.y}
              width={d.width}
              height={d.height}
              fill={d.color ?? undefined}
              data-span={d.spanIndex}
            />
          ))}
        </g>
      )}
      {focusRects.length > 0 && (
        <g className="stone-focus-ring" fill="none" stroke="Highlight" strokeWidth={2} pointerEvents="none">
          {focusRects.map((r, i) => (
            <rect
              key={i}
              x={r.x - FOCUS_RING_GAP}
              y={r.y - FOCUS_RING_GAP}
              width={r.width + FOCUS_RING_GAP * 2}
              height={r.height + FOCUS_RING_GAP * 2}
              rx={2}
            />
          ))}
        </g>
      )}
    </svg>
  );
}

export interface StoneTextProps extends StoneOptions {
  /** 組むテキスト。children に文字列を渡してもよい。 */
  text?: string;
  /**
   * 組むテキスト。<a>、<strong>、<Link> などの要素を含めてもよい。要素の中のテキストも組み、リンクと、CSS で決まった
   * 文字色・下線・打ち消し線・太さ・スタイルを SVG に反映する（太字・斜体はそのフォントで送り幅を測って組む）。<br> は改行になる。
   */
  children?: ReactNode;
  /** 既定: 横書きは "container"（コンポーネントの幅）、縦書きは "auto"（内容に合わせて左に伸びる）。 */
  width?: SizeSpec;
  /** 既定 "auto"。縦書きで折り返すには数値か "container"（style で高さを与える）を指定する。 */
  height?: SizeSpec;
  /** 文字色。既定 currentColor。 */
  color?: string;
  className?: string;
  style?: CSSProperties;
  /** 各文字の占有矩形を描く（デバッグ用）。 */
  showFrames?: boolean;
  /**
   * レイアウトできるまで（SSR 中・フォント読み込み前）の表示。
   * "text": 通常のテキストとして表示（既定）、"hidden": 場所は確保するが見せない、
   * "none": 視覚的には何も描かず、スクリーンリーダー用のテキストだけを残す。
   */
  fallback?: "text" | "hidden" | "none";
  onLayout?: (layout: StoneContext) => void;
  measurer?: FontMeasurer | null;
  /** svg 要素への追加 props。 */
  svgProps?: Omit<StoneSVGProps, "layout" | "color" | "showFrames" | "spans" | "focusedSpan">;
}

/**
 * children が文字列・数値（と、その配列やフラグメント）だけなら、それをつなげたテキスト。
 * 要素を含むなら null（描画した DOM から読み取る）。
 */
function plainTextOf(children: ReactNode): string | null {
  let text = "";
  let plain = true;
  const visit = (node: ReactNode): void => {
    if (!plain || node == null || typeof node === "boolean") return;
    if (typeof node === "string" || typeof node === "number") {
      text += String(node);
    } else if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment) {
      Children.forEach(node.props.children, visit);
    } else {
      plain = false;
    }
  };
  visit(children);
  return plain ? text : null;
}

/** キーボードで移ったフォーカスかどうか（:focus-visible を知らない古いブラウザでは常に true）。 */
function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** 修飾キーを押していない、主ボタンのクリックかどうか（新しいタブで開くなどはブラウザに任せる）。 */
function isPlainClick(e: MouseEvent<Element>): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * 日本語組版されたテキスト。React Router / Next.js などの SSR 環境でもそのまま使える。
 */
export function StoneText(props: StoneTextProps) {
  const {
    text,
    children,
    width,
    height,
    color,
    className,
    style,
    showFrames = false,
    fallback = "text",
    onLayout,
    measurer,
    svgProps,
    ...options
  } = props;
  const plain = text ?? plainTextOf(children);
  const ref = useRef<HTMLDivElement | null>(null);

  // children に要素があれば、描画したスクリーンリーダー用の要素（レイアウト前はフォールバック）から読み取る
  const sourceRef = useRef<HTMLElement | null>(null);
  const setSourceElement = (el: HTMLElement | null) => {
    sourceRef.current = el;
  };
  const sourceElements = useRef<Element[]>([]);
  const [source, setSource] = useState<{ text: string; spans: StoneSpan[] } | null>(null);
  useIsomorphicLayoutEffect(() => {
    const el = sourceRef.current;
    if (plain !== null || !el) {
      sourceElements.current = [];
      return;
    }
    const next = readStoneSource(el);
    sourceElements.current = next.elements;
    setSource((prev) => (prev && prev.text === next.text && sameSpans(prev.spans, next.spans) ? prev : next));
  });
  const content = plain ?? source?.text ?? null;
  const spans = plain === null ? source?.spans : undefined;
  const sourceContent = plain ?? children;

  const layout = useStoneLayout({ text: content, spans, options, width, height, containerRef: ref, measurer });

  // キーボードで元の <a> にフォーカスしたとき、SVG のリンクに枠を描く
  const [focusedSpan, setFocusedSpan] = useState<number | null>(null);
  const handleSourceFocus = (e: FocusEvent<HTMLElement>) => {
    const index = sourceElements.current.indexOf(e.target);
    setFocusedSpan(index >= 0 && isFocusVisible(e.target) ? index : null);
  };
  const handleSourceBlur = () => setFocusedSpan(null);
  // SVG のリンクをクリックしたら、元の <a> をクリックしたことにする（React Router の <Link> などの onClick も動く）。
  // 親の要素や document のリスナーには元の <a> のクリックだけが届くよう、SVG のクリックはここで止める
  // （React のルートが document のときは、同じ document の後から登録されたリスナーも止める）
  const handleLinkClick = (e: MouseEvent<SVGAElement>, spanIndex: number) => {
    svgProps?.onLinkClick?.(e, spanIndex);
    const target = sourceElements.current[spanIndex];
    if (e.defaultPrevented || !isPlainClick(e) || !(target instanceof HTMLElement)) return;
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    target.click();
  };

  // onLayout の参照が変わっただけでは再通知しない（呼び出し側の useCallback に依存しない）
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  useEffect(() => {
    if (layout) onLayoutRef.current?.(layout);
  }, [layout]);

  const direction = options.direction ?? "lrTb";
  const fontsKey = JSON.stringify(options.fonts ?? {});
  const fonts = useMemo(() => resolveFonts(options.fonts), [fontsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fontSize = options.fontSize ?? 17;

  const fallbackStyle: CSSProperties = {
    margin: 0,
    fontFamily: fonts[1].family,
    fontSize,
    lineHeight: options.lineHeightScale ?? 1,
    whiteSpace: "pre-wrap",
    writingMode: direction === "tbRl" ? "vertical-rl" : undefined,
    height: direction === "tbRl" ? "100%" : undefined,
    visibility: fallback === "hidden" ? "hidden" : undefined,
  };

  return (
    <div
      ref={ref}
      className={className ? `stone-text ${className}` : "stone-text"}
      data-direction={direction}
      style={{ position: "relative", ...style }}
    >
      {layout ? (
        <>
          <span
            ref={setSourceElement}
            className="stone-text__source"
            style={SR_SOURCE}
            onFocus={handleSourceFocus}
            onBlur={handleSourceBlur}
          >
            {sourceContent}
          </span>
          <StoneSVG
            layout={layout}
            color={color}
            showFrames={showFrames}
            {...svgProps}
            spans={spans}
            focusedSpan={focusedSpan}
            linksFocusable={false}
            onLinkClick={handleLinkClick}
          />
        </>
      ) : fallback === "none" ? (
        <span ref={setSourceElement} className="stone-text__source" style={SR_ONLY}>
          {sourceContent}
        </span>
      ) : (
        <p ref={setSourceElement} className="stone-text__fallback" style={fallbackStyle}>
          {sourceContent}
        </p>
      )}
    </div>
  );
}
