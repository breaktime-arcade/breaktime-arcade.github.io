/* =========================================================================
   분식집 떡볶이 수비대 (Bunsik Merge Defense)
   - Three.js(WebGL2) 3D 디오라마 + 블룸 포스트프로세싱
   - 순환 트랙 디펜스 + 랜덤 합성(머지) 타워 디펜스
   ========================================================================= */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

/* ── 기본 상수 ─────────────────────────────────────────────────────────── */
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const CELL = 1.55;                 // 배치판 1칸 크기
const GRID = 4;                    // 4 × 4
const HALF = CELL * GRID / 2;      // 3.1
const MAX_ALIVE = 35;
const SAVE_KEY = 'bmd_best_v1';
const SOUND_KEY = 'bmd_sound_v1';

const TRACK = { hx: 4.62, hz: 4.62, r: 1.92, w: 1.72 };

const STAR_DMG = [0, 1, 1.95, 3.9, 7.4, 14];
const STAR_COL = ['#ffffff', '#ffe7ae', '#b6ff9c', '#9ad8ff', '#c9a0ff', '#ffd34d'];
const STAR_GLOW = [0xffffff, 0xffcf7a, 0x7dff8a, 0x66d4ff, 0xb07bff, 0xffd34d];

const TOWER_KEYS = ['eomuk', 'tteok', 'gimmari', 'mandu', 'cheese'];
const TOWERS = {
  eomuk: {
    key: 'eomuk', name: '어묵 꼬치', ico: '🍢', col: '#ffdca8', glow: 0xffa54d,
    dmg: 7, rate: 0.42, range: 6.6, desc: '빠른 단일 연사',
  },
  tteok: {
    key: 'tteok', name: '매운 떡볶이', ico: '🌶️', col: '#ff7e5f', glow: 0xff3b1f,
    dmg: 11, rate: 1.05, range: 5.3, splash: 1.5, burn: { dps: 4.5, dur: 3 }, desc: '범위 화상',
  },
  gimmari: {
    key: 'gimmari', name: '바삭 김말이', ico: '🍤', col: '#ffc46b', glow: 0x7fe6ff,
    dmg: 6.5, rate: 0.9, range: 7.1, slow: { amt: 0.4, dur: 1.8 }, desc: '감속 관통',
  },
  mandu: {
    key: 'mandu', name: '왕만두 포대', ico: '🥟', col: '#fff3d6', glow: 0xffe08a,
    dmg: 36, rate: 1.75, range: 5.7, stun: 0.7, splash: 0.95, desc: '기절 한 방',
  },
  cheese: {
    key: 'cheese', name: '치즈 폭탄', ico: '🧀', col: '#ffd94a', glow: 0xffc400,
    dmg: 0, rate: 2.1, range: 4.8, buff: 0.24, mark: { amt: 0.2, dur: 4 }, desc: '아군 버프·표식',
  },
};

/* ── 유틸 ─────────────────────────────────────────────────────────────── */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (a) => a[(Math.random() * a.length) | 0];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const $ = (id) => document.getElementById(id);
const TMP = new THREE.Vector3();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function disposeObj(o) {
  o.traverse((c) => {
    if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose();
  });
}

/* ── 상태 ─────────────────────────────────────────────────────────────── */
let renderer, scene, camera, composer, bloomPass, clock;
let root;                       // 디오라마 루트
let hoverRing, dragRing, selRing;
let trackPath, trackLen;
let particles, rings, pillars, popups, shake, flashFx;
let monsters = [], projectiles = [], towers = [], towerById = new Map();
let barBg, barFill;
let ambientBokeh;
let raycaster = new THREE.Raycaster();
const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.15);

const S = {
  ready: false, started: false, over: false, paused: false,
  gold: 60, wave: 1, summons: 0, best: 0, maxStar: 1,
  timeScale: 1, slowTimer: 0, speedMul: 1, muted: false,
  upgrades: { eomuk: 0, tteok: 0, gimmari: 0, mandu: 0, cheese: 0 },
  waveQueue: [], spawnTimer: 0, waveActive: false, breakTimer: 0,
  boss: null, bossTimer: 0, bossMax: 30,
  selected: null, hoverCell: -1, elapsed: 0, frames: 0, fps: 60,
  totalKills: 0, shakeTrauma: 0, hintShown: false,
  cameraZoom: 1, cameraZoomTarget: 1,
  grid: new Array(16).fill(null), fps: 60, hintT: 0,
};

/* =========================================================================
   1. 절차적 텍스처 (캔버스 → GPU)
   ========================================================================= */
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function texWood() {
  const S0 = 512, c = cv(S0, S0), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, S0, S0);
  g.addColorStop(0, '#7d4b27'); g.addColorStop(0.45, '#6a3d1f'); g.addColorStop(1, '#57301a');
  x.fillStyle = g; x.fillRect(0, 0, S0, S0);
  const planks = 7, ph = S0 / planks;
  for (let i = 0; i < planks; i++) {
    const light = Math.random() > 0.5;
    x.fillStyle = light ? `rgba(255,205,150,${rnd(0.03, 0.09)})` : `rgba(30,12,4,${rnd(0.05, 0.13)})`;
    x.fillRect(0, i * ph, S0, ph);
    for (let k = 0; k < 30; k++) {
      x.beginPath();
      const y0 = i * ph + rnd(2, ph - 2);
      x.moveTo(0, y0);
      for (let px = 0; px <= S0; px += 24) x.lineTo(px, y0 + Math.sin(px * 0.014 + k * 1.7) * rnd(0.5, 2.5));
      x.strokeStyle = `rgba(${rndInt(26, 62)},${rndInt(12, 32)},${rndInt(4, 16)},${rnd(0.06, 0.24)})`;
      x.lineWidth = rnd(0.5, 2.6); x.stroke();
    }
    x.fillStyle = 'rgba(20,8,3,.5)'; x.fillRect(0, i * ph, S0, 1.5);
    x.fillStyle = 'rgba(255,210,160,.10)'; x.fillRect(0, i * ph + 2, S0, 1);
  }
  for (let k = 0; k < 9; k++) {
    const cx0 = rnd(0, S0), cy0 = rnd(0, S0);
    for (let r = 12; r > 0; r -= 2) {
      x.beginPath(); x.ellipse(cx0, cy0, r * rnd(0.7, 1.5), r * 0.5, rnd(0, 3), 0, 7);
      x.strokeStyle = `rgba(40,18,6,${rnd(0.05, 0.16)})`; x.lineWidth = 1.4; x.stroke();
    }
  }
  return c;
}

function texSteel() {
  const S0 = 512, c = cv(S0, S0), x = c.getContext('2d');
  x.fillStyle = '#4b505a'; x.fillRect(0, 0, S0, S0);
  for (let i = 0; i < 4200; i++) {
    x.fillStyle = `rgba(${rndInt(150, 255)},${rndInt(150, 255)},${rndInt(160, 255)},${rnd(0.02, 0.1)})`;
    x.fillRect(rnd(0, S0), rnd(0, S0), rnd(18, 210), rnd(0.5, 1.5));
  }
  for (let i = 0; i < 140; i++) {   // 기름 자국
    const r0 = rnd(8, 46);
    const gg = x.createRadialGradient(rnd(0, S0), rnd(0, S0), 0, 0, 0, 0);
    x.beginPath(); x.arc(rnd(0, S0), rnd(0, S0), r0, 0, 7);
    x.fillStyle = `rgba(${rndInt(20, 60)},${rndInt(18, 55)},${rndInt(20, 60)},${rnd(0.05, 0.18)})`; x.fill();
  }
  for (let i = 0; i < 40; i++) {    // 탄 자국
    x.beginPath(); x.arc(rnd(0, S0), rnd(0, S0), rnd(18, 60), 0, 7);
    x.strokeStyle = `rgba(190,200,225,${rnd(0.03, 0.1)})`; x.lineWidth = rnd(6, 18); x.stroke();
  }
  return c;
}

function texTiles() {
  const S0 = 512, c = cv(S0, S0), x = c.getContext('2d');
  x.fillStyle = '#3b2a24'; x.fillRect(0, 0, S0, S0);
  const n = 4, s = S0 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const l = rndInt(-14, 14);
    x.fillStyle = `rgb(${196 + l},${162 + l},${128 + l})`;
    x.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    for (let k = 0; k < 90; k++) {
      x.fillStyle = `rgba(${rndInt(90, 160)},${rndInt(70, 130)},${rndInt(50, 100)},${rnd(0.02, 0.09)})`;
      x.fillRect(i * s + rnd(4, s - 6), j * s + rnd(4, s - 6), rnd(2, 22), rnd(1, 10));
    }
    x.fillStyle = 'rgba(255,245,225,.10)'; x.fillRect(i * s + 3, j * s + 3, s - 6, 2);
  }
  return c;
}

