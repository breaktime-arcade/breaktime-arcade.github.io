/* =========================================================================
   프라이 팩토리: 오토 디펜스 (Fry Factory: Auto Defense)
   - 감자를 캐고 → 껍질 벗기고 → 튀겨서 → 드라이브스루로 파는 가게를 관전
   - 사용자는 카메라만 움직이고, 돈이 모이면 업그레이드를 눌러 자동화
   - 밤 8시~새벽 6시: 변칙성 손님 · 감자 괴물 · 정전 · 레이저 장판 · 로봇 고장
   ========================================================================= */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  buildWorld, makeTextSprite, makeClerk, makeRobot, makeCar, makeWalker,
  makePotato, makeFryBox, L,
} from './world.js';

/* ── 상수 ─────────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
// 인자 없이 부르면 0~1 난수 — 예전엔 인자를 빠뜨리면 NaN 이 되어 씬을 오염시켰다
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const rr = rnd;
const rndInt = (a = 0, b = 1) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (a) => a[(Math.random() * a.length) | 0];
// 유한값 보정 — NaN/Infinity 가 렌더러로 흘러들어가면 블룸이 화면 전체를 덮으므로 입구에서 막는다
const fin = (v, f = 0) => (Number.isFinite(v) ? v : f);
const finClamp = (v, a, b, f = a) => (Number.isFinite(v) ? clamp(v, a, b) : f);
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
  ctxLost: false, ctxLostAt: 0, rebuilding: false, gfxErrT: 0,
};

let renderer, scene, camera, controls, W, SOFT = false, GPU_NAME = '';
let _gpuProbed = false;
let composer = null, bloomPass = null;
let camAnim = null, resizeTimer = 0;
const clock = new THREE.Clock();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TMP = new THREE.Vector3();
const pops = $('pops');

/* ── GPU 자원 정리 ──────────────────────────────────────────────────────
   장시간 플레이에서 차·감자·변칙성·프라이가 스폰/제거될 때마다 지오메트리와
   머티리얼을 씬에서만 빼고 그대로 두면 GPU 버퍼가 무한히 쌓인다(하루 +200개).
   제거 시 실제로 dispose 하고, 여러 곳에서 돌려쓰는 공용 자원(ffaShared)은
   건드리지 않는다.                                                          */
const TEX_SLOTS = ['map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap',
  'envMap', 'lightMap', 'metalnessMap', 'normalMap', 'roughnessMap', 'specularMap', 'clearcoatMap'];
const isShared = (a) => !!(a && a.userData && a.userData.ffaShared);
function disposeTree(root) {
  if (!root) return;
  // 컨텍스트를 잃은 뒤에는 GPU 자원이 이미 사라져 있다. 삭제를 시도하면
  // 다른 컨텍스트의 객체를 지우려다 GL 경고만 쏟아지므로 씬에서만 뗀다.
  const lost = !!S.ctxLost;
  if (!lost) {
    root.traverse((o) => {
      const g = o.geometry;
      if (g && !isShared(g)) g.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (!m || isShared(m)) continue;
        for (const k of TEX_SLOTS) {
          const t = m[k];
          if (t && t.isTexture && !isShared(t)) t.dispose();
        }
        m.dispose();
      }
    });
  }
  if (root.parent) root.parent.remove(root);
}

/* ── 사운드 (Web Audio 합성 · 입체감 있는 효과음) ─────────────────────── */
const SFX = {
  ctx: null, master: null, comp: null, muted: false, noiseBuf: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 22;
      this.comp.ratio.value = 8;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.18;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
      const n = this.ctx.sampleRate * 1.2 | 0;
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch (e) { this.ctx = null; }
  },
  toneAt(freq, dur, type = 'sine', vol = 0.25, slide = 0, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },
  tone(freq, dur, type = 'sine', vol = 0.25, slide = 0) { this.toneAt(freq, dur, type, vol, slide, 0); },
  noiseAt(dur, vol, f0, f1, type = 'bandpass', q = 1.2, delay = 0) {
    if (this.muted || !this.ctx || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, f1 === undefined ? f0 : f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  },
  // 동전: 반짝이는 두 음 + 살짝 노이즈
  coin() {
    this.toneAt(1180, 0.08, 'triangle', 0.14, 0, 0);
    this.toneAt(1760, 0.12, 'triangle', 0.11, 240, 0.045);
    this.toneAt(2640, 0.09, 'sine', 0.05, 0, 0.085);
  },
  harvest() {
    this.toneAt(180, 0.12, 'sine', 0.2, -70, 0);
    this.noiseAt(0.16, 0.09, 1300, 400, 'bandpass', 0.9, 0.02);
    this.toneAt(520, 0.07, 'triangle', 0.05, 120, 0.05);
  },
  fry() {
    this.noiseAt(0.55, 0.13, 2600, 900, 'highpass', 0.7, 0);
    this.noiseAt(0.3, 0.08, 800, 260, 'bandpass', 1.4, 0.02);
    this.toneAt(140, 0.16, 'sine', 0.09, -40, 0.01);
  },
  serve() {
    this.toneAt(783, 0.1, 'triangle', 0.13, 0, 0);
    this.toneAt(1174, 0.16, 'triangle', 0.1, 0, 0.06);
  },
  upgrade() {
    [523, 659, 784, 1046].forEach((f, i) => this.toneAt(f, 0.18, 'triangle', 0.14, 0, i * 0.075));
    this.noiseAt(0.5, 0.06, 5200, 2400, 'highpass', 0.8, 0.12);
    this.toneAt(1568, 0.3, 'sine', 0.07, 0, 0.3);
  },
  night() {
    this.toneAt(196, 0.9, 'sine', 0.14, -60, 0);
    this.toneAt(146, 1.1, 'triangle', 0.09, -30, 0.06);
    this.noiseAt(1.0, 0.05, 400, 120, 'lowpass', 0.8, 0);
  },
  alarm() {
    this.toneAt(660, 0.2, 'sawtooth', 0.08, 220, 0);
    this.toneAt(880, 0.2, 'sawtooth', 0.07, -180, 0.18);
  },
  laser() {
    this.toneAt(1400, 0.5, 'sawtooth', 0.1, -1200, 0);
    this.noiseAt(0.5, 0.1, 3000, 500, 'bandpass', 2.0, 0);
  },
  shoot() {
    this.toneAt(420, 0.07, 'square', 0.1, -260, 0);
    this.noiseAt(0.08, 0.06, 2400, 900, 'highpass', 1.0, 0);
  },
  found() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.toneAt(f, 0.34, 'triangle', 0.14, 0, i * 0.12));
    this.noiseAt(1.2, 0.05, 6000, 3000, 'highpass', 0.8, 0.3);
  },
  boo() {
    this.toneAt(160, 0.4, 'sawtooth', 0.11, -70, 0);
    this.noiseAt(0.3, 0.07, 600, 140, 'lowpass', 1.0, 0);
  },
  damaged() {
    this.noiseAt(0.35, 0.15, 2200, 300, 'bandpass', 0.7, 0);
    this.toneAt(120, 0.3, 'square', 0.09, -60, 0.02);
  },
};

/* ── 렌더러 · 카메라 ──────────────────────────────────────────────────── */
function defaultCam() {
  const a = innerWidth / innerHeight;
  if (a < 0.85) return { pos: V3(23.5, 21.5, 19.0), target: V3(3.2, 0.9, 0.6), fov: 62 };
  if (a < 1.25) return { pos: V3(21.0, 13.0, 24.5), target: V3(1.2, 2.0, 0.2), fov: 52 };
  return { pos: V3(20.0, 13.2, 20.0), target: V3(1.0, 1.7, -1.0), fov: 47 };
}

