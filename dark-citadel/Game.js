/* 어둠의 성채 — 1단계 (전사 · 1층 지하 묘지) */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const IS_TOUCH = params.get('touch') === '1' || (params.get('touch') !== '0' && matchMedia('(pointer: coarse)').matches);
document.body.classList.toggle('touch', IS_TOUCH);

const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

const TILE = 2, MW = 60, MH = 60, WALL_H = 2.6;

/* ================= 사운드 (코드로 합성) ================= */
const Sfx = {
  ctx: null, master: null, on: true, nbuf: null, whirl: null, last: {},
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = .5; this.master.connect(c.destination);
    this.nbuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 던전 배경음 (낮은 웅웅거림 + 바람)
    const g = c.createGain(); g.gain.value = .05; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
    lp.connect(g); g.connect(this.master);
    [55, 55.6, 82.4].forEach(f => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); });
    const n = c.createBufferSource(); n.buffer = this.nbuf; n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 350;
    const ng = c.createGain(); ng.gain.value = .045; n.connect(bp); bp.connect(ng); ng.connect(this.master); n.start();
  },
  gate(k, ms) { const now = performance.now(); if (this.last[k] && now - this.last[k] < ms) return false; this.last[k] = now; return true; },
  noise(dur, f0, f1, q, vol, type = 'bandpass', delay = 0) {
    if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.nbuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * .5); s.stop(t + dur + .05);
  },
  tone(f0, f1, dur, type, vol, delay = 0) {
    if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .05);
  },
  swing() { this.noise(.16, 700, 2600, 1.4, .3); },
  hit(crit) { if (!this.gate('hit', 45)) return; this.tone(170, 45, .14, 'sine', .55); this.noise(.07, 2500, 600, .9, .3); if (crit) this.tone(1100, 1600, .09, 'square', .06); },
  bone() { if (!this.gate('die', 60)) return; this.noise(.28, 3200, 900, 2, .3); this.tone(320, 110, .12, 'triangle', .2); },
  squish() { if (!this.gate('die', 60)) return; this.noise(.32, 700, 140, 1, .4); },
  hurt() { if (!this.gate('hurt', 120)) return; this.tone(220, 90, .18, 'sawtooth', .16); this.noise(.12, 1200, 300, 1, .22); },
  slam() { this.tone(95, 28, .7, 'sine', .9); this.noise(.55, 900, 60, .7, .6, 'lowpass'); },
  cry() { [196, 247, 294, 392].forEach((f, i) => this.tone(f * .92, f * 1.06, 1, 'sawtooth', .07, i * .04)); this.noise(.7, 300, 1600, .5, .15); },
  spike() { if (!this.gate('spike', 50)) return; this.noise(.2, 600, 120, 1, .35, 'lowpass'); this.tone(130, 55, .16, 'square', .06); },
  potion() { this.tone(500, 900, .25, 'sine', .22); this.tone(750, 1300, .25, 'sine', .14, .08); },
  orb() { this.tone(660, 1000, .22, 'sine', .18); },
  rise() { this.noise(.9, 200, 900, .8, .25, 'lowpass'); },
  warn() { this.tone(110, 70, .7, 'sawtooth', .12); },
  portal() { [262, 330, 392, 523].forEach((f, i) => this.tone(f, f * 1.01, 1.4, 'triangle', .12, i * .13)); },
  whirlStart() {
    if (!this.ctx || !this.on) return; const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.nbuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.value = 900;
    const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 600; lfo.connect(lg); lg.connect(f.frequency);
    const g = c.createGain(); g.gain.value = .28; s.connect(f); f.connect(g); g.connect(this.master); s.start(); lfo.start();
    this.whirl = { s, lfo, g };
  },
  whirlStop() { if (!this.whirl) return; const w = this.whirl, t = this.ctx.currentTime; w.g.gain.setTargetAtTime(0, t, .05); w.s.stop(t + .3); w.lfo.stop(t + .3); this.whirl = null; },
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? .5 : 0; }
};

/* ================= 아이콘 ================= */
const ICON = {
  attack: '<svg viewBox="0 0 48 48"><path d="M36 6 L42 6 L42 12 L20 34 L14 28 Z" fill="#dfe6ee" stroke="#3a4048" stroke-width="1.5"/><path d="M10 26 L22 38" stroke="#c9a040" stroke-width="4" stroke-linecap="round"/><path d="M15 33 L7 41" stroke="#5a3a20" stroke-width="4.5" stroke-linecap="round"/></svg>',
  whirl: '<svg viewBox="0 0 48 48"><path d="M24 24 m0 -3 a3 3 0 1 1 -3 3 a6 6 0 0 1 6 -6 a9 9 0 0 1 9 9 a12 12 0 0 1 -12 12 a15 15 0 0 1 -15 -15 a18 18 0 0 1 18 -18" fill="none" stroke="#ffcf6e" stroke-width="3.4" stroke-linecap="round"/><path d="M40 8 L44 4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  leap: '<svg viewBox="0 0 48 48"><path d="M24 4 L24 28 M15 20 L24 30 L33 20" stroke="#ffd27a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 41 Q24 33 42 41" stroke="#e07020" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M10 35 L5 31 M38 35 L43 31 M24 37 L24 45" stroke="#ffb050" stroke-width="2.5" stroke-linecap="round"/></svg>',
  cry: '<svg viewBox="0 0 48 48"><path d="M7 32 Q9 18 26 14 L30 24 Q18 26 13 36 Z" fill="#e8b860" stroke="#5a3a10" stroke-width="1.5"/><path d="M33 12 Q38 19 34 27 M37 8 Q45 19 38 31 M41 5 Q51 19 42 35" stroke="#ffd27a" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>',
  fissure: '<svg viewBox="0 0 48 48"><path d="M4 42 L10 26 L15 42 Z M14 42 L20 17 L27 42 Z M26 42 L33 8 L40 42 Z" fill="#9a8a78" stroke="#2a1a10" stroke-width="1.2"/><path d="M2 43 L46 43" stroke="#ff7a20" stroke-width="3" stroke-linecap="round"/><path d="M12 41 L19 30 M24 41 L31 21" stroke="#ffb040" stroke-width="1.6"/></svg>',
  potion: '<svg viewBox="0 0 48 48"><path d="M19 6 h10 v8 q10 5 10 16 a15 15 0 0 1 -30 0 q0 -11 10 -16 z" fill="#3a1010" stroke="#c9a040" stroke-width="2"/><path d="M11 30 a13 13 0 0 0 26 0 q0 -3 -1 -5 h-24 q-1 2 -1 5z" fill="#e0221a"/><ellipse cx="18" cy="28" rx="3" ry="5" fill="rgba(255,255,255,.35)"/></svg>',
  mage: '<svg viewBox="0 0 48 48"><path d="M12 44 L30 14" stroke="#8a5a2a" stroke-width="4" stroke-linecap="round"/><circle cx="33" cy="10" r="7" fill="#4aa0ff"/><circle cx="31" cy="8" r="2.5" fill="#d8ecff"/></svg>',
  archer: '<svg viewBox="0 0 48 48"><path d="M14 4 Q42 24 14 44" fill="none" stroke="#8a5a2a" stroke-width="3.5"/><path d="M14 4 L14 44" stroke="#ccc" stroke-width="1"/><path d="M6 24 L42 24 M36 19 L42 24 L36 29" stroke="#ddd" stroke-width="2.5" fill="none"/></svg>',
  paladin: '<svg viewBox="0 0 48 48"><path d="M12 42 L28 18" stroke="#8a5a2a" stroke-width="4" stroke-linecap="round"/><rect x="20" y="5" width="20" height="13" rx="2" transform="rotate(34 30 11)" fill="#e8d080" stroke="#7a5a10"/></svg>',
  necro: '<svg viewBox="0 0 48 48"><circle cx="24" cy="20" r="13" fill="#ddd"/><rect x="17" y="28" width="14" height="11" rx="2" fill="#ddd"/><circle cx="19" cy="20" r="3.6" fill="#2a8a3a"/><circle cx="29" cy="20" r="3.6" fill="#2a8a3a"/><path d="M20 35 v4 M24 35 v4 M28 35 v4" stroke="#555" stroke-width="1.5"/></svg>'
};

const SKILLS = [
  { id: 'whirl', name: '휠윈드', icon: 'whirl', cost: 25, cd: 6, desc: '2.4초간 회전하며 주변 적을 계속 벱니다. 회전 중에도 이동할 수 있습니다.' },
  { id: 'leap', name: '도약 강타', icon: 'leap', cost: 15, cd: 4, desc: '목표 지점으로 도약해 내려찍습니다. 착지 지점의 적에게 큰 피해를 주고 밀쳐냅니다.' },
  { id: 'cry', name: '전투의 함성', icon: 'cry', cost: 10, cd: 14, desc: '8초간 공격력 30% 증가, 받는 피해 40% 감소. 주변 적을 1.5초간 기절시킵니다.' },
  { id: 'fissure', name: '대지 가르기', icon: 'fissure', cost: 20, cd: 5, desc: '앞쪽으로 땅을 갈라 바위 가시를 솟구치게 합니다. 일직선의 모든 적에게 피해를 줍니다.' }
];

/* ================= 그래픽 품질 ================= */
const QUALITY = {
  high: { pr: Math.min(devicePixelRatio, 2), shadow: 2048, bloom: true, torches: 6, aa: true },
  mid: { pr: Math.min(devicePixelRatio, 1.5), shadow: 1024, bloom: true, torches: 4, aa: true },
  low: { pr: 1, shadow: 0, bloom: false, torches: 3, aa: false }
};
let quality = IS_TOUCH ? 'mid' : 'high';

/* ================= 전역 상태 ================= */
let renderer, composer, renderPass, bloomPass, camera, scene, clock;
let G, rooms, startRoom, exitRoom, flow = new Int16Array(MW * MH), explored = new Uint8Array(MW * MH);
let enemies = [], globes = [], fxList = [], timers = [], torches = [], torchLights = [];
let state = 'title', time = 0, hitstop = 0, shake = 0, zoom = 1, kills = 0, startTime = 0;
let parts, debris, playerLight, moonLight, portal = null, elite = null;
const fadeU = { uPlayer: { value: new THREE.Vector3() } };
const P = {};
const keys = {};
let mouseX = innerWidth / 2, mouseY = innerHeight / 2, mouseDown = false, hasMouse = false, hovered = null;
const mouseG = new THREE.Vector3();
const joy = { id: null, x: 0, y: 0, ox: 0, oy: 0 };

/* ================= 텍스처 (절차 생성) ================= */
function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function noiseFill(g, s, amt) {
  const id = g.getImageData(0, 0, s, s), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
}
let TEX = null;
function makeTextures() {
  if (TEX) return TEX;
  const floor = canvasTex(256, (g, s) => {
    g.fillStyle = '#100c0a'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const t = rand(38, 62);
      g.fillStyle = `rgb(${t + 8},${t + 3},${t - 3})`;
      g.fillRect(x * 128 + 4, y * 128 + 4, 120, 120);
      const gr = g.createRadialGradient(x * 128 + rand(20, 108), y * 128 + rand(20, 108), 4, x * 128 + 64, y * 128 + 64, 90);
      gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x * 128 + 4, y * 128 + 4, 120, 120);
    }
    g.strokeStyle = 'rgba(8,6,5,.8)'; g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) { g.beginPath(); let px = rand(0, s), py = rand(0, s); g.moveTo(px, py); for (let j = 0; j < 5; j++) { px += rand(-25, 25); py += rand(-25, 25); g.lineTo(px, py); } g.stroke(); }
    noiseFill(g, s, 26);
  });
  const brick = canvasTex(256, (g, s) => {
    g.fillStyle = '#0e0b0a'; g.fillRect(0, 0, s, s);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
      const t = rand(40, 66), x = c * 64 + (r % 2) * 32;
      g.fillStyle = `rgb(${t + 10},${t + 2},${t - 4})`; g.fillRect(x + 3, r * 32 + 3, 58, 26);
    }
    const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    noiseFill(g, s, 30);
  });
  const crack = canvasTex(256, (g, s) => {
    g.clearRect(0, 0, s, s); g.translate(s / 2, s / 2);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 120); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(.35, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 120, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.95)'; g.lineCap = 'round';
    for (let k = 0; k < 11; k++) {
      let a = k / 11 * Math.PI * 2 + rand(-.2, .2), r = 10, x = 0, y = 0; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 0);
      while (r < 122) { r += rand(12, 22); a += rand(-.35, .35); x = Math.cos(a) * r; y = Math.sin(a) * r; g.lineTo(x, y); g.lineWidth *= .85; }
      g.stroke();
    }
  }, false);
  const glow = canvasTex(128, (g, s) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }, false);
  TEX = { floor, brick, crack, glow };
  return TEX;
}

/* 벽/기둥이 캐릭터를 가리면 디더링으로 비워주는 셰이더 */
function addFade(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uPlayer = fadeU.uPlayer;
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 cwp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        cwp = instanceMatrix * cwp;
      #endif
      vWPos = (modelMatrix * cwp).xyz;`);
    sh.fragmentShader = 'uniform vec3 uPlayer;\nvarying vec3 vWPos;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        float dz = vWPos.z - uPlayer.z; float dx = abs(vWPos.x - uPlayer.x);
        float f = smoothstep(-0.6, 1.2, dz) * (1.0 - smoothstep(2.6, 5.0, dx)) * (1.0 - smoothstep(6.5, 9.5, dz)) * smoothstep(0.5, 1.1, vWPos.y);
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (n < f * 0.9) discard;
      }`);
  };
  mat.customProgramCacheKey = () => 'fade';
  return mat;
}

