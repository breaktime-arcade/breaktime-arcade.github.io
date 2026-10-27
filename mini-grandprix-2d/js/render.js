// =============================================================
//  미니카 그랑프리 2D - Canvas 렌더러
//  월드 좌표(미터)를 그대로 쓰고, 카메라 변환으로 확대/회전
// =============================================================

const TAU = Math.PI * 2;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
function shade(hex, f) {
  // f > 0 밝게, f < 0 어둡게
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
const toHex = (c) => typeof c === 'string' ? c : '#' + c.toString(16).padStart(6, '0');
const SHADOW = { x: 0.45, z: 0.6 };   // 해가 왼쪽 위에 있는 느낌

// ---------- 효과 ----------
class SkidMarks2D {
  constructor(max = 2400) { this.max = max; this.segs = new Float32Array(max * 4); this.i = 0; this.count = 0; this.last = new Map(); }
  track(key, x, z, active) {
    const prev = this.last.get(key);
    if (!active) { this.last.delete(key); return; }
    if (prev) {
      const d = Math.hypot(x - prev.x, z - prev.z);
      if (d < 0.35) return;
      if (d < 4) {
        this.segs.set([prev.x, prev.z, x, z], this.i * 4);
        this.i = (this.i + 1) % this.max; this.count = Math.min(this.max, this.count + 1);
      }
    }
    this.last.set(key, { x, z });
  }
  clear() { this.i = 0; this.count = 0; this.last.clear(); }
  draw(ctx) {
    if (!this.count) return;
    ctx.beginPath();
    for (let k = 0; k < this.count; k++) {
      const o = k * 4;
      ctx.moveTo(this.segs[o], this.segs[o + 1]); ctx.lineTo(this.segs[o + 2], this.segs[o + 3]);
    }
    ctx.strokeStyle = 'rgba(28,28,34,0.35)'; ctx.lineWidth = 0.42; ctx.lineCap = 'round';
    ctx.stroke();
  }
}

class Particles2D {
  constructor(max = 260) { this.items = Array.from({ length: max }, () => ({ life: 0 })); this.next = 0; }
  spawn(x, z, { vx = 0, vz = 0, size = 0.6, grow = 2, life = 0.8, color = '#ffffff', alpha = 0.6 } = {}) {
    const p = this.items[this.next]; this.next = (this.next + 1) % this.items.length;
    Object.assign(p, { x, z, vx, vz, r: size, grow, life, max: life, color, alpha });
  }
  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt; p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 0.96; p.vz *= 0.96; p.r += p.grow * dt;
    }
  }
  draw(ctx) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = p.alpha * (p.life / p.max);
      circle(ctx, p.x, p.z, p.r, p.color);
    }
    ctx.globalAlpha = 1;
  }
}

class Sparks2D {
  constructor(max = 80) { this.items = Array.from({ length: max }, () => ({ life: 0 })); this.next = 0; }
  burst(x, z, nx, nz, power) {
    const n = Math.min(14, 3 + Math.floor(power * 2));
    for (let k = 0; k < n; k++) {
      const p = this.items[this.next]; this.next = (this.next + 1) % this.items.length;
      const a = (Math.random() - 0.5) * 2.2, sp = 5 + Math.random() * 7, tx = -nz, tz = nx;
      Object.assign(p, {
        x, z, vx: (nx * Math.cos(a) + tx * Math.sin(a)) * sp, vz: (nz * Math.cos(a) + tz * Math.sin(a)) * sp,
        life: 0.2 + Math.random() * 0.3, color: Math.random() < 0.5 ? '#ffd23f' : '#ff8a3d',
      });
    }
  }
  update(dt) { for (const p of this.items) if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 0.92; p.vz *= 0.92; } }
  draw(ctx) {
    ctx.lineWidth = 0.14; ctx.lineCap = 'round';
    for (const p of this.items) {
      if (p.life <= 0) continue;
      ctx.strokeStyle = p.color; ctx.beginPath(); ctx.moveTo(p.x, p.z); ctx.lineTo(p.x - p.vx * 0.05, p.z - p.vz * 0.05); ctx.stroke();
    }
  }
}

