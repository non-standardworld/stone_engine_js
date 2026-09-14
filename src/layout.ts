/*
layout.ts — 行分割・禁則・約物処理・縦中横・文字寄せを行うレイアウタ。Swift 版 STLayout.swift に対応。

Swift 版との意図的な差異（いずれも元実装の明らかな不具合の修正）:
- 禁則の追い出しは「行末 run を含むトークンの直前」まで戻す（元実装は 1 つ前の run のトークン長だけ戻すため単語が割れることがある）。
- 行頭の「 などを半角にする処理は行末 run まで含めて位置をずらし、前行末との約物処理で既に半角になっている場合は二重に詰めない。
- 均等配置はトークン間の隙間を (トークン数 - 1) で割り、frame 基準で並べ直す（元実装は行末が余り、行頭約物と重なることがあった）。
- 縦書きの均等配置で 1 桁の縦中横トークンの後に送りが進まない問題を修正。
- directionAlign = middle の横書きで、最初の行のアセント分だけずれる問題を修正。
- renderedSize の高さは縮小後の行送りで計算する。
*/

import type { StoneContext } from "./context.js";
import { isNotEndingChar, isNotStartingChar } from "./punctuation.js";
import type { Rect } from "./types.js";

const EPS = 1e-6;

/** 矩形を平行移動した新しい矩形を返す。 */
function shiftRect(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
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
        height: ctx.fontSize,
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
      case "stone": {
        if (runId > 0) {
          const prev = runs[runId - 1];
          // 「」「」「「」「・「」のように、前が約物なら後ろの始め括弧を半角にする
          if (
            run.punctuation === "secondHalf" &&
            (prev.punctuation === "firstHalf" ||
              prev.punctuation === "secondHalf" ||
              prev.punctuation === "quarter")
          ) {
            posX = this.x - run.advance * 0.5;
            width = run.advance * 0.5;
          }
        }
        if (runId + 1 < runs.length) {
          const next = runs[runId + 1];
          // 「。」」「」・」のように、後ろが約物なら終わり括弧・句読点を半角にする
          if (
            run.punctuation === "firstHalf" &&
            (next.punctuation === "firstHalf" || next.punctuation === "quarter")
          ) {
            width = run.advance * 0.5;
          }
        }
        break;
      }
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
      run.frame = { x: this.x, y: this.y, width: ctx.fontSize, height: 0 };
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
      case "stone": {
        if (runId > 0) {
          const prev = runs[runId - 1];
          if (
            run.punctuation === "secondHalf" &&
            (prev.punctuation === "firstHalf" ||
              prev.punctuation === "secondHalf" ||
              prev.punctuation === "quarter")
          ) {
            posY -= size * 0.5;
            height = size * 0.5;
          }
        }
        if (runId + 1 < runs.length) {
          const next = runs[runId + 1];
          if (
            run.punctuation === "firstHalf" &&
            (next.punctuation === "firstHalf" || next.punctuation === "quarter")
          ) {
            height = size * 0.5;
          }
        }
        break;
      }
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
          runs[i].position = { x: runs[i].position.x - dx, y: runs[i].position.y };
          runs[i].frame = shiftRect(runs[i].frame, -dx, 0);
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
          runs[i].position = { x: runs[i].position.x, y: runs[i].position.y - dy };
          runs[i].frame = shiftRect(runs[i].frame, 0, -dy);
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

  /** 行末禁則・行頭禁則。行末をトークン単位で手前に戻す。 */
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

      break;
    }
  }

  //--------------------------------------------------------------//
  // Post layout (common)
  //--------------------------------------------------------------//

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

  /** 領域に収まらない run を invisible / ellipsis にする。 */
  private updateVisibility(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const W = ctx.renderSize.width;
    const H = ctx.renderSize.height;

    const contains = (f: Rect): boolean =>
      f.x >= -EPS && f.y >= -EPS && f.x + f.width <= W + EPS && f.y + f.height <= H + EPS;
    const intersects = (f: Rect): boolean => {
      if (f.width === 0 || f.height === 0) return contains(f);
      return f.x < W && f.x + f.width > 0 && f.y < H && f.y + f.height > 0;
    };

    for (let i = 0; i < runs.length; i++) {
      const isShown = intersects(runs[i].frame);
      const nextIsShown = i < runs.length - 1 ? contains(runs[i + 1].frame) : true;
      if (isShown && !nextIsShown) runs[i].visibility = "ellipsis";
      else runs[i].visibility = isShown ? "visible" : "invisible";
    }
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
    let maxY = -Infinity;
    for (const run of runs) maxY = Math.max(maxY, run.frame.y + run.frame.height);
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return;

    const H = ctx.renderSize.height;
    let dy: number;
    switch (ctx.directionAlign) {
      case "start":
        dy = -minY;
        break;
      case "middle":
        dy = Number.isFinite(H) ? (H - (maxY - minY)) * 0.5 - minY : -minY;
        break;
      case "end":
        dy = Number.isFinite(H) ? H - maxY : -minY;
        break;
    }

    for (const run of runs) {
      run.position = { x: run.position.x, y: run.position.y + dy };
      run.frame = shiftRect(run.frame, 0, dy);
    }
  }

  /** 横書きの 1 行を textAlign に応じて寄せる。 */
  private alignLineLrTb(start: number, end: number): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const W = ctx.renderSize.width;
    if (!Number.isFinite(W)) return;

    let total = 0;
    let tokenCount = 0;
    let prevTokenId = -1;
    for (let i = start; i < end; i++) {
      total += runs[i].frame.width;
      if (runs[i].tokenId !== prevTokenId) {
        tokenCount += 1;
        prevTokenId = runs[i].tokenId;
      }
    }
    const diff = W - total;

    switch (ctx.textAlign) {
      case "leading":
        break;
      case "center":
        for (let i = start; i < end; i++) {
          runs[i].position = { x: runs[i].position.x + diff * 0.5, y: runs[i].position.y };
          runs[i].frame = shiftRect(runs[i].frame, diff * 0.5, 0);
        }
        break;
      case "trailing":
        for (let i = start; i < end; i++) {
          runs[i].position = { x: runs[i].position.x + diff, y: runs[i].position.y };
          runs[i].frame = shiftRect(runs[i].frame, diff, 0);
        }
        break;
      case "justify": {
        // 最終行と、改行で終わる行は均等にしない
        if (end >= runs.length) return;
        if (runs[end - 1].isNewline) break;
        if (tokenCount <= 1) break;
        const gap = diff / (tokenCount - 1);
        let x = runs[start].frame.x;
        let prev = runs[start].tokenId;
        for (let i = start; i < end; i++) {
          if (runs[i].tokenId !== prev) {
            prev = runs[i].tokenId;
            x += gap;
          }
          const dx = x - runs[i].frame.x;
          runs[i].position = { x: runs[i].position.x + dx, y: runs[i].position.y };
          runs[i].frame = shiftRect(runs[i].frame, dx, 0);
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
    let dx: number;
    switch (ctx.directionAlign) {
      case "start":
        dx = Number.isFinite(W) ? W - maxX : -minX;
        break;
      case "middle":
        dx = Number.isFinite(W) ? (W - (maxX - minX)) * 0.5 - minX : -minX;
        break;
      case "end":
        dx = -minX;
        break;
    }

    for (const run of runs) {
      run.position = { x: run.position.x + dx, y: run.position.y };
      run.frame = shiftRect(run.frame, dx, 0);
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
        runs[i].position = { x: runs[i].position.x + dx, y: runs[i].position.y };
        runs[i].frame = shiftRect(runs[i].frame, dx, 0);
      }
    }
  }

  /** 縦書きの 1 列を textAlign に応じて寄せる。 */
  private alignLineTbRl(start: number, end: number): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const H = ctx.renderSize.height;
    if (!Number.isFinite(H)) return;

    let total = 0;
    let tokenCount = 0;
    let prevTokenId = -1;
    for (let i = start; i < end; i++) {
      const run = runs[i];
      if (ctx.isTateChuYoko(run)) {
        if (run.tokenRunIndex === 0) total += run.frame.height;
      } else {
        total += run.frame.height;
      }
      if (run.tokenId !== prevTokenId) {
        tokenCount += 1;
        prevTokenId = run.tokenId;
      }
    }
    const diff = H - total;

    switch (ctx.textAlign) {
      case "leading":
        break;
      case "center":
        for (let i = start; i < end; i++) {
          runs[i].position = { x: runs[i].position.x, y: runs[i].position.y + diff * 0.5 };
          runs[i].frame = shiftRect(runs[i].frame, 0, diff * 0.5);
        }
        break;
      case "trailing":
        for (let i = start; i < end; i++) {
          runs[i].position = { x: runs[i].position.x, y: runs[i].position.y + diff };
          runs[i].frame = shiftRect(runs[i].frame, 0, diff);
        }
        break;
      case "justify": {
        if (end >= runs.length) return;
        if (runs[end - 1].isNewline) break;
        if (tokenCount <= 1) break;
        const gap = diff / (tokenCount - 1);
        let y = runs[start].frame.y;
        let prev = runs[start].tokenId;
        for (let i = start; i < end; i++) {
          const run = runs[i];
          if (run.tokenId !== prev) {
            prev = run.tokenId;
            y += gap;
          }
          const dy = y - run.frame.y;
          run.position = { x: run.position.x, y: run.position.y + dy };
          run.frame = shiftRect(run.frame, 0, dy);
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
    this.shiftPositionTbRl();
    this.applyTateChuYokoTbRl();
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
