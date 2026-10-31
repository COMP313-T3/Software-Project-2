import {
  BoxGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector2,
} from "three";
import { PALETTE } from "./palette.ts";
import { createLabel, createPlateTexture } from "./textures.ts";
import type { Stage } from "./stage.ts";

const STEPS: { place: string; x: number; height: number }[] = [
  { place: "2", x: -1.75, height: 1.1 },
  { place: "1", x: 0, height: 1.6 },
  { place: "3", x: 1.75, height: 0.75 },
];

/** A trophy cup turned on a lathe: base, stem, and a flared bowl. */
function trophyGeometry(): LatheGeometry {
  const profile = [
    [0.0, 0.0], [0.42, 0.0], [0.42, 0.1], [0.18, 0.16], [0.12, 0.42], [0.1, 0.62],
    [0.22, 0.72], [0.46, 0.95], [0.56, 1.3], [0.5, 1.32], [0.4, 1.0], [0.0, 0.92],
  ].map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(profile, 48);
}

/**
 * The comp day stage: a podium that rises step by step with a trophy on top, and a row of live
 * score bars behind it that keep shifting, standing in for the live leaderboard.
 */
export function createPodiumStage(): Stage {
  const group = new Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const platform = new Mesh(
    keep(new BoxGeometry(6.4, 0.3, 3)),
    keep(new MeshStandardMaterial({ color: PALETTE.soil, roughness: 0.9 })),
  );
  platform.position.y = -0.15;
  group.add(platform);

  const side = keep(new MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.6 }));
  const steps = STEPS.map((step) => {
    const front = keep(
      new MeshStandardMaterial({ map: keep(createPlateTexture(step.place, 1.6 / step.height)), roughness: 0.6 }),
    );
    // Each step is built at its full height with its base at y = 0, and rises by scaling up.
    const geometry = keep(new BoxGeometry(1.6, step.height, 1.6));
    geometry.translate(0, step.height / 2, 0);
    const mesh = new Mesh(geometry, [side, side, side, side, front, side]);
    mesh.position.x = step.x;
    group.add(mesh);
    return { mesh, height: step.height };
  });

  const trophy = new Mesh(
    keep(trophyGeometry()),
    keep(new MeshStandardMaterial({ color: PALETTE.orange, metalness: 0.85, roughness: 0.28 })),
  );
  group.add(trophy);

  const barGeometry = keep(new BoxGeometry(0.34, 1, 0.34));
  const barColors = [PALETTE.ember, PALETTE.orange, PALETTE.tan, PALETTE.orange, PALETTE.ember, PALETTE.tan];
  const bars = barColors.map((color, index) => {
    const mesh = new Mesh(barGeometry, keep(new MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.2 })));
    mesh.position.set(-2.1 + index * 0.84, 0, -1.9);
    group.add(mesh);
    return { mesh, phase: index * 1.3 };
  });

  const live = createLabel("LIVE", { background: "#eb5a14", color: "#f1f1f5", height: 0.4 });
  keep(live.material);
  if (live.material.map) keep(live.material.map);
  live.position.set(2.7, 2.9, -1.9);
  group.add(live);

  let reveal = 0;

  return {
    group,
    update(presence, time, dt, still) {
      const target = presence > 0.35 ? 1 : 0;
      reveal = still ? target : reveal + (target - reveal) * Math.min(1, dt * 1.4);
      steps.forEach(({ mesh }, index) => {
        const t = Math.min(1, Math.max(0, reveal * 1.5 - index * 0.15));
        mesh.scale.y = Math.max(0.001, t);
      });
      const first = steps[1];
      const top = first.height * first.mesh.scale.y;
      const drop = Math.min(1, Math.max(0, reveal * 2 - 1));
      trophy.position.set(0, top + (1 - drop) * 2.5, 0);
      trophy.rotation.y = still ? 0 : time * 0.6;
      trophy.scale.setScalar(Math.max(0.001, drop) * 0.9);
      bars.forEach(({ mesh, phase }) => {
        const wave = still ? 0.6 : 0.5 + 0.5 * Math.sin(time * 1.1 + phase);
        const h = Math.max(0.001, reveal * (0.6 + wave * 2));
        mesh.scale.y = h;
        mesh.position.y = h / 2;
      });
      live.material.opacity = reveal * (still ? 1 : 0.65 + 0.35 * Math.sin(time * 4));
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
