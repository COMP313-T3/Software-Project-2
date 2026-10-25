/** One triangle that covers the whole canvas. */
export const FOG_VERTEX_SHADER = /* glsl */ `
in vec3 position;

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Fog drawn from layered gradient noise, gently warped by more noise so it rolls, drifting right
 * with the wind. It is thickest at the bottom of the band, and only the tallest billows reach its
 * top edge. Each billow is lit on the side facing the sunset, up and to the left, judged from its
 * broad shape so the shading reads as volume rather than texture. uSweep holds what the pointer
 * did, from fogSweep.ts: how far the fog was pushed, how much was swept away, and how fast it is
 * moving, which churns it. Colors come out premultiplied by alpha.
 */
export const FOG_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
precision highp int;

uniform vec2 uSize;
uniform float uPixelRatio;
uniform float uTime;
uniform sampler2D uSweep;
uniform float uPushRange;

out vec4 fogColor;

const float BILLOW_SIZE = 240.0;
const float WIND = 0.03;
const float SWIRL = 1.1;
const float SWIRL_SCALE = 0.7;
const float FLOOR = -0.34;
const float CEILING = 0.04;
const float SOFTNESS = 0.24;
const float TOP_FADE = 0.55;
const vec2 LIGHT_STEP = vec2(-0.12, 0.15);
const float LIGHT_CONTRAST = 5.0;
const vec3 SHADE = vec3(0.19, 0.165, 0.16);
const vec3 LIGHT = vec3(0.56, 0.45, 0.4);
const float GROUND_SHADE = 0.5;
const float OPACITY = 0.86;
const float DISPERSE = 0.6;
const float CHURN = 0.35;
const mat2 OCTAVE = mat2(1.6, 1.2, -1.2, 1.6);

uvec2 scramble(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}

vec2 slope(ivec2 corner) {
  float angle = float(scramble(uvec2(corner + 4096)).x) * (6.2831853 / 4294967296.0);
  return vec2(cos(angle), sin(angle));
}

float noise(vec2 p) {
  ivec2 corner = ivec2(floor(p));
  vec2 f = fract(p);
  vec2 blend = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(slope(corner), f);
  float b = dot(slope(corner + ivec2(1, 0)), f - vec2(1.0, 0.0));
  float c = dot(slope(corner + ivec2(0, 1)), f - vec2(0.0, 1.0));
  float d = dot(slope(corner + ivec2(1, 1)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

float broad(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 3; octave++) {
    sum += amplitude * noise(p);
    p = OCTAVE * p + vec2(3.1, 1.7);
    amplitude *= 0.5;
  }
  return sum;
}

float fine(vec2 p) {
  p = OCTAVE * (OCTAVE * (OCTAVE * p + vec2(3.1, 1.7)) + vec2(3.1, 1.7)) + vec2(3.1, 1.7);
  return 0.0625 * noise(p) + 0.03125 * noise(OCTAVE * p + vec2(3.1, 1.7));
}

void main() {
  vec2 point = gl_FragCoord.xy / uPixelRatio;
  vec2 uv = point / uSize;
  vec4 sweep = texture(uSweep, uv);
  vec2 push = (sweep.rg * 255.0 - 128.0) / 127.0 * uPushRange;
  float swept = sweep.b;
  float churn = sweep.a;

  vec2 p = (point - push) / BILLOW_SIZE - vec2(uTime * WIND, 0.0);
  vec2 warp = vec2(
    broad(p * SWIRL_SCALE + vec2(0.0, uTime * 0.04)),
    broad(p * SWIRL_SCALE + vec2(5.2, 1.3) - vec2(uTime * 0.03, 0.0))
  );
  if (churn > 0.0) {
    warp += churn * CHURN * vec2(noise(p * 4.0 + uTime), noise(p * 4.0 - uTime));
  }
  vec2 q = p + SWIRL * warp;
  float body = broad(q);
  float shape = body + fine(q);
  float towardLight = broad(q + LIGHT_STEP);

  float height = uv.y;
  float floorLevel = mix(FLOOR, CEILING, height) + swept * DISPERSE;
  float density = smoothstep(floorLevel, floorLevel + SOFTNESS, shape);
  density *= 1.0 - smoothstep(1.0 - TOP_FADE, 1.0, height);
  density *= 1.0 - swept * swept * swept;

  float lit = clamp(0.5 + (body - towardLight) * LIGHT_CONTRAST, 0.0, 1.0);
  vec3 color = mix(SHADE, LIGHT, lit) * mix(GROUND_SHADE, 1.0, smoothstep(0.05, 0.5, height));
  float alpha = density * OPACITY;
  fogColor = vec4(color * alpha, alpha);
}
`;
