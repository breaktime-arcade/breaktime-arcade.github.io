// 지진 설계사 - 게임 화면과 조작
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  Structure, Quake, PARTS, BAY_W, STORY_H, floatingParts, designCost,
  SETTLE_TIME, AFTER_TIME, makeRng,
} from './physics.js';
import { LEVELS } from './levels.js';

const $ = (id) => document.getElementById(id);
const DEPTH = 2.4;          // 앞뒤 골조 사이 거리
const FZ = DEPTH / 2;       // 앞쪽 골조의 z 위치
const DT = 1 / 60;

/* ───────── 저장 ───────── */
const SAVE_KEY = 'eqArchitect.v1';
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; }
}
const save = loadSave();
save.stars = save.stars || [];
save.designs = save.designs || {};
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 저장 불가 환경 */ }
}

/* ───────── 소리 ───────── */
const audio = {
  ctx: null, on: !save.muted, noise: null, rumble: null, rumbleGain: null, lastCrack: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.on ? 0.8 : 0;
    this.master.connect(this.ctx.destination);
  },
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.value = v ? 0.8 : 0;
  },
  blip(freq, dur = 0.08, type = 'sine', vol = 0.15, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  crack(heavy) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCrack < 0.05) return;
    this.lastCrack = now;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = heavy ? 700 : 1600 + Math.random() * 800; f.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(heavy ? 0.7 : 0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.35 : 0.16));
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(now, Math.random()); s.stop(now + 0.4);
  },
  startRumble() {
    if (!this.ctx || this.rumble) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 110;
    const g = this.ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start();
    this.rumble = s; this.rumbleGain = g;
  },
  setRumble(v) { if (this.rumbleGain) this.rumbleGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); },
  stopRumble() {
    if (!this.rumble) return;
    try { this.rumble.stop(); } catch (e) { /* 이미 멈춤 */ }
    this.rumble = null; this.rumbleGain = null;
  },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.18), i * 110)); },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.16), i * 160)); },
};

/* ───────── 3D 장면 ───────── */
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd9f1fb, 45, 110);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enableDamping = true;
controls.enablePan = false;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 6;
controls.maxDistance = 70;

scene.add(new THREE.HemisphereLight(0xffffff, 0xc9b28a, 1.15));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.7);
sun.position.set(9, 22, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 20, bottom: -4, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const gradTex = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
gradTex.needsUpdate = true;
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradTex, ...extra });

const COLORS = {
  column: new THREE.Color(0xf2994a), beam: new THREE.Color(0xf6c344), brace: new THREE.Color(0x3cb4a0),
  slab: new THREE.Color(0xfff1d6), iso: new THREE.Color(0x8e6bd8), danger: new THREE.Color(0xe5484d),
};
const THICK = { column: 0.26, beam: 0.24, brace: 0.13 };
const geoBox = new THREE.BoxGeometry(1, 1, 1);

// 땅과 주변 풍경
const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 48), toon(0xa6d982));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.42;
ground.receiveShadow = true;
scene.add(ground);

const plot = new THREE.Group();   // 지진과 함께 흔들리는 부지
scene.add(plot);
const decor = new THREE.Group();
scene.add(decor);

function makeTree(x, z, s) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.9 * s, 6), toon(0x9b6b43));
  trunk.position.y = 0.45 * s;
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 * s, 0), toon(0x6cbf5a));
  leaf.position.y = 1.35 * s;
  [trunk, leaf].forEach(m => { m.castShadow = true; g.add(m); });
  g.position.set(x, -0.42, z);
  return g;
}
function makeHouse(x, z, s, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geoBox, toon(color));
  body.scale.set(1.6 * s, 1.1 * s, 1.4 * s);
  body.position.y = 0.55 * s;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25 * s, 0.8 * s, 4), toon(0xd9634c));
  roof.position.y = 1.5 * s; roof.rotation.y = Math.PI / 4;
  [body, roof].forEach(m => { m.castShadow = true; g.add(m); });
  g.position.set(x, -0.42, z);
  return g;
}
function buildDecor(halfW) {
  decor.clear();
  const rng = makeRng(99);
  const houseColors = [0xfff3d6, 0xd7ecff, 0xffe0ec, 0xe8f5d0];
  for (let k = 0; k < 26; k++) {
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * (halfW + 3 + rng() * 16);
    const z = -3 - rng() * 22;
    if (rng() < 0.3) decor.add(makeHouse(x, z, 0.8 + rng() * 0.7, houseColors[k % 4]));
    else decor.add(makeTree(x, z, 0.8 + rng() * 0.8));
  }
  for (let k = 0; k < 8; k++) {
    const x = (rng() - 0.5) * 50, z = 4 + rng() * 10;
    if (Math.abs(x) > halfW + 3) decor.add(makeTree(x, z, 0.7 + rng() * 0.5));
  }
}

const clouds = new THREE.Group();
scene.add(clouds);
(function buildClouds() {
  const rng = makeRng(5);
  const mat = toon(0xffffff);
  for (let c = 0; c < 7; c++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.9 + rng() * 0.8, 10, 8), mat);
      m.position.set(k * 1.1 - 1.6, rng() * 0.5, rng() * 0.6);
      g.add(m);
    }
    g.position.set((rng() - 0.5) * 70, 15 + rng() * 9, -30 - rng() * 20);
    g.userData.speed = 0.2 + rng() * 0.4;
    clouds.add(g);
  }
})();

