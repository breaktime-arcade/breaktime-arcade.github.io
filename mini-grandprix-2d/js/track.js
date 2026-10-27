// =============================================================
//  미니카 그랑프리 2D - 트랙 생성 (라이브러리 없이 순수 JS)
//  3D 버전과 같은 코스·노면 구간·장애물 배치 규칙을 사용
// =============================================================

const THEMES = {
  park: {
    name: '숲속 공원', desc: '기본 코스 · 나무와 꽃밭',
    ground: '#7ccf5a', groundDark: '#6bbd4b', road: '#6d717e',
    curbA: '#ff5a5a', curbB: '#ffffff', wallA: '#ff8a3d', wallB: '#fff3e0',
    width: 17, smooth: 40,
    points: [[0, -62], [45, -68], [88, -52], [102, -16], [86, 14], [60, 28], [50, 54], [62, 80], [50, 104],
      [16, 112], [-26, 100], [-52, 70], [-86, 46], [-98, 4], [-78, -36], [-40, -58]],
    zone: null,
  },
  desert: {
    name: '사막 협곡', desc: '모래 구간은 느려져요 · 굴러다니는 바위',
    ground: '#f0c27a', groundDark: '#e6b266', road: '#8b7869',
    curbA: '#ff7b39', curbB: '#fff4e0', wallA: '#c8743f', wallB: '#f2d1a0',
    width: 18, smooth: 60,
    points: [[0, -80], [60, -82], [110, -60], [120, -10], [95, 25], [55, 30], [30, 55], [40, 95], [0, 115],
      [-50, 100], [-70, 60], [-110, 40], [-120, -10], [-90, -60], [-45, -78]],
    zone: { type: 'sand', name: '모래', grip: 0.8, drag: 1.3, color: '#e9c27d', edge: '#d6a65c', count: 6, radius: 5.5, where: 'inner' },
  },
  snow: {
    name: '눈 덮인 마을', desc: '빙판에서는 쭉 미끄러져요',
    ground: '#f3f7ff', groundDark: '#e4ecf8', road: '#7d8ba0',
    curbA: '#3d8bff', curbB: '#ffffff', wallA: '#9fd3ff', wallB: '#ffffff',
    width: 16, smooth: 60,
    points: [[0, -55], [40, -60], [70, -35], [60, -5], [25, 5], [20, 35], [50, 55], [45, 90], [5, 95], [-25, 70],
      [-55, 85], [-85, 60], [-82, 22], [-60, -6], [-56, -38], [-30, -58]],
    zone: { type: 'ice', name: '빙판', grip: 0.36, drag: 0, color: '#bfe8ff', edge: '#8fd0ff', count: 5, radius: 6.5, where: 'center' },
  },
  candy: {
    name: '과자 나라', desc: '젤리 벽과 범퍼는 통통 튕겨요 · 초콜릿 웅덩이',
    ground: '#ffa6d2', groundDark: '#ff96c8', road: '#b7835a',
    curbA: '#ff4fa0', curbB: '#ffffff', wallA: '#7be0c0', wallB: '#ffe066',
    width: 17, smooth: 60, wallBounce: 0.85,
    points: [[0, -60], [50, -62], [85, -35], [82, 6], [50, 20], [38, 46], [54, 72], [30, 100], [-12, 98],
      [-34, 72], [-62, 78], [-92, 40], [-82, -8], [-62, -34], [-34, -60]],
    zone: { type: 'choco', name: '초콜릿', grip: 0.9, drag: 1.7, color: '#6b3a22', edge: '#4a2414', count: 5, radius: 4.8, where: 'side' },
  },
};

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 닫힌 구심(centripetal) 캣멀-롬 곡선을 촘촘한 점열로
function catmullRomClosed(pts, perSeg = 40) {
  const n = pts.length, out = [];
  const tj = (ti, a, b) => ti + Math.pow(Math.hypot(b.x - a.x, b.z - a.z), 0.5) || ti + 1e-4;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    for (let k = 0; k < perSeg; k++) {
      const t = t1 + (t2 - t1) * k / perSeg;
      const L = (a, b, ta, tb) => ({
        x: (tb - t) / (tb - ta) * a.x + (t - ta) / (tb - ta) * b.x,
        z: (tb - t) / (tb - ta) * a.z + (t - ta) / (tb - ta) * b.z,
      });
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  return out;
}

// 닫힌 점열을 같은 간격 N개로 다시 뽑기
function resampleClosed(pts, N) {
  const n = pts.length, cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = pts[i - 1], b = pts[i % n];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = cum[n], out = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const d = total * k / N;
    while (cum[j + 1] < d) j++;
    const a = pts[j], b = pts[(j + 1) % n];
    const f = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
  }
  return { pts: out, length: total };
}

