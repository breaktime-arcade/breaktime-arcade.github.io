/*!
 * 작은 마을 성장 일기 — 떠 있는 섬 지형·배치
 * © 쉬는시간 오락실. All rights reserved.
 */
export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function makeNoise(rng) {
  const perm = new Uint8Array(512); const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const n2 = (xin, yin) => {
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s), t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2, ii = i & 255, jj = j & 255;
    let n = 0, q;
    q = 0.5 - x0 * x0 - y0 * y0; if (q > 0) { const g = G[perm[ii + perm[jj]] & 7]; q *= q; n += q * q * (g[0] * x0 + g[1] * y0); }
    q = 0.5 - x1 * x1 - y1 * y1; if (q > 0) { const g = G[perm[ii + i1 + perm[jj + j1]] & 7]; q *= q; n += q * q * (g[0] * x1 + g[1] * y1); }
    q = 0.5 - x2 * x2 - y2 * y2; if (q > 0) { const g = G[perm[ii + 1 + perm[jj + 1]] & 7]; q *= q; n += q * q * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  };
  const fbm = (x, z, o = 4) => { let a = 1, f = 1, s = 0, nn = 0; for (let i = 0; i < o; i++) { s += a * n2(x * f, z * f); nn += a; a *= 0.5; f *= 2.03; } return s / nn; };
  return { n2, fbm };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t, z = az + dz * t;
  return { d: Math.hypot(px - x, pz - z), t, x, z };
}
export function polyDist(px, pz, pts) {
  let best = { d: 1e9, s: 0, x: 0, z: 0 }, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
    const r = segDist(px, pz, a.x, a.z, b.x, b.z);
    if (r.d < best.d) best = { d: r.d, s: acc + r.t * L, x: r.x, z: r.z, i };
    acc += L;
  }
  return best;
}