function initThree() {
  const canvas = $('gl');
  if (!_gpuProbed) {
    const probe = document.createElement('canvas').getContext('webgl2');
    const dbgInfo = probe && probe.getExtension('WEBGL_debug_renderer_info');
    GPU_NAME = dbgInfo ? String(probe.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)) : '';
    SOFT = /SwiftShader|llvmpipe|Software|ANGLE \(Google/i.test(GPU_NAME);
    // 프로브용 컨텍스트를 돌려준다 — 재구성이 반복되면 브라우저 컨텍스트 한도에 걸린다
    try { const lc = probe && probe.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext(); } catch (e) {}
    _gpuProbed = true;
  }
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !SOFT, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(SOFT ? 1 : Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = SOFT ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.info.autoReset = false;

  scene = new THREE.Scene();
  const d = defaultCam();
  camera = new THREE.PerspectiveCamera(d.fov, window.innerWidth / window.innerHeight, 0.1, 340);
  camera.position.copy(d.pos);

  // IBL: 스튜디오 환경 반사 (스텐레스·유리·자동차·금은 감자)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envRT = pmrem.fromScene(envScene, 0.04);
  const envTex = envRT.texture;
  envTex.userData.ffaShared = true;   // 공용 환경맵 — 절대 dispose 하지 않는다
  pmrem.dispose();

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

  W = buildWorld(THREE, scene, { soft: SOFT, env: envTex });

  // 후처리: 블룸(네온·헤드라이트·황금 감자·레이저)
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(SOFT ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    SOFT ? 0.28 : 0.36,  // strength
    0.45,                // radius
    1.5                  // threshold
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

/* ── 그래픽 복구 · 흰 화면 방어 ──────────────────────────────────────────
   장시간 플레이에서 GPU 메모리 고갈/드라이버 문제로 WebGL 컨텍스트가 잃어버려도
   DOM(HUD)은 멀쩡하고 3D 캔버스만 하얗게 죽은 채 남는다. 그 상태를 감지해
   (1) 컨텍스트 복구 이벤트를 받아 재렌더, (2) 복구가 안 되면 캔버스·렌더러·월드를
   새로 만들어 게임 상태를 유지한 채 되살린다.                                 */
function bindCanvasLifecycle(cv) {
  if (!cv) return;
  cv.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();                 // 복구 의사 표시 — 브라우저가 restore 를 시도한다
    S.ctxLost = true;
    S.ctxLostAt = performance.now();
    setGfxNotice('🎥 그래픽을 복구하는 중…');
  }, false);
  cv.addEventListener('webglcontextrestored', () => {
    S.ctxLost = false;
    S.ctxLostAt = 0;
    S.gfxErrT = 0;
    // 부분 초기화(composer.reset + needsUpdate)로는 못 살린다:
    //  - PMREM 으로 만든 환경맵(envTex)은 이미지가 없는 렌더타깃 텍스처라
    //    컨텍스트를 잃은 뒤 다시 올릴 수 없어 금속·텍스처 표면이 검게 남고,
    //  - 섀도우맵·후처리 렌더타깃도 새 컨텍스트에서 다시 만들어야 한다.
    // 그래서 복구 이벤트를 받으면 렌더러·씬·월드·후처리를 통째로 새로 만든다.
    setTimeout(() => {
      if (S.rebuilding) return;
      if (performance.now() - _lastRebuildEnd < 2000) return;   // 방금 재구성했으면 건너뛴다
      clearGfxNotice();
      rebuildGraphics('context-restored');
    }, 0);
  }, false);
}

/* ── 백그라운드 복귀 ────────────────────────────────────────────────────
   모바일에서 탭을 오래 내려놓으면 GPU 컨텍스트가 소리 없이 사라지고,
   복귀 후 webglcontextlost/restored 이벤트가 오지 않은 채 캔버스만 새까맣게
   남는 경우가 있다. 복귀 시점에 컨텍스트를 직접 확인해 잃어버렸으면 그래픽을
   새로 만들고, 아니면 시간 점프를 지운 뒤 즉시 한 프레임 그려 화면을 살린다. */
let _lastResume = 0, _resumeDarkAt = 0, _lastRebuildEnd = 0;
function dawnFactor() {
  if (S.phase === 'night') return clamp((S.clock - 27.7) / 2.3, 0, 1);
  return clamp(1 - (S.clock - 6) / 1.1, 0, 1) * 0.9;
}

function onPageResume(reason) {
  const now = performance.now();
  if (now - _lastResume < 800) return;      // visibilitychange·focus 중복 호출 방지
  _lastResume = now;
  try { clock.getDelta(); } catch (e) {}    // 백그라운드 공백을 시뮬레이션에 넣지 않는다
  if (!renderer || !camera) return;
  // 주소창·회전으로 화면 크기가 바뀐 채 돌아온 경우 캔버스부터 맞춘다
  const cv = $('gl');
  if (cv && (Math.abs(cv.clientWidth - innerWidth) > 1 || Math.abs(cv.clientHeight - innerHeight) > 1)) {
    try { applyViewport(); } catch (e) {}
  }
  const gl = renderer.getContext ? renderer.getContext() : null;
  if (!gl || gl.isContextLost()) {
    S.ctxLost = true;
    S.ctxLostAt = now;
    setGfxNotice('🎥 그래픽을 복구하는 중…');
    if (window.console) console.warn('[fry-factory] 복귀 시 컨텍스트 손실 — 재구성:', reason);
    if (now - _lastRebuildEnd > 1500) rebuildGraphics('resume-lost');
    return;
  }
  try {
    if (W) W.setNight(S.nightMix, S.blackout ? 1 : 0, dawnFactor());
    renderer.shadowMap.needsUpdate = true;
    renderFrame();
    renderFrame();
    // 복귀 직후 프레임이 통째로 검으면 기다리지 말고 바로 재구성한다
    // (오래 멈춘 뒤 렌더타깃·텍스처가 무효화된 경우)
    const lum = sampleCanvasLum([[0.5, 0.55], [0.38, 0.5], [0.62, 0.62], [0.5, 0.86]]);
    if (lum && Math.max.apply(null, lum) < 9 && sceneShouldBeVisible()) {
      if (window.console) console.warn('[fry-factory] 복귀 화면이 검음 — 즉시 재구성:', reason);
      rebuildGraphics('resume-black');
      return;
    }
  } catch (e) { /* 아래 감시 장치가 다시 시도한다 */ }
  _resumeDarkAt = now + 4000;              // 복귀 직후 검은 화면은 더 엄격하게 본다
}

function bindLifecycleEvents() {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) onPageResume('visibility');
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) onPageResume('pageshow'); });
  window.addEventListener('focus', () => { if (!document.hidden) onPageResume('focus'); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyViewport, 120);
    });
  }
}

let _gfxNoticeT = 0;
function setGfxNotice(msg) {
  try {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('show');
    clearTimeout(_gfxNoticeT);
  } catch (e) {}
}
function clearGfxNotice() {
  try {
    const el = $('toast');
    clearTimeout(_gfxNoticeT);
    _gfxNoticeT = setTimeout(() => el.classList.remove('show'), 1200);
  } catch (e) {}
}

// 씬 그래프와 게임 상태의 비유한 값을 안전한 값으로 되돌린다
function sanitizeScene() {
  if (!scene) return 0;
  let fixed = 0;
  const ok3 = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  scene.traverse((o) => {
    if (!ok3(o.position)) { o.position.set(0, 0, 0); fixed++; }
    if (!ok3(o.scale)) { o.scale.set(1, 1, 1); fixed++; }
    if (!ok3(o.rotation)) { o.rotation.set(0, 0, 0); fixed++; }
    if (o.isLight && !Number.isFinite(o.intensity)) { o.intensity = 0; fixed++; }
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m) continue;
      if (m.color && !(Number.isFinite(m.color.r) && Number.isFinite(m.color.g) && Number.isFinite(m.color.b))) {
        m.color.setRGB(0.8, 0.8, 0.8); fixed++;
      }
      if (m.emissive && !(Number.isFinite(m.emissive.r) && Number.isFinite(m.emissive.g) && Number.isFinite(m.emissive.b))) {
        m.emissive.setRGB(0, 0, 0); fixed++;
      }
      if (m.opacity !== undefined && !Number.isFinite(m.opacity)) { m.opacity = 1; fixed++; }
      // emissiveIntensity/roughness 는 해당 재질이 쓰는 경우에만 검사한다
      if (m.emissive && !Number.isFinite(m.emissiveIntensity)) { m.emissiveIntensity = 1; fixed++; }
      if (m.isMeshStandardMaterial && !Number.isFinite(m.roughness)) { m.roughness = 0.8; fixed++; }
    }
  });
  // 카메라
  if (camera) {
    if (!ok3(camera.position)) { const d = defaultCam(); camera.position.copy(d.pos); fixed++; }
    if (!Number.isFinite(camera.fov) || camera.fov <= 0) { camera.fov = defaultCam().fov; fixed++; }
    camera.updateProjectionMatrix();
  }
  if (controls && !ok3(controls.target)) { const d = defaultCam(); controls.target.copy(d.target); fixed++; }
  // 게임 수치
  const safe = { money: 0, clock: 6, dayT: 0, nightT: 0, nightMix: 0, keyPct: 0, readyFries: 0, shutterHP: 100, speed: 4 };
  for (const k of Object.keys(safe)) {
    if (!Number.isFinite(S[k])) { S[k] = safe[k]; fixed++; }
  }
  if (!Number.isFinite(S.day) || S.day < 1) { S.day = 1; fixed++; }
  if (!Number.isFinite(S.stats.earned)) S.stats.earned = 0;
  for (const a of [...S.agents, ...S.robots]) {
    if (!Number.isFinite(a.pos.x) || !Number.isFinite(a.pos.z)) {
      a.pos.set ? a.pos.set(0, 0, 0) : (a.pos.x = 0, a.pos.z = 0); fixed++;
    }
  }
  for (const c of S.customers) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) { c.x = L.spawn.car.x; c.z = L.spawn.car.z; fixed++; }
  }
  for (const p of (S.piles || [])) if (!Number.isFinite(p.stock)) { p.stock = 0; fixed++; }
  return fixed;
}

