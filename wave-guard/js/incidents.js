// 파도풀 안전요원 - 위험 상황 정의와 관리
import * as THREE from 'three';
import { POOL, waveH, depthAt, inPool, clamp, rand, pick } from './env.js';

export const TOOLS = {
  whistle: { icon: '🔔', name: '호루라기', key: 1 },
  buoy: { icon: '🛟', name: '구명튜브', key: 2 },
  rescue: { icon: '🏊', name: '직접 구조', key: 3 },
  broadcast: { icon: '📢', name: '안내 방송', key: 4 },
  medic: { icon: '🩺', name: '응급 호출', key: 5 },
};
export const TOOL_ORDER = ['whistle', 'buoy', 'rescue', 'broadcast', 'medic'];

const towerFace = (p) => Math.atan2(0 - p.x, 17 - p.z);

// ---------- 공통 연출 ----------
function leaveSteps(g, p, speed) {
  return [...p.route(rand(-7, 7), 20.5, speed || 1.1), { t: 'fn', f: (q) => g.people.despawn(q) }];
}

function normalize(p, pref) {
  p.seq = []; p.path = []; p.state = 'normal'; p.incident = null; p.pinned = false; p.cool = 25;
  if (pref) p.pref = pref; p.idle = rand(0.5, 2); p.life = Math.max(p.life, 40);
}

function chairFor(g, x) { return g.world.chairs[x < 0 ? 0 : 1]; }

// 구명튜브 던지기 → 끌어오기
function throwRing(g, p, after) {
  const ch = chairFor(g, p.x);
  const from = new THREE.Vector3(ch.x - ch.side * 0.3, ch.seatY + 0.9, ch.z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.11, 10, 24), new THREE.MeshStandardMaterial({ color: '#ff5a1f', roughness: 0.4 }));
  ring.rotation.x = Math.PI / 2; ring.castShadow = true; g.scene.add(ring);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([from, from]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#f4f4f4' })); g.scene.add(line);
  g.audio.whoosh();
  let t = 0; const dur = 0.85; let landed = false;
  p.pinned = true;
  const fx = {
    update(dt) {
      t += dt;
      if (!landed) {
        const k = Math.min(1, t / dur);
        const to = new THREE.Vector3(p.x, waveH(p.x, p.z) + 0.1, p.z);
        ring.position.lerpVectors(from, to, k); ring.position.y += Math.sin(k * Math.PI) * 4;
        ring.rotation.z += dt * 10;
        if (k >= 1) { landed = true; g.world.splash(p.x, waveH(p.x, p.z), p.z, 18, 1); g.audio.splash(0.8); after && after(fx); }
      } else if (!fx.done) {
        ring.position.set(p.x + Math.sin(p.head) * 0.35, waveH(p.x, p.z) + 0.05, p.z + Math.cos(p.head) * 0.35);
        ring.rotation.set(Math.PI / 2, 0, 0);
      }
      const pts = lineGeo.attributes.position; pts.setXYZ(1, ring.position.x, ring.position.y, ring.position.z); pts.needsUpdate = true;
      if (fx.done) { ring.position.lerp(from, Math.min(1, dt * 3)); if (ring.position.distanceTo(from) < 0.5) { g.scene.remove(ring, line); return false; } }
      return true;
    },
    done: false,
  };
  g.addFx(fx);
  return fx;
}

// 끌어내서 데크로 올리고 퇴장
function towOut(g, p, fx, speed = 1.6) {
  const side = p.x < 0 ? -1 : 1;
  const tz = clamp(p.z, -36, 1);
  p.setSeq([
    { t: 'wait', d: 0.5, pose: 'holdRing' },
    { t: 'go', x: side * 19.4, z: tz, speed, pose: 'towed' },
    { t: 'fn', f: (q) => { if (fx) fx.done = true; q.x = side * 21.2; q.pinned = false; q.vest = false; q.tube = false; g.people.recolor(q); q.applyShape(); g.world.splash(side * 19.8, 0, tz, 10, 0.6); } },
    { t: 'wait', d: 2.5, pose: 'sitHurt' },
    ...leaveSteps(g, p, 0.9),
  ]);
}

