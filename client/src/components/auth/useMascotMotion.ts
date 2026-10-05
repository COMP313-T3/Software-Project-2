import { useEffect, useRef } from "react";

/** Size of login-scene.jpg in pixels. */
const IMAGE = { width: 1672, height: 941 };

/**
 * Pose of the monitor head in login-scene.jpg, fitted to the artwork: the neck pivot (px, py)
 * in image pixels, the box centre's offset above the pivot (cy), the resting rotation in
 * degrees, and the CSS perspective distance. These must match ClimberMascot.module.css.
 */
const POSE = {
  px: 1285.836,
  py: 313.028,
  cy: -74.775,
  yaw: -26.766,
  pitch: 11.928,
  roll: -22.682,
  P: 3000,
};
const LIMITS = { yawMin: -50, yawMax: 16, pitchMin: -24, pitchMax: 34 };
const DEPTH = 760;
const EYE_SHIFT = { k: 12, x: 7, y: 6 };
const BEAM_WIDTHS = [1, 0.55, 0.24];

type Vec3 = [number, number, number];
type Point = { x: number; y: number };
type Mode = "rest" | "pointer" | "field" | "away";

interface MascotElements {
  stage: HTMLDivElement;
  anchor: HTMLDivElement;
  head: HTMLDivElement;
  front: HTMLDivElement;
  eyes: HTMLDivElement;
  beams: SVGSVGElement;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function rotY(a: number, [x, y, z]: Vec3): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotX(a: number, [x, y, z]: Vec3): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

function rotZ(a: number, [x, y, z]: Vec3): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c, z];
}

function isPasswordControl(el: Element | null): boolean {
  if (!el) return false;
  return el.hasAttribute("data-pw") || el.hasAttribute("data-reveal");
}

function findBeamParts(beams: SVGSVGElement) {
  const part = <T extends Element>(name: string) =>
    beams.querySelector<T>(`[data-part="${name}"]`);
  const beamGroup = part<SVGGElement>("beam-group");
  const spot = part<SVGCircleElement>("spot");
  const soften = part<SVGFilterElement>("soften");
  const gradientL = part<SVGLinearGradientElement>("fade-l");
  const gradientR = part<SVGLinearGradientElement>("fade-r");
  if (!beamGroup || !spot || !soften || !gradientL || !gradientR) return null;
  return {
    beamGroup,
    spot,
    soften,
    gradientL,
    gradientR,
    polygonsL: ["beam-l0", "beam-l1", "beam-l2"].map((name) =>
      part<SVGPolygonElement>(name),
    ),
    polygonsR: ["beam-r0", "beam-r1", "beam-r2"].map((name) =>
      part<SVGPolygonElement>(name),
    ),
  };
}

