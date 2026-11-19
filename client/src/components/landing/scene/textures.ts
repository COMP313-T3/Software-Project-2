import {
  CanvasTexture,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from "three";
import { CSS_PALETTE, seededRandom } from "./palette.ts";

const FONT = 'Archivo, "Helvetica Neue", Arial, sans-serif';

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is not available.");
  return [canvas, context];
}

function textureOf(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

/**
 * A pill-shaped label that always faces the camera, like the distance chips on the map and the
 * point tags on the wall. `height` is its height in scene units.
 */
export function createLabel(
  text: string,
  options: { background?: string; color?: string; height?: number } = {},
): Sprite {
  const { background = CSS_PALETTE.cream, color = CSS_PALETTE.night, height = 0.42 } = options;
  const fontSize = 56;
  const [probeCanvas, probe] = canvasOf(8, 8);
  probe.font = `700 ${fontSize}px ${FONT}`;
  const textWidth = probe.measureText(text).width;
  probeCanvas.remove();

  const padX = 34;
  const width = Math.ceil(textWidth + padX * 2);
  const canvasHeight = 96;
  const [canvas, context] = canvasOf(width, canvasHeight);
  roundedRect(context, 2, 2, width - 4, canvasHeight - 4, (canvasHeight - 4) / 2);
  context.fillStyle = background;
  context.fill();
  context.font = `700 ${fontSize}px ${FONT}`;
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, padX, canvasHeight / 2 + 2);

  const material = new SpriteMaterial({ map: textureOf(canvas), transparent: true, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.scale.set((height * width) / canvasHeight, height, 1);
  return sprite;
}

/**
 * The plywood face of the climbing wall: warm panels with seams every 1.22 m, as on a real
 * wall, and rows of bolt holes for the holds.
 */
export function createPlywoodTexture(): CanvasTexture {
  const size = 1024;
  const [canvas, context] = canvasOf(size, size);
  const random = seededRandom(7);
  context.fillStyle = CSS_PALETTE.tan;
  context.fillRect(0, 0, size, size);

  for (let i = 0; i < 1400; i++) {
    const shade = random() < 0.5 ? "rgba(30, 11, 3, 0.05)" : "rgba(241, 241, 245, 0.05)";
    context.fillStyle = shade;
    context.fillRect(random() * size, random() * size, 2 + random() * 60, 1 + random() * 2);
  }

  context.strokeStyle = "rgba(30, 11, 3, 0.35)";
  context.lineWidth = 4;
  for (let line = 0; line <= size; line += size / 2) {
    context.beginPath();
    context.moveTo(line, 0);
    context.lineTo(line, size);
    context.moveTo(0, line);
    context.lineTo(size, line);
    context.stroke();
  }

  context.fillStyle = "rgba(30, 11, 3, 0.55)";
  const step = size / 12;
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) {
      context.beginPath();
      context.arc(x, y, 4.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  const texture = textureOf(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

export interface CardContent {
  title: string;
  rows: { label: string; value?: string; accent?: boolean }[];
}

/**
 * A small dashboard card for the gym stage, drawn like the app's own panels: a title over a few
 * rows, with accented values in orange.
 */
export function createCardTexture(content: CardContent): CanvasTexture {
  const width = 640;
  const height = 400;
  const [canvas, context] = canvasOf(width, height);
  roundedRect(context, 0, 0, width, height, 36);
  context.fillStyle = CSS_PALETTE.cream;
  context.fill();

  context.fillStyle = CSS_PALETTE.orange;
  roundedRect(context, 40, 40, 64, 10, 5);
  context.fill();

  context.fillStyle = CSS_PALETTE.night;
  context.font = `800 46px ${FONT}`;
  context.textBaseline = "alphabetic";
  context.fillText(content.title, 40, 112);

  content.rows.forEach((row, index) => {
    const y = 172 + index * 64;
    context.fillStyle = "rgba(30, 11, 3, 0.07)";
    roundedRect(context, 40, y - 42, width - 80, 54, 14);
    context.fill();
    context.fillStyle = CSS_PALETTE.night;
    context.font = `600 30px ${FONT}`;
    context.fillText(row.label, 62, y - 6);
    if (row.value) {
      context.font = `800 30px ${FONT}`;
      context.fillStyle = row.accent ? CSS_PALETTE.ember : CSS_PALETTE.night;
      const valueWidth = context.measureText(row.value).width;
      context.fillText(row.value, width - 62 - valueWidth, y - 6);
    }
  });
  return textureOf(canvas);
}

/**
 * The number plate on the front of a podium step, drawn at the step's own proportions so the
 * number isn't stretched on a tall step or squashed on a short one.
 *
 * @param aspect The front face's width divided by its height.
 */
export function createPlateTexture(text: string, aspect: number): CanvasTexture {
  const height = 256;
  const width = Math.round(height * aspect);
  const [canvas, context] = canvasOf(width, height);
  context.fillStyle = CSS_PALETTE.cream;
  context.fillRect(0, 0, width, height);
  context.fillStyle = CSS_PALETTE.night;
  context.font = `900 ${Math.round(Math.min(height * 0.62, width * 0.5))}px ${FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height * 0.53);
  return textureOf(canvas);
}

/** A soft round glow that fades from warm white at the middle to clear at the edge. */
export function createGlowTexture(): CanvasTexture {
  const [canvas, context] = canvasOf(128, 128);
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 230, 176, 0.9)");
  gradient.addColorStop(0.35, "rgba(245, 128, 16, 0.35)");
  gradient.addColorStop(1, "rgba(245, 128, 16, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return textureOf(canvas);
}