function guardRescue(g, p, after) {
  const ch = chairFor(g, p.x); const side = ch.side;
  const gd = g.people.spawn({ staff: 'guard', x: side * 21.6, z: ch.z + 1.2, head: -side * Math.PI / 2 });
  if (!gd) { towOut(g, p, null); return; }
  const ez = clamp(p.z, -36, 1);
  p.pinned = true;
  p.setSeq([{ t: 'upd', f: (q) => { q.pose = q.pose === 'flail' ? 'flail' : 'facedown'; return q.released; } },
    { t: 'upd', f: (q) => { q.pose = 'towed'; if (!gd.alive || q.dropped) return true; q.x = gd.x + Math.sin(gd.head) * -0.7; q.z = gd.z + Math.cos(gd.head) * -0.7; q.head = gd.head; return false; } },
    { t: 'fn', f: (q) => { q.x = side * 21.6; q.z = ez + 0.6; q.lieY = POOL.deck; q.head = side > 0 ? Math.PI / 2 : -Math.PI / 2; q.vest = false; q.tube = false; g.people.recolor(q); q.applyShape(); } },
    { t: 'wait', d: 3, pose: 'lie' }, { t: 'wait', d: 1.5, pose: 'sitHurt' }, ...leaveSteps(g, p, 0.8)]);
  gd.setSeq([
    { t: 'go', x: side * 20.5, z: ez, speed: 4.5, pose: 'run' },
    { t: 'fn', f: (q) => { q.x = side * 19.5; g.world.splash(q.x, 0, q.z, 24, 1.3); g.audio.splash(1.2); } },
    { t: 'upd', f: (q, dt) => { q.pose = 'guardSwim'; return q.moveToward(p.x - side * 0.4, p.z, 2.8, dt) || Math.hypot(p.x - q.x, p.z - q.z) < 0.9; } },
    { t: 'fn', f: () => { p.released = true; after && after(); } },
    { t: 'go', x: side * 19.3, z: ez, speed: 1.6, pose: 'guardSwim' },
    { t: 'fn', f: (q) => { p.dropped = true; q.x = side * 21.0; q.z = ez; } },
    { t: 'wait', d: 3.2, pose: 'kneel', face: side > 0 ? -Math.PI / 2 : Math.PI / 2 },
    { t: 'go', x: side * 21.6, z: ch.z + 1.2, speed: 1.4, pose: 'walk' },
    { t: 'fn', f: (q) => g.people.despawn(q) },
  ]);
}

function medicCall(g, p) {
  const a = g.world.aid;
  const md = g.people.spawn({ staff: 'medic', x: a.x, z: a.z, head: 0 });
  p.setSeq([{ t: 'upd', f: (q) => { q.pose = q.pose === 'lie' ? 'lie' : 'sitHurt'; return q.medicDone; } }, { t: 'wait', d: 0.6, pose: 'stand' }]);
  p.pinned = true;
  if (!md) { p.medicDone = true; return; }
  md.setSeq([
    ...md.route(p.x + 0.7, p.z + 0.2, 3.2, 'run'),
    { t: 'wait', d: 3.0, pose: 'kneel', face: Math.atan2(p.x - (p.x + 0.7), 0) },
    { t: 'fn', f: () => { p.medicDone = true; p.redFace = 0; g.people.recolor(p); p.after = () => { p.follow = md; p.fx = 0.6; p.fz = -0.4; }; } },
    { t: 'wait', d: 0.7, pose: 'stand' },
    { t: 'fn', f: () => { p.pinned = false; p.seq = []; p.follow = md; p.fx = 0.6; p.fz = -0.5; p.state = 'leaving'; p.onDespawnFollow = true; } },
    ...md.route(a.x, a.z, 1.0, 'walk'),
    { t: 'fn', f: (q) => { g.people.despawn(q); if (p.alive) g.people.despawn(p); } },
  ]);
}

