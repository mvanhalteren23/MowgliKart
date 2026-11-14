import { BILLBOARD_GLSL, glsl } from './glsl';

/**
 * Instanced foliage cards (grass, flowers, bushes, trees, rocks, reeds) from a
 * single atlas ⇒ one draw call per chunk. Per-instance attributes:
 *   aUvRect vec4  — atlas rect (GL space)
 *   aParams vec4  — x: sway amount, y: phase, z: tint variation (−1..1), w: unused
 * Wind sways card tops; cards near the player bend away from them.
 */
export const foliageVertex = glsl`
uniform float uTime;
uniform vec2 uWind;       // world xz direction × strength (≈ 0..1)
uniform vec3 uPlayer;     // world position of the leader
attribute vec4 aUvRect;
attribute vec4 aParams;
varying vec2 vUv;
varying float vLocalY;
varying float vVar;
${BILLBOARD_GLSL}
void main() {
  mat4 m = bbModel();
  vUv = aUvRect.xy + uv * aUvRect.zw;
  vLocalY = position.y;
  vVar = aParams.z;
  vec3 origin = billboardOrigin(m);
  vec3 world = billboardWorld(m, position.xy);
  float lift = position.y * position.y;
  float gust = sin(uTime * 1.7 + aParams.y + origin.x * 0.31 + origin.z * 0.27)
             + 0.5 * sin(uTime * 3.1 + aParams.y * 1.7);
  float strength = 0.12 + length(uWind) * 0.5;
  world.xz += (normalize(uWind + vec2(0.0001)) * gust * strength) * aParams.x * lift * 0.35;
  // Trample: push tops away from the player within ~1.4 m.
  vec2 away = origin.xz - uPlayer.xz;
  float near = 1.0 - smoothstep(0.2, 1.4, length(away));
  world.xz += normalize(away + vec2(0.0001)) * near * aParams.x * lift * 0.45;
  world.y -= near * aParams.x * lift * 0.18;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const foliageFragment = glsl`
uniform sampler2D uMap;
uniform vec3 uSunColor;
uniform vec3 uShadeColor;
varying vec2 vUv;
varying float vLocalY;
varying float vVar;
void main() {
  vec4 texel = texture2D(uMap, vUv);
  if (texel.a < 0.5) discard;
  vec3 col = texel.rgb * (1.0 + vVar * 0.14);
  col *= mix(mix(uShadeColor, vec3(1.0), 0.55), uSunColor, smoothstep(0.0, 0.7, vLocalY));
  gl_FragColor = vec4(col, 1.0);
}
`;
