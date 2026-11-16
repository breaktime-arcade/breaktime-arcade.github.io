/* ============================================================
   쉬는시간 짝짝! 리듬교실
   - Three.js r160 (WebGL2) 3D 디오라마 + Web Audio 실시간 신스
   - 콜 앤 리스폰스(4박 시범 → 4박 따라치기) 리듬 게임
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ── 작은 도구들 ─────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const midiF = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* ── 게임 상수 ───────────────────────────────────────────── */
const PERFECT_W = 0.045;      // ±45ms
const GOOD_W = 0.095;         // ±95ms
const ROLL_GAP = 0.132;       // 연타 간격
const FEVER_MAX = 100;
const FEVER_DUR = 8;
const STORE_KEY = 'rhythm-echo-class.v1';
const GRADE_LABEL = { PERFECT: 'PERFECT', GOOD: 'GOOD', MISS: 'MISS' };

/* ── 스테이지 정의 ──────────────────────────────────────── */
// 패턴 표기: [박 위치(0~3), 종류, 인자]
//   'tap'  : 한 번 짝!
//   'roll' : 인자 = 두드릴 횟수 (따닥!)
//   'long' : 인자 = 길이(박) — 꾹~
const STAGES = [
  {
    id: 's1', name: '워밍업 교실', label: '스테이지 1', bpm: 95, pairs: 8,
    icon: '🎵', accent: '#4ad6c4', desc: '4분음표 기본 박자',
    patterns: [
      [[0, 'tap'], [1, 'tap'], [2, 'tap'], [3, 'tap']],
      [[0, 'tap'], [1, 'tap'], [2, 'tap']],
      [[0, 'tap'], [1.5, 'tap'], [2, 'tap'], [3, 'tap']],
      [[0, 'tap'], [2, 'tap'], [3, 'tap']],
      [[0, 'tap'], [1, 'tap'], [2, 'roll', 2], [3, 'tap']],
      [[0, 'tap'], [1, 'tap'], [2, 'tap'], [3, 'long', 1]],
      [[0, 'tap'], [1, 'tap'], [1.5, 'tap'], [2, 'tap'], [3, 'tap']],
      [[0, 'tap'], [1, 'roll', 2], [2, 'tap'], [3, 'long', 1]]
    ]
  },
  {
    id: 's2', name: '방과 후 밴드부', label: '스테이지 2', bpm: 112, pairs: 8,
    icon: '🎸', accent: '#a78bfa', desc: '엇박과 연타가 섞여요',
    patterns: [
      [[0, 'tap'], [0.5, 'tap'], [1, 'tap'], [2, 'tap'], [3, 'tap']],
      [[0, 'tap'], [1, 'tap'], [2, 'tap'], [2.5, 'tap'], [3, 'tap']],
      [[0, 'tap'], [1, 'tap'], [2, 'roll', 2], [3, 'roll', 2]],
      [[0, 'tap'], [0.5, 'tap'], [1, 'tap'], [2, 'long', 2]],
      [[0, 'tap'], [1.5, 'tap'], [2, 'tap'], [3, 'tap']],
      [[0, 'tap'], [1, 'tap'], [1.5, 'tap'], [2, 'tap'], [3, 'tap'], [3.5, 'tap']],
      [[0, 'roll', 2], [1, 'tap'], [2, 'tap'], [3, 'long', 1]],
      [[0, 'tap'], [0.5, 'tap'], [1, 'tap'], [1.5, 'tap'], [2, 'tap'], [3, 'roll', 2]]
    ]
  },
  {
    id: 's3', name: '축제 응원단', label: '스테이지 3', bpm: 128, pairs: 8,
    icon: '🥁', accent: '#ff6b7a', desc: '16분박과 3연타까지',
    patterns: [
      [[0, 'tap'], [0.5, 'tap'], [1, 'tap'], [1.5, 'tap'], [2, 'tap'], [3, 'tap']],
      [[0, 'tap'], [2, 'tap'], [2.5, 'tap'], [3, 'tap']],
      [[0, 'tap'], [0.5, 'tap'], [1, 'roll', 3], [2, 'tap'], [3, 'tap']],
      [[0, 'tap'], [1, 'tap'], [2, 'long', 2]],
      [[0, 'tap'], [1.5, 'tap'], [2, 'tap'], [2.5, 'tap'], [3, 'tap']],
      [[0, 'tap'], [0.5, 'tap'], [1, 'tap'], [2, 'roll', 3], [3, 'tap']],
      [[0, 'tap'], [1, 'tap'], [1.5, 'tap'], [2, 'tap'], [2.5, 'tap'], [3, 'long', 1]],
      [[0, 'roll', 2], [0.5, 'tap'], [1, 'tap'], [1.5, 'tap'], [2, 'roll', 2], [3, 'tap'], [3.5, 'tap']]
    ]
  }
];
const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));

/* ── 4인 대결 상수 ──────────────────────────────────────── */
const DUEL_BPM = 110;
const DUEL_PAIRS = 8;
const DUEL_3D = [0xff6b7a, 0x4ad6c4, 0xa78bfa, 0xffcf5c];
const DUEL_CSS = ['#ff6b7a', '#4ad6c4', '#a78bfa', '#ffcf5c'];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── 저장 ───────────────────────────────────────────────── */
const Store = {
  data: { best: {}, sync: 0, muted: false, cleared: {}, encoreBest: 0, encoreWave: 0 },
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        this.data = Object.assign(this.data, p || {});
        this.data.best = this.data.best || {};
        this.data.cleared = this.data.cleared || {};
      }
    } catch (e) { /* 저장소를 못 쓰는 환경도 있어요 */ }
    return this.data;
  },
  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { /* 무시 */ }
  }
};

/* ── Web Audio 신스 엔진 ─────────────────────────────────── */
const Audio = {
  ctx: null, master: null, comp: null, verb: null, noise: null, muted: false,

  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.82;
    master.connect(comp);
    comp.connect(ctx.destination);

    const verb = ctx.createConvolver();
    verb.buffer = this.makeImpulse(ctx, 1.4, 2.4);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.15;
    verb.connect(verbGain);
    verbGain.connect(master);

    this.ctx = ctx;
    this.master = master;
    this.comp = comp;
    this.verb = verb;
    this.noise = this.makeNoise(ctx, 2.2);
    return ctx;
  },

  get now() { return this.ctx ? this.ctx.currentTime : 0; },

  resume() {
    this.init();
    if (this.ctx.state === 'suspended') return this.ctx.resume().catch(() => {});
    return Promise.resolve();
  },

  setMuted(m) {
    this.muted = !!m;
    if (this.master) {
      const t = this.now;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.82, t, 0.03);
    }
  },

  makeNoise(ctx, sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },

  makeImpulse(ctx, sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const x = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, decay) * (i < 30 ? i / 30 : 1);
      }
    }
    return buf;
  },

  /* 출력 버스 연결 (드라이 + 리버브 센드) */
  out(node, send = 0.18) {
    node.connect(this.master);
    if (send > 0 && this.verb) {
      const s = this.ctx.createGain();
      s.gain.value = send;
      node.connect(s);
      s.connect(this.verb);
    }
  },

  noiseSrc(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
    return src;
  },

  /* 드럼 */
  kick(t, g = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(148, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.9 * g, t + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(gn); this.out(gn, 0.05);
    o.start(t); o.stop(t + 0.36);
    // 클릭감
    const n = this.noiseSrc(t, 0.02);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.16 * g, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    n.connect(hp); hp.connect(ng); this.out(ng, 0);
  },

  snare(t, g = 1) {
    const ctx = this.ctx;
    const n = this.noiseSrc(t, 0.22);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.34 * g, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    n.connect(bp); bp.connect(ng); this.out(ng, 0.2);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(196, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.22 * g, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(og); this.out(og, 0.1);
    o.start(t); o.stop(t + 0.14);
  },

  hat(t, g = 0.5, open = false) {
    const ctx = this.ctx;
    const dur = open ? 0.22 : 0.045;
    const n = this.noiseSrc(t, dur);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.14 * g, t + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp); hp.connect(ng); this.out(ng, 0.06);
  },

  clap(t, g = 1) {
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      const n = this.noiseSrc(tt, 0.12);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500 + i * 220; bp.Q.value = 1.1;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, tt);
      ng.gain.exponentialRampToValueAtTime(0.20 * g, tt + 0.003);
      ng.gain.exponentialRampToValueAtTime(0.0001, tt + (i === 2 ? 0.12 : 0.045));
      n.connect(bp); bp.connect(ng); this.out(ng, 0.25);
    }
  },

  wood(t, f = 1180, g = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(f, t);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2.01, t);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.24 * g, t + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
    o.connect(lp); o2.connect(lp); lp.connect(gn); this.out(gn, 0.12);
    o.start(t); o.stop(t + 0.09); o2.start(t); o2.stop(t + 0.09);
  },

  tom(t, f = 190, g = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.5 * g, t + 0.004);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(gn); this.out(gn, 0.18);
    o.start(t); o.stop(t + 0.22);
  },

  marimba(t, f, g = 1, dur = 0.5) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 4.01;
    const g2 = ctx.createGain(); g2.gain.value = 0.16;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.19 * g, t + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); o2.connect(g2); g2.connect(gn);
    this.out(gn, 0.3);
    o.start(t); o.stop(t + dur + 0.02); o2.start(t); o2.stop(t + dur * 0.5);
  },

  bass(t, f, dur = 0.4, g = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f / 2;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.30 * g, t + 0.015);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    o.connect(lp); o2.connect(lp); lp.connect(gn);
    this.out(gn, 0.08);
    o.start(t); o.stop(t + dur + 0.02); o2.start(t); o2.stop(t + dur + 0.02);
  },

  chord(t, freqs, dur = 1.2, g = 1) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.075 * g, t + 0.05);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(gn); this.out(gn, 0.4);
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.02);
    });
  },

  bell(t, f, g = 1) {
    const ctx = this.ctx;
    [1, 2.01, 3.03].forEach((mult, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime((0.11 / (i + 1)) * g, t + 0.005);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.8 / (i + 1));
      o.connect(gn); this.out(gn, 0.5);
      o.start(t); o.stop(t + 0.9);
    });
  },

  /* 롱노트 유지음 — 노드를 돌려주고 stop() 으로 끊어요 */
  hold(t, f, dur, g = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 1.005;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(2400, t + Math.min(0.4, dur));
    lp.frequency.linearRampToValueAtTime(1100, t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.13 * g, t + 0.05);
    gn.gain.setValueAtTime(0.13 * g, t + Math.max(0.06, dur - 0.12));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    o.connect(lp); o2.connect(lp); lp.connect(gn);
    this.out(gn, 0.35);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.2); o2.stop(t + dur + 0.2);
    return { stop: (at) => { try { gn.gain.cancelScheduledValues(at); gn.gain.setTargetAtTime(0.0001, at, 0.03); } catch (e) { /* 무시 */ } } };
  },

  miss() {
    const t = this.now;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(gn); this.out(gn, 0.2);
    o.start(t); o.stop(t + 0.24);
  },

  /* 화면 전환 등 UI 효과음 */
  ui(kind) {
    if (!this.ctx) return;
    const t = this.now + 0.01;
    if (kind === 'ok') this.bell(t, 880, 0.7);
    else if (kind === 'start') { this.marimba(t, 660, 0.8, 0.4); this.marimba(t + 0.09, 990, 0.7, 0.4); }
    else if (kind === 'tap') this.wood(t, 1400, 0.35);
  }
};

/* ── 게임 상태 ───────────────────────────────────────────── */
const S = {
  mode: 'title',           // title | play | paused | result
  def: null, stageIndex: 0, encore: false,
  playing: false, paused: false,
  beatDur: 0.5, t0: 0, endT: 0,
  segments: [], events: [], cursor: 0,
  notes: [], noteScan: 0,
  pairsData: [], pairIndex: 0,
  phase: 'idle', curPairAbs: -1, stripCells: [],
  callHits: [], callCursor: 0,
  combo: 0, maxCombo: 0, score: 0,
  stats: { perfect: 0, good: 0, miss: 0, total: 0 },
  fever: 0, feverUntil: 0, feverOn: false,
  syncMs: 0, encoreMissLimit: 10,
  wave: 0, waveBpm: 132,
  holding: null, holdNode: null,
  judgeTimer: 0, lastJudge: null,
  clear: false, resultShown: false, frozen: false,
  /* 4인 대결 */
  duel: false, seat: 0, duelPlayers: [], duelRank: null, duelHost: false, duelNote: ''
};

const CHORD_ROOTS = [48, 55, 45, 41];               // C  G  Am  F
const CHORD_TONES = [[60, 64, 67], [67, 71, 74], [57, 60, 64], [53, 57, 60]];
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

/* ── 트랙 만들기 ─────────────────────────────────────────── */
function newTrack() {
  S.events = [];
  S.notes = [];
  S.pairsData = [];
  S.segments = [];
  S.cursor = 0;
  S.noteScan = 0;
  S.callHits = [];
  S.callCursor = 0;
  S.pairsData = [];
  S.holding = null;
  S.holdNode = null;
  S.combo = 0; S.maxCombo = 0; S.score = 0;
  S.stats = { perfect: 0, good: 0, miss: 0, total: 0 };
  S.fever = 0; S.feverUntil = 0; S.feverOn = false;
  S.curPairAbs = -1;
  S.resultShown = false;
  S.clear = false;
}

