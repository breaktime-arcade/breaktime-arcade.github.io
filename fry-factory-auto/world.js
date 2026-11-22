/* =========================================================================
   프라이 팩토리: 오토 디펜스 — 3D 월드 (Three.js r160)  ·  HQ EDITION
   가게·주방·컨베이어·탈피대·튀김기·드라이브스루·마당·도로·조명·하늘
   - 절차적 고해상도 텍스처(map / roughnessMap / bumpMap)
   - 하늘 그라데이션 돔 + 별 + 달 + 구름, 시간대별 안개·조명
   - 네온 간판·가로등·자동차 헤드라이트 등 발광 요소(Bloom 연동)
   - 나무·덤불·원경 실루엣·소품으로 꽉 찬 다이오라마
   - 정적 장식은 지오메트리 병합으로 드로우콜 절감
   ========================================================================= */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const L = {
  shop: { x0: -9, x1: 9, z0: -11, z1: -0.5, wallH: 3.0 },
  belt: { x: -3, z0: 8.6, z1: -1.5, y: 0.98, w: 1.2 },
  peeler: { x: -3, z: -3.05 },
  fryer: { x: 0.9, z: -3.35, span: 2.5 },
  ready: { x: 4.25, z: -2.0 },
  window: { x: 9, z: -4.65, w: 3.3, y0: 0.95, y1: 2.5 },
  ledge: { x: 10.2, z: -4.65 },
  carStop: { x: 12.4, z: -4.65 },
  road: { x0: 11.55, x1: 16.8 },
  piles: [
    { key: 'normal', x: -6.4, z: 4.6 },
    { key: 'gold', x: 0.4, z: 7.2 },
    { key: 'crystal', x: 6.4, z: 4.4 },
  ],
  hatch: { x: 7.9, z: 8.6 },
  breaker: { x: -9.38, z: -2.6 },
  turret: { x: 7.35, z: -4.65 },
  clerkHome: { x: 1.6, z: -0.4 },
  spawn: { car: { x: 12.6, z: -34 }, walk: { x: 10.95, z: -26 } },
  beltItemY: 1.12,
};

const C = {
  cream: 0xf7e7c8, cream2: 0xfff4dd, red: 0xd8452c, redDark: 0x9e2c17,
  roof: 0xb83a22, metal: 0xc8d0d8, steel: 0x8e979f, darkSteel: 0x5a626b,
  wood: 0xa9763f, woodDark: 0x7a5228, oil: 0xffb02e,
  grass: 0x76b45c, dirt: 0xbf9a63, asphalt: 0x4b4b52, concrete: 0xcfc8bb,
  potato: 0xc98b4b, gold: 0xffc93c, crystal: 0x7fe9ff,
};

/* ── 시드 랜덤 (스크린샷 재현성) ─────────────────────────────────────── */
let _seed = 0x5eed1234;
function srand(s) { _seed = s >>> 0; }
function rnd() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }
const rr = (a, b) => a + rnd() * (b - a);

/* ── 공용 머티리얼 헬퍼 ─────────────────────────────────────────────── */
let ENV = null;
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({
  color, roughness: 0.78, metalness: 0.04, envMapIntensity: 0.35, envMap: ENV,
}, o));

/* =========================================================================
   월드 빌드
   ========================================================================= */
