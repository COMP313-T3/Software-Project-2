/** The landing page palette, shared by the 3D scene and the canvas textures it draws. */
export const PALETTE = {
  cream: 0xf1f1f5,
  tan: 0xb07d4a,
  orange: 0xf58010,
  ember: 0xeb5a14,
  night: 0x1e0b03,
  bark: 0x2a1408,
  soil: 0x3b1e0e,
  beige: 0xcdb48e,
  screen: 0x120804,
  glow: 0xffe6b0,
} as const;

export const CSS_PALETTE = {
  cream: "#f1f1f5",
  tan: "#b07d4a",
  orange: "#f58010",
  ember: "#eb5a14",
  night: "#1e0b03",
  bark: "#2a1408",
  soil: "#3b1e0e",
} as const;

/**
 * A small seeded random number generator, so the scene is laid out the same way on every
 * visit and in every test.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