/* 한 쌍(시범 4박 + 따라치기 4박)을 트랙에 넣어요 */
function addPair(pat, callT, replyT, beatDur, pairAbs, chordIdx) {
  const root = CHORD_ROOTS[chordIdx % 4];
  const tones = CHORD_TONES[chordIdx % 4];

  /* 반주 (8박) */
  for (let b = 0; b < 8; b++) {
    const t = callT + b * beatDur;
    const inBar = b % 4;
    if (inBar === 0 || inBar === 2) S.events.push({ t, k: 'kick', g: inBar === 0 ? 0.95 : 0.78 });
    if (inBar === 1 || inBar === 3) S.events.push({ t, k: 'snare', g: 0.8 });
    S.events.push({ t: t + beatDur * 0.5, k: 'hat', g: 0.4 });
    if (inBar === 0) {
      S.events.push({ t, k: 'hat', g: 0.5 });
      S.events.push({ t, k: 'bass', f: midiF(root), dur: beatDur * 0.9, g: 0.9 });
      S.events.push({ t, k: 'chord', f: tones.map(midiF), dur: beatDur * 3.5, g: 0.65 });
    }
    if (inBar === 2) S.events.push({ t, k: 'bass', f: midiF(root + 7), dur: beatDur * 0.6, g: 0.5 });
  }

  /* 선생님 시범 */
  pat.forEach((n, i) => {
    const [off, kind] = n;
    const t = callT + off * beatDur;
    const tone = tones[i % tones.length] + (i >= tones.length ? 12 : 0);
    if (kind === 'roll') {
      const hits = n[2] || 2;
      for (let h = 0; h < hits; h++) {
        const tt = t + h * ROLL_GAP;
        S.events.push({ t: tt, k: 'clap', g: 0.85 });
        S.events.push({ t: tt, k: 'wood', f: 1150 + h * 90, g: 0.8 });
      }
      S.events.push({ t, k: 'marimba', f: midiF(tone + 12), g: 0.75, dur: 0.35 });
    } else if (kind === 'long') {
      const beats = n[2] || 1;
      S.events.push({ t, k: 'clap', g: 0.9 });
      S.events.push({ t, k: 'wood', f: 980, g: 0.7 });
      S.events.push({ t, k: 'hold', f: midiF(tone + 12), dur: beats * beatDur, g: 0.75 });
    } else {
      S.events.push({ t, k: 'clap', g: 0.9 });
      S.events.push({ t, k: 'wood', f: 1180, g: 0.8 });
      S.events.push({ t, k: 'marimba', f: midiF(tone + 12), g: 0.8, dur: 0.4 });
    }
    S.callHits.push({ t, slot: Math.round(off * 2), kind, pairAbs });
  });

  /* 플레이어가 따라 칠 노트 */
  pat.forEach((n) => {
    const [off, kind] = n;
    const t = replyT + off * beatDur;
    const note = {
      t, type: kind, slot: Math.round(off * 2), pairAbs,
      hits: kind === 'roll' ? (n[2] || 2) : 1,
      dur: kind === 'long' ? (n[2] || 1) * beatDur : 0,
      sub: 0, judged: false, holding: false, headGrade: null, holdStart: 0
    };
    S.notes.push(note);
  });

  S.pairsData[pairAbs] = { pat, callT, replyT };
}

function buildStage(def) {
  newTrack();
  S.def = def;
  S.encore = false;
  S.beatDur = 60 / def.bpm;
  const now = Audio.now;
  S.t0 = now + 0.85;
  const bd = S.beatDur;

  /* 카운트인 4박 */
  for (let i = 0; i < 4; i++) {
    S.events.push({ t: S.t0 + i * bd, k: 'tick', accent: i === 0 });
  }

  const beats = def.pairs * 8;
  S.segments = [{ startT: S.t0, beatDur: bd, beats, countIn: 4, pairBase: 0 }];

  for (let p = 0; p < def.pairs; p++) {
    const callT = S.t0 + (4 + p * 8) * bd;
    const replyT = callT + 4 * bd;
    addPair(def.patterns[p], callT, replyT, bd, p, p);
  }

  /* 마무리 코드 */
  const endT = S.t0 + (4 + beats + 2) * bd;
  S.events.push({ t: endT - 2 * bd, k: 'chord', f: CHORD_TONES[0].map(midiF), dur: bd * 2.4, g: 0.8 });
  S.events.push({ t: endT - 2 * bd, k: 'kick', g: 1 });
  S.events.push({ t: endT, k: 'bell', f: 1046, g: 0.7 });
  S.endT = endT + 0.4;
  S.pairIndex = 1;
  S.phase = 'count';

  S.events.sort((a, b) => a.t - b.t);
  S.notes.sort((a, b) => a.t - b.t);
  S.callHits.sort((a, b) => a.t - b.t);
  S.mode = 'play';
  S.playing = true;
  S.paused = false;
}

/* ── 무한 앙코르 ─────────────────────────────────────────── */
function encorePattern(wave, idx) {
  const rng = mulberry32(9001 + wave * 131 + idx * 17);
  const dense = Math.min(0.28 + wave * 0.055, 0.72);
  const slots = [];
  for (let i = 0; i < 8; i++) {
    if (i === 0 || rng() < dense) slots.push(i);
  }
  if (slots.length < 4) { slots.length = 0; [0, 4, 6, 7].forEach((s) => slots.push(s)); }
  if (slots.length > 7) slots.length = 7;
  const pat = [];
  slots.forEach((s, i) => {
    const off = s / 2;
    let kind = 'tap';
    if (wave >= 1 && i === 2 && rng() < 0.5) kind = 'roll';
    if (wave >= 2 && i === slots.length - 2 && rng() < 0.55) kind = 'long';
    if (kind === 'roll') pat.push([off, 'roll', 2 + (wave >= 4 && rng() < 0.5 ? 1 : 0)]);
    else if (kind === 'long') pat.push([off, 'long', Math.min(2, 4 - off)]);
    else pat.push([off, 'tap']);
  });
  return pat;
}

function startEncore() {
  newTrack();
  S.encore = true;
  S.def = { id: 'enc', name: '무한 앙코르', label: '앙코르', bpm: 132, pairs: 4, icon: '✨', desc: '끝없이 빨라져요' };
  S.stageIndex = -1;
  S.beatDur = 60 / 132;
  S.t0 = Audio.now + 0.85;
  const bd = S.beatDur;
  for (let i = 0; i < 4; i++) S.events.push({ t: S.t0 + i * bd, k: 'tick', accent: i === 0 });
  S.segments = [];
  S.wave = 0;
  S.waveBpm = 132;
  S.pairIndex = 1;
  S.phase = 'count';
  S.mode = 'play';
  S.playing = true;
  S.paused = false;
  appendWave(true);
  S.endT = S.segments[0].startT;
  refreshEndT();
}

function appendWave(first) {
  const wave = first ? 0 : S.wave;
  const bpm = Math.min(132 + wave * 6, 168);
  const bd = 60 / bpm;
  const last = S.segments[S.segments.length - 1];
  const startT = last ? last.startT + (last.countIn + last.beats) * last.beatDur : S.t0;
  const countIn = first ? 4 : 0;
  const beats = 32;
  const pairBase = S.pairsData.length;
  S.segments.push({ startT, beatDur: bd, beats, countIn, pairBase, wave });
  for (let p = 0; p < 4; p++) {
    const callT = startT + (countIn + p * 8) * bd;
    const replyT = callT + 4 * bd;
    addPair(encorePattern(wave, p), callT, replyT, bd, pairBase + p, wave + p);
  }
  S.wave = wave + 1;
  S.waveBpm = Math.min(132 + S.wave * 6, 168);
  S.events.sort((a, b) => a.t - b.t);
  S.notes.sort((a, b) => a.t - b.t);
  S.callHits.sort((a, b) => a.t - b.t);
  refreshEndT();
}

function refreshEndT() {
  const last = S.segments[S.segments.length - 1];
  S.endT = last.startT + (last.countIn + last.beats) * last.beatDur + 1.2;
}

/* ── 4인 실시간 대결 ─────────────────────────────────────
   방장이 정한 seed만 있으면 모든 기기가 같은 박자 패턴을 스스로 만든다. */
function duelPattern(rng, t) {
  const slots = [];
  const dens = 0.42 + t * 0.34;
  for (let i = 0; i < 8; i++) if (i === 0 || rng() < dens) slots.push(i);
  if (slots.length < 4) { slots.length = 0; [0, 2, 4, 6].forEach((s) => slots.push(s)); }
  if (slots.length > 7) slots.length = 7;
  const pat = [];
  slots.forEach((s, i) => {
    const off = s / 2;
    const r = rng();
    let kind = 'tap';
    if (off <= 2.5 && t > 0.45 && i === slots.length - 1 && r < 0.5) kind = 'long';
    else if (t > 0.22 && i > 0 && r < 0.2 + t * 0.22) kind = 'roll';
    if (kind === 'roll') pat.push([off, 'roll', t > 0.72 && r < 0.22 ? 3 : 2]);
    else if (kind === 'long') pat.push([off, 'long', Math.max(1, Math.min(2, 4 - off))]);
    else pat.push([off, 'tap']);
  });
  return pat;
}

function buildDuelTrack(seed, bpm, pairs, t0) {
  newTrack();
  S.duel = true;
  S.encore = false;
  S.stageIndex = -1;
  S.def = { id: 'duel', name: '4인 대결', label: '대결', bpm, pairs, icon: '👥', desc: '실시간 대결' };
  S.beatDur = 60 / bpm;
  S.t0 = t0;
  const bd = S.beatDur;
  for (let i = 0; i < 4; i++) S.events.push({ t: t0 + i * bd, k: 'tick', accent: i === 0 });
  S.segments = [{ startT: t0, beatDur: bd, beats: pairs * 8, countIn: 4, pairBase: 0 }];
  for (let p = 0; p < pairs; p++) {
    const rng = mulberry32((seed ^ Math.imul(p + 1, 2654435761)) >>> 0);
    const pat = duelPattern(rng, pairs > 1 ? p / (pairs - 1) : 0);
    const callT = t0 + (4 + p * 8) * bd;
    addPair(pat, callT, callT + 4 * bd, bd, p, p);
  }
  const endT = t0 + (4 + pairs * 8 + 2) * bd;
  S.events.push({ t: endT - 2 * bd, k: 'chord', f: CHORD_TONES[0].map(midiF), dur: bd * 2.4, g: 0.8 });
  S.events.push({ t: endT - 2 * bd, k: 'kick', g: 1 });
  S.events.push({ t: endT, k: 'bell', f: 1046, g: 0.7 });
  S.endT = endT + 0.4;
  S.pairIndex = 1;
  S.phase = 'count';
  S.events.sort((a, b) => a.t - b.t);
  S.notes.sort((a, b) => a.t - b.t);
  S.callHits.sort((a, b) => a.t - b.t);
  S.mode = 'play';
  S.playing = true;
  S.paused = false;
}

function duelStatsPayload() {
  const st = S.stats;
  const tot = st.total;
  const acc = tot ? Math.round(((st.perfect + st.good * 0.6) / tot) * 1000) : 0;
  return {
    sc: S.score, cb: S.combo, mx: S.maxCombo, ac: acc,
    pr: st.perfect, gd: st.good, ms: st.miss,
    jd: S.lastJudge || '', jt: Date.now(), done: false
  };
}

function startDuelRound(msg) {
  if (!ready) return;
  Audio.resume();
  const lead = Math.max(0, (msg.startAt - (window.RhythmDuel ? RhythmDuel.now() : Date.now())) / 1000);
  const t0 = Audio.now + lead + 0.2;
  S.seat = msg.me ? (msg.me.seat | 0) : 0;
  S.duelHost = !!msg.host;
  S.duelPlayers = msg.players || [];
  S.resultShown = false;
  buildDuelTrack(msg.seed | 0, msg.bpm || DUEL_BPM, msg.pairs || DUEL_PAIRS, t0);
  prepareUiForPlay();
  prepareDuelUi(msg.roster || []);
  resetSceneForStage();
  layoutDuelChars();
  startScheduler();
  if (window.RhythmDuel) {
    try { RhythmDuel.setChart({ notes: S.notes.length, dur: S.endT - t0 }); } catch (e) { /* 무시 */ }
  }
}

async function finishDuel(reason) {
  if (S.resultShown) return;
  S.resultShown = true;
  S.playing = false;
  stopScheduler();
  endFever();
  if (S.holdNode) { try { S.holdNode.stop(Audio.now); } catch (e) { /* 무시 */ } S.holdNode = null; }
  if (S.holding) { S.holding.holding = false; S.holding = null; }
  showHud(false);

  const payload = duelStatsPayload();
  payload.done = true;
  let ranking = [];
  let note = '';
  try {
    const res = window.RhythmDuel
      ? await RhythmDuel.finishRound(payload)
      : { ranking: [], note: '' };
    ranking = (res && res.ranking) || [];
    note = (res && res.note) || '';
  } catch (e) {
    console.error(e);
  }
  if (reason === 'roomlost') note = '방이 닫혔어요 · 지금까지의 점수로 순위를 매겼어요';
  renderDuelResult(ranking, note);
}

