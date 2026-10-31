import { clamp01 } from "./heroTimeline.ts";

export type Vec3 = readonly [number, number, number];

/**
 * Eases the move between two stages so the camera rests on each stage for a while before it
 * travels to the next one. `hold` is the share of each end spent resting.
 */
export function holdEase(t: number, hold = 0.2): number {
  const u = clamp01((t - hold) / (1 - 2 * hold));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/**
 * Samples a path of keyframes at a journey value. Keyframe 0 belongs to journey -1, keyframe 1
 * to journey 0, and so on, so the first keyframe is the view during the hand-off from the hero.
 *
 * @param keys One position per journey step.
 * @param journey The journey value, clamped to the path.
 * @param hold Share of each step spent resting on a keyframe.
 */
export function samplePath(keys: readonly Vec3[], journey: number, hold = 0.2): [number, number, number] {
  if (keys.length === 0) return [0, 0, 0];
  const position = Math.min(Math.max(journey + 1, 0), keys.length - 1);
  const index = Math.min(Math.floor(position), keys.length - 2);
  if (index < 0) return [...keys[0]];
  const t = holdEase(position - index, hold);
  const a = keys[index];
  const b = keys[index + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * How present a stage is at a journey value: 1 while the camera rests on it, fading to 0 by the
 * time the camera is halfway to the next stage. Used to start and settle each stage's animation.
 */
export function stagePresence(stage: number, journey: number): number {
  const distance = Math.abs(journey - stage);
  return 1 - clamp01((distance - 0.2) / 0.45);
}
