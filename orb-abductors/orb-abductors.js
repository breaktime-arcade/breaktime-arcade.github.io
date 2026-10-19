/*!
 * 구슬 납치단 (Orb Abductors) v2.0 — 리얼 3D 업그레이드
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
const mods = [import('three'), import('cannon-es')];
if (isBrowser) mods.push(
  import('three/addons/postprocessing/EffectComposer.js'),
  import('three/addons/postprocessing/RenderPass.js'),
  import('three/addons/postprocessing/UnrealBloomPass.js'),
  import('three/addons/postprocessing/ShaderPass.js'),
  import('three/addons/postprocessing/OutputPass.js')
);
const ready = Promise.all(mods).then(m => build(m[0], m[1], isBrowser ? {
  EffectComposer: m[2].EffectComposer, RenderPass: m[3].RenderPass, UnrealBloomPass: m[4].UnrealBloomPass,
  ShaderPass: m[5].ShaderPass, OutputPass: m[6].OutputPass
} : null));

if (isNode) module.exports = ready;
if (isBrowser) {
  ready.then(() => { const l = document.getElementById('loading'); if (l) l.remove(); })
    .catch(e => {
      console.error(e);
      const app = document.getElementById('app');
      if (app) app.innerHTML = '<div class="nogl">게임을 불러오지 못했어요.<br>인터넷 연결을 확인한 뒤 최신 크롬, 엣지, 사파리에서<br>다시 열어 주세요.</div>';
    });
}

function build(THREE, CANNON, PP) {

/* =========================================================
 * 1. 상수 · 밸런스
 * ========================================================= */
const ARENA = 12;                 // 경기장 반폭 (x, z: -12 ~ 12)
const UFO_Y = 3.9, UFO_R = 1.25;
const BEAM_R = 2.2;               // 자석 빔 반경
const PULL_K = 560, PULL_MAX = 150; // 자력 = K / 거리² (최대값 제한)
const CHAIN_R = 1.15, CHAIN_K = 16; // 붙은 구슬의 자화(연쇄 끌어당김)
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
  { r: 'S', min: 50, color: '#ff4f6d' },
  { r: 'A', min: 40, color: '#ff9f1c' },
  { r: 'B', min: 28, color: '#2ec4b6' },
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

// 완만한 언덕과 고랑 (착륙 구역과 가장자리는 평평)
const smooth01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
function terrainH(x, z) {
  const h = 0.42 * Math.sin(x * 0.42 + 0.6) * Math.cos(z * 0.36 - 0.4) + 0.16 * Math.sin((x + z) * 0.8) + 0.08 * Math.cos(x * 1.3 - z * 0.9);
  let f = 1;
  for (const zn of ZONES) f = Math.min(f, smooth01((Math.hypot(x - zn.x, z - zn.z) - ZONE_R - 0.3) / 2.2));
  f *= smooth01((ARENA - Math.max(Math.abs(x), Math.abs(z))) / 1.6);
  return h * f;
}

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
  // 지형: 높이맵 (cannon Heightfield)
  const ES = 0.5, NG = Math.round(ARENA * 2 / ES) + 1, data = [];
  for (let i = 0; i < NG; i++) { const row = []; for (let j = 0; j < NG; j++) row.push(terrainH(-ARENA + i * ES, ARENA - j * ES)); data.push(row); }
  const hf = new CANNON.Body({ mass: 0, shape: new CANNON.Heightfield(data, { elementSize: ES }), material: mGround, collisionFilterGroup: 1, collisionFilterMask: 2 });
  hf.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  hf.position.set(-ARENA, 0, ARENA);
  world.addBody(hf);
  const safety = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: mGround, collisionFilterGroup: 1, collisionFilterMask: 2 });
  safety.quaternion.setFromEuler(-Math.PI / 2, 0, 0); safety.position.y = -1.2;
  world.addBody(safety);
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
  for (let k = 0; k < 38; k++) { const p = randSpot(rng, 1); spawnOrb(g, 'silver', p.x, terrainH(p.x, p.z) + 0.5 + rng() * 0.3, p.z, false); }
  for (let k = 0; k < 6; k++) { const p = randSpot(rng, 1.5); spawnOrb(g, 'gold', p.x, terrainH(p.x, p.z) + 0.6, p.z, false); }
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
      if (dh > BEAM_R + CHAIN_R) continue;
      let fx = 0, fy = 0, fz = 0;
      if (dh <= BEAM_R) {
        // 자석 본체: 거리 제곱에 반비례
        const mx = up.x - p.x, my = (UFO_Y - 1.0 - o.r) - p.y, mz = up.z - p.z;
        const d = hyp(mx, my, mz) || 1;
        const F = Math.min(PULL_MAX, PULL_K / (d * d)) * (0.75 + 0.25 * (1 - dh / BEAM_R));
        fx += mx / d * F; fy += my / d * F; fz += mz / d * F;
      }
      // 이미 붙은 구슬도 약한 자석이 되어 근처 구슬을 끌어당김
      for (const c of u.carry) {
        const cp = c.body.position;
        const cx = cp.x - p.x, cy = cp.y - p.y, cz = cp.z - p.z;
        const d = hyp(cx, cy, cz);
        if (d > CHAIN_R + o.r + c.r || d < 0.01) continue;
        const F = Math.min(70, CHAIN_K / (d * d));
        fx += cx / d * F; fy += cy / d * F; fz += cz / d * F;
      }
      if (!fx && !fy && !fz) continue;
      _f.set(fx, fy, fz);
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
  for (const o of g.orbs) if (o.sky && o.body.position.y < terrainH(o.body.position.x, o.body.position.z) + o.r + 0.35) o.sky = false;
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

