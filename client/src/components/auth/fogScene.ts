import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  DataTexture,
  GLSL3,
  LinearFilter,
  Mesh,
  NoBlending,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  Vector2,
  WebGLRenderer,
} from "three";
import { FOG_FRAGMENT_SHADER, FOG_VERTEX_SHADER } from "./fogShader.ts";
import {
  createFogSweep,
  createPointerTrail,
  PUSH_RANGE,
  type FogSweep,
  type PointerSample,
} from "./fogSweep.ts";

const RENDER_SCALE = 0.5;
const START_TIME = 40;
const STIRRED_FRAME_MS = 1000 / 60;
const IDLE_FRAME_MS = 1000 / 30;
const FRAME_SLACK_MS = 2;
const LONGEST_FRAME = 0.05;

/**
 * Draws the login fog in a canvas with three.js and keeps it drifting. Moving the mouse through
 * it, or a finger on a touch screen, pushes it aside and sweeps it away for a few seconds. The
 * fog is soft, so it's drawn at half the canvas's CSS size and scaled up. It redraws at most 60
 * times a second while swept fog is settling, and 30 times otherwise. With reduced motion it's
 * drawn once and stays still, with no sweeping.
 *
 * @param canvas A new canvas to draw in, sized by CSS. It can't be drawn in again once stopped.
 * @param onShown Called once, after the first frame is drawn.
 * @returns A function that stops the fog and gives its WebGL context back to the browser.
 * @throws When the browser can't create a WebGL 2 context.
 */
export function startFog(
  canvas: HTMLCanvasElement,
  onShown: () => void,
): () => void {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(RENDER_SCALE);

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const uniforms = {
    uSize: { value: new Vector2(1, 1) },
    uPixelRatio: { value: RENDER_SCALE },
    uTime: { value: START_TIME },
    uSweep: { value: null as DataTexture | null },
    uPushRange: { value: PUSH_RANGE },
  };
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: FOG_VERTEX_SHADER,
    fragmentShader: FOG_FRAGMENT_SHADER,
    uniforms,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const camera = new Camera();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const trail = createPointerTrail();
  let sweep: FogSweep | null = null;
  let sweepTexture: DataTexture | null = null;
  let sweepBytes = new Uint8Array(0);
  let width = 0;
  let height = 0;
  let sizeChanged = true;
  let ready = false;
  let stopped = false;
  let shown = false;
  let fogTime = START_TIME;
  let previousFrame = 0;
  let lastDrawn = 0;

  function fitToCanvas(): boolean {
    if (!sizeChanged) return width > 0 && height > 0;
    sizeChanged = false;
    const nextWidth = canvas.clientWidth;
    const nextHeight = canvas.clientHeight;
    if (nextWidth === 0 || nextHeight === 0) return false;
    if (nextWidth === width && nextHeight === height) return true;
    width = nextWidth;
    height = nextHeight;
    renderer.setSize(width, height, false);
    uniforms.uSize.value.set(width, height);
    sweep = createFogSweep(width, height);
    sweepBytes = new Uint8Array(sweep.columns * sweep.rows * 4);
    sweep.write(sweepBytes);
    sweepTexture?.dispose();
    sweepTexture = new DataTexture(
      sweepBytes,
      sweep.columns,
      sweep.rows,
      RGBAFormat,
      UnsignedByteType,
    );
    sweepTexture.magFilter = LinearFilter;
    sweepTexture.minFilter = LinearFilter;
    sweepTexture.needsUpdate = true;
    uniforms.uSweep.value = sweepTexture;
    return true;
  }

  function draw(now: number) {
    uniforms.uTime.value = fogTime;
    renderer.render(scene, camera);
    lastDrawn = now;
    if (!shown) {
      shown = true;
      onShown();
    }
  }

  function applySamples() {
    const strokes = trail.take();
    if (strokes.length === 0 || !sweep) return;
    const band = canvas.getBoundingClientRect();
    const inBand = (sample: PointerSample) => ({
      x: sample.clientX - band.left,
      y: band.bottom - sample.clientY,
    });
    for (const [from, to] of strokes) {
      sweep.stroke(inBand(from), inBand(to), (to.time - from.time) / 1000);
    }
  }

  function frame(now: number) {
    const seconds = previousFrame
      ? Math.min((now - previousFrame) / 1000, LONGEST_FRAME)
      : 0;
    previousFrame = now;
    fogTime += seconds;
    const resized = sizeChanged;
    if (!fitToCanvas() || !sweep || !sweepTexture) return;
    applySamples();
    const stirring = sweep.isActive();
    sweep.step(seconds);
    if (stirring) {
      sweep.write(sweepBytes);
      sweepTexture.needsUpdate = true;
    }
    // Frame times are rounded, so without some slack a 30 fps cap would draw every third frame.
    const gap = stirring ? STIRRED_FRAME_MS : IDLE_FRAME_MS;
    if (!resized && now - lastDrawn < gap - FRAME_SLACK_MS) return;
    draw(now);
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    trail.add({
      clientX: event.clientX,
      clientY: event.clientY,
      time: event.timeStamp,
    });
  }

  function onTouch(event: TouchEvent) {
    if (event.type === "touchstart") liftPointer();
    const touch = event.touches[0];
    if (touch) {
      trail.add({
        clientX: touch.clientX,
        clientY: touch.clientY,
        time: event.timeStamp,
      });
    }
  }

  function liftPointer() {
    applySamples();
    trail.lift();
  }

  // Touch pointers fire pointerout as soon as the browser takes over the gesture, mid-swipe.
  function onPointerOut(event: PointerEvent) {
    if (event.pointerType !== "touch" && !event.relatedTarget) liftPointer();
  }

  function onContextRestored() {
    if (ready && !stopped && reduceMotion.matches) drawStill();
  }

  const listeners: [string, EventListener][] = [
    ["pointermove", onPointerMove as EventListener],
    ["pointerout", onPointerOut as EventListener],
    ["touchstart", onTouch as EventListener],
    ["touchmove", onTouch as EventListener],
    ["touchend", liftPointer],
    ["touchcancel", liftPointer],
    ["blur", liftPointer],
  ];

  function listen(on: boolean) {
    for (const [type, listener] of listeners) {
      if (on) window.addEventListener(type, listener, { passive: true });
      else window.removeEventListener(type, listener);
    }
  }

  function drawStill() {
    if (fitToCanvas()) draw(performance.now());
  }

  function applyMotionSetting() {
    if (!ready || stopped) return;
    if (reduceMotion.matches) {
      renderer.setAnimationLoop(null);
      listen(false);
      trail.take();
      trail.lift();
      width = 0;
      sizeChanged = true;
      fogTime = START_TIME;
      drawStill();
    } else {
      previousFrame = 0;
      listen(true);
      renderer.setAnimationLoop(frame);
    }
  }

  const resizeObserver = new ResizeObserver(() => {
    sizeChanged = true;
    if (ready && reduceMotion.matches) drawStill();
  });
  resizeObserver.observe(canvas);
  reduceMotion.addEventListener("change", applyMotionSetting);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  fitToCanvas();
  // Without this extension compileAsync gains nothing and logs a warning.
  const compiled = renderer.extensions.has("KHR_parallel_shader_compile")
    ? renderer.compileAsync(scene, camera)
    : Promise.resolve();
  compiled
    .then(() => {
      ready = true;
      applyMotionSetting();
    })
    .catch(() => undefined);

  return () => {
    stopped = true;
    renderer.setAnimationLoop(null);
    listen(false);
    resizeObserver.disconnect();
    reduceMotion.removeEventListener("change", applyMotionSetting);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    sweepTexture?.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
