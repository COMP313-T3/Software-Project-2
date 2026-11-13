import { useEffect, useId, useRef, useState } from "react";
import { PHONE_WIDTH, type TourStep } from "../../lib/onboarding.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import styles from "./OnboardingTour.module.css";

/** Room between the spotlight and the card. */
const GAP = 14;
/** The card's distance from the edges of the screen. */
const EDGE = 12;
/** Room around a spotlighted control. */
const PAD = 6;
/** The spotlight's ring, which stays on screen for a control at the screen's edge. */
const RING = 3;
const IN_MENU = "It's in the menu.";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Place {
  hole: Box | null;
  /** Where the card goes on a larger screen. On a phone it's docked to the top or bottom edge instead. */
  card: { left: number; top: number } | null;
  dock: "top" | "bottom" | null;
  inMenu: boolean;
}

/** The first control with this data-tour name that's on screen. */
function shown(name: string | undefined): Element | null {
  if (!name) return null;
  for (const element of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) return element;
  }
  return null;
}

/** What a step spotlights: its control, or on a phone the menu button the control is behind. */
function spotFor(step: TourStep): { element: Element | null; inMenu: boolean } {
  const element = shown(step.target);
  if (element || !step.inMenu) return { element, inMenu: false };
  const menu = shown("menu");
  return { element: menu, inMenu: menu !== null };
}

/**
 * Where the spotlight and the card go. Sizes from the page are on-screen pixels, and the tour's own
 * pixels are those divided by the phone zoom, since the tour is drawn inside the zoomed app.
 */
