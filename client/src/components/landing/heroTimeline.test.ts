import { describe, expect, it } from "vitest";
import {
  HANDOFF_SCREENS,
  VIDEO_SCREENS,
  captionIsShown,
  captionLineStyle,
  coverPoint,
  heroProgress,
  introStyle,
  journeyAt,
  pinAt,
  pinnedFit,
  pinnedOffset,
  pinnedWidth,
  videoTimeAt,
} from "./heroTimeline.ts";
import { HERO_CAPTIONS, HERO_VIDEO_SECONDS, type HeroCaption } from "./landingContent.ts";

const SCREEN = 800;

const caption: HeroCaption = {
  id: "sample",
  start: 2,
  end: 5,
  side: "left",
  eyebrow: "Eyebrow",
  title: "Title",
  body: "Body",
};

describe("heroProgress", () => {
  it("plays the video over the first screens of the track, then hands off over the rest", () => {
    expect(heroProgress(0, SCREEN)).toEqual({ video: 0, handoff: 0 });
    expect(heroProgress((VIDEO_SCREENS * SCREEN) / 2, SCREEN)).toEqual({ video: 0.5, handoff: 0 });
    expect(heroProgress(VIDEO_SCREENS * SCREEN, SCREEN)).toEqual({ video: 1, handoff: 0 });
    expect(heroProgress((VIDEO_SCREENS + HANDOFF_SCREENS / 2) * SCREEN, SCREEN).handoff).toBeCloseTo(0.5);
    expect(heroProgress(100 * SCREEN, SCREEN)).toEqual({ video: 1, handoff: 1 });
  });

  it("stays on the first frame when a phone pulls past the top, or before the screen has a height", () => {
    expect(heroProgress(-120, SCREEN)).toEqual({ video: 0, handoff: 0 });
    expect(heroProgress(500, 0)).toEqual({ video: 0, handoff: 0 });
  });
});

describe("videoTimeAt", () => {
  it("spreads the whole video across the scroll, from the first frame to the last", () => {
    expect(videoTimeAt(0)).toBe(0);
    expect(videoTimeAt(0.5)).toBeCloseTo(HERO_VIDEO_SECONDS / 2);
    expect(videoTimeAt(1)).toBe(HERO_VIDEO_SECONDS);
    expect(videoTimeAt(1.4)).toBe(HERO_VIDEO_SECONDS);
    expect(videoTimeAt(-0.2)).toBe(0);
  });
});

describe("introStyle", () => {
  it("shows the closed title over the first frame and opens it as soon as scrolling starts", () => {
    expect(introStyle(0, 0)).toEqual({ open: 0, opacity: 1, cutout: 1 });
    const early = introStyle(0.3, 0.3);
    expect(early.open).toBeGreaterThan(0.2);
    expect(early.opacity).toBeGreaterThan(0.5);
    expect(introStyle(1, 1)).toEqual({ open: 1, opacity: 0, cutout: 0 });
  });

  it("keeps the still of Topo while the first frame is still on screen, even if the scroll has moved on", () => {
    expect(introStyle(2, 0).cutout).toBe(1);
    expect(introStyle(2, 0.2).cutout).toBeGreaterThan(0);
    expect(introStyle(2, 0.4).cutout).toBe(0);
  });
});

describe("captionLineStyle", () => {
  it("rises in from below with a blur, rests, then drifts up and away", () => {
    expect(captionLineStyle(caption, 0, 3, 1)).toEqual({ opacity: 0, y: 34, blur: 10 });
    expect(captionLineStyle(caption, 0, 3, 3.5)).toEqual({ opacity: 1, y: 0, blur: 0 });
    expect(captionLineStyle(caption, 0, 3, 6)).toEqual({ opacity: 0, y: -28, blur: 8 });
  });

  it("brings the lines in one after another, top line first", () => {
    const first = captionLineStyle(caption, 0, 3, 2.3);
    const last = captionLineStyle(caption, 2, 3, 2.3);
    expect(first.opacity).toBeGreaterThan(last.opacity);
    expect(first.y).toBeLessThan(last.y);
  });

  it("sends the top line away first, so the caption leaves in reading order", () => {
    const first = captionLineStyle(caption, 0, 3, 4.6);
    const last = captionLineStyle(caption, 2, 3, 4.6);
    expect(first.opacity).toBeLessThan(last.opacity);
  });
});

describe("captionIsShown", () => {
  it("counts a caption as shown only while it can be read", () => {
    expect(captionIsShown(caption, 1.9)).toBe(false);
    expect(captionIsShown(caption, 3.5)).toBe(true);
    expect(captionIsShown(caption, 5.2)).toBe(false);
  });
});