function whistleStop(g, p, then) {
  g.ui.bubble(p, '🔔');
  p.setSeq([{ t: 'wait', d: 0.9, pose: (q) => (q.deep ? (q.tube ? 'tubeFloat' : 'tread') : 'stand'), face: towerFace(p) }, ...then]);
}

// ---------- 후보 찾기 ----------
const isFree = (p) => p.alive && !p.staff && p.state === 'normal' && !p.seq.length && !p.follow && !p.lounger && !p.child && !p.fake && p.cool <= 0 && !p.leaving;
const deepOnes = (g, f = () => true) => g.people.list.filter((p) => isFree(p) && p.deep && f(p));
const deckOnes = (g, f = () => true) => g.people.list.filter((p) => isFree(p) && depthAt(p.x, p.z) < 0.05 && Math.abs(p.z) < 30 && f(p));

function spawnDeckPerson(g, o = {}) {
  const s = Math.random() < 0.5 ? -1 : 1;
  const side = Math.random() < 0.6;
  return g.people.spawn({ x: side ? s * 22.4 : rand(-12, 12), z: side ? rand(-20, 4) : rand(9.5, 12), pref: 'beach', vest: false, ...o });
}

// ---------- 상황 정의 ----------
export const TYPES = {
  noVest: {
    name: '구명조끼 미착용', tool: 'whistle', limit: 15, shift: 1, w: 1.2,
    start(g) {
      const p = g.people.spawn({ x: rand(-10, 10), z: rand(11, 13), vest: false, tube: false, pref: 'water', female: Math.random() < 0.4 });
      if (!p) return null;
      const tx = rand(-15, 15), tz = rand(-18, -7);
      p.setSeq([...p.route(tx, tz, 1.0), { t: 'upd', f: (q, dt) => { q.pose = q.deep ? 'tread' : 'stand'; q.x += Math.sin(g.t * 0.3 + q.id) * dt * 0.2; return false; } }]);
      p.life = 300; return p;
    },
    fail(inc) { return inc.p.deep ? { chain: 'drowning' } : null; },
    resolve(inc, g) {
      const p = inc.p;
      whistleStop(g, p, [...p.route(clamp(p.x, -15, 15), rand(3, 5), 0.9), { t: 'fn', f: (q) => { q.vest = true; q.applyShape(); g.people.recolor(q); normalize(q, 'water'); } }]);
    },
  },
  drowning: {
    name: '허우적거림', tool: 'buoy', limit: 9, shift: 1, w: 1.3,
    start(g, from) {
      const p = from || pick(deepOnes(g, (q) => !q.tube && q.z < -6) || []);
      if (!p) return null;
      if (!from) { p.vest = false; p.applyShape(); g.people.recolor(p); }
      p.setSeq([{ t: 'upd', f: (q, dt) => { q.pose = 'flail'; q.splT = (q.splT || 0) - dt; if (q.splT <= 0) { q.splT = rand(0.2, 0.45); g.world.splash(q.x + rand(-0.3, 0.3), waveH(q.x, q.z) + 0.05, q.z + rand(-0.3, 0.3), 5, 0.7); } return false; } }]);
      return p;
    },
    resolve(inc, g, auto) { const p = inc.p; if (auto) return guardRescue(g, p); throwRing(g, p, (fx) => towOut(g, p, fx)); },
  },
  lineCross: {
    name: '안전선 넘어감', tool: 'broadcast', limit: 13, shift: 1, w: 1, pa: true,
    start(g) {
      const p = pick(deepOnes(g, (q) => q.z < -16 && !q.tube));
      if (!p) return null;
      p.setSeq([{ t: 'go', x: clamp(p.x, -17, 17), z: rand(-37.5, -34), speed: 0.9, pose: 'swim' }, { t: 'upd', f: (q) => { q.pose = 'tread'; return false; } }]);
      return p;
    },
    resolve(inc, g) {
      const p = inc.p;
      p.setSeq([{ t: 'wait', d: 1.6, pose: 'tread', face: 0 }, { t: 'go', x: p.x, z: rand(-24, -18), speed: 1.0, pose: 'swim' }, { t: 'fn', f: (q) => normalize(q) }]);
    },
  },
  running: {
    name: '풀사이드 뛰기', tool: 'whistle', limit: 8, shift: 1, w: 1,
    start(g) {
      const kid = Math.random() < 0.5; const s = Math.random() < 0.5 ? -1 : 1; const near = Math.random() < 0.4;
      const p = g.people.spawn({ child: kid, x: near ? -14 : s * 22.6, z: near ? 10.6 : rand(-30, -10), vest: false, pref: 'beach' });
      if (!p) return null;
      let dir = 1;
      p.setSeq([{ t: 'upd', f: (q, dt) => {
        const tx = near ? dir * 15 : s * 22.6, tz = near ? 10.6 + Math.sin(g.t) * 0.5 : (dir > 0 ? 4 : -34);
        if (q.moveToward(tx, tz, kid ? 3.6 : 4.4, dt)) dir *= -1; q.pose = 'run'; return false; } }]);
      return p;
    },
    fail(inc, g) { const p = inc.p; g.audio.thud(); return { chain: 'injured' }; },
    resolve(inc, g) { const p = inc.p; whistleStop(g, p, [{ t: 'fn', f: (q) => normalize(q, 'beach') }]); },
  },
  bottle: {
    name: '유리병 반입', tool: 'whistle', limit: 15, shift: 1, w: 0.8,
    start(g) {
      const p = spawnDeckPerson(g, { pref: 'beach' });
      if (!p) return null;
      p.bottle = true; p.life = 300; p.idle = 0;
      return p;
    },
    resolve(inc, g) { const p = inc.p; whistleStop(g, p, [{ t: 'fn', f: (q) => { q.bottle = false; normalize(q); } }]); },
    failMsg: '유리병이 깨져 부상자가 생겼어요',
    fail(inc, g) { inc.p.bottle = false; g.audio.glass(); return null; },
  },
  diving: {
    name: '다이빙 시도', tool: 'whistle', limit: 11, shift: 2, w: 0.9,
    start(g) {
      const s = Math.random() < 0.5 ? -1 : 1, z = rand(-7, 0);
      const p = g.people.spawn({ x: s * 23, z: z + rand(-3, 3), vest: false, pref: 'deck', female: false });
      if (!p) return null;
      p.setSeq([{ t: 'go', x: s * 20.45, z, speed: 1.3 }, { t: 'upd', f: (q, dt) => { q.faceTo(s > 0 ? -Math.PI / 2 : Math.PI / 2, dt); q.pose = 'diveReady'; return false; } }]);
      return p;
    },
    failMsg: '얕은 물에 다이빙해 부상을 입었어요',
    fail(inc, g) {
      const p = inc.p; const s = p.x < 0 ? -1 : 1;
      p.setSeq([{ t: 'go', x: s * 18.6, z: p.z, speed: 4, pose: 'air' }, { t: 'fn', f: (q) => { g.world.splash(q.x, 0, q.z, 26, 1.4); g.audio.splash(1.3); } }]);
      p.airPitch = 1.4; p.airY = 1.2;
      return null;
    },
    resolve(inc, g) { const p = inc.p; const s = p.x < 0 ? -1 : 1; whistleStop(g, p, [{ t: 'go', x: s * 22.5, z: p.z, speed: 0.9 }, { t: 'fn', f: (q) => normalize(q, 'deck') }]); },
  },
  tubeFlip: {
    name: '튜브 뒤집힘', tool: 'buoy', limit: 11, shift: 2, w: 0.9,
    start(g) {
      const p = pick(deepOnes(g, (q) => q.tube));
      if (!p) return null;
      g.world.splash(p.x, 0, p.z, 16, 1);
      p.setSeq([{ t: 'upd', f: (q, dt) => { q.pose = 'cling'; q.splT = (q.splT || 0) - dt; if (q.splT <= 0) { q.splT = rand(0.4, 0.8); g.world.splash(q.x, waveH(q.x, q.z), q.z, 4, 0.5); } return false; } }]);
      return p;
    },
    resolve(inc, g, auto) {
      const p = inc.p; if (auto) return guardRescue(g, p);
      throwRing(g, p, (fx) => { p.setSeq([{ t: 'wait', d: 1.6, pose: 'holdRing' }, { t: 'fn', f: (q) => { fx.done = true; q.pinned = false; normalize(q); } }]); });
    },
  },
  cramp: {
    name: '다리 경련', tool: 'buoy', limit: 12, shift: 2, w: 0.9,
    start(g) {
      const p = pick(deepOnes(g, (q) => !q.tube && q.z < -8));
      if (!p) return null;
      p.setSeq([{ t: 'upd', f: (q) => { q.pose = 'cramp'; return false; } }]);
      return p;
    },
    resolve(inc, g, auto) { const p = inc.p; if (auto) return guardRescue(g, p); throwRing(g, p, (fx) => towOut(g, p, fx, 1.3)); },
  },
  loneChild: {
    name: '보호자 없는 아이', tool: 'broadcast', limit: 17, shift: 3, w: 0.9, pa: true,
    start(g) {
      const p = g.people.spawn({ child: true, x: rand(-14, 14), z: rand(3.2, 6.5), vest: false, pref: 'beach' });
      if (!p) return null;
      p.setSeq([{ t: 'upd', f: (q, dt) => { q.pose = 'cry'; q.head += dt * 0.35; q.z = Math.max(2.6, q.z - dt * 0.05); return false; } }]);
      return p;
    },
    failMsg: '아이가 혼자 물에 들어가 위험했어요',
    resolve(inc, g) {
      const p = inc.p;
      const par = g.people.spawn({ x: clamp(p.x, -12, 12), z: 14, vest: false, pref: 'beach', female: Math.random() < 0.6 });
      p.setSeq([{ t: 'upd', f: (q) => { q.pose = 'cry'; return !par || !par.alive || Math.hypot(par.x - q.x, par.z - q.z) < 1.0; } }, { t: 'fn', f: (q) => { normalize(q); if (par && par.alive) { q.follow = par; q.fx = 0.5; q.fz = 0.4; } } }]);
      if (par) par.setSeq([...par.route(p.x + 0.6, p.z + 0.6, 3.0, 'run'), { t: 'wait', d: 1.2, pose: 'stand' }, { t: 'fn', f: (q) => { normalize(q, 'beach'); q.life = 50; } }]);
    },
  },
  fight: {
    name: '이용객 싸움', tool: 'whistle', limit: 12, shift: 3, w: 0.9,
    start(g) {
      const A = g.people.list.filter((p) => isFree(p) && p.inWater && !p.deep && !p.tube && p.z > -12);
      for (const a of A) {
        const b = A.find((q) => q !== a && Math.hypot(q.x - a.x, q.z - a.z) < 5);
        if (!b) continue;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ang = Math.atan2(b.x - a.x, b.z - a.z);
        const ox = Math.sin(ang) * 0.42, oz = Math.cos(ang) * 0.42;
        const fightUpd = (me, other, sign, pose) => [{ t: 'go', x: mx - sign * ox, z: mz - sign * oz, speed: 1.4 }, { t: 'upd', f: (q, dt) => {
          q.faceTo(Math.atan2(other.x - q.x, other.z - q.z), dt); q.pose = pose;
          const j = Math.sin(g.t * 3.4 + (sign > 0 ? 0 : 1.6)) * 0.12; q.x = mx - sign * ox * (1 + j); q.z = mz - sign * oz * (1 + j); return false; } }];
        a.setSeq(fightUpd(a, b, 1, 'push')); b.setSeq(fightUpd(b, a, -1, 'shove'));
        a.pinned = b.pinned = true; a.partner = b; b.partner = a;
        b.state = 'incident';
        return a;
      }
      return null;
    },
    alsoHit: (inc) => [inc.p.partner],
    failMsg: '싸움으로 부상자가 생겼어요',
    resolve(inc, g) {
      const a = inc.p, b = a.partner;
      for (const [q, d] of [[a, -1], [b, 1]]) {
        if (!q || !q.alive) continue;
        q.pinned = false; q.partner = null;
        whistleStop(g, q, [{ t: 'go', x: clamp(q.x + d * 5, -17, 17), z: clamp(q.z + rand(-2, 2), -10, 1.5), speed: 0.7 }, { t: 'fn', f: (r) => normalize(r) }]);
      }
    },
  },
  heatstroke: {
    name: '일사병', tool: 'medic', limit: 13, shift: 3, w: 0.8,
    start(g) {
      const p = pick(deckOnes(g, (q) => !q.inWater)) || spawnDeckPerson(g);
      if (!p) return null;
      p.redFace = 1; g.people.recolor(p);
      const ox = p.x, oz = p.z;
      p.setSeq([{ t: 'upd', f: (q, dt) => { q.moveToward(ox + Math.sin(g.t * 0.4 + q.id) * 1.2, oz + Math.cos(g.t * 0.3) * 1.0, 0.35, dt); q.pose = 'stagger'; q.speed = 0.6; return false; } }]);
      return p;
    },
    failMsg: '일사병으로 쓰러졌어요',
    fail(inc) { const p = inc.p; p.lieY = POOL.deck; p.setSeq([{ t: 'upd', f: (q) => { q.pose = 'lie'; return false; } }]); return null; },
    resolve(inc, g) { medicCall(g, inc.p); },
  },
  injured: {
    name: '넘어져 다침', tool: 'medic', limit: 15, shift: 3, w: 0.7,
    start(g, from) {
      const p = from || pick(deckOnes(g)) || spawnDeckPerson(g);
      if (!p) return null;
      if (!from) g.audio.thud();
      p.setSeq([{ t: 'upd', f: (q) => { q.pose = 'sitHurt'; return false; } }]);
      return p;
    },
    resolve(inc, g) { medicCall(g, inc.p); },
  },
  unconscious: {
    name: '의식 잃음', tool: 'rescue', limit: 10, shift: 4, w: 0.9,
    start(g) {
      const p = pick(deepOnes(g, (q) => !q.tube && q.z < -5));
      if (!p) return null;
      p.vest = false; p.applyShape(); g.people.recolor(p);
      p.setSeq([{ t: 'upd', f: (q) => { q.pose = 'facedown'; return false; } }]);
      return p;
    },
    resolve(inc, g) { guardRescue(g, inc.p); },
  },
  wallHang: {
    name: '파도 벽 매달리기', tool: 'whistle', limit: 13, shift: 4, w: 0.8,
    toolNow: (inc) => (inc.phase === 'cling' ? 'whistle' : 'broadcast'),
    start(g, _, inc) {
      const p = pick(deepOnes(g, (q) => q.z < -20 && !q.tube));
      if (!p) return null;
      p.setSeq([{ t: 'go', x: clamp(p.x, -16, 16), z: -39.35, speed: 1.3, pose: 'swim' }, { t: 'fn', f: () => { if (inc) inc.phase = 'cling'; } },
        { t: 'upd', f: (q, dt) => { q.faceTo(Math.PI, dt); q.pose = 'wallCling'; return false; } }]);
      return p;
    },
    resolve(inc, g) { const p = inc.p; whistleStop(g, p, [{ t: 'go', x: p.x, z: rand(-24, -19), speed: 1.0, pose: 'swim' }, { t: 'fn', f: (q) => normalize(q) }]); },
  },
};

