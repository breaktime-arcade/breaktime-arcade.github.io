// =============================================================
//  미니카 그랑프리 - 게임 진행 (메뉴 → 카운트다운 → 레이스 → 결과)
// =============================================================
import * as THREE from 'three';
import { World, CarBody, PropBody, Body, CAR_DEFAULTS, CAR_TYPES } from './physics.js';
import { Track, THEMES } from './track.js';
import { CarModel } from './carModel.js';
import { AIDriver, DIFFICULTY } from './ai.js';
import {
  SkidMarks, Particles, Sparks, makeConeMesh, makeBoulderMesh, makeSnowmanMesh, syncProp, syncBoulder,
} from './effects.js';
import { GameAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) {
  document.body.classList.add('touch-on');
  $('boost-key').hidden = true;
  $('keys-line').textContent = '화면 아래 버튼으로 조종해요. 코너에서 드리프트, 게이지가 차면 부스터!';
}

const TOTAL_LAPS = 3;
const PLAYER_COLORS = { light: [0xffc93c, 0x2b2d42], heavy: [0x3d6bff, 0xffffff], balance: [0xff4f6d, 0xffffff], drift: [0x3ddc97, 0xffffff] };
const AI_COLORS = [[0xb08cff, 0xffffff], [0xff8a3d, 0xffffff], [0x4cc9f0, 0xffd23f], [0x7bc95f, 0xffffff],
  [0xf2f2f2, 0xff4f6d], [0xa0714f, 0xffd23f], [0x2ec4b6, 0xffffff]];
// 플레이어 색과 비슷한 AI 색은 제외 (헷갈리지 않게)
function colorDist(a, b) {
  const d = (s) => (((a >> s) & 255) - ((b >> s) & 255)) ** 2;
  return Math.sqrt(d(16) + d(8) + d(0));
}
const AI_NAMES = ['토토', '뽀삐', '몽실', '콩이', '두부'];
const CAR_STATS = { light: [3, 5, 1, 3], heavy: [3, 2, 5, 2], balance: [4, 3, 3, 3], drift: [3, 3, 3, 5] };
const PROP_SPECS = {
  cone: { r: 0.38, mass: 0.07, friction: 6, make: makeConeMesh, sync: syncProp },
  boulder: { r: 1.2, mass: 2.2, friction: 4, make: makeBoulderMesh, sync: syncBoulder },
  snowman: { r: 0.7, mass: 0.3, friction: 8, make: makeSnowmanMesh, sync: syncProp },
};

// ---------- 설정 저장 ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('minigp_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('minigp_' + k, JSON.stringify(v)); } catch (e) { /* 저장소 없음 */ } },
};
const cfg = Object.assign({ mode: 'race', theme: 'park', car: 'balance', diff: 'normal' }, store.get('cfg', {}));

// ---------- 렌더러 / 장면 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 700);
const hemi = new THREE.HemisphereLight(0xdff4ff, 0x7ccf5a, 1.5);
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
sun.shadow.bias = -0.0005;
scene.add(hemi, sun, sun.target);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const skids = new SkidMarks(scene, 2400);
const smoke = new Particles(scene, 260);
const sparks = new Sparks(scene);
const audio = new GameAudio();

// ---------- 레이스 상태 ----------
let track = null, world = null;
let racers = [];          // {name, body, model, ai, isPlayer, ...}
let player = null;        // 플레이어 racer
let props = [], bumperBodies = [];
let phase = 'menu';       // menu | countdown | racing | done
let raceTime = 0, countdown = 0, lastCount = 0;
let tuning = { ...CAR_DEFAULTS };
let resultsTimer = -1;
let bestLap = null;

function disposeRace() {
  if (track) track.dispose(scene);
  for (const r of racers) scene.remove(r.model.root);
  for (const p of props) scene.remove(p.mesh);
  racers = []; props = []; bumperBodies = [];
  skids.clear();
}

function carParams(type) { return { ...CAR_DEFAULTS, ...CAR_TYPES[type] }; }

