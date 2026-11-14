// 파도풀 안전요원 - 이용객 (절차 생성 인체 + 인스턴싱 렌더 + 행동)
import * as THREE from 'three';
import { POOL, LEG, waveH, groundY, depthAt, inPool, clamp, rand, pick } from './env.js';

const SKIN = ['#f3d6c1', '#eac4a5', '#dcae8a', '#c99470', '#ad7754', '#f6dfcd', '#e2b996'];
const HAIR = ['#1b1512', '#2a1f18', '#3b2a1f', '#5a3d26', '#141414', '#6b4a2e', '#2b2b2b', '#8a6b4a'];
const SUIT = ['#1d3f8f', '#111827', '#0e7c86', '#7a2e8f', '#e0457b', '#2f7d32', '#1c1c1c', '#b03a48', '#f2f2f2', '#4a90d9', '#ff8fab', '#355070', '#5e548e', '#264653'];
const VEST = ['#ff6a00', '#ffae00', '#ff8a1c'];
const TUBE = ['#ff4d6d', '#3a86ff', '#ffd23f', '#06d6a0', '#8338ec', '#00b4d8', '#f15bb5'];

const POSE_STANCE = {
  stand: 'stand', walk: 'stand', run: 'stand', wade: 'stand', cry: 'stand', push: 'stand', diveReady: 'stand', stagger: 'stand', carry: 'stand', standTube: 'stand', shove: 'stand',
  tread: 'float', swim: 'float', tubeFloat: 'float', flail: 'float', fakeWave: 'float', facedown: 'float', cramp: 'float', cling: 'float', wallCling: 'float', holdRing: 'float', guardSwim: 'float', towed: 'float',
  sitHurt: 'sit', lie: 'lie', chair: 'chair', kneel: 'kneel', air: 'air',
};

