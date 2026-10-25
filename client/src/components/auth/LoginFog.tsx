import { useEffect, useRef, useState } from "react";
import styles from "./LoginFog.module.css";

function whenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(task, { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, 300);
  return () => clearTimeout(id);
}

/**
 * Fog drifting along the bottom of the login scene, behind the card, drawn with three.js. Moving
 * the mouse through it sweeps it away for a few seconds. three.js only loads once the page is
 * idle, so the form never waits for it, and without WebGL 2 the page simply has no fog. Each start
 * gets a new canvas, so stopping can hand its WebGL context straight back to the browser.
 * Decorative, so hidden from screen readers.
 */
export default function LoginFog() {
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);
  const supported = typeof WebGL2RenderingContext !== "undefined";

  useEffect(() => {
    const container = box.current;
    if (!container) return;
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    container.append(canvas);
    let stop: (() => void) | null = null;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      import("./fogScene.ts")
        .then(({ startFog }) => {
          if (!cancelled) stop = startFog(canvas, () => setShown(true));
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
      stop?.();
      canvas.remove();
    };
  }, []);

  if (!supported || failed) return null;
  return (
    <div
      ref={box}
      className={styles.fog}
      data-shown={shown}
      aria-hidden="true"
    />
  );
}