export function buildWorld(_t, scene, opt = {}) {
  const SOFT = !!opt.soft;
  ENV = opt.env || null;
  const W = { anim: [], refs: {} };
  srand(0x5eed1234);

  const shared = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
    sph: new THREE.SphereGeometry(1, 16, 12),
  };

  /* ── 라이브 메시 헬퍼 (움직이거나 refs로 잡는 것) ─────────────────── */
  const box = (w, h, d, mat, x, y, z, parent = scene) => {
    const m = new THREE.Mesh(shared.box, mat);
    m.scale.set(w, h, d); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };
  const cyl = (rt, rb, h, mat, x, y, z, parent = scene, seg) => {
    const g = seg ? new THREE.CylinderGeometry(rt, rb, h, seg) : shared.cyl;
    const m = new THREE.Mesh(g, mat);
    if (!seg) m.scale.set(rt, h, rt);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };
  const sph = (r, mat, x, y, z, parent = scene) => {
    const m = new THREE.Mesh(shared.sph, mat);
    m.scale.setScalar(r); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };

  /* ── 정적 장식 배처: 머티리얼별 지오메트리 병합 ───────────────────── */
  const batches = new Map();
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function bAdd(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true, recv = true) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _v.set(x, y, z); _s.set(sx, sy, sz);
    geo.applyMatrix4(_m4.compose(_v, _q, _s));
    const key = mat.uuid + '|' + (cast ? 1 : 0) + (recv ? 1 : 0);
    let b = batches.get(key);
    if (!b) { b = { mat, cast, recv, geos: [] }; batches.set(key, b); }
    b.geos.push(geo);
    return geo;
  }
  const bBox = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, cast = true, recv = true) =>
    bAdd(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz, 1, 1, 1, cast, recv);
  const bCyl = (rt, rb, h, mat, x, y, z, seg = 12, rx = 0, ry = 0, rz = 0, cast = true, recv = true) =>
    bAdd(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rx, ry, rz, 1, 1, 1, cast, recv);
  const bSph = (r, mat, x, y, z, seg = 12, cast = true, recv = true, s = 1) =>
    bAdd(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.66 | 0)), mat, x, y, z, 0, 0, 0, 1, s, 1, cast, recv);
  const bCone = (r, h, mat, x, y, z, seg = 10, rx = 0, rz = 0, cast = true) =>
    bAdd(new THREE.ConeGeometry(r, h, seg), mat, x, y, z, rx, 0, rz, 1, 1, 1, cast, false);
  const bPlane = (w, h, mat, x, y, z, rx = -Math.PI / 2, ry = 0, cast = false, recv = true) =>
    bAdd(new THREE.PlaneGeometry(w, h), mat, x, y, z, rx, ry, 0, 1, 1, 1, cast, recv);

  function flushBatches() {
    batches.forEach((b) => {
      if (!b.geos.length) return;
      const merged = b.merging || mergeGeometries(b.geos, false);
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      b.geos.forEach((g) => g.dispose());
      b.geos.length = 0;
    });
    batches.clear();
  }

  /* ── 절차적 텍스처 ─────────────────────────────────────────────────── */
  const TEXCACHE = [];
  function tex(w, h, draw, o = {}) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (o.rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.rep[0], o.rep[1]); }
    if (o.clamp) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
    TEXCACHE.push(t);
    return t;
  }
  // 잔디 알갱이 노이즈
  function speckle(g, w, h, n, colors, smin, smax, alpha) {
    for (let i = 0; i < n; i++) {
      g.globalAlpha = alpha === undefined ? 1 : alpha;
      g.fillStyle = colors[(rnd() * colors.length) | 0];
      const s = rr(smin, smax);
      g.fillRect(rnd() * w, rnd() * h, s, s);
    }
    g.globalAlpha = 1;
  }

  const grassTex = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#5da347'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = ['#559a3e', '#69ad4e', '#4f8f3a', '#77bb58'][(rnd() * 4) | 0];
      g.globalAlpha = 0.55;
      const x = rnd() * w, y = rnd() * h, r = rr(10, 46);
      g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    speckle(g, w, h, 9000, ['#5f9c45', '#8acb6a', '#4f8d3c', '#98d47a'], 1, 2.6, 0.55);
    // 풀잎 결
    for (let i = 0; i < 2400; i++) {
      const x = rnd() * w, y = rnd() * h, len = rr(3, 8), a = rr(-0.7, 0.7);
      g.strokeStyle = ['#4f8d3c', '#64a349', '#8fd06f'][(rnd() * 3) | 0];
      g.globalAlpha = rr(0.25, 0.65);
      g.lineWidth = rr(0.7, 1.6);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len); g.stroke();
    }
    g.globalAlpha = 1;
  }, { rep: [38, 38] });

  const dirtTex = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#b98f5f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      g.fillStyle = ['#ab8253', '#c49a68', '#9d7749', '#cfa774'][(rnd() * 4) | 0];
      g.globalAlpha = 0.5;
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, rr(14, 60), rr(10, 40), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    speckle(g, w, h, 12000, ['#8f6a41', '#d6b184', '#7d5c37', '#e0c295'], 1, 2.4, 0.7);
    // 자갈
    for (let i = 0; i < 260; i++) {
      g.fillStyle = ['#a9a094', '#c3bcae', '#8d857a'][(rnd() * 3) | 0];
      g.globalAlpha = 0.75;
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, rr(1.5, 0.001 + 3.4), rr(1.2, 2.6), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    // 발자국 (점원 왕래)
    g.globalAlpha = 1;
    for (let i = 0; i < 22; i++) {
      const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI * 2;
      for (const off of [-7, 7]) {
        g.save(); g.translate(x + Math.cos(a + Math.PI / 2) * off, y + Math.sin(a + Math.PI / 2) * off);
        g.rotate(a);
        g.fillStyle = 'rgba(96,68,40,.34)';
        g.beginPath(); g.ellipse(0, 0, 8, 3.6, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(0, -4.5, 5, 2.4, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
    // 타이어 자국
    g.strokeStyle = 'rgba(88,64,40,.07)';
      g.lineWidth = 5; g.lineWidth = 7;
    for (const bx of [0.24, 0.52]) {
      g.beginPath();
      for (let y = 0; y < h; y += 8) {
        const x = bx * w + Math.sin(y * 0.02) * 6;
        y === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
      g.strokeStyle = 'rgba(88,64,40,.07)';
      g.lineWidth = 5;
    }
  }, { rep: [4, 3] });

  const asphaltTex = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#46464d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = ['#414148', '#4d4d55', '#3c3c43', '#525259'][(rnd() * 4) | 0];
      g.globalAlpha = 0.55;
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, rr(20, 90), rr(14, 60), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    speckle(g, w, h, 16000, ['#5c5c64', '#35353b', '#6b6b73', '#2e2e33'], 1, 2.2, 0.75);
    // 균열
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = 'rgba(28,28,32,.55)'; g.lineWidth = rr(1, 2.2);
      let x = rnd() * w, y = rnd() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += rr(-26, 26); y += rr(10, 40); g.lineTo(x, y); }
      g.stroke();
    }
    // 기름 얼룩
    for (let i = 0; i < 12; i++) {
      g.fillStyle = 'rgba(20,20,24,.24)';
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, rr(6, 22), rr(4, 14), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  }, { rep: [2, 16] });

  const concreteTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#cdc6b9'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5200, ['#c2bbad', '#d8d2c6', '#b9b2a5', '#e0dbd1'], 1, 2.2, 0.8);
    g.strokeStyle = 'rgba(120,116,105,.5)'; g.lineWidth = 2;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); }
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  }, { rep: [1, 24] });

  const tileTex = tex(512, 512, (g, w, h) => {
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#f2e8d4' : '#dbcbb0';
      g.fillRect(x * s, y * s, s, s);
      speckle(g, w, h, 0, []);
      g.strokeStyle = 'rgba(150,134,108,.5)'; g.lineWidth = 3;
      g.strokeRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
      // 얼룩
      g.globalAlpha = 0.12;
      g.fillStyle = '#9a8a6a';
      g.beginPath(); g.ellipse(x * s + rr(10, s - 10), y * s + rr(10, s - 10), rr(6, 26), rr(6, 20), rnd() * 3, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
  }, { rep: [6, 3.6] });

  const tileRough = tex(512, 512, (g, w, h) => {
    const n = 4, s = w / n;
    g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = 'rgb(80,80,80)';
      g.fillRect(x * s + 4, y * s + 4, s - 8, s - 8);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = 'rgba(140,140,140,.5)';
        g.fillRect(x * s + rr(4, s - 6), y * s + rr(4, s - 6), rr(1, 5), rr(1, 5));
      }
    }
  }, { rep: [6, 3.6], linear: true });

  const stuccoTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#f6e8cd'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 7000, ['#f0e0c2', '#fbf1dc', '#e9d7b8', '#fff7e6'], 1, 2.4, 0.8);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = 'rgba(214,196,164,.35)'; g.lineWidth = rr(0.6, 1.6);
      const x = rnd() * w, y = rnd() * h;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-14, 14), y + rr(-14, 14)); g.stroke();
    }
  }, { rep: [3, 1.6] });

  const roofTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#b23a22'; g.fillRect(0, 0, w, h);
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      g.fillStyle = r % 2 ? '#a8331e' : '#bf4028';
      g.fillRect(0, r * rh, w, rh - 2);
      g.fillStyle = 'rgba(60,16,8,.35)';
      g.fillRect(0, r * rh + rh - 3, w, 3);
      for (let c = 0; c < 6; c++) {
        const ox = (r % 2) * (w / 12);
        g.fillStyle = 'rgba(70,20,10,.28)';
        g.fillRect(ox + c * (w / 6), r * rh, 2, rh);
        g.fillStyle = 'rgba(255,150,110,.10)';
        g.fillRect(ox + c * (w / 6) + 3, r * rh + 2, w / 12, 3);
      }
    }
  }, { rep: [5, 2] });

  const woodTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#a9763f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = ['rgba(120,80,40,.35)', 'rgba(150,105,60,.35)', 'rgba(90,58,28,.28)'][(rnd() * 3) | 0];
      g.lineWidth = rr(0.6, 2.4);
      const y = rnd() * h;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin((x + y) * 0.06) * rr(1, 4));
      g.stroke();
    }
    g.strokeStyle = 'rgba(70,44,20,.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h * 0.52); g.lineTo(w, h * 0.52); g.stroke();
  }, { rep: [2, 2] });

  const steelTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9c2ca'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.strokeStyle = ['rgba(255,255,255,.16)', 'rgba(120,132,145,.20)', 'rgba(90,100,112,.12)'][(rnd() * 3) | 0];
      g.lineWidth = rr(0.4, 1.1);
      const y = rnd() * h;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + rr(-1, 1)); g.stroke();
    }
    speckle(g, w, h, 1500, ['#9aa4ad', '#d7dee4'], 1, 1.6, 0.4);
  }, { rep: [2, 2] });

  const steelRough = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      g.strokeStyle = ['rgba(140,140,140,.5)', 'rgba(70,70,70,.5)'][(rnd() * 2) | 0];
      g.lineWidth = rr(0.5, 1.4);
      const y = rnd() * h;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
  }, { rep: [2, 2], linear: true });

  const cloudTex = tex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = rr(w * 0.12, w * 0.88), y = rr(h * 0.35, h * 0.75), r = rr(12, 40);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,.85)');
      grd.addColorStop(0.55, 'rgba(255,255,255,.42)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2); g.fill();
    }
  }, { clamp: true });

  const moonTex = tex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5);
    grd.addColorStop(0, 'rgba(255,252,232,1)');
    grd.addColorStop(0.55, 'rgba(250,244,214,.95)');
    grd.addColorStop(0.72, 'rgba(240,235,205,.5)');
    grd.addColorStop(1, 'rgba(230,230,200,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(200,196,170,.35)';
      g.beginPath(); g.ellipse(rr(w * 0.32, w * 0.68), rr(h * 0.32, h * 0.68), rr(2, 8), rr(2, 7), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  }, { clamp: true });

  const signTex = tex(1024, 320, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#2a1608'); grd.addColorStop(0.5, '#3d220c'); grd.addColorStop(1, '#231106');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // 내부 은은한 광
    const gl = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.6);
    gl.addColorStop(0, 'rgba(255,170,60,.35)'); gl.addColorStop(1, 'rgba(255,140,20,0)');
    g.fillStyle = gl; g.fillRect(0, 0, w, h);
    // 네온 테두리
    g.shadowColor = '#ff9a2e'; g.shadowBlur = 26;
    g.strokeStyle = '#ffb347'; g.lineWidth = 7;
    g.strokeRect(18, 18, w - 36, h - 36);
    g.shadowBlur = 0;
    // 메인 텍스트
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff7b1a'; g.shadowBlur = 34;
    g.fillStyle = '#fff2c8';
    g.font = "bold 132px 'Jua','Noto Sans KR','Malgun Gothic',sans-serif";
    g.fillText('프라이 팩토리', w / 2, h * 0.44);
    g.shadowBlur = 12;
    g.fillStyle = '#ffd15c';
    g.font = "bold 46px 'Jua','Noto Sans KR',sans-serif";
    g.fillText('F R Y   F A C T O R Y   ·   A U T O   D E F E N S E', w / 2, h * 0.8);
    g.shadowBlur = 0;
    // 전구 점
    g.fillStyle = 'rgba(255,220,140,.95)';
    for (let i = 0; i < 15; i++) { g.beginPath(); g.arc(40 + i * (w - 80) / 14, h - 34, 5, 0, Math.PI * 2); g.fill(); }
  }, { clamp: true });

  const openTex = tex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff4d5e'; g.shadowBlur = 28;
    g.strokeStyle = '#ff8a9a'; g.lineWidth = 6;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#fff0f2';
    g.font = "bold 62px 'Jua',sans-serif";
    g.fillText('OPEN', w / 2, h * 0.54);
    g.shadowBlur = 0;
  }, { clamp: true });

  const driveTex = tex(512, 200, (g, w, h) => {
    g.fillStyle = '#1d150e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd34d'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffd34d'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ffb020'; g.shadowBlur = 16;
    g.font = "bold 78px 'Jua','Noto Sans KR',sans-serif";
    g.fillText('DRIVE THRU', w / 2, h * 0.4);
    g.font = "bold 38px 'Jua','Noto Sans KR',sans-serif";
    g.fillStyle = '#fff3d0';
    g.fillText('🍟  프라이  ·  감자튀김', w / 2, h * 0.76);
    g.shadowBlur = 0;
  }, { clamp: true });

  const menuTex = tex(512, 640, (g, w, h) => {
    g.fillStyle = '#241610'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,205,110,.5)'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#ffd34d'; g.textAlign = 'center';
    g.font = "bold 62px 'Jua','Noto Sans KR',sans-serif";
    g.shadowColor = '#ff9a20'; g.shadowBlur = 18;
    g.fillText('M E N U', w / 2, 92);
    g.shadowBlur = 0;
    const rows = [['🍟', '프라이', '$8'], ['🥔', '황금 프라이', '$24'], ['💎', '크리스탈 프라이', '$48'], ['🥤', '탄산수', '$3']];
    g.textAlign = 'left';
    rows.forEach((r, i) => {
      const y = 196 + i * 104;
      g.font = "44px 'Noto Sans KR',sans-serif";
      g.fillStyle = '#fff3d0'; g.fillText(r[0] + '  ' + r[1], 44, y);
      g.fillStyle = '#ffd34d'; g.font = "bold 44px 'Jua',sans-serif";
      g.fillText(r[2], w - 130, y);
      g.strokeStyle = 'rgba(255,220,150,.18)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(40, y + 26); g.lineTo(w - 40, y + 26); g.stroke();
    });
  }, { clamp: true });

  const boardTex = tex(256, 320, (g, w, h) => {
    g.fillStyle = '#f4e6c8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a5527'; g.fillRect(0, 0, w, 54);
    g.fillStyle = '#fff6de'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "bold 30px 'Jua',sans-serif";
    g.fillText('오늘의 메뉴', w / 2, 28);
    g.fillStyle = '#5c3a18'; g.textAlign = 'left';
    g.font = "21px 'Jua','Noto Sans KR',sans-serif";
    const lines = ['갓 튀긴 프라이  $8', '바삭바삭 소금간', '감자 풍년 이벤트', '드라이브스루 환영'];
    lines.forEach((t, i) => g.fillText(t, 20, 96 + i * 40));
    g.strokeStyle = '#c9a26a'; g.lineWidth = 3;
    g.strokeRect(10, 66, w - 20, h - 78);
  }, { clamp: true });

  const gravelTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#b3a894'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 6000, ['#9c9182', '#c7bda9', '#8b8172', '#d5ccba'], 1.5, 3.6, 0.9);
  }, { rep: [8, 8] });

  /* ── 머티리얼 ───────────────────────────────────────────────────────── */
  const M = {
    grass: std(0xffffff, { map: grassTex, roughness: 1, metalness: 0, envMapIntensity: 0.28 }),
    dirt: std(0xffffff, { map: dirtTex, roughness: 1, metalness: 0, envMapIntensity: 0.25 }),
    asphalt: std(0xffffff, { map: asphaltTex, roughness: 0.92, metalness: 0.06, envMapIntensity: 0.35 }),
    concrete: std(0xffffff, { map: concreteTex, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 }),
    gravel: std(0xffffff, { map: gravelTex, roughness: 1, metalness: 0, envMapIntensity: 0.25 }),
    tile: new THREE.MeshStandardMaterial({
      map: tileTex, roughnessMap: tileRough, roughness: 0.5, metalness: 0.12, envMapIntensity: 0.85,
    }),
    stucco: std(0xffffff, { map: stuccoTex, roughness: 0.92, metalness: 0, envMapIntensity: 0.3 }),
    stucco2: std(0xfdf3e0, { map: stuccoTex, roughness: 0.9, metalness: 0, envMapIntensity: 0.32 }),
    roof: std(0xffffff, { map: roofTex, roughness: 0.72, metalness: 0.06, envMapIntensity: 0.45 }),
    roofDark: std(0x7e2a17, { roughness: 0.7, metalness: 0.1, envMapIntensity: 0.4 }),
    wood: std(0xffffff, { map: woodTex, roughness: 0.9, metalness: 0, envMapIntensity: 0.3 }),
    woodDark: std(0x7a5228, { map: woodTex, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 }),
    woodRed: std(0xc0563a, { map: woodTex, roughness: 0.85, envMapIntensity: 0.3 }),
    steel: std(0xffffff, { map: steelTex, roughnessMap: steelRough, metalness: 0.82, roughness: 0.42, envMapIntensity: 1.15 }),
    steelDark: std(0x6c757e, { map: steelTex, metalness: 0.7, roughness: 0.55, envMapIntensity: 0.9 }),
    chrome: std(0xdfe8ef, { metalness: 1, roughness: 0.14, envMapIntensity: 1.5 }),
    red: std(C.red, { roughness: 0.6, metalness: 0.08, envMapIntensity: 0.5 }),
    redDark: std(C.redDark, { roughness: 0.7 }),
    cream: std(C.cream, { roughness: 0.85 }),
    white: std(0xfffaf0, { roughness: 0.8 }),
    black: std(0x24262b, { roughness: 0.7, metalness: 0.2 }),
    rubber: std(0x1c1e22, { roughness: 0.95, metalness: 0.02, envMapIntensity: 0.2 }),
    goldMetal: std(C.gold, { metalness: 0.9, roughness: 0.22, envMapIntensity: 1.4, emissive: 0x6a4200, emissiveIntensity: 0.3 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xcfeaff, transparent: true, opacity: 0.34, roughness: 0.06,
      metalness: 0.35, envMapIntensity: 1.6, side: THREE.DoubleSide,
    }),
    glassDark: new THREE.MeshStandardMaterial({
      color: 0x2b3f52, transparent: true, opacity: 0.82, roughness: 0.06,
      metalness: 0.55, envMapIntensity: 1.4, side: THREE.DoubleSide,
    }),
    soil: std(0x53381f, { roughness: 1, metalness: 0, envMapIntensity: 0.12 }),
    leafA: std(0x4a9143, { roughness: 0.92, metalness: 0, envMapIntensity: 0.25, flatShading: true }),
    leafB: std(0x5fae4e, { roughness: 0.9, metalness: 0, envMapIntensity: 0.25, flatShading: true }),
    leafC: std(0x3d7a3a, { roughness: 0.95, metalness: 0, envMapIntensity: 0.2, flatShading: true }),
    bush: std(0x4f9c47, { roughness: 0.95, metalness: 0, envMapIntensity: 0.2, flatShading: true }),
    hill: std(0x4b7f52, { roughness: 1, metalness: 0, envMapIntensity: 0.15 }),
    hillFar: std(0x69908a, { roughness: 1, metalness: 0, envMapIntensity: 0.1 }),
  };
  const glow = (color, opacity = 1, additive = false) => new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1 || additive, opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !additive,
  });
  const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
  const M_glow = {
    neonWarm: glow(hdr(0xffd98a, 2.4)),
    neonOrange: glow(hdr(0xff8b2e, 2.4)),
    lamp: glow(hdr(0xffe6b0, 2.2)),
    red: glow(hdr(0xff3b1f, 2.4)),
    green: glow(hdr(0x8bffb0, 2.0)),
    cyan: glow(hdr(0x9be8ff, 2.2)),
    white: glow(hdr(0xfff6e0, 1.8)),
  };

  /* ═════════════════════════════════════════════════════════════════════
     하늘 · 구름 · 별 · 달
     ═════════════════════════════════════════════════════════════════════ */
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x4fa8e8) },
    midColor: { value: new THREE.Color(0x9fd6f2) },
    horizonColor: { value: new THREE.Color(0xdff0ea) },
    sunColor: { value: new THREE.Color(0xfff2cf) },
    sunDir: { value: new THREE.Vector3(0.5, 0.66, 0.56).normalize() },
    sunPower: { value: 1 },
    starAlpha: { value: 0 },
    cityGlow: { value: 0 },
  };
  const skyGeo = new THREE.SphereGeometry(240, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, horizonColor, sunColor, sunDir;
      uniform float sunPower, starAlpha, cityGlow;
      varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.35, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.30, h));
        col = mix(col, topColor, smoothstep(0.20, 0.95, h));
        // 지평선 도시 불빛
        col += vec3(0.10, 0.07, 0.04) * cityGlow * (1.0 - smoothstep(0.0, 0.18, abs(h * 1.0)));
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * pow(sd, 1200.0) * 3.4 * sunPower;
        col += sunColor * pow(sd, 14.0) * 0.30 * sunPower;
        if (starAlpha > 0.001 && d.y > 0.01) {
          vec3 cell = floor(d * 260.0);
          float n = hash(cell);
          float tw = 0.65 + 0.35 * hash(cell + 11.3);
          float star = smoothstep(0.9977, 0.99935, n) * starAlpha * tw;
          col += vec3(0.85, 0.92, 1.0) * star;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -10;
  scene.add(skyDome);

  // 별 (셰이더 위에 살짝 더 밝은 큰 별)
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2, r = 150 + rnd() * 70, y = 30 + rnd() * 150;
    starPos.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xdce9ff, size: 1.5, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);
  W.refs.stars = starMat;

  // 달
  const moonMat = new THREE.SpriteMaterial({ map: moonTex, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const moon = new THREE.Sprite(moonMat);
  moon.scale.set(26, 26, 1);
  scene.add(moon);
  const moonGlowMat = new THREE.SpriteMaterial({
    map: moonTex, transparent: true, opacity: 0, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, color: 0x9fb6e0,
  });
  const moonGlow = new THREE.Sprite(moonGlowMat);
  moonGlow.scale.set(62, 62, 1);
  scene.add(moonGlow);
  W.refs.moon = moon; W.refs.moonGlow = moonGlow;

  // 구름
  const clouds = [];
  const cloudRoot = new THREE.Group();
  scene.add(cloudRoot);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false,
      color: 0xffffff,
    });
    const sp = new THREE.Sprite(m);
    const a = (i / 9) * Math.PI * 2 + rr(-0.3, 0.3);
    const r = rr(95, 165);
    sp.position.set(Math.cos(a) * r, rr(38, 78), Math.sin(a) * r);
    const s = rr(40, 78);
    sp.scale.set(s, s * 0.45, 1);
    cloudRoot.add(sp);
    clouds.push({ sp, mat: m, a, r, speed: rr(0.0016, 0.005), base: 0.75 + rnd() * 0.25 });
  }
  W.refs.clouds = clouds;

  /* ═════════════════════════════════════════════════════════════════════
     지형 · 도로 · 원경
     ═════════════════════════════════════════════════════════════════════ */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), M.grass);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.position.y = -0.02;
  scene.add(ground);

  // 마당(흙)
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(25, 17), M.dirt);
  yard.rotation.x = -Math.PI / 2; yard.position.set(-0.4, 0.008, 6.0); yard.receiveShadow = true;
  scene.add(yard);
  // 마당 자갈 테두리
  bBox(25.4, 0.05, 0.7, M.gravel, -0.4, 0.012, 14.4, 0, 0, 0, false);
  bBox(0.7, 0.05, 17.0, M.gravel, -12.7, 0.012, 6.0, 0, 0, 0, false);
  bBox(0.7, 0.05, 17.0, M.gravel, 11.9, 0.012, 6.0, 0, 0, 0, false);

  // 도로
  const ROAD = L.road;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD.x1 - ROAD.x0, 120), M.asphalt);
  road.rotation.x = -Math.PI / 2; road.position.set((ROAD.x0 + ROAD.x1) / 2, 0.015, -6);
  road.receiveShadow = true; scene.add(road);
  // 차선(중앙 점선)
  for (let i = -10; i < 12; i++) bBox(0.16, 0.02, 2.3, M.white, 14.18, 0.03, i * 6 + 1.2, 0, 0, 0, false);
  // 정지선 · 횡단보도
  bBox(ROAD.x1 - ROAD.x0 - 0.3, 0.02, 0.34, M.white, (ROAD.x0 + ROAD.x1) / 2, 0.031, -0.72, 0, 0, 0, false);
  for (let i = 0; i < 6; i++) bBox(0.7, 0.02, 3.0, M.white, ROAD.x0 + 0.5 + i * 0.9, 0.032, 2.1, 0, 0, 0, false);
  // 도로 가장자리선
  bBox(0.12, 0.02, 120, M.white, ROAD.x0 + 0.22, 0.03, -6, 0, 0, 0, false);
  bBox(0.12, 0.02, 120, M.white, ROAD.x1 - 0.22, 0.03, -6, 0, 0, 0, false);
  // 맨홀
  bCyl(0.44, 0.44, 0.06, M.steelDark, 13.4, 0.035, -14, 18);
  bCyl(0.44, 0.44, 0.06, M.steelDark, 15.2, 0.035, -2.5, 18);

  // 인도 · 연석
  const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 120), M.concrete);
  sidewalk.rotation.x = -Math.PI / 2; sidewalk.position.set(10.9, 0.02, -6); sidewalk.receiveShadow = true;
  scene.add(sidewalk);
  bBox(0.24, 0.3, 120, M.concrete, 11.62, 0.15, -6);
  bBox(0.24, 0.3, 120, M.concrete, 10.2, 0.15, -6);
  // 보도 경계 돌
  const curbTexMat = std(0xc4bcae, { roughness: 1 });
  for (let i = -12; i < 14; i++) bBox(0.06, 0.02, 1.9, curbTexMat, 10.9, 0.03, i * 4, 0, 0, 0, false);

  /* 원경 언덕 · 나무 실루엣 */
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rr(-0.08, 0.08);
    const r = rr(82, 108), h = rr(10, 26), rad = rr(18, 34);
    bCone(rad, h, M.hillFar, Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r, 7, 0, 0, false);
  }
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rr(-0.1, 0.1);
    const r = rr(52, 74), h = rr(6, 14), rad = rr(6, 13);
    bCone(rad, h, M.hill, Math.cos(a) * r, h / 2 - 0.6, Math.sin(a) * r, 6, 0, 0, false);
  }
  // 원경 침엽수 실루엣
  for (let i = 0; i < 70; i++) {
    const a = rr(0, Math.PI * 2), r = rr(40, 66);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (x > 4 && x < 22 && z > -20 && z < 20) continue;
    if (x > -16 && x < 14 && z > -14 && z < 17) continue;
    const h = rr(4, 9);
    bCyl(0.18, 0.26, h * 0.4, M.woodDark, x, h * 0.2, z, 5, 0, 0, 0, false);
    bCone(h * 0.36, h, M.leafC, x, h * 0.35 + h * 0.5, z, 7, 0, 0, false);
  }
  // 잔디 풀 더미 (마당 밖)
  for (let i = 0; i < 220; i++) {
    const x = rr(-40, 40), z = rr(-30, 40);
    if (x > -13.5 && x < 12.8 && z > -3 && z < 15) continue;
    if (x > 8 && x < 22 && z > -12 && z < 2) continue;
    const h = rr(0.12, 0.34);
    bCone(rr(0.05, 0.11), h, i % 3 ? M.leafB : M.leafA, x, h / 2, z, 4, 0, 0, false);
  }
  // 자갈 돌
  for (let i = 0; i < 40; i++) {
    const x = rr(-12, 11.5), z = rr(0.5, 14);
    if (Math.abs(x - L.belt.x) < 1.9 && z > 7.4) continue;
    const s = rr(0.07, 0.16);
    bSph(s, M.gravel, x, s * 0.45, z, 6, false, true, 1);
  }

  /* ═════════════════════════════════════════════════════════════════════
     가게 건물 외관
     ═════════════════════════════════════════════════════════════════════ */
  const shop = new THREE.Group(); scene.add(shop);
  const S = L.shop;
  const bw = S.x1 - S.x0, bd = S.z1 - S.z0, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
  const wallTop = 0.35 + S.wallH;

  // 기단 · 바닥
  box(bw + 1.0, 0.36, bd + 1.0, M.concrete, cx, 0.18, cz, shop);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.4, bd - 0.2), M.tile);
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.36, cz); floor.receiveShadow = true;
  shop.add(floor);

  // 외벽 (남쪽은 열린 카운터)
  box(0.42, S.wallH, bd, M.stucco, S.x0, 0.35 + S.wallH / 2, cz, shop);
  box(bw, S.wallH, 0.42, M.stucco, cx, 0.35 + S.wallH / 2, S.z0, shop);
  for (const px of [S.x0 + 0.32, -4.35, S.x1 - 0.32]) box(0.44, S.wallH, 0.44, M.stucco, px, 0.35 + S.wallH / 2, S.z1, shop);
  box(bw, 0.5, 0.44, M.stucco, cx, wallTop - 0.25, S.z1, shop);

  // 동쪽 벽 (창문 개구부)
  const WZ = { z0: L.window.z - L.window.w / 2, z1: L.window.z + L.window.w / 2 };
  box(0.42, S.wallH, (WZ.z0 - S.z0), M.stucco, S.x1, 0.35 + S.wallH / 2, (S.z0 + WZ.z0) / 2, shop);
  box(0.42, S.wallH, (S.z1 - WZ.z1), M.stucco, S.x1, 0.35 + S.wallH / 2, (WZ.z1 + S.z1) / 2, shop);
  box(0.42, L.window.y0 - 0.35, L.window.w, M.stucco, S.x1, 0.35 + (L.window.y0 - 0.35) / 2, L.window.z, shop);
  box(0.42, wallTop - L.window.y1, L.window.w, M.stucco, S.x1, (L.window.y1 + wallTop) / 2, L.window.z, shop);

  // 벽 마감: 하단 빨간 띠 · 상단 트림 · 모서리 기둥
  box(0.15, 0.42, bd, M.red, S.x0 - 0.25, 0.56, cz, shop);
  box(0.15, 0.42, bd, M.red, S.x1 + 0.25, 0.56, cz, shop);
  box(bw + 0.5, 0.2, 0.2, M.white, cx, wallTop + 0.08, S.z1 + 0.26, shop);
  for (const px of [S.x0, S.x1]) {
    box(0.3, S.wallH + 0.2, 0.3, M.woodDark, px, 0.35 + S.wallH / 2, S.z1 + 0.02, shop);
    // 처마 브래킷
    for (const bz of [-0.6, -4.6, -8.6]) {
      box(0.16, 0.5, 0.16, M.woodDark, S.x0 - 0.3, wallTop - 0.3, bz, shop);
    }
  }

  // 지붕 (뒤쪽은 덮고 앞은 열어 주방이 보이게)
  box(bw + 2.2, 0.34, 5.0, M.roof, cx, S.wallH + 0.62, S.z0 + 2.5, shop);
  box(bw + 2.2, 0.06, 5.2, M.roofDark, cx, S.wallH + 0.46, S.z0 + 2.5, shop);
  // 처마 끝 단면
  box(bw + 2.4, 0.26, 0.3, M.roofDark, cx, S.wallH + 0.5, S.z0 + 5.05, shop);
  box(bw + 2.4, 0.3, 0.16, M.white, cx, S.wallH + 0.68, S.z0 + 5.05, shop);
  // 앞쪽 보
  box(bw + 2.4, 0.2, 0.24, M.woodDark, cx, S.wallH + 0.44, S.z1 + 0.5, shop);
  for (const sx of [-1, 1]) box(0.22, 0.18, bd + 1.1, M.woodDark, cx + sx * (bw / 2 + 0.15), wallTop + 0.05, cz, shop);
  // 서까래 (앞 처마)
  for (let i = 0; i < 13; i++) {
    box(0.1, 0.12, 1.4, M.woodDark, S.x0 + 0.5 + i * 1.35, S.wallH + 0.3, S.z1 + 0.9, shop);
  }

  // 옥상 설비: 냉각기 + 팬 + 환기관
  const rooftopFans = [];
  for (let i = 0; i < 3; i++) {
    const ux = -5.4 + i * 5.2;
    box(1.5, 0.6, 1.2, M.steel, ux, S.wallH + 0.96, -8.4, shop);
    box(1.6, 0.1, 1.3, M.steelDark, ux, S.wallH + 1.28, -8.4, shop);
    const fanG = new THREE.Group();
    fanG.position.set(ux, S.wallH + 1.3, -8.4);
    for (let k = 0; k < 4; k++) {
      const bl = box(0.5, 0.02, 0.11, M.steelDark, 0, 0, 0, fanG);
      bl.rotation.y = k * Math.PI / 2; bl.position.set(Math.cos(k * Math.PI / 2) * 0.22, 0, Math.sin(k * Math.PI / 2) * 0.22);
    }
    shop.add(fanG); rooftopFans.push(fanG);
    box(1.7, 0.06, 1.4, M.black, ux, S.wallH + 1.34, -8.4, shop);
    cyl(0.1, 0.1, 0.5, M.steelDark, ux + 0.6, S.wallH + 1.6, -8.0, shop, 8);
  }
  W.refs.rooftopFans = rooftopFans;

  // 배기 덕트 (후드 → 옥상)
  box(0.62, 0.62, 2.4, M.steel, L.fryer.x, S.wallH + 0.2, -4.2, shop);
  box(0.62, 3.2, 0.62, M.steel, L.fryer.x, S.wallH + 0.9, -5.4, shop);
  box(1.0, 0.24, 1.0, M.steelDark, L.fryer.x, S.wallH + 2.55, -5.4, shop);
  cyl(0.34, 0.3, 0.4, M.steelDark, L.fryer.x, S.wallH + 2.85, -5.4, shop, 12);

  // 빗물 홈통 · 낙수관
  box(bw + 2.3, 0.16, 0.18, M.steelDark, cx, S.wallH + 0.32, S.z0 + 5.12, shop);
  cyl(0.11, 0.11, S.wallH + 0.4, M.steelDark, S.x0 - 1.15, (S.wallH + 0.4) / 2, S.z0 + 5.1, shop, 8);

  // 간판 (지붕 위 뒤로 눕힌 형태 — 주방 시야 유지)
  const signGrp = new THREE.Group();
  signGrp.position.set(-5.6, S.wallH + 1.55, S.z1 + 0.5);
  signGrp.rotation.x = -0.42;
  const signPanel = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.72), new THREE.MeshBasicMaterial({ map: signTex }));
  signPanel.position.z = 0.07; signGrp.add(signPanel);
  box(6.0, 1.98, 0.22, M.redDark, 0, 0, -0.12, signGrp);
  // 네온 튜브 테두리
  const neonTubeMat = glow(new THREE.Color(0xffa63d).multiplyScalar(2.6));
  for (const [tx, ty, tw, th] of [[0, 0.8, 5.75, 0.07], [0, -0.8, 5.75, 0.07], [-2.85, 0, 0.07, 1.64], [2.85, 0, 0.07, 1.64]]) {
    const t = box(tw, th, 0.07, neonTubeMat, tx, ty, 0.11, signGrp);
    t.castShadow = false;
  }
  const signGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffb545, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const signGlow = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2.4), signGlowMat);
  signGlow.position.z = 0.16; signGrp.add(signGlow);
  for (const sx of [-2.35, 2.35]) {
    const leg = box(0.12, 0.9, 0.12, M.steelDark, sx, -1.0, -0.05, signGrp);
    leg.rotation.x = 0.1;
  }
  shop.add(signGrp);
  W.refs.signGlow = signGlowMat;
  W.refs.neonMats = [neonTubeMat];

  // 창문 프레임 · 유리 · 셔터
  const winFrame = M.steelDark;
  box(0.55, 0.18, L.window.w + 0.5, winFrame, S.x1, L.window.y0 - 0.06, L.window.z, shop);
  box(0.55, 0.16, L.window.w + 0.5, winFrame, S.x1, L.window.y1 + 0.06, L.window.z, shop);
  box(0.55, L.window.y1 - L.window.y0 + 0.28, 0.16, winFrame, S.x1, (L.window.y0 + L.window.y1) / 2, WZ.z0, shop);
  box(0.55, L.window.y1 - L.window.y0 + 0.28, 0.16, winFrame, S.x1, (L.window.y0 + L.window.y1) / 2, WZ.z1, shop);
  box(0.62, 0.12, L.window.w + 0.7, M.white, S.x1 - 0.05, L.window.y0 - 0.2, L.window.z, shop);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(L.window.w, L.window.y1 - L.window.y0), M.glass);
  glass.rotation.y = -Math.PI / 2; glass.position.set(S.x1, (L.window.y0 + L.window.y1) / 2, L.window.z);
  shop.add(glass);
  // 창틀 살
  for (const gz of [-0.55, 0.55]) box(0.06, L.window.y1 - L.window.y0, 0.06, M.steelDark, S.x1 + 0.02, (L.window.y0 + L.window.y1) / 2, L.window.z + gz, shop);

  const shutter = new THREE.Group();
  box(0.18, L.window.y1 - L.window.y0 + 0.16, L.window.w + 0.2, M.steel, 0, 0, 0, shutter);
  for (let i = 0; i < 10; i++) box(0.22, 0.05, L.window.w + 0.2, M.steelDark, 0, -1.55 + i * 0.36, 0, shutter);
  box(0.3, 0.16, L.window.w + 0.3, M.steelDark, 0, -(L.window.y1 - L.window.y0) / 2 - 0.1, 0, shutter);
  shutter.position.set(S.x1, L.window.y1 + 2.0, L.window.z);
  shop.add(shutter);
  W.refs.shutter = shutter;
  W.refs.shutterClosedY = (L.window.y0 + L.window.y1) / 2;
  W.refs.shutterOpenY = L.window.y1 + 2.0;

  // 창문 위 외부 램프 + 네온 OPEN
  const winLampMat = glow(new THREE.Color(0xffd98a).multiplyScalar(2.2));
  for (const lz of [L.window.z - 1.5, L.window.z + 1.5]) {
    bCyl(0.16, 0.2, 0.16, M.steelDark, S.x1 + 0.45, 3.5, lz, 10);
    bSph(0.13, winLampMat, S.x1 + 0.45, 3.38, lz, 10, false);
  }
  const openSignMat = new THREE.MeshBasicMaterial({ map: openTex, transparent: true, side: THREE.DoubleSide });
  const openSign = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.55), openSignMat);
  openSign.position.set(S.x1 - 0.02, 2.78, L.window.z + 2.5);
  openSign.rotation.y = Math.PI / 2;
  shop.add(openSign);
  W.refs.openSign = openSign;

  // 드라이브스루 간판 · 차양 · 카운터
  const driveSign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.18), new THREE.MeshBasicMaterial({ map: driveTex }));
  driveSign.position.set(S.x1 + 0.36, 3.5, L.window.z); driveSign.rotation.y = Math.PI / 2;
  shop.add(driveSign);
  box(3.2, 1.36, 0.1, M.steelDark, S.x1 + 0.28, 3.5, L.window.z, shop);
  // 차양 (스트라이프)
  for (let i = 0; i < 8; i++) {
    const a = box(1.6, 0.1, 0.6, i % 2 ? M.red : M.white, S.x1 + 0.8, 3.6, L.window.z - 2.1 + i * 0.6);
    a.rotation.z = 0.16;
    box(0.06, 0.5, 0.06, M.steelDark, S.x1 + 1.5, 3.3, L.window.z - 2.1 + i * 0.6);
  }
  box(1.05, 0.1, 3.5, M.steelDark, S.x1 + 1.46, 3.28, L.window.z);
  box(2.0, 0.14, 3.5, M.woodDark, L.ledge.x - 0.5, 1.0, L.window.z);
  box(0.16, 0.7, 3.4, M.steel, L.ledge.x - 1.4, 0.62, L.window.z);
  for (let i = 0; i < 3; i++) cyl(0.08, 0.08, 0.5, M.steel, L.ledge.x - 0.35, 0.4, L.window.z - 1.2 + i * 1.2, shop, 8);
  // 메뉴 보드 (차량용)
  const carMenu = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), new THREE.MeshBasicMaterial({ map: menuTex }));
  carMenu.position.set(11.42, 1.62, L.window.z + 5.7); carMenu.rotation.y = Math.PI / 2;
  shop.add(carMenu);
  const backBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), new THREE.MeshBasicMaterial({ map: menuTex }));
  backBoard.position.set(11.3, 1.62, L.window.z + 5.7); backBoard.rotation.y = -Math.PI / 2;
  shop.add(backBoard);
  box(0.1, 1.95, 1.55, M.steelDark, 11.36, 1.55, L.window.z + 5.7, shop);
  box(0.16, 0.6, 0.16, M.steelDark, 11.36, 0.3, L.window.z + 5.7, shop);
  // 주문 스피커
  box(0.5, 0.7, 0.4, M.steelDark, 11.4, 1.5, L.window.z + 5.0, shop);
  box(0.06, 0.3, 0.3, M.black, 11.16, 1.55, L.window.z + 5.0, shop);
  // 볼라드
  for (const bz of [-2.2, 0.4, 2.6]) {
    cyl(0.11, 0.13, 0.95, M.steel, 11.0, 0.5, L.window.z + bz, shop, 10);
    cyl(0.13, 0.13, 0.08, M.red, 11.0, 0.9, L.window.z + bz, shop, 10);
  }
  // 차륜 스토퍼
  for (const bz of [-1.0, 1.0]) box(0.24, 0.14, 0.8, M.concrete, L.carStop.x, 0.07, L.window.z + bz, shop);

  // 앞쪽 안내 펜스
  for (const px of [-2.6, 1.4]) box(0.1, 0.85, 0.1, M.steel, px, 0.77, -1.25, shop);
  box(4.4, 0.08, 0.08, M.steel, -0.6, 1.16, -1.25, shop);

  // 입구 문
  box(1.5, 2.3, 0.12, M.woodRed, -7.4, 1.5, S.z1 + 0.18, shop);
  box(1.62, 0.14, 0.2, M.woodDark, -7.4, 2.7, S.z1 + 0.2, shop);
  sph(0.06, M.goldMetal, -6.8, 1.45, S.z1 + 0.28, shop);
  box(0.9, 0.5, 0.06, M.glassDark, -7.4, 1.95, S.z1 + 0.25, shop);

  /* ── 가게 안: 카운터 · 메뉴판 · 살림 ───────────────────────────────── */
  box(0.9, 1.0, 3.5, M.cream, 8.5, 0.86, L.window.z, shop);
  box(1.02, 0.1, 3.6, M.woodDark, 8.5, 1.43, L.window.z, shop);
  box(0.52, 0.36, 0.44, M.black, 8.5, 1.66, L.window.z + 1.2, shop);
  box(0.44, 0.18, 0.05, glow(0x8dffb0), 8.26, 1.82, L.window.z + 1.2, shop);
  for (let i = 0; i < 4; i++) cyl(0.09, 0.07, 0.28, M.white, 8.5, 1.6, L.window.z - 1.2 + i * 0.3, shop, 10);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.goldMetal);
  bell.position.set(8.5, 1.51, L.window.z + 0.4); bell.castShadow = true; shop.add(bell);

  const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.75), new THREE.MeshBasicMaterial({ map: menuTex }));
  menu.position.set(S.x1 - 0.26, 1.9, -8.2); menu.rotation.y = -Math.PI / 2;
  shop.add(menu);
  box(2.4, 2.94, 0.06, M.white, S.x1 - 0.15, 1.9, -8.2, shop);

  // 개수대
  const sink = new THREE.Group();
  box(3.0, 0.84, 1.1, M.steel, 0, 0.42, 0, sink);
  box(2.62, 0.16, 0.9, M.steelDark, 0, 0.92, 0, sink);
  box(2.4, 0.06, 0.72, std(0x9aa4ad, { metalness: 0.7, roughness: 0.3, envMapIntensity: 1.1 }), 0, 0.96, 0, sink);
  cyl(0.05, 0.05, 0.72, M.chrome, 0, 1.3, -0.34, sink, 10);
  cyl(0.05, 0.05, 0.42, M.chrome, 0, 1.62, -0.2, sink, 10);
  box(0.12, 0.06, 0.12, M.chrome, 0, 1.62, -0.04, sink);
  box(0.28, 0.05, 0.16, M.steelDark, 0.9, 1.0, 0.2, sink);
  sink.position.set(-5.9, 0.36, -9.5); shop.add(sink);

  // 선반 + 병/캔
  const jarMats = [
    M.white,
    std(0xb9d8e8, { roughness: 0.25, metalness: 0.1, envMapIntensity: 0.9 }),
    std(0xe8c07a, { roughness: 0.3 }),
  ];
  const shelf = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    box(5.4, 0.1, 0.74, M.wood, 0, i * 0.62, 0, shelf);
    box(0.08, 0.62, 0.74, M.woodDark, -2.7, i * 0.62 + 0.31, 0, shelf);
    box(0.08, 0.62, 0.74, M.woodDark, 2.7, i * 0.62 + 0.31, 0, shelf);
    for (let k = 0; k < 6; k++) {
      const jarMat = jarMats[(k + i) % 3];
      cyl(0.14, 0.14, 0.3, jarMat, -2.2 + k * 0.88, i * 0.62 + 0.22, 0.02, shelf, 10);
    }
  }
  shelf.position.set(0.6, 1.25, -10.62); shop.add(shelf);

  // 조리 테이블 · 도마 · 그릇 · 감자
  const prep = new THREE.Group();
  box(2.9, 0.86, 1.2, M.steel, 0, 0.43, 0, prep);
  box(3.1, 0.1, 1.34, M.steel, 0, 0.9, 0, prep);
  box(1.0, 0.07, 0.62, M.wood, -0.6, 0.99, 0.1, prep);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), M.white);
  bowl.position.set(0.7, 1.02, 0.06); bowl.scale.y = 0.65; prep.add(bowl);
  for (let i = 0; i < 4; i++) {
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), std(C.potato, { roughness: 0.95 }));
    pot.position.set(0.55 + (i % 2) * 0.28, 1.04, -0.12 + Math.floor(i / 2) * 0.24);
    pot.scale.set(1.25, 0.8, 1); pot.castShadow = true; prep.add(pot);
  }
  // 칼
  box(0.05, 0.02, 0.4, M.chrome, -0.4, 1.03, 0.18, prep);
  box(0.1, 0.04, 0.16, M.black, -0.4, 1.03, -0.08, prep);
  prep.position.set(-5.5, 0.36, -6.4); shop.add(prep);

  // 쓰레기통 · 감자 부대
  cyl(0.42, 0.36, 1.0, std(0x44564a, { roughness: 0.7 }), 7.5, 0.86, -10.2, shop, 14);
  cyl(0.46, 0.46, 0.09, std(0x2f3a30, { roughness: 0.7 }), 7.5, 1.4, -10.2, shop, 14);
  for (let i = 0; i < 3; i++) {
    const sack = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.3, 5, 10), std(0xd9c08a, { roughness: 0.98 }));
    sack.position.set(8.05 + (i % 2) * 0.45, 0.62, -9.0 + Math.floor(i / 2) * 0.5);
    sack.rotation.z = 0.2 + i * 0.1; sack.castShadow = true; shop.add(sack);
  }

  // 벽시계 (바늘 refs)
  const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 22), M.white);
  clockFace.rotation.x = Math.PI / 2; clockFace.position.set(2.3, 2.5, -10.72); shop.add(clockFace);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.055, 8, 24), M.woodDark);
  rim.position.set(2.3, 2.5, -10.66); shop.add(rim);
  const clockMin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.03), M.black);
  clockMin.geometry.translate(0, 0.17, 0);
  clockMin.position.set(2.3, 2.5, -10.6); shop.add(clockMin);
  const clockHour = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.03), M.black);
  clockHour.geometry.translate(0, 0.11, 0);
  clockHour.position.set(2.3, 2.5, -10.58); shop.add(clockHour);
  W.refs.clockMin = clockMin; W.refs.clockHour = clockHour;

  // 계산대 · 종이컵 · 냅킨
  const register = new THREE.Group();
  box(0.62, 0.34, 0.5, std(0x4a5560, { metalness: 0.4, roughness: 0.4 }), 0, 0.17, 0, register);
  box(0.6, 0.26, 0.06, std(0x1d2530, { roughness: 0.3 }), 0, 0.5, -0.14, register).rotation.x = -0.28;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) box(0.07, 0.05, 0.05, M.white, -0.16 + k * 0.11, 0.37, 0.02 + i * 0.08, register);
  box(0.2, 0.16, 0.12, M.white, 0.2, 0.42, 0.1, register);
  register.position.set(6.9, 1.0, L.window.z + 0.9); shop.add(register);
  const cupStack = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07 - i * 0.002, 0.055, 0.16, 10), M.white);
    cup.position.y = i * 0.05; cupStack.add(cup);
  }
  cupStack.position.set(7.4, 1.6, L.window.z - 0.9); shop.add(cupStack);
  box(0.26, 0.1, 0.18, M.red, 7.9, 1.52, L.window.z - 1.5, shop);

  // 기름통 · 양동이 · 자루
  cyl(0.26, 0.26, 0.72, std(0xc8a03a, { roughness: 0.5, metalness: 0.3 }), 6.4, 0.72, -9.6, shop, 12);
  cyl(0.27, 0.27, 0.06, M.steelDark, 6.4, 1.1, -9.6, shop, 12);
  cyl(0.24, 0.2, 0.44, std(0x3f6fb5, { roughness: 0.6 }), 6.95, 0.58, -9.9, shop, 12);
  for (let i = 0; i < 2; i++) {
    const cr = new THREE.Group();
    box(0.72, 0.5, 0.5, M.wood, 0, 0.25, 0, cr);
    for (const sx of [-1, 1]) box(0.04, 0.5, 0.5, M.woodDark, sx * 0.35, 0.25, 0, cr);
    cr.position.set(-8.0 + i * 0.8, 0.35, -8.6 + i * 0.2); shop.add(cr);
  }

  // 벽 걸이 (국자·팬)
  for (const [hx, hy, hz] of [[-7.8, 2.3, -10.75], [2.9, 2.25, -10.75]]) {
    box(1.6, 0.06, 0.06, M.chrome, hx, hy, hz, shop);
    for (let i = 0; i < 4; i++) {
      cyl(0.03, 0.03, 0.1, M.chrome, hx - 0.6 + i * 0.4, hy - 0.06, hz, shop, 6);
      cyl(0.12, 0.1, 0.03, M.steelDark, hx - 0.6 + i * 0.4, hy - 0.24, hz + 0.02, shop, 10);
    }
  }

  // 바닥 매트
  const matDark = std(0x333c46, { roughness: 0.95 });
  for (const [mx, mz, mw] of [[L.peeler.x, L.peeler.z + 1.55, 2.5], [L.fryer.x, L.fryer.z + 1.8, 3.3], [L.ready.x, L.ready.z + 1.0, 2.1]]) {
    box(mw, 0.04, 1.2, matDark, mx, 0.38, mz, shop);
  }
  // 천장 조명 (갓)
  for (const [lx, lz] of [[-4.5, -6.2], [4.0, -6.2], [0.2, -1.6], [6.6, -8.6]]) {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 16, 1, true), M.steelDark);
    shade.position.set(lx, 2.86, lz); shade.rotation.x = Math.PI; shop.add(shade);
    sph(0.1, M_glow.lamp, lx, 2.74, lz, shop);
  }

  /* ── 울타리 ─────────────────────────────────────────────────────────── */
  const fenceMat = std(0xfff2d8, { roughness: 0.9 });
  const fencePost = std(0x8a5a33, { roughness: 0.9 });
  for (let i = 0; i < 15; i++) {
    const x = -12.2 + i * 1.72;
    bBox(0.13, 1.05, 0.13, fencePost, x, 0.52, 12.1);
    bCyl(0.09, 0.09, 0.06, fencePost, x, 1.07, 12.1, 8);
    if (i < 14) {
      bBox(1.62, 0.11, 0.07, fenceMat, x + 0.86, 0.9, 12.1);
      bBox(1.62, 0.11, 0.07, fenceMat, x + 0.86, 0.56, 12.1);
      bBox(1.62, 0.05, 0.05, fenceMat, x + 0.86, 0.2, 12.1);
    }
  }
  for (const sx of [-12.2, 12.1]) {
    for (let i = 0; i < 7; i++) bBox(0.13, 1.05, 0.13, fencePost, sx, 0.52, 1.6 + i * 1.7);
    bBox(0.06, 0.11, 10.3, fenceMat, sx, 0.9, 6.6);
    bBox(0.06, 0.11, 10.3, fenceMat, sx, 0.56, 6.6);
  }
  // 울타리 문
  for (const dx of [1.95, 2.9]) bBox(0.12, 1.0, 0.12, fencePost, dx, 0.5, 12.1);
  bBox(1.0, 0.09, 0.06, fenceMat, 2.42, 0.86, 12.1);
  bBox(1.0, 0.09, 0.06, fenceMat, 2.42, 0.52, 12.1);

  /* ── 가로등 · 전선 ─────────────────────────────────────────────────── */
  const lampLights = [];
  const LAMPS = [[-10.8, 1.4], [10.7, 10.6], [12.6, -14.5]];
  for (let li = 0; li < LAMPS.length; li++) {
    const [lx, lz] = LAMPS[li];
    const g = new THREE.Group();
    cyl(0.1, 0.16, 3.4, M.steelDark, 0, 1.7, 0, g, 10);
    cyl(0.2, 0.24, 0.16, M.steelDark, 0, 0.08, 0, g, 10);
    const arm = box(0.1, 0.1, 0.9, M.steelDark, 0, 3.36, 0.42, g);
    arm.rotation.x = 0.18;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.28, 12, 1, true), M.steelDark);
    shade.position.set(0, 3.34, 0.92); shade.rotation.x = Math.PI; g.add(shade);
    const bulbMat = glow(new THREE.Color(0xffe6b0).multiplyScalar(2.4), 1);
    const bulb = sph(0.16, bulbMat, 0, 3.18, 0.92, g);
    const pl = new THREE.PointLight(0xffcf8a, 0, 16, 2);
    pl.position.set(0, 3.1, 0.92);
    g.add(pl);
    g.position.set(lx, 0, lz); scene.add(g);
    lampLights.push({ light: pl, bulbMat, bulb });
    // 그림자용 기둥은 배치로 (조명은 개별)
  }
  W.refs.lampLights = lampLights;

  // 전선주 + 전선
  for (const [px, pz] of [[12.2, 22], [12.2, -2], [12.2, -26]]) {
    cyl(0.16, 0.22, 7.2, M.woodDark, px, 3.6, pz, scene, 8);
    box(1.8, 0.12, 0.12, M.woodDark, px, 6.8, pz);
    for (const ox of [-0.8, 0, 0.8]) bCyl(0.06, 0.06, 0.2, M.white, px + ox, 7.0, pz, 6);
  }

  /* ── 나무 · 덤불 · 화단 ────────────────────────────────────────────── */
  function tree(x, z, s) {
    const g = new THREE.Group();
    const trunkH = 2.1 * s;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.3 * s, trunkH, 8), M.woodDark);
    trunk.position.y = trunkH / 2; trunk.castShadow = true; g.add(trunk);
    // 가지
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + rnd();
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.1 * s, 0.9 * s, 6), M.woodDark);
      b.position.set(Math.cos(a) * 0.3 * s, trunkH * 0.86, Math.sin(a) * 0.3 * s);
      b.rotation.z = Math.cos(a) * 0.8; b.rotation.x = Math.sin(a) * 0.8;
      b.castShadow = true; g.add(b);
    }
    // 다각형 수관 (덩어리들을 재질별로 병합)
    const leafMats = [M.leafA, M.leafB, M.leafC];
    const byMat = new Map();
    for (let i = 0; i < 12; i++) {
      const r = (0.74 - i * 0.022) * s * rr(0.82, 1.22);
      const geo = i % 2 ? new THREE.DodecahedronGeometry(r * 0.9, 0) : new THREE.IcosahedronGeometry(r, 0);
      const a = rnd() * Math.PI * 2, rad = rr(0.1, 0.8) * s;
      _e.set(rnd() * 3, rnd() * 3, rnd() * 3); _q.setFromEuler(_e);
      _v.set(Math.cos(a) * rad, trunkH + rr(0.1, 1.1) * s, Math.sin(a) * rad);
      _s.set(rr(0.85, 1.15), rr(0.7, 0.95), rr(0.85, 1.15));
      geo.applyMatrix4(_m4.compose(_v, _q, _s));
      const mat = leafMats[i % 3];
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(geo);
    }
    byMat.forEach((geos, mat) => {
      const merged = mergeGeometries(geos, false);
      geos.forEach((gg) => gg.dispose());
      if (!merged) return;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    });
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }
  tree(-14.2, -4.0, 1.15);
  tree(14.6, 13.4, 0.95);
  tree(-13.8, 13.6, 0.9);
  tree(16.2, -18.5, 1.0);
  tree(-16.0, 8.0, 0.8);
  tree(18.6, 2.0, 0.85);

  function bush(x, z, s) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.3, 0.52) * s, 0), i % 2 ? M.bush : M.leafC);
      m.position.set(rr(-0.35, 0.35) * s, rr(0.2, 0.5) * s, rr(-0.35, 0.35) * s);
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      m.castShadow = true; g.add(m);
    }
    g.position.set(x, 0, z); scene.add(g);
  }
  bush(-11.2, 10.9, 1.0); bush(9.9, 11.6, 1.1); bush(-9.4, -1.2, 0.8);
  bush(10.4, 3.2, 0.9); bush(-11.8, 4.6, 0.85);

  // 화단
  const flowerMats = [0xff7a9a, 0xffd05a, 0xffffff, 0xb07bff].map((c) => std(c, { roughness: 0.7 }));
  for (const [fx, fz] of [[-8.3, 1.2], [8.9, 4.6]]) {
    box(1.4, 0.34, 0.7, M.woodDark, fx, 0.17, fz);
    box(1.28, 0.1, 0.6, M.soil, fx, 0.36, fz);
    for (let i = 0; i < 7; i++) {
      bSph(0.06, flowerMats[i % 4], fx - 0.5 + i * 0.17, 0.46 + rnd() * 0.06, fz + rr(-0.16, 0.16), 6, false);
    }
    for (let i = 0; i < 3; i++) bCone(0.05, 0.16, M.leafB, fx - 0.4 + i * 0.4, 0.44, fz + rr(-0.1, 0.1), 4, 0, 0, false);
  }

  /* ── 마당 소품: 테이블 · 입간판 · 쓰레기통 · 통 · 상자 · 팔레트 ───── */
  // 야외 테이블 + 벤치 + 파라솔
  for (const [tx, tz] of [[-9.8, 8.2], [9.9, 10.6]]) {
    const tg = new THREE.Group();
    box(1.7, 0.12, 0.9, M.wood, 0, 0.78, 0, tg);
    for (const sx of [-0.7, 0.7]) box(0.12, 0.78, 0.12, M.steelDark, sx, 0.39, 0, tg);
    for (const sz of [-0.55, 0.55]) {
      box(1.6, 0.09, 0.34, M.wood, 0, 0.46, sz, tg);
      for (const sx of [-0.6, 0.6]) box(0.1, 0.46, 0.1, M.steelDark, sx, 0.23, sz, tg);
    }
    // 파라솔
    cyl(0.06, 0.06, 2.4, M.steel, 0, 1.2, 0, tg, 8);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.12, 0.5, 8), M.red);
    cone.position.y = 2.5; cone.castShadow = true; tg.add(cone);
    const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.14, 0.09, 8), M.white);
    cone2.position.y = 2.24; tg.add(cone2);
    tg.position.set(tx, 0, tz); scene.add(tg);
  }
  // 입간판 (A프레임)
  {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.32), new THREE.MeshBasicMaterial({ map: boardTex, side: THREE.DoubleSide }));
    board.position.set(0, 0.82, 0.12); board.rotation.x = -0.14; g.add(board);
    const board2 = board.clone(); board2.position.z = -0.12; board2.rotation.x = 0.14; board2.rotation.y = Math.PI; g.add(board2);
    box(1.14, 1.42, 0.06, M.wood, 0, 0.8, 0, g);
    for (const sx of [-0.5, 0.5]) box(0.09, 1.5, 0.09, M.woodDark, sx, 0.75, 0.18, g);
    box(0.09, 1.5, 0.09, M.woodDark, 0, 0.75, -0.2, g);
    g.position.set(4.9, 0, 11.2); g.rotation.y = -0.4; scene.add(g);
  }
  // 쓰레기통 2개
  for (const [bx, bz, col] of [[-8.8, 11.0, 0x2f6fb5], [7.4, 11.4, 0x2f8f4a]]) {
    cyl(0.36, 0.32, 0.95, std(col, { roughness: 0.62, metalness: 0.1 }), bx, 0.48, bz, scene, 14);
    cyl(0.39, 0.39, 0.09, M.steelDark, bx, 0.98, bz, scene, 14);
    cyl(0.33, 0.33, 0.02, M.black, bx, 1.03, bz, scene, 14);
  }
  // 드럼통
  for (const [bx, bz, col] of [[-11.4, 2.2, 0x2f6fb5], [-10.9, 9.6, 0xd8452c], [9.7, 1.4, 0x2f8f4a]]) {
    cyl(0.38, 0.38, 0.95, std(col, { roughness: 0.6, metalness: 0.15 }), bx, 0.48, bz, scene, 14);
    for (const yy of [0.28, 0.7]) cyl(0.4, 0.4, 0.08, M.steelDark, bx, yy, bz, scene, 14);
  }
  // 나무 상자 더미
  for (let i = 0; i < 3; i++) {
    box(1.0, 0.72, 1.0, M.wood, -10.6, 0.36 + i * 0.02, 5.4 + i * 1.2);
    box(1.0, 0.72, 1.0, M.wood, -9.5, 0.36 + i * 0.02, 5.4 + i * 1.2);
  }
  // 팔레트
  box(2.3, 0.15, 1.6, M.woodDark, 10.0, 0.08, 7.0);
  for (let i = 0; i < 5; i++) box(2.2, 0.09, 0.16, M.wood, 10.0, 0.18, 6.4 + i * 0.31);
  // 마당 바닥 주차선
  const parkLineMat = std(0xfff3c4, { roughness: 0.8 });
  for (let i = 0; i < 3; i++) bBox(0.13, 0.02, 5.2, parkLineMat, 11.5 + i * 1.7, 0.03, 9.4, 0, 0, 0, false);

  // 끈전구 (마당 위)
  {
    const bulbMat = glow(0xfff0c0, 1);
    const wire = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = -11.0 + t * 22.0;
      const z = 11.4 + Math.sin(t * Math.PI) * 1.2;
      const y = 3.5 - Math.sin(t * Math.PI) * 0.55;
      if (i % 2 === 0) bSph(0.075, bulbMat, x, y, z, 7, false);
      wire.push(new THREE.Vector3(x, y + 0.05, z));
    }
    const curve = new THREE.CatmullRomCurve3(wire);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.014, 4, false), M.black);
    scene.add(tube);
  }

  /* ── 감자 더미 3종 ─────────────────────────────────────────────────── */
  const lumpy = new THREE.SphereGeometry(1, 12, 10);
  {
    const p = lumpy.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.09 * Math.sin(x * 7 + y * 5) + 0.06 * Math.cos(z * 9 - y * 4) + 0.04 * Math.sin((x + z) * 13);
      p.setXYZ(i, x * n, y * n, z * n);
    }
    lumpy.computeVertexNormals();
  }
  const pileDefs = {
    normal: { r: 1.45, mat: std(C.potato, { roughness: 0.95, envMapIntensity: 0.3 }), crate: 2.4, count: 30 },
    gold: {
      r: 1.0, crate: 1.9, count: 18,
      mat: std(C.gold, { roughness: 0.22, metalness: 0.85, emissive: 0x7a5000, emissiveIntensity: 0.35, envMapIntensity: 1.5 }),
    },
    crystal: {
      r: 0.92, crate: 1.7, count: 14,
      mat: new THREE.MeshStandardMaterial({
        color: C.crystal, roughness: 0.08, metalness: 0.3, emissive: 0x1c8fa8, emissiveIntensity: 0.45,
        transparent: true, opacity: 0.9, envMapIntensity: 1.8,
      }),
    },
  };
  const piles = [];
  const sparkles = [];
  L.piles.forEach((pd, pi) => {
    const def = pileDefs[pd.key];
    const g = new THREE.Group();
    // 팔레트
    box(def.crate * 0.96, 0.12, def.crate * 0.9, M.woodDark, 0, 0.06, 0, g);
    for (let i = 0; i < 4; i++) box(def.crate * 0.9, 0.09, 0.16, M.wood, 0, 0.14, -def.crate * 0.34 + i * def.crate * 0.22, g);
    // 상자 울타리
    for (const sx of [-1, 1]) {
      box(0.12, 0.52, def.crate * 0.9, M.wood, sx * def.crate * 0.47, 0.3, 0, g);
      box(0.12, 0.52, def.crate * 0.9, M.wood, 0, 0.3, sx * def.crate * 0.45, g).rotation.y = Math.PI / 2;
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.14, 0.46, 0.14, M.woodDark, sx * def.crate * 0.47, 0.24, sz * def.crate * 0.45, g);
    // 흙 더미
    const soil = new THREE.Mesh(shared.sph, M.soil);
    soil.scale.set(def.r * 0.9, def.r * 0.17, def.r * 0.9);
    soil.position.y = 0.3; soil.castShadow = true; soil.receiveShadow = true; g.add(soil);
    // 감자 무더기 (한 메시로 병합)
    const mound = new THREE.Group();
    const potGeos = [];
    for (let i = 0; i < def.count; i++) {
      const a = rnd() * Math.PI * 2;
      const rr2 = Math.pow(rnd(), 0.55) * def.r * 0.78;
      const layer = 1 - rr2 / (def.r * 0.9);
      const y = 0.5 + layer * def.r * 0.8 * rr(0.42, 1.05) + rr(0, 0.06);
      const s = rr(0.17, 0.26) * (def.key === 'normal' ? 1 : 0.92);
      const geo = lumpy.clone();
      _e.set(rnd() * 3, rnd() * 6, rnd() * 3); _q.setFromEuler(_e);
      _v.set(Math.cos(a) * rr2, y, Math.sin(a) * rr2);
      _s.set(s * 1.22, s * 0.82, s);
      geo.applyMatrix4(_m4.compose(_v, _q, _s));
      potGeos.push(geo);
    }
    const potMerged = mergeGeometries(potGeos, false);
    potGeos.forEach((gg) => gg.dispose());
    if (potMerged) {
      const pm = new THREE.Mesh(potMerged, def.mat);
      pm.castShadow = true; pm.receiveShadow = true;
      mound.add(pm);
    }
    g.add(mound);
    // 황금/크리스탈 반짝임
    if (pd.key !== 'normal') {
      const spMat = new THREE.SpriteMaterial({
        map: sparkTex(), transparent: true, opacity: 0.9, depthWrite: false,
        blending: THREE.AdditiveBlending, color: pd.key === 'gold' ? 0xfff0a0 : 0xbff6ff,
      });
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Sprite(spMat.clone());
        const a = rnd() * Math.PI * 2, rad = rr(0.25, def.r * 0.8);
        sp.position.set(Math.cos(a) * rad, rr(0.7, def.r + 0.5), Math.sin(a) * rad);
        sp.scale.setScalar(rr(0.25, 0.45));
        sp.userData.ph = rnd() * 6.28;
        g.add(sp); sparkles.push(sp);
      }
    }
    // 삽 · 바구니 소품
    if (pd.key === 'normal') {
      const shovel = new THREE.Group();
      box(0.06, 1.3, 0.06, M.wood, 0, 0.65, 0, shovel);
      box(0.3, 0.36, 0.04, M.steel, 0, 0.06, 0, shovel);
      shovel.position.set(-def.crate * 0.62, 0, 0.35); shovel.rotation.z = 0.22; g.add(shovel);
      const basket = new THREE.Group();
      const basketMat = std(0xa9763f, { roughness: 0.95, side: THREE.DoubleSide });
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.34, 12, 1, true), basketMat);
      bm.position.y = 0.17; basket.add(bm);
      for (let i = 0; i < 3; i++) {
        const pp = new THREE.Mesh(lumpy, def.mat);
        pp.scale.set(0.2, 0.15, 0.17);
        pp.position.set((i - 1) * 0.15, 0.34, (i % 2) * 0.12);
        basket.add(pp);
      }
      basket.position.set(def.crate * 0.72, 0, -0.2); g.add(basket);
    }
    // 라벨
    const label = makeTextSprite('x999', { size: 80, color: '#fff3cf', bg: 'rgba(40,22,10,.72)' });
    label.position.set(pd.x, 2.35, pd.z); label.scale.set(1.25, 0.6, 1);
    scene.add(label);
    g.position.set(pd.x, 0, pd.z);
    scene.add(g);
    piles.push({ key: pd.key, group: g, mound, label, x: pd.x, z: pd.z, def });
  });
  W.refs.piles = piles;
  W.refs.sparkles = sparkles;

  function sparkTex() {
    return tex(64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.25, 'rgba(255,250,210,.85)');
      grd.addColorStop(0.6, 'rgba(255,235,150,.22)');
      grd.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2, h - 6); g.moveTo(6, h / 2); g.lineTo(w - 6, h / 2); g.stroke();
    }, { clamp: true });
  }

  /* ── 지하실 해치 ───────────────────────────────────────────────────── */
  const hatch = new THREE.Group();
  box(2.3, 0.16, 2.3, M.steelDark, 0, 0.08, 0, hatch);
  const lid = new THREE.Group();
  lid.position.set(0, 0.16, -1.0);
  const lidMesh = box(2.0, 0.08, 2.0, M.steel, 0, 0, 1.0, lid);
  for (let i = 0; i < 5; i++) box(1.9, 0.05, 0.08, M.steelDark, 0, 0.05, 1.0 + (-0.76 + i * 0.38), lid);
  box(2.06, 0.05, 0.1, M.steelDark, 0, 0.03, 2.0, lid);
  hatch.add(lid);
  // 경첩
  for (const hx of [-0.7, 0.7]) bCyl(0.07, 0.07, 0.22, M.steelDark, hx, 0.2, -1.0, 8);
  const padlock = new THREE.Group();
  box(0.34, 0.3, 0.14, M.goldMetal, 0, 0, 0, padlock);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.038, 8, 14, Math.PI), M.steel);
  shackle.position.y = 0.16; padlock.add(shackle);
  padlock.position.set(0, 0.4, 0.92); hatch.add(padlock);
  const hatchGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffd34d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const hatchGlow = new THREE.Mesh(new THREE.CircleGeometry(2.5, 36), hatchGlowMat);
  hatchGlow.rotation.x = -Math.PI / 2; hatchGlow.position.y = 0.05; hatch.add(hatchGlow);
  hatch.position.set(L.hatch.x, 0, L.hatch.z);
  scene.add(hatch);
  W.refs.hatch = hatch; W.refs.hatchGlow = hatchGlowMat; W.refs.hatchLid = lid; W.refs.padlock = padlock;

  /* ═════════════════════════════════════════════════════════════════════
     주방 설비
     ═════════════════════════════════════════════════════════════════════ */
  // ── 컨베이어 벨트 ──────────────────────────────────────────────────
  const beltGrp = new THREE.Group(); scene.add(beltGrp);
  const B = L.belt, beltLen = B.z0 - B.z1, beltMid = (B.z0 + B.z1) / 2;
  box(B.w + 0.36, 0.18, beltLen + 0.4, M.steelDark, B.x, B.y - 0.21, beltMid, beltGrp);
  for (const sx of [-1, 1]) {
    box(0.1, 0.26, beltLen + 0.4, M.steel, B.x + sx * (B.w / 2 + 0.17), B.y - 0.02, beltMid, beltGrp);
    // 가이드 레일
    box(0.06, 0.12, beltLen + 0.4, M.chrome, B.x + sx * (B.w / 2 + 0.02), B.y + 0.14, beltMid, beltGrp);
  }
  // 지지 다리 + 크로스 브레이스
  for (let i = 0; i < 7; i++) {
    const z = B.z1 + (beltLen / 7) * (i + 0.5);
    for (const sx of [-1, 1]) {
      box(0.12, 0.52, 0.12, M.steelDark, B.x + sx * (B.w / 2 + 0.17), B.y - 0.34, z, beltGrp);
      box(0.12, 0.12, 0.5, M.steelDark, B.x + sx * (B.w / 2 + 0.17), B.y - 0.56, z, beltGrp);
    }
    box(B.w + 0.3, 0.07, 0.07, M.steelDark, B.x, B.y - 0.58, z, beltGrp);
  }
  // 슬랫 (회전)
  const slats = [];
  const slatMat = std(0x6d767e, { metalness: 0.72, roughness: 0.38, envMapIntensity: 1.1 });
  for (let i = 0; i < 30; i++) {
    const s = box(B.w - 0.04, 0.08, 0.24, slatMat, B.x, B.y, B.z1 + (beltLen / 30) * i, beltGrp);
    s.castShadow = false;
    slats.push(s);
  }
  // 롤러
  const rollers = [];
  for (const z of [B.z0, B.z1, beltMid]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, B.w + 0.14, 16), M.steel);
    r.rotation.z = Math.PI / 2; r.position.set(B.x, B.y - 0.17, z); r.castShadow = true;
    beltGrp.add(r); rollers.push(r);
  }
  // 모터
  box(0.5, 0.5, 0.6, M.steelDark, B.x + 0.95, B.y - 0.3, B.z1 + 0.3, beltGrp);
  cyl(0.2, 0.2, 0.3, M.steel, B.x + 1.2, B.y - 0.3, B.z1 + 0.3, beltGrp, 12).rotation.z = Math.PI / 2;

  // 호퍼 (마당 쪽) — 깔때기형
  const hopper = new THREE.Group();
  const hopMat = std(0xb9c3cb, { metalness: 0.85, roughness: 0.32, envMapIntensity: 1.2, side: THREE.DoubleSide });
  const hopBody = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.42, 0.8, 4, 1, true), hopMat);
  hopBody.rotation.y = Math.PI / 4;
  hopBody.position.y = 0.62; hopBody.castShadow = true; hopBody.receiveShadow = true;
  hopper.add(hopBody);
  const hopRim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.045, 6, 4), M.chrome);
  hopRim.rotation.x = Math.PI / 2; hopRim.rotation.z = Math.PI / 4; hopRim.position.y = 1.02; hopper.add(hopRim);
  // 받침 · 배출 슈트
  box(1.5, 0.42, 1.5, M.steelDark, 0, -0.1, 0, hopper);
  box(0.62, 0.34, 0.5, M.steel, 0, 0.22, 0, hopper);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    box(0.09, 0.5, 0.09, M.steelDark, sx * 0.62, 0.16, sz * 0.62, hopper);
  }
  hopper.position.set(B.x, B.y - 0.55, B.z0 + 0.55); beltGrp.add(hopper);

  // 벨트 커버(구매 전) — 안전 콘 + 바리케이드
  const beltTarp = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.66, 12), std(0xff6a1f, { roughness: 0.7 }));
    cone.position.set(B.x + (i % 2 ? 0.8 : -0.8), 0.33, 0.6 + i * 2.3);
    cone.castShadow = true; beltTarp.add(cone);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12), M.white);
    band.position.set(cone.position.x, 0.3, cone.position.z); beltTarp.add(band);
  }
  for (const sx of [-1, 1]) box(0.1, 0.95, 0.1, M.white, B.x + sx * 1.0, 0.48, B.z0 - 0.4, beltTarp);
  box(2.2, 0.16, 0.12, std(0xff6a1f, { roughness: 0.7 }), B.x, 0.94, B.z0 - 0.4, beltTarp);
  scene.add(beltTarp);
  W.refs.beltGrp = beltGrp; W.refs.beltSlats = slats; W.refs.beltRollers = rollers;
  W.refs.beltTarp = beltTarp; W.refs.hopper = hopper;

  // ── 탈피대 (수동) ──────────────────────────────────────────────────
  const peelerManual = new THREE.Group();
  box(1.6, 0.9, 1.15, M.wood, 0, 0.45, 0, peelerManual);
  box(1.78, 0.13, 1.32, std(0xd8c9a4, { roughness: 0.85 }), 0, 0.97, 0, peelerManual);
  box(0.72, 0.06, 0.52, M.white, -0.2, 1.05, 0, peelerManual);
  box(0.05, 0.04, 0.44, M.chrome, 0.36, 1.08, 0.1, peelerManual);
  box(0.13, 0.05, 0.17, M.black, 0.36, 1.08, -0.2, peelerManual);
  box(0.36, 0.26, 0.3, M.steel, -0.55, 1.18, -0.28, peelerManual);
  peelerManual.position.set(L.peeler.x, 0.35, L.peeler.z);
  scene.add(peelerManual);

  // ── 자동 탈피기 ────────────────────────────────────────────────────
  const peelerAuto = new THREE.Group();
  box(1.9, 0.74, 1.3, M.steel, 0, 0.37, 0, peelerAuto);
  box(2.0, 0.1, 1.4, M.steelDark, 0, 0.78, 0, peelerAuto);
  const drumGrp = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 1.14, 20), std(0xd6dde3, { metalness: 0.6, roughness: 0.35, envMapIntensity: 1.1 }));
  drum.rotation.z = Math.PI / 2; drum.castShadow = true; drumGrp.add(drum);
  // 회전 리브
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const rib = box(1.16, 0.05, 0.07, M.steelDark, 0, 0, 0, drumGrp);
    rib.position.set(0, Math.cos(a) * 0.55, Math.sin(a) * 0.55);
    rib.rotation.x = -a;
  }
  for (const sx of [-0.78, 0.78]) {
    box(0.16, 0.56, 0.16, M.steelDark, sx, -0.02, 0, peelerAuto);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12), M.steelDark);
    hub.rotation.z = Math.PI / 2; hub.position.set(sx * 0.96, 0.9, 0); peelerAuto.add(hub);
  }
  drumGrp.position.set(0, 0.9, 0); peelerAuto.add(drumGrp);
  box(1.1, 0.16, 0.72, M.steelDark, 0, 0.74, 0.6, peelerAuto);
  box(0.9, 0.3, 0.5, M.steel, 0, 0.9, 0.6, peelerAuto);
  const peelerLed = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glow(0x59ff8a));
  peelerLed.position.set(0.78, 0.66, 0.52); peelerAuto.add(peelerLed);
  peelerAuto.position.set(L.peeler.x, 0.35, L.peeler.z);
  peelerAuto.visible = false;
  scene.add(peelerAuto);
  W.refs.peelerManual = peelerManual; W.refs.peelerAuto = peelerAuto; W.refs.peelerDrum = drumGrp;

  // ── 튀김기 ─────────────────────────────────────────────────────────
  const fryGrp = new THREE.Group();
  box(2.95, 0.98, 1.5, M.steel, 0, 0.79, 0, fryGrp);
  box(3.05, 0.12, 1.62, M.chrome, 0, 1.3, 0, fryGrp);
  box(3.1, 0.16, 0.14, M.chrome, 0, 1.36, 0.78, fryGrp);
  // 조작부
  box(1.3, 0.34, 0.12, M.steelDark, 0, 1.05, 0.78, fryGrp);
  for (let i = 0; i < 3; i++) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), M.chrome);
    knob.rotation.x = Math.PI / 2; knob.position.set(-0.35 + i * 0.35, 1.05, 0.86); fryGrp.add(knob);
  }
  box(0.3, 0.1, 0.03, glow(0xff5b3b), 0.45, 1.12, 0.85, fryGrp);
  const vats = [];
  const basketGrps = [];
  for (let i = 0; i < 3; i++) {
    const vx = -0.94 + i * 0.94;
    box(0.8, 0.12, 1.18, M.steelDark, vx, 1.31, 0, fryGrp);
    const oilMat = new THREE.MeshStandardMaterial({
      color: 0xffb02e, emissive: 0xff8c00, emissiveIntensity: 0.4,
      roughness: 0.18, metalness: 0.15, envMapIntensity: 1.0, envMap: ENV,
    });
    const oil = box(0.68, 0.07, 1.04, oilMat, vx, 1.35, 0, fryGrp);
    oil.castShadow = false;
    vats.push(oil);
    // 바스켓 (철망 느낌: 테두리 + 세로살)
    const bk = new THREE.Group();
    const bm = std(0x9aa3ab, { metalness: 0.8, roughness: 0.35, envMapIntensity: 1.2 });
    for (const bx of [-0.3, 0.3]) box(0.03, 0.22, 0.98, bm, bx, 0, 0, bk);
    for (const bz of [-0.48, 0.48]) box(0.6, 0.22, 0.03, bm, 0, 0, bz, bk);
    for (let k = 0; k < 7; k++) box(0.02, 0.2, 0.02, bm, -0.3 + k * 0.1, 0, 0.48, bk);
    for (let k = 0; k < 7; k++) box(0.6, 0.02, 0.02, bm, 0, 0, -0.48 + k * 0.16, bk);
    box(0.5, 0.03, 0.9, bm, 0, -0.1, 0, bk);
    // 손잡이
    box(0.05, 0.06, 0.5, M.chrome, 0, 0.18, -0.62, bk);
    box(0.34, 0.06, 0.06, M.chrome, 0, 0.2, -0.86, bk);
    for (const sx of [-1, 1]) box(0.04, 0.14, 0.04, M.chrome, sx * 0.24, 0.1, -0.44, bk);
    bk.position.set(vx, 1.44, 0);
    fryGrp.add(bk); basketGrps.push(bk);
  }
  // 후드 + 배플 필터
  box(3.2, 0.44, 1.35, std(0xd6dee5, { metalness: 0.85, roughness: 0.3, envMapIntensity: 1.3 }), 0, 3.3, -0.28, fryGrp);
  for (let i = 0; i < 5; i++) {
    const bf = box(2.5, 0.24, 0.05, M.chrome, 0, 3.12, -0.72 + i * 0.24, fryGrp);
    bf.rotation.x = 0.55;
  }
  box(2.2, 0.09, 0.3, std(0xfff0d0, { emissive: 0xffd9a0, emissiveIntensity: 0.6 }), 0, 3.0, 0.28, fryGrp);
  cyl(0.3, 0.3, 1.3, M.steel, 0, 4.0, -0.22, fryGrp, 14);
  box(1.3, 0.5, 0.16, M.steelDark, 0, 1.62, 0.8, fryGrp);
  // 기름 배출
  cyl(0.08, 0.08, 0.5, M.steelDark, 1.35, 0.5, 0.5, fryGrp, 8);
  fryGrp.position.set(L.fryer.x, 0.36, L.fryer.z);
  scene.add(fryGrp);
  W.refs.fryer = fryGrp; W.refs.vats = vats; W.refs.fryBaskets = basketGrps;

  // 기름 방울 (Points)
  const bubbleGeo = new THREE.BufferGeometry();
  const bcount = 120;
  const bpos = new Float32Array(bcount * 3);
  const bseed = [];
  for (let i = 0; i < bcount; i++) {
    const v = i % 3;
    bseed.push({ x: L.fryer.x - 0.94 + v * 0.94 + rr(-0.28, 0.28), z: L.fryer.z + rr(-0.45, 0.45), y: rr(0, 0.4), sp: rr(0.5, 1.5) });
    bpos[i * 3] = bseed[i].x; bpos[i * 3 + 1] = 1.4; bpos[i * 3 + 2] = bseed[i].z;
  }
  bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  const bubbleMat = new THREE.PointsMaterial({
    color: 0xffe0a0, size: 0.055, transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
  bubbles.frustumCulled = false;
  scene.add(bubbles);
  W.refs.bubbles = { points: bubbles, seed: bseed, geo: bubbleGeo, mat: bubbleMat };

  // 김 (스프라이트)
  const steamTexture = tex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,.55)');
    grd.addColorStop(0.5, 'rgba(255,255,255,.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { clamp: true });
  const steam = [];
  for (let i = 0; i < 10; i++) {
    const sm = new THREE.SpriteMaterial({
      map: steamTexture, transparent: true, opacity: 0.16, depthWrite: false, color: 0xffffff,
    });
    const sp = new THREE.Sprite(sm);
    sp.position.set(L.fryer.x + rr(-1.1, 1.1), rr(2.2, 3.6), L.fryer.z + rr(-0.5, 0.6));
    sp.scale.setScalar(rr(0.7, 1.4));
    scene.add(sp);
    steam.push({ sp, mat: sm, ph: rnd() * 6.28, base: sp.position.clone(), spd: rr(0.35, 0.75) });
  }
  W.refs.steam = steam;
  W.refs.steamBoost = 0.3;

  // ── 튀김 대기 트레이 ───────────────────────────────────────────────
  const trayGrp = new THREE.Group();
  box(1.65, 0.86, 1.15, M.cream, 0, 0.43, 0, trayGrp);
  box(1.8, 0.1, 1.28, M.woodDark, 0, 0.91, 0, trayGrp);
  box(0.9, 0.6, 0.06, M.steel, 0, 0.6, 0.58, trayGrp);
  const trayStack = new THREE.Group();
  trayGrp.add(trayStack);
  trayGrp.position.set(L.ready.x, 0.35, L.ready.z);
  scene.add(trayGrp);
  W.refs.trayStack = trayStack;

  // ── 프라이 슈터 터렛 ───────────────────────────────────────────────
  const turret = new THREE.Group();
  box(1.05, 0.65, 1.05, M.steelDark, 0, 0.32, 0, turret);
  box(1.15, 0.1, 1.15, M.steel, 0, 0.68, 0, turret);
  const turretYaw = new THREE.Group(); turretYaw.position.y = 0.74;
  cyl(0.4, 0.44, 0.42, M.steel, 0, 0.2, 0, turretYaw, 14);
  const turretBarrel = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.0, 12), std(0xffd34d, { metalness: 0.55, roughness: 0.35, envMapIntensity: 1.2 }));
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(i / 4 * Math.PI * 2) * 0.2, Math.cos(i / 4 * Math.PI * 2) * 0.2, 0.52);
    b.castShadow = true; turretBarrel.add(b);
  }
  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 18), glow(0xffa14a));
  muzzle.position.z = 1.02; turretBarrel.add(muzzle);
  turretBarrel.position.y = 0.22; turretYaw.add(turretBarrel);
  const tLed = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glow(0xff5b3b));
  tLed.position.set(0, 0.46, -0.06); turretYaw.add(tLed);
  turret.add(turretYaw);
  turret.position.set(L.turret.x, 0.35, L.turret.z);
  turret.visible = false;
  scene.add(turret);
  W.refs.turret = turret; W.refs.turretYaw = turretYaw; W.refs.turretLed = tLed;

  // 배전함
  const breaker = new THREE.Group();
  box(0.8, 1.15, 0.4, std(0x7f8a93, { metalness: 0.55, roughness: 0.45, envMapIntensity: 0.8 }), 0, 0, 0, breaker);
  box(0.86, 0.06, 0.46, M.steelDark, 0, 0.6, 0, breaker);
  for (let i = 0; i < 4; i++) box(0.66, 0.09, 0.06, std(i % 2 ? 0xffd34d : 0x2b2b2b), 0, -0.42 + i * 0.28, 0.21, breaker);
  const lever = box(0.12, 0.34, 0.12, std(0xd8452c, { roughness: 0.6 }), 0.22, 0.1, 0.26, breaker);
  breaker.position.set(L.breaker.x, 1.5, L.breaker.z);
  breaker.rotation.y = Math.PI / 2;
  scene.add(breaker);
  W.refs.breaker = breaker; W.refs.breakerLever = lever;

  /* ── 경보등 ───────────────────────────────────────────────────────── */
  const alarmMats = [];
  for (const [ax, az] of [[S.x0 + 0.4, S.z1 + 0.3], [S.x1 - 0.4, S.z1 + 0.3], [L.belt.x + 1.2, S.z1 + 0.3]]) {
    const m = new THREE.MeshBasicMaterial({ color: 0xff3a1f, transparent: true, opacity: 0.25 });
    const b = sph(0.14, m, ax, 3.15, az);
    b.castShadow = false;
    cyl(0.18, 0.2, 0.1, M.steelDark, ax, 3.02, az, scene, 10);
    alarmMats.push(m);
  }
  W.refs.alarmMats = alarmMats;

  /* ── 조명 ─────────────────────────────────────────────────────────── */
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3a2f20, 0.34);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffe3bc, 0.06);
  scene.add(amb);

  const sun = new THREE.DirectionalLight(0xfff0d2, 2.35);
  sun.position.set(18, 30, 16);
  sun.castShadow = true;
  const sm = SOFT ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.028;
  scene.add(sun);
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);

  const shopLights = [];
  for (const [lx, lz] of [[-4.5, -6.2], [4.0, -6.2], [0.2, -1.6], [6.6, -8.6]]) {
    const pl = new THREE.PointLight(0xffd9a0, 9, 13, 2);
    pl.position.set(lx, 2.72, lz); scene.add(pl); shopLights.push(pl);
  }
  const winLight = new THREE.PointLight(0xffc35a, 6, 11, 2);
  winLight.position.set(S.x1 + 0.8, 3.4, L.window.z); scene.add(winLight);
  W.refs.winLight = winLight;

  // 가게 앞 은은한 필 라이트 (주방이 잘 보이게)
  const fill = new THREE.PointLight(0xffe2b8, 2.4, 17, 2);
  fill.position.set(1.0, 4.2, 4.5); scene.add(fill);
  // 달빛 (밤에만)
  const moonLight = new THREE.DirectionalLight(0x9fb6e0, 0);
  moonLight.position.set(-16, 24, -12);
  scene.add(moonLight);
  moonLight.target.position.set(0, 0, 0); scene.add(moonLight.target);
  W.refs.fill = fill; W.refs.sun = sun; W.refs.hemi = hemi; W.refs.amb = amb;
  W.refs.shopLights = shopLights; W.refs.moonLight = moonLight;

  /* ── 시간대(밤) 처리 ──────────────────────────────────────────────── */
  const DAY = {
    top: new THREE.Color(0x4fa8e8), mid: new THREE.Color(0x9fd8f2), hor: new THREE.Color(0xdff2ea),
    sun: new THREE.Color(0xfff4d8), sunInt: 2.5, hemi: 0.36, amb: 0.06,
    fog: new THREE.Color(0xcbe6ee), fogNear: 62, fogFar: 205,
  };
  const DUSK = {
    top: new THREE.Color(0x3d4f8e), mid: new THREE.Color(0xa5738f), hor: new THREE.Color(0xff9b5e),
    sun: new THREE.Color(0xff9550), sunInt: 1.15, hemi: 0.4, amb: 0.19,
    fog: new THREE.Color(0xc2856a), fogNear: 52, fogFar: 175,
  };
  const NIGHT = {
    top: new THREE.Color(0x060c1c), mid: new THREE.Color(0x0d1730), hor: new THREE.Color(0x243250),
    sun: new THREE.Color(0x8ba3e0), sunInt: 0, hemi: 0.32, amb: 0.2,
    fog: new THREE.Color(0x0b1426), fogNear: 30, fogFar: 140,
  };
  // 새벽 (밤 → 아침 사이)
  const DAWN = {
    top: new THREE.Color(0x3f5a90), mid: new THREE.Color(0xc58f95), hor: new THREE.Color(0xffbe8e),
    sun: new THREE.Color(0xffb072), sunInt: 0.5, hemi: 0.4, amb: 0.22,
    fog: new THREE.Color(0xb79ea0), fogNear: 38, fogFar: 155,
  };
  scene.background = DAY.mid.clone();
  scene.fog = new THREE.Fog(DAY.fog.clone(), DAY.fogNear, DAY.fogFar);

  const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();
  W.setNight = (t, dim = 0, dawn = 0) => {
    const tt = clamp01(t);
    // 0~0.5 낮→노을, 0.5~1 노을→밤
    let k1 = Math.min(1, tt / 0.55), k2 = Math.max(0, (tt - 0.45) / 0.55);
    const dayW = 1 - k1, duskW = k1 * (1 - k2), nightW = k2;
    skyUniforms.topColor.value.copy(_c1.copy(DAY.top).multiplyScalar(dayW).add(_c2.copy(DUSK.top).multiplyScalar(duskW)).add(_c3.copy(NIGHT.top).multiplyScalar(nightW)));
    skyUniforms.midColor.value.copy(_c1.copy(DAY.mid).multiplyScalar(dayW).add(_c2.copy(DUSK.mid).multiplyScalar(duskW)).add(_c3.copy(NIGHT.mid).multiplyScalar(nightW)));
    skyUniforms.horizonColor.value.copy(_c1.copy(DAY.hor).multiplyScalar(dayW).add(_c2.copy(DUSK.hor).multiplyScalar(duskW)).add(_c3.copy(NIGHT.hor).multiplyScalar(nightW)));
    skyUniforms.sunColor.value.copy(_c1.copy(DAY.sun).multiplyScalar(dayW).add(_c2.copy(DUSK.sun).multiplyScalar(duskW)).add(_c3.copy(NIGHT.sun).multiplyScalar(nightW * 0.2)));
    skyUniforms.sunPower.value = Math.max(0, 1 - tt * 1.15) * (1 - dim * 0.9);
    skyUniforms.starAlpha.value = Math.max(0, (tt - 0.5) / 0.5) * (1 - dim * 0.35);
    skyUniforms.cityGlow.value = Math.max(0, (tt - 0.35) / 0.65) * (1 - dim * 0.6);
    // 새벽: 어두운 하늘을 붉은 기운으로 덮는다
    if (dawn > 0.001) {
      const k = Math.min(1, dawn);
      skyUniforms.topColor.value.lerp(DAWN.top, k * 0.75);
      skyUniforms.midColor.value.lerp(DAWN.mid, k * 0.8);
      skyUniforms.horizonColor.value.lerp(DAWN.hor, k * 0.85);
      skyUniforms.sunColor.value.lerp(DAWN.sun, k * 0.8);
      skyUniforms.sunPower.value = Math.max(skyUniforms.sunPower.value, k * 0.55);
    }

    scene.background.copy(skyUniforms.midColor.value);
    if (dawn > 0.001) {
      scene.fog.color.lerp(DAWN.fog, Math.min(1, dawn) * 0.65);
    }
    scene.fog.color.copy(
      _c1.copy(DAY.fog).multiplyScalar(dayW * (1 - dim * 0.7))
        .add(_c2.copy(DUSK.fog).multiplyScalar(duskW))
        .add(_c3.copy(NIGHT.fog).multiplyScalar(nightW))
    );
    scene.fog.near = (DAY.fogNear * dayW + DUSK.fogNear * duskW + NIGHT.fogNear * nightW) * (1 - dim * 0.25);
    scene.fog.far = (DAY.fogFar * dayW + DUSK.fogFar * duskW + NIGHT.fogFar * nightW) * (1 - dim * 0.3);

    moonLight.intensity = tt * 0.95 * (1 - dim * 0.9);
    const dark = 1 - dim * 0.94;
    sun.intensity = (DAY.sunInt * dayW + DUSK.sunInt * duskW) * dark;
    sun.color.copy(_c1.copy(DAY.sun).multiplyScalar(dayW).add(_c2.copy(DUSK.sun).multiplyScalar(duskW)).add(_c3.copy(NIGHT.sun).multiplyScalar(nightW * 0.4)));
    hemi.intensity = (DAY.hemi * dayW + DUSK.hemi * duskW + NIGHT.hemi * nightW) * (1 - dim * 0.8);
    amb.intensity = (DAY.amb * dayW + DUSK.amb * duskW + NIGHT.amb * nightW) * (1 - dim * 0.7);
    fill.intensity = (2.0 * dayW + 1.8 * duskW + 1.3 * nightW) * (1 - dim * 0.85);
    shopLights.forEach((l) => { l.intensity = (6.5 * dayW + 9 * duskW + 11 * nightW) * (1 - dim * 0.95); });
    lampLights.forEach((o) => {
      if (o.light) o.light.intensity = tt > 0.28 ? (20 * Math.min(1, (tt - 0.28) / 0.5)) * (1 - dim * 0.2) : 0;
      o.bulbMat.color.setHex(tt > 0.28 ? 0xffe6b0 : 0x8f8b80);
    });
    winLight.intensity = (5 * dayW + 8 * duskW + 11 * nightW) * (1 - dim * 0.9);
    signGlowMat.opacity = 0.16 + tt * 0.34;
    neonTubeMat.color.setHex(tt > 0.4 ? 0xffc45c : 0xffa63d);
    openSignMat.opacity = 1;
    starMat.opacity = skyUniforms.starAlpha.value * 0.9;
    moonMat.opacity = Math.max(0, (tt - 0.45) / 0.55);
    moonGlowMat.opacity = moonMat.opacity * 0.5;
    // 달 위치 (해 반대편)
    const ma = 2.2;
    moon.position.set(Math.cos(ma) * 190, 92, Math.sin(ma) * 190);
    moonGlow.position.copy(moon.position);
    clouds.forEach((c) => { c.mat.opacity = (1 - Math.min(1, tt * 1.35)) * c.base; c.mat.color.setHex(tt > 0.5 ? 0x5a6580 : 0xffffff); });
    W.refs.neonMats.forEach((m) => { if (m.isMeshBasicMaterial) m.color.setHex(tt > 0.35 ? 0xffd27a : 0xff9a3a); });
    if (dawn > 0.001) {
      moonLight.intensity = Math.max(0, moonLight.intensity - dawn * 0.6);
      sun.intensity = Math.max(sun.intensity, DAWN.sunInt * Math.min(1, dawn));
    }
    W.nightT = tt;
  };
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  W.setNight(0);

  W.alert = (on) => {
    alarmMats.forEach((m) => { m.opacity = on ? 0.95 : 0.22; });
  };
  W.alert(false);

  /* ── 시간 기반 소소한 애니메이션 ─────────────────────────────────── */
  W.setClock = (hours) => {
    const h = hours % 12, m = (hours % 1) * 60;
    W.refs.clockMin.rotation.z = -m * Math.PI / 30;
    W.refs.clockHour.rotation.z = -h * Math.PI / 6;
  };

  W.tick = (time, nightMix) => {
    // 구름 이동
    clouds.forEach((c) => {
      c.a += c.speed * 0.016;
      c.sp.position.x = Math.cos(c.a) * c.r;
      c.sp.position.z = Math.sin(c.a) * c.r;
    });
    // 옥상 팬
    rooftopFans.forEach((f, i) => { f.rotation.y += 0.02 + i * 0.004; });
    // 별 반짝임
    starMat.size = 1.35 + Math.sin(time * 1.7) * 0.12;
    // 네온 미세 깜빡임
    const flick = 0.94 + Math.sin(time * 13.1) * 0.03 + Math.sin(time * 3.7) * 0.03;
    signGlowMat.opacity = (0.18 + nightMix * 0.4) * flick;
    // 반짝임
    for (const sp of sparkles) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 3 + sp.userData.ph));
      sp.material.opacity = a * (0.45 + nightMix * 0.55);
      sp.scale.setScalar(0.22 + a * 0.24);
    }
    // 기름 방울
    const bub = W.refs.bubbles;
    if (bub) {
      const arr = bub.geo.attributes.position.array;
      for (let i = 0; i < bub.seed.length; i++) {
        const s = bub.seed[i];
        s.y += s.sp * 0.016;
        if (s.y > 0.5) { s.y = 0; s.x = L.fryer.x - 0.94 + (i % 3) * 0.94 + (rnd() - 0.5) * 0.5; s.z = L.fryer.z + (rnd() - 0.5) * 0.8; }
        arr[i * 3] = s.x; arr[i * 3 + 1] = 1.37 + s.y * 0.3; arr[i * 3 + 2] = s.z;
      }
      bub.geo.attributes.position.needsUpdate = true;
      bub.mat.opacity = 0.4 + nightMix * 0.2;
    }
    // 김
    const boost = W.refs.steamBoost || 0.3;
    steam.forEach((s2, i) => {
      s2.ph += s2.spd * 0.016;
      const l = (s2.ph % 1);
      s2.sp.position.set(
        s2.base.x + Math.sin(time * 0.9 + i) * 0.12,
        s2.base.y + l * 1.5,
        s2.base.z + Math.cos(time * 0.7 + i) * 0.1);
      s2.sp.scale.setScalar(0.7 + l * 1.4);
      s2.mat.opacity = (1 - l) * 0.22 * (0.5 + boost * 1.6);
    });
    // 금속 난간 등의 미세 반짝임은 생략
  };

  flushBatches();

  W.setEnvEnabled = (on) => {
    scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      const list = Array.isArray(m) ? m : [m];
      list.forEach((mm) => {
        if (mm.isMeshStandardMaterial || mm.isMeshPhysicalMaterial) {
          if (on && !mm.envMap && mm.userData && mm.userData.wantEnv) { mm.envMap = ENV; mm.needsUpdate = true; }
          if (!on && mm.envMap) { mm.envMap = null; mm.needsUpdate = true; }
        }
      });
    });
    W.envOn = on;
  };

  W.box = box; W.cyl = cyl; W.sph = sph; W.std = std; W.shared = shared; W.tex = tex;
  W.M = M;
  return W;
}