// 교대별 새로 등장하는 상황
export function typesForShift(n) { return Object.keys(TYPES).filter((k) => TYPES[k].shift <= n); }

// ---------- 관리자 ----------
export class Incidents {
  constructor(g) {
    this.g = g; this.list = []; this.fakes = [];
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#ff3b30'; x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.fill();
    x.lineWidth = 8; x.strokeStyle = '#fff'; x.stroke();
    x.fillStyle = '#fff'; x.font = '900 86px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 64, 70);
    this.markTex = new THREE.CanvasTexture(c); this.markTex.colorSpace = THREE.SRGBColorSpace;
  }

  clear() {
    for (const i of this.list) if (i.marker) this.g.scene.remove(i.marker);
    this.list = []; this.fakes = [];
  }

  active() { return this.list.filter((i) => !i.done).length; }

  start(type, from) {
    const g = this.g, T = TYPES[type];
    const inc = { type, T, t: 0, done: false, phase: null, id: Math.random() };
    const p = T.start(g, from, inc);
    if (!p) return null;
    inc.p = p; p.state = 'incident'; p.incident = inc;
    inc.limit = T.limit * g.limitMul; inc.hintAt = g.hintAt;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markTex, depthTest: false, transparent: true }));
    m.scale.setScalar(0.8); m.renderOrder = 20; m.visible = false; g.scene.add(m); inc.marker = m;
    this.list.push(inc);
    return inc;
  }

  startFake() {
    const g = this.g;
    const p = pick(deepOnes(g, (q) => q.vest && !q.tube));
    if (!p) return;
    p.fake = true;
    p.setSeq([{ t: 'wait', d: rand(6, 9), pose: 'fakeWave' }, { t: 'fn', f: (q) => { q.fake = false; normalize(q); } }]);
  }

  toolFor(inc) { return inc.T.toolNow ? inc.T.toolNow(inc) : inc.T.tool; }

  find(p) { return this.list.find((i) => !i.done && (i.p === p || (i.T.alsoHit && i.T.alsoHit(i).includes(p)))); }

  finish(inc) {
    inc.done = true;
    if (inc.marker) { this.g.scene.remove(inc.marker); inc.marker.material.dispose(); inc.marker = null; }
    const p = inc.p; if (p.incident === inc) p.incident = null;
    if (p.partner) p.partner.state = 'normal';
    this.list = this.list.filter((i) => i !== inc);
  }

  resolve(inc, auto) {
    this.finish(inc);
    const p = inc.p; p.state = 'resolving';
    inc.T.resolve(inc, this.g, auto);
  }

  update(dt) {
    const g = this.g;
    for (const inc of [...this.list]) {
      if (g.state !== 'play') return;
      if (inc.done) continue;
      const p = inc.p;
      if (!p.alive) { this.finish(inc); continue; }
      const paused = inc.T.pa && g.paBroken;
      if (!paused) inc.t += dt;
      const k = inc.t / inc.limit;
      const m = inc.marker;
      if (m) {
        m.visible = k >= inc.hintAt;
        m.position.set(p.wh.x, p.wh.y + 0.55 * Math.max(p.s, 0.8) + 0.25, p.wh.z);
        const pulse = 1 + Math.sin(g.t * 10) * 0.12;
        const cd = g.camera.position.distanceTo(m.position);
        m.scale.setScalar(Math.max(0.6, cd * 0.022) * pulse * (g.camera.fov / 50));
        m.material.opacity = clamp((k - inc.hintAt) * 6, 0, 1);
        if (m.visible && !inc.hinted) { inc.hinted = true; g.audio.danger(); }
      }
      if (k >= 1) this.fail(inc);
    }
  }

  fail(inc) {
    const g = this.g, p = inc.p;
    this.finish(inc);
    const r = inc.T.fail ? inc.T.fail(inc, g) : null;
    if (r && r.chain) {
      p.state = 'normal';
      const c = this.start(r.chain, p);
      g.onChain(inc, c);
      return;
    }
    g.onAccident(inc);
    // 사고 후 자동 수습 (점수 없음)
    setTimeout(() => {
      if (!p.alive) return;
      p.state = 'resolving';
      if (inc.type === 'diving') return guardRescue(g, p);
      if (['heatstroke', 'injured', 'bottle', 'running', 'fight'].includes(inc.type)) {
        if (inc.type === 'fight') { if (p.partner) { p.partner.pinned = false; normalize(p.partner); p.partner = null; } }
        return medicCall(g, p);
      }
      if (['loneChild'].includes(inc.type)) return inc.T.resolve(inc, g, true);
      if (['lineCross', 'wallHang', 'drowning', 'tubeFlip', 'cramp', 'unconscious'].includes(inc.type)) return guardRescue(g, p);
      inc.T.resolve(inc, g, true);
    }, 700);
  }
}