// 입주민 얼굴 텍스처
function faceTexture(kind, bg) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3b2f2a';
  if (kind === 'happy') {
    g.beginPath(); g.arc(42, 56, 9, 0, Math.PI * 2); g.arc(86, 56, 9, 0, Math.PI * 2); g.fill();
    g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = '#3b2f2a';
    g.beginPath(); g.arc(64, 74, 16, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  } else {
    g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = '#3b2f2a';
    g.beginPath(); g.moveTo(32, 46); g.lineTo(50, 58); g.moveTo(32, 64); g.lineTo(50, 54);
    g.moveTo(96, 46); g.lineTo(78, 58); g.moveTo(96, 64); g.lineTo(78, 54); g.stroke();
    g.beginPath(); g.ellipse(64, 88, 10, 13, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(255,120,120,.55)';
  g.beginPath(); g.ellipse(26, 76, 9, 6, 0, 0, Math.PI * 2); g.ellipse(102, 76, 9, 6, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const RESIDENT_COLORS = ['#ffd6a5', '#cdeac0', '#bde0fe', '#ffc8dd', '#e2d0ff'];
const residentLooks = RESIDENT_COLORS.map(bg => {
  const body = toon(new THREE.Color(bg));
  const happy = toon(0xffffff, { map: faceTexture('happy', bg) });
  const scared = toon(0xffffff, { map: faceTexture('scared', bg) });
  return { body, happy, scared };
});
const residentGeo = new THREE.BoxGeometry(0.44, 0.44, 0.44);

// 먼지 효과
const dustTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const dust = [];
for (let k = 0; k < 70; k++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: 0xd8c6a8, transparent: true, depthWrite: false, opacity: 0 }));
  s.visible = false; scene.add(s);
  dust.push({ s, life: 0, vx: 0, vy: 0, vz: 0 });
}
let dustIdx = 0;
function puff(x, y, n = 4) {
  for (let k = 0; k < n; k++) {
    const d = dust[dustIdx++ % dust.length];
    d.s.position.set(x + (Math.random() - 0.5) * 0.5, y, (Math.random() - 0.5) * DEPTH * 1.2);
    d.vx = (Math.random() - 0.5) * 1.6; d.vy = Math.random() * 1.2; d.vz = (Math.random() - 0.5) * 1.6;
    d.life = 1; d.s.visible = true;
  }
}
function updateDust(dt) {
  for (const d of dust) {
    if (d.life <= 0) continue;
    d.life -= dt * 0.9;
    d.s.position.x += d.vx * dt; d.s.position.y += d.vy * dt; d.s.position.z += d.vz * dt;
    const sc = 0.5 + (1 - d.life) * 1.6;
    d.s.scale.set(sc, sc, sc);
    d.s.material.opacity = Math.max(0, d.life) * 0.75;
    if (d.life <= 0) d.s.visible = false;
  }
}

/* ───────── 게임 상태 ───────── */
let levelIdx = 0;
let level = LEVELS[0];
let design = emptyDesign();
let tool = 'column';
let mode = 'title';          // title | build | sim | result | view
let sim = null;
let speed = 1;

function emptyDesign() { return { columns: new Set(), beams: new Set(), braces: new Map(), isos: new Set() }; }
function serialize(d) { return { c: [...d.columns], b: [...d.beams], r: [...d.braces], s: [...d.isos] }; }
function deserialize(o) {
  const d = emptyDesign();
  if (!o) return d;
  (o.c || []).forEach(k => d.columns.add(k));
  (o.b || []).forEach(k => d.beams.add(k));
  (o.r || []).forEach(([k, t]) => d.braces.set(k, t));
  (o.s || []).forEach(k => d.isos.add(k));
  return d;
}

/* ───────── 부재 메시 ───────── */
const structGroup = new THREE.Group();
scene.add(structGroup);
let meshEntries = [];
let isoEntries = [];
let shownStruct = null;
const boltGeo = new THREE.SphereGeometry(0.15, 10, 8);
const boltMat = toon(0x6b5546);
let bolts = null;

function clearStructMeshes() {
  structGroup.clear();
  for (const e of meshEntries) { if (e.ownMat) { e.front.material.dispose(); } }
  meshEntries = []; isoEntries = [];
}

function showStructure(s, own) {
  clearStructMeshes();
  shownStruct = s;
  let residentCount = 0;
  for (const el of s.elements) {
    const type = el.type;
    const mat = own ? toon(COLORS[type].clone()) : sharedMats[type];
    const front = new THREE.Mesh(geoBox, mat);
    const back = new THREE.Mesh(geoBox, mat);
    front.castShadow = back.castShadow = true;
    structGroup.add(front, back);
    const entry = { el, front, back, ownMat: own, slab: null, residents: [] };
    if (type === 'beam') {
      entry.slab = new THREE.Mesh(geoBox, sharedMats.slab);
      entry.slab.castShadow = true; entry.slab.receiveShadow = true;
      structGroup.add(entry.slab);
      for (let r = 0; r < el.residents; r++) {
        const look = residentLooks[(residentCount++) % residentLooks.length];
        const m = new THREE.Mesh(residentGeo, [look.body, look.body, look.body, look.body, look.happy, look.body]);
        m.castShadow = true;
        m.userData.look = look;
        m.userData.phase = Math.random() * 6;
        structGroup.add(m);
        entry.residents.push(m);
      }
    }
    meshEntries.push(entry);
  }
  for (const n of s.nodes) {
    if (!n.iso) continue;
    const pads = [FZ, -FZ].map(z => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 16), sharedMats.iso);
      p.castShadow = true; p.position.z = z; structGroup.add(p); return p;
    });
    isoEntries.push({ n, pads });
  }
  const maxBolts = (level.bays + 1) * (level.levels + 1) * 2;
  bolts = new THREE.InstancedMesh(boltGeo, boltMat, maxBolts);
  bolts.castShadow = true;
  structGroup.add(bolts);
  updateStructMeshes(0);
}

const sharedMats = {
  column: toon(COLORS.column), beam: toon(COLORS.beam), brace: toon(COLORS.brace),
  slab: toon(COLORS.slab), iso: toon(COLORS.iso),
};
const tmpColor = new THREE.Color();
const tmpM = new THREE.Matrix4();

function placeBar(mesh, ax, ay, bx, by, z, thick, extend) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, z);
  mesh.rotation.set(0, 0, Math.atan2(dy, dx));
  mesh.scale.set(Math.max(0.01, len + extend), thick, thick);
}

