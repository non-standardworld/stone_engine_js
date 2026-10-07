/*
layout.ts — 行分割・禁則・約物処理・縦中横・文字寄せを行うレイアウタ。Swift 版 STLayout.swift に対応。

Swift 版との意図的な差異（いずれも元実装の明らかな不具合の修正）:
- 禁則の追い出しは「行末 run を含むトークンの直前」まで戻す（元実装は 1 つ前の run のトークン長だけ戻すため単語が割れることがある）。
- 行頭の「 などを半角にする処理は行末 run まで含めて位置をずらし、前行末との約物処理で既に半角になっている場合は二重に詰めない。
- 均等配置は frame 基準で並べ直す（元実装は行末が余り、行頭約物と重なることがあった）。
- 均等配置の余白はトークン間ではなく文字間に配る（欧文の単語の途中と縦中横の途中は空けない）。行末の空白は幅 0 にして除く。
  （トークン間にだけ配ると、単語分割が有効なときに文節ごとの大きな空きになる。）
- 縦書きの均等配置で 1 桁の縦中横トークンの後に送りが進まない問題を修正。
- directionAlign = middle の横書きで、最初の行のアセント分だけずれる問題を修正。
- renderedSize の高さは縮小後の行送りで計算する。
- 切り詰めは行単位にする。先頭の行から領域に完全に収まる行だけを表示し、収まらない最初の行（一部だけ見える行を含む）から後ろは隠す。
  隠れた文字（改行・空白以外）があれば、表示する最後の文字を省略記号にする（行末の改行・空白や空行は飛ばし、縦中横の途中ならその先頭）。
  改行・空白だけが隠れたときは省略記号を付けず、isTruncated も false にする。
  （元実装は「領域と重なり、次の run が収まらない」run を省略記号にしていたため、途中まで見える行の文字がほぼ省略記号になり、
  改行の run が省略記号になったときは何も描かれなかった。）
- directionAlign = middle / end で収まらない行があるときは、先頭から収まる行だけを寄せる（隠れる行は常に末尾側になり、省略記号は 1 つ）。
- 改行の run の矩形は、同じ文字種の文字と同じく縮小後のフォントサイズで作る（元実装は縮小前の fontSize のため、縮小すると行が実際より
  大きく見積もられて切り詰められたままになり、縦書きでは列が左にずれた）。
- 縦中横の中央寄せは行送り方向の寄せより前に行う（元実装は寄せた後に中央寄せするため、1em より広い 2 桁の縦中横が左端の列にあると
  領域の左にはみ出し、大きさを制限していなくても切り詰められた）。
- 省略記号が置き換える文字より大きくて領域からはみ出すときは、収まるまで同じ行の手前の文字も隠す（CSS の text-overflow: ellipsis と同じ）。
  横書きは置き換える run のフォントで「…」の送り幅を測り、縦書きは「︙」を 1em とする。行の最初の文字でも収まらなければそこに置く。
  （元実装は置き換えた文字の位置にそのまま描くため、半角の欧文などを省略記号にすると、行末で最大 0.5em ほど領域からはみ出して切れた。）
- 省略記号は run の矩形の先頭から描き、縦書きでは run の文字種にかかわらず和文フォントの正立の「︙」を列の 1em 四方に描く（render/svg.ts）。
  （元実装は run のグリフの位置とフォントで描くため、回転する欧文の run では「︙」ごと 90 度回転して点が横に並び、
  縦中横では縦中横の位置に欧文フォントで描いて、1 桁だと列の中央からずれた。）
- ダーシ「—」「―」とリーダー「‥」「…」は、前後の文字にかかわらず和文として扱う（unicode.ts）。和文フォントで組み、縦書きでは回転せずに
  縦組み用グリフで列の中央に描く。欧文の単語の後ろ（"Hello…"）も同じ。
  （元実装は一般句読点をどの文字種にも入れていないため欧文フォントで組み、縦書きでは 90 度回転して点が列の左寄りに並び、
  横書きでも点がベースライン上に下がった。既定の欧文フォント（Helvetica Neue）では「——」も 2 本に切れた。）
- 一般句読点のうち、UTR #50 で正立（U）とされ JIS X 0213 にある「‼」「⁇」「⁈」「⁉」「※」「†」「‡」「‰」「‖」「⁂」「⁑」も、前後の
  文字にかかわらず和文として扱う（unicode.ts）。CSS の縦書きと同じく回転させずに描き（「‖」は縦組み用グリフの「═」）、横書きでも和文フォントの
  全角で組む。欧文の単語の後ろ（"Wow‼"）も同じ。「‱」も正立だが、和文フォントにないので欧文のまま（回転する）。
  （元実装は欧文フォントのまま縦書きで 90 度回転するため「‼」「⁉」が横倒しになり、「※」は欧文のスケール 0.95 で小さくなった。）
- 引用符「“」「”」「‘」「’」は前後の文字で文字種を決める（parser.ts）。始めの引用符は後ろ、終わりの引用符は前の文字が欧文フォントの文字なら
  欧文（"“Hello”"、"it’s"、和文中の「“OK”」）、それ以外は和文にする。和文の引用符は和文フォントで組み、縦書きでは全角の字形（fwid）の
  縦組み用グリフ（〝〟の形）で描いて送りを 1em にする（和文フォントの「“」などはプロポーショナルな字形で、縦組み用グリフがない）。横書きは
  和文フォントのプロポーショナルな字形のまま。欧文の引用符は今までどおり縦書きで回転する。約物の詰め（punctuationMode）の対象にはしない。
  （元実装は一般句読点をどの文字種にも入れていないため、和文中の引用符も欧文フォントのまま縦書きで 90 度回転し、送りが約 0.4em に詰まった。
  CSS は和文フォントの引用符を縦書きで正立させるが、Chromium は横書きの形のまま列の中央に 1em 送り、Safari は送りを字幅に詰めて描く。）
- 分離禁止文字（「—」「―」「‥」「…」「〳」「〴」「〵」）が続けて並んだ間では改行せず（kinsoku が有効なとき）、均等配置でも空けない。
  並びが行の先頭から始まるか 1 行に収まらず、手前で改行しても分かれてしまうときは、そのまま分ける。
  （元実装には分離禁止の処理がなく、「……」「——」が行をまたいで分かれた。欧文として扱っていた間は均等配置で空かなかったが、
  和文にするとほかの和文と同じく空いてしまうため、あわせて扱う。）
- 行頭禁則は JLREQ の行頭禁則の文字クラスをすべて含む強い禁則にする（punctuation.ts の KINSOKU_NOT_STARTING。JLREQ 付録 C.3 の
  レベル 4、CSS の line-break: strict に相当）。全角の「！」「，」「．」「：」「；」、「・」「ー」「ゝ」「ゞ」、ハイフン類「‐」「〜」「゠」「–」、
  終わり括弧「}」「⦆」を行頭に置かない。
  （元実装の集合は「？!‼」「。.」のように ASCII の「!」「.」を 2 回ずつ書いていて全角の「！」「．」がなく、「，」「：」「；」「・」も
  なかったため、これらが行頭に来た。小書きの仮名と「々」は行頭禁則なのに「ー」「ゝ」「ゞ」は行頭に来るという混ざった状態だった。）
*/