/* =========================================================================
   텍스트 스프라이트
   ========================================================================= */
export function makeTextSprite(text, opt = {}) {
  const size = opt.size || 96;
  const pad = 22;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  const font = `bold ${size}px 'Jua','Noto Sans KR','Malgun Gothic',sans-serif`;
  g.font = font;
  const tw = Math.ceil(g.measureText(text).width) + pad * 2;
  const th = size + pad * 2;
  cv.width = tw; cv.height = th;
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (opt.bg) {
    g.fillStyle = opt.bg;
    roundRect(g, 2, 2, tw - 4, th - 4, th * 0.32); g.fill();
    g.strokeStyle = 'rgba(255,220,160,.45)'; g.lineWidth = 3;
    roundRect(g, 2, 2, tw - 4, th - 4, th * 0.32); g.stroke();
  }
  g.fillStyle = opt.color || '#fff';
  g.fillText(text, tw / 2, th / 2 + size * 0.06);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const sp = new THREE.Sprite(mat);
  sp.userData.aspect = tw / th;
  sp.scale.set((tw / th) * (opt.h || 0.75), (opt.h || 0.75), 1);
  sp.renderOrder = 2;
  sp.userData.setText = (t2) => {
    const c2 = document.createElement('canvas');
    const gg = c2.getContext('2d');
    gg.font = font;
    const w2 = Math.ceil(gg.measureText(t2).width) + pad * 2;
    c2.width = w2; c2.height = th;
    gg.font = font; gg.textAlign = 'center'; gg.textBaseline = 'middle';
    if (opt.bg) {
      gg.fillStyle = opt.bg; roundRect(gg, 2, 2, w2 - 4, th - 4, th * 0.32); gg.fill();
      gg.strokeStyle = 'rgba(255,220,160,.45)'; gg.lineWidth = 3;
      roundRect(gg, 2, 2, w2 - 4, th - 4, th * 0.32); gg.stroke();
    }
    gg.fillStyle = opt.color || '#fff';
    gg.fillText(t2, w2 / 2, th / 2 + size * 0.06);
    const nt = new THREE.CanvasTexture(c2);
    nt.colorSpace = THREE.SRGBColorSpace;
    sp.material.map.dispose(); sp.material.map = nt; sp.material.needsUpdate = true;
    sp.scale.set((w2 / th) * (opt.h || 0.75), (opt.h || 0.75), 1);
  };
  return sp;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* =========================================================================
   캐릭터 · 차량 · 소품
   ========================================================================= */
const SKIN = 0xffd9b0;
const CAP_COLORS = [0x2f6fb5, 0xd8452c, 0x2f8f4a, 0x8a4fb5];

const _mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({
  color: c, roughness: 0.78, metalness: 0.03, envMapIntensity: 0.4, envMap: ENV,
}, o || {}));

