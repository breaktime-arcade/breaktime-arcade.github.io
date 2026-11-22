/* =========================================================================
   프라이 팩토리: 오토 디펜스 (Fry Factory: Auto Defense)
   - 감자를 캐고 → 껍질 벗기고 → 튀겨서 → 드라이브스루로 파는 가게를 관전
   - 사용자는 카메라만 움직이고, 돈이 모이면 업그레이드를 눌러 자동화
   - 밤 8시~새벽 6시: 변칙성 손님 · 감자 괴물 · 정전 · 레이저 장판 · 로봇 고장
   ========================================================================= */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  buildWorld, makeTextSprite, makeClerk, makeRobot, makeCar, makeWalker,
  makePotato, makeFryBox, L,
} from './world.js';

/* ── 상수 ─────────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (a) => a[(Math.random() * a.length) | 0];
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const fmtShort = (n) => {
  const v = Math.floor(n);
  if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
  if (v >= 100000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  return v.toLocaleString('en-US');
};
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

const DAY_LEN = 92;          // 낮 06:00 → 20:00 (초, 1배속)
const NIGHT_LEN = 64;        // 밤 20:00 → 06:00
const START_MONEY = 45;
const BASE_PRICE = 12;
const SLOT_DUR = 3.6;        // 튀김 1바구니 조리 시간
const SLOT_FRIES = 8;        // 1바구니 = 프라이 8개
const CARRY_FRIES = 6;
const MAX_READY = 66;
const KEY_GOAL = 60;         // 감자 채집 누적 100% 기준

const UPG = [
  { id: 'belt', icon: '📦', name: '컨베이어 벨트', cost: 60, max: 1, dep: [], desc: '마당 감자를 주방으로 자동 이송합니다' },
  { id: 'peeler', icon: '🥣', name: '자동 탈피기', cost: 500, max: 1, dep: ['belt'], desc: '벨트로 온 감자의 껍질을 자동으로 벗깁니다' },
  { id: 'robot', icon: '🤖', name: '감자 로봇', cost: 1000, max: 4, grow: 1.75, dep: ['belt'], desc: '마당 더미에서 감자를 집어 벨트에 올립니다' },
  { id: 'autoFry', icon: '🍟', name: '자동 튀김기', cost: 6000, max: 1, dep: ['peeler'], desc: '벗긴 감자를 자동으로 투입하고 건져냅니다' },
  { id: 'shooter', icon: '🔫', name: '프라이 슈터', cost: 12000, max: 1, dep: ['autoFry'], desc: '창문 자동 서빙 + 밤 변칙 손님 자동 격퇴' },
  { id: 'clerkSpeed', icon: '👟', name: '점원 이속', cost: 260, max: 5, grow: 1.7, dep: [], desc: 'AI 점원 이동 속도 +20%' },
  { id: 'carry', icon: '🧺', name: '운반량', cost: 420, max: 5, grow: 1.7, dep: [], desc: '한 번에 나르는 감자 +1개' },
  { id: 'price', icon: '💹', name: '수익 배율', cost: 1500, max: 3, grow: 2.2, dep: [], desc: '프라이 판매가 1.5배' },
  { id: 'shutter', icon: '🚪', name: '셔터 강화', cost: 800, max: 3, grow: 1.9, dep: [], desc: '셔터 내구도 +40 · 변칙 손님 자동 차단' },
  { id: 'skip', icon: '⏭', name: '다음 날로', cost: 0, max: 99, dep: [], desc: '낮이면 밤으로, 밤이면 아침으로 건너뜁니다' },
];

const ANOM_META = {
  windowMonster: { name: '창문 변칙 손님', icon: '👁️' },
  potatoBeast: { name: '감자 괴물', icon: '🥔' },
  blackout: { name: '정전', icon: '⚡' },
  laser: { name: '레이저 장판', icon: '🔴' },
  robotBreak: { name: '로봇 고장', icon: '🔧' },
};

const PUCKS = [
  { id: 'harvest', icon: '🥔', name: '감자 풍년', desc: '모든 감자 더미를 가득 채웁니다 (+40%)' },
  { id: 'customer', icon: '🚗', name: '단골 손님', desc: '오늘 손님이 1.6배 더 자주 옵니다' },
  { id: 'price', icon: '💰', name: '바삭한 비법', desc: '오늘 프라이 판매가 +25%' },
  { id: 'clerk', icon: '👟', name: '재빠른 발', desc: '오늘 점원 이동 속도 +20%' },
  { id: 'calm', icon: '🕯️', name: '고요한 밤', desc: '오늘 밤 변칙성이 1개 줄어듭니다' },
  { id: 'devil', icon: '😈', name: '악마의 계약', desc: '판매가 2배, 대신 밤 변칙성 +2 · 셔터 -25', curse: true },
];

/* ── 상태 ─────────────────────────────────────────────────────────────── */
const S = {
  ready: false, started: false, paused: false, speed: 1, muted: false,
  money: START_MONEY, day: 1, clock: 6, phase: 'day', dayT: 0, nightT: 0,
  nightMix: 0, up: { belt: 0, peeler: 0, robot: 0, autoFry: 0, shooter: 0, clerkSpeed: 0, carry: 0, price: 0, shutter: 0, skip: 0 },
  peel: [], raw: [], slots: [{ state: 0, t: 0, type: 'n' }, { state: 0, t: 0, type: 'n' }, { state: 0, t: 0, type: 'n' }],
  readyFries: 0, agents: [], robots: [], customers: [], beltItems: [], anomalies: [], shots: [],
  shutterHP: 100, shutterMax: 100, blackout: false, shutterK: 0,
  stats: { harvest: 0, fries: 0, served: 0, earned: 0, nights: 0, handled: 0, sales: 0 },
  keyPct: 0, keyFound: false, clearOpen: false, perm: 0,
  puck: { open: false, cards: [], left: 0, total: 10 },
  puckFx: { price: 1, custMul: 1, clerk: 1, extraNight: 0, nightMinus: 0 },
  custTimer: 3.0, nightEvt: [], nightX: 0, lastThreatKey: '',
  clusterT: 0, spawnIdx: 0,
};

let renderer, scene, camera, controls, W, SOFT = false, GPU_NAME = '';
let camAnim = null, resizeTimer = 0;
const clock = new THREE.Clock();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TMP = new THREE.Vector3();
const pops = $('pops');

/* ── 사운드 (Web Audio 합성) ──────────────────────────────────────────── */
const SFX = {
  ctx: null, master: null, muted: false, last: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  tone(freq, dur, type = 'sine', vol = 0.3, slide = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  },
  coin() { this.tone(1050, 0.09, 'square', 0.16); this.tone(1560, 0.11, 'square', 0.12, 200); },
  serve() { this.tone(660, 0.07, 'triangle', 0.16); },
  upgrade() { this.tone(440, 0.1, 'square', 0.16, 220); setTimeout(() => this.tone(880, 0.16, 'square', 0.14, 300), 90); },
  night() { this.tone(220, 0.5, 'sawtooth', 0.1, -110); },
  alarm() { this.tone(520, 0.12, 'sawtooth', 0.1, 180); },
  shoot() { this.tone(300, 0.06, 'square', 0.12, -160); },
  found() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.14), i * 130)); },
  boo() { this.tone(180, 0.35, 'sawtooth', 0.12, -80); },
};

/* ── 렌더러 · 카메라 ──────────────────────────────────────────────────── */
function defaultCam() {
  const a = innerWidth / innerHeight;
  if (a < 0.85) return { pos: V3(24.2, 24.5, 18.5), target: V3(3.6, 0.7, 0.8), fov: 62 };
  if (a < 1.25) return { pos: V3(23, 22, 26), target: V3(1.2, 0.9, 0.4), fov: 50 };
  return { pos: V3(20, 19, 18.5), target: V3(0.9, 0.9, -1.0), fov: 44 };
}

function initThree() {
  const canvas = $('gl');
  const probe = document.createElement('canvas').getContext('webgl2');
  const dbgInfo = probe && probe.getExtension('WEBGL_debug_renderer_info');
  GPU_NAME = dbgInfo ? String(probe.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)) : '';
  SOFT = /SwiftShader|llvmpipe|Software|ANGLE \(Google/i.test(GPU_NAME);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !SOFT, powerPreference: 'high-performance' });
  renderer.setPixelRatio(SOFT ? 1 : Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  scene = new THREE.Scene();
  const d = defaultCam();
  camera = new THREE.PerspectiveCamera(d.fov, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.copy(d.pos);

  controls = new OrbitControls(camera, canvas);
  controls.target.copy(d.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.85;
  controls.screenSpacePanning = false;
  controls.minDistance = 8;
  controls.maxDistance = 90;
  controls.minPolarAngle = 0.14;
  controls.maxPolarAngle = Math.PI * 0.465;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.addEventListener('start', () => { camAnim = null; });
  controls.update();

  W = buildWorld(THREE, scene);
}

function focusCam(pos, target, dur = 1.0) {
  camAnim = {
    fromP: camera.position.clone(), fromT: controls.target.clone(),
    toP: pos.clone(), toT: target.clone(), t: 0, dur,
  };
}

function resetCam() {
  const d = defaultCam();
  camera.fov = d.fov; camera.updateProjectionMatrix();
  focusCam(d.pos, d.target, 0.8);
}

function applyViewport() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/* ── 캐릭터 · 라벨 준비 ───────────────────────────────────────────────── */
const CLERK_SPOTS = [{ x: 2.4, z: -1.0 }, { x: 5.2, z: -2.6 }];

function spawnClerk(i) {
  const mesh = makeClerk({ color: [0x2f6fb5, 0x2f8f4a][i % 2] });
  scene.add(mesh);
  // 운반 트레이
  const carry = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xd8a24a, roughness: 0.7 }));
  carry.add(tray);
  const box = makeFryBox(); box.position.set(0, 0.03, 0); box.scale.setScalar(0.72); carry.add(box);
  carry.position.set(0, 1.18, 0.3);
  carry.visible = false;
  mesh.add(carry);
  // 감자 운반용 손바구니
  const potBag = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.24, 10),
    new THREE.MeshStandardMaterial({ color: 0xa9763f, roughness: 0.95 }));
  bag.position.y = 0.1; potBag.add(bag);
  for (let k = 0; k < 3; k++) {
    const p = makePotato('normal');
    p.scale.setScalar(0.55);
    p.position.set((k - 1) * 0.12, 0.22, (k % 2) * 0.1 - 0.05);
    potBag.add(p);
  }
  potBag.position.set(-0.34, 0.72, 0.16);
  potBag.visible = false;
  mesh.add(potBag);
  const a = {
    kind: 'clerk', id: 'c' + i, mesh, carryMesh: carry, carryPotMesh: potBag,
    pos: V3(CLERK_SPOTS[i % 2].x, 0, CLERK_SPOTS[i % 2].z),
    speed: 2.75, task: null, carry: 0, carryPot: 0, stun: 0, flee: null,
    walkT: Math.random() * 6, face: 0, actPose: 0, name: '점원' + (i + 1),
  };
  mesh.position.copy(a.pos);
  S.agents.push(a);
  return a;
}

function spawnRobot() {
  const i = S.robots.length;
  const mesh = makeRobot();
  scene.add(mesh);
  const r = {
    kind: 'robot', id: 'r' + i, mesh, pos: V3(L.belt.x + 1.9, 0, L.belt.z0 - 0.6 - i * 0.9),
    speed: 2.35, task: null, broken: false, sparksT: 0, walkT: 0, carryPot: 0, flee: null,
    carryMesh: null, face: 0, actPose: 0, moving: false,
  };
  const c = new THREE.Group();
  const pot = makePotato('normal'); pot.position.y = 0.1; pot.scale.setScalar(0.9); c.add(pot);
  c.visible = false; mesh.add(c); r.carryMesh = c; c.position.set(0, 0.7, 0.34);
  mesh.position.copy(r.pos);
  S.robots.push(r);
  return r;
}