import type { StoneContext } from "./context.js";
import {
  HORIZONTAL_ELLIPSIS,
  isBlankChar,
  isInseparablePair,
  isNotEndingChar,
  isNotStartingChar,
  isSpaceChar,
} from "./punctuation.js";
import type { Rect, Run, Token } from "./types.js";

const EPS = 1e-6;

/** run の位置と矩形を同じだけ平行移動する。 */
function moveRun(run: Run, dx: number, dy: number): void {
  run.position = { x: run.position.x + dx, y: run.position.y + dy };
  run.frame = { x: run.frame.x + dx, y: run.frame.y + dy, width: run.frame.width, height: run.frame.height };
}

/** 改行以外の空白の run かどうか。 */
function isSpaceRun(run: Run): boolean {
  return !run.isNewline && isSpaceChar(run.char);
}

/** stone モード: 「」「」「「」「・「」のように、前が約物なら後ろの始め括弧を半角にする。 */
function halvesOpeningAfterPunctuation(run: Run, prev: Run | undefined): boolean {
  return run.punctuation === "secondHalf" && prev !== undefined && prev.punctuation !== "whole";
}

/** stone モード: 「。」」「」・」のように、後ろが約物なら終わり括弧・句読点を半角にする。 */
function halvesClosingBeforePunctuation(run: Run, next: Run | undefined): boolean {
  return (
    run.punctuation === "firstHalf" &&
    next !== undefined &&
    (next.punctuation === "firstHalf" || next.punctuation === "quarter")
  );
}

