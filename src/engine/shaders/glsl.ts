/** Shared GLSL chunks (lead-owned). Gamma-space pipeline: no colour conversion anywhere. */

/** Tag for editor GLSL highlighting; identity at runtime. */
export const glsl = (strings: TemplateStringsArray, ...values: readonly (string | number)[]): string =>
  strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''), '');

export const NOISE_GLSL = glsl`
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s / 0.875;
}
`;

/**
 * Upright (Y-axis) billboard shared by sprites, auras and foliage.
 * The quad geometry spans x ∈ [−0.5, 0.5], y ∈ [0, 1] with its origin at the
 * feet; width/height come from the model (or instance) matrix scale.
 * Declares: billboardOrigin, billboardScale, billboardWorld(vec3 local).
 */
export const BILLBOARD_GLSL = glsl`
mat4 bbModel() {
  #ifdef USE_INSTANCING
    return modelMatrix * instanceMatrix;
  #else
    return modelMatrix;
  #endif
}
vec3 billboardOrigin(mat4 m) { return m[3].xyz; }
vec2 billboardScale(mat4 m) { return vec2(length(m[0].xyz), length(m[1].xyz)); }
vec3 billboardWorld(mat4 m, vec2 local) {
  vec3 camRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  vec2 s = billboardScale(m);
  return billboardOrigin(m) + camRight * local.x * s.x + vec3(0.0, 1.0, 0.0) * local.y * s.y;
}
`;
