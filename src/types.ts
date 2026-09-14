/*
types.ts

JavaScript / TypeScript port of stone_engine (https://github.com/ndc-stone/stone_engine).
Original author: Makoto Kinoshita (mkino@hmdt.jp), Copyright 2024 Nihon Design Center.
This software is licensed under the MIT License. See LICENSE for details.
*/

/** 文字描画方向。lrTb = 横書き（左→右、上→下）、tbRl = 縦書き（上→下、右→左）。 */
export type Direction = "lrTb" | "tbRl";

/** 行内の文字寄せ。 */
export type TextAlign = "leading" | "center" | "trailing" | "justify";

/** 行送り方向の寄せ（横書きなら上下、縦書きなら左右）。 */
export type DirectionAlign = "start" | "middle" | "end";

/** 約物（句読点・括弧類）の取り扱い。 */
export type PunctuationMode = "whole" | "half" | "stone";

/** 約物の種類。firstHalf は「、。」のように前半にインクがあるもの、secondHalf は「「（」のように後半にあるもの。 */
export type Punctuation = "whole" | "firstHalf" | "secondHalf" | "quarter";

export type RunVisibility = "visible" | "invisible" | "ellipsis";

/** 文字種。フォントとスケールはこの単位で指定する。 */
export type Script = "latin" | "japanese" | "emoji";

/** フォント ID は SCRIPTS の添字と一致する。 */
export const SCRIPTS: readonly Script[] = ["latin", "japanese", "emoji"];

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 1 文字（書記素クラスタ）のレイアウト結果。Swift 版の STRun に相当する。
 * 座標系は y 下向き、単位は CSS px。position はグリフ原点（ベースライン左端）、frame は文字の占有矩形。
 */
export interface Run {
  tokenId: number;
  tokenRunIndex: number;
  fontId: number;
  char: string;
  isNewline: boolean;
  isNumber: boolean;
  punctuation: Punctuation;
  /** 横書き時の送り幅（フォントスケール適用後の px）。 */
  advance: number;
  position: Point;
  frame: Rect;
  visibility: RunVisibility;
  line: number;
}

/** 単語（または書記素）単位のまとまり。runs[start] ..< runs[end] がこのトークンに属する。 */
export interface Token {
  start: number;
  end: number;
}

/** 文字種ごとのフォント指定。 */
export interface FontSpec {
  /** CSS の font-family リスト。例: '"Noto Sans JP", sans-serif' */
  family: string;
  /** 文字種ごとの表示スケール。既定値は latin 0.95、その他 1.0。 */
  scale?: number;
  weight?: number | string;
  style?: "normal" | "italic" | "oblique";
  /**
   * アセント（フォントサイズに対する比）。省略時は japanese が 0.88（和文の仮想ボディ）、
   * それ以外は measurer が計測したフォントメトリクスを使う。
   */
  ascent?: number;
  /** ディセント（フォントサイズに対する比）。省略時は japanese が 0.12、それ以外は計測値。 */
  descent?: number;
}

export interface ResolvedFont {
  id: number;
  script: Script;
  family: string;
  scale: number;
  weight: number | string;
  style: "normal" | "italic" | "oblique";
  ascent?: number;
  descent?: number;
}

export interface FontMetrics {
  /** ベースラインから上方向の高さ（px）。 */
  ascent: number;
  /** ベースラインから下方向の高さ（px）。 */
  descent: number;
}

/**
 * フォント計測の抽象。ブラウザでは CanvasMeasurer、テストや SSR では FixedMeasurer を使う。
 * Swift 版で CoreText が担っていた部分に相当する。
 */
export interface FontMeasurer {
  /** 指定フォント・サイズで 1 書記素を横書きしたときの送り幅（px）。 */
  advance(font: ResolvedFont, size: number, char: string): number;
  /** 指定フォント・サイズのアセント／ディセント（px）。 */
  metrics(font: ResolvedFont, size: number): FontMetrics;
}

/** レイアウト設定。Swift 版の STLabel / STContext のプロパティに対応する。 */
export interface StoneOptions {
  /** フォントサイズ（px）。既定 17。 */
  fontSize?: number;
  /** 行送り（フォントサイズに対する倍率）。既定 1.0。 */
  lineHeightScale?: number;
  /** 既定 "leading"。 */
  textAlign?: TextAlign;
  /** 既定 "start"。 */
  directionAlign?: DirectionAlign;
  /** 既定 "lrTb"。 */
  direction?: Direction;
  /** 縦中横（縦書き時に 2 桁以下の数字を正体で表示）。既定 true。 */
  allowsTateChuYoko?: boolean;
  /** 収まらない場合にフォントを縮小する。既定 false。 */
  adjustsFontSizeToFitWidth?: boolean;
  /** 縮小の下限倍率（0 なら縮小しない）。既定 0。 */
  minimumScaleFactor?: number;
  /** 約物の扱い。既定 "stone"。 */
  punctuationMode?: PunctuationMode;
  /** 禁則処理。既定 true。 */
  kinsoku?: boolean;
  /** 単語単位で改行する（単語の途中で改行しない）。既定 true。 */
  dividesByWords?: boolean;
  /** 文字種ごとのフォント。 */
  fonts?: Partial<Record<Script, FontSpec>>;
}