function updateStructMeshes(time, scared = false) {
  const s = shownStruct;
  if (!s) return;
  const N = s.nodes;
  for (const e of meshEntries) {
    const el = e.el;
    const A = N[el.a], B = N[el.b];
    const th = THICK[el.type];
    const ext = el.type === 'brace' ? -0.12 : th * 0.9;
    placeBar(e.front, A.x, A.y, B.x, B.y, FZ, th, ext);
    placeBar(e.back, A.x, A.y, B.x, B.y, -FZ, th, ext);
    if (e.ownMat) {
      const base = COLORS[el.type];
      if (el.broken) tmpColor.copy(base).multiplyScalar(0.62);
      else {
        const r = Math.min(1, Math.max(0, (el.con.ratio - 0.3) / 0.7));
        tmpColor.copy(base).lerp(COLORS.danger, r);
      }
      e.front.material.color.copy(tmpColor);
    }
    if (e.slab) {
      const ang = Math.atan2(B.y - A.y, B.x - A.x);
      const len = Math.hypot(B.x - A.x, B.y - A.y);
      e.slab.position.set((A.x + B.x) / 2, (A.y + B.y) / 2 + 0.06, 0);
      e.slab.rotation.set(0, 0, ang);
      e.slab.scale.set(len + 0.1, 0.12, DEPTH);
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      e.residents.forEach((m, k) => {
        const t = k === 0 ? 0.3 : 0.68;
        const z = k === 0 ? 0.35 : -0.3;
        const hop = mode === 'build' ? Math.max(0, Math.sin(time * 3 + m.userData.phase)) * 0.06 : 0;
        const off = 0.12 + 0.22 + hop;
        m.position.set(A.x + (B.x - A.x) * t + nx * off, A.y + (B.y - A.y) * t + ny * off, z);
        m.rotation.set(0, 0, ang);
        const look = m.userData.look;
        const want = scared ? look.scared : look.happy;
        if (m.material[4] !== want) { m.material[4] = want; }
      });
    }
  }
  for (const it of isoEntries) {
    const gx = it.n.x0 + s.groundX;
    it.pads.forEach(p => { p.position.x = (it.n.x + gx) / 2; p.position.y = 0.1; });
  }
  // 접합부 볼트
  const used = new Set();
  for (const c of s.cons) {
    if (c.broken || c.virtual || c.debris) continue;
    used.add(c.a); used.add(c.b);
  }
  let k = 0;
  for (const id of used) {
    const n = N[id];
    if (k + 2 > bolts.count) break;
    tmpM.makeTranslation(n.x, n.y, FZ); bolts.setMatrixAt(k++, tmpM);
    tmpM.makeTranslation(n.x, n.y, -FZ); bolts.setMatrixAt(k++, tmpM);
  }
  for (let r = k; r < bolts.count; r++) { tmpM.makeScale(0, 0, 0); bolts.setMatrixAt(r, tmpM); }
  bolts.instanceMatrix.needsUpdate = true;
}

/* ───────── 설계 보조 표시(격자, 입주층 선) ───────── */
const guideGroup = new THREE.Group();
scene.add(guideGroup);
let plotMesh = null;

function textSprite(text, color, bg) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = '44px Jua, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 36;
  c.width = w; c.height = 64;
  g.font = '44px Jua, sans-serif';
  g.fillStyle = bg;
  const r = 20;
  g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, 64, r); g.arcTo(w, 64, 0, 64, r); g.arcTo(0, 64, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill();
  g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 18, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(w / 64 * 0.34, 0.34, 1);
  s.renderOrder = 10;
  return s;
}

function gx2x(i) { return (i - level.bays / 2) * BAY_W; }

function buildGuides() {
  guideGroup.clear();
  plot.clear();
  const halfW = level.bays * BAY_W / 2;
  plotMesh = new THREE.Mesh(geoBox, toon(0xdccba7));
  plotMesh.scale.set(level.bays * BAY_W + 3.2, 0.42, DEPTH + 2.6);
  plotMesh.position.y = -0.21;
  plotMesh.receiveShadow = true; plotMesh.castShadow = true;
  plot.add(plotMesh);
  // 부지 가장자리 줄무늬
  const edge = new THREE.Mesh(geoBox, toon(0xc4ac80));
  edge.scale.set(level.bays * BAY_W + 3.3, 0.1, DEPTH + 2.7);
  edge.position.y = -0.39;
  plot.add(edge);

  const dotGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xb9a386 });
  const anchorMat = new THREE.MeshBasicMaterial({ color: 0x7a5c3e });
  for (let i = 0; i <= level.bays; i++) {
    for (let j = 0; j <= level.levels; j++) {
      const m = new THREE.Mesh(dotGeo, j === 0 ? anchorMat : dotMat);
      m.position.set(gx2x(i), j * STORY_H, FZ + 0.02);
      if (j === 0) m.scale.setScalar(1.6);
      guideGroup.add(m);
    }
  }
  // 최대 높이 표시
  const capMat = new THREE.LineDashedMaterial({ color: 0xb9a386, dashSize: 0.15, gapSize: 0.15 });
  const capY = level.levels * STORY_H;
  const cap = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-halfW - 0.4, capY + 0.25, FZ), new THREE.Vector3(halfW + 0.4, capY + 0.25, FZ)]), capMat);
  cap.computeLineDistances();
  guideGroup.add(cap);

  // 입주층 선
  const ty = level.target * STORY_H;
  const x0 = gx2x(level.zone[0]) - 0.3, x1 = gx2x(level.zone[1]) + 0.3;
  const lineMat = new THREE.LineDashedMaterial({ color: 0xe5484d, dashSize: 0.28, gapSize: 0.16 });
  for (const z of [FZ + 0.25, -FZ - 0.25]) {
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, ty, z), new THREE.Vector3(x1, ty, z)]), lineMat);
    ln.computeLineDistances();
    guideGroup.add(ln);
  }
  const label = textSprite('입주층', '#ffffff', '#e5484d');
  label.position.set(x0 + 0.55, ty + 0.38, FZ + 0.25);
  guideGroup.add(label);

  buildDecor(halfW);
}