function startMascot(
  elements: MascotElements,
  onEyesClosedChange: (closed: boolean) => void,
): () => void {
  const { stage, anchor, head, front, eyes, beams } = elements;
  const parts = findBeamParts(beams);
  if (!parts) return () => undefined;
  const {
    beamGroup,
    spot,
    soften,
    gradientL,
    gradientR,
    polygonsL,
    polygonsR,
  } = parts;
  const eyeEls = Array.from(eyes.children);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  const view = { scale: 1, x: 0, y: 0, centerLocalX: 0, centerLocalY: 0 };
  const state = {
    yaw: POSE.yaw,
    pitch: POSE.pitch,
    ex: 0,
    ey: 0,
    beam: 0,
    lid: 1,
    glow: 1,
  };
  const want: {
    mode: Mode;
    x: number;
    y: number;
    field: HTMLInputElement | null;
    eyesClosed: boolean;
    blinking: boolean;
  } = {
    mode: "rest",
    x: 0,
    y: 0,
    field: null,
    eyesClosed: false,
    blinking: false,
  };

  let disposed = false;
  let running = false;
  let last = 0;
  let frameId = 0;
  let restTimer = 0;
  let focusTimer = 0;
  let blinkTimer = 0;
  let blinkEndTimer = 0;
  let measure: CanvasRenderingContext2D | null | undefined;

  function layout() {
    const box = stage.getBoundingClientRect();
    const styles = getComputedStyle(stage);
    const fx = parseFloat(styles.getPropertyValue("--focus-x")) || 0.75;
    const fy = parseFloat(styles.getPropertyValue("--focus-y")) || 0.42;
    const scale = Math.max(box.width / IMAGE.width, box.height / IMAGE.height);
    const offsetX = (box.width - IMAGE.width * scale) * fx;
    const offsetY = (box.height - IMAGE.height * scale) * fy;
    view.scale = scale;
    view.x = offsetX + POSE.px * scale;
    view.y = offsetY + POSE.py * scale;
    anchor.style.transform = `translate(${view.x}px, ${view.y}px) scale(${scale})`;
    let c: Vec3 = [0, POSE.cy, 0];
    c = rotY(rad(POSE.yaw), c);
    c = rotX(rad(POSE.pitch), c);
    c = rotZ(rad(POSE.roll), c);
    const k = POSE.P / (POSE.P - c[2]);
    view.centerLocalX = c[0] * k;
    view.centerLocalY = c[1] * k;
  }

  function headCenter(): Point {
    const box = stage.getBoundingClientRect();
    return {
      x: box.left + view.x + view.centerLocalX * view.scale,
      y: box.top + view.y + view.centerLocalY * view.scale,
    };
  }

  function aim(tx: number, ty: number) {
    const c = headCenter();
    const vx = (tx - c.x) / view.scale;
    const vy = (ty - c.y) / view.scale;
    const len = Math.hypot(vx, vy, DEPTH);
    let d: Vec3 = [vx / len, vy / len, DEPTH / len];
    d = rotZ(-rad(POSE.roll), d);
    const yaw = Math.asin(clamp(d[0], -1, 1));
    const pitch = Math.asin(clamp(-d[1] / Math.cos(yaw), -1, 1));
    return {
      yaw: deg(yaw),
      pitch: deg(pitch),
      dist: Math.hypot(tx - c.x, ty - c.y),
      dir: d,
    };
  }

  function caretPoint(input: HTMLInputElement): Point {
    const r = input.getBoundingClientRect();
    const cs = getComputedStyle(input);
    if (measure === undefined)
      measure = document.createElement("canvas").getContext("2d");
    let width = input.value.length * 8;
    if (measure) {
      measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      width = measure.measureText(input.value).width;
    }
    const left = r.left + parseFloat(cs.paddingLeft);
    return {
      x: clamp(left + width, left, r.right - parseFloat(cs.paddingRight)),
      y: r.top + r.height / 2,
    };
  }

  function currentTarget(): Point | null {
    if (want.mode === "pointer") return { x: want.x, y: want.y };
    if (want.mode === "field" && want.field) return caretPoint(want.field);
    if (want.mode === "away") {
      const c = headCenter();
      return { x: c.x + 260 * view.scale, y: c.y + 210 * view.scale };
    }
    return null;
  }

  function setBeam(
    polygons: (SVGPolygonElement | null)[],
    gradient: SVGLinearGradientElement,
    ex: number,
    ey: number,
    tx: number,
    ty: number,
    half0: number,
    half1: number,
  ) {
    const dx = tx - ex;
    const dy = ty - ey;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    polygons.forEach((poly, i) => {
      if (!poly) return;
      const a = half0 * (i === 0 ? 1 : BEAM_WIDTHS[i] + 0.2);
      const b = half1 * BEAM_WIDTHS[i];
      const points = [
        ex + nx * a,
        ey + ny * a,
        tx + nx * b,
        ty + ny * b,
        tx - nx * b,
        ty - ny * b,
        ex - nx * a,
        ey - ny * a,
      ];
      poly.setAttribute("points", points.map((v) => v.toFixed(1)).join(" "));
    });
    gradient.setAttribute("x1", ex.toFixed(1));
    gradient.setAttribute("y1", ey.toFixed(1));
    gradient.setAttribute("x2", tx.toFixed(1));
    gradient.setAttribute("y2", ty.toFixed(1));
  }

  function eyeCenters() {
    return eyeEls.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        size: Math.max(r.width, r.height),
      };
    });
  }

  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    const ease = (tau: number) => 1 - Math.exp(-dt / tau);

    const motion = !reduceMotion.matches;
    const target = motion ? currentTarget() : null;
    let goalYaw = POSE.yaw;
    let goalPitch = POSE.pitch;
    let beamGoal = 0;
    let ex = 0;
    let ey = 0;

    if (target) {
      const a = aim(target.x, target.y);
      goalYaw = clamp(a.yaw, LIMITS.yawMin, LIMITS.yawMax);
      goalPitch = clamp(a.pitch, LIMITS.pitchMin, LIMITS.pitchMax);
      let local = rotX(-rad(state.pitch), a.dir);
      local = rotY(-rad(state.yaw), local);
      ex = clamp(local[0] * EYE_SHIFT.k, -EYE_SHIFT.x, EYE_SHIFT.x);
      ey = clamp(local[1] * EYE_SHIFT.k, -EYE_SHIFT.y, EYE_SHIFT.y);
      const facing =
        Math.cos(rad(goalYaw - a.yaw)) * Math.cos(rad(goalPitch - a.pitch));
      const near = clamp((a.dist - 40) / 80, 0, 1);
      if (
        (want.mode === "pointer" || want.mode === "field") &&
        !want.eyesClosed
      ) {
        beamGoal = clamp((facing - 0.55) / 0.35, 0, 1) * near;
      }
    }

    state.yaw += (goalYaw - state.yaw) * ease(0.12);
    state.pitch += (goalPitch - state.pitch) * ease(0.12);
    state.ex += (ex - state.ex) * ease(0.06);
    state.ey += (ey - state.ey) * ease(0.06);
    state.beam +=
      (beamGoal - state.beam) * ease(beamGoal > state.beam ? 0.22 : 0.14);
    const lidGoal = want.eyesClosed ? 0.12 : want.blinking ? 0.1 : 1;
    const glowGoal = want.eyesClosed ? 0.35 : 1;
    if (motion) {
      state.lid += (lidGoal - state.lid) * ease(want.blinking ? 0.025 : 0.07);
      state.glow += (glowGoal - state.glow) * ease(0.12);
    } else {
      state.lid = lidGoal;
      state.glow = glowGoal;
    }

    head.style.transform = `rotateZ(${POSE.roll}deg) rotateX(${state.pitch.toFixed(3)}deg) rotateY(${state.yaw.toFixed(3)}deg)`;
    eyes.style.setProperty("--ex", state.ex.toFixed(2));
    eyes.style.setProperty("--ey", state.ey.toFixed(2));
    front.style.setProperty("--lid", state.lid.toFixed(3));
    front.style.setProperty("--glow-o", state.glow.toFixed(3));

    if (state.beam > 0.004 && target && eyeEls.length === 2) {
      const [l, r] = eyeCenters();
      const spread = Math.hypot(
        target.x - (l.x + r.x) / 2,
        target.y - (l.y + r.y) / 2,
      );
      const half1 = clamp(spread * 0.075, 14, 70);
      setBeam(
        polygonsL,
        gradientL,
        l.x,
        l.y,
        target.x,
        target.y,
        l.size * 0.36,
        half1,
      );
      setBeam(
        polygonsR,
        gradientR,
        r.x,
        r.y,
        target.x,
        target.y,
        r.size * 0.36,
        half1,
      );
      spot.setAttribute("cx", target.x.toFixed(1));
      spot.setAttribute("cy", target.y.toFixed(1));
      const pad = Math.max(half1, 64) + 24;
      const x0 = Math.min(l.x, r.x, target.x) - pad;
      const y0 = Math.min(l.y, r.y, target.y) - pad;
      soften.setAttribute("x", x0.toFixed(0));
      soften.setAttribute("y", y0.toFixed(0));
      soften.setAttribute(
        "width",
        (Math.max(l.x, r.x, target.x) + pad - x0).toFixed(0),
      );
      soften.setAttribute(
        "height",
        (Math.max(l.y, r.y, target.y) + pad - y0).toFixed(0),
      );
      beamGroup.setAttribute("opacity", state.beam.toFixed(3));
    } else {
      beamGroup.setAttribute("opacity", "0");
    }

    const settled =
      Math.abs(goalYaw - state.yaw) < 0.02 &&
      Math.abs(goalPitch - state.pitch) < 0.02 &&
      Math.abs(ex - state.ex) < 0.02 &&
      Math.abs(ey - state.ey) < 0.02 &&
      Math.abs(beamGoal - state.beam) < 0.003 &&
      Math.abs(lidGoal - state.lid) < 0.003;
    if (settled) {
      running = false;
      last = 0;
      return;
    }
    frameId = requestAnimationFrame(frame);
  }

  function kick() {
    if (!running && !disposed) {
      running = true;
      frameId = requestAnimationFrame(frame);
    }
  }

  function syncEyes() {
    const closed = isPasswordControl(document.activeElement);
    if (closed !== want.eyesClosed) onEyesClosedChange(closed);
    want.eyesClosed = closed;
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    if (
      want.field &&
      want.field === document.activeElement &&
      event.movementX === 0 &&
      event.movementY === 0
    )
      return;
    want.mode = want.eyesClosed ? "away" : "pointer";
    want.x = event.clientX;
    want.y = event.clientY;
    clearTimeout(restTimer);
    kick();
  }

  function onPointerLeave() {
    clearTimeout(restTimer);
    restTimer = window.setTimeout(() => {
      if (want.mode === "pointer") {
        want.mode = "rest";
        kick();
      }
    }, 500);
  }

  function onFocusIn(event: FocusEvent) {
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || el.closest("[data-honeypot]"))
      return;
    want.field = el;
    syncEyes();
    want.mode = want.eyesClosed ? "away" : "field";
    kick();
  }

  function onFocusOut() {
    clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.closest("form")) return;
      if (isPasswordControl(el)) return;
      want.field = null;
      syncEyes();
      if (want.mode === "field" || want.mode === "away") {
        want.mode = finePointer.matches && want.x ? "pointer" : "rest";
      }
      kick();
    }, 0);
  }

  function onInput(event: Event) {
    if (event.target === want.field && !want.eyesClosed) {
      want.mode = "field";
      kick();
    }
  }

  function onResize() {
    layout();
    kick();
  }

  function onScroll() {
    if (state.beam > 0.004) kick();
  }

  function scheduleBlink() {
    blinkTimer = window.setTimeout(
      () => {
        if (
          !reduceMotion.matches &&
          !want.eyesClosed &&
          document.visibilityState === "visible"
        ) {
          want.blinking = true;
          kick();
          blinkEndTimer = window.setTimeout(() => {
            want.blinking = false;
            kick();
          }, 120);
        }
        scheduleBlink();
      },
      2800 + Math.random() * 4200,
    );
  }

  const root = document.documentElement;
  const scene = stage.querySelector("img");
  const resizeObserver = new ResizeObserver(onResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  root.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("input", onInput);
  resizeObserver.observe(stage);
  window.addEventListener("scroll", onScroll, { passive: true });
  reduceMotion.addEventListener("change", kick);
  if (scene && !scene.complete) scene.addEventListener("load", layout);

  layout();
  scheduleBlink();
  kick();

  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    clearTimeout(restTimer);
    clearTimeout(focusTimer);
    clearTimeout(blinkTimer);
    clearTimeout(blinkEndTimer);
    window.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerleave", onPointerLeave);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("input", onInput);
    resizeObserver.disconnect();
    window.removeEventListener("scroll", onScroll);
    reduceMotion.removeEventListener("change", kick);
    scene?.removeEventListener("load", layout);
  };
}

