import * as THREE from 'three';
import { makeSky } from './Atmosphere.js';
import { buildMountains } from '../track/Scenery.js';
import { mulberry32 } from '../track/TrackSpline.js';

/**
 * The "skybox trick". Everything beyond the track corridor - cloud sky, three ranges of snow-capped peaks, foothills carpeted
 * with thousands of trees, haze - is built ONCE as real geometry (~250k triangles), photographed into a 360-degree cube map,
 * and then thrown away. During the race the headset draws that picture as the background: one textured pass, zero
 * background polygons, however detailed the bake was.
 *
 * A hand-made / AI-generated 360 image can replace the bake: drop an equirectangular JPEG at
 * public/assets/skyboxes/<trackId>.jpg and list the id in the manifest (AssetManager.loadSkybox picks it up).
 */
export function bakeSkybox(gl, session, size = 1024) {
  const th = session.def.theme, rnd = mulberry32((session.def.seed ?? 1) * 7919 + 5);
  const scene = new THREE.Scene(), tmp = [];
  scene.fog = new THREE.Fog(th.fog, 500, 2900); // aerial perspective: far ranges fade toward the horizon colour
  scene.add(new THREE.HemisphereLight(th.sky[0], th.ground, 1.35));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.copy(session.sunDir).multiplyScalar(500); scene.add(sun);
  const sky = makeSky(th, session.sunDir); sky.material.uniforms.time.value = 40; scene.add(sky);
  const far = buildMountains(th); far.traverse((o) => { if (o.material) o.material.fog = true; }); scene.add(far);
  const snow = th.scenery === 'pine', tower = th.scenery === 'tower', palm = th.scenery === 'palm';
  const M = (c) => { const m = new THREE.MeshToonMaterial({ color: c }); tmp.push(m); return m; };
  const groundCol = new THREE.Color(th.ground), rock = new THREE.Color(snow ? 0x8fa6c8 : tower ? 0x6f8f78 : palm ? 0xb9a27a : 0x6aa66a);

  // rolling foothills: a displaced ring of terrain from 250 m out to 1500 m, dipping away below the viewer
  const hillH = (x, z) => { const r = Math.hypot(x, z); return -70 - r * 0.05 + Math.sin(x * 0.006 + 1.3) * 38 + Math.cos(z * 0.0075 - 0.4) * 34 + Math.sin((x + z) * 0.013) * 16 + Math.max(0, r - 700) * 0.22; };
  const ring = new THREE.RingGeometry(180, 1700, 96, 28).rotateX(-Math.PI / 2), rp = ring.attributes.position;
  for (let i = 0; i < rp.count; i++) rp.setY(i, hillH(rp.getX(i), rp.getZ(i)));
  ring.computeVertexNormals(); tmp.push(ring);
  scene.add(new THREE.Mesh(ring, M(groundCol)));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(200, 24).rotateX(-Math.PI / 2), M(groundCol)); floor.position.y = hillH(180, 0) - 2; tmp.push(floor.geometry); scene.add(floor);

  // mid ranges: two extra rings of ridges with caps, between the foothills and the far peaks
  for (let k = 0; k < 2; k++) for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rnd() * 0.3, dist = 900 + k * 320 + rnd() * 220, h = 150 + rnd() * 260 + k * 60, rad = 150 + rnd() * 200;
    const geo = new THREE.ConeGeometry(rad, h, 7 + ((rnd() * 4) | 0), 3); tmp.push(geo);
    const gp = geo.attributes.position; for (let v = 0; v < gp.count; v++) if (gp.getY(v) < h / 2 - 1) { gp.setX(v, gp.getX(v) * (0.85 + rnd() * 0.3)); gp.setZ(v, gp.getZ(v) * (0.85 + rnd() * 0.3)); } // craggy
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M(rock.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.08))); m.position.set(Math.cos(a) * dist, hillH(Math.cos(a) * dist, Math.sin(a) * dist) + h / 2 - 20, Math.sin(a) * dist); scene.add(m);
    if (snow || tower) { const cg = new THREE.ConeGeometry(rad * 0.4, h * 0.4, 7); tmp.push(cg); const cap = new THREE.Mesh(cg, M(0xffffff)); cap.position.copy(m.position); cap.position.y += h * 0.305; scene.add(cap); }
  }

  // forest carpet: thousands of instanced trees on the foothills (denser near, thinning with distance)
  const N = 5200, one = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3(), m4 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  const parts = palm
    ? [[new THREE.CylinderGeometry(0.5, 0.8, 11, 5).translate(0, 5.5, 0), 0x8a6a45], [new THREE.SphereGeometry(4.2, 7, 5).scale(1, 0.45, 1).translate(0, 11.5, 0), 0x3f9a4d]]
    : snow
      ? [[new THREE.ConeGeometry(4.6, 15, 7).translate(0, 9, 0), 0x2f6f4a], [new THREE.ConeGeometry(3.3, 8, 7).translate(0, 15, 0), 0xf4f9ff]]
      : [[new THREE.CylinderGeometry(0.7, 0.9, 6, 5).translate(0, 3, 0), 0x6b4a2a], [new THREE.SphereGeometry(5, 7, 6).translate(0, 9.5, 0), tower ? 0x4d8a55 : 0x4fa04c]];
  const inst = parts.map(([g, c]) => { tmp.push(g); const im = new THREE.InstancedMesh(g, M(0xffffff), N); im.frustumCulled = false; im.userData.base = new THREE.Color(c); scene.add(im); return im; });
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, r = 230 + Math.pow(rnd(), 1.7) * 1150, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.8 + rnd() * 1.3 + r * 0.0012; // slightly oversized far away so the carpet reads
    p.set(x, hillH(x, z) - 0.5, z); q.setFromAxisAngle(up, rnd() * 6.28); one.set(s, s * (0.85 + rnd() * 0.4), s); m4.compose(p, q, one);
    const shade = (rnd() - 0.5) * 0.1;
    for (const im of inst) { im.setMatrixAt(i, m4); im.setColorAt(i, col.copy(im.userData.base).offsetHSL(0, 0, shade)); }
  }
  // a few landmarks so each direction is recognisable
  const lm = (x, z, mesh) => { mesh.position.set(x, hillH(x, z), z); scene.add(mesh); tmp.push(mesh.geometry); };
  for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, r = 300 + rnd() * 500; lm(Math.cos(a) * r, Math.sin(a) * r, new THREE.Mesh((snow ? new THREE.BoxGeometry(16, 9, 12) : tower ? new THREE.CylinderGeometry(5, 7, 30, 6) : new THREE.BoxGeometry(14, 22 + rnd() * 30, 14)).translate(0, snow ? 4 : 12, 0), M(snow ? 0x7a4a2a : tower ? 0x9a8f80 : 0xd8d2c4))); }

  let tris = 0; scene.traverse((o) => { if (o.isMesh) { const g = o.geometry; tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); } });
  const rt = new THREE.WebGLCubeRenderTarget(size, { generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.SRGBColorSpace });
  const cam = new THREE.CubeCamera(4, 6000, rt);
  const prevTM = gl.toneMapping, prevShadow = gl.shadowMap.enabled, prevClear = gl.autoClear;
  gl.toneMapping = THREE.NoToneMapping; gl.shadowMap.enabled = false; gl.autoClear = true;
  cam.update(gl, scene); // six 90-degree views; CubeCamera suspends an active XR session's cameras for the capture
  gl.toneMapping = prevTM; gl.shadowMap.enabled = prevShadow; gl.autoClear = prevClear;
  for (const t of tmp) t.dispose?.();
  sky.geometry.dispose(); sky.material.dispose(); far.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); inst.forEach((im) => im.dispose());

  // swap it in: the live sky dome + mountain meshes are no longer drawn
  if (!session.scene.background?.isTexture) session.scene.background = rt.texture;
  session.sky.visible = false; session.mountains.visible = false;
  session.skybox = rt; session.skyboxTris = Math.round(tris);
  return rt;
}
