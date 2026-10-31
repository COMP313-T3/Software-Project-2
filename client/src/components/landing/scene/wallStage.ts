import {
  BoxGeometry,
  BufferAttribute,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
} from "three";
import { PALETTE, seededRandom } from "./palette.ts";
import { createLabel, createPlywoodTexture } from "./textures.ts";
import type { Stage } from "./stage.ts";

const WALL_WIDTH = 9;
const WALL_HEIGHT = 11;
const WALL_TILT = 0.26;

interface RouteDef {
  color: number;
  /** The tag's background, the route's colour as CSS. */
  tagColor: string;
  tag: string;
  holds: [number, number][];
}

/** Three routes up the wall, each with its own colour and point value, bottom hold first. */
const ROUTES: RouteDef[] = [
  {
    color: PALETTE.orange,
    tagColor: "#f58010",
    tag: "100 pts",
    holds: [[-2.9, -4.6], [-2.3, -3.4], [-3.2, -2.2], [-2.4, -0.9], [-2.9, 0.4], [-2.0, 1.7], [-2.7, 3.0], [-2.2, 4.3]],
  },
  {
    color: PALETTE.cream,
    tagColor: "#f1f1f5",
    tag: "250 pts",
    holds: [[0.1, -4.7], [0.8, -3.3], [-0.4, -2.0], [0.6, -0.6], [-0.2, 0.9], [0.9, 2.3], [0.2, 3.7]],
  },
  {
    color: PALETTE.ember,
    tagColor: "#eb5a14",
    tag: "400 pts",
    holds: [[2.6, -4.5], [3.3, -3.2], [2.3, -1.9], [3.4, -0.5], [2.4, 0.9], [3.5, 2.1], [2.6, 3.3], [3.2, 4.5]],
  },
];