export function buildMap(seed = 7) {
  const rng = mulberry32(seed);
  const { fbm } = makeNoise(rng);
  const R = 33;
  const edgeR = (ang) => R * (1 + 0.075 * fbm(Math.cos(ang) * 1.3 + 4, Math.sin(ang) * 1.3 + 9, 3) + 0.03 * fbm(Math.cos(ang) * 4 + 1, Math.sin(ang) * 4, 2));
  const inside = (x, z, m = 0) => Math.hypot(x, z) < edgeR(Math.atan2(z, x)) - m;

  // 강 경로 (북쪽 언덕 샘 → 서남쪽 섬 가장자리 폭포)
  const rp = [[3, -21], [1, -16], [-3, -11.5], [-9, -8], [-14, -3], [-16.5, 3], [-18, 9], [-20.5, 15]];
  const last = rp.at(-1), prev = rp.at(-2);
  const dir = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
  let ex = last[0], ez = last[1];
  while (inside(ex, ez, -0.2)) { ex += Math.cos(dir) * 0.3; ez += Math.sin(dir) * 0.3; }
  rp.push([ex, ez]);
  const riverRaw = rp.map(([x, z]) => ({ x, z }));

  const HILL = { x: 3, z: -25 }, QH = { x: 19, z: -17 }, CEM = { x: 19, z: 18 };
  function baseH(x, z) {
    let h = 0.55 + 0.42 * fbm(x * 0.055 + 3, z * 0.055 - 2, 4);
    h += 6.0 * Math.exp(-((x - HILL.x) ** 2 + (z - HILL.z) ** 2) / (2 * 6.5 * 6.5));
    h += 3.6 * Math.exp(-((x - QH.x) ** 2 + (z - QH.z) ** 2) / (2 * 5 * 5));
    h += 1.3 * Math.exp(-((x - CEM.x) ** 2 + (z - CEM.z) ** 2) / (2 * 4.5 * 4.5));
    const dp = Math.hypot(x, z);
    h = lerp(h, 0.6, 1 - smooth(6, 11, dp));
    const k = Math.hypot(x, z) / edgeR(Math.atan2(z, x));
    h -= smooth(0.9, 1.0, k) * 0.35;
    return h;
  }
  // 강 수면 높이: 하류로 갈수록 단조 감소
  let accL = 0; const river = [];
  for (let i = 0; i < riverRaw.length; i++) {
    if (i) accL += Math.hypot(riverRaw[i].x - riverRaw[i - 1].x, riverRaw[i].z - riverRaw[i - 1].z);
    river.push({ ...riverRaw[i], s: accL });
  }
  let prevY = 1e9;
  for (const p of river) { const y = Math.min(prevY - 0.05, baseH(p.x, p.z) - 0.45); p.y = y; prevY = y; }
  river[0].y = baseH(river[0].x, river[0].z) - 0.3;
  const riverY = (s) => { for (let i = 0; i < river.length - 1; i++) if (s <= river[i + 1].s) { const f = (s - river[i].s) / (river[i + 1].s - river[i].s || 1); return lerp(river[i].y, river[i + 1].y, f); } return river.at(-1).y; };

  function h(x, z) {
    let v = baseH(x, z);
    const r = polyDist(x, z, river);
    if (r.d < 3.2) {
      const surf = riverY(r.s), bed = surf - 0.55;
      v = Math.min(v, lerp(bed, Math.max(v, surf + 0.25), smooth(0.9, 3.2, r.d)));
    }
    const dsrc = Math.hypot(x - river[0].x, z - river[0].z);
    if (dsrc < 3.4) v = Math.min(v, lerp(river[0].y - 0.5, v, smooth(1.6, 3.4, dsrc)));
    return v;
  }

  // 큰길 (광장 → 사방)
  const roads = [
    [{ x: 0, z: 0 }, { x: 1, z: -6 }, { x: 2, z: -12 }, { x: 4, z: -17 }],
    [{ x: 0, z: 0 }, { x: 7, z: 0.6 }, { x: 14, z: 1.5 }, { x: 22, z: 2 }, { x: 28, z: 2.4 }],
    [{ x: 0, z: 0 }, { x: -0.6, z: 7 }, { x: 0.5, z: 14 }, { x: 2, z: 21 }, { x: 3, z: 28 }],
  ];
  // 서쪽 길은 다리 지점으로
  const bridgeHit = polyDist(-12, -1, river);
  const bridge = { x: bridgeHit.x, z: bridgeHit.z, y: riverY(bridgeHit.s) };
  const bi = bridgeHit.i, bdx = river[bi + 1].x - river[bi].x, bdz = river[bi + 1].z - river[bi].z;
  bridge.ang = Math.atan2(bdz, bdx);
  roads.push([{ x: 0, z: 0 }, { x: -6, z: -0.5 }, { x: bridge.x + 3.5, z: bridge.z + 0.6 }, { x: bridge.x - 3.5, z: bridge.z - 0.6 }, { x: -24, z: -6 }]);
  const roadDist = (x, z) => Math.min(...roads.map(r => polyDist(x, z, r).d));

  const farmZone = (x, z) => x > 8 && z > -7 && z < 15 && Math.hypot(x, z) < 29;
  const station = (() => { const a = -2.35; const r = edgeR(a) - 5; return { x: Math.cos(a) * r, z: Math.sin(a) * r, ang: a }; })();
  const windmill = { x: 25.5, z: -6 };
  const landing = (() => { const a = 1.25; const r = edgeR(a) - 5; return { x: Math.cos(a) * r, z: Math.sin(a) * r }; })();

  // 집터
  const plots = [];
  for (let gx = -31; gx <= 31; gx += 5.0) for (let gz = -31; gz <= 31; gz += 5.0) {
    const x = gx + (rng() - 0.5) * 1.2, z = gz + (rng() - 0.5) * 1.2;
    const d = Math.hypot(x, z);
    if (!inside(x, z, 3.8) || d < 8.5) continue;
    if (polyDist(x, z, river).d < 4.2 || farmZone(x, z) || Math.hypot(x - QH.x, z - QH.z) < 7.5 || Math.hypot(x - CEM.x, z - CEM.z) < 6) continue;
    if (Math.hypot(x - station.x, z - station.z) < 7 || Math.hypot(x - windmill.x, z - windmill.z) < 5 || Math.hypot(x - landing.x, z - landing.z) < 5) continue;
    if (baseH(x, z) > 2.9 || roadDist(x, z) < 2.5) continue;
    // 가장 가까운 길을 바라봄
    let best = null; for (const r of roads) { const q = polyDist(x, z, r); if (!best || q.d < best.d) best = q; }
    plots.push({ x, z, d, rot: Math.atan2(best.x - x, best.z - z), road: { x: best.x, z: best.z }, used: false });
  }
  plots.sort((a, b) => a.d - b.d);

  // 밭 구획
  const fieldPlots = [];
  for (let gx = 10; gx <= 28; gx += 5.8) for (let gz = -5; gz <= 13; gz += 4.8) {
    const x = gx, z = gz;
    if (!inside(x, z, 3.5) || Math.abs(z - 2) < 2.4) continue;
    fieldPlots.push({ x, z, d: Math.hypot(x, z), w: 4.8, l: 3.8, used: false });
  }
  fieldPlots.sort((a, b) => a.d - b.d);

  // 나무·바위
  const trees = [];
  let guard = 0;
  while (trees.length < 210 && guard++ < 20000) {
    const x = (rng() - 0.5) * 66, z = (rng() - 0.5) * 66;
    if (!inside(x, z, 1.2) || Math.hypot(x, z) < 15) continue;
    if (plots.some(p => p.d < 19 && Math.hypot(p.x - x, p.z - z) < 3)) continue;
    if (polyDist(x, z, river).d < 2.6 || roadDist(x, z) < 1.8) continue;
    if (farmZone(x, z) && rng() < 0.92) continue;
    if (Math.hypot(x - QH.x, z - QH.z) < 4.5 || Math.hypot(x - CEM.x, z - CEM.z) < 4 || Math.hypot(x - windmill.x, z - windmill.z) < 4) continue;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 2.2)) continue;
    const y = h(x, z);
    const kind = y > 2.6 || z < -20 ? 1 : (rng() < 0.12 ? 2 : 0); // 0 활엽, 1 침엽, 2 벚나무
    trees.push({ x, z, y, s: 0.75 + rng() * 0.55, r: rng() * 6.28, kind, alive: true });
  }
  const rocks = [];
  for (let i = 0; i < 26; i++) { const a = rng() * 6.28, r = rng() * 5.5; const x = QH.x + Math.cos(a) * r, z = QH.z + Math.sin(a) * r; rocks.push({ x, z, y: h(x, z), s: 0.5 + rng() * 1.1 }); }
  for (let i = 0; i < 24; i++) { const a = rng() * 6.28, r = 12 + rng() * 18; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (inside(x, z, 2) && polyDist(x, z, river).d > 2.5) rocks.push({ x, z, y: h(x, z), s: 0.3 + rng() * 0.6 }); }

  const graves = [];
  for (let i = 0; i < 40; i++) { const row = Math.floor(i / 8), col = i % 8; graves.push({ x: CEM.x - 5.6 + col * 1.6, z: CEM.z - 3 + row * 1.7 }); }

  const randomLand = (r = rng, minD = 0) => {
    for (let i = 0; i < 100; i++) { const x = (r() - 0.5) * 60, z = (r() - 0.5) * 60; if (inside(x, z, 2.5) && Math.hypot(x, z) > minD && polyDist(x, z, river).d > 2.6) return { x, z }; }
    return { x: 0, z: 4 };
  };

  return {
    seed, R, edgeR, inside, h, river, riverY, bridge, roads, roadDist, plots, fieldPlots, trees, rocks, graves,
    plaza: { x: 0, z: 0 }, hill: HILL, quarry: QH, cemetery: CEM, station, windmill, landing, farmZone, randomLand,
    waterfall: { x: river.at(-1).x, z: river.at(-1).z, y: river.at(-1).y, ang: dir },
  };
}