// 캔버스 픽셀 계측 — 구현체가 허용하는 readPixels 포맷을 먼저 물어본다.
// (모바일 크롬의 display-p3 캔버스처럼 RGBA/UNSIGNED_BYTE 읽기가 거부되면
//  흰 화면·검은 화면 감시가 통째로 무력해진다)
let _pxBuf = null, _pxFmt = 0, _pxType = 0, _pxProbeBroken = false;
function initPixelProbe(gl) {
  if (_pxFmt) return true;
  try {
    _pxFmt = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) || gl.RGBA;
    _pxType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) || gl.UNSIGNED_BYTE;
    _pxBuf = (_pxType === gl.FLOAT) ? new Float32Array(4) : new Uint8Array(4);
    return true;
  } catch (e) { _pxProbeBroken = true; return false; }
}

// 지정한 UV 지점들의 휘도(0~255)를 반환. 읽을 수 없으면 null
function sampleCanvasLum(pts) {
  if (_pxProbeBroken || S.ctxLost || !renderer) return null;
  try {
    const gl = renderer.getContext();
    if (!gl || gl.isContextLost()) return null;
    if (!initPixelProbe(gl)) return null;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!w || !h) return null;
    const scale = (_pxType === gl.FLOAT) ? 255 : 1;
    const out = [];
    for (const [ux, uy] of pts) {
      gl.readPixels(Math.floor(w * ux), Math.floor(h * uy), 1, 1, _pxFmt, _pxType, _pxBuf);
      if (gl.getError() !== gl.NO_ERROR) { _pxProbeBroken = true; return null; }
      out.push((_pxBuf[0] * 0.2126 + _pxBuf[1] * 0.7152 + _pxBuf[2] * 0.0722) * scale);
    }
    return out;
  } catch (e) {
    return null;
  }
}

// 지금 상태라면 화면이 밝아야 하는가 (정상적인 밤·정전 연출과 구분한다)
function sceneShouldBeVisible() {
  if (!W || !W.refs || !W.refs.hemi) return false;
  if (S.blackout) return false;                                         // 정전 연출은 정상적으로 어둡다
  const hemi = W.refs.hemi.intensity, amb = W.refs.amb.intensity;
  const moon = W.refs.moonLight ? W.refs.moonLight.intensity : 0;
  if (S.phase === 'day') return true;
  return (hemi + amb) > 0.12 || moon > 0.3;
}

let gfxLast = 0, gfxTick = 0, whiteStreak = 0, darkStreak = 0;
let _lastLum = null;
function graphicsWatchdog() {
  const now = performance.now();
  if (now - gfxLast < 1000) return;      // 벽시계 1초 간격 (프레임이 느려도 동작)
  gfxLast = now;
  gfxTick++;
  if (S.rebuilding) return;
  // 1) 컨텍스트 상태 — 이벤트를 놓친 배경 복귀도 여기서 잡는다
  const glNow = renderer && renderer.getContext ? renderer.getContext() : null;
  if (glNow && glNow.isContextLost() && !S.ctxLost) {
    S.ctxLost = true;
    S.ctxLostAt = now;
    setGfxNotice('🎥 그래픽을 복구하는 중…');
  }
  if (S.ctxLost) {
    // 복구 이벤트를 기다리고, 안 오면 직접 재구성
    if (S.ctxLostAt && now - S.ctxLostAt > 4000) rebuildGraphics('context-lost');
    return;
  }
  // 2) 흰 화면 · 검은 화면 감시 (2초 간격) — 렌더 직후 같은 프레임에서 읽는다
  if (gfxTick % 2 !== 0) return;
  const lum = sampleCanvasLum([
    [0.5, 0.5], [0.35, 0.6], [0.65, 0.4],           // 흰 화면 판정
    [0.5, 0.55], [0.38, 0.5], [0.62, 0.62], [0.5, 0.86],  // 검은 화면 판정
  ]);
  if (lum) _lastLum = lum.map((v) => Math.round(v));
  const white = lum ? lum.slice(0, 3).every((v) => v >= 250) : false;
  const black = lum ? Math.max.apply(null, lum.slice(3)) < 9 : false;
  if (white) {
    whiteStreak++;
    if (whiteStreak === 2) {
      const fixed = sanitizeScene();
      if (composer && composer.reset) { try { composer.reset(); } catch (e) {} }
      renderer.shadowMap.needsUpdate = true;
      if (window.console) console.warn('[fry-factory] 흰 화면 감지 — 씬 정화', fixed);
    } else if (whiteStreak >= 4) {
      if (window.console) console.warn('[fry-factory] 흰 화면 지속 — 그래픽 파이프라인 재구성');
      whiteStreak = 0;
      rebuildGraphics('white-screen');
    }
    return;
  }
  whiteStreak = 0;
  // 조명은 살아 있는데 아무것도 안 보이면 파이프라인이 죽은 것이다
  if (!black || !sceneShouldBeVisible()) { darkStreak = 0; return; }
  darkStreak++;
  const urgent = now < _resumeDarkAt;                 // 복귀 직후면 바로 판단
  if (darkStreak >= (urgent ? 1 : 3)) {
    if (window.console) console.warn('[fry-factory] 검은 화면 지속 — 그래픽 파이프라인 재구성');
    darkStreak = 0;
    rebuildGraphics('black-screen');
  }
}

// 렌더 파이프라인 + 월드를 새로 만들어 게임 상태를 유지한 채 되살린다
function rebuildGraphics(reason) {
  if (S.rebuilding) return false;
  S.rebuilding = true;
  if (window.console) console.warn('[fry-factory] 그래픽 재구성:', reason);
  try {
    const camP = camera ? camera.position.clone() : null;
    const camT = controls ? controls.target.clone() : null;
    const camF = camera ? camera.fov : 0;
    const robots = S.robots.length;
    const brokenIds = S.robots.filter((r) => r.broken).map((r) => r.id);
    const agentPos = S.agents.map((a) => ({ id: a.id, x: a.pos.x, z: a.pos.z, face: a.face }));
    // 컨텍스트를 잃었거나 복구된 직후면 이전 GPU 자원은 이미 사라졌다.
    // 이미 죽은 컨텍스트의 객체를 삭제하려 들면 GL 경고만 쏟아진다.
    const lostCtx = S.ctxLost || reason === 'context-restored' || reason === 'context-lost'
      || reason === 'resume-lost';

    // 동적 오브젝트 정리
    if (!lostCtx) {
      S.customers.forEach((c) => { disposeTree(c.mesh); disposeTree(c.shadow); });
      S.beltItems.forEach((b) => disposeTree(b.mesh));
      S.anomalies.forEach((an) => removeAnomaly(an));
      S.shots.forEach((s) => disposeTree(s.mesh));
    }
    S.customers.length = 0;
    S.beltItems.length = 0;
    S.anomalies.length = 0;
    S.shots.length = 0;
    parts.length = 0;
    coinFx.length = 0;
    popIns.length = 0;
    S.agents.length = 0;
    S.robots.length = 0;
    S.blackout = false;

    // 이전 월드 GPU 자원 회수 (공용 자산은 표시가 있어 건너뛴다)
    if (scene && !lostCtx) { disposeTree(scene); }
    if (scene) scene.clear();
    if (composer && !lostCtx) { try { composer.dispose && composer.dispose(); } catch (e) {} }
    composer = null; bloomPass = null;
    if (renderer && !lostCtx) { try { renderer.dispose(); } catch (e) {} }
    renderer = null;

    // 새 캔버스 (죽은 컨텍스트는 재사용할 수 없다)
    const old = $('gl');
    const cv = document.createElement('canvas');
    cv.id = 'gl';
    if (old && old.getAttribute) cv.setAttribute('aria-label', old.getAttribute('aria-label') || '');
    if (old && old.parentNode) old.parentNode.replaceChild(cv, old);
    else $('wrap').appendChild(cv);

    initThree();                    // renderer · scene · camera · controls · W · composer
    _pxFmt = 0; _pxType = 0; _pxBuf = null; _pxProbeBroken = false;   // 새 컨텍스트의 readPixels 포맷을 다시 묻는다
    bindCanvasLifecycle(cv);
    if (camP && camT) {
      camera.position.copy(camP);
      controls.target.copy(camT);
      if (camF) { camera.fov = camF; camera.updateProjectionMatrix(); }
      controls.update();
    }

    // 월드에 딸린 것들 재생성
    initPiles(true);                // true = 재고 유지
    initLabels();
    createTrayBoxes();
    const c0 = spawnClerk(0), c1 = spawnClerk(1);
    agentPos.forEach((p) => {
      const a = [c0, c1].find((x) => x.id === p.id);
      if (!a) return;
      if (Number.isFinite(p.x) && Number.isFinite(p.z)) { a.pos.set(p.x, 0, p.z); a.mesh.position.copy(a.pos); }
      if (Number.isFinite(p.face)) { a.face = p.face; a.mesh.rotation.y = p.face; }
    });
    for (let i = 0; i < robots; i++) {
      const r = spawnRobot();
      if (brokenIds.includes(r.id)) r.broken = true;
    }
    restoreUpgradeVisuals();
    S.ctxLost = false;
    S.ctxLostAt = 0;
    whiteStreak = 0;
    darkStreak = 0;
    _resumeDarkAt = 0;
    try { clock.getDelta(); } catch (e) {}      // 재구성 중 흐른 시간을 시뮬레이션에 넣지 않는다
    if (W) W.setNight(S.nightMix, S.blackout ? 1 : 0, dawnFactor());
    labelCache.peel = labelCache.fry = labelCache.ready = null;
    renderer.shadowMap.needsUpdate = true;
    renderFrame();
    S.rebuilding = false;
    _lastRebuildEnd = performance.now();
    clearGfxNotice();
    toast('🎥 화면을 복구했습니다', 2600);
    return true;
  } catch (err) {
    S.rebuilding = false;
    if (window.console) console.warn('[fry-factory] 그래픽 재구성 실패', err);
    try { showGfxFatal(); } catch (e) {}
    return false;
  }
}

