import * as THREE from 'three';

/**
 * Headset detail tier helpers. A whole 4.5 km track is built as a handful of huge meshes / instance batches, which is fine
 * for a desktop GPU but far too many vertices for a standalone headset rendering two eyes. These split the static world
 * into spatial chunks that three.js can frustum-cull, and RaceSession hides chunks beyond the fog.
 */
const cellOf = (x, z, cell) => Math.floor(x / cell) + ':' + Math.floor(z / cell);

/** Split one big static mesh into per-cell meshes that share its vertex buffers (only the index differs). */
export function chunkMesh(mesh, cell = 160) {
  const geo = mesh.geometry, pos = geo.attributes.position;
  mesh.updateWorldMatrix(true, false);
  const idx = geo.index ? geo.index.array : null, n = idx ? idx.length : pos.count;
  const buckets = new Map(), v = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx[i] : i;
    v.fromBufferAttribute(pos, a).applyMatrix4(mesh.matrixWorld);
    const k = cellOf(v.x, v.z, cell);
    let b = buckets.get(k); if (!b) buckets.set(k, (b = []));
    b.push(a, idx ? idx[i + 1] : i + 1, idx ? idx[i + 2] : i + 2);
  }
  if (buckets.size < 2) return [];
  const out = [], parent = mesh.parent, box = new THREE.Box3();
  for (const list of buckets.values()) {
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, attr);
    g.setIndex(pos.count > 65535 ? new THREE.Uint32BufferAttribute(list, 1) : new THREE.Uint16BufferAttribute(list, 1));
    box.makeEmpty(); for (const a of list) box.expandByPoint(v.fromBufferAttribute(pos, a));
    g.boundingBox = box.clone(); g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, mesh.material);
    m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
    m.userData = { ...mesh.userData, chunk: true }; m.renderOrder = mesh.renderOrder; m.castShadow = mesh.castShadow; m.receiveShadow = mesh.receiveShadow;
    parent.add(m); out.push(m);
  }
  parent.remove(mesh);
  return out;
}

/** Split an InstancedMesh into per-cell InstancedMeshes (matrices, colours and per-instance attributes follow). */
export function chunkInstanced(mesh, cell = 160) {
  const n = mesh.count, m4 = new THREE.Matrix4(), p = new THREE.Vector3(), buckets = new Map();
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < n; i++) {
    mesh.getMatrixAt(i, m4); p.setFromMatrixPosition(m4).applyMatrix4(mesh.matrixWorld);
    const k = cellOf(p.x, p.z, cell);
    let b = buckets.get(k); if (!b) buckets.set(k, (b = []));
    b.push(i);
  }
  if (buckets.size < 2) { mesh.frustumCulled = true; mesh.computeBoundingSphere(); return [mesh]; }
  const out = [], parent = mesh.parent, inst = Object.entries(mesh.geometry.attributes).filter(([, a]) => a.isInstancedBufferAttribute);
  for (const list of buckets.values()) {
    let geo = mesh.geometry;
    if (inst.length) { // per-instance shader attributes (wind phase etc.) must be re-packed per chunk
      geo = new THREE.BufferGeometry(); geo.index = mesh.geometry.index;
      for (const [name, a] of Object.entries(mesh.geometry.attributes)) {
        if (!a.isInstancedBufferAttribute) { geo.setAttribute(name, a); continue; }
        const arr = new a.array.constructor(list.length * a.itemSize);
        list.forEach((src, j) => { for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = a.array[src * a.itemSize + c]; });
        geo.setAttribute(name, new THREE.InstancedBufferAttribute(arr, a.itemSize));
      }
      geo.boundingBox = mesh.geometry.boundingBox; geo.boundingSphere = mesh.geometry.boundingSphere;
    }
    const c = new THREE.InstancedMesh(geo, mesh.material, list.length), col = new THREE.Color();
    list.forEach((src, j) => { mesh.getMatrixAt(src, m4); c.setMatrixAt(j, m4); if (mesh.instanceColor) { mesh.getColorAt(src, col); c.setColorAt(j, col); } });
    c.instanceMatrix.needsUpdate = true; if (c.instanceColor) c.instanceColor.needsUpdate = true;
    c.position.copy(mesh.position); c.quaternion.copy(mesh.quaternion); c.scale.copy(mesh.scale);
    c.userData = { ...mesh.userData, chunk: true }; c.renderOrder = mesh.renderOrder;
    c.frustumCulled = true; c.computeBoundingSphere();
    parent.add(c); out.push(c);
  }
  parent.remove(mesh); mesh.dispose?.();
  return out;
}

/** Chunk every large static mesh / instance batch under `roots`. Returns [{ obj, center, radius }] for distance culling. */
export function chunkStatic(roots, cell = 160) {
  const big = [];
  for (const r of roots) r.traverse((o) => {
    if (!o.isMesh || o.userData.chunk || o.userData.noChunk) return;
    if (o.isInstancedMesh) { if (o.count > 24) big.push(o); return; }
    const g = o.geometry, tris = (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
    if (tris > 2500 && !o.material?.isShaderMaterial) big.push(o);
  });
  const chunks = [], s = new THREE.Sphere();
  for (const o of big) for (const c of (o.isInstancedMesh ? chunkInstanced(o, cell) : chunkMesh(o, cell))) {
    c.updateWorldMatrix(true, false);
    if (c.isInstancedMesh) { if (!c.boundingSphere) c.computeBoundingSphere(); s.copy(c.boundingSphere); } else s.copy(c.geometry.boundingSphere);
    s.applyMatrix4(c.matrixWorld);
    chunks.push({ obj: c, center: s.center.clone(), radius: s.radius });
  }
  return chunks;
}

/**
 * A stand-in for the THREE namespace whose curved primitives are built with a fraction of the segments.
 * Every procedural model builder takes the namespace as its argument, so passing this in yields the same models at
 * roughly a third of the triangles - the "mobile" asset set used on the headset.
 */
export function liteThree(k = 0.5) {
  const s = (n, min) => Math.max(min, Math.round(n * k));
  const T = { ...THREE }; // plain copy: module namespaces are read-only
  T.SphereGeometry = class extends THREE.SphereGeometry { constructor(r, w = 32, h = 16, ...rest) { super(r, s(w, 7), s(h, 5), ...rest); } };
  T.CylinderGeometry = class extends THREE.CylinderGeometry { constructor(a, b, h, rs = 32, ...rest) { super(a, b, h, s(rs, 6), ...rest); } };
  T.ConeGeometry = class extends THREE.ConeGeometry { constructor(r, h, rs = 32, ...rest) { super(r, h, s(rs, 5), ...rest); } };
  T.TorusGeometry = class extends THREE.TorusGeometry { constructor(r, t, rs = 12, ts = 48, ...rest) { super(r, t, s(rs, 4), s(ts, 10), ...rest); } };
  T.CapsuleGeometry = class extends THREE.CapsuleGeometry { constructor(r, len, cap = 4, rad = 8, ...rest) { super(r, len, s(cap, 2), s(rad, 6), ...rest); } };
  T.CircleGeometry = class extends THREE.CircleGeometry { constructor(r, n = 32, ...rest) { super(r, s(n, 8), ...rest); } };
  T.LatheGeometry = class extends THREE.LatheGeometry { constructor(pts, n = 12, ...rest) { super(pts, s(n, 6), ...rest); } };
  return T;
}
/** Current model-building namespace: full THREE, or the lite one while a headset-tier race is being built. */
export const detail = { T: THREE, lite: null, set(on) { this.T = on ? (this.lite ??= liteThree(0.5)) : THREE; } };
