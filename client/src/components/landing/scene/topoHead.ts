import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { PALETTE } from "./palette.ts";
import { createGlowTexture } from "./textures.ts";

const WIDTH = 2.3;
const HEIGHT = 1.8;
const DEPTH = 1.9;

export interface TopoHead {
  group: Group;
  /** Points the eyes toward a spot, from -1 to 1 on each axis. */
  setGaze(x: number, y: number): void;
  /** Blinks now and then. With `still`, the eyes stay open. */
  update(time: number, still: boolean): void;
  dispose(): void;
}

function roundedRectShape(width: number, height: number, radius: number): Shape {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

/**
 * Topo's head as a 3D model: the compact beige CRT monitor from his turnaround sheet, with a
 * dark screen, two glowing eyes, a vent on the side, and a grille on the back. It guides the
 * visitor through the sections below the hero.
 */
export function createTopoHead(): TopoHead {
  const group = new Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const shell = keep(new MeshStandardMaterial({ color: PALETTE.beige, roughness: 0.62, metalness: 0.02 }));
  const body = new Mesh(keep(new RoundedBoxGeometry(WIDTH, HEIGHT, DEPTH, 6, 0.24)), shell);
  group.add(body);

  const bezel = new Mesh(
    keep(new ShapeGeometry(roundedRectShape(WIDTH * 0.84, HEIGHT * 0.78, 0.2), 8)),
    keep(new MeshStandardMaterial({ color: 0x8f7a5c, roughness: 0.5 })),
  );
  bezel.position.z = DEPTH / 2 + 0.004;
  group.add(bezel);

  const screen = new Mesh(
    keep(new ShapeGeometry(roundedRectShape(WIDTH * 0.76, HEIGHT * 0.68, 0.16), 8)),
    keep(new MeshStandardMaterial({ color: PALETTE.screen, roughness: 0.16, metalness: 0.15 })),
  );
  screen.position.z = DEPTH / 2 + 0.008;
  group.add(screen);

  const eyes = new Group();
  eyes.position.z = DEPTH / 2 + 0.012;
  group.add(eyes);
  const eyeMaterial = keep(new MeshBasicMaterial({ color: PALETTE.glow, toneMapped: false }));
  const eyeGeometry = keep(new CircleGeometry(0.25, 40));
  const halo = keep(
    new SpriteMaterial({
      map: keep(createGlowTexture()),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.7,
    }),
  );
  const eyeMeshes = [-0.42, 0.42].map((x) => {
    const eye = new Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(x, 0.03, 0);
    eyes.add(eye);
    const glow = new Sprite(halo);
    glow.position.set(x, 0.03, 0.02);
    glow.scale.setScalar(1.15);
    eyes.add(glow);
    return eye;
  });

  const slatMaterial = keep(new MeshStandardMaterial({ color: 0x5c4a35, roughness: 0.8 }));
  const sideSlat = keep(new BoxGeometry(0.02, 0.36, 0.05));
  for (let i = 0; i < 7; i++) {
    const slat = new Mesh(sideSlat, slatMaterial);
    slat.position.set(WIDTH / 2 + 0.006, 0.18, -0.36 + i * 0.12);
    group.add(slat);
  }
  const backSlat = keep(new BoxGeometry(0.05, 0.3, 0.02));
  for (let i = 0; i < 11; i++) {
    const slat = new Mesh(backSlat, slatMaterial);
    slat.position.set(-0.6 + i * 0.12, 0.34, -DEPTH / 2 - 0.006);
    group.add(slat);
  }

  let gazeX = 0;
  let gazeY = 0;

  return {
    group,
    setGaze(x, y) {
      gazeX = Math.max(-1, Math.min(1, x));
      gazeY = Math.max(-1, Math.min(1, y));
    },
    update(time, still) {
      eyes.position.x += (gazeX * 0.14 - eyes.position.x) * 0.12;
      eyes.position.y += (gazeY * 0.08 - eyes.position.y) * 0.12;
      // A blink every 4.2 seconds, lasting about a sixth of a second.
      const phase = time % 4.2;
      const open = still || phase > 0.16 ? 1 : Math.abs(phase - 0.08) / 0.08;
      for (const eye of eyeMeshes) eye.scale.y = Math.max(0.08, open);
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