function renderDuelResult(ranking, note) {
  S.mode = 'result';
  S.duelRank = ranking;
  const acc = S.stats.total ? (S.stats.perfect + S.stats.good * 0.6) / S.stats.total : 0;
  const mine = ranking.find((r) => r.me) || {
    rank: ranking.length, score: S.score, acc: Math.round(acc * 100), maxCombo: S.maxCombo
  };
  const myRank = mine.rank || 1;
  const badge = $('rankBadge');
  badge.className = 'rankBadge ' + (myRank === 1 ? 'S' : myRank === 2 ? 'A' : myRank === 3 ? 'B' : 'C');
  $('rankLetter').textContent = String(myRank);
  $('rankLabel').textContent = '위 / ' + (ranking.length || 1);
  $('resultTitle').textContent = '대결 결과!';
  const winner = ranking[0];
  $('resultSub').textContent = winner
    ? (winner.score > 0 ? '🏆 ' + winner.nm + ' 우승! (정확도 ' + winner.acc + '%)' : '아무도 박자를 잡지 못했어요… 한 번 더!')
    : '기록을 모으지 못했어요';
  $('scoreVal').textContent = (mine.score != null ? mine.score : S.score).toLocaleString();
  $('bestDelta').textContent = myRank === 1 ? 'WINNER!' : '';
  $('accResult').textContent = (mine.acc != null ? mine.acc : Math.round(acc * 100)) + '%';
  $('comboResult').textContent = mine.maxCombo != null ? mine.maxCombo : S.maxCombo;
  $('perfectResult').textContent = S.stats.perfect;
  $('missResult').textContent = S.stats.miss;

  const table = $('duelTable');
  table.innerHTML =
    '<div class="row head"><span class="rk">#</span><span class="nm">이름</span><span class="sc">점수</span><span class="ac">정확도</span><span class="cb">콤보</span></div>' +
    (ranking.length ? ranking.map((r) =>
      '<div class="row' + (r.me ? ' me' : '') + (r.out ? ' out' : '') + '">' +
        '<span class="rk">' + r.rank + '</span>' +
        '<span class="nm"><i class="dot" style="background:' + DUEL_CSS[r.seat] + '"></i>' + esc(r.nm) +
          (r.me ? ' (나)' : '') + (r.out ? ' · 나감' : '') + '</span>' +
        '<span class="sc">' + (r.score || 0).toLocaleString() + '</span>' +
        '<span class="ac">' + (r.acc || 0) + '%</span>' +
        '<span class="cb">' + (r.maxCombo || 0) + '</span>' +
      '</div>').join('')
      : '<div class="row"><span class="nm">참가자 기록이 없어요</span></div>');
  $('duelResultNote').textContent = note || '';

  document.querySelector('.stats').classList.add('hidden');
  $('duelResultWrap').classList.remove('hidden');
  $('btnRetry').textContent = '다시 하기';
  $('btnNext').classList.add('hidden');
  $('btnHome').textContent = '나가기';
  $('duelBoard').classList.add('hidden');
  $('duelTags').classList.add('hidden');
  $('btnPause').classList.remove('hidden');
  showScreen('result');
  if (myRank === 1) Audio.bell(Audio.now + 0.05, 1318, 0.85);
  else Audio.bell(Audio.now + 0.05, 880, 0.6);
}

function setStageIcon(txt) {
  const c = document.querySelector('#hudTop .chip .ci');
  if (!c) return;
  c.textContent = txt;
  c.style.display = txt ? '' : 'none';
}

function prepareDuelUi(roster) {
  $('hudStage').textContent = '4인 대결';
  setStageIcon('');
  const pb = $('btnPause');
  pb.textContent = '✕';
  pb.title = '대결 나가기';
  pb.setAttribute('aria-label', '대결 나가기');
  $('turnTag').style.top = 'calc(76px + var(--safe-t))';
  $('hudPair').textContent = '1';
  $('hudPairMax').textContent = '/ ' + (S.def ? S.def.pairs : DUEL_PAIRS) + ' 마디';
  $('duelResultWrap').classList.add('hidden');
  $('duelResultWrap').classList.add('hidden');
  document.querySelector('.stats').classList.remove('hidden');
  $('btnHome').textContent = '교실로';
  $('btnRetry').textContent = '다시 하기';
  $('duelBoard').classList.remove('hidden');
  $('duelTags').classList.remove('hidden');
  if (!duelChars.length) buildDuelChars();
  if (!duelTagEls.length) buildDuelTags();
  const seats = new Set((roster || []).map((r) => r.seat | 0));
  duelChars.forEach((c, i) => { c.visibleSeat = seats.has(i); c.group.visible = seats.has(i); c.swing = 0; });
  layoutDuelChars();
}

function resetDuelUi() {
  S.duel = false;
  setStageIcon('🎼');
  const pb = $('btnPause');
  pb.textContent = '❚❚';
  pb.title = '일시정지';
  pb.setAttribute('aria-label', '일시정지');
  $('turnTag').style.top = '';
  S.duelPlayers = [];
  S.duelRank = null;
  S.duelNote = '';
  ['duelBoard', 'duelTags', 'duelResultWrap'].forEach((id) => { const el = $(id); if (el) el.classList.add('hidden'); });
  const st = document.querySelector('.stats');
  if (st) st.classList.remove('hidden');
  $('btnPause').classList.remove('hidden');
  $('btnHome').textContent = '교실로';
  $('btnRetry').textContent = S.encore ? '한 번 더' : '다시 하기';
  $('duelTable').innerHTML = '';
  $('duelResultNote').textContent = '';
  duelChars.forEach((c) => { c.group.visible = false; });
  if (playerChar) playerChar.group.visible = true;
}

function duelExit() {
  if (window.RhythmDuel) RhythmDuel.leave();
  resetDuelUi();
  S.mode = 'title';
}

/* 실시간 순위판 · 캐릭터 위 이름표 */
let boardLast = 0;
function renderDuelBoard(force) {
  if (!S.duel) return;
  const nowMs = performance.now();
  if (!force && nowMs - boardLast < 220) return;
  boardLast = nowMs;
  const list = (S.duelPlayers || []).slice().sort((a, b) => (b.score - a.score) || (b.acc - a.acc) || (a.seat - b.seat));
  $('duelBoard').innerHTML = list.map((p, i) =>
    '<div class="dr' + (i === 0 ? ' first' : '') + (p.me ? ' me' : '') + (p.out ? ' out' : '') + '">' +
      '<span class="rk">' + (i + 1) + '</span>' +
      '<span class="dot" style="background:' + DUEL_CSS[p.seat] + '"></span>' +
      '<span class="nm">' + esc(p.nm) + '</span>' +
      '<span class="sc">' + (p.score || 0).toLocaleString() + '</span>' +
    '</div>').join('');
}

const duelProj = new THREE.Vector3();
function updateDuelTags() {
  if (!S.duel || !duelTagEls.length) return;
  const bySeat = {};
  (S.duelPlayers || []).forEach((p) => { bySeat[p.seat] = p; });
  const w = window.innerWidth, h = window.innerHeight;
  duelChars.forEach((c, i) => {
    const t = duelTagEls[i];
    const p = bySeat[i];
    if (!t) return;
    if (!p || !c.group.visible) { t.el.style.display = 'none'; return; }
    duelProj.set(c.group.position.x, 1.58 * (c.scale0 || 1) + 0.12, c.group.position.z).project(camera);
    if (duelProj.z > 1) { t.el.style.display = 'none'; return; }
    t.el.style.display = '';
    const x = (duelProj.x * 0.5 + 0.5) * w;
    const y = (-duelProj.y * 0.5 + 0.5) * h;
    t.el.style.transform = 'translate(-50%,-100%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    if (t.last.nm !== p.nm) { t.nm.textContent = p.nm; t.last.nm = p.nm; }
    if (t.last.sc !== p.score) { t.sc.textContent = (p.score || 0).toLocaleString(); t.last.sc = p.score; }
    t.el.classList.toggle('me', !!p.me);
    t.el.classList.toggle('out', !!p.out);
    if (t.last.jt !== p.judgeAt) {
      t.last.jt = p.judgeAt;
      if (p.lastJudge) {
        t.jd.textContent = p.lastJudge;
        t.jd.className = 'jd ' + p.lastJudge;
        clearTimeout(t.timer);
        t.timer = setTimeout(() => { t.jd.textContent = ''; t.jd.className = 'jd'; }, 620);
        c.swing = 1;
      }
    }
  });
}

/* ── 스케줄러 (오디오 시계 기준 lookahead) ───────────────── */
let schedTimer = 0;
function startScheduler() {
  if (schedTimer) return;
  schedTimer = setInterval(() => {
    if (!S.playing || S.paused) return;
    const now = Audio.now;
    const horizon = now + 0.2;
    while (S.cursor < S.events.length && S.events[S.cursor].t < horizon) {
      const e = S.events[S.cursor++];
      if (e.t < now - 0.35) continue;
      playEvent(e, Math.max(e.t, now + 0.005));
    }
  }, 25);
}
function stopScheduler() {
  if (schedTimer) { clearInterval(schedTimer); schedTimer = 0; }
}

function playEvent(e, t) {
  switch (e.k) {
    case 'kick': Audio.kick(t, e.g); break;
    case 'snare': Audio.snare(t, e.g); break;
    case 'hat': Audio.hat(t, e.g); break;
    case 'clap': Audio.clap(t, e.g); break;
    case 'wood': Audio.wood(t, e.f, e.g); break;
    case 'tom': Audio.tom(t, e.f, e.g); break;
    case 'marimba': Audio.marimba(t, e.f, e.g, e.dur || 0.5); break;
    case 'bass': Audio.bass(t, e.f, e.dur, e.g); break;
    case 'chord': Audio.chord(t, e.f, e.dur, e.g); break;
    case 'bell': Audio.bell(t, e.f, e.g); break;
    case 'hold': {
      const node = Audio.hold(t, e.f, e.dur, e.g);
      if (e.teacher) S.teacherHold = node;
      break;
    }
    case 'tick':
      Audio.wood(t, e.accent ? 1560 : 1040, e.accent ? 0.9 : 0.55);
      if (e.accent) Audio.kick(t, 0.5);
      break;
  }
}

/* ── 그리드(박자 위치) 계산 ──────────────────────────────── */
function gridAt(now) {
  const segs = S.segments;
  if (!segs.length) return null;
  let seg = segs[segs.length - 1];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const end = s.startT + (s.countIn + s.beats) * s.beatDur;
    if (now < end) { seg = s; break; }
  }
  const beat = (now - seg.startT) / seg.beatDur;
  const local = beat - seg.countIn;
  const inCount = local < 0;
  const pair = inCount ? -1 : Math.floor(local / 8);
  const pos = inCount ? 0 : ((local % 8) + 8) % 8;
  return {
    seg, beat, local, inCount,
    pairAbs: inCount ? -1 : seg.pairBase + pair,
    phase: inCount ? 'count' : (pos < 4 ? 'call' : 'reply'),
    lamp: Math.floor(((beat % 4) + 4) % 4),
    beatFrac: ((beat % 1) + 1) % 1
  };
}

/* ── 판정 ───────────────────────────────────────────────── */
function award(n, grade, weight) {
  S.stats.total++;
  if (n) n.grade = grade;
  if (grade === 'PERFECT') S.stats.perfect++;
  else if (grade === 'GOOD') S.stats.good++;
  else S.stats.miss++;

  if (grade === 'MISS') {
    S.combo = 0;
    S.fever = Math.max(0, S.fever - 16);
  } else {
    S.combo++;
    if (S.combo > S.maxCombo) S.maxCombo = S.combo;
    S.fever = Math.min(FEVER_MAX, S.fever + (grade === 'PERFECT' ? 7 : 4));
    if (S.fever >= FEVER_MAX && !S.feverOn) startFever();
  }

  const base = grade === 'PERFECT' ? 100 : grade === 'GOOD' ? 55 : 0;
  const mult = (1 + Math.min(S.combo, 50) * 0.012) * (S.feverOn ? 2 : 1);
  S.score += Math.round(base * mult * (weight || 1));

  S.lastJudge = grade;
  showJudge(grade, n);
  markStrip(n, grade);
  sceneOnJudge(grade, n);
  if (grade === 'MISS') Audio.miss();
  if (S.duel) {
    const who = duelChars[S.seat];
    if (who) who.swing = 1;
    if (window.RhythmDuel) RhythmDuel.report(duelStatsPayload());
  }
}

function startFever() {
  S.feverOn = true;
  S.feverUntil = Audio.now + FEVER_DUR;
  document.body.classList.add('fever');
  flashScreen();
  Audio.bell(Audio.now + 0.02, 1318, 0.9);
  sceneFeverStart();
}

function endFever() {
  S.feverOn = false;
  S.fever = 0;
  S.feverUntil = 0;
  document.body.classList.remove('fever');
}

function targetOf(n) {
  if (n.type === 'roll') return n.t + n.sub * ROLL_GAP;
  return n.t;
}

function tryHit(rawNow) {
  if (!S.playing || S.paused) return null;
  const now = rawNow - S.syncMs / 1000;

  let best = null, bestD = Infinity;
  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    if (n.t > now + 0.4) break;
    if (n.judged) continue;
    if (n.type === 'roll' && n.sub >= n.hits) continue;
    if (n.type === 'long' && n.holding) continue;
    const tgt = targetOf(n);
    const d = now - tgt;
    if (d > GOOD_W) continue;              // 이미 놓친 노트
    if (d < -GOOD_W) continue;             // 아직 멀어요
    const ad = Math.abs(d);
    if (ad < bestD) { bestD = ad; best = n; }
  }

  if (!best) {
    /* 허공 타격 — 벌점 없이 가벼운 소리만 */
    Audio.wood(Audio.now + 0.005, 640, 0.2);
    return null;
  }

  const grade = bestD <= PERFECT_W ? 'PERFECT' : 'GOOD';

  if (best.type === 'long') {
    best.holding = true;
    best.holdStart = now;
    best.headGrade = grade;
    S.holding = best;
    if (S.holdNode) { try { S.holdNode.stop(Audio.now); } catch (e) { /* 무시 */ } }
    S.holdNode = Audio.hold(Audio.now + 0.01, midiF(72), best.dur, 0.7);
    Audio.tom(Audio.now + 0.005, 210, 1);
    Audio.clap(Audio.now + 0.005, 0.55);
    sceneOnPress();
    return { grade, type: 'long', note: best };
  }

  Audio.tom(Audio.now + 0.005, 190 + Math.min(S.combo, 12) * 4, 1);
  Audio.clap(Audio.now + 0.004, 0.5);
  sceneOnPress();

  if (best.type === 'roll') {
    best.sub++;
    award(best, grade, 0.9);
    if (best.sub >= best.hits) best.judged = true;
  } else {
    best.judged = true;
    award(best, grade, 1);
  }
  return { grade, type: best.type, note: best };
}

