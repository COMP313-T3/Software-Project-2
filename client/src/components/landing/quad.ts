/** A four-sided shape on screen, in CSS pixels: top left, top right, bottom right, bottom left. */
export type Quad = [number, number][];

/** The corners of a box at the top left of the screen, in the same order as a Quad. */
export function boxQuad(width: number, height: number): Quad {
  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
}

/** A quad part of the way from one to another, corner by corner. */
export function mixQuads(from: Quad, to: Quad, amount: number): Quad {
  return from.map(([x, y], index) => [x + (to[index][0] - x) * amount, y + (to[index][1] - y) * amount]);
}

/**
 * The CSS matrix3d that lays a box onto a quad: the perspective transform that puts each corner
 * of the box on the matching corner of the quad, so the box looks like it lies in the quad's
 * plane. Apply it with transform-origin 0 0 and no perspective on the parent.
 *
 * Built with Heckbert's square-to-quad mapping, scaled from the box down to a unit square first.
 *
 * @param width The box's width in pixels.
 * @param height The box's height in pixels.
 */
export function quadMatrix(width: number, height: number, quad: Quad): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const sumX = x0 - x1 + x2 - x3;
  const sumY = y0 - y1 + y2 - y3;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const det = dx1 * dy2 - dx2 * dy1;
  // A parallelogram needs no perspective, and its determinant can't be divided by safely.
  const flat = Math.abs(sumX) < 1e-9 && Math.abs(sumY) < 1e-9;
  const g = flat || det === 0 ? 0 : (sumX * dy2 - dx2 * sumY) / det;
  const h = flat || det === 0 ? 0 : (dx1 * sumY - sumX * dy1) / det;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const columns = [a / width, d / width, 0, g / width, b / height, e / height, 0, h / height, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${columns.join(", ")})`;
}
