/** A point in the fog band, in CSS pixels from its bottom left corner. */
export interface BandPoint {
  x: number;
  y: number;
}

/** What the pointer did to the fog at one cell. */
export interface SweepCell {
  /** How far the fog was pushed across and up, in CSS pixels. */
  pushX: number;
  pushY: number;
  /** How much of the fog is swept away, from 0 to 1. */
  swept: number;
  /** How fast the fog is moving, in CSS pixels per second. */
  speed: number;
}

/** A pointer position in client coordinates, at its event's timeStamp. */
export interface PointerSample {
  clientX: number;
  clientY: number;
  time: number;
}

/** The push channels of write() stand for this many CSS pixels each way. */
export const PUSH_RANGE = 220;

const CELL_SIZE = 12;
const MAX_COLUMNS = 200;
const MAX_ROWS = 40;
const HAND_RADIUS = 72;
const DRAG_RADIUS = HAND_RADIUS * 1.5;
const REACH = DRAG_RADIUS * 2.2;
const PUSH_SHARE = 0.55;
const TOP_SPEED = 1600;
const SHORTEST_STROKE = 1 / 240;
const SWEEP_DISTANCE = 90;
const MOTION_FADE = 0.45;
const PUSH_FADE = 1.2;
const SWEPT_FADE = 2.2;
const SPREAD_RATE = 4;
const CHURN_SPEED = 600;
const LONGEST_STEP = 1 / 20;
const SHORTEST_MOVE = 1;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

interface Fields {
  vx: Float32Array;
  vy: Float32Array;
  dx: Float32Array;
  dy: Float32Array;
  swept: Float32Array;
}

function makeFields(size: number): Fields {
  return {
    vx: new Float32Array(size),
    vy: new Float32Array(size),
    dx: new Float32Array(size),
    dy: new Float32Array(size),
    swept: new Float32Array(size),
  };
}

function distanceToSegment(x: number, y: number, a: BandPoint, b: BandPoint) {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const lengthSquared = abX * abX + abY * abY;
  const along =
    lengthSquared > 0
      ? clamp(((x - a.x) * abX + (y - a.y) * abY) / lengthSquared, 0, 1)
      : 0;
  return Math.hypot(x - (a.x + abX * along), y - (a.y + abY * along));
}

export type FogSweep = ReturnType<typeof createFogSweep>;

/**
 * How the pointer stirs the fog, on a grid of cells about 12 CSS pixels wide over the fog band.
 * A stroke drags the fog near the pointer's path along with it, and sweeps away part of the fog
 * closest to the path, more the farther the pointer travels. Each step carries the dragged fog on
 * with its own motion, then lets the motion die down, the fog drift back, and the swept fog return
 * over a few seconds. write() turns the grid into the texture the fog shader reads.
 *
 * @param width Width of the fog band in CSS pixels.
 * @param height Height of the fog band in CSS pixels.
 * @returns columns and rows of the grid; isActive, false once everything has settled; stroke
 *   for the pointer moving between two points; step to move time on; write to fill a texture;
 *   and cell to read one cell.
 */