export class Layouter {
  private runId = 0;
  private lineStartRunId = 0;
  private x = 0;
  private y = 0;
  private tmpX: number | null = null;

  /** コンテキストの runs を対象にレイアウタを作る。 */
  constructor(private readonly ctx: StoneContext) {}

  /** レイアウト領域の右端（横書きの折り返し位置）。 */
  private get maxX(): number {
    return this.ctx.renderSize.width;
  }

  /** レイアウト領域の下端（縦書きの折り返し位置）。 */
  private get maxY(): number {
    return this.ctx.renderSize.height;
  }

  //--------------------------------------------------------------//
  // Run
  //--------------------------------------------------------------//

  private layoutRunLrTb(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const runId = this.runId;
    const run = runs[runId];
    const size = ctx.adjustFontSize;
    const fm = ctx.fontManager;

    run.line = ctx.lineCount;

    if (run.isNewline) {
      run.position = { x: this.x, y: this.y };
      run.frame = {
        x: this.x,
        y: this.y - fm.ascent(run.fontId, size),
        width: 0,
        height: size * fm.fontScale(run.fontId),
      };
      return;
    }

    let posX = this.x;
    let width = run.advance;
    switch (ctx.punctuationMode) {
      case "whole":
        break;
      case "half":
        switch (run.punctuation) {
          case "whole":
            break;
          case "firstHalf":
            width = run.advance * 0.5;
            break;
          case "secondHalf":
            posX = this.x - run.advance * 0.5;
            width = run.advance * 0.5;
            break;
          case "quarter":
            posX = this.x - run.advance * 0.25;
            width = run.advance * 0.5;
            break;
        }
        break;
      case "stone":
        if (halvesOpeningAfterPunctuation(run, runs[runId - 1])) {
          posX = this.x - run.advance * 0.5;
          width = run.advance * 0.5;
        }
        if (halvesClosingBeforePunctuation(run, runs[runId + 1])) {
          width = run.advance * 0.5;
        }
        break;
    }

    run.position = { x: posX, y: this.y };
    run.frame = {
      x: this.x,
      y: this.y - fm.ascent(run.fontId, size),
      width,
      height: size * fm.fontScale(run.fontId),
    };
  }

  /** 縦書きで現在の run の位置と矩形を決める（回転・縦中横・約物の詰めを含む）。 */
  private layoutRunTbRl(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const runId = this.runId;
    const run = runs[runId];
    const size = ctx.adjustFontSize;
    const fm = ctx.fontManager;

    run.line = ctx.lineCount;

    if (run.isNewline) {
      run.position = { x: this.x, y: this.y + size - fm.descent(run.fontId, size) };
      run.frame = { x: this.x, y: this.y, width: size, height: 0 };
      return;
    }

    if (ctx.isClockwise(run)) {
      run.position = { x: this.x + fm.descent(run.fontId, size), y: this.y };
      run.frame = { x: this.x, y: this.y, width: size, height: run.advance };
      return;
    }

    let posY = this.y + size - fm.descent(run.fontId, size);
    let height = size;
    switch (ctx.punctuationMode) {
      case "whole":
        break;
      case "half":
        switch (run.punctuation) {
          case "whole":
            break;
          case "firstHalf":
            height = size * 0.5;
            break;
          case "secondHalf":
            posY -= size * 0.5;
            height = size * 0.5;
            break;
          case "quarter":
            posY -= size * 0.25;
            height = size * 0.5;
            break;
        }
        break;
      case "stone":
        if (halvesOpeningAfterPunctuation(run, runs[runId - 1])) {
          posY -= size * 0.5;
          height = size * 0.5;
        }
        if (halvesClosingBeforePunctuation(run, runs[runId + 1])) {
          height = size * 0.5;
        }
        break;
    }

    run.position = { x: this.x, y: posY };
    run.frame = { x: this.x, y: this.y, width: run.advance, height };
  }

  /** 方向に応じて run を配置する。 */
  private layoutRun(): void {
    if (this.ctx.direction === "lrTb") this.layoutRunLrTb();
    else this.layoutRunTbRl();
  }

  //--------------------------------------------------------------//
  // Char and line
  //--------------------------------------------------------------//