/** A climbing hold: an icosahedron pushed in and out so each one looks hand-shaped. */
function holdGeometry(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const geometry = new IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute("position") as BufferAttribute;
  const bumps = [random() * 6, random() * 6, random() * 6];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = 1 + 0.18 * Math.sin(x * 3 + bumps[0]) * Math.cos(y * 3 + bumps[1]) + 0.1 * Math.sin(z * 4 + bumps[2]);
    // Flatten the back so the hold sits against the wall.
    position.setXYZ(i, x * n * 1.15, y * n, Math.max(z * n * 0.55, -0.1));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The routes stage: an overhanging plywood wall on a padded floor, with volumes and holds, three
 * colour-coded routes that light up hold by hold from the start to the top, and point tags.
 */
export function createWallStage(): Stage {
  const group = new Group();
  const random = seededRandom(23);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const wall = new Group();
  wall.rotation.x = WALL_TILT;
  group.add(wall);

  const plywood = keep(createPlywoodTexture());
  plywood.repeat.set(2.2, 2.6);
  const face = keep(new MeshStandardMaterial({ map: plywood, roughness: 0.85 }));
  const edge = keep(new MeshStandardMaterial({ color: 0x7a5432, roughness: 0.9 }));
  const panel = new Mesh(keep(new BoxGeometry(WALL_WIDTH, WALL_HEIGHT, 0.35)), [edge, edge, edge, edge, face, edge]);
  panel.position.z = -0.18;
  wall.add(panel);

  const floor = new Mesh(
    keep(new BoxGeometry(WALL_WIDTH + 3, 0.5, 6)),
    keep(new MeshStandardMaterial({ color: 0x1d1b26, roughness: 0.95 })),
  );
  floor.position.set(0, -WALL_HEIGHT / 2 - 0.1, 1.2);
  group.add(floor);

  const volumes: [number, number, number, number][] = [
    [-0.9, 2.6, 1.25, PALETTE.cream],
    [1.1, -2.6, 1.05, PALETTE.tan],
  ];
  for (const [x, y, size, color] of volumes) {
    const volume = new Mesh(
      keep(new ConeGeometry(size, size * 0.8, 3)),
      keep(new MeshStandardMaterial({ color, roughness: 0.7 })),
    );
    volume.rotation.x = Math.PI / 2;
    volume.position.set(x, y, size * 0.38);
    wall.add(volume);
  }

  const shapes = [101, 202, 303, 404, 505, 606].map((seed) => keep(holdGeometry(seed)));
  const holds: { mesh: Mesh; route: number; step: number; size: number; material: MeshStandardMaterial }[] = [];

  ROUTES.forEach((route, routeIndex) => {
    route.holds.forEach(([x, y], step) => {
      // Each route hold has its own material, so the light can travel up the route hold by hold.
      const material = keep(
        new MeshStandardMaterial({ color: route.color, roughness: 0.55, emissive: route.color, emissiveIntensity: 0 }),
      );
      const size = 0.44 + random() * 0.16;
      const mesh = new Mesh(shapes[Math.floor(random() * shapes.length)], material);
      mesh.position.set(x, y, 0.02);
      mesh.rotation.z = random() * Math.PI * 2;
      mesh.scale.setScalar(size);
      wall.add(mesh);
      holds.push({ mesh, route: routeIndex, step, size, material });
    });
  });

  const otherColors = [PALETTE.tan, PALETTE.soil, PALETTE.night, 0x8a5a33];
  const otherMaterials = otherColors.map((color) => keep(new MeshStandardMaterial({ color, roughness: 0.65 })));
  let placed = 0;
  while (placed < 22) {
    const x = (random() - 0.5) * (WALL_WIDTH - 1);
    const y = (random() - 0.5) * (WALL_HEIGHT - 1);
    const crowded = ROUTES.some((route) => route.holds.some(([hx, hy]) => Math.hypot(hx - x, hy - y) < 0.75));
    if (crowded) continue;
    const size = 0.2 + random() * 0.14;
    const mesh = new Mesh(shapes[placed % shapes.length], otherMaterials[placed % otherMaterials.length]);
    mesh.position.set(x, y, 0.02);
    mesh.rotation.z = random() * Math.PI * 2;
    mesh.scale.setScalar(size);
    wall.add(mesh);
    holds.push({ mesh, route: -1, step: Math.round((y + WALL_HEIGHT / 2) * 0.8), size, material: otherMaterials[0] });
    placed++;
  }

  const tags = ROUTES.map((route) => {
    const top = route.holds[route.holds.length - 1];
    const tag = createLabel(route.tag, { background: route.tagColor, color: "#1e0b03", height: 0.6 });
    keep(tag.material);
    if (tag.material.map) keep(tag.material.map);
    tag.position.set(top[0], top[1] + 0.9, 0.7);
    tag.material.opacity = 0;
    wall.add(tag);
    return tag;
  });

  let reveal = 0;

  return {
    group,
    update(presence, time, dt, still) {
      const target = presence > 0.35 ? 1 : 0;
      reveal = still ? target : reveal + (target - reveal) * Math.min(1, dt * 1.4);
      for (const hold of holds) {
        const t = Math.min(1, Math.max(0, reveal * 1.6 - hold.step * 0.07));
        hold.mesh.scale.setScalar(hold.size * Math.max(0.001, t));
      }
      // A light climbs each route from the start hold to the top, like a climber sending it,
      // with the three routes taking turns.
      for (const hold of holds) {
        if (hold.route < 0) continue;
        const climb = (((time * 0.55 - hold.route * 0.33) % 1) + 1) % 1;
        const front = climb * 10 - hold.step;
        const lit = still ? 0.2 : Math.max(0, 1 - Math.abs(front - 0.5) / 1.4);
        hold.material.emissiveIntensity = reveal * (0.12 + lit * 0.85);
      }
      tags.forEach((tag, index) => {
        tag.material.opacity = Math.max(0, Math.min(1, reveal * 2 - 1 - index * 0.15));
        tag.position.z = 0.7 + (still ? 0 : Math.sin(time * 1.2 + index) * 0.05);
      });
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
