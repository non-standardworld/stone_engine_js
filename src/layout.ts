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
- 行の先頭位置（context.ts の firstRunFrame）は、行送り方向に寄せたあとの位置で返す。寄せるのは、高さを決めて directionAlign を
  middle / end にした横書きと、幅を決めた縦書き（幅を決めると、start でも列は領域の右端から並ぶ）。点にいちばん近い文字位置
  （closestRunIndex）は、この位置で「点にいちばん近い行」を選ぶ。寄せた量は、レイアウト後の run の矩形から求める（lineShift）。
  （元実装は、寄せる前の位置（横書きは先頭の行の上端が 0、縦書きは右端の列の右端が renderedSize の幅）で求めるため、寄せた量が
  行送りより大きいと、点とは違う行（縦書きは列）の文字位置を返した。10px の文字の 5 行を高さ 200px の下端に寄せると、上の 3 行の
  どこを指しても 4 行目の文字になり、5 列を幅 200px に組むと、3 列目から左のどこを指しても 2 列目の文字になった。）
- 改行の run の矩形は、同じ文字種の文字と同じく縮小後のフォントサイズで作る（元実装は縮小前の fontSize のため、縮小すると行が実際より
  大きく見積もられて切り詰められたままになり、縦書きでは列が左にずれた）。
- 縦中横の中央寄せは行送り方向の寄せより前に行う（元実装は寄せた後に中央寄せするため、1em より広い 2 桁の縦中横が左端の列にあると
  領域の左にはみ出し、大きさを制限していなくても切り詰められた）。
- 縦書きの列が領域の幅に収まるかどうかは、1em より広い縦中横（2 桁の数字。既定のフォントで約 1.06em）を列の 1em の箱として見る
  （columnSpanTbRl）。数字は列の中央に寄せるので箱の両側に同じだけはみ出すが、はみ出しは列の幅に数えない。列を寄せる位置は、
  今までどおり数字のはみ出しも領域に収まるように決め、それでは列の箱が領域から出るとき（幅が列数ちょうどで、右端か左端の列に
  2 桁の縦中横があるときなど）だけ、箱が収まるところまで戻して、数字を領域の外にはみ出させる。数字を描く位置と大きさは変えない
  （幅と高さを両方決めた領域では、はみ出した分を SVG が切り取る。既定のフォントでは、数字の字面はほぼ箱の中にある）。
  （はみ出しを含む矩形で見ると、幅が列数ちょうどの領域では、端の列に 2 桁の縦中横があるだけで、はみ出しの分（17px で 0.5px
  足らず）のために最後の列が隠れた。「12」だけを 1 列ぶんの幅に組むと、何も表示されなかった。元実装も数字のはみ出しを含む矩形で
  寄せるので、右端の列に 2 桁の縦中横があると左端の列が領域から出る。領域と重なる run は表示するので列ごとは隠れないが、
  その列の文字がほぼ省略記号になる。）
- 縦書きの列を寄せる位置と renderedSize の幅は、1em より狭い縦中横（1 桁の数字。既定のフォントで約 0.53em）を列の 1em の箱として
  決める（alignSpanTbRl）。数字は列の中央に寄せるので、矩形（数字の送り幅）の両側に同じだけ空きがある。数字だけの列（改行の run も
  ほかの文字も無い列）が右端か左端にあっても、列の箱を領域の端に合わせ、幅を決めない領域では renderedSize の幅を列の箱の並びの幅にする。
  列が領域の幅に収まるかどうかは、今までどおり数字の矩形で見る（columnSpanTbRl）。列の箱が幅に足りなくても、数字が収まっていれば
  表示し、そのときは数字が収まるところまで列を戻す（箱の空きが領域の外に出る。表示される文字は、矩形だけで見たときと変わらない）。
  行の先頭位置（firstRunFrame）が使う「寄せた量」も、いちばん左の列が数字だけなら、列の箱の左端で求める（context.ts の lineShift）。
  （矩形だけで見ると、列の端が数字の幅で決まる。「7あ」を 1 文字ぶんの高さ・2 列ちょうどの幅に組むと、「7」が領域の右端に付いて
  「あ」の列が約 0.24em 右にずれ、「あ7」を幅を決めずに組むと、renderedSize の幅が 2 列ぶんより約 0.24em 狭くなった。元実装は、
  列を寄せたあとで縦中横を中央に寄せるので、右端の列が 1 桁の縦中横だけだと、どの列も約 0.48em 右にずれ、その数字は右の
  約 0.24em が領域から出る。）