/* ───────── 카메라 ───────── */
let camTween = null;
// 화면 위아래 정보창을 피한 '보이는 영역' 계산
function viewRegion() {
  const H = Math.max(1, canvas.clientHeight);
  let top = 0, bottom = H;
  for (const e of [$('levelInfo'), $('budgetBox')]) top = Math.max(top, e.getBoundingClientRect().bottom + 6);
  const bar = mode === 'sim' || mode === 'result' || mode === 'view' ? $('simPanel') : $('toolbar');
  const r = bar.getBoundingClientRect();
  if (r.height > 0) bottom = Math.min(bottom, r.top - 6);
  if (bottom - top < H * 0.4) { top = 0; bottom = H; }
  return { top, bottom, H };
}
// 보이는 영역의 가운데에 건물이 오도록 화면 중심을 옮김
function applyViewOffset() {
  const { top, bottom, H } = viewRegion();
  const W = Math.max(1, canvas.clientWidth);
  camera.setViewOffset(W, H, 0, -((top + bottom) / 2 - H / 2), W, H);
  camera.updateProjectionMatrix();
}
function buildView() {
  const W = level.bays * BAY_W + 3.6;
  const H = level.levels * STORY_H + 1.4;
  const cy = level.levels * STORY_H / 2 + 0.1;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const reg = viewRegion();
  const usable = Math.max(0.4, (reg.bottom - reg.top) / reg.H);
  const dH = (H / 2) / tanH / usable;
  const dW = (W / 2) / (tanH * camera.aspect);
  const d = Math.max(dH, dW) + FZ;
  return { pos: new THREE.Vector3(0, cy + d * 0.05, d), target: new THREE.Vector3(0, cy, 0) };
}
function simView() {
  const b = buildView();
  const d = b.pos.z * 0.95;
  const a = -0.5;
  return { pos: new THREE.Vector3(Math.sin(a) * d, b.target.y + d * 0.28, Math.cos(a) * d), target: b.target };
}
function tweenCam(v, dur = 0.9) {
  camTween = { fp: camera.position.clone(), ft: controls.target.clone(), tp: v.pos, tt: v.target, t: 0, dur };
}
function jumpCam(v) {
  camTween = null;
  camera.position.copy(v.pos); controls.target.copy(v.target); camera.lookAt(v.target);
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  applyViewOffset();
  if (mode === 'build') jumpCam(buildView());
}
window.addEventListener('resize', resize);