const labels = {};
function initLabels() {
  const mk = (txt, x, y, z, h = 0.6) => {
    const sp = makeTextSprite(txt, { size: 76, color: '#fff3d6', bg: 'rgba(38,20,8,.66)', h });
    sp.position.set(x, y, z);
    scene.add(sp);
    return sp;
  };
  labels.peel = mk('탈피 0', L.peeler.x, 2.25, L.peeler.z + 0.2, 0.56);
  labels.fry = mk('프라이 0', L.fryer.x, 4.55, L.fryer.z, 0.56);
  labels.ready = mk('대기 0', L.ready.x, 1.95, L.ready.z + 0.1, 0.52);
}
const labelCache = {};
function setLabel(key, el, text) {
  if (labelCache[key] === text) return;
  labelCache[key] = text;
  el.userData.setText(text);
}

/* ── 고객 ─────────────────────────────────────────────────────────────── */
const CAR_COLORS = [0x3b6fd4, 0xd8452c, 0xe8c93a, 0x2f8f4a, 0x8a4fb5, 0xdedede, 0x2c3540];

function spawnCustomer(forceWalker) {
  if (S.customers.length >= 7) return null;
  const walker = forceWalker !== undefined ? forceWalker : Math.random() < 0.22;
  const order = rndInt(2, 4);
  const mesh = walker ? makeWalker({ color: pick([0x6a7f9a, 0x9a6a7f, 0x6a9a7f]) }) : makeCar({ color: pick(CAR_COLORS) });
  scene.add(mesh);
  const waitingCars = S.customers.filter((c) => c.kind === 'car' && c.state !== 'leave').length;
  const waitingWalk = S.customers.filter((c) => c.kind === 'walk' && c.state !== 'leave').length;
  const c = {
    kind: walker ? 'walk' : 'car', mesh,
    x: walker ? L.spawn.walk.x : L.spawn.car.x,
    z: walker ? L.spawn.walk.z - Math.random() * 4 : L.spawn.car.z - Math.random() * 6,
    order, remain: order, patience: 42 + Math.random() * 10, wait: 0,
    state: 'arrive', assigned: null, slot: walker ? waitingWalk : waitingCars, paid: 0,
    face: Math.PI, bob: Math.random() * 6,
  };
  c.targetZ = L.window.z - (walker ? c.slot * 1.5 : c.slot * 4.6);
  c.targetX = walker ? 10.15 : L.carStop.x;
  mesh.position.set(c.x, 0, c.z);
  if (walker) mesh.rotation.y = Math.PI;
  S.customers.push(c);
  return c;
}

function firstWaitingCustomer() {
  return S.customers.find((c) => c.state === 'wait' && c.remain > 0 && (!c.assigned || !c.assigned.task));
}

function updateCustomers(dt) {
  // 줄 앞으로 당기기 (앞 손님이 떠나면 뒤 차량이 전진)
  S.relayout = (S.relayout || 0) + dt;
  if (S.relayout > 0.6) {
    S.relayout = 0;
    const cars = S.customers.filter((c) => c.kind === 'car' && c.state !== 'leave');
    cars.forEach((c, i) => {
      const tz = L.window.z - i * 4.6;
      if (Math.abs(c.targetZ - tz) > 0.02) {
        c.targetZ = tz;
        if (c.state === 'wait') c.state = 'arrive';
      }
    });
    const walks = S.customers.filter((c) => c.kind === 'walk' && c.state !== 'leave');
    walks.forEach((c, i) => {
      const tz = L.window.z - i * 1.7;
      if (Math.abs(c.targetZ - tz) > 0.02) {
        c.targetZ = tz;
        if (c.state === 'wait') c.state = 'arrive';
      }
    });
  }
  for (let i = S.customers.length - 1; i >= 0; i--) {
    const c = S.customers[i];
    if (c.state === 'leave') {
      c.z += (c.kind === 'car' ? 17 : 6) * dt;
      c.mesh.position.z = c.z;
      if (c.kind === 'car') c.mesh.position.x = lerp(c.mesh.position.x, L.carStop.x + 0.2, dt * 2);
      if (c.z > 30) { scene.remove(c.mesh); S.customers.splice(i, 1); }
      continue;
    }
    if (c.state === 'arrive') {
      const dz = c.targetZ - c.z, dx = c.targetX - c.x;
      const dist = Math.hypot(dz, dx);
      const sp = (c.kind === 'car' ? 8.5 : 2.4) * dt;
      if (dist < 0.12) {
        c.state = 'wait'; c.wait = 0;
      } else {
        c.x += (dx / dist) * Math.min(sp, dist);
        c.z += (dz / dist) * Math.min(sp, dist);
        if (c.kind === 'car') c.mesh.rotation.y = Math.atan2(dx, dz);
      }
      c.mesh.position.set(c.x, 0, c.z);
      continue;
    }
    // wait
    c.wait += dt;
    c.patience -= dt;
    if (c.kind === 'car') {
      c.mesh.position.y = 0;
      c.mesh.position.x = c.x;
      c.mesh.position.z = c.z;
    } else {
      c.bob += dt * 3;
      c.mesh.position.set(c.x, Math.sin(c.bob) * 0.02, c.z);
    }
    if (c.patience <= 0 && c.state === 'wait') {
      c.state = 'leave';
      if (c.assigned) c.assigned = null;
      pop(c.x, 1.8, c.z, '손님 퇴장…', 'warn');
    }
  }
}

/* ── 머니 · 팝업 · 토스트 ─────────────────────────────────────────────── */
function addMoney(n, at, label) {
  if (!n) return;
  S.money += n;
  S.stats.earned += n;
  if (at) pop(at.x, at.y, at.z, label || ('+$' + fmt(n)), 'money');
  const el = $('cMoney');
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}
function pop(x, y, z, text, cls) {
  if (!camera) return;
  TMP.set(x, y, z).project(camera);
  if (TMP.z > 1 || TMP.z < -1) return;
  const el = document.createElement('div');
  el.className = 'pop ' + (cls || '');
  el.textContent = text;
  el.style.left = ((TMP.x * 0.5 + 0.5) * window.innerWidth).toFixed(1) + 'px';
  el.style.top = ((-TMP.y * 0.5 + 0.5) * window.innerHeight).toFixed(1) + 'px';
  pops.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, ms);
}
let bannerTimer = 0;
function banner(main, sub, ms = 2400) {
  const el = $('banner');
  $('bannerMain').textContent = main;
  $('bannerSub').textContent = sub || '';
  el.classList.remove('hidden', 'show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

/* ── 파티클 ───────────────────────────────────────────────────────────── */
const parts = [];
const partGeo = new THREE.SphereGeometry(0.09, 6, 5);
function burst(x, y, z, color, n = 8, power = 2.2, size = 1) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
    m.position.set(x, y, z);
    m.scale.setScalar(size);
    scene.add(m);
    parts.push({
      mesh: m, life: 0.7 + Math.random() * 0.5, t: 0,
      v: V3(rnd(-1, 1) * power, rnd(0.6, 1.6) * power, rnd(-1, 1) * power),
    });
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life) { scene.remove(p.mesh); p.mesh.material.dispose(); parts.splice(i, 1); continue; }
    p.v.y -= 7 * dt;
    p.mesh.position.addScaledVector(p.v, dt);
    if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.v.y *= -0.35; p.v.x *= 0.7; p.v.z *= 0.7; }
    p.mesh.material.opacity = 1 - p.t / p.life;
    p.mesh.rotation.x += dt * 8;
  }
}

/* ── 생산 라인 ────────────────────────────────────────────────────────── */
function pileRef(type) { return S.piles.find((p) => p.key === type); }

function initPiles() {
  S.piles = W.refs.piles.map((p) => Object.assign(p, {
    stock: p.key === 'normal' ? 260 : p.key === 'gold' ? 16 : 9,
    max: p.key === 'normal' ? 260 : p.key === 'gold' ? 16 : 9,
    regen: p.key === 'normal' ? 1.1 : p.key === 'gold' ? 0.09 : 0.035,
    acc: 0,
  }));
}

function updatePiles(dt) {
  for (const p of S.piles) {
    if (p.stock < p.max) {
      p.acc += dt * p.regen;
      if (p.acc >= 1) { const n = Math.floor(p.acc); p.acc -= n; p.stock = Math.min(p.max, p.stock + n); }
    }
    const ratio = clamp(p.stock / p.max, 0, 1);
    p.mound.scale.y = 0.25 + ratio * 0.75;
    p.mound.visible = p.stock > 0.2;
    setLabel('pile' + p.key, p.label, 'x' + Math.floor(p.stock));
  }
}

function takeFromPile() {
  const normal = pileRef('normal'), gold = pileRef('gold'), crystal = pileRef('crystal');
  let p = normal;
  const r = Math.random();
  if (r < 0.075 && crystal.stock >= 1) p = crystal;
  else if (r < 0.26 && gold.stock >= 1) p = gold;
  if (p.stock < 1) {
    p = [normal, gold, crystal].find((q) => q.stock >= 1);
    if (!p) return null;
  }
  p.stock -= 1;
  return p.key;
}

function beltSpawn(type) {
  const m = makePotato(type === 'normal' ? 'normal' : type);
  m.position.set(L.belt.x, L.beltItemY, L.belt.z0 - 0.3);
  scene.add(m);
  S.beltItems.push({ mesh: m, type, z: L.belt.z0 - 0.3 });
}

function updateBelt(dt) {
  const B = L.belt;
  if (!S.up.belt) {
    W.refs.beltGrp.visible = true;
    W.refs.beltTarp.visible = true;
    W.refs.beltSlats.forEach((s) => { s.visible = false; });
    return;
  }
  W.refs.beltGrp.visible = true; W.refs.beltTarp.visible = false;
  W.refs.beltSlats.forEach((s) => { s.visible = true; });
  const len = B.z0 - B.z1;
  W.refs.beltScroll = (W.refs.beltScroll || 0) + dt * 1.9;
  if (W.refs.beltScroll > 1) W.refs.beltScroll -= 1;
  const n = W.refs.beltSlats.length;
  W.refs.beltSlats.forEach((s, i) => {
    s.position.z = B.z1 + ((i / n) + W.refs.beltScroll) % 1 * len;
  });
  W.refs.beltRollers.forEach((r) => { r.rotation.x += dt * 6; });
  for (let i = S.beltItems.length - 1; i >= 0; i--) {
    const it = S.beltItems[i];
    it.z -= 1.9 * dt;
    it.mesh.position.z = it.z;
    if (it.z <= B.z1 + 0.35) {
      if (S.peel.length < 14) {
        S.peel.push(it.type);
        scene.remove(it.mesh);
        S.beltItems.splice(i, 1);
        burst(B.x, B.y + 0.2, B.z1 + 0.3, 0xd8b078, 3, 1.1, 0.7);
      } else {
        it.z = B.z1 + 0.36;
      }
    }
  }
}

function takeRaw() {
  if (!S.raw.length) return null;
  let idx = S.raw.indexOf('crystal');
  if (idx < 0) idx = S.raw.indexOf('gold');
  if (idx < 0) idx = 0;
  return S.raw.splice(idx, 1)[0];
}

function fryerLoad(slot) {
  if (S.raw.length < 2) return false;
  const picks = [];
  for (let k = 0; k < 2; k++) picks.push(takeRaw());
  const type = picks.includes('crystal') ? 'crystal' : picks.includes('gold') ? 'gold' : 'normal';
  slot.state = 1; slot.t = 0; slot.type = type;
  burst(L.fryer.x + rnd(-1, 1), 1.6, L.fryer.z, 0xffd060, 4, 1.2, 0.6);
  return true;
}

