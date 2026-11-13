import { glsl, NOISE_GLSL } from './glsl';

/**
 * HD-2D terrain: painted albedo from the bootstrapper, chunky world-space
 * detail grain, banded toon sunlight, slope rock, wet shoreline.
 * Depth fog is applied in the tilt-shift post pass, not here.
 */
export const terrainVertex = glsl`
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const terrainFragment = glsl`
uniform sampler2D uMap;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShadeColor;
uniform float uWaterLevel;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
${NOISE_GLSL}
void main() {
  vec3 albedo = texture2D(uMap, vUv).rgb;

  // World-space pixel grain: 4 "texels" per metre, quantised to 3 steps.
  float grain = hash21(floor(vWorld.xz * 4.0));
  float clump = vnoise(vWorld.xz * 0.9);
  albedo *= 0.94 + floor((grain * 0.55 + clump * 0.45) * 3.0) * 0.04;

  vec3 n = normalize(vNormal);
  // Steep faces read as exposed rock.
  float slope = 1.0 - n.y;
  albedo = mix(albedo, vec3(0.47, 0.44, 0.45) * (0.9 + grain * 0.15), smoothstep(0.22, 0.42, slope));

  // Three-band toon lambert with a cool ambient shade.
  float ndl = dot(n, normalize(uSunDir)) * 0.5 + 0.5;
  float band = floor(ndl * 3.0 + 0.5) / 3.0;
  vec3 lit = albedo * mix(uShadeColor, uSunColor, mix(ndl, band, 0.65));

  // Wet sand / submerged darkening near the water line.
  float wet = 1.0 - smoothstep(uWaterLevel - 0.1, uWaterLevel + 0.45, vWorld.y);
  lit *= mix(1.0, 0.72, wet);
  float under = 1.0 - smoothstep(uWaterLevel - 1.4, uWaterLevel, vWorld.y);
  lit = mix(lit, vec3(0.13, 0.26, 0.36), under * 0.75);

  gl_FragColor = vec4(lit, 1.0);
}
`;