describe("the hero captions", () => {
  it("play in order inside the video without overlapping", () => {
    HERO_CAPTIONS.forEach((current, index) => {
      expect(current.start).toBeGreaterThanOrEqual(0);
      expect(current.start).toBeLessThan(current.end);
      expect(current.start).toBeLessThan(HERO_VIDEO_SECONDS);
      const next = HERO_CAPTIONS[index + 1];
      if (next) expect(current.end).toBeLessThanOrEqual(next.start);
    });
  });

  it("each stay readable for a while", () => {
    for (const current of HERO_CAPTIONS) {
      const middle = (current.start + Math.min(current.end, HERO_VIDEO_SECONDS)) / 2;
      expect(captionIsShown(current, middle)).toBe(true);
    }
  });

  it("end on the sign-up caption, which stays up through the last frame", () => {
    const last = HERO_CAPTIONS[HERO_CAPTIONS.length - 1];
    expect(last.withActions).toBe(true);
    expect(captionIsShown(last, HERO_VIDEO_SECONDS)).toBe(true);
    expect(HERO_CAPTIONS.filter((current) => current.withActions)).toHaveLength(1);
  });
});

describe("pinAt", () => {
  const keys = [
    { time: 1, x: 0.3, y: 0.4 },
    { time: 2, x: 0.4, y: 0.3, scale: 0.9 },
    { time: 3, x: 0.5, y: 0.2, scale: 0.8 },
  ];

  it("passes through every keyframe", () => {
    expect(pinAt(keys, 1)).toEqual({ x: 0.3, y: 0.4, scale: 1 });
    expect(pinAt(keys, 2)).toEqual({ x: 0.4, y: 0.3, scale: 0.9 });
    expect(pinAt(keys, 3)).toEqual({ x: 0.5, y: 0.2, scale: 0.8 });
  });

  it("glides between keyframes along their line when they move steadily", () => {
    const point = pinAt(keys, 2.5);
    expect(point.x).toBeCloseTo(0.45);
    expect(point.y).toBeCloseTo(0.25);
    expect(point.scale).toBeCloseTo(0.85);
  });

  it("holds the first and last keyframes outside them", () => {
    expect(pinAt(keys, 0)).toEqual({ x: 0.3, y: 0.4, scale: 1 });
    expect(pinAt(keys, 9)).toEqual({ x: 0.5, y: 0.2, scale: 0.8 });
  });

  it("follows Topo's fingertip without jumping, for the captions that use it", () => {
    for (const caption of HERO_CAPTIONS.filter((current) => current.pin)) {
      const keys = caption.pin!.keys;
      let previous = pinAt(keys, caption.start);
      for (let time = caption.start; time <= caption.end; time += 0.02) {
        const point = pinAt(keys, time);
        expect(Math.abs(point.x - previous.x)).toBeLessThan(0.01);
        expect(Math.abs(point.y - previous.y)).toBeLessThan(0.02);
        expect(point.x).toBeGreaterThan(0.25);
        expect(point.x).toBeLessThan(0.75);
        previous = point;
      }
    }
  });

  it("keeps the caption still when it has a single keyframe", () => {
    const still = [{ time: 5, x: 0.4, y: 0.35 }];
    expect(pinAt(still, 4)).toEqual(pinAt(still, 6.5));
  });
});

describe("pinnedOffset", () => {
  const layout = {
    width: 400,
    height: 240,
    scale: 1,
    frameWidth: 1600,
    frameHeight: 900,
    gap: 24,
    gutter: 80,
  };

  it("puts a caption pinned to the left with its top right corner just left of the point", () => {
    const offset = pinnedOffset("left", { ...layout, spot: { x: 700, y: 300 } });
    expect(offset.x + layout.width).toBe(700 - 24);
    expect(offset.y).toBe(300 - 8);
  });

  it("keeps a caption pinned to the left off the screen's left edge", () => {
    const offset = pinnedOffset("left", { ...layout, spot: { x: 300, y: 300 } });
    expect(offset.x).toBe(80);
  });

  it("puts a caption pinned above with its bottom right corner just above and left of the point", () => {
    const offset = pinnedOffset("above", { ...layout, spot: { x: 700, y: 500 } });
    expect(offset.x + layout.width).toBe(700 - 24);
    expect(offset.y + layout.height).toBe(500 - 24);
  });

  it("slides a caption pinned above down beside a hand raised near the top, moving out to stay clear", () => {
    const offset = pinnedOffset("above", { ...layout, spot: { x: 700, y: 150 } });
    expect(offset.y).toBe(16);
    expect(offset.x + layout.width).toBe(700 - 48);
    const nearly = pinnedOffset("above", { ...layout, spot: { x: 700, y: 270 } });
    expect(nearly.y).toBe(16);
    expect(nearly.x + layout.width).toBe(700 - 24 - 10);
  });

  it("keeps a caption pinned above off the screen's left edge", () => {
    const offset = pinnedOffset("above", { ...layout, spot: { x: 300, y: 500 } });
    expect(offset.x + layout.width).toBe(80 + 400);
  });

  it("scales a caption from the corner nearest the point", () => {
    const left = pinnedOffset("left", { ...layout, scale: 0.8, spot: { x: 700, y: 300 } });
    expect(left.x + layout.width).toBe(700 - 24);
    const above = pinnedOffset("above", { ...layout, scale: 0.8, spot: { x: 700, y: 500 } });
    expect(above.x + layout.width).toBe(700 - 24);
    expect(above.y + layout.height).toBe(500 - 24);
  });
});