function finishSlot(slot) {
  if (slot.state !== 2) return 0;
  const mult = slot.type === 'crystal' ? 3 : slot.type === 'gold' ? 2 : 1;
  const n = Math.min(SLOT_FRIES * mult, MAX_READY - S.readyFries);
  S.readyFries += n;
  S.stats.fries += n;
  slot.state = 0; slot.t = 0; slot.type = 'n';
  burst(L.fryer.x + rnd(-1, 1), 1.7, L.fryer.z + 0.5, 0xffe08a, 5, 1.4, 0.7);
  if (mult > 1) pop(L.fryer.x, 2.4, L.fryer.z, slot.type === 'crystal' ? '💎 크리스탈 프라이!' : '✨ 황금 프라이!', 'big');
  return n;
}

function updateProduction(dt) {
  updateBelt(dt);
  // 자동 탈피기
  if (S.up.peeler) {
    W.refs.peelerSpeed = (W.refs.peelerSpeed || 0) + dt;
    if (S.peel.length && S.raw.length < 16) {
      W.refs.peelT = (W.refs.peelT || 0) + dt;
      if (W.refs.peelT > 1.15) {
        W.refs.peelT = 0;
        S.raw.push(S.peel.shift());
        burst(L.peeler.x, 1.2, L.peeler.z + 0.6, 0xf0d8a8, 3, 1.1, 0.6);
      }
    }
    W.refs.peelerDrum.rotation.x += dt * (S.peel.length ? 5.2 : 1.1);
  }
  // 조리
  for (const slot of S.slots) {
    if (slot.state === 1) {
      slot.t += dt;
      if (slot.t >= SLOT_DUR) { slot.state = 2; slot.t = SLOT_DUR; }
    }
  }
  // 자동 튀김기
  if (S.up.autoFry) {
    W.refs.autoT = (W.refs.autoT || 0) + dt;
    if (W.refs.autoT > 0.55) {
      W.refs.autoT = 0;
      const free = S.slots.find((s) => s.state === 0);
      if (free && S.raw.length >= 2) fryerLoad(free);
    }
    for (const slot of S.slots) {
      if (slot.state === 2) finishSlot(slot);
    }
  }
  // 슈터 자동 서빙 (낮)
  if (S.up.shooter && S.phase === 'day') {
    W.refs.shooterServeT = (W.refs.shooterServeT || 0) + dt;
    if (W.refs.shooterServeT > 1.25) {
      const c = firstWaitingCustomer();
      if (c && S.readyFries > 0) {
        W.refs.shooterServeT = 0;
        const n = Math.min(CARRY_FRIES, Math.floor(S.readyFries), c.remain);
        S.readyFries -= n;
        shootFries(c, n, () => { serveCustomer(c, n); });
      }
    }
  }
}

/* ── 서빙 ─────────────────────────────────────────────────────────────── */
function unitPrice() {
  return BASE_PRICE * Math.pow(1.5, S.up.price) * (1 + 0.10 * (S.day - 1)) * S.puckFx.price * (1 + S.perm);
}

function serveCustomer(c, n) {
  if (!c || c.remain <= 0 || c.state === 'leave') return 0;
  const give = Math.min(n, c.remain);
  if (give <= 0) return 0;
  c.remain -= give;
  const gain = give * unitPrice();
  c.paid += give;
  addMoney(gain, { x: c.x, y: 2.0, z: c.z });
  S.stats.served += give;
  S.stats.sales++;
  SFX.coin();
  burst(c.x, 1.4, c.z, 0xffd34d, 6, 2.2, 0.8);
  if (c.remain <= 0) {
    c.state = 'leave';
    c.assigned = null;
    pop(c.x, 2.5, c.z, pick(['맛있어요!', '감사합니다!', '또 올게요!', '바삭해요!']), 'good');
  }
  return give;
}

function shootFries(c, n, onHit) {
  const from = V3(L.turret.x, 1.5, L.turret.z);
  const to = V3(c.x, 1.3, c.z);
  spawnShot(from, to, onHit, { n: Math.min(4, Math.max(1, n)), dur: 0.4, arc: 1.5 });
}

/* ── 점원 AI ──────────────────────────────────────────────────────────── */
function carryMax() { return 2 + S.up.carry; }
function clerkSpeed(a) { return a.speed * (1 + 0.2 * S.up.clerkSpeed) * S.puckFx.clerk; }

function makeTask(steps, kind) { return { steps, i: 0, done: false, kind: kind || 'work' }; }

/* ── 컨베이어 벨트 장애물 (우회 경로 · 침입 방지) ──────────────────────────
   world.js 실측 치수
     · 바닥판·프레임·롤러: x = B.x ± (w/2 + 0.16) = -3.81 ~ -2.19, z = -1.7 ~ 8.8
     · 호퍼(1.9 × 1.5, 중심 z = B.z0 + 0.55 = 9.15): x = -3.95 ~ -2.05, z = 8.4 ~ 9.9
     · 벨트 커버 차단봉(z = 8.2)은 호퍼·프레임 안쪽이라 별도 영역이 필요 없음
   양 끝 통행 여유
     · 북단(마당): 벨트 z1 9.9 ↔ 울타리 z 12.0 → 2.10m (충분)
     · 남단(주방): 벨트 z0 -1.7 ↔ 탈피대 z1 -2.4 → 0.70m (몸 폭 0.68m와 거의 같아 통과 불가)
   → 우회는 북단으로만 잡는다.                                                     */
const BELT_BLOCK = { x0: -3.95, x1: -2.05, z0: -1.7, z1: 9.9 };
const AGENT_R = 0.34;                                   // 점원·로봇 몸 반경
// 몸 반경만큼 넓힌 금지 영역 — 점원/로봇의 중심은 이 사각형 안으로 들어가지 않는다
const BELT_NAV = {
  x0: BELT_BLOCK.x0 - AGENT_R, x1: BELT_BLOCK.x1 + AGENT_R,
  z0: BELT_BLOCK.z0 - AGENT_R, z1: BELT_BLOCK.z1 + AGENT_R,
};
const BELT_WAY_Z = BELT_NAV.z1 + 0.3;                   // 북단 우회 통로 z
const BELT_WAY_W = BELT_NAV.x0 - 0.3;                   // 벨트 서쪽 여유 x
const BELT_WAY_E = BELT_NAV.x1 + 0.3;                   // 벨트 동쪽 여유 x
// 호퍼에 감자를 붓는 자리 — 모두 금지 영역 바깥(호퍼에 파묻히지 않게)
const BELT_DROP = { x: L.belt.x, z: L.belt.z0 + 1.9 };              // 점원: 호퍼 북측
const BELT_DROP_ROBOT = { x: L.belt.x + 1.6, z: L.belt.z0 + 1.2 };  // 로봇: 호퍼 동측
const NAVDBG = { detours: 0, pushes: 0 };

function inBeltNav(x, z, r) { return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1; }

// 선분 - 사각형 교차 (Liang–Barsky)
function segHitsRect(ax, az, bx, bz, r) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - r.x0], [dx, r.x1 - ax], [-dz, az - r.z0], [dz, r.z1 - az]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

// 금지 영역 안의 좌표를 가장 가까운 바깥으로 밀어낸다 (목표 보정 · 이동 후 보정 공용)
function beltSafe(x, z) {
  if (!inBeltNav(x, z, BELT_NAV)) return { x, z };
  const e = 0.02;
  const dl = x - BELT_NAV.x0, dr = BELT_NAV.x1 - x;
  const db = z - BELT_NAV.z0, df = BELT_NAV.z1 - z;
  const m = Math.min(dl, dr, db, df);
  if (m === dl) return { x: BELT_NAV.x0 - e, z };
  if (m === dr) return { x: BELT_NAV.x1 + e, z };
  if (m === db) return { x, z: BELT_NAV.z0 - e };
  return { x, z: BELT_NAV.z1 + e };
}

// 현재위치 → 목표 경로가 벨트를 가로지르면 북단 모서리를 경유하는 최단 경로를 돌려준다
function beltPath(sx, sz, gx, gz) {
  if (!segHitsRect(sx, sz, gx, gz, BELT_NAV)) return [];
  const NW = { x: BELT_WAY_W, z: BELT_WAY_Z };
  const NE = { x: BELT_WAY_E, z: BELT_WAY_Z };
  const gE = { x: BELT_WAY_E, z: gz };              // 목표 높이까지 동측으로 내려간 뒤 가로지르기
  const gW = { x: BELT_WAY_W, z: gz };
  const sN = { x: sx, z: BELT_WAY_Z };              // 제자리에서 북쪽으로 빠져나가기
  const gN = { x: gx, z: BELT_WAY_Z };
  let best = null, bestLen = Infinity;
  for (const wps of [[], [NW], [NE], [NW, NE], [NE, NW],
    [NE, gE], [NW, gW], [sN, gN], [NE, NW, gW], [NW, NE, gE]]) {
    const pts = [{ x: sx, z: sz }, ...wps, { x: gx, z: gz }];
    let ok = true, len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      if (segHitsRect(pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, BELT_NAV)) { ok = false; break; }
      len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    }
    if (ok && len < bestLen) { bestLen = len; best = wps; }
  }
  if (best && best.length) NAVDBG.detours++;
  return best || [];
}

function moveTo(a, x, z, dt) {
  const goal = beltSafe(x, z);          // 목표가 금지 영역 안이면 바깥으로 보정 (제자리걸음 방지)
  let nav = a.nav;
  if (!nav || Math.hypot(nav.gx - goal.x, nav.gz - goal.z) > 0.28) {
    nav = a.nav = { gx: goal.x, gz: goal.z, pts: beltPath(a.pos.x, a.pos.z, goal.x, goal.z) };
  }
  while (nav.pts.length && Math.hypot(nav.pts[0].x - a.pos.x, nav.pts[0].z - a.pos.z) < 0.22) nav.pts.shift();
  const hasWp = nav.pts.length > 0;
  const tx = hasWp ? nav.pts[0].x : goal.x;
  const tz = hasWp ? nav.pts[0].z : goal.z;
  const dx = tx - a.pos.x, dz = tz - a.pos.z;
  const d = Math.hypot(dx, dz);
  if (!hasWp && d < 0.09) return true;
  if (d > 1e-6) {
    const step = Math.min(clerkSpeed(a) * dt, d);
    const n = Math.max(1, Math.ceil(step / 0.12));      // 4배속에서도 벨트를 뚫지 않게 잘게 나눠 이동
    const ux = dx / d, uz = dz / d;
    a.moving = true;
    for (let k = 0; k < n; k++) {
      a.pos.x += ux * step / n;
      a.pos.z += uz * step / n;
      //  이동 후 보정: 야간 변칙성·도망·동적 타겟 등 어떤 경우에도 벨트 안으로 들어가지 않는다
      const p = beltSafe(a.pos.x, a.pos.z);
      if (p.x !== a.pos.x || p.z !== a.pos.z) {
        a.pos.x = p.x; a.pos.z = p.z;
        NAVDBG.pushes++;
        nav.pts = beltPath(a.pos.x, a.pos.z, goal.x, goal.z);
        break;
      }
    }
    a.walkT += step * 6.2;
    // 캐릭터는 +z가 정면
    const want = Math.atan2(dx, dz);
    const face = Number.isFinite(a.face) ? a.face : 0;   // faceless 에이전트(NaN 회전) 방지
    let diff = want - face;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    a.face = face + diff * Math.min(1, dt * 12);
    a.mesh.rotation.y = a.face;
  }
  return false;
}