class Track {
  constructor(themeKey = 'park') {
    this.key = themeKey;
    this.theme = THEMES[themeKey];
    this.halfW = this.theme.width / 2;
    this.curbW = 1.1;
    this.wallOffset = this.halfW + this.curbW + 0.5;
    this.rng = mulberry32(themeKey.length * 7919 + 3);
    this.N = 360;

    const ctrl = this.theme.points.map(p => ({ x: p[0], z: p[1] }));
    let s = resampleClosed(catmullRomClosed(ctrl), this.N).pts;
    for (let k = 0; k < this.theme.smooth; k++) {   // 라플라시안 평활화
      s = s.map((p, i) => {
        const a = s[(i - 1 + this.N) % this.N], b = s[(i + 1) % this.N];
        return { x: a.x * 0.25 + p.x * 0.5 + b.x * 0.25, z: a.z * 0.25 + p.z * 0.5 + b.z * 0.25 };
      });
    }
    const r = resampleClosed(catmullRomClosed(s, 4), this.N);
    this.samples = r.pts;
    this.length = r.length;
    this.segLen = this.length / this.N;

    this.tangents = []; this.lefts = [];
    for (let i = 0; i < this.N; i++) {
      const a = this.samples[(i - 1 + this.N) % this.N], b = this.samples[(i + 1) % this.N];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const t = { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
      this.tangents.push(t);
      this.lefts.push({ x: t.z, z: -t.x });
    }
    this.curv = [];
    for (let i = 0; i < this.N; i++) {
      let d = this.headingAt(i + 3) - this.headingAt(i - 3); d = Math.atan2(Math.sin(d), Math.cos(d));
      this.curv.push(d / (6 * this.segLen));
    }
    this.bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of this.samples) {
      const b = this.bounds;
      b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
      b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
    }
    this.zones = []; this.bumpers = []; this.propDefs = []; this.decor = [];
    this.planHazards();
    this.planDecor();
  }

