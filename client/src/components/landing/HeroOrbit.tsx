import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import LandingActions from "./LandingActions.tsx";
import {
  HANDOFF_SCREENS,
  VIDEO_SCREENS,
  captionIsShown,
  captionLineStyle,
  coverPoint,
  heroProgress,
  introStyle,
  pinAt,
  pinnedFit,
  pinnedOffset,
  pinnedWidth,
  smoothstep,
  videoTimeAt,
} from "./heroTimeline.ts";
import { HERO_CAPTIONS, HERO_VIDEO_SECONDS, type HeroCaption } from "./landingContent.ts";
import { mapOutline } from "./mapOutline.ts";
import { isSmallScreen, prefersReducedMotion } from "./motion.ts";
import { boxQuad, mixQuads, quadMatrix, type Quad } from "./quad.ts";
import styles from "./HeroOrbit.module.css";

const VIDEO = {
  large: "/landing/topo-orbit-1080.mp4",
  small: "/landing/topo-orbit-720.mp4",
};
const POSTER = "/landing/topo-orbit-poster.jpg";
const CUTOUT = "/landing/topo-cutout.webp";

/** Frames per second of the orbit video. Seeks land on whole frames. */
const VIDEO_FPS = 24;
/**
 * How far the scroll has to move past the frame on screen, in frames, before the next frame is
 * shown. The last few pixels of a scroll, as it eases to a stop, would otherwise flick on one
 * more frame just after the motion seems to have ended.
 */
const FRAME_HOLD = 0.6;
/** A seek still running after this long is overtaken by a new one, so a slow seek can't freeze the video. */
const SEEK_TIMEOUT_MS = 250;
/** Width range of a caption pinned beside Topo's fingertip, in pixels. */
const PINNED_MIN_WIDTH = 280;
const PINNED_MAX_WIDTH = 460;
/** Where captions stack along the bottom of the screen instead of sitting beside Topo. Matches the CSS. */
const STACKED_CAPTIONS = "(max-width: 760px), (orientation: portrait) and (max-width: 1024px)";

/**
 * Where the frame lies down when the 3D scene isn't there to show the map's ground, such as
 * without WebGL: a board seen at a slant in the middle of the screen.
 */
function restingBoard(width: number, height: number): Quad {
  return [
    [width * 0.2, height * 0.16],
    [width * 0.8, height * 0.16],
    [width * 0.94, height * 0.86],
    [width * 0.06, height * 0.86],
  ];
}

/**
 * Animation order for each word of a caption title. The eyebrow is 0 and the body is 2, so the
 * words share the space between them, at most a quarter step apart.
 */
function wordIndex(word: number, words: number): number {
  return 1 + word * Math.min(0.25, 0.9 / Math.max(1, words - 1));
}