function runTask(a, dt) {
  const t = a.task;
  if (!t) return;
  a.moving = false;
  if (!t._navInit) { t._navInit = true; a.nav = null; }   // 새 작업마다 경로를 새로 계산
  while (t.i < t.steps.length) {
    const st = t.steps[t.i];
    if (st.abort && st.abort()) { abortTask(a); return; }
    if (!st._started) {
      st._started = true;
      st._t = 0;
      if (st.onStart) st.onStart(a);
    }
    if (st.kind === 'goto') {
      const tx = st.dyn ? basketTx(st) : st.x;
      const tz = st.dyn ? basketTz(st) : st.z;
      if (moveTo(a, tx, tz, dt)) st._done = true;
    } else {
      st._t += dt;
      a.actPose = st.kind === 'act' ? Math.min(1, st._t * 4) : 0;
      if (st._t >= st.dur) {
        if (st.onEnd) st.onEnd(a);
        st._done = true;
      }
    }
    if (st._done) { t.i++; a.actPose = 0; continue; }
    break;
  }
  if (t.i >= t.steps.length) { a.task = null; }
}
function basketTx(st) { const p = st.dyn(); return p.x; }
function basketTz(st) { const p = st.dyn(); return p.z; }

function abortTask(a) {
  if (a.carry > 0) { S.readyFries = Math.min(MAX_READY, S.readyFries + a.carry); a.carry = 0; a.carryMesh.visible = false; }
  if (a.carryPotMesh) a.carryPotMesh.visible = false;
  if (a.serveTarget && a.serveTarget.assigned === a) a.serveTarget.assigned = null;
  if (a.carryPot > 0) { a.carryPot = 0; }
  if (a.task && a.task.onAbort) a.task.onAbort();
  a.task = null;
  a.actPose = 0;
}

function taskIdle(a) {
  const spot = CLERK_SPOTS[(a.id.charCodeAt(1) + Math.floor(Math.random() * 3)) % CLERK_SPOTS.length];
  return makeTask([
    { kind: 'goto', x: spot.x + rnd(-0.5, 0.5), z: spot.z + rnd(-0.4, 0.4) },
    { kind: 'wait', dur: rnd(0.8, 2.0) },
  ]);
}

function taskHarvest(pile) {
  const useBelt = !!S.up.belt;
  const drop = useBelt
    ? { x: BELT_DROP.x, z: BELT_DROP.z }              // 호퍼 북측(금지 영역 바깥)
    : { x: L.peeler.x + 1.15, z: L.peeler.z + 0.7 };
  return makeTask([
    { kind: 'goto', x: pile.x + 1.05, z: pile.z + 0.5 },
    {
      kind: 'act', dur: 0.95, onEnd: (a) => {
        const n = Math.min(carryMax(), Math.floor(pile.stock));
        if (n <= 0) { a.carryPot = 0; return; }
        pile.stock -= n; a.carryPot = n; a.carryType = pile.key;
        a.carryPotMesh.visible = true;
        burst(pile.x, 1.2, pile.z, pile.key === 'gold' ? 0xffd34d : pile.key === 'crystal' ? 0x8feaff : 0xd8b078, 4, 1.4, 0.8);
        S.stats.harvest += n;
        addKeyProgress(n);
        SFX.serve();
      },
    },
    { kind: 'goto', x: drop.x, z: drop.z },
    {
      kind: 'act', dur: 0.4, onEnd: (a) => {
        const n = a.carryPot;
        if (n > 0) {
          for (let i = 0; i < n; i++) {
            if (useBelt) beltSpawn(a.carryType || 'normal');
            else if (S.peel.length < 14) S.peel.push(a.carryType || 'normal');
          }
          pop(drop.x, 1.7, drop.z, '+' + n + ' 🥔', 'good');
        }
        a.carryPot = 0; a.carryPotMesh.visible = false;
      },
    },
  ]);
}

function taskPeel() {
  return makeTask([
    { kind: 'goto', x: L.peeler.x + 1.0, z: L.peeler.z + 1.0 },
    {
      kind: 'act', dur: 1.2, onEnd: () => {
        if (S.peel.length && S.raw.length < 16) {
          S.raw.push(S.peel.shift());
          burst(L.peeler.x, 1.35, L.peeler.z + 0.4, 0xf0d8a8, 4, 1.3, 0.7);
        }
      },
    },
  ]);
}

function taskLoad(slot) {
  return makeTask([
    { kind: 'goto', x: L.fryer.x + 1.05, z: L.fryer.z + 1.55 },
    {
      kind: 'act', dur: 0.7, onEnd: () => {
        if (slot.state === 0 && S.raw.length >= 2) fryerLoad(slot);
      },
    },
  ]);
}

function taskUnload(slot) {
  return makeTask([
    { kind: 'goto', x: L.fryer.x + 1.05, z: L.fryer.z + 1.55 },
    { kind: 'act', dur: 0.8, onEnd: () => { if (slot.state === 2) finishSlot(slot); } },
  ]);
}

function taskServe(c) {
  return makeTask([
    { kind: 'goto', x: L.ready.x - 0.95, z: L.ready.z + 0.75 },
    {
      kind: 'act', dur: 0.45, onEnd: (a) => {
        const n = Math.min(CARRY_FRIES, Math.floor(S.readyFries));
        if (n <= 0) { a.carry = 0; return; }
        S.readyFries -= n; a.carry = n; a.carryMesh.visible = true;
      },
    },
    {
      kind: 'goto', x: 8.35, z: L.window.z + 0.4,
      abort: () => c.state === 'leave' || c.remain <= 0,
    },
    {
      kind: 'act', dur: 0.65,
      abort: () => c.state === 'leave' || c.remain <= 0,
      onEnd: (a) => {
        const n = Math.min(a.carry, c.remain);
        if (n > 0) { a.carry -= n; serveCustomer(c, n); }
        if (a.carry > 0) { S.readyFries = Math.min(MAX_READY, S.readyFries + a.carry); a.carry = 0; }
        a.carryMesh.visible = false;
        if (c.assigned === a) c.assigned = null;
        if (a.serveTarget === c) a.serveTarget = null;
      },
    },
  ]);
}

function planClerk(a) {
  if (S.phase === 'night') {
    const duty = taskNightDuty(a);
    a.task = duty || taskIdle(a);
    return;
  }
  if (a.flee) {
    a.task = makeTask([{ kind: 'goto', x: a.flee.x, z: a.flee.z }]);
    return;
  }
  const c = firstWaitingCustomer();
  if (c && S.readyFries >= 4) {
    c.assigned = a;
    a.serveTarget = c;
    a.task = taskServe(c);
    return;
  }
  if (!S.up.autoFry) {
    const done = S.slots.find((s) => s.state === 2);
    if (done) { a.task = taskUnload(done); return; }
    const free = S.slots.find((s) => s.state === 0);
    if (free && S.raw.length >= 2) { a.task = taskLoad(free); return; }
  }
  if (c && S.readyFries >= 1) {
    c.assigned = a;
    a.serveTarget = c;
    a.task = taskServe(c);
    return;
  }
  if (!S.up.peeler && S.peel.length && S.raw.length < 14) { a.task = taskPeel(); return; }
  if (S.raw.length < 10 && S.peel.length < 9 && S.beltItems.length < 6) {
    let pile = null;
    const r = Math.random();
    if (r < 0.07 && pileRef('crystal').stock >= 1) pile = pileRef('crystal');
    else if (r < 0.25 && pileRef('gold').stock >= 1) pile = pileRef('gold');
    if (!pile) pile = S.piles.reduce((best, p) => (p.key === 'normal' || !best ? p : best), null);
    if (pile && pile.stock >= 1) { const t = taskHarvest(pile); t.kind = 'harvest'; a.task = t; return; }
  }
  a.task = taskIdle(a);
}

function updateAgents(dt) {
  for (const a of S.agents) {
    if (a.stun > 0) { a.stun -= dt; a.actPose = 0; continue; }
    if (a.flee) {
      const d = Math.hypot(a.flee.x - a.pos.x, a.flee.z - a.pos.z);
      if (d < 0.4) a.flee = null;
    }
    if (!a.task) planClerk(a);
    else if ((a.task.kind === 'harvest' || a.task.kind === 'idle') && a.carryPot === 0 && a.carry === 0) {
      const urgent = S.slots.some((s) => s.state === 2) || (S.readyFries > 0 && !!firstWaitingCustomer());
      if (urgent) { a.task = null; planClerk(a); }
    }
    if (a.task) runTask(a, dt);
    a.mesh.position.set(a.pos.x, Math.abs(Math.sin(a.walkT)) * 0.05, a.pos.z);
    animateClerk(a, dt);
  }
  for (const r of S.robots) {
    if (r.broken) {
      r.sparksT -= dt;
      if (r.sparksT <= 0) {
        r.sparksT = 0.28;
        burst(r.pos.x + rnd(-0.3, 0.3), 1.0, r.pos.z + rnd(-0.3, 0.3), 0x9be0ff, 2, 1.6, 0.5);
      }
      r.mesh.rotation.z = Math.sin(performance.now() * 0.012) * 0.09;
      continue;
    }
    if (r.flee) {
      const d = Math.hypot(r.flee.x - r.pos.x, r.flee.z - r.pos.z);
      if (d < 0.4) r.flee = null;
    }
    if (!r.task) r.task = taskRobot(r);
    runTask(r, dt);
    r.mesh.position.set(r.pos.x, Math.abs(Math.sin(r.walkT)) * 0.03, r.pos.z);
    animateRobot(r, dt);
  }
}

function taskRobot(r) {
  const pile = pickRobotPile();
  if (!pile || !S.up.belt) return taskIdleRobot(r);
  return makeTask([
    { kind: 'goto', x: pile.x + 1.1, z: pile.z + 0.6 },
    {
      kind: 'act', dur: 0.85, onEnd: (a) => {
        if (pile.stock < 1) return;
        pile.stock -= 1; a.carryPot = 1; a.carryType = pile.key;
        a.carryMesh.visible = true;
        S.stats.harvest += 1;
        addKeyProgress(1);
      },
    },
    { kind: 'goto', x: BELT_DROP_ROBOT.x, z: BELT_DROP_ROBOT.z },   // 호퍼 동측(금지 영역 바깥)
    {
      kind: 'act', dur: 0.32, onEnd: (a) => {
        if (a.carryPot > 0) { beltSpawn(a.carryType || 'normal'); a.carryPot = 0; a.carryMesh.visible = false; }
      },
    },
  ]);
}
function pickRobotPile() {
  const r = Math.random();
  if (r < 0.1 && pileRef('crystal').stock >= 1) return pileRef('crystal');
  if (r < 0.3 && pileRef('gold').stock >= 1) return pileRef('gold');
  const normal = pileRef('normal');
  return normal.stock >= 1 ? normal : null;
}
function taskIdleRobot(r) {
  return makeTask([{ kind: 'goto', x: L.belt.x + 1.95, z: L.belt.z0 - 1.1 }, { kind: 'wait', dur: 1.2 }]);
}

function animateClerk(a, dt) {
  const m = a.mesh;
  const walk = a.moving ? Math.sin(a.walkT) : 0;
  const legs = m.userData.legs, arms = m.userData.arms;
  if (legs) {
    legs[0].rotation.x = lerp(legs[0].rotation.x, walk * 0.62, 0.3);
    legs[1].rotation.x = lerp(legs[1].rotation.x, -walk * 0.62, 0.3);
  }
  if (arms) {
    const act = a.actPose || 0;
    arms[0].rotation.x = lerp(arms[0].rotation.x, a.moving ? -walk * 0.45 : -act * 1.25, 0.25);
    arms[1].rotation.x = lerp(arms[1].rotation.x, a.moving ? walk * 0.45 : -act * 1.25, 0.25);
  }
  if (a.carryPot > 0 && a.carryPotMesh) {
    a.carryPotMesh.position.set(0, 1.12, 0.42);
    a.carryPotMesh.rotation.y += dt * 2;
  }
}