/* ───────── HUD ───────── */
function updateHud() {
  const cost = designCost(design);
  $('budgetText').textContent = `${cost.toLocaleString()} / ${level.budget.toLocaleString()}`;
  const fill = $('budgetFill');
  fill.style.width = Math.min(100, cost / level.budget * 100) + '%';
  fill.style.background = cost <= level.par3 ? '#4caf6a' : cost <= level.par2 ? '#f2b01e' : '#f2994a';
}
function setupHud() {
  $('lvTitle').textContent = level.name;
  $('lvSoil').textContent = level.soil;
  $('lvQuake').textContent = level.intensity;
  $('lvTarget').textContent = `입주층 ${level.target}층`;
  $('starGuide').textContent = `★★★ ${level.par3.toLocaleString()} 이하 · ★★ ${level.par2.toLocaleString()} 이하`;
  const bar = $('budgetBar');
  bar.querySelectorAll('.parMark').forEach(m => m.remove());
  for (const p of [level.par3, level.par2]) {
    const m = document.createElement('div');
    m.className = 'parMark';
    m.style.left = (p / level.budget * 100) + '%';
    bar.appendChild(m);
  }
  document.querySelector('.tool[data-tool="iso"]').classList.toggle('hidden', !level.allowIso);
  if (!level.allowIso && tool === 'iso') setTool('column');
  updateHud();
}

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function shakeEl(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

function showTip(text) {
  $('tipText').textContent = text;
  $('tip').classList.remove('hidden');
}

/* ───────── 설계 편집 ───────── */
function usedNodes() {
  const s = new Set();
  for (const k of design.columns) { const [i, j] = k.split(',').map(Number); s.add(`${i},${j}`); s.add(`${i},${j + 1}`); }
  for (const k of design.beams) { const [i, j] = k.split(',').map(Number); s.add(`${i},${j}`); s.add(`${i + 1},${j}`); }
  for (const [k, t] of design.braces) {
    const [i, j] = k.split(',').map(Number);
    if (t & 1) { s.add(`${i},${j}`); s.add(`${i + 1},${j + 1}`); }
    if (t & 2) { s.add(`${i + 1},${j}`); s.add(`${i},${j + 1}`); }
  }
  return s;
}
function anchored(i, j, used) { return j === 0 || used.has(`${i},${j}`); }

function pickTarget(t, x, y) {
  const gx = x / BAY_W + level.bays / 2, gy = y / STORY_H;
  if (t === 'column') {
    const i = Math.round(gx), j = Math.floor(gy);
    if (i < 0 || i > level.bays || j < 0 || j >= level.levels || Math.abs(gx - i) > 0.38) return null;
    return { kind: 'column', key: `${i},${j}`, i, j };
  }
  if (t === 'beam') {
    const i = Math.floor(gx), j = Math.round(gy);
    if (i < 0 || i >= level.bays || j < 1 || j > level.levels || Math.abs(gy - j) > 0.38) return null;
    return { kind: 'beam', key: `${i},${j}`, i, j };
  }
  if (t === 'brace') {
    const i = Math.floor(gx), j = Math.floor(gy);
    if (i < 0 || i >= level.bays || j < 0 || j >= level.levels) return null;
    return { kind: 'brace', key: `${i},${j}`, i, j };
  }
  if (t === 'iso') {
    const i = Math.round(gx);
    if (i < 0 || i > level.bays || gy > 0.9 || gy < -0.6 || Math.abs(gx - i) > 0.45) return null;
    return { kind: 'iso', key: String(i), i, j: 0 };
  }
  if (t === 'erase') {
    let best = null, bd = 0.5;
    const seg = (kind, key, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(ax + dx * u - x, ay + dy * u - y);
      if (d < bd) { bd = d; best = { kind, key }; }
    };
    for (const k of design.isos) { const i = +k; const d = Math.hypot(gx2x(i) - x, y + 0.05); if (d < 0.45 && d < bd) { bd = d; best = { kind: 'iso', key: k }; } }
    for (const k of design.columns) { const [i, j] = k.split(',').map(Number); seg('column', k, gx2x(i), j * STORY_H, gx2x(i), (j + 1) * STORY_H); }
    for (const k of design.beams) { const [i, j] = k.split(',').map(Number); seg('beam', k, gx2x(i), j * STORY_H, gx2x(i + 1), j * STORY_H); }
    for (const [k, tt] of design.braces) {
      const [i, j] = k.split(',').map(Number);
      if (tt & 1) seg('brace', k, gx2x(i), j * STORY_H, gx2x(i + 1), (j + 1) * STORY_H);
      if (tt & 2) seg('brace', k, gx2x(i + 1), j * STORY_H, gx2x(i), (j + 1) * STORY_H);
    }
    return best;
  }
  return null;
}

// 결과: 'ok' | 'budget' | 'anchor' | 'need-column' | 'none'
function tryAdd(tg) {
  const used = usedNodes();
  const before = designCost(design);
  if (tg.kind === 'column') {
    if (design.columns.has(tg.key)) return 'none';
    if (!anchored(tg.i, tg.j, used) && !used.has(`${tg.i},${tg.j + 1}`)) return 'anchor';
    if (before + PARTS.column.cost > level.budget) return 'budget';
    design.columns.add(tg.key); return 'ok';
  }
  if (tg.kind === 'beam') {
    if (design.beams.has(tg.key)) return 'none';
    if (!used.has(`${tg.i},${tg.j}`) && !used.has(`${tg.i + 1},${tg.j}`)) return 'anchor';
    if (before + PARTS.beam.cost > level.budget) return 'budget';
    design.beams.add(tg.key); return 'ok';
  }
  if (tg.kind === 'iso') {
    if (design.isos.has(tg.key)) return 'none';
    if (!design.columns.has(`${tg.i},0`)) return 'need-column';
    if (before + PARTS.iso.cost > level.budget) return 'budget';
    design.isos.add(tg.key); return 'ok';
  }
  return 'none';
}
function removeTarget(tg) {
  if (tg.kind === 'column') {
    if (!design.columns.delete(tg.key)) return false;
    if (tg.key.endsWith(',0')) design.isos.delete(tg.key.split(',')[0]);
    return true;
  }
  if (tg.kind === 'beam') return design.beams.delete(tg.key);
  if (tg.kind === 'brace') return design.braces.delete(tg.key);
  if (tg.kind === 'iso') return design.isos.delete(tg.key);
  return false;
}
function nextBrace(tg) {
  const cur = design.braces.get(tg.key) || 0;
  return (cur + 1) % 4;
}
function cycleBrace(tg) {
  const cur = design.braces.get(tg.key) || 0;
  const nx = nextBrace(tg);
  if (nx !== 0) {
    const [i, j] = [tg.i, tg.j];
    const used = usedNodes();
    const corners = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
    if (!corners.some(([a, b]) => anchored(a, b, used))) return 'anchor';
    const extra = ((nx === 3 ? 2 : 1) - (cur === 3 ? 2 : cur ? 1 : 0)) * PARTS.brace.cost;
    if (designCost(design) + extra > level.budget) return 'budget';
    design.braces.set(tg.key, nx);
    return 'ok';
  }
  design.braces.delete(tg.key);
  return 'removed';
}

function report(res) {
  if (res === 'budget') { toast('예산이 모자라요! 다른 부재를 줄여 보세요.'); shakeEl($('budgetBox')); audio.blip(160, 0.15, 'square', 0.08); }
  else if (res === 'anchor') { toast('땅이나 이미 놓은 부재에 이어서 놓아야 해요.'); audio.blip(160, 0.15, 'square', 0.08); }
  else if (res === 'need-column') { toast('면진장치는 1층 기둥 밑에만 깔 수 있어요.'); audio.blip(160, 0.15, 'square', 0.08); }
}

function designChanged() {
  save.designs[levelIdx] = serialize(design);
  writeSave();
  showStructure(new Structure(design, level), false);
  updateHud();
}

// 미리보기(고스트)
const ghostGroup = new THREE.Group();
scene.add(ghostGroup);
const ghostOk = new THREE.MeshBasicMaterial({ color: 0x4caf6a, transparent: true, opacity: 0.55, depthWrite: false });
const ghostDel = new THREE.MeshBasicMaterial({ color: 0xe5484d, transparent: true, opacity: 0.55, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0x9a8b7d, transparent: true, opacity: 0.35, depthWrite: false });
function clearGhost() { ghostGroup.clear(); }
function ghostBar(mat, ax, ay, bx, by, th) {
  for (const z of [FZ, -FZ]) {
    const m = new THREE.Mesh(geoBox, mat);
    placeBar(m, ax, ay, bx, by, z, th * 1.35, th);
    ghostGroup.add(m);
  }
}
function drawGhostFor(tg) {
  clearGhost();
  if (!tg) return;
  const used = usedNodes();
  if (tg.kind === 'column') {
    const exists = design.columns.has(tg.key);
    const ok = exists || anchored(tg.i, tg.j, used) || used.has(`${tg.i},${tg.j + 1}`);
    ghostBar(exists ? ghostDel : ok ? ghostOk : ghostBad, gx2x(tg.i), tg.j * STORY_H, gx2x(tg.i), (tg.j + 1) * STORY_H, THICK.column);
  } else if (tg.kind === 'beam') {
    const exists = design.beams.has(tg.key);
    const ok = exists || used.has(`${tg.i},${tg.j}`) || used.has(`${tg.i + 1},${tg.j}`);
    ghostBar(exists ? ghostDel : ok ? ghostOk : ghostBad, gx2x(tg.i), tg.j * STORY_H, gx2x(tg.i + 1), tg.j * STORY_H, THICK.beam);
  } else if (tg.kind === 'brace') {
    const nx = nextBrace(tg);
    const x0 = gx2x(tg.i), x1 = gx2x(tg.i + 1), y0 = tg.j * STORY_H, y1 = (tg.j + 1) * STORY_H;
    if (nx === 0) {
      const cur = design.braces.get(tg.key);
      if (cur & 1) ghostBar(ghostDel, x0, y0, x1, y1, THICK.brace);
      if (cur & 2) ghostBar(ghostDel, x1, y0, x0, y1, THICK.brace);
    } else {
      if (nx & 1) ghostBar(ghostOk, x0, y0, x1, y1, THICK.brace);
      if (nx & 2) ghostBar(ghostOk, x1, y0, x0, y1, THICK.brace);
    }
  } else if (tg.kind === 'iso') {
    const exists = design.isos.has(tg.key);
    const mat = exists ? ghostDel : design.columns.has(`${tg.i},0`) ? ghostOk : ghostBad;
    for (const z of [FZ, -FZ]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.32, 16), mat);
      p.position.set(gx2x(tg.i), 0.1, z);
      ghostGroup.add(p);
    }
  }
}
function drawEraseGhost(tg) {
  clearGhost();
  if (!tg) return;
  if (tg.kind === 'iso') {
    for (const z of [FZ, -FZ]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.32, 16), ghostDel);
      p.position.set(gx2x(+tg.key), 0.1, z); ghostGroup.add(p);
    }
    return;
  }
  const [i, j] = tg.key.split(',').map(Number);
  if (tg.kind === 'column') ghostBar(ghostDel, gx2x(i), j * STORY_H, gx2x(i), (j + 1) * STORY_H, THICK.column);
  if (tg.kind === 'beam') ghostBar(ghostDel, gx2x(i), j * STORY_H, gx2x(i + 1), j * STORY_H, THICK.beam);
  if (tg.kind === 'brace') {
    const t = design.braces.get(tg.key);
    if (t & 1) ghostBar(ghostDel, gx2x(i), j * STORY_H, gx2x(i + 1), (j + 1) * STORY_H, THICK.brace);
    if (t & 2) ghostBar(ghostDel, gx2x(i + 1), j * STORY_H, gx2x(i), (j + 1) * STORY_H, THICK.brace);
  }
}