function buildRace() {
  disposeRace();
  track = new Track(scene, cfg.theme);
  const th = track.theme;
  scene.background = new THREE.Color(th.sky);
  scene.fog = new THREE.Fog(th.fog, 90, 320);
  hemi.color.setHex(th.hemiSky); hemi.groundColor.setHex(th.hemiGround);
  sun.color.setHex(th.sun);

  world = new World();
  for (const line of track.wallPolylines()) world.walls.addPolyline(line, true, th.wallBounce || 0);
  for (const b of track.bumpers) {
    const body = world.add(new Body({ x: b.x, z: b.z, isStatic: true, colliders: [{ ox: 0, oz: 0, r: b.r }] }));
    body.bouncy = 1.15; body.kind = 'bumper'; body.ref = b;
    bumperBodies.push(body);
  }
  for (const d of track.propDefs) {
    const sp = PROP_SPECS[d.type];
    const p = track.pointAt(d.idx, d.side);
    const body = world.add(new PropBody({ x: p.x, z: p.z, r: sp.r, mass: sp.mass, friction: sp.friction }));
    const mesh = sp.make(); scene.add(mesh);
    props.push({ body, mesh, sync: sp.sync });
  }

  // 출발 그리드: 2열, 플레이어는 맨 뒤
  const count = cfg.mode === 'race' ? 5 : 1;
  const slots = [];
  for (let k = 0; k < count; k++) {
    const idx = track.N - 5 - Math.floor(k / 2) * 5;
    slots.push({ idx, side: count === 1 ? 0 : (k % 2 ? -3.4 : 3.4) });
  }
  const aiTypes = ['light', 'heavy', 'balance', 'drift'].sort(() => Math.random() - 0.5);
  const aiColors = AI_COLORS.filter(c => colorDist(c[0], PLAYER_COLORS[cfg.car][0]) > 110).sort(() => Math.random() - 0.5);
  for (let k = 0; k < count; k++) {
    const isPlayer = k === count - 1;
    const s = slots[k];
    const p = track.pointAt(s.idx, s.side);
    const type = isPlayer ? cfg.car : aiTypes[k % 4];
    const params = carParams(type);
    if (isPlayer) { tuning = params; }
    const body = world.add(new CarBody({ x: p.x, z: p.z, angle: track.headingAt(s.idx), params }));
    if (isPlayer) body.p = tuning;
    const col = isPlayer ? PLAYER_COLORS[type] : aiColors[k % aiColors.length];
    const model = new CarModel(scene, col[0], col[1]);
    const r = {
      name: isPlayer ? '나' : AI_NAMES[k], type, body, model, isPlayer, color: col[0],
      ai: isPlayer ? null : new AIDriver(body, track, cfg.diff, k + 1),
      idx: s.idx, crossed: false, lap: 0, nextCp: 0, lapStart: 0, lastLap: null, best: null,
      finished: false, finishTime: 0, stuckT: 0, wrongT: 0, rank: k + 1, progress: 0,
    };
    body.onBoost = () => onBoost(r);
    racers.push(r);
  }
  player = racers[racers.length - 1];
  bestLap = store.get('best_' + cfg.theme, null);
  syncTuner();
  drawMinimapBase();
  raceTime = 0; resultsTimer = -1;
  camYaw = player.body.angle;
  updateCamera(0, true);
  for (const r of racers) r.model.update(r.body, 0);
  for (const pr of props) pr.sync(pr.mesh, pr.body, 0);
}

function startRace() {
  $('menu').hidden = true; $('results').hidden = true;
  audio.start();
  buildRace();
  $('hud-race').classList.toggle('practice', cfg.mode !== 'race');
  $('hud-rank').hidden = cfg.mode !== 'race';
  if (cfg.mode === 'race') {
    phase = 'countdown'; countdown = 3.2; lastCount = 4;
    for (const r of racers) r.body.frozen = true;
  } else {
    phase = 'racing';
    flash('출발선을 지나면 기록 시작!', 1800);
  }
}

function openMenu() {
  phase = 'menu';
  $('results').hidden = true;
  $('menu').hidden = false;
  renderMenu();
}