- 縦書きの正立の文字（和文・絵文字）は、矩形の幅（横書きの送り幅）が 1em でなくても、列の 1em の箱（矩形の左端から 1em）で列を寄せる
  （alignSpanTbRl）。矩形の幅が 1em でないのは、半角カナ（0.5em）、送り幅が 1em でない絵文字（Apple Color Emoji は 24px 未満で
  1.1〜1.3em。既定の 17px で約 1.24em）、スケールを 1 以外にした和文・絵文字。右端の列がこういう文字だけ（改行の run も、全角の文字も、
  回転する欧文も無い列）でも、列の箱を領域の端に合わせ、幅を決めない領域では renderedSize の幅を列の箱の並びの幅にする。
  行の先頭位置（firstRunFrame）も列の箱の位置になる（正立の文字の矩形の左端は列の箱の左端なので、context.ts の lineShift はそのまま）。
  列が領域の幅に収まるかどうかは、矩形と箱の重なりで見る（columnSpanTbRl）。1em より狭い文字は今までどおり矩形で見て、列の箱が幅に
  足りなくても矩形が収まっていれば表示する（そのときは矩形が収まるところまで列を戻す。表示される文字は、矩形だけで見たときと変わらない）。
  1em より広い文字は列の箱で見て、箱の右にはみ出す送り幅は、列の幅にも、列を寄せる位置にも数えない。
  描く位置と矩形は変えない（文字は列の左端から描く）。実フォントでは、半角カナは vrt2 の横倒しの字形が列の幅いっぱいに描かれ
  （vert を使わない WebKit では、正立のまま列の左半分）、小さいサイズの絵文字は字面が列の箱の中央に来て、広いぶんは右側の空きに
  なるので、縦中横のように送り幅で列の中央に寄せると、かえってずれる。スケールを 1 より大きくした文字は、字面が箱の右にはみ出すので、
  右端の列では領域の右に出ることがある。
  （矩形で見ると、列の端が送り幅で決まる。「ｱあ」を 1 文字ぶんの高さ・2 列ちょうどの幅に組むと、「ｱ」の矩形が領域の右端に付いて
  どの列も約 0.5em 右にずれ（「ｱ」の列の箱が領域の右に出る）、「ｶﾅ」だけを幅を決めずに組むと renderedSize の幅が 0.5em になった。
  1em より広い文字では逆に列が左にずれ、幅が列数ちょうどの領域では最後の列が隠れた（17px の「😀と書く」を 2 文字ぶんの高さ・
  2 列ちょうどの幅に組むと「😀︙」になった）。元実装も run の矩形で列を寄せる。）
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
- 縦書きの折り返しは、次のトークン（トークンの途中なら次の文字）が列の中で占める長さで判定する。正立の文字（和文・絵文字）は 1em、
  縦中横は横に並べた 1 つのまとまりで 1em、回転する欧文は送り幅（extentOfToken / columnExtentOfRun）。
  （元実装は、次のトークンを横書きの送り幅の合計で見積もるため、1 桁の縦中横（約 0.55em）や半角カナ、スケールを 1 未満にした和文が
  列末に来ると、残りが 1em に足りなくても同じ列に置かれて領域からはみ出し、その列から後ろが切り詰められた。2 桁の縦中横は逆に
  1em より長く見積もられ、残りがちょうど 1em の列に入らなかった。トークンの途中では次の文字をいつも 1em と見積もるため、
  列に収まる欧文の単語が、残りが 1em を切ったところで途中から次の列へ折り返された。）
- 禁則の追い出しは、縦書きの列の先頭にある縦中横の途中までは戻さない（minLineEndRunId）。追い出しで戻れるのは行の最初の文字までだが、
  列が縦中横で始まるときは、そのまとまりの最後の数字までにする。そこまで戻っても禁則を満たせないとき（縦中横の後ろに行頭禁則の
  文字が続いて 1 列に収まらないとき）は、縦中横だけを列に残して改行する（1 桁の縦中横や和文の文字で始まる列と同じ分かれ方）。
  欧文の単語や 3 桁以上の数字のように途中で折り返せるトークンと、横書きは、今までどおり行の最初の文字まで戻す。
  （元実装は、追い出しを行の最初の run で止めるため、2 桁の縦中横で始まる列で追い出しが先頭まで戻ると、1 桁目の後ろで改行して
  2 桁目が次の列に分かれた（「12々）」を 2 文字しか入らない高さに組むと「1」「2」「々）」）。2 桁目だけの列は、行末寄せで
  列の長さが 0 と見積もられて領域の外に置かれ、その列から後ろが切り詰められた。）