/* ── 점원 (바이저 모자 · 앞치마 · 표정 · 관절) ─────────────────────── */
export function makeClerk(opt = {}) {
  const color = opt.color !== undefined ? opt.color : CAP_COLORS[0];
  const g = new THREE.Group();
  const uni = _mat(color, { roughness: 0.72 });
  const uniDark = _mat(new THREE.Color(color).multiplyScalar(0.75).getHex(), { roughness: 0.75 });
  const skin = _mat(SKIN, { roughness: 0.62 });
  const cream = _mat(0xfff7e6, { roughness: 0.82 });
  const hair = _mat(0x3a2a20, { roughness: 0.85 });
  const shoe = _mat(0x33261c, { roughness: 0.6 });

  // 다리
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.115, 0.52, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.16, 4, 8), _mat(0x3f4b5c, { roughness: 0.8 }));
    thigh.position.y = -0.11; thigh.castShadow = true; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.24; hip.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.14, 4, 8), _mat(0x3f4b5c, { roughness: 0.8 }));
    shin.position.y = -0.1; shin.castShadow = true; knee.add(shin);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.26), shoe);
    sh.position.set(0, -0.22, 0.045); sh.castShadow = true; knee.add(sh);
    g.add(hip); legs.push(hip);
  }
  // 몸통
  const torso = new THREE.Group(); torso.position.y = 0.76; g.add(torso);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.225, 0.3, 6, 12), uni);
  body.position.y = 0.1; body.castShadow = true; torso.add(body);
  // 앞치마
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.46, 0.08), cream);
  apron.position.set(0, 0.03, 0.2); apron.castShadow = true; torso.add(apron);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.03), _mat(0xf0e4c8, { roughness: 0.9 }));
  pocket.position.set(0, -0.03, 0.25); torso.add(pocket);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.03), cream);
  strap.position.set(0, 0.28, 0.2); torso.add(strap);
  // 목걸이 수건
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 12, Math.PI), _mat(0xd8452c, { roughness: 0.8 }));
  scarf.rotation.x = Math.PI / 2; scarf.position.set(0, 0.3, 0.03); torso.add(scarf);
  // 이름표
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), _mat(0xfff2c0, { roughness: 0.6 }));
  badge.position.set(0.1, 0.14, 0.24); torso.add(badge);

  // 팔
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(sx * 0.255, 0.94, 0);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.17, 4, 8), uni);
    up.position.y = -0.11; up.castShadow = true; sh.add(up);
    const elbow = new THREE.Group(); elbow.position.y = -0.24; sh.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.16, 4, 8), skin);
    fore.position.y = -0.1; fore.castShadow = true; elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), skin);
    hand.position.y = -0.21; hand.scale.set(1, 0.85, 1.1); elbow.add(hand);
    sh.rotation.z = sx * 0.1;
    g.add(sh); arms.push(sh);
  }

  // 머리
  const headG = new THREE.Group(); headG.position.y = 1.3; g.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 18, 16), skin);
  head.castShadow = true; headG.add(head);
  // 머리카락
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.243, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
  hairMesh.position.y = 0.015; hairMesh.rotation.x = -0.12; headG.add(hairMesh);
  // 바이저 모자
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), uni);
  cap.position.y = 0.085; cap.castShadow = true; headG.add(cap);
  const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.252, 0.252, 0.045, 20), uniDark);
  capBand.position.y = 0.075; headG.add(capBand);
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.035, 20), uniDark);
  visor.position.set(0, 0.075, 0.14); visor.rotation.x = -0.16; headG.add(visor);
  // 눈 (흰자 + 눈동자)
  const eyes = [];
  for (const sx of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), _mat(0xffffff, { roughness: 0.35 }));
    white.position.set(sx * 0.083, 0.005, 0.2); white.scale.set(1, 1.15, 0.55); headG.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), _mat(0x241a12, { roughness: 0.35 }));
    pupil.position.set(sx * 0.083, 0.0, 0.232); pupil.scale.set(1, 1.1, 0.6); headG.add(pupil);
    eyes.push(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.02), hair);
    brow.position.set(sx * 0.085, 0.088, 0.215); brow.rotation.z = -sx * 0.16; headG.add(brow);
  }
  // 코 · 입
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), skin);
  nose.position.set(0, -0.03, 0.235); headG.add(nose);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.013, 6, 12, Math.PI), _mat(0x8a4a3a, { roughness: 0.6 }));
  mouth.position.set(0, -0.075, 0.22); mouth.rotation.z = Math.PI; headG.add(mouth);
  // 볼
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), _mat(0xffb9a0, { roughness: 0.7 }));
    cheek.position.set(sx * 0.13, -0.04, 0.19); cheek.scale.set(1, 0.7, 0.4); headG.add(cheek);
  }
  // 귀
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin);
    ear.position.set(sx * 0.225, -0.005, 0.01); ear.scale.set(0.6, 1, 0.8); headG.add(ear);
  }

  g.userData.arms = arms; g.userData.legs = legs; g.userData.body = body;
  g.userData.head = headG; g.userData.eyes = eyes; g.userData.mouth = mouth;
  g.userData.torso = torso;
  g.scale.setScalar(opt.scale || 1);
  return g;
}

