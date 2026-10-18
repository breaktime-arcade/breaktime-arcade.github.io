/*!
 * 꽃게 망치 (Crab Bonk) v1.0
 * 쉬는시간 오락실 — https://smile-willow.tistory.com/
 * Canvas 2D 웹게임. index.html 과 같은 폴더에 두고 사용하세요.
 */
(function () {
  'use strict';

  /* =========================================================
   * 1. 상수 · 밸런스
   * ========================================================= */
  const W = 540, H = 960;
  const FIELD = { x: 20, y: 250, w: 500, h: 530 };   // 꽃게가 다니는 모래사장
  const GAME_TIME = 30;
  const PLAYER = { r: 20, speed: 230, reach: 42, hitR: 32, aimR: 75 };
  const SWING = { impact: 0.09, total: 0.3 };
  const PINCH_LOCK = 1.0;
  const MAX_CRABS = 9;
  const TYPES = {
    crab:   { pts: 1, speed: 82,  r: 21, hp: 1 },
    fast:   { pts: 2, speed: 172, r: 19, hp: 1 },
    hermit: { pts: 3, speed: 60,  r: 24, hp: 2 },
    gold:   { pts: 5, speed: 135, r: 21, hp: 1 },
    angry:  { pts: 1, speed: 80,  r: 22, hp: 1 },
    jelly:  { pts: -3, speed: 28, r: 22, hp: 1 }
  };
  const PHASES = [
    { until: 10,  interval: [0.95, 1.25], w: { crab: 5.5, fast: 2, hermit: 1.2, angry: 1, jelly: 1.3, gold: 0.3 } },
    { until: 20,  interval: [0.7, 0.95],  w: { crab: 4.5, fast: 3, hermit: 1.5, angry: 1.7, jelly: 1.7, gold: 0.4 } },
    { until: 999, interval: [0.45, 0.7],  w: { crab: 3.5, fast: 4, hermit: 1.5, angry: 2.3, jelly: 2, gold: 0.5 } }
  ];
  const AI_DIFF = {
    easy:   { speed: 180, react: 0.38, acc: 0.65, avoidJelly: 0.4, label: '쉬움' },
    normal: { speed: 212, react: 0.22, acc: 0.83, avoidJelly: 0.8, label: '보통' },
    hard:   { speed: 240, react: 0.11, acc: 0.96, avoidJelly: 0.97, label: '어려움' }
  };
  const RANKS = [
    { r: 'S', min: 80, color: '#ff4f6d' },
    { r: 'A', min: 60, color: '#ff9f1c' },
    { r: 'B', min: 40, color: '#2ec4b6' },
    { r: 'C', min: 0,  color: '#8d99ae' }
  ];

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

  function makePlayer(ctrl, x, y, face) {
    return { ctrl, x, y, vx: 0, vy: 0, face, aimX: face, aimY: 0, swing: -1, lock: 0, score: 0,
      combo: 0, maxCombo: 0, kills: 0, golds: 0, jellies: 0, pinches: 0, swings: 0, hits: 0,
      think: 0, target: null, wantSwing: false };
  }

  // mode: 'classic' | 'versus'
  function createGame(mode, diff, seed) {
    const g = {
      mode, diff: AI_DIFF[diff] ? diff : 'normal',
      rng: mulberry32(seed == null ? (Date.now() >>> 0) : seed),
      phase: 'countdown', countdown: 3, elapsed: 0, timeLeft: GAME_TIME, endDelay: 0,
      crabs: [], nextId: 1, spawnT: 0.4,
      players: [makePlayer('player', mode === 'versus' ? 170 : W / 2, 560, 1)],
      input: { has: false, mx: 0, my: 0, kx: 0, ky: 0 },
      events: [], lastTick: 99
    };
    if (mode === 'versus') g.players.push(makePlayer('ai', 370, 560, -1));
    return g;
  }

  function pickWeighted(rng, w) {
    let tot = 0; for (const k in w) tot += w[k];
    let r = rng() * tot;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return Object.keys(w)[0];
  }
  function spawnCrab(g, forceType) {
    const p = PHASES.find(ph => g.elapsed < ph.until);
    const type = forceType || pickWeighted(g.rng, p.w);
    const T = TYPES[type];
    const fromLeft = g.rng() < 0.5;
    const c = {
      id: g.nextId++, type, hp: T.hp, r: T.r,
      x: fromLeft ? FIELD.x - 30 : FIELD.x + FIELD.w + 30,
      y: FIELD.y + 30 + g.rng() * (FIELD.h - 60),
      dir: fromLeft ? 1 : -1, speed: T.speed * (0.85 + g.rng() * 0.3),
      pause: 0, nextPause: 1 + g.rng() * 2, wob: g.rng() * 6.28, vy: 0,
      hurt: 0, chasing: -1, leaving: false, dead: false, entered: false, shell: type === 'hermit'
    };
    g.crabs.push(c);
  }

  function updateCrab(g, c, dt) {
    c.hurt = Math.max(0, c.hurt - dt);
    c.wob += dt;
    if (c.type === 'angry' && !c.leaving && g.phase === 'play') {
      // 가까운 망치 주인을 쫓아가 집게로 문다
      let best = -1, bd = 170;
      g.players.forEach((p, i) => { const d = dist(c.x, c.y, p.x, p.y); if (d < bd && p.lock <= 0) { bd = d; best = i; } });
      c.chasing = best;
      if (best >= 0) {
        const p = g.players[best];
        const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1;
        c.x += dx / d * 108 * dt; c.y += dy / d * 108 * dt; c.dir = dx >= 0 ? 1 : -1;
        if (d < PLAYER.r + c.r - 4) {
          p.lock = PINCH_LOCK; p.pinches++; p.combo = 0;
          c.leaving = true; c.dir = c.x < W / 2 ? -1 : 1; c.speed = 160;
          g.events.push({ type: 'pinch', p: best, x: p.x, y: p.y });
        }
        return;
      }
    }
    if (c.pause > 0) { c.pause -= dt; return; }
    c.nextPause -= dt;
    if (c.nextPause <= 0 && !c.leaving && c.type !== 'jelly') {
      c.nextPause = 1 + g.rng() * 2.2;
      const r = g.rng();
      if (r < 0.35) c.pause = 0.3 + g.rng() * 0.5;
      else if (r < 0.55 && c.entered) c.dir *= -1;           // 방향 전환
      c.vy = (g.rng() - 0.5) * (c.type === 'fast' ? 140 : 60);
    }
    c.x += c.dir * c.speed * dt;
    c.y += c.vy * dt + (c.type === 'jelly' ? Math.sin(c.wob * 1.5) * 12 * dt : 0);
    if (c.y < FIELD.y + 24 || c.y > FIELD.y + FIELD.h - 24) { c.vy *= -1; c.y = clamp(c.y, FIELD.y + 24, FIELD.y + FIELD.h - 24); }
    if (!c.entered && c.x > FIELD.x + 20 && c.x < FIELD.x + FIELD.w - 20) c.entered = true;
    if (c.x < FIELD.x - 50 || c.x > FIELD.x + FIELD.w + 50) {
      if (c.entered || c.leaving) c.dead = true;
    }
  }

  // ---- 망치 ----
  function startSwing(g, i) {
    const p = g.players[i];
    if (g.phase !== 'play' || p.lock > 0 || (p.swing >= 0 && p.swing < SWING.total)) return false;
    // 가까운 꽃게 쪽으로 자동 조준(해파리 제외)
    let best = null, bd = PLAYER.aimR;
    for (const c of g.crabs) {
      if (c.dead || c.type === 'jelly') continue;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { const d = bd || 1; p.aimX = (best.x - p.x) / d; p.aimY = (best.y - p.y) / d; if (Math.abs(p.aimX) > 0.1) p.face = p.aimX > 0 ? 1 : -1; }
    else { p.aimX = p.face; p.aimY = 0; }
    p.swing = 0; p.swings++; p.impactDone = false;
    g.events.push({ type: 'swing', p: i });
    return true;
  }
  function impact(g, i) {
    const p = g.players[i];
    const ix = p.x + p.aimX * PLAYER.reach, iy = p.y + p.aimY * PLAYER.reach;
    g.events.push({ type: 'bonk', p: i, x: ix, y: iy });
    let any = false, jelly = false;
    for (const c of g.crabs) {
      if (c.dead || c.hurt > 0.2) continue;
      if (dist(ix, iy, c.x, c.y) > PLAYER.hitR + c.r * 0.6) continue;
      if (c.type === 'jelly') {
        jelly = true; c.dead = true; p.jellies++;
        p.score = Math.max(0, p.score + TYPES.jelly.pts); p.combo = 0;
        g.events.push({ type: 'jelly', p: i, x: c.x, y: c.y });
        continue;
      }
      c.hp--; c.hurt = 0.3;
      if (c.hp > 0) { // 소라게 껍데기 깨짐
        c.shell = false; c.speed = 120; c.pause = 0; c.dir = c.x < ix ? -1 : 1; c.leaving = false;
        any = true;
        g.events.push({ type: 'shell', p: i, x: c.x, y: c.y });
        continue;
      }
      any = true; c.dead = true;
      p.combo++; p.maxCombo = Math.max(p.maxCombo, p.combo); p.kills++; p.hits++;
      if (c.type === 'gold') p.golds++;
      const mult = p.combo >= 10 ? 3 : p.combo >= 5 ? 2 : 1;
      const pts = TYPES[c.type].pts * mult;
      p.score += pts;
      g.events.push({ type: 'kill', p: i, x: c.x, y: c.y, pts, mult, tt: c.type });
    }
    if (!any && !jelly) { p.combo = 0; g.events.push({ type: 'whiff', p: i }); }
  }

  // ---- 이동 ----
  function movePlayer(g, i, dt) {
    const p = g.players[i];
    p.lock = Math.max(0, p.lock - dt);
    if (p.swing >= 0) {
      p.swing += dt;
      if (!p.impactDone && p.swing >= SWING.impact) { p.impactDone = true; impact(g, i); }
      if (p.swing >= SWING.total) p.swing = -1;
    }
    let wx = 0, wy = 0, speed = PLAYER.speed;
    if (g.phase === 'play') {
      if (p.ctrl === 'player') {
        const inp = g.input;
        if (inp.kx || inp.ky) { const l = Math.hypot(inp.kx, inp.ky); wx = inp.kx / l * speed; wy = inp.ky / l * speed; }
        else if (inp.has) {
          const dx = inp.mx - p.x, dy = inp.my - p.y, d = Math.hypot(dx, dy);
          if (d > 6) { const s = Math.min(speed, d * 7); wx = dx / d * s; wy = dy / d * s; }
        }
      } else {
        const a = aiControl(g, p, i, dt); wx = a.x; wy = a.y;
      }
    }
    const swingSlow = p.swing >= 0 ? 0.35 : 1;
    const k = 1 - Math.exp(-14 * dt);
    p.vx = lerp(p.vx, wx * swingSlow, k); p.vy = lerp(p.vy, wy * swingSlow, k);
    p.x = clamp(p.x + p.vx * dt, FIELD.x + 22, FIELD.x + FIELD.w - 22);
    p.y = clamp(p.y + p.vy * dt, FIELD.y + 10, FIELD.y + FIELD.h - 12);
    if (p.swing < 0 && Math.abs(p.vx) > 25) p.face = p.vx > 0 ? 1 : -1;
  }

  function aiControl(g, p, i, dt) {
    const D = p.aiDiff || AI_DIFF[g.diff];
    p.think -= dt;
    if (p.think <= 0 || !p.target || p.target.dead) {
      p.think = D.react * (0.7 + g.rng() * 0.6);
      let best = null, bs = -1;
      for (const c of g.crabs) {
        if (c.dead || c.type === 'jelly' || !c.entered) continue;
        const d = dist(p.x, p.y, c.x, c.y);
        const v = TYPES[c.type].pts * (c.type === 'hermit' ? 0.7 : 1) * (c.type === 'angry' && c.chasing === i ? 2 : 1);
        const s = v / (d + 80);
        if (s > bs) { bs = s; best = c; }
      }
      p.target = best;
    }
    const c = p.target;
    if (!c) return { x: 0, y: 0 };
    const lead = 0.25;
    const tx = c.x + c.dir * c.speed * lead * (c.pause > 0 ? 0 : 1), ty = c.y;
    const side = p.x < tx ? -1 : 1;
    const gx = tx + side * PLAYER.reach * 0.8, gy = ty;
    const dx = gx - p.x, dy = gy - p.y, d = Math.hypot(dx, dy);
    if (dist(p.x, p.y, c.x, c.y) < PLAYER.reach + 18 && p.swing < 0 && p.lock <= 0) {
      // 해파리가 같이 맞을 것 같으면 참는다
      const jellyNear = g.crabs.some(j => !j.dead && j.type === 'jelly' && dist(j.x, j.y, c.x, c.y) < PLAYER.hitR + 14);
      if (!(jellyNear && g.rng() < D.avoidJelly)) {
        if (g.rng() < D.acc * dt * 12) startSwing(g, i);
      }
    }
    if (d < 4) return { x: 0, y: 0 };
    const s = Math.min(D.speed, d * 7);
    return { x: dx / d * s, y: dy / d * s };
  }

  function step(g, dt) {
    if (g.phase === 'over') return;
    if (g.phase === 'countdown') {
      const prev = Math.ceil(g.countdown);
      g.countdown -= dt;
      const now = Math.ceil(g.countdown);
      if (now !== prev && now > 0) g.events.push({ type: 'beep' });
      if (g.countdown <= 0) { g.phase = 'play'; g.events.push({ type: 'go' }); }
      return;
    }
    if (g.phase === 'play') {
      g.elapsed += dt;
      g.timeLeft = Math.max(0, GAME_TIME - g.elapsed);
      const s = Math.ceil(g.timeLeft);
      if (s <= 5 && s >= 1 && s !== g.lastTick) { g.lastTick = s; g.events.push({ type: 'tick' }); }
      g.spawnT -= dt;
      if (g.spawnT <= 0) {
        const p = PHASES.find(ph => g.elapsed < ph.until);
        g.spawnT = lerp(p.interval[0], p.interval[1], g.rng());
        if (g.crabs.filter(c => !c.dead).length < MAX_CRABS) spawnCrab(g);
      }
    }
    for (let i = 0; i < g.players.length; i++) movePlayer(g, i, dt);
    // 두 사람이 겹치지 않게
    if (g.players.length > 1) {
      const a = g.players[0], b = g.players[1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      if (d < 40) { const q = (40 - d) / 2; a.x -= dx / d * q; a.y -= dy / d * q; b.x += dx / d * q; b.y += dy / d * q; }
    }
    for (const c of g.crabs) if (!c.dead) updateCrab(g, c, dt);
    g.crabs = g.crabs.filter(c => !c.dead);
    if (g.phase === 'play' && g.elapsed >= GAME_TIME) {
      g.phase = 'end'; g.endDelay = 0; g.events.push({ type: 'timeup' });
      for (const c of g.crabs) { c.leaving = true; c.speed = 220; c.pause = 0; c.dir = c.x < W / 2 ? -1 : 1; c.chasing = -1; }
    } else if (g.phase === 'end') {
      g.endDelay += dt;
      if (g.endDelay > 1.5) { g.phase = 'over'; g.events.push({ type: 'over' }); }
    }
  }

  function rankFor(s) { return RANKS.find(r => s >= r.min); }

  const Core = { W, H, FIELD, TYPES, AI_DIFF, RANKS, PLAYER, createGame, step, startSwing, rankFor };
  if (typeof module !== 'undefined' && module.exports) { module.exports = Core; return; }

  /* =========================================================
   * 3. 사운드 (WebAudio 합성)
   * ========================================================= */
  const Sound = {
    ctx: null, master: null, bgmBus: null, on: true, noiseBuf: null, bgmTimer: null, nextTime: 0, stepIdx: 0, waveT: null,
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
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.2, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + d + 0.05);
    },
    noise(d, v, f1, f2, t0, dest, type) {
      const c = this.ctx; if (!c) return;
      const t = t0 != null ? t0 : c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const fl = c.createBiquadFilter(); fl.type = type || 'bandpass'; fl.Q.value = 1; fl.frequency.setValueAtTime(f1, t);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.3, d * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(dest || this.master); s.start(t, Math.random()); s.stop(t + d + 0.05);
    },
    play(name, o) {
      const c = this.ctx; if (!c || !this.on) return;
      const t = c.currentTime;
      switch (name) {
        case 'swing': this.noise(0.12, 0.18, 900, 2400); break;
        case 'bonk': // 뿅망치
          this.tone(880, 0.09, 'square', 0.13, 1500); this.tone(1500, 0.12, 'triangle', 0.1, 600, t + 0.05);
          this.noise(0.06, 0.25, 2500, 1200); break;
        case 'whiff': this.noise(0.1, 0.25, 500, 200); break;
        case 'kill': { const m = (o && o.mult) || 1; this.tone(520 * (1 + (m - 1) * 0.25), 0.1, 'square', 0.1, 1040 * (1 + (m - 1) * 0.25)); break; }
        case 'gold': [988, 1319, 1568, 1976].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.14, null, t + i * 0.05)); break;
        case 'shell': this.tone(1800, 0.05, 'square', 0.08); this.noise(0.12, 0.3, 3000, 1500); break;
        case 'jelly': this.tone(140, 0.4, 'sawtooth', 0.12, 70); this.tone(1400, 0.3, 'square', 0.05, 300); break;
        case 'pinch': this.tone(1200, 0.06, 'square', 0.12); this.tone(1200, 0.06, 'square', 0.12, null, t + 0.09); this.tone(300, 0.25, 'sawtooth', 0.08, 150, t + 0.12); break;
        case 'beep': this.tone(523, 0.16, 'square', 0.13); break;
        case 'go': this.tone(1046, 0.35, 'square', 0.13); break;
        case 'tick': this.tone(1200, 0.05, 'square', 0.08); break;
        case 'timeup': [784, 659, 523].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, null, t + i * 0.12)); break;
        case 'win': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'square', 0.11, null, t + i * 0.13)); break;
        case 'lose': [523, 466, 415, 392].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, null, t + i * 0.22)); break;
        case 'stamp': this.noise(0.15, 0.4, 400, 120); this.tone(110, 0.2, 'sine', 0.3, 60); break;
        case 'click': this.tone(700, 0.05, 'triangle', 0.12); break;
      }
    },
    startWaves() {
      if (!this.ctx || this.waveT) return;
      const wave = () => { if (this.on) this.noise(2.6, 0.07, 500, 250, null, this.master, 'lowpass'); };
      wave(); this.waveT = setInterval(wave, 3200);
    },
    stopWaves() { if (this.waveT) { clearInterval(this.waveT); this.waveT = null; } },
    startBgm() { if (!this.ctx || this.bgmTimer) return; this.nextTime = this.ctx.currentTime + 0.05; this.stepIdx = 0; this.bgmTimer = setInterval(() => this.schedule(), 25); },
    stopBgm() { if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; } },
    schedule() {
      const c = this.ctx; if (!c) return;
      const spb = 60 / 144 / 2;
      const mel = [67, 0, 72, 0, 76, 0, 72, 74, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 74, 76, 74, 0, 72, 69, 67, 0, 69, 0, 72, 0, 0, 0];
      const roots = [48, 48, 53, 53, 55, 55, 48, 48];
      const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
      while (this.nextTime < c.currentTime + 0.12) {
        const s = this.stepIdx % 32, t = this.nextTime;
        if (this.on) {
          if (mel[s]) this.tone(mtof(mel[s]), spb * 0.8, 'triangle', 0.13, null, t, this.bgmBus);
          if (s % 2 === 0) this.tone(mtof(roots[Math.floor(s / 4) % 8] - 12 + (s % 4 === 2 ? 7 : 0)), spb * 1.5, 'triangle', 0.24, null, t, this.bgmBus);
          if (s % 4 === 2) this.noise(0.04, 0.12, 7000, null, t, this.bgmBus);
          if (s % 8 === 7) this.tone(1568, 0.05, 'square', 0.03, null, t, this.bgmBus);
        }
        this.nextTime += spb; this.stepIdx++;
      }
    }
  };
  const Store = {
    get(k, d) { try { const v = localStorage.getItem('crabBonk.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('crabBonk.' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };

  /* =========================================================
   * 4. 렌더링
   * ========================================================= */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const FONT = '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const PCOL = [
    { shirt: '#ff7a3d', dark: '#c4511a', light: '#ffb98a', name: '나' },
    { shirt: '#3a9ad9', dark: '#22689c', light: '#9fd3ff', name: 'AI' }
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
  function circle(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  function ell(x, y, rx, ry, c, rot) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, 7); ctx.fill(); }
  const ease = t => 1 - Math.pow(1 - t, 3);
  const backOut = t => { const s = 1.9; t -= 1; return t * t * ((s + 1) * t + s) + 1; };

  // ---- 해변 ----
  const shells = [];
  (function () { const r = mulberry32(11); for (let i = 0; i < 14; i++) shells.push({ x: FIELD.x + 20 + r() * (FIELD.w - 40), y: FIELD.y + 40 + r() * (FIELD.h - 60), k: (r() * 3) | 0, rot: r() * 6 }); })();
  const dots = [];
  (function () { const r = mulberry32(5); for (let i = 0; i < 90; i++) dots.push({ x: r() * W, y: 230 + r() * 700, s: 1 + r() * 2 }); })();

  function drawBeach(time) {
    const x0 = -offX / scale - 2, x1 = (vw - offX) / scale + 2, y0 = -offY / scale - 2, y1 = (vh - offY) / scale + 2;
    // 하늘
    const sky = ctx.createLinearGradient(0, y0, 0, 150);
    sky.addColorStop(0, '#7fd3f7'); sky.addColorStop(1, '#c9efff');
    ctx.fillStyle = sky; ctx.fillRect(x0, y0, x1 - x0, 150 - y0);
    // 바다
    const sea = ctx.createLinearGradient(0, 130, 0, 235);
    sea.addColorStop(0, '#2bb3d9'); sea.addColorStop(1, '#5fd6e8');
    ctx.fillStyle = sea; ctx.fillRect(x0, 130, x1 - x0, 110);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 6; i++) {
      const wx = ((i * 120 + time * 18) % 720) - 90;
      ctx.beginPath(); ctx.ellipse(wx, 160 + (i % 3) * 22, 30, 3, 0, 0, 7); ctx.fill();
    }
    // 모래
    ctx.fillStyle = '#f7dfa8'; ctx.fillRect(x0, 225, x1 - x0, y1 - 225);
    // 밀려오는 파도
    const w = Math.sin(time * 0.9) * 10;
    ctx.fillStyle = '#9ee6ef';
    ctx.beginPath(); ctx.moveTo(x0, 225);
    for (let x = Math.floor(x0); x <= x1 + 20; x += 20) ctx.lineTo(x, 232 + w + Math.sin(x * 0.03 + time * 1.5) * 6);
    ctx.lineTo(x1, 200); ctx.lineTo(x0, 200); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = Math.floor(x0); x <= x1 + 20; x += 20) { const yy = 232 + w + Math.sin(x * 0.03 + time * 1.5) * 6; x === Math.floor(x0) ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
    ctx.stroke();
    // 젖은 모래 띠
    ctx.fillStyle = 'rgba(214,180,120,0.25)'; ctx.fillRect(x0, 238 + w, x1 - x0, 14);
    for (const d of dots) { ctx.fillStyle = 'rgba(200,160,100,0.35)'; ctx.fillRect(d.x, d.y, d.s, d.s); }
    // 야자수 (양옆)
    drawPalm(-6, 300, time, 1); drawPalm(W + 6, 760, time, -1);
    for (const s of shells) drawShell(s.x, s.y, s.k, s.rot);
    // 아래 패널 영역
    ctx.fillStyle = '#efd193'; ctx.fillRect(x0, 800, x1 - x0, y1 - 800);
    ctx.fillStyle = '#e3bf78'; ctx.fillRect(x0, 798, x1 - x0, 4);
  }
  function drawPalm(x, y, time, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, 1);
    ctx.strokeStyle = '#a0703f'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 60); ctx.quadraticCurveTo(10, 10, 28, -40); ctx.stroke();
    const sw = Math.sin(time * 1.2) * 0.06;
    ctx.fillStyle = '#5dbb63';
    for (let i = 0; i < 5; i++) {
      const a = -2.6 + i * 0.75 + sw;
      ctx.save(); ctx.translate(28, -40); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(34, 0, 36, 10, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    circle(24, -34, 7, '#8b5a2b'); circle(34, -32, 7, '#7a4a20');
    ctx.restore();
  }
  function drawShell(x, y, k, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    if (k === 0) { ell(0, 0, 7, 6, '#ffd1dc'); ctx.strokeStyle = '#f29bb0'; ctx.lineWidth = 1.2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(i * 3, -5); ctx.stroke(); } }
    else if (k === 1) { ell(0, 0, 5, 3.5, '#fff3e0'); }
    else { ctx.fillStyle = '#ffb38a'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 7, a = i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); }
    ctx.restore();
  }

  // ---- 꽃게 ----
  const CPAL = {
    crab:   { body: '#ff7043', dark: '#c84a24', claw: '#ff8a65' },
    fast:   { body: '#29b6f6', dark: '#0277bd', claw: '#4fc3f7' },
    hermit: { body: '#ff8a65', dark: '#c75b39', claw: '#ffab91' },
    gold:   { body: '#ffd23f', dark: '#c99700', claw: '#ffe27a' },
    angry:  { body: '#e53935', dark: '#8e1c1a', claw: '#ef5350' }
  };
  function drawCrab(c, time) {
    if (c.type === 'jelly') return drawJelly(c, time);
    const P = CPAL[c.type];
    const walking = c.pause <= 0;
    const leg = walking ? Math.sin(time * (c.speed / 5) + c.wob * 3) : 0;
    const sh = c.hurt > 0 ? Math.sin(c.hurt * 80) * 3 : 0;
    const s = c.r / 21;
    ctx.save(); ctx.translate(c.x + sh, c.y); ctx.scale(s, s);
    ell(2, 14, 24, 8, 'rgba(120,80,30,0.22)');
    // 다리 (좌우 3쌍)
    ctx.strokeStyle = P.dark; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      const ph = leg * (k % 2 ? 1 : -1) * 4;
      ctx.beginPath(); ctx.moveTo(side * 12, 2 + k * 4);
      ctx.lineTo(side * 24, 4 + k * 5 + ph); ctx.lineTo(side * 28, 12 + k * 4 + ph); ctx.stroke();
    }
    if (c.type === 'hermit' && c.shell) {
      // 소라 껍데기
      ctx.fillStyle = '#f3c7a1'; ctx.beginPath(); ctx.ellipse(0, -8, 22, 20, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c98f63'; ctx.lineWidth = 3;
      ctx.beginPath(); for (let a = 0; a < 12; a += 0.3) { const r = 2 + a * 1.6; ctx.lineTo(Math.cos(a) * r, -8 + Math.sin(a) * r * 0.9); } ctx.stroke();
      circle(-12, -20, 5, '#ffd8e2');
    }
    // 몸통
    ell(0, 0, 20, 15, P.dark); ell(0, -1.5, 18.5, 13, P.body);
    ell(-6, -7, 7, 3.5, 'rgba(255,255,255,0.35)', -0.3);
    // 집게
    const snap = Math.sin(time * 8 + c.wob) * 0.25;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * 20, -6); ctx.rotate(side * (-0.5 + snap));
      ell(side * 8, -4, 10, 8, P.dark); ell(side * 8, -5, 8.5, 6.5, P.claw);
      ctx.strokeStyle = P.dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(side * 6, -5); ctx.lineTo(side * 15, -5); ctx.stroke();
      ctx.restore();
    }
    // 눈자루 + 눈
    for (const side of [-1, 1]) {
      ctx.strokeStyle = P.dark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(side * 6, -10); ctx.lineTo(side * 7, -20); ctx.stroke();
      if (c.hurt > 0) {
        ctx.strokeStyle = '#2b2420'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(side * 7, -23, 4, time * 12, time * 12 + 5); ctx.stroke();
      } else {
        circle(side * 7, -23, 5.5, '#fff');
        circle(side * 7 + c.dir * 1.5, -23, 2.8, '#2b2420');
      }
    }
    if (c.type === 'angry' && c.hurt <= 0) {
      ctx.strokeStyle = '#2b2420'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-12, -31); ctx.lineTo(-3, -27); ctx.moveTo(12, -31); ctx.lineTo(3, -27); ctx.stroke();
      if (c.chasing >= 0) text('!', 18, -36, 18, '#e53935', 'center', '#fff', 4);
    }
    ctx.strokeStyle = '#2b2420'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (c.type === 'angry') { ctx.moveTo(-5, 5); ctx.lineTo(5, 5); } else ctx.arc(0, 2, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
    if (c.type === 'gold') {
      const sp = (Math.sin(time * 7 + c.wob) + 1) / 2;
      drawSparkle(18, -24, 4 + sp * 4); drawSparkle(-20, 8, 3 + (1 - sp) * 4);
    }
    ctx.restore();
  }
  function drawJelly(c, time) {
    const b = Math.sin(time * 3 + c.wob) * 2;
    ctx.save(); ctx.translate(c.x, c.y + b);
    ell(0, 18, 20, 6, 'rgba(120,80,30,0.15)');
    ctx.strokeStyle = 'rgba(186,104,200,0.75)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 6, 2);
      ctx.quadraticCurveTo(i * 6 + Math.sin(time * 4 + i) * 5, 12, i * 6 + Math.sin(time * 4 + i + 1) * 4, 20); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(206,147,216,0.85)';
    ctx.beginPath(); ctx.arc(0, 0, 20, Math.PI, 0); ctx.quadraticCurveTo(10, 6, 0, 3); ctx.quadraticCurveTo(-10, 6, -20, 0); ctx.fill();
    ell(-7, -9, 6, 3, 'rgba(255,255,255,0.55)', -0.4);
    circle(-6, -3, 2.2, '#4a2a55'); circle(6, -3, 2.2, '#4a2a55');
    ctx.strokeStyle = '#ff5c8a'; ctx.lineWidth = 2;
    // 경고 번개
    const blink = Math.sin(time * 6) > 0;
    if (blink) { ctx.strokeStyle = '#ffe14d'; ctx.beginPath(); ctx.moveTo(22, -16); ctx.lineTo(17, -8); ctx.lineTo(23, -8); ctx.lineTo(18, 0); ctx.stroke(); }
    ctx.restore();
  }
  function drawSparkle(x, y, r) {
    ctx.fillStyle = '#fffbe0';
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  }

  // ---- 캐릭터 + 뿅망치 ----
  function drawPlayer(p, col, time, isMe) {
    const moving = Math.hypot(p.vx, p.vy) > 30;
    const bob = moving ? Math.abs(Math.sin(time * 14)) * 3 : Math.sin(time * 3) * 1;
    const f = p.face;
    ctx.save(); ctx.translate(p.x, p.y);
    ell(0, 16, 20, 7, 'rgba(120,80,30,0.25)');
    // 다리
    const st = moving ? Math.sin(time * 14) * 4 : 0;
    ctx.fillStyle = '#ffd7b0'; rr(-9 + st, 4 - bob, 7, 13, 3); ctx.fill(); rr(2 - st, 4 - bob, 7, 13, 3); ctx.fill();
    ctx.fillStyle = '#4a90d9'; rr(-11, -2 - bob, 22, 10, 4); ctx.fill(); // 반바지
    // 몸
    ctx.fillStyle = col.shirt; rr(-13, -24 - bob, 26, 24, 9); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-13, -16 - bob, 26, 4);
    // 머리
    circle(0, -38 - bob, 16, '#ffd7b0');
    ctx.fillStyle = '#6b4226'; ctx.beginPath(); ctx.arc(-f * 4, -42 - bob, 13, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
    // 밀짚모자
    ell(0, -48 - bob, 24, 7, '#f2cf73'); ctx.fillStyle = '#f7dc8c'; rr(-12, -62 - bob, 24, 15, 8); ctx.fill();
    ctx.fillStyle = col.shirt; ctx.fillRect(-12, -52 - bob, 24, 4);
    // 얼굴
    circle(f * 6, -37 - bob, 2.6, '#2b2420');
    if (p.lock > 0) { text('><', f * 4, -36 - bob, 12, '#2b2420'); }
    ell(f * 2, -31 - bob, 3.5, 2, 'rgba(255,120,120,0.5)');
    ctx.restore();
    drawHammer(p, col, time, bob);
    if (p.lock > 0) {
      // 집게에 물린 표시
      ctx.save(); ctx.translate(p.x + p.face * 20, p.y - 30);
      ctx.rotate(Math.sin(time * 30) * 0.2);
      ell(0, 0, 9, 7, '#e53935'); ctx.strokeStyle = '#8e1c1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.restore();
    }
    if (isMe) {
      const yy = p.y - 84 + Math.sin(time * 5) * 3;
      ctx.fillStyle = col.shirt;
      ctx.beginPath(); ctx.moveTo(p.x - 6, yy + 7); ctx.lineTo(p.x + 6, yy + 7); ctx.lineTo(p.x, yy + 14); ctx.fill();
      rr(p.x - 18, yy - 9, 36, 18, 8); ctx.fill();
      text('나', p.x, yy, 14, '#fff');
    }
  }
  function drawHammer(p, col, time, bob) {
    // 각도: 대기 = 어깨 위로 든 상태, 휘두르면 앞으로 내려침
    let a, swingK = 0;
    const aim = Math.atan2(p.aimY, p.aimX);
    const restA = p.face > 0 ? -Math.PI / 2 - 0.6 : -Math.PI / 2 + 0.6;
    if (p.swing >= 0) {
      const t = p.swing;
      if (t < SWING.impact) { swingK = t / SWING.impact; a = lerp(restA - p.face * 0.5, aim, ease(swingK)); }
      else { a = aim; swingK = 1; }
    } else a = restA + Math.sin(time * 3) * 0.05;
    const sx = p.x + p.face * 10, sy = p.y - 18 - bob;
    const len = p.swing >= 0 && p.swing >= SWING.impact ? PLAYER.reach - 4 : 34;
    const hx = sx + Math.cos(a) * len, hy = sy + Math.sin(a) * len;
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
    circle(sx, sy, 5, '#ffd7b0');
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a + Math.PI / 2);
    const sq = p.swing >= SWING.impact && p.swing < SWING.impact + 0.08 ? 0.75 : 1;
    ctx.scale(1, sq);
    rr(-17, -11, 34, 22, 9); ctx.fillStyle = '#ff4d6d'; ctx.fill();
    ctx.fillStyle = '#ffe14d'; rr(-17, -11, 8, 22, 4); ctx.fill(); rr(9, -11, 8, 22, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; rr(-8, -8, 14, 5, 2); ctx.fill();
    ctx.restore();
  }

  // ---- 이펙트 ----
  let particles = [], popups = [], rings = [], shake = 0, banner = null, flashT = 0;
  function burst(x, y, n, colors, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = (0.3 + Math.random()) * (spd || 200);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 0, life: 0.4 + Math.random() * 0.4, r: 2 + Math.random() * 3.5, c: colors[(Math.random() * colors.length) | 0], g: 500 });
    }
  }
  function popup(x, y, str, color, size) { popups.push({ x, y, str, c: color, size: size || 28, t: 0 }); }
  function updateFx(dt) {
    for (const p of particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; }
    particles = particles.filter(p => p.t < p.life);
    for (const p of popups) p.t += dt; popups = popups.filter(p => p.t < 0.9);
    for (const r of rings) r.t += dt; rings = rings.filter(r => r.t < 0.3);
    shake = Math.max(0, shake - dt * 30); flashT = Math.max(0, flashT - dt);
    if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
  }
  function drawFx() {
    for (const r of rings) {
      const k = r.t / 0.3;
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; ctx.lineWidth = 5 * (1 - k);
      ctx.beginPath(); ctx.ellipse(r.x, r.y + 6, 14 + k * 34, (14 + k * 34) * 0.45, 0, 0, 7); ctx.stroke();
    }
    for (const p of particles) { ctx.globalAlpha = 1 - p.t / p.life; circle(p.x, p.y, p.r, p.c); }
    ctx.globalAlpha = 1;
    for (const p of popups) {
      const k = p.t / 0.9, sc = p.t < 0.12 ? backOut(p.t / 0.12) : 1;
      ctx.save(); ctx.globalAlpha = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
      ctx.translate(p.x, p.y - ease(k) * 50); ctx.scale(sc, sc);
      text(p.str, 0, 0, p.size, p.c, 'center', '#fff', 6); ctx.restore();
    }
  }

  /* =========================================================
   * 5. 화면 상태 · UI
   * ========================================================= */
  let screen = 'title', game = null, result = null;
  let diff = Store.get('diff', 'normal'); if (!AI_DIFF[diff]) diff = 'normal';
  Sound.on = Store.get('sound', true);
  let pressedBtn = null, demoCrabs = [], demoT = 0;
  const BTN = {
    classic: { x: 70, y: 430, w: 400, h: 90 },
    versus:  { x: 70, y: 540, w: 400, h: 90 },
    easy:    { x: 70, y: 670, w: 126, h: 50 },
    normal:  { x: 207, y: 670, w: 126, h: 50 },
    hard:    { x: 344, y: 670, w: 126, h: 50 },
    retry:   { x: 110, y: 690, w: 320, h: 72 },
    home:    { x: 110, y: 774, w: 320, h: 60 },
    sound:   { x: W - 64, y: 104, w: 44, h: 44 },
    hammer:  { cx: W - 92, cy: 878, r: 64 }
  };
  const inRect = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const inCircle = (p, b) => dist(p.x, p.y, b.cx, b.cy) <= b.r + 8;

  function startGame(mode) {
    game = createGame(mode, diff);
    screen = 'game'; particles = []; popups = []; rings = []; banner = null;
  }
  function onOver(g) {
    Sound.stopBgm();
    const me = g.players[0];
    const key = g.mode === 'classic' ? 'best.classic' : 'best.versus.' + g.diff;
    const best = Store.get(key, 0), isNew = me.score > best;
    if (isNew) Store.set(key, me.score);
    let outcome = null;
    if (g.mode === 'versus') {
      const ai = g.players[1].score;
      outcome = me.score > ai ? 'win' : me.score < ai ? 'lose' : 'draw';
      if (outcome === 'win') Store.set('wins.' + g.diff, Store.get('wins.' + g.diff, 0) + 1);
    }
    result = { g, isNew, best: Math.max(best, me.score), t: 0, stamped: false, outcome, rank: g.mode === 'classic' ? rankFor(me.score) : null };
    screen = 'result';
  }
  function handleEvents(g) {
    for (const e of g.events) {
      const col = PCOL[e.p] || PCOL[0];
      switch (e.type) {
        case 'swing': Sound.play('swing'); break;
        case 'bonk': rings.push({ x: e.x, y: e.y, t: 0 }); burst(e.x, e.y + 6, 6, ['#f7dfa8', '#e9c88a'], 120); break;
        case 'whiff': if (e.p === 0) Sound.play('whiff'); break;
        case 'kill':
          Sound.play('bonk'); Sound.play(e.tt === 'gold' ? 'gold' : 'kill', { mult: e.mult });
          burst(e.x, e.y, e.tt === 'gold' ? 22 : 12, e.tt === 'gold' ? ['#ffd23f', '#fff6b0', '#ffb300'] : ['#ff7043', '#ffd7b0', '#fff', '#ffab91'], 240);
          popup(e.x, e.y - 30, '+' + e.pts, e.p === 0 ? (e.tt === 'gold' ? '#e0a800' : '#ff6b3d') : PCOL[1].shirt, e.tt === 'gold' ? 40 : 30 + (e.mult - 1) * 4);
          if (e.p === 0) shake = Math.max(shake, e.tt === 'gold' ? 8 : 4 + e.mult);
          break;
        case 'shell': Sound.play('bonk'); Sound.play('shell'); burst(e.x, e.y - 8, 14, ['#f3c7a1', '#ffd8e2', '#c98f63'], 260); popup(e.x, e.y - 30, '껍데기 깨짐!', '#c98f63', 20); break;
        case 'jelly': Sound.play('jelly'); burst(e.x, e.y, 16, ['#ce93d8', '#ffe14d', '#fff'], 220); popup(e.x, e.y - 30, '찌릿! -3', '#9c27b0', 30); if (e.p === 0) { shake = 10; flashT = 0.12; } break;
        case 'pinch': Sound.play('pinch'); popup(e.x, e.y - 70, '아야!', '#e53935', 28); if (e.p === 0) shake = 7; break;
        case 'beep': Sound.play('beep'); break;
        case 'go': Sound.play('go'); Sound.startBgm(); banner = { str: '꽃게를 잡아라!', t: 0, dur: 0.9, c: '#ff6b3d' }; break;
        case 'tick': Sound.play('tick'); break;
        case 'timeup': Sound.play('timeup'); Sound.stopBgm(); banner = { str: '그만!', t: 0, dur: 1.3, c: '#2bb3d9' }; break;
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
    ctx.fillStyle = '#4a3a2a';
    ctx.beginPath(); ctx.moveTo(cx - 8, cy - 5); ctx.lineTo(cx - 2, cy - 5); ctx.lineTo(cx + 6, cy - 12); ctx.lineTo(cx + 6, cy + 12); ctx.lineTo(cx - 2, cy + 5); ctx.lineTo(cx - 8, cy + 5); ctx.fill();
    ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (Sound.on) { ctx.beginPath(); ctx.arc(cx + 8, cy, 7, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 8, cy, 13, -0.8, 0.8); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(cx + 11, cy - 7); ctx.lineTo(cx + 22, cy + 7); ctx.moveTo(cx + 22, cy - 7); ctx.lineTo(cx + 11, cy + 7); ctx.stroke(); }
  }

  function drawField(g, time) {
    // 깊이 정렬(아래쪽이 앞)
    const items = [];
    for (const c of g.crabs) items.push({ y: c.y, f: () => drawCrab(c, time) });
    g.players.forEach((p, i) => items.push({ y: p.y + 4, f: () => drawPlayer(p, PCOL[i], time, p.ctrl === 'player') }));
    items.sort((a, b) => a.y - b.y).forEach(it => it.f());
    drawFx();
  }

  function drawHUD(g, time) {
    rr(16, 12, W - 32, 84, 24); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ffd08a'; ctx.stroke();
    const me = g.players[0];
    text('나', 80, 34, 18, '#8a6a4a');
    text(String(me.score), 80, 68, 38, PCOL[0].shirt, 'center', '#fff', 4);
    if (g.mode === 'versus') {
      text('AI · ' + AI_DIFF[g.diff].label, W - 88, 34, 17, '#8a6a4a');
      text(String(g.players[1].score), W - 88, 68, 38, PCOL[1].shirt, 'center', '#fff', 4);
    } else {
      text('최고', W - 88, 34, 18, '#8a6a4a');
      text(String(Store.get('best.classic', 0)), W - 88, 68, 32, '#2ec4b6');
    }
    const cx = W / 2, cy = 54, r = 32, k = g.timeLeft / GAME_TIME;
    circle(cx, cy, r, '#fff3dc');
    ctx.strokeStyle = g.timeLeft <= 5 ? '#ff4f6d' : '#2bb3d9'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    const pul = g.timeLeft <= 5 && g.phase === 'play' ? 1 + Math.max(0, Math.sin(time * 12)) * 0.12 : 1;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(pul, pul); text(String(Math.ceil(g.timeLeft)), 0, 2, 32, g.timeLeft <= 5 ? '#ff4f6d' : '#3b2a20'); ctx.restore();
    // 콤보
    if (me.combo >= 2) {
      const mult = me.combo >= 10 ? 3 : me.combo >= 5 ? 2 : 1;
      rr(24, 104, 150, 36, 18); ctx.fillStyle = mult === 3 ? '#ff4f6d' : mult === 2 ? '#ff9f1c' : 'rgba(255,255,255,0.85)'; ctx.fill();
      text(me.combo + ' 콤보' + (mult > 1 ? ' ×' + mult : ''), 99, 123, 20, mult > 1 ? '#fff' : '#ff6b3d');
    }
    drawSoundBtn();
  }

  function drawHammerBtn(g, time) {
    const b = BTN.hammer, me = g.players[0];
    const ready = g.phase === 'play' && me.lock <= 0 && me.swing < 0;
    const press = hammerHeld ? 5 : 0;
    ell(b.cx, b.cy + b.r - 4, b.r * 0.95, 14, 'rgba(160,100,30,0.25)');
    circle(b.cx, b.cy + 7, b.r, ready ? '#c4385a' : '#b8a48f');
    const gr = ctx.createRadialGradient(b.cx - 18, b.cy - 22 + press, 8, b.cx, b.cy + press, b.r);
    gr.addColorStop(0, ready ? '#ff9db3' : '#e9ddd0'); gr.addColorStop(1, ready ? '#ff4d6d' : '#cbbba8');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.cx, b.cy + press, b.r, 0, 7); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
    if (me.lock > 0) {
      ctx.strokeStyle = '#e53935'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(b.cx, b.cy + press, b.r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (me.lock / PINCH_LOCK)); ctx.stroke();
    }
    // 아이콘
    ctx.save(); ctx.translate(b.cx, b.cy - 8 + press); ctx.rotate(-0.5);
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 26); ctx.stroke();
    rr(-17, -14, 34, 22, 9); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
    text(me.lock > 0 ? '물렸다!' : '쾅!', b.cx, b.cy + 30 + press, 20, '#fff', 'center', 'rgba(0,0,0,0.25)', 5);
  }

  function drawGameScreen(g, time) {
    drawField(g, time);
    drawHUD(g, time);
    rr(24, 818, W - 200, 116, 20); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    text('끌어서 이동 · 톡 치면 쾅!', 24 + (W - 200) / 2, 846, 19, '#5a3a24');
    text('PC: 방향키 이동, 스페이스 쾅', 24 + (W - 200) / 2, 874, 16, '#8a6a4a');
    text('해파리는 치지 마세요 ⚡', 24 + (W - 200) / 2, 902, 16, '#9c27b0');
    drawHammerBtn(g, time);
    if (g.phase === 'countdown') {
      const n = Math.ceil(g.countdown), k = 1 - (g.countdown - Math.floor(g.countdown));
      ctx.save(); ctx.translate(W / 2, 420); const s = backOut(Math.min(1, k * 2.5)); ctx.scale(s, s);
      text(String(n), 0, 0, 140, '#fff', 'center', '#ff6b3d', 16); ctx.restore();
      text(g.mode === 'classic' ? '30초 동안 꽃게를 최대한 많이!' : 'AI보다 먼저 꽃게를 잡아라!', W / 2, 520, 26, '#5a3a24', 'center', '#fff', 6);
    }
    if (banner) {
      const k = banner.t / banner.dur, s = backOut(Math.min(1, banner.t / 0.25));
      ctx.save(); ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      ctx.translate(W / 2, 440); ctx.scale(s, s); ctx.rotate(-0.05);
      text(banner.str, 0, 0, 66, '#fff', 'center', banner.c, 13); ctx.restore();
    }
  }

  function drawTitle(time, dt) {
    demoT -= dt;
    if (demoT <= 0) {
      demoT = 0.9 + Math.random() * 0.8;
      const types = ['crab', 'crab', 'fast', 'hermit', 'gold', 'angry', 'jelly'];
      const ty = types[(Math.random() * types.length) | 0], fromLeft = Math.random() < 0.5;
      demoCrabs.push({ type: ty, r: TYPES[ty].r, x: fromLeft ? -30 : W + 30, y: 300 + Math.random() * 460, dir: fromLeft ? 1 : -1, speed: TYPES[ty].speed, pause: 0, wob: Math.random() * 6, hurt: 0, chasing: -1, shell: ty === 'hermit' });
    }
    for (const c of demoCrabs) { c.x += c.dir * c.speed * dt; c.wob += dt; }
    demoCrabs = demoCrabs.filter(c => c.x > -60 && c.x < W + 60);
    demoCrabs.slice().sort((a, b) => a.y - b.y).forEach(c => drawCrab(c, time));
    ctx.fillStyle = 'rgba(255,248,230,0.45)'; ctx.fillRect(-offX / scale, 240, vw / scale, 560);
    const bounce = Math.sin(time * 2.4) * 5;
    ctx.save(); ctx.translate(W / 2, 290 + bounce); ctx.rotate(-0.035);
    rr(-215, -86, 430, 168, 36); ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#ff9f80'; ctx.stroke();
    text('꽃게 망치', 0, -18, 74, '#ff6b3d', 'center', '#7a2e12', 12);
    text('CRAB BONK', 0, 46, 28, '#2bb3d9', 'center', '#fff', 6);
    drawCrab({ type: 'crab', r: 21, x: -180, y: -78, dir: 1, speed: 0, pause: 1, wob: 0, hurt: 0, chasing: -1 }, time);
    ctx.restore();
    drawButton(BTN.classic, '클래식 30초', '최고 ' + Store.get('best.classic', 0) + '점 · S랭크에 도전!', '#ff9a6b', '#f0602e', pressedBtn === 'classic');
    drawButton(BTN.versus, 'AI 대결', 'AI보다 먼저 꽃게를 잡아라 · ' + AI_DIFF[diff].label + ' 승리 ' + Store.get('wins.' + diff, 0) + '회', '#5fcbe8', '#2192c7', pressedBtn === 'versus');
    text('AI 대결 난이도', W / 2, 654, 17, '#6a5040');
    for (const k of ['easy', 'normal', 'hard']) {
      const b = BTN[k], on = diff === k;
      rr(b.x, b.y, b.w, b.h, 25); ctx.fillStyle = on ? '#4a3a2a' : 'rgba(255,255,255,0.9)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = on ? '#4a3a2a' : '#e3c4a2'; ctx.stroke();
      text(AI_DIFF[k].label, b.x + b.w / 2, b.y + b.h / 2 + 1, 21, on ? '#fff' : '#8a6a4a');
    }
    rr(30, 818, W - 60, 116, 20); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    text('옆으로 걷는 꽃게를 쫓아가 뿅망치로 쾅!', W / 2, 846, 19, '#5a3a24');
    text('꽃게 1 · 파란 꽃게 2 · 소라게 3(두 번) · 황금 꽃게 5', W / 2, 876, 16, '#8a6a4a');
    text('성난 꽃게는 망치를 물어요 · 해파리는 -3점!', W / 2, 904, 16, '#c0563a');
    drawSoundBtn();
  }

  function drawResult(time, dt) {
    const r = result, g = r.g, me = g.players[0];
    r.t += dt;
    ctx.fillStyle = 'rgba(30,40,50,' + Math.min(0.45, r.t) + ')';
    ctx.fillRect(-offX / scale, -offY / scale, vw / scale, vh / scale);
    const k = backOut(Math.min(1, r.t / 0.4));
    ctx.save(); ctx.translate(W / 2, 500); ctx.scale(k, k); ctx.translate(-W / 2, -500);
    rr(40, 160, W - 80, 690, 32); ctx.fillStyle = '#fffaf2'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#ff9f80'; ctx.stroke();
    const shown = v => Math.round(v * ease(clamp((r.t - 0.3) / 0.8, 0, 1)));
    if (g.mode === 'classic') {
      text('결과 발표', W / 2, 212, 34, '#7a2e12');
      text('점수', W / 2, 262, 22, '#a0704a');
      text(String(shown(me.score)), W / 2, 324, 86, '#ff6b3d', 'center', '#fff', 8);
      const st = r.t - 1.2;
      if (st > 0) {
        if (!r.stamped) { r.stamped = true; Sound.play('stamp'); setTimeout(() => Sound.play(r.rank.r === 'S' || r.rank.r === 'A' ? 'win' : 'lose'), 200); shake = 8; }
        const s = st < 0.25 ? lerp(2.4, 1, ease(st / 0.25)) : 1;
        ctx.save(); ctx.translate(W - 125, 300); ctx.rotate(-0.25); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, st * 5);
        ctx.strokeStyle = r.rank.color; ctx.lineWidth = 6; rr(-50, -56, 100, 112, 18); ctx.stroke();
        ctx.fillStyle = r.rank.color; rr(-50, -56, 100, 30, 18); ctx.fill(); ctx.fillRect(-50, -40, 100, 14);
        text('랭크', 0, -41, 20, '#fff'); text(r.rank.r, 0, 16, 66, r.rank.color);
        ctx.restore();
      }
    } else {
      const ai = g.players[1];
      const st = r.t - 1.1;
      if (st > 0 && !r.stamped) { r.stamped = true; Sound.play(r.outcome === 'win' ? 'win' : 'lose'); shake = 6; }
      const label = r.outcome === 'win' ? '승리!' : r.outcome === 'lose' ? '아쉬운 패배' : '무승부';
      const c = r.outcome === 'win' ? '#ff6b3d' : r.outcome === 'lose' ? '#2bb3d9' : '#8a6a4a';
      if (st > 0) { const s = backOut(clamp(st / 0.3, 0, 1)); ctx.save(); ctx.translate(W / 2, 212); ctx.scale(s, s); text(label, 0, 0, 50, '#fff', 'center', c, 12); ctx.restore(); }
      text('나', 160, 270, 22, PCOL[0].dark); text('AI', W - 160, 270, 22, PCOL[1].dark);
      text(String(shown(me.score)), 160, 330, 74, PCOL[0].shirt, 'center', '#fff', 7);
      text(String(shown(ai.score)), W - 160, 330, 74, PCOL[1].shirt, 'center', '#fff', 7);
      text('VS', W / 2, 330, 30, '#c9b8a3');
    }
    const rows = [
      ['잡은 꽃게', me.kills + '마리'],
      ['황금 꽃게', me.golds + '마리'],
      ['최대 콤보', me.maxCombo + '회'],
      ['해파리 실수 · 물린 횟수', me.jellies + '번 · ' + me.pinches + '번'],
      [g.mode === 'classic' ? '최고 점수' : '최고 점수 (' + AI_DIFF[g.diff].label + ')', r.best + '점' + (r.isNew ? ' 신기록!' : '')]
    ];
    rows.forEach((row, i) => {
      const y = 420 + i * 40;
      text(row[0], 86, y, 21, '#8a6a4a', 'left');
      text(row[1], W - 86, y, 22, i === 4 && r.isNew ? '#ff4f6d' : '#3b2a20', 'right');
    });
    if (r.rank) {
      const nxt = RANKS.slice().reverse().find(x => x.min > me.score);
      text(nxt ? nxt.r + '랭크까지 ' + (nxt.min - me.score) + '점!' : '최고 랭크 달성!', W / 2, 640, 21, '#2ec4b6');
    }
    drawButton(BTN.retry, '한 판 더', null, '#ff9a6b', '#f0602e', pressedBtn === 'retry');
    drawButton(BTN.home, '처음으로', null, '#c9b8a3', '#a8957f', pressedBtn === 'home', 24);
    ctx.restore();
  }

  /* =========================================================
   * 6. 입력 — 끌면 이동, 톡 치면 쾅
   * ========================================================= */
  function toLogical(e) { return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale }; }
  let fieldPtr = null, hammerHeld = false;
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault(); Sound.ensure(); Sound.startWaves();
    const p = toLogical(e);
    if (screen !== 'result' && inRect(p, BTN.sound)) {
      Sound.setOn(!Sound.on); Store.set('sound', Sound.on);
      if (!Sound.on) Sound.stopBgm(); else if (screen === 'game' && game && game.phase === 'play') Sound.startBgm();
      return;
    }
    if (screen === 'title') {
      for (const k of ['classic', 'versus', 'easy', 'normal', 'hard']) if (inRect(p, BTN[k])) pressedBtn = k;
      if (pressedBtn && AI_DIFF[pressedBtn]) { diff = pressedBtn; Store.set('diff', diff); Sound.play('click'); pressedBtn = null; }
    } else if (screen === 'result') {
      if (result.t < 1.2) return;
      if (inRect(p, BTN.retry)) pressedBtn = 'retry'; else if (inRect(p, BTN.home)) pressedBtn = 'home';
    } else if (screen === 'game') {
      if (inCircle(p, BTN.hammer)) { hammerHeld = true; startSwing(game, 0); return; }
      if (fieldPtr) return;
      fieldPtr = { id: e.pointerId, sx: p.x, sy: p.y, t: performance.now(), moving: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (screen !== 'game' || !fieldPtr || e.pointerId !== fieldPtr.id) return;
    const p = toLogical(e);
    if (!fieldPtr.moving && (dist(p.x, p.y, fieldPtr.sx, fieldPtr.sy) > 12 || performance.now() - fieldPtr.t > 160)) fieldPtr.moving = true;
    if (fieldPtr.moving) { game.input.has = true; game.input.mx = p.x; game.input.my = p.y - 10; }
  });
  function endField(e, cancel) {
    if (!fieldPtr || (e && e.pointerId !== fieldPtr.id)) return;
    const quick = !fieldPtr.moving && performance.now() - fieldPtr.t < 260;
    fieldPtr = null; if (game) game.input.has = false;
    if (quick && !cancel && game) startSwing(game, 0);
  }
  canvas.addEventListener('pointerup', function (e) {
    e.preventDefault();
    if (screen === 'game') { hammerHeld = false; endField(e, false); return; }
    if (!pressedBtn) return;
    const b = pressedBtn, p = toLogical(e); pressedBtn = null;
    if (!inRect(p, BTN[b])) return;
    Sound.play('click');
    if (b === 'classic' || b === 'versus') startGame(b);
    else if (b === 'retry') startGame(result.g.mode);
    else if (b === 'home') screen = 'title';
  });
  canvas.addEventListener('pointercancel', function (e) { pressedBtn = null; hammerHeld = false; endField(e, true); });
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
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ') {
      e.preventDefault(); if (e.repeat) return; Sound.ensure(); Sound.startWaves();
      if (screen === 'game') { hammerHeld = true; startSwing(game, 0); }
      else if (screen === 'title') { Sound.play('click'); startGame('classic'); }
      else if (screen === 'result' && result.t > 1.2) { Sound.play('click'); startGame(result.g.mode); }
    }
  });
  window.addEventListener('keyup', function (e) {
    if (KEYMAP[e.code]) { keys[e.code] = false; syncKeys(); }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ') hammerHeld = false;
  });
  window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; syncKeys(); endField(null, true); });

  let hidden = false;
  document.addEventListener('visibilitychange', function () {
    hidden = document.hidden;
    if (hidden) { Sound.stopBgm(); Sound.stopWaves(); }
    else { Sound.startWaves(); if (screen === 'game' && game && game.phase === 'play') Sound.startBgm(); }
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
      let rem = dt; while (rem > 0) { const s = Math.min(1 / 60, rem); step(game, s); rem -= s; }
      handleEvents(game);
    }
    updateFx(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (offX + sx * scale), dpr * (offY + sy * scale));
    drawBeach(clock);
    if (screen === 'title') drawTitle(clock, dt);
    else if (screen === 'game') drawGameScreen(game, clock);
    else if (screen === 'result') { drawField(result.g, clock); drawHUD(result.g, clock); drawResult(clock, dt); }
    if (flashT > 0) { ctx.fillStyle = 'rgba(255,240,120,' + flashT * 3 + ')'; ctx.fillRect(-offX / scale, -offY / scale, vw / scale, vh / scale); }
  }
  if (document.fonts && document.fonts.load) {
    Promise.race([document.fonts.load('40px "Jua"'), new Promise(r => setTimeout(r, 1500))]).then(() => requestAnimationFrame(frame), () => requestAnimationFrame(frame));
  } else requestAnimationFrame(frame);
})();
