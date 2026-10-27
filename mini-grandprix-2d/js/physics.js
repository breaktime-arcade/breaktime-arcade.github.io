// =============================================================
//  미니카 그랑프리 2D - 물리 엔진 (3D 버전과 동일, 일반 스크립트용)
//  - 지면(x,z) 위의 2D 강체 + 높이는 연출용
//  - 자동차: 자전거 모델 타이어(슬립각 → 횡력, 접지 한계)
//  - 충돌: 원형 충돌체 + 충격량(회전 포함) + 위치 보정
// =============================================================

const G = 9.8;

// 자동차 기본 성능값 (튜닝 패널에서 바뀜)
const CAR_DEFAULTS = {
  mass: 1.0,          // 질량 (게임 단위)
  engine: 17,         // 엔진 가속력 (m/s²)
  reverse: 9,         // 후진 가속력
  brake: 26,          // 브레이크 감속력
  drag: 0.012,        // 공기저항 계수 (v²)
  rolling: 0.25,      // 구름저항 (v)
  grip: 1.55,         // 타이어 마찰계수 μ
  driftGrip: 0.42,    // 드리프트 시 뒷바퀴 접지 비율
  stiffFront: 70,     // 앞바퀴 코너링 강성
  stiffRear: 78,      // 뒷바퀴 코너링 강성
  maxSteer: 0.52,     // 최대 조향각 (rad)
  steerSpeed: 4.2,    // 조향 속도 (rad/s)
  wheelBase: 2.4,     // 축간 거리
  restitution: 0.35,  // 반발계수 (충돌 탄성)
  boostThrust: 1.6,   // 부스터 중 엔진 배율
  boostDrag: 0.9,     // 부스터 중 공기저항 배율 → 최고속도 약 +40%
  boostTime: 2.0,     // 부스터 지속 시간 (초)
  chargeTime: 8,      // 게이지 100% 충전 시간 (초)
};

// 차종 4가지 (계획서 기준)
const CAR_TYPES = {
  light:   { name: '번개', desc: '가볍고 가속이 빨라요', mass: 0.75, engine: 19.5, grip: 1.5, maxSteer: 0.55, drag: 0.0125 },
  heavy:   { name: '불도저', desc: '무거워서 잘 밀어내요', mass: 1.7, engine: 15.5, grip: 1.6, maxSteer: 0.48, drag: 0.0118, restitution: 0.25 },
  balance: { name: '씽씽', desc: '모든 능력이 고르게 좋아요', mass: 1.0 },
  drift:   { name: '미끄럼', desc: '드리프트로 게이지를 빨리 채워요', mass: 0.95, engine: 16.5, driftGrip: 0.34, stiffRear: 70, maxSteer: 0.6, driftCharge: 3.2 },
};

// ---------- 2D 벡터 도우미 ----------
const dot = (ax, az, bx, bz) => ax * bx + az * bz;
const cross = (rx, rz, nx, nz) => rz * nx - rx * nz; // (r × n).y

// -------------------------------------------------------------
//  강체 공통
// -------------------------------------------------------------
class Body {
  constructor({ x = 0, z = 0, angle = 0, mass = 1, inertia = 1, colliders = [], isStatic = false }) {
    this.x = x; this.z = z;
    this.vx = 0; this.vz = 0;
    this.angle = angle;      // 진행 방향: forward = (sin a, cos a)
    this.av = 0;             // 각속도 (+ = 왼쪽 회전)
    this.mass = mass;
    this.invMass = isStatic ? 0 : 1 / mass;
    this.invInertia = isStatic || !isFinite(inertia) ? 0 : 1 / inertia;
    this.colliders = colliders; // [{ox(좌측축), oz(전방축), r}]
    this.fx = 0; this.fz = 0; this.torque = 0;
    this.cMul = 1;           // 충돌 시 질량 배율 (부스터 중 더 세게 밀어냄)
    this.bouncy = 0;         // 0보다 크면 이 물체와의 충돌 반발계수 (젤리 범퍼 등)
    this.lastImpact = 0;     // 직전 스텝의 최대 충돌 세기 (효과용)
    this.impactX = 0; this.impactZ = 0;
    this.kind = 'body';
  }
  get fwdX() { return Math.sin(this.angle); }
  get fwdZ() { return Math.cos(this.angle); }
  get leftX() { return Math.cos(this.angle); }
  get leftZ() { return -Math.sin(this.angle); }