/* ================= 파티클 시스템 ================= */
class Particles {
  constructor(max) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.sz = new Float32Array(max); this.al = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.ml = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.c0 = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSz = new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAl = new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('pcolor', this.aCol); geo.setAttribute('psize', this.aSz); geo.setAttribute('palpha', this.aAl);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vC * a * vA, a * vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 10;
  }
  emit(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0, drag = 0, size1 = -1) {
    if (this.n >= this.max) return; const i = this.n++, i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z; this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b; this.life[i] = this.ml[i] = life;
    this.grav[i] = grav; this.drag[i] = drag; this.s0[i] = size; this.s1[i] = size1 < 0 ? size * .2 : size1; this.al[i] = 0; this.sz[i] = size;
  }
  copy(d, s) {
    const d3 = d * 3, s3 = s * 3;
    for (let k = 0; k < 3; k++) { this.pos[d3 + k] = this.pos[s3 + k]; this.vel[d3 + k] = this.vel[s3 + k]; this.c0[d3 + k] = this.c0[s3 + k]; }
    this.life[d] = this.life[s]; this.ml[d] = this.ml[s]; this.grav[d] = this.grav[s]; this.drag[d] = this.drag[s]; this.s0[d] = this.s0[s]; this.s1[d] = this.s1[s];
  }
  update(dt) {
    for (let i = 0; i < this.n;) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.n--; if (i !== this.n) this.copy(i, this.n); continue; }
      const i3 = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 2] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = 1 - this.life[i] / this.ml[i];
      this.sz[i] = lerp(this.s0[i], this.s1[i], t);
      this.al[i] = t < .12 ? t / .12 : 1 - (t - .12) / .88;
      this.col[i3] = this.c0[i3]; this.col[i3 + 1] = this.c0[i3 + 1]; this.col[i3 + 2] = this.c0[i3 + 2];
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSz.needsUpdate = this.aAl.needsUpdate = true;
  }
  burst(x, y, z, n, speed, col, size, life, grav = 6, spread = 1) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2), u = rand(-1, 1) * spread, s = rand(.3, 1) * speed, h = Math.sqrt(1 - u * u);
      this.emit(x, y, z, Math.cos(a) * h * s, Math.abs(u) * s + rand(0, speed * .4), Math.sin(a) * h * s, col[0], col[1], col[2], size * rand(.6, 1.2), life * rand(.6, 1.2), grav, 1.5);
    }
  }
}

/* 파편 (뼛조각·돌조각) */
class Debris {
  constructor(max) {
    this.max = max; this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.13, 0), new THREE.MeshStandardMaterial({ roughness: .8 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    this.mesh.setColorAt(0, new THREE.Color()); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
  }
  spawn(x, y, z, vx, vy, vz, color, scale = 1, life = 2) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), r: new THREE.Vector3(rand(0, 6), rand(0, 6), rand(0, 6)), rv: new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12)), color, scale: scale * rand(.6, 1.3), life, ml: life });
  }
  burst(x, y, z, n, speed, color, scale = 1, life = 2) {
    for (let k = 0; k < n; k++) { const a = rand(0, 6.28); this.spawn(x, y, z, Math.cos(a) * rand(1, speed), rand(speed * .5, speed * 1.3), Math.sin(a) * rand(1, speed), color, scale, life * rand(.7, 1.2)); }
  }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) { const d = this.list[i]; d.life -= dt; if (d.life <= 0) this.list.splice(i, 1); }
    for (const d of this.list) {
      d.v.y -= 20 * dt; d.p.addScaledVector(d.v, dt);
      const fl = .08 * d.scale;
      if (d.p.y < fl) { d.p.y = fl; d.v.y *= -.32; d.v.x *= .55; d.v.z *= .55; d.rv.multiplyScalar(.5); }
      d.r.addScaledVector(d.rv, dt);
      const sc = d.scale * Math.min(1, d.life / .4);
      this.m.compose(d.p, this.q.setFromEuler(this.e.set(d.r.x, d.r.y, d.r.z)), this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(n, this.m); this.mesh.setColorAt(n, this.c.setHex(d.color)); n++;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/* ================= 던전 생성 ================= */
const walk = (i, j) => i >= 0 && j >= 0 && i < MW && j < MH && G[j * MW + i] === 1;
const walkW = (x, z) => walk(Math.floor(x / TILE), Math.floor(z / TILE));
const wx = i => i * TILE + TILE / 2;
function blockedAt(x, z, r) { return !walkW(x - r, z - r) || !walkW(x + r, z - r) || !walkW(x - r, z + r) || !walkW(x + r, z + r); }
function moveCol(p, dx, dz, r) { if (!blockedAt(p.x + dx, p.z, r)) p.x += dx; if (!blockedAt(p.x, p.z + dz, r)) p.z += dz; }

function bfs(g, sx, sy, dist) {
  dist.fill(-1); const q = new Int32Array(MW * MH); let h = 0, t = 0; const s = sy * MW + sx;
  if (sx < 0 || sy < 0 || sx >= MW || sy >= MH || g[s] !== 1) return dist;
  dist[s] = 0; q[t++] = s;
  while (h < t) {
    const c = q[h++], cx = c % MW, cy = (c / MW) | 0, nd = dist[c] + 1;
    if (cx > 0 && g[c - 1] === 1 && dist[c - 1] < 0) { dist[c - 1] = nd; q[t++] = c - 1; }
    if (cx < MW - 1 && g[c + 1] === 1 && dist[c + 1] < 0) { dist[c + 1] = nd; q[t++] = c + 1; }
    if (cy > 0 && g[c - MW] === 1 && dist[c - MW] < 0) { dist[c - MW] = nd; q[t++] = c - MW; }
    if (cy < MH - 1 && g[c + MW] === 1 && dist[c + MW] < 0) { dist[c + MW] = nd; q[t++] = c + MW; }
  }
  return dist;
}

function genDungeon() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const g = new Uint8Array(MW * MH), rs = [];
    for (let t = 0; t < 500 && rs.length < 11; t++) {
      const w = irand(6, 10), h = irand(6, 9), x = irand(2, MW - w - 3), y = irand(2, MH - h - 3);
      if (rs.some(r => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
      rs.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    }
    if (rs.length < 8) continue;
    for (const r of rs) for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) g[j * MW + i] = 1;
    const carve = (i, j) => { if (i > 0 && j > 0 && i < MW - 1 && j < MH - 1) g[j * MW + i] = 1; };
    const corridor = (a, b) => {
      let x = a.cx, y = a.cy;
      const hx = () => { while (x !== b.cx) { carve(x, y); carve(x, y + 1); x += Math.sign(b.cx - x); } carve(x, y); carve(x, y + 1); };
      const vy = () => { while (y !== b.cy) { carve(x, y); carve(x + 1, y); y += Math.sign(b.cy - y); } carve(x, y); carve(x + 1, y); };
      if (Math.random() < .5) { hx(); vy(); } else { vy(); hx(); }
      carve(x + 1, y + 1);
    };
    const conn = [rs[0]], rest = rs.slice(1);
    while (rest.length) {
      let best = null, bd = 1e9;
      for (const a of conn) for (const b of rest) { const d = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy); if (d < bd) { bd = d; best = [a, b]; } }
      corridor(best[0], best[1]); conn.push(best[1]); rest.splice(rest.indexOf(best[1]), 1);
    }
    for (let k = 0; k < 2; k++) { const a = rs[irand(0, rs.length - 1)], b = rs[irand(0, rs.length - 1)]; if (a !== b) corridor(a, b); }
    const dist = bfs(g, rs[0].cx, rs[0].cy, new Int16Array(MW * MH));
    let ex = null, ed = -1; for (const r of rs) { const d = dist[r.cy * MW + r.cx]; if (d > ed) { ed = d; ex = r; } }
    return { g, rooms: rs, start: rs[0], exit: ex };
  }
}

/* 정적 소품을 재질별로 합쳐 드로우콜을 줄임 */
const statics = new Map();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function addStatic(geo, mat, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _m4.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  const g = geo.index ? geo.clone() : geo.clone(); g.applyMatrix4(_m4);
  if (!statics.has(mat)) statics.set(mat, []); statics.get(mat).push(g);
}
function flushStatics() {
  for (const [mat, list] of statics) {
    const g = mergeGeometries(list.map(x => x.index ? x : x), false); list.forEach(x => x.dispose());
    if (!g) continue;
    const m = new THREE.Mesh(g, mat); m.castShadow = mat.userData.cast !== false; m.receiveShadow = mat.userData.recv !== false; m.frustumCulled = false;
    scene.add(m);
  }
  statics.clear();
}

