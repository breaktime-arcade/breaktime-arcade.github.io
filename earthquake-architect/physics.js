// 지진 설계사 - 구조 물리 엔진
// 정면(2D) 골조를 XPBD 방식의 질점-부재 모델로 계산합니다.
// 부재마다 받는 힘을 측정해 강도를 넘으면 부러지고, 부러진 부재는 파편으로 떨어집니다.

export const BAY_W = 2.0;      // 기둥 간격(가로 한 칸)
export const STORY_H = 1.6;    // 층고(세로 한 칸)

export const PARTS = {
  column: { name: '기둥', cost: 100, mass: 1.0, compliance: 1e-7, strength: 1900 },
  beam:   { name: '보',   cost: 80,  mass: 0.8, compliance: 1e-7, strength: 1500 },
  brace:  { name: '가새', cost: 60,  mass: 0.4, compliance: 2e-7, strength: 520 },
  iso:    { name: '면진장치', cost: 250 },
};
const SLAB_MASS = 3.0;         // 보 하나가 받치는 바닥판 무게
const RESIDENT_MASS = 0.6;     // 입주민 한 명 무게
const FRAME_COMPLIANCE = 1.6e-4; // 기둥-보 접합부의 강성(가새 없는 칸의 버팀)
const FRAME_STRENGTH = 190;
const GRAVITY = 9.8;
const DAMPING = 0.6;           // 구조 감쇠
const ISO_K = 9.0;             // 면진장치 수평 스프링(질량당)
const ISO_C = 2.2;

// 재현 가능한 난수
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 지진동: 여러 진동수를 섞고 시작-최대-감쇠 포락선을 씌운 지반 변위
export class Quake {
  constructor({ amp, freq, dur, seed = 7 }) {
    this.amp = amp; this.freq = freq; this.dur = dur;
    const rng = makeRng(seed);
    const mul = [0.62, 1.0, 1.38, 1.9, 2.6];
    const w = [0.55, 1.0, 0.55, 0.3, 0.15];
    this.waves = mul.map((m, i) => ({
      f: freq * m * (0.92 + rng() * 0.16),
      a: w[i] / (m * m),           // 가속도 기준으로 비슷한 비율이 되도록 높은 진동수 변위는 작게
      p: rng() * Math.PI * 2,
    }));
    const norm = this.waves.reduce((s, v) => s + v.a * v.f * v.f, 0) / (freq * freq);
    this.waves.forEach(v => { v.a /= norm; });
  }
  envelope(t) {
    const d = this.dur;
    if (t <= 0 || t >= d) return 0;
    const rise = d * 0.18, hold = d * 0.5;
    if (t < rise) { const u = t / rise; return u * u * (3 - 2 * u); }
    if (t < hold) return 1;
    const u = (t - hold) / (d - hold);
    return Math.pow(1 - u, 1.6);
  }
  disp(t) {
    const e = this.envelope(t);
    if (!e) return 0;
    let x = 0;
    for (const v of this.waves) x += v.a * Math.sin(2 * Math.PI * v.f * t + v.p);
    return this.amp * e * x;
  }
  // 화면 표시용 가속도(대략)
  accel(t) {
    const h = 1 / 240;
    return (this.disp(t + h) - 2 * this.disp(t) + this.disp(t - h)) / (h * h);
  }
}

const key = (i, j) => i + ',' + j;