  // 충돌 원의 월드 좌표
  colliderWorld(c) {
    const s = Math.sin(this.angle), co = Math.cos(this.angle);
    // 로컬(ox: 왼쪽, oz: 앞) → 월드
    return { x: this.x + c.ox * co + c.oz * s, z: this.z - c.ox * s + c.oz * co, r: c.r };
  }
  pointVel(rx, rz) { return { x: this.vx + this.av * rz, z: this.vz - this.av * rx }; }

  get cInvMass() { return this.invMass / this.cMul; }
  get cInvInertia() { return this.invInertia / this.cMul; }
  applyImpulse(jx, jz, rx, rz) {
    this.vx += jx * this.cInvMass;
    this.vz += jz * this.cInvMass;
    this.av += cross(rx, rz, jx, jz) * this.cInvInertia;
    if (this.av > 9) this.av = 9; else if (this.av < -9) this.av = -9; // 팽이처럼 도는 것 방지
  }
  integrate(dt) {
    this.vx += this.fx * this.invMass * dt;
    this.vz += this.fz * this.invMass * dt;
    this.av += this.torque * this.invInertia * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.angle += this.av * dt;
    this.fx = this.fz = this.torque = 0;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
}

// -------------------------------------------------------------
//  자동차
// -------------------------------------------------------------
class CarBody extends Body {
  constructor(opts = {}) {
    const p = { ...CAR_DEFAULTS, ...(opts.params || {}) };
    const L = 3.9, W = 1.9;
    super({
      x: opts.x, z: opts.z, angle: opts.angle,
      mass: p.mass,
      inertia: p.mass * (L * L + W * W) / 12,
      colliders: [
        { ox: 0, oz: 1.0, r: 0.95 },
        { ox: 0, oz: 0.0, r: 0.95 },
        { ox: 0, oz: -1.0, r: 0.95 },
      ],
    });
    this.kind = 'car';
    this.p = p;
    this.steer = 0;              // 현재 조향각
    this.input = { throttle: 0, brake: 0, steer: 0, drift: false };
    this.parked = !!opts.parked; // 주차 브레이크 (주인 없는 차)
    // 연출/효과용 출력값
    this.slipRear = 0; this.slipFront = 0;
    this.drifting = false;
    this.accLong = 0; this.accLat = 0;
    this.wheelSpin = 0;
    this.surfaceGrip = 1;        // 노면 마찰 배율 (빙판 등)
    this.surfaceDrag = 0;        // 노면 감속 (모래·초콜릿 등)
    // 부스터
    this.boostGauge = 0;         // 0 ~ 1
    this.boostLeft = 0;          // 남은 부스터 시간
    this.input.boost = false;
  }
  get boosting() { return this.boostLeft > 0; }
  // 게이지 충전 + 발동 (매 물리 스텝)
  updateBoost(dt) {
    const p = this.p;
    if (this.boostLeft > 0) {
      this.boostLeft = Math.max(0, this.boostLeft - dt);
    } else if (!this.frozen) {
      const rate = (this.drifting ? (p.driftCharge || 2.4) : 1) / p.chargeTime;
      if (this.speed > 3) this.boostGauge = Math.min(1, this.boostGauge + rate * dt);
      if (this.input.boost && this.boostGauge >= 1) {
        this.boostGauge = 0;
        this.boostLeft = p.boostTime;
        this.onBoost && this.onBoost(this);
      }
    }
    this.cMul = this.boostLeft > 0 ? 1.6 : 1;
  }
  setMass(m) {
    const L = 3.9, W = 1.9;
    this.mass = m; this.invMass = 1 / m;
    this.invInertia = 1 / (m * (L * L + W * W) / 12);
  }

  get vLong() { return dot(this.vx, this.vz, this.fwdX, this.fwdZ); }
  get vLat() { return dot(this.vx, this.vz, this.leftX, this.leftZ); }