function CaptionCard({ caption }: { caption: HeroCaption }) {
  const words = caption.title.split(" ");
  return (
    <article className={styles.caption} data-caption={caption.id} data-side={caption.side}>
      <p className={styles.eyebrow} data-index="0">
        <span className={styles.rule} aria-hidden="true" />
        {caption.eyebrow}
      </p>
      <h2 className={styles.captionTitle}>
        {words.map((word, index) => (
          <Fragment key={index}>
            <span className={styles.word} data-index={wordIndex(index, words.length)}>
              {word}
            </span>
            {index < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </h2>
      <p className={styles.captionBody} data-index="2">
        {caption.body}
      </p>
      {caption.withActions ? (
        <div className={styles.captionActions} data-index="3">
          <LandingActions />
        </div>
      ) : null}
    </article>
  );
}

/**
 * The opening of the landing page: Topo's 360 orbit on a mountain summit, played by scrolling.
 *
 * The hero is a tall scroll track with a stage pinned to the screen inside it. Scrolling through
 * the first six screens of the track scrubs the 15-second video from its first frame to its last,
 * while captions about TopSend rise in and drift away in time with Topo's gestures. The last
 * screen tilts the whole frame back and lifts it away, handing off to the 3D scene underneath.
 *
 * It opens on "TopSend" set huge behind Topo: a still cut out of the first frame sits in front
 * of the title, so the letters look like they stand behind him until the first scroll swings
 * them open. Works the same with a mouse wheel, a trackpad, or a finger on a phone, since it
 * only reads the page's scroll position. With reduced motion the hero is a still poster instead.
 */
export default function HeroOrbit() {
  const [still] = useState(prefersReducedMotion);
  const track = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const cutout = useRef<HTMLImageElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const leftDoor = useRef<HTMLSpanElement>(null);
  const rightDoor = useRef<HTMLSpanElement>(null);
  const below = useRef<HTMLDivElement>(null);
  const captions = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parts = {
      track: track.current,
      stage: stage.current,
      frame: frame.current,
      video: video.current,
      cutout: cutout.current,
      title: title.current,
      leftDoor: leftDoor.current,
      rightDoor: rightDoor.current,
      below: below.current,
      captions: captions.current,
    };
    if (still || Object.values(parts).some((part) => !part)) return;
    const el = parts as { [K in keyof typeof parts]: NonNullable<(typeof parts)[K]> };
    const light = isSmallScreen();

    const cards = Array.from(el.captions.querySelectorAll<HTMLElement>("[data-caption]")).map((article, index) => {
      const items = Array.from(article.querySelectorAll<HTMLElement>("[data-index]")).map((element) => ({
        element,
        index: Number(element.dataset.index),
      }));
      article.inert = true;
      return {
        caption: HERO_CAPTIONS[index],
        article,
        items,
        count: Math.max(...items.map((item) => item.index)) + 1,
        shown: false,
        pinned: false,
        width: 0,
        height: 0,
        fit: 1,
      };
    });
    const scrims = Array.from(el.captions.querySelectorAll<HTMLElement>("[data-scrim]"));
    const stacked = window.matchMedia(STACKED_CAPTIONS);

    const player = el.video;
    player.muted = true;
    player.defaultMuted = true;
    player.setAttribute("muted", "");

    // The whole video is downloaded before it's shown, so every seek reads from memory instead
    // of waiting on the network for the part it needs. The poster, its first frame, shows until
    // then. Without fetch, or if the download fails, the video streams from its address instead.
    const source = light ? VIDEO.small : VIDEO.large;
    player.dataset.source = source;
    const download = new AbortController();
    let memoryUrl = "";
    const stream = () => {
      if (!download.signal.aborted) player.src = source;
    };
    if (typeof fetch === "function" && typeof URL.createObjectURL === "function") {
      fetch(source, { signal: download.signal })
        .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`))))
        .then((blob) => {
          if (download.signal.aborted) return;
          memoryUrl = URL.createObjectURL(blob);
          player.src = memoryUrl;
        })
        .catch(stream);
    } else {
      stream();
    }

    // The video shows whole frames, one seek at a time. Asking for a new frame while the last
    // one is still decoding queues up work and makes the video stutter behind the scroll, so the
    // next seek starts the moment the last one lands, aimed at wherever the scroll is by then.
    let seeking = false;
    let seekStartedAt = 0;
    let wantedFrame = 0;
    let requestedFrame = -1;
    // The time of the frame actually on screen. currentTime jumps to a seek's target straight
    // away, while the old frame stays up until the seek lands, so this only moves once it has.
    let shownTime = 0;
    const lastFrame = () =>
      Math.max(0, Math.round((Number.isFinite(player.duration) ? player.duration : HERO_VIDEO_SECONDS) * VIDEO_FPS) - 1);
    const startSeek = () => {
      if (player.readyState < HTMLMediaElement.HAVE_METADATA || wantedFrame === requestedFrame) return;
      seeking = true;
      seekStartedAt = performance.now();
      requestedFrame = wantedFrame;
      // The middle of the frame, so rounding never lands on the one next to it.
      player.currentTime = (wantedFrame + 0.5) / VIDEO_FPS;
    };
    const onFrameShown = () => {
      shownTime = player.currentTime;
    };
    const onSeeked = () => {
      seeking = false;
      onFrameShown();
      startSeek();
    };
    const onMetadata = () => {
      requestedFrame = -1;
      startSeek();
    };
    player.addEventListener("seeked", onSeeked);
    player.addEventListener("pause", onFrameShown);
    player.addEventListener("loadedmetadata", onMetadata);

    // iOS Safari doesn't paint the frames it seeks to until the video has played once. Muted
    // inline video may play without a tap, so play and pause it as soon as it can, and try
    // again on the first touch in case Low Power Mode blocked the first try.
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      const attempt = player.play();
      attempt
        ?.then(() => {
          unlocked = true;
          player.pause();
          // Playing moved it on a frame or two, so it goes back to the frame the scroll asks for.
          requestedFrame = -1;
          startSeek();
          window.removeEventListener("touchstart", unlock);
        })
        .catch(() => undefined);
    };
    player.addEventListener("loadeddata", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });

    // On wide screens, captions with a pin sit by Topo's fingertip. Each keeps one width the
    // whole time it's up, so its lines never rewrap mid-scroll: the widest that still fits
    // between the fingertip and the screen's edge wherever the fingertip goes.
    let frameWidth = 0;
    let frameHeight = 0;
    let gutter = 0;
    let gap = 0;
    const layoutPins = () => {
      for (const card of cards) {
        const pin = card.caption.pin;
        const width =
          pin && !stacked.matches
            ? pinnedWidth(pin, frameWidth, frameHeight, gap, gutter, { min: PINNED_MIN_WIDTH, max: PINNED_MAX_WIDTH })
            : null;
        const pinned = width !== null;
        if (pinned !== card.pinned) {
          card.pinned = pinned;
          if (pinned && pin) card.article.dataset.pinned = pin.place;
          else delete card.article.dataset.pinned;
          card.article.style.transform = "";
          card.article.style.width = "";
          card.width = 0;
        }
        if (width === null) continue;
        if (width !== card.width) {
          card.width = width;
          card.article.style.width = `${width}px`;
        }
        card.height = card.article.offsetHeight;
        if (pin) card.fit = pinnedFit(pin, card.caption, frameWidth, frameHeight, card.height, gap);
      }
    };

    // One screen of scrolling, measured from the track so a phone's address bar showing or
    // hiding doesn't change how far each part of the video is.
    const screens = VIDEO_SCREENS + HANDOFF_SCREENS;
    let unit = 0;
    const measure = () => {
      unit = Math.max(1, (el.track.offsetHeight - el.stage.offsetHeight) / screens);
      frameWidth = el.frame.clientWidth;
      frameHeight = el.frame.clientHeight;
      gutter = Math.min(88, Math.max(20, frameWidth * 0.05));
      gap = Math.min(32, Math.max(16, frameWidth * 0.016));
      layoutPins();
    };
    measure();
    const resizer = new ResizeObserver(measure);
    resizer.observe(el.track);
    resizer.observe(el.stage);

    let applied = Number.NaN;
    let appliedUnit = Number.NaN;
    let appliedShown = Number.NaN;
    let belowInert = false;
    let frameId = 0;

    // The orbit follows the scroll position exactly, with no easing of its own: the browser
    // already eases each turn of the wheel and each swipe, so the video starts and stops with
    // the page, and there's nothing left playing on after the scrolling ends.
    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (document.hidden) return;

      const scrolled = Math.min(Math.max(-el.track.getBoundingClientRect().top, 0), unit * screens);
      const { video: progress, handoff } = heroProgress(scrolled, unit);
      const time = videoTimeAt(progress);
      const target = time * VIDEO_FPS;
      if (Math.abs(target - wantedFrame) >= FRAME_HOLD) {
        wantedFrame = Math.min(Math.max(Math.round(target), 0), lastFrame());
      }
      if (!seeking || now - seekStartedAt > SEEK_TIMEOUT_MS) startSeek();

      const intro = introStyle(time, shownTime);
      // Mid hand-off the frame follows the 3D map's ground, which moves with the camera even
      // while the page holds still, so it's redrawn every frame.
      const handingOff = handoff > 0 && handoff < 1;
      if (scrolled === applied && unit === appliedUnit && shownTime === appliedShown && !handingOff) return;
      applied = scrolled;
      appliedUnit = unit;
      appliedShown = shownTime;

      el.cutout.style.opacity = intro.cutout.toFixed(3);
      el.cutout.style.visibility = intro.cutout > 0 ? "visible" : "hidden";
      el.leftDoor.style.transform = `translate3d(${(-intro.open * 0.5).toFixed(4)}em, 0, 0) rotateY(${(intro.open * 64).toFixed(2)}deg)`;
      el.rightDoor.style.transform = `translate3d(${(intro.open * 0.5).toFixed(4)}em, 0, 0) rotateY(${(-intro.open * 64).toFixed(2)}deg)`;
      el.title.style.opacity = intro.opacity.toFixed(3);
      el.title.style.visibility = intro.opacity > 0 ? "visible" : "hidden";
      if (!light) el.title.style.filter = intro.opacity < 0.99 ? `blur(${((1 - intro.opacity) * 6).toFixed(2)}px)` : "none";
      el.below.style.opacity = intro.opacity.toFixed(3);
      el.below.style.transform = `translate3d(0, ${((1 - intro.opacity) * 28).toFixed(2)}px, 0)`;
      el.below.style.visibility = intro.opacity > 0 ? "visible" : "hidden";
      if (belowInert !== intro.opacity < 0.5) {
        belowInert = intro.opacity < 0.5;
        el.below.inert = belowInert;
      }

      const sides = { left: 0, right: 0 };
      for (const card of cards) {
        const shown = captionIsShown(card.caption, time);
        if (shown !== card.shown) {
          card.shown = shown;
          card.article.inert = !shown;
        }
        // Captions that are off screen are hidden outright, so only the one being read costs
        // anything to draw.
        const lines = card.items.map(({ element, index }) => ({
          element,
          line: captionLineStyle(card.caption, index, card.count, time),
        }));
        const lit = lines.some(({ line }) => line.opacity > 0);
        card.article.style.visibility = lit ? "visible" : "hidden";
        if (!lit) continue;
        for (const { element, line } of lines) {
          element.style.opacity = line.opacity.toFixed(3);
          element.style.transform = `translate3d(0, ${line.y.toFixed(2)}px, 0)`;
          element.style.setProperty("--reveal", line.opacity.toFixed(3));
          if (!light) element.style.filter = line.blur > 0.05 && line.opacity > 0 ? `blur(${line.blur.toFixed(2)}px)` : "none";
        }
        const seen = captionLineStyle(card.caption, 0, 1, time).opacity;
        const pin = card.caption.pin;
        if (card.pinned && pin && seen > 0) {
          // Placed by the frame on screen rather than the scroll position, so the caption stays
          // with the fingertip even while a seek is still landing.
          const point = pinAt(pin.keys, shownTime);
          const scale = point.scale * card.fit;
          const offset = pinnedOffset(pin.place, {
            spot: coverPoint(point.x, point.y, frameWidth, frameHeight),
            width: card.width,
            height: card.height,
            scale,
            frameWidth,
            frameHeight,
            gap,
            gutter,
          });
          card.article.style.transform = `translate3d(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
        }
        sides[card.caption.side] = Math.max(sides[card.caption.side], seen);
      }
      for (const scrim of scrims) {
        scrim.style.opacity = sides[scrim.dataset.scrim === "right" ? "right" : "left"].toFixed(3);
      }

      // The hand-off: the frame lies down onto the 3D map's ground, corner to corner, following it
      // as the camera starts its descent, then fades into it. The video becomes the map, rather
      // than fading out over a board that doesn't line up with it.
      if (handoff > 0) {
        const ground = mapOutline.read() ?? restingBoard(frameWidth, frameHeight);
        const lying = mixQuads(boxQuad(frameWidth, frameHeight), ground, smoothstep(0, 0.6, handoff));
        el.frame.style.transform = quadMatrix(frameWidth, frameHeight, lying);
      } else {
        el.frame.style.transform = "none";
      }
      el.frame.style.opacity = (1 - smoothstep(0.5, 0.95, handoff)).toFixed(3);
      el.frame.style.visibility = handoff >= 0.95 ? "hidden" : "visible";
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      resizer.disconnect();
      download.abort();
      window.removeEventListener("touchstart", unlock);
      player.removeEventListener("loadeddata", unlock);
      player.removeEventListener("seeked", onSeeked);
      player.removeEventListener("pause", onFrameShown);
      player.removeEventListener("loadedmetadata", onMetadata);
      player.pause();
      player.removeAttribute("src");
      player.load();
      if (memoryUrl) URL.revokeObjectURL(memoryUrl);
    };
  }, [still]);

  const trackStyle = {
    "--video-screens": VIDEO_SCREENS,
    "--handoff-screens": HANDOFF_SCREENS,
  } as CSSProperties;

  return (
    <section
      ref={track}
      className={styles.track}
      data-still={still}
      style={trackStyle}
      aria-labelledby="landing-title"
    >
      <div ref={stage} className={styles.stage}>
        <div ref={frame} className={styles.frame}>
          {still ? (
            <img className={styles.media} src={POSTER} alt="" />
          ) : (
            <video
              ref={video}
              className={styles.media}
              poster={POSTER}
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              disableRemotePlayback
              tabIndex={-1}
              aria-hidden="true"
            />
          )}
          <div className={styles.shade} aria-hidden="true" />

          <h1 ref={title} id="landing-title" className={styles.title} aria-label="TopSend">
            <span ref={leftDoor} className={styles.door} data-door="left" aria-hidden="true">
              {"Top".split("").map((letter, index) => (
                <span key={index} className={styles.letter} style={{ "--i": index } as CSSProperties}>
                  {letter}
                </span>
              ))}
            </span>
            <span ref={rightDoor} className={styles.door} data-door="right" aria-hidden="true">
              {"Send".split("").map((letter, index) => (
                <span key={index} className={styles.letter} style={{ "--i": index + 3 } as CSSProperties}>
                  {letter}
                </span>
              ))}
            </span>
          </h1>
          <img ref={cutout} className={styles.cutout} src={CUTOUT} alt="" aria-hidden="true" />

          <div ref={captions} className={styles.captions}>
            <div className={styles.scrim} data-scrim="left" aria-hidden="true" />
            <div className={styles.scrim} data-scrim="right" aria-hidden="true" />
            {still ? null : HERO_CAPTIONS.map((caption) => <CaptionCard key={caption.id} caption={caption} />)}
          </div>

          <div ref={below} className={styles.below}>
            <div className={styles.belowInner}>
              <p className={styles.tagline}>
                Local bouldering competitions in Toronto, all in one place.
              </p>
              <LandingActions />
              <p className={styles.cue} aria-hidden="true">
                <span className={styles.cueTrack}>
                  <span className={styles.cueDot} />
                </span>
                Scroll to explore
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.handoffMark} data-journey-step="-1" data-journey-align="top" aria-hidden="true" />
      <div className={styles.navMark} data-nav-from="" aria-hidden="true" />
    </section>
  );
}
