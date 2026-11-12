import { useEffect, useRef } from "react";
// 動画とポスターは promo/ で書き出したもの（node promo/render.cjs）。ビルドのときに site/dist/assets へコピーされる
import posterUrl from "../../promo/out/stone-engine-promo-poster.jpg";
import videoUrl from "../../promo/out/stone-engine-promo.mp4";

/**
 * 紹介動画。画面に入ったら自動で再生し、画面から外れたら止める。
 *
 * ブラウザが音の出る動画の自動再生を止めるので、muted にしている（動画にはもともと音が入っていない）。
 * 「視差効果を減らす」設定（prefers-reduced-motion）のときは自動再生せず、コントロールの再生ボタンに任せる。
 * 見ている人が自分で止めたあとは、画面に入り直しても勝手に再生しない。
 */
export function PromoVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let stoppedByViewer = false;
    // このコンポーネントが止めた直後かどうか。pause イベントは pause() を呼んだあとで届くので、呼ぶ前に立てておく
    let pausing = false;
    // 自分で止めたのでなければ、見ている人が止めたものとして扱う
    const onPause = () => {
      if (pausing) pausing = false;
      else if (!video.ended) stoppedByViewer = true;
    };
    const onPlay = () => {
      stoppedByViewer = false;
    };
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);

    const observer = new IntersectionObserver(
      (entries) => {
        // 通知がまとめて届いたとき（外れてすぐ戻ったときなど）は、最後のもの（いまの状態）だけを見る
        const entry = entries[entries.length - 1];
        if (entry.isIntersecting) {
          // 自動再生を止められたとき（省データの設定など）は、ポスターとコントロールのまま残る
          if (!stoppedByViewer && video.paused) video.play().catch(() => {});
        } else if (!video.paused) {
          pausing = true;
          video.pause();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(video);

    return () => {
      observer.disconnect();
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
    };
  }, []);

  return (
    <video
      ref={ref}
      className="promo"
      src={videoUrl}
      poster={posterUrl}
      width={1920}
      height={1080}
      muted
      loop
      playsInline
      controls
      preload="metadata"
      aria-label="stone-engine.js の紹介動画（約 80 秒、音声なし）"
    />
  );
}
