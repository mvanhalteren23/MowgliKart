import { BILLBOARD_GLSL, glsl, NOISE_GLSL } from './glsl';

/**
 * Warden resonance aura — an additive billboard wrapped around a fused host.
 *  - rising tongues of spirit-fire (domain-warped noise scrolled upward)
 *  - a pulsing "resonance" halo that beats faster with uIntensity
 *  - two-colour stacking: inner layer = uColorA (first spirit), outer = uColorB
 *    (second spirit, or the same colour for a single fusion); they braid upward
 *  - Armor Break (uBroken = 1): the aura desaturates, gutters and tears into
 *    horizontal shards instead of vanishing — the fusion is suppressed, not lost
 */
export const auraVertex = glsl`
varying vec2 vUv;
${BILLBOARD_GLSL}
void main() {
  vUv = uv;
  mat4 m = bbModel();
  vec3 world = billboardWorld(m, position.xy);
  // Pull slightly toward the camera so it wraps the sprite instead of z-fighting it.
  vec3 toCam = normalize(cameraPosition - world);
  world += toCam * 0.05;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const auraFragment = glsl`
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uIntensity;
uniform float uBroken;
uniform float uSeed;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 uv = vUv;
  float t = uTime + uSeed * 10.0;

  // Armor Break: shear the aura into guttering horizontal shards.
  float shard = floor(uv.y * 14.0);
  float tear = (hash21(vec2(shard, floor(t * 9.0))) - 0.5) * 0.22 * uBroken;
  uv.x += tear;

  vec2 c = vec2(uv.x - 0.5, uv.y);
  // Flame body: an egg-shaped mask, narrow at the crown.
  float width = mix(0.42, 0.1, smoothstep(0.0, 1.0, c.y));
  float body = 1.0 - smoothstep(width * 0.55, width, abs(c.x));
  body *= smoothstep(0.0, 0.08, c.y) * (1.0 - smoothstep(0.62, 1.0, c.y));

  // Rising, domain-warped tongues.
  vec2 q = vec2(c.x * 5.0, c.y * 3.2 - t * 1.6);
  q.x += (vnoise(q * 0.9 + 3.7) - 0.5) * 1.5;
  float tongues = fbm3(q);
  float flame = smoothstep(0.38, 0.8, tongues + body * 0.55 - c.y * 0.35) * body;

  // Resonance halo: concentric pulses breathing outward from the chest.
  float r = length(vec2(c.x * 1.5, c.y - 0.42));
  float pulse = sin(r * 22.0 - t * (3.0 + uIntensity * 3.0)) * 0.5 + 0.5;
  float halo = pulse * smoothstep(0.5, 0.12, r) * smoothstep(0.02, 0.14, r) * 0.55;

  // Ground ring where the spirit anchors.
  float ring = smoothstep(0.035, 0.0, abs(length(vec2(c.x, (c.y - 0.03) * 4.0)) - 0.36 - sin(t * 2.0) * 0.015));

  // Two spirits braid: a helix decides which colour leads at each height.
  float braid = sin(c.y * 9.0 - t * 2.4 + c.x * 6.0) * 0.5 + 0.5;
  vec3 col = mix(uColorA, uColorB, smoothstep(0.25, 0.75, braid * 0.7 + r * 0.9));
  col = mix(col, vec3(1.0), flame * flame * 0.18); // hot core

  // Hollow the centre so the host sprite stays readable inside its aura.
  float hollow = mix(0.35, 1.0, smoothstep(0.05, 0.3, abs(c.x) + max(0.0, c.y - 0.55) * 0.6));
  float a = (flame * 0.6 * hollow + halo * 0.5 + ring * 0.7) * uIntensity;

  // Broken: grey out, flicker hard, keep only embers.
  float flicker = step(0.45, hash21(vec2(floor(t * 14.0), uSeed)));
  float grey = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(grey) * vec3(0.75, 0.8, 0.95), uBroken * 0.85);
  a *= mix(1.0, 0.18 + 0.4 * flicker, uBroken);

  // Posterise alpha a little: reads as pixel-art flame, not a soft glow.
  a = floor(a * 6.0 + 0.5) / 6.0;
  if (a < 0.02) discard;
  gl_FragColor = vec4(col * a, a);
}
`;
