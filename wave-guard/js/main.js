// 파도풀 안전요원 - 메인 (게임 루프, 입력, 교대 진행)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { W, POOL, rand, pick, clamp, waveH, groundY } from './env.js';
import { World } from './world.js';
import { People } from './people.js';
import { Incidents, TYPES, typesForShift } from './incidents.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

const SHIFT_TIME = 120;
const SHIFTS = [
  { name: '오전 근무', icon: '🌅', tod: 'morning', people: 16, iv: [6.5, 9.5], max: 2, lim: 1.0, hint: 0.5, fake: 0, events: [] },
  { name: '점심 근무', icon: '☀️', tod: 'noon', people: 26, iv: [5.5, 8.5], max: 3, lim: 0.95, hint: 0.55, fake: 17, events: [{ at: 45, type: 'bigwave', dur: 25, label: '🌊 대형 파도' }] },
  { name: '오후 근무', icon: '🌤️', tod: 'afternoon', people: 36, iv: [4.8, 7.5], max: 3, lim: 0.9, hint: 0.6, fake: 13, events: [{ at: 25, type: 'group', label: '👥 단체 손님 입장' }, { at: 62, type: 'glare', dur: 26, label: '✨ 햇빛 반사' }] },
  { name: '저녁 근무', icon: '🌇', tod: 'evening', people: 46, iv: [4.2, 6.8], max: 4, lim: 0.86, hint: 0.62, fake: 11, events: [{ at: 20, type: 'rain', dur: 42, label: '🌧️ 소나기' }, { at: 72, type: 'pabroken', dur: 24, label: '📢 방송 장비 고장' }] },
  { name: '야간 개장', icon: '🌙', tod: 'night', people: 56, iv: [3.6, 6], max: 5, lim: 0.82, hint: 0.66, fake: 9, events: [{ at: 30, type: 'bigwave', dur: 22, label: '🌊 대형 파도' }, { at: 68, type: 'chain', label: '⚠️ 연쇄 사고' }] },
];
const PA_TEXT = {
  lineCross: '안전선 밖에 계신 이용객께서는 안쪽으로 이동해 주시기 바랍니다.',
  wallHang: '안전선 밖에 계신 이용객께서는 안쪽으로 이동해 주시기 바랍니다.',
  loneChild: '미아 보호 안내입니다. 보호자께서는 파도풀 해변 쪽으로 와 주시기 바랍니다.',
};
const TITLES = { S: '전설의 안전요원', A: '베테랑 안전요원', B: '믿음직한 안전요원', C: '수습 안전요원', D: '교육이 더 필요해요' };