/* ── 손님 (점원 모델 변형) ─────────────────────────────────────────── */
export function makeWalker(opt = {}) {
  const g = makeClerk({ color: opt.color !== undefined ? opt.color : 0x6a7f9a, scale: 0.96 });
  // 앞치마·모자·수건 숨기고 머리카락 살짝 다르게
  g.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    if (geo && geo.type === 'TorusGeometry') o.visible = false;       // 수건
    if (geo && geo.type === 'CylinderGeometry' && o.position.z > 0.05 && o.position.y > 0) o.visible = false; // 바이저
  });
  // 상의 색 셔츠로 교체 + 가방
  const shirt = _mat(opt.color !== undefined ? opt.color : 0x8a6a4a, { roughness: 0.85 });
  g.userData.torso.children.forEach((c) => {
    if (c.isMesh && c.geometry.type === 'BoxGeometry' && c.geometry.parameters.width > 0.3) c.visible = false; // 앞치마
    if (c.isMesh && c.geometry.type === 'BoxGeometry' && c.geometry.parameters.height > 0.25) c.visible = false;
    if (c.isMesh && c.geometry.type === 'BoxGeometry' && c.geometry.parameters.width < 0.2) c.visible = false;
  });
  if (g.userData.body) g.userData.body.material = shirt;
  // 모자 대신 비니
  const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), _mat(0x3f4a5a, { roughness: 0.9 }));
  beanie.position.y = 1.37; beanie.scale.y = 0.7; g.add(beanie);
  // 가방
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.1), _mat(0x5a4632, { roughness: 0.9 }));
  bag.position.set(0.26, 0.86, -0.08); g.add(bag);
  return g;
}

