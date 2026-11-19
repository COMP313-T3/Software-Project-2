import { describe, expect, it } from "vitest";
import { boxQuad, mixQuads, quadMatrix, type Quad } from "./quad.ts";

/** Where a CSS matrix3d puts a point of the box, perspective divide included. */
function apply(matrix: string, x: number, y: number): [number, number] {
  const m = matrix.replace("matrix3d(", "").replace(")", "").split(",").map(Number);
  const w = m[3] * x + m[7] * y + m[15];
  return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w];
}

function expectCornersOn(matrix: string, width: number, height: number, quad: Quad) {
  boxQuad(width, height).forEach(([x, y], index) => {
    const [px, py] = apply(matrix, x, y);
    expect(px).toBeCloseTo(quad[index][0], 6);
    expect(py).toBeCloseTo(quad[index][1], 6);
  });
}

describe("quadMatrix", () => {
  it("leaves a box where it is when the quad is the box itself", () => {
    const matrix = quadMatrix(1440, 900, boxQuad(1440, 900));
    expectCornersOn(matrix, 1440, 900, boxQuad(1440, 900));
    expect(apply(matrix, 700, 300)).toEqual([700, 300]);
  });

  it("lays each corner of the box on the matching corner of a slanted board", () => {
    const board: Quad = [
      [380, 120],
      [1060, 110],
      [1320, 760],
      [140, 790],
    ];
    expectCornersOn(quadMatrix(1440, 900, board), 1440, 900, board);
  });

  it("handles a quad with no perspective, such as a box moved and stretched", () => {
    const moved: Quad = [
      [100, 50],
      [900, 50],
      [900, 650],
      [100, 650],
    ];
    expectCornersOn(quadMatrix(1600, 900, moved), 1600, 900, moved);
  });

  it("lands the middle of the box where the board's diagonals cross, nearer the far edge", () => {
    const board: Quad = [
      [400, 100],
      [1000, 100],
      [1300, 800],
      [100, 800],
    ];
    const [x, y] = apply(quadMatrix(1400, 900, board), 700, 450);
    expect(x).toBeCloseTo(700, 6);
    expect(y).toBeCloseTo(100 + 700 / 3, 6);
  });
});

describe("mixQuads", () => {
  it("moves every corner the same share of the way", () => {
    const board: Quad = [
      [200, 100],
      [800, 100],
      [900, 500],
      [100, 500],
    ];
    expect(mixQuads(boxQuad(1000, 600), board, 0)).toEqual(boxQuad(1000, 600));
    expect(mixQuads(boxQuad(1000, 600), board, 1)).toEqual(board);
    expect(mixQuads(boxQuad(1000, 600), board, 0.5)).toEqual([
      [100, 50],
      [900, 50],
      [950, 550],
      [50, 550],
    ]);
  });
});