/* ================= 레벨 구성 ================= */
const MAT = {};
function makeMaterials() {
  const T = makeTextures();
  MAT.floor = new THREE.MeshStandardMaterial({ map: T.floor, bumpMap: T.floor, bumpScale: 2.5, roughness: .88, metalness: 0 });
  MAT.wall = addFade(new THREE.MeshStandardMaterial({ map: T.brick, bumpMap: T.brick, bumpScale: 3, roughness: .92 }));
  MAT.stone = addFade(new THREE.MeshStandardMaterial({ color: 0x8a8070, map: T.floor, bumpMap: T.floor, bumpScale: 1.5, roughness: .85 }));
  MAT.cap = addFade(new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: .7, metalness: .3 }));
  MAT.iron = new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: .8, roughness: .45 });
  MAT.wood = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: .9 });
  MAT.bone = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: .6 });
  MAT.wax = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: .5, emissive: 0x2a1a08 });
  MAT.flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 2.6, .6) }); MAT.flame.userData.cast = false; MAT.flame.userData.recv = false;
  MAT.cloth = new THREE.MeshStandardMaterial({ color: 0x5a0e0c, roughness: .95, side: THREE.DoubleSide });
  MAT.gold = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 1, roughness: .35 });
  MAT.blood = new THREE.MeshStandardMaterial({ color: 0x2a0503, roughness: .3, transparent: true, opacity: .7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  MAT.blood.userData.cast = false;
  MAT.rock = new THREE.MeshStandardMaterial({ color: 0x7a6e60, roughness: .85, emissive: 0x2a0c02, emissiveIntensity: 1, flatShading: true });
}
const GEO = {};
function makeGeos() {
  GEO.box = new THREE.BoxGeometry(1, 1, 1);
  GEO.cyl = new THREE.CylinderGeometry(.5, .5, 1, 12);
  GEO.cyl6 = new THREE.CylinderGeometry(.5, .5, 1, 6);
  GEO.sph = new THREE.SphereGeometry(.5, 14, 10);
  GEO.cone = new THREE.ConeGeometry(.5, 1, 8);
  GEO.circle = new THREE.CircleGeometry(.5, 20).rotateX(-Math.PI / 2);
  GEO.ring = new THREE.RingGeometry(.86, 1, 64).rotateX(-Math.PI / 2);
  GEO.plane = new THREE.PlaneGeometry(1, 1);
  GEO.spike = new THREE.ConeGeometry(.42, 2, 5);
  GEO.globe = new THREE.SphereGeometry(.22, 16, 12);
}

function buildLevel() {
  const D = genDungeon(); G = D.g; rooms = D.rooms; startRoom = D.start; exitRoom = D.exit;
  explored.fill(0);
  const reserved = new Set();
  const portalTile = [exitRoom.cx, exitRoom.y + 1]; reserved.add(portalTile[1] * MW + portalTile[0]);

  // 바닥
  let nf = 0; for (let i = 0; i < G.length; i++) if (G[i]) nf++;
  const floor = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, .4, TILE), MAT.floor, nf);
  const m = new THREE.Matrix4(), c = new THREE.Color(); let k = 0;
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) if (G[j * MW + i]) {
    m.makeRotationY(irand(0, 3) * Math.PI / 2); m.setPosition(wx(i), -.2, wx(j)); floor.setMatrixAt(k, m);
    const v = rand(.7, 1.05); floor.setColorAt(k++, c.setRGB(v, v * .97, v * .92));
  }
  floor.receiveShadow = true; scene.add(floor);

  // 벽
  const wallT = [];
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    if (G[j * MW + i]) continue; let adj = false;
    for (let dj = -1; dj <= 1 && !adj; dj++) for (let di = -1; di <= 1; di++) if (walk(i + di, j + dj)) { adj = true; break; }
    if (adj) wallT.push([i, j]);
  }
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, WALL_H, TILE), MAT.wall, wallT.length);
  wallT.forEach(([i, j], n) => { m.makeTranslation(wx(i), WALL_H / 2, wx(j)); walls.setMatrixAt(n, m); const v = rand(.65, 1); walls.setColorAt(n, c.setRGB(v, v * .95, v * .9)); });
  walls.castShadow = walls.receiveShadow = true; scene.add(walls);

  // 벽 위 테두리(돌 갓돌)
  for (const [i, j] of wallT) addStatic(GEO.box, MAT.cap, wx(i), WALL_H + .06, wx(j), 0, 0, 0, TILE + .06, .12, TILE + .06);

  torches = [];
  const interior = (i, j) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (!walk(i + di, j + dj)) return false; return true; };
  const freeTile = (r, tries = 30) => {
    for (let t = 0; t < tries; t++) { const i = irand(r.x + 1, r.x + r.w - 2), j = irand(r.y + 1, r.y + r.h - 2); if (walk(i, j) && !reserved.has(j * MW + i)) return [i, j]; }
    return null;
  };
  const block = (i, j) => { G[j * MW + i] = 2; reserved.add(j * MW + i); };

  for (const r of rooms) {
    // 횃불 (북쪽 벽 = 카메라를 마주보는 벽)
    const tj = r.y - 1;
    const cand = []; for (let i = r.x + 1; i < r.x + r.w - 1; i++) if (!G[tj * MW + i] && walk(i, r.y)) cand.push(i);
    const nT = r.w >= 8 ? 2 : 1;
    for (let t = 0; t < nT && cand.length; t++) {
      const i = t === 0 ? cand[Math.floor(cand.length * .25)] : cand[Math.floor(cand.length * .8)];
      const x = wx(i), z = tj * TILE + TILE;
      addStatic(GEO.box, MAT.iron, x, 1.75, z + .08, 0, 0, 0, .18, .32, .16);
      addStatic(GEO.cyl, MAT.wood, x, 1.95, z + .22, 0, -.35, 0, .09, .5, .09);
      addStatic(GEO.cyl6, MAT.iron, x, 2.2, z + .3, 0, 0, 0, .2, .14, .2);
      addStatic(GEO.cone, MAT.flame, x, 2.38, z + .3, 0, 0, 0, .16, .3, .16);
      torches.push({ pos: new THREE.Vector3(x, 2.45, z + .3), ph: rand(0, 100), acc: 0 });
      // 깃발
      if (t === 0 && r.w >= 7 && cand.length > 3) {
        const bi = cand[Math.floor(cand.length * .55)];
        addStatic(GEO.plane, MAT.cloth, wx(bi), 1.55, z + .04, 0, 0, 0, .9, 1.6, 1);
        addStatic(GEO.cyl, MAT.gold, wx(bi), 2.38, z + .1, 0, 0, Math.PI / 2, .05, 1.1, .05);
      }
    }
    if (r === startRoom) continue;
    // 기둥
    if (r.w >= 8 && r.h >= 7) {
      for (const [i, j] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) {
        if (!interior(i, j) || reserved.has(j * MW + i)) continue;
        const x = wx(i), z = wx(j);
        addStatic(GEO.box, MAT.stone, x, .2, z, 0, 0, 0, 1.3, .4, 1.3);
        addStatic(GEO.cyl, MAT.stone, x, 1.8, z, 0, 0, 0, .9, 3.0, .9);
        addStatic(GEO.box, MAT.stone, x, 3.35, z, 0, 0, 0, 1.25, .3, 1.25);
        block(i, j);
      }
    }
    // 석관
    if (Math.random() < .55 && r !== exitRoom) {
      const t = freeTile(r);
      if (t && interior(t[0], t[1])) {
        const x = wx(t[0]), z = wx(t[1]), ry = Math.random() < .5 ? 0 : Math.PI / 2;
        addStatic(GEO.box, MAT.stone, x, .42, z, ry, 0, 0, 1.0, .84, 1.75);
        addStatic(GEO.box, MAT.stone, x + rand(-.1, .1), .9, z, ry + rand(-.15, .15), 0, 0, 1.12, .14, 1.88);
        addStatic(GEO.box, MAT.gold, x, .98, z, ry, 0, 0, .12, .04, 1.2);
        block(t[0], t[1]);
      }
    }
    // 뼈 무더기 · 양초 · 핏자국 (지나갈 수 있음)
    for (let n = 0; n < irand(2, 4); n++) {
      const t = freeTile(r); if (!t) continue;
      const x = wx(t[0]) + rand(-.6, .6), z = wx(t[1]) + rand(-.6, .6);
      for (let b = 0; b < 5; b++) addStatic(GEO.cyl6, MAT.bone, x + rand(-.4, .4), .04, z + rand(-.4, .4), rand(0, 6), Math.PI / 2, 0, .07, rand(.3, .6), .07);
      addStatic(GEO.sph, MAT.bone, x + rand(-.3, .3), .12, z + rand(-.3, .3), 0, 0, 0, .26, .24, .28);
    }
    for (let n = 0; n < irand(1, 2); n++) {
      const t = freeTile(r); if (!t) continue;
      const x = wx(t[0]), z = wx(t[1]);
      for (let b = 0; b < 3; b++) {
        const cx = x + rand(-.35, .35), cz = z + rand(-.35, .35), h = rand(.15, .4);
        addStatic(GEO.cyl, MAT.wax, cx, h / 2, cz, 0, 0, 0, .09, h, .09);
        addStatic(GEO.sph, MAT.flame, cx, h + .06, cz, 0, 0, 0, .06, .12, .06);
      }
    }
    if (Math.random() < .6) { const t = freeTile(r); if (t) addStatic(GEO.circle, MAT.blood, wx(t[0]), .012, wx(t[1]), rand(0, 6), 0, 0, rand(1.2, 2.2), 1, rand(.9, 1.6)); }
  }
  flushStatics();

  // 출구(봉인된 계단 포털)
  buildPortal(wx(portalTile[0]), wx(portalTile[1]) - .4);

  // 적 배치
  enemies = [];
  for (const r of rooms) {
    if (r === startRoom) continue;
    if (r === exitRoom) {
      elite = spawnEnemy('elite', wx(r.cx), wx(r.cy) + 1);
      for (let n = 0; n < 3; n++) { const t = freeTile(r); if (t) spawnEnemy('skeleton', wx(t[0]), wx(t[1])); }
      continue;
    }
    const n = irand(2, 4);
    for (let q = 0; q < n; q++) { const t = freeTile(r); if (t) spawnEnemy(Math.random() < .6 ? 'skeleton' : 'zombie', wx(t[0]) + rand(-.4, .4), wx(t[1]) + rand(-.4, .4)); }
  }
}

function buildPortal(x, z) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z);
  const st = MAT.stone;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(GEO.box, st); p.scale.set(.5, 3.0, .6); p.position.set(s * 1.35, 1.5, 0); p.castShadow = true; grp.add(p);
    const cap = new THREE.Mesh(GEO.box, st); cap.scale.set(.7, .25, .8); cap.position.set(s * 1.35, 3.1, 0); grp.add(cap);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.35, .26, 8, 24, Math.PI), st); arch.position.set(0, 3.0, 0); arch.castShadow = true; grp.add(arch);
  const pmat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(.5, .05, .02) }, uB: { value: new THREE.Color(1.2, .2, .05) }, uPow: { value: .55 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uPow; varying vec2 vUv;
      void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
        float sw = sin(a * 5.0 + r * 11.0 - uTime * 3.5) * .5 + .5; float sw2 = sin(a * 3.0 - r * 7.0 + uTime * 2.0) * .5 + .5;
        float core = smoothstep(1.0, 0.0, r);
        vec3 col = mix(uA, uB, sw * sw2) * core * (0.5 + sw) + uB * pow(core, 5.0) * 2.0;
        gl_FragColor = vec4(col * uPow * smoothstep(1.0, 0.9, r), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), pmat); disc.scale.set(1, 1.45, 1); disc.position.set(0, 1.75, .05); grp.add(disc);
  const rune = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, .15, .05), transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
  rune.scale.setScalar(1.7); rune.position.set(0, .03, 1.2); grp.add(rune);
  const light = new THREE.PointLight(0xff3010, 14, 9, 1.6); light.position.set(0, 1.8, 1.2); grp.add(light);
  scene.add(grp);
  portal = { grp, pmat, rune, light, open: false, pos: new THREE.Vector3(x, 0, z + .9), acc: 0 };
}

/* ================= 캐릭터 모델 ================= */
const mk = (geo, mat, sx, sy, sz, x = 0, y = 0, z = 0, parent) => {
  const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; if (parent) parent.add(m); return m;
};

function buildWarrior() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const armor = new THREE.MeshStandardMaterial({ color: 0x8c929c, metalness: .9, roughness: .32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b231d, roughness: .8 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x8a1410, roughness: .9, side: THREE.DoubleSide });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc89a3a, metalness: 1, roughness: .45 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: .85 });
  const blade = new THREE.MeshStandardMaterial({ color: 0xe6ecf2, metalness: 1, roughness: .15, emissive: 0x3a5a8a, emissiveIntensity: .6 });
  const visor = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 1.4, .4) });
  const B = GEO.box, S = GEO.sph, C = GEO.cyl, CO = GEO.cone;
  const legs = [];
  for (const s of [-1, 1]) {
    const L = new THREE.Group(); L.position.set(s * .15, .92, 0); body.add(L);
    mk(B, dark, .2, .5, .22, 0, -.24, 0, L); mk(B, armor, .22, .2, .24, 0, -.18, .02, L);
    mk(B, armor, .2, .38, .23, 0, -.62, 0, L); mk(B, leather, .22, .12, .32, 0, -.86, .05, L);
    legs.push(L);
  }
  const torso = new THREE.Group(); torso.position.y = .92; body.add(torso);
  mk(B, leather, .48, .18, .3, 0, .06, 0, torso);
  mk(B, gold, .5, .06, .32, 0, .14, 0, torso);
  mk(B, armor, .6, .55, .36, 0, .45, 0, torso);
  mk(B, armor, .5, .2, .3, 0, .78, 0, torso);
  mk(B, gold, .08, .4, .02, 0, .45, .185, torso);
  mk(B, cloth, .3, .5, .02, 0, -.12, .17, torso);
  mk(B, cloth, .3, .5, .02, 0, -.12, -.17, torso);
  for (const s of [-1, 1]) { mk(S, armor, .34, .26, .36, s * .38, .8, 0, torso); mk(S, gold, .36, .08, .38, s * .38, .75, 0, torso); }
  const head = new THREE.Group(); head.position.set(0, .98, 0); torso.add(head);
  mk(S, armor, .36, .4, .38, 0, .12, 0, head);
  mk(B, visor, .24, .035, .05, 0, .1, .18, head);
  mk(B, gold, .04, .22, .05, 0, .2, .19, head);
  for (const s of [-1, 1]) { const h = mk(CO, gold, .08, .38, .08, s * .2, .32, -.02, head); h.rotation.z = -s * .9; }
  const cape = new THREE.Group(); cape.position.set(0, .8, -.2); torso.add(cape);
  const cp = mk(GEO.plane, cloth, .62, 1.25, 1, 0, -.62, 0, cape); cp.castShadow = true;
  const armR = new THREE.Group(); armR.position.set(-.4, .72, 0); torso.add(armR);
  mk(B, armor, .17, .36, .18, 0, -.18, 0, armR); mk(B, leather, .18, .3, .18, 0, -.48, 0, armR); mk(B, armor, .2, .14, .2, 0, -.62, 0, armR);
  const sword = new THREE.Group(); sword.position.set(0, -.66, .05); armR.add(sword); sword.rotation.x = Math.PI / 2;
  mk(C, leather, .07, .26, .07, 0, 0, 0, sword); mk(B, gold, .4, .06, .08, 0, .15, 0, sword); mk(S, gold, .1, .1, .1, 0, -.15, 0, sword);
  mk(B, blade, .11, 1.25, .025, 0, .8, 0, sword); const tip = mk(CO, blade, .078, .16, .025, 0, 1.5, 0, sword); tip.scale.set(.11, .2, .025);
  const armL = new THREE.Group(); armL.position.set(.4, .72, 0); torso.add(armL);
  mk(B, armor, .17, .36, .18, 0, -.18, 0, armL); mk(B, leather, .18, .3, .18, 0, -.48, 0, armL);
  const shield = new THREE.Group(); shield.position.set(.14, -.45, .08); armL.add(shield);
  const sh = mk(C, armor, .78, .07, .78, 0, 0, 0, shield); sh.rotation.z = Math.PI / 2; sh.scale.set(.78, .07, .9);
  const rim = mk(new THREE.TorusGeometry(.39, .035, 6, 24), gold, 1, 1.15, 1, .04, 0, 0, shield); rim.rotation.y = Math.PI / 2;
  mk(S, gold, .14, .14, .14, .05, 0, 0, shield);
  const cross = mk(B, cloth, .02, .6, .1, .04, 0, 0, shield); mk(B, cloth, .02, .1, .45, .04, .08, 0, shield);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, body, torso, legs, armR, armL, head, cape, sword, flash: [armor, cloth, leather] };
}