const Core = { createGame, step, standings, rankFor, terrainH, AI_DIFF, RANKS, ZONES, GAME_TIME };

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

  /* ---------- 화질 ---------- */
  const QUALITY = {
    low:    { label: '저', pr: 1,    shadow: 1024, grass: 0,     post: false, spots: false, motes: false },
    medium: { label: '중', pr: 1.5,  shadow: 1024, grass: 9000,  post: true,  spots: true,  motes: true },
    high:   { label: '고', pr: 2,    shadow: 2048, grass: 24000, post: true,  spots: true,  motes: true }
  };
  function autoQuality() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
    if (mem <= 3 || cores <= 4) return 'low';
    return coarse ? 'medium' : 'high';
  }
  const urlQ = (location.search.match(/[?&]q=(low|medium|high)/) || [])[1];
  let qSetting = urlQ || Store.get('quality', 'auto');
  if (!['auto', 'low', 'medium', 'high'].includes(qSetting)) qSetting = 'auto';
  let qLevel = qSetting === 'auto' ? (Store.get('autoQ', null) || autoQuality()) : qSetting;
  if (!QUALITY[qLevel]) qLevel = 'medium';

  /* ---------- 사운드 (WebAudio 합성 + 좌우 입체음) ---------- */
  const Sound = {
    ctx: null, master: null, bgmBus: null, on: Store.get('sound', true), noiseBuf: null, bgmTimer: null, nextTime: 0, stepIdx: 0, hum: null, lastClink: 0, listener: { x: 0, z: 0 },
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 0.6 : 0; this.master.connect(this.ctx.destination);
        this.bgmBus = this.ctx.createGain(); this.bgmBus.gain.value = 0.2; this.bgmBus.connect(this.master);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ctx = null; }
    },
    setOn(v) { this.on = v; Store.set('sound', v); if (this.master) this.master.gain.setTargetAtTime(v ? 0.6 : 0, this.ctx.currentTime, 0.03); },
    // 위치(x, z)에 따라 좌우 패닝 + 거리 감쇠
    at(pos) {
      const c = this.ctx;
      if (!pos || !c.createStereoPanner) return this.master;
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z, d = Math.hypot(dx, dz);
      const pan = c.createStereoPanner(), g = c.createGain();
      pan.pan.value = clamp(dx / 11, -0.9, 0.9);
      g.gain.value = clamp(1.1 - d / 26, 0.3, 1);
      g.connect(pan); pan.connect(this.master);
      return g;
    },
    tone(f, d, type, v, f2, t0, dest) {
      const c = this.ctx; if (!c) return;
      const t = t0 != null ? t0 : c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.2, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + d + 0.05);
    },
    noise(d, v, f1, f2, t0, type, dest) {
      const c = this.ctx; if (!c) return;
      const t = t0 != null ? t0 : c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const fl = c.createBiquadFilter(); fl.type = type || 'bandpass'; fl.Q.value = 1; fl.frequency.setValueAtTime(f1, t);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(dest || this.master); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
    },
    play(name, o) {
      const c = this.ctx; if (!c || !this.on) return;
      const t = c.currentTime, D = this.at(o && o.pos);
      switch (name) {
        case 'clink':
          if (t - this.lastClink < 0.04) return; this.lastClink = t;
          this.tone(2200 + Math.random() * 400, 0.14, 'sine', 0.09, null, null, D); this.tone(3300, 0.1, 'sine', 0.04, null, null, D); this.tone(5100, 0.05, 'sine', 0.02, null, null, D); break;
        case 'clinkGold': this.tone(1800, 0.2, 'sine', 0.12, null, null, D); this.tone(2700, 0.14, 'triangle', 0.06, null, t + 0.03, D); break;
        case 'deposit': {
          const n = Math.min(8, (o && o.n) || 1);
          for (let i = 0; i < n; i++) this.tone(523 * Math.pow(1.122, i), 0.12, 'square', 0.07, null, t + i * 0.05, D);
          this.tone(1568, 0.3, 'triangle', 0.08, null, t + n * 0.05, D);
          this.noise(0.5, 0.12, 800, 200, t + 0.05, 'lowpass', D); break;
        }
        case 'bump': this.noise(0.25, 0.45, 280, 70, null, 'lowpass', D); this.tone(160, 0.35, 'sine', 0.22, 420, null, D); this.tone(90, 0.3, 'triangle', 0.15, 50, null, D); break;
        case 'scatter': for (let i = 0; i < 5; i++) this.tone(1700 + Math.random() * 1400, 0.08, 'sine', 0.05, null, t + 0.04 + i * 0.05, D); break;
        case 'thunk': this.tone(900 + Math.random() * 300, 0.05, 'sine', 0.025, null, null, D); break;
        case 'rainbow': this.tone(2400, 0.9, 'sine', 0.06, 500); [1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.08, null, t + 0.1 + i * 0.08)); break;
        case 'slowmo': this.tone(300, 0.6, 'sine', 0.12, 80); this.noise(0.6, 0.1, 2000, 300, null, 'lowpass'); break;
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
    beamHum(on, x) {
      const c = this.ctx; if (!c) return;
      if (on && !this.hum && this.on) {
        const o = c.createOscillator(), o2 = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter(), g = c.createGain();
        const pan = c.createStereoPanner ? c.createStereoPanner() : null;
        o.type = 'sawtooth'; o.frequency.value = 98; o2.type = 'sine'; o2.frequency.value = 196.5;
        f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 6;
        lfo.frequency.value = 7; lg.gain.value = 300; lfo.connect(lg); lg.connect(f.frequency);
        g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.06, c.currentTime + 0.08);
        o.connect(f); o2.connect(f); f.connect(g);
        if (pan) { g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
        o.start(); o2.start(); lfo.start();
        this.hum = { o, o2, lfo, g, pan };
      } else if (!on && this.hum) {
        const h = this.hum; this.hum = null;
        h.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.04);
        [h.o, h.o2, h.lfo].forEach(n => n.stop(c.currentTime + 0.3));
      }
      if (this.hum && this.hum.pan && x != null) this.hum.pan.pan.value = clamp(x / 14, -0.7, 0.7);
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
          if (s % 2 === 0) this.tone(mtof(ch[(s / 2) % 4] + 12), spb * 1.6, 'square', 0.045, null, t, this.bgmBus);
          if (s % 8 === 0) this.tone(mtof(ch[0] - 12), spb * 6, 'triangle', 0.26, null, t, this.bgmBus);
          if (s % 8 === 4) this.noise(0.05, 0.1, 6000, null, t, null, this.bgmBus);
          if (s === 0 || s === 32) this.tone(mtof(ch[3] + 24), spb * 10, 'sine', 0.04, mtof(ch[3] + 19), t, this.bgmBus);
        }
        this.nextTime += spb; this.stepIdx++;
      }
    }
  };

  /* ---------- 렌더러 ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    app.innerHTML = '<div class="nogl">이 기기에서는 3D(WebGL)를 지원하지 않아 게임을 실행할 수 없어요.<br>다른 브라우저나 기기에서 열어 주세요.</div>';
    return;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.id = 'gl';
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0e1638, 48, 120);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 400);

  // 셰이더 공통 조각
  const GLSL_NOISE = `
    float h31(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
    float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
                 mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z); }
    float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*n3(p); p*=2.03; a*=.5; } return s; }
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }`;
  const FRAG_END = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

  /* ---------- 하늘 (은하수 · 별 · 달) ---------- */
  function skyMaterial(gain) {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uGain: { value: gain } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uGain; varying vec3 vDir; ${GLSL_NOISE}
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(vec3(0.075,0.085,0.21), vec3(0.008,0.012,0.045), smoothstep(0.0, 0.65, h));
          col = mix(vec3(0.20,0.17,0.32), col, smoothstep(-0.08, 0.28, h));
          vec3 n = normalize(vec3(0.35, 0.62, -0.7));
          float b = 1.0 - abs(dot(d, n));
          float band = smoothstep(0.8, 1.0, b) * smoothstep(-0.1, 0.2, h);
          float cl = fbm(d * 5.0);
          col += vec3(0.22, 0.2, 0.34) * band * cl * 1.1 + vec3(0.1, 0.12, 0.24) * band * 0.4;
          col *= 1.0 - band * smoothstep(0.5, 0.75, fbm(d * 11.0 + 3.0)) * 0.55;
          col *= uGain;
          gl_FragColor = vec4(col, 1.0);
          ${FRAG_END}
        }`
    });
  }
  // 하늘은 시작할 때 큐브맵으로 한 번만 그려 둠 (매 프레임 계산하지 않아 가벼움)
  {
    const skyScene = new THREE.Scene();
    skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), skyMaterial(1)));
    const cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(1, 100, cubeRT);
    cubeCam.update(renderer, skyScene);
    scene.background = cubeRT.texture;
  }
  const starU = { uTime: { value: 0 }, uPR: { value: 1 } };
  {
    const n = 1400, pos = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
    const r = mulberry32(9);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, el = Math.asin(0.05 + r() * 0.95), R = 180;
      pos[i * 3] = Math.cos(a) * Math.cos(el) * R; pos[i * 3 + 1] = Math.sin(el) * R; pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * R;
      size[i] = 0.8 + Math.pow(r(), 6) * 4.5; ph[i] = r() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    scene.add(new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: starU, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uPR; varying float vA;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv;
          vA = 0.55 + 0.45*sin(uTime*(1.3+aPhase*0.4) + aPhase*7.0); gl_PointSize = aSize * uPR * (0.75 + 0.25*vA); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * vA * 1.8, a); ${FRAG_END} }`
    })));
  }
  function glowTexture(rgba) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, rgba); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const moonPos = new THREE.Vector3(-55, 70, -120);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d0).multiplyScalar(2.2), fog: false }));
  moon.position.copy(moonPos); scene.add(moon);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,236,200,0.55)'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  moonGlow.scale.set(60, 60, 1); moonGlow.position.copy(moonPos); scene.add(moonGlow);

  /* ---------- 조명 ---------- */
  const hemi = new THREE.HemisphereLight(0x8fa6ff, 0x1a2a1c, 0.55); scene.add(hemi);
  scene.add(new THREE.AmbientLight(0x2a3366, 0.25));
  const moonLight = new THREE.DirectionalLight(0xd6e2ff, 1.9);
  moonLight.position.set(-9, 26, 13);
  moonLight.castShadow = true;
  Object.assign(moonLight.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 5, far: 60 });
  moonLight.shadow.bias = -0.0006; moonLight.shadow.normalBias = 0.02;
  scene.add(moonLight);

  /* ---------- 환경맵 (실제 밤하늘 장면으로 반사 생성) ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = (() => {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(4.5)));
    const m = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d0).multiplyScalar(14) }));
    m.position.set(-18, 24, -38); es.add(m);
    const grd = new THREE.Mesh(new THREE.CircleGeometry(48, 32), new THREE.MeshBasicMaterial({ color: 0x12241a }));
    grd.rotation.x = -Math.PI / 2; grd.position.y = -3; es.add(grd);
    [[-14, 2, -14], [14, 2, -14], [-14, 2, 14], [14, 2, 14]].forEach(p => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff6ff).multiplyScalar(6) }));
      b.position.set(p[0], p[1], p[2]); es.add(b);
    });
    return pmrem.fromScene(es, 0.02).texture;
  })();

  /* ---------- 지형 · 미스터리 서클 ---------- */
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
    t.anisotropy = 8;
    return t;
  }
  const CROP = r => (r < 1.7) || (r > 3.4 && r < 3.9) || (r > 5.6 && r < 6.05) || (r > 7.05 && r < 7.65);
  {
    const fieldTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#1a3524'; c.fillRect(0, 0, w, h);
      const r = mulberry32(2);
      for (let i = 0; i < 1600; i++) { c.fillStyle = r() < 0.5 ? 'rgba(60,110,70,0.5)' : 'rgba(12,30,20,0.6)'; c.fillRect(r() * w, r() * h, 2, 4); }
    }, 22);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 1 }));
    field.rotation.x = -Math.PI / 2; field.position.y = -0.8; field.receiveShadow = true; scene.add(field);

    const S = 1024, PX = S / (ARENA * 2);
    const tex = canvasTex(S, S, (c, w, h) => {
      c.fillStyle = '#2a5a36'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 24; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; c.fillRect(i * w / 24, 0, w / 24, h); }
      // 눌린 풀(미스터리 서클)은 밝고 빗질된 결
      c.save(); c.translate(w / 2, h / 2);
      const ring = (r0, r1) => { c.beginPath(); c.arc(0, 0, r1 * PX, 0, Math.PI * 2); if (r0 > 0) c.arc(0, 0, r0 * PX, 0, Math.PI * 2, true); c.fillStyle = 'rgba(150,200,120,0.32)'; c.fill(); };
      ring(0, 1.7); ring(3.4, 3.9); ring(5.6, 6.05); ring(7.05, 7.65);
      c.strokeStyle = 'rgba(200,240,170,0.12)'; c.lineWidth = 2;
      for (let a = 0; a < Math.PI * 2; a += 0.05) { c.beginPath(); c.arc(0, 0, 7.35 * PX, a, a + 0.03); c.stroke(); c.beginPath(); c.arc(0, 0, 3.65 * PX, a, a + 0.03); c.stroke(); }
      c.restore();
      const r = mulberry32(4);
      for (let i = 0; i < 6000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(110,190,120,0.22)' : 'rgba(8,30,16,0.3)'; c.fillRect(r() * w, r() * h, 2, 5); }
      // 흙 얼룩
      for (let i = 0; i < 40; i++) { const g2 = c.createRadialGradient(0, 0, 0, 0, 0, 30 + r() * 50); g2.addColorStop(0, 'rgba(70,55,35,0.22)'); g2.addColorStop(1, 'rgba(70,55,35,0)'); c.save(); c.translate(r() * w, r() * h); c.fillStyle = g2; c.fillRect(-80, -80, 160, 160); c.restore(); }
    });
    const geo = new THREE.PlaneGeometry(ARENA * 2, ARENA * 2, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) P.setY(i, terrainH(P.getX(i), P.getZ(i)));
    geo.computeVertexNormals();
    const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
    floor.receiveShadow = true; scene.add(floor);

    // 경기장 가장자리 레일과 조명 기둥
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x3a4a60, metalness: 0.8, roughness: 0.35, envMap: envTex, envMapIntensity: 1.5 });
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ae8ff).multiplyScalar(2.2) });
    const e1 = new THREE.BoxGeometry(ARENA * 2 + 0.6, 0.18, 0.18), e2 = new THREE.BoxGeometry(0.18, 0.18, ARENA * 2 + 0.6);
    const s1 = new THREE.BoxGeometry(ARENA * 2 + 0.6, 0.04, 0.05), s2 = new THREE.BoxGeometry(0.05, 0.04, ARENA * 2 + 0.6);
    [[0, ARENA + 0.2, e1, s1], [0, -ARENA - 0.2, e1, s1], [ARENA + 0.2, 0, e2, s2], [-ARENA - 0.2, 0, e2, s2]].forEach(([x, z, geo2, sg]) => {
      const m = new THREE.Mesh(geo2, edgeMat); m.position.set(x, 0.12, z); m.castShadow = true; scene.add(m);
      const strip = new THREE.Mesh(sg, glowMat); strip.position.set(x, 0.23, z); scene.add(strip);
    });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8090b0, metalness: 0.85, roughness: 0.3, envMap: envTex, envMapIntensity: 1.5 });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.8, 12), postMat);
      post.position.set(sx * (ARENA + 0.2), 0.9, sz * (ARENA + 0.2)); post.castShadow = true; scene.add(post);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff6ff).multiplyScalar(3) }));
      bulb.position.set(sx * (ARENA + 0.2), 1.9, sz * (ARENA + 0.2)); scene.add(bulb);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(150,240,255,0.5)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      gl.scale.set(3, 3, 1); gl.position.copy(bulb.position); scene.add(gl);
    });
  }
  // 나무와 낮은 안개
  {
    const r = mulberry32(17);
    // 나무는 인스턴싱으로 한꺼번에 그림 (그리기 호출 수 절감)
    const trees = [];
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 17 + r() * 22;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z > 13 && Math.abs(x) < 22) continue;
      trees.push({ x, z, s: 0.8 + r() * 1.1, rot: r() * 3, c: i % 2 });
    }
    const trunkM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1.4, 7), new THREE.MeshStandardMaterial({ color: 0x3a281c, roughness: 1 }), trees.length);
    const cones = [0, 1, 2, 3].map(k => new THREE.InstancedMesh(new THREE.ConeGeometry(1.75 - k * 0.38, 1.7, 9), new THREE.MeshStandardMaterial({ color: k % 2 ? 0x1d4a31 : 0x173f2a, roughness: 0.9 }), trees.length));
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), e3 = new THREE.Euler();
    trees.forEach((t, i) => {
      qq.setFromEuler(e3.set(0, t.rot, 0));
      m4.compose(new THREE.Vector3(t.x, 0.7 * t.s, t.z), qq, new THREE.Vector3(t.s, t.s, t.s)); trunkM.setMatrixAt(i, m4);
      cones.forEach((cm, k) => { m4.compose(new THREE.Vector3(t.x, (1.6 + k * 0.85) * t.s, t.z), qq, new THREE.Vector3(t.s, t.s, t.s)); cm.setMatrixAt(i, m4); });
    });
    [trunkM, ...cones].forEach(m => { m.castShadow = true; scene.add(m); });
    const fogTex = glowTexture('rgba(150,170,220,0.22)');
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = 15 + r() * 14;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, transparent: true, depthWrite: false, opacity: 0.32 }));
      sp.scale.set(10 + r() * 6, 2 + r() * 1.2, 1); sp.position.set(Math.cos(a) * d, 0.5, Math.sin(a) * d);
      scene.add(sp);
    }
  }

  /* ---------- 풀밭 (인스턴싱 + 바람 · 빔에 눕는 셰이더) ---------- */
  const grassU = { uTime: { value: 0 }, uUfo: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(999, 999, 0, 0)) } };
  const GRASS_MAX = QUALITY.high.grass;
  const grass = (() => {
    const BH = 0.42;
    const geo = new THREE.PlaneGeometry(0.07, BH, 1, 4);
    geo.translate(0, BH / 2, 0);
    const P = geo.attributes.position, N = geo.attributes.normal;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i); P.setX(i, P.getX(i) * (1 - y / BH * 0.92)); N.setXYZ(i, 0, 1, 0); }
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = grassU.uTime; sh.uniforms.uUfo = grassU.uUfo;
      sh.vertexShader = 'uniform float uTime; uniform vec4 uUfo[4];\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float hk = clamp(position.y / ${BH.toFixed(2)}, 0.0, 1.0); float bend = hk * hk;
        vec2 w = vec2(sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.21), cos(uTime * 1.3 + ip.z * 0.43 + ip.x * 0.1)) * 0.09;
        w += vec2(sin(uTime * 4.1 + ip.x * 2.1), cos(uTime * 3.7 + ip.z * 1.9)) * 0.015;
        vec2 push = vec2(0.0); float flt = 0.0;
        for (int i = 0; i < 4; i++) {
          vec2 d = ip.xz - uUfo[i].xy; float dist = length(d) + 0.0001; vec2 dir = d / dist;
          float beam = uUfo[i].z * smoothstep(2.6, 0.3, dist);
          float wash = uUfo[i].w * smoothstep(3.2, 0.6, dist);
          push += dir * (beam * 0.32 + wash * 0.07 * (1.0 + sin(uTime * 13.0 - dist * 4.0)));
          flt = max(flt, beam);
        }
        mat3 R = mat3(instanceMatrix); float sc2 = dot(R[0], R[0]);
        vec3 lw = transpose(R) * vec3(w.x + push.x, 0.0, w.y + push.y) / sc2;
        transformed.xz += lw.xz * bend;
        transformed.y *= 1.0 - flt * 0.55;
      `);
    };
    const mesh = new THREE.InstancedMesh(geo, mat, GRASS_MAX);
    mesh.receiveShadow = true; mesh.frustumCulled = false;
    const r = mulberry32(77), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    let n = 0;
    while (n < GRASS_MAX) {
      const x = (r() * 2 - 1) * (ARENA - 0.15), z = (r() * 2 - 1) * (ARENA - 0.15);
      if (ZONES.some(zn => Math.hypot(x - zn.x, z - zn.z) < ZONE_R + 0.1)) continue;
      const rc = Math.hypot(x, z), crop = CROP(rc);
      const hs = crop ? 0.22 + r() * 0.12 : 0.65 + r() * 0.6;
      e.set((r() - 0.5) * 0.35 + (crop ? 0.9 : 0), r() * Math.PI * 2, (r() - 0.5) * 0.35);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, terrainH(x, z) - 0.02, z), q, new THREE.Vector3(0.8 + r() * 0.5, hs, 1));
      mesh.setMatrixAt(n, m4);
      col.setHSL(0.27 + r() * 0.07, 0.45 + r() * 0.2, crop ? 0.24 + r() * 0.08 : 0.13 + r() * 0.12);
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    return mesh;
  })();

  /* ---------- 착륙 구역 ---------- */
  const columnMat = col => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(col) }, uTime: { value: 0 }, uOp: { value: 0.35 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uOp; varying vec2 vUv; ${GLSL_NOISE}
      void main(){ float f = pow(1.0 - vUv.y, 2.2); float n = n2(vec2(vUv.x * 20.0, vUv.y * 6.0 - uTime * 0.8));
        gl_FragColor = vec4(uColor * 1.6, uOp * f * (0.55 + 0.45 * n)); ${FRAG_END} }`
  });
  const zoneMeshes = ZONES.map((zn, i) => {
    const grp = new THREE.Group();
    const col = CHARS[i].hex;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(ZONE_R, ZONE_R + 0.15, 0.08, 48), new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.6, roughness: 0.45, envMap: envTex }));
    pad.position.y = 0.03; pad.receiveShadow = true; grp.add(pad);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ZONE_R - 0.2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.5), transparent: true, opacity: 0.5, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.075; grp.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE_R - 0.2, ZONE_R - 0.02, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.4) }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; grp.add(ring);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(3) }));
      lamp.position.set(Math.cos(a) * (ZONE_R - 0.45), 0.1, Math.sin(a) * (ZONE_R - 0.45)); grp.add(lamp);
    }
    const colMat = columnMat(col);
    const col3 = new THREE.Mesh(new THREE.CylinderGeometry(ZONE_R - 0.1, ZONE_R - 0.1, 7, 48, 1, true), colMat);
    col3.position.y = 3.55; grp.add(col3);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.65, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2) }));
    arrow.rotation.x = Math.PI; arrow.position.y = 6.2; grp.add(arrow);
    grp.position.set(zn.x, 0, zn.z);
    grp.userData = { colMat, arrow };
    scene.add(grp);
    return grp;
  });

  /* ---------- 반딧불 ---------- */
  const fireflies = (() => {
    const n = 60, pos = new Float32Array(n * 3), seeds = [];
    const r = mulberry32(31);
    for (let i = 0; i < n; i++) seeds.push({ x: (r() * 2 - 1) * 24, z: (r() * 2 - 1) * 24, y: 0.5 + r() * 2.2, p: r() * 6 });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(0xd8ff7a).multiplyScalar(2.5), size: 0.16, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false; scene.add(pts);
    return { pts, pos, seeds };
  })();

  /* ---------- UFO 모델 ---------- */
  const panelTex = canvasTex(1024, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#cfd6e2'); gr.addColorStop(1, '#9aa3b2');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    const r = mulberry32(5);
    for (let i = 0; i < 24; i++) { c.fillStyle = 'rgba(255,255,255,' + (r() * 0.08) + ')'; c.fillRect(i * w / 24, 0, w / 24, h); }
    c.strokeStyle = 'rgba(40,46,60,0.75)'; c.lineWidth = 3;
    for (let i = 0; i <= 24; i++) { c.beginPath(); c.moveTo(i * w / 24, 0); c.lineTo(i * w / 24, h); c.stroke(); }
    [0.3, 0.55, 0.8].forEach(v => { c.beginPath(); c.moveTo(0, v * h); c.lineTo(w, v * h); c.stroke(); });
    c.fillStyle = 'rgba(30,34,44,0.8)';
    for (let i = 0; i < 24; i++) for (const v of [0.27, 0.33, 0.52, 0.58, 0.77, 0.83]) { c.beginPath(); c.arc(i * w / 24 + 8, v * h, 2.2, 0, 7); c.fill(); c.beginPath(); c.arc((i + 1) * w / 24 - 8, v * h, 2.2, 0, 7); c.fill(); }
    for (let i = 0; i < 260; i++) { c.strokeStyle = 'rgba(255,255,255,' + (0.05 + r() * 0.12) + ')'; c.lineWidth = 1; const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 6); c.stroke(); }
  });
  const roughTex = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#5a5a5a'; c.fillRect(0, 0, w, h);
    const r = mulberry32(6);
    for (let i = 0; i < 600; i++) { c.fillStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '0,0,0') + ',' + (r() * 0.15) + ')'; c.fillRect(r() * w, r() * h, 2 + r() * 20, 1 + r() * 2); }
  });
  roughTex.colorSpace = THREE.NoColorSpace;
  const metalMat = new THREE.MeshStandardMaterial({ map: panelTex, roughnessMap: roughTex, bumpMap: roughTex, bumpScale: 0.6, color: 0xffffff, metalness: 0.88, roughness: 0.55, envMap: envTex, envMapIntensity: 1.7 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b3040, metalness: 0.9, roughness: 0.35, envMap: envTex, envMapIntensity: 1.4 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xcfeeff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.28, envMap: envTex, envMapIntensity: 2.5, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xc62828, metalness: 0.45, roughness: 0.35, envMap: envTex });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x15151d });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const saucerGeo = new THREE.LatheGeometry([[0, -0.3], [0.5, -0.34], [0.98, -0.24], [1.26, -0.06], [1.34, 0.0], [1.3, 0.07], [1.0, 0.18], [0.66, 0.25], [0, 0.27]].map(p => new THREE.Vector2(p[0], p[1])), 64);
  const beamVert = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }';
  const beamFrag = `uniform float uTime; uniform float uOp; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV; ${GLSL_NOISE}
    void main(){
      float fres = abs(dot(normalize(vN), normalize(vV)));
      float n = n2(vec2(vUv.x * 16.0, vUv.y * 4.0 + uTime * 2.4)) * 0.6 + n2(vec2(vUv.x * 34.0, vUv.y * 10.0 + uTime * 3.6)) * 0.4;
      float rings = 0.55 + 0.45 * sin(vUv.y * 30.0 + uTime * 10.0);
      float a = uOp * (0.3 + 0.7 * n) * (0.6 + 0.4 * rings) * smoothstep(0.0, 0.35, fres) * (0.3 + 0.7 * vUv.y);
      gl_FragColor = vec4(uColor * (1.3 + n * 1.4), a);
      ${FRAG_END}
    }`;
  const BEAM_H = UFO_Y - 0.6;
  function makeUfoMesh(i) {
    const col = CHARS[i].hex;
    const grp = new THREE.Group();
    const body = new THREE.Group(); grp.add(body);
    const saucer = new THREE.Mesh(saucerGeo, metalMat); saucer.castShadow = true; body.add(saucer);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.31, 0.05, 8, 64), darkMetal); rim.rotation.x = Math.PI / 2; rim.position.y = 0.0; body.add(rim);
    const bandMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.35 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.035, 8, 64), bandMat); band.rotation.x = Math.PI / 2; band.position.y = 0.19; body.add(band);
    // 테두리 조명
    const lights = [];
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.position.set(Math.cos(a) * 1.17, -0.15, Math.sin(a) * 1.17); body.add(m); lights.push(m);
    }
    // 회전하는 엔진 링
    const engine = new THREE.Group(); body.add(engine);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.07, 10, 48), darkMetal); ring.rotation.x = Math.PI / 2; ring.position.y = -0.33; engine.add(ring);
    const engGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.6) });
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.08), engGlowMat);
      seg.position.set(Math.cos(a) * 0.66, -0.38, Math.sin(a) * 0.66); seg.rotation.y = -a; engine.add(seg);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.66, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glassMat); dome.position.y = 0.24; body.add(dome);
    // 외계인 (귀여운 스타일 유지)
    const skin = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0, emissive: col, emissiveIntensity: 0.12 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), skin); head.position.y = 0.52; head.scale.set(1, 0.92, 1); body.add(head);
    const eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), eyeMat); eye.position.set(s * 0.135, 0.58, 0.26); body.add(eye); eyes.push(eye);
      const pup = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), pupilMat); pup.position.set(s * 0.135, 0.58, 0.365); body.add(pup); eyes.push(pup);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 5), skin); ant.position.set(s * 0.16, 0.92, 0); ant.rotation.z = -s * 0.35; body.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff27a).multiplyScalar(2.2) })); tip.position.set(s * 0.22, 1.07, 0); body.add(tip);
    }
    // 자석
    const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.3, 24), redMat); mag.position.y = -0.52; body.add(mag);
    const magTip = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 24), darkMetal); magTip.position.y = -0.72; body.add(magTip);
    const magGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dffb6).multiplyScalar(0.2) });
    const magGlow = new THREE.Mesh(new THREE.CircleGeometry(0.27, 24), magGlowMat); magGlow.rotation.x = Math.PI / 2; magGlow.position.y = -0.775; body.add(magGlow);
    // 입체 트랙터 빔 (바깥 + 안쪽 코어)
    const beamU = { uTime: { value: 0 }, uOp: { value: 0 }, uColor: { value: new THREE.Color(0x6dffb0) } };
    const beamMat = new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(BEAM_R, BEAM_H, 48, 1, true), beamMat);
    beam.position.y = -(BEAM_H / 2 + 0.6); grp.add(beam);
    const coreU = { uTime: beamU.uTime, uOp: { value: 0 }, uColor: { value: new THREE.Color(0xd8ffe8) } };
    const core = new THREE.Mesh(new THREE.ConeGeometry(BEAM_R * 0.45, BEAM_H, 32, 1, true), new THREE.ShaderMaterial({ uniforms: coreU, vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    core.position.y = beam.position.y; grp.add(core);
    // 아래를 비추는 스포트라이트
    const spot = new THREE.SpotLight(0xdff6ff, 0, 11, Math.atan(BEAM_R / UFO_Y) * 1.05, 0.55, 1.2);
    spot.position.set(0, -0.6, 0); grp.add(spot);
    const tgt = new THREE.Object3D(); tgt.position.set(0, -UFO_Y, 0); grp.add(tgt); spot.target = tgt;
    scene.add(grp);
    // 바닥 표시 링
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.2), transparent: true, opacity: 0.35, depthWrite: false });
    const gRing = new THREE.Mesh(new THREE.RingGeometry(BEAM_R - 0.08, BEAM_R, 64), ringMat);
    gRing.rotation.x = -Math.PI / 2; scene.add(gRing);
    return { grp, body, lights, engine, beam, core, beamU, coreU, spot, gRing, ringMat, eyes, magGlowMat, bandMat,
      vs: { y: 0, vy: 0, rx: 0, vrx: 0, rz: 0, vrz: 0, pvx: 0, pvz: 0, beam: 0, blink: 2 + Math.random() * 3 } };
  }
  const ufoMeshes = [0, 1, 2, 3].map(makeUfoMesh);

  /* ---------- 구슬 · 자기장 줄 · 파티클 ---------- */
  const orbGeo = { silver: new THREE.SphereGeometry(ORB.silver.r, 28, 18), gold: new THREE.SphereGeometry(ORB.gold.r, 28, 18), rainbow: new THREE.SphereGeometry(ORB.rainbow.r, 32, 20) };
  const orbMat = {
    silver: new THREE.MeshStandardMaterial({ color: 0xe6ebf2, metalness: 1, roughness: 0.16, envMap: envTex, envMapIntensity: 1.5, emissive: 0x0a0e16 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xf5b52e, metalness: 1, roughness: 0.2, envMap: envTex, envMapIntensity: 1.6, emissive: 0x1a1000 }),
    rainbow: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.12, envMap: envTex, envMapIntensity: 2, emissive: 0xff00ff, emissiveIntensity: 1.4 })
  };
  const orbMeshes = new Map();
  // 접촉 그림자: 구슬이 바닥에 닿은 곳을 어둡게 (앰비언트 오클루전 효과)
  const AO_MAX = 220;
  const aoMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTexture('rgba(0,0,0,0.85)'), transparent: true, depthWrite: false, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2 }), AO_MAX);
  aoMesh.frustumCulled = false; aoMesh.renderOrder = 1; scene.add(aoMesh);
  const _m4 = new THREE.Matrix4(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _q0 = new THREE.Quaternion();
  const tetherPos = new Float32Array(4 * MAX_CARRY * 2 * 3);
  const tetherGeo = new THREE.BufferGeometry(); tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPos, 3));
  const tethers = new THREE.LineSegments(tetherGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(0x9effd6).multiplyScalar(2.2), transparent: true, opacity: 0.8 }));
  tethers.frustumCulled = false; scene.add(tethers);

  const PMAX = 700;
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), parts = [];
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture('rgba(255,255,255,1)') }));
  pts.frustumCulled = false; scene.add(pts);
  const _c = new THREE.Color();
  function burst3(x, y, z, n, hexes, spd, up, grav, life) {
    for (let k = 0; k < n && parts.length < PMAX; k++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, s = (0.4 + Math.random()) * (spd || 5);
      _c.set(hexes[(Math.random() * hexes.length) | 0]).multiplyScalar(2.2);
      parts.push({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.abs(Math.sin(e)) * s + (up || 2), vz: Math.sin(a) * Math.cos(e) * s, t: 0, life: (life || 0.5) + Math.random() * 0.5, g: grav == null ? 9 : grav, r: _c.r, gg: _c.g, b: _c.b });
    }
  }
  function mote(x, z) {
    if (parts.length >= PMAX) return;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * BEAM_R * 0.9;
    _c.set(Math.random() < 0.5 ? '#9effd6' : '#e8fff4').multiplyScalar(1.6);
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    parts.push({ x: px, y: terrainH(px, pz) + 0.1, z: pz, vx: -Math.sin(a) * 0.6, vy: 1.6 + Math.random() * 1.6, vz: Math.cos(a) * 0.6, t: 0, life: 1.4, g: -0.4, r: _c.r, gg: _c.g, b: _c.b });
  }
  function clearDynamic() {
    for (const m of orbMeshes.values()) scene.remove(m);
    orbMeshes.clear();
    parts.length = 0;
  }

  /* ---------- 후처리 (블룸 · 앰비언트 오클루전 · 색보정) ---------- */
  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 1 }, uSlow: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uSlow; varying vec2 vUv;
      float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        vec2 cc = uv - 0.5;
        // 슬로모션 때 살짝 색수차
        float ca = uSlow * 0.004;
        vec3 c = vec3(texture2D(tDiffuse, uv + cc * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - cc * ca).b);
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(c, c * vec3(0.92, 1.0, 1.1), smoothstep(0.4, 0.0, l) * 0.6);
        c = mix(vec3(l), c, 1.0 + 0.12 - uSlow * 0.5);
        float v = smoothstep(0.95, 0.25, length(cc) * (1.0 + uVig * 0.25 + uSlow * 0.35));
        c *= mix(0.55, 1.0, v);
        c += (rnd(uv * 731.0 + uTime) - 0.5) * 0.018;
        gl_FragColor = vec4(c, 1.0);
      }`
  };
  let composer = null, bloomPass = null, gradePass = null;
  function buildComposer() {
    if (composer) { composer.dispose && composer.dispose(); composer = null; }
    const Q = QUALITY[qLevel];
    if (!Q.post || !PP) return;
    composer = new PP.EffectComposer(renderer);
    composer.addPass(new PP.RenderPass(scene, camera));
    bloomPass = new PP.UnrealBloomPass(new THREE.Vector2(vw, vh), 0.6, 0.5, 0.92);
    composer.addPass(bloomPass);
    gradePass = new PP.ShaderPass(GradeShader);
    composer.addPass(gradePass);
    composer.addPass(new PP.OutputPass());
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(vw, vh);
  }
  function applyQuality() {
    const Q = QUALITY[qLevel];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    starU.uPR.value = renderer.getPixelRatio();
    if (moonLight.shadow.mapSize.x !== Q.shadow) {
      moonLight.shadow.mapSize.set(Q.shadow, Q.shadow);
      if (moonLight.shadow.map) { moonLight.shadow.map.dispose(); moonLight.shadow.map = null; }
    }
    grass.count = Q.grass; grass.visible = Q.grass > 0;
    ufoMeshes.forEach(m => { m.spot.visible = Q.spots; });
    renderer.setSize(vw, vh);
    buildComposer();
    refreshQualityUI();
  }

  /* ---------- 카메라 (화면 맞춤 + 내 UFO 살짝 따라가기) ---------- */
  let vw = window.innerWidth, vh = window.innerHeight, U = 1, uiTop = 0;
  const uiEl = document.createElement('div'); uiEl.id = 'ui'; app.appendChild(uiEl);
  const fxEl = document.createElement('div'); fxEl.id = 'fx'; app.appendChild(fxEl);
  const camDir = new THREE.Vector3();
  const camBase = new THREE.Vector3(0, 0, 0.6), camLook = new THREE.Vector3(0, 0, 0.6), camFollow = new THREE.Vector3();
  let camDist = 40;
  const fitPts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { fitPts.push(new THREE.Vector3(sx * (ARENA + 0.5), 0, sz * (ARENA + 0.5))); fitPts.push(new THREE.Vector3(sx * (ARENA - 0.6), UFO_Y + 1.3, sz * (ARENA - 0.6))); }
  const _v = new THREE.Vector3();
  function fitCamera() {
    const topPx = uiTop + 100 * U, botPx = uiTop + 160 * U, side = 6;
    const ndcTop = 1 - 2 * topPx / vh, ndcBot = -1 + 2 * botPx / vh;
    const ndcL = -1 + 2 * side / vw, ndcR = 1 - 2 * side / vw;
    camera.aspect = vw / vh;
    const pitch = THREE.MathUtils.degToRad(vw / vh < 0.8 ? 64 : 52);
    camDir.set(0, Math.sin(pitch), Math.cos(pitch));
    const cy = (ndcTop + ndcBot) / 2;
    camera.setViewOffset(vw, vh, 0, -cy * vh / 2, vw, vh);
    camera.updateProjectionMatrix();
    const fits = D => {
      camera.position.copy(camBase).addScaledVector(camDir, D); camera.lookAt(camBase); camera.updateMatrixWorld();
      for (const p of fitPts) {
        _v.copy(p).project(camera);
        if (_v.x < ndcL || _v.x > ndcR || _v.y > ndcTop || _v.y < ndcBot) return false;
      }
      return true;
    };
    let lo = 12, hi = 220;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    camDist = hi * 1.02;
    scene.fog.near = camDist * 0.95; scene.fog.far = camDist * 0.95 + 90;
  }
  let shakeT = 0;
  function updateCamera(dt, g, time) {
    // 내 UFO 쪽으로 아주 조금 따라감 (경기장 전체는 계속 보이도록)
    const me = g && g.ufos[0] && g.ufos[0].ctrl === 'player' ? g.ufos[0].body.position : null;
    const fx = me ? me.x * 0.07 : Math.sin(time * 0.1) * 0.8, fz = me ? me.z * 0.05 : 0;
    camFollow.x += (fx - camFollow.x) * Math.min(1, dt * 2); camFollow.z += (fz - camFollow.z) * Math.min(1, dt * 2);
    camLook.set(camBase.x + camFollow.x, 0, camBase.z + camFollow.z);
    camera.position.copy(camLook).addScaledVector(camDir, camDist);
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      camera.position.x += (Math.random() - 0.5) * shakeT * 1.2;
      camera.position.y += (Math.random() - 0.5) * shakeT * 1.2;
    }
    camera.lookAt(camLook);
    Sound.listener.x = me ? me.x : 0; Sound.listener.z = me ? me.z : 0;
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
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(vw, vh); }
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
      <div class="qlabel">화질 <span id="qNow"></span></div>
      <div class="quals"><button data-q="auto">자동</button><button data-q="low">저</button><button data-q="medium">중</button><button data-q="high">고</button></div>
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
    <div id="toast" class="toast hidden"></div>
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
  function refreshQualityUI() {
    document.querySelectorAll('.quals button').forEach(b => b.classList.toggle('on', b.dataset.q === qSetting));
    const el = $('qNow'); if (el) el.textContent = qSetting === 'auto' ? '(지금: ' + QUALITY[qLevel].label + ')' : '';
  }
  function refreshSound() { $('soundBtn').textContent = Sound.on ? '🔊' : '🔇'; }
  refreshTitle(); refreshSound();
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.add('hidden'), 2600);
  }

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
  let timeScale = 1, slowT = 0;
  function slowmo(dur) { if (slowT <= 0) Sound.play('slowmo'); slowT = Math.max(slowT, dur); }
  function newDemo() { clearDynamic(); demo = createGame('versus', 'normal', null, true); demo.phase = 'play'; demo.countdown = 0; }
  function startGame(mode) {
    clearDynamic(); demo = null;
    game = createGame(mode, diff);
    screen = 'game'; slowT = 0; timeScale = 1;
    show('title', false); show('result', false); show('hud', true);
    $('chips').innerHTML = mode === 'versus' ? CHARS.map((c, i) => `<div class="chip" style="--c:${c.color}"><span>${i === 0 ? '나' : c.name}</span><b id="chip${i}">0</b></div>`).join('') : '';
    $('chips').classList.toggle('hidden', mode !== 'versus');
    $('hint').classList.toggle('hidden', mode === 'versus');
    $('hRightL').textContent = mode === 'versus' ? '지금 순위' : '최고';
    zoneMeshes.forEach((z, i) => { z.visible = mode === 'versus' || i === 0; });
    fps.reset();
    inputReset();
  }
  function goTitle() {
    screen = 'title'; game = null; Sound.stopBgm(); Sound.beamHum(false);
    show('hud', false); show('result', false); show('title', true);
    zoneMeshes.forEach(z => { z.visible = true; });
    refreshTitle(); refreshQualityUI(); newDemo();
  }
  function onOver(g) {
    Sound.stopBgm(); Sound.beamHum(false);
    slowT = 0;
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
        case 'attach': {
          const pos = { x: e.x, z: e.z };
          Sound.play(e.kind === 'silver' ? 'clink' : 'clinkGold', { pos });
          burst3(e.x, e.y, e.z, e.kind === 'silver' ? 7 : 16, e.kind === 'silver' ? ['#9effd6', '#ffffff'] : ['#ffd23f', '#fff6b0'], 2.5, 0.5, 4, 0.3);
          if (e.kind === 'rainbow' && e.u === 0) { slowmo(0.9); burst3(e.x, e.y, e.z, 40, ['#ff5f6d', '#ffc23c', '#3fcf6b', '#4aa8ff', '#a58bff'], 6, 2); }
          break;
        }
        case 'deposit': {
          const c = CHARS[e.u];
          Sound.play('deposit', { n: e.n, pos: { x: e.x, z: e.z } });
          burst3(e.x, 1.2, e.z, 34, [c.color, '#ffffff', '#fff6b0'], 6, 4);
          popup3(e.x, UFO_Y + 1.6, e.z, '+' + e.v, e.u === 0 ? '#ffb347' : c.color, e.u === 0 ? 38 : 26);
          if (e.u === 0 && e.v >= 12) slowmo(0.6);
          break;
        }
        case 'bump': {
          const me = e.a === 0 || e.b === 0;
          Sound.play('bump', { pos: { x: e.x, z: e.z } });
          if (e.lostA + e.lostB > 0) Sound.play('scatter', { pos: { x: e.x, z: e.z } });
          burst3(e.x, UFO_Y, e.z, 26, ['#ffffff', '#ffe27a', '#ff8a3d', '#8fd8ff'], 8, 1, 6, 0.35);
          popup3(e.x, UFO_Y + 1.2, e.z, e.lostA + e.lostB > 0 ? '쿵! 와르르' : '쿵!', '#ffffff', me ? 28 : 20);
          if (me) { shakeT = 0.4; if (e.v > 6) slowmo(0.55); }
          break;
        }
        case 'rainbow': Sound.play('rainbow'); centerText('<span class="rb">무지개 구슬 등장!</span>', 'small', 1400); break;
        case 'beep': Sound.play('beep'); centerText(String(Math.ceil(g.countdown)), 'count', 900); break;
        case 'go': Sound.play('go'); Sound.startBgm(); centerText('납치 시작!', 'go', 900); break;
        case 'tick': Sound.play('tick'); break;
        case 'timeup': Sound.play('timeup'); Sound.stopBgm(); Sound.beamHum(false); centerText('그만!', 'go', 1300); slowT = 0; break;
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
  document.querySelectorAll('.quals button').forEach(b => b.onclick = () => {
    Sound.ensure(); Sound.play('click');
    qSetting = b.dataset.q; Store.set('quality', qSetting);
    qLevel = qSetting === 'auto' ? autoQuality() : qSetting;
    Store.set('autoQ', null);
    applyQuality();
  });
  $('soundBtn').onclick = () => { Sound.ensure(); Sound.setOn(!Sound.on); refreshSound(); if (!Sound.on) { Sound.stopBgm(); Sound.beamHum(false); } else if (screen === 'game' && game && game.phase === 'play') Sound.startBgm(); };

  let hidden = false;
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden) { Sound.stopBgm(); Sound.beamHum(false); inputReset(); }
    else if (screen === 'game' && game && game.phase === 'play') Sound.startBgm();
  });

  /* ---------- 프레임 감시: 자동 화질일 때 느리면 한 단계 낮춤 ---------- */
  const fps = {
    acc: 0, n: 0, t: 0,
    reset() { this.acc = 0; this.n = 0; this.t = 0; },
    tick(dt) {
      if (qSetting !== 'auto' || qLevel === 'low' || screen !== 'game') return;
      this.t += dt; this.acc += dt; this.n++;
      if (this.t < 4) return;
      const avg = this.n / this.acc;
      this.reset();
      if (avg < 36) {
        qLevel = qLevel === 'high' ? 'medium' : 'low';
        Store.set('autoQ', qLevel);
        applyQuality();
        toast('화면이 버벅여서 화질을 \'' + QUALITY[qLevel].label + '\'으로 자동 조정했어요');
      }
    }
  };

  /* ---------- 장면 동기화 ---------- */
  const _q = new THREE.Quaternion();
  function syncScene(g, time, dt) {
    const Q = QUALITY[qLevel];
    ufoMeshes.forEach((m, i) => {
      const u = g.ufos[i];
      const vis = !!u;
      m.grp.visible = vis; m.gRing.visible = vis;
      grassU.uUfo.value[i].set(999, 999, 0, 0);
      if (!vis) { m.spot.intensity = 0; return; }
      const p = u.body.position, v = u.body.velocity, S = m.vs;
      // 호버링 스프링: 무게만큼 내려앉고, 가속·짐 쏠림에 따라 기울었다가 출렁이며 복원
      const dts = Math.min(dt, 0.05);
      const ax = (v.x - S.pvx) / Math.max(dts, 1e-3), az = (v.z - S.pvz) / Math.max(dts, 1e-3);
      S.pvx = v.x; S.pvz = v.z;
      let comx = 0, comz = 0, mass = 0;
      for (const o of u.carry) { comx += (o.body.position.x - p.x) * o.m; comz += (o.body.position.z - p.z) * o.m; mass += o.m; }
      if (mass) { comx /= mass; comz /= mass; }
      const ty = -0.05 * mass + Math.sin(time * 2.6 + i) * 0.07;
      const trx = clamp(v.z * 0.028 + az * 0.006 + comz * 0.09, -0.4, 0.4);
      const trz = clamp(-(v.x * 0.028 + ax * 0.006 + comx * 0.09), -0.4, 0.4);
      S.vy += (60 * (ty - S.y) - 7 * S.vy) * dts; S.y += S.vy * dts;
      S.vrx += (55 * (trx - S.rx) - 6 * S.vrx) * dts; S.rx += S.vrx * dts;
      S.vrz += (55 * (trz - S.rz) - 6 * S.vrz) * dts; S.rz += S.vrz * dts;
      m.grp.position.set(p.x, p.y + S.y, p.z);
      m.body.rotation.set(S.rx, 0, S.rz);
      m.engine.rotation.y = time * (3 + mass * 0.3);
      m.lights.forEach((l, k) => l.material.color.setHex(((k + Math.floor(time * 9)) % 4 === 0) ? CHARS[i].hex : 0xfff3a0).multiplyScalar(2.4));
      // 눈 깜빡임
      S.blink -= dt;
      const bl = S.blink < 0 ? 0.15 : 1; if (S.blink < -0.12) S.blink = 2 + Math.random() * 3;
      m.eyes.forEach(e => { e.scale.y = bl; });
      // 빔
      S.beam += ((u.beam ? 1 : 0) - S.beam) * Math.min(1, dt * 10);
      m.beamU.uTime.value = time;
      m.beamU.uOp.value = S.beam * 0.42; m.coreU.uOp.value = S.beam * 0.35;
      m.beam.visible = m.core.visible = S.beam > 0.01;
      m.magGlowMat.color.setHex(0x7dffb6).multiplyScalar(0.2 + S.beam * 2.4);
      m.spot.intensity = Q.spots ? (2.2 + S.beam * 9) : 0;
      m.spot.color.setHex(u.beam ? 0xb6ffd8 : 0xe6f2ff);
      m.gRing.position.set(p.x, terrainH(p.x, p.z) + 0.07, p.z);
      m.ringMat.opacity = (u.beam ? 0.85 : 0.35) * (Q.spots ? 0.7 : 1);
      grassU.uUfo.value[i].set(p.x, p.z, S.beam, 1);
      if (Q.motes && S.beam > 0.5 && Math.random() < dt * 40) mote(p.x, p.z);
    });
    // 구슬
    const alive = new Set();
    for (const o of g.orbs) {
      if (o.dead) continue;
      alive.add(o.id);
      let m = orbMeshes.get(o.id);
      if (!m) { m = new THREE.Mesh(orbGeo[o.kind], orbMat[o.kind]); m.castShadow = true; m.receiveShadow = true; scene.add(m); orbMeshes.set(o.id, m); }
      m.position.copy(o.body.position); m.quaternion.copy(o.body.quaternion);
    }
    for (const [id, m] of orbMeshes) if (!alive.has(id)) { scene.remove(m); orbMeshes.delete(id); }
    let na = 0;
    for (const o of g.orbs) {
      if (o.dead || na >= AO_MAX) continue;
      const p = o.body.position, gh = terrainH(p.x, p.z), hgt = p.y - o.r - gh;
      if (hgt > 1.5) continue;
      const k = 1 - hgt / 1.5, sz = o.r * (2.6 + (1 - k) * 1.5);
      _p3.set(p.x, gh + 0.03, p.z); _s3.set(sz, 1, sz * 0.92);
      _m4.compose(_p3, _q0, _s3); aoMesh.setMatrixAt(na++, _m4);
    }
    aoMesh.count = na; aoMesh.instanceMatrix.needsUpdate = true;
    orbMat.rainbow.emissive.setHSL((time * 0.4) % 1, 1, 0.5);
    orbMat.rainbow.color.setHSL((time * 0.4 + 0.5) % 1, 0.8, 0.7);
    // 자기장 줄
    let n = 0;
    for (const u of g.ufos) for (const o of u.carry) {
      const a = o.parent ? o.parent.body.position : null, up = u.body.position, sl = SLOTS[Math.max(0, o.slot)];
      const ax = a ? a.x : up.x + sl.x, ay = a ? a.y : up.y + sl.y, az = a ? a.z : up.z + sl.z;
      const b = o.body.position;
      tetherPos.set([ax, ay, az, b.x, b.y, b.z], n * 6); n++;
      if (n >= tetherPos.length / 6) break;
    }
    tetherGeo.setDrawRange(0, n * 2);
    tetherGeo.attributes.position.needsUpdate = true;
    tethers.material.opacity = 0.55 + Math.sin(time * 20) * 0.25;
    // 구역
    zoneMeshes.forEach((z, i) => {
      z.userData.arrow.position.y = 6.2 + Math.sin(time * 3 + i) * 0.3;
      z.userData.arrow.rotation.y = time * 1.5;
      const u = g.ufos[i];
      z.userData.colMat.uniforms.uTime.value = time;
      z.userData.colMat.uniforms.uOp.value = u && u.carry.length ? 0.5 + Math.sin(time * 6) * 0.15 : 0.22;
    });
  }
  function updateParticles(dt) {
    let w = 0;
    for (const p of parts) {
      p.t += dt; if (p.t > p.life) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= p.g * dt;
      const f = 1 - p.t / p.life;
      pPos[w * 3] = p.x; pPos[w * 3 + 1] = p.y; pPos[w * 3 + 2] = p.z;
      pCol[w * 3] = p.r * f; pCol[w * 3 + 1] = p.gg * f; pCol[w * 3 + 2] = p.b * f;
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
    fireflies.pts.material.opacity = 0.55 + Math.sin(time * 3) * 0.35;
  }
  let lastHud = '';
  function updateHUD(g) {
    const me = g.ufos[0];
    const tl = g.phase === 'countdown' ? GAME_TIME : g.timeLeft;
    const ring = $('tRing');
    ring.style.strokeDashoffset = String(201 * (1 - tl / GAME_TIME));
    ring.classList.toggle('warn', tl <= 5);
    const key = me.score + '|' + Math.ceil(tl) + '|' + g.ufos.map(u => u.score + ':' + u.carry.length).join(',') + '|' + me.carry.map(o => o.kind[0]).join('');
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
    fps.tick(dt);
    // 슬로모션
    if (slowT > 0) { slowT = Math.max(0, slowT - dt); timeScale += (0.28 - timeScale) * Math.min(1, dt * 12); }
    else timeScale += (1 - timeScale) * Math.min(1, dt * 5);
    const gdt = dt * timeScale;
    clock += gdt;
    const g = screen === 'title' ? demo : (screen === 'game' ? game : result && result.g);
    if (g && (screen === 'game' || screen === 'title')) {
      acc += gdt; let steps = 0;
      while (acc >= FIXED && steps < 5) { step(g, FIXED); acc -= FIXED; steps++; }
      if (steps === 5) acc = 0;
      handleEvents(g, screen === 'title');
      if (screen === 'title' && (g.phase !== 'play' || g.elapsed > 27)) newDemo();
    } else if (g && screen === 'result') {
      acc += gdt; while (acc >= FIXED) { g.world.step(FIXED); for (const u of g.ufos) { u.body.position.y = UFO_Y; u.body.velocity.y = 0; u.body.velocity.x *= 0.95; u.body.velocity.z *= 0.95; u.beam = false; } acc -= FIXED; }
    }
    if (screen === 'game' && game) {
      const me = game.ufos[0];
      Sound.beamHum(me.beam && game.phase === 'play', me.body.position.x);
      updateHUD(game);
    }
    const cur = screen === 'title' ? demo : screen === 'game' ? game : result && result.g;
    if (cur) syncScene(cur, clock, gdt);
    grassU.uTime.value = clock;
    starU.uTime.value = clock;
    updateParticles(gdt);
    updateFireflies(clock);
    updateCamera(dt, cur, clock);
    if (composer) {
      gradePass.uniforms.uTime.value = clock;
      gradePass.uniforms.uSlow.value = clamp((1 - timeScale) / 0.72, 0, 1);
      composer.render(dt);
    } else renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  resize();
  applyQuality();
  newDemo();
  const go = () => requestAnimationFrame(frame);
  if (document.fonts && document.fonts.load) Promise.race([document.fonts.load('40px "Jua"'), new Promise(r => setTimeout(r, 1500))]).then(go, go);
  else go();
}

return Core;
}
})();
