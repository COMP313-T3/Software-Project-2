import { HERO_VIDEO_SECONDS, type CaptionPin, type HeroCaption, type PinKey } from "./landingContent.ts";

/**
 * Screen heights of scrolling that play the 15-second video, about 1.25 seconds per screen, so
 * one turn of the wheel or one swipe moves the orbit along without racing through it.
 */
export const VIDEO_SCREENS = 12;
/** Screen heights of scrolling after the video, while the hero tilts away into the 3D sections. */
export const HANDOFF_SCREENS = 1;

const LINE_ENTER = 0.55;
const LINE_EXIT = 0.45;
const LINE_STAGGER = 0.12;
const EXIT_STAGGER = 0.06;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export interface HeroProgress {
  /** 0 at the top of the page, 1 when the video has reached its last frame. */
  video: number;
  /** 0 when the video ends, 1 when the hero has fully handed off to the sections below. */
  handoff: number;
}

/**
 * Splits how far the hero's scroll track has been scrolled into the part that plays the video
 * and the part that hands off to the 3D sections.
 *
 * @param scrolled Pixels scrolled past the top of the hero track.
 * @param screen Height of one screen, in pixels.
 */
export function heroProgress(scrolled: number, screen: number): HeroProgress {
  if (screen <= 0) return { video: 0, handoff: 0 };
  const videoLength = VIDEO_SCREENS * screen;
  return {
    video: clamp01(scrolled / videoLength),
    handoff: clamp01((scrolled - videoLength) / (HANDOFF_SCREENS * screen)),
  };
}

export function videoTimeAt(videoProgress: number): number {
  return clamp01(videoProgress) * HERO_VIDEO_SECONDS;
}

export interface IntroStyle {
  /** 0 while the title is closed behind Topo, 1 once its two halves have swung fully open. */
  open: number;
  /** Opacity of the title and of the tagline and buttons under it. */
  opacity: number;
  /** Opacity of the still of Topo that sits in front of the title. */
  cutout: number;
}

/**
 * Where the opening title is at a video time. "Top" and "Send" swing open like a pair of doors
 * as the first scroll starts, and fade by about 0.85 seconds.
 *
 * The still of Topo in front of the title only matches the first frame, and by 0.4 seconds the
 * camera has moved far enough that it would show as a ghost. So it fades between 0.1 and 0.3
 * seconds of the frame actually on screen, which can lag behind the scroll while the video loads.
 *
 * @param time Video time the scroll position asks for, in seconds.
 * @param shownTime Video time of the frame on screen, in seconds.
 */
export function introStyle(time: number, shownTime: number): IntroStyle {
  return {
    open: smoothstep(0.02, 0.7, time),
    opacity: 1 - smoothstep(0.12, 0.85, time),
    cutout: 1 - smoothstep(0.1, 0.3, shownTime),
  };
}

export interface LineStyle {
  opacity: number;
  /** Vertical offset in pixels. Positive is below the resting place. */
  y: number;
  blur: number;
}

/**
 * Where one line of a hero caption is at a video time. Lines rise in one after another as the
 * caption starts, and drift up and blur away as it ends, so scrolling back plays it in reverse.
 *
 * @param caption The caption the line belongs to.
 * @param index The line's position in the caption, starting at 0.
 * @param count How many lines the caption has.
 * @param time Video time in seconds.
 */
export function captionLineStyle(
  caption: HeroCaption,
  index: number,
  count: number,
  time: number,
): LineStyle {
  const inStart = caption.start + index * LINE_STAGGER;
  const outStart = caption.end - LINE_EXIT - (count - 1 - index) * EXIT_STAGGER;
  const enter = smoothstep(inStart, inStart + LINE_ENTER, time);
  const exit = smoothstep(outStart, outStart + LINE_EXIT, time);
  return {
    opacity: enter * (1 - exit),
    y: (1 - enter) * 34 - exit * 28,
    blur: (1 - enter) * 10 + exit * 8,
  };
}

