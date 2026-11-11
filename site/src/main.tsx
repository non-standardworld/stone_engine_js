import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// オートモード。読み込むだけで、data-stone 属性を付けた範囲の見出しや段落を組む（「できること」のサンプルで使っている）
import "@non-standardworld/stone-engine.js/auto";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
