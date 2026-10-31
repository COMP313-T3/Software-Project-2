import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { holdEase, samplePath, stagePresence, type Vec3 } from "../cameraPath.ts";
import { smoothstep } from "../heroTimeline.ts";
import { mapOutline } from "../mapOutline.ts";
import { createGymStage } from "./gymStage.ts";
import { MAP_GROUND, createMapStage } from "./mapStage.ts";
import { createPodiumStage } from "./podiumStage.ts";
import { createGlowTexture } from "./textures.ts";
import { createTopoHead } from "./topoHead.ts";
import { createWallStage } from "./wallStage.ts";
import type { Stage } from "./stage.ts";

/** Where each stage sits. The camera travels down and away through them as the page scrolls. */
const STAGE_ORIGINS: Vec3[] = [
  [0, 0, 0],
  [0, -14, -22],
  [0, -28, -44],
  [0, -42, -66],
  [0, -56, -88],
];

/** Corners in the order the hero's frame lies down onto them: far left, far right, near right, near left. */
const CORNER_SIGNS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

const FOG_SUNSET = new Color(0x7a2a0b);
const FOG_NIGHT = new Color(0x2a1207);

/** Phones held upright get a wider lens, so a stage fits above the text without the camera backing far off. */
const FOV_WIDE = 38;
const FOV_TALL = 50;

/** One camera shot of the journey, and where Topo's head floats during it. */
interface ShotPlan {
  /** Which stage's origin the shot's positions are measured from. */
  origin: number;
  /** The point the shot is built around. */
  focus: Vec3;
  /** How far around the focus has to fit in the shot. */
  radius: number;
  /** The camera's direction around the focus, in radians. 0 looks straight on from the front. */
  yaw: number;
  /** How far the camera looks down at the focus, in radians. */
  pitch: number;
  /** Where the focus sits on a wide screen: -1 in the left half, 1 in the right half, 0 centered. */
  side: -1 | 0 | 1;
  /** How far above the middle of the screen the focus sits, as a share of half the screen's height. */
  lift: number;
  /**
   * The lift on a tall phone screen, where the section text sits along the bottom. Shots with
   * text over them rise into the top half unless this says otherwise.
   */
  tallLift?: number;
  /**
   * Whether the whole radius has to fit across the screen too, not only up and down. A shot that
   * leaves it out may run past the sides of a narrow screen.
   */
  fitAcross?: boolean;
  /** Where Topo's head floats, measured from the stage's origin, and its size. */
  head: Vec3;
  headScale: number;
}

/**
 * The shots, one per journey step: high over the city while the hero hands off, then each stage
 * framed on the side of the screen opposite its section's text, and last, Topo face to face.
 */
const SHOTS: ShotPlan[] = [
  // The hero's video frame lies down onto the map's ground in this shot. On a phone the ground
  // runs past the sides of the screen, so the frame tips back like a floor instead of shrinking
  // into a thin strip.
  { origin: 0, focus: [0.6, 0, 0.6], radius: 9.5, yaw: 0, pitch: 1.12, side: 0, lift: 0, tallLift: 0, fitAcross: false, head: [0.6, 7.5, 5.5], headScale: 0.5 },
  { origin: 0, focus: [1, 0.3, 1.2], radius: 5.6, yaw: -0.36, pitch: 0.8, side: 1, lift: 0.04, head: [5.2, 2.5, 2.6], headScale: 0.58 },
  { origin: 1, focus: [0, 0.4, 0.8], radius: 6.2, yaw: 0.3, pitch: 0.08, side: -1, lift: 0, head: [5.6, -3.7, 3.2], headScale: 0.6 },
  { origin: 2, focus: [0, 0.1, 0], radius: 4.1, yaw: -0.16, pitch: 0.06, side: 1, lift: 0, head: [0, 0, -0.4], headScale: 0.78 },
  { origin: 3, focus: [0, 1.3, -0.2], radius: 4.1, yaw: 0.46, pitch: 0.3, side: -1, lift: 0, head: [-3.3, 3.1, 0.6], headScale: 0.55 },
  { origin: 4, focus: [0, 0, 0], radius: 2.1, yaw: 0, pitch: 0.05, side: 0, lift: 0.34, head: [0, 0, 0], headScale: 1 },
];

export interface LandingSceneOptions {
  /** Reads the current journey value from the page's scroll position. See journeyAt. */
  getJourney: () => number;
  /** Turns off idle movement and moves the camera straight to each stage. */
  reducedMotion: boolean;
  /** Draws fewer buildings at a lower resolution, for phones. */
  light: boolean;
  /** Called once the first frame is on screen. */
  onReady: () => void;
}

