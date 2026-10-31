import { useEffect, useRef, useState } from "react";
import { journeyAt } from "./heroTimeline.ts";
import { measureJourneyAnchors } from "./journeyAnchors.ts";
import { isSmallScreen, prefersReducedMotion, whenIdle } from "./motion.ts";
import styles from "./LandingScene.module.css";

/**
 * The 3D scene behind everything after the hero, fixed to the screen. Scrolling moves its camera
 * from stage to stage in step with the sections on top of it.
 *
 * three.js and the scene load once the page is idle, so the hero never waits for them. Without
 * WebGL 2, or if the scene fails to start, the sections simply show over the page's dark
 * background. Each start gets a new canvas, so stopping can hand its WebGL context straight back.
 * Decorative, so hidden from screen readers.
 */
export default function LandingScene() {
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

    let anchors: number[] = [];
    const measure = () => {
      anchors = measureJourneyAnchors();
    };
    measure();
    const resizer = new ResizeObserver(measure);
    resizer.observe(document.body);
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);

    let stop: (() => void) | null = null;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      import("./scene/landingScene.ts")
        .then(({ startLandingScene }) => {
          if (cancelled) return;
          stop = startLandingScene(canvas, {
            getJourney: () => journeyAt(window.scrollY, anchors),
            reducedMotion: prefersReducedMotion(),
            light: isSmallScreen(),
            onReady: () => setShown(true),
          });
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      resizer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
      stop?.();
      canvas.remove();
    };
  }, []);

  if (!supported || failed) return null;
  return <div ref={box} className={styles.scene} data-shown={shown} aria-hidden="true" />;
}