export function createFogSweep(width: number, height: number) {
  const columns = clamp(Math.round(width / CELL_SIZE), 2, MAX_COLUMNS);
  const rows = clamp(Math.round(height / CELL_SIZE), 2, MAX_ROWS);
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const size = columns * rows;
  let fields = makeFields(size);
  let next = makeFields(size);
  const blurred = new Float32Array(size);
  let active = false;

  function sample(values: Float32Array, x: number, y: number) {
    const cx = clamp(x, 0, columns - 1);
    const cy = clamp(y, 0, rows - 1);
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const x1 = Math.min(x0 + 1, columns - 1);
    const y1 = Math.min(y0 + 1, rows - 1);
    const fx = cx - x0;
    const fy = cy - y0;
    const lower =
      values[y0 * columns + x0] * (1 - fx) + values[y0 * columns + x1] * fx;
    const upper =
      values[y1 * columns + x0] * (1 - fx) + values[y1 * columns + x1] * fx;
    return lower * (1 - fy) + upper * fy;
  }

  function spread(values: Float32Array, amount: number) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const k = row * columns + column;
        const left = values[column > 0 ? k - 1 : k];
        const right = values[column < columns - 1 ? k + 1 : k];
        const below = values[row > 0 ? k - columns : k];
        const above = values[row < rows - 1 ? k + columns : k];
        const around = (left + right + below + above) / 4;
        blurred[k] = values[k] + (around - values[k]) * amount;
      }
    }
    values.set(blurred);
  }

  function settle() {
    let fastest = 0;
    let farthest = 0;
    let mostSwept = 0;
    for (let k = 0; k < size; k++) {
      fastest = Math.max(
        fastest,
        Math.abs(fields.vx[k]),
        Math.abs(fields.vy[k]),
      );
      farthest = Math.max(
        farthest,
        Math.abs(fields.dx[k]),
        Math.abs(fields.dy[k]),
      );
      mostSwept = Math.max(mostSwept, fields.swept[k]);
    }
    if (fastest < 2 && farthest < 0.5 && mostSwept < 0.003) {
      for (const values of Object.values(fields)) values.fill(0);
      active = false;
    }
  }

  return {
    columns,
    rows,

    isActive() {
      return active;
    },

    /** The pointer moved from one point to another in the given number of seconds. */
    stroke(from: BandPoint, to: BandPoint, seconds: number) {
      const moveX = to.x - from.x;
      const moveY = to.y - from.y;
      const distance = Math.hypot(moveX, moveY);
      if (distance < 0.5) return;
      const firstColumn = Math.floor(
        (Math.min(from.x, to.x) - REACH) / cellWidth,
      );
      const lastColumn = Math.ceil(
        (Math.max(from.x, to.x) + REACH) / cellWidth,
      );
      const firstRow = Math.floor(
        (Math.min(from.y, to.y) - REACH) / cellHeight,
      );
      const lastRow = Math.ceil((Math.max(from.y, to.y) + REACH) / cellHeight);
      if (lastColumn < 0 || firstColumn >= columns) return;
      if (lastRow < 0 || firstRow >= rows) return;

      const speed = Math.min(
        distance / Math.max(seconds, SHORTEST_STROKE),
        TOP_SPEED,
      );
      const pushX = (moveX / distance) * speed * PUSH_SHARE;
      const pushY = (moveY / distance) * speed * PUSH_SHARE;
      const sweep = 1 - Math.exp(-distance / SWEEP_DISTANCE);
      const { vx, vy, swept } = fields;

      for (
        let row = Math.max(firstRow, 0);
        row <= Math.min(lastRow, rows - 1);
        row++
      ) {
        for (
          let column = Math.max(firstColumn, 0);
          column <= Math.min(lastColumn, columns - 1);
          column++
        ) {
          const gap = distanceToSegment(
            (column + 0.5) * cellWidth,
            (row + 0.5) * cellHeight,
            from,
            to,
          );
          const drag = Math.exp(-((gap / DRAG_RADIUS) ** 2));
          if (drag < 0.01) continue;
          const k = row * columns + column;
          vx[k] += (pushX - vx[k]) * drag;
          vy[k] += (pushY - vy[k]) * drag;
          swept[k] +=
            (1 - swept[k]) * Math.exp(-((gap / HAND_RADIUS) ** 2)) * sweep;
          active = true;
        }
      }
    },

    /** Moves time on by up to a twentieth of a second, so a long pause never makes the fog jump. */
    step(seconds: number) {
      if (!active) return;
      const dt = clamp(seconds, 0, LONGEST_STEP);
      if (dt === 0) return;
      const { vx, vy, dx, dy, swept } = fields;

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const k = row * columns + column;
          const moveX = vx[k] * dt;
          const moveY = vy[k] * dt;
          const fromX = column - moveX / cellWidth;
          const fromY = row - moveY / cellHeight;
          next.vx[k] = sample(vx, fromX, fromY);
          next.vy[k] = sample(vy, fromX, fromY);
          next.dx[k] = sample(dx, fromX, fromY) + moveX;
          next.dy[k] = sample(dy, fromX, fromY) + moveY;
          next.swept[k] = sample(swept, fromX, fromY);
        }
      }
      [fields, next] = [next, fields];

      const amount = Math.min(1, dt * SPREAD_RATE);
      spread(fields.vx, amount);
      spread(fields.vy, amount);
      spread(fields.swept, amount);

      const motionLeft = Math.exp(-dt / MOTION_FADE);
      const pushLeft = Math.exp(-dt / PUSH_FADE);
      const sweptLeft = Math.exp(-dt / SWEPT_FADE);
      for (let k = 0; k < size; k++) {
        fields.vx[k] *= motionLeft;
        fields.vy[k] *= motionLeft;
        fields.dx[k] = clamp(fields.dx[k] * pushLeft, -PUSH_RANGE, PUSH_RANGE);
        fields.dy[k] = clamp(fields.dy[k] * pushLeft, -PUSH_RANGE, PUSH_RANGE);
        fields.swept[k] *= sweptLeft;
      }
      settle();
    },

    /**
     * Fills four bytes per cell, bottom row first: the push across and up (128 is none, and 1 and
     * 255 are PUSH_RANGE pixels each way), how much is swept away, and how fast the fog churns.
     */
    write(target: Uint8Array) {
      const { vx, vy, dx, dy, swept } = fields;
      for (let k = 0; k < size; k++) {
        target[k * 4] =
          128 + Math.round(127 * clamp(dx[k] / PUSH_RANGE, -1, 1));
        target[k * 4 + 1] =
          128 + Math.round(127 * clamp(dy[k] / PUSH_RANGE, -1, 1));
        target[k * 4 + 2] = Math.round(255 * clamp(swept[k], 0, 1));
        target[k * 4 + 3] = Math.round(
          255 * Math.min(1, Math.hypot(vx[k], vy[k]) / CHURN_SPEED),
        );
      }
    },

    cell(column: number, row: number): SweepCell {
      const k = row * columns + column;
      return {
        pushX: fields.dx[k],
        pushY: fields.dy[k],
        swept: fields.swept[k],
        speed: Math.hypot(fields.vx[k], fields.vy[k]),
      };
    },
  };
}

/**
 * Collects the pointer's positions between frames and pairs them into strokes. A position less
 * than a pixel from the last one used is held back, so slow movement still adds up to strokes
 * instead of being lost one tiny step at a time.
 *
 * @returns add for each position; take for the strokes since the last call, as pairs of
 *   positions; and lift for when the pointer leaves, so the next position starts a new stroke.
 */
export function createPointerTrail() {
  const pending: PointerSample[] = [];
  let last: PointerSample | null = null;

  return {
    add(sample: PointerSample) {
      pending.push(sample);
    },

    take() {
      const strokes: [PointerSample, PointerSample][] = [];
      for (const sample of pending) {
        if (!last) {
          last = sample;
        } else if (
          Math.hypot(
            sample.clientX - last.clientX,
            sample.clientY - last.clientY,
          ) >= SHORTEST_MOVE
        ) {
          strokes.push([last, sample]);
          last = sample;
        }
      }
      pending.length = 0;
      return strokes;
    },

    lift() {
      last = null;
    },
  };
}