function animateRobot(r, dt) {
  const m = r.mesh;
  const walk = r.moving ? Math.sin(r.walkT) : 0;
  if (m.userData.armPivot) m.userData.armPivot.rotation.x = lerp(m.userData.armPivot.rotation.x, (r.actPose || 0) * -1.1 + walk * 0.1, 0.2);
  if (m.userData.led) m.userData.led.material.color.setHex(r.broken ? 0xff3b1f : 0x59ffd0);
  if (m.userData.claw) m.userData.claw.rotation.z = Math.sin(performance.now() * 0.004) * 0.2;
}

/* ── 밤 · 변칙성 ──────────────────────────────────────────────────────── */
function startNight() {
  if (S.phase === 'night') return;
  S.phase = 'night';
  S.nightT = 0;
  S.dayT = DAY_LEN;
  S.clock = 20;
  S.blackout = false;
  S.shutterK = 0;
  // 손님 정리
  S.customers.forEach((c) => { if (c.state !== 'leave') { c.state = 'leave'; c.assigned = null; } });
  // 점원/로봇 작업 정리
  [...S.agents, ...S.robots].forEach((a) => { abortTask(a); a.flee = null; });
  // 밤 이벤트 계획
  let list = [
    { at: 0.08, type: 'blackout' },
    { at: 0.26, type: 'windowMonster' },
    { at: 0.44, type: 'potatoBeast' },
    { at: 0.60, type: 'laser' },
    { at: 0.78, type: 'windowMonster' },
    { at: 0.92, type: 'robotBreak' },
  ];
  if (!S.robots.length) list = list.filter((e) => e.type !== 'robotBreak');
  for (let i = 0; i < (S.puckFx.nightMinus || 0); i++) {
    const k = list.findIndex((e) => e.type !== 'windowMonster');
    if (k >= 0) list.splice(k, 1);
  }
  for (let i = 0; i < (S.puckFx.extraNight || 0); i++) {
    list.push({ at: clamp(0.2 + Math.random() * 0.7, 0.1, 0.96), type: pick(['windowMonster', 'potatoBeast', 'laser']) });
  }
  S.nightEvt = list.sort((a, b) => a.at - b.at).map((e, i) => Object.assign({ idx: i, fired: false }, e));
  S.threats = S.nightEvt.map((e) => ({ type: e.type, done: false }));
  $('nightbar').classList.remove('hidden');
  $('wrap').classList.add('night');
  banner('밤 8시', '변칙성 경계 · 가게를 지켜보세요', 2600);
  renderThreats();
  SFX.night();
  S.lastThreatKey = '';
  toast('🌙 밤이 되었습니다. 변칙성은 자동 방어 설비가 대응합니다.', 3200);
}

function startDay() {
  if (S.phase === 'day') return;
  S.phase = 'day';
  S.day += 1;
  S.dayT = 0;
  S.clock = 6;
  S.blackout = false;
  S.stats.nights += 1;
  S.shutterHP = Math.min(S.shutterMax, S.shutterHP + 30);
  $('nightbar').classList.add('hidden');
  $('wrap').classList.remove('night');
  // 잔여 변칙성 제거
  S.anomalies.forEach((a) => removeAnomaly(a));
  S.anomalies.length = 0;
  S.beltItems.forEach((b) => scene.remove(b.mesh));
  S.beltItems.length = 0;
  banner('DAY ' + S.day, '아침이 밝았습니다 · 자동화를 이어가세요', 2400);
  toast('🌅 밤을 무사히 넘겼습니다. 수리비 +$' + fmt(60 + S.day * 25) + ' 지급', 3200);
  addMoney(60 + S.day * 25);
  openPuck();
}

function renderThreats() {
  const box = $('nbThreats');
  box.innerHTML = (S.threats || []).map((t) => {
    const m = ANOM_META[t.type];
    return `<span class="th ${t.done ? 'done' : ''}"><i class="dot"></i>${m.icon} ${m.name}</span>`;
  }).join('');
}

function spawnAnomaly(type) {
  if (!S.started || S.phase !== 'night') return null;
  if (S.anomalies.some((a) => a.type === type && !a.done)) return null;
  if (type === 'robotBreak' && !S.robots.some((r) => !r.broken)) return null;
  const meta = ANOM_META[type];
  const an = { type, t: 0, done: false, mesh: null, hp: 3, assigned: null, needClerk: false, fixDur: 1.2, fade: 0, fireT: 0, walked: 0 };
  const g = new THREE.Group();

  if (type === 'windowMonster') {
    const dark = new THREE.MeshStandardMaterial({ color: 0x191420, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.4, 6, 12), dark);
    body.position.y = 1.2; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 12), dark);
    head.position.y = 2.2; head.castShadow = true; g.add(head);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a10 }));
      eye.position.set(sx * 0.11, 2.24, 0.27); g.add(eye);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.15, 4, 8), dark);
      arm.position.set(sx * 0.46, 1.2, 0.04); arm.rotation.z = sx * 0.13; g.add(arm);
    }
    const bubble = makeTextSprite('빨리 튀겨 줘…', { size: 52, color: '#fff', bg: 'rgba(170,16,16,.94)', h: 0.62 });
    bubble.position.set(0, 2.85, 0.1); g.add(bubble);
    g.position.set(10.62, 0, L.window.z);
    g.rotation.y = -Math.PI / 2;
    an.needClerk = false;
  } else if (type === 'potatoBeast') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 14), bodyMat);
    body.scale.set(1.2, 1.02, 1.06); body.position.y = 1.0; body.castShadow = true; g.add(body);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3c0 }));
      eye.position.set(sx * 0.3, 1.34, 0.86); g.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1a0f06 }));
      pupil.position.set(sx * 0.3, 1.33, 0.96); g.add(pupil);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), std2(0x6a4520));
      horn.position.set(sx * 0.42, 1.85, 0.2); horn.rotation.z = sx * 0.35; g.add(horn);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0x2a0d05 }));
    mouth.position.set(0, 0.92, 0.92); g.add(mouth);
    g.position.set(L.belt.x, L.beltItemY - 0.35, 2.8);
    an.needClerk = true; an.fixDur = 1.25;
    an.clerkPos = beltSafe(L.belt.x + 1.5, 2.8);
  } else if (type === 'blackout') {
    S.blackout = true;
    an.needClerk = true; an.fixDur = 1.7;
    an.clerkPos = { x: L.breaker.x + 1.3, z: L.breaker.z + 0.2 };
    const spark = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), new THREE.MeshBasicMaterial({ color: 0x9be0ff }));
      s.position.set(rnd(-0.4, 0.4), rnd(1.2, 2.2), rnd(-0.3, 0.3));
      spark.add(s);
    }
    spark.position.set(L.breaker.x, 0, L.breaker.z);
    g.add(spark); an.spark = spark;
    g.position.set(L.breaker.x, 0, L.breaker.z);
  } else if (type === 'laser') {
    const R = 3.1;
    const px = pick([-5.5, -1.5, 2.5, 5.5]) + rnd(-0.6, 0.6);
    const pz = rnd(2.6, 9.4);
    const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.82, R, 40),
      new THREE.MeshBasicMaterial({ color: 0xff3320, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.82, 36),
      new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; g.add(disc);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, R * 0.9, 16, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 8; g.add(beam);
    const warn = makeTextSprite('! 위험 !', { size: 64, color: '#fff', bg: 'rgba(170,10,10,.9)', h: 0.7 });
    warn.position.set(0, 4.4, 0); g.add(warn);
    g.position.set(px, 0, pz);
    an.radius = R; an.center = { x: px, z: pz }; an.beam = beam; an.ring = ring; an.disc = disc;
    an.life = 8.5;
  } else if (type === 'robotBreak') {
    const r = pick(S.robots.filter((x) => !x.broken));
    r.broken = true; r.task = null;
    an.robot = r;
    an.needClerk = true; an.fixDur = 2.0;
    // 수리 위치가 벨트 금지 영역에 걸리지 않도록 로봇 반대편(벨트에서 먼 쪽)으로 잡는다
    const side = r.pos.x < L.belt.x ? -1 : 1;
    an.clerkPos = beltSafe(r.pos.x + side * 1.15, r.pos.z + 0.85);
    const spark = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
      s.position.set(rnd(-0.3, 0.3), rnd(0.8, 1.5), rnd(-0.3, 0.3));
      spark.add(s);
    }
    g.add(spark); an.spark = spark;
    g.position.set(r.pos.x, 0, r.pos.z);
  }

  scene.add(g);
  an.mesh = g;
  S.anomalies.push(an);
  const th = (S.threats || []).find((t) => t.type === type && !t.done);
  if (th) th.active = true;
  renderThreats();
  if (type !== 'blackout' && type !== 'robotBreak') {
    banner('변칙성!', meta.name, 1700);
    SFX.alarm();
  } else {
    pop(an.mesh.position.x, 2.6, an.mesh.position.z, meta.icon + ' ' + meta.name, 'warn');
    SFX.alarm();
  }
  toast(meta.icon + ' ' + meta.name + ' 발생 — 자동 대응 중', 2400);
  return an;
}

function std2(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }); }

function resolveAnomaly(an, how) {
  if (!an || an.done) return;
  an.done = true;
  if (an.type === 'blackout') S.blackout = false;
  if (an.type === 'robotBreak' && an.robot) { an.robot.broken = false; an.robot.task = null; }
  S.stats.handled += 1;
  const th = (S.threats || []).find((t) => t.type === an.type && !t.done);
  if (th) { th.done = true; th.active = false; }
  renderThreats();
  const label = how === 'clerk' ? '점원 대응' : how === 'shooter' ? '프라이 슈터 격퇴' : how === 'shutter' ? '셔터 차단' : how === 'dodge' ? '자동 회피' : '자동 대응';
  const at = an.mesh ? an.mesh.position : { x: 0, y: 2, z: 0 };
  toast('✅ ' + ANOM_META[an.type].icon + ' ' + ANOM_META[an.type].name + ' · ' + label, 2000);
  if (how !== 'damaged') addMoney(40 + S.day * 10, { x: at.x, y: 2.4, z: at.z });
  burst(at.x, 1.4, at.z, how === 'damaged' ? 0xff6a4a : 0x9bffb0, 10, 2.4, 0.9);
  an.fade = 0.001;
}

function removeAnomaly(an) {
  if (an.mesh) { scene.remove(an.mesh); an.mesh = null; }
}

