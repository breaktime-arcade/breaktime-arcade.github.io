// =============================================================
//  AI 운전자: 경로점 추종 + 곡률 기반 속도 계획 + 추월/부스터/복귀
// =============================================================
import { G } from './physics.js';

export const DIFFICULTY = {
  easy:   { name: '쉬움',   corner: 0.64, throttle: 0.78, mistake: 0.22, boostDelay: 2.5, steerGain: 1.9 },
  normal: { name: '보통',   corner: 0.8,  throttle: 0.91, mistake: 0.10, boostDelay: 1.0, steerGain: 2.2 },
  hard:   { name: '어려움', corner: 0.97, throttle: 1.0,  mistake: 0.03, boostDelay: 0.2, steerGain: 2.5 },
};

export class AIDriver {
  constructor(car, track, diffKey, seed = 0) {
    this.car = car;
    this.track = track;
    this.d = DIFFICULTY[diffKey];
    this.rng = mulberry(seed * 977 + 13);
    this.bias = (this.rng() - 0.5) * 4;          // 선호 차선
    this.skill = 1 + (this.rng() - 0.5) * 0.06;   // 개인차
    this.drifter = car.p.driftCharge > 3;
    this.idx = track.nearestIndex(car.x, car.z);
    this.offset = this.bias;
    this.stuckT = 0; this.reverseT = 0; this.mistakeT = 0;
    this.boostWait = 0;
    this.rubber = 1;
    // 부스터를 쓸 "직선" 기준: 트랙 곡률 하위 45% 수준
    const sorted = track.curv.map(Math.abs).sort((a, b) => a - b);
    this.straightK = Math.max(0.015, Math.min(0.035, sorted[Math.floor(sorted.length * 0.45)] * 1.4));
  }

  // 앞쪽 구간의 곡률·노면을 보고 허용 속도 계산
  allowedSpeed(spd) {
    const t = this.track, N = t.N;
    const latAcc = this.car.p.grip * G * this.d.corner * this.skill;
    const decel = 15;
    let allow = 99;
    const horizon = Math.min(70, Math.floor((spd * spd / (2 * decel) + 12) / t.segLen));
    for (let k = 2; k <= horizon; k += 2) {
      const j = (this.idx + k) % N;
      const kap = Math.abs(t.curv[j]) + 1e-4;
      let grip = 1;
      const p = t.samples[j];
      const zn = t.surfaceAt(p.x + t.lefts[j].x * this.offset, p.z + t.lefts[j].z * this.offset);
      if (zn) grip = Math.min(1, zn.grip + 0.15);
      const vj = Math.sqrt(latAcc * grip / kap);
      const dist = k * t.segLen;
      allow = Math.min(allow, Math.sqrt(vj * vj + 2 * decel * dist));
    }
    return allow;
  }

  update(dt, others, playerAhead) {
    const car = this.car, t = this.track, N = t.N;
    const inp = car.input;
    this.idx = t.nearestIndex(car.x, car.z, this.idx);
    const spd = car.speed;

    if (car.frozen) { inp.throttle = 0; inp.steer = 0; inp.brake = 0; return; }

    // --- 목표 차선 (안쪽으로 파고드는 레이싱 라인 + 개인 차선) ---
    let ahead = 0;
    for (let k = 6; k <= 22; k += 2) ahead += t.curv[(this.idx + k) % N];
    ahead /= 9;
    const apex = Math.sign(ahead) * Math.min(1, Math.abs(ahead) * 28) * (t.halfW - 2.6);
    let target = apex * 0.8 + this.bias * (1 - Math.min(1, Math.abs(ahead) * 28));

    // 앞차 피하기 / 추월
    for (const o of others) {
      if (o === car) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const along = dx * car.fwdX + dz * car.fwdZ;
      if (along < 0 || along > 14) continue;
      const myLat = t.lateral(this.idx, car.x, car.z);
      const oIdx = t.nearestIndex(o.x, o.z, this.idx);
      const oLat = t.lateral(oIdx, o.x, o.z);
      if (Math.abs(oLat - target) < 2.6 && o.speed < spd + 2) {
        const dir = oLat > myLat ? -1 : 1;
        let alt = oLat + dir * 3.4;
        if (Math.abs(alt) > t.halfW - 1.8) alt = oLat - dir * 3.4;
        target = alt;
      }
    }
    target = Math.max(-(t.halfW - 1.8), Math.min(t.halfW - 1.8, target));
    this.offset += (target - this.offset) * Math.min(1, dt * 1.8);

    // 실수: 가끔 라인이 흔들림
    if (this.mistakeT > 0) this.mistakeT -= dt;
    else if (this.rng() < this.d.mistake * dt * 0.4) this.mistakeT = 0.6 + this.rng() * 0.6;
    const wobble = this.mistakeT > 0 ? Math.sin(this.mistakeT * 9) * 0.6 : 0;

    // --- 조향: 전방 목표점 ---
    const look = 6 + spd * 0.42;
    const li = (this.idx + Math.round(look / t.segLen)) % N;
    const tp = t.pointAt(li, this.offset);
    const desired = Math.atan2(tp.x - car.x, tp.z - car.z);
    let err = desired - car.angle; err = Math.atan2(Math.sin(err), Math.cos(err));
    let steer = err * this.d.steerGain - car.av * 0.12 + wobble;

    // --- 속도 계획 ---
    const allow = this.allowedSpeed(spd) * this.rubber;
    let throttle = 0, brake = 0;
    if (spd < allow - 0.5) throttle = this.d.throttle;
    else if (spd > allow + 1.2) brake = Math.min(1, (spd - allow) / 6);
    // 방향이 크게 틀어졌으면 감속
    if (Math.abs(err) > 0.9 && spd > 8) { throttle = 0; brake = 0.5; }

    // 드리프트형: 급커브 진입에서 살짝 드리프트
    let drift = false;
    if (this.drifter && Math.abs(ahead) > 0.022 && spd > 17 && Math.abs(err) > 0.12) drift = true;

    // --- 부스터: 직선에서 사용 ---
    let boost = false;
    if (car.boostGauge >= 1) {
      this.boostWait += dt;
      let maxK = 0;
      for (let k = 4; k < 60; k += 3) maxK = Math.max(maxK, Math.abs(t.curv[(this.idx + k) % N]));
      if (this.boostWait > this.d.boostDelay && maxK < this.straightK && Math.abs(err) < 0.15) { boost = true; this.boostWait = 0; }
    }

    // --- 끼임 복구 ---
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      throttle = 0; brake = 1; steer = -Math.sign(err || 1);
    } else if (spd < 1.5 && throttle > 0) {
      this.stuckT += dt;
      if (this.stuckT > 1.2) { this.reverseT = 1.0; this.stuckT = 0; }
    } else this.stuckT = Math.max(0, this.stuckT - dt);

    inp.steer = Math.max(-1, Math.min(1, steer));
    inp.throttle = throttle;
    inp.brake = brake;
    inp.drift = drift;
    inp.boost = boost;
  }
}

function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