let UID = 0;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class Person {
  constructor(sys, slot, o = {}) {
    this.sys = sys; this.slot = slot; this.id = ++UID; this.alive = true;
    this.child = !!o.child; this.female = o.female ?? Math.random() < 0.5; this.staff = o.staff || null;
    this.s = o.s || (this.child ? rand(0.55, 0.65) : rand(0.93, 1.05) * (this.female ? 0.95 : 1));
    this.wide = this.child ? 1 : rand(0.92, 1.12);
    this.skin = pick(SKIN); this.hair = pick(HAIR); this.suit = pick(SUIT);
    this.vest = o.vest ?? false; this.tube = o.tube ?? false; this.bottle = false;
    this.vestCol = pick(VEST); this.tubeCol = pick(TUBE); this.redFace = 0;
    this.x = o.x ?? 0; this.z = o.z ?? 0; this.y = 0; this.head = o.head ?? rand(-Math.PI, Math.PI);
    this.pose = 'stand'; this.ph = rand(0, 10); this.seq = []; this.state = 'normal';
    this.incident = null; this.fake = false; this.cool = 0; this.pref = o.pref || 'water';
    this.target = null; this.path = []; this.idle = rand(0, 3); this.follow = null; this.fx = 0; this.fz = 0;
    this.pitch = 0; this.roll = 0; this.yOff = 0; this.tubeTilt = 0; this.floatOff = -0.55; this.lieY = 0; this.seatY = 0; this.airY = 0;
    this.speed = 0; this.moving = false; this.life = rand(70, 200); this.lounger = null;
    this.wp = new THREE.Vector3(); this.wh = new THREE.Vector3();
    if (this.staff === 'guard') { this.suit = '#d42a2a'; this.top = '#d42a2a'; this.female = false; }
    if (this.staff === 'medic') { this.suit = '#1f3b73'; this.top = '#f4f6f8'; }
    this._build();
  }

  _build() {
    const N = () => new THREE.Object3D();
    const root = this.root = N(); root.rotation.order = 'YXZ';
    const J = this.J = {};
    J.spine = N(); J.spine.position.set(0, 0.05, 0); root.add(J.spine);
    J.neck = N(); J.neck.position.set(0, 0.55, 0); J.spine.add(J.neck);
    J.shL = N(); J.shL.position.set(-0.19, 0.5, 0); J.spine.add(J.shL);
    J.shR = N(); J.shR.position.set(0.19, 0.5, 0); J.spine.add(J.shR);
    J.elL = N(); J.elL.position.set(0, -0.29, 0); J.shL.add(J.elL);
    J.elR = N(); J.elR.position.set(0, -0.29, 0); J.shR.add(J.elR);
    J.hipL = N(); J.hipL.position.set(-0.085, -0.04, 0); root.add(J.hipL);
    J.hipR = N(); J.hipR.position.set(0.085, -0.04, 0); root.add(J.hipR);
    J.knL = N(); J.knL.position.set(0, -0.43, 0); J.hipL.add(J.knL);
    J.knR = N(); J.knR.position.set(0, -0.43, 0); J.hipR.add(J.knR);
    this.T = {}; for (const k in J) this.T[k] = [0, 0, 0];
    const P = this.P = {};
    P.hips = N(); root.add(P.hips);
    P.torso = N(); P.torso.position.set(0, 0.27, 0); J.spine.add(P.torso);
    P.head = N(); P.head.position.set(0, 0.13, 0.005); J.neck.add(P.head);
    P.hair = N(); P.hair.position.set(0, 0.155, -0.012); J.neck.add(P.hair);
    P.uarmL = J.shL; P.uarmR = J.shR; P.farmL = J.elL; P.farmR = J.elR; P.thighL = J.hipL; P.thighR = J.hipR; P.shinL = J.knL; P.shinR = J.knR;
    P.footL = N(); P.footL.position.set(0, -0.44, 0.0); J.knL.add(P.footL);
    P.footR = N(); P.footR.position.set(0, -0.44, 0.0); J.knR.add(P.footR);
    P.tube = N(); P.tube.position.set(0, 0.36, 0); root.add(P.tube);
    P.bottle = N(); P.bottle.position.set(0, -0.26, 0.03); J.elR.add(P.bottle);
    this.applyShape();
  }

  applyShape() {
    const P = this.P;
    const tw = this.female ? 0.9 : 1.0;
    if (this.vest) P.torso.scale.set(1.12 * tw, 1.0, 1.35); else P.torso.scale.set(tw, 1, this.female ? 0.95 : 1);
    P.hips.scale.set(this.female ? 1.04 : 0.98, 1, 1);
    if (this.female && !this.child) { P.hair.scale.set(1.06, 1.35, 1.18); P.hair.position.set(0, 0.12, -0.02); }
    else P.hair.scale.set(1, 1, 1);
  }

  get alive2() { return this.alive; }
  get inWater() { return depthAt(this.x, this.z) > 0.05; }
  get deep() { return depthAt(this.x, this.z) > 1.1 * this.s + (this.child ? 0.05 : 0); }
  get onDeck() { return !inPool(this.x, this.z); }
  get swimmer() { return this.deep; }

  faceTo(a, dt, k = 6) {
    let d = a - this.head; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.head += d * Math.min(1, dt * k);
  }

  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.x, dz = tz - this.z, dist = Math.hypot(dx, dz);
    if (dist < 0.06) { this.speed = 0; return true; }
    const st = Math.min(dist, speed * dt);
    this.x += (dx / dist) * st; this.z += (dz / dist) * st; this.speed = speed;
    this.faceTo(Math.atan2(dx, dz), dt);
    return dist <= st + 0.03;
  }

  // 데크/풀 사이 경유지 포함 이동 단계
  route(tx, tz, speed, pose) {
    const steps = [];
    const fromPool = inPool(this.x, this.z) && this.z < 7.6, toPool = inPool(tx, tz) && tz < 7.6;
    const fromSide = !inPool(this.x, this.z) && Math.abs(this.x) > 20 && this.z < 8.6;
    const toSide = !inPool(tx, tz) && Math.abs(tx) > 20 && tz < 8.6;
    if (fromSide && !toSide) steps.push({ t: 'go', x: Math.sign(this.x) * 21.2, z: 9.6, speed, pose });
    if (fromPool !== toPool) steps.push({ t: 'go', x: clamp(fromPool ? this.x : tx, -16, 16), z: 9.4, speed, pose });
    if (toSide && !fromSide) steps.push({ t: 'go', x: Math.sign(tx) * 21.2, z: 9.6, speed, pose });
    steps.push({ t: 'go', x: tx, z: tz, speed, pose });
    return steps;
  }

  speedHere() {
    const d = depthAt(this.x, this.z);
    if (d < 0.05) return this.child ? 0.9 : 1.15;
    if (!this.deep) return 0.65;
    return this.tube ? 0.35 : 0.5;
  }

  autoPose(moving) {
    const d = depthAt(this.x, this.z);
    if (d < 0.05) return moving ? (this.bottle ? 'carry' : 'walk') : 'stand';
    if (!this.deep) return moving ? 'wade' : (this.tube ? 'standTube' : 'stand');
    if (this.tube) return 'tubeFloat';
    return moving && !this.vest ? 'swim' : 'tread';
  }

  think(dt) {
    this.cool -= dt;
    if (this.seq.length) return this.runSeq(dt);
    this.moving = false;
    if (this.follow) {
      const p = this.follow;
      if (!p.alive) { this.follow = null; return; }
      const tx = p.x + this.fx, tz = p.z + this.fz;
      const dist = Math.hypot(tx - this.x, tz - this.z);
      if (dist > 0.35) { this.moveToward(tx, tz, Math.min(2.2, this.speedHere() * (dist > 2 ? 1.8 : 1)), dt); this.moving = true; }
      else this.faceTo(p.head, dt, 2);
      this.pose = this.autoPose(this.moving);
      return;
    }
    if (this.lounger) { this.pose = 'lie'; this.life -= dt; if (this.life < 0) { const l = this.lounger; l.used = false; this.lounger = null; this.pref = 'deck'; this.x = l.x + (l.side > 0 ? -1.4 : 1.4); this.life = rand(20, 60); } return; }
    this.life -= dt;
    if (!this.path.length) {
      this.idle -= dt;
      if (this.idle <= 0) {
        if (this.life < 0 && !this.staff) { this.path = this.route(rand(-7, 7), 20.5, this.speedHere()); this.leaving = true; }
        else {
          const t = this.sys.randomSpot(this);
          if (t) {
            if (t.lounger) { this.goLounger = t.lounger; }
            this.path = this.route(t.x, t.z, 0);
          }
        }
      }
      this.pose = this.autoPose(false);
    } else {
      const s = this.path[0];
      if (this.moveToward(s.x, s.z, s.speed || this.speedHere(), dt)) {
        this.path.shift();
        if (!this.path.length) {
          this.idle = rand(2, 9);
          if (this.leaving) { this.sys.despawn(this); return; }
          if (this.goLounger) {
            const l = this.goLounger; this.goLounger = null;
            this.lounger = l; this.x = l.x; this.z = l.z; this.head = l.head; this.lieY = l.y; this.life = rand(25, 70);
          }
        }
      }
      this.moving = true;
      this.pose = this.autoPose(true);
    }
  }

  runSeq(dt) {
    const s = this.seq[0];
    this.moving = false;
    if (s.t === 'go') {
      this.moving = true;
      const done = this.moveToward(s.x, s.z, s.speed || this.speedHere(), dt);
      this.pose = typeof s.pose === 'function' ? s.pose(this) : (s.pose || this.autoPose(true));
      if (done) this.seq.shift();
    } else if (s.t === 'wait') {
      s.d -= dt;
      this.pose = typeof s.pose === 'function' ? s.pose(this) : (s.pose || this.autoPose(false));
      if (s.face != null) this.faceTo(s.face, dt);
      if (s.d <= 0) this.seq.shift();
    } else if (s.t === 'fn') { this.seq.shift(); s.f(this); }
    else if (s.t === 'upd') { if (s.f(this, dt)) this.seq.shift(); }
  }

  setSeq(steps) { this.seq = steps.flat(); this.path = []; this.lounger && (this.lounger.used = false); this.lounger = null; }

  // ---- 애니메이션 ----
  animate(dt, t) {
    const T = this.T; for (const k in T) { T[k][0] = 0; T[k][1] = 0; T[k][2] = 0; }
    let pitch = 0, roll = 0, yOff = 0, tubeTilt = 0;
    const ps = this.pose; const ph = this.ph;
    let rate = 1;
    const armsRest = () => { T.shL[2] = -0.1; T.shR[2] = 0.1; T.elL[0] = -0.15; T.elR[0] = -0.15; };
    switch (ps) {
      case 'stand': case 'standTube':
        armsRest(); T.spine[0] = Math.sin(t * 1.3 + this.id) * 0.02; T.neck[1] = Math.sin(t * 0.35 + this.id * 1.7) * 0.5;
        if (ps === 'standTube') { T.shL[0] = -0.5; T.shR[0] = -0.5; T.shL[2] = -0.9; T.shR[2] = 0.9; T.elL[0] = -1.1; T.elR[0] = -1.1; }
        break;
      case 'walk': case 'carry': case 'stagger': case 'wade': case 'run': {
        const run = ps === 'run', wade = ps === 'wade';
        rate = (this.speed || 1) / (0.42 * this.s) * (run ? 0.75 : 1);
        const a = run ? 0.85 : wade ? 0.3 : 0.45, sp = Math.sin(ph), cp = Math.cos(ph);
        T.hipL[0] = -sp * a; T.hipR[0] = sp * a;
        T.knL[0] = 0.1 + Math.max(0, Math.sin(ph - 1.4)) * (run ? 1.5 : 0.8);
        T.knR[0] = 0.1 + Math.max(0, Math.sin(ph + Math.PI - 1.4)) * (run ? 1.5 : 0.8);
        T.shL[0] = sp * (run ? 0.9 : 0.35); T.shR[0] = -sp * (run ? 0.9 : 0.35); T.shL[2] = -0.12; T.shR[2] = 0.12;
        T.elL[0] = run ? -1.4 : -0.25; T.elR[0] = run ? -1.4 : -0.25;
        yOff = Math.abs(cp) * (run ? 0.06 : 0.025) - (run ? 0.03 : 0);
        if (run) T.spine[0] = 0.22;
        if (wade) { T.shL[2] = -0.55; T.shR[2] = 0.55; T.elL[0] = -0.4; T.elR[0] = -0.4; }
        if (ps === 'carry') { T.shR[0] = -0.55; T.elR[0] = -1.4; }
        if (ps === 'stagger') { roll = Math.sin(t * 1.6 + this.id) * 0.16; T.neck[0] = 0.45; T.spine[2] = Math.sin(t * 1.1) * 0.12; T.shL[2] = -0.05; T.shR[2] = 0.05; }
        break;
      }
      case 'tread': {
        rate = 1.6;
        T.shL[2] = -(1.25 + 0.25 * Math.sin(ph * 2)); T.shR[2] = 1.25 + 0.25 * Math.sin(ph * 2);
        T.shL[0] = 0.2 * Math.cos(ph * 2); T.shR[0] = 0.2 * Math.cos(ph * 2); T.elL[0] = -0.5; T.elR[0] = -0.5;
        T.hipL[0] = Math.sin(ph * 1.5) * 0.35 - 0.25; T.hipR[0] = -Math.sin(ph * 1.5) * 0.35 - 0.25;
        T.knL[0] = 0.7 + 0.3 * Math.sin(ph * 1.5); T.knR[0] = 0.7 - 0.3 * Math.sin(ph * 1.5);
        this.floatOff = this.vest ? -0.5 : -0.6; yOff = Math.sin(ph * 2) * 0.03; T.neck[1] = Math.sin(t * 0.3 + this.id) * 0.5;
        break;
      }
      case 'swim': case 'guardSwim': {
        rate = ps === 'guardSwim' ? 3.2 : 1.8; pitch = 1.25;
        T.shL[0] = -1.6 + 1.6 * Math.sin(ph * 2); T.shR[0] = -1.6 - 1.6 * Math.sin(ph * 2);
        T.shL[2] = -0.25; T.shR[2] = 0.25; T.elL[0] = -0.3; T.elR[0] = -0.3;
        T.hipL[0] = Math.sin(ph * 6) * 0.25; T.hipR[0] = -Math.sin(ph * 6) * 0.25; T.knL[0] = 0.2; T.knR[0] = 0.2;
        T.neck[0] = -0.7; T.neck[1] = Math.sin(ph * 2) * 0.45; this.floatOff = -0.12; roll = Math.sin(ph * 2) * 0.25;
        break;
      }
      case 'tubeFloat': {
        rate = 0.9; T.shL[0] = -0.55; T.shR[0] = -0.55; T.shL[2] = -0.95; T.shR[2] = 0.95; T.elL[0] = -1.15; T.elR[0] = -1.15;
        T.hipL[0] = -0.35 + Math.sin(ph) * 0.2; T.hipR[0] = -0.35 - Math.sin(ph) * 0.2; T.knL[0] = 0.5; T.knR[0] = 0.5;
        T.neck[1] = Math.sin(t * 0.25 + this.id) * 0.6; this.floatOff = -0.36; roll = Math.sin(t * 1.3 + this.id) * 0.06; pitch = Math.sin(t * 1.1 + this.id) * 0.06;
        break;
      }
      case 'flail': {
        rate = 1;
        T.shL[2] = -(2.2 + 0.7 * Math.sin(t * 7.3)); T.shR[2] = 2.2 + 0.7 * Math.sin(t * 7.3 + 1.7);
        T.shL[0] = 0.6 * Math.sin(t * 5.3); T.shR[0] = 0.6 * Math.sin(t * 4.7 + 1);
        T.elL[0] = -0.4 - 0.4 * Math.sin(t * 6); T.elR[0] = -0.4 - 0.4 * Math.sin(t * 6.4 + 2);
        T.neck[0] = -0.45; T.spine[2] = Math.sin(t * 3.1) * 0.15;
        T.hipL[0] = Math.sin(t * 6) * 0.5 - 0.3; T.hipR[0] = -Math.sin(t * 6) * 0.5 - 0.3; T.knL[0] = 0.8; T.knR[0] = 0.8;
        this.floatOff = -0.66 - 0.32 * (0.5 + 0.5 * Math.sin(t * 2.3 + this.id));
        break;
      }
      case 'fakeWave': {
        T.shL[2] = -(2.55 + 0.35 * Math.sin(t * 2.4)); T.shR[2] = 2.55 + 0.35 * Math.sin(t * 2.4 + Math.PI);
        T.elL[0] = -0.3; T.elR[0] = -0.3; T.neck[1] = Math.sin(t * 0.9) * 0.4; T.neck[0] = -0.1;
        T.hipL[0] = -0.3; T.hipR[0] = -0.3; T.knL[0] = 0.6; T.knR[0] = 0.6;
        this.floatOff = this.vest ? -0.48 : -0.55; yOff = Math.sin(t * 4.8) * 0.06;
        break;
      }
      case 'facedown': {
        pitch = 1.45; this.floatOff = -0.06; roll = Math.sin(t * 0.7 + this.id) * 0.08;
        T.shL[0] = -1.35; T.shR[0] = -1.35; T.shL[2] = -0.35; T.shR[2] = 0.35; T.elL[0] = -0.3; T.elR[0] = -0.3;
        T.hipL[0] = 0.2; T.hipR[0] = 0.15; T.knL[0] = 0.3; T.knR[0] = 0.25; T.neck[0] = 0.25;
        break;
      }
      case 'cramp': {
        T.hipR[0] = -1.15; T.knR[0] = 1.9; T.hipL[0] = -0.2; T.knL[0] = 0.4;
        T.shR[0] = -0.7; T.shR[2] = 0.25; T.elR[0] = -0.3;
        T.shL[2] = -(1.4 + 0.5 * Math.sin(t * 5)); T.shL[0] = 0.3 * Math.sin(t * 5); T.elL[0] = -0.3;
        roll = 0.28 + Math.sin(t * 3) * 0.05; T.neck[0] = -0.3; T.spine[0] = 0.3;
        this.floatOff = -0.7 - 0.08 * Math.sin(t * 2.6);
        break;
      }
      case 'cling': {
        tubeTilt = 1.5; T.shL[0] = -2.2; T.shR[0] = -2.3; T.shL[2] = -0.15; T.shR[2] = 0.15; T.elL[0] = -0.5; T.elR[0] = -0.5;
        T.hipL[0] = Math.sin(t * 7) * 0.4 - 0.2; T.hipR[0] = -Math.sin(t * 7) * 0.4 - 0.2; T.knL[0] = 0.6; T.knR[0] = 0.6;
        T.neck[0] = -0.35; this.floatOff = -0.72 - 0.1 * Math.sin(t * 3); roll = Math.sin(t * 4) * 0.1;
        break;
      }
      case 'wallCling': {
        T.shL[0] = -2.85; T.shR[0] = -2.85; T.shL[2] = -0.25; T.shR[2] = 0.25; T.elL[0] = -0.4 - 0.2 * Math.sin(t * 2); T.elR[0] = -0.4 - 0.2 * Math.sin(t * 2 + 1);
        T.hipL[0] = Math.sin(t * 5) * 0.35; T.hipR[0] = -Math.sin(t * 5) * 0.35; T.knL[0] = 0.5; T.knR[0] = 0.5;
        pitch = -0.12; this.floatOff = -0.25 + 0.1 * Math.sin(t * 2); T.neck[0] = -0.2;
        break;
      }
      case 'cry': {
        T.shL[0] = -1.35; T.shR[0] = -1.35; T.shL[2] = 0.32; T.shR[2] = -0.32; T.elL[0] = -2.1; T.elR[0] = -2.1;
        T.neck[0] = 0.35; T.spine[0] = 0.15 + Math.sin(t * 15) * 0.03;
        break;
      }
      case 'push': case 'shove': {
        const f = Math.sin(t * 3.4 + (ps === 'shove' ? 1.6 : 0));
        T.shL[0] = -1.45 + 0.35 * f; T.shR[0] = -1.45 - 0.35 * f; T.shL[2] = 0.1; T.shR[2] = -0.1; T.elL[0] = -0.2 - 0.4 * (1 - Math.abs(f)); T.elR[0] = -0.2 - 0.4 * (1 - Math.abs(f));
        T.spine[0] = 0.2 + 0.1 * f; T.hipL[0] = -0.35; T.knL[0] = 0.35; T.hipR[0] = 0.2; T.neck[0] = -0.1;
        break;
      }
      case 'diveReady': {
        const b = 0.5 + 0.5 * Math.sin(t * 5.5);
        T.hipL[0] = -0.55 * b; T.hipR[0] = -0.55 * b; T.knL[0] = 1.0 * b; T.knR[0] = 1.0 * b; yOff = -0.1 * b;
        T.spine[0] = 0.35 + 0.15 * b; T.shL[0] = -2.9; T.shR[0] = -2.9; T.shL[2] = 0.12; T.shR[2] = -0.12;
        break;
      }
      case 'sitHurt': {
        T.hipL[0] = -1.5; T.knL[0] = 0.15; T.hipR[0] = -2.1; T.knR[0] = 2.2;
        T.shL[0] = -0.95; T.shR[0] = -0.95; T.shL[2] = 0.3; T.shR[2] = -0.1; T.elL[0] = -1.1; T.elR[0] = -0.9;
        T.spine[0] = 0.3 + Math.sin(t * 3) * 0.1; T.neck[0] = 0.3;
        break;
      }
      case 'lie': {
        pitch = -1.5; T.shL[2] = -0.15; T.shR[2] = 0.15; T.hipR[0] = -0.4; T.knR[0] = 0.8; T.neck[0] = -0.1;
        if (this.lounger) { T.shR[0] = -2.6; T.elR[0] = -2.2; }
        break;
      }
      case 'chair': {
        T.hipL[0] = -1.5; T.hipR[0] = -1.5; T.knL[0] = 1.4; T.knR[0] = 1.4; T.shL[0] = -0.4; T.shR[0] = -0.4; T.elL[0] = -0.9; T.elR[0] = -0.9;
        T.neck[1] = Math.sin(t * 0.4 + this.id) * 0.7; T.neck[0] = 0.15;
        break;
      }
      case 'kneel': {
        T.hipL[0] = -0.1; T.hipR[0] = -0.1; T.knL[0] = 1.75; T.knR[0] = 1.75; T.spine[0] = 0.45;
        T.shL[0] = -0.9; T.shR[0] = -0.9; T.elL[0] = -0.3; T.elR[0] = -0.3; T.neck[0] = 0.3;
        break;
      }
      case 'holdRing': case 'towed': {
        T.shL[0] = -1.5; T.shR[0] = -1.5; T.shL[2] = 0.15; T.shR[2] = -0.15; T.elL[0] = -0.4; T.elR[0] = -0.4;
        T.hipL[0] = Math.sin(t * 4) * 0.3; T.hipR[0] = -Math.sin(t * 4) * 0.3; T.knL[0] = 0.4; T.knR[0] = 0.4;
        this.floatOff = -0.48; pitch = ps === 'towed' ? 0.5 : 0.1;
        break;
      }
      case 'air': {
        pitch = this.airPitch || 0; T.shL[0] = -2.9; T.shR[0] = -2.9; T.hipL[0] = 0.1; T.hipR[0] = 0.1;
        break;
      }
    }
    this.ph += dt * rate * 3.2;
    // 부드러운 전환
    const k = Math.min(1, dt * 10);
    for (const n in T) { const r = this.J[n].rotation, tv = T[n]; r.x += (tv[0] - r.x) * k; r.y += (tv[1] - r.y) * k; r.z += (tv[2] - r.z) * k; }
    this.pitch += (pitch - this.pitch) * Math.min(1, dt * 6);
    this.roll += (roll - this.roll) * Math.min(1, dt * 6);
    this.yOff += (yOff - this.yOff) * Math.min(1, dt * 10);
    this.tubeTilt += (tubeTilt - this.tubeTilt) * Math.min(1, dt * 5);
  }

  place(t) {
    const st = POSE_STANCE[this.pose] || 'stand', s = this.s;
    const gy = groundY(this.x, this.z), d = depthAt(this.x, this.z), h = waveH(this.x, this.z, t);
    let y;
    if (st === 'stand') y = gy + LEG * s + (d > 0.2 ? h * 0.3 : 0);
    else if (st === 'float') y = Math.max(h + this.floatOff * s, gy + 0.3 * s);
    else if (st === 'sit') y = gy + 0.12 * s;
    else if (st === 'lie') y = this.lieY + 0.12 * s;
    else if (st === 'chair') y = this.seatY + 0.08;
    else if (st === 'kneel') y = gy + 0.5 * s;
    else y = this.airY;
    this.y += (y + this.yOff * s - this.y) * (Math.abs(y - this.y) > 1.5 ? 1 : 0.35);
    const r = this.root;
    r.position.set(this.x, this.y, this.z);
    r.rotation.set(this.pitch, this.head, this.roll);
    r.scale.set(s * this.wide, s, s * this.wide);
    this.P.tube.rotation.x = this.tubeTilt;
    this.P.tube.position.set(0, 0.36 + this.tubeTilt * 0.12, this.tubeTilt * 0.28);
    r.updateMatrixWorld(true);
    this.wp.setFromMatrixPosition(r.matrixWorld);
    this.wh.setFromMatrixPosition(this.P.head.matrixWorld);
  }
}

