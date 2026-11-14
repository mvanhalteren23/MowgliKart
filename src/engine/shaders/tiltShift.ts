import { glsl } from './glsl';

/**
 * HD-2D lens: tilt-shift depth-of-field + depth fog + sky + grade, one pass.
 *
 * Blur amount is the max of
 *   (a) a screen-space tilt band (top and bottom of frame defocus), and
 *   (b) true depth distance from the focal plane (uFocus, view-space metres),
 * sampled with a 12-tap golden-angle disc. Depth fog and the procedural sky
 * (wherever depth == far) are composited before the blur taps are averaged, so
 * distant hills melt into the horizon. uCombat (0..1) tightens the focal band,
 * deepens the vignette and cools the background for the battle framing.
 */
export const tiltShiftVertex = glsl`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const tiltShiftFragment = glsl`
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;        // 1 / resolution
uniform float uNear;
uniform float uFar;
uniform float uFocus;       // view-space distance of the focal plane (m)
uniform float uFocusRange;  // metres either side that stay sharp-ish
uniform float uMaxBlur;     // px radius at full defocus
uniform float uBand;        // half-height (0..0.5) of the sharp screen band
uniform vec3 uFogColor;
uniform float uFogStart;
uniform float uFogEnd;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uCombat;
uniform float uTime;
varying vec2 vUv;

float viewDist(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
}

vec3 sky(vec2 uv) {
  float t = smoothstep(0.35, 1.0, uv.y);
  vec3 c = mix(uSkyHorizon, uSkyTop, t);
  // soft banded clouds drifting on the horizon
  float band = sin(uv.x * 9.0 + uTime * 0.02) * 0.5 + sin(uv.x * 23.0 - uTime * 0.035) * 0.25;
  c += vec3(0.07, 0.06, 0.05) * smoothstep(0.25, 0.9, band) * (1.0 - t) * smoothstep(0.45, 0.62, uv.y);
  return c;
}

// Scene colour with fog + sky resolved, so blur taps blend finished pixels.
vec3 shade(vec2 uv, out float dist) {
  dist = viewDist(uv);
  vec3 c = texture2D(tColor, uv).rgb;
  float isSky = step(uFar * 0.98, dist);
  float fog = smoothstep(uFogStart, uFogEnd, dist);
  fog = fog * fog * (3.0 - 2.0 * fog);
  // Fog thins toward the top of the frame (we are looking down at the land).
  c = mix(c, uFogColor, fog * 0.9);
  return mix(c, sky(uv), isSky);
}

void main() {
  float dist;
  vec3 centre = shade(vUv, dist);

  float band = mix(uBand, uBand * 0.62, uCombat);
  float tilt = smoothstep(band, 0.5, abs(vUv.y - 0.5));
  float range = mix(uFocusRange, uFocusRange * 0.45, uCombat);
  float dof = clamp(abs(dist - uFocus) / range - 0.35, 0.0, 1.0);
  // Never blur what sits on the focal plane, even at the frame edge.
  float inFocus = 1.0 - clamp(abs(dist - uFocus) / (range * 0.35), 0.0, 1.0);
  float coc = max(tilt * (1.0 - inFocus * 0.85), dof) * uMaxBlur * (1.0 + uCombat * 0.5);

  vec3 acc = centre;
  float wsum = 1.0;
  vec3 glow = vec3(0.0);
  if (coc > 0.6) {
    const float GOLDEN = 2.39996323;
    for (int i = 1; i <= 12; i++) {
      float fi = float(i);
      float r = sqrt(fi / 12.0) * coc;
      vec2 o = vec2(cos(fi * GOLDEN), sin(fi * GOLDEN)) * r * uTexel;
      float d2;
      vec3 s = shade(vUv + o, d2);
      // Sharp foreground must not smear into a blurred background and vice versa.
      float w = mix(1.0, 0.25, step(d2 + range * 0.5, dist) * inFocus);
      acc += s * w;
      wsum += w;
      glow += max(s - 0.72, 0.0);
    }
  }
  vec3 col = acc / wsum;
  col += glow / 12.0 * 0.55;                       // bokeh bloom from bright defocused taps

  // Grade: gentle filmic shoulder, lantern-warm highlights, cool shadows.
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.12 - uCombat * 0.18 * (1.0 - inFocus));
  col = mix(col * vec3(0.94, 0.97, 1.06), col * vec3(1.06, 1.0, 0.92), smoothstep(0.25, 0.8, luma));
  col = col / (1.0 + max(col - 0.85, 0.0));

  vec2 v = vUv - 0.5;
  float vig = 1.0 - dot(v, v) * mix(0.75, 1.35, uCombat);
  col *= clamp(vig, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
`;