function showGfxFatal() {
  const el = $('err');
  if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML = '<div class="errBox"><b>그래픽을 되살리는 데 실패했어요</b><p>새로고침하면 다시 플레이할 수 있습니다.</p><button onclick="location.reload()">새로고침</button></div>';
}

// 업그레이드로 바뀐 월드 비주얼을 애니메이션 없이 되맞춘다
function restoreUpgradeVisuals() {
  if (!W || !W.refs) return;
  const R = W.refs;
  if (R.beltTarp) R.beltTarp.visible = !S.up.belt;
  if (R.beltGrp) R.beltGrp.visible = true;
  if (R.beltSlats) R.beltSlats.forEach((m) => { m.visible = !!S.up.belt; });
  if (R.peelerManual) R.peelerManual.visible = !S.up.peeler;
  if (R.peelerAuto) R.peelerAuto.visible = !!S.up.peeler;
  if (R.vats && S.up.autoFry) R.vats.forEach((v) => { v.material.emissiveIntensity = 0.55; });
  if (R.turret) R.turret.visible = !!S.up.shooter;
  if (S.keyFound && R.padlock) R.padlock.visible = false;
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
  if (composer) composer.setSize(w, h);
  if (bloomPass) bloomPass.resolution.set(w, h);
}


/* ── 접지 그림자 (캐릭터·차량 발밑) ───────────────────────────────────── */
let _blobTex = null;
function blobTex() {
  if (_blobTex) return _blobTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,.55)');
  grd.addColorStop(0.55, 'rgba(0,0,0,.28)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  _blobTex = new THREE.CanvasTexture(cv);
  _blobTex.colorSpace = THREE.SRGBColorSpace;
  _blobTex.userData.ffaShared = true;
  return _blobTex;
}
const blobMat = () => new THREE.MeshBasicMaterial({
  map: blobTex(), transparent: true, opacity: 0.55, depthWrite: false, color: 0x000000,
});
function makeBlob(w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), blobMat());
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
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
  a.shadow = makeBlob(0.95, 0.95);
  a.shadow.position.set(a.pos.x, 0.035, a.pos.z);
  scene.add(a.shadow);
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
  r.shadow = makeBlob(1.15, 0.95);
  r.shadow.position.set(r.pos.x, 0.035, r.pos.z);
  scene.add(r.shadow);
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
  if (!el || !el.userData.setText) return;
  if (typeof text === 'string' && text.indexOf('NaN') >= 0) return;   // 비유한 수치가 라벨 텍스처로 새지 않게
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
  c.shadow = makeBlob(walker ? 0.95 : 2.5, walker ? 0.95 : 3.6);
  c.shadow.position.set(c.x, 0.03, c.z);
  c.shadow.rotation.z = walker ? 0 : Math.PI / 2;
  scene.add(c.shadow);
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
      if (c.shadow) { c.shadow.position.set(c.x, 0.03, c.z); c.shadow.material.opacity = 0.55 * clamp(1 - (c.z - 5) / 26, 0, 1); }
      if (c.kind === 'car') c.mesh.position.x = lerp(c.mesh.position.x, L.carStop.x + 0.2, dt * 2);
      if (c.z > 30) { disposeTree(c.mesh); disposeTree(c.shadow); S.customers.splice(i, 1); }
      continue;
    }
    if (c.state === 'arrive') {
      const dz = c.targetZ - c.z, dx = c.targetX - c.x;
      const dist = Math.hypot(dz, dx);
      const sp = (c.kind === 'car' ? 8.5 : 2.4) * dt;
      if (dist < 0.12) {
        c.state = 'wait'; c.wait = 0;
        if (c.kind === 'car') c._bounce = 0.1;
      } else {
        c.x += (dx / dist) * Math.min(sp, dist);
        c.z += (dz / dist) * Math.min(sp, dist);
        if (c.kind === 'car') c.mesh.rotation.y = Math.atan2(dx, dz);
      }
      c.mesh.position.set(c.x, 0, c.z);
      if (c.shadow) {
        c.shadow.position.set(c.x, 0.03, c.z);
        c.shadow.rotation.z = c.kind === 'car' ? Math.PI / 2 : 0;
      }
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
    if (c.shadow) c.shadow.position.set(c.x, 0.03, c.z);
    if (c.patience <= 0 && c.state === 'wait') {
      c.state = 'leave';
      if (c.assigned) c.assigned = null;
      if (c.kind === 'car') c._bounce = 0.08;
      pop(c.x, 1.8, c.z, '손님 퇴장…', 'warn');
    }
  }
}