// ---------- 인스턴싱 렌더러 + 관리자 ----------
export class People {
  constructor(scene, world, max = 90) {
    this.scene = scene; this.world = world; this.max = max;
    this.slots = new Array(max).fill(null); this.list = [];
    const skinM = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
    const clothM = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 });
    const hairM = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const tubeM = new THREE.MeshStandardMaterial({ roughness: 0.3, vertexColors: true });
    const bottleM = new THREE.MeshStandardMaterial({ color: '#1f9a55', roughness: 0.1, metalness: 0.2, emissive: '#0d4a28', emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
    const G = {};
    G.head = new THREE.SphereGeometry(0.105, 18, 14).scale(0.92, 1.12, 1.0);
    G.hair = new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, 1.0, 1.05);
    G.torso = new THREE.CapsuleGeometry(0.145, 0.26, 6, 14).scale(1.22, 1, 0.74);
    G.hips = new THREE.SphereGeometry(0.155, 16, 10).scale(1.0, 0.78, 0.74);
    G.uarm = new THREE.CapsuleGeometry(0.047, 0.2, 4, 8).translate(0, -0.145, 0);
    G.farm = new THREE.CapsuleGeometry(0.04, 0.19, 4, 8).translate(0, -0.13, 0);
    G.thigh = new THREE.CapsuleGeometry(0.072, 0.29, 4, 10).translate(0, -0.215, 0);
    G.shin = new THREE.CapsuleGeometry(0.052, 0.33, 4, 8).translate(0, -0.22, 0);
    G.foot = new THREE.BoxGeometry(0.085, 0.055, 0.21).translate(0, -0.02, 0.055);
    const tg = new THREE.TorusGeometry(0.42, 0.14, 12, 32); tg.rotateX(Math.PI / 2);
    { const p = tg.attributes.position, col = []; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const s = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2; const v = s ? 1 : 0.55; col.push(v, v, v); } tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); }
    G.tube = tg;
    G.bottle = new THREE.CylinderGeometry(0.035, 0.04, 0.24, 10).translate(0, -0.06, 0);
    const defs = [
      ['head', skinM, 1], ['hair', hairM, 1], ['torso', clothM, 1], ['hips', clothM, 1], ['uarm', skinM, 2], ['farm', skinM, 2],
      ['thigh', skinM, 2], ['shin', skinM, 2], ['foot', skinM, 2], ['tube', tubeM, 1], ['bottle', bottleM, 1],
    ];
    this.M = {};
    for (const [k, m, n] of defs) {
      const im = new THREE.InstancedMesh(G[k], m, max * n);
      im.castShadow = true; im.receiveShadow = k !== 'tube'; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, new THREE.Color()); im.count = max * n;
      this.M[k] = im; scene.add(im);
    }
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const k in this.M) for (let i = 0; i < this.M[k].count; i++) this.M[k].setMatrixAt(i, this.zero);
    this._c = new THREE.Color();
  }

  spawn(o = {}) {
    const i = this.slots.indexOf(null); if (i < 0) return null;
    const p = new Person(this, i, o);
    this.slots[i] = p; this.list.push(p); this.recolor(p);
    p.place(0); p.y = p.root.position.y;
    return p;
  }

  despawn(p) {
    if (!p.alive) return; p.alive = false;
    if (p.lounger) p.lounger.used = false;
    this.slots[p.slot] = null; this.list.splice(this.list.indexOf(p), 1);
    this._hide(p.slot);
    if (p.onDespawn) p.onDespawn(p);
  }

  clear() { for (const p of [...this.list]) this.despawn(p); }

  _hide(i) {
    const M = this.M, z = this.zero;
    for (const k of ['head', 'hair', 'torso', 'hips', 'tube', 'bottle']) M[k].setMatrixAt(i, z);
    for (const k of ['uarm', 'farm', 'thigh', 'shin', 'foot']) { M[k].setMatrixAt(i * 2, z); M[k].setMatrixAt(i * 2 + 1, z); }
  }

  recolor(p) {
    const c = this._c, M = this.M, i = p.slot;
    const skin = c.set(p.skin).clone();
    const face = skin.clone().lerp(new THREE.Color('#e0453a'), p.redFace * 0.55);
    M.head.setColorAt(i, face);
    M.hair.setColorAt(i, c.set(p.hair));
    let top;
    if (p.vest) top = p.vestCol; else if (p.top) top = p.top; else if (p.female) top = p.suit; else top = null;
    M.torso.setColorAt(i, top ? c.set(top) : skin);
    M.hips.setColorAt(i, c.set(p.suit));
    for (const k of ['uarm', 'farm', 'thigh', 'shin', 'foot']) { M[k].setColorAt(i * 2, skin); M[k].setColorAt(i * 2 + 1, skin); }
    if (p.staff === 'medic') { M.uarm.setColorAt(i * 2, c.set('#f4f6f8')); M.uarm.setColorAt(i * 2 + 1, c); }
    M.tube.setColorAt(i, c.set(p.tubeCol));
    M.bottle.setColorAt(i, c.set('#ffffff'));
    for (const k in M) if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true;
  }

  // 자연스러운 목적지 선택
  randomSpot(p) {
    if (p.staff) return null;
    const W = this.world;
    const canWater = p.vest || p.tube;
    let pref = p.pref;
    if (!canWater && pref === 'water') pref = 'beach';
    if (pref === 'water') {
      if (Math.random() < 0.12) return { x: rand(-16, 16), z: rand(2.6, 6.5) };
      const deep = Math.random() < 0.6;
      return { x: rand(-18.2, 18.2), z: deep ? rand(-27.5, -12) : rand(-12, 1.5) };
    }
    if (pref === 'beach') {
      if (Math.random() < 0.25) return this.deckSpot();
      return { x: rand(-17, 17), z: rand(2.7, 7.2) };
    }
    if (pref === 'lounge') {
      const free = W.loungers.filter((l) => !l.used);
      if (free.length && Math.random() < 0.8) { const l = pick(free); l.used = true; return { x: l.x - l.side * 0.0 + (l.side > 0 ? -1.4 : 1.4), z: l.z, lounger: l }; }
      p.pref = 'deck';
    }
    return this.deckSpot();
  }

  deckSpot() {
    if (Math.random() < 0.35) return { x: rand(-15, 15), z: rand(9, 12.5) };
    const s = Math.random() < 0.5 ? -1 : 1;
    return { x: s * rand(21.3, 23.4), z: rand(-36, 6) };
  }

  update(dt, t) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) { const p = L[i]; if (p.alive) p.think(dt); }
    // 분리 (겹침 방지)
    for (let a = 0; a < L.length; a++) {
      const p = L[a]; if (p.lounger || p.pinned) continue;
      for (let b = a + 1; b < L.length; b++) {
        const q = L[b]; if (q.lounger || q.pinned) continue;
        const dx = q.x - p.x, dz = q.z - p.z, md = 0.42 * (p.s + q.s) * (p.tube || q.tube ? 1.35 : 1);
        const d2 = dx * dx + dz * dz;
        if (d2 < md * md && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (md - d) * 0.5 * Math.min(1, dt * 8);
          const nx = dx / d, nz = dz / d;
          if (!p.seq.length || p.follow) { p.x -= nx * push; p.z -= nz * push; }
          if (!q.seq.length || q.follow) { q.x += nx * push; q.z += nz * push; }
        }
      }
    }
    const M = this.M, z = this.zero;
    for (const p of L) {
      if (p.hidden) { this._hide(p.slot); continue; }
      p.animate(dt, t); p.place(t);
      const i = p.slot, P = p.P;
      M.head.setMatrixAt(i, P.head.matrixWorld); M.hair.setMatrixAt(i, P.hair.matrixWorld);
      M.torso.setMatrixAt(i, P.torso.matrixWorld); M.hips.setMatrixAt(i, P.hips.matrixWorld);
      M.uarm.setMatrixAt(i * 2, P.uarmL.matrixWorld); M.uarm.setMatrixAt(i * 2 + 1, P.uarmR.matrixWorld);
      M.farm.setMatrixAt(i * 2, P.farmL.matrixWorld); M.farm.setMatrixAt(i * 2 + 1, P.farmR.matrixWorld);
      M.thigh.setMatrixAt(i * 2, P.thighL.matrixWorld); M.thigh.setMatrixAt(i * 2 + 1, P.thighR.matrixWorld);
      M.shin.setMatrixAt(i * 2, P.shinL.matrixWorld); M.shin.setMatrixAt(i * 2 + 1, P.shinR.matrixWorld);
      M.foot.setMatrixAt(i * 2, P.footL.matrixWorld); M.foot.setMatrixAt(i * 2 + 1, P.footR.matrixWorld);
      M.tube.setMatrixAt(i, p.tube ? P.tube.matrixWorld : z);
      M.bottle.setMatrixAt(i, p.bottle ? P.bottle.matrixWorld : z);
    }
    for (const k in M) M[k].instanceMatrix.needsUpdate = true;
  }

  // 화면 좌표로 사람 선택
  pick(px, py, cam, w, h) {
    let best = null, bestScore = Infinity;
    const fovK = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    for (const p of this.list) {
      if (p.staff || !p.alive) continue;
      _v.copy(p.wp).project(cam); _v2.copy(p.wh).project(cam);
      if (_v.z > 1 || _v2.z > 1) continue;
      const ax = (_v.x * 0.5 + 0.5) * w, ay = (-_v.y * 0.5 + 0.5) * h, bx = (_v2.x * 0.5 + 0.5) * w, by = (-_v2.y * 0.5 + 0.5) * h;
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
      let tt = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0; tt = clamp(tt, -0.25, 1.25);
      const dx = px - (ax + vx * tt), dy = py - (ay + vy * tt), dist = Math.hypot(dx, dy);
      const camD = cam.position.distanceTo(p.wh);
      const rad = Math.max(20, (0.4 * p.s * fovK) / camD);
      if (dist < rad) { const sc = dist / rad + camD * 0.002; if (sc < bestScore) { bestScore = sc; best = p; } }
    }
    return best;
  }
}