  private goNextLineLrTb(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    if (ctx.punctuationMode === "stone") {
      // 行頭の始め括弧を半角にして行全体を詰める（前行末との処理で既に半角なら何もしない）
      const first = runs[this.lineStartRunId];
      if (
        first &&
        !first.isNewline &&
        first.punctuation === "secondHalf" &&
        first.frame.width >= first.advance - EPS
      ) {
        const dx = first.advance * 0.5;
        first.position = { x: first.position.x - dx, y: first.position.y };
        first.frame = { ...first.frame, width: first.advance * 0.5 };
        for (let i = this.lineStartRunId + 1; i <= this.runId && i < runs.length; i++) {
          moveRun(runs[i], -dx, 0);
        }
      }

      // 行末の句読点・終わり括弧を半角にする
      const last = runs[this.runId];
      if (last && !last.isNewline && last.punctuation === "firstHalf") {
        last.frame = { ...last.frame, width: last.advance * 0.5 };
      }
    }

    this.x = 0;
    this.y += ctx.adjustLineHeight;
  }

  /** 縦書きの行末処理をして次の行（左の列）へ進む。 */
  private goNextLineTbRl(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const size = ctx.adjustFontSize;
    if (ctx.punctuationMode === "stone") {
      const first = runs[this.lineStartRunId];
      if (
        first &&
        !first.isNewline &&
        first.punctuation === "secondHalf" &&
        first.frame.height >= size - EPS
      ) {
        const dy = size * 0.5;
        first.position = { x: first.position.x, y: first.position.y - dy };
        first.frame = { ...first.frame, height: size * 0.5 };
        for (let i = this.lineStartRunId + 1; i <= this.runId && i < runs.length; i++) {
          moveRun(runs[i], 0, -dy);
        }
      }

      const last = runs[this.runId];
      if (last && !last.isNewline && last.punctuation === "firstHalf") {
        last.frame = { ...last.frame, height: size * 0.5 };
      }
    }

    this.x -= ctx.adjustLineHeight;
    this.y = 0;
  }

  /** 禁則処理を行ってから改行する。 */
  private goNextLine(): void {
    this.processNotEndingAndStarting();

    if (this.ctx.direction === "lrTb") this.goNextLineLrTb();
    else this.goNextLineTbRl();

    this.ctx.lineCount += 1;
    this.lineStartRunId = this.runId + 1;
  }

  /** 横書きで次の文字へ進み、次のトークンが収まらなければ改行する。 */
  private goNextCharLrTb(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const run = runs[this.runId];

    this.x += run.frame.width;

    if (run.isNewline) {
      this.goNextLine();
      return;
    }

    if (this.runId + 1 < runs.length) {
      const next = runs[this.runId + 1];
      if (run.tokenId !== next.tokenId) {
        // 次のトークン全体が収まるか
        if (this.x + ctx.advanceOfToken(ctx.tokens[next.tokenId]) > this.maxX) this.goNextLine();
      } else if (this.x + next.advance > this.maxX) {
        this.goNextLine();
      }
    }
  }

  /** 縦書きで次の文字へ進む。縦中横の途中では横に並べる。 */
  private goNextCharTbRl(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const run = runs[this.runId];

    if (ctx.isTateChuYoko(run)) {
      if (!ctx.isLastInToken(run)) {
        // 縦中横の途中: x を進めるだけで y は進めない
        if (this.tmpX === null) this.tmpX = this.x;
        this.x += run.frame.width;
        return;
      }
      if (this.tmpX !== null) {
        this.x = this.tmpX;
        this.tmpX = null;
      }
    }

    this.y += run.frame.height;

    if (run.isNewline) {
      this.goNextLine();
      return;
    }

    if (this.runId + 1 < runs.length) {
      const next = runs[this.runId + 1];
      if (run.tokenId !== next.tokenId) {
        if (this.y + ctx.advanceOfToken(ctx.tokens[next.tokenId]) > this.maxY) this.goNextLine();
      } else if (this.y + ctx.adjustFontSize > this.maxY) {
        this.goNextLine();
      }
    }
  }

  /** 方向に応じて次の文字へ進む。 */
  private goNextChar(): void {
    if (this.ctx.direction === "lrTb") this.goNextCharLrTb();
    else this.goNextCharTbRl();
  }

  //--------------------------------------------------------------//
  // Kinsoku
  //--------------------------------------------------------------//

