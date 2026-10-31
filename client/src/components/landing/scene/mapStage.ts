import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  Line,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { PALETTE, seededRandom } from "./palette.ts";
import { createLabel } from "./textures.ts";
import type { Stage } from "./stage.ts";

const WIDTH = 26;
const DEPTH = 16;

/** The map's ground, a flat WIDTH by DEPTH board centred on the stage's origin. */
export const MAP_GROUND = { width: WIDTH, depth: DEPTH } as const;
const SHORE_Z = 4.6;
const SEARCH_RADIUS = 4.6;
const YOU = new Vector3(0.6, 0, 1.0);

/** Gym pins: the first three are inside the search radius and get a distance chip. */
const PINS: { x: number; z: number; label?: string }[] = [
  { x: 2.6, z: -0.8, label: "1.2 km" },
  { x: -2.3, z: 2.4, label: "2.8 km" },
  { x: 3.8, z: 3.0, label: "4.1 km" },
  { x: -5.6, z: -3.0 },
  { x: 7.4, z: -2.2 },
  { x: -8.6, z: 1.2 },
  { x: 5.6, z: -5.4 },
];

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

function shoreline(): Shape {
  const shape = new Shape();
  shape.moveTo(-WIDTH / 2, -SHORE_Z);
  for (let x = -WIDTH / 2; x <= WIDTH / 2; x += 0.5) {
    const wobble = Math.sin(x * 0.45) * 0.35 + Math.sin(x * 1.3 + 1) * 0.12;
    shape.lineTo(x, -SHORE_Z - wobble);
  }
  shape.lineTo(WIDTH / 2, -DEPTH / 2);
  shape.lineTo(-WIDTH / 2, -DEPTH / 2);
  shape.closePath();
  return shape;
}

/**
 * The discovery stage: a dark map of the city above the lake, with gym pins dropping in, a
 * search radius around the visitor, distance chips on the closest gyms, and a route drawn to the
 * nearest one.
 */