function releaseHold(rawNow) {
  const now = rawNow - S.syncMs / 1000;
  if (S.holdNode) { try { S.holdNode.stop(Audio.now + 0.01); } catch (e) { /* 무시 */ } S.holdNode = null; }
  const n = S.holding;
  S.holding = null;
  if (!n || n.judged) { if (n) n.holding = false; return; }
  const ratio = clamp((now - n.t) / Math.max(0.08, n.dur), 0, 1);
  n.holding = false;
  n.judged = true;
  let grade = n.headGrade || 'GOOD';
  if (ratio < 0.55) grade = 'MISS';
  else if (ratio < 0.9 && grade === 'PERFECT') grade = 'GOOD';
  award(n, grade, 1.3);
}

function scanMiss(now) {
  for (let i = S.noteScan; i < S.notes.length; i++) {
    const n = S.notes[i];
    if (n.t > now + 0.6) break;
    if (n.judged) continue;
    if (n.type === 'long') {
      if (n.holding) {
        if (now > n.t + n.dur + 0.18) {
          n.judged = true;
          award(n, n.headGrade || 'PERFECT', 1.3);
        }
      } else if (now > n.t + GOOD_W + 0.02) {
        n.judged = true;
        award(n, 'MISS', 1.3);
      }
      continue;
    }
    const last = n.type === 'roll' ? n.t + (n.hits - 1) * ROLL_GAP : n.t;
    if (now > last + GOOD_W + 0.02) {
      if (n.type === 'roll') {
        while (n.sub < n.hits) { n.sub++; award(n, 'MISS', 0.9); }
        n.judged = true;
      } else {
        n.judged = true;
        award(n, 'MISS', 1);
      }
    }
  }
  while (S.noteScan < S.notes.length && S.notes[S.noteScan].judged) S.noteScan++;
}

/* ── HUD ────────────────────────────────────────────────── */
let judgeHideTimer = 0;
let flashTimer = 0;

function showJudge(grade, note) {
  const el = $('judge');
  const txt = $('judgeText');
  const sub = $('judgeSub');
  el.classList.remove('hidden', 'PERFECT', 'GOOD', 'MISS', 'pop');
  void el.offsetWidth;
  el.classList.add(grade, 'pop');
  txt.textContent = GRADE_LABEL[grade];
  sub.textContent = note
    ? (note.type === 'long' ? '꾹~' : note.type === 'roll' ? '따닥!' : '짝!')
    : '';
  clearTimeout(judgeHideTimer);
  judgeHideTimer = setTimeout(() => { el.classList.add('hidden'); }, 560);

  const combo = $('combo');
  if (S.combo >= 3 && grade !== 'MISS') {
    combo.classList.remove('hidden');
    combo.classList.add('on');
    $('comboNum').textContent = S.combo;
  } else {
    combo.classList.remove('on');
    combo.classList.add('hidden');
  }
}

function flashScreen() {
  const f = $('flash');
  f.classList.add('on');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => f.classList.remove('on'), 130);
}

function buildStrip(pairAbs) {
  const strip = $('strip');
  const data = S.pairsData[pairAbs];
  strip.innerHTML = '';
  S.stripCells = [];
  for (let i = 0; i < 8; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell' + (i === 0 ? ' bar' : '');
    if (data) {
      data.pat.filter((n) => Math.round(n[0] * 2) === i).forEach((n) => {
        const sp = document.createElement('span');
        sp.className = 'note ' + n[1];
        sp.textContent = n[1] === 'tap' ? '●' : n[1] === 'roll' ? '◆' : '▬';
        cell.appendChild(sp);
      });
    }
    strip.appendChild(cell);
    S.stripCells[i] = cell;
  }
}

function lightCell(slot) {
  const cell = S.stripCells[slot];
  if (!cell) return;
  cell.classList.add('on');
  setTimeout(() => cell.classList.remove('on'), 150);
}

function markStrip(n, grade) {
  if (!n || n.pairAbs !== S.curPairAbs) return;
  const cell = S.stripCells[n.slot];
  if (!cell) return;
  if (grade === 'MISS') cell.classList.add('bad');
  else { cell.classList.remove('bad'); cell.classList.add('hit'); }
}

function setPhaseTag(phase) {
  const tag = $('turnTag');
  const text = $('turnTagText');
  if (phase === 'count') {
    tag.classList.remove('hidden', 'reply');
    text.textContent = '준비! 4박 세고 시작해요';
    $('hint').innerHTML = '선생님 손을 봐요 👀';
  } else if (phase === 'call') {
    tag.classList.remove('hidden', 'reply');
    text.textContent = '선생님 차례 — 잘 들어요';
    $('hint').innerHTML = '이 박자를 기억해요 👂';
  } else if (phase === 'reply') {
    tag.classList.remove('hidden');
    tag.classList.add('reply');
    text.textContent = '따라 치세요!';
    $('hint').innerHTML = '화면을 톡! <b>Space</b> · 롱노트는 꾹~';
  }
  tag.style.animation = 'none';
  void tag.offsetWidth;
  tag.style.animation = '';
}

function updateHudLive(now, g) {
  const pct = Math.round(S.fever);
  $('feverFill').style.width = pct + '%';
  $('feverPct').textContent = pct + '%';

  const total = S.stats.total;
  const acc = total ? (S.stats.perfect + S.stats.good * 0.6) / total : 1;
  $('accVal').textContent = Math.round(acc * 100) + '%';

  if (g && !g.inCount) {
    if (S.curPairAbs !== g.pairAbs) {
      S.curPairAbs = g.pairAbs;
      buildStrip(g.pairAbs);
      S.hudPairShown = -1;
    }
    const pairNo = S.encore ? (g.seg.wave + 1) : (g.pairAbs + 1);
    if (S.hudPairShown !== g.pairAbs) {
      S.hudPairShown = g.pairAbs;
      if (S.encore) {
        $('hudPair').textContent = 'W' + (g.seg.wave + 1);
        $('hudPairMax').textContent = '앙코르';
      } else {
        $('hudPair').textContent = String(g.pairAbs + 1);
        $('hudPairMax').textContent = '/ ' + S.def.pairs + ' 마디';
      }
    }
    if (S.phase !== g.phase) {
      S.phase = g.phase;
      setPhaseTag(g.phase);
    }
  } else if (g && g.inCount && S.phase !== 'count') {
    S.phase = 'count';
    setPhaseTag('count');
  }

  /* 박자 등 */
  const lamps = $('lamps').children;
  const beatNow = g ? g.beat : 0;
  const lamp = Math.floor(((beatNow % 4) + 4) % 4);
  const frac = ((beatNow % 1) + 1) % 1;
  for (let i = 0; i < lamps.length; i++) {
    lamps[i].classList.toggle('on', i === lamp && frac < 0.22);
    lamps[i].classList.toggle('first', i === 0);
  }

  /* 선생님 시범 타격 → 스트립 점등 */
  while (S.callCursor < S.callHits.length && S.callHits[S.callCursor].t <= now + 0.005) {
    const h = S.callHits[S.callCursor++];
    if (h.pairAbs === S.curPairAbs) lightCell(h.slot);
  }
}

/* ── 화면 전환 ───────────────────────────────────────────── */
function hideScreens() {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
}
function showScreen(id) {
  hideScreens();
  const el = $(id);
  if (el) el.classList.add('show');
}
function showHud(v) {
  $('hud').classList.toggle('hidden', !v);
}
function setLoading(v) {
  $('loading').classList.toggle('show', !!v);
}

function buildStageList() {
  const list = $('stageList');
  list.innerHTML = '';
  const data = Store.data;
  STAGES.forEach((st, i) => {
    const b = document.createElement('button');
    b.className = 'stageBtn';
    b.style.setProperty('--ac', st.accent);
    b.setAttribute('aria-label', st.name + ' 시작');
    const best = data.best[st.id] || 0;
    b.innerHTML =
      '<div class="sTop"><span class="ico">' + st.icon + '</span><b>' + st.name + '</b><span class="bpmTag">' + st.bpm + '</span></div>' +
      '<div class="sSub"><span>' + st.desc + '</span><span class="sBest">' + (best ? '최고 ' + best.toLocaleString() + '점' : '도전!') + '</span></div>';
    b.addEventListener('click', () => beginStage(i));
    list.appendChild(b);
  });

  const unlocked = !!data.cleared.s3;
  const eb = document.createElement('button');
  eb.className = 'stageBtn encore' + (unlocked ? '' : ' locked');
  eb.setAttribute('aria-label', '무한 앙코르');
  eb.innerHTML =
    '<div class="sTop"><span class="ico">✨</span><b>무한 앙코르</b><span class="bpmTag">∞</span></div>' +
    '<div class="sSub"><span>' +
    (unlocked ? 'BPM이 끝없이 올라가요' : '스테이지 3을 완주하면 열려요') +
    '</span><span class="sBest">' +
    (unlocked ? '최고 ' + (data.encoreWave || 0) + '웨이브' : '🔒') +
    '</span></div>';
  if (unlocked) eb.addEventListener('click', () => beginEncore());
  list.appendChild(eb);

  const totalBest = Math.max(0, ...STAGES.map((s) => data.best[s.id] || 0));
  $('bestScore').textContent = totalBest.toLocaleString();
}

/* ── 시작 · 일시정지 · 결과 ─────────────────────────────── */
function prepareUiForPlay() {
  hideScreens();
  showHud(true);
  $('judge').classList.add('hidden');
  $('combo').classList.remove('on');
  $('combo').classList.add('hidden');
  $('strip').innerHTML = '';
  $('feverFill').style.width = '0%';
  $('feverPct').textContent = '0%';
  $('accVal').textContent = '100%';
  $('hudStage').textContent = S.def.name;
  $('hudBpm').textContent = S.encore ? S.waveBpm : S.def.bpm;
  document.body.classList.remove('fever');
  S.hudPairShown = -1;
  if (S.pairsData[0]) buildStrip(0);
  if (!S.duel) {
    $('duelBoard').classList.add('hidden');
    $('duelTags').classList.add('hidden');
    $('duelResultWrap').classList.add('hidden');
    document.querySelector('.stats').classList.remove('hidden');
    $('btnPause').classList.remove('hidden');
    $('btnHome').textContent = '교실로';
    setStageIcon('🎼');
  }
}

function beginStage(index) {
  if (!ready) return;
  if (S.duel) resetDuelUi();
  Audio.resume();
  Audio.ui('start');
  S.stageIndex = index;
  buildStage(STAGES[index]);
  prepareUiForPlay();
  resetSceneForStage();
  startScheduler();
}

function beginEncore() {
  if (!ready) return;
  if (S.duel) resetDuelUi();
  Audio.resume();
  Audio.ui('start');
  startEncore();
  prepareUiForPlay();
  resetSceneForStage();
  startScheduler();
}

function pauseGame() {
  if (S.duel) return;                 // 대결은 모두가 같이 달린다 (혼자 멈출 수 없어요)
  if (!S.playing || S.paused) return;
  S.paused = true;
  if (Audio.ctx && Audio.ctx.state === 'running') Audio.ctx.suspend().catch(() => {});
  $('pauseInfo').textContent = S.encore
    ? '무한 앙코르 · 웨이브 ' + (S.wave)
    : S.def.name + ' · 마디 ' + Math.max(1, S.pairIndex) + '/' + S.def.pairs;
  $('syncRange2').value = String(S.syncMs);
  $('syncVal2').textContent = (S.syncMs > 0 ? '+' : '') + S.syncMs + 'ms';
  showScreen('pause');
}

function resumeGame() {
  if (!S.playing || !S.paused) return;
  S.paused = false;
  hideScreens();
  Audio.resume();
}

function restartStage() {
  hideScreens();
  if (S.encore) beginEncore();
  else beginStage(S.stageIndex);
}

function quitToTitle() {
  if (S.duel) { resetDuelUi(); }
  S.playing = false;
  S.paused = false;
  stopScheduler();
  endFever();
  if (S.holdNode) { try { S.holdNode.stop(Audio.now); } catch (e) { /* 무시 */ } S.holdNode = null; }
  showHud(false);
  buildStageList();
  showScreen('title');
  S.mode = 'title';
}

