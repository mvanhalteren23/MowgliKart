import { BILLBOARD_GLSL, glsl } from './glsl';

/**
 * 8-directional BillboardSprite material with UV frame animation.
 * Works for a single Mesh (uniforms) and for InstancedMesh (per-instance
 * attributes `aUvRect` vec4 and `aTint` vec4 = rgb tint + flash amount).
 */
export const spriteVertex = glsl`
uniform vec4 uUvRect;
#ifdef USE_INSTANCING
  attribute vec4 aUvRect;
  attribute vec4 aTint;
#endif
varying vec2 vUv;
varying vec4 vTint;
varying float vLocalY;
${BILLBOARD_GLSL}
void main() {
  mat4 m = bbModel();
  #ifdef USE_INSTANCING
    vec4 r = aUvRect;
    vTint = aTint;
  #else
    vec4 r = uUvRect;
    vTint = vec4(1.0, 1.0, 1.0, 0.0);
  #endif
  vUv = r.xy + uv * r.zw;
  vLocalY = position.y;
  vec3 world = billboardWorld(m, position.xy);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const spriteFragment = glsl`
uniform sampler2D uMap;
uniform vec3 uTint;
uniform float uFlash;
uniform float uOpacity;
uniform vec3 uRim;
varying vec2 vUv;
varying vec4 vTint;
varying float vLocalY;
void main() {
  vec4 texel = texture2D(uMap, vUv);
  if (texel.a < 0.5) discard;
  vec3 col = texel.rgb * uTint * vTint.rgb;
  // Grounding: feet pick up a touch of the ambient shade.
  col *= mix(0.82, 1.0, smoothstep(0.0, 0.3, vLocalY));
  // Warm rim on the upper body, as if lit by a low lantern sun.
  col += uRim * smoothstep(0.55, 1.0, vLocalY) * 0.12;
  float flash = clamp(uFlash + vTint.a, 0.0, 1.0);
  col = mix(col, vec3(1.0), flash);
  // Screen-door fade so sprites can dissolve without leaving the opaque pass.
  if (uOpacity < 0.999) {
    float d = fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.25)) + 0.125);
    if (d > uOpacity) discard;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