// ---------- 메뉴 ----------
function pick(container, items, current, onPick, render) {
  const el = $(container); el.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'pick' + (it.key === current ? ' sel' : '') + (it.center ? ' center' : '');
    b.innerHTML = render(it);
    b.onclick = () => { onPick(it.key); renderMenu(); };
    el.appendChild(b);
  }
}
function renderMenu() {
  pick('pick-mode', [
    { key: 'race', nm: '🏁 레이스', ds: `${TOTAL_LAPS}바퀴 · 친구 4대와 순위 대결` },
    { key: 'practice', nm: '⏱️ 연습 주행', ds: '혼자 달리며 최고 기록 도전' },
  ], cfg.mode, k => { cfg.mode = k; buildRace(); }, it => `<div class="nm">${it.nm}</div><div class="ds">${it.ds}</div>`);
  pick('pick-track', Object.entries(THEMES).map(([key, t]) => ({ key, ...t })), cfg.theme, k => { cfg.theme = k; buildRace(); }, it => {
    const b = store.get('best_' + it.key, null);
    return `<div class="nm"><span class="swatch" style="background:#${it.ground.toString(16).padStart(6, '0')}"></span>${it.name}</div>
      <div class="ds">${it.desc}</div><div class="best">최고 ${b ? fmt(b) : '-'}</div>`;
  });
  const statNames = ['속도', '가속', '무게', '드리프트'];
  pick('pick-car', Object.entries(CAR_TYPES).map(([key, t]) => ({ key, ...t })), cfg.car, k => { cfg.car = k; buildRace(); }, it => {
    const st = CAR_STATS[it.key];
    return `<div class="nm"><span class="swatch" style="background:#${PLAYER_COLORS[it.key][0].toString(16).padStart(6, '0')}"></span>${it.name}</div>
      <div class="ds">${it.desc}</div>
      <div class="stats">${st.map((v, i) => `<span>${statNames[i]}</span><i style="width:${v * 20}%"></i>`).join('')}</div>`;
  });
  pick('pick-diff', Object.entries(DIFFICULTY).map(([key, d]) => ({ key, nm: d.name, center: true })), cfg.diff, k => cfg.diff = k,
    it => `<div class="nm" style="justify-content:center">${it.nm}</div>`);
  $('diff-wrap').hidden = cfg.mode !== 'race';
  store.set('cfg', cfg);
}
$('btn-start').onclick = startRace;
$('btn-again').onclick = startRace;
$('btn-to-menu').onclick = () => { openMenu(); buildRace(); };
$('btn-menu').onclick = (e) => { e.currentTarget.blur(); openMenu(); };

// ---------- 입력 ----------
const keys = {};
const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyX'];
window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.includes(e.code) && phase !== 'menu') e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyR' && phase === 'racing') respawn(player, true);
  if (e.code === 'KeyC') cycleCamera();
  if (e.code === 'Escape' && phase !== 'menu') openMenu();
  if (e.code === 'Enter' && phase === 'menu') startRace();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const touch = { left: false, right: false, gas: false, brake: false, drift: false, boost: false };