// 포인터 입력
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pickPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -FZ);
const hit = new THREE.Vector3();
function planePoint(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(pickPlane, hit) ? { x: hit.x, y: hit.y } : null;
}
let paint = null;   // { mode: 'add'|'remove'|'erase', done:Set }

function applyAt(p, first) {
  const tg = pickTarget(tool, p.x, p.y);
  if (tool === 'erase') { drawEraseGhost(tg); } else { drawGhostFor(tg); }
  if (!tg || !paint) return;
  if (paint.done.has(tg.kind + tg.key)) return;
  paint.done.add(tg.kind + tg.key);
  let changed = false;
  if (tool === 'erase') {
    changed = removeTarget(tg);
    if (changed) audio.blip(300, 0.06, 'triangle', 0.12, -120);
  } else if (tool === 'brace') {
    if (!first) return;
    const r = cycleBrace(tg);
    if (r === 'ok' || r === 'removed') { changed = true; audio.blip(r === 'ok' ? 620 : 300, 0.07, 'triangle', 0.12); }
    else report(r);
  } else {
    if (first) {
      const exists = tg.kind === 'column' ? design.columns.has(tg.key) : tg.kind === 'beam' ? design.beams.has(tg.key) : design.isos.has(tg.key);
      paint.mode = exists ? 'remove' : 'add';
    }
    if (paint.mode === 'remove') {
      changed = removeTarget(tg);
      if (changed) audio.blip(300, 0.06, 'triangle', 0.12, -120);
    } else {
      const r = tryAdd(tg);
      if (r === 'ok') { changed = true; audio.blip(tg.kind === 'beam' ? 520 : 440, 0.07, 'triangle', 0.12); }
      else if (first || r === 'budget') { report(r); if (r === 'budget') paint = null; }
    }
  }
  if (changed) {
    designChanged();
    if (tool === 'erase') drawEraseGhost(pickTarget(tool, p.x, p.y)); else drawGhostFor(tg);
  }
}

canvas.addEventListener('pointerdown', (ev) => {
  audio.init();
  if (mode !== 'build') return;
  $('tip').classList.add('hidden');
  const p = planePoint(ev);
  if (!p) return;
  canvas.setPointerCapture(ev.pointerId);
  paint = { mode: 'add', done: new Set() };
  applyAt(p, true);
});
canvas.addEventListener('pointermove', (ev) => {
  if (mode !== 'build') return;
  const p = planePoint(ev);
  if (!p) { clearGhost(); return; }
  if (!paint && ev.pointerType !== 'mouse') return;
  applyAt(p, false);
});
const endPaint = () => { paint = null; };
canvas.addEventListener('pointerup', (ev) => { endPaint(); if (ev.pointerType !== 'mouse') clearGhost(); });
canvas.addEventListener('pointercancel', endPaint);
canvas.addEventListener('pointerleave', () => { if (!paint) clearGhost(); });

function setTool(t) {
  tool = t;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  clearGhost();
}
document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => { audio.init(); setTool(b.dataset.tool); audio.blip(700, 0.04, 'sine', 0.08); }));

$('btnClear').addEventListener('click', () => {
  if (mode !== 'build') return;
  design = emptyDesign();
  designChanged();
  audio.blip(260, 0.12, 'triangle', 0.12, -100);
});

/* ───────── 지진 시뮬레이션 ───────── */
const seismo = $('seismo');
const sctx = seismo.getContext('2d');

function startSim() {
  audio.init();
  if (mode !== 'build') return;
  const missing = [];
  for (let i = level.zone[0]; i < level.zone[1]; i++) if (!design.beams.has(`${i},${level.target}`)) missing.push(i);
  if (missing.length) { toast('입주층(빨간 점선)에 보를 모두 놓아야 주민이 들어올 수 있어요.'); shakeEl($('btnStart')); return; }
  if (floatingParts(design, level) > 0) { toast('땅과 이어지지 않은 부재가 있어요.'); shakeEl($('btnStart')); return; }
  const s = new Structure(design, level);
  sim = { s, q: new Quake(level.quake), phase: 'settle', t: 0, qt: 0, acc: 0, maxDrift: 0, hist: [], failReason: null, cost: designCost(design) };
  mode = 'sim';
  speed = 1;
  $('btnSpeed').textContent = '2배속';
  showStructure(s, true);
  clearGhost();
  guideGroup.visible = false;
  $('toolbar').style.display = 'none';
  $('simPanel').classList.add('show');
  $('tip').classList.add('hidden');
  controls.enabled = true;
  applyViewOffset();
  tweenCam(simView(), 1.1);
  audio.startRumble();
}