  /** 行末禁則・行頭禁則・分離禁止。行末をトークン単位で手前に戻す。 */
  private processNotEndingAndStarting(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    if (!ctx.kinsoku) return;
    if (runs[this.runId]?.isNewline) return;

    const decreaseRunId = (): void => {
      const token = ctx.tokens[runs[this.runId].tokenId];
      this.runId = token.start - 1;
      if (this.runId < this.lineStartRunId) this.runId = this.lineStartRunId;
    };

    while (this.runId > this.lineStartRunId) {
      const endRun = this.runId < runs.length ? runs[this.runId] : undefined;
      const nextStartRun = this.runId + 1 < runs.length ? runs[this.runId + 1] : undefined;

      // 行末禁則（始め括弧などで行を終えない）
      if (endRun && isNotEndingChar(endRun.char)) {
        decreaseRunId();
        continue;
      }

      // 行頭禁則（句読点・終わり括弧などで行を始めない）
      if (nextStartRun && isNotStartingChar(nextStartRun.char)) {
        decreaseRunId();
        continue;
      }

      // 分離禁止（「……」「——」の途中で改行しない）。並びが行の先頭から始まるか 1 行に収まらないときは、そのまま分ける
      if (endRun && nextStartRun && isInseparablePair(endRun.char, nextStartRun.char)) {
        const sequence = this.inseparableSequence(this.runId);
        const lineLength = ctx.direction === "lrTb" ? this.maxX : this.maxY;
        if (sequence.start > this.lineStartRunId && ctx.advanceOfToken(sequence) <= lineLength + EPS) {
          this.runId = sequence.start;
          decreaseRunId();
          continue;
        }
      }

      break;
    }
  }

  /** runId と runId + 1 の run を含む、分離禁止文字の並び（「……」など）の範囲。 */
  private inseparableSequence(runId: number): Token {
    const runs = this.ctx.runs;
    let start = runId;
    while (start > 0 && isInseparablePair(runs[start - 1].char, runs[start].char)) start -= 1;
    let end = runId + 2;
    while (end < runs.length && isInseparablePair(runs[end - 1].char, runs[end].char)) end += 1;
    return { start, end };
  }

  //--------------------------------------------------------------//
  // Post layout (common)
  //--------------------------------------------------------------//

  /** 行 [.., end) が均等配置の対象かどうか。最終行と、改行で終わる行は対象外。 */
  private isJustifiedLine(end: number): boolean {
    const runs = this.ctx.runs;
    return this.ctx.textAlign === "justify" && end < runs.length && !runs[end - 1].isNewline;
  }

  /**
   * 均等配置で prev と run の間を広げてよいかどうか。
   * 欧文（latin）同士の間は単語の途中（"yori.so" や数字の桁のように空白を挟まない並び）なので広げない。
   * 分離禁止文字の間（「……」「——」）も、点や線がつながって見えるように広げない。
   * 和文同士・和欧の境目・空白の前後は広げる。
   */
  private isJustifiableGap(prev: Run, run: Run): boolean {
    if (isSpaceRun(prev) || isSpaceRun(run)) return true;
    if (isInseparablePair(prev.char, run.char)) return false;
    const fm = this.ctx.fontManager;
    return !(fm.script(prev.fontId) === "latin" && fm.script(run.fontId) === "latin");
  }

  /** 縦書きの均等配置で prev と run の間を広げてよいかどうか。縦中横の途中（横に並ぶ数字の間）は広げない。 */
  private isJustifiableGapTbRl(prev: Run, run: Run): boolean {
    if (prev.tokenId === run.tokenId && this.ctx.isTateChuYoko(run)) return false;
    return this.isJustifiableGap(prev, run);
  }

  /**
   * 行末に連続する空白を幅 0（縦書きは高さ 0）にして寄せの計算から除き、空白を除いた行の終端（run ID + 1）を返す。
   * ブラウザが行末の空白を行幅に含めないのと同じ扱い。幅を 0 にする（領域外へ押し出さない）ので、
   * 行が updateVisibility で領域からはみ出したとみなされることはない。
   */
  private collapseTrailingSpaces(start: number, end: number): number {
    const runs = this.ctx.runs;
    const horizontal = this.ctx.direction === "lrTb";
    let contentEnd = end;
    while (contentEnd > start && isSpaceRun(runs[contentEnd - 1])) {
      const run = runs[contentEnd - 1];
      run.frame = horizontal ? { ...run.frame, width: 0 } : { ...run.frame, height: 0 };
      contentEnd -= 1;
    }
    return contentEnd;
  }