// 설계도(design) → 물리 구조물
// design: { columns:Set('i,j'), beams:Set('i,j'), braces:Map('i,j' -> 1|2|3), isos:Set('i') }
//  column 'i,j' : (i,j)-(i,j+1)
//  beam   'i,j' : (i,j)-(i+1,j)
//  brace  'i,j' : 칸 (i,j)의 대각선, 1='/', 2='\', 3=X
export class Structure {
  constructor(design, level) {
    this.nodes = [];
    this.cons = [];
    this.elements = [];    // 화면에 그릴 부재(파편 포함)
    this.nodeIndex = new Map();
    this.time = 0;
    this.groundX = 0;
    this.groundV = 0;
    this.brokenCount = 0;
    this.events = [];      // 부러짐 이벤트(효과음/연출용)
    this.level = level;

    const node = (i, j) => {
      const k = key(i, j);
      if (this.nodeIndex.has(k)) return this.nodeIndex.get(k);
      const x = (i - level.bays / 2) * BAY_W, y = j * STORY_H;
      const base = j === 0;
      const n = {
        x, y, px: x, py: y, vx: 0, vy: 0, x0: x, y0: y, mass: 0,
        base, iso: base && design.isos.has(String(i)), w: 0, i, j,
      };
      this.nodes.push(n);
      const id = this.nodes.length - 1;
      this.nodeIndex.set(k, id);
      return id;
    };

    const addMember = (type, a, b, extra = {}) => {
      const p = PARTS[type];
      const A = this.nodes[a], B = this.nodes[b];
      const rest = Math.hypot(B.x - A.x, B.y - A.y);
      const c = {
        a, b, rest, compliance: p.compliance, strength: p.strength, type,
        lambda: 0, force: 0, ratio: 0, over: 0, broken: false, deps: [],
        mass: p.mass * rest / (type === 'beam' ? BAY_W : type === 'column' ? STORY_H : rest),
        load: 0, residents: 0, ...extra,
      };
      if (type === 'beam') { c.load = SLAB_MASS; c.residents = extra.residents || 0; }
      this.cons.push(c);
      const el = { con: c, type, a, b, required: !!extra.required, residents: c.residents };
      c.el = el;
      this.elements.push(el);
      return c;
    };

    const required = new Set();
    if (level.target) {
      for (let i = level.zone[0]; i < level.zone[1]; i++) required.add(key(i, level.target));
    }

    for (const k of design.columns) {
      const [i, j] = k.split(',').map(Number);
      addMember('column', node(i, j), node(i, j + 1));
    }
    const beamCons = new Map();
    for (const k of design.beams) {
      const [i, j] = k.split(',').map(Number);
      const req = required.has(k);
      beamCons.set(k, addMember('beam', node(i, j), node(i + 1, j), { required: req, residents: req ? 2 : 0 }));
    }
    const colCons = new Map();
    for (const c of this.cons) if (c.type === 'column') {
      const A = this.nodes[c.a]; colCons.set(key(A.i, A.j), c);
    }
    for (const [k, t] of design.braces) {
      const [i, j] = k.split(',').map(Number);
      if (t & 1) addMember('brace', node(i, j), node(i + 1, j + 1));
      if (t & 2) addMember('brace', node(i + 1, j), node(i, j + 1));
    }

    // 기둥-보 강접합: 네 변이 모두 있는 칸에 약한 가상 대각선을 넣어 프레임 강성을 흉내냄
    for (let i = 0; i < level.bays; i++) {
      for (let j = 0; j < level.levels; j++) {
        const left = colCons.get(key(i, j)), right = colCons.get(key(i + 1, j));
        const top = beamCons.get(key(i, j + 1));
        const bottom = j === 0 ? null : beamCons.get(key(i, j));
        if (!left || !right || !top || (j > 0 && !bottom)) continue;
        const deps = [left, right, top, bottom].filter(Boolean);
        for (const [a, b] of [[node(i, j), node(i + 1, j + 1)], [node(i + 1, j), node(i, j + 1)]]) {
          const A = this.nodes[a], B = this.nodes[b];
          const vc = {
            a, b, rest: Math.hypot(B.x - A.x, B.y - A.y), compliance: FRAME_COMPLIANCE,
            strength: FRAME_STRENGTH, type: 'frame', lambda: 0, force: 0, ratio: 0, over: 0,
            broken: false, virtual: true,
          };
          this.cons.push(vc);
          deps.forEach(d => d.deps.push(vc));
        }
      }
    }

    // 질량 배분
    for (const c of this.cons) {
      if (c.virtual) continue;
      const m = c.mass + c.load + c.residents * RESIDENT_MASS;
      this.nodes[c.a].mass += m / 2;
      this.nodes[c.b].mass += m / 2;
    }
    this.updateInvMass();
    this.totalMass = this.nodes.reduce((s, n) => s + (n.base ? 0 : n.mass), 0);
  }