for (const [id, key] of [['t-left', 'left'], ['t-right', 'right'], ['t-gas', 'gas'], ['t-brake', 'brake'], ['t-drift', 'drift'], ['t-boost', 'boost']]) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); touch[key] = true; el.classList.add('down'); };
  const off = (e) => { e.preventDefault(); touch[key] = false; el.classList.remove('down'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}

let steerSmooth = 0;
function readInput(dt) {
  const inp = player.body.input;
  if (player.finished) return; // 완주 후엔 자동 운전
  const left = keys.ArrowLeft || keys.KeyA || touch.left;
  const right = keys.ArrowRight || keys.KeyD || touch.right;
  const target = (left ? 1 : 0) - (right ? 1 : 0);
  const rate = target === 0 ? 8 : 5;
  steerSmooth += Math.max(-rate * dt, Math.min(rate * dt, target - steerSmooth));
  inp.steer = steerSmooth;
  inp.throttle = (keys.ArrowUp || keys.KeyW || touch.gas) ? 1 : 0;
  inp.brake = (keys.ArrowDown || keys.KeyS || touch.brake) ? 1 : 0;
  inp.drift = !!(keys.Space || touch.drift);
  inp.boost = !!(keys.ShiftLeft || keys.ShiftRight || keys.KeyX || touch.boost);
}

function respawn(r, announce) {
  const i = track.nearestIndex(r.body.x, r.body.z, r.idx);
  // 다른 차와 겹치지 않는 차선 찾기
  let side = 0;
  for (const s of [0, 3.5, -3.5, 6, -6]) {
    const p = track.pointAt(i, s);
    if (racers.every(o => o === r || Math.hypot(o.body.x - p.x, o.body.z - p.z) > 4.5)) { side = s; break; }
  }
  const p = track.pointAt(i, side);
  Object.assign(r.body, { x: p.x, z: p.z, vx: 0, vz: 0, av: 0, angle: track.headingAt(i), steer: 0 });
  r.stuckT = 0; r.wrongT = 0;
  for (const k of [0.92, -0.92]) skids.last.delete(r.name + k);
  if (announce) flash('제자리로!', 900);
}

// ---------- 카메라 ----------
const CAM_MODES = [
  { name: '추적', dist: 8.5, height: 3.6, look: 1.2, fov: 64 },
  { name: '멀리', dist: 15, height: 7.5, look: 0.8, fov: 58 },
  { name: '위에서', dist: 4, height: 34, look: 0, fov: 55 },
];
let camMode = 0, camYaw = 0, shake = 0, menuOrbit = 0;
const camPos = new THREE.Vector3();
function cycleCamera() {
  camMode = (camMode + 1) % CAM_MODES.length;
  if (phase !== 'menu') flash(CAM_MODES[camMode].name + ' 시점', 700);
}
function updateCamera(dt, snap = false) {
  const b = player.body;
  if (phase === 'menu') {
    // 메뉴: 출발선 주변을 천천히 돌기
    menuOrbit += dt * 0.12;
    const s = track.samples[track.N - 8];
    camera.position.set(s.x + Math.sin(menuOrbit) * 26, 9, s.z + Math.cos(menuOrbit) * 26);
    camera.lookAt(s.x, 1, s.z);
    if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
    sun.position.set(s.x + 30, 60, s.z + 20); sun.target.position.set(s.x, 0, s.z);
    return;
  }
  const m = CAM_MODES[camMode];
  const spd = b.speed;
  let yawTarget = b.angle;
  if (spd > 4) {
    let d = Math.atan2(b.vx, b.vz) - b.angle; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 1.6) yawTarget = b.angle + d * 0.55;
  }
  let dy = yawTarget - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  camYaw += dy * (snap ? 1 : Math.min(1, dt * 5));
  const back = m.dist + spd * 0.08;
  const target = new THREE.Vector3(b.x - Math.sin(camYaw) * back, m.height + spd * 0.03, b.z - Math.cos(camYaw) * back);
  if (snap) camPos.copy(target); else camPos.lerp(target, Math.min(1, dt * 8));
  camera.position.copy(camPos);
  if (b.boosting) shake = Math.max(shake, 0.12);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2.5);
  }
  const ahead = camMode === 2 ? 0 : 5;
  camera.lookAt(b.x + Math.sin(camYaw) * ahead, m.look, b.z + Math.cos(camYaw) * ahead);
  const fov = m.fov + Math.min(spd, 40) * 0.33 + (b.boosting ? 8 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  sun.position.set(b.x + 30, 60, b.z + 20);
  sun.target.position.set(b.x, 0, b.z);
}

// ---------- 랩 / 순위 ----------
const fmt = (t) => {
  if (t == null) return '-';
  const m = Math.floor(t / 60), s = t - m * 60;
  return (m > 0 ? m + ':' : '') + (m > 0 && s < 10 ? '0' : '') + s.toFixed(2);
};

function updateLaps(dt) {
  const N = track.N, cps = [N * 0.25, N * 0.5, N * 0.75].map(Math.floor);
  for (const r of racers) {
    const b = r.body;
    const prev = r.idx;
    r.idx = track.nearestIndex(b.x, b.z, r.idx);
    let diff = r.idx - prev;
    if (diff > N / 2) diff -= N; if (diff < -N / 2) diff += N;
    if (r.nextCp < 3 && Math.abs(r.idx - cps[r.nextCp]) < 12) r.nextCp++;

    if (prev > N - 30 && r.idx < 30 && diff > 0 && !r.finished) {
      if (!r.crossed) {
        r.crossed = true; r.lapStart = raceTime; r.nextCp = 0;
        if (r.isPlayer && cfg.mode === 'practice') { flash('기록 시작!', 900); audio.jingle([[660, 0.1], [880, 0.16]]); }
      } else if (r.nextCp >= 3) {
        const t = raceTime - r.lapStart;
        r.lap++; r.lastLap = t; r.lapStart = raceTime; r.nextCp = 0;
        if (r.best == null || t < r.best) r.best = t;
        if (r.isPlayer) onPlayerLap(t);
        if (cfg.mode === 'race' && r.lap >= TOTAL_LAPS) {
          r.finished = true; r.finishTime = raceTime;
          if (r.isPlayer) onPlayerFinish();
        }
      }
    }
    if (prev < 30 && r.idx > N - 30 && diff < 0) r.nextCp = 0;
    // 진행도 (순위 계산용)
    r.progress = r.crossed ? r.lap * N + r.idx : r.idx - N;
    if (r.finished) r.progress = 1e9 - r.finishTime;

    // 역주행 / 끼임 감지
    const t = track.tangents[r.idx];
    const along = b.vx * t.x + b.vz * t.z;
    r.wrongT = along < -3 ? r.wrongT + dt : 0;
    if ((phase === 'racing' || phase === 'done') && !b.frozen) {
      r.stuckT = b.speed < 1 ? r.stuckT + dt : 0;
      if (!r.isPlayer || r.finished) {
        if (r.stuckT > 4 || r.wrongT > 3) respawn(r, false);
      }
    }
  }
  // 순위
  const prevRank = player.rank;
  [...racers].sort((a, c) => c.progress - a.progress).forEach((r, i) => r.rank = i + 1);
  if (cfg.mode === 'race' && phase === 'racing' && player.rank < prevRank && !player.finished) {
    player.body.boostGauge = Math.min(1, player.body.boostGauge + 0.12); // 추월 보너스
    flash('추월!', 600);
  }
}