  private forEachLine(fn: (start: number, end: number) => void): void {
    const runs = this.ctx.runs;
    let line = 0;
    let lower = -1;
    let upper = 0;
    for (let runId = 0; runId < runs.length; runId++) {
      if (runs[runId].line === line) {
        if (lower === -1) lower = runId;
        upper = runId;
        continue;
      }
      if (lower !== -1) fn(lower, upper + 1);
      line = runs[runId].line;
      lower = runId;
      upper = runId;
    }
    if (lower !== -1) fn(lower, upper + 1);
  }

  /**
   * 行送り方向の寄せに使う長さ。先頭の行から順に、行送り方向の大きさ limit に収まる行までの長さを返す
   * （収まらない行は updateVisibility で隠すので寄せに含めない。先頭の行は収まらなくても含める）。
   * extent(run) は先頭の行の始まりから run の終わりまでの行送り方向の長さ。
   */
  private fittingExtent(extent: (run: Run) => number, limit: number): number {
    const runs = this.ctx.runs;
    let result = -Infinity;
    let lineExtent = -Infinity;
    for (let i = 0; i < runs.length; i++) {
      lineExtent = Math.max(lineExtent, extent(runs[i]));
      if (i + 1 < runs.length && runs[i + 1].line === runs[i].line) continue;
      // 行の終わり
      if (result !== -Infinity && lineExtent > limit + EPS) break;
      result = Math.max(result, lineExtent);
      lineExtent = -Infinity;
    }
    return result;
  }

  /** i から手前に見て最初の、改行・空白でない run の ID（縦中横ならその先頭）。無ければ -1。 */
  private lastCharRunAtOrBefore(i: number): number {
    const ctx = this.ctx;
    const runs = ctx.runs;
    while (i >= 0 && isBlankChar(runs[i].char)) i -= 1;
    if (i >= 0 && ctx.isTateChuYoko(runs[i])) i = ctx.tokens[runs[i].tokenId].start;
    return i;
  }

  /**
   * run を省略記号にしたとき、省略記号が領域に収まるかどうか。省略記号は run の矩形の先頭から描く（render/svg.ts）。
   * 横書きは run のフォントの「…」の送り幅、縦書きは「︙」を 1em として測る。
   */
  private fitsEllipsis(run: Run): boolean {
    const ctx = this.ctx;
    const size = ctx.adjustFontSize;
    if (ctx.direction === "lrTb") {
      const ellipsis = ctx.fontManager.advance(run.fontId, size, HORIZONTAL_ELLIPSIS);
      return run.frame.x + ellipsis <= ctx.renderSize.width + EPS;
    }
    return run.frame.y + size <= ctx.renderSize.height + EPS;
  }

  /**
   * 切り詰め。先頭の行から、領域に完全に収まる行だけを表示し、収まらない最初の行とそれ以降の行は隠す（一部だけ見える行も描かない）。
   * 隠れた run に文字（改行・空白以外）があれば、表示する最後の文字を省略記号にして、その後ろ（行末の改行・空白や空行）も隠す。
   * 縦中横の途中に当たったときは、その縦中横の先頭を省略記号にする。
   * 省略記号が置き換える文字より大きくて領域からはみ出すときは、収まるまで同じ行の手前の文字も隠す（CSS の text-overflow: ellipsis と同じ）。
   */
  private updateVisibility(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const W = ctx.renderSize.width;
    const H = ctx.renderSize.height;

    const contains = (f: Rect): boolean =>
      f.x >= -EPS && f.y >= -EPS && f.x + f.width <= W + EPS && f.y + f.height <= H + EPS;

    // 領域からはみ出す最初の run を含む行の先頭（ここから後ろを隠す）
    let end = runs.findIndex((run) => !contains(run.frame));
    if (end === -1) end = runs.length;
    while (end > 0 && end < runs.length && runs[end - 1].line === runs[end].line) end -= 1;

    let hidesText = false;
    for (let i = 0; i < runs.length; i++) {
      runs[i].visibility = i < end ? "visible" : "invisible";
      if (i >= end && !isBlankChar(runs[i].char)) hidesText = true;
    }
    if (!hidesText) return;

    let last = this.lastCharRunAtOrBefore(end - 1);
    if (last < 0) return;
    // 行の最初の文字でも収まらなければ、そこに置いたまま領域で切り取られる（CSS と同じ）
    while (!this.fitsEllipsis(runs[last])) {
      const prev = this.lastCharRunAtOrBefore(last - 1);
      if (prev < 0 || runs[prev].line !== runs[last].line) break;
      last = prev;
    }
    runs[last].visibility = "ellipsis";
    for (let i = last + 1; i < end; i++) runs[i].visibility = "invisible";
  }