function placeFor(
  { element, inMenu }: { element: Element | null; inMenu: boolean },
  card: HTMLElement | null,
  zoom: number,
): Place {
  const width = window.innerWidth / zoom;
  const height = window.innerHeight / zoom;
  const rect = element?.getBoundingClientRect();
  let hole: Box | null = null;
  if (rect) {
    const left = Math.max(rect.left / zoom - PAD, RING);
    const top = Math.max(rect.top / zoom - PAD, RING);
    const right = Math.min(rect.right / zoom + PAD, width - RING);
    const bottom = Math.min(rect.bottom / zoom + PAD, height - RING);
    hole = { left, top, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
  }
  if (window.innerWidth < PHONE_WIDTH || !card) {
    const low = hole !== null && hole.top + hole.height / 2 > height / 2;
    return { hole, card: null, dock: low ? "top" : "bottom", inMenu };
  }
  const size = card.getBoundingClientRect();
  const w = size.width / zoom;
  const h = size.height / zoom;
  const centered = { left: (width - w) / 2, top: (height - h) / 2 };
  if (!hole) return { hole, card: centered, dock: null, inMenu };
  const x = (left: number) => Math.min(Math.max(left, EDGE), width - w - EDGE);
  const y = (top: number) => Math.min(Math.max(top, EDGE), height - h - EDGE);
  const middleX = hole.left + hole.width / 2 - w / 2;
  const middleY = hole.top + hole.height / 2 - h / 2;
  const right = hole.left + hole.width + GAP;
  const below = hole.top + hole.height + GAP;
  const above = hole.top - GAP - h;
  const left = hole.left - GAP - w;
  let spot = centered;
  if (right + w <= width - EDGE) spot = { left: right, top: y(middleY) };
  else if (below + h <= height - EDGE) spot = { left: x(middleX), top: below };
  else if (above >= EDGE) spot = { left: x(middleX), top: above };
  else if (left >= EDGE) spot = { left, top: y(middleY) };
  return { hole, card: spot, dock: null, inMenu };
}

function samePlace(a: Place | null, b: Place): boolean {
  if (!a || a.dock !== b.dock || a.inMenu !== b.inMenu) return false;
  const near = (one: number, two: number) => Math.abs(one - two) < 0.5;
  const sameHole =
    a.hole === b.hole ||
    (a.hole !== null &&
      b.hole !== null &&
      near(a.hole.left, b.hole.left) &&
      near(a.hole.top, b.hole.top) &&
      near(a.hole.width, b.hole.width) &&
      near(a.hole.height, b.hole.height));
  const sameCard =
    a.card === b.card ||
    (a.card !== null && b.card !== null && near(a.card.left, b.card.left) && near(a.card.top, b.card.top));
  return sameHole && sameCard;
}

interface OnboardingTourProps {
  /** The role's steps, in order. The tour keeps the steps it opened with until it ends. */
  steps: TourStep[];
  /** Called when the user finishes or skips the tour. */
  onDone: (how: "finished" | "skipped") => void;
}

/**
 * The step-by-step onboarding tutorial (US-037). Each step explains one feature in a card next to
 * the control it's about, which is spotlighted while the rest of the page is dimmed. On a phone,
 * a step about a menu link spotlights the menu button instead. Next and Back move through the
 * steps, and Skip tour or Esc ends it at any time. The page can't be used until it ends, and focus
 * goes back to where it was.
 */
export default function OnboardingTour({ steps: openedWith, onDone }: OnboardingTourProps) {
  // A screen that changes size mid-tour, such as a phone turned on its side, doesn't add or drop a step.
  const [steps] = useState(openedWith);
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const backToStart = useRef(false);
  const [index, setIndex] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const titleId = useId();
  const textId = useId();
  const whereId = useId();
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    const element = dialog.current;
    const before = document.activeElement;
    if (element && !element.open) element.showModal();
    primary.current?.focus();
    return () => {
      const back = before instanceof HTMLElement && before.isConnected && before !== document.body ? before : null;
      const again = shown("tips") ?? shown("menu");
      (back ?? (again instanceof HTMLElement ? again : null))?.focus();
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let lit: Element | null = null;
    const measure = () => {
      const zoom = dialog.current
        ? Number.parseFloat(getComputedStyle(dialog.current).getPropertyValue("--phone-zoom")) || 1
        : 1;
      const spot = spotFor(step);
      // The spotlighted control is marked, so it can show itself off, as Topo does by popping up to wave.
      if (spot.element !== lit) {
        lit?.removeAttribute("data-tour-active");
        spot.element?.setAttribute("data-tour-active", "");
        lit = spot.element;
      }
      const next = placeFor(spot, card.current, zoom);
      setPlace((current) => (samePlace(current, next) ? current : next));
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    return () => {
      window.cancelAnimationFrame(frame);
      lit?.removeAttribute("data-tour-active");
    };
  }, [step]);

  useEffect(() => {
    if (!backToStart.current) return;
    backToStart.current = false;
    primary.current?.focus();
  }, [index]);

  function go(to: number) {
    const next = steps[to];
    const where = spotFor(next).inMenu ? ` ${IN_MENU}` : "";
    backToStart.current = to === 0;
    setIndex(to);
    setAnnouncement(`Step ${to + 1} of ${steps.length}: ${next.title}. ${next.text}${where}`);
  }

  if (!step) return null;
  const hole = place?.hole;

  return (
    <dialog
      ref={dialog}
      className={styles.tour}
      data-dim={hole ? undefined : ""}
      aria-labelledby={titleId}
      aria-describedby={place?.inMenu ? `${textId} ${whereId}` : textId}
      onCancel={(event) => {
        event.preventDefault();
        onDone("skipped");
      }}
    >
      {hole && (
        <div
          className={styles.hole}
          style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }}
        />
      )}
      <div
        ref={card}
        className={styles.card}
        data-ready={place ? "" : undefined}
        data-dock={place?.card ? undefined : (place?.dock ?? undefined)}
        style={place?.card ? { left: place.card.left, top: place.card.top } : undefined}
      >
        <p className={styles.count}>
          Step {index + 1} of {steps.length}
        </p>
        <h2 id={titleId} className={styles.title}>
          {step.title}
        </h2>
        <p id={textId} className={styles.text}>
          {step.text}
        </p>
        {place?.inMenu && (
          <p id={whereId} className={styles.where}>
            {IN_MENU}
          </p>
        )}
        <div className={styles.actions}>
          {!last && (
            <button type="button" className={styles.skip} onClick={() => onDone("skipped")}>
              Skip tour
            </button>
          )}
          <div className={styles.moves}>
            {index > 0 && (
              <button type="button" className={workspace.secondary} onClick={() => go(index - 1)}>
                Back
              </button>
            )}
            <button
              ref={primary}
              type="button"
              className={workspace.primary}
              onClick={() => (last ? onDone("finished") : go(index + 1))}
            >
              {last ? "Finish" : "Next"}
            </button>
          </div>
        </div>
        <p className={styles.hidden} aria-live="polite">
          {announcement}
        </p>
      </div>
    </dialog>
  );
}
