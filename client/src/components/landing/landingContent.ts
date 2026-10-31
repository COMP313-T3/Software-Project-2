/** Length of the hero video, in seconds. The hero's scroll track maps onto this time. */
export const HERO_VIDEO_SECONDS = 15.08;

/** Where a pinned caption's point is at one moment of the video. */
export interface PinKey {
  /** Video time, in seconds. */
  time: number;
  /** Share of the video frame's width, from its left edge. */
  x: number;
  /** Share of the video frame's height, from its top edge. */
  y: number;
  /** Size of the caption, for following the camera in or out. 1 when left out. */
  scale?: number;
}

/**
 * Pins a caption by Topo's fingertip on wide screens, while he points to the left. Points are
 * traced from the video frames.
 */
export interface CaptionPin {
  /**
   * Where the caption sits. "left" puts its top right corner just left of the fingertip and level
   * with it. "above" puts its bottom right corner just above and left of the fingertip, so the
   * whole caption sits higher than his hand, clear of his head on the other side.
   */
  place: "left" | "above";
  /** One keyframe keeps the caption still; more make it follow the hand as the camera moves. */
  keys: PinKey[];
}

export interface HeroCaption {
  id: string;
  /** Video time, in seconds, when the caption starts to come in. */
  start: number;
  /** Video time, in seconds, when the caption has fully gone. */
  end: number;
  /** The side of the frame the caption sits on, the side Topo is gesturing toward. */
  side: "left" | "right";
  eyebrow: string;
  title: string;
  body: string;
  /** Shows the sign-up and log-in buttons under the caption. */
  withActions?: boolean;
  /** Places the caption by Topo's fingertip on wide screens instead of at the side. */
  pin?: CaptionPin;
}

/**
 * The story told over the hero video. Each caption is timed to one of Topo's gestures in
 * Topo 360 Orbit H3 2K: raising a finger from about 2.8s, pointing across the mountains from
 * about 4.5s while the camera pulls back, reaching right at about 8.5s, sweeping left at about
 * 11s, and opening both hands at about 13s.
 */
export const HERO_CAPTIONS: HeroCaption[] = [
  {
    id: "find",
    start: 2.75,
    end: 4.2,
    side: "left",
    eyebrow: "Find",
    title: "Comps near you, in seconds",
    body: "Search from where you are, or any address, and see what's coming up across Toronto.",
    // Pops up beside his raised finger and stays put. It's gone before his arm swings down
    // through that spot.
    pin: { place: "left", keys: [{ time: 3.4, x: 0.336, y: 0.22 }] },
  },
  {
    id: "explore",
    start: 4.6,
    end: 6.9,
    side: "left",
    eyebrow: "Explore",
    title: "Every gym, pinned on the map",
    body: "Sort by closest, soonest, or the most spots left, then open any event for the details.",
    // Rides above his fingertip as the camera pulls back, shrinking a little as he does.
    pin: {
      place: "above",
      keys: [
        { time: 4.5, x: 0.314, y: 0.356, scale: 1.04 },
        { time: 4.6, x: 0.334, y: 0.344, scale: 1 },
        { time: 4.8, x: 0.359, y: 0.348, scale: 0.945 },
        { time: 5.0, x: 0.378, y: 0.356, scale: 0.908 },
        { time: 5.2, x: 0.395, y: 0.367, scale: 0.899 },
        { time: 5.4, x: 0.41, y: 0.372, scale: 0.88 },
        { time: 5.6, x: 0.422, y: 0.387, scale: 0.858 },
        { time: 5.8, x: 0.429, y: 0.396, scale: 0.846 },
        { time: 6.0, x: 0.44, y: 0.41, scale: 0.824 },
        { time: 6.2, x: 0.444, y: 0.417, scale: 0.82 },
        { time: 6.4, x: 0.444, y: 0.428, scale: 0.806 },
        { time: 6.6, x: 0.444, y: 0.433, scale: 0.794 },
        { time: 6.9, x: 0.445, y: 0.438, scale: 0.79 },
      ],
    },
  },
  {
    id: "register",
    start: 7.4,
    end: 10.3,
    side: "right",
    eyebrow: "Register",
    title: "Pick your division and lock in your spot",
    body: "Open, Beginner, Intermediate, or Advanced. Any climber can enter any division.",
  },
  {
    id: "gyms",
    start: 10.5,
    end: 12.3,
    side: "left",
    eyebrow: "For gyms",
    title: "Built for the gyms that host",
    body: "Add routes with point values, choose the scoring, and manage every climber in one place.",
  },
  {
    id: "start",
    start: 12.6,
    end: HERO_VIDEO_SECONDS + 1,
    side: "left",
    eyebrow: "TopSend",
    title: "Your next send starts here",
    body: "Join Toronto's bouldering competition scene, from your first comp to your next podium.",
    withActions: true,
  },
];

export interface FeatureSection {
  id: string;
  /** Index of the 3D stage the camera frames while this section is on screen. */
  stage: number;
  /** The side the text sits on. The 3D stage is framed on the other side. */
  side: "left" | "right";
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  action?: { label: string; to: string };
}

/** The sections after the hero, in scroll order. Each one has its own stage in the 3D scene. */
export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: "climbers",
    stage: 0,
    side: "left",
    eyebrow: "For climbers",
    title: "Every comp in Toronto, one map away",
    body: "Start from where you are, a place you search for, or your saved spot. Set a distance, then sort the list by closest, soonest, or spots left.",
    points: [
      "Map and list views of upcoming competitions",
      "How far each gym is from you",
      "Full event details before you sign up",
    ],
  },
  {
    id: "routes",
    stage: 1,
    side: "right",
    eyebrow: "On the wall",
    title: "Know the routes before you show up",
    body: "Each competition lists its boulder problems and what they're worth. A send on your first try earns the full points, and each failed attempt takes a set share off, up to the gym's attempt limit.",
    points: [
      "A point value on every boulder problem",
      "Divisions from Open to Advanced",
      "The same scoring rules for every climber",
    ],
  },
  {
    id: "gyms",
    stage: 2,
    side: "left",
    eyebrow: "For gyms",
    title: "Run your comp from one dashboard",
    body: "Create the event, add routes with point values, set the scoring, and place every climber in the right division. Your gym's address and map pin come built in.",
    points: [
      "Create competitions and open registration",
      "Routes, divisions, and scoring in one place",
      "Approved by a TopSend System Administrator",
    ],
    action: { label: "Request Gym Admin access", to: "/gym-request" },
  },
  {
    id: "live",
    stage: 3,
    side: "right",
    eyebrow: "On comp day",
    title: "Live scorecards and leaderboards",
    body: "Log your sends from your phone and watch the standings move as results come in. The AI Route Assistant suggests which problem to try next.",
    points: ["My Scorecard", "Live leaderboard", "AI Route Assistant"],
  },
];

/** Where the sign-up and log-in buttons lead. */
export const LANDING_LINKS = {
  register: "/register",
  login: "/login",
  gymRequest: "/gym-request",
  dashboard: "/dashboard",
  terms: "/terms",
  privacy: "/privacy",
} as const;