  updateInvMass() {
    for (const n of this.nodes) {
      if (n.base && !n.iso) n.w = 0;
      else n.w = n.mass > 1e-6 ? 1 / n.mass : 0;
    }
  }

  breakCon(c) {
    if (c.broken) return;
    c.broken = true;
    if (c.virtual) return;
    this.brokenCount++;
    this.events.push({ type: c.type, x: (this.nodes[c.a].x + this.nodes[c.b].x) / 2, y: (this.nodes[c.a].y + this.nodes[c.b].y) / 2 });
    for (const d of c.deps) d.broken = true;
    // 부재를 떼어내 파편으로 만든다
    const A = this.nodes[c.a], B = this.nodes[c.b];
    const m = c.mass + c.load + c.residents * RESIDENT_MASS;
    A.mass = Math.max(0, A.mass - m / 2);
    B.mass = Math.max(0, B.mass - m / 2);
    const mk = (N) => {
      const n = {
        x: N.x, y: N.y, px: N.px, py: N.py, vx: N.vx, vy: N.vy, x0: N.x, y0: N.y,
        mass: m / 2, base: false, iso: false, w: 0, debris: true,
      };
      this.nodes.push(n);
      return this.nodes.length - 1;
    };
    const da = mk(A), db = mk(B);
    const dc = {
      a: da, b: db, rest: c.rest, compliance: 0, strength: Infinity, type: 'debris',
      lambda: 0, force: 0, ratio: 0, over: 0, broken: false, debris: true,
    };
    this.cons.push(dc);
    c.el.a = da; c.el.b = db; c.el.broken = true;
    this.updateInvMass();
  }

  // 한 프레임(1/60초) 진행. quake가 없으면 자중만 받음
  step(dt, quake, quakeTime, substeps = 24) {
    const h = dt / substeps;
    const h2 = h * h;
    for (const c of this.cons) c.peak = 0;
    for (let s = 0; s < substeps; s++) {
      const t = quakeTime + (s + 1) * h;
      const gx = quake ? quake.disp(t) : 0;
      const gxPrev = quake ? quake.disp(t - h) : 0;
      const gv = (gx - gxPrev) / h;
      this.groundX = gx; this.groundV = gv;
      const damp = Math.max(0, 1 - DAMPING * h);

      for (const n of this.nodes) {
        n.px = n.x; n.py = n.y;
        if (n.base && !n.iso) {
          n.x = n.x0 + gx; n.y = 0; n.vx = gv; n.vy = 0;
          continue;
        }
        if (n.iso) {
          const ax = -ISO_K * (n.x - (n.x0 + gx)) - ISO_C * (n.vx - gv);
          n.vx = (n.vx + ax * h) * damp;
          n.x += n.vx * h;
          n.y = 0; n.vy = 0;
          continue;
        }
        if (n.w === 0) continue;
        n.vy -= GRAVITY * h;
        n.vx *= damp; n.vy *= damp;
        n.x += n.vx * h; n.y += n.vy * h;
      }

      for (let it = 0; it < 2; it++) {
        for (const c of this.cons) {
          if (c.broken) continue;
          if (it === 0) c.lambda = 0;
          const A = this.nodes[c.a], B = this.nodes[c.b];
          const wa = A.w, wb = B.w;
          const W = wa + wb;
          if (W === 0) continue;
          let dx = B.x - A.x, dy = B.y - A.y;
          const len = Math.hypot(dx, dy) || 1e-9;
          dx /= len; dy /= len;
          const C = len - c.rest;
          const at = c.compliance / h2;
          const dl = (-C - at * c.lambda) / (W + at);
          c.lambda += dl;
          A.x -= wa * dl * dx; A.y -= wa * dl * dy;
          B.x += wb * dl * dx; B.y += wb * dl * dy;
        }
      }

      for (const n of this.nodes) {
        if (n.base && !n.iso) continue;
        if (n.iso) { n.y = 0; }
        if (n.y < 0) {
          n.y = 0;
          // 바닥 마찰: 지반과 함께 움직이도록 수평 속도를 지반 속도 쪽으로 끌어당김
          const rel = (n.x - n.px) - gv * h;
          n.x -= rel * 0.6;
        }
        n.vx = (n.x - n.px) / h;
        n.vy = (n.y - n.py) / h;
      }

      for (const c of this.cons) {
        if (c.broken || c.debris) continue;
        const f = Math.abs(c.lambda) / h2;
        if (f > c.peak) c.peak = f;
      }
    }
    // 부재 파괴 판정: 강도를 넘는 힘이 몇 프레임 지속되면 부러짐(순간적인 튐 방지)
    const toBreak = [];
    for (const c of this.cons) {
      if (c.broken || c.debris) continue;
      const r = c.peak / c.strength;
      c.ratio = c.ratio * 0.7 + r * 0.3;
      if (r > 1) { c.over++; if (c.over >= 2) toBreak.push(c); }
      else c.over = 0;
    }
    toBreak.forEach(c => this.breakCon(c));
    this.time += dt;
  }

