import { glsl, NOISE_GLSL } from './glsl';

/**
 * Water ripples. One flat quad per chunk at the water line.
 *  - layered scrolling value-noise swell
 *  - procedural concentric ripple rings (a cell grid of timed "drops")
 *  - shoreline foam driven by the chunk's height texture (R = (h + 2) / 4)
 *  - pixel-quantised sun glints for the HD-2D sparkle
 *  - optional interactive ripple around the player (uRippleOrigin.xy = world xz, z = start time)
 */
export const waterVertex = glsl`
uniform float uTime;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += sin(wp.x * 0.35 + uTime * 0.9) * 0.035 + cos(wp.z * 0.28 + uTime * 0.7) * 0.035;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const waterFragment = glsl`
uniform float uTime;
uniform sampler2D uHeightMap;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSunDir;
uniform vec3 uRippleOrigin;
varying vec3 vWorld;
varying vec2 vUv;
${NOISE_GLSL}

// Expanding rings from one randomly timed drop per grid cell.
float ringField(vec2 p, float cell, float speed) {
  vec2 g = floor(p / cell);
  float acc = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = g + vec2(float(i), float(j));
      float seed = hash21(c);
      vec2 centre = (c + vec2(hash21(c + 3.1), hash21(c + 7.7))) * cell;
      float period = 3.0 + seed * 4.0;
      float age = mod(uTime + seed * period, period);
      float radius = age * speed;
      float d = length(p - centre);
      float ring = sin((d - radius) * 9.0) * exp(-abs(d - radius) * 2.6);
      acc += ring * (1.0 - age / period) * step(d, cell * 1.2);
    }
  }
  return acc;
}

void main() {
  float h = texture2D(uHeightMap, vUv).r * 4.0 - 2.0;      // terrain height under this pixel
  float depth = clamp(-h, 0.0, 2.0);                        // metres of water above the bed
  if (h > 0.06) discard;                                    // dry land

  vec2 p = vWorld.xz;
  float swell = fbm3(p * 0.22 + vec2(uTime * 0.12, uTime * 0.07)) - 0.5;
  float chop = vnoise(p * 1.4 - vec2(uTime * 0.35, 0.0)) - 0.5;
  float rings = ringField(p, 7.0, 1.1) * 0.55;

  // Player wake: a single strong expanding ring.
  float age = uTime - uRippleOrigin.z;
  if (age > 0.0 && age < 2.5) {
    float d = length(p - uRippleOrigin.xy);
    rings += sin((d - age * 2.4) * 7.0) * exp(-abs(d - age * 2.4) * 1.8) * (1.0 - age / 2.5) * 1.4;
  }

  float surface = swell * 0.6 + chop * 0.25 + rings;

  vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 1.3, depth));
  // Banded ripple shading keeps it painterly rather than glossy.
  col += floor(surface * 4.0 + 0.5) / 4.0 * 0.07;

  // Glints: quantised to a 1/6 m grid so they sparkle like pixel art.
  vec2 q = floor(p * 6.0) / 6.0;
  float glint = vnoise(q * 2.3 + vec2(uTime * 0.5, -uTime * 0.31)) + surface * 0.35;
  col += uFoam * step(0.83, glint) * 0.38 * (0.4 + 0.6 * uSunDir.y);

  // Foam: lapping band at the shore + lace where rings crest in the shallows.
  float lap = sin(uTime * 1.3 + vnoise(p * 0.6) * 6.2831) * 0.07;
  float shore = 1.0 - smoothstep(0.02, 0.26 + lap, depth);
  float lace = step(0.52, vnoise(p * 3.2 + vec2(0.0, uTime * 0.25)) * shore + shore * 0.35);
  col = mix(col, uFoam, clamp(lace * 0.85 + step(0.9, rings) * 0.3 * (1.0 - smoothstep(0.2, 0.9, depth)), 0.0, 1.0));

  float alpha = mix(0.55, 0.93, smoothstep(0.0, 0.9, depth));
  gl_FragColor = vec4(col, max(alpha, lace));
}
`;
