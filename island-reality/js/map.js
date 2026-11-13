/*!
 * 마지막 생존자 — 지형/위치 생성
 * © 쉬는시간 오락실. All rights reserved.
 */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSimplex(rng) {
  const perm = new Uint8Array(512);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = G[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = G[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = G[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function buildMap(seed = 20261113) {
  const rng = mulberry32(seed);
  const noise = makeSimplex(rng);
  const fbm = (x, z, o = 4) => { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < o; i++) { s += a * noise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; };
  const R = 52;
  const MT = { x: -17, z: -16 };

  function rawH(x, z) {
    const d = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    const edgeN = fbm(Math.cos(ang) * 1.2 + 3.1, Math.sin(ang) * 1.2 + 7.7, 3);
    const Re = R * (1 + 0.2 * edgeN);
    const k = d / Re;
    const land = 1 - smooth(0.62, 1.0, k);
    let h = land * (2.1 + 1.1 * fbm(x * 0.03 + 11, z * 0.03 - 5, 4));
    const md = Math.hypot(x - MT.x, z - MT.z);
    h += 12.5 * Math.exp(-(md * md) / (2 * 10.5 * 10.5)) * (0.85 + 0.35 * fbm(x * 0.09, z * 0.09, 3)) * land;
    h += 4.2 * Math.exp(-((x - 20) ** 2 + (z + 14) ** 2) / (2 * 8 * 8)) * land;
    // 해변: 낮은 구간을 평평하게
    if (h < 1.6) h = h * 0.75;
    // 바다 밑
    h -= 0.95;
    if (k > 0.95) h -= (k - 0.95) * 14;
    return Math.max(h, -9);
  }

  const flats = [];
  function h(x, z) {
    let v = rawH(x, z);
    for (const f of flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r) v = lerp(v, f.h, 1 - smooth(f.r * 0.55, f.r, d));
    }
    return v;
  }

  const camp = { x: 9, z: 7 };
  const council = { x: -4, z: 25 };
  flats.push({ ...camp, r: 13, h: Math.max(1.25, rawH(camp.x, camp.z)) });
  flats.push({ ...council, r: 11, h: Math.max(1.1, rawH(council.x, council.z)) });
  const spring = { x: -6, z: -7 };
  flats.push({ ...spring, r: 5, h: rawH(spring.x, spring.z) - 0.25 });
  spring.y = h(spring.x, spring.z);

  // 바깥 바다에서 안쪽으로 들어오며 처음 target 높이를 넘는 지점(=바깥 해안선)
  function shorePoint(ang, target = 0.2) {
    let prev = null;
    for (let r = 100; r > 0; r -= 0.25) {
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (h(x, z) >= target) return prev ? { ...prev, ang, r: r + 0.25 } : { x, z, ang, r };
      prev = { x, z };
    }
    return { x: 0, z: 0, ang, r: 0 };
  }

  // 캠프
  camp.y = h(camp.x, camp.z);
  const fireSeats = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; fireSeats.push({ x: camp.x + Math.cos(a) * 4.3, z: camp.z + Math.sin(a) * 4.3, face: { x: camp.x, z: camp.z } }); }
  const shelter = { x: camp.x - 6.5, z: camp.z - 4.5 };
  const sleepSpots = [];
  for (let i = 0; i < 10; i++) sleepSpots.push({ x: shelter.x - 2.6 + (i % 5) * 1.3, z: shelter.z - 0.7 + Math.floor(i / 5) * 1.6 });
  const stash = { x: camp.x + 4.5, z: camp.z - 5 };
  const woodPile = { x: camp.x + 6.2, z: camp.z - 2.5 };

  // 부족회의
  council.y = h(council.x, council.z);
  const councilSeats = [], jurySeats = [];
  const cc = { x: council.x, z: council.z };
  for (let i = 0; i < 10; i++) { const a = Math.PI * (0.08 + 0.84 * (i / 9)); councilSeats.push({ x: cc.x + Math.cos(a) * 4.6, z: cc.z + Math.sin(a) * 4.6, face: cc }); }
  for (let i = 0; i < 9; i++) { const a = Math.PI * (1.16 + 0.68 * (i / 8)); jurySeats.push({ x: cc.x + Math.cos(a) * 5.4, z: cc.z + Math.sin(a) * 5.4, face: cc }); }

  // 낚시 포인트
  const fishSpots = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const p = shorePoint(a, 0.05);
    const back = 0.4;
    fishSpots.push({ x: p.x - Math.cos(a) * back, z: p.z - Math.sin(a) * back, face: { x: p.x + Math.cos(a) * 5, z: p.z + Math.sin(a) * 5 } });
  }

  // 나무·덤불·바위
  const palms = [], trees = [], bushes = [], rocks = [];
  const nearFlat = (x, z, pad = 2) => flats.some(f => Math.hypot(x - f.x, z - f.z) < f.r * 0.75 + pad);
  const tooClose = (arr, x, z, d) => arr.some(p => Math.hypot(p.x - x, p.z - z) < d);
  let guard = 0;
  while (palms.length < 46 && guard++ < 6000) {
    const x = (rng() - 0.5) * 130, z = (rng() - 0.5) * 130, y = h(x, z);
    if (y > 0.35 && y < 2.4 && !nearFlat(x, z) && !tooClose(palms, x, z, 4)) palms.push({ x, z, y, s: 0.8 + rng() * 0.5, r: rng() * Math.PI * 2, lean: 0.15 + rng() * 0.3 });
  }
  guard = 0;
  while (trees.length < 58 && guard++ < 8000) {
    const x = (rng() - 0.5) * 120, z = (rng() - 0.5) * 120, y = h(x, z);
    if (y > 2.0 && y < 9.5 && !nearFlat(x, z) && !tooClose(trees, x, z, 3.6) && !tooClose(palms, x, z, 3)) trees.push({ x, z, y, s: 0.8 + rng() * 0.6, r: rng() * Math.PI * 2, kind: rng() < 0.5 ? 0 : 1 });
  }
  guard = 0;
  while (bushes.length < 22 && guard++ < 6000) {
    const x = (rng() - 0.5) * 110, z = (rng() - 0.5) * 110, y = h(x, z);
    if (y > 0.8 && y < 5 && !nearFlat(x, z, 1) && !tooClose(bushes, x, z, 5) && !tooClose(trees, x, z, 2) && !tooClose(palms, x, z, 2)) bushes.push({ x, z, y, s: 0.8 + rng() * 0.5 });
  }
  guard = 0;
  while (rocks.length < 38 && guard++ < 6000) {
    const x = (rng() - 0.5) * 130, z = (rng() - 0.5) * 130, y = h(x, z);
    if (y > -1.5 && !nearFlat(x, z, 1) && !tooClose(rocks, x, z, 4)) rocks.push({ x, z, y, s: 0.5 + rng() * (y > 5 ? 2.2 : 1.2), r: rng() * 6 });
  }

  const woodSpots = trees.filter(t => t.y < 7).map(t => ({ x: t.x + 1.1, z: t.z + 0.6, face: { x: t.x, z: t.z } }));
  const fruitSpots = bushes.map(b => ({ x: b.x + 1.2, z: b.z, face: { x: b.x, z: b.z } }))
    .concat(palms.filter((_, i) => i % 3 === 0).map(p => ({ x: p.x + 1.0, z: p.z + 0.4, face: { x: p.x, z: p.z } })));

  // 면책 조개 숨김 장소
  const idolSpots = [];
  const cands = rocks.filter(r => r.y > 0.5 && r.y < 6).concat(trees.filter(t => t.y < 6));
  for (let i = 0; i < 8 && cands.length; i++) { const c = cands.splice(Math.floor(rng() * cands.length), 1)[0]; idolSpots.push({ x: c.x + 1.2, z: c.z + 1.0, face: { x: c.x, z: c.z } }); }

  // 해변 달리기 코스 (남쪽 해변 호)
  const raceCourse = [];
  for (let a = 0.5; a <= 1.6; a += 0.1) { const p = shorePoint(a, 0.45); raceCourse.push({ x: p.x, z: p.z }); }

  // 기둥 버티기 (동쪽 얕은 바다)
  const postAng = -0.55;
  const pb = shorePoint(postAng, -0.9);
  const tx = -Math.sin(postAng), tz = Math.cos(postAng);
  const posts = [];
  for (let i = 0; i < 10; i++) { const o = (i - 4.5) * 2.4; const x = pb.x + tx * o, z = pb.z + tz * o; posts.push({ x, z, base: h(x, z), top: 1.7 }); }
  const sp = shorePoint(postAng, 0.9);
  const postShore = { x: sp.x - Math.cos(postAng) * 3, z: sp.z - Math.sin(postAng) * 3, face: { x: pb.x, z: pb.z } };

  // 선착장 (남서쪽)
  const dockAng = 2.25;
  const dp = shorePoint(dockAng, 0.3);
  const dock = { x: dp.x, z: dp.z, ang: dockAng, end: { x: dp.x + Math.cos(dockAng) * 9, z: dp.z + Math.sin(dockAng) * 9 } };

  function randomLand(r = rng) {
    for (let i = 0; i < 200; i++) {
      const x = (r() - 0.5) * 100, z = (r() - 0.5) * 100, y = h(x, z);
      if (y > 0.6 && y < 6) return { x, z };
    }
    return { x: camp.x, z: camp.z };
  }

  return {
    seed, R, h, shorePoint, randomLand, mountain: MT,
    camp, fireSeats, shelter, sleepSpots, stash, woodPile,
    council, councilSeats, jurySeats, spring,
    fishSpots, woodSpots, fruitSpots, idolSpots,
    palms, trees, bushes, rocks,
    raceCourse, posts, postShore, postAng, dock,
  };
}