  //--------------------------------------------------------------//
  // Post layout (LrTb)
  //--------------------------------------------------------------//

  private shiftPositionLrTb(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    if (runs.length === 0) return;

    let minY = Infinity;
    for (const run of runs) {
      if (run.line !== 0) break;
      minY = Math.min(minY, run.frame.y);
    }
    if (!Number.isFinite(minY)) return;

    const H = ctx.renderSize.height;
    // middle / end で寄せるのは、先頭から高さに収まる行まで
    const height = this.fittingExtent((run) => run.frame.y + run.frame.height - minY, H);
    let dy: number;
    switch (ctx.directionAlign) {
      case "start":
        dy = -minY;
        break;
      case "middle":
        dy = Number.isFinite(H) ? (H - height) * 0.5 - minY : -minY;
        break;
      case "end":
        dy = Number.isFinite(H) ? H - height - minY : -minY;
        break;
    }

    for (const run of runs) {
      moveRun(run, 0, dy);
    }
  }

  /** 横書きの 1 行を textAlign に応じて寄せる。 */
  private alignLineLrTb(start: number, end: number): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const W = ctx.renderSize.width;
    if (!Number.isFinite(W)) return;

    const justified = this.isJustifiedLine(end);
    const contentEnd = justified ? this.collapseTrailingSpaces(start, end) : end;

    let total = 0;
    for (let i = start; i < end; i++) total += runs[i].frame.width;
    const diff = W - total;

