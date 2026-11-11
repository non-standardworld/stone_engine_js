import { useEffect, useState } from "react";
import { Link } from "react-router";
// オートモードは root.tsx の import 1 行で始まっている。ここでは、CSS だけを変えたときに読み直すためのハンドルを使う
import { autoStoneHandle } from "@non-standardworld/stone-engine.js/auto";

export function meta() {
  return [
    { title: "オートモード × React Router" },
    { name: "description", content: "ふつうの JSX の段落を、オートモードで自動的に組むデモ" },
  ];
}

/**
 * オートモードのデモ。段落と見出しはふつうの JSX で、<StoneText> は使っていない。
 * 記事に data-stone 属性を付けると、その中の段落（p）と見出し（h1〜h6）が自動で組まれる。
 * 元の DOM には触らない（Shadow DOM の中に描く）ので、React が中身を書き換えてもそのまま動く。
 */
export default function Auto() {
  const [count, setCount] = useState(0);
  const [serif, setSerif] = useState(false);

  // クラスの切り替えのように CSS だけが変わったときは、DOM が変わらないので自動では気付けない。refresh() で読み直す
  useEffect(() => {
    autoStoneHandle?.refresh();
  }, [serif]);

  return (
    <main className="page auto">
      <p className="auto__nav">
        <Link to="/">← StoneText のデモへ戻る</Link>
      </p>

      <article data-stone className={serif ? "auto__article auto__article--serif" : "auto__article"}>
        <h1>オートモード × React Router</h1>
        <p>
          このページの段落と見出しは、ふつうの JSX です。root.tsx でスクリプトを 1 行読み込み、記事に data-stone 属性を付けただけで、サーバーが描画した HTML がそのまま日本語組版エンジンで組み直されます。
        </p>
        <h2>React が書き換えても、そのまま</h2>
        <p>
          ボタンを押した回数は「{count}」回です。React が段落の中身を書き換えると、組み直しは自動で行われます。
          <Link to="/">React Router のリンク</Link>
          も、ページを読み直さずに移動します（「戻る」で、このページに帰ってこられます）。
        </p>
        <p className="auto__justify">
          括弧や句読点が続くところ（たとえば「これは『入れ子』の括弧です。」）は、約物どうしの間が詰まります。行頭に句読点や「ー」が来ないように禁則処理を行い、English words や 2026 のような数字の途中では改行しません。
        </p>
      </article>

      <div className="auto__controls">
        <button type="button" onClick={() => setCount((c) => c + 1)}>
          回数を増やす
        </button>
        <button type="button" onClick={() => setSerif((s) => !s)}>
          書体を切り替える
        </button>
      </div>
    </main>
  );
}