function updateAnomalies(dt) {
  // 예정된 밤 이벤트 발화
  if (S.phase === 'night') {
    for (const e of S.nightEvt) {
      if (!e.fired && S.nightT / NIGHT_LEN >= e.at) {
        e.fired = true;
        spawnAnomaly(e.type);
      }
    }
  }
  for (let i = S.anomalies.length - 1; i >= 0; i--) {
    const an = S.anomalies[i];
    if (an.done) {
      an.fade += dt;
      if (an.mesh) {
        const k = clamp(1 - an.fade / 0.55, 0, 1);
        an.mesh.scale.setScalar(Math.max(0.001, k));
        if (k <= 0.01) removeAnomaly(an);
      }
      if (an.fade > 0.7) S.anomalies.splice(i, 1);
      continue;
    }
    an.t += dt;
    if (an.type === 'windowMonster') {
      if (an.mesh) {
        an.mesh.position.z = L.window.z + Math.sin(an.t * 6) * 0.06;
        an.mesh.rotation.z = Math.sin(an.t * 3) * 0.02;
      }
      if (S.up.shooter) {
        an.fireT -= dt;
        if (an.fireT <= 0) {
          an.fireT = 0.42;
          shootTo(an.mesh.position, () => {
            an.hp -= 1;
            if (an.hp <= 0) resolveAnomaly(an, 'shooter');
          });
        }
      } else if (S.up.shutter) {
        if (an.t > 1.0 && !an.marked) { an.marked = true; SFX.alarm(); }
        if (an.t > 3.4) resolveAnomaly(an, 'shutter');
      } else {
        if (an.t > 3 && !an.d1) { an.d1 = true; damageShutter(10, an.mesh.position); }
        if (an.t > 6.5 && !an.d2) { an.d2 = true; damageShutter(10, an.mesh.position); }
        if (an.t > 10) resolveAnomaly(an, 'damaged');
      }
    } else if (an.type === 'potatoBeast') {
      if (an.mesh) {
        an.mesh.position.y = L.beltItemY - 0.35 + Math.sin(an.t * 7) * 0.12;
        if (an.mesh.position.z > -0.6) an.mesh.position.z -= dt * 0.42;
        an.mesh.rotation.z = Math.sin(an.t * 5) * 0.06;
      }
      if (!an.clerkPos || an.mesh) an.clerkPos = beltSafe(an.mesh.position.x + 1.5, an.mesh.position.z);
      if (an.mesh && an.mesh.position.z <= -0.5) {
        damageShutter(8, an.mesh.position);
        S.raw.splice(0, Math.min(4, S.raw.length));
        resolveAnomaly(an, 'damaged');
      }
    } else if (an.type === 'blackout') {
      if (an.spark) an.spark.visible = Math.random() > 0.4;
    } else if (an.type === 'laser') {
      if (an.ring) {
        const pulse = 0.55 + Math.sin(an.t * 9) * 0.22;
        an.ring.material.opacity = pulse;
        if (an.disc) an.disc.material.opacity = 0.14 + pulse * 0.18;
        if (an.beam) an.beam.material.opacity = 0.1 + pulse * 0.12;
      }
      // 안에 있는 점원·로봇은 밖으로 도망
      for (const a of [...S.agents, ...S.robots]) {
        if (a.ignoreLaser) continue;
        const dx = a.pos.x - an.center.x, dz = a.pos.z - an.center.z;
        const d = Math.hypot(dx, dz);
        if (d < an.radius) {
          if (!a.flee) {
            const ux = d > 0.01 ? dx / d : Math.cos(a.walkT), uz = d > 0.01 ? dz / d : Math.sin(a.walkT);
            a.flee = beltSafe(clamp(an.center.x + ux * (an.radius + 2.6), -11.5, 15),
              clamp(an.center.z + uz * (an.radius + 2.6), -9, 11.5));
            abortTask(a);
          }
        }
      }
      if (an.t > an.life) {
        for (const a of [...S.agents, ...S.robots]) {
          if (Math.hypot(a.pos.x - an.center.x, a.pos.z - an.center.z) < an.radius) a.stun = Math.max(a.stun, 2);
        }
        resolveAnomaly(an, 'dodge');
      }
    } else if (an.type === 'robotBreak') {
      if (an.spark) an.spark.visible = Math.random() > 0.45;
    }
  }
}

function damageShutter(n, at) {
  S.shutterHP = Math.max(0, S.shutterHP - n);
  pop(at ? at.x : 9.2, 2.6, at ? at.z : L.window.z, '-' + n + ' 셔터', 'warn');
  SFX.boo();
  if (S.shutterHP <= 0 && !S.collapse) {
    S.collapse = true;
    const fee = Math.floor(S.money * 0.15);
    S.money -= fee;
    banner('셔터 파손!', '수리비 -$' + fmt(fee), 2600);
    toast('💥 셔터가 뚫렸습니다! 수리비 -$' + fmt(fee), 3200);
    S.shutterHP = Math.round(S.shutterMax * 0.5);
    setTimeout(() => { S.collapse = false; if (S.phase === 'night') startDay(); }, 1600);
  }
}

function spawnShot(from, to, onHit, opt = {}) {
  const g = new THREE.Group();
  const n = opt.n || 1;
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xffd35c, roughness: 0.7 }));
    f.position.set(rnd(-0.07, 0.07), rnd(-0.05, 0.05), rnd(-0.07, 0.07));
    f.rotation.set(rnd(0, 1), rnd(0, 1), rnd(0, 1));
    g.add(f);
  }
  g.position.copy(from);
  scene.add(g);
  S.shots.push({
    mesh: g, from: from.clone(), to: to.clone(), t: 0,
    dur: opt.dur || 0.42, arc: opt.arc === undefined ? 1.0 : opt.arc, onHit,
  });
  SFX.shoot();
}

function updateShots(dt) {
  for (let i = S.shots.length - 1; i >= 0; i--) {
    const s = S.shots[i];
    s.t += dt;
    const k = clamp(s.t / s.dur, 0, 1);
    s.mesh.position.lerpVectors(s.from, s.to, k);
    s.mesh.position.y += Math.sin(k * Math.PI) * s.arc;
    s.mesh.rotation.x += dt * 9;
    if (k >= 1) {
      scene.remove(s.mesh);
      S.shots.splice(i, 1);
      burst(s.to.x, s.to.y, s.to.z, 0xffcf4d, 4, 1.4, 0.7);
      if (s.onHit) s.onHit();
    }
  }
}

function shootTo(target, onHit) {
  const to = target.clone(); to.y = Math.max(1.1, to.y + 0.9);
  spawnShot(V3(L.turret.x, 1.55, L.turret.z), to, onHit, { dur: 0.42, arc: 0.9 });
}

function taskNightDuty(a) {
  if (a.flee) return makeTask([{ kind: 'goto', x: a.flee.x, z: a.flee.z }]);
  const an = S.anomalies.find((x) => !x.done && x.needClerk && (!x.assigned || x.assigned === a));
  if (!an) return null;
  an.assigned = a;
  const dyn = an.type === 'potatoBeast'
    ? () => an.clerkPos || { x: L.belt.x + 1.5, z: 2.8 }   // 벨트 위 괴물 옆(동측) 안전 위치
    : null;
  return makeTask([
    dyn ? { kind: 'goto', dyn, x: 0, z: 0 } : { kind: 'goto', x: an.clerkPos.x, z: an.clerkPos.z },
    { kind: 'act', dur: an.fixDur, abort: () => an.done, onEnd: () => resolveAnomaly(an, 'clerk') },
  ]);
}

/* ── 황금 열쇠 · 클리어 ───────────────────────────────────────────────── */
function addKeyProgress(n) {
  if (S.keyFound || S.keyOff) return;
  S.keyPct = Math.min(100, S.keyPct + n * (100 / KEY_GOAL));
  if (S.keyPct >= 100) { foundKey(); return; }
  if (Math.random() < 0.004 * n) foundKey();
}

function foundKey() {
  if (S.keyFound) return;
  S.keyFound = true;
  S.keyPct = 100;
  if (W.refs.padlock) W.refs.padlock.visible = false;
  banner('황금 열쇠 발견!', '지하실 해치가 열립니다', 3400);
  toast('🔑 감자 더미에서 황금 열쇠가 나왔습니다!', 4200);
  SFX.found();
  burst(L.hatch.x, 1.2, L.hatch.z, 0xffd34d, 26, 4.2, 1.2);
  focusCam(V3(L.hatch.x + 7.5, 8, L.hatch.z + 8.5), V3(L.hatch.x, 0.6, L.hatch.z), 1.3);
  setTimeout(() => { if (S.ready && !S.clearOpen) openClear(); }, 2800);
}

function openClear() {
  S.clearOpen = true;
  $('clearDay').textContent = S.day + '일';
  $('clearFries').textContent = fmt(S.stats.served);
  $('clearMoney').textContent = '$' + fmt(S.stats.earned);
  $('clear').classList.remove('hidden');
}

function closeClear() {
  S.clearOpen = false;
  $('clear').classList.add('hidden');
  if (S.perm < 0.5) {
    S.perm = 0.5;
    toast('영구 보너스 적용 · 판매 수익 +50%', 3800);
  }
  focusCam(defaultCam().pos, defaultCam().target, 1.0);
}

/* ── 아침 퍽 ──────────────────────────────────────────────────────────── */
function openPuck() {
  S.puckFx = { price: 1, custMul: 1, clerk: 1, extraNight: 0, nightMinus: 0 };
  const buffs = PUCKS.filter((p) => !p.curse).slice();
  for (let i = buffs.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [buffs[i], buffs[j]] = [buffs[j], buffs[i]]; }
  const cards = buffs.slice(0, 2);
  if (Math.random() < 0.6) cards.push(PUCKS.find((p) => p.curse));
  S.puck.cards = cards;
  S.puck.open = true;
  S.puck.left = 10;
  const box = $('puckCards');
  box.innerHTML = '';
  cards.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pk' + (c.curse ? ' curse' : '');
    b.innerHTML = `<span class="pkIco">${c.icon}</span><span class="pkTxt"><b>${c.name}</b><small>${c.desc}</small></span>` +
      (c.curse ? '<span class="pkTag">위험</span>' : '');
    b.addEventListener('click', () => chooseCard(i));
    box.appendChild(b);
  });
  $('puckSec').textContent = '10';
  $('puckFill').style.transform = 'scaleX(1)';
  $('puck').classList.remove('hidden');
  SFX.serve();
}

function chooseCard(i) {
  const c = S.puck.cards[i];
  if (!c) return closePuck();
  if (c.id === 'harvest') {
    S.piles.forEach((p) => { p.stock = Math.min(p.max, p.stock + p.max * 0.4); });
  } else if (c.id === 'customer') S.puckFx.custMul = 1.6;
  else if (c.id === 'price') S.puckFx.price = 1.25;
  else if (c.id === 'clerk') S.puckFx.clerk = 1.2;
  else if (c.id === 'calm') S.puckFx.nightMinus = 1;
  else if (c.id === 'devil') {
    S.puckFx.price = 2.0; S.puckFx.extraNight = 2;
    S.shutterMax = Math.max(40, S.shutterMax - 25);
    S.shutterHP = Math.min(S.shutterHP, S.shutterMax);
  }
  toast(c.icon + ' ' + c.name + ' — ' + c.desc, 3200);
  closePuck();
}

function closePuck() {
  S.puck.open = false;
  $('puck').classList.add('hidden');
}

/* ── 업그레이드 ───────────────────────────────────────────────────────── */
const upEls = {};
function upCost(u) {
  const lv = S.up[u.id] || 0;
  return u.cost ? Math.round(u.cost * Math.pow(u.grow || 1, lv)) : 0;
}
function upLocked(u) { return u.dep.some((d) => !S.up[d]); }

function buildUps() {
  const box = $('ups');
  box.innerHTML = '';
  UPG.forEach((u) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'up';
    b.dataset.id = u.id;
    b.title = u.name + ' · ' + u.desc;
    b.innerHTML = `<span class="uIco">${u.icon}</span><span class="uName">${u.name}</span>` +
      `<span class="uCost">${u.id === 'skip' ? '무료' : '$' + fmt(upCost(u))}</span>`;
    b.addEventListener('click', () => buy(u.id));
    box.appendChild(b);
    upEls[u.id] = b;
  });
}

function refreshUps() {
  UPG.forEach((u) => {
    const el = upEls[u.id]; if (!el) return;
    const lv = S.up[u.id] || 0;
    const maxed = lv >= u.max;
    const locked = upLocked(u);
    const cost = upCost(u);
    const can = !locked && !maxed && S.money >= cost;
    el.classList.toggle('locked', locked);
    el.classList.toggle('max', maxed);
    el.classList.toggle('can', can);
    el.classList.toggle('poor', !locked && !maxed && S.money < cost);
    const costEl = el.querySelector('.uCost');
    costEl.textContent = maxed ? '최대' : (u.id === 'skip' ? '무료' : '$' + fmt(cost));
    let badge = el.querySelector('.uLv');
    if (u.max > 1 && lv > 0 && !maxed) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'uLv'; el.appendChild(badge); }
      badge.textContent = 'Lv' + lv;
    } else if (badge) badge.remove();
    let lock = el.querySelector('.uLock');
    if (locked) {
      if (!lock) { lock = document.createElement('span'); lock.className = 'uLock'; lock.textContent = '🔒'; el.appendChild(lock); }
    } else if (lock) lock.remove();
  });
  $('upMoney').textContent = fmt(S.money);
  $('uhKey').textContent = Math.floor(S.keyPct) + '%';
}

