/*!
 * 구슬 납치단 (Orb Abductors) v1.0
 * 쉬는시간 오락실 — https://smile-willow.tistory.com/
 * Three.js(3D 렌더링) + cannon-es(물리 엔진) 웹게임.
 * index.html 의 importmap 으로 three / cannon-es 를 불러옵니다.
 * 일반 스크립트로 불러오므로 파일을 더블클릭해서 열어도(file://) 동작합니다.
 */

(function () {
'use strict';
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const isNode = !isBrowser && typeof module !== 'undefined' && module.exports;

// 라이브러리를 동적으로 불러온 뒤 게임을 만든다 (importmap 의 three / cannon-es 사용)
const ready = Promise.all([
  import('three'),
  import('cannon-es'),
  import('three/addons/environments/RoomEnvironment.js')
]).then(([THREE, CANNON, RE]) => build(THREE, CANNON, RE.RoomEnvironment));

if (isNode) module.exports = ready;
if (isBrowser) {
  ready.then(() => { const l = document.getElementById('loading'); if (l) l.remove(); })
    .catch(e => {
      console.error(e);
      const app = document.getElementById('app');
      if (app) app.innerHTML = '<div class="nogl">게임을 불러오지 못했어요.<br>인터넷 연결을 확인한 뒤 최신 크롬, 엣지, 사파리에서<br>다시 열어 주세요.</div>';
    });
}

function build(THREE, CANNON, RoomEnvironment) {

/* =========================================================
 * 1. 상수 · 밸런스
 * ========================================================= */
const ARENA = 12;                 // 경기장 반폭 (x, z: -12 ~ 12)
const UFO_Y = 3.9, UFO_R = 1.25;
const BEAM_R = 2.2, PULL = 58;    // 자석 빔 반경 · 끌어당기는 힘
const MAX_CARRY = 8;
const ZONE_R = 2.8;
const BASE_SPEED = 7.6;
const GAME_TIME = 30;
const ORB = {
  silver:  { v: 1, m: 1,   r: 0.36 },
  gold:    { v: 3, m: 2,   r: 0.4 },
  rainbow: { v: 5, m: 1.5, r: 0.44 }
};
const ZONES = [{ x: -8.7, z: 8.7 }, { x: 8.7, z: 8.7 }, { x: -8.7, z: -8.7 }, { x: 8.7, z: -8.7 }];
const STARTS = [{ x: -4.5, z: 4 }, { x: 4.5, z: 4 }, { x: -4.5, z: -4.5 }, { x: 4.5, z: -4.5 }];
const SLOTS = [90, 210, 330].map(a => ({ x: 0.32 * Math.cos(a * Math.PI / 180), y: -0.98, z: 0.32 * Math.sin(a * Math.PI / 180) }));
const RAINBOW_TIMES = [10, 20];
const AI_DIFF = {
  easy:   { speed: 0.74, think: 0.7,  carry: 3, ram: 0,    beamDelay: 0.4,  label: '쉬움' },
  normal: { speed: 0.8,  think: 0.5,  carry: 4, ram: 0.12, beamDelay: 0.3,  label: '보통' },
  hard:   { speed: 0.96, think: 0.22, carry: 5, ram: 0.35, beamDelay: 0.12, label: '어려움' }
};
const RANKS = [
  { r: 'S', min: 40, color: '#ff4f6d' },
  { r: 'A', min: 32, color: '#ff9f1c' },
  { r: 'B', min: 22, color: '#2ec4b6' },
  { r: 'C', min: 0,  color: '#8d99ae' }
];
const CHARS = [
  { name: '나',   color: '#ff8a3d', hex: 0xff8a3d },
  { name: '삐뽀', color: '#ff5fa2', hex: 0xff5fa2 },
  { name: '뾰롱', color: '#3fcf6b', hex: 0x3fcf6b },
  { name: '쀼쀼', color: '#4aa8ff', hex: 0x4aa8ff }
];

/* =========================================================
 * 2. 코어 로직 (물리 + 규칙, DOM 없음 — Node 헤드리스 테스트 가능)
 * ========================================================= */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = Math.hypot;

function randSpot(rng, margin) {
  for (let k = 0; k < 60; k++) {
    const x = (rng() * 2 - 1) * (ARENA - margin), z = (rng() * 2 - 1) * (ARENA - margin);
    if (ZONES.every(zn => hyp(x - zn.x, z - zn.z) > ZONE_R + 1)) return { x, z };
  }
  return { x: 0, z: 0 };
}

function createGame(mode, diff, seed, allAI) {
  const rng = mulberry32(seed == null ? (Date.now() >>> 0) : seed);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 12;
  const mGround = new CANNON.Material('ground'), mOrb = new CANNON.Material('orb'), mUfo = new CANNON.Material('ufo'), mWall = new CANNON.Material('wall');
  world.addContactMaterial(new CANNON.ContactMaterial(mOrb, mGround, { friction: 0.35, restitution: 0.3 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mOrb, mOrb, { friction: 0.12, restitution: 0.4 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mOrb, mWall, { friction: 0.1, restitution: 0.55 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mUfo, mUfo, { friction: 0, restitution: 0.9 }));
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: mGround, collisionFilterGroup: 1, collisionFilterMask: 2 });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  const wall = (x, z, hx, hz) => world.addBody(new CANNON.Body({ mass: 0, material: mWall, shape: new CANNON.Box(new CANNON.Vec3(hx, 1.5, hz)), position: new CANNON.Vec3(x, 1, z), collisionFilterGroup: 8, collisionFilterMask: 2 }));
  wall(ARENA + 0.5, 0, 0.5, ARENA + 1); wall(-ARENA - 0.5, 0, 0.5, ARENA + 1);
  wall(0, ARENA + 0.5, ARENA + 1, 0.5); wall(0, -ARENA - 0.5, ARENA + 1, 0.5);

  const g = {
    mode, diff: AI_DIFF[diff] ? diff : 'normal', rng, world, mOrb, mUfo,
    phase: 'countdown', countdown: 3, elapsed: 0, timeLeft: GAME_TIME, time: 0, endDelay: 0,
    orbs: [], ufos: [], nextId: 1, skyT: 1.0, rainbowIdx: 0,
    bumpQ: [], bumpCool: {},
    input: { has: false, tx: 0, tz: 0, kx: 0, kz: 0, beam: false },
    events: [], lastTick: 99
  };
  const n = mode === 'versus' ? 4 : 1;
  for (let i = 0; i < n; i++) g.ufos.push(makeUfo(g, i, (i === 0 && !allAI) ? 'player' : 'ai'));
  for (let k = 0; k < 38; k++) { const p = randSpot(rng, 1); spawnOrb(g, 'silver', p.x, 0.5 + rng() * 0.3, p.z, false); }
  for (let k = 0; k < 6; k++) { const p = randSpot(rng, 1.5); spawnOrb(g, 'gold', p.x, 0.6, p.z, false); }
  return g;
}

function makeUfo(g, i, ctrl) {
  const s = STARTS[i];
  const body = new CANNON.Body({ mass: 5, shape: new CANNON.Sphere(UFO_R), material: g.mUfo, position: new CANNON.Vec3(s.x, UFO_Y, s.z), collisionFilterGroup: 4, collisionFilterMask: 4, linearDamping: 0, angularDamping: 1 });
  body.linearFactor.set(1, 0, 1);
  body.angularFactor.set(0, 0, 0);
  body.userData = { ufo: i };
  body.addEventListener('collide', e => {
    const o = e.body && e.body.userData;
    if (!o || o.ufo == null) return;
    let v = 0;
    try { v = Math.abs(e.contact.getImpactVelocityAlongNormal()); } catch (err) { v = 0; }
    g.bumpQ.push({ a: i, b: o.ufo, v });
  });
  g.world.addBody(body);
  return { i, ctrl, body, carry: [], slots: [null, null, null], beam: false, score: 0,
    deposits: 0, bestTrip: 0, lostByBump: 0, golds: 0, rainbows: 0, picked: 0,
    think: 0, target: null, mode: 'collect', beamT: 0, noPullT: 0, aiDiff: null };
}

function spawnOrb(g, kind, x, y, z, sky) {
  const T = ORB[kind];
  const body = new CANNON.Body({ mass: T.m, shape: new CANNON.Sphere(T.r), material: g.mOrb, position: new CANNON.Vec3(x, y, z),
    linearDamping: 0.15, angularDamping: 0.4, collisionFilterGroup: 2, collisionFilterMask: 1 | 2 | 8 });
  if (sky) body.velocity.set((g.rng() - 0.5) * 2, -2, (g.rng() - 0.5) * 2);
  const o = { id: g.nextId++, kind, v: T.v, m: T.m, r: T.r, body, sky: !!sky, att: null, cons: null, parent: null, slot: -1,
    depth: 0, children: 0, banked: false, owner: -1, bankT: 0, isStatic: false, dead: false };
  body.userData = { orb: o.id };
  g.world.addBody(body);
  g.orbs.push(o);
  return o;
}

function carriedMass(u) { let m = 0; for (const o of u.carry) m += o.m; return m; }
function speedFactor(u) { return clamp(1 - 0.05 * carriedMass(u), 0.55, 1); }
const isFree = o => o.att == null && !o.banked && !o.dead;

function attach(g, u, o, a) {
  const ob = o.body, up = u.body.position;
  let cons;
  if (a.type === 'slot') {
    const s = SLOTS[a.k], ax = up.x + s.x, ay = up.y + s.y, az = up.z + s.z;
    let dx = ob.position.x - ax, dy = ob.position.y - ay, dz = ob.position.z - az;
    let d = hyp(dx, dy, dz) || 1;
    if (dy / d > -0.3) { dx *= 0.3; dz *= 0.3; dy = -1; d = hyp(dx, dy, dz); }
    dx /= d; dy /= d; dz /= d;
    ob.position.set(ax + dx * o.r, ay + dy * o.r, az + dz * o.r);
    const pivA = ob.quaternion.conjugate().vmult(new CANNON.Vec3(-dx * o.r, -dy * o.r, -dz * o.r));
    cons = new CANNON.PointToPointConstraint(ob, pivA, u.body, new CANNON.Vec3(s.x, s.y, s.z));
    u.slots[a.k] = o; o.depth = 1; o.parent = null; o.slot = a.k;
  } else {
    const p = a.p, pb = p.body.position;
    let dx = ob.position.x - pb.x, dy = ob.position.y - pb.y, dz = ob.position.z - pb.z;
    let d = hyp(dx, dy, dz) || 1;
    dx /= d; dy /= d; dz /= d;
    if (dy > -0.25) { dy = -0.25 - Math.abs(dy) * 0.5; d = hyp(dx, dy, dz); dx /= d; dy /= d; dz /= d; }
    const L = o.r + p.r;
    ob.position.set(pb.x + dx * L, pb.y + dy * L, pb.z + dz * L);
    const pivA = ob.quaternion.conjugate().vmult(new CANNON.Vec3(-dx * o.r, -dy * o.r, -dz * o.r));
    const pivB = p.body.quaternion.conjugate().vmult(new CANNON.Vec3(dx * p.r, dy * p.r, dz * p.r));
    cons = new CANNON.PointToPointConstraint(ob, pivA, p.body, pivB);
    p.children++; o.depth = p.depth + 1; o.parent = p; o.slot = -1;
  }
  cons.collideConnected = false;
  g.world.addConstraint(cons);
  ob.velocity.set(u.body.velocity.x, 0, u.body.velocity.z);
  ob.angularVelocity.set(0, 0, 0);
  o.att = u.i; o.cons = cons; o.children = 0; o.sky = false;
  u.carry.push(o); u.picked++;
  g.events.push({ type: 'attach', u: u.i, x: ob.position.x, y: ob.position.y, z: ob.position.z, kind: o.kind });
}

function detach(g, o) {
  if (o.att == null) return;
  const u = g.ufos[o.att];
  if (o.cons) g.world.removeConstraint(o.cons);
  o.cons = null;
  if (o.parent) o.parent.children--; else if (o.slot >= 0) u.slots[o.slot] = null;
  const k = u.carry.indexOf(o); if (k >= 0) u.carry.splice(k, 1);
  o.att = null; o.parent = null; o.slot = -1; o.depth = 0;
}

function loseOrbs(g, u, n) {
  n = Math.min(n, u.carry.length);
  let lost = 0;
  for (let k = 0; k < n; k++) {
    const leaves = u.carry.filter(o => o.children === 0);
    if (!leaves.length) break;
    const o = leaves[Math.floor(g.rng() * leaves.length)];
    detach(g, o);
    const a = g.rng() * Math.PI * 2;
    o.body.velocity.set(Math.cos(a) * 5 + u.body.velocity.x * 0.5, 3 + g.rng() * 2, Math.sin(a) * 5 + u.body.velocity.z * 0.5);
    lost++;
  }
  u.lostByBump += lost;
  return lost;
}

// ---- AI ----
function bestCluster(g, u) {
  const CS = 3, N = Math.ceil(ARENA * 2 / CS);
  const val = new Float32Array(N * N), sx = new Float32Array(N * N), sz = new Float32Array(N * N);
  for (const o of g.orbs) {
    if (!isFree(o) || o.body.position.y > 9) continue;
    const p = o.body.position;
    const c = clamp(Math.floor((p.x + ARENA) / CS), 0, N - 1), r = clamp(Math.floor((p.z + ARENA) / CS), 0, N - 1);
    const i = r * N + c;
    val[i] += o.v; sx[i] += p.x * o.v; sz[i] += p.z * o.v;
  }
  const up = u.body.position;
  let best = null, bs = 0;
  for (let i = 0; i < val.length; i++) {
    if (val[i] <= 0) continue;
    const x = sx[i] / val[i], z = sz[i] / val[i];
    const d = hyp(x - up.x, z - up.z);
    let s = val[i] / (1 + d / 6);
    for (const v of g.ufos) {
      if (v === u) continue;
      const dv = hyp(x - v.body.position.x, z - v.body.position.z);
      if (dv < d && dv < 3) s *= 0.55;
    }
    if (s > bs) { bs = s; best = { x, z, score: s }; }
  }
  return best;
}
function freeNear(g, u, R) {
  const up = u.body.position;
  for (const o of g.orbs) if (isFree(o) && o.body.position.y < UFO_Y - 0.5 && hyp(o.body.position.x - up.x, o.body.position.z - up.z) < R) return true;
  return false;
}
function aiControl(g, u, dt) {
  const D = u.aiDiff || AI_DIFF[g.diff];
  const p = u.body.position, home = ZONES[u.i];
  u.think -= dt;
  if (u.think <= 0) {
    u.think = D.think * (0.7 + g.rng() * 0.6);
    const spd = BASE_SPEED * D.speed * speedFactor(u);
    const dHome = hyp(p.x - home.x, p.z - home.z);
    const n = u.carry.length;
    if (n > 0 && (n >= D.carry || g.timeLeft < dHome / spd + 1.4)) { u.mode = 'home'; u.target = { x: home.x, z: home.z }; }
    else {
      let rammed = false;
      if (D.ram > 0 && n <= 1) {
        for (const v of g.ufos) {
          if (v === u || v.carry.length < 4) continue;
          const vp = v.body.position;
          if (hyp(vp.x - p.x, vp.z - p.z) < 6 && g.rng() < D.ram) {
            u.mode = 'ram'; u.target = { x: vp.x + v.body.velocity.x * 0.3, z: vp.z + v.body.velocity.z * 0.3 }; rammed = true; break;
          }
        }
      }
      if (!rammed) {
        const c = bestCluster(g, u);
        if (c && !(n > 0 && c.score < 0.8)) { u.mode = 'collect'; u.target = c; }
        else if (n > 0) { u.mode = 'home'; u.target = { x: home.x, z: home.z }; }
        else { u.mode = 'wander'; u.target = { x: (g.rng() - 0.5) * 8, z: (g.rng() - 0.5) * 8 }; }
      }
    }
  }
  const t = u.target || { x: p.x, z: p.z };
  const dx = t.x - p.x, dz = t.z - p.z, d = hyp(dx, dz);
  let beam = false;
  if (u.mode === 'collect') {
    if (d < 1.4) { u.beamT += dt; beam = u.beamT > D.beamDelay; } else u.beamT = 0;
    if (beam) {
      if (!freeNear(g, u, BEAM_R)) { u.noPullT += dt; if (u.noPullT > 0.4) { u.think = 0; u.noPullT = 0; } }
      else u.noPullT = 0;
    }
  }
  const s = d < 0.3 ? 0 : Math.min(1, d / 1.2);
  return { x: d ? dx / d * s : 0, z: d ? dz / d * s : 0, beam };
}

// ---- 한 스텝 ----
function control(g, u, dt) {
  let wx = 0, wz = 0, beam = false;
  if (g.phase === 'play') {
    if (u.ctrl === 'player') {
      const inp = g.input;
      if (inp.kx || inp.kz) { const l = hyp(inp.kx, inp.kz); wx = inp.kx / l; wz = inp.kz / l; }
      else if (inp.has) {
        const dx = inp.tx - u.body.position.x, dz = inp.tz - u.body.position.z, d = hyp(dx, dz);
        if (d > 0.15) { const s = Math.min(1, d / 1.2); wx = dx / d * s; wz = dz / d * s; }
      }
      beam = inp.beam;
    } else {
      const a = aiControl(g, u, dt); wx = a.x; wz = a.z; beam = a.beam;
    }
  }
  u.beam = beam;
  const spd = BASE_SPEED * speedFactor(u) * (beam ? 0.62 : 1);
  const b = u.body, k = 1 - Math.exp(-7 * dt);
  b.velocity.x += (wx * spd - b.velocity.x) * k;
  b.velocity.z += (wz * spd - b.velocity.z) * k;
  const lim = ARENA - 0.6;
  if (b.position.x > lim) { b.position.x = lim; if (b.velocity.x > 0) b.velocity.x *= -0.3; }
  if (b.position.x < -lim) { b.position.x = -lim; if (b.velocity.x < 0) b.velocity.x *= -0.3; }
  if (b.position.z > lim) { b.position.z = lim; if (b.velocity.z > 0) b.velocity.z *= -0.3; }
  if (b.position.z < -lim) { b.position.z = -lim; if (b.velocity.z < 0) b.velocity.z *= -0.3; }
}

const _f = new CANNON.Vec3();
function magnet(g) {
  for (const u of g.ufos) {
    if (!u.beam || u.carry.length >= MAX_CARRY) continue;
    const up = u.body.position;
    for (const o of g.orbs) {
      if (!isFree(o)) continue;
      const p = o.body.position;
      if (p.y > UFO_Y - 0.5) continue;
      const dh = hyp(p.x - up.x, p.z - up.z);
      if (dh > BEAM_R) continue;
      const mx = up.x - p.x, my = (UFO_Y - 1.0 - o.r) - p.y, mz = up.z - p.z;
      const d = hyp(mx, my, mz) || 1;
      const F = PULL * (0.65 + 0.35 * (1 - dh / BEAM_R));
      _f.set(mx / d * F, my / d * F, mz / d * F);
      o.body.applyForce(_f);
      o.body.velocity.x *= 0.985; o.body.velocity.z *= 0.985;
      o.pulled = u.i;
    }
  }
}

function tryAttach(g) {
  for (const o of g.orbs) {
    if (!isFree(o)) continue;
    const op = o.body.position;
    for (const u of g.ufos) {
      if (u.carry.length >= MAX_CARRY) continue;
      if (!(u.beam || o.sky)) continue;
      const up = u.body.position;
      if (hyp(op.x - up.x, op.z - up.z) > BEAM_R + 1.6) continue;
      const tol = o.sky ? 0.45 : 0.2;
      let best = null, bd = Infinity;
      for (let k = 0; k < 3; k++) {
        if (u.slots[k]) continue;
        const s = SLOTS[k];
        const d = hyp(op.x - up.x - s.x, op.y - up.y - s.y, op.z - up.z - s.z) - o.r;
        if (d < tol && d < bd) { bd = d; best = { type: 'slot', k }; }
      }
      for (const p of u.carry) {
        if (p.children >= 2 || p.depth >= 3) continue;
        const pp = p.body.position;
        const d = hyp(op.x - pp.x, op.y - pp.y, op.z - pp.z) - o.r - p.r;
        if (d < tol && d < bd) { bd = d; best = { type: 'orb', p }; }
      }
      if (best) { attach(g, u, o, best); break; }
    }
  }
}

function step(g, dt) {
  if (g.phase === 'over') return;
  g.time += dt;
  if (g.phase === 'countdown') {
    const prev = Math.ceil(g.countdown);
    g.countdown -= dt;
    const now = Math.ceil(g.countdown);
    if (now !== prev && now > 0) g.events.push({ type: 'beep', n: now });
    if (g.countdown <= 0) { g.phase = 'play'; g.events.push({ type: 'go' }); }
  } else if (g.phase === 'play') {
    g.elapsed += dt;
    g.timeLeft = Math.max(0, GAME_TIME - g.elapsed);
    const s = Math.ceil(g.timeLeft);
    if (s <= 5 && s >= 1 && s !== g.lastTick) { g.lastTick = s; g.events.push({ type: 'tick' }); }
    // 하늘에서 구슬 보충
    g.skyT -= dt;
    if (g.skyT <= 0 && g.elapsed < GAME_TIME - 2) {
      g.skyT = 0.9 + g.rng() * 0.5;
      const free = g.orbs.filter(isFree).length;
      if (free < 32) {
        const n = 1 + (g.rng() < 0.4 ? 1 : 0);
        for (let k = 0; k < n; k++) { const p = randSpot(g.rng, 1.2); spawnOrb(g, g.rng() < 0.15 ? 'gold' : 'silver', p.x, 11 + g.rng() * 2, p.z, true); }
      }
    }
    if (g.rainbowIdx < RAINBOW_TIMES.length && g.elapsed >= RAINBOW_TIMES[g.rainbowIdx]) {
      g.rainbowIdx++;
      const o = spawnOrb(g, 'rainbow', (g.rng() - 0.5) * 4, 13, (g.rng() - 0.5) * 4, true);
      g.events.push({ type: 'rainbow', x: o.body.position.x, z: o.body.position.z });
    }
  }
  for (const u of g.ufos) control(g, u, dt);
  for (const o of g.orbs) o.pulled = -1;
  if (g.phase === 'play') magnet(g);
  g.world.step(dt);
  for (const u of g.ufos) { u.body.position.y = UFO_Y; u.body.velocity.y = 0; }

  // 하늘 구슬 착지 판정
  for (const o of g.orbs) if (o.sky && o.body.position.y < o.r + 0.35) o.sky = false;
  if (g.phase === 'play') {
    tryAttach(g);
    // 구역에 내려놓기 (자동)
    for (const u of g.ufos) {
      if (!u.carry.length) continue;
      const zn = ZONES[u.i], up = u.body.position;
      if (hyp(up.x - zn.x, up.z - zn.z) >= ZONE_R) continue;
      const list = u.carry.slice().sort((a, b) => b.depth - a.depth);
      let v = 0;
      for (const o of list) {
        detach(g, o);
        o.banked = true; o.owner = u.i; v += o.v;
        if (o.kind === 'gold') u.golds++;
        if (o.kind === 'rainbow') u.rainbows++;
      }
      u.score += v; u.deposits++; u.bestTrip = Math.max(u.bestTrip, v);
      g.events.push({ type: 'deposit', u: u.i, v, n: list.length, x: up.x, z: up.z });
    }
    // 충돌로 구슬 떨어뜨리기
    const seen = {};
    for (const q of g.bumpQ) {
      const a = Math.min(q.a, q.b), b = Math.max(q.a, q.b), key = a * 4 + b;
      if (seen[key] || q.v < 2.0) continue;
      seen[key] = 1;
      if ((g.bumpCool[key] || 0) > g.time) continue;
      g.bumpCool[key] = g.time + 0.6;
      const A = g.ufos[a], B = g.ufos[b];
      const mA = 5 + carriedMass(A), mB = 5 + carriedMass(B);
      let la = Math.floor(q.v * mB / (mA + mB) * 0.75), lb = Math.floor(q.v * mA / (mA + mB) * 0.75);
      if (q.v > 3.5) { la = Math.max(la, A.carry.length ? 1 : 0); lb = Math.max(lb, B.carry.length ? 1 : 0); }
      const lostA = loseOrbs(g, A, la), lostB = loseOrbs(g, B, lb);
      const ap = A.body.position, bp = B.body.position;
      g.events.push({ type: 'bump', a, b, v: q.v, lostA, lostB, x: (ap.x + bp.x) / 2, z: (ap.z + bp.z) / 2 });
    }
  }
  g.bumpQ.length = 0;

  // 쌓인 구슬은 잠시 뒤 고정 · 떨어진 구슬 정리
  for (const o of g.orbs) {
    if (o.banked && !o.isStatic) {
      o.bankT += dt;
      if (o.bankT > 2.5) {
        o.body.type = CANNON.Body.STATIC; o.body.mass = 0; o.body.updateMassProperties();
        o.body.velocity.setZero(); o.body.angularVelocity.setZero(); o.isStatic = true;
      }
    }
    if (!o.dead && o.body.position.y < -4) {
      if (o.att != null) detach(g, o);
      g.world.removeBody(o.body); o.dead = true;
    }
  }
  if (g.orbs.length > 160) g.orbs = g.orbs.filter(o => !o.dead);

  if (g.phase === 'play' && g.elapsed >= GAME_TIME) {
    g.phase = 'end'; g.endDelay = 0;
    for (const u of g.ufos) u.beam = false;
    g.events.push({ type: 'timeup' });
  } else if (g.phase === 'end') {
    g.endDelay += dt;
    if (g.endDelay > 1.6) { g.phase = 'over'; g.events.push({ type: 'over' }); }
  }
}

function standings(g) { return g.ufos.slice().sort((a, b) => b.score - a.score); }
function rankFor(s) { return RANKS.find(r => s >= r.min); }

const Core = { createGame, step, standings, rankFor, AI_DIFF, RANKS, ZONES, GAME_TIME };

/* =========================================================
 * 3. 이하 브라우저 전용 (사운드 · 3D 렌더링 · UI · 입력)
 * ========================================================= */
if (isBrowser && document.getElementById('app')) startApp();

function startApp() {
  const app = document.getElementById('app');

  /* ---------- 저장 ---------- */
  const Store = {
    get(k, d) { try { const v = localStorage.getItem('orbAbductors.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('orbAbductors.' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };

  /* ---------- 사운드 (WebAudio 합성) ---------- */
  const Sound = {
    ctx: null, master: null, bgmBus: null, on: Store.get('sound', true), noiseBuf: null, bgmTimer: null, nextTime: 0, stepIdx: 0, hum: null, lastClink: 0,
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 0.6 : 0; this.master.connect(this.ctx.destination);
        this.bgmBus = this.ctx.createGain(); this.bgmBus.gain.value = 0.22; this.bgmBus.connect(this.master);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ctx = null; }
    },
    setOn(v) { this.on = v; Store.set('sound', v); if (this.master) this.master.gain.setTargetAtTime(v ? 0.6 : 0, this.ctx.currentTime, 0.03); },
    tone(f, d, type, v, f2, t0, dest) {
      const c = this.ctx; if (!c) return;
      const t = t0 != null ? t0 : c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.2, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + d + 0.05);
    },
    noise(d, v, f1, f2, t0, type) {
      const c = this.ctx; if (!c) return;
      const t = t0 != null ? t0 : c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const fl = c.createBiquadFilter(); fl.type = type || 'bandpass'; fl.Q.value = 1; fl.frequency.setValueAtTime(f1, t);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
    },
    play(name, o) {
      const c = this.ctx; if (!c || !this.on) return;
      const t = c.currentTime;
      switch (name) {
        case 'clink':
          if (t - this.lastClink < 0.04) return; this.lastClink = t;
          this.tone(2200 + Math.random() * 400, 0.12, 'sine', 0.09); this.tone(3300, 0.08, 'sine', 0.04); break;
        case 'clinkGold': this.tone(1800, 0.16, 'sine', 0.12); this.tone(2700, 0.12, 'triangle', 0.06, null, t + 0.03); break;
        case 'deposit': {
          const n = Math.min(8, (o && o.n) || 1);
          for (let i = 0; i < n; i++) this.tone(523 * Math.pow(1.122, i), 0.12, 'square', 0.08, null, t + i * 0.05);
          this.tone(1568, 0.3, 'triangle', 0.08, null, t + n * 0.05); break;
        }
        case 'bump': this.noise(0.18, 0.4, 300, 90, null, 'lowpass'); this.tone(180, 0.3, 'sine', 0.2, 420); break;
        case 'scatter': for (let i = 0; i < 4; i++) this.tone(1800 + Math.random() * 1200, 0.07, 'sine', 0.06, null, t + 0.04 + i * 0.05); break;
        case 'rainbow': this.tone(2400, 0.9, 'sine', 0.06, 500); [1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.08, null, t + 0.1 + i * 0.08)); break;
        case 'beep': this.tone(523, 0.16, 'square', 0.13); break;
        case 'go': this.tone(1046, 0.35, 'square', 0.13); break;
        case 'tick': this.tone(1200, 0.05, 'square', 0.08); break;
        case 'timeup': [784, 659, 523].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, null, t + i * 0.12)); break;
        case 'win': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'square', 0.11, null, t + i * 0.13)); break;
        case 'lose': [523, 466, 415, 392].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, null, t + i * 0.22)); break;
        case 'stamp': this.noise(0.15, 0.4, 400, 120); this.tone(110, 0.2, 'sine', 0.3, 60); break;
        case 'click': this.tone(700, 0.05, 'triangle', 0.12); break;
      }
    },
    beamHum(on) {
      const c = this.ctx; if (!c) return;
      if (on && !this.hum && this.on) {
        const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = 98;
        f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 6;
        lfo.frequency.value = 7; lg.gain.value = 300; lfo.connect(lg); lg.connect(f.frequency);
        g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.06, c.currentTime + 0.08);
        o.connect(f); f.connect(g); g.connect(this.master); o.start(); lfo.start();
        this.hum = { o, lfo, g };
      } else if (!on && this.hum) {
        const h = this.hum; this.hum = null;
        h.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.04);
        h.o.stop(c.currentTime + 0.3); h.lfo.stop(c.currentTime + 0.3);
      }
    },
    startBgm() { if (!this.ctx || this.bgmTimer) return; this.nextTime = this.ctx.currentTime + 0.05; this.stepIdx = 0; this.bgmTimer = setInterval(() => this.schedule(), 25); },
    stopBgm() { if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; } },
    schedule() {
      const c = this.ctx; if (!c) return;
      const spb = 60 / 126 / 4;
      const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 64]];
      const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
      while (this.nextTime < c.currentTime + 0.12) {
        const s = this.stepIdx % 64, t = this.nextTime, ch = chords[Math.floor(s / 16)];
        if (this.on) {
          if (s % 2 === 0) this.tone(mtof(ch[(s / 2) % 4] + 12), spb * 1.6, 'square', 0.05, null, t, this.bgmBus);
          if (s % 8 === 0) this.tone(mtof(ch[0] - 12), spb * 6, 'triangle', 0.26, null, t, this.bgmBus);
          if (s % 8 === 4) this.noise(0.05, 0.1, 6000, null, t);
          if (s === 0 || s === 32) this.tone(mtof(ch[3] + 24), spb * 10, 'sine', 0.04, mtof(ch[3] + 19), t, this.bgmBus);
        }
        this.nextTime += spb; this.stepIdx++;
      }
    }
  };

  /* ---------- 3D 뷰 ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    app.innerHTML = '<div class="nogl">이 기기에서는 3D(WebGL)를 지원하지 않아 게임을 실행할 수 없어요.<br>다른 브라우저나 기기에서 열어 주세요.</div>';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.domElement.id = 'gl';
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 220);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
    t.anisotropy = 4;
    return t;
  }
  // 하늘
  scene.background = canvasTex(4, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#050821'); gr.addColorStop(0.55, '#16235a'); gr.addColorStop(1, '#3b3f86');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(0x141c48, 48, 110);
  // 조명
  scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x2a3a2e, 1.05));
  scene.add(new THREE.AmbientLight(0x404a80, 0.35));
  const moonLight = new THREE.DirectionalLight(0xe6ecff, 1.6);
  moonLight.position.set(-8, 26, 12);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  Object.assign(moonLight.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 5, far: 60 });
  moonLight.shadow.bias = -0.0008;
  scene.add(moonLight);
  // 별 · 달
  {
    const n = 600, pos = new Float32Array(n * 3);
    const r = mulberry32(9);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, el = 0.12 + r() * 1.3, R = 120;
      pos[i * 3] = Math.cos(a) * Math.cos(el) * R; pos[i * 3 + 1] = Math.sin(el) * R; pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * R;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true, fog: false })));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false }));
    moon.position.set(-38, 52, -80); scene.add(moon);
    const glowTex = canvasTex(128, 128, (c, w) => { const gr = c.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(255,240,200,0.6)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(30, 30, 1); glow.position.copy(moon.position); scene.add(glow);
  }
  // 바깥 들판
  {
    const grass = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#1d3b28'; c.fillRect(0, 0, w, h);
      const r = mulberry32(2);
      for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? 'rgba(60,110,70,0.5)' : 'rgba(20,45,30,0.6)'; c.fillRect(r() * w, r() * h, 2, 4); }
    }, 18);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ map: grass }));
    field.rotation.x = -Math.PI / 2; field.position.y = -0.02; field.receiveShadow = true; scene.add(field);
  }
  // 경기장 (미스터리 서클 무늬)
  {
    const tex = canvasTex(1024, 1024, (c, w, h) => {
      c.fillStyle = '#2f6a43'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; c.fillRect(i * w / 16, 0, w / 16, h); }
      c.strokeStyle = 'rgba(190,255,190,0.16)'; c.lineWidth = 18;
      [380, 300, 180].forEach(r => { c.beginPath(); c.arc(w / 2, h / 2, r, 0, Math.PI * 2); c.stroke(); });
      c.fillStyle = 'rgba(190,255,190,0.12)';
      c.beginPath(); c.arc(w / 2, h / 2, 90, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.beginPath(); c.arc(w / 2 + Math.cos(a) * 300, h / 2 + Math.sin(a) * 300, 34, 0, Math.PI * 2); c.fill(); }
      const r = mulberry32(4);
      for (let i = 0; i < 2500; i++) { c.fillStyle = r() < 0.5 ? 'rgba(120,200,130,0.25)' : 'rgba(10,40,20,0.25)'; c.fillRect(r() * w, r() * h, 2, 5); }
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshLambertMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x6af2ff, emissive: 0x2ad8ff, emissiveIntensity: 1.2, roughness: 0.4 });
    const e1 = new THREE.BoxGeometry(ARENA * 2 + 0.6, 0.22, 0.22), e2 = new THREE.BoxGeometry(0.22, 0.22, ARENA * 2 + 0.6);
    [[0, ARENA + 0.2, e1], [0, -ARENA - 0.2, e1], [ARENA + 0.2, 0, e2], [-ARENA - 0.2, 0, e2]].forEach(([x, z, geo]) => {
      const m = new THREE.Mesh(geo, edgeMat); m.position.set(x, 0.11, z); scene.add(m);
    });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8090b0, metalness: 0.6, roughness: 0.4, envMap: envTex });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 10), postMat);
      post.position.set(sx * (ARENA + 0.2), 0.8, sz * (ARENA + 0.2)); post.castShadow = true; scene.add(post);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9ff6ff }));
      bulb.position.set(sx * (ARENA + 0.2), 1.7, sz * (ARENA + 0.2)); scene.add(bulb);
    });
  }
  // 나무
  {
    const r = mulberry32(17);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3324 });
    const leafMats = [new THREE.MeshLambertMaterial({ color: 0x1f4d34 }), new THREE.MeshLambertMaterial({ color: 0x245c3c })];
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, d = 17 + r() * 14;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z > 14 && Math.abs(x) < 20) continue;
      const s = 0.8 + r() * 0.9, t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 1.2 * s, 6), trunkMat); trunk.position.y = 0.6 * s; t.add(trunk);
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry((1.6 - k * 0.4) * s, 1.8 * s, 7), leafMats[(i + k) % 2]);
        c.position.y = (1.6 + k * 0.9) * s; c.castShadow = true; t.add(c);
      }
      t.position.set(x, 0, z); scene.add(t);
    }
  }
  // 착륙 구역
  const zoneMeshes = ZONES.map((zn, i) => {
    const grp = new THREE.Group();
    const col = CHARS[i].hex;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ZONE_R, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; grp.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE_R - 0.18, ZONE_R, 64), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; grp.add(ring);
    const col3 = new THREE.Mesh(new THREE.CylinderGeometry(ZONE_R, ZONE_R, 7, 48, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    col3.position.y = 3.5; grp.add(col3);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), new THREE.MeshBasicMaterial({ color: col }));
    arrow.rotation.x = Math.PI; arrow.position.y = 6.2; grp.add(arrow);
    grp.position.set(zn.x, 0, zn.z);
    grp.userData = { col3, arrow, ring };
    scene.add(grp);
    return grp;
  });
  // 반딧불
  const fireflies = (() => {
    const n = 40, pos = new Float32Array(n * 3), seeds = [];
    const r = mulberry32(31);
    for (let i = 0; i < n; i++) seeds.push({ x: (r() * 2 - 1) * 20, z: (r() * 2 - 1) * 20, y: 0.6 + r() * 2, p: r() * 6 });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8ff7a, size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(pts);
    return { pts, pos, seeds };
  })();

  /* ---------- UFO 모델 ---------- */
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xd3dae6, metalness: 0.85, roughness: 0.28, envMap: envTex });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.32, envMap: envTex, depthWrite: false });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xe53935, metalness: 0.3, roughness: 0.4, envMap: envTex });
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x1a1a24 });
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const saucerGeo = new THREE.LatheGeometry([[0, -0.32], [0.55, -0.36], [1.05, -0.22], [1.32, -0.02], [1.28, 0.08], [0.95, 0.2], [0.6, 0.26], [0, 0.28]].map(p => new THREE.Vector2(p[0], p[1])), 40);
  function makeUfoMesh(i) {
    const col = CHARS[i].hex;
    const grp = new THREE.Group();
    const body = new THREE.Group(); grp.add(body);
    const saucer = new THREE.Mesh(saucerGeo, metalMat); saucer.castShadow = true; body.add(saucer);
    const bandMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.4 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.08, 8, 48), bandMat); band.rotation.x = Math.PI / 2; band.position.y = 0.02; body.add(band);
    const lights = [];
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }));
      m.position.set(Math.cos(a) * 1.1, -0.17, Math.sin(a) * 1.1); body.add(m); lights.push(m);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.68, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), glassMat); dome.position.y = 0.22; body.add(dome);
    // 외계인
    const skin = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), skin); head.position.y = 0.5; head.scale.set(1, 0.92, 1); body.add(head);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), whiteMat); eye.position.set(s * 0.14, 0.56, 0.28); body.add(eye);
      const pup = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 6), darkMat); pup.position.set(s * 0.14, 0.56, 0.38); body.add(pup);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 5), skin); ant.position.set(s * 0.16, 0.92, 0); ant.rotation.z = -s * 0.35; body.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff27a })); tip.position.set(s * 0.22, 1.07, 0); body.add(tip);
    }
    // 자석
    const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.34, 20), redMat); mag.position.y = -0.5; body.add(mag);
    const magTip = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 20), metalMat); magTip.position.y = -0.73; body.add(magTip);
    // 빔
    const beamH = UFO_Y - 0.6;
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x7dffb6, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(BEAM_R, beamH, 32, 1, true), beamMat);
    beam.position.y = -(beamH / 2 + 0.6); beam.visible = false; grp.add(beam);
    scene.add(grp);
    // 바닥 표시 링
    const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(BEAM_R - 0.13, BEAM_R, 48), ringMat);
    ring.rotation.x = -Math.PI / 2; scene.add(ring);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x7dffb6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(BEAM_R, 40), glowMat);
    glow.rotation.x = -Math.PI / 2; scene.add(glow);
    return { grp, body, lights, beam, beamMat, ring, ringMat, glow, glowMat, bandMat };
  }
  const ufoMeshes = [0, 1, 2, 3].map(makeUfoMesh);

  /* ---------- 구슬 · 줄 · 파티클 ---------- */
  const orbGeo = { silver: new THREE.SphereGeometry(ORB.silver.r, 22, 14), gold: new THREE.SphereGeometry(ORB.gold.r, 22, 14), rainbow: new THREE.SphereGeometry(ORB.rainbow.r, 24, 16) };
  const orbMat = {
    silver: new THREE.MeshStandardMaterial({ color: 0xeef2f8, metalness: 1, roughness: 0.14, envMap: envTex }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc23c, metalness: 1, roughness: 0.2, envMap: envTex }),
    rainbow: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.15, envMap: envTex, emissive: 0xff00ff, emissiveIntensity: 0.6 })
  };
  const orbMeshes = new Map();
  const tetherPos = new Float32Array(4 * MAX_CARRY * 2 * 3);
  const tetherGeo = new THREE.BufferGeometry(); tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPos, 3));
  const tethers = new THREE.LineSegments(tetherGeo, new THREE.LineBasicMaterial({ color: 0x9effd6, transparent: true, opacity: 0.85 }));
  tethers.frustumCulled = false; scene.add(tethers);

  const PMAX = 400;
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), parts = [];
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  const _c = new THREE.Color();
  function burst3(x, y, z, n, hexes, spd, up) {
    for (let k = 0; k < n && parts.length < PMAX; k++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, s = (0.4 + Math.random()) * (spd || 5);
      _c.set(hexes[(Math.random() * hexes.length) | 0]);
      parts.push({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.abs(Math.sin(e)) * s + (up || 2), vz: Math.sin(a) * Math.cos(e) * s, t: 0, life: 0.5 + Math.random() * 0.5, r: _c.r, g: _c.g, b: _c.b });
    }
  }

  function clearDynamic() {
    for (const m of orbMeshes.values()) scene.remove(m);
    orbMeshes.clear();
    parts.length = 0;
  }

  /* ---------- 카메라 맞춤 ---------- */
  let vw = 0, vh = 0, U = 1, uiTop = 0;
  const uiEl = document.createElement('div'); uiEl.id = 'ui'; app.appendChild(uiEl);
  const fxEl = document.createElement('div'); fxEl.id = 'fx'; app.appendChild(fxEl);
  const camDir = new THREE.Vector3();
  const fitPts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { fitPts.push(new THREE.Vector3(sx * (ARENA + 0.5), 0, sz * (ARENA + 0.5))); fitPts.push(new THREE.Vector3(sx * (ARENA - 0.6), UFO_Y + 1.3, sz * (ARENA - 0.6))); }
  const _v = new THREE.Vector3();
  function fitCamera() {
    const topPx = uiTop + 100 * U, botPx = uiTop + 160 * U, side = 8;
    const ndcTop = 1 - 2 * topPx / vh, ndcBot = -1 + 2 * botPx / vh;
    const ndcL = -1 + 2 * side / vw, ndcR = 1 - 2 * side / vw;
    camera.aspect = vw / vh;
    const pitch = THREE.MathUtils.degToRad(vw / vh < 0.8 ? 66 : 56);
    camDir.set(0, Math.sin(pitch), Math.cos(pitch));
    const cy = (ndcTop + ndcBot) / 2;
    camera.setViewOffset(vw, vh, 0, -cy * vh / 2, vw, vh);
    camera.updateProjectionMatrix();
    const T = new THREE.Vector3(0, 0, 0.6);
    const fits = D => {
      camera.position.copy(T).addScaledVector(camDir, D); camera.lookAt(T); camera.updateMatrixWorld();
      for (const p of fitPts) {
        _v.copy(p).project(camera);
        if (_v.x < ndcL || _v.x > ndcR || _v.y > ndcTop || _v.y < ndcBot) return false;
      }
      return true;
    };
    let lo = 12, hi = 200;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    fits(hi);
    scene.fog.near = hi * 0.9; scene.fog.far = hi * 0.9 + 75;
  }
  function resize() {
    vw = window.innerWidth; vh = window.innerHeight;
    renderer.setSize(vw, vh);
    U = Math.min(vw / 540, vh / 960);
    uiTop = (vh - 960 * U) / 2;
    uiEl.style.setProperty('--u', U + 'px');
    uiEl.style.width = 540 * U + 'px'; uiEl.style.height = 960 * U + 'px';
    uiEl.style.left = (vw - 540 * U) / 2 + 'px'; uiEl.style.top = uiTop + 'px';
    fxEl.style.setProperty('--u', U + 'px');
    fitCamera();
  }

  /* ---------- UI (DOM) ---------- */
  let diff = Store.get('diff', 'normal'); if (!AI_DIFF[diff]) diff = 'normal';
  uiEl.innerHTML = `
    <div id="title" class="layer">
      <div class="logo"><div class="logo-ko">구슬 납치단</div><div class="logo-en">ORB ABDUCTORS</div></div>
      <button class="big b-orange" id="btnVersus"><span class="l1">4인 대결</span><span class="l2" id="vsSub"></span></button>
      <button class="big b-purple" id="btnSolo"><span class="l1">혼자 도전</span><span class="l2" id="soloSub"></span></button>
      <div class="difflabel">대결 난이도</div>
      <div class="diffs"><button data-d="easy">쉬움</button><button data-d="normal">보통</button><button data-d="hard">어려움</button></div>
      <div class="infobox">
        <b>자석 UFO로 쇠구슬을 납치해 내 착륙 구역으로!</b>
        <span>은구슬 1 · 금구슬 3 · 무지개 구슬 5</span>
        <span>많이 매달수록 느려지고, 부딪히면 구슬이 떨어져요</span>
        <span class="red">구역에 내려놔야 점수! 매달고만 있으면 0점</span>
      </div>
    </div>
    <div id="hud" class="layer hidden">
      <div class="hudbar">
        <div class="hcol"><div class="hl">내 점수</div><div class="hv" id="hScore">0</div></div>
        <div class="timer"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="32" class="tbg"/><circle cx="40" cy="40" r="32" class="tfg" id="tRing"/></svg><div id="tNum">30</div></div>
        <div class="hcol"><div class="hl" id="hRightL">지금 순위</div><div class="hv" id="hRight">-</div></div>
      </div>
      <div class="carry" id="carryBox"></div>
      <div class="bottom">
        <div class="chips" id="chips"></div>
        <div class="hint" id="hint">화면을 끌어서 이동<br>자석 버튼을 꾹 누르면 빔!<br><small>PC: 방향키 이동 · 스페이스바 빔</small></div>
      </div>
      <button id="beamBtn"><span class="mag">🧲</span><span>자석</span></button>
    </div>
    <div id="center" class="layer"></div>
    <div id="result" class="layer hidden"></div>
    <button id="soundBtn" class="sound"></button>
  `;
  const $ = id => document.getElementById(id);
  const layer = { title: $('title'), hud: $('hud'), result: $('result'), center: $('center') };
  function refreshTitle() {
    $('vsSub').textContent = '외계인 친구 셋과 구슬 쟁탈전 · ' + AI_DIFF[diff].label + ' 1등 ' + Store.get('wins.' + diff, 0) + '회';
    $('soloSub').textContent = '최고 ' + Store.get('best.solo', 0) + '점 · S랭크에 도전!';
    document.querySelectorAll('.diffs button').forEach(b => b.classList.toggle('on', b.dataset.d === diff));
  }
  function refreshSound() { $('soundBtn').textContent = Sound.on ? '🔊' : '🔇'; }
  refreshTitle(); refreshSound();

  function show(name, on) { layer[name].classList.toggle('hidden', !on); }
  function centerText(html, cls, dur) {
    const el = document.createElement('div'); el.className = 'ctext ' + (cls || ''); el.innerHTML = html;
    layer.center.appendChild(el);
    setTimeout(() => el.remove(), dur || 900);
  }
  const _p = new THREE.Vector3();
  function popup3(x, y, z, str, color, size) {
    _p.set(x, y, z).project(camera);
    if (_p.z > 1) return;
    const el = document.createElement('div'); el.className = 'pop';
    el.textContent = str; el.style.color = color;
    el.style.left = ((_p.x + 1) / 2 * vw) + 'px'; el.style.top = ((1 - _p.y) / 2 * vh) + 'px';
    el.style.fontSize = 'calc(var(--u) * ' + (size || 26) + ')';
    fxEl.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  /* ---------- 게임 상태 ---------- */
  let screen = 'title', game = null, demo = null, result = null;
  function newDemo() { clearDynamic(); demo = createGame('versus', 'normal', null, true); demo.phase = 'play'; demo.countdown = 0; }
  function startGame(mode) {
    clearDynamic(); demo = null;
    game = createGame(mode, diff);
    screen = 'game';
    show('title', false); show('result', false); show('hud', true);
    $('chips').innerHTML = mode === 'versus' ? CHARS.map((c, i) => `<div class="chip" style="--c:${c.color}"><span>${i === 0 ? '나' : c.name}</span><b id="chip${i}">0</b></div>`).join('') : '';
    $('chips').classList.toggle('hidden', mode !== 'versus');
    $('hint').classList.toggle('hidden', mode === 'versus');
    $('hRightL').textContent = mode === 'versus' ? '지금 순위' : '최고';
    zoneMeshes.forEach((z, i) => { z.visible = mode === 'versus' || i === 0; });
    inputReset();
  }
  function goTitle() {
    screen = 'title'; game = null; Sound.stopBgm(); Sound.beamHum(false);
    show('hud', false); show('result', false); show('title', true);
    zoneMeshes.forEach(z => { z.visible = true; });
    refreshTitle(); newDemo();
  }
  function onOver(g) {
    Sound.stopBgm(); Sound.beamHum(false);
    const me = g.ufos[0];
    const key = g.mode === 'solo' ? 'best.solo' : 'best.versus.' + g.diff;
    const best = Store.get(key, 0), isNew = me.score > best;
    if (isNew) Store.set(key, me.score);
    const order = standings(g), place = 1 + order.filter(q => q.score > me.score).length;
    if (g.mode === 'versus' && place === 1) Store.set('wins.' + g.diff, Store.get('wins.' + g.diff, 0) + 1);
    result = { g, place, isNew, best: Math.max(best, me.score), rank: g.mode === 'solo' ? rankFor(me.score) : null };
    screen = 'result';
    renderResult();
  }
  function renderResult() {
    const r = result, g = r.g, me = g.ufos[0];
    let top;
    if (g.mode === 'versus') {
      const maxS = Math.max(8, ...g.ufos.map(u => u.score));
      const topScore = Math.max(...g.ufos.map(u => u.score));
      top = `<div class="rtitle ${r.place === 1 ? 'win' : ''}">${r.place === 1 ? '1등! 구슬 납치왕!' : r.place + '등'}</div>
        <div class="bars">${g.ufos.map((u, i) => `
          <div class="bar"><div class="crown">${u.score === topScore ? '👑' : ''}</div>
            <div class="pile" style="--hn:${(u.score / maxS).toFixed(3)};--c:${CHARS[i].color}"></div>
            <div class="bv" style="background:${CHARS[i].color}">${u.score}</div>
            <div class="bn">${i === 0 ? '나' : CHARS[i].name}</div></div>`).join('')}</div>`;
    } else {
      const nxt = RANKS.slice().reverse().find(x => x.min > me.score);
      top = `<div class="rtitle">결과 발표</div><div class="rscore">${me.score}<small>점</small></div>
        <div class="stamp" style="--c:${r.rank.color}"><span>랭크</span><b>${r.rank.r}</b></div>
        <div class="next">${nxt ? nxt.r + '랭크까지 ' + (nxt.min - me.score) + '점!' : '최고 랭크 달성!'}</div>`;
    }
    layer.result.innerHTML = `<div class="card">${top}
      <div class="rows">
        <div><span>구역에 내려놓은 횟수</span><b>${me.deposits}번 (한 번에 최대 ${me.bestTrip}점)</b></div>
        <div><span>금구슬 · 무지개 구슬</span><b>${me.golds}개 · ${me.rainbows}개</b></div>
        <div><span>부딪혀서 떨어뜨린 구슬</span><b>${me.lostByBump}개</b></div>
        <div><span>${g.mode === 'solo' ? '최고 점수' : '최고 점수 (' + AI_DIFF[g.diff].label + ')'}</span><b class="${r.isNew ? 'new' : ''}">${r.best}점${r.isNew ? ' 신기록!' : ''}</b></div>
      </div>
      <button class="big b-orange" id="btnRetry"><span class="l1">한 판 더</span></button>
      <button class="big b-gray" id="btnHome"><span class="l1">처음으로</span></button></div>`;
    show('result', true);
    setTimeout(() => { Sound.play(g.mode === 'solo' ? 'stamp' : (r.place === 1 ? 'win' : 'lose')); if (g.mode === 'solo') setTimeout(() => Sound.play(r.rank.r === 'S' || r.rank.r === 'A' ? 'win' : 'lose'), 250); }, 700);
    $('btnRetry').onclick = () => { Sound.play('click'); startGame(g.mode); };
    $('btnHome').onclick = () => { Sound.play('click'); goTitle(); };
  }

  function handleEvents(g, quiet) {
    for (const e of g.events) {
      if (quiet) continue;
      switch (e.type) {
        case 'attach':
          if (e.u === 0) Sound.play(e.kind === 'silver' ? 'clink' : 'clinkGold');
          burst3(e.x, e.y, e.z, e.kind === 'silver' ? 5 : 12, e.kind === 'silver' ? ['#9effd6', '#ffffff'] : ['#ffd23f', '#fff6b0'], 2.5, 0.5);
          break;
        case 'deposit': {
          const c = CHARS[e.u];
          if (e.u === 0) Sound.play('deposit', { n: e.n });
          burst3(e.x, 1.5, e.z, 26, [c.color, '#ffffff', '#fff6b0'], 6, 4);
          popup3(e.x, UFO_Y + 1.6, e.z, '+' + e.v, e.u === 0 ? '#ffb347' : c.color, e.u === 0 ? 38 : 26);
          break;
        }
        case 'bump': {
          const me = e.a === 0 || e.b === 0;
          if (me || g.mode === 'solo') Sound.play('bump');
          if (e.lostA + e.lostB > 0 && me) Sound.play('scatter');
          burst3(e.x, UFO_Y, e.z, 18, ['#ffffff', '#ffe27a', '#ff8a3d'], 7, 1);
          popup3(e.x, UFO_Y + 1.2, e.z, e.lostA + e.lostB > 0 ? '쿵! 와르르' : '쿵!', '#ffffff', me ? 28 : 20);
          if (me) shakeT = 0.35;
          break;
        }
        case 'rainbow': Sound.play('rainbow'); centerText('<span class="rb">무지개 구슬 등장!</span>', 'small', 1400); break;
        case 'beep': Sound.play('beep'); centerText(String(Math.ceil(g.countdown)), 'count', 900); break;
        case 'go': Sound.play('go'); Sound.startBgm(); centerText('납치 시작!', 'go', 900); break;
        case 'tick': Sound.play('tick'); break;
        case 'timeup': Sound.play('timeup'); Sound.stopBgm(); Sound.beamHum(false); centerText('그만!', 'go', 1300); break;
        case 'over': onOver(g); break;
      }
    }
    g.events.length = 0;
  }

  /* ---------- 입력 ---------- */
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const ufoPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -UFO_Y);
  const _hit = new THREE.Vector3();
  let dragId = null;
  const keys = {};
  function inputReset() { dragId = null; for (const k in keys) keys[k] = false; if (game) Object.assign(game.input, { has: false, kx: 0, kz: 0, beam: false }); $('beamBtn').classList.remove('on'); }
  function setTarget(cx, cy) {
    if (!game) return;
    ndc.set(cx / vw * 2 - 1, -((cy - 34 * U) / vh * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(ufoPlane, _hit)) {
      game.input.has = true;
      game.input.tx = clamp(_hit.x, -ARENA + 0.6, ARENA - 0.6);
      game.input.tz = clamp(_hit.z, -ARENA + 0.6, ARENA - 0.6);
    }
  }
  renderer.domElement.addEventListener('pointerdown', e => {
    e.preventDefault(); Sound.ensure();
    if (screen !== 'game' || dragId !== null) return;
    dragId = e.pointerId;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    setTarget(e.clientX, e.clientY);
  });
  renderer.domElement.addEventListener('pointermove', e => { if (screen === 'game' && e.pointerId === dragId) setTarget(e.clientX, e.clientY); });
  const endDrag = e => { if (e.pointerId === dragId) { dragId = null; if (game) game.input.has = false; } };
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  const beamBtn = $('beamBtn');
  const beamOn = v => { if (game) game.input.beam = v; beamBtn.classList.toggle('on', v); };
  beamBtn.addEventListener('pointerdown', e => { e.preventDefault(); Sound.ensure(); try { beamBtn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } beamOn(true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => beamBtn.addEventListener(t, () => beamOn(false)));
  beamBtn.addEventListener('contextmenu', e => e.preventDefault());

  const KEYMAP = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
  function syncKeys() {
    if (!game) return;
    let kx = 0, kz = 0;
    for (const k in keys) if (keys[k] && KEYMAP[k]) { kx += KEYMAP[k][0]; kz += KEYMAP[k][1]; }
    game.input.kx = kx; game.input.kz = kz;
  }
  window.addEventListener('keydown', e => {
    if (KEYMAP[e.code]) { e.preventDefault(); keys[e.code] = true; Sound.ensure(); syncKeys(); return; }
    if (e.code === 'Space') {
      e.preventDefault(); if (e.repeat) return; Sound.ensure();
      if (screen === 'game') beamOn(true);
      else if (screen === 'title') { Sound.play('click'); startGame('versus'); }
    }
    if (e.code === 'Enter' && screen === 'result') { Sound.play('click'); startGame(result.g.mode); }
  });
  window.addEventListener('keyup', e => {
    if (KEYMAP[e.code]) { keys[e.code] = false; syncKeys(); }
    if (e.code === 'Space' && screen === 'game') beamOn(false);
  });
  window.addEventListener('blur', () => inputReset());

  $('btnVersus').onclick = () => { Sound.ensure(); Sound.play('click'); startGame('versus'); };
  $('btnSolo').onclick = () => { Sound.ensure(); Sound.play('click'); startGame('solo'); };
  document.querySelectorAll('.diffs button').forEach(b => b.onclick = () => { Sound.ensure(); diff = b.dataset.d; Store.set('diff', diff); Sound.play('click'); refreshTitle(); });
  $('soundBtn').onclick = () => { Sound.ensure(); Sound.setOn(!Sound.on); refreshSound(); if (!Sound.on) { Sound.stopBgm(); Sound.beamHum(false); } else if (screen === 'game' && game && game.phase === 'play') Sound.startBgm(); };

  let hidden = false;
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden) { Sound.stopBgm(); Sound.beamHum(false); inputReset(); }
    else if (screen === 'game' && game && game.phase === 'play') Sound.startBgm();
  });

  /* ---------- 동기화 · 그리기 ---------- */
  let shakeT = 0;
  function syncScene(g, time, dt) {
    // UFO
    ufoMeshes.forEach((m, i) => {
      const u = g.ufos[i];
      const vis = !!u;
      m.grp.visible = vis; m.ring.visible = vis; m.glow.visible = vis;
      if (!vis) return;
      const p = u.body.position, v = u.body.velocity;
      const wob = u.carry.length * 0.012;
      m.grp.position.set(p.x, p.y + Math.sin(time * 3 + i) * 0.08, p.z);
      m.body.rotation.set(v.z * 0.035 + Math.sin(time * 7) * wob, time * 0.6, -v.x * 0.035 + Math.cos(time * 6) * wob);
      m.body.rotation.order = 'YXZ';
      m.lights.forEach((l, k) => l.material.color.setHex(((k + Math.floor(time * 8)) % 3 === 0) ? CHARS[i].hex : 0xfff3a0));
      m.beam.visible = u.beam;
      m.beamMat.opacity = 0.26 + Math.sin(time * 20) * 0.06;
      m.beam.rotation.y = time * 2;
      m.ring.position.set(p.x, 0.04, p.z);
      m.ringMat.opacity = u.beam ? 0.95 : 0.4;
      m.glow.position.set(p.x, 0.035, p.z);
      m.glowMat.opacity = u.beam ? 0.18 + Math.sin(time * 15) * 0.04 : 0;
    });
    // 구슬
    const alive = new Set();
    for (const o of g.orbs) {
      if (o.dead) continue;
      alive.add(o.id);
      let m = orbMeshes.get(o.id);
      if (!m) { m = new THREE.Mesh(orbGeo[o.kind], orbMat[o.kind]); m.castShadow = true; scene.add(m); orbMeshes.set(o.id, m); }
      m.position.copy(o.body.position); m.quaternion.copy(o.body.quaternion);
    }
    for (const [id, m] of orbMeshes) if (!alive.has(id)) { scene.remove(m); orbMeshes.delete(id); }
    orbMat.rainbow.emissive.setHSL((time * 0.4) % 1, 1, 0.5);
    orbMat.rainbow.color.setHSL((time * 0.4 + 0.5) % 1, 0.8, 0.7);
    // 자석 줄
    let n = 0;
    for (const u of g.ufos) for (const o of u.carry) {
      const a = o.parent ? o.parent.body.position : null;
      const up = u.body.position;
      const ax = a ? a.x : up.x + SLOTS[Math.max(0, o.slot)].x, ay = a ? a.y : up.y + SLOTS[Math.max(0, o.slot)].y, az = a ? a.z : up.z + SLOTS[Math.max(0, o.slot)].z;
      const b = o.body.position;
      tetherPos.set([ax, ay, az, b.x, b.y, b.z], n * 6); n++;
      if (n >= tetherPos.length / 6) break;
    }
    tetherGeo.setDrawRange(0, n * 2);
    tetherGeo.attributes.position.needsUpdate = true;
    // 구역 표시 애니메이션
    zoneMeshes.forEach((z, i) => {
      z.userData.arrow.position.y = 6.2 + Math.sin(time * 3 + i) * 0.3;
      z.userData.arrow.rotation.y = time * 1.5;
      const u = g.ufos[i];
      z.userData.col3.material.opacity = u && u.carry.length ? 0.1 + Math.sin(time * 6) * 0.05 : 0.05;
    });
  }
  function updateParticles(dt) {
    let w = 0;
    for (const p of parts) {
      p.t += dt; if (p.t > p.life) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 9 * dt;
      const f = 1 - p.t / p.life;
      pPos[w * 3] = p.x; pPos[w * 3 + 1] = p.y; pPos[w * 3 + 2] = p.z;
      pCol[w * 3] = p.r * f; pCol[w * 3 + 1] = p.g * f; pCol[w * 3 + 2] = p.b * f;
      parts[w++] = p;
    }
    parts.length = w;
    pGeo.setDrawRange(0, w);
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }
  function updateFireflies(time) {
    fireflies.seeds.forEach((s, i) => {
      fireflies.pos[i * 3] = s.x + Math.sin(time * 0.5 + s.p) * 1.5;
      fireflies.pos[i * 3 + 1] = s.y + Math.sin(time * 1.3 + s.p * 2) * 0.4;
      fireflies.pos[i * 3 + 2] = s.z + Math.cos(time * 0.4 + s.p) * 1.5;
    });
    fireflies.pts.geometry.attributes.position.needsUpdate = true;
    fireflies.pts.material.opacity = 0.6 + Math.sin(time * 3) * 0.3;
  }
  let lastHud = '';
  function updateHUD(g) {
    const me = g.ufos[0];
    const tl = g.phase === 'countdown' ? GAME_TIME : g.timeLeft;
    const key = me.score + '|' + Math.ceil(tl) + '|' + g.ufos.map(u => u.score + ':' + u.carry.length).join(',') + '|' + me.carry.map(o => o.kind[0]).join('');
    const ring = $('tRing');
    ring.style.strokeDashoffset = String(201 * (1 - tl / GAME_TIME));
    ring.classList.toggle('warn', tl <= 5);
    if (key === lastHud) return;
    lastHud = key;
    $('hScore').textContent = me.score;
    $('tNum').textContent = Math.ceil(tl);
    $('tNum').classList.toggle('warn', tl <= 5 && g.phase === 'play');
    if (g.mode === 'versus') {
      const place = 1 + g.ufos.filter(q => q.score > me.score).length;
      $('hRight').textContent = place + '위';
      $('hRight').classList.toggle('first', place === 1);
      g.ufos.forEach((u, i) => { const el = $('chip' + i); if (el) el.textContent = u.score + (u.carry.length ? ' (+' + u.carry.reduce((s, o) => s + o.v, 0) + ')' : ''); });
    } else $('hRight').textContent = Store.get('best.solo', 0);
    const carryVal = me.carry.reduce((s, o) => s + o.v, 0);
    $('carryBox').innerHTML = me.carry.length
      ? `<span>매단 구슬 ${me.carry.length}/${MAX_CARRY}</span>${me.carry.map(o => `<i class="${o.kind}"></i>`).join('')}<b>+${carryVal}</b><em>${me.carry.length >= MAX_CARRY ? '가득! 구역으로!' : '구역으로 가져가세요'}</em>`
      : '';
  }

  /* ---------- 메인 루프 ---------- */
  let last = performance.now(), clock = 0, acc = 0;
  const FIXED = 1 / 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (hidden) dt = 0;
    clock += dt;
    const g = screen === 'title' ? demo : (screen === 'game' ? game : result && result.g);
    if (g && (screen === 'game' || screen === 'title')) {
      acc += dt; let steps = 0;
      while (acc >= FIXED && steps < 5) { step(g, FIXED); acc -= FIXED; steps++; }
      if (steps === 5) acc = 0;
      handleEvents(g, screen === 'title');
      if (screen === 'title' && (g.phase !== 'play' || g.elapsed > 27)) newDemo();
    } else if (g && screen === 'result') {
      // 결과 화면에서도 물리는 천천히 굴러가게
      acc += dt; while (acc >= FIXED) { g.world.step(FIXED); for (const u of g.ufos) { u.body.position.y = UFO_Y; u.body.velocity.y = 0; u.body.velocity.x *= 0.95; u.body.velocity.z *= 0.95; } acc -= FIXED; }
    }
    if (screen === 'game' && game) {
      Sound.beamHum(game.ufos[0].beam && game.phase === 'play');
      updateHUD(game);
    }
    const cur = screen === 'title' ? demo : screen === 'game' ? game : result && result.g;
    if (cur) syncScene(cur, clock, dt);
    updateParticles(dt);
    updateFireflies(clock);
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      camera.position.x += (Math.random() - 0.5) * shakeT * 0.8;
      camera.position.y += (Math.random() - 0.5) * shakeT * 0.8;
      renderer.render(scene, camera);
      fitCamera();
    } else renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  resize();
  newDemo();
  const go = () => requestAnimationFrame(frame);
  if (document.fonts && document.fonts.load) Promise.race([document.fonts.load('40px "Jua"'), new Promise(r => setTimeout(r, 1500))]).then(go, go);
  else go();
}

return Core;
}
})();