function buildSkeleton(isElite) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const bone = new THREE.MeshStandardMaterial({ color: isElite ? 0xa8a090 : 0xd8d0bc, roughness: .55 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a4a32, metalness: .75, roughness: .5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e1c22, metalness: .8, roughness: .4 });
  const eye = new THREE.MeshBasicMaterial({ color: isElite ? new THREE.Color(.5, 1.6, 4) : new THREE.Color(4, .5, .1) });
  const C = GEO.cyl6, S = GEO.sph, B = GEO.box;
  const legs = [];
  for (const s of [-1, 1]) {
    const L = new THREE.Group(); L.position.set(s * .12, .92, 0); body.add(L);
    mk(C, bone, .08, .44, .08, 0, -.22, 0, L); mk(S, bone, .1, .1, .1, 0, -.45, 0, L); mk(C, bone, .07, .42, .07, 0, -.66, 0, L); mk(B, bone, .1, .06, .2, 0, -.88, .05, L);
    legs.push(L);
  }
  const torso = new THREE.Group(); torso.position.y = .92; body.add(torso);
  mk(B, bone, .3, .1, .14, 0, .03, 0, torso);
  mk(C, bone, .07, .5, .07, 0, .3, -.04, torso);
  for (let k = 0; k < 4; k++) { const r = mk(new THREE.TorusGeometry(.16 - k * .012, .022, 5, 14, Math.PI * 1.5), bone, 1, 1, 1, 0, .28 + k * .085, 0, torso); r.rotation.set(Math.PI / 2, 0, Math.PI * .25 + Math.PI); }
  const head = new THREE.Group(); head.position.y = .72; torso.add(head);
  mk(S, bone, .32, .33, .36, 0, 0, 0, head); mk(B, bone, .2, .07, .16, 0, -.13, .05, head);
  for (const s of [-1, 1]) { mk(S, eye, .06, .05, .04, s * .065, .01, .155, head); }
  const armR = new THREE.Group(); armR.position.set(-.22, .55, 0); torso.add(armR);
  mk(C, bone, .06, .36, .06, 0, -.18, 0, armR); mk(C, bone, .05, .34, .05, 0, -.52, 0, armR);
  const sw = new THREE.Group(); sw.position.set(0, -.7, .05); sw.rotation.x = Math.PI / 2; armR.add(sw);
  mk(B, rust, .26, .05, .06, 0, .05, 0, sw); mk(B, rust, isElite ? .14 : .08, isElite ? 1.2 : .82, .025, 0, isElite ? .66 : .48, 0, sw);
  const armL = new THREE.Group(); armL.position.set(.22, .55, 0); torso.add(armL);
  mk(C, bone, .06, .36, .06, 0, -.18, 0, armL); mk(C, bone, .05, .34, .05, 0, -.52, 0, armL);
  const flash = [bone];
  if (isElite) {
    const helm = mk(new THREE.SphereGeometry(.21, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, 1, 1.1, 1.1, 0, .03, 0, head);
    for (const s of [-1, 1]) { const h = mk(GEO.cone, bone, .07, .35, .07, s * .2, .18, 0, head); h.rotation.z = -s * 1.0; }
    for (const s of [-1, 1]) mk(S, dark, .3, .2, .3, s * .24, .58, 0, torso);
    const cl = mk(GEO.plane, new THREE.MeshStandardMaterial({ color: 0x1a1a40, side: THREE.DoubleSide, roughness: .9 }), .5, 1.0, 1, 0, .1, -.16, torso);
    flash.push(dark);
  } else if (Math.random() < .5) {
    const shd = mk(GEO.cyl, rust, .5, .05, .5, .1, -.42, .06, armL); shd.rotation.z = Math.PI / 2;
  }
  return { root, body, torso, legs, armR, armL, head, flash };
}

function buildZombie() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = new THREE.MeshStandardMaterial({ color: 0x6d8658, roughness: .75 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3d342a, roughness: .95 });
  const cloth2 = new THREE.MeshStandardMaterial({ color: 0x2c3a4a, roughness: .95 });
  const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 3, .3) });
  const B = GEO.box, S = GEO.sph;
  const legs = [];
  for (const s of [-1, 1]) {
    const L = new THREE.Group(); L.position.set(s * .14, .88, 0); body.add(L);
    mk(B, cloth2, .19, .55, .2, 0, -.27, 0, L); mk(B, skin, .15, .32, .16, 0, -.7, 0, L); mk(B, cloth, .17, .08, .26, 0, -.86, .04, L);
    legs.push(L);
  }
  const torso = new THREE.Group(); torso.position.y = .88; torso.rotation.x = .35; body.add(torso);
  mk(B, cloth, .52, .62, .32, 0, .33, 0, torso); mk(B, skin, .3, .2, .05, .08, .45, .16, torso);
  mk(B, cloth, .22, .18, .34, -.18, .02, 0, torso);
  const head = new THREE.Group(); head.position.set(0, .78, .05); torso.add(head);
  mk(B, skin, .3, .32, .3, 0, .05, 0, head); mk(B, skin, .22, .08, .1, 0, -.1, .1, head);
  for (const s of [-1, 1]) mk(S, eye, .055, .045, .03, s * .07, .08, .15, head);
  const arms = [];
  for (const s of [-1, 1]) {
    const A = new THREE.Group(); A.position.set(s * .33, .58, 0); torso.add(A);
    mk(B, cloth, .15, .28, .15, 0, -.14, 0, A); mk(B, skin, .12, .36, .12, 0, -.44, 0, A); mk(S, skin, .13, .1, .15, 0, -.65, 0, A);
    A.rotation.x = -1.25 - .35; arms.push(A);
  }
  return { root, body, torso, legs, armR: arms[0], armL: arms[1], head, flash: [skin, cloth] };
}

/* ================= 적 ================= */
const ETYPES = {
  skeleton: { name: '해골 전사', hp: 42, speed: 3.3, dmg: [6, 9], range: 1.55, cd: 1.25, windup: .38, scale: 1, build: () => buildSkeleton(false), fx: 'bone' },
  zombie: { name: '굶주린 좀비', hp: 72, speed: 1.9, dmg: [9, 13], range: 1.45, cd: 1.6, windup: .5, scale: 1.08, build: buildZombie, fx: 'goo' },
  elite: { name: '해골 백부장', hp: 380, speed: 2.9, dmg: [13, 18], range: 2.0, cd: 1.35, windup: .42, scale: 1.5, build: () => buildSkeleton(true), fx: 'bone', elite: true }
};
const barsLayer = $('#bars-layer');
function spawnEnemy(type, x, z) {
  const cfg = ETYPES[type], b = cfg.build();
  const e = {
    type, cfg, ...b, flashMats: b.flash, hp: cfg.hp, max: cfg.hp, pos: new THREE.Vector3(x, 0, z), face: rand(0, 6.28), aggro: false, state: 'idle', t: 0, cd: rand(.2, 1),
    kb: new THREE.Vector3(), walkT: rand(0, 10), flash: 0, stun: 0, dead: false, deathT: 0, removed: false, r: .42 * cfg.scale, atkN: 0, moving: false,
    buried: type === 'skeleton' && Math.random() < .5, riseT: 0
  };
  e.root.scale.setScalar(cfg.scale); e.root.position.copy(e.pos); e.root.rotation.y = e.face;
  if (e.buried) { e.root.position.y = -2.2; e.root.visible = false; }
  scene.add(e.root);
  e.bar = document.createElement('div'); e.bar.className = 'ebar'; e.bar.innerHTML = '<div></div>'; e.bar.style.display = 'none'; barsLayer.appendChild(e.bar);
  enemies.push(e); return e;
}

function computeFlow() {
  bfs(G, Math.floor(P.pos.x / TILE), Math.floor(P.pos.z / TILE), flow);
}

const _d = new THREE.Vector3();
function updateEnemy(e, dt) {
  const ap = e.root.position;
  if (e.dead) {
    e.deathT += dt;
    const k = Math.min(1, e.deathT / .45);
    e.body.rotation.x = -easeOut(k) * Math.PI / 2 * .95;
    e.body.position.y = easeOut(k) * .25;
    if (e.deathT > 1.6) ap.y -= dt * 1.2;
    if (e.deathT > 2.8) { scene.remove(e.root); e.removed = true; e.bar.remove(); disposeObj(e.root); }
    return;
  }
  if (e.flash > 0 || e.flashOn) {
    e.flash = Math.max(0, e.flash - dt * 7); e.flashOn = e.flash > 0;
    for (const m of e.flashMats) m.emissive.setRGB(e.flash * 1.6, e.flash * 1.4, e.flash * 1.2);
  }

  const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dist = Math.hypot(dx, dz);

  // 땅속에서 솟아오르는 해골
  if (e.buried) {
    if (!e.rising && dist < 9 && !P.dead) {
      e.rising = true; e.root.visible = true; Sfx.rise();
      for (let k = 0; k < 18; k++) debris.spawn(e.pos.x + rand(-.5, .5), .1, e.pos.z + rand(-.5, .5), rand(-2, 2), rand(3, 6), rand(-2, 2), 0x3a3028, .7, 1.2);
    }
    if (e.rising) {
      e.riseT += dt; ap.y = lerp(-2.2, 0, easeOut(Math.min(1, e.riseT / 1.1)));
      e.face = Math.atan2(dx, dz); e.root.rotation.y = e.face; e.body.rotation.z = Math.sin(e.riseT * 18) * .08 * (1 - Math.min(1, e.riseT));
      if (Math.random() < .5) parts.emit(e.pos.x + rand(-.6, .6), .1, e.pos.z + rand(-.6, .6), 0, rand(.5, 1.5), 0, .35, .3, .25, rand(.5, .9), 1, 0, .5, 1.2);
      if (e.riseT >= 1.1) { e.buried = false; e.aggro = true; ap.y = 0; e.body.rotation.z = 0; }
    }
    return;
  }

  if (e.stun > 0) {
    e.stun -= dt; e.state = 'idle';
    e.head.rotation.z = Math.sin(time * 10) * .25;
    if (Math.random() < .2) parts.emit(e.pos.x + Math.cos(time * 6) * .35, 2.0 * e.cfg.scale, e.pos.z + Math.sin(time * 6) * .35, 0, 0, 0, 2, 1.8, .6, .25, .4, 0, 0);
  } else e.head.rotation.z = 0;

  if (!e.aggro && dist < 10 && !P.dead) {
    e.aggro = true;
    for (const o of enemies) if (!o.dead && !o.buried && o.pos.distanceTo(e.pos) < 7) o.aggro = true;
  }

  e.moving = false;
  if (e.aggro && !P.dead && e.stun <= 0) {
    if (e.state === 'attack') {
      e.t += dt; const w = e.special ? .95 : e.cfg.windup;
      e.face = angLerp(e.face, Math.atan2(dx, dz), Math.min(1, dt * 8));
      if (!e.hit && e.t >= w) {
        e.hit = true;
        if (e.special) {
          Sfx.slam(); shake = Math.max(shake, .45);
          ringFx(e.pos.x, e.pos.z, [2.5, .6, 2.6], 3.4, .5);
          debris.burst(e.pos.x, .2, e.pos.z, 16, 5, 0x3a3028, .9, 1.5);
          parts.burst(e.pos.x, .3, e.pos.z, 40, 7, [1.5, .5, 3], .5, .6, 4);
          crackDecal(e.pos.x, e.pos.z, 2.8);
          if (dist < 3.4) hurtPlayer(rand(20, 28));
        } else if (dist < e.cfg.range + .55) {
          hurtPlayer(rand(e.cfg.dmg[0], e.cfg.dmg[1]));
        }
        if (!e.special) Sfx.swing();
      }
      if (e.t >= w + .35) { e.state = 'chase'; e.cd = e.cfg.cd * rand(.85, 1.15); e.special = false; }
    } else {
      e.cd -= dt;
      const reach = e.cfg.range;
      if (dist < reach) {
        e.face = angLerp(e.face, Math.atan2(dx, dz), Math.min(1, dt * 10));
        if (e.cd <= 0) {
          e.state = 'attack'; e.t = 0; e.hit = false; e.atkN++;
          if (e.cfg.elite && e.atkN % 3 === 0) { e.special = true; Sfx.warn(); warnRing(e.pos.x, e.pos.z, 3.4, .95); }
        }
      } else {
        // 경로 찾기 (BFS 흐름장)
        let tx = P.pos.x, tz = P.pos.z;
        const ti = Math.floor(e.pos.x / TILE), tj = Math.floor(e.pos.z / TILE), dh = flow[tj * MW + ti];
        if (dh < 0 || dh > 1) {
          let best = dh < 0 ? 1e9 : dh, bi = -1, bj = -1;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue; const ni = ti + di, nj = tj + dj;
            if (!walk(ni, nj)) continue; if (di && dj && (!walk(ti + di, tj) || !walk(ti, tj + dj))) continue;
            const d = flow[nj * MW + ni] + (di && dj ? -.4 : 0); if (flow[nj * MW + ni] >= 0 && d < best) { best = d; bi = ni; bj = nj; }
          }
          if (bi >= 0) { tx = wx(bi); tz = wx(bj); }
        }
        _d.set(tx - e.pos.x, 0, tz - e.pos.z); const l = _d.length();
        if (l > .01) {
          _d.multiplyScalar(1 / l); const sp = e.cfg.speed * dt;
          moveCol(e.pos, _d.x * sp, _d.z * sp, e.r * .8); e.moving = true;
          e.face = angLerp(e.face, Math.atan2(_d.x, _d.z), Math.min(1, dt * 8));
        }
      }
    }
  } else if (!e.aggro) {
    e.t += dt; if (e.t > 3) { e.t = 0; e.face += rand(-1, 1); }
  }
  // 넉백 · 서로 밀어내기
  if (e.kb.lengthSq() > .001) { moveCol(e.pos, e.kb.x * dt, e.kb.z * dt, e.r * .8); e.kb.multiplyScalar(Math.exp(-dt * 7)); }
  for (const o of enemies) {
    if (o === e || o.dead || o.buried) continue;
    const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, d2 = ox * ox + oz * oz, rr = e.r + o.r;
    if (d2 < rr * rr && d2 > 1e-5) { const d = Math.sqrt(d2), push = (rr - d) * .5; moveCol(e.pos, ox / d * push, oz / d * push, e.r * .8); }
  }
  if (!P.dead && dist < e.r + P.r && dist > 1e-4) { const push = (e.r + P.r - dist); moveCol(e.pos, -dx / dist * push, -dz / dist * push, e.r * .8); }

  // 애니메이션
  ap.x = e.pos.x; ap.z = e.pos.z; e.root.rotation.y = e.face;
  if (e.moving) e.walkT += dt * e.cfg.speed * 3.2;
  const sw = Math.sin(e.walkT), mv = e.moving ? 1 : 0;
  e.legs[0].rotation.x = lerp(e.legs[0].rotation.x, sw * .7 * mv, .3);
  e.legs[1].rotation.x = lerp(e.legs[1].rotation.x, -sw * .7 * mv, .3);
  e.body.position.y = Math.abs(Math.cos(e.walkT)) * .05 * mv;
  const zombie = e.type === 'zombie';
  if (e.state === 'attack') {
    const w = e.special ? .95 : e.cfg.windup, k = Math.min(1, e.t / w), s = clamp((e.t - w) / .15, 0, 1);
    if (zombie) {
      e.armR.rotation.x = e.armL.rotation.x = lerp(-1.6, -2.6, k) + s * 1.6;
      e.torso.rotation.x = .35 - k * .25 + s * .5;
    } else {
      e.armR.rotation.x = lerp(-.3, -2.9, easeOut(k)) + s * 2.2;
      e.torso.rotation.y = lerp(0, .4, k) - s * .8;
      if (e.special) e.armL.rotation.x = e.armR.rotation.x;
    }
  } else {
    if (zombie) {
      e.armR.rotation.x = -1.6 + Math.sin(time * 2 + e.walkT) * .12; e.armL.rotation.x = -1.6 + Math.cos(time * 2.3 + e.walkT) * .12;
      e.torso.rotation.x = lerp(e.torso.rotation.x, .35, .2); e.body.rotation.z = Math.sin(e.walkT * .5) * .08;
    } else {
      e.armR.rotation.x = lerp(e.armR.rotation.x, -sw * .5 * mv - .25, .25); e.armL.rotation.x = lerp(e.armL.rotation.x, sw * .5 * mv, .25);
      e.torso.rotation.y = lerp(e.torso.rotation.y, 0, .2);
    }
  }
  if (e.cfg.elite && Math.random() < dt * 25) {
    const a = rand(0, 6.28); parts.emit(e.pos.x + Math.cos(a) * .7, rand(.2, 2.5), e.pos.z + Math.sin(a) * .7, 0, rand(.5, 1.5), 0, .3, .7, 2, rand(.3, .6), rand(.6, 1.2), -.5, .5);
  }
}