function finishStage(reason) {
  if (S.duel) { finishDuel(reason); return; }
  if (S.resultShown) return;
  S.resultShown = true;
  S.playing = false;
  stopScheduler();
  endFever();
  if (S.holdNode) { try { S.holdNode.stop(Audio.now); } catch (e) { /* 무시 */ } S.holdNode = null; }
  if (S.holding) { S.holding.holding = false; S.holding = null; }

  const st = S.stats;
  const acc = st.total ? (st.perfect + st.good * 0.6) / st.total : 0;
  const rank = acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : 'C';
  const score = S.score;

  let isNewBest = false;
  const data = Store.data;
  if (S.encore) {
    if (score > (data.encoreBest || 0)) { data.encoreBest = score; isNewBest = true; }
    data.encoreWave = Math.max(data.encoreWave || 0, S.wave);
  } else {
    const id = S.def.id;
    if (score > (data.best[id] || 0)) { data.best[id] = score; isNewBest = true; }
    if (!data.cleared[id]) data.cleared[id] = true;
  }
  Store.save();

  /* 결과 화면 채우기 */
  $('duelResultWrap').classList.add('hidden');
  document.querySelector('.stats').classList.remove('hidden');
  $('btnHome').textContent = '교실로';
  const badge = $('rankBadge');
  badge.className = 'rankBadge ' + rank;
  $('rankLetter').textContent = rank;
  $('rankLabel').textContent = S.encore ? 'WAVE ' + S.wave : 'RANK';
  $('resultTitle').textContent = S.encore
    ? (reason === 'patience' ? '박자가 흔들렸어요!' : '앙코르 종료!')
    : '스테이지 클리어!';
  const subs = {
    S: '완벽한 박자 감각이에요! 선생님도 흐뭇해요 😊',
    A: '아주 좋아요! 조금만 더 다듬으면 S예요.',
    B: '박자를 잘 잡았어요. 연타와 롱노트를 노려 보세요!',
    C: '괜찮아요, 한 번 더! 4박을 세며 쳐 보세요.'
  };
  const unlockedNow = !S.encore && S.def.id === 's3' && data.cleared.s3;
  $('resultSub').textContent = S.encore
    ? '웨이브 ' + S.wave + ' · BPM ' + S.waveBpm + '까지 달렸어요'
    : (unlockedNow ? subs[rank] + ' ✨ 무한 앙코르가 열렸어요!' : subs[rank]);
  $('scoreVal').textContent = score.toLocaleString();
  $('bestDelta').textContent = isNewBest ? 'NEW BEST!' : '';
  $('accResult').textContent = Math.round(acc * 100) + '%';
  $('comboResult').textContent = S.maxCombo;
  $('perfectResult').textContent = st.perfect;
  $('missResult').textContent = st.miss;

  const nextBtn = $('btnNext');
  const isLast = S.encore || S.stageIndex >= STAGES.length - 1;
  nextBtn.classList.toggle('hidden', isLast);
  if (!isLast) nextBtn.textContent = '다음: ' + STAGES[S.stageIndex + 1].name;
  $('btnRetry').textContent = S.encore ? '한 번 더' : '다시 하기';

  showHud(false);
  showScreen('result');
  S.mode = 'result';

  if (rank === 'S' || isNewBest) Audio.bell(Audio.now + 0.05, 1046, 0.8);
}

/* ── 입력 ───────────────────────────────────────────────── */
function pressInput() {
  if (S.mode !== 'play' || !S.playing || S.paused) return;
  if (!S.started) S.started = true;
  tryHit(Audio.now);
}
function releaseInput() {
  if (S.mode !== 'play' || !S.playing || S.paused) return;
  releaseHold(Audio.now);
}

function bindInput() {
  const app = $('app');
  app.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, .screen.show')) return;
    e.preventDefault();
    pressInput();
  }, { passive: false });
  app.addEventListener('pointerup', () => releaseInput());
  app.addEventListener('pointercancel', () => releaseInput());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ') {
      const openScreen = document.querySelector('.screen.show');
      if (openScreen) return;
      e.preventDefault();
      if (e.repeat) return;
      pressInput();
    } else if (e.code === 'Escape') {
      if (S.playing && !S.paused) pauseGame();
    } else if (e.code === 'KeyP') {
      if (S.playing && !S.paused) pauseGame();
      else if (S.paused) resumeGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ') releaseInput();
  });
}

/* ============================================================
   3D 디오라마
   ============================================================ */
let renderer, scene, camera, composer, bloom, clock;
let ready = false;
let stageGroup, teacher, playerChar, pals = [];
let pads = [], rings = [], spotlights = [], coneMeshes = [];
let keyLight, hemi, feverLight;
let particleSystem, pData = [], pPos, pCol;
let shake = 0, bloomBase = 0.55, bloomTarget = 0.55;
let sceneTime = 0;
let cameraState = { pos: new THREE.Vector3(0, 3.4, 8.4), look: new THREE.Vector3(0, 1.7, -2.0) };

/* ── 캔버스 텍스처 ──────────────────────────────────────── */
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}

function woodTexture() {
  const c = cv(512, 512), x = c.getContext('2d');
  x.fillStyle = '#a9713f';
  x.fillRect(0, 0, 512, 512);
  const rows = 8, rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const shade = 150 + Math.floor(Math.random() * 40);
    x.fillStyle = 'rgb(' + (shade + 30) + ',' + Math.floor(shade * 0.62) + ',' + Math.floor(shade * 0.34) + ')';
    x.fillRect(0, r * rh + 1, 512, rh - 2);
    /* 나뭇결 */
    for (let i = 0; i < 24; i++) {
      x.strokeStyle = 'rgba(90,52,24,' + (0.05 + Math.random() * 0.13) + ')';
      x.lineWidth = 1 + Math.random() * 1.6;
      x.beginPath();
      const y = r * rh + Math.random() * rh;
      x.moveTo(0, y);
      for (let px = 0; px <= 512; px += 32) {
        x.lineTo(px, y + Math.sin((px + r * 40) * 0.02) * 2.5 + (Math.random() - 0.5) * 1.6);
      }
      x.stroke();
    }
    /* 이음선 */
    x.fillStyle = 'rgba(60,34,14,.5)';
    x.fillRect(0, r * rh, 512, 2);
    x.fillStyle = 'rgba(255,225,180,.12)';
    x.fillRect(0, r * rh + 2, 512, 1);
  }
  return c;
}

function wallTexture() {
  const c = cv(512, 512), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#f3e6cf');
  g.addColorStop(1, '#e4d2b6');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  x.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = 0; i < 900; i++) {
    x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  /* 하단 몰딩 */
  x.fillStyle = '#c8ab84';
  x.fillRect(0, 430, 512, 84);
  x.fillStyle = 'rgba(120,90,60,.35)';
  x.fillRect(0, 430, 512, 6);
  return c;
}

function chalkTexture() {
  const c = cv(1024, 448), x = c.getContext('2d');
  x.fillStyle = '#22423a';
  x.fillRect(0, 0, 1024, 448);
  const rg = x.createRadialGradient(380, 180, 60, 512, 224, 620);
  rg.addColorStop(0, 'rgba(255,255,255,.10)');
  rg.addColorStop(1, 'rgba(0,0,0,.22)');
  x.fillStyle = rg;
  x.fillRect(0, 0, 1024, 448);
  /* 지우개 자국 */
  for (let i = 0; i < 16; i++) {
    x.strokeStyle = 'rgba(230,240,230,' + (0.015 + Math.random() * 0.03) + ')';
    x.lineWidth = 16 + Math.random() * 22;
    x.beginPath();
    const y = 60 + Math.random() * 340;
    x.moveTo(Math.random() * 400, y);
    x.lineTo(400 + Math.random() * 620, y + (Math.random() - 0.5) * 40);
    x.stroke();
  }
  x.textAlign = 'center';
  x.fillStyle = 'rgba(244,246,232,.92)';
  x.font = '700 58px Jua, "Apple SD Gothic Neo", sans-serif';
  x.fillText('쉬는시간 · 리듬교실', 512, 140);
  x.font = '400 40px Jua, sans-serif';
  x.fillStyle = 'rgba(228,240,220,.72)';
  x.fillText('♩  콜 앤 리스폰스  4/4', 512, 206);
  /* 오선 */
  x.strokeStyle = 'rgba(235,245,230,.42)';
  x.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    x.beginPath();
    x.moveTo(190, 270 + i * 18);
    x.lineTo(834, 270 + i * 18);
    x.stroke();
  }
  x.fillStyle = 'rgba(246,250,238,.85)';
  x.font = '400 54px serif';
  x.fillText('♪   ♫   ♩   ♬', 512, 372);
  x.strokeStyle = 'rgba(235,245,230,.5)';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(150, 340, 26, 0, TAU);
  x.stroke();
  x.beginPath();
  x.arc(880, 330, 22, 0, TAU);
  x.stroke();
  return c;
}

function drumHeadTexture() {
  const c = cv(256, 256), x = c.getContext('2d');
  const g = x.createRadialGradient(110, 100, 10, 128, 128, 130);
  g.addColorStop(0, '#fffdf4');
  g.addColorStop(0.7, '#f3e7d2');
  g.addColorStop(1, '#d9c5a8');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(140,110,80,.35)';
  x.lineWidth = 3;
  x.beginPath(); x.arc(128, 128, 104, 0, TAU); x.stroke();
  x.beginPath(); x.arc(128, 128, 74, 0, TAU); x.stroke();
  x.fillStyle = 'rgba(150,90,60,.5)';
  x.font = '700 26px Jua, sans-serif';
  x.textAlign = 'center';
  x.fillText('짝짝', 128, 138);
  return c;
}

function neonTexture(text) {
  const c = cv(512, 128), x = c.getContext('2d');
  x.clearRect(0, 0, 512, 128);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '700 76px Jua, "Apple SD Gothic Neo", sans-serif';
  x.shadowColor = '#ff7bd5';
  x.shadowBlur = 26;
  x.fillStyle = '#ffe6fb';
  x.fillText(text, 256, 68);
  x.shadowBlur = 10;
  x.fillStyle = '#ffd9f6';
  x.fillText(text, 256, 68);
  return c;
}

/* ── 캐릭터 ─────────────────────────────────────────────── */
function makeChar(cfg) {
  const g = new THREE.Group();
  const skinM = new THREE.MeshStandardMaterial({ color: cfg.skin || 0xffdcbf, roughness: 0.62 });
  const bodyM = new THREE.MeshStandardMaterial({ color: cfg.body || 0x4ad6c4, roughness: 0.6 });
  const hairM = new THREE.MeshStandardMaterial({ color: cfg.hair || 0x2b2130, roughness: 0.95 });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x241a2c, roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.245, 0.4, 6, 16), bodyM);
  body.position.y = 0.72;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  /* 목 */
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 10), skinM);
  neck.position.y = 1.03;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.255, 26, 20), skinM);
  head.position.y = 1.26;
  head.castShadow = true;
  g.add(head);

  /* 머리카락 */
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.286, 32, 22, 0, TAU, 0, Math.PI * 0.44), hairM);
  hair.position.y = 1.258;
  hair.castShadow = true;
  g.add(hair);

  /* 뒤통수 머리카락 */
  const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.268, 26, 18, Math.PI, Math.PI, Math.PI * 0.22, Math.PI * 0.62), hairM);
  backHair.position.y = 1.258;
  backHair.castShadow = true;
  g.add(backHair);

  /* 눈 */
  const scleraM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const eyeGeo = new THREE.SphereGeometry(0.052, 16, 12);
  const pupilGeo = new THREE.SphereGeometry(0.027, 12, 10);
  const eyeL = new THREE.Mesh(eyeGeo, scleraM);
  const eyeR = new THREE.Mesh(eyeGeo, scleraM);
  eyeL.position.set(-0.088, 1.283, 0.222);
  eyeR.position.set(0.088, 1.283, 0.222);
  const pupilL = new THREE.Mesh(pupilGeo, darkM);
  const pupilR = new THREE.Mesh(pupilGeo, darkM);
  pupilL.position.set(-0.088, 1.283, 0.262);
  pupilR.position.set(0.088, 1.283, 0.262);
  g.add(eyeL, eyeR, pupilL, pupilR);

  /* 볼 */
  const cheekM = new THREE.MeshStandardMaterial({ color: 0xff9fa6, roughness: 0.9, transparent: true, opacity: 0.55 });
  const cheekGeo = new THREE.CircleGeometry(0.036, 14);
  const cheekL = new THREE.Mesh(cheekGeo, cheekM);
  const cheekR = new THREE.Mesh(cheekGeo, cheekM);
  cheekL.position.set(-0.152, 1.205, 0.206);
  cheekR.position.set(0.152, 1.205, 0.206);
  cheekL.rotation.y = -0.35; cheekR.rotation.y = 0.35;
  g.add(cheekL, cheekR);

  /* 입 */
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 8, 16, Math.PI), darkM);
  mouth.position.set(0, 1.185, 0.238);
  mouth.rotation.z = Math.PI;
  g.add(mouth);

  /* 팔 (어깨 피벗) */
  const armGeo = new THREE.CapsuleGeometry(0.062, 0.24, 5, 10);
  const handGeo = new THREE.SphereGeometry(0.072, 12, 10);
  const mkArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.255, 0.93, 0);
    const arm = new THREE.Mesh(armGeo, bodyM);
    arm.position.y = -0.17;
    arm.castShadow = true;
    const hand = new THREE.Mesh(handGeo, skinM);
    hand.position.y = -0.34;
    pivot.add(arm, hand);
    pivot.rotation.z = side * 0.16;
    g.add(pivot);
    return { pivot, arm, hand };
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  /* 다리 */
  const legGeo = new THREE.CapsuleGeometry(0.085, 0.22, 5, 10);
  const legL = new THREE.Mesh(legGeo, darkM);
  const legR = new THREE.Mesh(legGeo, darkM);
  legL.position.set(-0.11, 0.24, 0);
  legR.position.set(0.11, 0.24, 0);
  legL.castShadow = true; legR.castShadow = true;
  g.add(legL, legR);

  /* 액세서리 */
  if (cfg.glasses) {
    const gm = new THREE.MeshStandardMaterial({ color: 0x2a1f33, roughness: 0.35, metalness: 0.4 });
    [-0.085, 0.085].forEach((ex) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.008, 8, 20), gm);
      ring.position.set(ex, 1.283, 0.268);
      g.add(ring);
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), gm);
    bridge.position.set(0, 1.283, 0.272);
    g.add(bridge);
  }
  if (cfg.headphones) {
    const hm = new THREE.MeshStandardMaterial({ color: 0x3b2f52, roughness: 0.45, metalness: 0.3 });
    const bandM = new THREE.MeshStandardMaterial({ color: cfg.accent || 0x4ad6c4, emissive: cfg.accent || 0x4ad6c4, emissiveIntensity: 0.25, roughness: 0.5 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.268, 0.024, 8, 24, Math.PI), bandM);
    band.position.set(0, 1.28, 0);
    band.rotation.z = Math.PI;
    g.add(band);
    [-1, 1].forEach((s) => {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 16), hm);
      cup.position.set(s * 0.255, 1.27, 0);
      cup.rotation.z = Math.PI / 2;
      g.add(cup);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16),
        new THREE.MeshStandardMaterial({ color: cfg.accent || 0xff6b7a, emissive: cfg.accent || 0xff6b7a, emissiveIntensity: 0.6, roughness: 0.6 }));
      cap.position.set(s * 0.283, 1.27, 0);
      cap.rotation.y = s * Math.PI / 2;
      g.add(cap);
    });
  }
  if (cfg.bun) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), hairM);
    bun.position.set(0, 1.44, -0.2);
    bun.castShadow = true;
    g.add(bun);
  }
  if (cfg.tie) {
    const tie = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 3),
      new THREE.MeshStandardMaterial({ color: 0xff6b7a, roughness: 0.6 }));
    tie.position.set(0, 0.94, 0.235);
    tie.rotation.x = Math.PI;
    g.add(tie);
  }
  /* 북채 */
  if (cfg.sticks) {
    [armL, armR].forEach((a) => {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.34, 8),
        new THREE.MeshStandardMaterial({ color: 0xe6c79b, roughness: 0.65 }));
      stick.position.set(0, -0.42, 0.06);
      stick.rotation.x = 0.5;
      a.pivot.add(stick);
    });
  }

  g.scale.setScalar(cfg.scale || 1);
  return {
    group: g, body, head, hair, armL, armR, legL, legR, mouth,
    baseY: 0, phase: Math.random() * TAU
  };
}