- 縦中横かどうかは、トークン単位で決める（context.ts の isTateChuYoko）。縦中横にするのは、2 文字以下で、どの文字も回転する文字種
  （欧文フォント）の数字であるトークンだけ。全角の数字のように正立する文字種の数字が混ざったトークン（「1２」「２1」）は縦中横にせず、
  半角の数字は回転する欧文、全角の数字は正立の和文として、3 桁以上の数字と同じように 1 文字ずつ送る。
  （元実装は run ごとに文字種を見るため、同じトークンの半角の数字だけが縦中横になった。レイアウトは、縦中横のトークンはどの run も
  縦中横として組むので、「1２」では「２」が「1」の横に置かれたまま横の位置が戻らず、後ろの文字と列が「1」の幅だけ右にずれた
  （その後ろの列に 2 桁の縦中横が来ると、そこから後ろが「1２」の列に戻って重なった）。行揃えでは「1２」を 1 文字ぶん多く数え、
  「２1」では「1」を数え落とすため、中央寄せ・行末寄せ・均等配置で列が領域の上か下にはみ出し、その列から後ろが切り詰められた。）

Swift 版にない追加（これも意図的な差異。オプションを指定しない限り、挙動は変わらない）:
- 字間（letterSpacing、px）。CSS の letter-spacing と同じく各文字の後ろに足し、run の矩形（frame）の行方向の長さに含める。
  行末の文字の後ろにも足すので、折り返しの判定・行揃え・均等配置・renderedSize は、行末の字間も含めて計算する
  （Chromium の CSS と同じ。中央寄せと行末寄せでは、行末側に字間 1 つぶんの空きが残る）。
  縦中横の途中（横に並ぶ数字の間）と、分離禁止文字の間（「……」「——」）には足さない。縦中横はまとまりの後ろに 1 回だけ足す。
  約物の半角詰め（punctuationMode）の幅は、字間を含めない送り幅の 0.5 倍で計算し、その後ろに字間を足す。
  切り詰めも同じ矩形（後ろの字間を含む）で、領域に収まるかどうかを見る。折り返した行は行末の字間まで収まっているので、
  変わるのは 1 トークンだけの行で、文字とその後ろの字間が入らないほど狭い領域では、その行から後ろを隠す。
  省略記号は置き換える文字の矩形の先頭に置き、省略記号そのものの幅が収まるかどうかを見る（省略記号の後ろの字間は見ない）。
  負の値で詰められるが、文字の矩形の長さは 0 より短くしない。
