/*
render.cjs — promo/index.html を 1 フレームずつ撮って MP4 にする。

  node promo/render.cjs                       動画を書き出す（promo/out/stone-engine-promo.mp4 と、ポスターの -poster.jpg）
  node promo/render.cjs --stills 0,2.5,12     指定した時刻（秒）の静止画だけを書き出す
  node promo/render.cjs --serve               プレビュー用の静的サーバーを立てる（ブラウザで再生して確かめる）

  --frames <dir>   フレームや静止画（PNG）の置き場所。既定は OS の一時フォルダ（リポジトリに置かないため）
  --out <file>     出力先
  --scale <n>      撮る倍率。既定 2（3840×2160 で撮って 1920×1080 に縮小する）
  --workers <n>    並列に撮るページ数。既定 4

Playwright はこのリポジトリの依存に入れていないので、npx のキャッシュにある playwright-core を使う
（無ければ `npx playwright --version` を一度実行する）。ブラウザはインストール済みの Chrome。ffmpeg が必要。
*/

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ORIGIN = "http://stone.test";
const WIDTH = 1920;
const HEIGHT = 1080;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

/** リポジトリの中のファイルだけを返す（promo/ と dist/）。 */
function readAsset(urlPath) {
  let relative;
  try {
    relative = decodeURIComponent(urlPath).replace(/^\/+/, "");
  } catch {
    return null; // 不正な % エスケープ（"/promo/%" など）。見つからないものとして扱う
  }
  const file = path.resolve(ROOT, relative);
  const allowed = [path.join(ROOT, "promo") + path.sep, path.join(ROOT, "dist") + path.sep];
  if (!allowed.some((dir) => file.startsWith(dir))) return null;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return { body: fs.readFileSync(file), type: TYPES[path.extname(file)] ?? "application/octet-stream" };
}

function findPlaywright() {
  const base = path.join(os.homedir(), ".npm", "_npx");
  const found = [];
  if (fs.existsSync(base)) {
    for (const dir of fs.readdirSync(base)) {
      const pkg = path.join(base, dir, "node_modules", "playwright-core");
      if (!fs.existsSync(path.join(pkg, "package.json"))) continue;
      const version = JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8")).version;
      found.push({ pkg, version });
    }
  }
  if (found.length === 0) throw new Error("playwright-core が見つかりません。`npx playwright --version` を一度実行してください。");
  found.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  return require(found[0].pkg);
}

function serve() {
  const server = http.createServer((request, response) => {
    const asset = readAsset(new URL(request.url, "http://localhost").pathname);
    if (!asset) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": asset.type, "cache-control": "no-store" }).end(asset.body);
  });
  server.listen(0, "127.0.0.1", () => {
    console.log(`http://127.0.0.1:${server.address().port}/promo/index.html`);
  });
}

async function openPage(context) {
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("[page error]", error.message));
  await page.goto(`${ORIGIN}/promo/index.html?capture=1`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60000 });
  const error = await page.evaluate(() => window.__error);
  if (error) throw new Error(error);
  return { page };
}

// CDP の Page.captureScreenshot を直接呼ぶと、deviceScaleFactor を掛けても等倍の画像になる。Playwright の screenshot は倍率どおりに撮る
async function shoot({ page }, time, file) {
  await page.evaluate((t) => window.__seek(t), time);
  await page.screenshot({ path: file, type: "png", scale: "device" });
}

