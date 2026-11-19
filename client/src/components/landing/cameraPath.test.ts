import { describe, expect, it } from "vitest";
import { holdEase, samplePath, stagePresence, type Vec3 } from "./cameraPath.ts";

describe("holdEase", () => {
  it("rests at both ends and moves smoothly between them", () => {
    expect(holdEase(0)).toBe(0);
    expect(holdEase(0.15)).toBe(0);
    expect(holdEase(0.5)).toBeCloseTo(0.5);
    expect(holdEase(0.85)).toBe(1);
    expect(holdEase(1)).toBe(1);
  });

  it("never moves backward", () => {
    let previous = 0;
    for (let t = 0; t <= 1; t += 0.02) {
      const value = holdEase(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("samplePath", () => {
  const keys: Vec3[] = [
    [0, 10, 0],
    [0, 0, 0],
    [4, 0, -8],
  ];

  it("starts the path at journey -1 and reaches each keyframe on a whole step", () => {
    expect(samplePath(keys, -1)).toEqual([0, 10, 0]);
    expect(samplePath(keys, 0)).toEqual([0, 0, 0]);
    expect(samplePath(keys, 1)).toEqual([4, 0, -8]);
  });

  it("is halfway between two keyframes halfway through a step", () => {
    const [x, y, z] = samplePath(keys, 0.5);
    expect(x).toBeCloseTo(2);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(-4);
  });

  it("holds the first and last keyframes outside the path", () => {
    expect(samplePath(keys, -1.8)).toEqual([0, 10, 0]);
    expect(samplePath(keys, 6)).toEqual([4, 0, -8]);
  });

  it("copes with a path of one keyframe or none", () => {
    expect(samplePath([[1, 2, 3]], 0.4)).toEqual([1, 2, 3]);
    expect(samplePath([], 0.4)).toEqual([0, 0, 0]);
  });
});

describe("stagePresence", () => {
  it("is full while the camera rests on a stage and gone by the time it's most of the way to the next", () => {
    expect(stagePresence(1, 1)).toBe(1);
    expect(stagePresence(1, 1.15)).toBe(1);
    expect(stagePresence(1, 0.85)).toBe(1);
    expect(stagePresence(1, 1.4)).toBeGreaterThan(0);
    expect(stagePresence(1, 1.4)).toBeLessThan(1);
    expect(stagePresence(1, 1.7)).toBe(0);
    expect(stagePresence(1, 0.3)).toBe(0);
  });
});
