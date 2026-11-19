/** Whether the visitor asked their system for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Phones and small tablets get the lighter video and a lighter 3D scene. */
export function isSmallScreen(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 900px), (max-height: 560px), (pointer: coarse)").matches
  );
}

/**
 * Runs a task once the browser is idle, or after a short wait where idle callbacks aren't
 * supported, so heavy work never delays the first paint.
 *
 * @returns A function that cancels the task if it hasn't run yet.
 */
export function whenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(task, { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, 300);
  return () => clearTimeout(id);
}

/**
 * Scrolls to a section, gliding unless the visitor prefers reduced motion. The section's middle
 * lands in the middle of the screen, which is where the 3D camera rests on its stage.
 */
export function scrollToSection(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
}