function texRoad() {
  const S0 = 512, c = cv(S0, S0), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, S0, S0);
  g.addColorStop(0, '#2b2433'); g.addColorStop(0.5, '#332a3d'); g.addColorStop(1, '#241e2b');
  x.fillStyle = g; x.fillRect(0, 0, S0, S0);
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(${rndInt(120, 200)},${rndInt(110, 180)},${rndInt(140, 220)},${rnd(0.02, 0.13)})`;
    x.beginPath(); x.arc(rnd(0, S0), rnd(0, S0), rnd(0.4, 2.1), 0, 7); x.fill();
  }
  for (let i = 0; i < 60; i++) {   // 젖은 반사
    x.beginPath(); x.ellipse(rnd(0, S0), rnd(0, S0), rnd(14, 70), rnd(6, 26), rnd(0, 3), 0, 7);
    x.fillStyle = `rgba(${rndInt(150, 230)},${rndInt(90, 160)},${rndInt(160, 255)},${rnd(0.012, 0.05)})`; x.fill();
  }
  // 중앙 점선 (v = 0.5)
  x.fillStyle = 'rgba(255,214,150,.55)';
  for (let i = 0; i < 4; i++) x.fillRect(i * (S0 / 4) + S0 / 16, S0 * 0.5 - 5, S0 / 8, 10);
  // 가장자리 안내선
  x.fillStyle = 'rgba(255,255,255,.10)';
  x.fillRect(0, 12, S0, 6); x.fillRect(0, S0 - 18, S0, 6);
  return c;
}

function texGlow() {
  const s = 128, c = cv(s, s), x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.7)');
  g.addColorStop(0.6, 'rgba(255,255,255,.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return c;
}

function texSign(text, sub) {
  const W = 512, H = 256, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#1b1016'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#ff4d6d'; x.lineWidth = 7; x.strokeRect(9, 9, W - 18, H - 18);
  x.shadowColor = '#ff5c7a'; x.shadowBlur = 26;
  x.fillStyle = '#ffe6c9'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 92px "Jua", "Malgun Gothic", sans-serif';
  x.fillText(text, W / 2, H * 0.4);
  x.shadowBlur = 14; x.shadowColor = '#7fe6ff';
  x.fillStyle = '#bdf3ff';
  x.font = '400 38px "Jua", "Malgun Gothic", sans-serif';
  if (sub) x.fillText(sub, W / 2, H * 0.76);
  return c;
}

function texStarBadge(star) {
  const key = 'starBadge' + star;
  if (tex_cache[key]) return tex_cache[key];
  const W = 304, H = 152, c = cv(W, H), x = c.getContext('2d');
  const col = '#' + new THREE.Color(STAR_GLOW[Math.min(5, star)] || 0xffcf7a).getHexString();
  const pad = 7, r = 60;
  const w = W - pad * 2, h = H - pad * 2;
  // 어두운 알약 배경 + 성급 색 테두리 (어떤 배경 위에서도 대비 확보)
  const bg = x.createLinearGradient(0, pad, 0, pad + h);
  bg.addColorStop(0, 'rgba(26,12,6,0.90)');
  bg.addColorStop(1, 'rgba(64,26,10,0.90)');
  x.beginPath();
  x.moveTo(pad + r, pad);
  x.lineTo(pad + w - r, pad); x.arcTo(pad + w, pad, pad + w, pad + r, r);
  x.lineTo(pad + w, pad + h - r); x.arcTo(pad + w, pad + h, pad + w - r, pad + h, r);
  x.lineTo(pad + r, pad + h); x.arcTo(pad, pad + h, pad, pad + h - r, r);
  x.lineTo(pad, pad + r); x.arcTo(pad, pad, pad + r, pad, r);
  x.closePath();
  x.fillStyle = bg; x.fill();
  x.lineWidth = 9; x.strokeStyle = col; x.globalAlpha = 0.92; x.stroke(); x.globalAlpha = 1;
  // ★ + 성급 숫자
  const txt = '★' + star;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.font = '800 116px "Jua", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  x.lineWidth = 18; x.strokeStyle = 'rgba(20,8,2,0.95)';
  x.strokeText(txt, W / 2, H / 2 + 6, W - 28);
  const tg = x.createLinearGradient(0, 30, 0, H - 24);
  tg.addColorStop(0, '#ffffff');
  tg.addColorStop(0.45, col);
  tg.addColorStop(1, col);
  x.fillStyle = tg;
  if (star >= 4) { x.shadowColor = col; x.shadowBlur = 24; }
  x.fillText(txt, W / 2, H / 2 + 6, W - 28);
  return (tex_cache[key] = toTex(c));
}

/* 성급 배지를 화면 크기에 맞춰 같은 픽셀 크기로 유지 (모바일에서도 읽히게) */
function viewPxPerWorld() {
  const h = window.innerHeight || 900;
  const dist = (camera && camera.userData.dist) || 18;
  const fov = (camera && camera.fov) || 40;
  return h / (2 * dist * Math.tan(fov * Math.PI / 360));
}

function applyStarBadgeSize(t) {
  const b = t && t.badge;
  if (!b) return;
  const px = viewPxPerWorld();
  const targetPx = clamp(CELL * px * 0.86, 44, 62);   // 칸 폭에 맞춤, 큰 화면은 상한
  const w = targetPx / px / (t.mesh.scale.x || 1);
  b.scale.set(w, w * (152 / 304), 1);
}

function refreshBadgeSizes() {
  try { for (const t of towers) applyStarBadgeSize(t); } catch (e) { /* 초기화 전 호출 무시 */ }
}

function toTex(canvas, rep) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = rep ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]);
  t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  return t;
}

/* =========================================================================
   2. 사운드 (Web Audio 합성 — 외부 파일 없음)
   ========================================================================= */
const SFX = {
  ctx: null, master: null, muted: false, lastAt: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 16; comp.ratio.value = 8;
      comp.attack.value = 0.004; comp.release.value = 0.22;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      // 노이즈 버퍼
      const len = this.ctx.sampleRate * 1.0;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  gate(name, ms) {
    const t = performance.now();
    if (this.lastAt[name] && t - this.lastAt[name] < ms) return false;
    this.lastAt[name] = t; return true;
  },
  tone(freq, dur, type, gain, slideTo, when) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + (when || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.16), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.03);
  },
  noise(dur, gain, freq, q, when) {
    if (!this.ctx || this.muted || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + (when || 0);
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = freq || 1200; f.Q.value = q || 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain || 0.14, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  },
  play(name, opt) {
    if (!this.ctx || this.muted) return;
    opt = opt || {};
    switch (name) {
      case 'click': this.tone(760, 0.06, 'square', 0.06, 560); break;
      case 'summon':
        this.tone(340, 0.16, 'triangle', 0.13, 780);
        this.noise(0.16, 0.09, 2400, 1.6);
        this.tone(1200, 0.1, 'sine', 0.05, 1800, 0.06);
        break;
      case 'shootE': if (!this.gate('se', 55)) return; this.tone(rnd(880, 1050), 0.06, 'square', 0.035, 620); break;
      case 'shootT': if (!this.gate('st', 90)) return; this.tone(rnd(300, 360), 0.13, 'sawtooth', 0.05, 150); break;
      case 'shootG': if (!this.gate('sg', 80)) return; this.tone(rnd(1500, 1750), 0.09, 'sine', 0.04, 900); break;
      case 'shootM': if (!this.gate('sm', 90)) return; this.tone(120, 0.22, 'sine', 0.16, 62); this.noise(0.1, 0.06, 700, 1); break;
      case 'hit': if (!this.gate('hit', 45)) return; this.noise(0.055, 0.06, 1700, 1.1); break;
      case 'kill':
        if (!this.gate('kill', 40)) return;
        this.tone(rnd(420, 520), 0.16, 'triangle', 0.09, 150);
        this.noise(0.12, 0.05, 900, 0.9);
        break;
      case 'merge': {
        const st = opt.star || 1;
        const base = 440 * Math.pow(1.0595, (st - 1) * 3);
        const seq = [0, 4, 7, 12, 16];
        const n = clamp(st + 1, 2, 5);
        for (let i = 0; i < n; i++) {
          this.tone(base * Math.pow(2, seq[i] / 12), 0.22, 'triangle', 0.11 - i * 0.008, null, i * 0.055);
        }
        this.noise(0.3, 0.07, 3200, 1.4);
        if (st >= 4) {
          for (let i = 0; i < 5; i++) this.tone(base * 2 * Math.pow(2, [0, 4, 7, 12, 19][i] / 12), 0.5, 'sine', 0.08, null, 0.2 + i * 0.07);
          this.noise(0.6, 0.05, 5200, 1.1, 0.18);
        }
        break;
      }
      case 'coin': if (!this.gate('coin', 60)) return; this.tone(1320, 0.05, 'square', 0.04); this.tone(1760, 0.07, 'square', 0.035, null, 0.045); break;
      case 'up': this.tone(520, 0.09, 'triangle', 0.1, 660); this.tone(780, 0.14, 'triangle', 0.08, 990, 0.08); break;
      case 'wave': this.tone(392, 0.16, 'triangle', 0.1); this.tone(587, 0.3, 'triangle', 0.09, null, 0.13); this.noise(0.3, 0.04, 2200, 1); break;
      case 'boss':
        this.tone(72, 1.3, 'sawtooth', 0.2, 48);
        this.tone(110, 1.1, 'sawtooth', 0.12, 74, 0.05);
        this.noise(1.2, 0.1, 220, 0.6);
        break;
      case 'over':
        [440, 392, 330, 262].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.12, f * 0.9, i * 0.16));
        this.noise(0.7, 0.06, 400, 0.7, 0.1);
        break;
      case 'sell': this.tone(880, 0.06, 'square', 0.05, 620); this.tone(560, 0.1, 'square', 0.045, 400, 0.06); break;
      case 'star4':
        [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), 0.6, 'sine', 0.09, null, i * 0.06));
        break;
    }
  },
};

/* =========================================================================
   3. 파티클 시스템 (단일 Points, 가산 혼합)
   ========================================================================= */
class ParticleSystem {
  constructor(max) {
    this.max = max; this.n = 0;
    this.px = new Float32Array(max * 3); this.vx = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.spin = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.px, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        uniform float uScale; varying float vA; varying vec3 vC;
        void main(){
          vA = aAlpha; vC = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.35, -mv.z) * (0.6 + 0.4*vA);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA; varying vec3 vC;
        void main(){
          vec2 p = gl_PointCoord - vec2(0.5);
          float d = length(p);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.05, d) * vA;
          gl_FragColor = vec4(vC * (1.0 + 0.9 * a), a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.geo = g;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.mat = mat;
  }
  emit(o) {
    const cnt = o.n || 8;
    for (let i = 0; i < cnt; i++) {
      if (this.n >= this.max) return;
      const k = this.n++;
      const p = k * 3;
      const sp = (o.speed || 2) * (0.4 + Math.random() * 0.9);
      let dx = rnd(-1, 1), dy = rnd(-1, 1), dz = rnd(-1, 1);
      if (o.dir) { dx = o.dir.x + rnd(-1, 1) * (o.spread ?? 0.55); dy = o.dir.y + rnd(-1, 1) * (o.spread ?? 0.55); dz = o.dir.z + rnd(-1, 1) * (o.spread ?? 0.55); }
      const l = Math.hypot(dx, dy, dz) || 1;
      this.px[p] = (o.x || 0) + rnd(-1, 1) * (o.jitter || 0.06);
      this.px[p + 1] = (o.y || 0) + rnd(-1, 1) * (o.jitter || 0.06);
      this.px[p + 2] = (o.z || 0) + rnd(-1, 1) * (o.jitter || 0.06);
      this.vx[p] = (dx / l) * sp;
      this.vx[p + 1] = (dy / l) * sp + (o.up || 0);
      this.vx[p + 2] = (dz / l) * sp;
      const c1 = o.color ?? 0xffffff, c2 = o.color2 ?? c1;
      const t = Math.random();
      const a = ((c1 >> 16) & 255) / 255, b = ((c1 >> 8) & 255) / 255, cc = (c1 & 255) / 255;
      const a2 = ((c2 >> 16) & 255) / 255, b2 = ((c2 >> 8) & 255) / 255, cc2 = (c2 & 255) / 255;
      this.col[p] = lerp(a, a2, t); this.col[p + 1] = lerp(b, b2, t); this.col[p + 2] = lerp(cc, cc2, t);
      this.size[k] = (o.size || 0.16) * rnd(0.6, 1.5);
      this.alpha[k] = 1;
      this.maxLife[k] = this.life[k] = (o.life || 0.7) * rnd(0.7, 1.25);
      this.grav[k] = o.gravity ?? 3.2;
      this.drag[k] = o.drag ?? 1.6;
    }
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.swap(i, --this.n); continue; }
      const p = i * 3, dr = Math.exp(-this.drag[i] * dt);
      this.vx[p] *= dr; this.vx[p + 1] = this.vx[p + 1] * dr - this.grav[i] * dt; this.vx[p + 2] *= dr;
      this.px[p] += this.vx[p] * dt; this.px[p + 1] += this.vx[p + 1] * dt; this.px[p + 2] += this.vx[p + 2] * dt;
      if (this.px[p + 1] < 0.12 && this.vx[p + 1] < 0) { this.px[p + 1] = 0.12; this.vx[p + 1] *= -0.35; }
      const k = this.life[i] / this.maxLife[i];
      this.alpha[i] = clamp01(k * k * 1.4);
      this.size[i] *= (1 + dt * 0.5);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
  swap(a, b) {
    if (a === b) return;
    const a3 = a * 3, b3 = b * 3;
    for (let j = 0; j < 3; j++) {
      this.px[a3 + j] = this.px[b3 + j]; this.vx[a3 + j] = this.vx[b3 + j]; this.col[a3 + j] = this.col[b3 + j];
    }
    this.size[a] = this.size[b]; this.alpha[a] = this.alpha[b]; this.life[a] = this.life[b];
    this.maxLife[a] = this.maxLife[b]; this.grav[a] = this.grav[b]; this.drag[a] = this.drag[b];
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

/* ── 충격파 링 풀 ─────────────────────────────────────────────────────── */
class RingPool {
  constructor(scene, n) {
    this.items = [];
    const geoT = new THREE.RingGeometry(0.62, 1, 48, 1); geoT.rotateX(-Math.PI / 2); geoT.userData.shared = true;
    const geoThin = new THREE.RingGeometry(0.9, 1, 64, 1); geoThin.rotateX(-Math.PI / 2); geoThin.userData.shared = true;
    this.geoT = geoT; this.geoThin = geoThin;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geoT, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      m.visible = false; m.renderOrder = 4;
      scene.add(m);
      this.items.push({ mesh: m, t: 0, dur: 0.5, from: 0.4, to: 3, active: false });
    }
  }
  spawn(x, y, z, o) {
    o = o || {};
    let it = this.items.find((i) => !i.active) || this.items[0];
    it.active = true; it.t = 0; it.dur = o.dur || 0.55;
    it.from = o.from ?? 0.3; it.to = o.to ?? 3.2;
    it.mesh.visible = true;
    it.mesh.geometry = o.thin ? this.geoThin : this.geoT;
    it.mesh.position.set(x, y ?? 0.3, z);
    it.mesh.material.color.setHex(o.color ?? 0xffffff);
    it.maxOp = o.opacity ?? 0.9;
    it.mesh.material.opacity = it.maxOp;
    it.mesh.scale.setScalar(it.from);
    it.flat = o.flat !== false;
    if (!it.flat) it.mesh.rotation.set(0, 0, 0);
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) { it.active = false; it.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 2.2);
      it.mesh.scale.setScalar(lerp(it.from, it.to, e));
      it.mesh.material.opacity = (1 - k) * it.maxOp;
    }
  }
}

/* ── 빛 기둥 풀 (합성 연출) ───────────────────────────────────────────── */
class PillarPool {
  constructor(scene, n) {
    this.items = [];
    const geo = new THREE.CylinderGeometry(0.55, 0.95, 7.5, 20, 1, true);
    geo.userData.shared = true;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfff0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false; m.renderOrder = 6;
      scene.add(m);
      this.items.push({ mesh: m, t: 0, dur: 1, active: false });
    }
  }
  spawn(x, z, o) {
    o = o || {};
    let it = this.items.find((i) => !i.active) || this.items[0];
    it.active = true; it.t = 0; it.dur = o.dur || 0.8;
    it.mesh.visible = true;
    it.mesh.position.set(x, 2.4, z);
    it.mesh.scale.y = 0.72;
    it.mesh.material.color.setHex(o.color ?? 0xfff0c0);
    it.mesh.rotation.y = rnd(0, 3);
    it.mesh.scale.set(o.w || 1, 1, o.w || 1);
    it.top = o.opacity ?? 0.85;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) { it.active = false; it.mesh.visible = false; continue; }
      const e = Math.sin(Math.PI * Math.min(1, k * 1.05));
      it.mesh.material.opacity = e * it.top;
      it.mesh.scale.y = (0.45 + e * 0.55) * 0.72;
      it.mesh.rotation.y += dt * 1.6;
    }
  }
}

/* ── 화면 데미지 팝업 (DOM) ───────────────────────────────────────────── */
class Popups {
  constructor(el) { this.el = el; this.pool = []; this.free = []; }
  spawn(x, y, z, text, cls) {
    if (!camera) return;
    TMP.set(x, y, z).project(camera);
    if (TMP.z > 1) return;
    const sx = (TMP.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-TMP.y * 0.5 + 0.5) * window.innerHeight;
    let d = this.free.pop();
    if (!d) {
      if (this.pool.length > 26) return;
      d = document.createElement('div');
      d.className = 'pop';
      this.el.appendChild(d);
    }
    d.textContent = text;
    d.className = 'pop ' + (cls || '');
    d.style.left = sx + 'px'; d.style.top = sy + 'px';
    d.style.opacity = '1';
    // 애니메이션 재시작
    d.style.animation = 'none';
    void d.offsetWidth;
    d.style.animation = '';
    const self = d;
    setTimeout(() => { self.style.opacity = '0'; this.free.push(self); }, 800);
  }
  clear() { this.el.innerHTML = ''; this.pool = []; this.free = []; }
}

/* ── 화면 흔들림 ──────────────────────────────────────────────────────── */
class Shake {
  constructor() { this.trauma = 0; this.t = 0; }
  add(v) { this.trauma = Math.min(1, this.trauma + v); }
  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.t += dt;
  }
  offset(target) {
    const s = this.trauma * this.trauma;
    const t = this.t * 62;
    target.x += Math.sin(t * 1.7) * 0.32 * s;
    target.y += Math.sin(t * 2.3 + 1.2) * 0.24 * s;
    target.z += Math.cos(t * 1.9 + 0.4) * 0.2 * s;
  }
}

/* =========================================================================
   4. 트랙 경로 (모서리 둥근 사각 순환로)
   ========================================================================= */
function roundedRectShape(hw, hh, r) {
  const s = new THREE.Shape();
  const rr = Math.min(r, hw - 0.001, hh - 0.001);
  s.moveTo(-hw + rr, -hh);
  s.lineTo(hw - rr, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + rr);
  s.lineTo(hw, hh - rr);
  s.quadraticCurveTo(hw, hh, hw - rr, hh);
  s.lineTo(-hw + rr, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - rr);
  s.lineTo(-hw, -hh + rr);
  s.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
  return s;
}

function buildTrack() {
  const { hx, hz, r } = TRACK;
  const raw = [];
  const seg = (x0, z0, x1, z1, n) => {
    for (let i = 0; i <= n; i++) raw.push([lerp(x0, x1, i / n), lerp(z0, z1, i / n)]);
  };
  const arc = (cx, cz, a0, a1, n) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      raw.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  seg(-(hx - r), -hz, hx - r, -hz, Math.round((2 * (hx - r)) / 0.12));
  arc(hx - r, -(hz - r), -Math.PI / 2, 0, 22);
  seg(hx, -(hz - r), hx, hz - r, Math.round((2 * (hz - r)) / 0.12));
  arc(hx - r, hz - r, 0, Math.PI / 2, 22);
  seg(hx - r, hz, -(hx - r), hz, Math.round((2 * (hx - r)) / 0.12));
  arc(-(hx - r), hz - r, Math.PI / 2, Math.PI, 22);
  seg(-hx, hz - r, -hx, -(hz - r), Math.round((2 * (hz - r)) / 0.12));
  arc(-(hx - r), -(hz - r), Math.PI, Math.PI * 1.5, 22);

  const pts = [];
  for (const p of raw) {
    const last = pts[pts.length - 1];
    if (!last || (last.x - p[0]) ** 2 + (last.y - p[1]) ** 2 > 1e-7) pts.push(new THREE.Vector2(p[0], p[1]));
  }
  const cum = [0];
  let L = 0;
  for (let i = 1; i < pts.length; i++) { L += pts[i].distanceTo(pts[i - 1]); cum.push(L); }
  L += pts[0].distanceTo(pts[pts.length - 1]); cum.push(L);
  trackPath = { pts, cum, L };
  trackLen = L;
}

const _tp = new THREE.Vector3();
function trackPoint(d, out, tangent) {
  const { pts, cum, L } = trackPath;
  d = ((d % L) + L) % L;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
  const p0 = pts[lo % pts.length], p1 = pts[(lo + 1) % pts.length];
  const sl = (cum[lo + 1] - cum[lo]) || 1;
  const t = clamp01((d - cum[lo]) / sl);
  out.set(lerp(p0.x, p1.x, t), 0, lerp(p0.y, p1.y, t));
  if (tangent) tangent.set(p1.x - p0.x, 0, p1.y - p0.y).normalize();
  return out;
}

/* =========================================================================
   5. 씬 · 카메라 · 조명 · 디오라마
   ========================================================================= */
const woodTex = { ready: false };
let tex_cache = {};

function initScene() {
  renderer = new THREE.WebGLRenderer({
    canvas: $('gl'), antialias: true, powerPreference: 'high-performance', alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a0e1a, 0.0085);
  camera = new THREE.PerspectiveCamera(40, 1, 0.2, 260);

  // 환경 반사 (금속 불판 · 치즈 광택)
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new RoomEnvironment();
    const rt = pmrem.fromScene(env, 0.02);
    scene.environment = rt.texture;
    env.dispose && env.dispose();
    pmrem.dispose();
  } catch (e) { /* 환경맵 실패해도 게임은 진행 */ }

  root = new THREE.Group();
  scene.add(root);

  buildBackground();
  buildTrack();
  buildDiorama();
  buildBoard();
  buildProps();
  buildLights();

  particles = new ParticleSystem(IS_MOBILE ? 520 : 820);
  root.add(particles.points);
  rings = new RingPool(scene, 10);
  pillars = new PillarPool(scene, 4);
  shake = new Shake();
  popups = new Popups($('pops'));
  flashFx = { el: $('flash'), t: 0, dur: 0.2, max: 0 };

  // 몬스터 체력바 (인스턴스 2장)
  const barGeo = new THREE.PlaneGeometry(1, 1);
  barGeo.userData.shared = true;
  barBg = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({
    color: 0x160b14, transparent: true, opacity: 0.72, depthWrite: false, depthTest: false,
  }), MAX_ALIVE + 8);
  barFill = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false,
  }), MAX_ALIVE + 8);
  barBg.renderOrder = 20; barFill.renderOrder = 21;
  barBg.frustumCulled = false; barFill.frustumCulled = false;
  barBg.count = 0; barFill.count = 0;
  scene.add(barBg); scene.add(barFill);

  // 셀 하이라이트 링
  const cellRingGeo = new THREE.RingGeometry(0.5, 0.62, 4, 1);
  cellRingGeo.rotateZ(Math.PI / 4); cellRingGeo.rotateX(-Math.PI / 2);
  hoverRing = new THREE.Mesh(cellRingGeo, new THREE.MeshBasicMaterial({
    color: 0xffd28a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  hoverRing.visible = false; hoverRing.position.y = 1.13; scene.add(hoverRing);
  selRing = new THREE.Mesh(cellRingGeo.clone(), new THREE.MeshBasicMaterial({
    color: 0x7fe6ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  selRing.visible = false; selRing.position.y = 1.14; scene.add(selRing);
  dragRing = new THREE.Mesh(cellRingGeo.clone(), new THREE.MeshBasicMaterial({
    color: 0x8affa0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  dragRing.visible = false; dragRing.position.y = 1.16; scene.add(dragRing);

  // 포스트프로세싱
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.45, 1.0);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  clock = new THREE.Clock();
  onResize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 220));
}

/* ── 배경 ─────────────────────────────────────────────────────────────── */
function buildBackground() {
  const geo = new THREE.SphereGeometry(110, 32, 22);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vW;
      void main(){
        vec3 n = normalize(vW);
        float h = n.y * 0.5 + 0.5;
        vec3 low  = vec3(0.115, 0.035, 0.075);
        vec3 mid  = vec3(0.175, 0.055, 0.135);
        vec3 high = vec3(0.022, 0.035, 0.075);
        vec3 c = mix(low, mid, smoothstep(0.0, 0.52, h));
        c = mix(c, high, smoothstep(0.52, 1.0, h));
        float glow = pow(1.0 - abs(n.y), 7.0);
        c += vec3(1.0, 0.42, 0.18) * glow * 0.20;
        c += vec3(0.25, 0.45, 1.0) * pow(max(0.0, -n.z), 8.0) * 0.06;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));

  // 보케 불빛
  const N = IS_MOBILE ? 90 : 150;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, rad = rnd(11, 34), y = rnd(-1, 13);
    pos[i * 3] = Math.cos(a) * rad; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * rad;
    const warm = Math.random() > 0.35;
    if (warm) { col[i * 3] = 1; col[i * 3 + 1] = rnd(0.55, 0.82); col[i * 3 + 2] = rnd(0.25, 0.5); }
    else { col[i * 3] = rnd(0.35, 0.6); col[i * 3 + 1] = rnd(0.7, 0.95); col[i * 3 + 2] = 1; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size: 1.7, map: toTex(texGlow()), transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true, sizeAttenuation: true,
  });
  ambientBokeh = new THREE.Points(g, m);
  ambientBokeh.frustumCulled = false;
  scene.add(ambientBokeh);
}

/* ── 디오라마 바닥 · 트랙 ─────────────────────────────────────────────── */
function buildDiorama() {
  const BW = 7.0, BD = 6.75;   // 바닥 절반 크기
  tex_cache.wood = toTex(texWood(), [1, 1]);
  tex_cache.woodTile = toTex(texWood(), [0.16, 0.16]);
  tex_cache.steel = toTex(texSteel(), [0.34, 0.34]);
  tex_cache.tile = toTex(texTiles(), [0.2, 0.2]);
  tex_cache.road = toTex(texRoad(), [0.2, 0.2]);
  tex_cache.glow = toTex(texGlow());

  // 받침대
  const slab = new THREE.ExtrudeGeometry(roundedRectShape(BW, BD, 1.15), {
    depth: 0.72, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.13, bevelSegments: 2, curveSegments: 10,
  });
  slab.rotateX(-Math.PI / 2);
  const slabMat = new THREE.MeshStandardMaterial({
    map: tex_cache.wood, color: 0x8b6a4e, roughness: 0.86, metalness: 0.06, envMapIntensity: 0.5,
  });
  const slabMesh = new THREE.Mesh(slab, slabMat);
  slabMesh.position.y = -0.1;
  slabMesh.castShadow = true; slabMesh.receiveShadow = true;
  root.add(slabMesh);

  // 윗면 데크
  const deckGeo = new THREE.ShapeGeometry(roundedRectShape(BW - 0.06, BD - 0.06, 1.12), 12);
  deckGeo.rotateX(-Math.PI / 2);
  const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({
    map: tex_cache.woodTile, color: 0xa8815c, roughness: 0.82, metalness: 0.04, envMapIntensity: 0.45,
  }));
  deck.position.y = 0.706; deck.receiveShadow = true;
  root.add(deck);

  // 트랙 노면 (경로 리본)
  const T = TRACK;
  const road = new THREE.Mesh(buildTrackRibbon(), new THREE.MeshStandardMaterial({
    map: tex_cache.road, color: 0xb9aecb, roughness: 0.52, metalness: 0.22,
    envMapIntensity: 0.9, side: THREE.DoubleSide,
  }));
  road.position.y = 0.722; road.receiveShadow = true;
  root.add(road);

  // 네온 테두리
  const neon = (half, r, color, op, y) => {
    const s = roundedRectShape(half + 0.045, half + 0.045, r + 0.045);
    s.holes.push(roundedRectShape(half - 0.045, half - 0.045, Math.max(0.02, r - 0.045)));
    const g = new THREE.ShapeGeometry(s, 14); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: op, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    m.position.y = y; root.add(m); return m;
  };
  neon(T.hx + T.w / 2 - 0.07, T.r + T.w / 2 - 0.07, 0xffb347, 0.45, 0.735);
  neon(T.hx - T.w / 2 + 0.07, Math.max(0.45, T.r - T.w / 2 + 0.07), 0x7fe6ff, 0.38, 0.736);
  neon(BW - 0.24, 1.02, 0xff4d7d, 0.28, 0.745);

  // 발광 띠 (받침대 아래 언더글로우)
  const glowRing = neon(BW - 0.02, 1.1, 0x59c8ff, 0.85, 0.12);
  glowRing.scale.set(0.995, 1, 0.965);

}

function buildTrackRibbon() {
  const pts = trackPath.pts, n = pts.length, w = TRACK.w;
  const pos = [], uv = [], nor = [], idx = [];
  let dist = 0;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
    const tx = next.x - prev.x, tz = next.y - prev.y;
    const l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l;
    if (i > 0) dist += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    pos.push(p.x + nx * w / 2, 0, p.y + nz * w / 2);
    pos.push(p.x - nx * w / 2, 0, p.y - nz * w / 2);
    uv.push(dist / 3.4, 0); uv.push(dist / 3.4, 1);
    nor.push(0, 1, 0); nor.push(0, 1, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function buildBoard() {
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 2 + 0.62, 0.34, HALF * 2 + 0.62),
    new THREE.MeshStandardMaterial({
      map: tex_cache.steel, color: 0xd9d2c6, roughness: 0.5, metalness: 0.3, envMapIntensity: 1.5,
    })
  );
  plate.position.y = 0.92; plate.castShadow = true; plate.receiveShadow = true;
  root.add(plate);

  // 플레이트 테두리 발광
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.85 });
  const eh = HALF + 0.31;
  const bars = [[0, eh, HALF * 2 + 0.62, 0.06], [0, -eh, HALF * 2 + 0.62, 0.06], [eh, 0, 0.06, HALF * 2 + 0.62], [-eh, 0, 0.06, HALF * 2 + 0.62]];
  for (const [x, z, w, d] of bars) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), edgeMat);
    b.position.set(x, 1.098, z); root.add(b);
  }

  // 격자 홈 + 셀 테두리
  const lines = [];
  const pushLine = (x1, z1, x2, z2) => { lines.push(x1, 1.101, z1, x2, 1.101, z2); };
  for (let i = 0; i <= GRID; i++) {
    const p = -HALF + i * CELL;
    pushLine(p, -HALF, p, HALF);
    pushLine(-HALF, p, HALF, p);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const gridLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
    color: 0xffc078, transparent: true, opacity: 0.16,
  }));
  root.add(gridLines);

  // 철판 그릴 홈 (은은한 가로줄)
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.2, 0.02, 0.035), new THREE.MeshBasicMaterial({ color: 0x1a1c22 }));
    g.position.set(0, 1.091, -HALF + 0.2 + i * (HALF * 2 - 0.4) / 8);
    root.add(g);
  }
}

function buildProps() {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.8, metalness: 0.05, map: tex_cache.woodTile });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.85, metalness: 0.05 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.28, metalness: 0.95, envMapIntensity: 1.2 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xc63a2a, roughness: 0.5, metalness: 0.1 });

  // 전골 냄비
  const pot = new THREE.Group();
  const potBody = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.42, 20), metalMat);
  potBody.position.y = 0.21; potBody.castShadow = true; pot.add(potBody);
  const potSauce = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 20),
    new THREE.MeshStandardMaterial({ color: 0xd63a1e, emissive: 0x7a1500, emissiveIntensity: 0.6, roughness: 0.35 }));
  potSauce.position.y = 0.42; pot.add(potSauce);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.035, 8, 24), metalMat);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.44; pot.add(rim);
  pot.position.set(-6.05, 0.735, 1.4); pot.rotation.y = 0.5;
  root.add(pot);

  // 스툴 2개
  for (let i = 0; i < 2; i++) {
    const st = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.4, 0.14, 18), redMat);
    seat.position.y = 0.62; seat.castShadow = true; st.add(seat);
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.6, 8), metalMat);
      const a = (k / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.26, 0.3, Math.sin(a) * 0.26);
      leg.rotation.z = Math.cos(a) * 0.16; leg.rotation.x = -Math.sin(a) * 0.16;
      st.add(leg);
    }
    st.position.set(6.15, 0.735, i === 0 ? -1.9 : 1.2);
    st.rotation.y = rnd(0, 3);
    root.add(st);
  }

  // 소스병 · 그릇 더미
  const bottle = (x, z, color) => {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.42, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15, envMapIntensity: 1 }));
    body.position.y = 0.21; body.castShadow = true; b.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.12, 10), redMat);
    cap.position.y = 0.46; b.add(cap);
    b.position.set(x, 0.735, z); root.add(b);
  };
  bottle(5.55, 2.85, 0xb8241a); bottle(5.95, 2.5, 0xe0a33a); bottle(5.3, 3.3, 0x8a3b12);

  // 국물 그릇 더미
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0xd8e4ec, roughness: 0.35, metalness: 0.2, envMapIntensity: 1 });
  for (let i = 0; i < 4; i++) {
    const bw = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.19, 0.13, 16), bowlMat);
    bw.position.set(-5.75 + rnd(-0.2, 0.2), 0.8 + i * 0.135, -2.4 + rnd(-0.15, 0.15));
    bw.castShadow = true; root.add(bw);
  }

  // 등불 4개 + 간판
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe0a8, emissive: 0xffa03c, emissiveIntensity: 1.7, roughness: 0.4 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.7, metalness: 0.3 });
  const lampPositions = [[-6.55, -5.6], [6.55, -5.6], [-6.55, 5.6], [6.55, 5.6]];
  for (const [x, z] of lampPositions) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.15, 8), postMat);
    post.position.y = 1.08; post.castShadow = true; g.add(post);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8), postMat);
    arm.rotation.z = Math.PI / 2; arm.position.set(x > 0 ? -0.2 : 0.2, 2.12, 0); g.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), lampMat);
    lamp.position.set(x > 0 ? -0.4 : 0.4, 1.98, 0); g.add(lamp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex_cache.glow, color: 0xffb060, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(1.0); halo.material.opacity = 0.55; halo.position.copy(lamp.position); g.add(halo);
    g.position.set(x, 0.735, z);
    root.add(g);
  }

  // 간판
  const signTex = toTex(texSign('분식', '떡볶이 수비대'));
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.55), signMat);
  sign.position.set(0, 3.35, -7.35);
  root.add(sign);
  const signHalo = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.9), new THREE.MeshBasicMaterial({
    color: 0xff5c7a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  signHalo.position.set(0, 3.35, -7.4); root.add(signHalo);
  for (const sx of [-1.35, 1.35]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6), postMat);
    rod.position.set(sx, 4.2, -7.35); root.add(rod);
  }

  // 깃발 줄
  const flagColors = [0xff5b3d, 0xffd34d, 0x4fe3ff, 0xff8ad0, 0x8affa0];
  const flagGeo = new THREE.ConeGeometry(0.16, 0.34, 3);
  flagGeo.userData.shared = true;
  for (let i = 0; i < 15; i++) {
    const t = i / 14;
    const x = lerp(-6.3, 6.3, t);
    const y = 4.1 - Math.sin(t * Math.PI) * 0.55;
    const f = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({
      color: flagColors[i % flagColors.length], roughness: 0.75, metalness: 0.05,
      emissive: flagColors[i % flagColors.length], emissiveIntensity: 0.18,
    }));
    f.rotation.x = Math.PI; f.rotation.z = rnd(-0.12, 0.12);
    f.position.set(x, y, -6.95);
    root.add(f);
  }
}

function buildLights() {
  const hemi = new THREE.HemisphereLight(0xa8c8ff, 0x2a1408, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffdcb0, 2.25);
  key.position.set(7.5, 13, 8.5);
  key.castShadow = true;
  key.shadow.mapSize.set(IS_MOBILE ? 1024 : 1536, IS_MOBILE ? 1024 : 1536);
  key.shadow.camera.left = -11; key.shadow.camera.right = 11;
  key.shadow.camera.top = 11; key.shadow.camera.bottom = -11;
  key.shadow.camera.near = 1; key.shadow.camera.far = 40;
  key.shadow.bias = -0.0009; key.shadow.normalBias = 0.035;
  scene.add(key);

  const griddle = new THREE.PointLight(0xff8a4d, 11, 13, 2);
  griddle.position.set(0, 4.0, 0.6);
  scene.add(griddle);

  const rim = new THREE.PointLight(0x5cc8ff, 9, 16, 2);
  rim.position.set(-6, 4.2, -5.5);
  scene.add(rim);

  const neonBack = new THREE.PointLight(0xff4d7d, 5, 12, 2);
  neonBack.position.set(0, 1.4, -6.5);
  scene.add(neonBack);
}

/* ── 카메라 배치 (반응형 자동 피팅) ──────────────────────────────────── */
const FIT_PTS = [];
for (const x of [-7.1, 7.1]) for (const y of [0, 2.6]) for (const z of [-6.9, 7.0]) FIT_PTS.push(new THREE.Vector3(x, y, z));
FIT_PTS.push(new THREE.Vector3(0, 3.9, -7.2));

function fitCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  const portrait = h > w * 1.18;
  camera.aspect = w / h;
  camera.fov = portrait ? 47 : 40;
  camera.updateProjectionMatrix();
  const el = portrait ? 1.12 : 0.92;
  const target = new THREE.Vector3(0, 0.55, -0.35);
  let dist = 18;
  for (let i = 0; i < 16; i++) {
    camera.position.set(0, Math.sin(el) * dist + target.y * 0.4, Math.cos(el) * dist);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    let mx = 0, top = 0, bot = 0;
    for (const p of FIT_PTS) {
      _v1.copy(p).project(camera);
      mx = Math.max(mx, Math.abs(_v1.x));
      top = Math.max(top, _v1.y);
      bot = Math.min(bot, _v1.y);
    }
    const over = Math.max(mx / 0.985, top / (portrait ? 0.86 : 0.90), bot / -(portrait ? 0.80 : 0.94));
    if (over > 1.005) dist *= 1 + (over - 1) * 0.85;
    else if (over < 0.9) dist *= 0.965;
    else break;
  }
  camera.userData.dist = dist;
  camera.userData.el = el;
  camera.userData.target = target;
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.7 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
  if (bloomPass) bloomPass.setSize(w * 0.5, h * 0.5);
  fitCamera();
  refreshBadgeSizes();
  if (particles) particles.mat.uniforms.uScale.value = h * dpr * 0.55;
}

/* =========================================================================
   6. 몬스터
   ========================================================================= */
const MONSTER_DEF = {
  small: { hp: 16, spd: 1.08, scale: 1.0, gold: 2, r: 0.46 },
  runner: { hp: 12, spd: 2.0, scale: 0.86, gold: 2, r: 0.4 },
  tank: { hp: 48, spd: 0.76, scale: 1.24, gold: 5, r: 0.56 },
  boss: { hp: 420, spd: 0.62, scale: 1.95, gold: 70, r: 0.62 },
};
const MON_PALETTES = [
  [0xff9c3c, 0xe86a12], [0xff5f8f, 0xd62d63], [0x7ccf3a, 0x4e9c1e],
  [0x45a8f0, 0x2277c9], [0xa96aff, 0x7a34d4], [0xffc21a, 0xd18f00],
];
const geoCache = new Map();

function tint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return geo;
}

function P(geo, color, pos, scl, rot) {
  const g = geo.clone();
  if (rot) { if (rot[0]) g.rotateX(rot[0]); if (rot[1]) g.rotateY(rot[1]); if (rot[2]) g.rotateZ(rot[2]); }
  if (scl) g.scale(scl[0], scl[1], scl[2]);
  if (pos) g.translate(pos[0], pos[1], pos[2]);
  return tint(g, color);
}

function buildMonsterGeo(kind, paletteIdx) {
  const key = kind + '_' + paletteIdx;
  if (geoCache.has(key)) return geoCache.get(key);
  const pal = MON_PALETTES[paletteIdx % MON_PALETTES.length];
  const body = pal[0], dark = pal[1];
  const sph = new THREE.SphereGeometry(1, 16, 12);
  const cone = new THREE.ConeGeometry(1, 1, 10);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const parts = [];
  const wide = kind === 'tank' ? 1.16 : kind === 'boss' ? 1.1 : 1;
  const flat = kind === 'tank' ? 1.02 : 0.94;
  parts.push(P(sph, body, [0, 0.55, 0], [0.46 * wide, 0.44 * flat, 0.42]));
  parts.push(P(sph, dark, [0, 0.4, 0.2], [0.3 * wide, 0.25, 0.24]));           // 배
  // 눈
  parts.push(P(sph, 0xfffdf5, [-0.16 * wide, 0.66, 0.34], [0.115, 0.125, 0.08]));
  parts.push(P(sph, 0xfffdf5, [0.16 * wide, 0.66, 0.34], [0.115, 0.125, 0.08]));
  parts.push(P(sph, 0x1b1020, [-0.17 * wide, 0.65, 0.4], [0.055, 0.065, 0.04]));
  parts.push(P(sph, 0x1b1020, [0.15 * wide, 0.65, 0.4], [0.055, 0.065, 0.04]));
  parts.push(P(sph, 0xffffff, [-0.19 * wide, 0.69, 0.43], [0.022, 0.026, 0.02]));
  parts.push(P(sph, 0xffffff, [0.13 * wide, 0.69, 0.43], [0.022, 0.026, 0.02]));
  // 입 · 혀
  parts.push(P(sph, 0x5a1030, [0, 0.44, 0.38], [0.13, 0.08, 0.06]));
  parts.push(P(sph, 0xff7f9c, [0, 0.42, 0.4], [0.07, 0.04, 0.03]));
  // 팔 · 다리
  parts.push(P(sph, body, [-0.44 * wide, 0.5, 0.05], [0.1, 0.18, 0.1], [0, 0, 0.5]));
  parts.push(P(sph, body, [0.44 * wide, 0.5, 0.05], [0.1, 0.18, 0.1], [0, 0, -0.5]));
  parts.push(P(sph, dark, [-0.18, 0.14, 0.06], [0.14, 0.09, 0.16]));
  parts.push(P(sph, dark, [0.18, 0.14, 0.06], [0.14, 0.09, 0.16]));
  // 뺨
  parts.push(P(sph, 0xff8fa8, [-0.28 * wide, 0.53, 0.28], [0.07, 0.05, 0.03]));
  parts.push(P(sph, 0xff8fa8, [0.28 * wide, 0.53, 0.28], [0.07, 0.05, 0.03]));

  if (kind === 'small') {
    parts.push(P(cone, 0xfff0d0, [-0.24, 0.95, -0.02], [0.075, 0.2, 0.075], [0.15, 0, 0.2]));
    parts.push(P(cone, 0xfff0d0, [0.24, 0.95, -0.02], [0.075, 0.2, 0.075], [0.15, 0, -0.2]));
    parts.push(P(box, 0xfff6e8, [0, 0.34, 0.32], [0.26, 0.02, 0.2]));    // 턱받이
  } else if (kind === 'runner') {
    parts.push(P(cyl, 0xffffff, [0, 0.75, 0.28], [0.19, 0.03, 0.19], [Math.PI / 2.6, 0, 0]));
    parts.push(P(cyl, 0x5fe0ff, [0, 0.75, 0.28], [0.2, 0.012, 0.2], [Math.PI / 2.6, 0, 0]));
    parts.push(P(cone, 0x5fe0ff, [0, 1.0, -0.2], [0.11, 0.26, 0.03], [-0.5, 0, 0]));
    parts.push(P(cone, 0xd0f8ff, [0, 0.98, -0.26], [0.06, 0.2, 0.02], [-0.5, 0, 0]));
  } else if (kind === 'tank') {
    parts.push(P(sph, 0x8a97a8, [0, 0.86, 0.02], [0.34, 0.26, 0.33]));      // 헬멧
    parts.push(P(cyl, 0x6b7686, [0, 0.86, 0.16], [0.34, 0.04, 0.34], [0.12, 0, 0]));
    parts.push(P(box, 0x9fb0c4, [0, 0.96, -0.02], [0.18, 0.03, 0.28]));
    parts.push(P(sph, 0xffd34d, [0, 0.36, 0.36], [0.07, 0.07, 0.04]));       // 주머니 단추
  } else if (kind === 'boss') {
    parts.push(P(cyl, 0xffd34d, [0, 1.02, 0], [0.24, 0.08, 0.24]));          // 왕관 테
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(P(cone, 0xffe066, [Math.cos(a) * 0.22, 1.16, Math.sin(a) * 0.22], [0.06, 0.22, 0.06]));
    }
    parts.push(P(sph, 0xff3b5c, [0, 1.09, 0.2], [0.05, 0.05, 0.05]));
    parts.push(P(cone, 0x7a1020, [0, 0.5, -0.3], [0.6, 0.9, 0.1], [0.35, 0, 0]));  // 망토
    parts.push(P(box, 0x2b1520, [-0.16, 0.78, 0.34], [0.16, 0.035, 0.04], [0, 0, 0.3]));
    parts.push(P(box, 0x2b1520, [0.16, 0.78, 0.34], [0.16, 0.035, 0.04], [0, 0, -0.3]));
    parts.push(P(sph, 0x77102a, [0, 0.36, 0.36], [0.16, 0.1, 0.06]));
  }
  const merged = BGU.mergeGeometries(parts, false);
  merged.computeBoundingSphere();
  geoCache.set(key, merged);
  return merged;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _sc = new THREE.Vector3();

class Monster {
  constructor(kind, wave, hp, dist) {
    const def = MONSTER_DEF[kind];
    this.kind = kind; this.def = def;
    this.maxHp = hp; this.hp = hp;
    this.speed = def.spd * (1 + Math.min(0.35, wave * 0.006));
    this.baseSpeed = this.speed;
    this.dist = dist || 0;
    this.lap = 0;
    this.alive = true;
    this.bob = Math.random() * 6.28;
    this.flash = 0;
    this.marked = 0; this.burn = 0; this.burnTick = 0; this.burnDps = 0;
    this.slow = 0; this.slowAmt = 0; this.stun = 0;
    this.sq = 0;              // 스쿼시앤스트레치 강도
    this.wave = wave;
    this.palIdx = rndInt(0, MON_PALETTES.length - 1);
    this.scale = def.scale;

    const geo = buildMonsterGeo(kind, this.palIdx);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.78, metalness: 0.02, envMapIntensity: 0.16,
      emissive: 0x000000, emissiveIntensity: 1,
    });
    this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = kind !== 'boss' ? true : true;
    this.mesh.receiveShadow = false;
    this.mesh.scale.setScalar(this.scale * (this.kind === 'boss' ? 1.45 : 1.12));
    this.mesh.userData.monster = this;
    this.baseScale = this.mesh.scale.x;
    root.add(this.mesh);
    this.updateTransform(0, true);
  }

  get radius() { return this.def.r * this.scale * 0.9; }

  updateTransform(dt, first) {
    trackPoint(this.dist, _v1);
    const bobY = Math.sin(this.bob) * 0.055;
    const hop = this.kind === 'runner' ? Math.abs(Math.sin(this.bob * 2.2)) * 0.1 : 0;
    this.mesh.position.set(_v1.x, 0.755 + bobY + hop, _v1.z);
    trackPoint(this.dist + 0.35, _v2);
    const ang = Math.atan2(_v2.x - _v1.x, _v2.z - _v1.z);
    this.mesh.rotation.y = ang;
    const s = 1 + this.sq * 0.34;
    const inv = 1 / (1 + this.sq * 0.2);
    this.mesh.scale.set(this.baseScale * s, this.baseScale * inv, this.baseScale * s);
  }

  update(dt) {
    if (!this.alive) return;
    this.bob += dt * (6 + this.speed * 2.5);
    if (this.stun > 0) { this.stun -= dt; }
    else {
      const slowK = this.slow > 0 ? 1 - this.slowAmt : 1;
      this.dist += this.speed * slowK * (1 + this.lap * 0.08) * dt;
    }
    if (this.dist >= trackLen) {
      this.dist -= trackLen; this.lap++;
      if (this.lap === 1) {
        particles.emit({ x: this.mesh.position.x, y: 0.9, z: this.mesh.position.z, n: 6, color: 0xff3b3b, color2: 0xffb060, speed: 1.6, life: 0.5, size: 0.15, gravity: 1.2 });
      }
    }
    if (this.slow > 0) this.slow -= dt;
    if (this.marked > 0) this.marked -= dt;
    if (this.burn > 0) {
      this.burn -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.4;
        this.hurt(this.burnDps * 0.4, { silent: true, popup: false, dot: true });
        particles.emit({
          x: this.mesh.position.x, y: this.mesh.position.y + 0.4, z: this.mesh.position.z,
          n: 2, color: 0xff7a2a, color2: 0xffd34d, speed: 0.7, life: 0.34, size: 0.12, gravity: -1.2, up: 0.8,
        });
      }
    }
    this.sq *= Math.exp(-dt * 9);
    this.updateTransform(dt);

    const em = this.mat.emissive;
    let r = 0, g = 0, b = 0;
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 6.5); r += this.flash * 0.42; g += this.flash * 0.36; b += this.flash * 0.3; }
    if (this.burn > 0) { r += 0.34; g += 0.09; }
    if (this.marked > 0) { r += 0.24; b += 0.5; }
    if (this.slow > 0) { g += 0.1; b += 0.34; }
    em.setRGB(clamp(r, 0, 2), clamp(g, 0, 2), clamp(b, 0, 2));
  }

  hurt(amount, opts) {
    if (!this.alive) return;
    opts = opts || {};
    const markMul = this.marked > 0 ? 1 + TOWERS.cheese.mark.amt : 1;
    const dmg = amount * markMul;
    this.hp -= dmg;
    if (!opts.silent) { this.flash = opts.crit ? 0.85 : 0.55; this.sq = opts.crit ? 0.55 : 0.3; }
    if (!opts.dot) {
      const p = this.mesh.position;
      if (opts.popup !== false && (opts.crit || Math.random() < 0.55)) {
        popups.spawn(p.x + rnd(-0.2, 0.2), p.y + this.scale * 1.05, p.z, Math.round(dmg),
          opts.crit ? 'crit' : (opts.cls || ''));
      }
      if (opts.crit) {
        particles.emit({ x: p.x, y: p.y + 0.6, z: p.z, n: 9, color: 0xffd34d, color2: 0xff7a2a, speed: 3.2, life: 0.5, size: 0.2, gravity: 2.2 });
      }
    }
    if (this.hp <= 0) this.die(opts);
  }

  die(opts) {
    if (!this.alive) return;
    this.alive = false;
    const p = this.mesh.position;
    const isBoss = this.kind === 'boss';
    particles.emit({
      x: p.x, y: p.y + 0.5 * this.scale, z: p.z, n: isBoss ? 46 : 16,
      color: this.palIdx >= 0 ? MON_PALETTES[this.palIdx][0] : 0xffffff,
      color2: 0xff8a3a, speed: isBoss ? 6.5 : 3.6, life: isBoss ? 1.2 : 0.7,
      size: isBoss ? 0.34 : 0.2, gravity: 5.5, up: 1.5, jitter: 0.3,
    });
    rings.spawn(p.x, 0.8, p.z, { color: isBoss ? 0xffd34d : 0xffb060, to: isBoss ? 6 : 2.2, dur: isBoss ? 0.9 : 0.45, opacity: 0.8 });
    if (isBoss) {
      shake.add(0.85);
      flashScreen(0.5, 0.35);
      pillars.spawn(p.x, p.z, { color: 0xffcf4d, dur: 1.4, w: 1.6, opacity: 0.8 });
      SFX.play('star4');
    }
    SFX.play('kill');
    const gold = Math.round(this.def.gold * (1 + this.wave * 0.05));
    S.gold += gold;
    S.totalKills++;
    popups.spawn(p.x, p.y + this.scale * 1.2, p.z, '+' + gold, 'gold');
    if (Math.random() < 0.5) SFX.play('coin');
    delete this.mesh.userData.monster;
    root.remove(this.mesh);
    this.mat.dispose();
    S.maxStar = Math.max(S.maxStar, 1);
  }
}

/* =========================================================================
   7. 타워 (분식 5종 × 성급)
   ========================================================================= */
function addMat(color, opacity, emissive) {
  if (emissive) return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4,
  });
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: opacity ?? 1, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

function buildEomuk(star) {
  const g = new THREE.Group();
  const stick = new THREE.MeshStandardMaterial({ color: 0xa87b45, roughness: 0.8 });
  const cake = new THREE.MeshStandardMaterial({ color: 0xf6cf8e, roughness: 0.62, metalness: 0.02, envMapIntensity: 0.5 });
  const glaze = new THREE.MeshStandardMaterial({ color: 0xe8551c, emissive: 0xa02c00, emissiveIntensity: star >= 3 ? 0.75 : 0.4, roughness: 0.45 });
  const n = star >= 5 ? 3 : star >= 3 ? 2 : 1;
  for (let s = 0; s < n; s++) {
    const grp = new THREE.Group();
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 1.02, 7), stick);
    sk.position.y = 0.44; sk.castShadow = true; grp.add(sk);
    for (let i = 0; i < 3; i++) {
      const piece = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), i === 1 ? glaze : cake);
      piece.scale.set(0.92, 0.4, 0.72);
      piece.position.y = 0.28 + i * 0.19;
      piece.rotation.z = rnd(-0.16, 0.16);
      piece.castShadow = true; grp.add(piece);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.01, 0.03), new THREE.MeshStandardMaterial({ color: 0x8a4a1a, roughness: 0.9 }));
      mark.position.set(0, 0.28 + i * 0.19, 0.115); mark.rotation.x = 0.3; grp.add(mark);
    }
    const a = (s / Math.max(1, n)) * Math.PI * 1.1 - 0.5;
    grp.position.set(Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22 - 0.05);
    grp.rotation.set(0.08, a * 0.6, Math.sin(a) * 0.22);
    g.add(grp);
  }
  return g;
}

function buildTteok(star) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.25, 0.24, 18),
    new THREE.MeshStandardMaterial({ color: 0x2a2430, roughness: 0.34, metalness: 0.55, envMapIntensity: 1 }));
  bowl.position.y = 0.14; bowl.castShadow = true; g.add(bowl);
  const sauce = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 18),
    new THREE.MeshStandardMaterial({ color: 0xd42710, emissive: 0xb82400, emissiveIntensity: 0.55 + star * 0.12, roughness: 0.32, metalness: 0.1 }));
  sauce.position.y = 0.27; g.add(sauce);
  const tteokMat = new THREE.MeshStandardMaterial({ color: 0xfff3e2, roughness: 0.45 });
  const n = 4 + Math.min(4, star);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 8), tteokMat);
    t.position.set(Math.cos(a) * 0.14, 0.36, Math.sin(a) * 0.14);
    t.rotation.set(rnd(-0.5, 0.5), a, rnd(-0.5, 0.5));
    t.castShadow = true; g.add(t);
  }
  const fish = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.02, 3), new THREE.MeshStandardMaterial({ color: 0xffd9a0, roughness: 0.6 }));
  fish.position.set(0.06, 0.3, 0.02); fish.rotation.y = 0.7; g.add(fish);
  const onion = new THREE.MeshStandardMaterial({ color: 0x74c043, roughness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const on = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 5), onion);
    on.position.set(rnd(-0.2, 0.2), 0.34, rnd(-0.2, 0.2)); on.rotation.z = rnd(-0.4, 0.4); g.add(on);
  }
  return g;
}

function buildGimmari(star) {
  const g = new THREE.Group();
  const fry = new THREE.MeshStandardMaterial({ color: 0xb8721c, roughness: 0.66, metalness: 0.05, envMapIntensity: 0.55 });
  const nori = new THREE.MeshStandardMaterial({ color: 0x1d2a1e, roughness: 0.7 });
  const n = star >= 5 ? 3 : star >= 3 ? 2 : 1;
  for (let s = 0; s < n; s++) {
    const roll = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.15, 0.6, 14), fry);
    body.castShadow = true; roll.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.12, 14), nori);
    band.position.y = 0.02; roll.add(band);
    const glass = new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.35, metalness: 0.1 });
    for (let k = 0; k < 4; k++) {
      const noodle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 5), glass);
      noodle.position.set(rnd(-0.06, 0.06), 0.32, rnd(-0.06, 0.06));
      noodle.rotation.set(rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3)); roll.add(noodle);
    }
    for (let k = 0; k < 10; k++) {
      const bit = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.02, 0.04), 6, 5), fry);
      const a = Math.random() * 6.28, yy = rnd(-0.25, 0.25);
      bit.position.set(Math.cos(a) * 0.15, yy, Math.sin(a) * 0.15); roll.add(bit);
    }
    const a = (s / Math.max(1, n)) * Math.PI - 0.6;
    roll.position.set(Math.sin(a) * 0.16, 0.34, Math.cos(a) * 0.16 - 0.04);
    roll.rotation.set(0.35, a, 0.3 + Math.sin(a) * 0.2);
    g.add(roll);
  }
  return g;
}

function buildMandu(star) {
  const g = new THREE.Group();
  const dough = new THREE.MeshStandardMaterial({
    color: star >= 5 ? 0xffe0a0 : 0xf7e8cf, roughness: 0.5, metalness: 0.03,
    emissive: star >= 5 ? 0x9a6a00 : 0x000000, emissiveIntensity: star >= 5 ? 0.55 : 0, envMapIntensity: 0.8,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), dough);
  body.scale.set(1, 0.82, 1); body.position.y = 0.3; body.castShadow = true; g.add(body);
  const pleat = new THREE.MeshStandardMaterial({ color: 0xffeed2, roughness: 0.5 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.17, 5), pleat);
    p.position.set(Math.cos(a) * 0.16, 0.52, Math.sin(a) * 0.16);
    p.rotation.set(0.7 * Math.cos(a), 0, -0.7 * Math.sin(a));
    g.add(p);
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), pleat);
  top.position.y = 0.57; g.add(top);
  const green = new THREE.MeshStandardMaterial({ color: 0x6cbf3a, roughness: 0.6 });
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 3), green);
  leaf.position.set(0.09, 0.6, 0.06); leaf.rotation.z = -0.5; g.add(leaf);
  return g;
}

function buildCheese(star) {
  const g = new THREE.Group();
  const cheeseMat = new THREE.MeshPhysicalMaterial({
    color: 0xffb400, roughness: 0.28, metalness: 0.06, clearcoat: 0.85, clearcoatRoughness: 0.25,
    emissive: 0xd97a00, emissiveIntensity: 0.2 + star * 0.08, envMapIntensity: 0.9,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.27, 22, 16), cheeseMat);
  ball.position.y = 0.3; ball.castShadow = true; g.add(ball);
  const holeMat = new THREE.MeshStandardMaterial({ color: 0xb87a00, roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * 6.28, b = rnd(-0.6, 0.9);
    const h = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.03, 0.06), 8, 6), holeMat);
    h.position.set(Math.cos(a) * Math.cos(b) * 0.26, 0.3 + Math.sin(b) * 0.26, Math.sin(a) * Math.cos(b) * 0.26);
    g.add(h);
  }
  const dripMat = new THREE.MeshPhysicalMaterial({ color: 0xffb300, roughness: 0.3, clearcoat: 0.6, emissive: 0xff7a00, emissiveIntensity: 0.3 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28 + 0.4;
    const d = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 8), dripMat);
    d.position.set(Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2);
    d.rotation.x = Math.PI; g.add(d);
  }
  const fuse = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 12, 3), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 }));
  fuse.position.set(0, 0.56, -0.02); fuse.rotation.x = 1.2; g.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), addMat(0xfff2a0, 1, false));
  spark.position.set(0.02, 0.64, -0.08); g.add(spark);
  g.userData.spark = spark;
  return g;
}

const TOWER_BUILDERS = { eomuk: buildEomuk, tteok: buildTteok, gimmari: buildGimmari, mandu: buildMandu, cheese: buildCheese };

function buildTowerMesh(type, star) {
  let orbits = [];
  const def = TOWERS[type];
  const g = new THREE.Group();
  const glowCol = STAR_GLOW[Math.min(5, star)];

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x3c2517, roughness: 0.72, metalness: 0.28, envMapIntensity: 0.7 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.15, 20), baseMat);
  base.position.y = 0.075; base.castShadow = true; base.receiveShadow = true; g.add(base);
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.022, 8, 30), addMat(def.glow, 0.34));
  baseRing.rotation.x = -Math.PI / 2; baseRing.position.y = 0.155; g.add(baseRing);

  const item = TOWER_BUILDERS[type](star);
  item.position.y = 0.15;
  item.userData.isItem = true;
  g.add(item);

  // 음식 높이에 맞춰 성급 표시를 얹는다 (타워마다 높이가 달라서)
  const itemTop = new THREE.Box3().setFromObject(item).max.y;

  // 성급 라벨 — 타워 위에 크게 보이는 배지 (멀리서·모바일에서도 읽히도록)
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texStarBadge(star), transparent: true, depthWrite: false, depthTest: true,
  }));
  badge.scale.set(0.62, 0.26, 1);
  badge.position.set(0, Math.max(1.34, itemTop + 0.30), 0);
  badge.userData.starBadge = true;
  badge.renderOrder = 3;
  g.add(badge);

  const rings = [];
  if (star >= 3) {
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.011, 6, 44), addMat(glowCol, 0.3));
    r1.rotation.x = -Math.PI / 2; r1.position.y = 0.34; g.add(r1); rings.push({ mesh: r1, spd: 1.1, axis: 'y' });
  }
  if (star >= 4) {
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.01, 6, 40), addMat(glowCol, 0.24));
    r2.rotation.set(0.9, 0, 0.4); r2.position.y = 0.72; g.add(r2); rings.push({ mesh: r2, spd: -1.5, axis: 'z' });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex_cache.glow, color: glowCol, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(1.15); halo.position.y = 0.6; halo.material.opacity = 0.2; g.add(halo);
  }
  if (star >= 5) {
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.014, 6, 32), addMat(0xffd34d, 0.55));
    crown.rotation.x = Math.PI / 2.3; crown.position.y = 1.02; g.add(crown);
    rings.push({ mesh: crown, spd: 2.2, axis: 'z' });
    orbits = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
      s.userData.orbit = i; g.add(s); orbits.push(s);
    }
  }
  g.scale.setScalar(1.28 + Math.min(star, 5) * 0.06);
  return { group: g, item, rings, orbits, badge };
}

let towerUid = 0;
class Tower {
  constructor(cell, type, star) {
    this.cell = cell;
    this.type = type;
    this.star = star;
    this.id = 'T' + (++towerUid);
    this.pos = cellCenter(cell);
    this.cool = rnd(0, 0.3);
    this.t = rnd(0, 10);
    this.buff = 1;
    this.recoil = 0;
    this.wobble = 0;
    this.alive = true;
    const built = buildTowerMesh(type, star);
    this.mesh = built.group;
    this.item = built.item;
    this.rings = built.rings;
    this.orbits = built.orbits || [];
    this.badge = built.badge || null;
    this.mesh.position.copy(this.pos);
    this.baseScale = this.mesh.scale.x;
    applyStarBadgeSize(this);
    this.spawnT = 1;
    this.mesh.userData.tower = this;
    this.mesh.traverse((o) => { if (o.isMesh) o.userData.tower = this; });
    root.add(this.mesh);
  }

  get def() { return TOWERS[this.type]; }
  get dmg() {
    const lvl = S.upgrades[this.type] || 0;
    return this.def.dmg * STAR_DMG[Math.min(5, this.star)] * (1 + lvl * 0.13);
  }
  get interval() {
    return this.def.rate / (1 + (this.star - 1) * 0.07) / this.buff;
  }
  get range() { return this.def.range + (this.star - 1) * 0.12; }

  update(dt) {
    this.t += dt;
    this.cool -= dt;
    this.recoil *= Math.exp(-dt * 8);
    const it = this.item;
    if (it) {
      it.position.y = 0.15 + Math.sin(this.t * 2.2) * 0.018 - this.recoil * 0.1;
      it.rotation.z = Math.sin(this.t * 1.6) * 0.02 + this.recoil * 0.3;
      it.scale.setScalar(1 + Math.sin(this.t * 2.2) * 0.012 + this.recoil * 0.12);
      if (it.userData.spark) it.userData.spark.material.opacity = 0.6 + Math.sin(this.t * 9) * 0.4;
    }
    for (const r of this.rings) {
      r.mesh.rotation[r.axis] += dt * r.spd;
    }
    for (const o of this.orbits) {
      const a = this.t * 2.4 + o.userData.orbit * 1.57;
      o.position.set(Math.cos(a) * 0.5, 0.7 + Math.sin(a * 2) * 0.25, Math.sin(a) * 0.5);
      o.rotation.y += dt * 4; o.rotation.x += dt * 3;
    }
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 3.4);
      const k = this.spawnT;
      const back = k < 1 ? 1 + 2.3 * Math.pow(k - 1, 3) + 1.3 * Math.pow(k - 1, 2) : 1; // easeOutBack
      this.mesh.scale.setScalar(this.baseScale * (0.4 + 0.6 * back));
      this.mesh.position.y = this.pos.y + (1 - k) * (1 - k) * 1.5;
    } else if (Math.abs(this.mesh.position.y - this.pos.y) > 0.001) {
      this.mesh.position.y = this.pos.y;
      this.mesh.scale.setScalar(this.baseScale);
    }

    if (!S.started || S.over) return;
    if (this.type === 'cheese') {
      if (this.cool <= 0) { this.cool = this.interval; this.pulse(); }
      return;
    }
    if (this.cool > 0) return;
    const target = this.findTarget();
    if (!target) return;
    this.cool = this.interval;
    this.fire(target);
  }

  findTarget() {
    let best = null, bestD = -1;
    const r2 = this.range * this.range;
    for (const m of monsters) {
      if (!m.alive) continue;
      const dx = m.mesh.position.x - this.pos.x, dz = m.mesh.position.z - this.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const prog = m.dist + m.lap * trackLen;
      if (prog > bestD) { bestD = prog; best = m; }
    }
    return best;
  }

  muzzle() {
    return _v2.set(this.pos.x, this.pos.y + 0.78, this.pos.z);
  }

  fire(target) {
    this.recoil = 1;
    const muzzle = this.muzzle().clone();
    const crit = Math.random() < 0.1;
    const dmg = this.dmg * (crit ? 1.85 : 1) * rnd(0.92, 1.08);
    if (this.type === 'eomuk') {
      SFX.play('shootE');
      spawnProjectile('dart', muzzle, target, dmg, { speed: 17, crit });
    } else if (this.type === 'tteok') {
      SFX.play('shootT');
      spawnProjectile('sauce', muzzle, target, dmg, { speed: 8.5, arc: 0.55, crit });
    } else if (this.type === 'gimmari') {
      SFX.play('shootG');
      this.beam(target, dmg, crit);
    } else if (this.type === 'mandu') {
      SFX.play('shootM');
      // 공격 시 화면 흔들림 없음 (선우 님 요청: 공격할 때마다 흔들려서 어지러움)
      spawnProjectile('mandu', muzzle, target, dmg, { speed: 6.4, arc: 1.0, crit, heavy: true });
    }
  }

  beam(target, dmg, crit) {
    const tp = target.mesh.position;
    const dir = _v1.set(tp.x - this.pos.x, 0, tp.z - this.pos.z).normalize();
    const toTgt = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
    const len = Math.min(this.range * 1.02, toTgt + 0.9);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.016, len, 7, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9df2ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    beam.position.set(this.pos.x + dir.x * len / 2, this.pos.y + 0.78, this.pos.z + dir.z * len / 2);
    beam.rotation.z = Math.PI / 2;
    beam.rotation.y = -Math.atan2(dir.z, dir.x);
    root.add(beam);
    const life = { t: 0, mesh: beam };
    beams.push(life);

    for (const m of monsters.slice()) {
      if (!m.alive) continue;
      const mx = m.mesh.position.x - this.pos.x, mz = m.mesh.position.z - this.pos.z;
      const proj = mx * dir.x + mz * dir.z;
      if (proj < 0 || proj > len) continue;
      const perp = Math.abs(mx * dir.z - mz * dir.x);
      if (perp > 0.55) continue;
      m.hurt(dmg, { crit });
      if (crit) popups.spawn(m.mesh.position.x, m.mesh.position.y + 1.1, m.mesh.position.z, 'CRIT!', 'crit');
      m.slow = this.def.slow.dur; m.slowAmt = this.def.slow.amt;
      particles.emit({ x: m.mesh.position.x, y: m.mesh.position.y + 0.5, z: m.mesh.position.z, n: 5, color: 0x9df2ff, color2: 0xffffff, speed: 2.2, life: 0.4, size: 0.13, gravity: 1 });
    }
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      particles.emit({
        x: this.pos.x + dir.x * len * t, y: this.pos.y + 0.78, z: this.pos.z + dir.z * len * t,
        n: 1, color: 0xbff4ff, color2: 0x5fd8ff, speed: 0.5, life: 0.28, size: 0.1, gravity: -0.6, up: 0.4,
      });
    }
  }

  pulse() {
    const r = this.range;
    if (!this.auraRing) {
      const g = new THREE.RingGeometry(0.93, 1, 64, 1);
      g.rotateX(-Math.PI / 2); g.userData.shared = true;
      this.auraRing = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: 0xffd34d, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      this.auraRing.position.set(this.pos.x, 1.115, this.pos.z);
      this.auraRing.scale.setScalar(r);
      root.add(this.auraRing);
    }
    let marked = 0;
    for (const m of monsters) {
      if (!m.alive) continue;
      const dx = m.mesh.position.x - this.pos.x, dz = m.mesh.position.z - this.pos.z;
      if (dx * dx + dz * dz <= r * r) {
        if (m.marked <= 0) marked++;
        m.marked = this.def.mark.dur * (this.star >= 4 ? 1.3 : 1);
        particles.emit({ x: m.mesh.position.x, y: m.mesh.position.y + 0.3, z: m.mesh.position.z, n: 3, color: 0xd6a6ff, color2: 0x8a4dff, speed: 1.4, life: 0.5, size: 0.14, gravity: -0.4, up: 0.9 });
      }
    }
    if (marked) popups.spawn(this.pos.x, this.pos.y + 1.3, this.pos.z, '표식!', 'buff');
  }
}

/* ── 투사체 ───────────────────────────────────────────────────────────── */
const projMeshes = { dart: [], sauce: [], mandu: [] };
const beams = [];

function makeProjMesh(kind) {
  let m;
  if (kind === 'dart') {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.42), new THREE.MeshBasicMaterial({ color: 0xfff2c8 }));
  } else if (kind === 'sauce') {
    m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff6a2a }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex_cache.glow, color: 0xff5a10, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.95); m.add(glow);
  } else {
    m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshStandardMaterial({
      color: 0xfff4de, roughness: 0.5, emissive: 0xffe0a0, emissiveIntensity: 0.4,
    }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex_cache.glow, color: 0xffd080, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(1.5); m.add(glow);
  }
  m.visible = false;
  scene.add(m);
  return m;
}

function spawnProjectile(kind, from, target, dmg, opt) {
  opt = opt || {};
  let mesh = projMeshes[kind].find((p) => !p.userData.active);
  if (!mesh) { mesh = makeProjMesh(kind); projMeshes[kind].push(mesh); }
  mesh.userData.active = true; mesh.visible = true;
  mesh.position.copy(from);
  const p = {
    kind, mesh, target, dmg, crit: !!opt.crit, heavy: !!opt.heavy,
    speed: opt.speed || 12, arc: opt.arc || 0, t: 0,
    start: from.clone(),
    last: target.mesh.position.clone(),
    towerType: null,
  };
  if (kind === 'mandu') mesh.scale.setScalar(0.9);
  projectiles.push(p);
  return p;
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.t += dt;
    const tgt = p.target && p.target.alive ? p.target.mesh.position : p.last;
    if (p.target && p.target.alive) p.last.copy(tgt);
    const dst = _v1.set(tgt.x - p.mesh.position.x, 0, tgt.z - p.mesh.position.z);
    const dist = dst.length();
    const step = p.speed * dt;
    if (dist <= Math.max(0.28, step)) {
      impact(p);
      p.mesh.userData.active = false; p.mesh.visible = false;
      projectiles.splice(i, 1);
      continue;
    }
    dst.multiplyScalar(step / dist);
    p.mesh.position.x += dst.x; p.mesh.position.z += dst.z;
    const prog = 1 - clamp01(dist / 8);
    p.mesh.position.y = lerp(p.mesh.position.y, tgt.y + 0.55 + Math.sin(prog * Math.PI) * p.arc, 0.35);
    if (p.kind === 'dart') p.mesh.lookAt(tgt.x, p.mesh.position.y, tgt.z);
    if (p.kind === 'sauce' && Math.random() < 0.7) {
      particles.emit({ x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z, n: 1, color: 0xff7a2a, color2: 0xffd34d, speed: 0.5, life: 0.3, size: 0.11, gravity: 1.2 });
    }
    if (p.kind === 'mandu') p.mesh.rotation.x += dt * 5, p.mesh.rotation.y += dt * 4;
  }
}

function impact(p) {
  const pos = p.mesh.position.clone();
  if (p.kind === 'dart') {
    if (p.target && p.target.alive) {
      p.target.hurt(p.dmg, { crit: p.crit });
      if (p.crit) { popups.spawn(pos.x, pos.y + 0.9, pos.z, 'CRIT!', 'crit'); } else SFX.play('hit');
    }
    particles.emit({ x: pos.x, y: pos.y, z: pos.z, n: 4, color: 0xfff0c0, color2: 0xffb060, speed: 2, life: 0.28, size: 0.1, gravity: 2 });
  } else if (p.kind === 'sauce') {
    const R = 1.55;
    rings.spawn(pos.x, 0.82, pos.z, { color: 0xff5a2a, from: 0.4, to: R * 2, dur: 0.45, opacity: 0.75 });
    particles.emit({ x: pos.x, y: pos.y, z: pos.z, n: 14, color: 0xff6a2a, color2: 0xffd34d, speed: 4.2, life: 0.55, size: 0.16, gravity: 4.5, up: 1.2 });
    SFX.play('hit');
    for (const m of monsters.slice()) {
      if (!m.alive) continue;
      const d = Math.hypot(m.mesh.position.x - pos.x, m.mesh.position.z - pos.z);
      if (d <= R + m.radius * 0.4) {
        m.hurt(p.dmg, { crit: p.crit });
        m.burn = 3; m.burnTick = 0.4; m.burnDps = p.dmg * 0.45;
      }
    }
  } else if (p.kind === 'mandu') {
    const R = 1.05;
    rings.spawn(pos.x, 0.82, pos.z, { color: 0xffe0a0, from: 0.5, to: R * 2.3, dur: 0.55, opacity: 0.9 });
    particles.emit({ x: pos.x, y: pos.y, z: pos.z, n: 22, color: 0xfff4de, color2: 0xffb060, speed: 5.2, life: 0.7, size: 0.22, gravity: 6, up: 2 });
    SFX.play('shootM');
    for (const m of monsters.slice()) {
      if (!m.alive) continue;
      const d = Math.hypot(m.mesh.position.x - pos.x, m.mesh.position.z - pos.z);
      if (d <= R + m.radius * 0.5) {
        m.hurt(p.dmg, { crit: p.crit });
        m.stun = 0.7 + (p.crit ? 0.25 : 0);
        popups.spawn(m.mesh.position.x, m.mesh.position.y + 1.15, m.mesh.position.z, '기절!', 'slow');
      }
    }
  }
}

function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.t += dt;
    const k = b.t / 0.18;
    if (k >= 1) { root.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); beams.splice(i, 1); continue; }
    b.mesh.material.opacity = (1 - k) * 0.55;
    b.mesh.scale.x = 1 + k * 1.2; b.mesh.scale.z = 1 + k * 1.2;
  }
}

/* =========================================================================
   8. 배치판 · 게임 규칙
   ========================================================================= */
const CELLS = [];
for (let i = 0; i < GRID * GRID; i++) {
  const col = i % GRID, row = (i / GRID) | 0;
  CELLS.push({ id: i, col, row, x: (col - (GRID - 1) / 2) * CELL, z: (row - (GRID - 1) / 2) * CELL });
}
function cellCenter(cell) {
  const c = CELLS[cell] || CELLS[0];
  return new THREE.Vector3(c.x, 1.1, c.z);
}
function cellAt(x, z) {
  const col = Math.round(x / CELL + (GRID - 1) / 2);
  const row = Math.round(z / CELL + (GRID - 1) / 2);
  if (col < 0 || col >= GRID || row < 0 || row >= GRID) return -1;
  const cx = (col - (GRID - 1) / 2) * CELL, cz = (row - (GRID - 1) / 2) * CELL;
  if (Math.abs(x - cx) > CELL * 0.62 || Math.abs(z - cz) > CELL * 0.62) return -1;
  return row * GRID + col;
}

function summonCost() { return Math.min(170, Math.round(20 * Math.pow(1.085, S.summons))); }
function upgradeCost(k) { return Math.round(50 * Math.pow(1.62, S.upgrades[k] || 0)); }
function sellValue(t) { return Math.round(14 * Math.pow(1.95, t.star - 1) + (S.upgrades[t.type] || 0) * 6); }

/* ── 사운드 토글 ──────────────────────────────────────────────────────── */
function setMuted(v) {
  S.muted = v; SFX.muted = v;
  $('btnSound').textContent = v ? '🔇' : '🔊';
  $('btnSound').classList.toggle('on', !v);
  try { localStorage.setItem(SOUND_KEY, v ? '0' : '1'); } catch (e) { }
  if (!v && SFX.ctx) SFX.play('click');
}

/* ── 소환 ─────────────────────────────────────────────────────────────── */
function freeCells() {
  const out = [];
  for (let i = 0; i < CELLS.length; i++) if (!S.grid[i]) out.push(i);
  return out;
}

function summon() {
  if (!S.started || S.over) return;
  const cost = summonCost();
  if (S.gold < cost) { toast('골드가 모자라요. 먹보를 잡아 모으세요!'); SFX.play('click'); return; }
  const free = freeCells();
  if (!free.length) { toast('배치판이 가득 찾어요. 합성하거나 판매하세요!'); SFX.play('click'); return; }
  S.gold -= cost; S.summons++;
  const cell = pick(free);
  const type = pick(TOWER_KEYS);
  const t = new Tower(cell, type, 1);
  S.grid[cell] = t; towers.push(t); towerById.set(t.id, t);
  t.spawnT = 0; t.isNew = true;
  const p = t.pos;
  rings.spawn(p.x, 1.1, p.z, { color: 0xffe0a0, from: 0.3, to: 1.9, dur: 0.45, opacity: 0.7 });
  particles.emit({ x: p.x, y: p.y + 0.1, z: p.z, n: 14, color: 0xfff0c0, color2: TOWERS[type].glow, speed: 2.4, life: 0.55, size: 0.16, gravity: 3, up: 1.4, jitter: 0.25 });
  popups.spawn(p.x, p.y + 1.5, p.z, TOWERS[type].name, 'buff');
  SFX.play('summon');
  haptic(12);
  recalcBuffs();
  refreshGoldChip();
  return t;
}

/* ── 합성 ─────────────────────────────────────────────────────────────── */
function mergeTowers(a, b) {
  if (!a || !b || a === b || !a.alive || !b.alive) return false;
  if (a.type !== b.type || a.star !== b.star) {
    toast(`같은 종류 · 같은 성급만 합성돼요 (${TOWERS[a.type].ico}${a.star} ↔ ${TOWERS[b.type].ico}${b.star})`);
    return false;
  }
  if (a.star >= 5) { toast('★5는 이미 최고 성급이에요!'); return false; }
  const star = a.star + 1;
  const cellTo = b.cell;
  const pos = cellCenter(cellTo);
  removeTower(a); removeTower(b);
  const type = pick(TOWER_KEYS);
  const t = new Tower(cellTo, type, star);
  t.spawnT = 0; t.isMerge = true;
  S.grid[cellTo] = t; towers.push(t); towerById.set(t.id, t);
  S.maxStar = Math.max(S.maxStar, star);
  recalcBuffs();

  const glow = STAR_GLOW[Math.min(5, star)];
  const big = star >= 4;
  pillars.spawn(pos.x, pos.z, { color: big ? 0xffd34d : glow, dur: big ? 1.1 : 0.6, w: big ? 1.15 : 0.8, opacity: big ? 0.55 : 0.4 });
  rings.spawn(pos.x, 1.12, pos.z, { color: glow, from: 0.3, to: big ? 3.6 : 2.4, dur: big ? 0.7 : 0.45, opacity: 0.75 });
  rings.spawn(pos.x, 1.12, pos.z, { color: 0xffffff, from: 0.2, to: big ? 2.6 : 1.7, dur: big ? 0.42 : 0.3, opacity: 0.6, thin: true });
  particles.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z, n: big ? 48 : 24, color: glow, color2: 0xffffff, speed: big ? 6.2 : 4.2, life: big ? 0.95 : 0.7, size: big ? 0.2 : 0.16, gravity: 4.2, up: 2.0, jitter: 0.32, drag: 1.3 });
  particles.emit({ x: pos.x, y: pos.y + 0.2, z: pos.z, n: 16, color: 0xffb060, color2: 0xfff0c0, speed: 3, life: 0.9, size: 0.16, gravity: -1.4, up: 1.8, jitter: 0.3 });
  shake.add(big ? 0.75 : 0.34);
  flashScreen(big ? 0.3 : 0.14, big ? 0.4 : 0.18, big ? '#ffe9a0' : '#ffffff');
  S.slowTimer = big ? 0.42 : 0.16;
  S.cameraZoomTarget = big ? 1.07 : 1.025;
  SFX.play('merge', { star });
  haptic(big ? 45 : 18);
  if (big) setTimeout(() => SFX.play('star4'), 220);
  showMergeToast(star, type);
  popups.spawn(pos.x, pos.y + 1.9, pos.z, '★' + star, 'crit');
  updateHUD(true);
  if (big && star === 5) {
    pillars.spawn(pos.x, pos.z, { color: 0xfff0a0, dur: 1.6, w: 1.5, opacity: 0.5 });
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (!t.alive) return;
        rings.spawn(pos.x, 1.12, pos.z, { color: 0xffd34d, from: 0.5, to: 4.2, dur: 0.8, opacity: 0.45, thin: true });
      }, 160 * i);
    }
  }
  return true;
}

function removeTower(t) {
  if (!t || !t.alive) return;
  t.alive = false;
  if (t.auraRing) { root.remove(t.auraRing); t.auraRing = null; }
  if (S.grid[t.cell] === t) S.grid[t.cell] = null;
  const i = towers.indexOf(t); if (i >= 0) towers.splice(i, 1);
  towerById.delete(t.id);
  root.remove(t.mesh);
  disposeObj(t.mesh);
  if (S.selected === t) selectTower(null);
}

function moveTower(t, cell) {
  if (S.grid[cell]) return false;
  S.grid[t.cell] = null;
  t.cell = cell;
  S.grid[cell] = t;
  t.pos = cellCenter(cell);
  t.mesh.position.copy(t.pos);
  if (t.auraRing) t.auraRing.position.set(t.pos.x, 1.115, t.pos.z);
  t.spawnT = 0.28;
  particles.emit({ x: t.pos.x, y: 1.2, z: t.pos.z, n: 8, color: 0xffe0a0, speed: 1.6, life: 0.4, size: 0.13, gravity: 2 });
  SFX.play('click');
  return true;
}

function swapTowers(a, b) {
  const ca = a.cell, cb = b.cell;
  S.grid[ca] = b; S.grid[cb] = a;
  a.cell = cb; b.cell = ca;
  a.pos = cellCenter(cb); b.pos = cellCenter(ca);
  a.mesh.position.copy(a.pos); b.mesh.position.copy(b.pos);
  for (const t of [a, b]) if (t.auraRing) t.auraRing.position.set(t.pos.x, 1.115, t.pos.z);
  a.spawnT = 0.24; b.spawnT = 0.24;
  SFX.play('click');
}

function sellTower(t) {
  if (!t || !t.alive) return;
  const v = sellValue(t);
  S.gold += v;
  const p = t.pos;
  particles.emit({ x: p.x, y: 1.3, z: p.z, n: 16, color: 0xffd34d, color2: 0xffffff, speed: 2.6, life: 0.6, size: 0.16, gravity: 3, up: 1.2 });
  popups.spawn(p.x, 1.9, p.z, '+' + v, 'gold');
  removeTower(t);
  recalcBuffs();
  SFX.play('sell');
  refreshGoldChip();
}

function upgradeType(k) {
  if (!S.started || S.over) return;
  const lvl = S.upgrades[k] || 0;
  if (lvl >= 10) { toast('이미 최고 강화 단계예요!'); return; }
  const cost = upgradeCost(k);
  if (S.gold < cost) { toast('골드가 모자라요!'); SFX.play('click'); return; }
  S.gold -= cost;
  S.upgrades[k] = lvl + 1;
  SFX.play('up');
  haptic(10);
  const btn = document.querySelector(`.up[data-k="${k}"]`);
  if (btn) { btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse'); }
  for (const t of towers) if (t.type === k) {
    particles.emit({ x: t.pos.x, y: 1.3, z: t.pos.z, n: 10, color: TOWERS[k].glow, color2: 0xffffff, speed: 2.2, life: 0.55, size: 0.15, gravity: 2.5, up: 1.4 });
    rings.spawn(t.pos.x, 1.12, t.pos.z, { color: TOWERS[k].glow, from: 0.3, to: 2.2, dur: 0.5, opacity: 0.7 });
  }
  refreshGoldChip();
  updateHUD(true);
}

function recalcBuffs() {
  for (const t of towers) t.buff = 1;
  const cheeses = towers.filter((t) => t.type === 'cheese');
  for (const c of cheeses) {
    const r = c.range;
    const amt = TOWERS.cheese.buff * (1 + (c.star - 1) * 0.35) * (1 + (S.upgrades.cheese || 0) * 0.05);
    for (const t of towers) {
      if (t === c) continue;
      const d = Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
      if (d <= r) t.buff = Math.max(t.buff, 1 + amt);
    }
  }
}

/* ── 웨이브 ───────────────────────────────────────────────────────────── */
function waveHp(kind, n) {
  const base = MONSTER_DEF[kind].hp;
  if (kind === 'boss') return Math.round(430 * Math.pow(1.42, Math.max(0, Math.floor(n / 5) - 1)));
  return Math.round(base * Math.pow(1.168, n - 1));
}

function beginWave(n) {
  S.wave = n;
  S.waveQueue = [];
  S.spawnTimer = 0.5;
  S.waveActive = true;
  const bossWave = n % 5 === 0;
  if (bossWave) {
    S.waveQueue.push('boss');
    const adds = Math.min(8, 2 + Math.floor(n / 5));
    for (let i = 0; i < adds; i++) S.waveQueue.push(i % 3 === 2 ? 'runner' : 'small');
  } else {
    const count = Math.min(26, 5 + Math.floor(n * 1.7));
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let kind = 'small';
      if (n >= 6 && r > 0.86) kind = 'tank';
      else if (n >= 3 && r > 0.66) kind = 'runner';
      S.waveQueue.push(kind);
    }
  }
  const bossNames = { 5: '먹보 대장', 10: '급식왕', 15: '야식 괴물', 20: '배고픈 신', 25: '무한 먹보' };
  if (bossWave) {
    banner(`WAVE ${n}`, `👑 ${bossNames[n] || (n / 5 + '대 보스')} 등장!`);
    SFX.play('boss');
    shake.add(0.4);
  } else {
    banner(`WAVE ${n}`, n === 1 ? '분식을 소환해 막아라!' : '');
    SFX.play('wave');
  }
  S.boss = null;
  updateHUD(true);
}

function spawnMonster(kind, waveNum) {
  const hp = waveHp(kind, waveNum);
  const m = new Monster(kind, waveNum, hp, 0);
  monsters.push(m);
  if (kind === 'boss') {
    S.boss = m;
    S.bossTimer = S.bossMax;
    $('bossName').textContent = `👑 ${m.wave >= 20 ? '배고픈 신' : m.wave >= 15 ? '야식 괴물' : m.wave >= 10 ? '급식왕' : '먹보 대장'}`;
    $('boss').classList.remove('hidden');
    rings.spawn(m.mesh.position.x, 0.9, m.mesh.position.z, { color: 0xff5b80, from: 0.6, to: 4.2, dur: 0.85, opacity: 0.45, thin: true });
    particles.emit({ x: m.mesh.position.x, y: 1.2, z: m.mesh.position.z, n: 30, color: 0xff3b6e, color2: 0xffb060, speed: 5, life: 0.9, size: 0.3, gravity: 3, up: 1.6 });
  }
  particles.emit({ x: m.mesh.position.x, y: 0.9, z: m.mesh.position.z, n: 4, color: 0xff8a3a, speed: 1.4, life: 0.35, size: 0.12, gravity: 1 });
  return m;
}

/* =========================================================================
   9. 화면 연출 도우미
   ========================================================================= */
let flashState = { t: 0, dur: 0.2, a: 0 };
function flashScreen(a, dur, color) {
  flashState.a = a; flashState.dur = dur || 0.22; flashState.t = 0;
  flashFx.el.style.background = color || '#ffffff';
}
function haptic(ms) {
  if (IS_MOBILE && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { } }
}

const bannerEl = () => $('banner');
let bannerTimer = 0;
function banner(main, sub) {
  const el = bannerEl();
  $('bannerMain').textContent = main;
  $('bannerSub').textContent = sub || '';
  el.classList.remove('hidden', 'show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.add('hidden'), 1950);
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); el.classList.add('hidden'); }, 2200);
}

function showMergeToast(star, type) {
  const el = $('mergeToast');
  const msg = star >= 5 ? '★★★ 황금 분식 탄생! ★★★' : star >= 4 ? `★${star} 전설의 분식!` : `★${star} ${TOWERS[type].name}!`;
  el.textContent = msg;
  el.style.color = star >= 4 ? '#ffe27a' : '#ffffff';
  el.classList.remove('hidden', 'show');
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => el.classList.add('hidden'), 1150);
}

/* =========================================================================
   10. UI
   ========================================================================= */
function fmtStars(n) { return '★'.repeat(n); }

function buildUpgradeUI() {
  const wrap = $('ups');
  wrap.innerHTML = '';
  TOWER_KEYS.forEach((k) => {
    const d = TOWERS[k];
    const b = document.createElement('button');
    b.className = 'up';
    b.dataset.k = k;
    b.innerHTML = `<span class="uLv">Lv<b>0</b></span><span class="uIco">${d.ico}</span><span class="uName">${d.name.split(' ')[0]}</span><span class="uCost">🪙<b>50</b></span>`;
    b.addEventListener('click', () => upgradeType(k));
    wrap.appendChild(b);
  });
}

const hudCache = {};
function setText(id, v) {
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  const el = $(id);
  if (el) el.textContent = v;
}

function refreshGoldChip() {
  const el = $('cGold');
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

function updateHUD(force) {
  setText('waveNum', String(S.wave));
  setText('monNum', String(monsters.filter((m) => m.alive).length));
  setText('goldNum', fmt(S.gold));
  setText('bestNum', String(S.best));
  setText('sumCost', '🪙 ' + summonCost());
  const alive = monsters.filter((m) => m.alive).length;
  const cMon = $('cMon');
  cMon.classList.toggle('danger', alive >= MAX_ALIVE - 6);
  const bossEl = $('boss');
  if (S.boss && S.boss.alive) {
    bossEl.classList.remove('hidden');
    $('bossFill').style.width = clamp01(S.boss.hp / S.boss.maxHp) * 100 + '%';
    $('bossTimer').innerHTML = Math.max(0, Math.ceil(S.bossTimer)) + '<span>s</span>';
  } else if (!S.over) bossEl.classList.add('hidden');

  const btn = $('btnSummon');
  const cost = summonCost();
  btn.classList.toggle('cant', S.gold < cost);
  btn.classList.toggle('glow', S.gold >= cost * 1.6 && freeCells().length > 0);

  const vig = $('vignette');
  const danger = alive >= MAX_ALIVE - 5 ? (alive - (MAX_ALIVE - 6)) / 6 : 0;
  vig.style.boxShadow = `inset 0 0 ${60 + danger * 90}px rgba(255,40,40,${clamp01(danger) * 0.55})`;

  // 강화 버튼
  for (const k of TOWER_KEYS) {
    const b = document.querySelector(`.up[data-k="${k}"]`);
    if (!b) continue;
    const lvl = S.upgrades[k] || 0;
    const c = upgradeCost(k);
    b.querySelector('.uLv b').textContent = String(lvl);
    b.querySelector('.uCost b').textContent = lvl >= 10 ? 'MAX' : fmt(c);
    b.classList.toggle('can', lvl < 10 && S.gold >= c);
    b.classList.toggle('poor', lvl < 10 && S.gold < c);
    b.classList.toggle('max', lvl >= 10);
  }
  if (S.selected && S.selected.alive) updateSelPanel();
}

function selectTower(t) {
  S.selected = t || null;
  const sel = $('sel');
  if (!t) { sel.classList.add('hidden'); selRing.visible = false; return; }
  sel.classList.remove('hidden');
  updateSelPanel();
  selRing.visible = true;
  selRing.position.set(t.pos.x, 1.14, t.pos.z);
}

function updateSelPanel() {
  const t = S.selected;
  if (!t) return;
  const d = TOWERS[t.type];
  setText('selIco', d.ico);
  setText('selName', d.name);
  setText('selStar', fmtStars(t.star));
  const dps = t.type === 'cheese' ? 0 : t.dmg / t.interval;
  const stats = t.type === 'cheese'
    ? `<span>버프</span><b>+${Math.round((TOWERS.cheese.buff * (1 + (t.star - 1) * 0.35)) * 100)}% 공속</b>` +
      `<span>사거리</span><b>${t.range.toFixed(1)}</b><span>표식</span><b>-${Math.round(TOWERS.cheese.mark.amt * 100)}% 방어</b><span>강화</span><b>Lv ${S.upgrades[t.type] || 0}</b>`
    : `<span>공격력</span><b>${Math.round(t.dmg)}</b>` +
      `<span>DPS</span><b>${Math.round(dps)}</b>` +
      `<span>사거리</span><b>${t.range.toFixed(1)}</b>` +
      `<span>공속</span><b>${(1 / t.interval).toFixed(2)}/s</b>` +
      `<span>특성</span><b>${d.desc}</b><span>강화</span><b>Lv ${S.upgrades[t.type] || 0}</b>`;
  const el = $('selStats');
  if (el.innerHTML !== stats) el.innerHTML = stats;
  setText('sellPrice', '🪙 ' + sellValue(t));
}

/* =========================================================================
   11. 상호작용 (마우스 · 터치)
   ========================================================================= */
const canvas = () => $('gl');
const ptr = { down: false, id: -1, sx: 0, sy: 0, tower: null, dragging: false, moved: false, hover: -1 };

function pickAt(cx, cy) {
  const el = canvas();
  const rect = el.getBoundingClientRect();
  const ndcX = ((cx - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((cy - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  if (towers.length) {
    const hits = raycaster.intersectObjects(towers.map((t) => t.mesh), true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.tower) o = o.parent;
      if (o && o.userData.tower && o.userData.tower.alive) {
        return { cell: o.userData.tower.cell, tower: o.userData.tower };
      }
    }
  }
  const hit = raycaster.ray.intersectPlane(pickPlane, TMP);
  if (!hit) return { cell: -1, tower: null };
  const cell = cellAt(TMP.x, TMP.z);
  return { cell, tower: cell >= 0 ? (S.grid[cell] || null) : null };
}

function bindInput() {
  const el = canvas();
  el.addEventListener('pointerdown', (e) => {
    if (!S.started || S.over) return;
    SFX.init();
    ptr.down = true; ptr.id = e.pointerId;
    ptr.sx = e.clientX; ptr.sy = e.clientY; ptr.moved = false; ptr.dragging = false;
    const res = pickAt(e.clientX, e.clientY);
    ptr.tower = res.tower;
    try { el.setPointerCapture(e.pointerId); } catch (err) { }
    if (ptr.tower) { ptr.hover = ptr.tower.cell; }
  });

  el.addEventListener('pointermove', (e) => {
    if (!S.started || S.over) { hoverRing.visible = false; return; }
    if (e.pointerType === 'mouse' || ptr.down) {
      const res = pickAt(e.clientX, e.clientY);
      ptr.hover = res.cell;
      if (!ptr.down) {
        if (res.cell >= 0 && !S.grid[res.cell]) {
          const c = cellCenter(res.cell);
          hoverRing.position.set(c.x, 1.13, c.z);
          hoverRing.visible = true;
          hoverRing.material.opacity = 0.35 + Math.sin(performance.now() * 0.006) * 0.12;
        } else hoverRing.visible = false;
      }
    }
    if (!ptr.down) return;
    if (Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 9) ptr.moved = true;
    if (ptr.moved && ptr.tower) {
      ptr.dragging = true;
      const res = pickAt(e.clientX, e.clientY);
      const cell = res.cell >= 0 ? res.cell : ptr.tower.cell;
      const c = cellCenter(cell);
      ptr.tower.mesh.position.set(c.x, 1.62, c.z);
      dragRing.visible = true;
      dragRing.position.set(c.x, 1.2, c.z);
      const occupied = S.grid[cell] && S.grid[cell] !== ptr.tower;
      dragRing.material.color.setHex(occupied ? 0xffd34d : 0x8affa0);
      hoverRing.visible = false;
    }
  });

  const endPointer = (e) => {
    if (!ptr.down) return;
    ptr.down = false;
    dragRing.visible = false;
    const t = ptr.tower;
    ptr.tower = null;
    if (!S.started || S.over) return;
    const res = pickAt(e.clientX, e.clientY);
    if (ptr.dragging && t && t.alive) {
      if (res.cell >= 0) {
        const other = S.grid[res.cell];
        if (!other) moveTower(t, res.cell);
        else if (other === t) { t.mesh.position.copy(t.pos); }
        else if (other.type === t.type && other.star === t.star) mergeTowers(t, other);
        else { swapTowers(t, other); toast('같은 분식 · 같은 성급이면 합성돼요!'); }
      } else { t.mesh.position.copy(t.pos); }
      return;
    }
    // 탭
    const tapped = res.tower || t;
    if (tapped) {
      if (S.selected && S.selected !== tapped && S.selected.type === tapped.type && S.selected.star === tapped.star) {
        mergeTowers(S.selected, tapped);
      } else if (S.selected === tapped) {
        selectTower(null);
      } else {
        selectTower(tapped);
        SFX.play('click');
        if (S.selected && !S.hintShown) {
          S.hintShown = true;
          setTimeout(() => toast('같은 분식 · 같은 성급을 한 번 더 탭하거나 드래그하면 합성!'), 260);
        }
      }
    } else {
      selectTower(null);
    }
  };
  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', () => {
    ptr.down = false; dragRing.visible = false;
    if (ptr.tower) ptr.tower.mesh.position.copy(ptr.tower.pos);
    ptr.tower = null;
  });
  el.addEventListener('pointerleave', () => { if (!ptr.down) hoverRing.visible = false; });
}

/* =========================================================================
   12. 게임 시작 · 종료 · 재시작
   ========================================================================= */
function resetGame() {
  for (const t of towers.slice()) removeTower(t);
  for (const m of monsters) { root.remove(m.mesh); m.mat.dispose(); }
  monsters = [];
  for (const p of projectiles) { p.mesh.visible = false; p.mesh.userData.active = false; }
  projectiles = [];
  for (const b of beams) { root.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
  beams.length = 0;
  particles.clear();
  popups.clear();
  S.grid = new Array(CELLS.length).fill(null);
  towers = []; towerById.clear();
  S.gold = 60; S.wave = 1; S.summons = 0; S.maxStar = 1; S.totalKills = 0;
  S.upgrades = { eomuk: 0, tteok: 0, gimmari: 0, mandu: 0, cheese: 0 };
  S.waveQueue = []; S.waveActive = false; S.spawnTimer = 0; S.breakTimer = 0;
  S.boss = null; S.bossTimer = 0; S.over = false; S.paused = false;
  S.slowTimer = 0; S.timeScale = 1; S.selected = null; S.hintShown = false;
  S.elapsed = 0;
  selectTower(null);
  $('boss').classList.add('hidden');
  $('over').classList.add('hidden');
  $('vignette').style.boxShadow = 'inset 0 0 90px rgba(255,40,40,0)';
  updateHUD(true);
  S.started = true;
  S.breakTimer = 1.6;
  $('btnSpeed').textContent = S.speedMul + 'x';
  $('btnSpeed').classList.toggle('on', S.speedMul > 1);
}

function gameOver(reason) {
  if (S.over) return;
  S.over = true;
  S.started = false;
  SFX.play('over');
  shake.add(1);
  flashScreen(0.5, 0.7, '#ff3030');
  S.boss = null;
  $('boss').classList.add('hidden');
  if (S.wave > S.best) {
    S.best = S.wave;
    try { localStorage.setItem(SAVE_KEY, String(S.best)); } catch (e) { }
  }
  $('overEmoji').textContent = reason.boss ? '👑' : '😵';
  $('overTitle').textContent = reason.boss ? '보스에게 가게를 내줬어요…' : '가게 영업 종료!';
  $('overReason').textContent = reason.text;
  $('overWave').textContent = String(S.wave);
  $('overStar').textContent = '★' + S.maxStar;
  $('overBest').textContent = String(S.best);
  $('over').classList.remove('hidden');
  updateHUD(true);
}

/* =========================================================================
   13. 업데이트 루프
   ========================================================================= */
let lastT = 0, rafId = 0;
const camTarget = new THREE.Vector3();
const _barColor = new THREE.Color();
const _camRight = new THREE.Vector3();

function updateGame(dt, raw) {
  raw = raw ?? dt;
  // 웨이브 진행
  if (S.started && !S.over) {
    if (!S.waveActive) {
      S.breakTimer -= dt;
      if (S.breakTimer <= 0) beginWave(S.wave);
    } else {
      if (S.waveQueue.length) {
        S.spawnTimer -= dt;
        if (S.spawnTimer <= 0) {
          const alive = monsters.filter((m) => m.alive).length;
          if (alive >= MAX_ALIVE) {
            gameOver({ text: '트랙 위에 먹보가 35마리나 쌨어요. 트랙이 포화 상태!', boss: false });
          } else {
            const kind = S.waveQueue.shift();
            spawnMonster(kind, S.wave);
            S.spawnTimer = Math.max(0.34, 0.92 - S.wave * 0.022) * (kind === 'boss' ? 1.6 : 1);
            if (S.waveQueue.length === 0) S.spawnTimer = 2.2;
          }
        }
      } else if (monsters.filter((m) => m.alive).length === 0) {
        S.waveActive = false;
        S.breakTimer = 3.2;
        const bonus = 10 + S.wave * 4;
        S.gold += bonus;
        popups.spawn(0, 2.6, 0, `웨이브 클리어 +${bonus}`, 'gold');
        SFX.play('up');
        if (S.wave >= 3) toast(`웨이브 ${S.wave} 클리어! +${bonus}골드 · 같은 분식끼리 합성해 보세요`);
        S.wave++;
        updateHUD(true);
      } else if (S.waveQueue.length === 0) {
        S.breakTimer = 1.6;
      }
    }
    // 트랙 포화 체크
    if (monsters.length > MAX_ALIVE && !S.over) {
      gameOver({ text: '트랙 위에 먹보가 ' + MAX_ALIVE + '마리를 넘었어요. 트랙이 포화 상태!', boss: false });
    }
    // 보스 제한시간
    if (S.boss) {
      if (S.boss.alive) {
        S.bossTimer -= dt;
        if (S.bossTimer <= 0) gameOver({ text: '보스를 제한 시간 안에 처치하지 못했어요!', boss: true });
      } else S.boss = null;
    }
  }

  for (const m of monsters) m.update(dt);
  for (const t of towers) t.update(dt);
  updateProjectiles(dt);
  updateBeams(dt);

  // 죽은 몬스터 정리
  let dead = false;
  for (let i = monsters.length - 1; i >= 0; i--) if (!monsters[i].alive) { monsters.splice(i, 1); dead = true; }
  if (dead) updateHUD(true);

  updateBars();
  particles.update(raw);
  rings.update(raw);
  pillars.update(raw);
  shake.update(raw);

  // 화면 플래시
  if (flashState.t < flashState.dur) {
    flashState.t += raw;
    flashFx.el.style.opacity = String(clamp01(flashState.a * (1 - flashState.t / flashState.dur)));
  } else if (flashFx.el.style.opacity !== '0') flashFx.el.style.opacity = '0';

  // 카메라
  S.cameraZoom = lerp(S.cameraZoom, S.cameraZoomTarget, 1 - Math.exp(-dt * 6));
  S.cameraZoomTarget = lerp(S.cameraZoomTarget, 1, 1 - Math.exp(-dt * 2.4));
  const dist = (camera.userData.dist || 18) / S.cameraZoom;
  const el2 = camera.userData.el || 0.92;
  const tg = camera.userData.target || camTarget.set(0, 0.55, -0.35);
  const swayX = Math.sin(S.elapsed * 0.25) * 0.2;
  camera.position.set(swayX, Math.sin(el2) * dist + tg.y * 0.4, Math.cos(el2) * dist);
  shake.offset(camera.position);
  camTarget.set(tg.x + shake.trauma * 0.5, tg.y, tg.z);
  camera.lookAt(camTarget);

  if (ambientBokeh) ambientBokeh.rotation.y += dt * 0.012;

  // 불판 김
  if (S.started && !S.over && Math.random() < dt * 8) {
    particles.emit({
      x: rnd(-1.6, 1.6), y: 1.15, z: rnd(-1.6, 1.6), n: 1,
      color: 0xffe0b0, color2: 0xffb070, speed: 0.25, life: rnd(1.0, 1.8),
      size: 0.2, gravity: -0.35, up: 0.55, drag: 0.9,
    });
  }

  S.elapsed += dt;
}

function updateBars() {
  const n = Math.min(monsters.length, barBg.instanceMatrix.count);
  barBg.count = n; barFill.count = n;
  if (!n) return;
  const camQ = camera.quaternion;
  for (let i = 0; i < n; i++) {
    const m = monsters[i];
    const p = m.mesh.position;
    const w = 1.02 * m.scale + (m.kind === 'boss' ? 0.55 : 0);
    const h = m.kind === 'boss' ? 0.14 : 0.105;
    const y = p.y + m.scale * (m.kind === 'boss' ? 1.5 : 1.28);
    _m4.compose(_v1.set(p.x, y, p.z), camQ, _sc.set(w + 0.06, h + 0.05, 1));
    barBg.setMatrixAt(i, _m4);
    const frac = clamp01(m.hp / m.maxHp);
    const fw = Math.max(0.001, w * frac);
    _camRight.set(1, 0, 0).applyQuaternion(camQ).multiplyScalar(-(w - fw) / 2);
    _m4.compose(_v1.set(p.x + _camRight.x, y, p.z + _camRight.z), camQ, _sc.set(fw, h * 0.68, 1));
    barFill.setMatrixAt(i, _m4);
    if (frac > 0.5) _barColor.setHex(m.kind === 'boss' ? 0xff5b80 : 0x6ce07f);
    else if (frac > 0.25) _barColor.setHex(0xffd34d);
    else _barColor.setHex(0xff5a4a);
    barFill.setColorAt(i, _barColor);
  }
  barBg.instanceMatrix.needsUpdate = true;
  barFill.instanceMatrix.needsUpdate = true;
  if (barFill.instanceColor) barFill.instanceColor.needsUpdate = true;
}

function render() {
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  const raw = Math.min(0.075, Math.max(0.0005, (now - lastT) / 1000));
  lastT = now;
  if (S.slowTimer > 0) { S.slowTimer -= raw; S.timeScale = lerp(S.timeScale, 0.3, 0.3); }
  else S.timeScale = lerp(S.timeScale, 1, 0.14);
  const active = S.started && !S.over;
  const dt = raw * S.timeScale * (active ? S.speedMul : 1);
  updateGame(dt, raw);
  updateHUD();
  render();
  S.frames++;
}

/* =========================================================================
   14. 부트스트랩
   ========================================================================= */
function fitIntroOverlay() {
  $('introBest').textContent = String(S.best);
  $('bestNum').textContent = String(S.best);
}

function boot() {
  try { S.best = parseInt(localStorage.getItem(SAVE_KEY) || '0', 10) || 0; } catch (e) { S.best = 0; }
  let snd = '1';
  try { snd = localStorage.getItem(SOUND_KEY) ?? '1'; } catch (e) { }
  S.muted = snd === '0';
  SFX.muted = S.muted;

  initScene();
  buildUpgradeUI();
  bindInput();
  fitIntroOverlay();
  setMuted(S.muted);

  // 기존 UI 버튼
  $('btnSummon').addEventListener('click', () => { SFX.init(); summon(); });
  $('btnSpeed').addEventListener('click', () => {
    S.speedMul = S.speedMul === 1 ? 2 : 1;
    $('btnSpeed').textContent = S.speedMul + 'x';
    $('btnSpeed').classList.toggle('on', S.speedMul > 1);
    SFX.play('click');
  });
  $('btnSound').addEventListener('click', () => setMuted(!S.muted));
  $('btnFull').addEventListener('click', toggleFullscreen);
  $('btnStart').addEventListener('click', startGame);
  $('btnAgain').addEventListener('click', () => { SFX.play('click'); resetGame(); });
  $('btnRestart') && $('btnRestart').addEventListener('click', () => resetGame());
  $('selClose').addEventListener('click', () => selectTower(null));
  $('btnSell').addEventListener('click', () => { if (S.selected) sellTower(S.selected); });
  $('btnMergeHint').addEventListener('click', () => toast('같은 종류 · 같은 성급을 끌어다 놓거나 두 번 탭하세요!'));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && SFX.ctx) { try { SFX.ctx.suspend(); } catch (e) { } }
    else if (!document.hidden && SFX.ctx && !S.muted) { try { SFX.ctx.resume(); } catch (e) { } }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); if (S.started) summon(); }
    if (e.code === 'KeyF') toggleFullscreen();
    if (e.code === 'KeyM') setMuted(!S.muted);
    if (e.code === 'KeyP' || e.code === 'Escape') selectTower(null);
    if (e.code === 'Digit2') { S.speedMul = 2; $('btnSpeed').textContent = '2x'; $('btnSpeed').classList.add('on'); }
    if (e.code === 'Digit1') { S.speedMul = 1; $('btnSpeed').textContent = '1x'; $('btnSpeed').classList.remove('on'); }
  });

  // 첫 프레임 렌더 후 로딩 제거
  lastT = performance.now();
  rafId = requestAnimationFrame(loop);
  hideLoadingAfter(3);
}

function hideLoadingAfter(frames) {
  let n = 0;
  const tick = () => {
    n++;
    if (n >= frames) {
      const ld = $('loading');
      ld.style.pointerEvents = 'none';
      ld.style.transition = 'opacity .4s';
      ld.style.opacity = '0';
      setTimeout(() => ld.classList.add('hidden'), 420);
      S.ready = true;
      fitIntroOverlay();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const ld0 = $('loading');
  if (ld0) ld0.addEventListener('pointerdown', () => { ld0.style.pointerEvents = 'none'; ld0.style.opacity = '0'; setTimeout(() => ld0.classList.add('hidden'), 300); S.ready = true; });
  setTimeout(() => { if (!S.ready) { const ld = $('loading'); ld.style.pointerEvents = 'none'; ld.style.opacity = '0'; setTimeout(() => ld.classList.add('hidden'), 400); S.ready = true; } }, 6000);
}

function startGame() {
  SFX.init();
  $('intro').classList.add('hidden');
  resetGame();
  setTimeout(() => {
    if (S.over) return;
    toast('💡 빈 칸에 분식을 소환하고, 같은 분식 두 개를 합성하세요!');
  }, 1200);
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || (() => { })).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || (() => { })).call(document);
  }
  SFX.play('click');
}

// 디버그 · 테스트 훅
window.__BMD_BUILD = 'v4';
window.__BMD = {
  get S() { return S; },
  get scene() { return scene; },
  get camera() { return camera; },
  get renderer() { return renderer; },
  get composer() { return composer; },
  get rings() { return rings; },
  get monsters() { return monsters; },
  get towers() { return towers; },
  get particles() { return particles; },
  start: () => startGame(),
  summon: () => summon(),
  merge: (a, b) => mergeTowers(towerById.get(a) || towers[a], towerById.get(b) || towers[b]),
  cellCenter: (i) => cellCenter(i),
  api: {
    addGold(n) { S.gold += n; updateHUD(true); },
    setGold(n) { S.gold = n; updateHUD(true); },
    place(cell, type, star) {
      if (S.grid[cell]) removeTower(S.grid[cell]);
      const t = new Tower(cell, type, star || 1);
      S.grid[cell] = t; towers.push(t); towerById.set(t.id, t); recalcBuffs();
      return t.id;
    },
    towerIds() { return towers.map((t) => t.id); },
    starOf(id) { const t = towerById.get(id); return t ? t.star : 0; },
    typeOf(id) { const t = towerById.get(id); return t ? t.type : null; },
    spawn(kind, n) { for (let i = 0; i < (n || 1); i++) spawnMonster(kind || 'small', S.wave); },
    flood(n) { for (let i = 0; i < (n || 40); i++) spawnMonster(i % 4 === 3 ? 'tank' : 'small', S.wave); },
    wave(n) { beginWave(n); },
    tick(sec, dt) {
      const step = dt || 1 / 30;
      const n = Math.min(6000, Math.ceil(sec / step));
      for (let i = 0; i < n; i++) updateGame(step, step);
      updateHUD(true);
      return { wave: S.wave, monsters: monsters.filter((m) => m.alive).length, over: S.over };
    },
    clearWave() { monsters.forEach((m) => { m.alive = false; root.remove(m.mesh); }); monsters.length = 0; S.waveQueue.length = 0; S.waveActive = false; S.breakTimer = 2; updateHUD(true); },
    over(reason) { gameOver({ text: reason || '테스트 종료', boss: false }); },
    state() {
      return {
        started: S.started, over: S.over, wave: S.wave, gold: S.gold, summons: S.summons,
        towers: towers.length, monsters: monsters.filter((m) => m.alive).length,
        selected: S.selected ? S.selected.id : null, maxStar: S.maxStar,
        boss: !!S.boss, bossTimer: Math.round(S.bossTimer), fps: S.fps,
        speedMul: S.speedMul, muted: S.muted,
        ups: { ...S.upgrades },
      };
    },
    cellScreen(cell) {
      const c = cellCenter(cell);
      _v1.set(c.x, 1.2, c.z).project(camera);
      return {
        x: (_v1.x * 0.5 + 0.5) * window.innerWidth,
        y: (-_v1.y * 0.5 + 0.5) * window.innerHeight,
      };
    },
  },
};

document.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  const ld = $('loading');
  ld.classList.remove('hidden');
  ld.style.opacity = '1';
  ld.style.pointerEvents = 'auto';
  ld.querySelector('.ldText').textContent = '그래픽을 다시 불러오는 중…';
  setTimeout(() => location.reload(), 900);
}, false);

window.addEventListener('error', (e) => {
  if (!S.ready) {
    $('loading').classList.add('hidden');
    $('err').classList.remove('hidden');
  }
});

boot();