/* ================= 플레이어 ================= */
function initPlayer() {
  const b = buildWarrior();
  Object.assign(P, b, {
    pos: new THREE.Vector3(wx(startRoom.cx), 0, wx(startRoom.cy)), face: Math.PI, hp: 160, maxHp: 160, mp: 100, maxMp: 100, r: .45,
    action: null, target: null, moveTarget: null, cds: [0, 0, 0, 0], buff: 0, potions: 3, dead: false, invuln: 0, walkT: 0, moving: false, atkHeld: false, deadT: 0, whirlFx: null, potionCd: 0
  });
  P.root.position.copy(P.pos); scene.add(P.root);
}

function nearestEnemy(maxD) {
  let best = null, bd = maxD;
  for (const e of enemies) { if (e.dead || e.buried) continue; const d = e.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = e; } }
  return best;
}
function aimPoint() {
  if (!IS_TOUCH && hasMouse) return mouseG.clone().setY(0);
  const e = nearestEnemy(9); if (e) return e.pos.clone();
  return P.pos.clone().add(new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face)).multiplyScalar(5));
}

function useSkill(i) {
  if (state !== 'play' || P.dead) return;
  const s = SKILLS[i];
  if (P.cds[i] > 0) return;
  if (P.action && P.action.type !== 'attack') return;
  if (P.mp < s.cost) { showMsg('마나가 부족합니다', 1.0); return; }
  P.mp -= s.cost; P.cds[i] = s.cd;
  const aim = aimPoint();
  if (s.id === 'whirl') {
    P.action = { type: 'whirl', t: 0, dur: 2.4, tick: 0 };
    P.whirlFx = makeWhirlFx(); Sfx.whirlStart();
  } else if (s.id === 'leap') {
    const from = P.pos.clone(); _d.subVectors(aim, from); let l = _d.length();
    if (l < .1) { _d.set(Math.sin(P.face), 0, Math.cos(P.face)); l = 1; }
    _d.multiplyScalar(1 / l); l = Math.min(l, 8);
    const to = from.clone().addScaledVector(_d, l);
    while (l > 0 && blockedAt(to.x, to.z, P.r)) { l -= .25; to.copy(from).addScaledVector(_d, Math.max(0, l)); }
    P.face = Math.atan2(_d.x, _d.z);
    P.action = { type: 'leap', t: 0, dur: .6, from, to };
    P.invuln = .65; Sfx.swing();
    for (let k = 0; k < 14; k++) parts.emit(P.pos.x + rand(-.4, .4), .1, P.pos.z + rand(-.4, .4), rand(-1.5, 1.5), rand(.5, 2), rand(-1.5, 1.5), .5, .45, .4, .8, .7, 0, 1);
  } else if (s.id === 'cry') {
    P.action = { type: 'cry', t: 0, dur: .6 };
    P.buff = 8; Sfx.cry(); shake = Math.max(shake, .25);
    ringFx(P.pos.x, P.pos.z, [1.6, 1.1, .3], 6.5, .7); ringFx(P.pos.x, P.pos.z, [1.1, .7, .2], 4.5, .5);
    columnFx(P.pos.x, P.pos.z, [1.4, .95, .3]);
    for (let k = 0; k < 60; k++) { const a = rand(0, 6.28), sp = rand(3, 8); parts.emit(P.pos.x, 1.2, P.pos.z, Math.cos(a) * sp, rand(-.5, 2), Math.sin(a) * sp, 2.5, 1.7, .5, .45, .7, 0, 2.5); }
    for (const e of enemies) if (!e.dead && !e.buried && e.pos.distanceTo(P.pos) < 6) { e.stun = 1.5; e.state = 'idle'; e.aggro = true; }
  } else if (s.id === 'fissure') {
    _d.subVectors(aim, P.pos); _d.y = 0; if (_d.lengthSq() < .01) _d.set(Math.sin(P.face), 0, Math.cos(P.face)); _d.normalize();
    P.face = Math.atan2(_d.x, _d.z);
    P.action = { type: 'fissure', t: 0, dur: .5 };
    const dir = _d.clone(), origin = P.pos.clone(), hitSet = new Set();
    for (let k = 0; k < 10; k++) later(.16 + k * .05, () => {
      const p = origin.clone().addScaledVector(dir, 1.3 + k * 1.05);
      if (blockedAt(p.x, p.z, .1)) return;
      spikeFx(p.x + rand(-.2, .2), p.z + rand(-.2, .2), k);
      for (const e of enemies) if (!e.dead && !e.buried && !hitSet.has(e) && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 1.25 + e.r) {
        hitSet.add(e); hitEnemy(e, rand(26, 36), { kb: 5, from: p }); e.kb.y = 0;
      }
    });
  }
  const sl = $('#skills').children[i]; if (sl) { sl.classList.remove('ready'); }
}

function usePotion() {
  if (state !== 'play' || P.dead || P.potions <= 0 || P.potionCd > 0) return;
  if (P.hp >= P.maxHp) { showMsg('생명력이 가득 차 있습니다', .9); return; }
  P.potions--; P.potionCd = .6; const h = Math.min(70, P.maxHp - P.hp); P.hp += h; Sfx.potion();
  dmgText(P.pos, 2.4, '+' + Math.round(h), 'heal');
  for (let k = 0; k < 40; k++) { const a = rand(0, 6.28), r = rand(.2, .7); parts.emit(P.pos.x + Math.cos(a) * r, rand(.1, 1.5), P.pos.z + Math.sin(a) * r, 0, rand(1.5, 3), 0, 2.5, .3, .25, .3, rand(.6, 1), 0, 1); }
}

function startAttack(target) {
  P.action = { type: 'attack', t: 0, dur: .5, hit: false, target, fx: false };
  if (target) P.face = Math.atan2(target.pos.x - P.pos.x, target.pos.z - P.pos.z);
  Sfx.swing();
}

function hitEnemy(e, base, o = {}) {
  if (e.dead || e.buried) return 0;
  let dmg = base * (P.buff > 0 ? 1.3 : 1);
  const crit = Math.random() < (o.crit ?? .12); if (crit) dmg *= 1.8; dmg = Math.round(dmg);
  e.hp -= dmg; e.flash = 1; e.aggro = true;
  if (o.kb) {
    const f = o.from || P.pos; _d.set(e.pos.x - f.x, 0, e.pos.z - f.z); if (_d.lengthSq() < 1e-4) _d.set(0, 0, 1); _d.normalize();
    e.kb.addScaledVector(_d, o.kb / (e.cfg.elite ? 3.5 : 1));
  }
  const ch = 1.2 * e.cfg.scale;
  dmgText(e.pos, ch + .6, dmg, crit ? 'crit' : '');
  const col = e.type === 'zombie' ? [.6, 1.4, .3] : e.cfg.elite ? [1, 1.6, 3] : [2.2, 2, 1.7];
  parts.burst(e.pos.x, ch, e.pos.z, crit ? 16 : 9, crit ? 6 : 4, col, .22, .45, 8);
  parts.burst(e.pos.x, ch, e.pos.z, 5, 7, [3, 1.8, .6], .12, .25, 10);
  Sfx.hit(crit);
  if (e.hp <= 0) killEnemy(e);
  return dmg;
}

function killEnemy(e) {
  e.dead = true; e.deathT = 0; e.hp = 0; e.bar.style.display = 'none'; kills++; $('#kc').textContent = kills;
  const ch = 1.0 * e.cfg.scale;
  if (e.type === 'zombie') {
    Sfx.squish();
    parts.burst(e.pos.x, ch, e.pos.z, 30, 5, [.35, .9, .15], .3, .8, 9);
    debris.burst(e.pos.x, ch, e.pos.z, 8, 4, 0x4a5a30, .8, 1.6);
  } else {
    Sfx.bone();
    debris.burst(e.pos.x, ch, e.pos.z, e.cfg.elite ? 30 : 14, e.cfg.elite ? 7 : 5, 0xd8d0bc, e.cfg.elite ? 1.2 : .8, 2.2);
    parts.burst(e.pos.x, ch, e.pos.z, 24, 4, [1.4, 1.3, 1.1], .35, .7, 3);
  }
  if (Math.random() < .16) spawnGlobe(e.pos.x, e.pos.z);
  if (e.cfg.elite) {
    hitstop = .2; shake = Math.max(shake, .6);
    parts.burst(e.pos.x, 1.5, e.pos.z, 120, 9, [1, 2, 5], .5, 1.2, 2);
    ringFx(e.pos.x, e.pos.z, [1, 2, 5], 7, .9);
    spawnGlobe(e.pos.x + 1, e.pos.z); spawnGlobe(e.pos.x - 1, e.pos.z + .5);
    $('#boss').classList.add('hidden');
    later(.8, openPortal);
  }
}

function hurtPlayer(amt) {
  if (P.dead || P.invuln > 0 || state !== 'play') return;
  if (P.buff > 0) amt *= .6;
  amt = Math.round(amt); P.hp -= amt;
  dmgText(P.pos, 2.4, amt, 'player'); Sfx.hurt(); shake = Math.max(shake, .22);
  const h = $('#hurt'); h.style.transition = 'none'; h.style.opacity = '.85'; requestAnimationFrame(() => { h.style.transition = 'opacity .45s'; h.style.opacity = '0'; });
  parts.burst(P.pos.x, 1.3, P.pos.z, 8, 4, [2, .2, .1], .22, .4, 8);
  if (P.hp <= 0) { P.hp = 0; playerDie(); }
}

function playerDie() {
  P.dead = true; P.action = null; P.deadT = 0; Sfx.whirlStop(); if (P.whirlFx) { removeFx(P.whirlFx); P.whirlFx = null; }
  state = 'dead';
  later(2.2, () => showOver(false));
}