function onPlayerLap(t) {
  let msg;
  if (bestLap == null || t < bestLap) {
    bestLap = t; store.set('best_' + cfg.theme, t);
    msg = '최고 기록! ' + fmt(t);
    audio.jingle([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]]);
  } else {
    msg = (cfg.mode === 'race' ? `${player.lap}바퀴 · ` : '') + fmt(t);
    audio.jingle([[660, 0.1], [880, 0.16]]);
  }
  if (cfg.mode === 'race' && player.lap === TOTAL_LAPS - 1) msg = '마지막 바퀴!';
  flash(msg, 1500);
}

function onPlayerFinish() {
  flash(player.rank === 1 ? '우승!' : `${player.rank}등!`, 2500);
  audio.jingle(player.rank === 1 ? [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.12], [784, 0.12], [1047, 0.4]] : [[523, 0.15], [659, 0.15], [784, 0.3]]);
  player.ai = new AIDriver(player.body, track, 'normal', 99); // 완주 후 자동 운전
  player.body.input.boost = false;
  resultsTimer = 2.5;
  phase = 'done';
}

function showResults() {
  $('results').hidden = false;
  $('res-title').textContent = player.rank === 1 ? '우승! 🏆' : `${player.rank}등으로 완주!`;
  $('res-sub').textContent = `${track.theme.name} · ${TOTAL_LAPS}바퀴 · 상대 ${DIFFICULTY[cfg.diff].name}`;
  renderResults();
}
function renderResults() {
  const medals = ['🥇', '🥈', '🥉', '4', '5'];
  const rows = [...racers].sort((a, c) => a.rank - c.rank).map((r, i) => `
    <tr class="${r.isPlayer ? 'me' : ''}">
      <td class="medal">${medals[i]}</td>
      <td><span class="swatch" style="display:inline-block;vertical-align:-2px;margin-right:6px;background:#${r.color.toString(16).padStart(6, '0')}"></span>${r.name} <small style="opacity:.6">${CAR_TYPES[r.type].name}</small></td>
      <td>${r.finished ? fmt(r.finishTime) : '달리는 중…'}</td>
      <td>${r.best != null ? '최고 ' + fmt(r.best) : ''}</td>
    </tr>`).join('');
  $('res-table').innerHTML = rows;
}

// ---------- 부스터 ----------
function onBoost(r) {
  const d = Math.hypot(r.body.x - player.body.x, r.body.z - player.body.z);
  audio.boost(r.isPlayer ? 1 : Math.max(0, 0.5 - d / 80));
  if (r.isPlayer) { flash('부스터!', 700); shake = 0.4; }
}