describe("pinnedFit", () => {
  const caption = { start: 4, end: 7 };
  const above = (y: number, scale = 1) => ({
    place: "above" as const,
    keys: [
      { time: 4.5, x: 0.4, y, scale },
      { time: 6, x: 0.45, y, scale },
    ],
  });

  it("leaves a caption at full size when it fits above the fingertip", () => {
    expect(pinnedFit(above(0.5), caption, 1920, 1080, 300, 24)).toBe(1);
  });

  it("shrinks a caption just enough to fit between the fingertip and the top of the screen", () => {
    const fit = pinnedFit(above(0.3), caption, 1920, 1080, 300, 24);
    expect(fit).toBeCloseTo((0.3 * 1080 - 24 - 16) / 300);
    expect(fit).toBeLessThan(1);
  });

  it("only counts the moments the caption is fully shown, not while it fades in or out", () => {
    const pin = {
      place: "above" as const,
      keys: [
        { time: 4.1, x: 0.4, y: 0.1 },
        { time: 5, x: 0.4, y: 0.5 },
        { time: 6.9, x: 0.4, y: 0.1 },
      ],
    };
    expect(pinnedFit(pin, caption, 1920, 1080, 300, 24)).toBe(1);
  });

  it("never shrinks a caption past the smallest size, and leaves captions beside a point alone", () => {
    expect(pinnedFit(above(0.1), caption, 1920, 1080, 300, 24)).toBe(0.72);
    expect(pinnedFit({ ...above(0.1), place: "left" }, caption, 1920, 1080, 300, 24)).toBe(1);
  });
});

describe("pinnedWidth", () => {
  const limits = { min: 280, max: 460 };

  it("fits a caption pinned to the left between the screen's edge and the fingertip at its leftmost", () => {
    const pin = { place: "left" as const, keys: [{ time: 1, x: 0.25, y: 0.3 }, { time: 2, x: 0.4, y: 0.3 }] };
    expect(pinnedWidth(pin, 1920, 1080, 24, 80, limits)).toBe(480 - 24 - 80);
  });

  it("leaves room for a caption pinned above to slide out beside the fingertip", () => {
    const pin = { place: "above" as const, keys: [{ time: 1, x: 0.25, y: 0.4 }, { time: 2, x: 0.4, y: 0.3 }] };
    expect(pinnedWidth(pin, 1920, 1080, 24, 80, limits)).toBe(480 - 48 - 80);
    const roomy = { place: "above" as const, keys: [{ time: 1, x: 0.5, y: 0.4 }] };
    expect(pinnedWidth(roomy, 1920, 1080, 24, 80, limits)).toBe(460);
  });

  it("gives up on pinning when the caption can't fit beside Topo, so it sits at its side instead", () => {
    const tight = { place: "above" as const, keys: [{ time: 1, x: 0.2, y: 0.4 }] };
    expect(pinnedWidth(tight, 1920, 1080, 24, 80, limits)).toBeNull();
    const cramped = { place: "left" as const, keys: [{ time: 1, x: 0.335, y: 0.38 }] };
    expect(pinnedWidth(cramped, 1024, 768, 16, 51, limits)).toBeNull();
  });
});

describe("coverPoint", () => {
  it("maps the video straight onto a box of the same shape", () => {
    expect(coverPoint(0.5, 0.5, 1920, 1080)).toEqual({ x: 960, y: 540 });
    expect(coverPoint(0.25, 0.75, 1280, 720)).toEqual({ x: 320, y: 540 });
  });

  it("crops the top and bottom of a wider box, and the sides of a taller one", () => {
    const wide = coverPoint(0, 0, 2000, 800);
    expect(wide.x).toBe(0);
    expect(wide.y).toBeCloseTo((800 - 1125) / 2);
    const tall = coverPoint(0.5, 0, 390, 844);
    expect(tall.x).toBeCloseTo(195);
    expect(tall.y).toBe(0);
  });
});

describe("journeyAt", () => {
  const anchors = [1000, 2000, 3000, 4000];

  it("is -1 when the hand-off starts and counts up one step per section", () => {
    expect(journeyAt(1000, anchors)).toBe(-1);
    expect(journeyAt(2000, anchors)).toBe(0);
    expect(journeyAt(2500, anchors)).toBe(0.5);
    expect(journeyAt(4000, anchors)).toBe(2);
  });

  it("falls toward -2 before the hand-off and holds the last step after the last section", () => {
    expect(journeyAt(500, anchors)).toBe(-1.5);
    expect(journeyAt(0, anchors)).toBe(-2);
    expect(journeyAt(9000, anchors)).toBe(2);
  });

  it("copes with no anchors and with anchors that share a position", () => {
    expect(journeyAt(300, [])).toBe(-2);
    expect(journeyAt(2000, [1000, 2000, 2000, 3000])).toBe(0);
    expect(journeyAt(2500, [1000, 2000, 2000, 3000])).toBe(1.5);
  });
});