  // ---------- 조회 (3D 버전과 같은 API) ----------
  wallPolylines() {
    const L = [], R = [];
    for (let i = 0; i < this.N; i++) {
      L.push(this.pointAt(i, this.wallOffset));
      R.push(this.pointAt(i, -this.wallOffset));
    }
    return [L, R];
  }
  nearestIndex(x, z, hint = -1) {
    let best = 0, bd = Infinity;
    const scan = (i) => {
      const s = this.samples[(i + this.N) % this.N];
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd) { bd = d; best = (i + this.N) % this.N; }
    };
    if (hint >= 0) for (let k = -20; k <= 20; k++) scan(hint + k);
    if (hint < 0 || bd > 400) for (let i = 0; i < this.N; i++) scan(i);
    return best;
  }
  headingAt(i) { const t = this.tangents[((i % this.N) + this.N) % this.N]; return Math.atan2(t.x, t.z); }
  pointAt(i, side = 0) {
    i = ((i % this.N) + this.N) % this.N;
    const c = this.samples[i], l = this.lefts[i];
    return { x: c.x + l.x * side, z: c.z + l.z * side };
  }
  lateral(i, x, z) {
    const c = this.samples[i], l = this.lefts[i];
    return (x - c.x) * l.x + (z - c.z) * l.z;
  }
  surfaceAt(x, z) {
    for (const zn of this.zones) if ((x - zn.x) ** 2 + (z - zn.z) ** 2 < zn.r * zn.r * 0.85) return zn;
    return null;
  }
  farFromTrack(x, z, margin) {
    for (let i = 0; i < this.N; i += 2) {
      const s = this.samples[i];
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < margin * margin) return false;
    }
    return true;
  }
  corners(count, minGap = 35) {
    const cand = [];
    for (let i = 0; i < this.N; i++) {
      const c = Math.abs(this.curv[i]);
      if (c >= Math.abs(this.curv[(i + 1) % this.N]) && c >= Math.abs(this.curv[(i - 1 + this.N) % this.N])) cand.push(i);
    }
    cand.sort((a, b) => Math.abs(this.curv[b]) - Math.abs(this.curv[a]));
    const out = [];
    for (const i of cand) {
      if (out.every(j => Math.min(Math.abs(i - j), this.N - Math.abs(i - j)) > minGap)) out.push(i);
      if (out.length >= count) break;
    }
    return out.filter(i => i > 20 && i < this.N - 20).sort((a, b) => a - b);
  }
  straights(count, minGap = 30) {
    const out = [];
    const order = [...Array(this.N).keys()].filter(i => i > 30 && i < this.N - 25)
      .sort((a, b) => Math.abs(this.curv[a]) - Math.abs(this.curv[b]));
    for (const i of order) {
      if (out.every(j => Math.min(Math.abs(i - j), this.N - Math.abs(i - j)) > minGap)) out.push(i);
      if (out.length >= count) break;
    }
    return out.sort((a, b) => a - b);
  }

  // ---------- 노면 구간·장애물 ----------
  planHazards() {
    const zn = this.theme.zone;
    if (zn) {
      this.corners(zn.count, 40).forEach((i, k) => {
        let side = 0;
        const inner = Math.sign(this.curv[i]) || 1;
        if (zn.where === 'inner') side = inner * (this.halfW - zn.radius * 0.55);
        else if (zn.where === 'side') side = (k % 2 ? 1 : -1) * (this.halfW * 0.45);
        const idx = zn.where === 'center' ? i : (i + 4) % this.N;
        const p = this.pointAt(idx, side);
        this.zones.push({ x: p.x, z: p.z, r: zn.radius, type: zn.type, grip: zn.grip, drag: zn.drag, name: zn.name, rot: this.rng() * 6, seed: this.rng() * 10 });
      });
    }
    if (this.key === 'desert') {
      this.straights(4, 45).forEach((i, k) => {
        for (const s of (k % 2 ? [-3.5, 3] : [2.5])) this.propDefs.push({ idx: i, side: s, type: 'boulder' });
      });
    }
    if (this.key === 'snow') {
      this.corners(4, 50).forEach((i) => {
        const outer = -Math.sign(this.curv[i]) || 1;
        this.propDefs.push({ idx: (i + 6) % this.N, side: outer * (this.halfW - 1.4), type: 'snowman' });
        this.propDefs.push({ idx: (i + 9) % this.N, side: outer * (this.halfW - 1.2), type: 'snowman' });
      });
    }
    if (this.key === 'candy') {
      this.straights(4, 40).forEach((i, k) => this.bumpers.push({ ...this.pointAt(i, (k % 2 ? 1 : -1) * 3.2), r: 1.5, wobble: 0 }));
    }
    if (this.key === 'park') {
      this.corners(3, 60).forEach((i) => {
        const outer = -Math.sign(this.curv[i]) || 1;
        for (let k = 0; k < 4; k++) this.propDefs.push({ idx: (i + 4 + k * 2) % this.N, side: outer * (this.halfW - 0.9 - (k % 2) * 0.8), type: 'cone' });
      });
    }
  }

  // ---------- 장식 배치 (그리기는 render.js) ----------
  scatter(type, count, margin, spread = 360) {
    let n = 0, tries = 0;
    while (n < count && tries++ < count * 30) {
      const x = (this.rng() - 0.5) * spread, z = (this.rng() - 0.5) * spread + 20;
      if (this.farFromTrack(x, z, this.wallOffset + margin)) {
        this.decor.push({ type, x, z, s: 0.75 + this.rng() * 0.9, t: this.rng() });
        n++;
      }
    }
  }
  planDecor() {
    const k = this.key;
    if (k === 'park') { this.scatter('flower', 260, 2, 300); this.scatter('tree', 170, 4); }
    if (k === 'desert') { this.scatter('rock', 60, 4); this.scatter('cactus', 90, 3); this.scatter('mesa', 10, 30, 420); }
    if (k === 'snow') { this.scatter('house', 16, 8); this.scatter('pine', 150, 4); }
    if (k === 'candy') { this.scatter('gumdrop', 120, 2); this.scatter('cupcake', 18, 10); this.scatter('lollipop', 70, 4); }
    // 큰 것(그림자 길게)이 위에 그려지도록 정렬
    const order = { flower: 0, rock: 1, gumdrop: 1, cactus: 2, house: 2, cupcake: 2, tree: 3, pine: 3, lollipop: 3, mesa: 4 };
    this.decor.sort((a, b) => order[a.type] - order[b.type]);
  }
}