// ---------- HUD ----------
const el = {
  rank: $('hud-rank'), lap: $('hud-lap'), time: $('hud-time'), last: $('hud-last'), best: $('hud-best'),
  speedNum: $('speed-num'), speedArc: $('speed-arc'), drift: $('hud-drift'), msg: $('hud-msg'),
  boost: $('hud-boost'), boostFill: $('boost-fill'), boostLabel: $('boost-label'), count: $('countdown'),
};
let msgTimer = 0, driftHold = 0;
function flash(text, ms = 1200) {
  el.msg.textContent = text;
  el.msg.classList.add('show');
  msgTimer = ms / 1000;
}
function updateHud(dt) {
  const b = player.body;
  const kmh = Math.round(Math.abs(b.vLong) * 3.6);
  el.speedNum.textContent = kmh;
  el.speedArc.setAttribute('stroke-dasharray', `${Math.min(1, kmh / 145) * 207} 300`);
  el.speedArc.setAttribute('stroke', b.boosting ? '#4cc9f0' : '#ff4f6d');
  if (cfg.mode === 'race') {
    el.rank.innerHTML = `${player.rank}<small>/${racers.length}등</small>`;
    el.lap.textContent = `${Math.min(player.lap + (player.crossed ? 1 : 0), TOTAL_LAPS) || 1}/${TOTAL_LAPS}`;
    el.time.textContent = fmt(player.finished ? player.finishTime : raceTime);
  } else {
    el.lap.textContent = player.lap;
    el.time.textContent = player.crossed ? fmt(raceTime - player.lapStart) : '-';
  }
  el.last.textContent = fmt(player.lastLap);
  el.best.textContent = fmt(bestLap);

  // 부스터 게이지
  const g = b.boosting ? b.boostLeft / b.p.boostTime : b.boostGauge;
  el.boostFill.style.width = (g * 100).toFixed(1) + '%';
  el.boost.classList.toggle('ready', !b.boosting && b.boostGauge >= 1);
  el.boost.classList.toggle('active', b.boosting);
  el.boostLabel.textContent = b.boosting ? '부스터 작동 중!' : b.boostGauge >= 1 ? '부스터 준비!' : '부스터';

  driftHold = b.drifting ? 0.25 : Math.max(0, driftHold - dt);
  el.drift.classList.toggle('show', driftHold > 0);
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) el.msg.classList.remove('show'); }
  if (player.wrongT > 1.2 && msgTimer <= 0) flash('반대 방향이에요!', 600);
  if (phase === 'racing' && player.stuckT > 3 && msgTimer <= 0) flash(isTouch ? '꼼짝 못 하면 후진해 보세요' : '꼼짝 못 하면 R 키!', 1200);
}

