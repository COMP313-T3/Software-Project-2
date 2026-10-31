import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { createCardTexture, type CardContent } from "./textures.ts";
import type { Stage } from "./stage.ts";

/** The gym tools from the app, as small cards floating around Topo's head. */
const CARDS: CardContent[] = [
  {
    title: "Create competition",
    rows: [
      { label: "Location", value: "Your gym's pin" },
      { label: "Registration", value: "Open", accent: true },
      { label: "Spots", value: "60" },
    ],
  },
  {
    title: "Divisions",
    rows: [
      { label: "Open", value: "24" },
      { label: "Beginner", value: "18" },
      { label: "Advanced", value: "9", accent: true },
    ],
  },
  {
    title: "Routes",
    rows: [
      { label: "R1", value: "100 pts" },
      { label: "R2", value: "250 pts" },
      { label: "R3", value: "400 pts", accent: true },
    ],
  },
  {
    title: "Scoring",
    rows: [
      { label: "Per failed attempt", value: "-20%", accent: true },
      { label: "Max attempts", value: "5" },
      { label: "Top on last try", value: "Scores" },
    ],
  },
];

/**
 * The gym stage: dashboard cards for creating a competition, divisions, routes, and scoring,
 * orbiting slowly around the spot where Topo's head floats.
 */
export function createGymStage(): Stage {
  const group = new Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const geometry = keep(new PlaneGeometry(2.6, 1.625));
  const cards = CARDS.map((content, index) => {
    const material = keep(
      new MeshBasicMaterial({ map: keep(createCardTexture(content)), transparent: true, side: DoubleSide, toneMapped: false }),
    );
    const card = new Mesh(geometry, material);
    group.add(card);
    return { card, material, angle: (index / CARDS.length) * Math.PI * 2 };
  });

  let reveal = 0;

  return {
    group,
    update(presence, time, dt, still) {
      const target = presence > 0.35 ? 1 : 0;
      reveal = still ? target : reveal + (target - reveal) * Math.min(1, dt * 1.5);
      const spin = still ? 0 : time * 0.18;
      cards.forEach(({ card, material, angle }, index) => {
        const a = angle + spin;
        const radius = 2.7 + (1 - reveal) * 2.5;
        card.position.set(Math.cos(a) * radius * 1.2, Math.sin(a) * 1.45 + (still ? 0 : Math.sin(time + index) * 0.08), Math.sin(a) * 1.1);
        // Cards behind the head turn slightly away and fade, so the front ones read clearly.
        card.rotation.set(0, -Math.cos(a) * 0.35, 0);
        material.opacity = reveal * (0.62 + 0.38 * ((Math.sin(a) + 1) / 2));
        card.renderOrder = Math.sin(a) > 0 ? 2 : 0;
      });
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
