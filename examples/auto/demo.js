// オートモードのデモの操作。オートモード自体は index.html の import 1 行だけで動いていて、このファイルは必要ない。
// ここでは属性とクラスを切り替えているだけで、組み直しはオートモードが DOM の変化を見て自動で行う。

import { autoStoneHandle } from "@non-standardworld/stone-engine.js/auto";

const article = document.querySelector("#article");
const status = document.querySelector("#status");

// 「組む」: data-stone="off" にすると、その中は元の表示に戻る
document.querySelector("#toggle-auto").addEventListener("change", (event) => {
  article.setAttribute("data-stone", event.target.checked ? "" : "off");
});

// 「組んだ場所を表示」: 組んだ要素と見送った要素を枠で示す（style.css）
document.querySelector("#toggle-marks").addEventListener("change", (event) => {
  document.body.classList.toggle("show-marks", event.target.checked);
});

// 「段落を追加」: 後から増えた段落も自動で組まれる
let added = 0;
document.querySelector("#add").addEventListener("click", () => {
  added += 1;
  const p = document.createElement("p");
  p.textContent = `${added} つ目に追加した段落です。「追加した段落」も、ページを読み込んだときと同じように組まれます。`;
  article.append(p);
});

// 組んだ数と見送った数
function showStatus() {
  const report = autoStoneHandle ? autoStoneHandle.report() : [];
  const count = (...states) => report.filter((item) => states.includes(item.state)).length;
  status.textContent = `組んだ ${count("typeset")}／見送った ${count("skipped")}／待機 ${count("queued", "waiting")}`;
}
showStatus();
setInterval(showStatus, 500);
