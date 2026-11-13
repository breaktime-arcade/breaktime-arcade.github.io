/*!
 * 작은 마을 성장 일기 — 주민 모델·애니메이션
 * © 쉬는시간 오락실. All rights reserved.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const BODY_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
const matCache = new Map();
const cm = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })); return matCache.get(c); };
const lerpA = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

function tint(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.index) return geo.toNonIndexed();
  return geo;
}
function clean(g) { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(k)) o.deleteAttribute(k); return o; }
const part = (geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0) => { const g = clean(geo); g.scale(sx, sy, sz); if (rx) g.rotateX(rx); g.translate(x, y, z); return tint(g, color); };

// 도구 형상
const PROPS = {};
function buildProps() {
  if (PROPS.hoe) return;
  const wood = '#8a6038', metal = '#b8c0c8';
  const stick = (len) => part(new THREE.CylinderGeometry(0.025, 0.025, len, 5), wood, 0, len / 2, 0);
  PROPS.hoe = mergeGeometries([stick(1.1), part(new THREE.BoxGeometry(0.22, 0.05, 0.16), metal, 0, 1.1, 0.06)]);
  PROPS.axe = mergeGeometries([stick(0.75), part(new THREE.BoxGeometry(0.05, 0.18, 0.22), metal, 0, 0.68, 0.1)]);
  PROPS.pick = mergeGeometries([stick(0.75), part(new THREE.BoxGeometry(0.05, 0.06, 0.5), metal, 0, 0.72, 0)]);
  PROPS.hammer = mergeGeometries([stick(0.45), part(new THREE.BoxGeometry(0.1, 0.1, 0.22), '#555', 0, 0.45, 0)]);
  PROPS.rod = mergeGeometries([stick(1.8), part(new THREE.CylinderGeometry(0.004, 0.004, 1.6, 3), '#ffffff', 0, 1.2, 0.35, 1, 1, 1, 0.4)]);
  PROPS.basket = mergeGeometries([part(new THREE.CylinderGeometry(0.17, 0.13, 0.2, 10), '#c49a5a', 0, -0.05, 0.08), part(new THREE.IcosahedronGeometry(0.08, 0), '#e8553e', 0.05, 0.08, 0.08), part(new THREE.IcosahedronGeometry(0.07, 0), '#ffd23f', -0.05, 0.08, 0.1)]);
  PROPS.book = part(new THREE.BoxGeometry(0.18, 0.24, 0.06), '#7a2a3a', 0, 0, 0.08);
}

export class Villager {
  constructor(p, sim, scene) {
    buildProps();
    this.p = p; this.sim = sim; this.scene = scene;
    this.root = new THREE.Group(); this.root.userData.pid = p.id;
    scene.add(this.root);
    this.stageKey = null; this.vis = 0; this.first = true;
    this.pos = new THREE.Vector3(p.x, 0, p.z); this.yaw = p.face;
    this.phase = Math.random() * 10;
    const el = document.createElement('div'); el.className = 'vl';
    el.innerHTML = `<div class="bubble"></div><div class="emote"></div><div class="tag"></div>`;
    this.el = el; this.bubbleEl = el.querySelector('.bubble'); this.emoteEl = el.querySelector('.emote'); this.tagEl = el.querySelector('.tag');
    this.label = new CSS2DObject(el); this.root.add(this.label);
    this.bubbleT = 0; this.emoteT = 0;
    this.rebuild();
  }
  rebuild() {
    const p = this.p, L = p.look, st = this.sim.stage(p);
    this.stageKey = st + (p.chief ? 'c' : '');
    if (this.body) { this.root.remove(this.body); this.body.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const hair = st === 'elder' ? '#d9d6d0' : L.hair;
    const shirt = st === 'baby' ? '#fff3c4' : L.shirt;
    const parts = [];
    // 몸통·머리
    parts.push(part(new THREE.CapsuleGeometry(0.21, 0.28, 3, 10), shirt, 0, 0.98, 0, 1, 1, 0.82));
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 10), L.pants, 0, 0.72, 0));
    parts.push(part(new THREE.SphereGeometry(0.28, 14, 10), L.skin, 0, 1.47, 0));
    parts.push(part(new THREE.SphereGeometry(0.036, 6, 5), '#1a1a1a', -0.1, 1.49, 0.255, 1, 1.3, 0.6));
    parts.push(part(new THREE.SphereGeometry(0.036, 6, 5), '#1a1a1a', 0.1, 1.49, 0.255, 1, 1.3, 0.6));
    parts.push(part(new THREE.CircleGeometry(0.045, 8), '#ff9a9a', -0.16, 1.4, 0.245));
    parts.push(part(new THREE.CircleGeometry(0.045, 8), '#ff9a9a', 0.16, 1.4, 0.245));
    const s = L.style;
    const cap = (r = 0.3, phi = Math.PI * 0.55) => part(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, phi), hair, 0, 1.49, -0.02, 1, 1, 1, -0.22);
    if (st === 'baby') parts.push(part(new THREE.SphereGeometry(0.1, 8, 6), hair, 0, 1.76, 0));
    else if (s === 'buzz') parts.push(cap(0.29, Math.PI * 0.42));
    else if (s === 'short' || s === 'side') { parts.push(cap()); if (s === 'side') parts.push(part(new THREE.SphereGeometry(0.14, 8, 6), hair, 0.1, 1.72, 0.14, 1.5, 0.6, 1)); }
    else if (s === 'curly') { for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; parts.push(part(new THREE.IcosahedronGeometry(0.11, 0), hair, Math.cos(a) * 0.21, 1.68 + Math.sin(i * 1.7) * 0.04, Math.sin(a) * 0.21 - 0.03)); } parts.push(part(new THREE.IcosahedronGeometry(0.17, 0), hair, 0, 1.76, -0.02)); }
    else if (s === 'long') { parts.push(cap(0.305, Math.PI * 0.6)); parts.push(part(new THREE.BoxGeometry(0.52, 0.52, 0.2), hair, 0, 1.33, -0.16)); }
    else if (s === 'bob') { parts.push(cap(0.31, Math.PI * 0.64)); parts.push(part(new THREE.BoxGeometry(0.46, 0.1, 0.1), hair, 0, 1.66, 0.22)); }
    else if (s === 'bun') { parts.push(cap()); parts.push(part(new THREE.SphereGeometry(0.13, 10, 8), hair, 0, 1.82, -0.1)); }
    else if (s === 'pony') { parts.push(cap()); parts.push(part(new THREE.CapsuleGeometry(0.08, 0.3, 3, 6), hair, 0, 1.5, -0.36, 1, 1, 1, 0.5)); }
    else if (s === 'braid') { parts.push(cap()); for (let i = 0; i < 3; i++) parts.push(part(new THREE.SphereGeometry(0.07, 6, 5), hair, 0, 1.35 - i * 0.11, -0.3)); }
    if (st === 'elder' && p.gender === 'M') parts.push(part(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.4), '#e8e6e0', 0, 1.42, 0.06));
    if (p.chief) { parts.push(part(new THREE.CylinderGeometry(0.2, 0.22, 0.2, 12), '#3a3a42', 0, 1.82, 0)); parts.push(part(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 14), '#3a3a42', 0, 1.72, 0)); parts.push(part(new THREE.CylinderGeometry(0.205, 0.225, 0.05, 12), '#e8553e', 0, 1.75, 0)); }
    if (st === 'teen' || st === 'child') { if ((p.id % 3) === 0) parts.push(part(new THREE.BoxGeometry(0.3, 0.32, 0.12), '#e8553e', 0, 1.0, -0.22)); }
    const body = new THREE.Mesh(mergeGeometries(parts), BODY_MAT); body.castShadow = true;
    const g = new THREE.Group(); g.add(body);
    const mkLimb = (x, y, r, l, color, isArm) => {
      const piv = new THREE.Group(); piv.position.set(x, y, 0);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 3, 6), cm(color)); m.position.y = -l / 2 - r * 0.6; piv.add(m);
      if (isArm) { const h = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 6, 5), cm(L.skin)); h.position.y = -l - r * 1.1; piv.add(h); }
      g.add(piv); return piv;
    };
    this.legL = mkLimb(-0.1, 0.68, 0.075, 0.36, L.pants); this.legR = mkLimb(0.1, 0.68, 0.075, 0.36, L.pants);
    this.armL = mkLimb(-0.27, 1.18, 0.062, 0.3, shirt, true); this.armR = mkLimb(0.27, 1.18, 0.062, 0.3, shirt, true);
    this.prop = new THREE.Mesh(PROPS.hoe, BODY_MAT); this.prop.position.set(0, -0.42, 0.04); this.prop.visible = false; this.armR.add(this.prop);
    this.body = g; this.root.add(g);
    this.scale = { baby: 0.42, child: 0.6, teen: 0.84, adult: 1, elder: 0.94 }[st];
    this.hunch = st === 'elder' ? 0.18 : 0;
    this.label.position.set(0, 2.15, 0);
    this.tagEl.textContent = (p.chief ? '🎖️' : '') + p.given;
    g.traverse(o => { if (o.isMesh) o.userData.pid = p.id; });
  }
  say(text, dur = 2.4) { this.bubbleEl.className = 'bubble show' + (text.startsWith('(') ? ' thought' : ''); this.bubbleEl.textContent = text; this.bubbleT = dur; }
  emote(e) { this.emoteEl.textContent = e; this.emoteEl.classList.remove('pop'); void this.emoteEl.offsetWidth; this.emoteEl.classList.add('pop'); this.emoteT = 1.8; }

  update(dt, map, o) {
    const p = this.p, sim = this.sim;
    const st = sim.stage(p) + (p.chief ? 'c' : '');
    if (st !== this.stageKey) this.rebuild();
    const show = p.alive && !p.inside && !(p.arrival && !p.landed);
    this.vis += ((show ? 1 : 0) - this.vis) * Math.min(1, dt * 6);
    const vis = this.vis > 0.02;
    this.root.visible = vis; this.label.visible = vis && o.labels;
    if (!vis) { this.first = true; return; }
    const snap = this.first || Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 5;
    const k = snap ? 1 : 1 - Math.exp(-dt * 14);
    this.pos.x += (p.x - this.pos.x) * k; this.pos.z += (p.z - this.pos.z) * k;
    let gy = map.h(this.pos.x, this.pos.z);
    // 다리 위 / 강물
    const B = o.bridge;
    if (B && Math.hypot(this.pos.x - B.x, this.pos.z - B.z) < 3.8) gy = Math.max(gy, B.y + 1.1);
    gy = Math.max(gy, o.riverY ? o.riverY(this.pos) : gy);
    this.pos.y = snap ? gy : this.pos.y + (gy - this.pos.y) * (1 - Math.exp(-dt * 12));
    this.first = false;
    this.root.position.copy(this.pos);
    this.yaw = lerpA(this.yaw, p.face, 1 - Math.exp(-dt * 9)); this.root.rotation.y = this.yaw;
    const s = this.scale * (0.6 + 0.4 * this.vis) * 0.9;
    this.root.scale.setScalar(s);

    const anim = p.anim;
    this.phase += dt * (anim === 'run' ? 13 : anim === 'walk' ? 9 : 3);
    const ph = this.phase, sn = Math.sin(ph), cs = Math.cos(ph), t = o.time + p.id * 0.37;
    const T = { lL: 0, lR: 0, aL: 0, aR: 0, aLz: 0.08, aRz: -0.08, bx: this.hunch, by: 0, sit: 0 };
    switch (anim) {
      case 'walk': T.lL = sn * 0.6; T.lR = -sn * 0.6; T.aL = -sn * 0.5; T.aR = sn * 0.5; T.by = Math.abs(cs) * 0.05; break;
      case 'run': T.lL = sn * 1.0; T.lR = -sn * 1.0; T.aL = -sn * 0.9; T.aR = sn * 0.9; T.bx += 0.2; T.by = Math.abs(cs) * 0.1; break;
      case 'talk': T.aR = -0.5 + Math.sin(t * 4) * 0.3; T.aRz = -0.3; T.by = Math.sin(t * 2) * 0.01; break;
      case 'farm': { const w = (Math.sin(t * 4) + 1) / 2; T.aR = -1.6 + w * 1.2; T.aL = -1.4 + w * 1.1; T.bx += 0.25 + w * 0.2; break; }
      case 'harvest': T.bx += 0.7 + Math.sin(t * 3) * 0.1; T.aL = -1.2 + Math.sin(t * 4) * 0.4; T.aR = -1.0 - Math.sin(t * 4) * 0.3; break;
      case 'chop': { const w = Math.pow((Math.sin(t * 6) + 1) / 2, 2); T.aR = -2.6 + w * 2.3; T.aL = -2.4 + w * 2.1; T.bx += w * 0.25; T.lL = 0.15; T.lR = -0.15; break; }
      case 'hammer': { const w = Math.abs(Math.sin(t * 8)); T.aR = -1.6 + w * 0.9; T.aL = -0.8; T.bx += 0.2; break; }
      case 'fish': T.aR = -1.0; T.aL = -0.9; T.aLz = 0.3; T.bx += Math.sin(t * 1.2) * 0.03; break;
      case 'sit': T.sit = 1; T.lL = -1.5; T.lR = -1.5; T.aL = -0.4; T.aR = -0.4; break;
      case 'dance': { T.aL = -2.4 + Math.sin(t * 6) * 0.5; T.aR = -2.4 - Math.sin(t * 6) * 0.5; T.aLz = 0.5; T.aRz = -0.5; T.by = Math.abs(Math.sin(t * 5)) * 0.25; this.root.rotation.y += Math.sin(t * 2.5) * 0.6; break; }
      case 'clap': { const c = Math.abs(Math.sin(t * 9)); T.aL = -1.2; T.aR = -1.2; T.aLz = 0.15 + c * 0.35; T.aRz = -0.15 - c * 0.35; T.by = Math.abs(Math.sin(t * 4)) * 0.08; break; }
      case 'play': T.lL = sn * 0.9; T.lR = -sn * 0.9; T.aL = -2.5; T.aR = -2.5; T.by = Math.abs(Math.sin(t * 7)) * 0.3; break;
      default: T.aL = Math.sin(t * 1.5) * 0.05; T.aR = -Math.sin(t * 1.5) * 0.05; T.by = Math.sin(t * 2) * 0.01;
    }
    const kk = 1 - Math.exp(-dt * (anim === 'walk' || anim === 'run' ? 24 : 10));
    const L = (obj, key, v) => { obj[key] += (v - obj[key]) * kk; };
    L(this.legL.rotation, 'x', T.lL); L(this.legR.rotation, 'x', T.lR); L(this.armL.rotation, 'x', T.aL); L(this.armR.rotation, 'x', T.aR);
    L(this.armL.rotation, 'z', T.aLz); L(this.armR.rotation, 'z', T.aRz); L(this.body.rotation, 'x', T.bx);
    this.sitB = (this.sitB || 0) + (T.sit - (this.sitB || 0)) * kk;
    this.body.position.y = T.by - this.sitB * 0.34;
    // 도구
    const pr = p.prop;
    if (pr && PROPS[pr]) { if (this.prop.geometry !== PROPS[pr]) this.prop.geometry = PROPS[pr]; this.prop.visible = true; this.prop.rotation.x = pr === 'basket' || pr === 'book' ? Math.PI / 2 - 0.2 : pr === 'rod' ? -0.2 : 0; this.prop.rotation.x += pr === 'hoe' || pr === 'axe' || pr === 'pick' || pr === 'hammer' ? -Math.PI / 2 + 0.2 : 0; }
    else this.prop.visible = false;
    // 라벨
    this.label.position.y = 2.15 / Math.max(0.5, this.scale) * (this.scale < 0.7 ? 0.95 : 1) - this.sitB * 0.4;
    const showTag = o.sel === p.id || o.tags;
    this.tagEl.style.display = showTag ? '' : 'none';
    this.tagEl.classList.toggle('sel', o.sel === p.id);
    this.tagEl.style.setProperty('--c', o.famColor(p));
    if (this.bubbleT > 0) { this.bubbleT -= dt; if (this.bubbleT <= 0) this.bubbleEl.className = 'bubble'; }
    if (this.emoteT > 0) { this.emoteT -= dt; if (this.emoteT <= 0) this.emoteEl.classList.remove('pop'); }
  }
  dispose() { this.scene.remove(this.root); this.root.traverse(o => { if (o.geometry && !Object.values(PROPS).includes(o.geometry)) o.geometry.dispose(); }); }
}

// 2D 초상화
export function portrait(p, sim, size = 72) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'); g.scale(size / 96, size / 96);
  const L = p.look, st = sim.stage(p), hair = st === 'elder' ? '#d9d6d0' : L.hair;
  g.fillStyle = L.shirt; g.beginPath(); g.arc(48, 48, 48, 0, 7); g.fill();
  g.save(); g.beginPath(); g.arc(48, 48, 46, 0, 7); g.clip();
  g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(48, 104, 34, 26, 0, 0, 7); g.fill();
  g.fillStyle = hair; if (L.style === 'long') g.fillRect(22, 42, 52, 40);
  const R = st === 'baby' ? 21 : st === 'child' ? 23 : 25;
  g.fillStyle = L.skin; g.beginPath(); g.arc(48, 52, R, 0, 7); g.fill();
  g.fillStyle = hair; g.beginPath();
  if (st === 'baby') g.arc(48, 30, 6, 0, 7);
  else if (L.style === 'curly') { for (let i = 0; i < 9; i++) { const a = Math.PI * (1.02 + i * 0.12); g.moveTo(48 + Math.cos(a) * 24, 48 + Math.sin(a) * 24); g.arc(48 + Math.cos(a) * 24, 48 + Math.sin(a) * 24, 8, 0, 7); } }
  else if (L.style === 'buzz') g.arc(48, 49, R + 0.5, Math.PI * 1.1, Math.PI * 1.9);
  else g.arc(48, 50, R + 2, Math.PI, Math.PI * 2);
  g.fill();
  if (L.style === 'bun' && st !== 'baby') { g.beginPath(); g.arc(48, 22, 9, 0, 7); g.fill(); }
  if (L.style === 'pony' && st !== 'baby') { g.beginPath(); g.ellipse(75, 52, 6, 13, -0.3, 0, 7); g.fill(); }
  if (L.style === 'bob' && st !== 'baby') { g.fillRect(22, 46, 8, 18); g.fillRect(66, 46, 8, 18); }
  if (p.chief) { g.fillStyle = '#3a3a42'; g.fillRect(30, 16, 36, 14); g.fillRect(24, 28, 48, 4); g.fillStyle = '#e8553e'; g.fillRect(30, 25, 36, 3); }
  g.fillStyle = '#1a1a1a'; g.beginPath(); g.ellipse(39, 54, 2.6, 3.4, 0, 0, 7); g.ellipse(57, 54, 2.6, 3.4, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,120,120,.45)'; g.beginPath(); g.arc(33, 62, 4, 0, 7); g.arc(63, 62, 4, 0, 7); g.fill();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 1.8; g.beginPath(); g.arc(48, 61, 5, 0.2, Math.PI - 0.2); g.stroke();
  if (st === 'elder' && p.gender === 'M') { g.fillStyle = '#e8e6e0'; g.beginPath(); g.arc(48, 64, 13, 0.1, Math.PI - 0.1); g.fill(); }
  g.restore();
  if (!p.alive) { g.fillStyle = 'rgba(30,30,40,.45)'; g.beginPath(); g.arc(48, 48, 48, 0, 7); g.fill(); }
  return cv.toDataURL();
}
