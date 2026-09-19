import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages のプロジェクトサイト（https://<owner>.github.io/stone_engine_js/）で配信する
export default defineConfig({
  base: process.env.SITE_BASE ?? "/stone_engine_js/",
  plugins: [react()],
});
