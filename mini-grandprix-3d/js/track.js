// =============================================================
//  트랙: 테마별 코스 + 노면 구간(모래·빙판·초콜릿) + 장애물 + 장식
// =============================================================
import * as THREE from 'three';

export const THEMES = {
  park: {
    name: '숲속 공원', desc: '기본 코스 · 나무와 꽃밭',
    sky: 0x9fd8ff, fog: 0xc9ecff, ground: 0x7ccf5a, groundDark: 0x6bbd4b,
    road: 0x6d717e, curbA: 0xff5a5a, curbB: 0xffffff, wallA: 0xff8a3d, wallB: 0xfff3e0,
    hemiSky: 0xdff4ff, hemiGround: 0x7ccf5a, sun: 0xffffff,
    width: 17, smooth: 40,
    points: [[0, -62], [45, -68], [88, -52], [102, -16], [86, 14], [60, 28], [50, 54], [62, 80], [50, 104],
      [16, 112], [-26, 100], [-52, 70], [-86, 46], [-98, 4], [-78, -36], [-40, -58]],
    zone: null,
  },
  desert: {
    name: '사막 협곡', desc: '모래 구간은 느려져요 · 굴러다니는 바위',
    sky: 0xffcf96, fog: 0xffe2bd, ground: 0xf0c27a, groundDark: 0xe6b266,
    road: 0x8b7869, curbA: 0xff7b39, curbB: 0xfff4e0, wallA: 0xc8743f, wallB: 0xf2d1a0,
    hemiSky: 0xfff0d8, hemiGround: 0xe0a860, sun: 0xfff1d6,
    width: 18, smooth: 60,
    points: [[0, -80], [60, -82], [110, -60], [120, -10], [95, 25], [55, 30], [30, 55], [40, 95], [0, 115],
      [-50, 100], [-70, 60], [-110, 40], [-120, -10], [-90, -60], [-45, -78]],
    zone: { type: 'sand', name: '모래', grip: 0.8, drag: 1.3, color: '#e9c27d', edge: '#d6a65c', count: 6, radius: 5.5, where: 'inner' },
  },
  snow: {
    name: '눈 덮인 마을', desc: '빙판에서는 쭉 미끄러져요',
    sky: 0xbfe0ff, fog: 0xe6f2ff, ground: 0xf3f7ff, groundDark: 0xe4ecf8,
    road: 0x7d8ba0, curbA: 0x3d8bff, curbB: 0xffffff, wallA: 0x9fd3ff, wallB: 0xffffff,
    hemiSky: 0xeaf4ff, hemiGround: 0xc9d8ee, sun: 0xffffff,
    width: 16, smooth: 60,
    points: [[0, -55], [40, -60], [70, -35], [60, -5], [25, 5], [20, 35], [50, 55], [45, 90], [5, 95], [-25, 70],
      [-55, 85], [-85, 60], [-82, 22], [-60, -6], [-56, -38], [-30, -58]],
    zone: { type: 'ice', name: '빙판', grip: 0.36, drag: 0, color: '#bfe8ff', edge: '#8fd0ff', count: 5, radius: 6.5, where: 'center' },
  },
  candy: {
    name: '과자 나라', desc: '젤리 벽과 범퍼는 통통 튕겨요 · 초콜릿 웅덩이',
    sky: 0xffd3ee, fog: 0xffe6f5, ground: 0xffa6d2, groundDark: 0xff96c8,
    road: 0xb7835a, curbA: 0xff4fa0, curbB: 0xffffff, wallA: 0x7be0c0, wallB: 0xffe066,
    hemiSky: 0xfff0fa, hemiGround: 0xff9cc9, sun: 0xfff6fb,
    width: 17, smooth: 60, wallBounce: 0.85,
    points: [[0, -60], [50, -62], [85, -35], [82, 6], [50, 20], [38, 46], [54, 72], [30, 100], [-12, 98],
      [-34, 72], [-62, 78], [-92, 40], [-82, -8], [-62, -34], [-34, -60]],
    zone: { type: 'choco', name: '초콜릿', grip: 0.9, drag: 1.7, color: '#6b3a22', edge: '#4a2414', count: 5, radius: 4.8, where: 'side' },
  },
};