interface Framing {
  fov: number;
  cameras: Vec3[];
  targets: Vec3[];
  distances: Vec3[];
  heads: Vec3[];
  headScales: Vec3[];
}

/**
 * Turns the shot plans into camera keyframes for a screen shape.
 *
 * Each camera stands back far enough for the shot's radius to fit in the space it has: half the
 * screen's width on a wide screen, where the text takes the other half, or the top half on a tall
 * phone screen, where the text sits along the bottom. Then the camera slides sideways and up or
 * down without turning, which moves the focus into that space.
 */
function framingFor(aspect: number): Framing {
  const tall = aspect < 0.85;
  const fov = tall ? FOV_TALL : FOV_WIDE;
  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * aspect;
  const up = new Vector3(0, 1, 0);
  const framing: Framing = { fov, cameras: [], targets: [], distances: [], heads: [], headScales: [] };

  for (const shot of SHOTS) {
    const side = tall ? 0 : shot.side;
    const lift = tall ? (shot.tallLift ?? Math.max(shot.lift, 0.55)) : shot.lift;
    const across = side === 0 ? tanH : tanH / 2;
    const upDown = tanV * (1 - Math.abs(lift));
    const room = shot.fitAcross === false ? upDown : Math.min(across, upDown);
    const distance = (shot.radius / room) * 1.06;

    const origin = new Vector3(...STAGE_ORIGINS[shot.origin]);
    const focus = new Vector3(...shot.focus).add(origin);
    const back = new Vector3(
      Math.sin(shot.yaw) * Math.cos(shot.pitch),
      Math.sin(shot.pitch),
      Math.cos(shot.yaw) * Math.cos(shot.pitch),
    );
    const right = new Vector3().crossVectors(back.clone().negate(), up).normalize();
    const cameraUp = new Vector3().crossVectors(right, back.clone().negate()).normalize();
    const slide = right
      .multiplyScalar(side * (tanH / 2) * distance)
      .add(cameraUp.multiplyScalar(lift * tanV * distance));
    const target = focus.clone().sub(slide);
    const camera = target.clone().addScaledVector(back, distance);

    framing.cameras.push([camera.x, camera.y, camera.z]);
    framing.targets.push([target.x, target.y, target.z]);
    framing.distances.push([distance, 0, 0]);
    const head = new Vector3(...shot.head).add(origin);
    framing.heads.push([head.x, head.y, head.z]);
    framing.headScales.push([shot.headScale, 0, 0]);
  }
  return framing;
}

/**
 * Starts the 3D scene behind the sections below the hero: a map of gym pins, a climbing wall
 * with scored routes, the gym dashboard cards, and a podium with live score bars, with Topo's
 * head guiding the way and watching the pointer at the end.
 *
 * @param canvas The canvas to draw in. It's sized by CSS.
 * @returns A function that stops the scene and frees its GPU resources.
 * @throws When the browser can't create a WebGL context.
 */