/* ── 방 만들기 ──────────────────────────────────────────── */
function buildRoom() {
  const wood = tex(woodTexture(), 4, 3.4);
  const wall = tex(wallTexture(), 3, 1);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 17),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.76, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0.5);
  floor.receiveShadow = true;
  scene.add(floor);

  /* 벽 */
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(20, 7.2),
    new THREE.MeshStandardMaterial({ map: wall, roughness: 0.92 }));
  backWall.position.set(0, 3.6, -6.6);
  backWall.receiveShadow = true;
  scene.add(backWall);

  const sideMat = new THREE.MeshStandardMaterial({ map: tex(wallTexture(), 1.4, 1), roughness: 0.92 });
  [-1, 1].forEach((s) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(16, 7.2), sideMat);
    w.position.set(s * 10, 3.6, 1);
    w.rotation.y = -s * Math.PI / 2;
    w.receiveShadow = true;
    scene.add(w);
  });

  /* 걸레받이 */
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8a6540, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(20, 0.22, 0.12), baseMat);
  base.position.set(0, 0.11, -6.5);
  scene.add(base);

  /* 천장 */
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(20, 17),
    new THREE.MeshStandardMaterial({ color: 0x2a2036, roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 6.6, 0.5);
  scene.add(ceil);

  /* 칠판 */
  const board = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.24),
    new THREE.MeshStandardMaterial({ map: tex(chalkTexture()), roughness: 0.95 }));
  board.position.set(0, 3.5, -6.52);
  scene.add(board);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.62 });
  const fTop = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.16, 0.16), frameMat);
  fTop.position.set(0, 5.2, -6.44);
  const fBot = fTop.clone(); fBot.position.y = 1.8;
  const fL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 0.16), frameMat);
  fL.position.set(-3.8, 3.5, -6.44);
  const fR = fL.clone(); fR.position.x = 3.8;
  scene.add(fTop, fBot, fL, fR);

  /* 분필 받침 + 분필 */
  const tray = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.22), frameMat);
  tray.position.set(0, 1.78, -6.32);
  scene.add(tray);
  ['#fdf6e3', '#ffd6e0', '#c8f0ff'].forEach((col, i) => {
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }));
    ch.rotation.z = Math.PI / 2;
    ch.position.set(-0.7 + i * 0.5, 1.86, -6.3);
    scene.add(ch);
  });

  /* 네온 사인 */
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1),
    new THREE.MeshBasicMaterial({ map: tex(neonTexture('쉬는시간 오락실')), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sign.position.set(0, 6.0, -6.5);
  scene.add(sign);

  /* 삼각 깃발 */
  const flagCols = [0x4ad6c4, 0xffcf5c, 0xff6b7a, 0xa78bfa, 0x6cc4ff];
  for (let i = 0; i < 14; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 3),
      new THREE.MeshStandardMaterial({ color: flagCols[i % flagCols.length], roughness: 0.7, side: THREE.DoubleSide }));
    f.position.set(-6.4 + i * 0.98, 5.72 - Math.sin(i * 0.5) * 0.05, -6.35);
    f.rotation.z = Math.PI;
    scene.add(f);
  }

  /* 무대 */
  const stageMat = new THREE.MeshStandardMaterial({ map: tex(woodTexture(), 3, 1.2), roughness: 0.6, metalness: 0.05 });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(13, 0.34, 4.2), stageMat);
  platform.position.set(0, 0.17, -4.5);
  platform.receiveShadow = true; platform.castShadow = true;
  scene.add(platform);

  const edge = new THREE.Mesh(new THREE.BoxGeometry(13.1, 0.07, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xffcf5c, emissive: 0xff9f1c, emissiveIntensity: 0.6, roughness: 0.5 }));
  edge.position.set(0, 0.33, -2.42);
  scene.add(edge);

  /* 스피커 2대 */
  [-1, 1].forEach((s) => {
    const grp = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x241a2c, roughness: 0.72 }));
    box.position.y = 0.9;
    box.castShadow = true;
    const cone = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24),
      new THREE.MeshStandardMaterial({ color: 0x120c18, roughness: 0.85 }));
    cone.position.set(0, 1.15, 0.36);
    const cone2 = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20),
      new THREE.MeshStandardMaterial({ color: 0x120c18, roughness: 0.85 }));
    cone2.position.set(0, 0.62, 0.36);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x4ad6c4, emissive: 0x4ad6c4, emissiveIntensity: 0.8 }));
    cap.position.set(0, 1.15, 0.37);
    grp.add(box, cone, cone2, cap);
    grp.position.set(s * 6.6, 0.34, -4.6);
    grp.rotation.y = s * -0.22;
    scene.add(grp);
  });

  /* 악기 선반 (리코더·탬버린) */
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.5), frameMat);
  shelf.position.set(-6.6, 2.1, -6.3);
  scene.add(shelf);
  for (let i = 0; i < 5; i++) {
    const rec = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.62, 10),
      new THREE.MeshStandardMaterial({ color: [0xe6c79b, 0xffd6e0, 0x9be0d4, 0xffe9a8, 0xc9b8ff][i], roughness: 0.6 }));
    rec.position.set(-7.5 + i * 0.42, 2.46, -6.3);
    rec.rotation.z = 0.06;
    scene.add(rec);
  }
  const shelf2 = shelf.clone(); shelf2.position.set(6.6, 2.1, -6.3);
  scene.add(shelf2);
  for (let i = 0; i < 3; i++) {
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 18),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 }));
    tb.position.set(5.9 + i * 0.55, 2.2, -6.3);
    tb.rotation.x = 0.35;
    scene.add(tb);
  }

  /* 4개 박자 패드 */
  const padGeo = new THREE.CircleGeometry(0.23, 28);
  for (let i = 0; i < 4; i++) {
    const grp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: 0x241b33, roughness: 0.62, metalness: 0.15 }));
    base.position.y = 0.045;
    base.castShadow = true; base.receiveShadow = true;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1d1530, emissive: 0x4ad6c4, emissiveIntensity: 0.15, roughness: 0.5, metalness: 0.2
    });
    const pad = new THREE.Mesh(padGeo, mat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.093;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.013, 6, 28),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffcf5c, emissiveIntensity: 0.4, roughness: 0.4 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.096;
    grp.add(base, pad, ring);
    grp.position.set(-1.05 + i * 0.7, 0, 1.3);
    scene.add(grp);
    pads.push({ mesh: pad, ring, flash: 0, idx: i, group: grp });
  }

  /* 바닥 링 (박자 펄스) */
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.022, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0x8ff0e2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.36, -3.4);
    ring.userData.life = 0;
    scene.add(ring);
    rings.push(ring);
  }

  /* 조명 기구(무대 트러스) */
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x3b2f52, roughness: 0.5, metalness: 0.6 });
  const truss = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.16, 0.16), trussMat);
  truss.position.set(0, 5.5, -3.6);
  scene.add(truss);

  const spotCols = [0xff5f8d, 0x4fd2ff, 0xffd166];
  for (let i = 0; i < 3; i++) {
    const x = -3.2 + i * 3.2;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.36, 12), trussMat);
    body.position.set(x, 5.3, -3.6);
    scene.add(body);

    const sp = new THREE.SpotLight(spotCols[i], 34, 22, 0.5, 0.72, 1.8);
    sp.position.set(x, 5.2, -3.6);
    sp.target.position.set(x * 0.5, 0.4, -3.3);
    scene.add(sp);
    scene.add(sp.target);
    spotlights.push(sp);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4.9, 22, 1, true),
      new THREE.MeshBasicMaterial({
        color: spotCols[i], transparent: true, opacity: 0.032,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      }));
    cone.position.set(x * 0.75, 2.9, -3.5);
    cone.rotation.z = 0;
    scene.add(cone);
    coneMeshes.push(cone);
  }

  /* 벽 조명 (네온) */
  [[-8.5, 3.4, -3.5, 0xff5f8d], [8.5, 3.4, -3.5, 0x4fd2ff], [-8.5, 3.4, 2.5, 0xa78bfa], [8.5, 3.4, 2.5, 0xffcf5c]].forEach(([x, y, z, c]) => {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.3, roughness: 0.4 }));
    tube.position.set(x, y, z);
    tube.rotation.x = Math.PI / 2;
    scene.add(tube);
    const pl = new THREE.PointLight(c, 12, 9, 2);
    pl.position.set(x * 0.94, y, z + 0.4);
    scene.add(pl);
  });

  /* 큰 북 (교실 분위기용) */
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.52, 30),
    new THREE.MeshStandardMaterial({ color: 0x9b4a3c, roughness: 0.55 }));
  drum.position.set(4.1, 0.42, -1.9);
  drum.castShadow = true;
  scene.add(drum);
  const head = new THREE.Mesh(new THREE.CircleGeometry(0.56, 30),
    new THREE.MeshStandardMaterial({ map: tex(drumHeadTexture()), roughness: 0.75 }));
  head.rotation.x = -Math.PI / 2;
  head.position.set(4.1, 0.69, -1.9);
  scene.add(head);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 8, 34),
    new THREE.MeshStandardMaterial({ color: 0xc9b8a0, roughness: 0.45, metalness: 0.5 }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(4.1, 0.68, -1.9);
  scene.add(rim);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.3, 10), trussMat);
  stand.position.set(4.1, 0.0, -1.9);
  scene.add(stand);
}

/* ── 조명 ───────────────────────────────────────────────── */
function buildLights() {
  hemi = new THREE.HemisphereLight(0xb8c8ff, 0x2a1c34, 0.45);
  scene.add(hemi);

  keyLight = new THREE.DirectionalLight(0xfff0dd, 1.05);
  keyLight.position.set(5, 9, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -10;
  keyLight.shadow.camera.right = 10;
  keyLight.shadow.camera.top = 10;
  keyLight.shadow.camera.bottom = -6;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.bias = -0.0008;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);

  const fill = new THREE.DirectionalLight(0x9fc6ff, 0.45);
  fill.position.set(-7, 5, 4);
  scene.add(fill);

  feverLight = new THREE.PointLight(0xffcf5c, 0, 14, 2);
  feverLight.position.set(0, 2.2, 0.4);
  scene.add(feverLight);
}