function updatePlayer(dt) {
  if (P.dead) return;
  P.hp = Math.min(P.maxHp, P.hp + 1.5 * dt); P.mp = Math.min(P.maxMp, P.mp + 5 * dt);
  for (let i = 0; i < 4; i++) {
    if (P.cds[i] > 0) { P.cds[i] -= dt; if (P.cds[i] <= 0) { P.cds[i] = 0; const sl = $('#skills').children[i]; if (sl) { sl.classList.remove('ready'); void sl.offsetWidth; sl.classList.add('ready'); } } }
  }
  P.buff = Math.max(0, P.buff - dt); P.invuln = Math.max(0, P.invuln - dt); P.potionCd = Math.max(0, P.potionCd - dt);
  if (P.target && (P.target.dead || P.target.removed)) P.target = null;

  // 입력 방향
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (joy.id !== null && Math.hypot(joy.x, joy.y) > .15) { mx = joy.x; mz = joy.y; }
  const hasDir = mx || mz;
  if (hasDir) { P.target = null; P.moveTarget = null; }

  if (mouseDown && !IS_TOUCH && !P.target && !hasDir) P.moveTarget = mouseG.clone().setY(0);
  if (P.atkHeld && !P.target) { const e = nearestEnemy(8); if (e) P.target = e; }

  const A = P.action;
  let speed = 5.6, mvx = 0, mvz = 0;
  if (A) {
    A.t += dt; const p = A.t / A.dur;
    if (A.type === 'attack') {
      if (A.target && !A.target.dead) P.face = angLerp(P.face, Math.atan2(A.target.pos.x - P.pos.x, A.target.pos.z - P.pos.z), Math.min(1, dt * 20));
      if (!A.fx && p >= .3) { A.fx = true; slashFx(P.pos, P.face); }
      if (!A.hit && p >= .42) {
        A.hit = true; let n = 0;
        const fx = Math.sin(P.face), fz = Math.cos(P.face);
        for (const e of enemies) {
          if (e.dead || e.buried) continue;
          const ex = e.pos.x - P.pos.x, ez = e.pos.z - P.pos.z, d = Math.hypot(ex, ez);
          if (d > 2.4 + e.r) continue;
          if (d > .6 && (ex * fx + ez * fz) / d < Math.cos(1.25)) continue;
          hitEnemy(e, rand(14, 20), { kb: 4 }); n++;
        }
        if (n) { hitstop = Math.max(hitstop, .045); shake = Math.max(shake, .1); P.mp = Math.min(P.maxMp, P.mp + 3 * n); }
      }
      if (A.t >= A.dur) P.action = null;
    } else if (A.type === 'whirl') {
      speed *= .7; A.tick -= dt;
      if (A.tick <= 0) {
        A.tick = .24; let n = 0;
        for (const e of enemies) if (!e.dead && !e.buried && e.pos.distanceTo(P.pos) < 2.7 + e.r) { hitEnemy(e, rand(9, 13), { kb: 2.5, crit: .1 }); n++; }
        if (n) shake = Math.max(shake, .06);
      }
      for (let k = 0; k < 3; k++) { const a = rand(0, 6.28), r = rand(1.6, 2.6); parts.emit(P.pos.x + Math.cos(a) * r, rand(.6, 1.4), P.pos.z + Math.sin(a) * r, -Math.sin(a) * 8, rand(0, 1), Math.cos(a) * 8, 2.4, 2.2, 1.6, .18, .25, 0, 4); }
      if (Math.random() < .5) parts.emit(P.pos.x + rand(-1.5, 1.5), .1, P.pos.z + rand(-1.5, 1.5), 0, rand(.3, 1), 0, .4, .35, .3, .9, .7, 0, 1);
      if (A.t >= A.dur) { P.action = null; Sfx.whirlStop(); if (P.whirlFx) { removeFx(P.whirlFx); P.whirlFx = null; } P.body.rotation.y = 0; }
    } else if (A.type === 'leap') {
      const k = Math.min(1, p);
      P.pos.lerpVectors(A.from, A.to, easeOut(k * .9 + .1 * k));
      if (A.t >= A.dur) {
        P.action = null; P.pos.copy(A.to);
        Sfx.slam(); shake = Math.max(shake, .55); hitstop = .06;
        ringFx(P.pos.x, P.pos.z, [1.8, 1, .35], 4.2, .5); ringFx(P.pos.x, P.pos.z, [1.2, .5, .2], 2.8, .35);
        crackDecal(P.pos.x, P.pos.z, 3);
        debris.burst(P.pos.x, .2, P.pos.z, 22, 6, 0x4a4038, 1, 1.8);
        for (let q = 0; q < 50; q++) { const a = rand(0, 6.28), sp = rand(2, 7); parts.emit(P.pos.x, .3, P.pos.z, Math.cos(a) * sp, rand(.5, 3), Math.sin(a) * sp, .5, .45, .38, rand(.6, 1.1), rand(.6, 1.1), 1, 2.5, 1.6); }
        parts.burst(P.pos.x, .4, P.pos.z, 30, 8, [2, 1, .35], .18, .45, 12);
        for (const e of enemies) if (!e.dead && !e.buried && e.pos.distanceTo(P.pos) < 3.3 + e.r) hitEnemy(e, rand(32, 46), { kb: 9 });
      }
    } else if (A.type === 'cry' || A.type === 'fissure') {
      if (A.t >= A.dur) P.action = null;
    }
  }

  const canMove = !A || A.type === 'whirl';
  if (canMove) {
    if (hasDir) { const l = Math.hypot(mx, mz); mvx = mx / l; mvz = mz / l; }
    else if (P.target) {
      const d = P.target.pos.distanceTo(P.pos);
      if (d > 1.9 + P.target.r) { mvx = (P.target.pos.x - P.pos.x) / d; mvz = (P.target.pos.z - P.pos.z) / d; }
      else if (!A) { startAttack(P.target); if (!mouseDown && !P.atkHeld) P.target = null; }
    } else if (P.moveTarget) {
      const ddx = P.moveTarget.x - P.pos.x, ddz = P.moveTarget.z - P.pos.z, d = Math.hypot(ddx, ddz);
      if (d > .25) { mvx = ddx / d; mvz = ddz / d; } else P.moveTarget = null;
    } else if (P.atkHeld && !A) startAttack(null);
  }
  P.moving = !!(mvx || mvz);
  if (P.moving) {
    const ox = P.pos.x, oz = P.pos.z;
    moveCol(P.pos, mvx * speed * dt, mvz * speed * dt, P.r);
    if (!A || A.type !== 'whirl') P.face = angLerp(P.face, Math.atan2(mvx, mvz), Math.min(1, dt * 14));
    if (P.moveTarget && Math.hypot(P.pos.x - ox, P.pos.z - oz) < speed * dt * .2) P.moveTarget = null;
  }

  // 함성 버프 오라
  if (P.buff > 0 && Math.random() < dt * 30) { const a = rand(0, 6.28); parts.emit(P.pos.x + Math.cos(a) * .6, rand(.1, .5), P.pos.z + Math.sin(a) * .6, 0, rand(1.5, 2.5), 0, 2.2, 1.5, .4, .25, .9, 0, .5); }

  // 체력 구슬 줍기
  for (const g of globes) if (!g.taken && Math.hypot(g.pos.x - P.pos.x, g.pos.z - P.pos.z) < 1.4) {
    g.taken = true; const h = Math.min(30, P.maxHp - P.hp); P.hp += h; if (h > 0) dmgText(P.pos, 2.4, '+' + Math.round(h), 'heal'); Sfx.orb();
    parts.burst(g.pos.x, .6, g.pos.z, 20, 3, [2.5, .3, .25], .3, .6, -2);
  }

  // 출구
  if (portal && portal.open && P.pos.distanceTo(portal.pos) < 1.6) win();
  else if (portal && !portal.open && P.pos.distanceTo(portal.pos) < 2.2 && !portal.warned) { portal.warned = true; showMsg('봉인된 계단입니다 — 해골 백부장을 처치하세요', 2.5); later(4, () => portal.warned = false); }
}

function animatePlayer(dt) {
  const A = P.action;
  if (P.dead) {
    P.deadT += dt; const k = Math.min(1, P.deadT / .6);
    P.body.rotation.x = -easeOut(k) * Math.PI / 2; P.body.position.y = easeOut(k) * .3;
    P.root.position.set(P.pos.x, 0, P.pos.z); return;
  }
  if (P.moving) P.walkT += dt * 11;
  const sw = Math.sin(P.walkT), mv = P.moving ? 1 : 0, f = Math.min(1, dt * 14);
  let legL = sw * .75 * mv, legR = -sw * .75 * mv, armRx = -.25 + sw * .45 * mv, armLx = -.35 - sw * .35 * mv, armRz = 0, armLz = 0, tY = 0, bodyY = mv ? Math.abs(Math.cos(P.walkT)) * .07 : Math.sin(time * 2) * .015, rootY = 0;
  if (A) {
    const p = A.t / A.dur;
    if (A.type === 'attack') {
      const k = clamp(p / .38, 0, 1), s = clamp((p - .38) / .2, 0, 1), r = clamp((p - .7) / .3, 0, 1);
      tY = lerp(.9 * easeOut(k) - 1.8 * easeOut(s), 0, r);
      armRx = lerp(-1.9 * k + .3 * s, -.25, r); armRz = lerp(-.4 * k, 0, r);
      legL = .35 * (k - r); legR = -.25 * (k - r);
    } else if (A.type === 'whirl') {
      P.body.rotation.y += dt * 24; armRx = -1.55; armRz = -.5; armLx = -1.4; armLz = .5;
    } else if (A.type === 'leap') {
      const k = Math.min(1, p); rootY = Math.sin(k * Math.PI) * 2.6;
      armRx = k < .75 ? -2.9 : lerp(-2.9, -.9, (k - .75) / .25); armLx = -2.4; legL = .9; legR = -.4;
    } else if (A.type === 'cry') {
      const k = Math.sin(Math.min(1, p) * Math.PI); armRx = -2.9 * k - .2; armLx = -2.9 * k - .3; armRz = -.4 * k; armLz = .4 * k;
      P.body.scale.setScalar(1 + k * .08);
    } else if (A.type === 'fissure') {
      const k = clamp(p / .35, 0, 1), s = clamp((p - .35) / .25, 0, 1);
      armRx = lerp(-3.0 * k, -.6, s); tY = .3 * k - .3 * s; legL = .5 * k;
      P.torso.rotation.x = .45 * s;
    }
  }
  if (!A || A.type !== 'cry') P.body.scale.setScalar(1);
  if (!A || A.type !== 'fissure') P.torso.rotation.x = lerp(P.torso.rotation.x, 0, f);
  if (!A || A.type !== 'whirl') P.body.rotation.y = lerp(P.body.rotation.y, 0, f);
  P.legs[0].rotation.x = lerp(P.legs[0].rotation.x, legL, f); P.legs[1].rotation.x = lerp(P.legs[1].rotation.x, legR, f);
  const fa = A && A.type === 'attack' ? 1 : f;
  P.armR.rotation.x = lerp(P.armR.rotation.x, armRx, fa); P.armR.rotation.z = lerp(P.armR.rotation.z, armRz, fa);
  P.armL.rotation.x = lerp(P.armL.rotation.x, armLx, f); P.armL.rotation.z = lerp(P.armL.rotation.z, armLz, f);
  P.torso.rotation.y = lerp(P.torso.rotation.y, tY, A && A.type === 'attack' ? .6 : f);
  P.body.position.y = bodyY;
  P.cape.rotation.x = lerp(P.cape.rotation.x, .12 + mv * .45 + Math.sin(time * 3) * .04 + (A && A.type === 'leap' ? .8 : 0), Math.min(1, dt * 6));
  P.root.position.set(P.pos.x, rootY, P.pos.z);
  P.root.rotation.y = P.face;
  // 함성 중엔 갑옷이 금빛으로
  const glow = P.buff > 0 ? .25 + Math.sin(time * 6) * .08 : 0;
  P.flash[0].emissive.setRGB(glow * 1.2, glow * .8, glow * .2);
}

/* ================= 이펙트 ================= */
function addFx(obj, dur, upd) { scene.add(obj); const f = { obj, t: 0, dur, upd }; fxList.push(f); return f; }
function removeFx(f) { f.t = f.dur = -1; }
function updateFx(dt) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i];
    if (f.dur < 0) { scene.remove(f.obj); disposeObj(f.obj, true); fxList.splice(i, 1); continue; }
    f.t += dt; const p = Math.min(1, f.t / f.dur); f.upd && f.upd(p, dt, f);
    if (f.t >= f.dur && f.dur !== Infinity) { scene.remove(f.obj); disposeObj(f.obj, true); fxList.splice(i, 1); }
  }
}
function later(t, fn) { timers.push({ t, fn }); }
function updateTimers(dt) { for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } } }

const addMat = (col, op = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(...col), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function ringFx(x, z, col, maxR, dur) {
  const m = new THREE.Mesh(GEO.ring, addMat(col)); m.position.set(x, .06, z);
  addFx(m, dur, p => { m.scale.setScalar(.3 + maxR * easeOut(p)); m.material.opacity = 1 - p; });
}
function warnRing(x, z, r, dur) {
  const grp = new THREE.Group(); grp.position.set(x, .05, z);
  const fill = new THREE.Mesh(GEO.circle, addMat([1.6, .1, .05], .25));
  const edge = new THREE.Mesh(GEO.ring, addMat([2.5, .2, .1], .9)); edge.scale.setScalar(r); edge.position.y = .01; grp.add(fill, edge);
  addFx(grp, dur, p => { fill.scale.setScalar(Math.max(.01, r * 2 * p)); fill.material.opacity = .15 + p * .3; });
}
function columnFx(x, z, col) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.8, 1.1, 7, 32, 1, true), addMat(col, .35)); m.position.set(x, 4, z);
  addFx(m, .8, p => { m.scale.set(1 - p * .6, 1, 1 - p * .6); m.material.opacity = .35 * (1 - p); });
}
function crackDecal(x, z, r) {
  const T = makeTextures();
  const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: T.crack, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = rand(0, 6); m.position.set(x, .02, z); m.scale.setScalar(r * 2);
  const g = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: T.glow, color: new THREE.Color(1.3, .45, .08), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.position.z = .01; m.add(g); g.scale.setScalar(.55);
  addFx(m, 4, p => { m.material.opacity = p < .7 ? 1 : 1 - (p - .7) / .3; g.material.opacity = Math.max(0, 1 - p * 4); });
}
function slashFx(pos, face) {
  const grp = new THREE.Group(); grp.position.set(pos.x, 1.05, pos.z);
  grp.rotation.y = Math.atan2(-Math.cos(face), Math.sin(face));
  const outer = new THREE.Mesh(new THREE.RingGeometry(.7, 2.35, 32, 1, -1.1, 2.2), addMat([1.4, 1.15, .8], .4)); outer.rotation.x = -Math.PI / 2;
  const inner = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.4, 32, 1, -1.1, 2.2), addMat([2.4, 2, 1.3], .75)); inner.rotation.x = -Math.PI / 2;
  grp.add(outer, inner);
  addFx(grp, .2, p => { grp.children.forEach(c => { c.rotation.z = lerp(.9, -.9, easeOut(p)); c.material.opacity *= .82; }); grp.scale.setScalar(.9 + p * .2); });
}
function makeWhirlFx() {
  const grp = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(1.0, 2.6, 40, 1, 0, 2.4), addMat([1.3, 1.2, 1.0], .22)); m.rotation.x = -Math.PI / 2; m.rotation.z = k * Math.PI;
    const e = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.65, 40, 1, 0, 2.4), addMat([2, 1.8, 1.4], .45)); e.rotation.x = -Math.PI / 2; e.rotation.z = k * Math.PI;
    grp.add(m, e);
  }
  return addFx(grp, Infinity, (p, dt, f) => {
    grp.position.set(P.pos.x, 1.0, P.pos.z); grp.rotation.y -= dt * 24;
    const fade = Math.min(1, f.t * 6); grp.children.forEach((c, i) => c.material.opacity = (i % 2 ? .45 : .22) * fade);
  });
}
function spikeFx(x, z, k) {
  const s = new THREE.Mesh(GEO.spike, MAT.rock); s.castShadow = true;
  s.position.set(x, 0, z); s.rotation.set(rand(-.25, .25), rand(0, 6), rand(-.25, .25));
  const sc = rand(.8, 1.25) * (1 + k * .03);
  Sfx.spike(); shake = Math.max(shake, .12);
  debris.burst(x, .2, z, 5, 4, 0x4a4038, .7, 1.2);
  parts.burst(x, .3, z, 14, 4, [3, 1.1, .2], .22, .6, 6);
  for (let q = 0; q < 6; q++) parts.emit(x + rand(-.4, .4), .1, z + rand(-.4, .4), 0, rand(.3, 1), 0, .45, .4, .35, .9, .8, 0, 1, 1.4);
  addFx(s, 1.3, p => {
    const t = p * 1.3; let y;
    if (t < .1) y = t / .1 * 1.15; else if (t < .18) y = lerp(1.15, 1, (t - .1) / .08); else if (t < .9) y = 1; else y = 1 - (t - .9) / .4;
    s.scale.set(sc, Math.max(.001, y) * sc, sc); s.position.y = y * sc * .75 - .2;
  }).keepMats = true;
}
function spawnGlobe(x, z) {
  const m = new THREE.Mesh(GEO.globe, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .25, .2) }));
  const halo = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: makeTextures().glow, color: new THREE.Color(1.5, .1, .08), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(1.3); m.add(halo);
  m.position.set(x, .5, z); scene.add(m);
  globes.push({ mesh: m, halo, pos: m.position, t: rand(0, 6), taken: false, vy: 4 });
}
function updateGlobes(dt) {
  for (let i = globes.length - 1; i >= 0; i--) {
    const g = globes[i];
    if (g.taken) { scene.remove(g.mesh); disposeObj(g.mesh, true); globes.splice(i, 1); continue; }
    g.t += dt;
    if (g.vy !== null) { g.pos.y += g.vy * dt; g.vy -= 14 * dt; if (g.pos.y < .45 && g.vy < 0) { g.pos.y = .45; g.vy = null; } }
    else g.pos.y = .45 + Math.sin(g.t * 3) * .08;
    g.halo.quaternion.copy(camera.quaternion);
    if (Math.random() < dt * 6) parts.emit(g.pos.x, g.pos.y, g.pos.z, rand(-.3, .3), rand(.3, .8), rand(-.3, .3), 2, .2, .15, .15, .6, 0, 1);
  }
}

function openPortal() {
  if (!portal || portal.open) return;
  portal.open = true; Sfx.portal();
  portal.pmat.uniforms.uA.value.setRGB(.25, .1, 1.2); portal.pmat.uniforms.uB.value.setRGB(.8, .5, 3);
  portal.rune.material.color.setRGB(.6, .4, 3); portal.light.color.setHex(0x8060ff);
  showMsg('계단의 봉인이 풀렸습니다!', 3);
  ringFx(portal.pos.x, portal.pos.z, [.8, .5, 3], 6, 1);
}
function updatePortal(dt) {
  if (!portal) return;
  const u = portal.pmat.uniforms; u.uTime.value = time;
  u.uPow.value = lerp(u.uPow.value, portal.open ? 1.4 : .55, dt * 2);
  portal.rune.rotation.y += dt * (portal.open ? 1 : .3);
  portal.light.intensity = (portal.open ? 26 : 12) * (1 + Math.sin(time * 4) * .12);
  const d = portal.pos.distanceTo(P.pos);
  if (d < 22 && Math.random() < dt * (portal.open ? 40 : 12)) {
    const a = rand(0, 6.28), r = rand(.3, 1.1), o = portal.grp.position;
    if (portal.open) parts.emit(o.x + Math.cos(a) * r, 1.75 + Math.sin(a) * r * 1.4, o.z + .2, 0, rand(.3, 1.2), rand(.3, 1), .6, .4, 2.5, .25, 1.2, -.3, .3);
    else parts.emit(o.x + rand(-1, 1), .1, o.z + rand(0, 1.5), 0, rand(.5, 1.5), 0, 2.5, .5, .1, .15, 1.2, 0, .3);
  }
}

/* ================= 조명 · 환경 ================= */
function setupLights() {
  scene.background = new THREE.Color(0x050407);
  scene.fog = new THREE.FogExp2(0x060508, .03);
  scene.add(new THREE.HemisphereLight(0x5a5a7a, 0x1a100a, .55));
  moonLight = new THREE.DirectionalLight(0x8a9ad0, 1.0);
  const Q = QUALITY[quality];
  if (Q.shadow) {
    moonLight.castShadow = true; moonLight.shadow.mapSize.set(Q.shadow, Q.shadow);
    const c = moonLight.shadow.camera; c.left = c.bottom = -17; c.right = c.top = 17; c.near = 1; c.far = 60;
    moonLight.shadow.bias = -.0006; moonLight.shadow.normalBias = .03;
  }
  scene.add(moonLight, moonLight.target);
  playerLight = new THREE.PointLight(0xffb070, 30, 16, 1.6); scene.add(playerLight);
  torchLights = [];
  for (let i = 0; i < Q.torches; i++) { const l = new THREE.PointLight(0xff7a2a, 0, 12, 1.6); scene.add(l); torchLights.push({ l, t: null }); }
}
let torchAssignT = 0;
function updateTorches(dt) {
  torchAssignT -= dt;
  if (torchAssignT <= 0) {
    torchAssignT = .3;
    const sorted = torches.map(t => ({ t, d: t.pos.distanceToSquared(P.pos) })).sort((a, b) => a.d - b.d);
    torchLights.forEach((tl, i) => { tl.t = sorted[i] ? sorted[i].t : null; if (tl.t) tl.l.position.copy(tl.t.pos).add(_v.set(0, -.1, .5)); });
  }
  for (const tl of torchLights) {
    if (!tl.t) { tl.l.intensity = 0; continue; }
    const ph = tl.t.ph; tl.l.intensity = 22 * (.82 + .12 * Math.sin(time * 9 + ph) + .08 * Math.sin(time * 23 + ph * 2));
  }
  for (const t of torches) {
    if (t.pos.distanceToSquared(P.pos) > 26 * 26) continue;
    t.acc += dt * 32;
    while (t.acc > 1) { t.acc--; parts.emit(t.pos.x + rand(-.06, .06), t.pos.y, t.pos.z + rand(-.06, .06), rand(-.15, .15), rand(1, 1.8), rand(-.1, .1), 3, rand(1, 1.5), .3, rand(.25, .4), rand(.3, .55), -.5, .5, .05); }
    if (Math.random() < dt * 2) parts.emit(t.pos.x, t.pos.y + .2, t.pos.z, rand(-.3, .3), rand(1.5, 2.5), rand(-.2, .2), 3, 1.4, .3, .06, rand(1, 2), .3, .2, .05);
  }
}
function updateAmbient(dt) {
  if (Math.random() < dt * 14) {
    parts.emit(P.pos.x + rand(-12, 12), rand(.2, 3.5), P.pos.z + rand(-10, 8), rand(-.15, .15), rand(-.05, .1), rand(-.15, .15), .5, .42, .32, rand(.05, .1), rand(3, 6), 0, 0, .05);
  }
}

/* ================= 화면 표시 ================= */
const dmgLayer = $('#dmg-layer'); const dmgPool = []; let dmgIdx = 0;
for (let i = 0; i < 40; i++) { const d = document.createElement('div'); d.className = 'dmg'; d.style.display = 'none'; dmgLayer.appendChild(d); dmgPool.push(d); }
const _p = new THREE.Vector3();
function toScreen(x, y, z) { _p.set(x, y, z).project(camera); return [(_p.x * .5 + .5) * innerWidth, (-_p.y * .5 + .5) * innerHeight, _p.z]; }
function dmgText(pos, h, txt, cls) {
  const [sx, sy] = toScreen(pos.x + rand(-.3, .3), h, pos.z);
  const d = dmgPool[dmgIdx++ % dmgPool.length];
  d.className = 'dmg ' + (cls || ''); d.textContent = txt; d.style.left = sx + 'px'; d.style.top = sy + 'px'; d.style.display = 'block';
  d.style.animation = 'none'; void d.offsetWidth; d.style.animation = '';
}
let msgTimer = null;
function showMsg(t, dur = 2) { const m = $('#msg'); m.textContent = t; m.style.opacity = 1; clearTimeout(msgTimer); msgTimer = setTimeout(() => m.style.opacity = 0, dur * 1000); }

const mm = $('#minimap'), mctx = mm.getContext('2d'); let mmT = 0, expT = 0;
function updateExplore(dt) {
  expT -= dt; if (expT > 0) return; expT = .2;
  const pi = Math.floor(P.pos.x / TILE), pj = Math.floor(P.pos.z / TILE);
  for (let j = pj - 7; j <= pj + 7; j++) for (let i = pi - 8; i <= pi + 8; i++) if (i >= 0 && j >= 0 && i < MW && j < MH) explored[j * MW + i] = 1;
}
function drawMinimap() {
  const s = 3; mctx.clearRect(0, 0, 180, 180);
  mctx.fillStyle = 'rgba(150,120,85,.55)';
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) { const k = j * MW + i; if (explored[k] && G[k]) mctx.fillRect(i * s, j * s, s, s); }
  mctx.fillStyle = 'rgba(80,60,40,.9)';
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) { const k = j * MW + i; if (explored[k] && !G[k] && (walk(i - 1, j) || walk(i + 1, j) || walk(i, j - 1) || walk(i, j + 1))) mctx.fillRect(i * s, j * s, s, s); }
  if (portal) { const i = Math.floor(portal.pos.x / TILE), j = Math.floor(portal.pos.z / TILE); if (explored[j * MW + i]) { mctx.fillStyle = portal.open ? '#9a7aff' : '#ff4020'; mctx.beginPath(); mctx.arc(i * s + 1.5, j * s + 1.5, 4, 0, 7); mctx.fill(); } }
  for (const e of enemies) {
    if (e.dead || e.buried) continue; const i = Math.floor(e.pos.x / TILE), j = Math.floor(e.pos.z / TILE);
    if (!explored[j * MW + i]) continue; mctx.fillStyle = e.cfg.elite ? '#6ab0ff' : '#e03020'; mctx.fillRect(e.pos.x / TILE * s - 1.5, e.pos.z / TILE * s - 1.5, e.cfg.elite ? 4 : 3, e.cfg.elite ? 4 : 3);
  }
  mctx.fillStyle = '#ffe08a'; mctx.beginPath(); mctx.arc(P.pos.x / TILE * s, P.pos.z / TILE * s, 3, 0, 7); mctx.fill();
}