  // 타이어 + 엔진 힘 계산
  computeForces(dt) {
    this.updateBoost(dt);
    const p = this.p, inp = this.input;
    const fX = this.fwdX, fZ = this.fwdZ, lX = this.leftX, lZ = this.leftZ;
    const vLong = this.vLong, vLat = this.vLat;
    const spd = Math.abs(vLong);

    // 조향: 속도가 빠를수록 최대 조향각을 줄여 안정성 확보
    const steerLimit = p.maxSteer * (1 / (1 + spd * 0.028));
    const target = inp.steer * steerLimit;
    const ds = p.steerSpeed * dt;
    this.steer += Math.max(-ds, Math.min(ds, target - this.steer));

    const a = p.wheelBase * 0.5, b = p.wheelBase * 0.5;
    const m = this.mass;
    const grip = p.grip * this.surfaceGrip;
    const nAxle = m * G * 0.5; // 축당 수직하중

    // 축 위치의 속도 (차체 좌표)
    const vFlong = vLong, vFlat = vLat + this.av * a;
    const vRlong = vLong, vRlat = vLat - this.av * b;

    // 앞바퀴: 조향각 만큼 돌린 좌표계
    const cs = Math.cos(this.steer), sn = Math.sin(this.steer);
    const wfLong = vFlong * cs + vFlat * sn;
    const wfLat = -vFlong * sn + vFlat * cs;

    // 저속에서 슬립각이 튀지 않도록 분모 하한
    const den = 2.5;
    const slipF = Math.atan2(wfLat, Math.max(Math.abs(wfLong), den));
    const slipR = Math.atan2(vRlat, Math.max(Math.abs(vRlong), den));

    // 드리프트(사이드 브레이크): 뒷바퀴 접지 감소
    const drift = inp.drift && spd > 4;
    const rearGripMul = drift ? p.driftGrip : 1;

    // 종방향 힘
    let fLong = 0;
    const boosting = this.boostLeft > 0;
    if (boosting) {
      fLong += p.engine * p.boostThrust * m; // 부스터는 가속키 없이도 밀어줌
    } else if (inp.throttle > 0) {
      fLong += inp.throttle * p.engine * m * (drift ? 0.8 : 1);
    }
    if (inp.brake > 0) {
      if (vLong > 0.6) fLong -= inp.brake * p.brake * m;
      else fLong -= inp.brake * p.reverse * m; // 후진
    }
    if (inp.throttle > 0 && vLong < -0.6) fLong += p.brake * m * 0.6; // 후진 중 전진키 = 제동
    fLong -= p.drag * (boosting ? p.boostDrag : 1) * vLong * Math.abs(vLong) * m;
    fLong -= (p.rolling + this.surfaceDrag) * vLong * m;
    if (this.frozen) fLong = -vLong * m * 8;   // 출발 전 대기
    else if (this.parked || (!boosting && inp.throttle === 0 && inp.brake === 0 && spd < 0.8)) {
      // 정지 상태 유지 (주차 브레이크)
      fLong = -vLong * m * 8;
    }
    if (drift) fLong -= vLong * m * 0.35; // 미끄러지며 감속

    // 뒷바퀴는 구동력을 쓰는 만큼 옆 접지가 줄어듦 (마찰원)
    const maxR = grip * nAxle * rearGripMul;
    const usedLong = Math.min(Math.abs(fLong) * 0.22, maxR * 0.9);
    const latMaxR = Math.sqrt(Math.max(maxR * maxR - usedLong * usedLong, 0));
    const maxF = grip * nAxle;

    let fyF = -p.stiffFront * slipF * nAxle / (G * 0.5);
    let fyR = -p.stiffRear * slipR * nAxle / (G * 0.5) * (drift ? 0.7 : 1);
    fyF = Math.max(-maxF, Math.min(maxF, fyF));
    fyR = Math.max(-latMaxR, Math.min(latMaxR, fyR));

    // 앞바퀴 횡력 방향 = 바퀴 좌측축 (-sinδ·f + cosδ·l)
    const lwX = -sn * fX + cs * lX, lwZ = -sn * fZ + cs * lZ;

    this.fx += fLong * fX + fyF * lwX + fyR * lX;
    this.fz += fLong * fZ + fyF * lwZ + fyR * lZ;
    this.torque += a * fyF * cs - b * fyR;

    // 주행 안정 보조 (아케이드 감각): 차체 미끄럼각이 한계를 넘으면 회전을 억제
    const beta = Math.atan2(vLat, Math.max(Math.abs(vLong), 1));
    const betaMax = drift ? 0.85 : 0.32;
    if (spd > 3 && Math.abs(beta) > betaMax && beta * this.av < 0) {
      const over = Math.min((Math.abs(beta) - betaMax) * 4, 1);
      this.torque -= this.av * (6 + 18 * over) / this.invInertia;
    }
    // 최대 회전속도 제한
    const yawMax = (grip * G * (drift ? 1.9 : 1.35)) / Math.max(spd, 4);
    if (Math.abs(this.av) > yawMax) {
      this.torque -= (this.av - Math.sign(this.av) * yawMax) * 10 / this.invInertia;
    }
    // 드리프트 중: 속도 방향을 차 머리 쪽으로 서서히 끌어당김 (코너 탈출 가속감)
    if (drift && (inp.throttle > 0 || boosting)) {
      this.fx += -vLat * lX * m * 0.9;
      this.fz += -vLat * lZ * m * 0.9;
    }

    // 저속 회전 감쇠 (제자리 빙글빙글 방지)
    if (spd < 3) this.torque -= this.av * (3 - spd) * 0.6 / this.invInertia;

    // 출력값
    this.slipFront = slipF;
    this.slipRear = slipR;
    this.drifting = Math.abs(slipR) > 0.2 && spd > 6;
    const accLong = fLong / m, accLat = (fyF * cs + fyR) / m;
    this.accLong += (accLong - this.accLong) * Math.min(1, dt * 6);
    this.accLat += (accLat - this.accLat) * Math.min(1, dt * 6);
    this.wheelSpin += vLong * dt / 0.42;
  }
}

// -------------------------------------------------------------
//  가벼운 소품 (라바콘, 통 등) — 바닥 마찰로 미끄러짐
// -------------------------------------------------------------
class PropBody extends Body {
  constructor({ x, z, r = 0.38, mass = 0.07, friction = 6 }) {
    super({ x, z, mass, inertia: mass * r * r * 0.5, colliders: [{ ox: 0, oz: 0, r }] });
    this.kind = 'prop';
    this.friction = friction;
    this.tip = 0;      // 넘어짐 정도 (연출)
    this.tipDir = 0;
    this.spinVis = 0;
  }
  computeForces(dt) {
    const s = this.speed;
    if (s > 0.001) {
      const dec = Math.min(s, this.friction * dt);
      this.vx -= this.vx / s * dec;
      this.vz -= this.vz / s * dec;
    }
    this.av *= Math.max(0, 1 - dt * 3);
  }
}

// -------------------------------------------------------------
//  벽: 선분 목록 + 격자 공간분할
// -------------------------------------------------------------
class WallSet {
  constructor(cell = 8) { this.segs = []; this.cell = cell; this.grid = new Map(); }
  addPolyline(pts, closed = true, bounce = 0) {
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      this.addSeg(a.x, a.z, b.x, b.z, bounce || a.bounce || 0);
    }
  }
  addSeg(ax, az, bx, bz, bounce = 0) {
    const s = { ax, az, bx, bz, bounce, id: this.segs.length };
    this.segs.push(s);
    const c = this.cell;
    const x0 = Math.floor(Math.min(ax, bx) / c) - 1, x1 = Math.floor(Math.max(ax, bx) / c) + 1;
    const z0 = Math.floor(Math.min(az, bz) / c) - 1, z1 = Math.floor(Math.max(az, bz) / c) + 1;
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = gx + ',' + gz;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(s);
    }
  }
  near(x, z) {
    return this.grid.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell)) || [];
  }
}

