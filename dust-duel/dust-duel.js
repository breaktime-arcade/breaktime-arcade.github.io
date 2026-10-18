/*!
 * 먼지 대작전 (Dust Duel) v1.0
 * 쉬는시간 오락실 — https://smile-willow.tistory.com/
 * Canvas 2D 웹게임. index.html 과 같은 폴더에 두고 사용하세요.
 */
(function () {
  'use strict';

  /* =========================================================
   * 1. 상수 · 밸런스
   * ========================================================= */
  const W = 540, H = 960;
  const ROOM = { x: 20, y: 150, w: 500, h: 650 };
  const GAME_TIME = 30;
  const BIG = { r: 28, suck: 38, speed: 145 };
  const TEAM = { r: 22, speed: 235, rope: 100, nr: 13, suck: 28, seekR: 100, seekF: 750 };
  const DIFF = {
    easy:   { spd: 0.8,  think: 0.7, avoidCat: false, label: '쉬움' },
    normal: { spd: 1.0,  think: 0.4, avoidCat: true,  label: '보통' },
    hard:   { spd: 1.15, think: 0.12, avoidCat: true,  label: '어려움' }
  };
  const FURN = [
    { t: 'rect', k: 'sofa',  x: 40,  y: 168, w: 160, h: 62 },
    { t: 'rect', k: 'shelf', x: 350, y: 158, w: 150, h: 34 },
    { t: 'rect', k: 'table', x: 300, y: 420, w: 120, h: 84 },
    { t: 'circ', k: 'pot', cx: 490, cy: 560, r: 20 },
    { t: 'circ', k: 'pot', cx: 52,  cy: 470, r: 20 }
  ];
  const START = [{ x: 130, y: 740 }, { x: 410, y: 740 }];
  const COIN_TIMES = [7, 15, 23];
  const CAT_R = 26, CAT_PENALTY = 3, STUN_TIME = 1.2;

  /* =========================================================
   * 2. 코어 로직 (DOM 없음 — 헤드리스 테스트 가능)
   * ========================================================= */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  function inFurniture(x, y, pad) {
    for (const f of FURN) {
      if (f.t === 'rect') { if (x > f.x - pad && x < f.x + f.w + pad && y > f.y - pad && y < f.y + f.h + pad) return true; }
      else if (dist(x, y, f.cx, f.cy) < f.r + pad) return true;
    }
    return false;
  }
  function freeSpot(rng, pad) {
    for (let i = 0; i < 200; i++) {
      const x = ROOM.x + pad + rng() * (ROOM.w - pad * 2), y = ROOM.y + pad + rng() * (ROOM.h - pad * 2);
      if (!inFurniture(x, y, pad)) return { x, y };
    }
    return { x: W / 2, y: 650 };
  }
  // 원(위치 객체)을 방 경계·가구 밖으로 밀어냄
  function collide(o, r) {
    o.x = clamp(o.x, ROOM.x + r, ROOM.x + ROOM.w - r);
    o.y = clamp(o.y, ROOM.y + r, ROOM.y + ROOM.h - r);
    for (const f of FURN) {
      if (f.t === 'rect') {
        const cx = clamp(o.x, f.x, f.x + f.w), cy = clamp(o.y, f.y, f.y + f.h);
        const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
        if (d < r) {
          if (d > 0.001) { o.x = cx + dx / d * r; o.y = cy + dy / d * r; }
          else { // 중심이 가구 안: 가장 가까운 변으로
            const opts = [[o.x - f.x, -1, 0], [f.x + f.w - o.x, 1, 0], [o.y - f.y, 0, -1], [f.y + f.h - o.y, 0, 1]].sort((a, b) => a[0] - b[0]);
            const m = opts[0];
            if (m[1]) o.x = m[1] < 0 ? f.x - r : f.x + f.w + r; else o.y = m[2] < 0 ? f.y - r : f.y + f.h + r;
          }
        }
      } else {
        const dx = o.x - f.cx, dy = o.y - f.cy, d = Math.hypot(dx, dy) || 0.001;
        if (d < f.r + r) { o.x = f.cx + dx / d * (f.r + r); o.y = f.cy + dy / d * (f.r + r); }
      }
    }
  }

  function gauss(rng) { return Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(2 * Math.PI * rng()); }
  function genDust(rng) {
    const d = [];
    const add = (x, y, v) => {
      if (x < ROOM.x + 10 || x > ROOM.x + ROOM.w - 10 || y < ROOM.y + 10 || y > ROOM.y + ROOM.h - 10) return;
      if (inFurniture(x, y, 4)) return;
      d.push({ x, y, v, alive: true, pull: -1, sk: 0, wob: rng() * 6.28 });
    };
    for (let b = 0; b < 8; b++) {
      const c = freeSpot(rng, 40), s = 28 + rng() * 38, n = 40 + Math.floor(rng() * 40);
      for (let i = 0; i < n; i++) add(c.x + gauss(rng) * s, c.y + gauss(rng) * s, 1);
    }
    for (let i = 0; i < 230; i++) { const p = freeSpot(rng, 12); add(p.x, p.y, 1); }
    for (let i = 0; i < 18; i++) { const p = freeSpot(rng, 20); add(p.x, p.y, 3); }
    return d;
  }

  function makeUnit(kind, ctrl, pos) {
    const u = { kind, ctrl, x: pos.x, y: pos.y, vx: 0, vy: 0, face: -Math.PI / 2, score: 0, stun: 0,
      clumps: 0, coins: 0, cats: 0, dustCount: 0, think: 0, tx: pos.x, ty: pos.y };
    if (kind === 'team') {
      u.noz = [-1, 0, 1].map(k => ({ x: pos.x + k * 40, y: pos.y - 60, vx: 0, vy: 0, tx: null, ty: null }));
    }
    return u;
  }
  function suckers(u) {
    if (u.kind === 'big') return [{ x: u.x, y: u.y, r: BIG.suck }];
    return u.noz.map(n => ({ x: n.x, y: n.y, r: TEAM.suck }));
  }

  // mode: 'big' = 플레이어가 큰 청소기 / 'team' = 플레이어가 세 갈래 청소기
  function createGame(mode, diff, seed, aiBoth) {
    const rng = mulberry32(seed == null ? (Date.now() >>> 0) : seed);
    const otherKind = mode === 'big' ? 'team' : 'big';
    const g = {
      mode, diff: DIFF[diff] ? diff : 'normal', rng,
      phase: 'countdown', countdown: 3, elapsed: 0, timeLeft: GAME_TIME, endDelay: 0,
      dust: genDust(rng), coinIdx: 0,
      units: [makeUnit(mode, aiBoth ? 'ai' : 'player', START[0]), makeUnit(otherKind, 'ai', START[1])],
      cat: { x: 270, y: 640, state: 'sleep', tx: 0, ty: 0, face: 1, t: 0 },
      input: { has: false, mx: 0, my: 0, kx: 0, ky: 0 },
      events: [], lastTick: 99, totalDust: 0
    };
    g.totalDust = g.dust.reduce((s, d) => s + d.v, 0);
    return g;
  }

  // ---- AI ----
  function bestCell(g, fx, fy, exclude, aiDiff) {
    const CS = 50, cols = Math.ceil(ROOM.w / CS), rows = Math.ceil(ROOM.h / CS);
    const val = new Float32Array(cols * rows), sx = new Float32Array(cols * rows), sy = new Float32Array(cols * rows);
    for (const d of g.dust) {
      if (!d.alive || d.pull >= 0) continue;
      const c = Math.floor((d.x - ROOM.x) / CS), r = Math.floor((d.y - ROOM.y) / CS), i = r * cols + c;
      if (i < 0 || i >= val.length) continue;
      val[i] += d.v; sx[i] += d.x * d.v; sy[i] += d.y * d.v;
    }
    let best = -1, bx = fx, by = fy;
    for (let i = 0; i < val.length; i++) {
      if (val[i] <= 0) continue;
      const cx = sx[i] / val[i], cy = sy[i] / val[i];
      if (aiDiff.avoidCat && g.cat.state === 'sleep' && dist(cx, cy, g.cat.x, g.cat.y) < 70) continue;
      if (exclude && exclude.some(e => dist(cx, cy, e.x, e.y) < 60)) continue;
      const s = val[i] / (1 + dist(fx, fy, cx, cy) / 200);
      if (s > best) { best = s; bx = cx; by = cy; }
    }
    return best < 0 ? null : { x: bx, y: by };
  }
  function nearestDust(g, x, y, maxD, exclude, avoidCat) {
    let best = null, bd = maxD;
    for (const d of g.dust) {
      if (!d.alive || d.pull >= 0) continue;
      let dd = dist(x, y, d.x, d.y) - (d.v - 1) * 12;
      if (dd >= bd) continue;
      if (avoidCat && g.cat.state === 'sleep' && dist(d.x, d.y, g.cat.x, g.cat.y) < 55) continue;
      if (exclude && exclude.some(e => e && dist(d.x, d.y, e.x, e.y) < 26)) continue;
      bd = dd; best = d;
    }
    return best;
  }
  function aiThink(g, u, aiDiff, dt) {
    u.think -= dt;
    if (u.think > 0) return;
    u.think = aiDiff.think * (0.7 + g.rng() * 0.6);
    const t = bestCell(g, u.x, u.y, null, aiDiff);
    if (t) { u.tx = t.x; u.ty = t.y; }
    if (u.kind === 'team') {
      const taken = [];
      for (const n of u.noz) {
        const d = nearestDust(g, n.x, n.y, 160, taken, aiDiff.avoidCat);
        if (d) { n.tx = d.x; n.ty = d.y; taken.push(d); } else { n.tx = null; }
      }
    }
  }

  // ---- 이동 ----
  function desiredVel(g, u, speed, aiDiff) {
    if (u.ctrl === 'player') {
      const inp = g.input;
      if (inp.kx || inp.ky) { const l = Math.hypot(inp.kx, inp.ky); return { x: inp.kx / l * speed, y: inp.ky / l * speed }; }
      if (inp.has) {
        const dx = inp.mx - u.x, dy = inp.my - u.y, d = Math.hypot(dx, dy);
        if (d < 4) return { x: 0, y: 0 };
        const s = Math.min(speed, d * 6);
        return { x: dx / d * s, y: dy / d * s };
      }
      return { x: 0, y: 0 };
    }
    const dx = u.tx - u.x, dy = u.ty - u.y, d = Math.hypot(dx, dy);
    if (d < 6) return { x: 0, y: 0 };
    const s = Math.min(speed * aiDiff.spd, d * 5);
    return { x: dx / d * s, y: dy / d * s };
  }

  function moveUnit(g, u, dt) {
    const aiDiff = u.aiDiff || DIFF[g.diff];
    if (u.ctrl === 'ai' && g.phase === 'play') aiThink(g, u, aiDiff, dt);
    const speed = u.kind === 'big' ? BIG.speed : TEAM.speed;
    let want = { x: 0, y: 0 };
    if (u.stun <= 0 && g.phase === 'play') want = desiredVel(g, u, speed, aiDiff);
    const k = 1 - Math.exp(-(u.stun > 0 ? 3 : 10) * dt);
    u.vx = lerp(u.vx, want.x, k); u.vy = lerp(u.vy, want.y, k);
    u.x += u.vx * dt; u.y += u.vy * dt;
    if (Math.hypot(u.vx, u.vy) > 20) u.face = Math.atan2(u.vy, u.vx);
    collide(u, u.kind === 'big' ? BIG.r : TEAM.r);

    if (u.kind === 'team') {
      const drag = Math.exp(-6 * dt);
      for (let i = 0; i < 3; i++) {
        const n = u.noz[i];
        let ax = 0, ay = 0;
        if (u.stun <= 0 && g.phase === 'play') {
          let tx = null, ty = null, force = 0;
          if (u.ctrl === 'ai') { if (n.tx != null) { tx = n.tx; ty = n.ty; force = 950 * aiDiff.spd; } }
          else { // 플레이어 쪽 호스는 가까운 먼지로 살짝 끌려감
            const d = nearestDust(g, n.x, n.y, TEAM.seekR, null, false);
            if (d) { tx = d.x; ty = d.y; force = TEAM.seekF; }
          }
          if (tx != null) { const dx = tx - n.x, dy = ty - n.y, d = Math.hypot(dx, dy) || 1; ax = dx / d * force; ay = dy / d * force; }
        }
        n.vx = (n.vx + ax * dt) * drag; n.vy = (n.vy + ay * dt) * drag;
        n.x += n.vx * dt; n.y += n.vy * dt;
      }
      // 호스끼리 겹치지 않게
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        const a = u.noz[i], b = u.noz[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        if (d < 30) { const p = (30 - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
      }
      // 줄 제약: 팽팽해지면 서로 끌림
      for (const n of u.noz) {
        const dx = n.x - u.x, dy = n.y - u.y, d = Math.hypot(dx, dy);
        if (d > TEAM.rope) {
          const ex = d - TEAM.rope, nx = dx / d, ny = dy / d;
          n.x -= nx * ex * 0.8; n.y -= ny * ex * 0.8;
          u.x += nx * ex * 0.2; u.y += ny * ex * 0.2;
          const vn = n.vx * nx + n.vy * ny; if (vn > 0) { n.vx -= vn * nx; n.vy -= vn * ny; }
        }
        collide(n, TEAM.nr);
      }
      collide(u, TEAM.r);
    }
  }

  // ---- 흡입 ----
  function suction(g, dt) {
    const S = g.units.map(u => u.stun > 0 ? [] : suckers(u));
    for (const d of g.dust) {
      if (!d.alive) continue;
      if (d.pull < 0) {
        for (let ui = 0; ui < 2 && d.pull < 0; ui++) {
          const list = S[ui];
          for (let si = 0; si < list.length; si++) {
            const s = list[si];
            if (Math.abs(d.x - s.x) < s.r && Math.abs(d.y - s.y) < s.r && dist(d.x, d.y, s.x, s.y) < s.r) { d.pull = ui; d.sk = si; break; }
          }
        }
        if (d.pull < 0) continue;
      }
      const u = g.units[d.pull], s = suckers(u)[d.sk];
      const dx = s.x - d.x, dy = s.y - d.y, dd = Math.hypot(dx, dy);
      if (dd < 8) {
        d.alive = false;
        u.score += d.v; u.dustCount++;
        if (d.v === 3) u.clumps++;
        if (d.v === 5) u.coins++;
        g.events.push({ type: d.v === 5 ? 'coin' : d.v === 3 ? 'clump' : 'dust', u: d.pull, x: d.x, y: d.y, v: d.v });
        continue;
      }
      // 소용돌이처럼 감겨 들어감
      const sp = 420 * dt, tang = 0.6;
      d.x += (dx / dd) * sp - (dy / dd) * sp * tang;
      d.y += (dy / dd) * sp + (dx / dd) * sp * tang;
    }
  }

  // ---- 고양이 ----
  function updateCat(g, dt) {
    const c = g.cat;
    c.t += dt;
    if (c.state === 'run') {
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      if (d < 6) { c.state = 'sleep'; c.t = 0; }
      else { c.x += dx / d * 300 * dt; c.y += dy / d * 300 * dt; c.face = dx >= 0 ? 1 : -1; }
      return;
    }
    if (g.phase !== 'play' || c.t < 0.6) return;
    for (let ui = 0; ui < 2; ui++) {
      const u = g.units[ui];
      if (u.stun > 0) continue;
      const parts = u.kind === 'big' ? [{ x: u.x, y: u.y, r: BIG.r }] : [{ x: u.x, y: u.y, r: TEAM.r }].concat(u.noz.map(n => ({ x: n.x, y: n.y, r: TEAM.nr })));
      if (parts.some(p => dist(p.x, p.y, c.x, c.y) < p.r + CAT_R)) {
        u.stun = STUN_TIME; u.cats++;
        const lost = Math.min(u.score, CAT_PENALTY); u.score -= lost;
        g.events.push({ type: 'meow', u: ui, x: c.x, y: c.y, lost });
        let best = null, bd = -1;
        for (let k = 0; k < 12; k++) {
          const p = freeSpot(g.rng, 45);
          const dmin = Math.min(dist(p.x, p.y, g.units[0].x, g.units[0].y), dist(p.x, p.y, g.units[1].x, g.units[1].y));
          if (dmin > bd) { bd = dmin; best = p; }
        }
        c.state = 'run'; c.tx = best.x; c.ty = best.y; c.t = 0;
        break;
      }
    }
  }

  function step(g, dt) {
    if (g.phase === 'over') return;
    if (g.phase === 'countdown') {
      const prev = Math.ceil(g.countdown);
      g.countdown -= dt;
      const now = Math.ceil(g.countdown);
      if (now !== prev && now > 0) g.events.push({ type: 'beep' });
      if (g.countdown <= 0) { g.phase = 'play'; g.events.push({ type: 'go' }); }
      for (const u of g.units) moveUnit(g, u, dt);
      return;
    }
    if (g.phase === 'play') {
      g.elapsed += dt;
      g.timeLeft = Math.max(0, GAME_TIME - g.elapsed);
      const s = Math.ceil(g.timeLeft);
      if (s <= 5 && s >= 1 && s !== g.lastTick) { g.lastTick = s; g.events.push({ type: 'tick' }); }
      if (g.coinIdx < COIN_TIMES.length && g.elapsed >= COIN_TIMES[g.coinIdx]) {
        g.coinIdx++;
        const p = freeSpot(g.rng, 40);
        g.dust.push({ x: p.x, y: p.y, v: 5, alive: true, pull: -1, sk: 0, wob: 0 });
        g.events.push({ type: 'coinSpawn', x: p.x, y: p.y });
      }
    }
    for (const u of g.units) { if (u.stun > 0) u.stun = Math.max(0, u.stun - dt); moveUnit(g, u, dt); }
    suction(g, dt);
    updateCat(g, dt);
    if (g.phase === 'play') {
      const left = g.dust.some(d => d.alive);
      if (g.elapsed >= GAME_TIME || (!left && g.coinIdx >= COIN_TIMES.length)) {
        g.phase = 'end'; g.endDelay = 0; g.events.push({ type: 'timeup', clean: !left });
      }
    } else if (g.phase === 'end') {
      g.endDelay += dt;
      if (g.endDelay > 1.4 && !g.dust.some(d => d.alive && d.pull >= 0)) { g.phase = 'over'; g.events.push({ type: 'over' }); }
    }
    if (g.dust.length > 400 && g.elapsed % 5 < dt) g.dust = g.dust.filter(d => d.alive);
  }

  const Core = { W, H, ROOM, DIFF, BIG, TEAM, GAME_TIME, createGame, step, bestCell };
  if (typeof module !== 'undefined' && module.exports) { module.exports = Core; return; }

  /* =========================================================
   * 3. 사운드 (WebAudio 합성)
   * ========================================================= */
  const Sound = {
    ctx: null, master: null, bgmBus: null, on: true, noiseBuf: null, bgmTimer: null, nextTime: 0, stepIdx: 0,
    hum: null, lastPick: 0,
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 0.6 : 0; this.master.connect(this.ctx.destination);
        this.bgmBus = this.ctx.createGain(); this.bgmBus.gain.value = 0.25; this.bgmBus.connect(this.master);
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ctx = null; }
    },
    setOn(v) { this.on = v; if (this.master) this.master.gain.setTargetAtTime(v ? 0.6 : 0, this.ctx.currentTime, 0.03); },
    tone(f, d, type, v, f2, t0, dest) {
      const c = this.ctx; if (!c) return;
      const t = t0 != null ? t0 : c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.2, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + d + 0.05);
    },
    noise(d, v, f1, f2, t0, dest) {
      const c = this.ctx; if (!c) return;
      const t = t0 != null ? t0 : c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.2; fl.frequency.setValueAtTime(f1, t);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(dest || this.master); s.start(t, Math.random()); s.stop(t + d + 0.05);
    },
    startHum() {
      const c = this.ctx; if (!c || this.hum) return;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 420;
      const g = c.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.09, c.currentTime + 0.4);
      s.connect(fl); fl.connect(g); g.connect(this.master); s.start();
      this.hum = { s, g };
    },
    stopHum() {
      if (!this.hum) return;
      const c = this.ctx, h = this.hum; this.hum = null;
      try { h.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.1); h.s.stop(c.currentTime + 0.5); } catch (e) { /* 무시 */ }
    },
    play(name) {
      const c = this.ctx; if (!c || !this.on) return;
      const t = c.currentTime;
      switch (name) {
        case 'dust': if (t - this.lastPick < 0.035) return; this.lastPick = t; this.tone(1300 + Math.random() * 500, 0.04, 'triangle', 0.03); break;
        case 'clump': this.tone(320, 0.12, 'square', 0.1, 720); break;
        case 'coin': this.tone(988, 0.08, 'square', 0.1); this.tone(1319, 0.3, 'square', 0.1, null, t + 0.07); break;
        case 'coinSpawn': [1568, 2093].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.08, null, t + i * 0.08)); break;
        case 'meow':
          this.tone(620, 0.16, 'sawtooth', 0.07, 980); this.tone(980, 0.3, 'sawtooth', 0.07, 520, t + 0.15);
          this.tone(220, 0.4, 'square', 0.06, 90, t + 0.1); break;
        case 'beep': this.tone(523, 0.16, 'square', 0.13); break;
        case 'go': this.tone(1046, 0.35, 'square', 0.13); break;
        case 'tick': this.tone(1200, 0.05, 'square', 0.08); break;
        case 'timeup': [784, 659, 523].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, null, t + i * 0.12)); break;
        case 'win': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'square', 0.11, null, t + i * 0.13)); break;
        case 'lose': [523, 466, 415, 392].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, null, t + i * 0.22)); break;
        case 'thud': this.noise(0.2, 0.4, 300, 100); this.tone(110, 0.25, 'sine', 0.3, 60); break;
        case 'click': this.tone(700, 0.05, 'triangle', 0.12); break;
      }
    },
    startBgm() { if (!this.ctx || this.bgmTimer) return; this.nextTime = this.ctx.currentTime + 0.05; this.stepIdx = 0; this.bgmTimer = setInterval(() => this.schedule(), 25); },
    stopBgm() { if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; } },
    schedule() {
      const c = this.ctx; if (!c) return;
      const spb = 60 / 150 / 2;
      const mel = [76, 0, 79, 0, 81, 79, 76, 0, 74, 76, 74, 0, 72, 0, 74, 0, 76, 0, 79, 81, 83, 0, 81, 79, 76, 0, 74, 0, 72, 0, 0, 0];
      const roots = [48, 48, 45, 45, 53, 53, 55, 55];
      const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
      while (this.nextTime < c.currentTime + 0.12) {
        const s = this.stepIdx % 32, t = this.nextTime;
        if (this.on) {
          if (mel[s]) this.tone(mtof(mel[s]), spb * 0.8, 'square', 0.08, null, t, this.bgmBus);
          if (s % 2 === 0) this.tone(mtof(roots[Math.floor(s / 4) % 8] - 12 + (s % 4 === 2 ? 12 : 0)), spb * 1.5, 'triangle', 0.22, null, t, this.bgmBus);
          if (s % 4 === 2) this.noise(0.05, 0.14, 7000, null, t, this.bgmBus);
        }
        this.nextTime += spb; this.stepIdx++;
      }
    }
  };

  const Store = {
    get(k, d) { try { const v = localStorage.getItem('dustDuel.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('dustDuel.' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };

  /* =========================================================
   * 4. 렌더링
   * ========================================================= */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const FONT = '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const COL = [
    { main: '#ff8a3d', dark: '#c75a17', light: '#ffc08a', name: '나' },
    { main: '#4aa8e8', dark: '#2a6fa8', light: '#a8d8ff', name: 'AI' }
  ];
  let scale = 1, offX = 0, offY = 0, dpr = 1, vw = 0, vh = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    scale = Math.min(vw / W, vh / H); offX = (vw - W * scale) / 2; offY = (vh - H * scale) / 2;
  }
  window.addEventListener('resize', resize); resize();

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function text(str, x, y, size, color, align, stroke, sw) {
    ctx.font = size + 'px ' + FONT; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = sw || size * 0.18; ctx.strokeStyle = stroke; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  const ease = t => 1 - Math.pow(1 - t, 3);
  const backOut = t => { const s = 1.9; t -= 1; return t * t * ((s + 1) * t + s) + 1; };
  function circle(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }

  // ---- 방 ----
  function drawRoom(time) {
    const x0 = -offX / scale - 2, x1 = (vw - offX) / scale + 2, y0 = -offY / scale - 2, y1 = (vh - offY) / scale + 2;
    // 벽지
    ctx.fillStyle = '#fde6cf'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = '#f9d9b9';
    for (let x = Math.floor(x0 / 36) * 36; x < x1; x += 36) ctx.fillRect(x, y0, 14, ROOM.y - y0);
    // 아래쪽 바닥(방 밖)
    ctx.fillStyle = '#f3d2ae'; ctx.fillRect(x0, ROOM.y + ROOM.h, x1 - x0, y1 - ROOM.y - ROOM.h);
    // 방 바닥 — 나무
    ctx.save();
    rr(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 16); ctx.clip();
    ctx.fillStyle = '#e9c193'; ctx.fillRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h);
    for (let i = 0, y = ROOM.y; y < ROOM.y + ROOM.h; y += 38, i++) {
      ctx.fillStyle = i % 2 ? '#e4ba8a' : '#ecc79b'; ctx.fillRect(ROOM.x, y, ROOM.w, 38);
      ctx.fillStyle = '#d6a674'; ctx.fillRect(ROOM.x, y, ROOM.w, 2);
      const off = (i * 97) % 160;
      for (let x = ROOM.x - 160 + off; x < ROOM.x + ROOM.w; x += 160) ctx.fillRect(x, y, 2, 38);
    }
    // 러그
    ctx.fillStyle = '#f6a9a0'; ctx.beginPath(); ctx.ellipse(270, 610, 170, 100, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fbd2cc'; ctx.lineWidth = 8; ctx.setLineDash([14, 10]);
    ctx.beginPath(); ctx.ellipse(270, 610, 148, 82, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // 벽 테두리
    rr(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 16); ctx.lineWidth = 10; ctx.strokeStyle = '#b6855a'; ctx.stroke();
    rr(ROOM.x + 5, ROOM.y + 5, ROOM.w - 10, ROOM.h - 10, 12); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
    for (const f of FURN) drawFurniture(f, time);
  }
  function drawFurniture(f, time) {
    ctx.fillStyle = 'rgba(90,50,20,0.18)';
    if (f.t === 'rect') { rr(f.x + 4, f.y + 6, f.w, f.h, 12); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(f.cx + 3, f.cy + 5, f.r, f.r * 0.9, 0, 0, 7); ctx.fill(); }
    if (f.k === 'sofa') {
      rr(f.x, f.y, f.w, f.h, 14); ctx.fillStyle = '#5bb8c4'; ctx.fill();
      rr(f.x, f.y, f.w, 18, 10); ctx.fillStyle = '#4a9ea9'; ctx.fill();
      for (let i = 0; i < 2; i++) { rr(f.x + 12 + i * 70, f.y + 20, 66, 34, 10); ctx.fillStyle = '#7ccdd7'; ctx.fill(); }
      rr(f.x + 40, f.y + 24, 26, 22, 8); ctx.fillStyle = '#ffd166'; ctx.fill();
    } else if (f.k === 'shelf') {
      rr(f.x, f.y, f.w, f.h, 6); ctx.fillStyle = '#9b6a43'; ctx.fill();
      const cols = ['#ef6f6c', '#ffd166', '#7bd389', '#6c8cff', '#c38fff', '#ff9f6b'];
      for (let i = 0; i < 12; i++) { ctx.fillStyle = cols[i % 6]; ctx.fillRect(f.x + 8 + i * 11.5, f.y + 6 + (i % 3) * 2, 9, f.h - 12 - (i % 3) * 2); }
    } else if (f.k === 'table') {
      rr(f.x, f.y, f.w, f.h, 12); ctx.fillStyle = '#c98e5a'; ctx.fill();
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = 3; ctx.stroke();
      circle(f.x + 38, f.y + 40, 13, '#fff'); circle(f.x + 38, f.y + 40, 9, '#8a5a3a');
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      const s = Math.sin(time * 2);
      ctx.beginPath(); ctx.moveTo(f.x + 34, f.y + 22); ctx.quadraticCurveTo(f.x + 30 + s * 3, f.y + 14, f.x + 36, f.y + 6); ctx.stroke();
      rr(f.x + 66, f.y + 22, 36, 44, 4); ctx.fillStyle = '#fff6e5'; ctx.fill();
      ctx.fillStyle = '#d9c2a3'; for (let i = 0; i < 4; i++) ctx.fillRect(f.x + 71, f.y + 30 + i * 9, 26, 3);
    } else if (f.k === 'pot') {
      circle(f.cx, f.cy, f.r, '#d9734a'); circle(f.cx, f.cy, f.r - 5, '#6b4a33');
      ctx.fillStyle = '#5cb85c';
      for (let i = 0; i < 6; i++) { const a = i * 1.047 + time * 0.3; ctx.beginPath(); ctx.ellipse(f.cx + Math.cos(a) * 12, f.cy + Math.sin(a) * 12, 12, 6, a, 0, 7); ctx.fill(); }
      circle(f.cx, f.cy, 6, '#3f9a45');
    }
  }

  // ---- 먼지 ----
  function drawDust(g, time) {
    ctx.fillStyle = '#8f857c';
    ctx.beginPath();
    for (const d of g.dust) {
      if (!d.alive || d.v !== 1) continue;
      const r = d.pull >= 0 ? 2 : 2.7;
      ctx.moveTo(d.x + r, d.y); ctx.arc(d.x, d.y, r, 0, 7);
    }
    ctx.fill();
    for (const d of g.dust) {
      if (!d.alive || d.v === 1) continue;
      if (d.v === 3) drawBunny(d.x, d.y, time + d.wob, d.pull >= 0);
      else drawCoin(d.x, d.y, time);
    }
  }
  function drawBunny(x, y, t, pulled) {
    const s = pulled ? 0.7 : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#7f756c';
    for (let i = 0; i < 9; i++) { const a = i * 0.7; ctx.beginPath(); ctx.arc(Math.cos(a) * 7, Math.sin(a) * 6, 4.5, 0, 7); ctx.fill(); }
    circle(0, 0, 8, '#968b81');
    const blink = Math.sin(t * 2.3) > 0.95;
    if (pulled) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(-2, -1); ctx.lineTo(-5, 1); ctx.moveTo(5, -3); ctx.lineTo(2, -1); ctx.lineTo(5, 1); ctx.stroke(); }
    else if (!blink) { circle(-3, -1, 2.3, '#fff'); circle(3, -1, 2.3, '#fff'); circle(-3, -0.6, 1.2, '#2b2420'); circle(3, -0.6, 1.2, '#2b2420'); }
    ctx.restore();
  }
  function drawCoin(x, y, t) {
    const sq = Math.abs(Math.cos(t * 3));
    ctx.save(); ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 22); glow.addColorStop(0, 'rgba(255,230,120,0.7)'); glow.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = glow; ctx.fillRect(-22, -22, 44, 44);
    ctx.scale(0.3 + sq * 0.7, 1);
    circle(0, 0, 10, '#e0a800'); circle(0, 0, 8, '#ffd23f');
    ctx.fillStyle = '#e0a800'; ctx.fillRect(-1.5, -5, 3, 10);
    ctx.restore();
  }

  // ---- 청소기 ----
  function suckRing(x, y, r, time, col, active) {
    if (!active) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(time * 4);
    ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 3; ctx.setLineDash([8, 10]);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.18; ctx.rotate(-time * 9); ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, 7); ctx.stroke();
    ctx.restore(); ctx.setLineDash([]);
  }
  function eyes(x, y, face, size, stunned, time) {
    const lx = Math.cos(face) * size * 0.3, ly = Math.sin(face) * size * 0.3;
    for (const s of [-1, 1]) {
      const ex = x + s * size * 0.42, ey = y - size * 0.1;
      if (stunned) {
        ctx.strokeStyle = '#2b2420'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey, size * 0.2, time * 10, time * 10 + 5); ctx.stroke();
      } else {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, size * 0.26, size * 0.3, 0, 0, 7); ctx.fill();
        circle(ex + lx * 0.5, ey + ly * 0.5, size * 0.14, '#2b2420');
        circle(ex + lx * 0.5 - size * 0.05, ey + ly * 0.5 - size * 0.06, size * 0.05, '#fff');
      }
    }
  }
  function stunStars(x, y, time) {
    for (let i = 0; i < 3; i++) {
      const a = time * 5 + i * 2.09;
      const sx = x + Math.cos(a) * 18, sy = y + Math.sin(a) * 6;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 2.5 : 6, aa = k * Math.PI / 5 - Math.PI / 2; ctx.lineTo(sx + Math.cos(aa) * r, sy + Math.sin(aa) * r); }
      ctx.fill();
    }
  }
  function drawBig(u, col, time, active) {
    suckRing(u.x, u.y, BIG.suck, time, col.main, active && u.stun <= 0);
    ctx.fillStyle = 'rgba(60,30,10,0.22)'; ctx.beginPath(); ctx.ellipse(u.x + 3, u.y + 6, BIG.r + 2, BIG.r, 0, 0, 7); ctx.fill();
    const gr = ctx.createRadialGradient(u.x - 10, u.y - 12, 4, u.x, u.y, BIG.r);
    gr.addColorStop(0, col.light); gr.addColorStop(1, col.main);
    circle(u.x, u.y, BIG.r, col.dark); circle(u.x, u.y - 2, BIG.r - 2, '#fff');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(u.x, u.y - 2, BIG.r - 4, 0, 7); ctx.fill();
    // 범퍼 + 흡입구
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(u.x, u.y, BIG.r, u.face - 0.9, u.face + 0.9); ctx.stroke();
    // 안테나
    const blink = (Math.sin(time * 6) > 0) ? '#ff4f6d' : '#ffd6dd';
    ctx.strokeStyle = col.dark; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(u.x, u.y - BIG.r + 6); ctx.lineTo(u.x + 4, u.y - BIG.r - 6); ctx.stroke();
    circle(u.x + 4, u.y - BIG.r - 7, 3.5, blink);
    eyes(u.x, u.y - 2, u.face, 22, u.stun > 0, time);
    ctx.strokeStyle = '#2b2420'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(u.x, u.y + 9, 5, 0.2, Math.PI - 0.2); ctx.stroke();
    if (u.stun > 0) stunStars(u.x, u.y - BIG.r - 10, time);
  }
  function drawTeam(u, col, time, active) {
    // 호스
    for (const n of u.noz) {
      const dx = n.x - u.x, dy = n.y - u.y, d = Math.hypot(dx, dy) || 1;
      const slack = Math.max(0, TEAM.rope - d) * 0.5;
      const mx = (u.x + n.x) / 2 - dy / d * slack * 0.6, my = (u.y + n.y) / 2 + dx / d * slack * 0.6 + slack * 0.4;
      ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.quadraticCurveTo(mx, my, n.x, n.y); ctx.stroke();
      ctx.strokeStyle = '#7b8794'; ctx.lineWidth = 3; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.quadraticCurveTo(mx, my, n.x, n.y); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const n of u.noz) {
      suckRing(n.x, n.y, TEAM.suck, time, col.main, active && u.stun <= 0);
      ctx.fillStyle = 'rgba(60,30,10,0.2)'; ctx.beginPath(); ctx.ellipse(n.x + 2, n.y + 4, TEAM.nr, TEAM.nr * 0.85, 0, 0, 7); ctx.fill();
      circle(n.x, n.y, TEAM.nr, col.dark); circle(n.x, n.y - 1, TEAM.nr - 3, col.main);
      const a = Math.atan2(n.y - u.y, n.x - u.x);
      eyes(n.x, n.y - 1, a, 12, u.stun > 0, time);
    }
    // 본체
    ctx.fillStyle = 'rgba(60,30,10,0.22)'; ctx.beginPath(); ctx.ellipse(u.x + 3, u.y + 5, TEAM.r + 2, TEAM.r, 0, 0, 7); ctx.fill();
    circle(u.x, u.y, TEAM.r, col.dark);
    const gr = ctx.createRadialGradient(u.x - 8, u.y - 10, 3, u.x, u.y, TEAM.r);
    gr.addColorStop(0, col.light); gr.addColorStop(1, col.main);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(u.x, u.y - 2, TEAM.r - 3, 0, 7); ctx.fill();
    circle(u.x, u.y - 2, 7, col.dark); circle(u.x, u.y - 2, 4, '#ffe08a');
    if (u.stun > 0) stunStars(u.x, u.y - TEAM.r - 8, time);
  }
  function drawCat(c, time) {
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(60,30,10,0.18)'; ctx.beginPath(); ctx.ellipse(3, 8, 28, 16, 0, 0, 7); ctx.fill();
    if (c.state === 'sleep') {
      const br = 1 + Math.sin(time * 2.5) * 0.04;
      ctx.scale(br, br);
      ctx.fillStyle = '#f4a24c'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 18, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d97f2b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-6 + i * 8, -16); ctx.lineTo(-4 + i * 8, -6); ctx.stroke(); }
      ctx.strokeStyle = '#f4a24c'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(22, 4); ctx.quadraticCurveTo(30, 18, 8, 18); ctx.stroke();
      circle(-16, 2, 12, '#f8b466');
      ctx.fillStyle = '#f8b466';
      ctx.beginPath(); ctx.moveTo(-26, -4); ctx.lineTo(-24, -16); ctx.lineTo(-17, -8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-12, -9); ctx.lineTo(-6, -15); ctx.lineTo(-5, -4); ctx.fill();
      ctx.strokeStyle = '#5a3a24'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(-20, 2, 3, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(-12, 2, 3, 0.2, Math.PI - 0.2); ctx.stroke();
      circle(-16, 7, 1.6, '#ff8fa3');
      ctx.restore();
      const z = (time * 0.8) % 1;
      ctx.globalAlpha = 1 - z;
      text('z', c.x + 14 + z * 10, c.y - 22 - z * 22, 14 + z * 10, '#6b7cff', 'center', '#fff', 3);
      ctx.globalAlpha = 1;
    } else {
      ctx.scale(c.face, 1);
      const hop = Math.abs(Math.sin(time * 18)) * 6;
      ctx.translate(0, -hop);
      ctx.fillStyle = '#f4a24c'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 13, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#f4a24c'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-20, -2); ctx.lineTo(-34, -18); ctx.stroke();
      circle(20, -8, 12, '#f8b466');
      ctx.fillStyle = '#f8b466';
      ctx.beginPath(); ctx.moveTo(12, -16); ctx.lineTo(14, -28); ctx.lineTo(20, -18); ctx.fill();
      ctx.beginPath(); ctx.moveTo(22, -18); ctx.lineTo(30, -26); ctx.lineTo(30, -12); ctx.fill();
      circle(18, -10, 3, '#fff'); circle(25, -10, 3, '#fff'); circle(19, -10, 1.6, '#2b2420'); circle(26, -10, 1.6, '#2b2420');
      ctx.restore();
    }
  }

  // ---- 이펙트 ----
  let particles = [], popups = [], shake = 0, banner = null;
  function burst(x, y, n, colors, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = (0.3 + Math.random()) * (spd || 160);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.4 + Math.random() * 0.4, r: 2 + Math.random() * 3, c: colors[(Math.random() * colors.length) | 0] });
    }
  }
  function popup(x, y, str, color, size) { popups.push({ x, y, str, c: color, size: size || 26, t: 0 }); }
  function updateFx(dt) {
    for (const p of particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    particles = particles.filter(p => p.t < p.life);
    for (const p of popups) p.t += dt;
    popups = popups.filter(p => p.t < 1);
    shake = Math.max(0, shake - dt * 30);
    if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
  }
  function drawFx() {
    for (const p of particles) { ctx.globalAlpha = 1 - p.t / p.life; circle(p.x, p.y, p.r, p.c); }
    ctx.globalAlpha = 1;
    for (const p of popups) {
      const k = p.t;
      const sc = k < 0.15 ? backOut(k / 0.15) : 1;
      ctx.save(); ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.translate(p.x, p.y - ease(k) * 50); ctx.scale(sc, sc);
      text(p.str, 0, 0, p.size, p.c, 'center', '#fff', 6);
      ctx.restore();
    }
  }

  /* =========================================================
   * 5. 화면 상태 · UI
   * ========================================================= */
  let screen = 'title', game = null, result = null, demo = null;
  let diff = Store.get('diff', 'normal'); if (!DIFF[diff]) diff = 'normal';
  Sound.on = Store.get('sound', true);
  let pressedBtn = null;
  const BTN = {
    big:    { x: 70, y: 420, w: 400, h: 92 },
    team:   { x: 70, y: 532, w: 400, h: 92 },
    easy:   { x: 70, y: 668, w: 126, h: 52 },
    normal: { x: 207, y: 668, w: 126, h: 52 },
    hard:   { x: 344, y: 668, w: 126, h: 52 },
    retry:  { x: 110, y: 690, w: 320, h: 72 },
    home:   { x: 110, y: 774, w: 320, h: 60 },
    sound:  { x: W - 64, y: 100, w: 44, h: 44 }
  };
  const inRect = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  function newDemo() { demo = createGame('big', 'normal', null, true); demo.phase = 'play'; demo.countdown = 0; }
  newDemo();

  function startGame(mode) {
    game = createGame(mode, diff);
    screen = 'game'; particles = []; popups = []; banner = null;
  }
  function onOver(g) {
    Sound.stopBgm(); Sound.stopHum();
    const me = g.units[0].score, ai = g.units[1].score;
    const key = 'best.' + g.mode + '.' + g.diff;
    const best = Store.get(key, 0), isNew = me > best;
    if (isNew) Store.set(key, me);
    const wins = Store.get('wins.' + g.diff, 0) + (me > ai ? 1 : 0);
    if (me > ai) Store.set('wins.' + g.diff, wins);
    result = { g, me, ai, best: Math.max(best, me), isNew, t: 0, thud: false, outcome: me > ai ? 'win' : me < ai ? 'lose' : 'draw' };
    screen = 'result';
  }

  function handleEvents(g) {
    for (const e of g.events) {
      const col = COL[e.u] || COL[0];
      switch (e.type) {
        case 'dust': Sound.play('dust'); if (Math.random() < 0.3) burst(e.x, e.y, 2, ['#b5aca3', '#d8d0c8'], 60); break;
        case 'clump': Sound.play('clump'); burst(e.x, e.y, 8, ['#8f857c', '#cfc6bd'], 120); popup(e.x, e.y - 14, '+3', col.dark, 26); break;
        case 'coin': Sound.play('coin'); burst(e.x, e.y, 14, ['#ffd23f', '#fff3b0', '#e0a800'], 180); popup(e.x, e.y - 16, '+5', '#e0a800', 34); break;
        case 'coinSpawn': Sound.play('coinSpawn'); burst(e.x, e.y, 12, ['#fff3b0', '#ffd23f'], 120); break;
        case 'meow': Sound.play('meow'); shake = 8; popup(e.x, e.y - 30, '냐옹!', '#ff6b3d', 32); if (e.lost) popup(e.x, e.y + 6, '-' + e.lost, '#e04848', 26); break;
        case 'beep': Sound.play('beep'); break;
        case 'go': Sound.play('go'); Sound.startBgm(); Sound.startHum(); banner = { str: '청소 시작!', t: 0, dur: 0.8, c: '#ff8a3d' }; break;
        case 'tick': Sound.play('tick'); break;
        case 'timeup': Sound.play('timeup'); Sound.stopBgm(); Sound.stopHum(); banner = { str: e.clean ? '싹 다 청소!' : '그만!', t: 0, dur: 1.4, c: '#4aa8e8' }; break;
        case 'over': onOver(g); break;
      }
    }
    g.events.length = 0;
  }

  function drawButton(b, label, sub, colA, colB, pressed, fs) {
    const dy = pressed ? 4 : 0;
    rr(b.x, b.y + 6, b.w, b.h, 22); ctx.fillStyle = colB; ctx.fill();
    rr(b.x, b.y + dy, b.w, b.h, 22);
    const gr = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); gr.addColorStop(0, colA); gr.addColorStop(1, colB);
    ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
    if (sub) {
      text(label, b.x + b.w / 2, b.y + b.h * 0.38 + dy, fs || 30, '#fff', 'center', 'rgba(0,0,0,0.18)', 5);
      text(sub, b.x + b.w / 2, b.y + b.h * 0.74 + dy, 17, 'rgba(255,255,255,0.95)');
    } else text(label, b.x + b.w / 2, b.y + b.h / 2 + dy, fs || 28, '#fff', 'center', 'rgba(0,0,0,0.18)', 5);
  }
  function drawSoundBtn() {
    const b = BTN.sound;
    rr(b.x, b.y, b.w, b.h, 14); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    const cx = b.x + 16, cy = b.y + 22;
    ctx.fillStyle = '#5a3a24';
    ctx.beginPath(); ctx.moveTo(cx - 8, cy - 5); ctx.lineTo(cx - 2, cy - 5); ctx.lineTo(cx + 6, cy - 12); ctx.lineTo(cx + 6, cy + 12); ctx.lineTo(cx - 2, cy + 5); ctx.lineTo(cx - 8, cy + 5); ctx.fill();
    ctx.strokeStyle = '#5a3a24'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (Sound.on) { ctx.beginPath(); ctx.arc(cx + 8, cy, 7, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 8, cy, 13, -0.8, 0.8); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(cx + 11, cy - 7); ctx.lineTo(cx + 22, cy + 7); ctx.moveTo(cx + 22, cy - 7); ctx.lineTo(cx + 11, cy + 7); ctx.stroke(); }
  }

  function drawPlayfield(g, time) {
    drawDust(g, time);
    if (g.cat.state === 'sleep') drawCat(g.cat, time);
    const active = g.phase === 'play' || g.phase === 'end';
    g.units.forEach((u, i) => (u.kind === 'big' ? drawBig : drawTeam)(u, COL[i], time, active));
    if (g.cat.state === 'run') drawCat(g.cat, time);
    // '나' 표시
    const me = g.units[0];
    if (me.ctrl === 'player') {
      const yy = me.y - (me.kind === 'big' ? BIG.r : TEAM.r) - 26 + Math.sin(time * 5) * 3;
      ctx.fillStyle = COL[0].main;
      ctx.beginPath(); ctx.moveTo(me.x - 7, yy + 6); ctx.lineTo(me.x + 7, yy + 6); ctx.lineTo(me.x, yy + 14); ctx.fill();
      rr(me.x - 20, yy - 12, 40, 20, 8); ctx.fill();
      text('나', me.x, yy - 2, 16, '#fff');
    }
    drawFx();
  }

  function drawHUD(g, time) {
    rr(16, 12, W - 32, 80, 24); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#f2c79a'; ctx.stroke();
    const kindName = k => k === 'big' ? '큰 청소기' : '세 갈래';
    for (let i = 0; i < 2; i++) {
      const x = i ? W - 92 : 92, u = g.units[i];
      text((i ? 'AI · ' : '나 · ') + kindName(u.kind), x, 34, 17, '#8a6a4a');
      text(String(u.score), x, 66, 38, COL[i].main, 'center', '#fff', 4);
    }
    const cx = W / 2, cy = 52, r = 32, k = g.timeLeft / GAME_TIME;
    circle(cx, cy, r, '#fff3e3');
    ctx.strokeStyle = g.timeLeft <= 5 ? '#ff4f6d' : '#5bb8c4'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    const pul = g.timeLeft <= 5 && g.phase === 'play' ? 1 + Math.max(0, Math.sin(time * 12)) * 0.12 : 1;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(pul, pul); text(String(Math.ceil(g.timeLeft)), 0, 2, 32, g.timeLeft <= 5 ? '#ff4f6d' : '#3b2a20'); ctx.restore();
    // 우세 막대
    const a = g.units[0].score, b = g.units[1].score, tot = a + b;
    const ratio = tot ? a / tot : 0.5;
    const bx = 24, bw = W - 100, by = 108, bh = 22;
    rr(bx, by, bw, bh, 11); ctx.fillStyle = COL[1].main; ctx.fill();
    ctx.save(); rr(bx, by, bw, bh, 11); ctx.clip();
    ctx.fillStyle = COL[0].main; ctx.fillRect(bx, by, bw * ratio, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(bx, by + 2, bw, 6);
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw * ratio - 2, by - 3, 4, bh + 6);
    drawSoundBtn();
  }

  function drawGameScreen(g, time) {
    drawPlayfield(g, time);
    drawHUD(g, time);
    const hint = g.mode === 'big'
      ? '화면을 끌어서 큰 청소기를 움직이세요'
      : '본체를 끌고 다니면 호스 3개가 따라와요';
    rr(30, 822, W - 60, 92, 20); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
    text(hint, W / 2, 852, 20, '#5a3a24');
    text('PC: 방향키 · WASD · 마우스 드래그   잠든 고양이는 피하세요!', W / 2, 884, 16, '#8a6a4a');
    if (g.phase === 'countdown') {
      const n = Math.ceil(g.countdown), k = 1 - (g.countdown - Math.floor(g.countdown));
      ctx.save(); ctx.translate(W / 2, 400); const s = backOut(Math.min(1, k * 2.5)); ctx.scale(s, s);
      text(String(n), 0, 0, 140, '#fff', 'center', '#ff8a3d', 16); ctx.restore();
      text(g.mode === 'big' ? '혼자서 세 갈래 청소기를 이겨라!' : '호스 셋으로 큰 청소기를 이겨라!', W / 2, 500, 26, '#5a3a24', 'center', '#fff', 6);
    }
    if (banner) {
      const k = banner.t / banner.dur, s = backOut(Math.min(1, banner.t / 0.25));
      ctx.save(); ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      ctx.translate(W / 2, 420); ctx.scale(s, s); ctx.rotate(-0.05);
      text(banner.str, 0, 0, 72, '#fff', 'center', banner.c, 14); ctx.restore();
    }
  }

  function drawTitle(time, dt) {
    if (demo) {
      step(demo, dt); demo.events.length = 0;
      if (demo.phase === 'over' || demo.elapsed > 26) newDemo();
      drawPlayfield(demo, time);
    }
    ctx.fillStyle = 'rgba(253,230,207,0.55)';
    ctx.fillRect(-offX / scale, -offY / scale, vw / scale, vh / scale);
    const bounce = Math.sin(time * 2.4) * 5;
    ctx.save(); ctx.translate(W / 2, 250 + bounce); ctx.rotate(-0.035);
    rr(-215, -86, 430, 168, 36); ctx.fillStyle = 'rgba(255,255,255,0.93)'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#ffb072'; ctx.stroke();
    text('먼지 대작전', 0, -18, 70, '#ff8a3d', 'center', '#7a3e12', 12);
    text('DUST DUEL', 0, 44, 28, '#4aa8e8', 'center', '#fff', 6);
    drawBunny(178, -70, time, false);
    ctx.restore();
    drawButton(BTN.big, '큰 청소기로 하기', '1 대 3 · 혼자서 세 갈래 청소기를 이겨라', '#ffa45c', '#f0761e', pressedBtn === 'big');
    drawButton(BTN.team, '세 갈래 청소기로 하기', '3 대 1 · 호스 셋을 끌고 쓸어 담아라', '#6cc2f2', '#2f8fd6', pressedBtn === 'team');
    text('AI 난이도', W / 2, 650, 18, '#8a6a4a');
    for (const k of ['easy', 'normal', 'hard']) {
      const b = BTN[k], on = diff === k;
      rr(b.x, b.y, b.w, b.h, 26);
      ctx.fillStyle = on ? '#5a3a24' : 'rgba(255,255,255,0.85)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = on ? '#5a3a24' : '#e3c4a2'; ctx.stroke();
      text(DIFF[k].label, b.x + b.w / 2, b.y + b.h / 2 + 1, 22, on ? '#fff' : '#8a6a4a');
    }
    const wins = Store.get('wins.' + diff, 0);
    text(DIFF[diff].label + ' 난이도 승리 ' + wins + '회', W / 2, 746, 18, '#8a6a4a');
    rr(30, 790, W - 60, 120, 20); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    text('30초 동안 상대보다 먼지를 더 많이 빨아들이세요!', W / 2, 820, 19, '#5a3a24');
    text('먼지 1점 · 먼지 뭉치 3점 · 반짝 동전 5점', W / 2, 852, 18, '#8a6a4a');
    text('잠든 고양이를 건드리면 -3점, 잠시 기절해요', W / 2, 882, 17, '#c0563a');
    drawSoundBtn();
  }

  function drawBag(x, y, score, col, sc) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.fillStyle = col.main;
    ctx.beginPath(); ctx.moveTo(-18, -44); ctx.quadraticCurveTo(-50, 10, -36, 40); ctx.quadraticCurveTo(0, 54, 36, 40); ctx.quadraticCurveTo(50, 10, 18, -44); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col.dark; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = col.dark; rr(-20, -52, 40, 12, 5); ctx.fill();
    text(String(score), 0, 8, 30, '#fff', 'center', col.dark, 5);
    ctx.restore();
  }
  function drawResult(time, dt) {
    const r = result, g = r.g;
    r.t += dt;
    ctx.fillStyle = 'rgba(40,25,10,' + Math.min(0.45, r.t) + ')';
    ctx.fillRect(-offX / scale, -offY / scale, vw / scale, vh / scale);
    const k = backOut(Math.min(1, r.t / 0.4));
    ctx.save(); ctx.translate(W / 2, 500); ctx.scale(k, k); ctx.translate(-W / 2, -500);
    rr(40, 150, W - 80, 700, 32); ctx.fillStyle = '#fffaf2'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#ffb072'; ctx.stroke();
    // 저울
    const st = clamp((r.t - 0.5) / 0.9, 0, 1);
    if (st >= 1 && !r.thud) { r.thud = true; Sound.play('thud'); shake = 6; setTimeout(() => Sound.play(r.outcome === 'win' ? 'win' : 'lose'), 250); }
    const diffS = (r.me - r.ai) / Math.max(10, r.me + r.ai);
    const tilt = clamp(diffS * 1.6, -0.32, 0.32) * backOut(st);
    const px = W / 2, py = 250;
    ctx.fillStyle = '#9b6a43'; rr(px - 8, py, 16, 150, 6); ctx.fill(); rr(px - 60, py + 140, 120, 18, 8); ctx.fill();
    ctx.save(); ctx.translate(px, py); ctx.rotate(tilt);
    ctx.fillStyle = '#b6855a'; rr(-170, -7, 340, 14, 7); ctx.fill();
    circle(0, 0, 12, '#7a4e2c');
    ctx.restore();
    const lx = px - Math.cos(tilt) * 150, ly = py - Math.sin(tilt) * 150;
    const rx = px + Math.cos(tilt) * 150, ry = py + Math.sin(tilt) * 150;
    ctx.strokeStyle = '#7a4e2c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 44); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry + 44); ctx.stroke();
    const sa = 0.8 + 0.4 * clamp(r.me / Math.max(1, r.me + r.ai), 0, 1), sb = 0.8 + 0.4 * clamp(r.ai / Math.max(1, r.me + r.ai), 0, 1);
    drawBag(lx, ly + 96, Math.round(r.me * ease(st)), COL[0], sa);
    drawBag(rx, ry + 96, Math.round(r.ai * ease(st)), COL[1], sb);
    text('나', lx, ly + 170, 20, COL[0].dark); text('AI', rx, ry + 170, 20, COL[1].dark);
    // 판정
    if (st >= 1) {
      const s = backOut(clamp((r.t - 1.4) / 0.3, 0, 1));
      const label = r.outcome === 'win' ? '승리!' : r.outcome === 'lose' ? '아쉬운 패배' : '무승부';
      const c = r.outcome === 'win' ? '#ff6b3d' : r.outcome === 'lose' ? '#4aa8e8' : '#8a6a4a';
      ctx.save(); ctx.translate(W / 2, 192); ctx.scale(s, s); text(label, 0, 0, 52, '#fff', 'center', c, 12); ctx.restore();
    }
    const me = g.units[0];
    const rows = [
      ['먼지 뭉치', me.clumps + '개'],
      ['반짝 동전', me.coins + '개'],
      ['고양이 깨움', me.cats + '번'],
      ['최고 점수 (' + DIFF[g.diff].label + ')', r.best + '점' + (r.isNew ? ' 신기록!' : '')]
    ];
    rows.forEach((row, i) => {
      const y = 500 + i * 40;
      text(row[0], 90, y, 21, '#8a6a4a', 'left');
      text(row[1], W - 90, y, 22, i === 3 && r.isNew ? '#ff4f6d' : '#3b2a20', 'right');
    });
    text(Math.round((r.me + r.ai) / Math.max(1, g.totalDust + 15) * 100) + '% 청소 완료', W / 2, 662, 18, '#5bb8c4');
    drawButton(BTN.retry, '한 판 더', null, '#ffa45c', '#f0761e', pressedBtn === 'retry');
    drawButton(BTN.home, '처음으로', null, '#c9b8a3', '#a8957f', pressedBtn === 'home', 24);
    ctx.restore();
  }

  /* =========================================================
   * 6. 입력
   * ========================================================= */
  function toLogical(e) { return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale }; }
  let dragging = false;
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault(); Sound.ensure();
    const p = toLogical(e);
    if (screen !== 'result' && inRect(p, BTN.sound)) {
      Sound.setOn(!Sound.on); Store.set('sound', Sound.on);
      if (!Sound.on) { Sound.stopBgm(); Sound.stopHum(); }
      else if (screen === 'game' && game && game.phase === 'play') { Sound.startBgm(); Sound.startHum(); }
      return;
    }
    if (screen === 'title') {
      for (const k of ['big', 'team', 'easy', 'normal', 'hard']) if (inRect(p, BTN[k])) pressedBtn = k;
      if (pressedBtn && DIFF[pressedBtn]) { diff = pressedBtn; Store.set('diff', diff); Sound.play('click'); pressedBtn = null; }
    } else if (screen === 'result') {
      if (result.t < 1.2) return;
      if (inRect(p, BTN.retry)) pressedBtn = 'retry'; else if (inRect(p, BTN.home)) pressedBtn = 'home';
    } else if (screen === 'game') {
      dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      game.input.has = true; game.input.mx = p.x; game.input.my = p.y;
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (screen === 'game' && dragging) { const p = toLogical(e); game.input.mx = p.x; game.input.my = p.y; }
  });
  function endDrag() { dragging = false; if (game) game.input.has = false; }
  canvas.addEventListener('pointerup', function (e) {
    e.preventDefault();
    if (screen === 'game') { endDrag(); return; }
    if (!pressedBtn) return;
    const b = pressedBtn, p = toLogical(e); pressedBtn = null;
    if (!inRect(p, BTN[b])) return;
    Sound.play('click');
    if (b === 'big' || b === 'team') startGame(b);
    else if (b === 'retry') startGame(result.g.mode);
    else if (b === 'home') { screen = 'title'; newDemo(); }
  });
  canvas.addEventListener('pointercancel', function () { pressedBtn = null; endDrag(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  const keys = {};
  const KEYMAP = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
  function syncKeys() {
    if (!game) return;
    let kx = 0, ky = 0;
    for (const k in keys) if (keys[k] && KEYMAP[k]) { kx += KEYMAP[k][0]; ky += KEYMAP[k][1]; }
    game.input.kx = kx; game.input.ky = ky;
  }
  window.addEventListener('keydown', function (e) {
    if (KEYMAP[e.code]) { e.preventDefault(); keys[e.code] = true; Sound.ensure(); syncKeys(); return; }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault(); if (e.repeat) return; Sound.ensure();
      if (screen === 'title') { Sound.play('click'); startGame('big'); }
      else if (screen === 'result' && result.t > 1.2) { Sound.play('click'); startGame(result.g.mode); }
    }
  });
  window.addEventListener('keyup', function (e) { if (KEYMAP[e.code]) { keys[e.code] = false; syncKeys(); } });
  window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; syncKeys(); endDrag(); });

  let hidden = false;
  document.addEventListener('visibilitychange', function () {
    hidden = document.hidden;
    if (hidden) { Sound.stopBgm(); Sound.stopHum(); }
    else if (screen === 'game' && game && game.phase === 'play') { Sound.startBgm(); Sound.startHum(); }
  });

  /* =========================================================
   * 7. 메인 루프
   * ========================================================= */
  let last = performance.now(), clock = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (hidden) dt = 0;
    clock += dt;
    if (screen === 'game' && game) {
      // 고정 간격으로 나눠서 물리 안정성 확보
      let rem = dt; while (rem > 0) { const s = Math.min(1 / 60, rem); step(game, s); rem -= s; }
      handleEvents(game);
    }
    updateFx(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (offX + sx * scale), dpr * (offY + sy * scale));
    drawRoom(clock);
    if (screen === 'title') drawTitle(clock, dt);
    else if (screen === 'game') drawGameScreen(game, clock);
    else if (screen === 'result') { drawPlayfield(result.g, clock); drawHUD(result.g, clock); drawResult(clock, dt); }
  }
  if (document.fonts && document.fonts.load) {
    Promise.race([document.fonts.load('40px "Jua"'), new Promise(r => setTimeout(r, 1500))]).then(() => requestAnimationFrame(frame), () => requestAnimationFrame(frame));
  } else requestAnimationFrame(frame);
})();