function buy(id) {
  const u = UPG.find((x) => x.id === id);
  if (!u) return;
  if (upLocked(u)) {
    const need = UPG.find((x) => x.id === u.dep[0]);
    toast('🔒 선행 설비 ‘' + (need ? need.name : '설비') + '’를 먼저 해금하세요', 2400);
    return;
  }
  if ((S.up[id] || 0) >= u.max) { toast('이미 최대 단계예요', 1800); return; }
  if (id === 'skip') { skipTime(); return; }
  const cost = upCost(u);
  if (S.money < cost) { toast('돈이 부족해요 · $' + fmt(cost) + ' 필요', 2000); return; }
  S.money -= cost;
  S.up[id] = (S.up[id] || 0) + 1;
  applyUpgrade(id);
  SFX.upgrade();
  pop(0, 5, 0, u.icon + ' ' + u.name + ' 해금!', 'big');
  toast(u.icon + ' ' + u.name + (u.max > 1 ? ' Lv.' + S.up[id] : '') + ' — ' + u.desc, 3000);
  refreshUps();
}

function applyUpgrade(id) {
  if (id === 'belt') {
    if (W.refs.beltTarp) W.refs.beltTarp.visible = false;
    if (W.refs.beltGrp) W.refs.beltGrp.visible = true;
    W.refs.beltSlats.forEach((m) => { m.visible = true; });
    burst(L.belt.x, 1.2, 3, 0xffd34d, 14, 3, 1);
  } else if (id === 'peeler') {
    W.refs.peelerManual.visible = false;
    W.refs.peelerAuto.visible = true;
    burst(L.peeler.x, 1.4, L.peeler.z, 0x9be0ff, 12, 2.6, 1);
  } else if (id === 'robot') {
    const r = spawnRobot();
    burst(r.pos.x, 1.2, r.pos.z, 0x9be0ff, 16, 2.8, 1.1);
    pop(r.pos.x, 2.3, r.pos.z, '🤖 감자 로봇 등장!', 'big');
  } else if (id === 'autoFry') {
    W.refs.vats.forEach((v) => { v.material.emissiveIntensity = 0.55; });
    burst(L.fryer.x, 2, L.fryer.z, 0xffd060, 14, 2.8, 1);
  } else if (id === 'shooter') {
    W.refs.turret.visible = true;
    burst(L.turret.x, 1.4, L.turret.z, 0xffd34d, 16, 3, 1);
  } else if (id === 'shutter') {
    S.shutterMax += 40;
    S.shutterHP = S.shutterMax;
  }
}

function skipTime() {
  if (S.phase === 'day') {
    startNight();
    toast('⏭ 밤으로 건너뛰었습니다', 2000);
  } else {
    startDay();
    toast('⏭ 아침으로 건너뛰었습니다', 2000);
  }
}

/* ── HUD ──────────────────────────────────────────────────────────────── */
function clockStr() {
  const h = Math.floor(S.clock) % 24;
  const m = Math.floor((S.clock % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

let hudT = 0;
function updateHUD(force) {
  hudT += 1;
  if (!force && hudT % 6 !== 0) return;
  $('moneyV').textContent = fmtShort(S.money);
  $('clockV').textContent = clockStr();
  $('dayV').textContent = S.day + '일차';
  $('phaseIco').textContent = S.phase === 'night' ? '🌙' : '☀️';
  $('friesV').textContent = fmt(S.readyFries);
  $('keyV').textContent = Math.floor(S.keyPct) + '%';
  $('cKey').classList.toggle('hot', S.keyPct > 70 && !S.keyFound);
  $('nbClock').textContent = clockStr();
  if (S.phase === 'night') {
    $('nbFill').style.width = clamp(S.nightT / NIGHT_LEN * 100, 0, 100).toFixed(1) + '%';
    $('nbTitle').textContent = '밤 ' + clockStr() + ' · 변칙성 경계';
  }
  $('upMoney').textContent = fmt(S.money);
  $('uhKey').textContent = Math.floor(S.keyPct) + '%';
  $('btnSpeed').textContent = S.speed + 'x';
  $('btnPause').textContent = S.paused ? '▶' : '⏸';
  $('btnPause').classList.toggle('on', S.paused);
  $('wrap').classList.toggle('alert', S.phase === 'night' && S.anomalies.some((a) => !a.done && (a.type === 'windowMonster' || a.type === 'laser')));
  if (S.phase === 'night') refreshUpsThrottle();
}

let upT = 0;
function refreshUpsThrottle() {
  upT += 1;
  if (upT % 4 === 0) refreshUps();
}

/* ── 시각 효과 ────────────────────────────────────────────────────────── */
function updateVisuals(rdt, simDt) {
  const targetMix = S.phase === 'night' ? 1 : 0;
  S.nightMix += (targetMix - S.nightMix) * Math.min(1, rdt * 1.4);
  if (Math.abs(targetMix - S.nightMix) < 0.002) S.nightMix = targetMix;
  W.setNight(S.nightMix, S.blackout ? 1 : 0);
  W.alert(S.phase === 'night');

  // 셔터
  const anyWindow = S.anomalies.some((a) => !a.done && a.type === 'windowMonster');
  const wantShut = (S.up.shutter > 0 && anyWindow) ? 1 : 0;
  S.shutterK += (wantShut - S.shutterK) * Math.min(1, rdt * 3.2);
  if (W.refs.shutter) W.refs.shutter.position.y = lerp(W.refs.shutterOpenY, W.refs.shutterClosedY, S.shutterK);

  // 튀김기 상태
  S.slots.forEach((slot, i) => {
    const v = W.refs.vats[i]; if (!v) return;
    v.material.color.setHex(slot.state === 1 ? 0xffc04a : 0xffa92e);
    v.material.emissiveIntensity = slot.state === 1 ? 0.95 + Math.sin(performance.now() * 0.012 + i) * 0.2 : 0.32;
  });

  // 튀김 대기 트레이
  if (S.trayBoxes) {
    const n = Math.ceil(S.readyFries / 4);
    S.trayBoxes.forEach((b, i) => { b.visible = i < n; });
  }

  // 터렛
  if (W.refs.turret && S.up.shooter) {
    const t = S.anomalies.find((a) => !a.done && a.type === 'windowMonster');
    const targetYaw = t ? Math.PI / 2 : Math.sin(performance.now() * 0.0006) * 0.7;
    let d = targetYaw - W.refs.turretYaw.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    W.refs.turretYaw.rotation.y += d * Math.min(1, rdt * 6);
  }

  // 해치
  if (S.keyFound) {
    const g = 0.35 + Math.sin(performance.now() * 0.004) * 0.25;
    if (W.refs.hatchGlow) W.refs.hatchGlow.opacity = g;
    if (W.refs.hatchLid) {
      W.refs.hatchLid.rotation.x = Math.max(-1.1, W.refs.hatchLid.rotation.x - rdt * 0.8);
      W.refs.hatchLid.position.z = Math.min(0, W.refs.hatchLid.position.z + rdt * 0.3);
    }
  }

  // 스테이션 라벨
  if (labels.peel) {
    setLabel('peel', labels.peel, '탈피 ' + S.peel.length);
    setLabel('fry', labels.fry, '프라이 ' + (S.readyFries + S.raw.length));
    setLabel('ready', labels.ready, '대기 ' + S.readyFries);
  }

  // 이상 현상 흔들림
  for (const an of S.anomalies) {
    if (!an.mesh || an.done) continue;
    if (an.type === 'windowMonster') an.mesh.position.x = 10.62 + Math.sin(an.t * 8) * 0.05;
    if (an.type === 'laser') an.mesh.rotation.y += rdt * 0.35;
  }

  updateParts(rdt * Math.max(1, S.speed));
}

function stepCam(rdt) {
  if (!camAnim) return;
  camAnim.t += rdt;
  const k = clamp(camAnim.t / camAnim.dur, 0, 1);
  const e = easeOut(k);
  camera.position.lerpVectors(camAnim.fromP, camAnim.toP, e);
  controls.target.lerpVectors(camAnim.fromT, camAnim.toT, e);
  if (k >= 1) camAnim = null;
}

/* ── 시간 진행 ────────────────────────────────────────────────────────── */
function advanceTime(dt) {
  if (S.phase === 'day') {
    S.dayT += dt;
    S.clock = 6 + clamp(S.dayT / DAY_LEN, 0, 1) * 14;
    if (S.dayT >= DAY_LEN) startNight();
  } else {
    S.nightT += dt;
    S.clock = 20 + clamp(S.nightT / NIGHT_LEN, 0, 1) * 10;
    if (S.nightT >= NIGHT_LEN) startDay();
  }
}

function tick(dt) {
  if (!S.started) return;
  if (S.puck.open || S.clearOpen) return;
  advanceTime(dt);
  updatePiles(dt);
  updateProduction(dt);
  updateAgents(dt);
  updateCustomers(dt);
  updateAnomalies(dt);
  updateShots(dt);
  if (S.phase === 'day') {
    S.custTimer -= dt;
    if (S.custTimer <= 0) {
      spawnCustomer();
      S.custTimer = Math.max(2.8, (8.2 - S.day * 0.2) / S.puckFx.custMul);
    }
  }
  if (S.puck.open) return;
}

/* ── 루프 ─────────────────────────────────────────────────────────────── */
let frameCount = 0;
function loop() {
  requestAnimationFrame(loop);
  const rdt = Math.min(clock.getDelta(), 0.06);
  const simDt = (S.started && !S.paused && !S.puck.open && !S.clearOpen) ? rdt * S.speed : 0;
  if (simDt > 0) tick(simDt);
  if (S.puck.open) {
    S.puck.left -= rdt;
    const k = clamp(S.puck.left / S.puck.total, 0, 1);
    $('puckFill').style.transform = 'scaleX(' + k.toFixed(3) + ')';
    $('puckSec').textContent = Math.ceil(Math.max(0, S.puck.left));
    if (S.puck.left <= 0) chooseCard(0);
  }
  updateVisuals(rdt, simDt);
  updateHUD();
  if (frameCount % 4 === 0) refreshUps();
  if (frameCount % 8 === 0) renderer.shadowMap.needsUpdate = true;
  frameCount++;
  if (camAnim) stepCam(rdt);
  controls.update();
  renderer.render(scene, camera);
}

/* ── UI 이벤트 ────────────────────────────────────────────────────────── */
function bindUI() {
  $('btnStart').addEventListener('click', () => {
    if (S.started) return;
    SFX.init();
    S.started = true;
    $('intro').classList.add('hidden');
    setTimeout(() => $('intro').classList.add('hidden'), 400);
    banner('DAY 1', '가게 문을 열었습니다 · 가게는 스스로 돌아갑니다', 3000);
    toast('💡 점원이 알아서 감자를 캐고 튀겨 팝니다. 돈이 모이면 아래 업그레이드를 누르세요!', 5200);
    S.custTimer = 1.5;
  });
  $('btnSpeed').addEventListener('click', () => {
    S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 4 : 1;
    toast('⏩ 배속 ' + S.speed + 'x', 1200);
  });
  $('btnPause').addEventListener('click', () => {
    S.paused = !S.paused;
    toast(S.paused ? '⏸ 일시정지' : '▶ 재생', 1200);
  });
  $('btnCam').addEventListener('click', () => { resetCam(); toast('🎥 시점을 초기화했습니다', 1400); });
  $('btnSound').addEventListener('click', () => {
    SFX.init();
    S.muted = !S.muted; SFX.muted = S.muted;
    $('btnSound').textContent = S.muted ? '🔈' : '🔊';
    toast(S.muted ? '🔈 소리 꺼짐' : '🔊 소리 켜짐', 1200);
  });
  $('btnEndless').addEventListener('click', closeClear);
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyViewport, 120);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); S.paused = !S.paused; }
    else if (e.key === '1') S.speed = 1;
    else if (e.key === '2') S.speed = 2;
    else if (e.key === '4') S.speed = 4;
    else if (e.key === 'r' || e.key === 'R') resetCam();
  });
  window.addEventListener('error', (e) => {
    if (!S.ready) showErr(e && e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (!S.ready) showErr(e && e.reason);
  });
  setTimeout(() => { if (!S.ready) showErr('load timeout'); }, 16000);
}