export function startLandingScene(canvas: HTMLCanvasElement, options: LandingSceneOptions): () => void {
  const { getJourney, reducedMotion, light, onReady } = options;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: !light,
    powerPreference: light ? "low-power" : "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, light ? 1.25 : 1.75));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const fog = new Fog(FOG_NIGHT.getHex(), 14, 48);
  scene.fog = fog;
  // The background is the fog's own color, so far-off pieces of each stage melt into it.
  scene.background = fog.color;
  const camera = new PerspectiveCamera(FOV_WIDE, 1, 0.1, 220);

  scene.add(new HemisphereLight(0xffb070, 0x1e0b03, 1.15));
  const sun = new DirectionalLight(0xffd2a0, 2.3);
  sun.position.set(6, 12, 9);
  scene.add(sun);
  const rim = new DirectionalLight(0xf58010, 1.3);
  rim.position.set(-6, 4, -10);
  scene.add(rim);

  const stages: Stage[] = [
    createMapStage({ light }),
    createWallStage(),
    createGymStage(),
    createPodiumStage(),
  ];
  stages.forEach((stage, index) => {
    stage.group.position.set(...STAGE_ORIGINS[index]);
    scene.add(stage.group);
  });

  // A warm glow behind each stage lifts it off the dark background, like a spotlight.
  const glowTexture = createGlowTexture();
  const glows = stages.map((_, index) => {
    const shot = SHOTS[index + 1];
    const material = new SpriteMaterial({
      map: glowTexture,
      color: 0xff8a3d,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0,
    });
    const glow = new Sprite(material);
    const origin = STAGE_ORIGINS[index];
    glow.position.set(origin[0] + shot.focus[0], origin[1] + shot.focus[1] - 1, origin[2] + shot.focus[2] - 9);
    glow.scale.setScalar(shot.radius * 5.5);
    glow.renderOrder = -1;
    scene.add(glow);
    return { glow, material };
  });

  const head = createTopoHead();
  scene.add(head.group);

  let framing = framingFor(1.6);
  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    framing = framingFor(camera.aspect);
    camera.fov = framing.fov;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  window.addEventListener("resize", resize);

  const pointer = { x: 0, y: 0 };
  const onPointer = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const target = new Vector3();
  const headSpot = new Vector3();
  const corner = new Vector3();

  // Tells the hero where the map's ground is on screen, so it can lay its video frame onto it.
  // A wide screen's frame covers the whole ground, edge to edge. An upright phone's frame would
  // be stretched far too wide that way, so it lies on a strip down the middle of the ground
  // with the screen's own proportions, front to back.
  const publishGround = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const aspect = width / height;
    const halfWidth = aspect < 1 ? (MAP_GROUND.depth * aspect) / 2 : MAP_GROUND.width / 2;
    const halfDepth = MAP_GROUND.depth / 2;
    camera.updateMatrixWorld();
    const quad: [number, number][] = [];
    for (const [x, z] of CORNER_SIGNS) {
      corner.set(x * halfWidth, 0, z * halfDepth).project(camera);
      if (corner.z < -1 || corner.z > 1) {
        mapOutline.publish(null);
        return;
      }
      quad.push([((corner.x + 1) / 2) * width, ((1 - corner.y) / 2) * height]);
    }
    mapOutline.publish(quad);
  };
  let journey = getJourney();
  let last = performance.now();
  let time = 0;
  let frame = 0;
  let ready = false;

  const render = (now: number) => {
    frame = requestAnimationFrame(render);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    time += dt;

    const wanted = getJourney();
    // The camera eases toward the scroll position, so a flick of the wheel or a swipe glides
    // to a stop instead of jumping.
    journey = reducedMotion ? Math.round(wanted) : journey + (wanted - journey) * (1 - Math.exp(-dt / 0.22));
    // Still in the hero video, where the scene is hidden under it: skip drawing until just
    // before the hand-off, so the video has the graphics card to itself while it's scrubbed.
    if (journey < -1.15 && ready) return;

    const position = samplePath(framing.cameras, journey);
    const look = samplePath(framing.targets, journey);
    const distance = samplePath(framing.distances, journey)[0];
    const sway = reducedMotion ? 0 : distance * 0.012;
    camera.position.set(position[0] + pointer.x * sway, position[1] + pointer.y * sway * 0.6, position[2]);
    target.set(...look);
    camera.lookAt(target);
    if (journey < 0.5) publishGround();
    else mapOutline.publish(null);

    // Fog starts just past the stage in view and closes in behind it, however far back the
    // camera stands.
    fog.near = distance * 0.85;
    fog.far = distance * 2.6;
    fog.color.copy(FOG_SUNSET).lerp(FOG_NIGHT, smoothstep(-1, -0.15, journey));

    stages.forEach((stage, index) => {
      const presence = stagePresence(index, journey);
      stage.group.visible = Math.abs(journey - index) < 0.95;
      if (stage.group.visible) stage.update(presence, time, dt, reducedMotion);
      glows[index].material.opacity = presence * 0.32;
    });

    const spot = samplePath(framing.heads, journey);
    const scale = samplePath(framing.headScales, journey)[0];
    headSpot.set(...spot);
    head.group.position.copy(headSpot);
    head.group.position.y += reducedMotion ? 0 : Math.sin(time * 1.2) * 0.08;
    head.group.scale.setScalar(scale);
    const faceYaw = Math.atan2(camera.position.x - headSpot.x, camera.position.z - headSpot.z);
    const facePitch = -Math.atan2(camera.position.y - headSpot.y, Math.hypot(camera.position.x - headSpot.x, camera.position.z - headSpot.z)) * 0.6;
    const travel = journey - Math.floor(journey);
    // While moving between stages Topo's head turns a full circle, landing facing the camera.
    const spin = reducedMotion ? 0 : holdEase(travel, 0.2) * Math.PI * 2;
    const idle = reducedMotion ? 0 : Math.sin(time * 0.7) * 0.12;
    head.group.rotation.set(-facePitch, faceYaw + spin + idle, 0);
    const watching = journey > 3.5;
    head.setGaze(watching ? pointer.x : Math.sin(time * 0.5) * 0.4, watching ? pointer.y : -0.2);
    head.update(time, reducedMotion);

    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      onReady();
    }
  };
  frame = requestAnimationFrame(render);

  return () => {
    cancelAnimationFrame(frame);
    mapOutline.publish(null);
    observer?.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointer);
    for (const stage of stages) stage.dispose();
    for (const { material } of glows) material.dispose();
    glowTexture.dispose();
    head.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
