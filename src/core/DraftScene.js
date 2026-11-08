import * as THREE from 'three';
import { KARTS } from '../registries/KartRegistry.js';
import { CHARACTERS } from '../registries/CharacterRegistry.js';
import { addOutlines, applyToon } from './Toon.js';

const V = THREE.Vector3;
const M = (c, x = {}) => new THREE.MeshToonMaterial({ color: c, ...x });
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Cartoon garage shown behind the pre-race draft cards: the drafting players' karts on turntables. */
export class DraftScene {
  constructor(assets, racers) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2c3a52);
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
    this.t = 0;
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight(0xcfe4ff, 0x4a3a2a, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.position.set(6, 10, 14); sc.add(sun);
    const warm = new THREE.PointLight(0xffc27a, 90, 40); warm.position.set(-6, 7, 4); sc.add(warm);

    // floor + back wall with an open garage door looking onto the road
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), M(0x5b6472)); floor.rotation.x = -Math.PI / 2; sc.add(floor);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.5), M(0xffd23a)); stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, 0.01, -3.2); sc.add(stripe);
    const wallMat = M(0x4f6a86);
    const wall = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), wallMat); m.position.set(x, y, -7); sc.add(m); };
    wall(13, 12, -13.5, 6); wall(13, 12, 13.5, 6); wall(14, 4.5, 0, 9.75);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ map: tex(512, 300, (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h * 0.55); sky.addColorStop(0, '#5db5ff'); sky.addColorStop(1, '#d9f0ff'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = '#79b86a'; g.beginPath(); g.moveTo(0, h * 0.5); g.quadraticCurveTo(w * 0.3, h * 0.3, w * 0.6, h * 0.5); g.quadraticCurveTo(w * 0.8, h * 0.4, w, h * 0.5); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.fillStyle = '#4a4f5c'; g.beginPath(); g.moveTo(w * 0.42, h * 0.5); g.lineTo(w * 0.58, h * 0.5); g.lineTo(w * 0.95, h); g.lineTo(w * 0.05, h); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.setLineDash([22, 18]); g.beginPath(); g.moveTo(w * 0.5, h * 0.5); g.lineTo(w * 0.5, h); g.stroke();
      g.setLineDash([]); g.strokeStyle = '#c9d2dc'; g.lineWidth = 6; g.beginPath(); g.moveTo(w * 0.58, h * 0.5); g.lineTo(w * 0.97, h * 0.85); g.stroke();
    }) })); outside.position.set(0, 4, -7.2); sc.add(outside);
    // pegboard + tools
    const peg = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ map: tex(512, 256, (g, w, h) => {
      g.fillStyle = '#b88a56'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#8c6439'; for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) g.fillRect(x, y, 3, 3);
      const tool = (x, y, len, c, ang) => { g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = '#222'; g.fillRect(-5, -len / 2 - 3, 10, len + 6); g.fillStyle = c; g.fillRect(-3, -len / 2, 6, len); g.fillRect(-9, -len / 2 - 8, 18, 12); g.restore(); };
      [['#d33', 60], ['#3a8dde', 90], ['#e8c13a', 70], ['#aaa', 100], ['#3c3', 50], ['#d33', 85]].forEach(([c, l], i) => tool(50 + i * 80, 100, l, c, (i % 3 - 1) * 0.25));
      g.fillStyle = '#6b6b78'; g.fillRect(40, 190, 420, 10);
    }) })); peg.position.set(-12.5, 5, -6.6); sc.add(peg);
    // workbench, tire stack, toolbox, drum
    const bench = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 2), M(0x7a5532)); bench.position.set(-12, 3, -5.4); sc.add(bench);
    for (const x of [-14.6, -9.4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 1.6), M(0x4b3a2a)); leg.position.set(x, 1.5, -5.4); sc.add(leg); }
    const toolbox = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1, 1), M(0xd9342b)); toolbox.position.set(-11, 3.7, -5.4); sc.add(toolbox);
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.5, 10, 20), M(0x1d1d24)); t.rotation.x = Math.PI / 2; t.position.set(-7.5 + (i % 2) * 0.2, 0.5 + i * 1.0, -4.5); sc.add(t); }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.6, 16), M(0x2f78c7)); drum.position.set(11, 1.3, -5); sc.add(drum);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe9b0 })); lamp.position.set(-5, 10.5, -4); sc.add(lamp);

    // turntables with the drafting players' karts
    this.pods = [];
    const humans = racers.filter((r) => r.isHuman);
    const n = humans.length, gap = 5.4;
    humans.forEach((h, i) => {
      const pod = new THREE.Group();
      pod.position.set((i - (n - 1) / 2) * gap + (n === 1 ? 2.2 : 0), 0, 0);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.25, 28), M(0x394152)); disc.position.y = 0.12; pod.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 6, 40), new THREE.MeshBasicMaterial({ color: [0x44ff88, 0x44aaff, 0xffcc33, 0xff66cc][i] })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.26; pod.add(ring);
      const kart = assets.getKart(KARTS[h.kartId]);
      const seat = kart.getObjectByName('Driver_Seat'), kid = assets.getCharacter(CHARACTERS[h.charId]);
      if (seat) seat.add(kid); else { kid.position.set(0, 0.12, 0.25); kart.add(kid); }
      addOutlines(kart); addOutlines(kid);
      kart.position.y = 0.25 + 0.68; kart.scale.setScalar(1.35);
      pod.add(kart); pod.userData.kart = kart; sc.add(pod); this.pods.push(pod);
    });
    applyToon(sc);
    this.span = Math.max(1, n);
  }
  update(dt, aspect) {
    this.t += dt;
    this.pods.forEach((p, i) => { p.userData.kart.rotation.y = Math.sin(this.t * 0.6 + i) * 0.7 - 0.5; p.userData.kart.position.y = 0.93 + Math.sin(this.t * 2 + i) * 0.03; });
    const w = Math.max(1, this.span);
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1.3 ? 55 : 38;
    const cx = this.pods.length === 1 ? 2.6 : 0;
    this.camera.position.set(cx, 3.2 + w * 0.2, 15 + w * 2.4);
    this.camera.lookAt(cx, -2.6 - w * 0.3, 0); // aim low so the kart sits in the open upper half, above the cards
    this.camera.updateProjectionMatrix();
  }
  dispose() { this.scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); }); }
}