  // 입주층 상태 점검
  checkTarget() {
    const lv = this.level;
    const targetY = lv.target * STORY_H;
    let ok = true, minRatio = Infinity, maxDrift = 0;
    const reasons = [];
    for (const el of this.elements) {
      if (!el.required) continue;
      if (el.broken) { ok = false; reasons.push('broken'); continue; }
      for (const id of [el.a, el.b]) {
        const n = this.nodes[id];
        const r = n.y / targetY;
        minRatio = Math.min(minRatio, r);
        maxDrift = Math.max(maxDrift, Math.abs(n.x - (n.x0 + this.groundX)));
        if (r < 0.85) { ok = false; reasons.push('low'); }
      }
    }
    if (maxDrift > BAY_W * 0.6) { ok = false; reasons.push('tilt'); }
    return { ok, minRatio, maxDrift, reasons };
  }
}

// 설계 연결성 검사: 땅에서 이어지지 않은 부재 찾기
export function floatingParts(design, level) {
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  };
  for (const k of design.columns) { const [i, j] = k.split(',').map(Number); link(key(i, j), key(i, j + 1)); }
  for (const k of design.beams) { const [i, j] = k.split(',').map(Number); link(key(i, j), key(i + 1, j)); }
  for (const [k, t] of design.braces) {
    const [i, j] = k.split(',').map(Number);
    if (t & 1) link(key(i, j), key(i + 1, j + 1));
    if (t & 2) link(key(i + 1, j), key(i, j + 1));
  }
  const seen = new Set();
  const stack = [];
  for (const k of adj.keys()) if (k.endsWith(',0')) { seen.add(k); stack.push(k); }
  while (stack.length) {
    const k = stack.pop();
    for (const n of adj.get(k) || []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  }
  let floating = 0;
  for (const k of adj.keys()) if (!seen.has(k)) floating++;
  return floating;
}

export function designCost(design) {
  let c = design.columns.size * PARTS.column.cost + design.beams.size * PARTS.beam.cost + design.isos.size * PARTS.iso.cost;
  for (const t of design.braces.values()) c += (t === 3 ? 2 : 1) * PARTS.brace.cost;
  return c;
}

export const SETTLE_TIME = 1.5;
export const AFTER_TIME = 2.5;

// 헤드리스 전체 시뮬레이션(밸런스 테스트용)
export function simulate(design, level) {
  const s = new Structure(design, level);
  const q = new Quake(level.quake);
  const dt = 1 / 60;
  for (let t = 0; t < SETTLE_TIME; t += dt) s.step(dt, null, 0);
  const settle = s.checkTarget();
  const settleBroken = s.brokenCount;
  if (!settle.ok || settleBroken > 0) return { ok: false, phase: 'settle', broken: s.brokenCount, ...settle };
  let qt = 0;
  for (; qt < level.quake.dur + AFTER_TIME; qt += dt) s.step(dt, q, qt);
  const r = s.checkTarget();
  return { ...r, phase: 'quake', broken: s.brokenCount };
}