const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export class Track {
  constructor(scene, themeKey = 'park') {
    this.key = themeKey;
    this.theme = THEMES[themeKey];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.halfW = this.theme.width / 2;
    this.curbW = 1.1;
    this.wallOffset = this.halfW + this.curbW + 0.5; // 물리 벽 위치
    this.rng = mulberry32(themeKey.length * 7919 + 3);

    const pts = this.theme.points.map(p => new THREE.Vector3(p[0], 0, p[1]));
    this.N = 360;
    let s = new THREE.CatmullRomCurve3(pts, true, 'centripetal').getSpacedPoints(this.N).slice(0, this.N);
    // 라플라시안 평활화: 급커브를 완만하게 (안쪽 벽이 겹치지 않도록)
    for (let k = 0; k < this.theme.smooth; k++) {
      s = s.map((p, i) => new THREE.Vector3()
        .addScaledVector(s[(i - 1 + this.N) % this.N], 0.25).addScaledVector(p, 0.5)
        .addScaledVector(s[(i + 1) % this.N], 0.25));
    }
    this.curve = new THREE.CatmullRomCurve3(s, true, 'centripetal');
    this.samples = this.curve.getSpacedPoints(this.N).slice(0, this.N);
    this.length = this.curve.getLength();
    this.segLen = this.length / this.N;

    this.tangents = []; this.lefts = [];
    for (let i = 0; i < this.N; i++) {
      const a = this.samples[(i - 1 + this.N) % this.N], b = this.samples[(i + 1) % this.N];
      const t = new THREE.Vector3().subVectors(b, a).normalize();
      this.tangents.push(t);
      this.lefts.push(new THREE.Vector3(t.z, 0, -t.x)); // forward(sinθ,cosθ) 기준 왼쪽
    }
    // 부호 있는 곡률 (+ = 왼쪽으로 굽음)
    this.curv = [];
    for (let i = 0; i < this.N; i++) {
      const h0 = this.headingAt((i - 3 + this.N) % this.N), h1 = this.headingAt((i + 3) % this.N);
      let d = h1 - h0; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.curv.push(d / (6 * this.segLen));
    }

    this.zones = [];       // 노면 구간
    this.bumpers = [];     // 고정 범퍼 (과자 나라)
    this.propDefs = [];    // 굴러다니는 바위·눈사람 등

    this.buildGround();
    this.buildRoad();
    this.buildCurbsAndWalls();
    this.buildStartLine();
    this.planHazards();
    this.buildZones();
    this.buildDecor();
  }

  // ---------- 조회 ----------
  wallPolylines() {
    const L = [], R = [];
    for (let i = 0; i < this.N; i++) {
      const c = this.samples[i], l = this.lefts[i];
      L.push({ x: c.x + l.x * this.wallOffset, z: c.z + l.z * this.wallOffset });
      R.push({ x: c.x - l.x * this.wallOffset, z: c.z - l.z * this.wallOffset });
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
  headingAt(i) { const t = this.tangents[(i + this.N) % this.N]; return Math.atan2(t.x, t.z); }
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
    for (const zn of this.zones) {
      if ((x - zn.x) ** 2 + (z - zn.z) ** 2 < zn.r * zn.r * 0.85) return zn;
    }
    return null;
  }
  farFromTrack(x, z, margin) {
    for (let i = 0; i < this.N; i += 2) {
      const s = this.samples[i];
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < margin * margin) return false;
    }
    return true;
  }

  // 커브 정점 찾기 (장애물 배치용)
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

  // ---------- 바닥 ----------
  buildGround() {
    const th = this.theme;
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = hex(th.ground); g.fillRect(0, 0, 256, 256);
    g.fillStyle = hex(th.groundDark);
    if (this.key === 'park') {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 64, y * 64, 64, 64);
    } else if (this.key === 'desert') {
      for (let y = 0; y < 256; y += 32) { g.beginPath(); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 20) * 6); g.lineTo(256, y + 14); g.lineTo(0, y + 14); g.fill(); }
    } else if (this.key === 'candy') {
      for (let i = 0; i < 70; i++) { // 스프링클
        g.fillStyle = ['#ffffff', '#ffe066', '#7be0c0', '#8fb8ff', '#ff6fa8'][i % 5];
        g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.rotate(Math.random() * 3);
        g.fillRect(-6, -2, 12, 4); g.restore();
      }
    }
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(60, 60);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  strip(inner, outer, y, uScale = 1) {
    const N = this.N;
    const pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4);
    let dist = 0;
    for (let k = 0; k <= N; k++) {
      const i = k % N, c = this.samples[i], l = this.lefts[i];
      if (k > 0) dist += this.samples[i].distanceTo(this.samples[(k - 1) % N]);
      pos.set([c.x + l.x * inner, y, c.z + l.z * inner, c.x + l.x * outer, y, c.z + l.z * outer], k * 6);
      uv.set([0, dist * uScale, 1, dist * uScale], k * 4);
    }
    const idx = [];
    for (let k = 0; k < N; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  buildRoad() {
    const th = this.theme;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = hex(th.road); g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
      g.fillRect(Math.random() * 128, Math.random() * 256, 1.5, 1.5);
    }
    if (this.key === 'candy') { // 비스킷 구멍
      g.fillStyle = 'rgba(90,50,25,0.35)';
      for (let y = 20; y < 256; y += 64) for (const x of [32, 96]) { g.beginPath(); g.arc(x, y + (x === 96 ? 32 : 0), 4, 0, 7); g.fill(); }
    }
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(3, 0, 3, 256); g.fillRect(122, 0, 3, 256);
    g.fillStyle = 'rgba(255,240,180,0.9)';
    g.fillRect(62, 0, 4, 120);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const road = new THREE.Mesh(this.strip(this.halfW, -this.halfW, 0.0, 1 / 9),
      new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    road.receiveShadow = true;
    this.group.add(road);
  }

  buildCurbsAndWalls() {
    const th = this.theme, N = this.N;
    for (const side of [1, -1]) {
      const g2 = this.strip(side * this.halfW, side * (this.halfW + this.curbW), 0.03).toNonIndexed();
      const ca = new THREE.Color(th.curbA), cb = new THREE.Color(th.curbB);
      const cnt = g2.attributes.position.count;
      const colors = new Float32Array(cnt * 3);
      for (let t = 0; t < cnt / 6; t++) {
        const c = (Math.floor(t / 2) % 2) ? ca : cb;
        for (let v = 0; v < 6; v++) colors.set([c.r, c.g, c.b], (t * 6 + v) * 3);
      }
      g2.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const m = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      m.receiveShadow = true;
      this.group.add(m);
    }
    // 방호벽 (과자 나라는 둥근 젤리 벽)
    const H = this.key === 'candy' ? 1.1 : 0.9, T = 0.5;
    for (const side of [1, -1]) {
      const pos = [], colors = [], idx = [];
      const ca = new THREE.Color(th.wallA), cb = new THREE.Color(th.wallB);
      let vi = 0;
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const c = (Math.floor(i / 3) % 2) ? ca : cb;
        const quad = (o1, o2, y1, y2) => {
          for (const [k, o, y] of [[i, o1, y1], [j, o1, y1], [j, o2, y2], [i, o2, y2]]) {
            const s = this.samples[k], l = this.lefts[k];
            pos.push(s.x + l.x * o * side, y, s.z + l.z * o * side);
            colors.push(c.r, c.g, c.b);
          }
          idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          vi += 4;
        };
        const w0 = this.wallOffset - 0.05, w1 = w0 + T;
        quad(w0, w0, 0, H); quad(w0, w1, H, H); quad(w1, w1, H, 0);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = this.key === 'candy'
        ? new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.88, emissive: 0x222222 })
        : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
  }

  buildStartLine() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32;
    const g = cv.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#222' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16);
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(this.halfW * 2, 2.2), new THREE.MeshLambertMaterial({ map: tex }));
    m.rotation.x = -Math.PI / 2;
    const s = this.samples[0];
    m.position.set(s.x, 0.04, s.z);
    m.rotation.z = this.headingAt(0);
    m.receiveShadow = true;
    this.group.add(m);
    const archMat = new THREE.MeshLambertMaterial({ color: 0xffd23f });
    const l = this.lefts[0];
    for (const sd of [1, -1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 7, 12), archMat);
      pole.position.set(s.x + l.x * (this.wallOffset + 0.6) * sd, 3.5, s.z + l.z * (this.wallOffset + 0.6) * sd);
      pole.castShadow = true;
      this.group.add(pole);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry((this.wallOffset + 0.6) * 2, 1.6, 0.6), new THREE.MeshLambertMaterial({ map: tex }));
    beam.position.set(s.x, 7, s.z);
    beam.rotation.y = this.headingAt(0);
    beam.castShadow = true;
    this.group.add(beam);
  }

  // ---------- 노면 구간·장애물 계획 ----------
  planHazards() {
    const zn = this.theme.zone;
    if (zn) {
      const spots = this.corners(zn.count, 40);
      spots.forEach((i, k) => {
        let side = 0;
        const inner = Math.sign(this.curv[i]) || 1;
        if (zn.where === 'inner') side = inner * (this.halfW - zn.radius * 0.55);
        else if (zn.where === 'side') side = (k % 2 ? 1 : -1) * (this.halfW * 0.45);
        const idx = zn.where === 'center' ? i : (i + 4) % this.N;
        const p = this.pointAt(idx, side);
        this.zones.push({ x: p.x, z: p.z, r: zn.radius, type: zn.type, grip: zn.grip, drag: zn.drag, name: zn.name });
      });
    }
    if (this.key === 'desert') {
      // 굴러다니는 바위: 직선 구간에 2~3개씩
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
      this.straights(4, 40).forEach((i, k) => {
        this.bumpers.push({ ...this.pointAt(i, (k % 2 ? 1 : -1) * 3.2), r: 1.5 });
      });
    }
    if (this.key === 'park') {
      this.corners(3, 60).forEach((i) => {
        const outer = -Math.sign(this.curv[i]) || 1;
        for (let k = 0; k < 4; k++) this.propDefs.push({ idx: (i + 4 + k * 2) % this.N, side: outer * (this.halfW - 0.9 - (k % 2) * 0.8), type: 'cone' });
      });
    }
  }

  buildZones() {
    for (const zn of this.zones) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const g = cv.getContext('2d');
      const zdef = this.theme.zone;
      // 울퉁불퉁한 얼룩 모양
      const blob = (r, color) => {
        g.fillStyle = color; g.beginPath();
        for (let a = 0; a <= 24; a++) {
          const t = a / 24 * Math.PI * 2;
          const rr = r * (0.85 + Math.sin(t * 3 + zn.x) * 0.08 + Math.cos(t * 5 + zn.z) * 0.06);
          g.lineTo(64 + Math.cos(t) * rr, 64 + Math.sin(t) * rr);
        }
        g.fill();
      };
      blob(62, zdef.edge); blob(54, zdef.color);
      if (zn.type === 'ice') {
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3;
        for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(30 + k * 12, 40 + k * 5); g.lineTo(44 + k * 12, 30 + k * 6); g.stroke(); }
      } else if (zn.type === 'sand') {
        g.strokeStyle = 'rgba(160,110,50,0.35)'; g.lineWidth = 2;
        for (let y = 30; y < 100; y += 10) { g.beginPath(); for (let x = 20; x < 110; x += 6) g.lineTo(x, y + Math.sin(x / 8) * 3); g.stroke(); }
      } else if (zn.type === 'choco') {
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(48, 46, 16, 7, -0.4, 0, 7); g.fill();
      }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.CircleGeometry(zn.r, 28), new THREE.MeshLambertMaterial({
        map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
        opacity: zn.type === 'ice' ? 0.85 : 1, emissive: zn.type === 'ice' ? 0x223344 : 0x000000,
      }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = this.rng() * 6;
      m.position.set(zn.x, 0.05, zn.z);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  // ---------- 장식 ----------
  scatter(count, margin, spread = 360) {
    const out = []; let tries = 0;
    while (out.length < count && tries++ < count * 30) {
      const x = (this.rng() - 0.5) * spread, z = (this.rng() - 0.5) * spread + 20;
      if (this.farFromTrack(x, z, this.wallOffset + margin)) out.push({ x, z, s: 0.75 + this.rng() * 0.9, t: this.rng() });
    }
    return out;
  }

  instanced(geo, mat, items, place, colors) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m4 = new THREE.Matrix4();
    items.forEach((it, i) => {
      place(m4, it, i); mesh.setMatrixAt(i, m4);
      if (colors) mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    });
    mesh.castShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  buildDecor() {
    const V = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;
    const compose = (m4, x, y, z, s, ry = 0, sy) => m4.compose(new V(x, y, z), new Q().setFromEuler(new E(0, ry, 0)), new V(s, sy ?? s, s));
    const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
    const k = this.key;

    if (k === 'park') {
      const trees = this.scatter(170, 4);
      this.instanced(new THREE.CylinderGeometry(0.35, 0.5, 2, 8), lam(0x8a5a3b), trees, (m, t) => compose(m, t.x, t.s, t.z, t.s));
      this.instanced(new THREE.IcosahedronGeometry(2.2, 0), lam(0xffffff, { flatShading: true }), trees,
        (m, t) => compose(m, t.x, t.s * 3.2, t.z, t.s, t.t * 6), [0x3fa34d, 0x56b85a, 0x2f8f46, 0x7bc95f]);
      const fl = this.scatter(260, 2, 300);
      const fm = this.instanced(new THREE.SphereGeometry(0.35, 6, 5), lam(0xffffff), fl, (m, t) => compose(m, t.x, 0.2, t.z, 1), [0xff6b9a, 0xffd23f, 0xffffff, 0xb08cff]);
      fm.castShadow = false;
    }
    if (k === 'desert') {
      const cacti = this.scatter(90, 3);
      const cm = lam(0x3f9b5a);
      this.instanced(new THREE.CapsuleGeometry(0.55, 3.2, 4, 10), cm, cacti, (m, t) => compose(m, t.x, 2.1 * t.s, t.z, t.s));
      const armGeo = new THREE.CapsuleGeometry(0.35, 1.2, 4, 8);
      this.instanced(armGeo, cm, cacti, (m, t) => compose(m, t.x + 0.8 * t.s, 2.6 * t.s, t.z, t.s));
      this.instanced(armGeo, cm, cacti, (m, t) => compose(m, t.x - 0.8 * t.s, 3.0 * t.s, t.z, t.s * 0.85));
      const rocks = this.scatter(60, 4);
      this.instanced(new THREE.DodecahedronGeometry(1.4, 0), lam(0xd08a52, { flatShading: true }), rocks,
        (m, t) => compose(m, t.x, 0.6 * t.s, t.z, t.s * 1.2, t.t * 6, t.s * 0.8), [0xd08a52, 0xc47a45, 0xe0a068]);
      // 멀리 보이는 메사(탁상지)
      const mesas = [];
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; mesas.push({ x: Math.cos(a) * 260, z: Math.sin(a) * 260 + 20, s: 1 + this.rng() * 0.8, t: this.rng() }); }
      const mm = this.instanced(new THREE.CylinderGeometry(22, 30, 40, 7), lam(0xc8743f, { flatShading: true }), mesas,
        (m, t) => compose(m, t.x, 18 * t.s, t.z, t.s, t.t * 6), [0xc8743f, 0xb9653a, 0xd98c52]);
      mm.castShadow = false;
    }
    if (k === 'snow') {
      const pines = this.scatter(150, 4);
      this.instanced(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 6), lam(0x7a5236), pines, (m, t) => compose(m, t.x, 0.7 * t.s, t.z, t.s));
      for (const [y, r, h] of [[2.2, 2.2, 2.6], [3.7, 1.7, 2.2], [5.0, 1.1, 1.8]]) {
        this.instanced(new THREE.ConeGeometry(r, h, 7), lam(0x2f7d5b, { flatShading: true }), pines, (m, t) => compose(m, t.x, y * t.s, t.z, t.s, t.t * 6));
        this.instanced(new THREE.ConeGeometry(r * 0.55, h * 0.45, 7), lam(0xffffff, { flatShading: true }), pines, (m, t) => compose(m, t.x, (y + h * 0.3) * t.s, t.z, t.s, t.t * 6));
      }
      // 작은 집들
      const houses = this.scatter(16, 8);
      this.instanced(new THREE.BoxGeometry(5, 3.5, 4.5), lam(0xffffff), houses, (m, t) => compose(m, t.x, 1.75, t.z, 1, t.t * 6), [0xff8a80, 0xffd180, 0x82b1ff, 0xb9f6ca]);
      this.instanced(new THREE.ConeGeometry(4.3, 2.6, 4), lam(0xffffff, { flatShading: true }), houses, (m, t) => compose(m, t.x, 4.8, t.z, 1, t.t * 6 + Math.PI / 4));
      // 눈송이
      const n = 900, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([(this.rng() - 0.5) * 160, this.rng() * 40, (this.rng() - 0.5) * 160], i * 3);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
      this.snow.frustumCulled = false;
      this.group.add(this.snow);
    }
    if (k === 'candy') {
      const pops = this.scatter(70, 4);
      this.instanced(new THREE.CylinderGeometry(0.18, 0.18, 5, 6), lam(0xffffff), pops, (m, t) => compose(m, t.x, 2.5 * t.s, t.z, t.s));
      const disc = new THREE.CylinderGeometry(1.8, 1.8, 0.45, 20); disc.rotateX(Math.PI / 2);
      this.instanced(disc, lam(0xffffff), pops, (m, t) => compose(m, t.x, 5.6 * t.s, t.z, t.s, t.t * 6), [0xff4fa0, 0x7be0c0, 0xffe066, 0x8fb8ff, 0xff8a5c]);
      const drops = this.scatter(120, 2);
      const dm = new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      this.instanced(dm, lam(0xffffff, { transparent: true, opacity: 0.9 }), drops, (m, t) => compose(m, t.x, 0, t.z, t.s, 0, t.s * 1.3), [0xff5a8a, 0x5ad1ff, 0xffd84a, 0x9b7bff, 0x5be39b]);
      // 컵케이크 언덕
      const cakes = this.scatter(18, 10);
      this.instanced(new THREE.CylinderGeometry(5, 4, 4, 14), lam(0xc98b5e), cakes, (m, t) => compose(m, t.x, 2, t.z, t.s));
      this.instanced(new THREE.SphereGeometry(5.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xffffff), cakes, (m, t) => compose(m, t.x, 4, t.z, t.s, 0, t.s * 0.9), [0xfff0f6, 0xffc6e0, 0xc9f2ff]);
      // 젤리 범퍼
      for (const b of this.bumpers) {
        const grp = new THREE.Group();
        const jelly = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.08, 1.6, 20),
          lam(0x52e0ff, { transparent: true, opacity: 0.85, emissive: 0x115566 }));
        jelly.position.y = 0.8; jelly.castShadow = true;
        const top = new THREE.Mesh(new THREE.SphereGeometry(b.r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), jelly.material);
        top.position.y = 1.6; top.scale.y = 0.4;
        grp.add(jelly, top);
        grp.position.set(b.x, 0, b.z);
        b.mesh = grp;
        this.group.add(grp);
      }
    }

    // 구름 (모든 테마)
    const cloudMat = lam(0xffffff, { emissive: 0x666666 });
    this.clouds = [];
    for (let i = 0; i < 12; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(this.rng() * 3);
      for (let j = 0; j < n; j++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + this.rng() * 3, 1), cloudMat);
        b.position.set(j * 4 - n * 2, this.rng() * 2, this.rng() * 3);
        c.add(b);
      }
      c.position.set((this.rng() - 0.5) * 400, 45 + this.rng() * 25, (this.rng() - 0.5) * 400);
      c.userData.speed = 1 + this.rng() * 2;
      this.clouds.push(c); this.group.add(c);
    }
  }

  update(dt, focus) {
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 220) c.position.x = -220;
    }
    if (this.snow && focus) {
      const p = this.snow.geometry.attributes.position, a = p.array;
      for (let i = 0; i < a.length; i += 3) {
        a[i + 1] -= dt * (3 + (i % 7) * 0.3);
        a[i] += Math.sin(a[i + 1] * 0.3 + i) * dt * 0.5;
        if (a[i + 1] < 0) a[i + 1] += 40;
      }
      p.needsUpdate = true;
      this.snow.position.set(Math.round(focus.x / 40) * 40, 0, Math.round(focus.z / 40) * 40);
    }
    for (const b of this.bumpers) if (b.mesh && b.wobble > 0) {
      b.wobble = Math.max(0, b.wobble - dt * 2.5);
      const w = Math.sin(b.wobble * 30) * b.wobble * 0.25;
      b.mesh.scale.set(1 + w, 1 - w, 1 + w);
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse(o => { o.geometry && o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map && m.map.dispose(); m.dispose(); }); } });
  }
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