    switch (ctx.textAlign) {
      case "leading":
        break;
      case "center":
        for (let i = start; i < end; i++) {
          moveRun(runs[i], diff * 0.5, 0);
        }
        break;
      case "trailing":
        for (let i = start; i < end; i++) {
          moveRun(runs[i], diff, 0);
        }
        break;
      case "justify": {
        // 最終行と、改行で終わる行は均等にしない
        if (!justified) break;
        // 余白は文字間（欧文の単語の途中を除く）に均等に配る。行末の空白（幅 0）の前には配らない
        let gapCount = 0;
        for (let i = start + 1; i < contentEnd; i++) {
          if (this.isJustifiableGap(runs[i - 1], runs[i])) gapCount += 1;
        }
        if (gapCount === 0) break;
        const gap = diff / gapCount;
        let x = runs[start].frame.x;
        for (let i = start; i < end; i++) {
          if (i > start && i < contentEnd && this.isJustifiableGap(runs[i - 1], runs[i])) x += gap;
          const dx = x - runs[i].frame.x;
          moveRun(runs[i], dx, 0);
          x += runs[i].frame.width;
        }
        break;
      }
    }
  }

  /** 横書きの描画サイズを更新する。 */
  private updateRenderedSizeLrTb(): void {
    const ctx = this.ctx;
    let maxX = 0;
    let maxY = 0;
    for (const run of ctx.runs) {
      maxX = Math.max(maxX, run.frame.x + run.frame.width);
      maxY = Math.max(maxY, run.frame.y + run.frame.height);
    }
    const height = Math.max(ctx.adjustLineHeight * ctx.lineCount, maxY);
    ctx.renderedSize = { width: maxX, height };
  }

  /** 横書きの後処理。 */
  private postLayoutLrTb(): void {
    this.shiftPositionLrTb();
    this.forEachLine((start, end) => this.alignLineLrTb(start, end));
    this.updateRenderedSizeLrTb();
    this.updateVisibility();
  }

  //--------------------------------------------------------------//
  // Post layout (TbRl)
  //--------------------------------------------------------------//

  private shiftPositionTbRl(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    if (runs.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    for (const run of runs) {
      minX = Math.min(minX, run.frame.x);
      maxX = Math.max(maxX, run.frame.x + run.frame.width);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;

    const W = ctx.renderSize.width;
    // middle / end で寄せるのは、先頭（右）から幅に収まる列まで
    const fittingMinX = maxX - this.fittingExtent((run) => maxX - run.frame.x, W);
    let dx: number;
    switch (ctx.directionAlign) {
      case "start":
        dx = Number.isFinite(W) ? W - maxX : -minX;
        break;
      case "middle":
        dx = Number.isFinite(W) ? (W - (maxX - fittingMinX)) * 0.5 - fittingMinX : -minX;
        break;
      case "end":
        dx = -fittingMinX;
        break;
    }

    for (const run of runs) {
      moveRun(run, dx, 0);
    }
  }

  /** 縦中横の数字を列の中央に寄せる。 */
  private applyTateChuYokoTbRl(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    for (const token of ctx.tokens) {
      if (!ctx.isTateChuYokoToken(token)) continue;
      let total = 0;
      for (let i = token.start; i < token.end; i++) total += runs[i].advance;
      const dx = (ctx.adjustFontSize - total) * 0.5;
      for (let i = token.start; i < token.end; i++) {
        moveRun(runs[i], dx, 0);
      }
    }
  }

  /** 縦書きの 1 列を textAlign に応じて寄せる。 */
  private alignLineTbRl(start: number, end: number): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const H = ctx.renderSize.height;
    if (!Number.isFinite(H)) return;

    const justified = this.isJustifiedLine(end);
    const contentEnd = justified ? this.collapseTrailingSpaces(start, end) : end;

    let total = 0;
    for (let i = start; i < end; i++) {
      const run = runs[i];
      if (ctx.isTateChuYoko(run)) {
        if (run.tokenRunIndex === 0) total += run.frame.height;
      } else {
        total += run.frame.height;
      }
    }
    const diff = H - total;

    switch (ctx.textAlign) {
      case "leading":
        break;
      case "center":
        for (let i = start; i < end; i++) {
          moveRun(runs[i], 0, diff * 0.5);
        }
        break;
      case "trailing":
        for (let i = start; i < end; i++) {
          moveRun(runs[i], 0, diff);
        }
        break;
      case "justify": {
        if (!justified) break;
        let gapCount = 0;
        for (let i = start + 1; i < contentEnd; i++) {
          if (this.isJustifiableGapTbRl(runs[i - 1], runs[i])) gapCount += 1;
        }
        if (gapCount === 0) break;
        const gap = diff / gapCount;
        let y = runs[start].frame.y;
        for (let i = start; i < end; i++) {
          const run = runs[i];
          if (i > start && i < contentEnd && this.isJustifiableGapTbRl(runs[i - 1], run)) y += gap;
          const dy = y - run.frame.y;
          moveRun(run, 0, dy);
          if (ctx.isTateChuYoko(run)) {
            if (ctx.isLastInToken(run)) y += run.frame.height;
          } else {
            y += run.frame.height;
          }
        }
        break;
      }
    }
  }

  /** 縦書きの描画サイズを更新する。 */
  private updateRenderedSizeTbRl(): void {
    const ctx = this.ctx;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const run of ctx.runs) {
      minX = Math.min(minX, run.frame.x);
      maxX = Math.max(maxX, run.frame.x + run.frame.width);
      minY = Math.min(minY, run.frame.y);
      maxY = Math.max(maxY, run.frame.y + run.frame.height);
    }
    ctx.renderedSize = {
      width: Number.isFinite(minX) && Number.isFinite(maxX) ? maxX - minX : 0,
      height: Number.isFinite(minY) && Number.isFinite(maxY) ? maxY - minY : 0,
    };
  }

  /** 縦書きの後処理。 */
  private postLayoutTbRl(): void {
    // 縦中横の中央寄せは寄せより前に行う（1em より広い縦中横のはみ出しも含めて寄せる）
    this.applyTateChuYokoTbRl();
    this.shiftPositionTbRl();
    this.forEachLine((start, end) => this.alignLineTbRl(start, end));
    this.updateRenderedSizeTbRl();
    this.updateVisibility();
  }

  /** 方向に応じた後処理。 */
  private postLayout(): void {
    if (this.ctx.direction === "lrTb") this.postLayoutLrTb();
    else this.postLayoutTbRl();
  }

  //--------------------------------------------------------------//
  // Layout
  //--------------------------------------------------------------//

  /** runs の advance が埋まっている前提で、位置・行・可視性を決定する。 */
  layout(): void {
    const ctx = this.ctx;
    ctx.lineCount = 0;
    this.x = 0;
    this.y = 0;
    this.tmpX = null;
    this.runId = 0;
    this.lineStartRunId = 0;

    while (this.runId < ctx.runs.length) {
      this.layoutRun();
      if (ctx.runs[this.runId].isNewline) this.goNextLine();
      else this.goNextChar();
      this.runId += 1;
    }

    ctx.lineCount += 1;
    this.postLayout();
  }
}