function closestOnSeg(px, pz, s) {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - s.ax) * dx + (pz - s.az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: s.ax + dx * t, z: s.az + dz * t };
}

// -------------------------------------------------------------
//  충돌 해결 (충격량 기반)
// -------------------------------------------------------------
function resolveContact(A, B, cx, cz, nx, nz, pen, e, mu, out) {
  // n: B → A 방향. B가 null이면 고정 벽
  const rAx = cx - A.x, rAz = cz - A.z;
  const rBx = B ? cx - B.x : 0, rBz = B ? cz - B.z : 0;
  const vA = A.pointVel(rAx, rAz);
  const vB = B ? B.pointVel(rBx, rBz) : { x: 0, z: 0 };
  const rvx = vA.x - vB.x, rvz = vA.z - vB.z;
  const vn = rvx * nx + rvz * nz;

  // 위치 보정 (겹침 해소)
  const invA = A.cInvMass, invB = B ? B.cInvMass : 0;
  const sum = invA + invB;
  if (sum > 0 && pen > 0) {
    const corr = Math.max(pen - 0.005, 0) / sum * 0.9;
    A.x += nx * corr * invA; A.z += nz * corr * invA;
    if (B) { B.x -= nx * corr * invB; B.z -= nz * corr * invB; }
  }
  if (vn >= 0) return 0;

  const rnA = cross(rAx, rAz, nx, nz), rnB = cross(rBx, rBz, nx, nz);
  const k = invA + invB + rnA * rnA * A.cInvInertia + (B ? rnB * rnB * B.cInvInertia : 0);
  // 아주 느린 접촉은 튕기지 않게
  const eff = Math.abs(vn) < 1.0 ? 0 : e;
  // 충격량 상한: 차가 날아가는 과민 반응 방지
  const j = Math.min(-(1 + eff) * vn / k, 45);
  A.applyImpulse(j * nx, j * nz, rAx, rAz);
  if (B) B.applyImpulse(-j * nx, -j * nz, rBx, rBz);

  // 마찰 충격량 (접선 방향)
  const tx = -nz, tz = nx;
  const vA2 = A.pointVel(rAx, rAz);
  const vB2 = B ? B.pointVel(rBx, rBz) : { x: 0, z: 0 };
  const vt = (vA2.x - vB2.x) * tx + (vA2.z - vB2.z) * tz;
  const rtA = cross(rAx, rAz, tx, tz), rtB = cross(rBx, rBz, tx, tz);
  const kt = invA + invB + rtA * rtA * A.cInvInertia + (B ? rtB * rtB * B.cInvInertia : 0);
  let jt = -vt / kt;
  jt = Math.max(-mu * j, Math.min(mu * j, jt));
  A.applyImpulse(jt * tx, jt * tz, rAx, rAz);
  if (B) B.applyImpulse(-jt * tx, -jt * tz, rBx, rBz);

  if (out) out.push({ x: cx, z: cz, nx, nz, impulse: j, vn: -vn, a: A, b: B });
  return j;
}

