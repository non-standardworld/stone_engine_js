/*
react/index.tsx — React 用コンポーネントとフック。

<StoneText> はコンテナ div の中に、レイアウト結果を SVG として描画する。
SSR 時とフォント読み込み前は通常のテキスト（フォールバック）を描画し、クライアントでレイアウトできた時点で SVG に置き換わる。
*/

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type SVGProps,
} from "react";
import { resolveLayoutSize, StoneTextController, type SizeSpec } from "../controller.js";
import type { StoneContext } from "../context.js";
import { glyphGroups, svgOverflow, svgSize, VERTICAL_FEATURE_SETTINGS } from "../render/svg.js";
import { resolveFonts } from "../fonts.js";
import type { FontMeasurer, Size, StoneOptions } from "../types.js";

export type { SizeSpec } from "../controller.js";
export type { StoneContext } from "../context.js";

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

function optionsKey(options: StoneOptions): string {
  return JSON.stringify(options);
}

/** コンテナ要素の大きさを ResizeObserver で追跡する。 */
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
  text: string;
  options?: StoneOptions;
  /** 既定 "container"（containerRef の幅）。 */
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
  const { text, options = {}, width, height, containerRef, measurer } = args;
  const key = optionsKey(options);
  const stableOptions = useMemo(() => options, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const needsContainer = (width ?? "container") === "container" || height === "container";
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
    if (!controller || !controller.isAvailable) return;
    const direction = stableOptions.direction ?? "lrTb";
    const size = resolveLayoutSize(direction, width, height, containerSize);
    if (!size) return;
    controller.update({ text, options: stableOptions, size });
  }, [text, stableOptions, width, height, containerSize, measurer]);

  return layout;
}

export interface StoneSVGProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  layout: StoneContext;
  /** 文字色。既定 currentColor。 */
  color?: string;
  /** 各 run の frame を描く（デバッグ用）。 */
  showFrames?: boolean;
  frameColor?: string;
}

/** レイアウト結果を SVG として描画する表示専用コンポーネント。 */
export function StoneSVG({
  layout,
  color = "currentColor",
  showFrames = false,
  frameColor = "rgba(0, 128, 255, 0.6)",
  style,
  ...rest
}: StoneSVGProps) {
  const size = svgSize(layout);
  const groups = glyphGroups(layout);
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
      {groups.map((group, gi) => (
        <g
          key={gi}
          fontFamily={group.fontFamily}
          fontSize={group.fontSize}
          fontWeight={group.fontWeight}
          fontStyle={group.fontStyle}
          style={group.vertical ? { fontFeatureSettings: VERTICAL_FEATURE_SETTINGS } : undefined}
        >
          {group.glyphs.map((el) => (
            <text
              key={el.runId}
              x={el.x}
              y={el.y}
              transform={el.rotate ? `rotate(90 ${el.x} ${el.y})` : undefined}
              data-run={el.runId}
            >
              {el.text}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}

export interface StoneTextProps extends StoneOptions {
  /** 組むテキスト。children に文字列を渡してもよい。 */
  text?: string;
  children?: ReactNode;
  /** 既定 "container"（コンポーネントの幅）。 */
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
   * "text": 通常のテキストとして表示（既定）、"hidden": 場所は確保するが見せない、"none": 何も描かない。
   */
  fallback?: "text" | "hidden" | "none";
  onLayout?: (layout: StoneContext) => void;
  measurer?: FontMeasurer | null;
  /** svg 要素への追加 props。 */
  svgProps?: Omit<StoneSVGProps, "layout" | "color" | "showFrames">;
}

function childrenToString(children: ReactNode): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToString).join("");
  return "";
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
  const content = text ?? childrenToString(children);
  const ref = useRef<HTMLDivElement | null>(null);
  const layout = useStoneLayout({ text: content, options, width, height, containerRef: ref, measurer });

  useEffect(() => {
    if (layout && onLayout) onLayout(layout);
  }, [layout, onLayout]);

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
          <span className="stone-text__source" style={SR_ONLY}>
            {content}
          </span>
          <StoneSVG layout={layout} color={color} showFrames={showFrames} {...svgProps} />
        </>
      ) : fallback === "none" ? (
        <span className="stone-text__source" style={SR_ONLY}>
          {content}
        </span>
      ) : (
        <p className="stone-text__fallback" style={fallbackStyle}>
          {content}
        </p>
      )}
    </div>
  );
}
