// 파도풀 안전요원 - 공용 환경 상수/수학
export const POOL = { xMin: -20, xMax: 20, zFar: -40, zNear: 8, deck: 0.35, rope: -30, beach: 2.2 };
export const LEG = 0.93;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function floorY(z) { return clamp(0.35 - (8 - z) * 0.06, -2.4, 0.35); }
export function inPool(x, z) { return x > POOL.xMin && x < POOL.xMax && z > POOL.zFar && z < POOL.zNear; }
export function groundY(x, z) { return inPool(x, z) ? floorY(z) : POOL.deck; }
export function depthAt(x, z) { return inPool(x, z) ? Math.max(0, -floorY(z)) : 0; }

// 파도 성분 (셰이더와 동일)
export const WAVES = [
  { dx: 0.12, dz: 1, len: 10, amp: 0.16, ph: 0 },
  { dx: -0.25, dz: 1, len: 6.5, amp: 0.085, ph: 1.3 },
  { dx: 0.55, dz: 0.83, len: 3.4, amp: 0.035, ph: 2.1 },
  { dx: -0.7, dz: 0.7, len: 2.2, amp: 0.02, ph: 4.0 },
].map((w) => {
  const l = Math.hypot(w.dx, w.dz);
  const k = (Math.PI * 2) / w.len;
  return { dx: w.dx / l, dz: w.dz / l, k, w: Math.sqrt(9.8 * k) * 0.8, amp: w.amp, ph: w.ph };
});

export const W = { t: 0, strength: 1, target: 1 };

export function waveH(x, z, t = W.t) {
  if (!inPool(x, z)) return 0;
  const d = -floorY(z);
  const f = smooth(0, 1.4, d) * W.strength;
  if (f <= 0) return 0;
  let h = 0;
  for (const w of WAVES) h += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t + w.ph);
  return h * f;
}

export function waveGLSL() {
  let s = '';
  for (const w of WAVES) {
    s += `{ float ph=${w.k.toFixed(5)}*(${w.dx.toFixed(5)}*p.x+${w.dz.toFixed(5)}*p.z)-${w.w.toFixed(5)}*uTime+${w.ph.toFixed(3)};
      h+=${w.amp.toFixed(4)}*sin(ph); float c=${w.amp.toFixed(4)}*${w.k.toFixed(5)}*cos(ph); gx+=c*${w.dx.toFixed(5)}; gz+=c*${w.dz.toFixed(5)}; }\n`;
  }
  return s;
}

// 시드 랜덤 (경쟁전 동기화 대비)
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