const hpFill = $('#orb-hp .fill'), mpFill = $('#orb-mp .fill'), hpTxt = $('#orb-hp span'), mpTxt = $('#orb-mp span');
function updateHUD(dt) {
  hpFill.style.height = (P.hp / P.maxHp * 100) + '%'; mpFill.style.height = (P.mp / P.maxMp * 100) + '%';
  hpTxt.textContent = Math.ceil(P.hp) + ' / ' + P.maxHp; mpTxt.textContent = Math.floor(P.mp) + ' / ' + P.maxMp;
  $('#low-hp').style.opacity = P.hp / P.maxHp < .3 && !P.dead ? 1 : 0;
  const slots = $('#skills').children;
  for (let i = 0; i < 4; i++) {
    const pc = P.cds[i] / SKILLS[i].cd * 100, low = P.mp < SKILLS[i].cost;
    const sl = slots[i]; sl.querySelector('.cd').style.setProperty('--p', pc + '%'); sl.classList.toggle('lowmp', low);
    sl.querySelector('.cdt').textContent = P.cds[i] > 0 ? Math.ceil(P.cds[i]) : '';
    const tb = $('#tb-s' + i); tb.querySelector('.cd').style.setProperty('--p', pc + '%'); tb.classList.toggle('lowmp', low);
  }
  $('#potion .cnt').textContent = P.potions; $('#tb-pot .cnt').textContent = P.potions;
  mmT -= dt; if (mmT <= 0) { mmT = .15; drawMinimap(); }
  // 보스 체력
  if (elite && !elite.dead && elite.aggro && !elite.buried) {
    const b = $('#boss'); b.classList.remove('hidden'); b.querySelector('.nm').textContent = elite.cfg.name;
    b.querySelector('.fg').style.width = (elite.hp / elite.max * 100) + '%';
  }
  // 적 체력바
  for (const e of enemies) {
    if (e.dead || e.buried || e.cfg.elite || (e.hp >= e.max && e !== hovered)) { if (e.bar.style.display !== 'none') e.bar.style.display = 'none'; continue; }
    const [sx, sy, sz] = toScreen(e.pos.x, 2.2 * e.cfg.scale, e.pos.z);
    if (sz > 1 || sx < -50 || sy < -50 || sx > innerWidth + 50 || sy > innerHeight + 50) { e.bar.style.display = 'none'; continue; }
    e.bar.style.display = 'block'; e.bar.style.transform = `translate(${sx}px,${sy}px)`; e.bar.style.left = '0'; e.bar.style.top = '0';
    e.bar.firstChild.style.width = (e.hp / e.max * 100) + '%';
  }
}

/* ================= 카메라 ================= */
const camOff = new THREE.Vector3(0, 15.5, 11.5), camLook = new THREE.Vector3(), camPos = new THREE.Vector3();
function updateCamera(dt, snap) {
  const adj = camera.aspect < 1 ? 1.45 : 1;
  const target = _v.copy(camOff).multiplyScalar(zoom * adj).add(P.pos);
  if (snap) { camPos.copy(target); camLook.copy(P.pos); }
  camPos.lerp(target, 1 - Math.exp(-dt * 7)); camLook.lerp(P.pos, 1 - Math.exp(-dt * 7));
  camera.position.copy(camPos);
  if (shake > .001) { camera.position.x += (Math.random() - .5) * shake * .9; camera.position.y += (Math.random() - .5) * shake * .9; camera.position.z += (Math.random() - .5) * shake * .6; }
  shake *= Math.exp(-dt * 9);
  camera.lookAt(camLook.x, camLook.y + .6, camLook.z);
  fadeU.uPlayer.value.copy(P.pos);
  playerLight.position.set(P.pos.x, 4.2, P.pos.z + 2.2);
  moonLight.position.set(P.pos.x + 7, 20, P.pos.z + 5); moonLight.target.position.copy(P.pos);
}

/* ================= 입력 ================= */
const canvas = $('#gl');
function updateMouseGround() {
  if (!camera) return;
  const ndc = new THREE.Vector2(mouseX / innerWidth * 2 - 1, -(mouseY / innerHeight) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), mouseG);
}
function pickEnemy(sx, sy) {
  let best = null, bd = 1e9;
  for (const e of enemies) {
    if (e.dead || e.buried) continue;
    const [x, y] = toScreen(e.pos.x, 1.0 * e.cfg.scale, e.pos.z); const d = Math.hypot(x - sx, y - sy);
    const lim = 48 * e.cfg.scale / zoom * (innerHeight / 900);
    if (d < Math.max(lim, 30) && d < bd) { bd = d; best = e; }
  }
  return best;
}
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' || state !== 'play') return;
  if (e.button !== 0) return;
  hasMouse = true; mouseDown = true; mouseX = e.clientX; mouseY = e.clientY; updateMouseGround();
  const en = pickEnemy(mouseX, mouseY);
  if (en) { P.target = en; P.moveTarget = null; }
  else { P.target = null; P.moveTarget = mouseG.clone().setY(0); ringFx(mouseG.x, mouseG.z, [1.5, 1.1, .5], .7, .35); }
});
addEventListener('pointerup', e => { if (e.pointerType !== 'touch') mouseDown = false; });
addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; hasMouse = true; mouseX = e.clientX; mouseY = e.clientY; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { zoom = clamp(zoom + e.deltaY * .0008, .7, 1.35); e.preventDefault(); }, { passive: false });
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state !== 'play') return;
  if (e.code >= 'Digit1' && e.code <= 'Digit4') useSkill(+e.code.slice(5) - 1);
  if (e.code === 'KeyQ') usePotion();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });

// 터치 조작
const joyEl = $('#joy'), joyBase = $('#joy-base'), joyKnob = $('#joy-knob');
joyEl.addEventListener('pointerdown', e => {
  if (joy.id !== null) return; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
  joyBase.style.display = 'block'; joyBase.style.left = e.clientX + 'px'; joyBase.style.top = e.clientY + 'px'; joyKnob.style.transform = '';
  joyEl.setPointerCapture(e.pointerId); Sfx.init();
});
joyEl.addEventListener('pointermove', e => {
  if (e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy), max = 55;
  if (l > max) { dx = dx / l * max; dy = dy / l * max; }
  joy.x = dx / max; joy.y = dy / max; joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
});
const joyEnd = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; joyBase.style.display = 'none'; };
joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
function tbtn(id, down, up) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('down'); el.setPointerCapture(e.pointerId); down(); });
  const u = () => { el.classList.remove('down'); up && up(); };
  el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u);
}
tbtn('#tb-atk', () => { P.atkHeld = true; }, () => { P.atkHeld = false; });
for (let i = 0; i < 4; i++) tbtn('#tb-s' + i, () => useSkill(i));
tbtn('#tb-pot', () => usePotion());

/* ================= UI 구성 ================= */
function buildUI() {
  const sk = $('#skills'); sk.innerHTML = '';
  SKILLS.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'slot';
    d.innerHTML = `<div class="ico">${ICON[s.icon]}</div><div class="nomana"></div><div class="cd"></div><div class="cdt"></div><b>${i + 1}</b><i>${s.cost}</i>
      <div class="tip"><h4>${s.name}</h4>${s.desc}<br><span style="color:#8fb8ff">마나 ${s.cost}</span> · <span style="color:#c9b08a">재사용 ${s.cd}초</span></div>`;
    d.addEventListener('pointerdown', e => { e.stopPropagation(); useSkill(i); });
    sk.appendChild(d);
    $('#tb-s' + i).insertAdjacentHTML('afterbegin', ICON[s.icon]);
  });
  $('#potion .ico').innerHTML = ICON.potion; $('#potion').addEventListener('pointerdown', e => { e.stopPropagation(); usePotion(); });
  $('#tb-pot').insertAdjacentHTML('afterbegin', ICON.potion);
  $('#tb-atk').insertAdjacentHTML('afterbegin', ICON.attack);

  const cls = [
    { n: '전사', d: '근접 · 강인함', ic: ICON.attack, ok: true }, { n: '마법사', d: '원거리 · 원소 마법', ic: ICON.mage },
    { n: '궁수', d: '원거리 · 연사', ic: ICON.archer }, { n: '성기사', d: '근접 · 치유', ic: ICON.paladin }, { n: '네크로맨서', d: '소환 · 저주', ic: ICON.necro }
  ];
  $('#classes').innerHTML = cls.map(c => `<div class="cls ${c.ok ? 'on' : 'lock'}"><div class="ic">${c.ic}</div><div class="n">${c.n}</div><div class="d">${c.d}</div></div>`).join('');
  const qb = document.querySelectorAll('#quality button');
  const setQ = q => { quality = q; qb.forEach(b => b.classList.toggle('on', b.dataset.q === q)); };
  qb.forEach(b => b.addEventListener('click', () => setQ(b.dataset.q))); setQ(quality);
  if (IS_TOUCH) $('#keys-pc').style.display = 'none';
  $('#btn-start').addEventListener('click', () => { Sfx.init(); startGame(); });
  $('#btn-retry').addEventListener('click', () => { Sfx.init(); startGame(); });
  $('#btn-sound').addEventListener('click', e => { Sfx.init(); Sfx.setOn(!Sfx.on); e.target.textContent = Sfx.on ? '🔊' : '🔇'; });
}

/* ================= 게임 흐름 ================= */
function initRenderer() {
  if (renderer) return;
  const Q = QUALITY[quality];
  renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Q.pr); renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = Q.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .5, 120);
  if (Q.bloom) {
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(new THREE.Scene(), camera); composer.addPass(renderPass);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .6, .5, .86); composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }
  makeMaterials(); makeGeos();
  parts = new Particles(5000); debris = new Debris(300);
  clock = new THREE.Clock();
  onResize();
  requestAnimationFrame(loop);
}
function onResize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (composer) composer.setSize(innerWidth, innerHeight);
  parts.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
addEventListener('resize', onResize);

function disposeObj(o, mats) {
  o.traverse(c => {
    if (!c.isMesh) return;
    const shared = Object.values(GEO).includes(c.geometry);
    if (!shared) c.geometry.dispose();
    if (mats !== false && !Object.values(MAT).includes(c.material)) c.material.dispose?.();
  });
}

function startGame() {
  $('#title').classList.add('hidden'); $('#over').classList.add('hidden'); $('#loading').classList.remove('hidden');
  setTimeout(() => {
    initRenderer();
    if (scene) { scene.traverse(o => { if (o.isMesh || o.isInstancedMesh) { if (!Object.values(GEO).includes(o.geometry) && o !== debris.mesh) o.geometry.dispose(); } }); }
    scene = new THREE.Scene(); if (renderPass) renderPass.scene = scene;
    barsLayer.innerHTML = ''; fxList = []; timers = []; globes = []; enemies = []; portal = null; elite = null; parts.n = 0; debris.list = [];
    Sfx.whirlStop();
    setupLights(); buildLevel(); initPlayer();
    scene.add(parts.points, debris.mesh);
    kills = 0; $('#kc').textContent = 0; time = 0; startTime = performance.now(); shake = 0; hovered = null;
    $('#boss').classList.add('hidden');
    computeFlow(); updateCamera(1, true);
    state = 'play';
    $('#loading').classList.add('hidden'); $('#hud').classList.remove('hidden'); $('#touch').classList.toggle('hidden', !IS_TOUCH);
    showMsg('1층 · 지하 묘지', 2.6);
    const help = $('#help');
    help.textContent = IS_TOUCH ? '왼쪽을 끌어 이동 · 오른쪽 버튼으로 공격과 스킬' : '왼쪽 클릭: 이동·공격 (누르고 있으면 계속)  ·  1~4: 스킬  ·  Q: 물약';
    help.style.opacity = 1; setTimeout(() => help.style.opacity = 0, 9000);
  }, 40);
}
function showOver(won) {
  const o = $('#over'); o.classList.remove('hidden', 'dead', 'win'); o.classList.add(won ? 'win' : 'dead');
  const sec = Math.round((performance.now() - startTime) / 1000);
  o.querySelector('h2').textContent = won ? '1층 정복!' : '쓰러졌습니다';
  o.querySelector('p').innerHTML = won
    ? `처치한 적 <b>${kills}</b> · 걸린 시간 <b>${Math.floor(sec / 60)}분 ${sec % 60}초</b><br>더 깊은 곳으로 향하는 계단이 열렸습니다.<br><span style="color:#8a7558">2층 「거미 동굴」은 다음 단계에서 이어집니다.</span>`
    : `처치한 적 <b>${kills}</b><br>성채의 어둠이 당신을 삼켰습니다…`;
  $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden');
}
function win() {
  if (state !== 'play') return; state = 'win'; P.moving = false; Sfx.whirlStop();
  if (P.whirlFx) { removeFx(P.whirlFx); P.whirlFx = null; } P.action = null;
  parts.burst(P.pos.x, 1, P.pos.z, 80, 5, [.8, .5, 3], .4, 1.2, -1);
  ringFx(P.pos.x, P.pos.z, [.8, .5, 3], 4, .8);
  later(.4, () => { P.root.visible = false; }); later(1.4, () => showOver(true));
}

function loop() {
  requestAnimationFrame(loop);
  let dt = Math.min(clock.getDelta(), .05);
  if (!scene) return;
  if (hitstop > 0) { hitstop -= dt; dt *= .1; }
  if (state === 'play' || state === 'dead' || state === 'win') {
    time += dt;
    if (!IS_TOUCH && hasMouse) { updateMouseGround(); hovered = state === 'play' ? pickEnemy(mouseX, mouseY) : null; }
    updateTimers(dt);
    if (state === 'play') updatePlayer(dt);
    animatePlayer(dt);
    computeFlowT -= dt; if (computeFlowT <= 0) { computeFlowT = .25; computeFlow(); }
    for (const e of enemies) updateEnemy(e, dt);
    enemies = enemies.filter(e => !e.removed);
    updateGlobes(dt); updateFx(dt); parts.update(dt); debris.update(dt);
    updateTorches(dt); updateAmbient(dt); updatePortal(dt);
    updateCamera(dt); updateExplore(dt); updateHUD(dt);
  }
  if (composer) composer.render(); else renderer.render(scene, camera);
}
let computeFlowT = 0;

buildUI();
window.__dc = { P, get enemies() { return enemies; }, get state() { return state; }, useSkill, startGame };