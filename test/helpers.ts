import { FixedMeasurer, layoutText, type FontStyleSpan, type StoneContext, type StoneOptions } from "../src/index.js";

export const measurer = new FixedMeasurer();

/** fontSize 10、全角 10px、半角 5.5px（latin scale 0.95 で 5.225px。太字は 6px で 5.7px）の決定的なレイアウト。 */
export function lay(
  text: string,
  options: StoneOptions = {},
  size: { width?: number; height?: number } = {},
  spans?: readonly FontStyleSpan[],
): StoneContext {
  return layoutText(text, { fontSize: 10, dividesByWords: false, ...options }, measurer, size, spans);
}

export function chars(ctx: StoneContext, line: number): string {
  return ctx.runs
    .filter((r) => r.line === line && !r.isNewline)
    .map((r) => r.char)
    .join("");
}

/** 描画される文字列。省略記号になった run は「…」にし、非表示の run は除く（改行の run も表示されていれば含める）。 */
export function shown(ctx: StoneContext): string {
  let s = "";
  for (const run of ctx.runs) {
    if (run.visibility === "ellipsis") s += "…";
    else if (run.visibility === "visible") s += run.char;
  }
  return s;
}

export function lines(ctx: StoneContext): string[] {
  const out: string[] = [];
  for (let i = 0; i < ctx.lineCount; i++) out.push(chars(ctx, i));
  return out;
}

export function runOf(ctx: StoneContext, char: string, nth = 0) {
  let n = 0;
  for (let i = 0; i < ctx.runs.length; i++) {
    if (ctx.runs[i].char === char) {
      if (n === nth) return { id: i, run: ctx.runs[i] };
      n++;
    }
  }
  throw new Error(`run not found: ${char}`);
}