/**
 * Drives the login mascot: turns the monitor head toward the mouse or the field being typed in,
 * shifts and blinks the eyes, closes them while a password control has focus, and draws the eye
 * beams. Updates the DOM directly on animation frames and stops once everything has settled.
 *
 * @param onEyesClosedChange Called when the eyes close for a password control or open again.
 * @returns Refs to attach to the stage, head anchor, head, front face, eyes, and beams elements.
 */
export function useMascotMotion(
  onEyesClosedChange?: (closed: boolean) => void,
) {
  const stageRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const beamsRef = useRef<SVGSVGElement>(null);
  const eyesCallback = useRef(onEyesClosedChange);

  useEffect(() => {
    eyesCallback.current = onEyesClosedChange;
  }, [onEyesClosedChange]);

  useEffect(() => {
    const stage = stageRef.current;
    const anchor = anchorRef.current;
    const head = headRef.current;
    const front = frontRef.current;
    const eyes = eyesRef.current;
    const beams = beamsRef.current;
    if (!stage || !anchor || !head || !front || !eyes || !beams)
      return undefined;
    return startMascot({ stage, anchor, head, front, eyes, beams }, (closed) =>
      eyesCallback.current?.(closed),
    );
  }, []);

  return { stageRef, anchorRef, headRef, frontRef, eyesRef, beamsRef };
}