// ---------- 미니맵 ----------
const mm = $('minimap'), mmx = mm.getContext('2d');
let mmBase = null, mmTf = null;
function drawMinimapBase() {
  const W = mm.width, pad = 24;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of track.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const sc = (W - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = (W - (maxX - minX) * sc) / 2, oz = (W - (maxZ - minZ) * sc) / 2;
  // 화면 위쪽 = 트랙의 -z 방향이 아니라 보기 좋게 x는 반전
  mmTf = (x, z) => [W - (ox + (x - minX) * sc), oz + (z - minZ) * sc];
  mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = W;
  const g = mmBase.getContext('2d');
  g.lineJoin = g.lineCap = 'round';
  const path = () => { g.beginPath(); track.samples.forEach((s, i) => { const [x, y] = mmTf(s.x, s.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  path(); g.strokeStyle = '#2b2d42'; g.lineWidth = 22; g.stroke();
  path(); g.strokeStyle = '#fffdf6'; g.lineWidth = 14; g.stroke();
  for (const zn of track.zones) {
    const [x, y] = mmTf(zn.x, zn.z);
    g.fillStyle = track.theme.zone.color; g.beginPath(); g.arc(x, y, Math.max(5, zn.r * sc), 0, 7); g.fill();
  }
  const [sx, sy] = mmTf(track.samples[0].x, track.samples[0].z);
  g.fillStyle = '#2b2d42'; g.fillRect(sx - 7, sy - 7, 14, 14);
  g.fillStyle = '#fff'; g.fillRect(sx - 7, sy - 7, 7, 7); g.fillRect(sx, sy, 7, 7);
}
function drawMinimap() {
  mmx.clearRect(0, 0, mm.width, mm.height);
  mmx.drawImage(mmBase, 0, 0);
  for (const r of [...racers].sort((a) => a.isPlayer ? 1 : -1)) {
    const [x, y] = mmTf(r.body.x, r.body.z);
    mmx.beginPath(); mmx.arc(x, y, r.isPlayer ? 11 : 8, 0, 7);
    mmx.fillStyle = '#' + r.color.toString(16).padStart(6, '0'); mmx.fill();
    mmx.lineWidth = r.isPlayer ? 4 : 3; mmx.strokeStyle = '#2b2d42'; mmx.stroke();
  }
}

// ---------- 튜닝 패널 ----------
const SLIDERS = [
  { key: 'engine', label: '엔진 힘', min: 8, max: 32, step: 0.5 },
  { key: 'grip', label: '타이어 접지력', min: 0.7, max: 2.6, step: 0.05 },
  { key: 'driftGrip', label: '드리프트 뒷바퀴 접지', min: 0.15, max: 0.9, step: 0.01 },
  { key: 'maxSteer', label: '최대 조향각', min: 0.25, max: 0.85, step: 0.01 },
  { key: 'mass', label: '차 무게', min: 0.5, max: 3, step: 0.1 },
  { key: 'restitution', label: '충돌 탄성', min: 0, max: 0.9, step: 0.05 },
  { key: 'boostThrust', label: '부스터 힘', min: 1, max: 3, step: 0.1 },
];
const sliderEls = {};
for (const s of SLIDERS) {
  const lab = document.createElement('label');
  lab.innerHTML = `${s.label} <span></span><input type="range" id="tune-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">`;
  const input = lab.querySelector('input'), val = lab.querySelector('span');
  input.addEventListener('input', () => {
    tuning[s.key] = parseFloat(input.value);
    val.textContent = tuning[s.key].toFixed(2);
    if (s.key === 'mass') player.body.setMass(tuning.mass);
  });
  input.addEventListener('keydown', (e) => e.stopPropagation());
  sliderEls[s.key] = { input, val };
  $('tuner-sliders').appendChild(lab);
}
function syncTuner() {
  for (const s of SLIDERS) { sliderEls[s.key].input.value = tuning[s.key]; sliderEls[s.key].val.textContent = (+tuning[s.key]).toFixed(2); }
}
$('btn-reset-tune').onclick = () => {
  Object.assign(tuning, carParams(player.type));
  player.body.setMass(tuning.mass);
  syncTuner();
};
$('btn-tune').onclick = (e) => { $('tuner').hidden = !$('tuner').hidden; e.currentTarget.classList.toggle('on'); e.currentTarget.blur(); };
$('btn-cam').onclick = (e) => { cycleCamera(); e.currentTarget.blur(); };
$('btn-sound').onclick = (e) => {
  audio.start();
  audio.setMuted(!audio.muted);
  e.currentTarget.textContent = audio.muted ? '소리 끔' : '소리 켬';
  e.currentTarget.blur();
};

// ---------- 충돌 효과 ----------
let bumpCooldown = 0;
function handleContacts() {
  let best = null;
  for (const c of world.contacts) {
    if (c.vn > 4) {
      for (const b of [c.a, c.b]) {
        if (!b) continue;
        const r = b.kind === 'car' && racers.find(x => x.body === b);
        if (r) r.model.bump(Math.min(0.6, c.vn * 0.04));
        if (b.kind === 'bumper') b.ref.wobble = 1;
      }
    }
    if (!best || c.vn > best.vn) best = c;
  }
  world.contacts.length = 0;
  if (!best || best.vn < 3.5 || bumpCooldown > 0) return;
  const dist = Math.hypot(best.x - player.body.x, best.z - player.body.z);
  const near = Math.max(0, 1 - dist / 60);
  if (near <= 0) return;
  const kinds = [best.a.kind, best.b ? best.b.kind : 'wall'];
  const bouncyWall = kinds[1] === 'wall' && track.theme.wallBounce;
  if (kinds.includes('bumper') || bouncyWall) audio.boing();
  else if (kinds.includes('prop')) audio.bump(Math.min(1, best.vn / 12) * near, true);
  else {
    audio.bump(Math.min(1, best.vn / 15) * near);
    sparks.burst(best.x, best.z, best.nx, best.nz, best.vn / 3);
  }
  if (best.a === player.body || best.b === player.body) shake = Math.max(shake, Math.min(0.9, best.vn * 0.05));
  bumpCooldown = 0.12;
}

// ---------- 차량 효과 ----------
function carEffects(r, dt) {
  const car = r.body;
  const fX = car.fwdX, fZ = car.fwdZ, lX = car.leftX, lZ = car.leftZ;
  const hardBrake = car.input.brake > 0 && car.vLong > 12;
  const zn = track.surfaceAt(car.x, car.z);
  const sliding = car.drifting || hardBrake || (Math.abs(car.slipFront) > 0.35 && car.speed > 8);
  for (const side of [0.92, -0.92]) {
    const wx = car.x + lX * side - fX * 1.22, wz = car.z + lZ * side - fZ * 1.22;
    skids.track(r.name + side, wx, wz, lX, lZ, sliding && !(zn && zn.type === 'ice'));
    if (sliding && Math.random() < dt * 24) {
      smoke.spawn(wx, 0.4, wz, { vx: (Math.random() - 0.5) * 1.5 - car.vx * 0.05, vy: 0.8 + Math.random(), vz: (Math.random() - 0.5) * 1.5 - car.vz * 0.05, size: 0.8, grow: 2.6, life: 0.9, color: 0xf4f4f4, alpha: 0.5 });
    }
    // 모래/초콜릿 튀김
    if (zn && zn.type !== 'ice' && car.speed > 6 && Math.random() < dt * 14) {
      smoke.spawn(wx, 0.3, wz, { vx: -car.vx * 0.15, vy: 2, vz: -car.vz * 0.15, size: 0.5, grow: 1.4, life: 0.6, color: zn.type === 'sand' ? 0xe0b070 : 0x6b3a22, alpha: 0.8 });
    }
  }
  if (car.boosting && Math.random() < dt * 40) {
    smoke.spawn(car.x - fX * 2.6, 0.55, car.z - fZ * 2.6, { vx: -fX * 4, vy: 0.4, vz: -fZ * 4, size: 0.6, grow: 1.5, life: 0.35, color: Math.random() < 0.5 ? 0xff8a2a : 0xffd23f, alpha: 0.85 });
  }
  return sliding ? Math.min(1, Math.abs(car.slipRear) * 1.6 + (hardBrake ? 0.5 : 0)) : 0;
}

// ---------- 메인 루프 ----------
const FIXED = 1 / 120;
let acc = 0, last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.1) dt = 0.1;

  if (phase === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n !== lastCount && n >= 0) {
      lastCount = n;
      el.count.hidden = false;
      el.count.textContent = n > 0 ? n : '출발!';
      el.count.classList.remove('pop'); void el.count.offsetWidth; el.count.classList.add('pop');
      audio.beep(n > 0 ? 440 : 880, n > 0 ? 0.15 : 0.4);
      if (n === 0) {
        phase = 'racing';
        for (const r of racers) r.body.frozen = false;
        // 레이스는 출발 신호와 함께 시간 측정 (출발선 통과 시 1바퀴째 시작)
      }
    }
  }
  if (el.count.hidden === false && phase !== 'countdown' && countdown < -0.8) el.count.hidden = true;
  if (phase !== 'countdown') countdown -= dt;

  const running = phase === 'racing' || phase === 'done' || phase === 'countdown';
  if (running) {
    readInput(dt);
    // AI (뒤처진 정도에 따라 살짝 보정: 쉬움/보통만)
    const bodies = racers.map(r => r.body);
    for (const r of racers) if (r.ai) {
      if (!r.isPlayer && cfg.diff !== 'hard' && phase === 'racing') {
        const gap = (r.progress - player.progress) / track.N;
        r.ai.rubber = gap > 0.2 ? 0.95 : gap < -0.2 ? 1.05 : 1;
      }
      r.ai.update(dt, bodies);
    }
    // 노면
    for (const r of racers) {
      const zn = track.surfaceAt(r.body.x, r.body.z);
      r.body.surfaceGrip = zn ? zn.grip : 1;
      r.body.surfaceDrag = zn ? zn.drag : 0;
    }
    acc += dt;
    let steps = 0;
    while (acc >= FIXED && steps < 8) {
      world.step(FIXED);
      if (phase !== 'countdown') raceTime += FIXED;
      acc -= FIXED; steps++;
    }
    if (steps === 8) acc = 0;
    handleContacts();
    bumpCooldown -= dt;
    updateLaps(dt);
  }

  for (const r of racers) r.model.update(r.body, dt);
  for (const pr of props) pr.sync(pr.mesh, pr.body, dt);
  let skid = 0;
  if (running) for (const r of racers) { const s = carEffects(r, dt); if (r.isPlayer) skid = s; }
  smoke.update(dt); sparks.update(dt); track.update(dt, player.body);
  audio.update(running ? player.body.speed : 0, running ? (player.body.boosting ? 1 : player.body.input.throttle) : 0, skid);

  if (resultsTimer > 0) { resultsTimer -= dt; if (resultsTimer <= 0) showResults(); }
  if (!$('results').hidden && Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) renderResults();

  updateCamera(dt);
  if (phase !== 'menu') { updateHud(dt); drawMinimap(); }
  renderer.render(scene, camera);
}

// 시작: 메뉴 + 배경으로 트랙 미리보기
buildRace();
openMenu();
requestAnimationFrame(frame);

// 디버그/테스트용
window.__game = { get player() { return player; }, get racers() { return racers; }, get track() { return track; }, get world() { return world; }, get phase() { return phase; }, keys, cfg, startRace, openMenu };