/* ── 파티클 ─────────────────────────────────────────────── */
function buildParticles() {
  const N = 460;
  pPos = new Float32Array(N * 3);
  pCol = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pPos[i * 3] = 0; pPos[i * 3 + 1] = -50; pPos[i * 3 + 2] = 0;
    pCol[i * 3] = 0; pCol[i * 3 + 1] = 0; pCol[i * 3 + 2] = 0;
    pData.push({ vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 1, g: 1, b: 1 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const sprite = cv(64, 64), sx = sprite.getContext('2d');
  const rg = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.35, 'rgba(255,255,255,.85)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  sx.fillStyle = rg;
  sx.fillRect(0, 0, 64, 64);
  const sprTex = new THREE.CanvasTexture(sprite);
  sprTex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.PointsMaterial({
    size: 0.14, map: sprTex, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, alphaTest: 0.01
  });
  particleSystem = new THREE.Points(geo, mat);
  particleSystem.frustumCulled = false;
  scene.add(particleSystem);
}

function burst(x, y, z, color, count, power, up = 1) {
  const c = new THREE.Color(color);
  let made = 0;
  for (let i = 0; i < pData.length && made < count; i++) {
    const p = pData[i];
    if (p.life > 0) continue;
    made++;
    const a = Math.random() * TAU;
    const r = Math.random() * power;
    p.vx = Math.cos(a) * r;
    p.vz = Math.sin(a) * r * 0.8;
    p.vy = (0.4 + Math.random() * 1.2) * power * up;
    p.life = p.max = 0.42 + Math.random() * 0.45;
    p.r = c.r; p.g = c.g; p.b = c.b;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
  }
}

function updateParticles(dt) {
  for (let i = 0; i < pData.length; i++) {
    const p = pData[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      pPos[i * 3 + 1] = -50;
      pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0;
      continue;
    }
    p.vy -= 3.4 * dt;
    pPos[i * 3] += p.vx * dt;
    pPos[i * 3 + 1] += p.vy * dt;
    pPos[i * 3 + 2] += p.vz * dt;
    if (pPos[i * 3 + 1] < 0.03) { pPos[i * 3 + 1] = 0.03; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
    const k = Math.pow(p.life / p.max, 0.8);
    pCol[i * 3] = p.r * k;
    pCol[i * 3 + 1] = p.g * k;
    pCol[i * 3 + 2] = p.b * k;
  }
  particleSystem.geometry.attributes.position.needsUpdate = true;
  particleSystem.geometry.attributes.color.needsUpdate = true;
}

/* ── 무대 배우들 ────────────────────────────────────────── */
function buildActors() {
  teacher = makeChar({
    body: 0x2f9e96, hair: 0x57505f, skin: 0xffdcbf,
    glasses: true, bun: true, tie: true, sticks: true, scale: 1.18
  });
  teacher.group.position.set(0, 0.35, -3.45);
  teacher.scale0 = 1.18;
  teacher.swingL = 0; teacher.swingR = 0;
  scene.add(teacher.group);

  playerChar = makeChar({
    body: 0xff7a84, hair: 0x33223a, skin: 0xffe0c8,
    headphones: true, accent: 0x4ad6c4, scale: 1.0
  });
  playerChar.group.position.set(0, 0, 1.75);
  playerChar.group.rotation.y = Math.PI;
  playerChar.scale0 = 1.0;
  playerChar.swing = 0;
  scene.add(playerChar.group);

  const palCfg = [
    { body: 0x86cf6a, hair: 0x3a2a2a, x: -2.35, z: 2.5, rot: Math.PI + 0.3 },
    { body: 0x6ca8ff, hair: 0x2a2438, x: 2.35, z: 2.5, rot: Math.PI - 0.3 }
  ];
  palCfg.forEach((c) => {
    const pal = makeChar({ body: c.body, hair: c.hair, skin: 0xffdcc0, scale: 0.86 });
    pal.group.position.set(c.x, 0, c.z);
    pal.group.rotation.y = c.rot;
    pal.scale0 = 0.86;
    pal.phase = Math.random() * TAU;
    scene.add(pal.group);
    pals.push(pal);
  });
}

/* ── 4인 대결 무대 캐릭터 ───────────────────────────────── */
let duelChars = [];
let duelTagEls = [];

function buildDuelChars() {
  const accents = [0x4ad6c4, 0xffcf5c, 0xff9f1c, 0x8fe6ff];
  for (let i = 0; i < 4; i++) {
    const c = makeChar({
      body: DUEL_3D[i], hair: 0x2b2130, skin: 0xffe0c8,
      headphones: true, accent: accents[i], scale: 0.95
    });
    c.group.rotation.y = Math.PI;
    c.scale0 = 0.95;
    c.swing = 0;
    c.phase = i * 1.3;
    c.group.visible = false;
    scene.add(c.group);
    duelChars.push(c);
  }
}

function buildDuelTags() {
  const wrap = $('duelTags');
  if (!wrap) return;
  for (let i = 0; i < 4; i++) {
    const el = document.createElement('div');
    el.className = 'dTag';
    el.innerHTML = '<span class="nm"></span><span class="sc">0</span><span class="jd"></span>';
    el.style.display = 'none';
    wrap.appendChild(el);
    duelTagEls.push({
      el, nm: el.querySelector('.nm'), sc: el.querySelector('.sc'), jd: el.querySelector('.jd'),
      last: { nm: null, sc: null, jt: 0 }, timer: 0
    });
  }
}

function layoutDuelChars() {
  if (!duelChars.length) return;
  const portrait = camera.aspect < 0.85;
  const xs = portrait ? [-1.34, -0.45, 0.45, 1.34] : [-2.4, -0.8, 0.8, 2.4];
  const z = portrait ? 2.05 : 1.9;
  const sc = portrait ? 0.8 : 0.95;
  duelChars.forEach((c, i) => {
    c.group.position.set(xs[i], 0, z);
    c.scale0 = sc;
    c.group.scale.setScalar(sc);
  });
}

/* ── 조명 · 카메라 ────────────────────────── */
const POSES = {
  title: { pos: new THREE.Vector3(0, 3.6, 8.8), look: new THREE.Vector3(0, 1.9, -2.4) },
  call: { pos: new THREE.Vector3(1.35, 3.2, 3.15), look: new THREE.Vector3(0, 1.98, -3.45) },
  reply: { pos: new THREE.Vector3(0, 3.2, 6.5), look: new THREE.Vector3(0, 1.42, -1.9) },
  duel: { pos: new THREE.Vector3(0, 3.4, 9.3), look: new THREE.Vector3(0, 1.42, 0.4) }
};

function initThree() {
  const canvas = $('gl');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x140e1f);
  scene.fog = new THREE.FogExp2(0x140e1f, 0.019);

  camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 90);

  buildRoom();
  buildLights();
  buildActors();
  buildParticles();

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.36, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  cameraState.pos.copy(POSES.title.pos);
  cameraState.look.copy(POSES.title.look);
  camera.position.copy(cameraState.pos);
  camera.lookAt(cameraState.look);

  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (S.duel) layoutDuelChars();
}

/* ── 연출 ───────────────────────────────────────────────── */
function teacherStrike(slot) {
  const useL = (S.strikeParity = ((S.strikeParity || 0) + 1) % 2) === 0;
  if (useL) teacher.swingL = 1; else teacher.swingR = 1;
  const x = (useL ? -1 : 1) * 0.42;
  burst(x, 1.55, -3.25, 0x9fe8ff, 3, 1.0, 1.2);
}

function spawnRing() {
  const r = rings.find((x) => x.userData.life <= 0);
  if (!r) return;
  r.userData.life = 0.95;
  r.scale.setScalar(0.42);
  r.material.opacity = 0;
  r.position.set(0, 0.36, -3.35);
}

function sceneOnPress() {
  const who = S.duel ? duelChars[S.seat] : playerChar;
  if (who) who.swing = 1;
  let pad = null, d = Infinity;
  const g = gridAt(Audio.now);
  if (g) {
    const best = [0, 1, 2, 3].reduce((acc, i) => {
      const dd = Math.abs((((g.beat % 4) + 4) % 4) - i);
      return dd < acc.dd ? { i, dd } : acc;
    }, { i: 0, dd: Infinity });
    pad = pads[best.i];
  }
  if (pad) {
    pad.flash = 1;
    burst(pad.group.position.x, 0.4, pad.group.position.z, 0xffd166, 4, 1.2, 1.1);
  } else {
    burst(0, 0.5, 0.6, 0xffd166, 5, 1.2, 1);
  }
}

function sceneOnJudge(grade, note) {
  if (grade === 'MISS') {
    shake = Math.min(0.16, shake + 0.12);
    burst(rand(-0.6, 0.6), 1.1, 1.4, 0xff5a6e, 7, 1.4, 1.2);
    return;
  }
  const gold = grade === 'PERFECT';
  burst(rand(-1, 1), 0.75, 0.4, gold ? 0xffd166 : 0x8fe6ff, gold ? 8 : 5, gold ? 1.9 : 1.3, 1.3);
  if (gold) shake = Math.min(0.05, shake + 0.02);
}

function sceneFeverStart() {
  bloomTarget = 1.1;
  burst(0, 1.6, 0.6, 0xffd166, 40, 2.6, 1.6);
  shake = 0.1;
}

function resetSceneForStage() {
  teacher.swingL = 0; teacher.swingR = 0;
  teacher.group.rotation.set(0, 0, 0);
  playerChar.swing = 0;
  playerChar.group.rotation.set(0, Math.PI, 0);
  duelChars.forEach((c) => { c.swing = 0; c.group.rotation.set(0, Math.PI, 0); });
  pals.forEach((p, i) => { p.group.rotation.set(0, Math.PI + (i === 0 ? 0.3 : -0.3), 0); });
  pads.forEach((p) => { p.flash = 0; });
  rings.forEach((r) => { r.userData.life = 0; r.material.opacity = 0; });
  pData.forEach((p) => { p.life = 0; });
  for (let i = 0; i < pData.length; i++) { pPos[i * 3 + 1] = -50; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; }
  bloomTarget = 0.36;
  bloom.strength = 0.36;
  shake = 0;
  lastBeatInt = -999;
  teacher.group.scale.setScalar(teacher.scale0);
  playerChar.group.scale.setScalar(playerChar.scale0);
}

/* ── 매 프레임 ──────────────────────────────────────────── */
let lastBeatInt = -999;
let confettiTimer = 0;

let dtCam = 0.016;
function updateScene(now, dt) {
  sceneTime += dt;
  const playing = S.playing && !S.paused;
  const g = playing ? gridAt(now) : null;
  const beat = g ? g.beat : sceneTime * 1.35;
  const frac = ((beat % 1) + 1) % 1;
  const pulse = Math.pow(1 - frac, 2.6);
  const phase = g && !g.inCount ? g.phase : (playing ? 'count' : 'idle');

  if (playing) {
    const bi = Math.floor(beat);
    if (bi !== lastBeatInt) { lastBeatInt = bi; spawnRing(); }
  }

  /* 캐릭터 통통 */
  const tAmp = playing ? (phase === 'call' ? 0.13 : 0.06) : 0.045;
  squash(teacher, tAmp * pulse + 0.02, sceneTime * 2.1);
  const pAmp = playing ? (phase === 'reply' ? 0.14 : 0.07) : 0.05;
  squash(playerChar, pAmp * pulse + 0.02, sceneTime * 2.1 + 1.2);
  pals.forEach((p, i) => squash(p, 0.05 * pulse + 0.01, sceneTime * 2 + i * 1.7));

  /* 대결: 무대의 네 캐릭터 */
  if (S.duel) {
    duelChars.forEach((c, i) => {
      if (!c.group.visible) return;
      c.swing = Math.max(0, (c.swing || 0) - dtCam * 4.6);
      c.armL.pivot.rotation.x = -c.swing * 2.4 + Math.sin(sceneTime * 1.9 + i) * 0.05;
      c.armR.pivot.rotation.x = -c.swing * 2.4 + Math.sin(sceneTime * 1.9 + i + 1.1) * 0.05;
      const dAmp = playing ? (phase === 'reply' ? 0.13 : 0.055) : 0.04;
      squash(c, dAmp * pulse + 0.012, sceneTime * 2.1 + i * 1.1);
    });
  }

  /* 선생님 팔 */
  teacher.swingL = Math.max(0, teacher.swingL - dtCam * 3.6);
  teacher.swingR = Math.max(0, teacher.swingR - dtCam * 3.6);
  const listen = playing && phase === 'reply' ? 0.25 : 0;
  teacher.armL.pivot.rotation.x = -teacher.swingL * 2.15 + Math.sin(sceneTime * 1.6) * 0.06;
  teacher.armR.pivot.rotation.x = -teacher.swingR * 2.15 + Math.sin(sceneTime * 1.6 + 1.4) * 0.06;
  teacher.group.rotation.y = Math.sin(sceneTime * 0.7) * 0.04 + listen * 0.12;
  teacher.head.rotation.x = listen * 0.1 + Math.sin(sceneTime * 1.6) * 0.02;

  /* 플레이어 팔 */
  playerChar.swing = Math.max(0, playerChar.swing - dtCam * 5.2);
  playerChar.armL.pivot.rotation.x = -playerChar.swing * 2.5 + Math.sin(sceneTime * 1.9) * 0.05;
  playerChar.armR.pivot.rotation.x = -playerChar.swing * 2.5 + Math.sin(sceneTime * 1.9 + 1) * 0.05;
  const nervous = playing && phase === 'reply' ? Math.sin(sceneTime * 7) * 0.015 : 0;
  playerChar.group.position.y = nervous;

  /* 패드 */
  pads.forEach((p, i) => {
    p.flash = Math.max(0, p.flash - dt * 3.4);
    const beatGlow = playing && g && !g.inCount && g.lamp === i ? pulse * 1.5 : 0;
    p.mesh.material.emissiveIntensity = 0.14 + p.flash * 1.8 + beatGlow * 0.5;
    p.ring.material.emissiveIntensity = 0.35 + p.flash * 4 + beatGlow * 0.8;
    p.mesh.scale.setScalar(1 + p.flash * 0.16);
  });

  /* 링 */
  rings.forEach((r) => {
    if (r.userData.life > 0) {
      r.userData.life -= dt;
      const k = 1 - Math.max(0, r.userData.life) / 0.95;
      r.scale.setScalar(0.42 + k * 2.6);
      r.material.opacity = (1 - k) * 0.42;
      r.position.y = 0.36 + k * 0.1;
    } else if (r.material.opacity !== 0) {
      r.material.opacity = 0;
    }
  });

  /* 스포트라이트 흔들림 */
  spotlights.forEach((sp, i) => {
    const t = sceneTime * (playing ? 1.6 : 0.6) + i * 2.1;
    sp.target.position.x = Math.sin(t) * (i === 1 ? 1.4 : 1.1);
    sp.target.position.z = -4.1 + Math.cos(t * 0.8) * 0.5;
    sp.target.updateMatrixWorld();
    coneMeshes[i].position.x = sp.target.position.x * 0.5;
    coneMeshes[i].rotation.z = -sp.target.position.x * 0.06;
  });

  /* 카메라 */
  let pose;
  if (S.duel) pose = POSES.duel;
  else if (S.mode === 'title' || (!S.playing && !S.resultShown)) pose = POSES.title;
  else if (phase === 'call') pose = POSES.call;
  else pose = POSES.reply;

  let wantPos = pose.pos.clone();
  const portrait = camera.aspect < 0.85;
  if (portrait) {
    const k = S.duel ? 1.12 : (S.mode === 'title' ? 1.06 : 1.2);
    wantPos = pose.pos.clone().sub(pose.look).multiplyScalar(k).add(pose.look);
    wantPos.y += S.duel ? 0.3 : (S.mode === 'title' ? 0.2 : 0.55);
  }
  pals.forEach((pl) => { pl.group.visible = !portrait && !S.duel; });
  if (playerChar) playerChar.group.visible = !S.duel;
  const wantFov = S.duel ? (portrait ? 54 : 48) : (portrait ? 52 : 46);
  if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
  if (S.mode === 'title') {
    wantPos.x += Math.sin(sceneTime * 0.17) * 1.3;
    wantPos.y += Math.sin(sceneTime * 0.23) * 0.16;
  }
  cameraState.pos.lerp(wantPos, 1 - Math.exp(-4.4 * dtCam));
  cameraState.look.lerp(pose.look, 1 - Math.exp(-5.0 * dtCam));

  shake = Math.max(0, shake - dt * 0.9);
  camera.position.copy(cameraState.pos);
  if (shake > 0.001) {
    camera.position.x += rand(-shake, shake) * 0.6;
    camera.position.y += rand(-shake, shake) * 0.6;
    camera.position.z += rand(-shake, shake) * 0.3;
  }
  camera.lookAt(cameraState.look);

  /* 대결 UI (순위판 · 이름표) */
  if (S.duel) {
    camera.updateMatrixWorld();
    renderDuelBoard(false);
    updateDuelTags();
  }

  /* 피버 연출 */
  const onFever = S.feverOn;
  bloomTarget = onFever ? 0.52 : 0.36;
  bloom.strength = damp(bloom.strength, bloomTarget, 3, dt);
  feverLight.intensity = damp(feverLight.intensity, 0, 2.6, dt);
  feverLight.position.set(Math.sin(sceneTime * 1.3) * 1.6, 2.2, 0.6);
  keyLight.color.setHex(onFever ? 0xffe1b0 : 0xfff0dd);
  spotlights.forEach((sp, i) => {
    const base = [0xff5f8d, 0x4fd2ff, 0xffd166][i];
    sp.color.lerp(new THREE.Color(onFever ? 0xffc75c : base), dt * 2);
  });

  if (onFever && playing) {
    confettiTimer -= dt;
    if (confettiTimer <= 0) {
      confettiTimer = 0.34;
      const side = Math.random() < 0.5 ? -1 : 1;
      burst(side * rand(2.2, 3.6), rand(2.6, 3.4), rand(-2.4, 1.2), Math.random() < 0.5 ? 0xffd166 : 0xffe3f2, 3, 0.9, 1.0);
    }
  }

  updateParticles(dt);
}

function squash(c, amp, phase) {
  const sy = 1 + amp;
  const sx = 1 / Math.sqrt(sy);
  const s = c.scale0 || 1;
  c.group.scale.set(s * sx, s * sy, s * sx);
  if (c.head) c.head.position.y = 1.26 + Math.sin(phase) * 0.012;
}

/* ── 게임 틱 ────────────────────────────────────────────── */
let lastNow = 0;

function tickGame(now) {
  const g = gridAt(now);
  if (!g) return;
  scanMiss(now - S.syncMs / 1000);
  if (S.feverOn && now > S.feverUntil) endFever();
  updateHudLive(now, g);

  if (S.encore) {
    const bpmNow = String(Math.round(60 / g.seg.beatDur));
    if ($('hudBpm').textContent !== bpmNow) $('hudBpm').textContent = bpmNow;
    if (S.stats.miss >= S.encoreMissLimit) { finishStage('patience'); return; }
    if (S.endT - now < 6) appendWave();
  }
  if (now > S.endT) finishStage('end');
}

function loop() {
  requestAnimationFrame(loop);
  const now = Audio.ctx ? Audio.now : performance.now() / 1000;
  let dt = now - lastNow;
  lastNow = now;
  if (!(dt > 0)) dt = 0.016;
  dtCam = Math.min(dt, 0.4);
  dt = Math.min(dt, 0.05);
  if (S.frozen) {
    dtCam = 0;
    updateScene(now, 0);
  } else {
    if (S.playing && !S.paused) tickGame(now);
    updateScene(now, dt);
  }
  composer.render();
}

/* ── UI 배선 ────────────────────────────────────────────── */
function fmtSync(v) {
  const n = Math.round(Number(v) || 0);
  return (n > 0 ? '+' : '') + n + 'ms';
}

function applySync(v) {
  S.syncMs = clamp(Math.round(Number(v) || 0), -150, 150);
  Store.data.sync = S.syncMs;
  Store.save();
  ['syncRange', 'syncRange2'].forEach((id) => { const el = $(id); if (el) el.value = String(S.syncMs); });
  ['syncVal', 'syncVal2'].forEach((id) => { const el = $(id); if (el) el.textContent = fmtSync(S.syncMs); });
}

function applyMute(m) {
  Audio.muted = !!m;
  Store.data.muted = !!m;
  Store.save();
  if (Audio.master) Audio.setMuted(m);
  const b = $('btnMute');
  b.textContent = m ? '🔇' : '🔊';
  b.classList.toggle('off', !!m);
  b.setAttribute('aria-label', m ? '소리 켜기' : '음소거');
}

function bindUI() {
  $('btnDuel').addEventListener('click', () => {
    Audio.resume();
    Audio.ui('tap');
    if (window.RhythmDuel) RhythmDuel.open();
    else showScreen('duel');
    S.mode = 'title';
  });
  $('btnHow').addEventListener('click', () => showScreen('howto'));
  $('btnHowClose').addEventListener('click', () => showScreen('title'));
  $('howto').addEventListener('click', (e) => { if (e.target === $('howto')) showScreen('title'); });

  ['syncRange', 'syncRange2'].forEach((id) => {
    $(id).addEventListener('input', (e) => applySync(e.target.value));
  });

  $('btnMute').addEventListener('click', () => {
    Audio.resume();
    applyMute(!Audio.muted);
    Audio.ui('tap');
  });
  $('btnPause').addEventListener('click', () => {
    if (S.duel) { duelExit(); return; }
    pauseGame();
  });

  $('btnResume').addEventListener('click', resumeGame);
  $('btnRestart').addEventListener('click', () => { hideScreens(); restartStage(); });
  $('btnQuit').addEventListener('click', quitToTitle);

  $('btnRetry').addEventListener('click', () => {
    if (S.duel) { if (window.RhythmDuel) RhythmDuel.requestRestart(); return; }
    hideScreens(); restartStage();
  });
  $('btnNext').addEventListener('click', () => {
    if (S.encore) { beginEncore(); return; }
    const next = S.stageIndex + 1;
    if (next < STAGES.length) beginStage(next);
  });
  $('btnHome').addEventListener('click', () => {
    if (S.duel) { duelExit(); return; }
    quitToTitle();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.playing && !S.paused && !S.duel) pauseGame();
  });
}

