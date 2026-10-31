import type { Quad } from "./quad.ts";

let outline: Quad | null = null;

/**
 * Where the 3D map's ground lies on screen right now, in CSS pixels. The 3D scene publishes it
 * every frame around the hand-off, and the hero lays its video frame down onto it, corner to
 * corner, so the video turns into the map instead of fading over a shape that doesn't line up.
 * Empty until the scene has drawn, or while the ground can't be seen.
 */
export const mapOutline = {
  read(): Quad | null {
    return outline;
  },
  publish(quad: Quad | null) {
    outline = quad;
  },
};