// ---------- 렌더러 ----------
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1; this.w = 1; this.h = 1;
    this.flakes = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), s: 1 + Math.random() * 2.5, v: 0.5 + Math.random() }));
    this.speedLines = Array.from({ length: 26 }, () => ({ a: Math.random() * TAU, d: Math.random(), l: 0.1 + Math.random() * 0.2 }));
  }
  resize(dprMax) {
    this.dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
  }

  // 트랙이 바뀔 때 한 번: 경로·패턴 미리 만들기
  setTrack(track) {
    this.track = track;
    const th = track.theme, N = track.N, ctx = this.ctx;
    const edge = (side) => { const p = new Path2D(); for (let i = 0; i <= N; i++) { const q = track.pointAt(i, side); i ? p.lineTo(q.x, q.z) : p.moveTo(q.x, q.z); } p.closePath(); return p; };

    // 노면 (안쪽/바깥쪽 경계를 evenodd로 채움)
    this.roadPath = new Path2D(); this.roadPath.addPath(edge(track.halfW)); this.roadPath.addPath(edge(-track.halfW));
    this.curbOuter = new Path2D(); this.curbOuter.addPath(edge(track.halfW + track.curbW)); this.curbOuter.addPath(edge(-track.halfW - track.curbW));
    this.edgeLines = new Path2D(); this.edgeLines.addPath(edge(track.halfW - 0.5)); this.edgeLines.addPath(edge(-track.halfW + 0.5));
    this.centerLine = edge(0);

    // 연석: 두 색 교차 사각형
    this.curbA = new Path2D(); this.curbB = new Path2D();
    for (const sd of [1, -1]) {
      for (let i = 0; i < N; i++) {
        const p = (Math.floor(i / 2) % 2) ? this.curbA : this.curbB;
        const a0 = track.pointAt(i, sd * track.halfW), a1 = track.pointAt(i + 1, sd * track.halfW);
        const b1 = track.pointAt(i + 1, sd * (track.halfW + track.curbW)), b0 = track.pointAt(i, sd * (track.halfW + track.curbW));
        p.moveTo(a0.x, a0.z); p.lineTo(a1.x, a1.z); p.lineTo(b1.x, b1.z); p.lineTo(b0.x, b0.z); p.closePath();
      }
    }
    // 방호벽: 3구간마다 색 교차
    this.wallA = new Path2D(); this.wallB = new Path2D(); this.wallAll = new Path2D();
    const wo = track.wallOffset + 0.2;
    for (const sd of [1, -1]) {
      for (let i = 0; i < N; i++) {
        const p = (Math.floor(i / 3) % 2) ? this.wallA : this.wallB;
        const a = track.pointAt(i, sd * wo), b = track.pointAt(i + 1, sd * wo);
        p.moveTo(a.x, a.z); p.lineTo(b.x, b.z);
      }
      this.wallAll.addPath(edge(sd * wo));
    }

    // 바닥 무늬 (월드 좌표 기준 패턴)
    const tile = document.createElement('canvas'); tile.width = tile.height = 256;
    const g = tile.getContext('2d');
    g.fillStyle = th.ground; g.fillRect(0, 0, 256, 256);
    g.fillStyle = th.groundDark;
    if (track.key === 'park') { g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128); }
    else if (track.key === 'desert') {
      for (let y = 0; y < 256; y += 64) { g.beginPath(); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 40 * Math.PI) * 10); g.lineTo(256, y + 26); g.lineTo(0, y + 26); g.fill(); }
    } else if (track.key === 'snow') {
      for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 14, 0, TAU); g.fill(); }
    } else if (track.key === 'candy') {
      const cols = ['#ffffff', '#ffe066', '#7be0c0', '#8fb8ff', '#ff6fa8'];
      for (let i = 0; i < 60; i++) { g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.rotate(Math.random() * 3); g.fillStyle = cols[i % 5]; roundRect(g, -7, -2.5, 14, 5, 2.5); g.fill(); g.restore(); }
    }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3); }
    this.groundPattern = ctx.createPattern(tile, 'repeat');
    this.groundPattern.setTransform(new DOMMatrix().scale(1 / 8)); // 타일 하나 = 32m

    // 노면 구간 이미지
    this.zoneImgs = track.zones.map(zn => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const z = cv.getContext('2d'), zd = th.zone;
      const blob = (r, color) => {
        z.fillStyle = color; z.beginPath();
        for (let a = 0; a <= 24; a++) {
          const t = a / 24 * TAU, rr = r * (0.85 + Math.sin(t * 3 + zn.seed) * 0.08 + Math.cos(t * 5 + zn.seed) * 0.06);
          z.lineTo(64 + Math.cos(t) * rr, 64 + Math.sin(t) * rr);
        }
        z.fill();
      };
      blob(62, zd.edge); blob(54, zd.color);
      if (zn.type === 'ice') { z.strokeStyle = 'rgba(255,255,255,0.85)'; z.lineWidth = 3; for (let k = 0; k < 6; k++) { z.beginPath(); z.moveTo(30 + k * 12, 40 + k * 5); z.lineTo(44 + k * 12, 30 + k * 6); z.stroke(); } }
      else if (zn.type === 'sand') { z.strokeStyle = 'rgba(160,110,50,0.35)'; z.lineWidth = 2; for (let y = 30; y < 100; y += 10) { z.beginPath(); for (let x = 20; x < 110; x += 6) z.lineTo(x, y + Math.sin(x / 8) * 3); z.stroke(); } }
      else if (zn.type === 'choco') { z.fillStyle = 'rgba(255,255,255,0.25)'; z.beginPath(); z.ellipse(48, 46, 16, 7, -0.4, 0, TAU); z.fill(); }
      return cv;
    });
  }

  // ---------- 장식 ----------
  drawDecorShadows(ctx, view) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (const d of this.track.decor) {
      if (Math.abs(d.x - view.x) > view.r + 30 || Math.abs(d.z - view.z) > view.r + 30) continue;
      const sx = d.x + SHADOW.x * 2.2, sz = d.z + SHADOW.z * 2.2, s = d.s;
      ctx.beginPath();
      if (d.type === 'tree' || d.type === 'pine') ctx.arc(sx + 1, sz + 1.2, 2.2 * s, 0, TAU);
      else if (d.type === 'lollipop') { ctx.arc(sx + 2, sz + 2.6, 1.8 * s, 0, TAU); }
      else if (d.type === 'cactus') ctx.arc(sx + 0.6, sz + 0.8, 0.9 * s, 0, TAU);
      else if (d.type === 'house') ctx.rect(sx - 2.5, sz - 2.25, 5, 4.5);
      else if (d.type === 'cupcake') ctx.arc(sx + 1, sz + 1.2, 5 * s, 0, TAU);
      else if (d.type === 'mesa') ctx.arc(sx + 6, sz + 8, 26 * s, 0, TAU);
      else continue;
      ctx.fill();
    }
  }
  drawDecor(ctx, view) {
    for (const d of this.track.decor) {
      if (Math.abs(d.x - view.x) > view.r + 30 || Math.abs(d.z - view.z) > view.r + 30) continue;
      const { x, z, s, t } = d;
      switch (d.type) {
        case 'flower': circle(ctx, x, z, 0.35, ['#ff6b9a', '#ffd23f', '#ffffff', '#b08cff'][(t * 4) | 0]); break;
        case 'tree': {
          const c = ['#3fa34d', '#56b85a', '#2f8f46', '#7bc95f'][(t * 4) | 0];
          circle(ctx, x, z, 2.2 * s, shade(c, -0.15));
          circle(ctx, x - 0.25 * s, z - 0.3 * s, 1.85 * s, c);
          circle(ctx, x - 0.7 * s, z - 0.8 * s, 0.8 * s, shade(c, 0.25));
          break;
        }
        case 'rock': {
          ctx.fillStyle = ['#d08a52', '#c47a45', '#e0a068'][(t * 3) | 0]; ctx.beginPath();
          for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + t * 6, r = 1.3 * s * (0.8 + ((k * 37 + t * 100) % 10) / 30); ctx.lineTo(x + Math.cos(a) * r, z + Math.sin(a) * r); }
          ctx.fill(); break;
        }
        case 'cactus':
          circle(ctx, x + 0.8 * s, z, 0.38 * s, '#358a4d'); circle(ctx, x - 0.8 * s, z + 0.2 * s, 0.34 * s, '#358a4d');
          circle(ctx, x, z, 0.6 * s, '#3f9b5a'); circle(ctx, x - 0.15 * s, z - 0.15 * s, 0.25 * s, '#6cc283'); break;
        case 'mesa': {
          ctx.fillStyle = '#b9653a'; ctx.beginPath();
          for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + t * 6; ctx.lineTo(x + Math.cos(a) * 24 * s, z + Math.sin(a) * 24 * s); }
          ctx.fill();
          ctx.fillStyle = '#d98c52'; ctx.beginPath();
          for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + t * 6; ctx.lineTo(x - 2 + Math.cos(a) * 19 * s, z - 2 + Math.sin(a) * 19 * s); }
          ctx.fill(); break;
        }
        case 'house': {
          ctx.save(); ctx.translate(x, z); ctx.rotate(t * 6);
          const c = ['#ff8a80', '#ffd180', '#82b1ff', '#b9f6ca'][(t * 4) | 0];
          ctx.fillStyle = c; ctx.fillRect(-2.7, -2.4, 5.4, 4.8);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(-2.5, -2.2, 2.5, 4.4);
          ctx.fillStyle = '#e6eef8'; ctx.fillRect(0, -2.2, 2.5, 4.4);
          ctx.fillStyle = '#8a5a3b'; ctx.fillRect(1, -1.6, 0.7, 0.7);   // 굴뚝
          ctx.restore(); break;
        }
        case 'pine':
          circle(ctx, x, z, 2.2 * s, '#2a6f50'); circle(ctx, x - 0.2 * s, z - 0.25 * s, 1.6 * s, '#2f7d5b');
          circle(ctx, x - 0.35 * s, z - 0.45 * s, 1.0 * s, '#3d9470'); circle(ctx, x - 0.45 * s, z - 0.55 * s, 0.45 * s, '#ffffff'); break;
        case 'gumdrop': {
          const c = ['#ff5a8a', '#5ad1ff', '#ffd84a', '#9b7bff', '#5be39b'][(t * 5) | 0];
          circle(ctx, x, z, 1.2 * s, c); circle(ctx, x - 0.35 * s, z - 0.35 * s, 0.4 * s, 'rgba(255,255,255,0.6)'); break;
        }
        case 'cupcake': {
          circle(ctx, x, z, 5 * s, '#c98b5e');
          ctx.strokeStyle = '#a86f45'; ctx.lineWidth = 0.25;
          for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 4.3 * s, z + Math.sin(a) * 4.3 * s); ctx.lineTo(x + Math.cos(a) * 5 * s, z + Math.sin(a) * 5 * s); ctx.stroke(); }
          const c = ['#fff0f6', '#ffc6e0', '#c9f2ff'][(t * 3) | 0];
          circle(ctx, x, z, 4.2 * s, shade(c, -0.08)); circle(ctx, x - 0.3, z - 0.3, 3.2 * s, c); circle(ctx, x - 0.6, z - 0.6, 1.8 * s, shade(c, 0.3));
          circle(ctx, x - 0.6, z - 0.6, 0.7 * s, '#ff3355'); break;
        }
        case 'lollipop': {
          const c = ['#ff4fa0', '#7be0c0', '#ffe066', '#8fb8ff', '#ff8a5c'][(t * 5) | 0];
          circle(ctx, x, z, 1.8 * s, c);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.28 * s; ctx.beginPath();
          for (let a = 0; a < 12; a += 0.3) ctx.lineTo(x + Math.cos(a + t * 6) * a * 0.14 * s, z + Math.sin(a + t * 6) * a * 0.14 * s);
          ctx.stroke(); break;
        }
      }
    }
  }

  // ---------- 트랙 ----------
  drawTrack(ctx) {
    const tr = this.track, th = tr.theme;
    // 벽 그림자
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    ctx.save(); ctx.translate(SHADOW.x * 0.8, SHADOW.z * 0.8);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.9; ctx.stroke(this.wallAll);
    ctx.restore();
    // 연석 + 노면
    ctx.fillStyle = th.curbB; ctx.fill(this.curbOuter, 'evenodd');
    ctx.fillStyle = th.curbA; ctx.fill(this.curbA);
    ctx.fillStyle = th.curbB; ctx.fill(this.curbB);
    ctx.fillStyle = th.road; ctx.fill(this.roadPath, 'evenodd');
    // 노면 구간
    tr.zones.forEach((zn, i) => {
      ctx.save(); ctx.translate(zn.x, zn.z); ctx.rotate(zn.rot);
      ctx.globalAlpha = zn.type === 'ice' ? 0.88 : 1;
      ctx.drawImage(this.zoneImgs[i], -zn.r, -zn.r, zn.r * 2, zn.r * 2);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
    // 차선
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.25; ctx.stroke(this.edgeLines);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(255,240,180,0.9)'; ctx.lineWidth = 0.3; ctx.stroke(this.centerLine); ctx.setLineDash([]);
    // 출발선 체크무늬
    const s0 = tr.samples[0], t0 = tr.tangents[0], l0 = tr.lefts[0];
    const cells = Math.round(tr.halfW * 2 / 1.1), cw = tr.halfW * 2 / cells;
    for (let r = 0; r < 2; r++) for (let c = 0; c < cells; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#222' : '#fff';
      const side = -tr.halfW + c * cw, along = (r - 1) * cw;
      const p = { x: s0.x + l0.x * side + t0.x * along, z: s0.z + l0.z * side + t0.z * along };
      ctx.beginPath(); ctx.moveTo(p.x, p.z);
      ctx.lineTo(p.x + l0.x * cw, p.z + l0.z * cw);
      ctx.lineTo(p.x + l0.x * cw + t0.x * cw, p.z + l0.z * cw + t0.z * cw);
      ctx.lineTo(p.x + t0.x * cw, p.z + t0.z * cw); ctx.closePath(); ctx.fill();
    }
  }
  drawWalls(ctx) {
    const th = this.track.theme;
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.lineWidth = 0.75;
    ctx.globalAlpha = this.track.key === 'candy' ? 0.9 : 1;
    ctx.strokeStyle = th.wallA; ctx.stroke(this.wallA);
    ctx.strokeStyle = th.wallB; ctx.stroke(this.wallB);
    ctx.globalAlpha = 1;
    // 출발 아치 기둥
    const tr = this.track;
    for (const sd of [1, -1]) { const p = tr.pointAt(0, sd * (tr.wallOffset + 0.9)); circle(ctx, p.x + 0.3, p.z + 0.4, 0.5, 'rgba(0,0,0,0.2)'); circle(ctx, p.x, p.z, 0.45, '#ffd23f'); }
  }

  // ---------- 자동차 ----------
  drawCar(ctx, car, look, shadowOnly) {
    ctx.save();
    if (shadowOnly) {
      ctx.translate(car.x + SHADOW.x, car.z + SHADOW.z); ctx.rotate(-car.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(ctx, -1.0, -2.0, 2.0, 4.0, 0.6); ctx.fill();
      ctx.restore(); return;
    }
    ctx.translate(car.x, car.z); ctx.rotate(-car.angle);
    const sq = look.squash || 0;
    ctx.scale(1 + sq * 0.2, 1 - sq * 0.12);
    // 바퀴 (앞바퀴는 조향만큼 돌아감)
    ctx.fillStyle = '#2b2d42';
    for (const [x, y, front] of [[0.92, 1.22, 1], [-0.92, 1.22, 1], [0.92, -1.22, 0], [-0.92, -1.22, 0]]) {
      ctx.save(); ctx.translate(x, y); if (front) ctx.rotate(-car.steer);
      roundRect(ctx, -0.22, -0.46, 0.44, 0.92, 0.15); ctx.fill();
      ctx.restore();
    }
    // 부스터 불꽃
    if (car.boosting) {
      for (const x of [0.45, -0.45]) {
        const f = 0.8 + Math.random() * 0.6;
        ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(x - 0.22, -1.9); ctx.lineTo(x + 0.22, -1.9); ctx.lineTo(x, -1.9 - 1.3 * f); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.moveTo(x - 0.1, -1.9); ctx.lineTo(x + 0.1, -1.9); ctx.lineTo(x, -1.9 - 0.7 * f); ctx.closePath(); ctx.fill();
      }
    }
    const body = toHex(look.color), accent = toHex(look.accent);
    // 차체
    ctx.fillStyle = shade(body, -0.25); roundRect(ctx, -0.95, -1.85, 1.9, 3.7, 0.55); ctx.fill();
    ctx.fillStyle = body; roundRect(ctx, -0.88, -1.78, 1.76, 3.52, 0.5); ctx.fill();
    // 범퍼
    ctx.fillStyle = '#2b2d42'; roundRect(ctx, -0.8, 1.72, 1.6, 0.2, 0.08); ctx.fill(); roundRect(ctx, -0.8, -1.92, 1.6, 0.2, 0.08); ctx.fill();
    // 보닛 줄무늬
    ctx.fillStyle = accent; ctx.fillRect(-0.2, 0.55, 0.4, 1.15);
    // 기울어짐 (가감속·코너링) → 캐빈이 살짝 밀림
    const lx = Math.max(-0.22, Math.min(0.22, -car.accLat * 0.016)), ly = Math.max(-0.15, Math.min(0.15, -car.accLong * 0.008));
    ctx.translate(lx, ly);
    ctx.fillStyle = '#9fe3ff'; roundRect(ctx, -0.76, -1.25, 1.52, 1.9, 0.38); ctx.fill();
    ctx.fillStyle = shade(body, 0.12); roundRect(ctx, -0.66, -1.05, 1.32, 1.2, 0.25); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; roundRect(ctx, -0.5, 0.25, 0.5, 0.25, 0.1); ctx.fill();
    ctx.translate(-lx, -ly);
    // 스포일러
    ctx.fillStyle = accent; roundRect(ctx, -0.88, -1.72, 1.76, 0.26, 0.08); ctx.fill();
    // 전조등 / 후미등
    ctx.fillStyle = '#fff6c2';
    for (const x of [0.55, -0.55]) { ctx.beginPath(); ctx.ellipse(x, 1.7, 0.2, 0.1, 0, 0, TAU); ctx.fill(); }
    const braking = car.input.brake > 0 && car.vLong > 0.5;
    ctx.fillStyle = braking ? '#ff1a3c' : '#c8243c';
    for (const x of [0.55, -0.55]) ctx.fillRect(x - 0.18, -1.85, 0.36, 0.1);
    if (braking) { ctx.globalAlpha = 0.35; circle(ctx, 0.55, -1.95, 0.4, '#ff3355'); circle(ctx, -0.55, -1.95, 0.4, '#ff3355'); ctx.globalAlpha = 1; }
    ctx.restore();
  }

  // ---------- 소품 ----------
  drawProp(ctx, pr) {
    const b = pr.body;
    ctx.save(); ctx.translate(b.x, b.z);
    if (pr.type === 'boulder') {
      circle(ctx, SHADOW.x, SHADOW.z, 1.25, 'rgba(0,0,0,0.22)');
      ctx.rotate(pr.roll);
      ctx.fillStyle = '#b8794a'; ctx.beginPath();
      for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, r = 1.2 * (0.9 + (k % 3) * 0.06); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.fill();
      ctx.strokeStyle = '#8c5532'; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.moveTo(-1.1, 0); ctx.lineTo(1.1, 0); ctx.stroke();
      circle(ctx, -0.4, -0.45, 0.32, 'rgba(255,255,255,0.25)');
    } else if (pr.type === 'cone') {
      const tip = Math.min(1, pr.tip);
      circle(ctx, SHADOW.x * 0.5, SHADOW.z * 0.5, 0.42, 'rgba(0,0,0,0.2)');
      if (tip > 0.5) { // 넘어진 콘
        ctx.rotate(-pr.tipDir);
        ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-0.32, -0.2); ctx.lineTo(0.32, -0.2); ctx.lineTo(0, 0.85); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-0.2, 0.15, 0.4, 0.14);
      } else {
        ctx.fillStyle = '#e8650f'; ctx.fillRect(-0.37, -0.37, 0.74, 0.74);
        circle(ctx, 0, 0, 0.3, '#ff7a1a'); circle(ctx, 0, 0, 0.2, '#ffffff'); circle(ctx, 0, 0, 0.11, '#ff7a1a');
      }
    } else if (pr.type === 'snowman') {
      const tip = Math.min(1.3, pr.tip);
      circle(ctx, SHADOW.x, SHADOW.z, 0.75, 'rgba(0,0,0,0.15)');
      const ox = Math.sin(pr.tipDir) * tip * 0.6, oz = Math.cos(pr.tipDir) * tip * 0.6;
      circle(ctx, 0, 0, 0.7, '#e9eef8');
      circle(ctx, ox * 1, oz * 1, 0.5, '#ffffff');
      ctx.strokeStyle = '#ff4f6d'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.arc(ox * 1.4, oz * 1.4, 0.42, 0, TAU); ctx.stroke();
      circle(ctx, ox * 1.8, oz * 1.8, 0.36, '#ffffff');
      circle(ctx, ox * 1.9, oz * 1.9, 0.24, '#2b2d42');
      circle(ctx, ox * 1.8 + 0.25, oz * 1.8 + 0.1, 0.09, '#ff8a2a');
    }
    ctx.restore();
  }
  drawBumper(ctx, b) {
    const w = Math.sin(b.wobble * 30) * b.wobble * 0.25;
    circle(ctx, b.x + SHADOW.x, b.z + SHADOW.z, b.r, 'rgba(0,0,0,0.2)');
    ctx.save(); ctx.translate(b.x, b.z); ctx.scale(1 + w, 1 + w);
    circle(ctx, 0, 0, b.r, '#2fb6d6'); circle(ctx, 0, 0, b.r * 0.82, 'rgba(82,224,255,0.95)');
    circle(ctx, -b.r * 0.3, -b.r * 0.3, b.r * 0.3, 'rgba(255,255,255,0.6)');
    ctx.restore();
  }

  // ---------- 한 프레임 ----------
  draw(state) {
    const ctx = this.ctx, { cam } = state;
    const W = this.w, H = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.track.theme.ground; ctx.fillRect(0, 0, W, H);

    // 카메라 변환: 화면 중심(약간 아래) 기준으로 확대·회전
    ctx.save();
    ctx.translate(W / 2 + cam.shakeX, H * cam.anchorY + cam.shakeY);
    ctx.rotate(cam.rot);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.x, -cam.z);
    const view = { x: cam.x, z: cam.z, r: Math.hypot(W, H) / cam.scale };

    ctx.fillStyle = this.groundPattern;
    ctx.fillRect(cam.x - view.r, cam.z - view.r, view.r * 2, view.r * 2);
    this.drawDecorShadows(ctx, view);
    this.drawTrack(ctx);
    state.skids.draw(ctx);
    for (const pr of state.props) if (pr.type === 'cone') this.drawProp(ctx, pr);
    for (const r of state.racers) this.drawCar(ctx, r.body, r, true);
    for (const pr of state.props) if (pr.type !== 'cone') this.drawProp(ctx, pr);
    for (const b of this.track.bumpers) this.drawBumper(ctx, b);
    for (const r of state.racers) this.drawCar(ctx, r.body, r, false);
    state.particles.draw(ctx);
    state.sparks.draw(ctx);
    this.drawWalls(ctx);
    this.drawDecor(ctx, view);
    // 차 위 화살표 (내 차 표시)
    if (state.marker) {
      const b = state.marker;
      ctx.save(); ctx.translate(b.x, b.z); ctx.rotate(-cam.rot);
      ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 0.18;
      ctx.beginPath(); ctx.moveTo(0, -3.3); ctx.lineTo(0.6, -4.2); ctx.lineTo(-0.6, -4.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // 화면 효과: 눈송이, 부스터 속도선
    if (this.track.key === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const f of this.flakes) {
        f.y += f.v * state.dt * 0.12; f.x += Math.sin(f.y * 8 + f.s) * state.dt * 0.02;
        if (f.y > 1) { f.y -= 1; f.x = Math.random(); }
        ctx.beginPath(); ctx.arc(f.x * W, f.y * H, f.s, 0, TAU); ctx.fill();
      }
    }
    if (state.boosting) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineCap = 'round';
      const cx = W / 2, cy = H * cam.anchorY, R = Math.hypot(W, H) / 2;
      for (const s of this.speedLines) {
        s.d += state.dt * 2.5; if (s.d > 1) { s.d = 0.3; s.a = Math.random() * TAU; }
        const r0 = R * (0.35 + s.d * 0.65), r1 = r0 + R * s.l;
        ctx.lineWidth = 2 + s.l * 6;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0); ctx.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); ctx.stroke();
      }
    }
  }
}