function showErr(msg) {
  $('loading').classList.add('hidden');
  $('err').classList.remove('hidden');
  if (msg && window.console) console.warn('[fry-factory] init failed:', msg);
}

/* ── 초기화 ───────────────────────────────────────────────────────────── */
function init() {
  initThree();
  initPiles();
  initLabels();
  spawnClerk(0);
  spawnClerk(1);

  // 대기 트레이에 프라이 상자 배치
  S.trayBoxes = [];
  for (let i = 0; i < 8; i++) {
    const b = makeFryBox();
    b.position.set((i % 4) * 0.32 - 0.48, 0.98 + Math.floor(i / 4) * 0.3, (Math.floor(i / 4) % 2) * 0.18 - 0.09);
    b.scale.setScalar(0.8);
    b.visible = false;
    W.refs.trayStack.add(b);
    S.trayBoxes.push(b);
  }

  buildUps();
  bindUI();
  refreshUps();
  updateHUD(true);
  renderer.render(scene, camera);
  $('loading').classList.add('hidden');
  S.ready = true;
  requestAnimationFrame(loop);
}

/* ── 디버그 / 검증 API ────────────────────────────────────────────────── */
function apiState() {
  return {
    ready: S.ready, started: S.started, paused: S.paused, speed: S.speed,
    phase: S.phase, day: S.day, clock: +S.clock.toFixed(2), dayT: +S.dayT.toFixed(1), nightT: +S.nightT.toFixed(1),
    money: Math.round(S.money), price: +unitPrice().toFixed(2),
    readyFries: S.readyFries, peel: S.peel.length, raw: S.raw.length,
    slots: S.slots.map((s) => ({ st: s.state, t: +s.t.toFixed(2) })),
    stats: Object.assign({}, S.stats),
    up: Object.assign({}, S.up),
    keyPct: +S.keyPct.toFixed(1), keyFound: S.keyFound, clearOpen: S.clearOpen,
    shutterHP: S.shutterHP, nightMix: +S.nightMix.toFixed(2),
    customers: S.customers.map((c) => ({ kind: c.kind, state: c.state, remain: c.remain, paid: c.paid, z: +c.z.toFixed(1) })),
    anomalies: S.anomalies.map((a) => ({ type: a.type, t: +a.t.toFixed(1), done: a.done, needClerk: a.needClerk, assigned: !!a.assigned })),
    agents: S.agents.map((a) => ({ id: a.id, x: +a.pos.x.toFixed(2), z: +a.pos.z.toFixed(2), carry: a.carry, carryPot: a.carryPot, task: a.task ? a.task.steps[a.task.i] && a.task.steps[a.task.i].kind : 'idle', taskKind: a.task ? a.task.kind : 'none', step: a.task ? a.task.i : -1 })),
    robots: S.robots.map((r) => ({ id: r.id, x: +r.pos.x.toFixed(2), z: +r.pos.z.toFixed(2), broken: r.broken, task: r.task ? r.task.steps[r.task.i] && r.task.steps[r.task.i].kind : 'idle', visible: r.mesh.visible, inScene: !!r.mesh.parent })),
    beltItems: S.beltItems.length,
    threats: (S.threats || []).slice(),
    wait: S.customers.filter((c) => c.state === 'wait').length,
    freeWait: S.customers.filter((c) => c.state === 'wait' && c.remain > 0 && (!c.assigned || !c.assigned.task)).length,
    puck: { open: S.puck.open, cards: S.puck.cards.map((c) => c.id), left: +S.puck.left.toFixed(1) },
    cam: { pos: camera.position.toArray().map((v) => +v.toFixed(2)), target: controls.target.toArray().map((v) => +v.toFixed(2)), fov: camera.fov },
  };
}

window.__FFA = {
  S,
  cam() { return camera; },
  ctl() { return controls; },
  api: {
    state: apiState,
    give(n) { addMoney(n); refreshUps(); },
    buy(id) { buy(id); },
    unlock(id) { S.up[id] = 1; applyUpgrade(id); refreshUps(); },
    unlockAll() {
      UPG.forEach((u) => {
        if (u.id === 'skip') return;
        const target = u.max || 1;
        while ((S.up[u.id] || 0) < target) {
          S.up[u.id] = (S.up[u.id] || 0) + 1;
          applyUpgrade(u.id);
        }
      });
      refreshUps();
    },
    start() { $('btnStart').click(); },
    jumpNight() { if (S.phase === 'day') startNight(); },
    jumpDay() { if (S.phase === 'night') startDay(); },
    forceAnomaly(t) { return spawnAnomaly(t); },
    setReady(n) { S.readyFries = n; },
    spawnCustomer(w) { return spawnCustomer(w); },
    findKey() { S.keyPct = 99.5; foundKey(); },
    setKeyProgress(on) { S.keyOff = !on; },
    setDayTime(hour) {
      S.phase = 'day'; S.dayT = clamp((hour - 6) / 14, 0, 0.98) * DAY_LEN;
      S.clock = 6 + (S.dayT / DAY_LEN) * 14; S.nightMix = 0;
      $('nightbar').classList.add('hidden'); $('wrap').classList.remove('night');
    },
    setNightMix(v) { S.nightMix = v; if (W) W.setNight(v, S.blackout ? 1 : 0); },
    setCam(p, t) { if (p) camera.position.set(p[0], p[1], p[2]); if (t) controls.target.set(t[0], t[1], t[2]); controls.update(); camera.updateProjectionMatrix(); },
    clearToast() { const t = $('toast'); t.classList.remove('show'); t.classList.add('hidden'); const bn = $('banner'); bn.classList.remove('show'); bn.classList.add('hidden'); },
    setSound(on) { SFX.muted = !on; if (SFX.ctx) { try { on ? SFX.ctx.resume() : SFX.ctx.suspend(); } catch (e) {} } },
    clearAnomalies() { S.anomalies.forEach((a) => removeAnomaly(a)); S.anomalies.length = 0; S.blackout = false; },
    clearNightPlan() { (S.nightEvt || []).forEach((e) => { e.fired = true; }); },
    info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, soft: SOFT, gpu: GPU_NAME }; },
    visual() { return {
      beltSlats: W.refs.beltSlats[0].visible, tarp: W.refs.beltTarp.visible,
      peelerAuto: W.refs.peelerAuto.visible, peelerManual: W.refs.peelerManual.visible,
      turret: W.refs.turret.visible, robots: S.robots.length,
      shutterY: +W.refs.shutter.position.y.toFixed(2), vats: W.refs.vats.length,
    }; },
    render() { renderer.render(scene, camera); },
    refresh() { updateHUD(true); refreshUps(); },
    damage(n) { damageShutter(n, { x: 9, z: L.window.z }); },
    setSpeed(n) { S.speed = n; },
    pause(v) { S.paused = v; },
    resetCam,
    chooseCard(i) { chooseCard(i); },
    closePuck,
    closeClear,
    simulate(sec) {
      const step = 1 / 30;
      for (let t = 0; t < sec; t += step) {
        if (S.puck.open) chooseCard(0);
        tick(step);
        if (!S.started) break;
      }
      refreshUps(); updateHUD(true);
      return apiState();
    },
    countAnoms(type) { return S.anomalies.filter((a) => a.type === type).length; },
    nav() {
      return {
        block: BELT_BLOCK, forbidden: BELT_NAV, agentRadius: AGENT_R,
        way: { z: BELT_WAY_Z, w: BELT_WAY_W, e: BELT_WAY_E },
        drop: BELT_DROP, dropRobot: BELT_DROP_ROBOT,
        dbg: Object.assign({}, NAVDBG),
      };
    },
    // 벨트 침범·제자리걸음 감시하며 sec초 진행 (rAF 시뮬레이션은 잠시 멈춘다)
    auditBelt(sec) {
      const step = 1 / 30;
      const wasPaused = S.paused;
      S.paused = true;
      const out = {
        seconds: 0, frames: 0, hitsReal: 0, hitsPad: 0, maxPen: 0, meshNaN: 0,
        detours: 0, pushes: 0, stuck: [], maxStill: 0,
        startStats: Object.assign({}, S.stats),
      };
      const still = new Map();
      const span = new Map();
      const d0 = NAVDBG.detours, p0 = NAVDBG.pushes;
      for (let t = 0; t < sec; t += step) {
        if (S.puck.open) chooseCard(0);
        if (S.clearOpen) closeClear();
        if (!S.started) break;
        tick(step);
        out.frames++;
        for (const a of [...S.agents, ...S.robots]) {
          const x = a.pos.x, z = a.pos.z;
          if (x > BELT_BLOCK.x0 && x < BELT_BLOCK.x1 && z > BELT_BLOCK.z0 && z < BELT_BLOCK.z1) {
            out.hitsReal++;
            out.maxPen = Math.max(out.maxPen, Math.min(x - BELT_BLOCK.x0, BELT_BLOCK.x1 - x, z - BELT_BLOCK.z0, BELT_BLOCK.z1 - z));
          }
          if (inBeltNav(x, z, BELT_NAV)) out.hitsPad++;
          if (!Number.isFinite(a.mesh.rotation.y) || !Number.isFinite(a.mesh.position.x)
            || !Number.isFinite(a.mesh.quaternion.w)) out.meshNaN++;
          const sp = span.get(a.id) || { id: a.id, minX: x, maxX: x, minZ: z, maxZ: z };
          sp.minX = Math.min(sp.minX, x); sp.maxX = Math.max(sp.maxX, x);
          sp.minZ = Math.min(sp.minZ, z); sp.maxZ = Math.max(sp.maxZ, z);
          span.set(a.id, sp);
          const st = a.task && a.task.steps[a.task.i];
          const going = !!(st && st.kind === 'goto');
          const rec = still.get(a.id) || { x, z, t: 0, reported: false };
          if (!going) { rec.t = 0; rec.x = x; rec.z = z; rec.reported = false; }
          else if (Math.hypot(x - rec.x, z - rec.z) > 0.12) { rec.t = 0; rec.x = x; rec.z = z; rec.reported = false; }
          else {
            rec.t += step;
            out.maxStill = Math.max(out.maxStill, rec.t);
            if (rec.t > 4 && !rec.reported) {
              rec.reported = true;
              out.stuck.push({ id: a.id, still: +rec.t.toFixed(1), x: +x.toFixed(2), z: +z.toFixed(2) });
            }
          }
          still.set(a.id, rec);
        }
        out.seconds = +(t + step).toFixed(1);
      }
      out.detours = NAVDBG.detours - d0;
      out.pushes = NAVDBG.pushes - p0;
      out.span = [...span.values()].map((v) => ({
        id: v.id, minX: +v.minX.toFixed(2), maxX: +v.maxX.toFixed(2),
        minZ: +v.minZ.toFixed(2), maxZ: +v.maxZ.toFixed(2),
      }));
      out.stats = Object.assign({}, S.stats);
      out.robots = S.robots.length;
      out.state = apiState();
      S.paused = wasPaused;
      refreshUps(); updateHUD(true);
      return out;
    },
  },
};

try {
  init();
} catch (e) {
  showErr(e && e.message ? e.message : e);
  if (window.console) console.warn('[fry-factory] init error', e);
}