export interface PinPoint {
  /** Share of the video frame's width. */
  x: number;
  /** Share of the video frame's height. */
  y: number;
  scale: number;
}

/**
 * Where a pinned caption's point is at a video time. Between keyframes it follows a smooth curve
 * through them, with each keyframe's speed taken from its neighbours, so the caption glides
 * instead of turning sharply at every keyframe. Outside the keyframes it holds still.
 */
export function pinAt(keys: readonly PinKey[], time: number): PinPoint {
  const at = (index: number) => {
    const key = keys[Math.min(Math.max(index, 0), keys.length - 1)];
    return { time: key.time, x: key.x, y: key.y, scale: key.scale ?? 1 };
  };
  if (keys.length === 0) return { x: 0.5, y: 0.5, scale: 1 };
  const first = at(0);
  const last = at(keys.length - 1);
  if (time <= first.time) return { x: first.x, y: first.y, scale: first.scale };
  if (time >= last.time) return { x: last.x, y: last.y, scale: last.scale };

  let i = 0;
  while (time > keys[i + 1].time) i++;
  const [k0, k1, k2, k3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
  const span = k2.time - k1.time;
  const t = (time - k1.time) / span;
  const t2 = t * t;
  const t3 = t2 * t;
  const slope = (a: number, b: number, from: number, to: number) => (to > from ? (b - a) / (to - from) : 0);
  // Cubic Hermite, with each end's tangent spread across the keyframes on either side of it.
  const curve = (pick: (key: typeof k0) => number) => {
    const m1 = slope(pick(k0), pick(k2), k0.time, k2.time) * span;
    const m2 = slope(pick(k1), pick(k3), k1.time, k3.time) * span;
    return (
      (2 * t3 - 3 * t2 + 1) * pick(k1) +
      (t3 - 2 * t2 + t) * m1 +
      (-2 * t3 + 3 * t2) * pick(k2) +
      (t3 - t2) * m2
    );
  };
  return { x: curve((key) => key.x), y: curve((key) => key.y), scale: curve((key) => key.scale) };
}

/** The hero video's shape, 16:9. */
const VIDEO_ASPECT = 16 / 9;

/**
 * Where a point in the video lands in a box the video covers, the way object-fit: cover scales
 * it up until the box is full and crops the overflow evenly from both sides.
 *
 * @param x Share of the video frame's width.
 * @param y Share of the video frame's height.
 * @param width The box's width in pixels.
 * @param height The box's height in pixels.
 * @returns The point in pixels from the box's top left corner.
 */
export function coverPoint(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const wide = width / height > VIDEO_ASPECT;
  const videoWidth = wide ? width : height * VIDEO_ASPECT;
  const videoHeight = wide ? width / VIDEO_ASPECT : height;
  return {
    x: (width - videoWidth) / 2 + x * videoWidth,
    y: (height - videoHeight) / 2 + y * videoHeight,
  };
}

export interface PinnedLayout {
  /** The pinned point on screen, in pixels. */
  spot: { x: number; y: number };
  /** The caption's unscaled size, in pixels. */
  width: number;
  height: number;
  scale: number;
  /** The box the caption has to stay inside, the hero frame's size, in pixels. */
  frameWidth: number;
  frameHeight: number;
  /** Space between the point and the caption, and between the caption and the screen's edge. */
  gap: number;
  gutter: number;
}

/**
 * The translate that puts a pinned caption by its point. The caption is scaled from the corner
 * nearest the point: its top right corner when it sits to the left, its bottom right corner when
 * it sits above. It's nudged back on screen where it would run off an edge.
 *
 * A caption above a hand raised near the top of the screen has no room left above it, so it
 * slides down beside the hand instead, and moves out to twice the gap to stay clear of it.
 *
 * @returns The x and y of the caption's transform, in pixels.
 */
export function pinnedOffset(place: CaptionPin["place"], layout: PinnedLayout): { x: number; y: number } {
  const { spot, width, height, scale, frameHeight, gap, gutter } = layout;
  const shownWidth = width * scale;
  const shownHeight = height * scale;
  if (place === "left") {
    const left = Math.max(gutter, spot.x - gap - shownWidth);
    const top = Math.min(Math.max(spot.y - 8 * scale, 16), frameHeight - shownHeight - 16);
    return { x: left + shownWidth - width, y: top };
  }
  const bottom = Math.max(spot.y - gap, 16 + shownHeight);
  const slid = bottom - (spot.y - gap);
  const right = Math.max(spot.x - gap - Math.min(gap, slid), gutter + shownWidth);
  return { x: right - width, y: bottom - height };
}

/**
 * How wide a pinned caption can be and still fit beside its point the whole time it's up, on a
 * screen of the given width, up to the largest width given.
 *
 * @returns The width in pixels, or null when even the smallest width won't fit, in which case
 *   the caption sits at its side of the screen instead, clear of Topo.
 */
export function pinnedWidth(
  pin: CaptionPin,
  frameWidth: number,
  frameHeight: number,
  gap: number,
  gutter: number,
  limits: { min: number; max: number },
): number | null {
  const room = Math.min(
    ...pin.keys.map((key) => {
      const x = coverPoint(key.x, key.y, frameWidth, frameHeight).x;
      const space = x - (pin.place === "above" ? 2 * gap : gap) - gutter;
      return space / (key.scale ?? 1);
    }),
  );
  return room < limits.min ? null : Math.round(Math.min(limits.max, room));
}

/**
 * How much to shrink a caption pinned above a fingertip so it fits between the fingertip and the
 * top of the screen while it's fully shown. It never shrinks below `min`; past that, it slides
 * down beside the hand instead. Captions pinned to the left of a point always fit as they are.
 *
 * @param height The caption's unscaled height, in pixels.
 */
export function pinnedFit(
  pin: CaptionPin,
  caption: Pick<HeroCaption, "start" | "end">,
  frameWidth: number,
  frameHeight: number,
  height: number,
  gap: number,
  min = 0.72,
): number {
  if (pin.place !== "above" || height <= 0) return 1;
  const shown = pin.keys.filter((key) => key.time >= caption.start + 0.35 && key.time <= caption.end - 0.4);
  const keys = shown.length > 0 ? shown : pin.keys;
  const fit = Math.min(
    ...keys.map((key) => (coverPoint(key.x, key.y, frameWidth, frameHeight).y - gap - 16) / (height * (key.scale ?? 1))),
  );
  return Math.min(1, Math.max(min, fit));
}

/** Whether a caption is far enough in to be read and clicked. */
export function captionIsShown(caption: HeroCaption, time: number): boolean {
  return captionLineStyle(caption, 0, 1, time).opacity > 0.5;
}

/**
 * Turns the page's scroll position into a journey value for the 3D scene: -1 when the hand-off
 * starts, then 0, 1, 2... as each section reaches the middle of the screen, in between while
 * scrolling from one to the next. Before the hand-off it keeps falling, down to -2, so the scene
 * knows it's still hidden behind the hero.
 *
 * @param scrollY The page's scroll position.
 * @param anchors Scroll positions where the journey is -1, 0, 1, 2..., in increasing order.
 */
export function journeyAt(scrollY: number, anchors: number[]): number {
  if (anchors.length === 0) return -2;
  if (scrollY <= anchors[0]) {
    const span = anchors.length > 1 ? anchors[1] - anchors[0] : 1;
    return -1 - Math.min(1, (anchors[0] - scrollY) / Math.max(span, 1));
  }
  for (let i = 1; i < anchors.length; i++) {
    if (scrollY <= anchors[i]) {
      const span = anchors[i] - anchors[i - 1];
      const t = span > 0 ? (scrollY - anchors[i - 1]) / span : 1;
      return i - 2 + t;
    }
  }
  return anchors.length - 2;
}