function stopSim() {
  audio.stopRumble();
  sim = null;
  mode = 'build';
  plot.position.x = 0;
  guideGroup.visible = true;
  $('toolbar').style.display = '';
  $('simPanel').classList.remove('show');
  $('resultScreen').classList.remove('show');
  controls.enabled = false;
  showStructure(new Structure(design, level), false);
  applyViewOffset();
  tweenCam(buildView(), 0.8);
}

function simStep() {
  const S = sim, s = S.s;
  if (S.phase === 'settle') {
    s.step(DT, null, 0);
    S.t += DT;
    if (s.brokenCount > 0) { S.failReason = 'settle'; S.phase = 'after'; S.qt = level.quake.dur; }
    else if (S.t >= SETTLE_TIME) {
      if (!s.checkTarget().ok) { S.failReason = 'settle'; S.phase = 'after'; S.qt = level.quake.dur; }
      else { S.phase = 'quake'; S.qt = 0; }
    }
    return;
  }
  const q = S.failReason === 'settle' ? null : S.q;
  s.step(DT, q, S.qt);
  S.qt += DT;
  if (S.phase === 'quake') {
    const r = s.checkTarget();
    if (r.maxDrift > S.maxDrift && isFinite(r.maxDrift)) S.maxDrift = r.maxDrift;
    S.hist.push(S.q.accel(S.qt));
    if (S.qt >= level.quake.dur) S.phase = 'after';
  } else if (S.qt >= level.quake.dur + AFTER_TIME) {
    finish();
  }
}

function finish() {
  const S = sim, s = S.s;
  audio.stopRumble();
  const r = s.checkTarget();
  const ok = !S.failReason && r.ok;
  let stars = 0;
  if (ok) stars = 1 + (S.cost <= level.par2 ? 1 : 0) + (S.cost <= level.par3 ? 1 : 0);
  mode = 'result';
  $('phaseText').textContent = ok ? '버텼어요!' : '무너졌어요';
  $('btnSpeed').textContent = '결과 보기';
  if (ok) {
    save.stars[levelIdx] = Math.max(save.stars[levelIdx] || 0, stars);
    writeSave();
  }
  let msg;
  if (ok) {
    msg = '주민들이 모두 무사해요! 🎉';
    if (stars < 3) msg += `<br>예산을 ${level.par3.toLocaleString()} 이하로 쓰면 별 3개를 받을 수 있어요.`;
  } else if (S.failReason === 'settle') msg = '지진이 오기도 전에 건물이 자기 무게를 못 버텼어요.<br>기둥을 더 세우거나 보를 받쳐 주세요.';
  else if (r.reasons.includes('broken')) msg = '입주층 바닥이 부서졌어요.<br>빨갛게 변한 부재 근처를 가새로 보강해 보세요.';
  else if (r.reasons.includes('low')) msg = '건물이 주저앉아 입주층이 내려앉았어요.<br>아래층 기둥과 가새를 튼튼히 해 보세요.';
  else msg = '건물이 너무 많이 기울었어요.<br>가새로 칸을 삼각형으로 나누면 덜 흔들려요.';
  setTimeout(() => {
    if (mode !== 'result') return;
    $('resultTitle').textContent = ok ? '성공!' : '앗, 무너졌어요';
    $('resultTitle').style.color = ok ? '#4caf6a' : '#e5484d';
    $('resultStars').innerHTML = [0, 1, 2].map(k => `<span class="${k < stars ? '' : 'off'}" style="animation-delay:${k * 0.15}s">★</span>`).join('');
    $('resultMsg').innerHTML = msg;
    $('stCost').textContent = S.cost.toLocaleString();
    $('stBroken').textContent = s.brokenCount + '개';
    $('stDrift').textContent = Math.round(S.maxDrift * 100) + 'cm';
    const hasNext = ok && levelIdx < LEVELS.length - 1;
    $('btnNext').style.display = ok ? '' : 'none';
    $('btnNext').textContent = hasNext ? '다음 단계' : '단계 선택';
    $('resultScreen').classList.add('show');
    ok ? audio.win() : audio.lose();
  }, 500);
}

function drawSeismo() {
  const w = seismo.width, h = seismo.height;
  sctx.clearRect(0, 0, w, h);
  sctx.strokeStyle = '#ead9c2'; sctx.lineWidth = 2;
  sctx.beginPath(); sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2); sctx.stroke();
  if (!sim) return;
  const hist = sim.hist;
  const n = 240;
  const start = Math.max(0, hist.length - n);
  const peak = level.quake.amp * Math.pow(2 * Math.PI * level.quake.freq, 2) * 1.6;
  sctx.strokeStyle = '#e5484d'; sctx.lineWidth = 2.5;
  sctx.beginPath();
  for (let k = start; k < hist.length; k++) {
    const x = (k - start) / n * w;
    const y = h / 2 - Math.max(-1, Math.min(1, hist[k] / peak)) * (h / 2 - 4);
    k === start ? sctx.moveTo(x, y) : sctx.lineTo(x, y);
  }
  sctx.stroke();
}