/* ── 감자 로봇 (섀시 · 차축 · 레이더 · LED 바이저 · 집게팔) ─────────── */
export function makeRobot() {
  const g = new THREE.Group();
  const met = (c, o) => new THREE.MeshStandardMaterial(Object.assign({
    color: c, roughness: 0.42, metalness: 0.65, envMapIntensity: 1.0, envMap: ENV,
  }, o || {}));
  const shell = met(0xe3ebf1, { roughness: 0.35 });
  const shellDark = met(0x9aa8b4, { roughness: 0.45 });
  const accent = met(0xffa23a, { roughness: 0.4, metalness: 0.5 });

  // 하부 섀시 (바퀴와 몸통을 연결)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.14, 0.58), shellDark);
  chassis.position.y = 0.31; chassis.castShadow = true; g.add(chassis);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.06, 0.64), met(0x5c6a76, { roughness: 0.5 }));
  skirt.position.y = 0.22; g.add(skirt);
  // 차축
  for (const sz of [-0.22, 0.22]) {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), met(0x8b98a4, { roughness: 0.4 }));
    axle.rotation.z = Math.PI / 2; axle.position.set(0, 0.18, sz); g.add(axle);
  }
  // 바퀴
  const wheels = [];
  const wheelMat = met(0x2b3137, { roughness: 0.92, metalness: 0.12 });
  const wheelGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.11, 16);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const wh = new THREE.Mesh(wheelGeo, wheelMat);
    wh.rotation.z = Math.PI / 2; wh.position.set(sx * 0.32, 0.165, sz * 0.22);
    wh.castShadow = true; g.add(wh); wheels.push(wh);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.125, 10), met(0xffb04a, { roughness: 0.35 }));
    hub.rotation.z = Math.PI / 2; hub.position.set(sx * 0.335, 0.165, sz * 0.22); g.add(hub);
    // 서스펜션 스트럿
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 6), met(0x8b98a4));
    strut.position.set(sx * 0.28, 0.28, sz * 0.22); g.add(strut);
  }
  // 몸통
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.52), shell);
  body.position.y = 0.72; body.castShadow = true; g.add(body);
  const bodyTop = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.46), shellDark);
  bodyTop.position.y = 0.98; g.add(bodyTop);
  // 패널 · 환기구
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.05), met(0x2f3a45, { roughness: 0.35, metalness: 0.5 }));
  panel.position.set(-0.09, 0.75, 0.27); g.add(panel);
  for (let i = 0; i < 3; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.014, 0.02), met(0x16202a));
    vent.position.set(-0.09, 0.82 - i * 0.04, 0.3); g.add(vent);
  }
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: 0x59ffd0 }));
  led.position.set(0.16, 0.83, 0.29); g.add(led);
  // 사이드 스트라이프
  for (const sx of [-1, 1]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.42), accent);
    st.position.set(sx * 0.315, 0.66, 0.02); g.add(st);
  }
  // 등 뒤 감자 바구니
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.22, 12, 1, true), shellDark);
  bin.position.set(0, 0.72, -0.34); bin.material.side = THREE.DoubleSide; g.add(bin);
  const binRim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 14), accent);
  binRim.rotation.x = Math.PI / 2; binRim.position.set(0, 0.83, -0.34); g.add(binRim);
  // 목
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.1, 10), shellDark);
  neck.position.y = 1.03; g.add(neck);
  // 머리
  const headPivot = new THREE.Group(); headPivot.position.y = 1.16; g.add(headPivot);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.42), shell);
  head.castShadow = true; headPivot.add(head);
  const facePlate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.04), met(0x22303c, { roughness: 0.3, metalness: 0.45 }));
  facePlate.position.set(0, 0.01, 0.215); headPivot.add(facePlate);
  // LED 바이저 눈
  const visorGlow = new THREE.MeshBasicMaterial({ color: 0x6fe8ff });
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.075, 0.02), visorGlow);
  visor.position.set(0, 0.02, 0.235); headPivot.add(visor);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), visorGlow);
  eyeL.position.set(-0.1, 0.02, 0.24); eyeL.scale.set(1, 1, 0.4); headPivot.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.1; headPivot.add(eyeR);
  // 귀 (원형 스피커)
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12), shellDark);
    ear.rotation.z = Math.PI / 2; ear.position.set(sx * 0.24, 0.02, 0); headPivot.add(ear);
  }
  // 안테나 + 회전 레이더
  const antRod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), met(0x9aa4ae));
  antRod.position.set(-0.13, 0.26, -0.06); headPivot.add(antRod);
  const radar = new THREE.Group();
  radar.position.set(-0.13, 0.36, -0.06);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), met(0xcfd8e0, { side: THREE.DoubleSide }));
  dish.rotation.x = -1.1; dish.scale.set(1, 0.55, 1); radar.add(dish);
  const dishTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff5b3b }));
  dishTip.position.set(0, 0.05, 0.02); radar.add(dishTip);
  headPivot.add(radar);
  // 상태등
  const statusMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const status = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), statusMat);
  status.position.set(0.16, 0.19, 0.16); headPivot.add(status);

  // 집게팔 (다관절)
  const armPivot = new THREE.Group();
  armPivot.position.set(0.33, 0.9, 0.1);
  const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), shellDark);
  armPivot.add(shoulderBall);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, 0.09), shell);
  upper.position.y = -0.16; upper.castShadow = true; armPivot.add(upper);
  const elbow = new THREE.Group(); elbow.position.y = -0.29; armPivot.add(elbow);
  const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), accent);
  elbow.add(elbowBall);
  const fore = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.07), shellDark);
  fore.position.y = -0.14; fore.castShadow = true; elbow.add(fore);
  const wrist = new THREE.Group(); wrist.position.y = -0.26; elbow.add(wrist);
  for (const sx of [-1, 0, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.05), met(0xa8b2bc));
    f.position.set(sx * 0.055, -0.08, 0);
    f.rotation.z = sx * 0.32;
    wrist.add(f);
  }
  wrist.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8), accent));
  const claw = wrist;
  g.add(armPivot);
  // 반대쪽 균형추 팔
  const armPivotL = new THREE.Group();
  armPivotL.position.set(-0.33, 0.9, 0.1);
  armPivotL.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), shellDark));
  const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), shellDark);
  lArm.position.y = -0.18; armPivotL.add(lArm);
  g.add(armPivotL);

  g.userData.armPivot = armPivot; g.userData.claw = claw; g.userData.led = led;
  g.userData.visorMat = visorGlow; g.userData.headPivot = headPivot; g.userData.radar = radar;
  g.userData.wheels = wheels; g.userData.elbow = elbow; g.userData.statusMat = statusMat;
  return g;
}

