/* 탁! 알까기 — 게임 진행·그리기·효과음 (4차: 연출·사운드·모바일 다듬기) */
(function () {
  const { P, Physics, Input, AI, Themes } = window.Alk;
  const $ = (id) => document.getElementById(id);

  const cv = $('cv');
  const mainCtx = cv.getContext('2d');
  let ctx = mainCtx;                 // 판 캐시를 그릴 때 잠시 바꿔 끼움
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PAD = 44;                  // 판 바깥 여유(떨어지는 연출 공간)
  const VIEW = P.BOARD + PAD * 2;
  const NAME = { black: '흑', white: '백' };
  const OTHER = { black: 'white', white: 'black' };

  const view = { s: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
  const G = {
    state: 'menu',            // menu | aim | ai | moving | result
    mode: 'ai',               // ai | pvp
    players: { black: 'human', white: 'ai' },
    ai: null,                 // { job, phase: think|aim, t, choice, shot }
    world: null,
    turn: 'black',
    selected: null,
    opts: { count: 5, bonus: false, guide: true, level: 3, first: 'me', theme: 'classic', sound: true, vibe: true },
    flash: [],                // 범퍼 번쩍임 타이머
    stats: null,              // { black: {shots, kills}, white: {...} }
    shake: 0,                 // 화면 흔들림 세기(월드 단위)
    trails: new Map(),        // 알 id → 최근 위치들
    tut: true,                // 처음 하는 사람용 손가락 안내
    idle: 0,
    fineLock: false,
    settleT: 0, moveT: 0, acc: 0,
    shot: null,
    time: 0,
  };

  /* ───────── 효과음 ───────── */
  const Sound = {
    ctx: null, noise: null, budget: 0,
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = G.opts.sound ? 1 : 0;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.04);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    },
    clack(vol, pitch = 1) {
      const c = this.ctx; if (!c || vol < 0.02 || this.budget <= 0) return;
      this.budget--;
      const t = c.currentTime;
      const src = c.createBufferSource(); src.buffer = this.noise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200 * pitch; bp.Q.value = 1.2;
      const g = c.createGain(); g.gain.value = Math.min(1, vol) * 0.9;
      src.connect(bp).connect(g).connect(this.master); src.start(t);
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 1900 * pitch;
      const og = c.createGain();
      og.gain.setValueAtTime(Math.min(1, vol) * 0.25, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.07);
    },
    fall() {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
      const g = c.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.33);
    },
    thunk(vol) {
      const c = this.ctx; if (!c || vol < 0.03 || this.budget <= 0) return;
      this.budget--;
      const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.08);
      const g = c.createGain();
      g.gain.setValueAtTime(Math.min(1, vol) * 0.45, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.11);
    },
    boing() {
      const c = this.ctx; if (!c || this.budget <= 0) return;
      this.budget--;
      const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.19);
    },
    plop() {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.18);
      const g = c.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.23);
    },
    setOn(on) { if (this.master) this.master.gain.value = on ? 1 : 0; },
    win() {
      const c = this.ctx; if (!c) return;
      [523, 659, 784, 1047].forEach((f, i) => {
        const t = c.currentTime + i * 0.11;
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.26);
      });
    },
  };

  // 진동 (지원하는 휴대폰에서만, 너무 잦지 않게)
  const Haptic = {
    last: 0,
    buzz(ms) {
      if (!G.opts.vibe || !navigator.vibrate) return;
      const n = performance.now();
      if (n - this.last < 70) return;
      this.last = n;
      try { navigator.vibrate(ms); } catch (_) {}
    },
  };

  /* ───────── 연출 효과 ───────── */
  const FX = { parts: [], rings: [], floats: [] };

  function burst(x, y, n, color, speed, life, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      FX.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: size * (0.6 + Math.random() * 0.7) });
    }
  }
  const ring = (x, y, r0, r1, life, color, width) => FX.rings.push({ x, y, r0, r1, life, max: life, color, width });
  const floatText = (x, y, text, color) => FX.floats.push({ x, y, text, color, life: 0.9, max: 0.9 });
  const clampB = (v) => Math.max(24, Math.min(P.BOARD - 24, v));

  function onEvent(e) {
    if (e.type === 'hit') {
      const k = Math.min(1, e.v / 900);
      Sound.clack(e.v / 700, 0.9 + Math.random() * 0.2);
      if (k > 0.08) {
        burst(e.x, e.y, 3 + Math.round(7 * k), '#fff6c8', 90 + 260 * k, 0.35, 3.2);
        ring(e.x, e.y, 6, 18 + 22 * k, 0.28, 'rgba(255,255,255,A)', 3);
        G.shake = Math.max(G.shake, 5 * k);
        if (k > 0.45) Haptic.buzz(12);
      }
    } else if (e.type === 'wall') {
      const k = Math.min(1, e.v / 800);
      Sound.thunk(e.v / 600);
      if (k > 0.1) {
        burst(e.x, e.y, 2 + Math.round(5 * k), '#e9c08a', 70 + 180 * k, 0.35, 3);
        G.shake = Math.max(G.shake, 3 * k);
      }
    } else if (e.type === 'bump') {
      Sound.boing(); G.flash[e.i] = 0.25;
      const c = G.world.bumpers[e.i];
      ring(c.x, c.y, c.r, c.r + 34, 0.4, 'rgba(255,230,90,A)', 5);
      burst(e.x, e.y, 8, '#fff27a', 260, 0.4, 3.5);
      Haptic.buzz(15);
    } else if (e.type === 'fall') {
      const water = Themes.get(G.opts.theme).style.water;
      if (e.hole) {
        Sound.plop();
        ring(e.x, e.y, 30, 6, 0.4, 'rgba(30,15,0,A)', 4);
      } else if (water) {
        Sound.plop();
        ring(e.x, e.y, 8, 40, 0.6, 'rgba(255,255,255,A)', 4);
        ring(e.x, e.y, 4, 26, 0.5, 'rgba(200,240,255,A)', 3);
        burst(e.x, e.y, 12, '#e6f7ff', 180, 0.5, 3.5);
      } else {
        Sound.fall();
        burst(e.x, e.y, 9, 'rgba(255,255,255,.8)', 120, 0.5, 5);
      }
      floatText(clampB(e.x), clampB(e.y), '아웃!', e.color === 'black' ? '#2b2b30' : '#ffffff');
      Haptic.buzz(28);
      updateHUD();
    }
  }

  function updateFX(dt) {
    for (const p of FX.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
    for (const r of FX.rings) r.life -= dt;
    for (const f of FX.floats) { f.y -= 40 * dt; f.life -= dt; }
    FX.parts = FX.parts.filter((p) => p.life > 0);
    FX.rings = FX.rings.filter((r) => r.life > 0);
    FX.floats = FX.floats.filter((f) => f.life > 0);
    G.shake = REDUCED ? 0 : Math.max(0, G.shake - dt * 30);

    // 빠르게 구르는 알의 꼬리
    for (const st of G.world ? G.world.stones : []) {
      let tr = G.trails.get(st.id);
      const sp = Math.hypot(st.vx, st.vy);
      if (st.alive && st.falling === 0 && sp > 160) {
        if (!tr) G.trails.set(st.id, (tr = []));
        tr.push({ x: st.x, y: st.y });
        if (tr.length > 9) tr.shift();
      } else if (tr) {
        tr.shift();
        if (!tr.length) G.trails.delete(st.id);
      }
    }
  }

  function drawTrails() {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [id, tr] of G.trails) {
      if (tr.length < 2) continue;
      const st = G.world.stones.find((x) => x.id === id);
      const col = st && st.color === 'black' ? '40,40,48' : '255,255,255';
      for (let i = 1; i < tr.length; i++) {
        const k = i / tr.length;
        ctx.strokeStyle = `rgba(${col},${0.28 * k})`;
        ctx.lineWidth = P.R * 1.5 * k;
        ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawFX() {
    for (const r of FX.rings) {
      const k = 1 - r.life / r.max;
      ctx.strokeStyle = r.color.replace('A', (r.life / r.max).toFixed(2));
      ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of FX.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of FX.floats) {
      const k = f.life / f.max;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `${30 + (1 - k) * 6}px Jua, sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = f.color === '#ffffff' ? 'rgba(60,40,20,.85)' : 'rgba(255,255,255,.9)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // 처음 하는 사람에게 '뒤로 당겼다 놓기'를 손가락 애니메이션으로 보여주기
  function drawCoach() {
    const mine = G.world.stones.filter((s) => s.alive && s.falling === 0 && s.color === G.turn);
    if (!mine.length) return;
    const s = mine.reduce((a, b) => (Math.abs(b.x - 300) < Math.abs(a.x - 300) ? b : a));
    const back = G.turn === 'black' ? 1 : -1;
    const ph = (G.time % 1.9) / 1.9;
    const pull = ph < 0.15 ? 0 : ph < 0.75 ? (ph - 0.15) / 0.6 : 1;
    const e = 1 - Math.pow(1 - pull, 2);
    const alpha = Math.min(1, G.idle - 0.8) * (ph > 0.85 ? (1 - ph) / 0.15 : 1);
    if (alpha <= 0) return;
    const fy = s.y + back * (P.R + 6 + e * 100);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setLineDash([6, 6]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.moveTo(s.x, s.y + back * P.R); ctx.lineTo(s.x, fy); ctx.stroke();
    ctx.setLineDash([]);
    // 발사 방향 화살표
    const ay = s.y - back * (P.R + 10 + e * 40);
    ctx.strokeStyle = 'rgba(255,138,61,.9)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(s.x, s.y - back * (P.R + 4)); ctx.lineTo(s.x, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x - 7, ay + back * 4); ctx.lineTo(s.x, ay - back * 6); ctx.lineTo(s.x + 7, ay + back * 4); ctx.stroke();
    // 손가락
    ctx.beginPath(); ctx.arc(s.x + 2, fy + 3, 14, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, fy, 14, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ff8a3d'; ctx.stroke();
    ctx.font = '28px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ty = fy + back * 36;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.strokeText('뒤로 당겼다 놓기!', s.x, ty);
    ctx.fillStyle = '#4a2e14'; ctx.fillText('뒤로 당겼다 놓기!', s.x, ty);
    ctx.restore();
  }

  function confetti() {
    const box = $('confetti');
    box.innerHTML = '';
    if (REDUCED) return;
    const cols = ['#ff8a3d', '#ffd640', '#4cd16b', '#6c8cff', '#ff5a6e', '#ffffff'];
    for (let i = 0; i < 40; i++) {
      const el = document.createElement('i');
      el.style.left = Math.random() * 100 + '%';
      el.style.background = cols[i % cols.length];
      el.style.animationDelay = Math.random() * 0.6 + 's';
      el.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
      el.style.setProperty('--rx', (Math.random() * 2 - 1) * 80 + 'px');
      el.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(el);
    }
  }

  /* ───────── 배치 ───────── */
  const gx = (i) => P.GRID_MARGIN + i * P.CELL;

  function rowXs(k) {
    // 홀수 개는 3칸 간격, 짝수 개는 4칸 간격으로 교차점 위에 가운데 정렬
    const gap = k % 2 ? 3 : 4;
    const xs = [];
    for (let j = 0; j < k; j++) xs.push(9 + (j - (k - 1) / 2) * gap);
    return xs;
  }

  function setup(n) {
    const w = Physics.createWorld(Themes.get(G.opts.theme));
    const back = Math.ceil(n / 2), front = n - back;
    for (const [color, by, fy] of [['black', 16, 13], ['white', 2, 5]]) {
      rowXs(back).forEach((i) => Physics.addStone(w, color, gx(i), gx(by)));
      rowXs(front).forEach((i) => Physics.addStone(w, color, gx(i), gx(fy)));
    }
    return w;
  }

  /* ───────── 게임 흐름 ───────── */
  // 화면에 보일 이름: AI 대결에선 '나'/'AI', 2인 대결에선 '흑'/'백'
  const who = (c) => (G.mode === 'ai' ? (G.players[c] === 'ai' ? 'AI' : '나') : NAME[c]);
  const isHuman = (c) => G.players[c] === 'human';

  function newGame(mode) {
    if (mode) G.mode = mode;
    G.players = G.mode === 'ai' ? { black: 'human', white: 'ai' } : { black: 'human', white: 'human' };
    G.world = setup(G.opts.count);
    G.turn = G.mode === 'ai' && G.opts.first === 'ai' ? 'white' : 'black';
    G.selected = null;
    G.acc = 0;
    G.stats = { black: { shots: 0, kills: 0 }, white: { shots: 0, kills: 0 } };
    FX.parts = []; FX.rings = []; FX.floats = []; G.trails.clear(); G.shake = 0;
    $('confetti').innerHTML = '';
    hide('menu'); hide('result');
    startTurn();
    G.flash = [];
    const th = Themes.get(G.opts.theme).name;
    toast(`${th} · ` + (G.mode === 'ai' ? (isHuman(G.turn) ? '내가 먼저!' : `AI(${AI.LEVELS[G.opts.level].name}) 먼저!`) : '흑 먼저!'));
  }

  function startTurn() {
    G.selected = null;
    G.idle = 0;
    if (isHuman(G.turn)) {
      G.state = 'aim';
      G.ai = null;
    } else {
      G.state = 'ai';
      G.ai = { job: AI.start(G.world, G.turn, G.opts.level), phase: 'think', t: 0, choice: null, shot: null };
    }
    updateHUD();
  }

  function aiUpdate(dt) {
    const A = G.ai;
    A.t += dt;
    if (A.phase === 'think') {
      AI.tick(A.job, 9);
      if (A.job.done && A.t > 0.6) {
        if (!A.job.result) { G.turn = OTHER[G.turn]; startTurn(); return; }
        A.choice = A.job.result;
        A.shot = AI.execute(A.choice, G.opts.level);
        A.stone = G.world.stones.find((s) => s.id === A.choice.id);
        A.phase = 'aim'; A.t = 0;
        updateHUD();
      }
    } else if (A.phase === 'aim') {
      if (A.t > 1.15) {
        const sh = A.shot, s = A.stone;
        G.state = 'aim';            // shoot()이 aim 상태에서만 동작
        shoot(s, sh.dx, sh.dy, sh.p);
        G.ai = null;
      } else updateGauge();
    }
  }

  // AI 조준 연출용 가짜 입력 상태 (보여주는 건 의도한 샷, 실제 발사엔 오차가 섞임)
  function aiAimState() {
    const A = G.ai;
    if (!A || A.phase !== 'aim') return null;
    const k = Math.min(1, A.t / 0.8);
    const e = 1 - Math.pow(1 - k, 3);
    const p = A.choice.p * e;
    const q = Math.pow(Math.max(0, (p - 0.01) / 0.99), 1 / 1.6);
    return {
      aiming: true, stone: A.stone, p, raw: 0.06 + 0.94 * q, cancel: p < 0.02,
      dx: Math.cos(A.choice.ang), dy: Math.sin(A.choice.ang), fine: false,
    };
  }

  function shoot(stone, dx, dy, p) {
    if (G.state !== 'aim' || !stone.alive) return;
    const v = P.MAX_SPEED * p;
    stone.vx = dx * v; stone.vy = dy * v;
    G.shot = {
      shooter: G.turn,
      own: Physics.count(G.world, G.turn),
      opp: Physics.count(G.world, OTHER[G.turn]),
    };
    G.selected = null;
    G.state = 'moving';
    G.settleT = 0; G.moveT = 0; G.acc = 0;
    if (G.stats) G.stats[G.turn].shots++;
    if (isHuman(G.turn) && G.tut) {
      G.tut = false;
      try { localStorage.setItem('alkkagi.tut', '1'); } catch (_) {}
    }
    Sound.clack(0.35 + p * 0.5, 0.8);
    burst(stone.x - dx * P.R, stone.y - dy * P.R, 5, 'rgba(255,255,255,.85)', 80 + 120 * p, 0.3, 3);
    Haptic.buzz(8);
    updateHUD();
  }

  function endTurn() {
    const me = G.shot.shooter, op = OTHER[me];
    const own = Physics.count(G.world, me), opp = Physics.count(G.world, op);
    const lostOwn = G.shot.own - own, lostOpp = G.shot.opp - opp;
    if (G.stats) G.stats[me].kills += Math.max(0, lostOpp);
    updateHUD();

    if (own === 0 && opp === 0) return finish(null);
    if (opp === 0) return finish(me);
    if (own === 0) return finish(op);

    const msgs = [];
    if (lostOpp >= 2) msgs.push(lostOpp === 2 ? '더블!' : lostOpp === 3 ? '트리플!' : '싹쓸이!');
    if (lostOpp > 0) msgs.push(`${who(op)} 알 ${lostOpp}개 탈락!`);
    if (lostOwn > 0) msgs.push(`앗, ${who(me)} 알 ${lostOwn}개 자멸`);

    if (G.opts.bonus && lostOpp > 0 && lostOwn === 0) {
      msgs.push('한 번 더!');
    } else {
      G.turn = op;
      msgs.push(G.mode === 'ai' ? (isHuman(op) ? '내 차례' : 'AI 차례') : `${NAME[op]} 차례`);
    }
    startTurn();
    toast(msgs.join(' · '));
  }

  function finish(winner) {
    G.state = 'result';
    G.ai = null;
    updateHUD();
    const b = Physics.count(G.world, 'black'), w = Physics.count(G.world, 'white');
    let title;
    if (!winner) title = '무승부!';
    else if (G.mode === 'ai') title = isHuman(winner) ? '이겼다!' : 'AI 승리…';
    else title = `${NAME[winner]} 승리!`;
    $('resultTitle').textContent = title;
    $('resultStone').className = 'bigstone ' + (winner || 'draw');
    $('resultSub').textContent = G.mode === 'ai'
      ? `AI ${AI.LEVELS[G.opts.level].name} · 남은 알 — 나 ${b}개 · AI ${w}개`
      : `남은 알 — 흑 ${b}개 · 백 ${w}개`;
    const st = G.stats;
    $('resultStats').textContent = st
      ? (G.mode === 'ai'
        ? `나 ${st.black.shots}번 쏴서 ${st.black.kills}개 · AI ${st.white.shots}번 쏴서 ${st.white.kills}개`
        : `흑 ${st.black.shots}번 쏴서 ${st.black.kills}개 · 백 ${st.white.shots}번 쏴서 ${st.white.kills}개`)
      : '';
    const cheer = winner && (G.mode === 'pvp' || isHuman(winner));
    setTimeout(() => {
      show('result');
      if (cheer) { Sound.win(); confetti(); Haptic.buzz([30, 60, 30]); }
    }, 450);
  }

  /* ───────── 입력 연결 ───────── */
  function toWorld(cx, cy) {
    const r = cv.getBoundingClientRect();
    return { x: (cx - r.left - view.ox) / view.s, y: (cy - r.top - view.oy) / view.s };
  }

  const input = Input.create(cv, {
    toWorld,
    canAim: () => G.state === 'aim' && isHuman(G.turn),
    pickStone(x, y, touch) {
      const lim = P.R * (touch ? 2.4 : 1.7);
      let best = null, bd = lim;
      for (const s of G.world.stones) {
        if (!s.alive || s.falling > 0 || s.color !== G.turn) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
    getSelected: () => (G.selected && G.selected.alive ? G.selected : null),
    setSelected: (s) => { G.selected = s; },
    fineLocked: () => G.fineLock,
    onShoot: shoot,
    onUpdate: updateGauge,
    onFirstInput: () => Sound.unlock(),
  });

  /* ───────── HUD ───────── */
  function updateHUD() {
    if (!G.world) return;
    $('cntBlack').textContent = Physics.count(G.world, 'black');
    $('cntWhite').textContent = Physics.count(G.world, 'white');
    $('hudBlack').classList.toggle('on', G.turn === 'black' && G.state !== 'result');
    $('hudWhite').classList.toggle('on', G.turn === 'white' && G.state !== 'result');
    $('turnDot').className = 'dot ' + G.turn;
    $('lblBlack').textContent = G.mode === 'ai' ? '나' : '흑';
    $('lblWhite').textContent = G.mode === 'ai' ? 'AI' : '백';
    let t;
    if (G.state === 'moving') t = '데구르르…';
    else if (G.state === 'ai') t = G.ai && G.ai.phase === 'aim' ? 'AI 조준 중' : 'AI 생각 중…';
    else if (G.mode === 'ai') t = isHuman(G.turn) ? '내 차례' : 'AI 차례';
    else t = `${NAME[G.turn]} 차례`;
    $('turnText').textContent = t;
    updateGauge();
  }

  function updateGauge() {
    const fill = $('gaugeFill'), txt = $('gaugeText');
    const ai = aiAimState();
    if (G.state === 'ai') {
      $('gauge').classList.remove('fine');
      if (ai) {
        fill.style.clipPath = `inset(0 ${100 - ai.p * 100}% 0 0)`;
        txt.textContent = `AI 조준 중 · 힘 ${Math.round(ai.p * 100)}%`;
      } else {
        fill.style.clipPath = 'inset(0 100% 0 0)';
        txt.textContent = `AI(${AI.LEVELS[G.opts.level].name})가 수를 읽는 중…`;
      }
      return;
    }
    const a = input.state();
    $('gauge').classList.toggle('fine', !!a.fine);
    if (a.aiming) {
      const pct = a.p * 100;
      fill.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      txt.textContent = a.cancel
        ? '놓으면 취소'
        : `힘 ${a.fine ? pct.toFixed(1) : Math.round(pct)}%${a.fine ? ' · 정밀' : ''}`;
    } else {
      fill.style.clipPath = 'inset(0 100% 0 0)';
      if (G.state === 'aim') {
        txt.textContent = G.selected
          ? '아무 데서나 뒤로 당겼다 놓기'
          : `${G.mode === 'ai' ? '내' : NAME[G.turn]} 알을 잡고 뒤로 당기세요`;
      } else if (G.state === 'moving') txt.textContent = '…';
      else txt.textContent = '';
    }
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('pop'), 1600);
  }
  const show = (id) => $(id).classList.remove('hidden');
  const hide = (id) => $(id).classList.add('hidden');

  /* ───────── 그리기 ───────── */
  function resize() {
    const r = $('stage').getBoundingClientRect();
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = r.width; view.h = r.height;
    cv.width = Math.round(r.width * view.dpr);
    cv.height = Math.round(r.height * view.dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    view.s = Math.min(r.width, r.height) / VIEW;
    view.ox = (r.width - VIEW * view.s) / 2 + PAD * view.s;
    view.oy = (r.height - VIEW * view.s) / 2 + PAD * view.s;
  }

  function rr(x, y, w, h, r) {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function rrect(x, y, w, h, r) { ctx.beginPath(); rr(x, y, w, h, r); }

  // 판 모양 경로 (여러 조각이면 이어지는 쪽을 늘려 둥근 모서리 틈을 없앤다)
  function boardPath(w, dy = 0) {
    ctx.beginPath();
    if (!w.regions) { rr(0, dy, P.BOARD, P.BOARD, 14); return; }
    for (const r of w.regions) {
      const top = w.regions.some((o) => o !== r && Math.abs(o.y + o.h - r.y) < 0.5) ? 12 : 0;
      const bot = w.regions.some((o) => o !== r && Math.abs(o.y - (r.y + r.h)) < 0.5) ? 12 : 0;
      rr(r.x, r.y - top + dy, r.w, r.h + top + bot, 12);
    }
  }

  function drawWater() {
    const g = ctx.createLinearGradient(0, -30, 0, 630);
    g.addColorStop(0, '#7cc9ef'); g.addColorStop(1, '#3e95cf');
    rrect(-30, -30, 660, 660, 26); ctx.fillStyle = g; ctx.fill();
    ctx.save(); rrect(-30, -30, 660, 660, 26); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let y = -10; y < 640; y += 38) {
      for (let x = -20 + ((y / 38) % 2) * 40; x < 640; x += 80) {
        const o = Math.sin(x * 0.05 + y) * 4;
        ctx.beginPath(); ctx.moveTo(x + o, y); ctx.quadraticCurveTo(x + 10 + o, y - 6, x + 20 + o, y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawDeco(th, live) {
    const st = th.style;
    if (live) {
      // 매 프레임 바뀌는 장식: 얼음 반짝임, 핀볼 전구
      if (st.deco === 'ice') {
        for (const d of th.dots.slice(9)) {
          const a = 0.35 + 0.35 * Math.sin(G.time * 2 + d.k * 9);
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.beginPath(); ctx.arc(d.x, d.y, 1.2 + d.r * 1.8, 0, Math.PI * 2); ctx.fill();
        }
      } else if (st.deco === 'pinball') {
        for (let i = 0; i < 24; i++) {
          const t = i / 24, side = i % 4;
          const p = t * 4 % 1 * (P.BOARD - 40) + 20;
          const x = side === 0 ? p : side === 1 ? P.BOARD - 10 : side === 2 ? P.BOARD - p : 10;
          const y = side === 0 ? 10 : side === 1 ? p : side === 2 ? P.BOARD - 10 : P.BOARD - p;
          const on = Math.sin(G.time * 4 + i) > 0;
          ctx.fillStyle = on ? 'rgba(255,230,120,.95)' : 'rgba(255,255,255,.25)';
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      return;
    }
    if (st.grain) {
      for (const l of th.grainLines) {
        ctx.beginPath();
        for (let x = 0; x <= P.BOARD; x += 12) {
          const y = l.y + Math.sin(x * l.f + l.ph) * l.a;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = st.grain.replace('A', l.o); ctx.lineWidth = l.w; ctx.stroke();
      }
    }
    if (st.deco === 'ice') {
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2;
      for (const d of th.dots.slice(0, 9)) {
        ctx.beginPath(); ctx.moveTo(d.x, d.y);
        let x = d.x, y = d.y;
        for (let k = 0; k < 4; k++) { x += (d.r - 0.5) * 50 + 14; y += (d.k - 0.5) * 50 - 6 + k * 4; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    } else if (st.deco === 'grass') {
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      for (let x = 0; x < P.BOARD; x += 120) ctx.fillRect(x, 0, 60, P.BOARD);
      for (const d of th.dots) {
        ctx.fillStyle = d.k > 0.5 ? 'rgba(255,255,255,.85)' : 'rgba(255,224,90,.9)';
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + d.r;
          ctx.beginPath(); ctx.arc(d.x + Math.cos(a) * 2.4, d.y + Math.sin(a) * 2.4, 1.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.arc(d.x, d.y, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawBoard() {
    const w = G.world, th = Themes.get(G.opts.theme), st = th.style;
    if (st.water) drawWater();
    // 그림자 + 옆면
    ctx.save();
    ctx.shadowColor = 'rgba(40,30,20,.35)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 14;
    boardPath(w, 12); ctx.fillStyle = st.side; ctx.fill();
    ctx.restore();
    // 윗면
    const g = ctx.createLinearGradient(0, 0, P.BOARD, P.BOARD);
    g.addColorStop(0, st.top[0]); g.addColorStop(1, st.top[1]);
    boardPath(w); ctx.fillStyle = g; ctx.fill();
    ctx.save(); boardPath(w); ctx.clip();
    drawDeco(th, false);
    // 격자
    ctx.strokeStyle = st.grid; ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < P.GRID_N; i++) {
      const p = gx(i);
      ctx.moveTo(gx(0), p); ctx.lineTo(gx(18), p);
      ctx.moveTo(p, gx(0)); ctx.lineTo(p, gx(18));
    }
    ctx.stroke();
    ctx.fillStyle = st.star;
    for (const i of [3, 9, 15]) for (const j of [3, 9, 15]) {
      ctx.beginPath(); ctx.arc(gx(i), gx(j), 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // 테두리 하이라이트
    if (!w.regions) { boardPath(w); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.stroke(); }
  }

  function drawObstacles() {
    const w = G.world;
    // 구멍
    for (const h of w.holes) {
      const g = ctx.createRadialGradient(h.x, h.y - h.r * 0.3, h.r * 0.1, h.x, h.y, h.r);
      g.addColorStop(0, '#000'); g.addColorStop(0.7, '#1d1208'); g.addColorStop(1, '#4a2c12');
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,230,180,.55)';
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 1.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    }
    // 블록
    drawBoxes(w);
  }

  function drawBoxes(w) {
    for (const b of w.boxes) {
      rrect(b.x, b.y + 7, b.w, b.h, 6); ctx.fillStyle = '#6f3d14'; ctx.fill();
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, '#cf8e4f'); g.addColorStop(1, '#a5652f');
      rrect(b.x, b.y, b.w, b.h, 6); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(80,40,10,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,190,.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x + 6, b.y + 4); ctx.lineTo(b.x + b.w - 6, b.y + 4); ctx.stroke();
    }
  }

  function drawLiveObstacles() {
    const w = G.world;
    // 범퍼
    w.bumpers.forEach((c, i) => {
      const f = Math.max(0, G.flash[i] || 0) / 0.25;
      const r = c.r * (1 + 0.18 * f);
      ctx.beginPath(); ctx.ellipse(c.x + 2, c.y + 5, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,10,60,.35)'; ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fillStyle = f > 0 ? '#fff27a' : '#ff5a6e'; ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.66, 0, Math.PI * 2); ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.beginPath(); ctx.arc(c.x - r * 0.2, c.y - r * 0.25, r * 0.22, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(120,20,40,.5)';
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    });
    // 풍차
    for (const sp of w.spinners) {
      ctx.save(); ctx.lineCap = 'round';
      for (const arm of Physics.spinnerArms(w, sp)) {
        const x1 = sp.x - arm.ux * sp.len, y1 = sp.y - arm.uy * sp.len;
        const x2 = sp.x + arm.ux * sp.len, y2 = sp.y + arm.uy * sp.len;
        ctx.strokeStyle = 'rgba(40,20,0,.3)'; ctx.lineWidth = sp.th * 2;
        ctx.beginPath(); ctx.moveTo(x1 + 3, y1 + 6); ctx.lineTo(x2 + 3, y2 + 6); ctx.stroke();
        ctx.strokeStyle = '#8a4f22'; ctx.lineWidth = sp.th * 2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = '#e8a35f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 12, 0, Math.PI * 2); ctx.fillStyle = '#ff8a3d'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff4dc'; ctx.stroke();
      ctx.restore();
    }
  }

  function drawStone(s) {
    let k = 1;
    if (s.falling > 0) k = Math.max(0, 1 - s.falling / P.FALL_TIME);
    const r = P.R * (0.45 + 0.55 * k);
    ctx.save();
    ctx.globalAlpha = s.falling > 0 ? k : 1;
    // 그림자
    ctx.beginPath(); ctx.ellipse(s.x + 2.5, s.y + 4 + (1 - k) * 10, r, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,20,0,.32)'; ctx.fill();
    // 몸통
    const g = ctx.createRadialGradient(s.x - r * 0.35, s.y - r * 0.4, r * 0.1, s.x, s.y, r);
    if (s.color === 'black') {
      g.addColorStop(0, '#6e6e74'); g.addColorStop(0.35, '#2b2b30'); g.addColorStop(1, '#060608');
    } else {
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#f3f0e8'); g.addColorStop(1, '#cbc6b8');
    }
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    if (s.color === 'white') { ctx.strokeStyle = 'rgba(80,70,50,.35)'; ctx.lineWidth = 1; ctx.stroke(); }
    // 반짝
    ctx.beginPath(); ctx.ellipse(s.x - r * 0.35, s.y - r * 0.42, r * 0.32, r * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = s.color === 'black' ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.9)';
    ctx.fill();
    ctx.restore();
  }

  const powerColor = (p) => `hsl(${125 - 125 * p},85%,${48 + 4 * (1 - p)}%)`;

  // 조준 방향으로 처음 만나는 것 찾기 (알·블록·범퍼·구멍·판 끝)
  function raycast(src, dx, dy, maxD) {
    const w = G.world;
    let best = { t: maxD, kind: null, obj: null };
    const take = (t, kind, obj) => { if (t >= 0 && t < best.t) best = { t, kind, obj }; };
    const circ = (cx, cy, r) => {
      const fx = cx - src.x, fy = cy - src.y;
      const t0 = fx * dx + fy * dy;
      if (t0 <= 0) return -1;
      const h2 = fx * fx + fy * fy - t0 * t0;
      if (h2 >= r * r) return -1;
      return t0 - Math.sqrt(r * r - h2);
    };
    for (const o of w.stones) {
      if (o === src || !o.alive || o.falling > 0) continue;
      take(circ(o.x, o.y, P.R * 2), 'stone', o);
    }
    for (const c of w.bumpers) take(circ(c.x, c.y, c.r + P.R), 'bump', c);
    for (const h of w.holes) take(circ(h.x, h.y, h.r), 'hole', h);
    for (const b of w.boxes) {
      let t1 = -Infinity, t2 = Infinity;
      for (const [o, d, lo, hi] of [[src.x, dx, b.x - P.R, b.x + b.w + P.R], [src.y, dy, b.y - P.R, b.y + b.h + P.R]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t1 = Infinity; } continue; }
        let a = (lo - o) / d, c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t1 = Math.max(t1, a); t2 = Math.min(t2, c);
      }
      if (t1 <= t2 && t2 >= 0) take(Math.max(0, t1), 'wall', b);
    }
    for (let d = 0; d < best.t; d += 4) {
      if (Physics.outAt(w, src.x + dx * d, src.y + dy * d) === 'off') { take(d, 'off', null); break; }
    }
    return best;
  }

  function drawAim(a) {
    const s = a.stone;
    if (!s || !s.alive) return;
    if (a.cancel) {
      ctx.save(); ctx.strokeStyle = 'rgba(120,90,60,.7)'; ctx.lineWidth = 3; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(s.x, s.y, P.R + 7, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      return;
    }
    const col = powerColor(a.p);
    const v0 = P.MAX_SPEED * a.p;

    // 고무줄 + 손잡이
    const hl = P.R + 10 + a.raw * 95;
    const hx = s.x - a.dx * hl, hy = s.y - a.dy * hl;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(90,50,20,.45)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(s.x - a.dx * P.R, s.y - a.dy * P.R); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();

    // 예상 궤적
    if (G.opts.guide) {
      const dist = Physics.travel(v0, G.world.mu);
      const rc = raycast(s, a.dx, a.dy, dist);
      const L = rc.t;
      const ex = s.x + a.dx * L, ey = s.y + a.dy * L;
      const off = rc.kind === 'off' || rc.kind === 'hole' || (!rc.kind && Physics.outAt(G.world, ex, ey));
      ctx.setLineDash([7, 7]); ctx.lineDashOffset = -G.time * 30;
      ctx.lineWidth = 3; ctx.strokeStyle = off ? 'rgba(230,60,50,.85)' : 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.moveTo(s.x + a.dx * P.R, s.y + a.dy * P.R); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.setLineDash([]);
      if (rc.kind === 'wall' || rc.kind === 'bump') {
        ctx.beginPath(); ctx.arc(ex, ey, P.R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      } else if (rc.kind === 'stone') {
        // 닿는 위치의 유령 알 + 맞은 알이 밀려갈 방향
        ctx.beginPath(); ctx.arc(ex, ey, P.R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
        const o = rc.obj;
        let nx = o.x - ex, ny = o.y - ey; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const vc = Physics.speedAfter(v0, rc.t, G.world.mu);
        const vn = ((1 + P.REST) / 2) * vc * Math.max(0, a.dx * nx + a.dy * ny);
        const len = Math.min(110, 14 + vn * 0.09);
        const tx = o.x + nx * (P.R + len), ty = o.y + ny * (P.R + len);
        ctx.strokeStyle = col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(o.x + nx * P.R, o.y + ny * P.R); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx + nx * 7, ty + ny * 7);
        ctx.lineTo(tx - ny * 6, ty + nx * 6);
        ctx.lineTo(tx + ny * 6, ty - nx * 6);
        ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.fillStyle = off ? 'rgba(230,60,50,.9)' : 'rgba(255,255,255,.9)'; ctx.fill();
      }
    }

    // 힘 고리
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.arc(s.x, s.y, P.R + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(s.x, s.y, P.R + 8, -Math.PI / 2, -Math.PI / 2 + a.p * Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // 움직이지 않는 판·구멍·블록은 한 번만 그려 두고 재사용 (휴대폰 부담 줄이기)
  const cache = { cv: document.createElement('canvas'), key: '' };
  function boardLayer() {
    const key = [G.opts.theme, cv.width, cv.height, view.s.toFixed(4), view.ox, view.oy].join('|');
    if (cache.key === key) return cache.cv;
    cache.key = key;
    cache.cv.width = cv.width; cache.cv.height = cv.height;
    ctx = cache.cv.getContext('2d');
    const k = view.dpr * view.s;
    ctx.setTransform(k, 0, 0, k, view.dpr * view.ox, view.dpr * view.oy);
    drawBoard();
    drawObstacles();
    ctx = mainCtx;
    return cache.cv;
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!G.world) return;
    const k = view.dpr * view.s;
    const sx = G.shake ? (Math.random() * 2 - 1) * G.shake : 0;
    const sy = G.shake ? (Math.random() * 2 - 1) * G.shake : 0;
    ctx.drawImage(boardLayer(), sx * k, sy * k);
    ctx.setTransform(k, 0, 0, k, view.dpr * view.ox + sx * k, view.dpr * view.oy + sy * k);

    const th = Themes.get(G.opts.theme);
    if (th.style.deco === 'ice' || th.style.deco === 'pinball') {
      ctx.save(); boardPath(G.world); ctx.clip(); drawDeco(th, true); ctx.restore();
    }
    drawLiveObstacles();
    drawTrails();

    const ai = aiAimState();
    const a = ai || input.state();
    const aimStone = a.aiming ? a.stone : null;

    // 차례인 알 표시
    if (G.state === 'aim' || ai) {
      const pulse = 0.35 + 0.25 * Math.sin(G.time * 5);
      for (const s of G.world.stones) {
        if (!s.alive || s.falling > 0 || s.color !== G.turn) continue;
        if (ai && s !== aimStone) continue;
        const sel = s === G.selected || s === aimStone;
        ctx.beginPath(); ctx.arc(s.x, s.y + 2, P.R + (sel ? 5 : 4), 0, Math.PI * 2);
        ctx.fillStyle = sel ? 'rgba(255,214,64,.95)' : `rgba(255,236,150,${pulse})`;
        ctx.fill();
      }
    }

    // 떨어지는 알은 판 아래쪽에 먼저
    for (const s of G.world.stones) if (s.alive && s.falling > 0) drawStone(s);
    for (const s of G.world.stones) if (s.alive && s.falling === 0) drawStone(s);

    drawFX();
    if (a.aiming && (G.state === 'aim' || ai)) drawAim(a);
    if (G.tut && G.state === 'aim' && isHuman(G.turn) && !a.aiming && !G.selected && G.idle > 0.8) drawCoach();
  }

  /* ───────── 메인 루프 ───────── */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    G.time += dt;
    Sound.budget = 6;
    for (let i = 0; i < G.flash.length; i++) if (G.flash[i] > 0) G.flash[i] -= dt;

    if (G.state === 'ai' && G.ai) aiUpdate(dt);
    if (G.state === 'aim') G.idle += dt;
    updateFX(dt);

    if (G.state === 'moving' || G.state === 'result') {
      G.acc += dt;
      while (G.acc >= P.DT) {
        Physics.step(G.world);
        G.acc -= P.DT;
      }
      for (const e of G.world.events) onEvent(e);
      G.world.events.length = 0;

      if (G.state === 'moving') {
        G.moveT += dt;
        if (!Physics.moving(G.world) || G.moveT > 15) {
          G.settleT += dt;
          if (G.settleT > 0.3 || G.moveT > 15) {
            for (const s of G.world.stones) { s.vx = s.vy = 0; if (s.falling > 0) s.alive = false; }
            endTurn();
          }
        } else G.settleT = 0;
      }
    }
    render();
    requestAnimationFrame(frame);
  }

  /* ───────── 메뉴·버튼 ───────── */
  const parseOpt = (key, val) =>
    key === 'count' || key === 'level' ? +val : key === 'first' || key === 'theme' ? val : val === '1';

  // 테마 고르기 버튼 만들기
  $('themePick').innerHTML = Themes.list
    .map((t) => `<button data-v="${t.id}"><i style="background:${t.swatch}"></i>${t.name}</button>`)
    .join('');
  const showThemeDesc = () => { $('themeDesc').textContent = Themes.get(G.opts.theme).desc; };

  try { G.tut = !localStorage.getItem('alkkagi.tut'); } catch (_) {}
  try {
    const saved = JSON.parse(localStorage.getItem('alkkagi.opts') || '{}');
    for (const k of Object.keys(G.opts)) if (k in saved) G.opts[k] = saved[k];
  } catch (_) {}

  document.querySelectorAll('.seg').forEach((seg) => {
    const key = seg.dataset.opt;
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', parseOpt(key, x.dataset.v) === G.opts[key]));
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
      G.opts[key] = parseOpt(key, b.dataset.v);
      if (key === 'sound') { Sound.unlock(); Sound.setOn(G.opts.sound); }
      if (key === 'vibe' && G.opts.vibe) Haptic.buzz(20);
      if (key === 'theme' || key === 'count') {
        showThemeDesc();
        if (G.state === 'menu') { G.world = setup(G.opts.count); updateHUD(); }
      }
      try { localStorage.setItem('alkkagi.opts', JSON.stringify(G.opts)); } catch (_) {}
    });
  });

  function toMenu() {
    input.cancel(); hide('result'); show('menu');
    G.state = 'menu'; G.ai = null; updateGauge();
  }
  $('btnAi').addEventListener('click', () => { Sound.unlock(); newGame('ai'); });
  $('btnPvp').addEventListener('click', () => { Sound.unlock(); newGame('pvp'); });
  $('btnAgain').addEventListener('click', () => newGame());
  $('btnToMenu').addEventListener('click', toMenu);
  $('btnRestart').addEventListener('click', () => { if (G.state !== 'menu') { input.cancel(); newGame(); } });
  $('btnMenu').addEventListener('click', toMenu);
  // 전체 화면 (블로그 iframe에 allowfullscreen이 있을 때만 보임)
  const fsOK = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (fsOK) {
    $('btnFull').hidden = false;
    $('btnFull').addEventListener('click', () => {
      const d = document, el = d.documentElement;
      try {
        if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      } catch (_) {}
    });
    const fsLabel = () => {
      $('btnFull').textContent = document.fullscreenElement || document.webkitFullscreenElement ? '전체 화면 끝내기' : '전체 화면으로 하기';
    };
    document.addEventListener('fullscreenchange', fsLabel);
    document.addEventListener('webkitfullscreenchange', fsLabel);
  }
  // 다른 탭으로 가면 소리 멈추기
  document.addEventListener('visibilitychange', () => {
    if (!Sound.ctx) return;
    if (document.hidden) Sound.ctx.suspend(); else Sound.ctx.resume();
  });

  $('btnFine').addEventListener('click', () => {
    G.fineLock = !G.fineLock;
    $('btnFine').classList.toggle('on', G.fineLock);
    $('btnFine').textContent = G.fineLock ? '정밀 켜짐' : '정밀 꺼짐';
    updateGauge();
  });

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe($('stage'));
  resize();

  // 메뉴 뒤에 보일 판
  if (!Themes.list.some((t) => t.id === G.opts.theme)) G.opts.theme = 'classic';
  showThemeDesc();
  G.world = setup(G.opts.count);
  updateHUD();
  requestAnimationFrame(frame);

  window.Alk.G = G; // 디버그·2차 AI 연결용
})();