class Game {
  constructor() {
    const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (matchMedia('(pointer:coarse)').matches && Math.min(innerWidth, innerHeight) < 820);
    this.q = { high: !mobile, mobile };
    const canvas = document.getElementById('c');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
    this.camBase = new THREE.Vector3(0, 10.5, 14);
    this.cam = { yaw: 0, pitch: -0.2, fov: 58, tyaw: 0, tpitch: -0.2, tfov: 58, base: 0 };
    this.camTarget = new THREE.Vector3(); this.post = 0; this.guards = [];
    this.world = new World(r, this.scene, this.q);
    this.people = new People(this.scene, this.world, 96);
    this.audio = new Audio();
    this.inc = new Incidents(this);
    this.ui = new UI(this);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 2.5);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    const rg = new THREE.RingGeometry(0.5, 0.62, 40); rg.rotateX(-Math.PI / 2);
    this.selRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.95, depthTest: false }));
    this.selRing.renderOrder = 30; this.selRing.visible = false; this.scene.add(this.selRing);
    this.fx = []; this.t = 0; this.state = 'title'; this.lock = 0; this.shake = 0;
    this.best = +(localStorage.getItem('waveguard_best') || 0);
    this.limitMul = 1; this.hintAt = 0.5; this.paBroken = false;
    this._resize(); addEventListener('resize', () => this._resize());
    this._input();
    this._setupScene(0, 22);
    this.setPost(0, true);
    this.ui.showTitle();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._frame());
    setTimeout(() => document.getElementById('loading').classList.add('done'), 300);
  }

  _resize() {
    const w = this.W = innerWidth, h = this.H = innerHeight;
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.maxFov = w / h < 0.9 ? 86 : 72;
    this.baseFov = w / h < 0.9 ? 74 : 58;
    if (!this._sized) { this.cam.fov = this.cam.tfov = this.baseFov; this._sized = true; }
    this.cam.tfov = Math.min(this.cam.tfov, this.maxFov);
    this.camera.updateProjectionMatrix();
  }

  addFx(f) { this.fx.push(f); }

  // ---------- 장면 구성 ----------
  _setupScene(shiftIdx, count) {
    this.people.clear(); this.inc.clear(); this.ui.clearWorld(); this.fx = [];
    this.guards = [];
    for (const [ci, ch] of this.world.chairs.entries()) {
      const g = this.people.spawn({ staff: 'guard', x: ch.x, z: ch.z, head: ch.head });
      this.guards[ci] = g; g.hidden = ci === this.post;
      g.seatY = ch.seatY; g.pinned = true;
      g.setSeq([{ t: 'upd', f: (q) => { q.pose = 'chair'; return false; } }]);
    }
    for (const l of this.world.loungers) l.used = false;
    this.world.setTimeOfDay(SHIFTS[shiftIdx].tod);
    for (let i = 0; i < count; i++) this.spawnNormal(true);
  }

  spawnNormal(initial, at) {
    const r = Math.random();
    let o, fam = false;
    if (r < 0.56) { const tube = Math.random() < 0.35; o = { pref: 'water', vest: !tube, tube }; }
    else if (r < 0.68) { fam = true; o = { pref: Math.random() < 0.6 ? 'water' : 'beach', vest: true, tube: false }; }
    else if (r < 0.86) o = { pref: Math.random() < 0.6 ? 'beach' : 'deck', vest: false };
    else o = { pref: 'lounge', vest: false };
    const ex = at ? at.x : rand(-8, 8), ez = at ? at.z : rand(17.5, 19.5);
    const p = this.people.spawn({ ...o, x: ex, z: ez });
    if (!p) return null;
    if (initial) {
      const s = this.people.randomSpot(p);
      if (s) {
        p.x = s.x; p.z = s.z;
        if (s.lounger) { const l = s.lounger; p.lounger = l; p.x = l.x; p.z = l.z; p.head = l.head; p.lieY = l.y; p.life = rand(30, 90); }
      }
      p.life = rand(40, 200);
    }
    if (fam) {
      const c = this.people.spawn({ child: true, vest: true, x: p.x + 0.6, z: p.z + 0.5 });
      if (c) { c.follow = p; c.fx = rand(-0.7, 0.7); c.fz = rand(0.4, 0.8); p.kid = c; }
    }
    return p;
  }

  normalCount() { return this.people.list.filter((p) => !p.staff && !p.child).length; }

  // ---------- 진행 ----------
  startGame() {
    this.audio.init();
    this.score = 0; this.hearts = 3; this.combo = 0; this.shiftIdx = 0;
    this.total = { ok: 0, acc: 0, wrong: 0, falseA: 0, shifts: 0 };
    this.shiftScores = [];
    this.introShift();
  }

  introShift() {
    const n = this.shiftIdx, cfg = SHIFTS[n];
    this.state = 'intro'; this.ui.hud(false); this.ui.closeRadial();
    W.target = 1; this.world.setRain(false); this.ui.rain(false); this.ui.glare(false); this.audio.rain(false); this.paBroken = false; this.bloom.strength = 0.32;
    this._setupScene(n, Math.round(cfg.people * 0.85));
    const prev = n ? new Set(typesForShift(n)) : new Set();
    const isNew = typesForShift(n + 1).filter((k) => !prev.has(k));
    this.setPost(this.post, true); this.cam.tfov = this.baseFov;
    this.ui.showIntro(n + 1, cfg, isNew, () => { this.ui.hideScreen(); this.ui.countdown(() => this.beginShift()); });
  }

  beginShift() {
    const cfg = this.cfg = SHIFTS[this.shiftIdx];
    this.state = 'play'; this.elapsed = 0; this.shiftTime = SHIFT_TIME;
    this.limitMul = cfg.lim; this.hintAt = cfg.hint;
    this.nextInc = 3; this.fakeT = cfg.fake ? rand(6, cfg.fake) : 1e9; this.popT = 0;
    this.st = { ok: 0, acc: 0, wrong: 0, falseA: 0, maxCombo: 0, score: 0 };
    this.shiftStartScore = this.score;
    this.events = cfg.events.map((e) => ({ ...e, fired: false, ended: false }));
    this.ui.hud(true); this.ui.setShiftLabel(`${this.shiftIdx + 1}교대 · ${cfg.name}`);
    this.audio.setCrowd(this.shiftIdx / 4);
  }

  endShift() {
    this.state = 'result'; this.ui.closeRadial(); this.sel = null; this.selRing.visible = false;
    for (const inc of [...this.inc.list]) this.inc.resolve(inc, true);
    this.ui.clearWorld();
    const st = this.st; st.score = this.score - this.shiftStartScore;
    const grade = this._grade(st);
    for (const k of ['ok', 'acc', 'wrong', 'falseA']) this.total[k] += st[k];
    this.total.shifts++;
    this.shiftScores.push(grade);
    const last = this.shiftIdx >= SHIFTS.length - 1;
    this.audio.fanfare();
    this.ui.hud(false);
    this.ui.showResult(this.shiftIdx + 1, st, grade, last, () => {
      if (last) return this.finish(true);
      this.shiftIdx++; this.hearts = Math.min(3, this.hearts + 1); this.introShift();
    });
  }

  _grade(st) {
    const tries = st.ok + st.wrong + st.falseA, acc = tries ? st.ok / tries : 1;
    if (st.acc === 0 && acc >= 0.9 && st.ok >= 5) return 'S';
    if (st.acc <= 1 && acc >= 0.75) return 'A';
    if (st.acc <= 2 && acc >= 0.55) return 'B';
    if (st.acc <= 3) return 'C';
    return 'D';
  }

  finish(cleared) {
    this.state = 'over'; this.ui.hud(false); this.ui.clearWorld(); this.selRing.visible = false;
    const pts = { S: 5, A: 4, B: 3, C: 2, D: 1 };
    let avg = this.shiftScores.reduce((a, g) => a + pts[g], 0) / Math.max(1, this.shiftScores.length);
    if (!cleared) avg = Math.min(avg, 2);
    const grade = avg >= 4.6 ? 'S' : avg >= 3.7 ? 'A' : avg >= 2.8 ? 'B' : avg >= 1.9 ? 'C' : 'D';
    if (this.score > this.best) { this.best = this.score; try { localStorage.setItem('waveguard_best', this.best); } catch (e) { /* */ } }
    this.ui.showFinal(this.score, grade, TITLES[grade], cleared, this.best, this.total);
  }

  toTitle() {
    this.state = 'title'; this.ui.hud(false); this.ui.closeRadial(); this.selRing.visible = false;
    W.target = 1; this.world.setRain(false); this.ui.rain(false); this.ui.glare(false); this.audio.rain(false); this.paBroken = false;
    this._setupScene(0, 22); this.ui.showTitle();
  }

  togglePause(force) {
    if (this.state === 'play' && force !== false) { this.state = 'paused'; this.ui.showPause(); this.ui.closeRadial(); this.selRing.visible = false; if ('speechSynthesis' in window) speechSynthesis.pause(); }
    else if (this.state === 'paused' && force !== true) { this.state = 'play'; this.ui.hideScreen(); if ('speechSynthesis' in window) speechSynthesis.resume(); }
  }

  // ---------- 상황 발생 ----------
  spawnIncident(force) {
    const n = this.shiftIdx + 1;
    let types = typesForShift(n);
    if (this.paBroken) types = types.filter((k) => !TYPES[k].pa);
    const big = W.target > 1.5;
    const wts = types.map((k) => TYPES[k].w * (big && ['drowning', 'cramp', 'tubeFlip'].includes(k) ? 2.6 : 1) * (k === 'injured' ? 0.6 : 1));
    for (let tries = 0; tries < 8; tries++) {
      let r = Math.random() * wts.reduce((a, b) => a + b, 0), k = types[0];
      for (let i = 0; i < types.length; i++) { r -= wts[i]; if (r <= 0) { k = types[i]; break; } }
      const inc = this.inc.start(k);
      if (inc) return inc;
    }
    return null;
  }

  fireEvent(e) {
    const ui = this.ui;
    switch (e.type) {
      case 'bigwave': W.target = 2.4; this.audio.siren(); ui.banner('🌊 대형 파도 시작! 물속 사고가 늘어나요', 'warn', 4000); break;
      case 'group': for (let i = 0; i < 10; i++) setTimeout(() => this.state === 'play' && this.spawnNormal(false, { x: rand(-6, 6), z: rand(17, 20) }), i * 250); ui.banner('👥 단체 손님 입장! 이용객이 크게 늘었어요', 'info'); break;
      case 'glare': ui.glare(true); this.bloom.strength = 0.9; ui.banner('✨ 햇빛 반사로 눈이 부셔요! 망원경을 활용하세요', 'warn'); break;
      case 'rain': this.world.setRain(true); ui.rain(true); this.audio.rain(true); ui.banner('🌧️ 소나기! 시야가 나빠졌어요', 'info'); break;
      case 'pabroken': this.paBroken = true; ui.banner('📢 방송 장비 고장! 잠시 안내 방송을 쓸 수 없어요', 'warn', 4000); break;
      case 'chain': ui.banner('⚠️ 연쇄 사고 경보! 여러 곳에서 동시에 위험!', 'danger', 3500); this.audio.siren(); for (let i = 0; i < 3; i++) setTimeout(() => this.state === 'play' && this.spawnIncident(true), i * 500); break;
    }
  }

  endEvent(e) {
    switch (e.type) {
      case 'bigwave': W.target = 1; this.ui.banner('파도가 잔잔해졌어요', 'info', 2000); break;
      case 'glare': this.ui.glare(false); this.bloom.strength = 0.32; break;
      case 'rain': this.world.setRain(false); this.ui.rain(false); this.audio.rain(false); break;
      case 'pabroken': this.paBroken = false; this.ui.banner('📢 방송 장비가 복구됐어요', 'info', 2000); break;
    }
  }

  // ---------- 판정 ----------
  select(p) {
    this.sel = p; this.ui.openRadial(p); this.audio.click();
  }

  useTool(tool) {
    const p = this.sel; if (!p || this.state !== 'play') return;
    if (this.lock > 0) return;
    if (tool === 'broadcast' && this.paBroken) { this.ui.popupAt(p, '방송 장비 고장 중!', 'warn'); this.audio.wrong(); return; }
    this.ui.closeRadial(); this.sel = null; this.selRing.visible = false;
    const inc = this.inc.find(p);
    this._toolFx(tool, p, inc);
    if (inc) {
      const need = this.inc.toolFor(inc);
      if (tool === need) {
        const pts = 100 + Math.round(150 * Math.max(0, 1 - inc.t / inc.limit));
        this.combo++; this.st.maxCombo = Math.max(this.st.maxCombo, this.combo);
        const gain = Math.round(pts * (1 + 0.1 * Math.min(this.combo - 1, 10)));
        this.score += gain; this.st.ok++;
        this.ui.popupAt(p, `+${gain}<small>${inc.T.name} 대응 성공</small>`, 'good');
        this.audio.success(this.combo);
        if (tool === 'broadcast') { const tx = PA_TEXT[inc.type] || ''; this.audio.announce(tx); this.ui.subtitle(tx); }
        if (inc.type === 'wallHang' && inc.phase !== 'cling') { this.inc.finish(inc); p.state = 'resolving'; TYPES.lineCross.resolve(inc, this); }
        else this.inc.resolve(inc);
      } else {
        this.score = Math.max(0, this.score - 30); this.combo = 0; this.st.wrong++; this.lock = 1.5;
        this.ui.popupAt(p, '−30<small>알맞은 도구가 아니에요</small>', 'bad'); this.audio.wrong();
      }
    } else if (p.fake) {
      this.score = Math.max(0, this.score - 80); this.combo = 0; this.st.falseA++; this.lock = 1.5;
      this.ui.popupAt(p, '−80<small>장난이었어요!</small>', 'bad'); this.audio.wrong();
    } else if (p.state === 'resolving' || p.state === 'leaving') {
      this.ui.popupAt(p, '이미 조치 중이에요', 'warn');
    } else {
      this.score = Math.max(0, this.score - 50); this.combo = 0; this.st.falseA++; this.lock = 1.5;
      this.ui.popupAt(p, '−50<small>정상 이용객이에요</small>', 'bad'); this.audio.wrong();
    }
  }

  _toolFx(tool, p, inc) {
    if (tool === 'whistle') this.audio.whistle();
    if (tool === 'broadcast' && !(inc && this.inc.toolFor(inc) === 'broadcast')) { this.audio.chime(); this.ui.subtitle('이용객 여러분, 안전 수칙을 지켜 주시기 바랍니다.', 3000); }
    if (tool === 'rescue') { this.audio.whistle(); }
    if (tool === 'medic') this.audio.tone(1046, 0.15, 'square', 0.06), this.audio.tone(784, 0.2, 'square', 0.06, 0.16);
    const ic = { whistle: '🔔', buoy: '🛟', rescue: '🏊', broadcast: '📢', medic: '🩺' }[tool];
    if (tool !== 'whistle') this.ui.bubble(p, ic, 1.1);
  }

  onAccident(inc) {
    if (this.state !== 'play') return;
    this.hearts = Math.max(0, this.hearts - 1); this.combo = 0; this.st.acc++;
    this.audio.accident(); this.ui.flash('red'); this.shake = 0.6;
    const msg = inc.T.failMsg || `${inc.T.name} 대응이 늦었어요`;
    this.ui.banner(`🚨 사고 발생! ${msg}`, 'danger', 3500);
    if (this.sel === inc.p) { this.ui.closeRadial(); this.sel = null; }
    if (this.hearts <= 0) { this.state = 'ending'; setTimeout(() => { this.st.score = this.score - this.shiftStartScore; for (const k of ['ok', 'acc', 'wrong', 'falseA']) this.total[k] += this.st[k]; this.shiftScores.push('D'); this.finish(false); }, 2200); }
  }

  onChain(prev, next) {
    this.combo = 0;
    if (next) this.ui.banner(`⚠️ ${prev.T.name} → <b>${next.T.name}</b> 상황으로 악화!`, 'warn', 3000);
    this.audio.danger();
  }

  // ---------- 입력 ----------
  _input() {
    const cv = this.renderer.domElement, P = new Map();
    let drag = false, downT = 0, pinch = null;
    cv.addEventListener('pointerdown', (e) => {
      this.audio.init();
      cv.setPointerCapture(e.pointerId);
      P.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      if (P.size === 1) { drag = false; downT = performance.now(); }
      if (P.size === 2) { const [a, b] = [...P.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), f: this.cam.tfov }; drag = true; }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = P.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (P.size === 1) {
        if (!drag && Math.hypot(p.x - p.sx, p.y - p.sy) > 8) drag = true;
        if (drag) { const k = 0.0032 * (this.cam.fov / 50); this.cam.tyaw = this._clampYaw(this.cam.tyaw - dx * k); this.cam.tpitch = clamp(this.cam.tpitch + dy * k, -1.0, 0.1); }
      } else if (P.size === 2 && pinch) {
        const [a, b] = [...P.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.cam.tfov = clamp(pinch.f * (pinch.d / d), 12, this.maxFov);
      }
    });
    const up = (e) => {
      const p = P.get(e.pointerId); if (!p) return;
      if (P.size === 1 && !drag && performance.now() - downT < 500) this._tap(e.clientX, e.clientY);
      P.delete(e.pointerId); if (P.size < 2) pinch = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => P.delete(e.pointerId));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    addEventListener('keydown', (e) => {
      if (this.state === 'play' && this.sel && e.key >= '1' && e.key <= '5') this.useTool(['whistle', 'buoy', 'rescue', 'broadcast', 'medic'][+e.key - 1]);
      if (e.key === 'Escape') { if (this.sel) { this.ui.closeRadial(); this.sel = null; this.selRing.visible = false; } else if (this.state === 'play' || this.state === 'paused') this.togglePause(); }
      if (e.key === 'p' || e.key === 'P') this.togglePause();
      if ((e.key === 'c' || e.key === 'C' || e.key === 'Tab') && (this.state === 'play' || this.state === 'title')) { e.preventDefault(); this.switchPost(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.togglePause(true); });
  }

  zoomAt(px, py, f) {
    const c = this.cam; const nf = clamp(c.tfov * f, 12, this.maxFov); const frac = 1 - nf / c.tfov;
    if (frac > 0) {
      const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((px / this.W) * 2 - 1, -(py / this.H) * 2 + 1), this.camera);
      const d = rc.ray.direction;
      c.tyaw = this._clampYaw(c.tyaw + (Math.atan2(d.x, -d.z) - c.tyaw) * frac);
      c.tpitch = clamp(c.tpitch + (Math.asin(d.y) - c.tpitch) * frac, -1.0, 0.1);
    }
    c.tfov = nf;
  }

  zoomBy(f) { this.zoomAt(this.W / 2, this.H / 2, f); }

  _clampYaw(v) { const b = this.cam.base; return clamp(v, b - 1.55, b + 1.55); }

  // 안전요원 감시대 시점 (0: 왼쪽, 1: 오른쪽)
  setPost(i, instant) {
    const ch = this.world.chairs[i]; this.post = i;
    this.camTarget.set(ch.x - ch.side * 0.25, ch.seatY + 0.95, ch.z);
    const prevBase = this.cam.base;
    this.cam.base = ch.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    this.cam.tyaw = this.cam.base + (instant ? 0 : this.cam.tyaw - prevBase) * -1;
    this.cam.tyaw = this._clampYaw(this.cam.tyaw);
    if (instant) { this.cam.tyaw = this.cam.base; this.cam.tpitch = -0.2; this.camBase.copy(this.camTarget); this.cam.yaw = this.cam.tyaw; this.cam.pitch = this.cam.tpitch; }
    this.guards.forEach((g, k) => { if (g) g.hidden = k === i; });
  }

  switchPost() { this.audio.click(); this.ui.closeRadial(); this.sel = null; this.setPost(1 - this.post); }

  _tap(x, y) {
    if (this.state !== 'play') return;
    const p = this.people.pick(x, y, this.camera, this.W, this.H);
    if (!p) { this.ui.closeRadial(); this.sel = null; this.selRing.visible = false; return; }
    this.select(p);
  }

  // ---------- 루프 ----------
  _frame() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    const paused = this.state === 'paused';
    if (paused) dt = 0;
    this.t += dt; W.t = this.t;
    W.strength += (W.target - W.strength) * Math.min(1, dt * 0.35);
    if (this.state === 'play') this._play(dt);
    if (this.state === 'title') { this.cam.tyaw = this.cam.base + Math.sin(this.t * 0.07) * 0.7; this.cam.tpitch = -0.18 + Math.sin(this.t * 0.05) * 0.04; }
    if (!paused) {
      this.people.update(dt, this.t);
      this.fx = this.fx.filter((f) => f.update(dt) !== false);
      this.world.update(dt, this.t);
      if (this.state === 'title' || this.state === 'intro') { this._popT = (this._popT || 0) - dt; if (this._popT < 0) { this._popT = 2; if (this.normalCount() < 20) this.spawnNormal(false); } }
    }
    this.audio.setWaveLevel(W.strength - 1);
    // 카메라
    const c = this.cam, k = Math.min(1, dt * 8 + (paused ? 1 : 0));
    c.yaw += (c.tyaw - c.yaw) * k; c.pitch += (c.tpitch - c.pitch) * k; c.fov += (c.tfov - c.fov) * k;
    this.camera.fov = c.fov; this.camera.updateProjectionMatrix();
    this.camBase.lerp(this.camTarget, Math.min(1, dt * 2.5 + (paused ? 1 : 0)));
    this.camera.position.copy(this.camBase);
    if (this.shake > 0) { this.shake -= dt; const s = this.shake * 0.12; this.camera.position.x += rand(-s, s); this.camera.position.y += rand(-s, s); }
    const d = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
    this.camera.lookAt(this.camera.position.clone().add(d));
    // 선택 표시
    if (this.sel && this.sel.alive && this.state === 'play') {
      const p = this.sel; const y = Math.max(waveH(p.x, p.z), groundY(p.x, p.z)) + 0.06;
      this.selRing.visible = true; this.selRing.position.set(p.x, y, p.z); this.selRing.scale.setScalar((p.tube ? 1.3 : 1) * Math.max(0.8, p.s) * (1 + Math.sin(this.t * 8) * 0.06));
    } else this.selRing.visible = false;
    this.composer.render();
    if (!paused) this.ui.updateWorld(dt);
    if (this.state === 'play' || this.state === 'ending') this.ui.updateHud();
  }

  _play(dt) {
    const cfg = this.cfg;
    this.elapsed += dt;
    if (this.lock > 0) { this.lock -= dt; if (this.lock <= 0) this.ui.setLock(false); }
    // 인원 유지
    this.popT -= dt;
    if (this.popT <= 0) { this.popT = 1.2; if (this.normalCount() < cfg.people) this.spawnNormal(false); }
    // 상황 발생
    this.nextInc -= dt;
    if (this.nextInc <= 0) { this.nextInc = rand(cfg.iv[0], cfg.iv[1]); if (this.inc.active() < cfg.max) this.spawnIncident(); }
    this.fakeT -= dt;
    if (this.fakeT <= 0) { this.fakeT = rand(cfg.fake * 0.6, cfg.fake * 1.3); this.inc.startFake(); }
    for (const e of this.events) {
      if (!e.fired && this.elapsed >= e.at) { e.fired = true; this.fireEvent(e); }
      if (e.fired && !e.ended && e.dur && this.elapsed >= e.at + e.dur) { e.ended = true; this.endEvent(e); }
    }
    this.inc.update(dt);
    if (this.elapsed >= this.shiftTime) {
      for (const e of this.events) if (e.fired && !e.ended && e.dur) { e.ended = true; this.endEvent(e); }
      this.endShift();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try { window.__game = new Game(); }
  catch (e) { console.error(e); document.getElementById('loading').innerHTML = '<p>3D 그래픽을 불러오지 못했어요.<br>다른 브라우저에서 다시 시도해 주세요.</p>'; }
});