/* ── 4인 대결 배선 ─────────────────────────────────────── */
function initDuel() {
  const RD = window.RhythmDuel;
  if (!RD) return;
  RD.attach({
    startRound: startDuelRound,
    onPlayers: (list) => {
      S.duelPlayers = list;
      if (S.duel) renderDuelBoard(true);
      if (S.duel) updateDuelTags();
    },
    roomLost: (msg, ranking) => {
      if (S.duel && S.playing && !S.resultShown) { finishDuel('roomlost'); return; }
      if (S.duel) {
        if (S.mode === 'play') finishDuel('roomlost');
        else renderDuelResult(ranking || [], msg || '방이 닫혔어요');
      }
    },
    onBack: () => { resetDuelUi(); showScreen('title'); S.mode = 'title'; },
    restartAsked: () => {
      const el = $('duelResultNote');
      if (el && S.mode === 'result') el.textContent = '방장에게 다시 하기를 요청했어요. 잠시만 기다려 주세요.';
    },
    restartRequest: (nm) => {
      const el = $('duelResultNote');
      if (el && S.mode === 'result') el.textContent = nm + '님이 다시 하기를 기다려요. 「다시 하기」를 눌러 주세요.';
    }
  });
}

/* ── 부팅 ───────────────────────────────────────────────── */
function boot() {
  Store.load();
  initThree();
  bindInput();
  bindUI();
  initDuel();

  const d = Store.data;
  applySync(d.sync || 0);
  applyMute(!!d.muted);
  buildStageList();

  /* 박자 등 만들기 */
  const lampsEl = $('lamps');
  lampsEl.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const s = document.createElement('span');
    s.className = 'lamp' + (i === 0 ? ' first' : '');
    lampsEl.appendChild(s);
  }

  ready = true;
  window.__rhythmReady = true;
  window.__cam = () => camera.position.toArray().map((n) => +n.toFixed(2));
  setLoading(false);
  showScreen('title');
  showHud(false);

  lastNow = performance.now() / 1000;
  requestAnimationFrame(loop);
}

/* 테스트·검증용 최소 인터페이스 (게임 동작에는 영향 없음) */
window.__rhythm = {
  isReady: () => ready,
  state: () => ({
    mode: S.mode, playing: S.playing, paused: S.paused, phase: S.phase,
    combo: S.combo, maxCombo: S.maxCombo, score: S.score,
    stats: Object.assign({}, S.stats), fever: Math.round(S.fever), feverOn: S.feverOn,
    pair: S.curPairAbs, pairCount: S.def ? S.def.pairs : 0,
    notes: S.notes.length, judged: S.notes.filter((n) => n.judged).length,
    t0: S.t0, endT: S.endT, now: Audio.now, beatDur: S.beatDur,
    sync: S.syncMs, encore: S.encore, wave: S.wave, waveBpm: S.waveBpm,
    misses: S.stats.miss, stage: S.def ? S.def.id : null,
    cam: (window.__cam ? window.__cam() : null)
  }),
  notes: () => S.notes.map((n, i) => ({
    i, t: n.t, type: n.type, hits: n.hits, dur: n.dur,
    slot: n.slot, judged: n.judged, sub: n.sub, grade: n.grade || null, pair: n.pairAbs
  })),
  pending: (limit = 4) => S.notes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => !n.judged)
    .slice(0, limit)
    .map(({ n, i }) => ({
      i, type: n.type, judged: n.judged,
      target: n.type === 'roll' ? n.t + n.sub * ROLL_GAP : n.t,
      dur: n.dur
    })),
  hitAt: (t) => tryHit(t),
  hitNote: (i, offMs = 0) => {
    const n = S.notes[i];
    if (!n) return null;
    const tgt = n.type === 'roll' ? n.t + n.sub * ROLL_GAP : n.t;
    tryHit(tgt + offMs / 1000 + S.syncMs / 1000);
    return { type: n.type, judged: n.judged, sub: n.sub };
  },
  releaseNote: (i, offMs = 0) => {
    const n = S.notes[i];
    if (!n) return null;
    releaseHold(n.t + n.dur + offMs / 1000 + S.syncMs / 1000);
  },
  releaseAt: (t) => releaseHold(t),
  beginStage: (i) => beginStage(i),
  beginEncore: () => beginEncore(),
  pause: () => pauseGame(),
  resume: () => resumeGame(),
  finish: () => finishStage('manual'),
  quit: () => quitToTitle(),
  audioState: () => (Audio.ctx ? Audio.ctx.state : 'none'),
  store: () => JSON.parse(JSON.stringify(Store.data)),
  setSync: (v) => applySync(v),
  freeze: (v) => { S.frozen = !!v; return S.frozen; },
  cam: () => (window.__cam ? window.__cam() : null),
  now: () => Audio.now,
  /* 4인 대결 검증용 */
  duel: () => ({
    on: S.duel, seat: S.seat, mode: S.mode, host: S.duelHost,
    players: (S.duelPlayers || []).map((p) => ({
      u: p.u, nm: p.nm, seat: p.seat, score: p.score, acc: p.acc, combo: p.combo,
      maxCombo: p.maxCombo, judge: p.lastJudge, ai: p.ai, out: p.out, me: p.me
    })),
    board: $('duelBoard') ? $('duelBoard').innerText : '',
    tags: duelTagEls.filter((t) => t.el.style.display !== 'none').map((t) => t.el.innerText.replace(/\n/g, ' ')),
    chars: duelChars.filter((c) => c.group.visible).length,
    rank: S.duelRank,
    chart: { notes: S.notes.length, t0: S.t0, endT: S.endT, beatDur: S.beatDur },
    table: $('duelTable') ? $('duelTable').innerText : ''
  }),
  net: () => (window.RhythmDuel ? window.RhythmDuel.__state() : null),
  netPlayers: () => (window.RhythmDuel ? window.RhythmDuel.players() : []),
  startDuel: (o) => startDuelRound(Object.assign({
    seed: 20261116, bpm: DUEL_BPM, pairs: DUEL_PAIRS, startAt: Date.now() + 2600,
    me: { seat: 0 }, host: true,
    roster: [
      { u: 'me', nm: '나', seat: 0 },
      { u: 'ai1', nm: 'AI 똘이', seat: 1, ai: 1 },
      { u: 'ai2', nm: 'AI 순이', seat: 2, ai: 1 },
      { u: 'ai3', nm: 'AI 길동', seat: 3, ai: 1 }
    ]
  }, o || {})),
  s: S
};

/* ── 시작! ──────────────────────────────────────────────── */
window.addEventListener('error', (e) => {
  if (!ready && e && e.message) {
    setLoading(false);
    $('err').classList.add('show');
  }
});

boot();
