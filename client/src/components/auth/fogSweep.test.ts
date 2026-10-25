import { describe, expect, it } from "vitest";
import {
  createFogSweep,
  createPointerTrail,
  PUSH_RANGE,
  type FogSweep,
} from "./fogSweep.ts";

const WIDTH = 1200;
const HEIGHT = 180;
const FRAME = 1 / 60;

function cellAt(sweep: FogSweep, x: number, y: number) {
  const column = Math.floor((x / WIDTH) * sweep.columns);
  const row = Math.floor((y / HEIGHT) * sweep.rows);
  return sweep.cell(column, row);
}

function run(sweep: FogSweep, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) sweep.step(FRAME);
}

function swipe(sweep: FogSweep, seconds = 0.4) {
  sweep.stroke({ x: 300, y: 90 }, { x: 700, y: 90 }, seconds);
}

describe("fog sweep", () => {
  it("sweeps the fog away along the pointer's path and leaves fog far from it alone", () => {
    const sweep = createFogSweep(WIDTH, HEIGHT);

    swipe(sweep);

    expect(cellAt(sweep, 500, 90).swept).toBeGreaterThan(0.9);
    expect(cellAt(sweep, 1100, 90).swept).toBe(0);
    expect(sweep.isActive()).toBe(true);
  });

  it("drags the fog the way the pointer went", () => {
    const sweep = createFogSweep(WIDTH, HEIGHT);

    swipe(sweep);
    run(sweep, 0.3);

    const near = cellAt(sweep, 600, 90);
    expect(near.pushX).toBeGreaterThan(20);
    expect(Math.abs(near.pushY)).toBeLessThan(near.pushX / 4);
  });

  it("drags the fog farther when the pointer moves faster", () => {
    const quick = createFogSweep(WIDTH, HEIGHT);
    const slow = createFogSweep(WIDTH, HEIGHT);

    swipe(quick, 0.2);
    swipe(slow, 2);
    run(quick, 0.3);
    run(slow, 0.3);

    expect(cellAt(quick, 600, 90).pushX).toBeGreaterThan(
      cellAt(slow, 600, 90).pushX * 3,
    );
  });

  it("lets the fog come back within a few seconds and then stops changing", () => {
    const sweep = createFogSweep(WIDTH, HEIGHT);

    swipe(sweep);
    run(sweep, 2);
    expect(cellAt(sweep, 500, 90).swept).toBeGreaterThan(0.1);
    run(sweep, 14);

    expect(sweep.isActive()).toBe(false);
    expect(cellAt(sweep, 500, 90)).toEqual({
      pushX: 0,
      pushY: 0,
      swept: 0,
      speed: 0,
    });
  });

  it("ignores a pointer moving well above the fog", () => {
    const sweep = createFogSweep(WIDTH, HEIGHT);

    sweep.stroke({ x: 100, y: 700 }, { x: 900, y: 640 }, 0.3);

    expect(sweep.isActive()).toBe(false);
  });

  it("never lets a long pause between frames make the fog jump", () => {
    const paused = createFogSweep(WIDTH, HEIGHT);
    const smooth = createFogSweep(WIDTH, HEIGHT);

    swipe(paused);
    swipe(smooth);
    paused.step(5);
    smooth.step(1 / 20);

    expect(cellAt(paused, 600, 90)).toEqual(cellAt(smooth, 600, 90));
  });

  it("writes a texture that means no change until the pointer moves", () => {
    const sweep = createFogSweep(WIDTH, HEIGHT);
    const bytes = new Uint8Array(sweep.columns * sweep.rows * 4);

    sweep.write(bytes);

    for (let k = 0; k < bytes.length; k += 4) {
      expect([...bytes.subarray(k, k + 4)]).toEqual([128, 128, 0, 0]);
    }
  });

  it("writes the push, the swept fog and the churn into the texture", () => {
    const sweep = createFogSweep(WIDTH, HEIGHT);
    const bytes = new Uint8Array(sweep.columns * sweep.rows * 4);

    swipe(sweep);
    run(sweep, 0.2);
    sweep.write(bytes);

    const column = Math.floor((600 / WIDTH) * sweep.columns);
    const row = Math.floor((90 / HEIGHT) * sweep.rows);
    const k = (row * sweep.columns + column) * 4;
    const cell = sweep.cell(column, row);
    expect(bytes[k]).toBe(128 + Math.round((127 * cell.pushX) / PUSH_RANGE));
    expect(bytes[k + 2]).toBe(Math.round(255 * cell.swept));
    expect(bytes[k + 3]).toBeGreaterThan(0);
  });

  it("keeps the grid small on very large screens", () => {
    const sweep = createFogSweep(7680, 300);

    expect(sweep.columns).toBeLessThanOrEqual(200);
    expect(sweep.rows).toBeLessThanOrEqual(40);
  });
});

describe("pointer trail", () => {
  const at = (clientX: number, time: number) => ({
    clientX,
    clientY: 300,
    time,
  });

  it("adds slow movement up into strokes instead of dropping each tiny step", () => {
    const trail = createPointerTrail();

    for (let step = 0; step <= 10; step++)
      trail.add(at(100 + step * 0.4, step * 16));

    expect(trail.take()).toEqual([
      [at(100, 0), at(101.2, 48)],
      [at(101.2, 48), at(102.4, 96)],
      [at(102.4, 96), at(103.6, 144)],
    ]);
  });

  it("carries on from the last position between frames", () => {
    const trail = createPointerTrail();

    trail.add(at(100, 0));
    trail.take();
    trail.add(at(140, 16));

    expect(trail.take()).toEqual([[at(100, 0), at(140, 16)]]);
  });

  it("starts a new stroke after the pointer lifts", () => {
    const trail = createPointerTrail();

    trail.add(at(100, 0));
    trail.add(at(140, 16));
    trail.take();
    trail.lift();
    trail.add(at(600, 500));
    trail.add(at(620, 516));

    expect(trail.take()).toEqual([[at(600, 500), at(620, 516)]]);
  });
});
