import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Where a block is relative to the screen: not reached yet, on screen, or scrolled past. */
export type RevealState = "before" | "in" | "after";

/**
 * Watches a block as the page scrolls, for text that animates in when it reaches the screen and
 * out again once it's scrolled past. The screen is trimmed top and bottom, so a block starts to
 * leave while it's still in view and the way out can be seen. Without IntersectionObserver the
 * block simply stays shown.
 *
 * @param threshold How much of the block must be inside the trimmed screen to count as shown.
 * @returns A ref for the block and its current state.
 */
export function useReveal<T extends HTMLElement>(threshold = 0.35) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<RevealState>(() =>
    typeof IntersectionObserver === "function" ? "before" : "in",
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // isIntersecting stays true for any overlap at all, so the ratio decides. The small
        // allowance covers browsers that report a ratio just under the threshold as it crosses.
        if (entry.intersectionRatio >= threshold - 0.01) setState("in");
        else setState(entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) ? "after" : "before");
      },
      { threshold, rootMargin: "-12% 0px -12% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, state };
}

/** Sets a line's place in a reveal, which staggers its animation behind the lines before it. */
export function revealOrder(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}