async function main() {
  const options = args();
  if (options.serve) return serve();

  const scale = Number(options.scale ?? 2);
  const workers = Number(options.workers ?? 4);
  const outFile = path.resolve(options.out ?? path.join(__dirname, "out", "stone-engine-promo.mp4"));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const { chromium } = findPlaywright();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: scale });
  await context.route(`${ORIGIN}/**`, (route) => {
    const asset = readAsset(new URL(route.request().url()).pathname);
    if (!asset) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ status: 200, body: asset.body, contentType: asset.type });
  });

  try {
    const first = await openPage(context);
    const info = await first.page.evaluate(() => ({
      fps: window.__fps,
      frames: window.__frames,
      duration: window.__duration,
      fonts: window.__fonts,
      timeline: window.__timeline,
    }));
    const missing = info.fonts.filter(([, ok]) => !ok).map(([spec]) => spec);
    if (missing.length > 0) throw new Error(`読み込めなかったフォント: ${missing.join(", ")}`);

    // シーンごとの長さと、読む文字数（1 秒 4 文字で読むのにかかる秒数）
    for (const scene of info.timeline) {
      const chars = scene.counted.reduce((sum, [, count]) => sum + count, 0);
      const parts = scene.counted.map(([label, count]) => `${label} ${count}`).join("、");
      console.log(
        `${scene.name.padEnd(9)} ${scene.start.toFixed(1).padStart(5)} – ${scene.end.toFixed(1).padStart(5)}  ${(scene.end - scene.start).toFixed(1).padStart(4)} 秒  読む文字 ${String(chars).padStart(4)}（${(chars / 4).toFixed(1)} 秒）  ${parts}`,
      );
    }
    console.log(`合計 ${info.duration.toFixed(1)} 秒（${info.frames} フレーム）`);

    if (options.stills) {
      const dir = path.resolve(options.frames ?? fs.mkdtempSync(path.join(os.tmpdir(), "stone-promo-stills-")));
      fs.mkdirSync(dir, { recursive: true });
      for (const value of String(options.stills).split(",")) {
        const time = Number(value);
        const file = path.join(dir, `still_${time.toFixed(2).padStart(5, "0")}.png`);
        await shoot(first, time, file);
        console.log(file);
      }
      return;
    }

    const frameDir = path.resolve(options.frames ?? fs.mkdtempSync(path.join(os.tmpdir(), "stone-promo-")));
    fs.mkdirSync(frameDir, { recursive: true });
    const pages = [first];
    while (pages.length < workers) pages.push(await openPage(context));

    const started = Date.now();
    let done = 0;
    await Promise.all(
      pages.map(async (target, k) => {
        for (let frame = k; frame < info.frames; frame += pages.length) {
          await shoot(target, frame / info.fps, path.join(frameDir, `f_${String(frame).padStart(5, "0")}.png`));
          done++;
          if (done % 60 === 0 || done === info.frames) {
            process.stdout.write(`\r${done} / ${info.frames} frames  ${((Date.now() - started) / 1000).toFixed(0)}s`);
          }
        }
      }),
    );
    process.stdout.write("\n");

    // X（旧 Twitter）向け: H.264 High / yuv420p / 30fps / AAC（無音）/ faststart
    const ffmpeg = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel", "error",
        "-framerate", String(info.fps),
        "-i", path.join(frameDir, "f_%05d.png"),
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-vf", `scale=${WIDTH}:${HEIGHT}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "15",
        "-profile:v", "high",
        "-level", "4.2",
        "-r", String(info.fps),
        "-g", String(info.fps * 2),
        "-colorspace", "bt709",
        "-color_primaries", "bt709",
        "-color_trc", "bt709",
        "-color_range", "tv",
        "-c:a", "aac",
        "-b:a", "128k",
        // 置き場所に前回の（もっと長い）書き出しの連番が残っていても、今回撮った枚数だけを使う
        "-frames:v", String(info.frames),
        "-shortest",
        "-movflags", "+faststart",
        outFile,
      ],
      { stdio: "inherit" },
    );
    if (ffmpeg.status !== 0) throw new Error("ffmpeg が失敗しました");
    console.log(outFile);

    // ポスター（サイトで、再生が始まる前に見せる 1 枚）。フックの見出しと下の 1 行が出そろったところ
    const posterFile = outFile.replace(/\.mp4$/, "") + "-poster.jpg";
    const poster = spawnSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-ss", String(info.timeline[0].end - 0.6), "-i", outFile, "-frames:v", "1", "-q:v", "3", posterFile],
      { stdio: "inherit" },
    );
    if (poster.status !== 0) throw new Error("ポスターの書き出しに失敗しました");
    console.log(posterFile);
    console.log(`frames: ${frameDir}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