export function createMapStage(options: { light: boolean }): Stage {
  const group = new Group();
  const random = seededRandom(11);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const ground = new Mesh(
    keep(new PlaneGeometry(WIDTH, DEPTH)),
    keep(new MeshStandardMaterial({ color: PALETTE.bark, roughness: 1 })),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const lake = new Mesh(
    keep(new ShapeGeometry(shoreline(), 4)),
    keep(new MeshStandardMaterial({ color: 0x2b3346, roughness: 0.32, metalness: 0.1, emissive: 0x0d1220 })),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.y = 0.012;
  group.add(lake);

  const shorePoints = shoreline()
    .getPoints(4)
    .filter((point) => point.y > -SHORE_Z - 0.6)
    .map((point) => new Vector3(point.x, 0.03, -point.y));
  const shoreGeometry = keep(new BufferGeometry().setFromPoints(shorePoints));
  group.add(
    new Line(shoreGeometry, keep(new LineBasicMaterial({ color: PALETTE.orange, transparent: true, opacity: 0.55 }))),
  );

  const streetPoints: number[] = [];
  for (let x = -WIDTH / 2 + 1; x < WIDTH / 2; x += 1) {
    streetPoints.push(x, 0.02, -DEPTH / 2, x, 0.02, SHORE_Z);
  }
  for (let z = -DEPTH / 2 + 1; z < SHORE_Z; z += 1) {
    streetPoints.push(-WIDTH / 2, 0.02, z, WIDTH / 2, 0.02, z);
  }
  const streetGeometry = keep(new BufferGeometry());
  streetGeometry.setAttribute("position", new Float32BufferAttribute(streetPoints, 3));
  group.add(
    new LineSegments(
      streetGeometry,
      keep(new LineBasicMaterial({ color: PALETTE.tan, transparent: true, opacity: 0.22 })),
    ),
  );

  const avenueMaterial = keep(new MeshBasicMaterial({ color: PALETTE.orange, transparent: true, opacity: 0.32 }));
  const avenueX = keep(new BoxGeometry(0.08, 0.01, SHORE_Z + DEPTH / 2));
  const avenueZ = keep(new BoxGeometry(WIDTH, 0.01, 0.08));
  for (const x of [-8, -3, 3, 8]) {
    const avenue = new Mesh(avenueX, avenueMaterial);
    avenue.position.set(x + 0.5, 0.03, (SHORE_Z - DEPTH / 2) / 2);
    group.add(avenue);
  }
  for (const z of [-5, 0, 3]) {
    const avenue = new Mesh(avenueZ, avenueMaterial);
    avenue.position.set(0, 0.03, z + 0.5);
    group.add(avenue);
  }

  const blocks: { x: number; z: number }[] = [];
  for (let x = -WIDTH / 2 + 1; x < WIDTH / 2 - 1; x += 1) {
    for (let z = -DEPTH / 2 + 1; z < SHORE_Z - 1; z += 1) {
      const nearPin = PINS.some((pin) => Math.hypot(pin.x - x - 0.5, pin.z - z - 0.5) < 0.9);
      const nearYou = Math.hypot(YOU.x - x - 0.5, YOU.z - z - 0.5) < 0.9;
      if (!nearPin && !nearYou && random() < (options.light ? 0.4 : 0.75)) blocks.push({ x, z });
    }
  }
  // About one building in eight has its lights on, drawn as a second set that glows.
  const lit = blocks.filter(() => random() < 0.12);
  const dark = blocks.filter((block) => !lit.includes(block));
  const box = keep(new BoxGeometry(1, 1, 1));
  const matrix = new Matrix4();
  const tint = new Color();
  const placeBuildings = (set: { x: number; z: number }[], material: MeshStandardMaterial, color: number) => {
    const buildings = new InstancedMesh(box, keep(material), set.length);
    set.forEach((block, index) => {
      const height = 0.06 + random() ** 2.2 * 0.75;
      const size = 0.55 + random() * 0.25;
      matrix.makeScale(size, height, size);
      matrix.setPosition(block.x + 0.5, height / 2, block.z + 0.5);
      buildings.setMatrixAt(index, matrix);
      tint.setHex(color).multiplyScalar(0.6 + random() * 0.4);
      buildings.setColorAt(index, tint);
    });
    group.add(buildings);
  };
  placeBuildings(dark, new MeshStandardMaterial({ roughness: 0.9 }), PALETTE.soil);
  placeBuildings(lit, new MeshStandardMaterial({ roughness: 0.7, emissive: PALETTE.orange, emissiveIntensity: 0.28 }), PALETTE.tan);

  const radiusPoints: number[] = [];
  for (let i = 0; i < 128; i++) {
    const angle = (i / 128) * Math.PI * 2;
    radiusPoints.push(YOU.x + Math.cos(angle) * SEARCH_RADIUS, 0.05, YOU.z + Math.sin(angle) * SEARCH_RADIUS);
  }
  const radiusGeometry = keep(new BufferGeometry());
  radiusGeometry.setAttribute("position", new Float32BufferAttribute(radiusPoints, 3));
  const radiusMaterial = keep(
    new LineDashedMaterial({ color: PALETTE.cream, dashSize: 0.28, gapSize: 0.18, transparent: true, opacity: 0 }),
  );
  const radiusLine = new LineLoop(radiusGeometry, radiusMaterial);
  radiusLine.computeLineDistances();
  group.add(radiusLine);

  const you = new Group();
  you.position.copy(YOU);
  group.add(you);
  you.add(
    new Mesh(
      keep(new CylinderGeometry(0.2, 0.2, 0.08, 32)),
      keep(new MeshStandardMaterial({ color: PALETTE.cream, emissive: PALETTE.cream, emissiveIntensity: 0.4 })),
    ),
  );
  const pulseGeometry = keep(new RingGeometry(0.85, 1, 64));
  const pulses = [0, 0.5].map((offset) => {
    const material = keep(
      new MeshBasicMaterial({
        color: PALETTE.cream,
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    const ring = new Mesh(pulseGeometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    you.add(ring);
    return { ring, material, offset };
  });

  const pinBody = keep(new ConeGeometry(0.24, 0.75, 24));
  const pinHead = keep(new SphereGeometry(0.26, 24, 16));
  const pinDot = keep(new SphereGeometry(0.1, 16, 12));
  const glowRing = keep(new RingGeometry(0.18, 0.36, 40));
  const dotMaterial = keep(new MeshStandardMaterial({ color: PALETTE.night, roughness: 0.4 }));
  const pins = PINS.map((spot, index) => {
    const color = index < 3 ? PALETTE.ember : PALETTE.orange;
    const material = keep(new MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.25 }));
    const pin = new Group();
    const body = new Mesh(pinBody, material);
    body.rotation.x = Math.PI;
    body.position.y = 0.38;
    const head = new Mesh(pinHead, material);
    head.position.y = 0.86;
    const dot = new Mesh(pinDot, dotMaterial);
    dot.position.set(0, 0.88, 0.2);
    pin.add(body, head, dot);
    pin.position.set(spot.x, 0, spot.z);
    group.add(pin);

    const glowMaterial = keep(
      new MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    );
    const glow = new Mesh(glowRing, glowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(spot.x, 0.05, spot.z);
    group.add(glow);

    const label = spot.label ? createLabel(spot.label, { height: 0.36 }) : null;
    if (label) {
      label.position.set(spot.x, 1.65, spot.z);
      label.material.opacity = 0;
      keep(label.material);
      if (label.material.map) keep(label.material.map);
      group.add(label);
    }
    return { pin, glowMaterial, label, delay: index * 0.09 };
  });

  const nearest = PINS[0];
  const routeCurve = new CatmullRomCurve3(
    [
      new Vector3(YOU.x, 0.08, YOU.z),
      new Vector3(YOU.x, 0.08, 0.5),
      new Vector3(1.4, 0.08, 0.5),
      new Vector3(nearest.x, 0.08, 0.5),
      new Vector3(nearest.x, 0.08, nearest.z),
    ],
    false,
    "catmullrom",
    0.05,
  );
  const routeGeometry = keep(new TubeGeometry(routeCurve, 120, 0.05, 8, false));
  const routeIndexCount = routeGeometry.index ? routeGeometry.index.count : 0;
  routeGeometry.setDrawRange(0, 0);
  group.add(
    new Mesh(routeGeometry, keep(new MeshBasicMaterial({ color: PALETTE.ember, toneMapped: false }))),
  );

  let reveal = 0;

  return {
    group,
    update(presence, time, dt, still) {
      const target = presence > 0.35 ? 1 : 0;
      reveal = still ? target : reveal + (target - reveal) * Math.min(1, dt * 1.6);
      pins.forEach(({ pin, glowMaterial, label, delay }) => {
        const t = Math.min(1, Math.max(0, (reveal * 1.5 - delay) / 0.6));
        const settle = still ? t : easeOutBack(t);
        pin.position.y = (1 - settle) * 4;
        pin.scale.setScalar(Math.max(0.001, Math.min(1, t * 1.4)));
        pin.rotation.y = still ? 0 : Math.sin(time * 0.8 + delay * 10) * 0.25;
        glowMaterial.opacity = t * (0.55 + (still ? 0 : Math.sin(time * 2.2 + delay * 7) * 0.2));
        if (label) {
          label.material.opacity = Math.max(0, (t - 0.6) / 0.4);
          label.position.y = 1.65 + (still ? 0 : Math.sin(time * 1.3 + delay * 9) * 0.06);
        }
      });
      radiusMaterial.opacity = reveal * 0.45;
      routeGeometry.setDrawRange(0, Math.floor(routeIndexCount * Math.max(0, (reveal - 0.45) / 0.55)));
      pulses.forEach(({ ring, material, offset }) => {
        const cycle = still ? 0.6 : (time * 0.45 + offset) % 1;
        ring.scale.setScalar(0.2 + cycle * SEARCH_RADIUS);
        material.opacity = reveal * (1 - cycle) * 0.5;
      });
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