/* ── 머니 · 팝업 · 토스트 ─────────────────────────────────────────────── */
function addMoney(n, at, label) {
  if (!n) return;
  S.money += n;
  S.stats.earned += n;
  if (at) {
    pop(at.x, at.y, at.z, label || ('+$' + fmt(n)), 'money');
    coin3D(at.x, at.y + 0.25, at.z);
  }
  const el = $('cMoney');
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}
function pop(x, y, z, text, cls) {
  if (!camera || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
  TMP.set(x, y, z).project(camera);
  if (!Number.isFinite(TMP.x) || !Number.isFinite(TMP.y) || TMP.z > 1 || TMP.z < -1) return;
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
  placeBanner(el);
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// 밤 상태 패널(#nightbar)과 배너가 모바일 세로 화면에서 겹치지 않게 패널 아래로 내린다
function placeBanner(el) {
  if (!el) return;
  const h = window.innerHeight || 720;
  let top = h * 0.27;
  const nb = $('nightbar');
  if (nb && !nb.classList.contains('hidden')) {
    const r = nb.getBoundingClientRect();
    if (r.height > 0) top = Math.max(top, r.bottom + Math.min(100, h * 0.12));
  }
  el.style.top = Math.round(Math.min(top, h * 0.58)) + 'px';
}

/* ── 파티클 ───────────────────────────────────────────────────────────── */
const shotGeo = new THREE.BoxGeometry(0.1, 0.34, 0.1);
shotGeo.userData.ffaShared = true;
const shotMat = new THREE.MeshStandardMaterial({ color: 0xffd35c, roughness: 0.7 });
shotMat.userData.ffaShared = true;
const parts = [];
const partGeo = new THREE.SphereGeometry(0.045, 5, 4);
partGeo.userData.ffaShared = true;
function burst(x, y, z, color, n = 6, power = 2.2, size = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;   // NaN 원천 차단
  const room = 240 - parts.length;
  if (room <= 0) return;
  n = Math.min(n, room);
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

function initPiles(keep) {
  const old = keep && S.piles ? S.piles.reduce((m, p) => (m[p.key] = p, m), {}) : null;
  S.piles = W.refs.piles.map((p) => {
    const o = Object.assign(p, {
      stock: p.key === 'normal' ? 260 : p.key === 'gold' ? 16 : 9,
      max: p.key === 'normal' ? 260 : p.key === 'gold' ? 16 : 9,
      regen: p.key === 'normal' ? 1.1 : p.key === 'gold' ? 0.09 : 0.035,
      acc: 0,
    });
    if (old && old[p.key] && Number.isFinite(old[p.key].stock)) {
      o.stock = clamp(old[p.key].stock, 0, o.max);
      o.acc = fin(old[p.key].acc, 0);
    }
    return o;
  });
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
        disposeTree(it.mesh);
        S.beltItems.splice(i, 1);
        burst(B.x, B.y + 0.2, B.z1 + 0.3, 0xd8b078, 1, 0.8, 0.5);
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
  burst(L.fryer.x + rnd(-1, 1), 1.6, L.fryer.z, 0xffd060, 2, 1.0, 0.5);
  SFX.fry();
  return true;
}

function finishSlot(slot) {
  if (slot.state !== 2) return 0;
  const mult = slot.type === 'crystal' ? 3 : slot.type === 'gold' ? 2 : 1;
  const n = Math.min(SLOT_FRIES * mult, MAX_READY - S.readyFries);
  S.readyFries += n;
  S.stats.fries += n;
  slot.state = 0; slot.t = 0; slot.type = 'n';
  burst(L.fryer.x + rnd(-1, 1), 1.7, L.fryer.z + 0.5, 0xffe08a, 2, 1.0, 0.5);
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
        burst(L.peeler.x, 1.2, L.peeler.z + 0.6, 0xf0d8a8, 1, 0.8, 0.45);
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
  const p = BASE_PRICE * Math.pow(1.5, S.up.price) * (1 + 0.10 * (S.day - 1)) * S.puckFx.price * (1 + S.perm);
  return Number.isFinite(p) && p > 0 ? Math.min(p, 1e9) : BASE_PRICE;
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
  burst(c.x, 1.4, c.z, 0xffd34d, 5, 2.0, 0.7);
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
    { kind: 'goto', x: pile.x + 1.62, z: pile.z + 0.95 },
    {
      kind: 'act', dur: 0.95, onEnd: (a) => {
        const n = Math.min(carryMax(), Math.floor(pile.stock));
        if (n <= 0) { a.carryPot = 0; return; }
        pile.stock -= n; a.carryPot = n; a.carryType = pile.key;
        a.carryPotMesh.visible = true;
        burst(pile.x, 1.2, pile.z, pile.key === 'gold' ? 0xffd34d : pile.key === 'crystal' ? 0x8feaff : 0xd8b078, 3, 1.2, 0.6);
        S.stats.harvest += n;
        addKeyProgress(n);
        SFX.harvest();
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
    if (a.shadow) a.shadow.position.set(a.pos.x, 0.035, a.pos.z);
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
    if (r.shadow) r.shadow.position.set(r.pos.x, 0.035, r.pos.z);
    animateRobot(r, dt);
  }
}

function taskRobot(r) {
  const pile = pickRobotPile();
  if (!pile || !S.up.belt) return taskIdleRobot(r);
  return makeTask([
    { kind: 'goto', x: pile.x + 1.6, z: pile.z + 0.9 },
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
  const now = performance.now();
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
    arms[0].rotation.z = lerp(arms[0].rotation.z, -0.1 - act * 0.1, 0.2);
    arms[1].rotation.z = lerp(arms[1].rotation.z, 0.1 + act * 0.1, 0.2);
  }
  // 눈 깜박임 · 고개 흔들기
  const eyes = m.userData.eyes;
  if (eyes) {
    const ph = (now * 0.001 + (a.id.charCodeAt(1) || 0) * 1.7) % 5.2;
    const blink = ph < 0.13 ? 0.16 : 1;
    eyes.forEach((e) => { e.scale.y = 1.1 * blink; });
  }
  if (m.userData.head) {
    m.userData.head.rotation.y = Math.sin(now * 0.0009 + (a.id.charCodeAt(1) || 0)) * 0.16;
    m.userData.head.rotation.x = Math.sin(now * 0.0013) * 0.05 - (a.actPose || 0) * 0.12;
  }
  if (a.carryPot > 0 && a.carryPotMesh) {
    a.carryPotMesh.position.set(0, 1.12, 0.42);
    a.carryPotMesh.rotation.y += dt * 2;
  }
}

function animateRobot(r, dt) {
  const m = r.mesh;
  const now = performance.now();
  const walk = r.moving ? Math.sin(r.walkT) : 0;
  if (m.userData.armPivot) {
    m.userData.armPivot.rotation.x = lerp(m.userData.armPivot.rotation.x, (r.actPose || 0) * -1.15 + walk * 0.1, 0.2);
    m.userData.armPivot.rotation.z = lerp(m.userData.armPivot.rotation.z, (r.actPose || 0) * 0.18, 0.2);
  }
  if (m.userData.elbow) m.userData.elbow.rotation.x = lerp(m.userData.elbow.rotation.x, (r.actPose || 0) * 0.9 - 0.2, 0.2);
  if (m.userData.wheels) m.userData.wheels.forEach((w) => { w.rotation.x += (r.moving ? dt * 8 : 0); });
  if (m.userData.radar) m.userData.radar.rotation.y += dt * (r.broken ? 0.2 : 3.0);
  if (m.userData.headPivot) {
    m.userData.headPivot.rotation.y = lerp(m.userData.headPivot.rotation.y, Math.sin(now * 0.0011) * 0.22 * (r.moving ? 1 : 0.4), 0.1);
    m.userData.headPivot.rotation.x = lerp(m.userData.headPivot.rotation.x, (r.actPose || 0) * 0.18, 0.15);
  }
  if (r.broken) {
    const on = Math.sin(now * 0.018) > 0;
    if (m.userData.led) m.userData.led.material.color.setHex(on ? 0xff2a10 : 0x3a0800);
    if (m.userData.visorMat) m.userData.visorMat.color.setHex(on ? 0xff2a10 : 0x3a0800);
    if (m.userData.statusMat) m.userData.statusMat.color.setHex(on ? 0xff2a10 : 0x3a0800);
  } else {
    if (m.userData.led) m.userData.led.material.color.setHex(0x59ffd0);
    if (m.userData.visorMat) m.userData.visorMat.color.setHex(0x6fe8ff);
    if (m.userData.statusMat) m.userData.statusMat.color.setHex(Math.sin(now * 0.004) > 0 ? 0xffb347 : 0x6a4a18);
  }
  if (m.userData.claw) m.userData.claw.rotation.z = Math.sin(now * 0.004) * 0.12;
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
  S.beltItems.forEach((b) => disposeTree(b.mesh));
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

/* ── 발광 스프라이트 (연기·안광·비상등) ─────────────────────────────── */
const glowTexCache = {};
function makeGlowSprite(color, size, opacity) {
  const key = color + '_' + size;
  let tex = glowTexCache[key];
  if (!tex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.ffaShared = true;
    glowTexCache[key] = tex;
  }
  const mat = new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.setScalar(size);
  return sp;
}

function spawnAnomaly(type) {
  if (!S.started || S.phase !== 'night') return null;
  if (S.anomalies.some((a) => a.type === type && !a.done)) return null;
  if (type === 'robotBreak' && !S.robots.some((r) => !r.broken)) return null;
  const meta = ANOM_META[type];
  const an = { type, t: 0, done: false, mesh: null, hp: 3, assigned: null, needClerk: false, fixDur: 1.2, fade: 0, fireT: 0, walked: 0 };
  const g = new THREE.Group();

  if (type === 'windowMonster') {
    const dark = new THREE.MeshStandardMaterial({ color: 0x140f18, roughness: 0.98, metalness: 0.05 });
    const dark2 = new THREE.MeshStandardMaterial({ color: 0x241a26, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.35, 8, 14), dark);
    body.position.y = 1.25; body.castShadow = true; g.add(body);
    // 굽은 등 · 갈비뻐
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.04, 0.045, 6, 12, Math.PI * 1.1), dark2);
      rib.rotation.x = Math.PI / 2; rib.rotation.z = 0.2; rib.position.set(0, 1.55 - i * 0.28, -0.02);
      g.add(rib);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), dark);
    head.scale.set(1, 1.1, 0.95); head.position.y = 2.16; head.castShadow = true; g.add(head);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 10), dark2);
    jaw.rotation.x = Math.PI * 0.92; jaw.position.set(0, 1.95, 0.08); g.add(jaw);
    for (const sx of [-1, 1]) {
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a10 });
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), eyeMat);
      eye.position.set(sx * 0.11, 2.2, 0.26); g.add(eye);
      const glowS = makeGlowSprite(0xff3a10, 0.55, 0.75);
      glowS.position.set(sx * 0.11, 2.2, 0.3); g.add(glowS);
      // 긴 팔 + 발톱
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 1.1, 4, 8), dark);
      arm.position.set(sx * 0.44, 1.28, 0.05); arm.rotation.z = sx * 0.16; arm.castShadow = true; g.add(arm);
      for (let k = 0; k < 3; k++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.28, 6), dark2);
        claw.position.set(sx * (0.52 + k * 0.05), 0.6, 0.1 + (k - 1) * 0.07);
        claw.rotation.z = sx * (0.2 + k * 0.1); claw.rotation.x = -0.4;
        g.add(claw);
      }
      // 이빨
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), std2(0xd8cfae));
      tooth.position.set(sx * 0.07, 1.99, 0.19); tooth.rotation.x = Math.PI; g.add(tooth);
    }
    const bubble = makeTextSprite('빨리 튀겨 줘…', { size: 52, color: '#fff', bg: 'rgba(170,16,16,.94)', h: 0.62 });
    bubble.position.set(0, 2.9, 0.1); g.add(bubble);
    // 검은 연기
    for (let i = 0; i < 5; i++) {
      const sm = makeGlowSprite(0x1a1420, 1.2, 0.5);
      sm.position.set(rnd(-0.4, 0.4), rr(1.4, 2.3), rnd(-0.2, 0.2));
      sm.userData.ph = rnd(0, 6.28); g.add(sm); an.smoke = an.smoke || []; an.smoke.push(sm);
    }
    g.position.set(10.62, 0, L.window.z);
    g.rotation.y = -Math.PI / 2;
    an.needClerk = false;
  } else if (type === 'potatoBeast') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.88, emissive: 0x2a1206, emissiveIntensity: 0.55 });
    const bodyMat2 = new THREE.MeshStandardMaterial({ color: 0x6f4522, roughness: 0.92, emissive: 0x1c0c04, emissiveIntensity: 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 16), bodyMat);
    body.scale.set(1.2, 1.02, 1.06); body.position.y = 1.0; body.castShadow = true; g.add(body);
    // 울퉁불퉁 혹 — 인자 없는 rnd() 를 쓰면 NaN 이 되어 변환행렬·블룸이 오염된다
    for (let i = 0; i < 9; i++) {
      const a = rnd(0, Math.PI * 2), b = rnd(0, Math.PI);
      const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(finClamp(rr(0.14, 0.28), 0.1, 0.3, 0.2), 0), bodyMat2);
      lump.position.set(Math.sin(b) * Math.cos(a) * 0.9, 1.0 + Math.cos(b) * 0.85, Math.sin(b) * Math.sin(a) * 0.85);
      lump.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
      lump.castShadow = true; g.add(lump);
    }
    for (const sx of [-1, 1]) {
      // 붉은 안광
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a0a });
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), eyeMat);
      eye.position.set(sx * 0.3, 1.36, 0.84); g.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1a0500 }));
      pupil.position.set(sx * 0.3, 1.35, 0.97); g.add(pupil);
      const gs = makeGlowSprite(0xff3a10, 1.0, 0.85);
      gs.position.set(sx * 0.3, 1.36, 0.92); g.add(gs);
      // 뿔 · 이빨
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 8), bodyMat2);
      horn.position.set(sx * 0.44, 1.86, 0.16); horn.rotation.z = sx * 0.38; g.add(horn);
      for (let k = 0; k < 3; k++) {
        const th = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 5), std2(0xe8dfc0));
        th.position.set(sx * (0.14 + k * 0.06), 0.98, 0.9); th.rotation.x = Math.PI; g.add(th);
      }
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0x1c0703 }));
    mouth.position.set(0, 0.9, 0.9); g.add(mouth);
    // 연기
    for (let i = 0; i < 4; i++) {
      const sm = makeGlowSprite(0x2a1a10, 1.1, 0.45);
      sm.position.set(rnd(-0.5, 0.5), rr(1.6, 2.2), rnd(-0.2, 0.3));
      sm.userData.ph = rnd(0, 6.28); g.add(sm); an.smoke = an.smoke || []; an.smoke.push(sm);
    }
    g.position.set(L.belt.x, L.beltItemY - 0.35, 2.8);
    an.needClerk = true; an.fixDur = 1.25;
    an.clerkPos = beltSafe(L.belt.x + 1.5, 2.8);
  } else if (type === 'blackout') {
    S.blackout = true;
    an.needClerk = true; an.fixDur = 1.7;
    an.clerkPos = { x: L.breaker.x + 1.3, z: L.breaker.z + 0.2 };
    const spark = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), new THREE.MeshBasicMaterial({ color: 0x9be0ff }));
      s.position.set(rnd(-0.4, 0.4), rnd(1.1, 2.2), rnd(-0.3, 0.3));
      s.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
      spark.add(s);
    }
    spark.position.set(L.breaker.x, 0, L.breaker.z);
    g.add(spark); an.spark = spark;
    // 비상등 (빨강 점멸)
    const beaconS = makeGlowSprite(0xff2a10, 2.6, 0.6);
    beaconS.position.set(L.breaker.x + 0.5, 2.2, L.breaker.z);
    g.add(beaconS); an.beacon = beaconS;
    g.position.set(L.breaker.x, 0, L.breaker.z);
  } else if (type === 'laser') {
    const R = 3.1;
    const px = pick([-5.5, -1.5, 2.5, 5.5]) + rnd(-0.6, 0.6);
    const pz = rnd(2.6, 9.4);
    // 지면 균열 · 그을음
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 36), new THREE.MeshBasicMaterial({
      color: 0x2a0a04, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.045; g.add(scorch);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + rnd(-0.1, 0.1);
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(rr(0.08, 0.2), rr(0.8, 2.2)), new THREE.MeshBasicMaterial({
        color: 0xff4a20, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      crack.rotation.x = -Math.PI / 2; crack.rotation.z = a;
      crack.position.set(Math.cos(a) * R * 0.55, 0.052, Math.sin(a) * R * 0.55);
      g.add(crack);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.86, R, 48),
      new THREE.MeshBasicMaterial({ color: 0xff3320, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(R * 0.5, R * 0.57, 40),
      new THREE.MeshBasicMaterial({ color: 0xffa060, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.08; g.add(ring2);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.84, 40),
      new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; g.add(disc);
    // 조준 레이저 빔 (두 겹)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.05, R * 0.09, 18, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff8a5a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 9; g.add(beam);
    const beamGlow = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.34, 18, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beamGlow.position.y = 9; g.add(beamGlow);
    const warn = makeTextSprite('⚠ 레이저 ⚠', { size: 64, color: '#fff', bg: 'rgba(170,10,10,.9)', h: 0.72 });
    warn.position.set(0, 4.6, 0); g.add(warn);
    g.position.set(px, 0, pz);
    an.radius = R; an.center = { x: px, z: pz }; an.beam = beam; an.ring = ring; an.disc = disc;
    an.beamGlow = beamGlow; an.ring2 = ring2; an.warn = warn; an.life = 8.5;
    SFX.laser();
  } else if (type === 'robotBreak') {
    const r = pick(S.robots.filter((x) => !x.broken));
    r.broken = true; r.task = null;
    an.robot = r;
    an.needClerk = true; an.fixDur = 2.0;
    // 수리 위치가 벨트 금지 영역에 걸리지 않도록 로봇 반대편(벨트에서 먼 쪽)으로 잡는다
    const side = r.pos.x < L.belt.x ? -1 : 1;
    an.clerkPos = beltSafe(r.pos.x + side * 1.15, r.pos.z + 0.85);
    const spark = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
      s.position.set(rnd(-0.3, 0.3), rnd(0.8, 1.5), rnd(-0.3, 0.3));
      s.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
      spark.add(s);
    }
    g.add(spark); an.spark = spark;
    for (let i = 0; i < 3; i++) {
      const sm = makeGlowSprite(0x3a3a44, 0.9, 0.42);
      sm.position.set(rnd(-0.3, 0.3), rr(1.0, 1.7), rnd(-0.3, 0.3));
      sm.userData.ph = rnd(0, 6.28); g.add(sm); an.smoke = an.smoke || []; an.smoke.push(sm);
    }
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
  if (an.mesh) { disposeTree(an.mesh); an.mesh = null; }
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
      if (an.beacon) an.beacon.material.opacity = 0.25 + Math.abs(Math.sin(an.t * 4.2)) * 0.6;
    } else if (an.type === 'laser') {
      if (an.ring) {
        const pulse = 0.55 + Math.sin(an.t * 9) * 0.22;
        an.ring.material.opacity = pulse;
        if (an.disc) an.disc.material.opacity = 0.14 + pulse * 0.18;
        if (an.beam) an.beam.material.opacity = 0.1 + pulse * 0.12;
        if (an.beamGlow) an.beamGlow.material.opacity = 0.06 + pulse * 0.1;
        if (an.ring2) { an.ring2.rotation.z += dt * 1.4; an.ring2.material.opacity = 0.28 + pulse * 0.3; }
        if (an.warn) an.warn.material.opacity = 0.55 + pulse * 0.45;
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
    // 연기 맥동
    if (an.smoke) {
      an.smoke.forEach((sm, k) => {
        sm.material.opacity = 0.18 + Math.abs(Math.sin(an.t * 1.3 + k)) * 0.28;
        sm.position.y += Math.sin(an.t * 2 + k) * 0.002;
      });
    }
  }
}

function damageShutter(n, at) {
  S.shutterHP = Math.max(0, S.shutterHP - n);
  pop(at ? at.x : 9.2, 2.6, at ? at.z : L.window.z, '-' + n + ' 셔터', 'warn');
  SFX.damaged();
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
  if (!from || !to) return;
  if (![from.x, from.y, from.z, to.x, to.y, to.z].every(Number.isFinite)) return;   // NaN 발사체 차단
  const g = new THREE.Group();
  const n = Math.max(1, Math.min(4, Math.floor(fin(opt.n, 1))));
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(shotGeo, shotMat);
    f.position.set(rnd(-0.07, 0.07), rnd(-0.05, 0.05), rnd(-0.07, 0.07));
    f.rotation.set(rnd(0, 1), rnd(0, 1), rnd(0, 1));
    g.add(f);
  }
  g.position.copy(from);
  scene.add(g);
  S.shots.push({
    mesh: g, from: from.clone(), to: to.clone(), t: 0,
    dur: Math.max(0.12, fin(opt.dur, 0.42)), arc: fin(opt.arc, 1.0), onHit,
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
      disposeTree(s.mesh);
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
  const c = u.cost ? Math.round(u.cost * Math.pow(u.grow || 1, lv)) : 0;
  return Number.isFinite(c) ? c : 0;
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
      `<span class="uCost">${u.id === 'skip' ? '무료' : '$' + fmt(upCost(u))}</span>` +
      `<span class="uBar"><i></i></span>`;
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
    const barEl = el.querySelector('.uBar i');
    if (barEl) {
      const pct = u.max > 1 ? Math.round((lv / u.max) * 100) : (maxed ? 100 : 0);
      barEl.style.width = pct + '%';
    }
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
    popIn(W.refs.beltGrp, 0.5);
    burst(L.belt.x, 1.2, 3, 0xffd34d, 14, 3, 1);
  } else if (id === 'peeler') {
    W.refs.peelerManual.visible = false;
    W.refs.peelerAuto.visible = true;
    popIn(W.refs.peelerAuto, 0.6);
    burst(L.peeler.x, 1.4, L.peeler.z, 0x9be0ff, 12, 2.6, 1);
  } else if (id === 'robot') {
    const r = spawnRobot();
    popIn(r.mesh, 0.75);
    burst(r.pos.x, 1.2, r.pos.z, 0x9be0ff, 16, 2.8, 1.1);
    burst(r.pos.x, 0.5, r.pos.z, 0xffd34d, 10, 2.2, 0.8);
    pop(r.pos.x, 2.3, r.pos.z, '🤖 감자 로봇 등장!', 'big');
  } else if (id === 'autoFry') {
    W.refs.vats.forEach((v) => { v.material.emissiveIntensity = 0.55; });
    popIn(W.refs.fryer, 0.6);
    burst(L.fryer.x, 2, L.fryer.z, 0xffd060, 14, 2.8, 1);
  } else if (id === 'shooter') {
    W.refs.turret.visible = true;
    popIn(W.refs.turret, 0.7);
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

/* ── 3D 코인 · 업그레이드 팝인 ─────────────────────────────────────────── */
const coinGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.035, 18);
coinGeo.userData.ffaShared = true;
const coinMat = new THREE.MeshStandardMaterial({
  color: 0xffcf3d, metalness: 0.95, roughness: 0.2, emissive: 0x5a3a00,
  emissiveIntensity: 0.4, envMapIntensity: 1.6,
});
coinMat.userData.ffaShared = true;
const coinFx = [];
function coin3D(x, y, z) {
  if (coinFx.length > 16) return;
  const m = new THREE.Mesh(coinGeo, coinMat);
  m.position.set(x + rnd(-0.18, 0.18), y, z + rnd(-0.18, 0.18));
  m.rotation.set(Math.PI / 2, 0, rnd(0, 6));
  m.castShadow = false;
  scene.add(m);
  coinFx.push({ m, t: 0, vx: rnd(-0.7, 0.7), vy: rnd(1.8, 2.8), vz: rnd(-0.7, 0.7) });
}
function updateCoins(dt) {
  for (let i = coinFx.length - 1; i >= 0; i--) {
    const c = coinFx[i];
    c.t += dt; c.vy -= 5.4 * dt;
    c.m.position.x += c.vx * dt;
    c.m.position.y += c.vy * dt;
    c.m.position.z += c.vz * dt;
    c.m.rotation.z += dt * 9;
    const k = c.t / 0.95;
    c.m.scale.setScalar(Math.max(0.001, 1 - k * 0.35));
    if (k >= 1) { scene.remove(c.m); coinFx.splice(i, 1); }
  }
}
const popIns = [];
function popIn(obj, dur = 0.7) {
  if (!obj) return;
  obj.scale.setScalar(0.001);
  popIns.push({ obj, t: 0, dur });
}
function updatePopIns(dt) {
  for (let i = popIns.length - 1; i >= 0; i--) {
    const p = popIns[i];
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    const s = k >= 1 ? 1 : 1 - Math.pow(2, -8 * k) * Math.cos(k * Math.PI * 3.1);
    p.obj.scale.setScalar(Math.max(0.02, s));
    if (k >= 1) { p.obj.scale.setScalar(1); popIns.splice(i, 1); }
  }
}

/* ── 시각 효과 ────────────────────────────────────────────────────────── */
function updateVisuals(rdt, simDt) {
  const now = performance.now();
  const targetMix = S.phase === 'night' ? 1 : 0;
  S.nightMix += (targetMix - S.nightMix) * Math.min(1, rdt * 1.4);
  if (Math.abs(targetMix - S.nightMix) < 0.002) S.nightMix = targetMix;
  // 새벽 계수: 밤 후반(04:30~06:00)과 아침 초반(06:00~07:00)
  // 정전 이벤트가 사라졌는데 조명이 꺼진 채 굳으면 화면이 검게 남는다
  if (S.blackout && !S.anomalies.some((a) => a.type === 'blackout' && !a.done)) S.blackout = false;
  W.setNight(S.nightMix, S.blackout ? 1 : 0, dawnFactor());
  W.alert(S.phase === 'night');
  W.tick(now / 1000, S.nightMix);
  W.setClock(S.clock);

  // 셔터
  const anyWindow = S.anomalies.some((a) => !a.done && a.type === 'windowMonster');
  const wantShut = (S.up.shutter > 0 && anyWindow) ? 1 : 0;
  S.shutterK += (wantShut - S.shutterK) * Math.min(1, rdt * 3.2);
  if (W.refs.shutter) W.refs.shutter.position.y = lerp(W.refs.shutterOpenY, W.refs.shutterClosedY, S.shutterK);

  // 튀김기 상태 · 바스켓 오르내림
  S.slots.forEach((slot, i) => {
    const v = W.refs.vats[i];
    if (v) {
      v.material.color.setHex(slot.state === 1 ? 0xffc04a : 0xffa92e);
      v.material.emissiveIntensity = slot.state === 1 ? 0.95 + Math.sin(now * 0.012 + i) * 0.2 : 0.32;
    }
    const bk = W.refs.fryBaskets && W.refs.fryBaskets[i];
    if (bk) {
      const target = slot.state === 2 ? 1.72
        : slot.state === 1 ? 1.44 + Math.sin(now * 0.011 + i * 1.7) * 0.035
          : 1.46;
      bk.position.y = lerp(bk.position.y, target, Math.min(1, rdt * 7));
    }
  });
  if (W.refs.steamBoost !== undefined) W.refs.steamBoost = 0.15 + S.slots.filter((s) => s.state === 1).length * 0.32;

  // 튀김 대기 트레이
  if (S.trayBoxes) {
    const n = Math.ceil(S.readyFries / 4);
    S.trayBoxes.forEach((b, i) => { b.visible = i < n; });
  }

  // 터렛
  if (W.refs.turret && S.up.shooter) {
    const t = S.anomalies.find((a) => !a.done && a.type === 'windowMonster');
    const targetYaw = t ? Math.PI / 2 : Math.sin(now * 0.0006) * 0.7;
    let d = targetYaw - W.refs.turretYaw.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    W.refs.turretYaw.rotation.y += d * Math.min(1, rdt * 6);
  }

  // 해치
  if (S.keyFound) {
    const g = 0.35 + Math.sin(now * 0.004) * 0.25;
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

  // 자동차 바퀴 · 서스펜션 · 헤드라이트
  for (const c of S.customers) {
    const m = c.mesh;
    if (c.kind !== 'car') continue;
    const px = c._px === undefined ? c.x : c._px;
    const pz = c._pz === undefined ? c.z : c._pz;
    const dist = Math.hypot(c.x - px, c.z - pz);
    c._px = c.x; c._pz = c.z;
    const wheels = m.userData.wheels;
    if (wheels) wheels.forEach((w) => { w.rotation.x += dist / 0.29; });
    if (c._bounce > 0) c._bounce = Math.max(0, c._bounce - rdt * 0.5);
    const bob = Math.sin(now * 0.006 + c.bob) * 0.008 * (c.state === 'wait' ? 1 : 2.2);
    m.position.y = bob + (c._bounce || 0);
    if (m.userData.beamMat) m.userData.beamMat.opacity = S.nightMix * 0.16;
    if (m.userData.headMats) {
      const lit = S.nightMix > 0.18;
      m.userData.headMats.forEach((hm) => hm.color.setHex(lit ? 0xffffff : 0xfff6dc));
    }
  }

  updateCoins(rdt);
  updatePopIns(rdt);
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
function renderFrame() {
  if (composer) composer.render();
  else renderer.render(scene, camera);
}
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
  renderer.info.reset();
  renderFrame();
  graphicsWatchdog();   // 컨텍스트 로스트 · 흰 화면 감시 및 자동 복구
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
    resizeTimer = setTimeout(() => {
      applyViewport();
      const bn = $('banner');
      if (bn && !bn.classList.contains('hidden')) placeBanner(bn);
    }, 120);
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
  bindCanvasLifecycle($('gl'));
  initPiles();
  initLabels();
  spawnClerk(0);
  spawnClerk(1);
  createTrayBoxes();

  buildUps();
  bindUI();
  bindLifecycleEvents();
  refreshUps();
  updateHUD(true);
  renderFrame();
  $('loading').classList.add('hidden');
  S.ready = true;
  requestAnimationFrame(loop);
}

// 대기 트레이에 프라이 상자 배치 (복구 시에도 재사용)
function createTrayBoxes() {
  if (S.trayBoxes) S.trayBoxes.forEach((b) => disposeTree(b));
  S.trayBoxes = [];
  if (!W || !W.refs.trayStack) return;
  for (let i = 0; i < 8; i++) {
    const b = makeFryBox();
    b.position.set((i % 4) * 0.32 - 0.48, 0.98 + Math.floor(i / 4) * 0.3, (Math.floor(i / 4) % 2) * 0.18 - 0.09);
    b.scale.setScalar(0.8);
    b.visible = false;
    W.refs.trayStack.add(b);
    S.trayBoxes.push(b);
  }
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
    world() { return W; },
    renderer() { return renderer; },
    scene() { return scene; },
    setBloom(on, strength, threshold) {
      if (!bloomPass) return;
      bloomPass.enabled = !!on;
      if (strength !== undefined) bloomPass.strength = strength;
      if (threshold !== undefined) bloomPass.threshold = threshold;
    },
    setExposure(v) { renderer.toneMappingExposure = v; },
    sunI(v) { W.refs.sun.intensity = v; },
    env(on) { W.setEnvEnabled(!!on); },
    info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, soft: SOFT, gpu: GPU_NAME, bloom: !!bloomPass, ms: 0 }; },
    visual() { return {
      beltSlats: W.refs.beltSlats[0].visible, tarp: W.refs.beltTarp.visible,
      peelerAuto: W.refs.peelerAuto.visible, peelerManual: W.refs.peelerManual.visible,
      turret: W.refs.turret.visible, robots: S.robots.length,
      shutterY: +W.refs.shutter.position.y.toFixed(2), vats: W.refs.vats.length,
    }; },
    render() { renderFrame(); },
    // 그래픽 파이프라인 진단 (검증용)
    gfx() {
      return {
        ctxLost: !!S.ctxLost, rebuilding: !!S.rebuilding,
        lostFor: S.ctxLostAt ? Math.round(performance.now() - S.ctxLostAt) : 0,
        whiteStreak, darkStreak, probeBroken: !!_pxProbeBroken, lastLum: _lastLum,
        lastRebuildAgo: _lastRebuildEnd ? Math.round(performance.now() - _lastRebuildEnd) : -1,
        canvas: !!$('gl'), glLost: (renderer && renderer.getContext) ? renderer.getContext().isContextLost() : null,
        textures: renderer ? renderer.info.memory.textures : -1,
        geometries: renderer ? renderer.info.memory.geometries : -1,
        programs: renderer && renderer.info.programs ? renderer.info.programs.length : -1,
      };
    },
    lights() {
      if (!W || !W.refs) return null;
      const R = W.refs;
      return {
        nightMix: +S.nightMix.toFixed(3), blackout: S.blackout, phase: S.phase, clock: +S.clock.toFixed(2),
        sun: +R.sun.intensity.toFixed(3), hemi: +R.hemi.intensity.toFixed(3), amb: +R.amb.intensity.toFixed(3),
        moon: +R.moonLight.intensity.toFixed(3), fill: +R.fill.intensity.toFixed(3),
        shop: +R.shopLights[0].intensity.toFixed(3), exposure: renderer.toneMappingExposure,
      };
    },
    resume() { onPageResume('debug'); return true; },
    rebuildGfx(reason) { return rebuildGraphics(reason || 'debug'); },
    pixels() {
      const a = sampleCanvasLum([[0.5, 0.5], [0.35, 0.6], [0.65, 0.4]]);
      const b = sampleCanvasLum([[0.5, 0.55], [0.38, 0.5], [0.62, 0.62], [0.5, 0.86]]);
      return { white: a, black: b };
    },
    // 캔버스 전체 픽셀 통계 (HUD 제외한 3D만 · 렌더 직후 같은 태스크에서 읽는다)
    snapshot() {
      if (!renderer || S.ctxLost) return null;
      renderFrame();
      const gl = renderer.getContext();
      if (!gl || gl.isContextLost() || !initPixelProbe(gl)) return null;
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      if (!w || !h) return null;
      const n = w * h;
      let err = 0;
      try { gl.getError(); } catch (e) {}
      if (_pxType === gl.FLOAT) {
        const buf = new Float32Array(n * 4);
        gl.readPixels(0, 0, w, h, _pxFmt, _pxType, buf);
        if (gl.getError() !== gl.NO_ERROR) return null;
        let sum = 0, dark = 0, white = 0;
        for (let i = 0; i < n; i++) {
          const j = i * 4;
          const l = (buf[j] * 0.2126 + buf[j + 1] * 0.7152 + buf[j + 2] * 0.0722) * 255;
          sum += l; if (l < 10) dark++; if (l > 250) white++;
        }
        return { w, h, mean: +(sum / n).toFixed(2), dark: +(dark / n).toFixed(4), white: +(white / n).toFixed(4) };
      }
      const buf = new Uint8Array(n * 4);
      gl.readPixels(0, 0, w, h, _pxFmt, _pxType, buf);
      if (gl.getError() !== gl.NO_ERROR) return null;
      let sum = 0, dark = 0, white = 0;
      const hist = new Uint32Array(256);
      for (let i = 0; i < n; i++) {
        const j = i * 4;
        const l = (buf[j] * 0.2126 + buf[j + 1] * 0.7152 + buf[j + 2] * 0.0722) | 0;
        hist[l]++; sum += l; if (l < 10) dark++; if (l > 250) white++;
      }
      let acc = 0, median = 0;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n / 2) { median = v; break; } }
      return { w, h, mean: +(sum / n).toFixed(2), median, dark: +(dark / n).toFixed(4), white: +(white / n).toFixed(4) };
    },
    refresh() { updateHUD(true); refreshUps(); },
    damage(n) { damageShutter(n, { x: 9, z: L.window.z }); },
    setSpeed(n) { S.speed = n; },
    pause(v) { S.paused = v; },
    resetCam,
    chooseCard(i) { chooseCard(i); },
    closePuck,
    closeClear,
    simulate(sec, stepArg) {
      const step = Number.isFinite(stepArg) && stepArg > 0 ? stepArg : 1 / 30;
      for (let t = 0; t < sec; t += step) {
        if (S.puck.open) chooseCard(0);
        if (S.clearOpen) closeClear();
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