$('btnStart').addEventListener('click', startSim);
$('btnStop').addEventListener('click', () => { if (mode === 'sim' || mode === 'view' || mode === 'result') stopSim(); });
$('btnSpeed').addEventListener('click', () => {
  if (mode === 'view' || mode === 'result') { mode = 'result'; $('resultScreen').classList.add('show'); return; }
  speed = speed === 1 ? 2 : 1;
  $('btnSpeed').textContent = speed === 1 ? '2배속' : '보통 속도';
});
$('btnRetry').addEventListener('click', stopSim);
$('btnView').addEventListener('click', () => {
  mode = 'view';
  $('resultScreen').classList.remove('show');
  $('btnSpeed').textContent = '결과 보기';
  $('phaseText').textContent = '빙글빙글 돌려 보세요';
});
$('btnNext').addEventListener('click', () => {
  if (levelIdx < LEVELS.length - 1) { stopSim(); loadLevel(levelIdx + 1); }
  else { stopSim(); openTitle(); }
});

/* ───────── 단계 선택 ───────── */
function starsHtml(n) { return [0, 1, 2].map(k => `<span class="${k < n ? '' : 'off'}">★</span>`).join(''); }
function openTitle() {
  mode = 'title';
  const list = $('levelList');
  list.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const unlocked = i === 0 || (save.stars[i - 1] || 0) > 0;
    const b = document.createElement('button');
    b.className = 'lvBtn' + (unlocked ? '' : ' locked');
    b.innerHTML = `<span class="n">${unlocked ? '' : '🔒 '}${lv.name}</span>
      <span class="meta">${lv.soil} · ${lv.intensity} · 예산 ${lv.budget.toLocaleString()}</span>
      <span class="stars">${starsHtml(save.stars[i] || 0)}</span>`;
    b.addEventListener('click', () => {
      audio.init();
      if (!unlocked) { toast('앞 단계를 먼저 깨야 열려요.'); return; }
      loadLevel(i);
    });
    list.appendChild(b);
  });
  $('titleScreen').classList.add('show');
}

function loadLevel(i) {
  levelIdx = i;
  level = LEVELS[i];
  design = deserialize(save.designs[i]);
  if (designCost(design) > level.budget) design = emptyDesign();
  $('titleScreen').classList.remove('show');
  $('resultScreen').classList.remove('show');
  mode = 'build';
  setupHud();
  buildGuides();
  guideGroup.visible = true;
  plot.position.x = 0;
  showStructure(new Structure(design, level), false);
  applyViewOffset();
  jumpCam(buildView());
  showTip(level.tip);
  audio.blip(660, 0.08, 'triangle', 0.12);
}

$('btnMenu').addEventListener('click', () => {
  if (mode === 'sim' || mode === 'result' || mode === 'view') stopSim();
  openTitle();
});
$('btnHelp').addEventListener('click', () => { if (mode === 'build') showTip(level.tip); else openTitle(); });
$('tipClose').addEventListener('click', () => $('tip').classList.add('hidden'));
const soundBtn = $('btnSound');
soundBtn.textContent = audio.on ? '🔊' : '🔇';
soundBtn.addEventListener('click', () => {
  audio.init();
  audio.setOn(!audio.on);
  save.muted = !audio.on; writeSave();
  soundBtn.textContent = audio.on ? '🔊' : '🔇';
});

window.addEventListener('keydown', (e) => {
  if (mode === 'build') {
    const map = { '1': 'column', '2': 'beam', '3': 'brace', '4': level.allowIso ? 'iso' : null, '5': 'erase' };
    if (map[e.key]) setTool(map[e.key]);
    if (e.key === 'Enter') startSim();
  } else if (e.key === 'Escape' && (mode === 'sim' || mode === 'view' || mode === 'result')) stopSim();
});

/* ───────── 메인 루프 ───────── */
let last = performance.now();
let clock = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;

  let scared = false;
  let jitter = 0;
  if (mode === 'sim' && sim) {
    sim.acc += dt * speed;
    let n = 0;
    while (sim.acc >= DT && n < 8 && mode === 'sim') { simStep(); sim.acc -= DT; n++; }
    const s = sim.s;
    plot.position.x = s.groundX;
    for (const ev of s.events) { puff(ev.x, ev.y, ev.type === 'brace' ? 3 : 5); audio.crack(ev.type !== 'brace'); }
    s.events.length = 0;
    const env = sim.phase === 'quake' ? sim.q.envelope(sim.qt) : 0;
    scared = env > 0.3 || sim.failReason;
    jitter = env * level.quake.amp * 0.6;
    audio.setRumble(env * 0.9);
    if (sim.phase === 'settle') $('phaseText').textContent = '자중 확인 중…';
    else if (sim.phase === 'quake') $('phaseText').textContent = `${level.intensity} · ${Math.max(0, Math.ceil(level.quake.dur - sim.qt))}초`;
    else if (mode === 'sim') $('phaseText').textContent = sim.failReason ? '무너지는 중…' : '흔들림이 멎는 중…';
    drawSeismo();
  } else if ((mode === 'result' || mode === 'view') && sim) {
    const r = sim.s.checkTarget();
    scared = !r.ok || !!sim.failReason;
  }
  updateStructMeshes(clock, scared);
  updateDust(dt);
  clouds.children.forEach(c => { c.position.x += c.userData.speed * dt; if (c.position.x > 40) c.position.x = -40; });

  if (camTween) {
    camTween.t += dt / camTween.dur;
    const u = Math.min(1, camTween.t);
    const e = u * u * (3 - 2 * u);
    camera.position.lerpVectors(camTween.fp, camTween.tp, e);
    controls.target.lerpVectors(camTween.ft, camTween.tt, e);
    camera.lookAt(controls.target);
    if (u >= 1) camTween = null;
  } else if (controls.enabled) {
    controls.update();
  }
  if (jitter) {
    const ox = (Math.random() - 0.5) * jitter, oy = (Math.random() - 0.5) * jitter;
    camera.position.x += ox; camera.position.y += oy;
    renderer.render(scene, camera);
    camera.position.x -= ox; camera.position.y -= oy;
  } else {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

/* ───────── 시작 ───────── */
function boot() {
  $('loading').remove();
  resize();
  // 타이틀 뒤 배경으로 1단계를 보여 줌
  level = LEVELS[0];
  setupHud();
  buildGuides();
  showStructure(new Structure(deserialize(save.designs[0]), level), false);
  jumpCam(simView());
  openTitle();
  requestAnimationFrame((t) => { last = t; frame(t); });
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot, boot); else boot();