// -------------------------------------------------------------
//  월드
// -------------------------------------------------------------
class World {
  constructor() {
    this.bodies = [];
    this.walls = new WallSet();
    this.contacts = [];   // 이번 프레임의 충돌 기록 (효과/사운드용)
    this.wallRestitution = 0.3;
    this.wallFriction = 0.25;
  }
  add(b) { this.bodies.push(b); return b; }
  remove(b) { this.bodies = this.bodies.filter(x => x !== b); }

  step(dt) {
    for (const b of this.bodies) if (b.computeForces) b.computeForces(dt);
    for (const b of this.bodies) b.integrate(dt);
    // 충돌 반복 (안정성)
    for (let it = 0; it < 2; it++) {
      this.collideWalls(it === 0);
      this.collideBodies(it === 0);
    }
  }

  collideWalls(record) {
    const out = record ? this.contacts : null;
    for (const b of this.bodies) {
      if (b.invMass === 0) continue;
      const e = b.p ? b.p.restitution : this.wallRestitution;
      for (const c of b.colliders) {
        const w = b.colliderWorld(c);
        const segs = b.walls_cache = this.walls.near(w.x, w.z);
        let best = null;
        for (const s of segs) {
          const q = closestOnSeg(w.x, w.z, s);
          const dx = w.x - q.x, dz = w.z - q.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < w.r * w.r && (!best || d2 < best.d2)) best = { q, dx, dz, d2, s };
        }
        if (best) {
          const d = Math.sqrt(best.d2) || 1e-6;
          const nx = best.dx / d, nz = best.dz / d;
          const bounce = best.s.bounce;
          resolveContact(b, null, best.q.x, best.q.z, nx, nz, w.r - d,
            bounce || Math.min(e, this.wallRestitution + 0.05), bounce ? 0.05 : this.wallFriction, out);
        }
      }
    }
  }

  collideBodies(record) {
    const out = record ? this.contacts : null;
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const A = bs[i];
      for (let j = i + 1; j < bs.length; j++) {
        const B = bs[j];
        if (A.invMass === 0 && B.invMass === 0) continue;
        // 빠른 거리 컷
        const dxc = A.x - B.x, dzc = A.z - B.z;
        if (dxc * dxc + dzc * dzc > 64) continue;
        let best = null;
        for (const ca of A.colliders) {
          const wa = A.colliderWorld(ca);
          for (const cb of B.colliders) {
            const wb = B.colliderWorld(cb);
            const dx = wa.x - wb.x, dz = wa.z - wb.z;
            const rr = wa.r + wb.r;
            const d2 = dx * dx + dz * dz;
            if (d2 < rr * rr) {
              const pen = rr - Math.sqrt(d2);
              if (!best || pen > best.pen) best = { wa, wb, dx, dz, d2, pen };
            }
          }
        }
        if (best) {
          const d = Math.sqrt(best.d2) || 1e-6;
          const nx = best.dx / d, nz = best.dz / d;
          // 접촉점: 두 원 표면 사이
          const cx = best.wb.x + nx * (best.wb.r - best.pen * 0.5);
          const cz = best.wb.z + nz * (best.wb.r - best.pen * 0.5);
          let e = Math.min(A.p ? A.p.restitution : 0.5, B.p ? B.p.restitution : 0.5);
          if (A.bouncy || B.bouncy) e = Math.max(A.bouncy, B.bouncy);
          resolveContact(A, B, cx, cz, nx, nz, best.pen, e, 0.3, out);
        }
      }
    }
  }
}