/* ── 자동차 ───────────────────────────────────────────────────────── */
export function makeCar(opt = {}) {
  const g = new THREE.Group();
  const color = opt.color !== undefined ? opt.color : 0x3b6fd4;
  const paint = new THREE.MeshStandardMaterial({
    color, roughness: 0.24, metalness: 0.55, envMapIntensity: 1.2, envMap: ENV,
  });
  const paintDark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.7).getHex(), roughness: 0.3, metalness: 0.6, envMapIntensity: 1.1, envMap: ENV,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.55, metalness: 0.4, envMapIntensity: 0.7, envMap: ENV });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9e2ea, roughness: 0.12, metalness: 1, envMapIntensity: 1.4, envMap: ENV });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x334a5e, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.4, envMap: ENV,
    transparent: true, opacity: 0.92,
  });

  // 하부 차체 · 범퍼
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.42, 3.05), paintDark);
  lower.position.y = 0.46; lower.castShadow = true; g.add(lower);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.44, 3.1), paint);
  body.position.y = 0.74; body.castShadow = true; g.add(body);
  // 후드 · 트렁크 (살짝 낮게)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 1.0), paint);
  hood.position.set(0, 0.94, 1.02); hood.rotation.x = -0.045; g.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.8), paint);
  trunk.position.set(0, 0.94, -1.12); g.add(trunk);
  // 캐빈
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.56, 1.62), paint);
  cabin.position.set(0, 1.16, -0.14); cabin.castShadow = true; g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.09, 1.5), paint);
  roof.position.set(0, 1.46, -0.16); g.add(roof);
  // 유리창
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 0.06), glass);
  wind.position.set(0, 1.2, 0.66); wind.rotation.x = -0.3; g.add(wind);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.38, 0.06), glass);
  rear.position.set(0, 1.2, -0.96); rear.rotation.x = 0.28; g.add(rear);
  for (const sx of [-1, 1]) {
    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 1.36), glass);
    sideWin.position.set(sx * 0.72, 1.2, -0.15); g.add(sideWin);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1), paintDark);
    mirror.position.set(sx * 0.86, 1.06, 0.5); g.add(mirror);
    const doorLine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.02), trim);
    doorLine.position.set(sx * 0.86, 0.74, -0.1); g.add(doorLine);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.16), chrome);
    handle.position.set(sx * 0.87, 0.9, -0.05); g.add(handle);
  }
  // 범퍼 · 그릴
  const fBump = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.22, 0.24), trim);
  fBump.position.set(0, 0.46, 1.56); g.add(fBump);
  const rBump = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.22, 0.24), trim);
  rBump.position.set(0, 0.46, -1.56); g.add(rBump);
  for (const sx of [-1, 1]) {
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), trim);
    grille.position.set(sx * 0.45, 0.66, 1.57); g.add(grille);
    // 헤드라이트
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.05), hlMat);
    hl.position.set(sx * 0.52, 0.68, 1.58); g.add(hl);
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f });
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), tlMat);
    tl.position.set(sx * 0.54, 0.7, -1.58); g.add(tl);
    g.userData.headMats = g.userData.headMats || [];
    g.userData.headMats.push(hlMat);
    g.userData.tailMats = g.userData.tailMats || [];
    g.userData.tailMats.push(tlMat);
  }
  // 번호판
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), new THREE.MeshBasicMaterial({ map: plateTexNow() }));
  plate.position.set(0, 0.44, 1.69); g.add(plate);
  // 배기관
  for (const sx of [-0.5, 0.5]) {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), chrome);
    ex.rotation.x = Math.PI / 2; ex.position.set(sx, 0.34, -1.62); g.add(ex);
  }
  // 바퀴 (회전 refs)
  const wheels = [];
  for (const [sx, sz] of [[-1, -1.02], [1, -1.02], [-1, 1.02], [1, 1.02]]) {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.2, 18), new THREE.MeshStandardMaterial({
      color: 0x191c20, roughness: 0.95, metalness: 0.02, envMapIntensity: 0.3,
    }));
    tire.rotation.z = Math.PI / 2; tire.castShadow = true; wg.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.21, 12), chrome);
    rim.rotation.z = Math.PI / 2; wg.add(rim);
    for (let k = 0; k < 5; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.07), trim);
      spoke.position.set(0, 0, 0); spoke.rotation.x = k * Math.PI / 2.5; spoke.position.y = Math.cos(k * Math.PI / 2.5) * 0.09; spoke.position.z = Math.sin(k * Math.PI / 2.5) * 0.09;
      wg.add(spoke);
    }
    wg.position.set(sx * 0.8, 0.29, sz);
    g.add(wg); wheels.push(wg);
    // 휠 아치
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 6, 12, Math.PI), trim);
    arch.rotation.y = Math.PI / 2; arch.position.set(sx * 0.86, 0.34, sz); g.add(arch);
  }
  // 전조등 빛 웅덩이 (밤에 켜짐)
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe9b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (const sx of [-1, 1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 12, 1, true), beamMat);
    cone.rotation.x = -Math.PI / 2; cone.position.set(sx * 0.5, 0.62, 2.9);
    g.add(cone);
  }
  g.userData.wheels = wheels;
  g.userData.beamMat = beamMat;
  return g;
}
let _plateTex = null;
function plateTexNow() {
  if (_plateTex) return _plateTex;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#f2f2ea'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#2b3a4a'; g.lineWidth = 5; g.strokeRect(4, 4, 120, 56);
  g.fillStyle = '#20293a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = "bold 30px 'Jua',sans-serif";
  g.fillText('12가 3456', 64, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  _plateTex = t;
  return t;
}

/* ── 감자 ─────────────────────────────────────────────────────────── */
const POTATO_GEO = (() => {
  const geo = new THREE.SphereGeometry(1, 14, 12);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.1 * Math.sin(x * 6 + y * 4) + 0.06 * Math.cos(z * 8 - y * 5) + 0.03 * Math.sin((x + z) * 15);
    p.setXYZ(i, x * n, y * n, z * n);
  }
  geo.computeVertexNormals();
  return geo;
})();