- 字下げ（textIndent、px）。段落の 1 行目（テキストの先頭の行と、改行の run の直後の行）の行頭に空きを入れる。折り返しで始まる行には
  入れない。字下げした行は、そのぶん短い行として折り返し・行揃え・均等配置を行う（CSS の text-indent と同じ。中央寄せでは字下げの
  半分だけ行末側に寄り、行末寄せでは位置が変わらない）。renderedSize には字下げを含める。
  textIndentEachLine が false なら、CSS の text-indent の既定と同じく、テキストの先頭の行だけに入れる（<br> の後ろの行に入れない）。
  行頭の始め括弧の半角詰め（stone / half）は、字下げした行でも、字下げの後ろを行頭として同じように行う。字下げが 1em なら「 の字面が
  1em の位置から始まり、折り返しの行頭では天付きになる（JLREQ「行頭の始め括弧類の配置方法」の、改行行頭の字下げは全角アキ、
  折り返し行頭は天付きとする方法）。whole では全角のまま置くので、字面は字下げ + 0.5em の位置になる。
  負の値なら 1 行目が領域の手前（横書きは左、縦書きは上）に出る（ぶら下げ）。手前に出た分は、切り詰めの対象にしない。
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
import type { Run, Token } from "./types.js";

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
  /**
   * 幅が 1em でない縦中横のトークン ID と、その列の 1em の箱の左端（px）、数字の並びが箱より広いかどうか。
   * applyTateChuYokoTbRl が中央に寄せるときに決め、shiftPositionTbRl が run と一緒に動かす。
   * columnSpanTbRl（列が領域に収まるかどうか）と alignSpanTbRl（列を寄せる位置と renderedSize）が使う。
   */
  private readonly tateChuYokoBoxes = new Map<number, { left: number; wide: boolean }>();
  /**
   * 縦書きで、矩形の幅（横書きの送り幅）が 1em でない正立の文字の run（縦中横の数字は除く）。半角カナ、送り幅が 1em でない絵文字、
   * スケールを 1 以外にした和文・絵文字など。矩形は列の左端から送り幅ぶんなので、列の 1em の箱は「矩形の左端から 1em」。
   * layoutRunTbRl が覚え、columnSpanTbRl（列が領域に収まるかどうか）と alignSpanTbRl（列を寄せる位置と renderedSize）が使う。
   */
  private readonly nonEmUprightRuns = new Set<Run>();

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
  // Letter spacing and text indent
  //--------------------------------------------------------------//

  /**
   * 行方向の長さが extent の run に、その後ろの字間を足した長さ。字間が無ければ extent をそのまま返す。
   * 負の字間で詰めるときも、0 より短くはしない（矩形の大きさが負にならず、後ろの文字が手前に戻らないように）。
   */
  private spaced(runId: number, extent: number): number {
    const spacing = this.ctx.letterSpacingAfter(runId);
    return spacing === 0 ? extent : Math.max(0, extent + spacing);
  }

  /**
   * 縦書きで run が列の中で占める長さ（字間を含む）。layoutRunTbRl が作る矩形の高さと同じ見積もりで、約物の詰めは見ない。
   * 回転する欧文は送り幅、正立の文字（和文・絵文字・縦中横の数字）は 1em、改行は 0。
   */
  private columnExtentOfRun(runId: number): number {
    const ctx = this.ctx;
    const run = ctx.runs[runId];
    if (run.isNewline) return 0;
    return this.spaced(runId, ctx.isClockwise(run) ? run.advance : ctx.adjustFontSize);
  }

  /**
   * トークン（run の範囲）が行の中で占める長さ（字間を含む）。折り返しの判定に使う（約物の詰めは見ない）。
   * 横書きは送り幅の合計。縦書きは、列の中で実際に占める長さ（columnExtentOfRun）の合計で、縦中横は横に並べた 1 つのまとまりとして
   * 1em（字間は後ろに 1 回だけ）。横書きの送り幅で見積もると、1 桁の縦中横や半角カナのように送り幅が 1em より狭い文字が、列からはみ出す。
   */
  private extentOfToken(token: Token): number {
    const ctx = this.ctx;
    if (ctx.direction === "lrTb") {
      if (ctx.adjustLetterSpacing === 0) return ctx.advanceOfToken(token);
      let total = 0;
      for (let i = token.start; i < token.end; i++) total += this.spaced(i, ctx.runs[i].advance);
      return total;
    }
    if (ctx.isTateChuYokoToken(token)) return this.columnExtentOfRun(token.end - 1);
    let total = 0;
    for (let i = token.start; i < token.end; i++) total += this.columnExtentOfRun(i);
    return total;
  }

  /**
   * run ID が lineStart の run から始まる行の字下げ（px）。字下げは段落の 1 行目（テキストの先頭の行と、改行の直後の行）にだけ入れ、
   * 折り返しで始まる行には入れない。textIndentEachLine が false なら、テキストの先頭の行だけに入れる。
   */
  private indentOfLine(lineStart: number): number {
    const ctx = this.ctx;
    const indent = ctx.adjustTextIndent;
    if (indent === 0 || lineStart === 0) return indent;
    return ctx.textIndentEachLine && ctx.runs[lineStart - 1].isNewline ? indent : 0;
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

    // 約物の詰めは字間を含めない送り幅で決め、その後ろに字間を足す
    run.position = { x: posX, y: this.y };
    run.frame = {
      x: this.x,
      y: this.y - fm.ascent(run.fontId, size),
      width: this.spaced(runId, width),
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
      run.frame = { x: this.x, y: this.y, width: size, height: this.spaced(runId, run.advance) };
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

    // 字間は行方向（高さ）に足す。縦中横の数字は横に並べるので、幅（数字の間）には足さず、どの数字の矩形もまとまりの後ろの字間を含む
    run.position = { x: this.x, y: posY };
    run.frame = { x: this.x, y: this.y, width: run.advance, height: this.spaced(runId, height) };
    // 正立の文字の矩形の幅は、横書きの送り幅。1em でなければ覚えておき、列を寄せるときは列の 1em の箱で見る（描く位置と矩形は変えない。
    // 縦中横の数字もここを通るが、中央に寄せる applyTateChuYokoTbRl が扱う）
    if (Math.abs(run.advance - size) > EPS && !ctx.isTateChuYoko(run)) this.nonEmUprightRuns.add(run);
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
      // 行頭の始め括弧を半角にして行全体を詰める（前行末との処理で既に半角なら何もしない）。
      // 字下げした行でも、字下げの後ろを行頭として同じように詰める（字下げが 1em なら「 の字面が 1em の位置から始まる）
      const start = this.lineStartRunId;
      const first = runs[start];
      if (
        first &&
        !first.isNewline &&
        first.punctuation === "secondHalf" &&
        first.frame.width >= this.spaced(start, first.advance) - EPS
      ) {
        const dx = first.advance * 0.5;
        first.position = { x: first.position.x - dx, y: first.position.y };
        first.frame = { ...first.frame, width: this.spaced(start, first.advance * 0.5) };
        for (let i = start + 1; i <= this.runId && i < runs.length; i++) {
          moveRun(runs[i], -dx, 0);
        }
      }

      // 行末の句読点・終わり括弧を半角にする
      const last = runs[this.runId];
      if (last && !last.isNewline && last.punctuation === "firstHalf") {
        last.frame = { ...last.frame, width: this.spaced(this.runId, last.advance * 0.5) };
      }
    }

    // 次の行が段落の 1 行目（改行の直後）なら、字下げから始める
    this.x = this.indentOfLine(this.runId + 1);
    this.y += ctx.adjustLineHeight;
  }

  /** 縦書きの行末処理をして次の行（左の列）へ進む。 */
  private goNextLineTbRl(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    const size = ctx.adjustFontSize;
    if (ctx.punctuationMode === "stone") {
      // 横書きと同じく、字下げした列でも字下げの後ろを行頭として始め括弧を詰める
      const start = this.lineStartRunId;
      const first = runs[start];
      if (
        first &&
        !first.isNewline &&
        first.punctuation === "secondHalf" &&
        first.frame.height >= this.spaced(start, size) - EPS
      ) {
        const dy = size * 0.5;
        first.position = { x: first.position.x, y: first.position.y - dy };
        first.frame = { ...first.frame, height: this.spaced(start, size * 0.5) };
        for (let i = start + 1; i <= this.runId && i < runs.length; i++) {
          moveRun(runs[i], 0, -dy);
        }
      }

      const last = runs[this.runId];
      if (last && !last.isNewline && last.punctuation === "firstHalf") {
        last.frame = { ...last.frame, height: this.spaced(this.runId, size * 0.5) };
      }
    }

    this.x -= ctx.adjustLineHeight;
    // 次の列が段落の 1 行目（改行の直後）なら、字下げから始める
    this.y = this.indentOfLine(this.runId + 1);
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
        // 次のトークン全体が収まるか（字間は行末の文字の後ろのぶんも含めて見る。CSS と同じ）
        if (this.x + this.extentOfToken(ctx.tokens[next.tokenId]) > this.maxX) this.goNextLine();
      } else if (this.x + this.spaced(this.runId + 1, next.advance) > this.maxX) {
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
      // どちらも、列の中で占める長さで見る（正立の文字と縦中横は 1em、回転する欧文は送り幅）
      if (run.tokenId !== next.tokenId) {
        if (this.y + this.extentOfToken(ctx.tokens[next.tokenId]) > this.maxY) this.goNextLine();
      } else if (this.y + this.columnExtentOfRun(this.runId + 1) > this.maxY) {
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

  /**
   * 禁則の追い出しで行末を戻せる、いちばん手前の run ID。行には、少なくとも最初の文字を残す。
   * 縦書きの列が縦中横で始まるときは、その最後の数字まで。縦中横は横に並べた 1 つのまとまりなので、途中では改行しない
   * （1 桁目だけを列に残すと、2 桁目が次の列に分かれる）。欧文の単語などは途中で折り返せるので、最初の文字まで戻す。
   */
  private minLineEndRunId(): number {
    const ctx = this.ctx;
    const start = this.lineStartRunId;
    const first = ctx.runs[start];
    // 縦中横かどうかはトークン単位で決まるので、先頭の数字が縦中横なら、トークンの最後の数字まで縦中横
    return first && ctx.isTateChuYoko(first) ? ctx.tokens[first.tokenId].end - 1 : start;
  }

  /**
   * 行末禁則・行頭禁則・分離禁止。行末をトークン単位で手前に戻す。
   * 行の最初の文字（縦中横で始まる列は、そのまとまり）まで戻っても禁則を満たせないときは、それだけを行に残して改行する。
   */
  private processNotEndingAndStarting(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    if (!ctx.kinsoku) return;
    if (runs[this.runId]?.isNewline) return;

    const minRunId = this.minLineEndRunId();

    const decreaseRunId = (): void => {
      const token = ctx.tokens[runs[this.runId].tokenId];
      this.runId = token.start - 1;
      if (this.runId < minRunId) this.runId = minRunId;
    };

    while (this.runId > minRunId) {
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
        if (sequence.start > this.lineStartRunId && this.extentOfToken(sequence) <= lineLength + EPS) {
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
   * measured を渡すと、収まるかどうかは extent で見て、返す長さは measured で測る（縦書きで、幅に収まる列までの、
   * 列を寄せる位置を決める範囲で測った長さ。shiftPositionTbRl）。
   */
  private fittingExtent(
    extent: (run: Run) => number,
    limit: number,
    measured: (run: Run) => number = extent,
  ): number {
    const runs = this.ctx.runs;
    let result = -Infinity;
    let lineExtent = -Infinity;
    let lineMeasured = -Infinity;
    for (let i = 0; i < runs.length; i++) {
      lineExtent = Math.max(lineExtent, extent(runs[i]));
      lineMeasured = measured === extent ? lineExtent : Math.max(lineMeasured, measured(runs[i]));
      if (i + 1 < runs.length && runs[i + 1].line === runs[i].line) continue;
      // 行の終わり
      if (result !== -Infinity && lineExtent > limit + EPS) break;
      result = Math.max(result, lineMeasured);
      lineExtent = -Infinity;
      lineMeasured = -Infinity;
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
    const horizontal = ctx.direction === "lrTb";
    // 負の字下げ（ぶら下げ）で 1 行目が領域の手前に出る分は、はみ出しとみなさない
    const lead = Math.min(0, ctx.adjustTextIndent);
    const minX = horizontal ? lead : 0;
    const minY = horizontal ? 0 : lead;

    // 縦書きで、列の 1em の箱と矩形の範囲が違う run（幅が 1em でない縦中横か正立の文字）があるときは、列の幅を columnSpanTbRl で見る
    // （1em より広いものは列の 1em の箱。箱が収まっていれば、はみ出した分ごと表示する。1em より狭いものは矩形のままなので、
    // 列の箱が領域から出ていても表示する）
    const boxed = !horizontal && this.hasColumnBoxes;
    const contains = (run: Run): boolean => {
      const f = run.frame;
      let left = f.x;
      let right = f.x + f.width;
      if (boxed) ({ left, right } = this.columnSpanTbRl(run));
      return left >= minX - EPS && f.y >= minY - EPS && right <= W + EPS && f.y + f.height <= H + EPS;
    };

    // 領域からはみ出す最初の run を含む行の先頭（ここから後ろを隠す）
    let end = runs.findIndex((run) => !contains(run));
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
    // 字下げした行は、字下げのぶん短い行として寄せる（run は字下げの位置から並んでいる）
    const diff = W - this.indentOfLine(start) - total;

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

  /**
   * 縦書きの列を、行送り方向（x）に寄せる。
   * 寄せる位置は、列の 1em の箱（alignSpanTbRl）で決める。正立の文字は、矩形の幅（横書きの送り幅）が 1em より狭くても広くても
   * （半角カナ、送り幅が 1em でない絵文字、スケールを変えた和文など）、列の箱で寄せる。縦中横は、1em より狭い（1 桁の数字など）なら
   * 列の箱で寄せ、1em より広いなら、数字が列の箱の両側にはみ出す分も領域に収まるように寄せる。
   * 列が幅に収まるかどうかは、矩形と箱の重なり（columnSpanTbRl。1em より広いものは列の箱、狭いものは矩形）で見る。寄せる範囲まで
   * 領域に収めると重なりが領域から出るとき（幅が列数ちょうどで、端の列に 2 桁の縦中横があるとき。列の箱が幅に足りず、端の列が
   * 1em より狭い文字だけのとき）は、重なりが収まるところまで戻す（広い数字は領域の外にはみ出し、狭い文字の列は箱の空きが領域の外に出る）。
   */
  private shiftPositionTbRl(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    if (runs.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    for (const run of runs) {
      const span = this.alignSpanTbRl(run);
      minX = Math.min(minX, span.left);
      maxX = Math.max(maxX, span.right);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;

    const W = ctx.renderSize.width;
    // 右端から run の左端までの長さ（列を寄せる位置を決める範囲で測る。広い縦中横の数字のはみ出しと、狭い文字の列の箱を含む）
    const extent = (run: Run): number => maxX - this.alignSpanTbRl(run).left;
    // 列の箱と矩形の範囲が違う run があれば、列が収まるかどうかを見る範囲（広い文字のはみ出しと、狭い文字の列の箱の空きを除く）で測った長さも使う
    const boxed = Number.isFinite(W) && this.hasColumnBoxes;
    let columnMaxX = maxX;
    if (boxed) {
      columnMaxX = -Infinity;
      for (const run of runs) columnMaxX = Math.max(columnMaxX, this.columnSpanTbRl(run).right);
    }
    const columnExtent = (run: Run): number => columnMaxX - this.columnSpanTbRl(run).left;

    // middle / end で寄せるのは、先頭（右）から幅に収まる列まで
    const fittingMinX = maxX - (boxed ? this.fittingExtent(columnExtent, W, extent) : this.fittingExtent(extent, W));
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

    if (boxed) {
      // 幅に収まる列は、収まるかどうかを見た範囲が領域から出ないようにする（出るのは、広い文字のはみ出しと、狭い文字の列の箱の空きだけにする）
      const columnMinX = columnMaxX - this.fittingExtent(columnExtent, W);
      const lower = -columnMinX;
      const upper = W - columnMaxX;
      if (lower <= upper + EPS) {
        if (dx < lower - EPS) dx = lower;
        else if (dx > upper + EPS) dx = upper;
      }
    }

    for (const run of runs) {
      moveRun(run, dx, 0);
    }
    // 覚えておいた列の箱も、run と同じだけ動かす
    for (const box of this.tateChuYokoBoxes.values()) box.left += dx;
  }

  /**
   * 縦中横の数字を列の中央に寄せる。数字の並びの幅が 1em でないときは、列の 1em の箱の左端を覚えておく。1em より広い縦中横は箱の両側に
   * 同じ長さだけはみ出し、1em より狭い縦中横は箱の両側が同じ長さだけ空く（列が領域に収まるかどうかは、はみ出しを除いて見る。
   * 列を寄せる位置と renderedSize は、空きも含めて決める。columnSpanTbRl / alignSpanTbRl）。
   */
  private applyTateChuYokoTbRl(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    this.tateChuYokoBoxes.clear();
    for (let tokenId = 0; tokenId < ctx.tokens.length; tokenId++) {
      const token = ctx.tokens[tokenId];
      if (!ctx.isTateChuYokoToken(token)) continue;
      let total = 0;
      for (let i = token.start; i < token.end; i++) total += runs[i].advance;
      const dx = (ctx.adjustFontSize - total) * 0.5;
      // 列の箱の左端は、中央に寄せる前の最初の数字の左端（同じ列のほかの run の矩形の左端と、ちょうど同じ値）。
      // 寄せた後の矩形から求め直すと丸め誤差が出て、数字と文字が同じ列にあるだけで renderedSize がわずかに変わってしまう
      if (Math.abs(dx) > EPS) this.tateChuYokoBoxes.set(tokenId, { left: runs[token.start].frame.x, wide: dx < 0 });
      for (let i = token.start; i < token.end; i++) {
        moveRun(runs[i], dx, 0);
      }
    }
  }

  /**
   * 縦書きで、run が列の並ぶ方向（x）に占める範囲のうち、領域に収まっていなければならない部分（run の矩形と列の 1em の箱の重なり）。
   * 列が幅に収まるかどうかと、領域に収まっているかどうかを見るときに使う。
   * ふつうは run の矩形の左右。1em より広い縦中横の数字と、矩形が 1em より広い正立の文字は、列の 1em の箱（はみ出しを除いた範囲）にする。
   * 1em より狭い縦中横の数字と、矩形が 1em より狭い正立の文字は、矩形のまま（列の箱が幅に足りなくても、矩形が収まっていれば表示する）。
   */
  private columnSpanTbRl(run: Run): { left: number; right: number } {
    const f = run.frame;
    const box = this.tateChuYokoBoxes.get(run.tokenId);
    if (box !== undefined) {
      return box.wide ? { left: box.left, right: box.left + this.ctx.adjustFontSize } : { left: f.x, right: f.x + f.width };
    }
    // 矩形が 1em より広い正立の文字は、列の箱まで。幅を先に見て、ふつうの run（幅が 1em ちょうど）では集合を引かない
    const em = this.ctx.adjustFontSize;
    if (f.width > em && this.nonEmUprightRuns.has(run)) return { left: f.x, right: f.x + em };
    return { left: f.x, right: f.x + f.width };
  }

  /**
   * 縦書きで、列を寄せる位置と renderedSize を決めるときに、run が列の並ぶ方向（x）に占める範囲。
   * ふつうは run の矩形の左右（回転する欧文・改行・全角の文字の矩形は、列の 1em の箱と同じ）。
   * - 矩形の幅（横書きの送り幅）が 1em でない正立の文字は、列の 1em の箱（矩形の左端から 1em）にする。矩形で見ると、右端の列が
   *   こういう文字だけのとき、列の端が送り幅で決まってしまう。1em より広い文字の、箱の右にはみ出す送り幅は数えない（字面があるとは
   *   限らない。Apple Color Emoji の小さいサイズでは、字面は列の箱の中にあり、広いぶんは右側の空き）。
   * - 1em より狭い縦中横の数字は、列の 1em の箱にする（矩形は、列の中央に寄せた数字の幅しか無い）。
   * - 1em より広い縦中横の数字は、数字のはみ出しを含む矩形のまま（列の中央に寄せた数字の字面が、箱の両側にはみ出す）。
   */
  private alignSpanTbRl(run: Run): { left: number; right: number } {
    const f = run.frame;
    const box = this.tateChuYokoBoxes.get(run.tokenId);
    if (box !== undefined) {
      return box.wide ? { left: f.x, right: f.x + f.width } : { left: box.left, right: box.left + this.ctx.adjustFontSize };
    }
    // 矩形の幅が 1em でない正立の文字は、列の箱。幅を先に見て、ふつうの run（幅が 1em ちょうど）では集合を引かない
    const em = this.ctx.adjustFontSize;
    if (f.width !== em && this.nonEmUprightRuns.has(run)) return { left: f.x, right: f.x + em };
    return { left: f.x, right: f.x + f.width };
  }

  /** 縦書きで、列の 1em の箱と矩形の範囲が違う run（幅が 1em でない縦中横か、幅が 1em でない正立の文字）があるかどうか。 */
  private get hasColumnBoxes(): boolean {
    return this.tateChuYokoBoxes.size > 0 || this.nonEmUprightRuns.size > 0;
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
    // 字下げした列は、字下げのぶん短い列として寄せる
    const diff = H - this.indentOfLine(start) - total;

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

  /** 縦書きの描画サイズを更新する。幅は、列を寄せる位置を決める範囲（矩形が 1em でない正立の文字と、1em より狭い縦中横は、列の 1em の箱）で測る。 */
  private updateRenderedSizeTbRl(): void {
    const ctx = this.ctx;
    const runs = ctx.runs;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    // 字下げした列の始まりは、字下げの手前（字下げを含めた高さにする。負の字下げなら、その列は短くなる）
    let indent = 0;
    let lineTop = 0;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (i === 0 || runs[i - 1].line !== run.line) {
        indent = this.indentOfLine(i);
        lineTop = run.frame.y - indent;
      }
      const span = this.alignSpanTbRl(run);
      minX = Math.min(minX, span.left);
      maxX = Math.max(maxX, span.right);
      minY = Math.min(minY, indent === 0 ? run.frame.y : lineTop);
      maxY = Math.max(maxY, run.frame.y + run.frame.height);
    }
    ctx.renderedSize = {
      width: Number.isFinite(minX) && Number.isFinite(maxX) ? maxX - minX : 0,
      height: Number.isFinite(minY) && Number.isFinite(maxY) ? maxY - minY : 0,
    };
  }

  /** 縦書きの後処理。 */
  private postLayoutTbRl(): void {
    // 縦中横の中央寄せは寄せより前に行う（1em より広い縦中横のはみ出しも、1em より狭い縦中横の列の箱も含めて寄せる）。
    // 正立の文字は、矩形の幅が 1em でなくても動かさない（列の左端から描く）。列を寄せるときにだけ、列の 1em の箱で見る
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
    this.nonEmUprightRuns.clear();
    // テキストの先頭の行は、字下げから始める
    if (ctx.direction === "lrTb") this.x = this.indentOfLine(0);
    else this.y = this.indentOfLine(0);

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