export function makePotato(type) {
  const g = new THREE.Group();
  const s = type === 'crystal' ? 0.3 : 0.345;
  let mat;
  if (type === 'gold') {
    mat = new THREE.MeshStandardMaterial({
      color: 0xffc93c, roughness: 0.2, metalness: 0.9, emissive: 0x8a5a00, emissiveIntensity: 0.22,
      envMapIntensity: 1.5, envMap: ENV,
    });
  } else if (type === 'crystal') {
    mat = new THREE.MeshStandardMaterial({
      color: 0x8feaff, roughness: 0.05, metalness: 0.35, emissive: 0x1f8fa8, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.9, envMapIntensity: 1.6, envMap: ENV,
    });
  } else {
    mat = new THREE.MeshStandardMaterial({ color: 0xc98b4b, roughness: 0.92, envMapIntensity: 0.4 });
  }
  const core = new THREE.Mesh(POTATO_GEO, mat);
  core.scale.set(1.25 * s, 0.86 * s, 1 * s);
  core.castShadow = true; g.add(core);
  if (type === 'crystal') {
    const rim = new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.45, 0), new THREE.MeshBasicMaterial({
      color: 0xd6ffff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    rim.position.y = s * 0.55; g.add(rim);
  }
  if (type === 'gold') {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(s * 0.16, 6, 5), new THREE.MeshBasicMaterial({
      color: 0xfff3c0, transparent: true, opacity: 0.9,
    }));
    spark.position.set(s * 0.7, s * 0.55, s * 0.2); g.add(spark);
  }
  // 눈 (감자 눈)
  for (let i = 0; i < 3; i++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(s * 0.1, 6, 5), new THREE.MeshStandardMaterial({ color: 0x8a5a2c, roughness: 1 }));
    const a = Math.random() * 6;
    e.position.set(Math.cos(a) * s * 0.7, s * 0.35 + Math.random() * s * 0.3, Math.sin(a) * s * 0.7);
    e.scale.y = 0.6; g.add(e);
  }
  g.rotation.y = Math.random() * 6;
  return g;
}

/* ── 프라이 상자 ──────────────────────────────────────────────────── */
export function makeFryBox() {
  const g = new THREE.Group();
  const cartonMat = new THREE.MeshStandardMaterial({ color: 0xee4b26, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.6 });
  const carton = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.34, 4), cartonMat);
  carton.position.y = 0.17; carton.rotation.y = Math.PI / 4; carton.castShadow = true; g.add(carton);
  // 상자 로고 띠
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.138, 0.07, 4), new THREE.MeshStandardMaterial({ color: 0xfff0cf, roughness: 0.85 }));
  band.position.y = 0.2; band.rotation.y = Math.PI / 4; g.add(band);
  const fryMat = new THREE.MeshStandardMaterial({
    color: 0xffd35c, roughness: 0.62, emissive: 0x5a3a00, emissiveIntensity: 0.18, envMapIntensity: 0.5,
  });
  for (let i = 0; i < 8; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3 + Math.random() * 0.14, 0.05), fryMat);
    const a = Math.random() * 6, r = Math.random() * 0.1;
    f.position.set(Math.cos(a) * r, 0.42, Math.sin(a) * r);
    f.rotation.z = (Math.random() - 0.5) * 0.55; f.rotation.x = (Math.random() - 0.5) * 0.45;
    f.castShadow = true; g.add(f);
  }
  return g;
}
