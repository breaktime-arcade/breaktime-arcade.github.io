/*!
 * 쿵짝 키친 (Beat Kitchen) v1.0
 * 쉬는시간 오락실 — https://smile-willow.tistory.com/
 * 동물 셰프 넷이 나란히 서서 박자에 맞춰 요리하는 리듬 게임. 3코스(채소 탕탕 · 팬케이크 뒤집기 · 버거 쌓기).
 * Canvas 2D + WebAudio (외부 라이브러리 없음). 판정은 화면 프레임이 아니라 오디오 시계를 기준으로 합니다.
 */
(function () {
  'use strict';

  /* =========================================================
   * 1. 코스 · 채보 · 판정 규칙
   * ========================================================= */
  const W = 540, H = 960;
  const NICE = 0.05, OK = 0.12, WIN = 0.2, EARLY = 0.3, COOL = 0.12, BREAK = 3.6, INTRO = 8;
  const COURSES = {
    chop:   { name: '채소 탕탕', emoji: '🥕', bpm: 104, how: '떨어지는 채소가 도마에 닿는 순간 탭!' },
    flip:   { name: '팬케이크 뒤집기', emoji: '🥞', bpm: 96, how: '내 팬케이크가 노릇해지는 순간 뒤집기!', how2: '작은 건 1박 · 중간 2박 · 큰 건 3박 (딸깍 소리를 세어 봐요)' },
    burger: { name: '버거 쌓기', emoji: '🍔', bpm: 112, how: '통통 뛰어오던 재료가 빵 위에 오면 꾹!' }
  };
  const COURSE_ORDER = ['chop', 'flip', 'burger'];
  // chop: 타격 박 / flip: [셰프(-1=모두), 반죽 붓는 박, 굽는 박 수] / burger: [재료, 등장 박, 뜀 간격, 뜀 횟수]
  const CHARTS = {
    chop: {
      normal: [10, 12, 14, 15, 16, 18, 20, 22, 23, 24, 26, 28],
      challenge: [10, 11, 12, 13.5, 14, 16, 17, 17.5, 18, 20, 21.5, 22, 24, 24.5, 25, 26, 28, 29.5, 30]
    },
    flip: {
      normal: [[0, 9, 1], [1, 10, 1], [2, 11, 1], [3, 12, 1], [0, 15, 2], [1, 16, 2], [2, 17, 2], [3, 18, 2], [-1, 22, 3], [0, 27, 3], [1, 28, 1], [2, 29, 1], [3, 29, 2]],
      challenge: [[3, 9, 2], [2, 10, 2], [1, 11, 2], [0, 12, 2], [0, 15, 1], [1, 15.5, 1], [2, 16, 1], [3, 16.5, 1], [-1, 19, 3], [0, 24, 3], [1, 24.5, 2], [2, 25, 1], [3, 25.5, 2], [3, 29, 1], [2, 29.5, 1], [1, 30, 1], [0, 30.5, 1], [-1, 33, 2]]
    },
    burger: {
      normal: [['patty', 9, 1, 3], ['cheese', 13, 0.5, 3], ['lettuce', 16, 1, 2], ['tomato', 19, 1, 2], ['patty', 22, 1, 3], ['cheese', 26, 0.5, 3], ['lettuce', 29, 1, 2], ['bun', 32, 1, 3]],
      challenge: [['patty', 9, 0.5, 3], ['cheese', 11, 0.5, 2], ['lettuce', 12.5, 1, 2], ['tomato', 15, 0.5, 4], ['patty', 17.5, 1.5, 2], ['cheese', 21, 0.5, 3], ['lettuce', 23, 0.5, 2], ['tomato', 24.5, 1, 3], ['patty', 28, 0.5, 3], ['bun', 30, 1, 3]]
    }
  };
  const VEG = ['carrot', 'tomato', 'onion', 'broccoli'];
  const DIFFS = {
    normal:    { label: '보통', sub: '3코스 · 가이드', guide: true, chart: 'normal', seq: [['chop', 1], ['flip', 1], ['burger', 1]] },
    long:      { label: '롱', sub: '6코스 · 스피드업', guide: true, chart: 'normal', seq: [['chop', 1], ['flip', 1], ['burger', 1], ['chop', 1.2], ['flip', 1.2], ['burger', 1.2]] },
    challenge: { label: '도전', sub: '가이드 없음', guide: false, chart: 'challenge', seq: [['chop', 1.08], ['flip', 1.08], ['burger', 1.08]] },
    practice:  { label: '연습', sub: '느리게', guide: true, chart: 'normal', seq: [['chop', 0.8], ['flip', 0.8], ['burger', 0.8]] }
  };
  // CPU 셰프 실력: 타이밍 오차(표준편차, 초)와 놓칠 확률
  const AI_SKILL = {
    coop: { sd: 0.05, skip: 0.03 },
    versus: { normal: { sd: 0.06, skip: 0.04 }, long: { sd: 0.058, skip: 0.04 }, challenge: { sd: 0.05, skip: 0.03 } },
    practice: { sd: 0, skip: 0 }   // 연습 모드의 CPU는 시범을 보여 주는 선생님
  };
  const PLAYERS = [
    { name: '냥이', kind: 'cat', color: '#ff8a3d', key: 'A' },
    { name: '토토', kind: 'bunny', color: '#ff5fa2', key: 'F' },
    { name: '판판', kind: 'panda', color: '#4aa8ff', key: 'J' },
    { name: '꽥꽥', kind: 'duck', color: '#3fbf6b', key: 'L' }
  ];
  const GRADES = [
    { min: 28, title: '전설의 셰프', stars: 3, color: '#ff4f6d' },
    { min: 23, title: '일류 셰프', stars: 2, color: '#ff9f1c' },
    { min: 16, title: '견습 셰프', stars: 1, color: '#2ec4b6' },
    { min: 0, title: '설거지 담당', stars: 0, color: '#8d99ae' }
  ];

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
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }

  // 코스 하나의 음표(셰프 공통 틀)를 박 단위로 만든다
  function courseNotes(course, chartKey) {
    const C = CHARTS[course][chartKey], out = [];
    if (course === 'chop') C.forEach((hb, k) => out.push({ p: -1, hit: hb, cue: hb - 2, kind: VEG[(k * 3 + (hb * 2 | 0)) % 4] }));
    if (course === 'flip') C.forEach(([p, pour, size]) => out.push({ p, hit: pour + size, cue: pour, size }));
    if (course === 'burger') C.forEach(([kind, a, iv, hops]) => { const hopsAt = []; for (let i = 0; i < hops; i++) hopsAt.push(a + i * iv); out.push({ p: -1, hit: a + iv * hops, cue: a, kind, iv, hopsAt }); });
    return out;
  }
  function buildStages(diffKey) {
    const D = DIFFS[diffKey], stages = [];
    let t0 = 0;
    D.seq.forEach(([course, speed], s) => {
      const bpm = Math.round(COURSES[course].bpm * speed), bd = 60 / bpm;
      const tpl = courseNotes(course, D.chart);
      const lenBeats = Math.ceil(Math.max(...tpl.map(n => n.hit))) + 4;
      const notes = tpl.map(n => Object.assign({}, n, {
        s, course, hitT: t0 + n.hit * bd, cueT: t0 + n.cue * bd,
        hopTs: n.hopsAt ? n.hopsAt.map(b => t0 + b * bd) : null
      }));
      stages.push({ s, course, bpm, bd, speed, start: t0, playStart: t0 + INTRO * bd, playEnd: t0 + lenBeats * bd, lenBeats, notes, round: s >= 3 ? 2 : 1 });
      t0 += lenBeats * bd + BREAK;
    });
    return { diff: diffKey, guide: D.guide, stages, endT: stages[stages.length - 1].playEnd + 0.6 };
  }

  // mode: 'coop'(협동) | 'versus'(대결) | 'practice'(연습)
  function createGame(mode, diffKey, seed, humans) {
    const dk = mode === 'practice' ? 'practice' : diffKey;
    const plan = buildStages(dk);
    const rng = mulberry32(seed == null ? (Date.now() >>> 0) : seed);
    const hum = mode === 'practice' ? 1 : clamp(humans || 1, 1, 4);
    const skill = mode === 'practice' ? AI_SKILL.practice : mode === 'coop' ? AI_SKILL.coop : AI_SKILL.versus[diffKey] || AI_SKILL.versus.normal;
    const players = [];
    for (let i = 0; i < 4; i++) {
      const notes = [];
      for (const st of plan.stages) for (const n of st.notes) if (n.p === -1 || n.p === i) notes.push(Object.assign({}, n, { res: null, d: null, at: null }));
      notes.sort((a, b) => a.hitT - b.hitT);
      const P = { i, ai: i >= hum, notes, score: 0, max: notes.length * 2, combo: 0, maxCombo: 0, nice: 0, ok: 0, miss: 0, offsets: [], lastSwing: -9, stageScore: plan.stages.map(() => 0), stageMax: plan.stages.map(st => notes.filter(n => n.s === st.s).length * 2) };
      if (P.ai) {
        const bias = skill.sd ? gauss(rng) * 0.01 : 0;
        P.plan = notes.map(n => rng() < skill.skip ? null : n.hitT + bias + gauss(rng) * skill.sd);
      }
      players.push(P);
    }
    return { mode, diff: dk, humans: hum, guide: plan.guide, stages: plan.stages, endT: plan.endT, players, t: -1, events: [], done: false };
  }

  function record(g, P, n, res, d, at) {
    n.res = res; n.d = d; n.at = at;
    const pts = res === 'nice' ? 2 : res === 'ok' ? 1 : 0;
    P.score += pts; P.stageScore[n.s] += pts;
    if (res === 'nice') P.nice++; else if (res === 'ok') P.ok++; else P.miss++;
    P.combo = res === 'miss' ? 0 : P.combo + 1; P.maxCombo = Math.max(P.maxCombo, P.combo);
    if (d != null && res !== 'miss') P.offsets.push(d);
    g.events.push({ type: 'judge', p: P.i, n, res, d, early: d != null && d < 0 });
  }
  function swing(g, pi, t) {
    const P = g.players[pi];
    if (!P || t - P.lastSwing < COOL) return null;
    P.lastSwing = t;
    g.events.push({ type: 'swing', p: pi, t });
    let best = null, bd = WIN;
    bd = 9;
    // 너무 이르게 휘두르면(0.3초 전까지) 그 음표를 놓친 것으로 처리 → 연타로는 점수를 얻기 어려움
    for (const n of P.notes) { if (n.res) continue; const dd = t - n.hitT; if (dd < -EARLY) break; if (dd > WIN) continue; if (Math.abs(dd) < bd) { bd = Math.abs(dd); best = n; } }
    if (!best) return 'whiff';
    const d = t - best.hitT, a = Math.abs(d);
    const res = a <= NICE ? 'nice' : a <= OK ? 'ok' : 'miss';
    record(g, P, best, res, d, t);
    return res;
  }
  function update(g, t) {
    const prev = g.t; g.t = t;
    for (const st of g.stages) {
      if (prev < st.start && t >= st.start) g.events.push({ type: 'stage', s: st.s });
      if (prev < st.playEnd && t >= st.playEnd) g.events.push({ type: 'stageEnd', s: st.s });
    }
    for (const P of g.players) {
      if (P.ai) P.notes.forEach((n, k) => { const at = P.plan[k]; if (at != null && !n.res && prev < at && t >= at) swing(g, P.i, at); });
      for (const n of P.notes) { if (n.hitT > t) break; if (!n.res && t > n.hitT + WIN) record(g, P, n, 'miss', null, null); }
    }
    if (!g.done && t >= g.endT) { g.done = true; g.events.push({ type: 'end' }); }
  }
  function stageAt(g, t) {
    for (const st of g.stages) if (t < st.playEnd + BREAK) return st;
    return g.stages[g.stages.length - 1];
  }
  // 협동 평가: 사람 셰프들의 합계로 매김(CPU는 함께 요리만). 심사위원 3명은 각자 좋아하는 코스를 더 중요하게 봄
  function teamPct(g, s) {
    let sc = 0, mx = 0;
    for (const P of g.players) {
      if (P.ai) continue; if (s == null) { sc += P.score; mx += P.max; } else { sc += P.stageScore[s]; mx += P.stageMax[s]; } }
    return mx ? sc / mx : 0;
  }
  function judgeScores(g) {
    const all = teamPct(g);
    return COURSE_ORDER.map(c => {
      const ss = g.stages.filter(st => st.course === c).map(st => teamPct(g, st.s));
      const fav = ss.reduce((a, b) => a + b, 0) / ss.length;
      return clamp(Math.round(12.5 * (0.6 * fav + 0.4 * all) - 2.3), 1, 10);
    });
  }
  const gradeFor = total => GRADES.find(G => total >= G.min);

  const Core = { EARLY, COURSES, CHARTS, DIFFS, AI_SKILL, NICE, OK, WIN, buildStages, createGame, swing, update, stageAt, teamPct, judgeScores, gradeFor };
  if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') { module.exports = Core; return; }

  /* =========================================================
   * 2. 저장
   * ========================================================= */
  const Store = {
    get(k, d) { try { const v = localStorage.getItem('beatKitchen.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('beatKitchen.' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };

  /* =========================================================
   * 3. 오디오 (오디오 시계 · 코스별 오리지널 곡 · 효과음)
   * ========================================================= */
  const A = {
    ctx: null, master: null, music: null, sfx: null, noiseBuf: null, on: Store.get('sound', true), timer: null,
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 0.7 : 0; this.master.connect(this.ctx.destination);
        this.music = this.ctx.createGain(); this.music.gain.value = 0.5; this.music.connect(this.master);
        this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return true;
      } catch (e) { this.ctx = null; return false; }
    },
    now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; },
    eventTime(e) {
      if (!this.ctx) return performance.now() / 1000;
      const lag = e && e.timeStamp ? clamp((performance.now() - e.timeStamp) / 1000, 0, 0.1) : 0;
      return this.ctx.currentTime - lag;
    },
    defaultLatency() { const c = this.ctx; return c ? clamp((c.outputLatency || 0) + (c.baseLatency || 0), 0, 0.3) : 0; },
    setOn(v) { this.on = v; Store.set('sound', v); if (this.master) this.master.gain.setTargetAtTime(v ? 0.7 : 0, this.ctx.currentTime, 0.03); },
    tone(f, d, type, v, t, f2, dest, attack) {
      const c = this.ctx; if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + d + 0.05);
    },
    noise(d, v, t, f1, f2, type, dest, q) {
      const c = this.ctx; if (!c) return;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const fl = c.createBiquadFilter(); fl.type = type || 'bandpass'; fl.Q.value = q || 1; fl.frequency.setValueAtTime(f1, t);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random()); s.stop(t + d + 0.05);
    },
    mf: m => 440 * Math.pow(2, (m - 69) / 12),
    kick(t) { this.tone(150, 0.3, 'sine', 0.85, t, 42, this.music); },
    snare(t) { this.noise(0.16, 0.4, t, 1800, 900, 'bandpass', this.music, 0.7); this.tone(220, 0.08, 'triangle', 0.2, t, 150, this.music); },
    clap(t) { for (let i = 0; i < 3; i++) this.noise(0.08, 0.28, t + i * 0.012, 1400, null, 'bandpass', this.music, 1.5); },
    hat(t, v) { this.noise(0.035, v || 0.1, t, 8000, null, 'highpass', this.music); },
    bass(m, t, d) { const f = this.mf(m); this.tone(f, d, 'triangle', 0.45, t, null, this.music, 0.01); this.tone(f * 2, d * 0.5, 'square', 0.04, t, null, this.music); },
    lead(m, t, d, kind) {
      const f = this.mf(m);
      if (kind === 'marimba') { this.tone(f, Math.min(d, 0.25), 'sine', 0.16, t, null, this.music, 0.003); this.tone(f * 4, 0.05, 'sine', 0.04, t, null, this.music, 0.002); }
      else if (kind === 'whistle') { this.tone(f, d, 'sine', 0.1, t, null, this.music, 0.02); this.tone(f * 2, d * 0.6, 'triangle', 0.025, t, null, this.music, 0.02); }
      else { this.tone(f, d, 'square', 0.06, t, null, this.music, 0.01); this.tone(f * 1.005, d, 'sawtooth', 0.03, t, null, this.music, 0.01); }
    },
    play(name, o) {
      const c = this.ctx; if (!c || !this.on) return;
      const t = (o && o.t) || c.currentTime;
      switch (name) {
        // 예고음
        case 'drop': this.tone(1500, 0.28, 'sine', 0.08, t, 500); this.tone(900, 0.05, 'square', 0.05, t); break;
        case 'pour': this.noise(0.25 + (o.size || 1) * 0.08, 0.22, t, 3500, 2000, 'bandpass', null, 0.8); this.tone([0, 1050, 800, 600][o.size || 1], 0.1, 'triangle', 0.16, t); break;
        case 'tick': this.tone(1700, 0.035, 'square', 0.09, t); break;
        case 'hop': this.tone(300 + (o.k || 0) * 110, 0.12, 'sine', 0.2, t, 600 + (o.k || 0) * 160); break;
        // 판정음
        case 'chop-nice': this.noise(0.05, 0.8, t, 6000, 3000, 'bandpass', null, 0.8); this.tone(180, 0.12, 'sine', 0.5, t, 80); break;
        case 'chop-ok': this.noise(0.06, 0.45, t, 2500, 1200, 'bandpass', null, 1); this.tone(140, 0.1, 'sine', 0.35, t, 70); break;
        case 'flip-nice': this.noise(0.18, 0.4, t, 900, 3000, 'bandpass', null, 1.2); this.tone(880, 0.08, 'triangle', 0.14, t + 0.05); this.tone(1320, 0.12, 'triangle', 0.12, t + 0.12); break;
        case 'flip-ok': this.noise(0.15, 0.3, t, 800, 2000, 'bandpass', null, 1.2); this.tone(660, 0.1, 'triangle', 0.1, t + 0.05); break;
        case 'burger-nice': this.tone(120, 0.15, 'sine', 0.55, t, 60); this.noise(0.08, 0.3, t, 600, 300, 'lowpass'); this.tone(1568, 0.15, 'triangle', 0.12, t + 0.04); break;
        case 'burger-ok': this.tone(110, 0.14, 'sine', 0.45, t, 60); this.noise(0.08, 0.25, t, 500, 250, 'lowpass'); break;
        case 'miss': this.tone(260, 0.25, 'sine', 0.12, t, 140); this.noise(0.15, 0.12, t, 400, 200, 'bandpass'); break;
        case 'burn': this.noise(0.4, 0.2, t, 5000, 1500, 'highpass'); this.tone(200, 0.3, 'sine', 0.1, t, 120); break;
        case 'swing': this.noise(0.08, 0.2, t, 900, 2400, 'bandpass', null, 1.4); break;
        case 'aihit': this.noise(0.05, (o && o.v) || 0.25, t, 2600, 1300, 'bandpass', null, 1.2); break;
        case 'count': this.tone(o && o.hi ? 1320 : 880, 0.1, 'square', 0.1, t); break;
        case 'click': this.tone(o && o.hi ? 1600 : 1100, 0.04, 'square', 0.15, t); break;
        case 'ui': this.tone(700, 0.05, 'triangle', 0.15, t); break;
        case 'bell': [1568, 2093].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.12, t + i * 0.09)); break;
        case 'card': this.noise(0.06, 0.3, t, 2000, 800, 'bandpass'); this.tone(500 + (o && o.k || 0) * 120, 0.12, 'triangle', 0.15, t); break;
        case 'fanfare': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'square', 0.1, t + i * 0.13)); break;
        case 'sad': [523, 466, 415, 392].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, t + i * 0.22)); break;
      }
    },
    // ---- 곡 재생: 16분음표 단계와 예고음을 미리 펼쳐 두고 25ms마다 예약 ----
    song: null,
    startSong(g, startAt) {
      this.stopSong();
      const steps = [], cues = [];
      for (const st of g.stages) {
        const sd = st.bd / 4;
        for (let k = 0; k < (st.lenBeats - 1) * 4; k++) steps.push({ t: startAt + st.start + k * sd, st, k });
        const seen = new Set();
        for (const n of st.notes) {
          const key = n.course + n.cueT.toFixed(3) + (n.size || '');
          if (seen.has(key)) continue; seen.add(key);
          if (n.course === 'chop') cues.push({ t: n.cueT, name: 'drop' });
          if (n.course === 'flip') { cues.push({ t: n.cueT, name: 'pour', o: { size: n.size } }); for (let b = 1; b < n.size; b++) cues.push({ t: n.cueT + b * st.bd, name: 'tick' }); }
          if (n.course === 'burger') n.hopTs.forEach((ht, k) => cues.push({ t: ht, name: 'hop', o: { k } }));
        }
        cues.push({ t: st.playEnd - st.bd * 0.5, name: 'bell' });
      }
      cues.forEach(c => { c.t += startAt; }); cues.sort((a, b) => a.t - b.t);
      this.song = { steps, cues, si: 0, ci: 0 };
      const tick = () => this.schedule();
      tick(); this.timer = setInterval(tick, 25);
    },
    stopSong() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.song = null; },
    schedule() {
      const S = this.song, c = this.ctx; if (!S || !c) return;
      const horizon = c.currentTime + 0.15;
      while (S.si < S.steps.length && S.steps[S.si].t < horizon) {
        const { t, st, k } = S.steps[S.si++];
        if (t >= c.currentTime - 0.01 && this.on) this.step(st, k, t);
      }
      while (S.ci < S.cues.length && S.cues[S.ci].t < horizon) {
        const q = S.cues[S.ci++];
        if (q.t >= c.currentTime - 0.01 && this.on) this.play(q.name, Object.assign({ t: q.t }, q.o || {}));
      }
      if (S.si >= S.steps.length && S.ci >= S.cues.length) this.stopSong();
    },
    // 코스별 오리지널 곡 (채소: Am 펑크 · 팬케이크: F 경쾌 · 버거: G 록)
    STYLE: {
      chop: { roots: [45, 45, 50, 52], lead: 'marimba', mel: [[69, 0, 72, 0, 74, 72, 69, 0], [67, 0, 69, 0, 72, 0, 69, 67], [74, 0, 77, 0, 76, 74, 72, 0], [76, 0, 74, 0, 71, 0, 68, 0]], kick: [0, 6, 8], bassSteps: [0, 3, 6, 8, 10, 14] },
      flip: { roots: [41, 46, 48, 41], lead: 'whistle', mel: [[77, 0, 76, 0, 72, 0, 69, 0], [70, 0, 74, 0, 77, 0, 74, 0], [72, 0, 76, 0, 79, 0, 76, 72], [77, 0, 0, 0, 72, 0, 77, 0]], kick: [0, 8], bassSteps: [0, 4, 8, 12] },
      burger: { roots: [43, 48, 50, 43], lead: 'organ', mel: [[67, 0, 71, 0, 74, 0, 71, 0], [72, 0, 76, 0, 79, 0, 76, 0], [74, 0, 78, 0, 81, 0, 78, 74], [79, 0, 74, 0, 71, 0, 67, 0]], kick: [0, 8, 10], bassSteps: [0, 2, 4, 6, 8, 10, 12, 14] }
    },
    step(st, k, t) {
      const S = this.STYLE[st.course], sd = st.bd / 4, beat = k / 4, b16 = k % 16, bar = Math.floor(k / 16);
      const ending = beat >= st.lenBeats - 4;
      if (ending) { if (k === (st.lenBeats - 4) * 4) { this.kick(t); this.clap(t); [0, 4, 7, 12].forEach(iv => this.lead(S.roots[0] + 24 + iv, t, st.bd * 2, S.lead)); this.bass(S.roots[0], t, st.bd * 2); } return; }
      if (S.kick.includes(b16)) this.kick(t);
      if (b16 === 4 || b16 === 12) { this.snare(t); if (st.course !== 'chop') this.clap(t); }
      if (st.course === 'chop' ? true : k % 2 === 0) this.hat(t, k % 4 === 0 ? 0.09 : 0.05);
      if (S.bassSteps.includes(b16)) { const r = S.roots[bar % 4]; this.bass(r + (st.course === 'chop' && b16 % 8 === 6 ? 12 : 0), t, sd * (st.course === 'burger' ? 1.6 : 3)); }
      if (beat >= INTRO && k % 2 === 0) { const m = S.mel[bar % 4][(k % 16) / 2]; if (m) this.lead(m, t, sd * 1.8, S.lead); }
      if (k % 4 === 0 && beat >= INTRO - 4 && beat < INTRO) this.play('count', { t, hi: beat === INTRO - 1 });
    }
  };

  /* =========================================================
   * 4. 화면 · 그리기 도구
   * ========================================================= */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const FONT = '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  let scale = 1, offX = 0, offY = 0, dpr = 1, vw = 0, vh = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    scale = Math.min(vw / W, vh / H); offX = (vw - W * scale) / 2; offY = (vh - H * scale) / 2;
  }
  window.addEventListener('resize', resize); resize();
  const view = () => ({ x0: -offX / scale - 2, x1: (vw - offX) / scale + 2, y0: -offY / scale - 2, y1: (vh - offY) / scale + 2 });
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
  const circle = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  const ell = (x, y, rx, ry, c, rot) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, 7); ctx.fill(); };
  const ease = t => 1 - Math.pow(1 - t, 3);
  const backOut = t => { const s = 1.9; t -= 1; return t * t * ((s + 1) * t + s) + 1; };
  function mixHex(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(lerp(pa >> 16, pb >> 16, k)), g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, k)), bl = Math.round(lerp(pa & 255, pb & 255, k));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  const HEAD_C = { cat: '#f4a24c', bunny: '#f7eeee', panda: '#ffffff', duck: '#ffe066' };
  const colX = i => 67.5 + i * 135;
  const BOARD_Y = 706, COUNTER_Y = 696, STACK0 = 700;

  function smallHead(kind, x, y, r) {
    const c = HEAD_C[kind];
    if (kind === 'bunny') { ell(x - r * 0.4, y - r * 1.1, r * 0.25, r * 0.7, c); ell(x + r * 0.4, y - r * 1.1, r * 0.25, r * 0.7, c); }
    if (kind === 'cat') { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - r * 0.9, y - r * 0.3); ctx.lineTo(x - r * 0.6, y - r * 1.2); ctx.lineTo(x - r * 0.1, y - r * 0.7); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + r * 0.9, y - r * 0.3); ctx.lineTo(x + r * 0.6, y - r * 1.2); ctx.lineTo(x + r * 0.1, y - r * 0.7); ctx.fill(); }
    if (kind === 'panda') { circle(x - r * 0.75, y - r * 0.75, r * 0.38, '#222'); circle(x + r * 0.75, y - r * 0.75, r * 0.38, '#222'); }
    circle(x, y, r, c);
    if (kind === 'panda') { ell(x - r * 0.38, y - r * 0.05, r * 0.25, r * 0.32, '#222', 0.4); ell(x + r * 0.38, y - r * 0.05, r * 0.25, r * 0.32, '#222', -0.4); }
    circle(x - r * 0.36, y - r * 0.05, r * 0.13, kind === 'panda' ? '#fff' : '#2b2420'); circle(x + r * 0.36, y - r * 0.05, r * 0.13, kind === 'panda' ? '#fff' : '#2b2420');
    if (kind === 'duck') ell(x, y + r * 0.35, r * 0.4, r * 0.2, '#ff9f1c');
    else circle(x, y + r * 0.3, r * 0.1, '#ff7a8a');
  }

  // ---- 주방 배경 ----
  function drawKitchen(time) {
    const v = view();
    // 벽 타일
    ctx.fillStyle = '#fff3e0'; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, COUNTER_Y - v.y0);
    ctx.strokeStyle = 'rgba(230,200,160,0.45)'; ctx.lineWidth = 2;
    for (let y = Math.floor(v.y0 / 36) * 36; y < COUNTER_Y; y += 36) { ctx.beginPath(); ctx.moveTo(v.x0, y); ctx.lineTo(v.x1, y); ctx.stroke(); }
    for (let x = Math.floor(v.x0 / 36) * 36; x < v.x1; x += 36) { ctx.beginPath(); ctx.moveTo(x, v.y0); ctx.lineTo(x, COUNTER_Y); ctx.stroke(); }
    // 위쪽 띠 (가랜드)
    ctx.fillStyle = '#ffb35c'; ctx.fillRect(v.x0, 0, v.x1 - v.x0, 62);
    for (let x = Math.floor(v.x0 / 30) * 30; x < v.x1; x += 30) { ctx.fillStyle = ['#ff6b6b', '#ffd166', '#4ecdc4', '#7bd389'][((x / 30) % 4 + 4) % 4]; ctx.beginPath(); ctx.moveTo(x, 62); ctx.lineTo(x + 30, 62); ctx.lineTo(x + 15, 78); ctx.fill(); }
    // 뒤쪽 선반
    ctx.fillStyle = '#d9a46a'; ctx.fillRect(v.x0, 286, v.x1 - v.x0, 8);
    for (let x = Math.floor(v.x0 / 90) * 90 + 20; x < v.x1; x += 90) { rr(x, 262, 22, 24, 5); ctx.fillStyle = ['#ff8a8a', '#8ad1ff', '#ffd27a'][((x / 90 | 0) % 3 + 3) % 3]; ctx.fill(); rr(x + 30, 270, 30, 16, 4); ctx.fillStyle = '#c0c6d4'; ctx.fill(); }
  }
  // 조리대 (셰프 몸 앞을 가림)
  function drawCounter() {
    const v = view();
    const cg = ctx.createLinearGradient(0, COUNTER_Y, 0, COUNTER_Y + 22);
    cg.addColorStop(0, '#f6f6fa'); cg.addColorStop(1, '#d4d8e2');
    ctx.fillStyle = cg; ctx.fillRect(v.x0, COUNTER_Y, v.x1 - v.x0, 22);
    ctx.fillStyle = '#a9733f'; ctx.fillRect(v.x0, COUNTER_Y + 22, v.x1 - v.x0, v.y1 - COUNTER_Y - 22);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(v.x0, COUNTER_Y + 22, v.x1 - v.x0, 5);
    for (let i = -2; i < 6; i++) {
      const x = colX(i);
      rr(x - 58, COUNTER_Y + 36, 116, v.y1 - COUNTER_Y - 30, 10); ctx.fillStyle = '#b98249'; ctx.fill();
      if (i >= 0 && i < 4) { ctx.fillStyle = PLAYERS[i].color; ctx.fillRect(x - 58, COUNTER_Y + 36, 116, 6); }
      circle(x + 44, COUNTER_Y + 140, 4, '#e8c38f');
    }
  }

  // ---- 심사위원석 ----
  const JUDGES = [
    { name: '곰셰프', body: '#8b5a3c', face: '#a0704e', ear: 'round', course: 'chop' },
    { name: '여우 미식가', body: '#f28c38', face: '#f6a55c', ear: 'point', course: 'flip' },
    { name: '부엉 박사', body: '#7d6a9a', face: '#9a88b8', ear: 'tuft', course: 'burger' }
  ];
  const judgeHop = [0, 0, 0];
  let judgeMood = [0, 0, 0];
  function drawJudge(j, x, y, mood, hop, sign) {
    const J = JUDGES[j];
    y -= Math.max(0, Math.sin(hop * Math.PI)) * 10;
    ell(x, y + 30, 30, 22, J.body);
    // 귀
    if (J.ear === 'round') { circle(x - 22, y - 22, 9, J.body); circle(x + 22, y - 22, 9, J.body); }
    if (J.ear === 'point') { ctx.fillStyle = J.body; ctx.beginPath(); ctx.moveTo(x - 26, y - 6); ctx.lineTo(x - 20, y - 36); ctx.lineTo(x - 6, y - 20); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 26, y - 6); ctx.lineTo(x + 20, y - 36); ctx.lineTo(x + 6, y - 20); ctx.fill(); }
    if (J.ear === 'tuft') { ctx.fillStyle = J.body; ctx.beginPath(); ctx.moveTo(x - 24, y - 10); ctx.lineTo(x - 22, y - 34); ctx.lineTo(x - 8, y - 22); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 24, y - 10); ctx.lineTo(x + 22, y - 34); ctx.lineTo(x + 8, y - 22); ctx.fill(); }
    circle(x, y, 26, J.body);
    ell(x, y + 6, 18, 14, J.face);
    // 눈 (기분에 따라)
    if (J.ear === 'tuft') { circle(x - 10, y - 4, 9, '#fff'); circle(x + 10, y - 4, 9, '#fff'); }
    if (mood > 0.3) { ctx.strokeStyle = '#2b2420'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x - 10, y - 2, 4, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 10, y - 2, 4, Math.PI, 0); ctx.stroke(); }
    else { circle(x - 10, y - 4, 3.4, '#2b2420'); circle(x + 10, y - 4, 3.4, '#2b2420'); }
    // 입
    ctx.strokeStyle = '#5a2a20'; ctx.lineWidth = 2.5; ctx.beginPath();
    if (mood > 0.3) ctx.arc(x, y + 6, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (mood < -0.3) ctx.arc(x, y + 14, 6, 1.15 * Math.PI, 1.85 * Math.PI);
    else { ctx.moveTo(x - 5, y + 10); ctx.lineTo(x + 5, y + 10); }
    ctx.stroke();
    if (J.ear === 'point' || J.ear === 'round') circle(x, y + 2, 3.5, '#3b2420');
    else { ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(x - 4, y + 2); ctx.lineTo(x + 4, y + 2); ctx.lineTo(x, y + 9); ctx.fill(); }
    // 나비넥타이
    ctx.fillStyle = '#e5383b'; ctx.beginPath(); ctx.moveTo(x, y + 28); ctx.lineTo(x - 10, y + 22); ctx.lineTo(x - 10, y + 34); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, y + 28); ctx.lineTo(x + 10, y + 22); ctx.lineTo(x + 10, y + 34); ctx.closePath(); ctx.fill();
    if (sign != null) {
      rr(x - 26, y - 70, 52, 40, 8); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#4a2a6a'; ctx.stroke();
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(x - 2, y - 30, 4, 18);
      text(String(sign), x, y - 50, 24, '#4a2a6a');
    }
  }
  function drawJudgeTable(time, signs) {
    for (let j = 0; j < 3; j++) drawJudge(j, 150 + j * 120, 112, judgeMood[j], judgeHop[j], signs ? signs[j] : null);
    rr(70, 140, 400, 42, 10); ctx.fillStyle = '#7a4a2a'; ctx.fill();
    ctx.fillStyle = '#9a6a42'; ctx.fillRect(70, 140, 400, 8);
    for (let j = 0; j < 3; j++) { rr(150 + j * 120 - 44, 154, 88, 22, 6); ctx.fillStyle = '#fff8e6'; ctx.fill(); text(JUDGES[j].name, 150 + j * 120, 166, 13, '#5a3a24'); }
  }

  // ---- 요리 재료 그림 ----
  function drawVeg(kind, x, y, s, rot, cut) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    if (kind === 'carrot') {
      ctx.fillStyle = '#ff8c2a'; ctx.beginPath(); ctx.moveTo(-8, -14); ctx.quadraticCurveTo(0, -18, 8, -14); ctx.lineTo(1, 20); ctx.lineTo(-1, 20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3fae4a'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(-8, -28); ctx.lineTo(0, -20); ctx.lineTo(8, -28); ctx.closePath(); ctx.fill();
    } else if (kind === 'tomato') {
      circle(0, 0, 16, '#e8423b'); circle(-5, -5, 4, 'rgba(255,255,255,0.4)');
      ctx.fillStyle = '#3fae4a'; ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = i * 1.256 - 1.57; ctx.lineTo(Math.cos(a) * 8, -14 + Math.sin(a) * 4); ctx.lineTo(Math.cos(a + 0.6) * 3, -14 + Math.sin(a + 0.6) * 2); } ctx.fill();
    } else if (kind === 'onion') {
      ctx.fillStyle = '#c98bd6'; ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(18, -4, 12, 12); ctx.quadraticCurveTo(0, 20, -12, 12); ctx.quadraticCurveTo(-18, -4, 0, -20); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -16); ctx.quadraticCurveTo(8, 0, 0, 16); ctx.stroke();
    } else {
      ctx.fillStyle = '#5aa84a'; ctx.fillRect(-3, 0, 6, 16);
      circle(-8, -4, 9, '#3f9a3a'); circle(8, -4, 9, '#3f9a3a'); circle(0, -12, 10, '#4caf45'); circle(0, -2, 8, '#57b84e');
    }
    if (cut) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, 22); ctx.stroke(); }
    ctx.restore();
  }
  const VEG_COL = { carrot: '#ff8c2a', tomato: '#e8423b', onion: '#c98bd6', broccoli: '#4caf45' };
  const ING_H = { patty: 12, cheese: 5, lettuce: 7, tomato: 7, bun: 22 };
  function drawIng(kind, x, y, w, rot) {
    // (x, y) = 재료 아래쪽 가운데
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    const h = ING_H[kind], hw = w / 2;
    if (kind === 'patty') { rr(-hw, -h, w, h, 6); ctx.fillStyle = '#6b3f22'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-hw + 6, -h + 2, w - 12, 2); }
    if (kind === 'cheese') { ctx.fillStyle = '#ffcc33'; ctx.fillRect(-hw - 2, -h, w + 4, h); ctx.beginPath(); ctx.moveTo(-hw + 6, 0); ctx.lineTo(-hw + 10, 7); ctx.lineTo(-hw + 14, 0); ctx.moveTo(hw - 14, 0); ctx.lineTo(hw - 10, 6); ctx.lineTo(hw - 6, 0); ctx.fill(); }
    if (kind === 'lettuce') { ctx.fillStyle = '#5cc35a'; ctx.beginPath(); ctx.moveTo(-hw - 4, 0); for (let i = 0; i <= 8; i++) ctx.lineTo(-hw - 4 + (w + 8) * i / 8, -h + (i % 2 ? -3 : 2)); ctx.lineTo(hw + 4, 0); ctx.closePath(); ctx.fill(); }
    if (kind === 'tomato') { rr(-hw + 2, -h, w / 2 - 3, h, 3); ctx.fillStyle = '#e8423b'; ctx.fill(); rr(1, -h, w / 2 - 3, h, 3); ctx.fill(); }
    if (kind === 'bun') {
      ctx.fillStyle = '#e8a24c'; ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.quadraticCurveTo(-hw, -h - 4, 0, -h - 4); ctx.quadraticCurveTo(hw, -h - 4, hw, 0); ctx.closePath(); ctx.fill();
      for (const [sx, sy] of [[-12, -16], [0, -21], [12, -15], [-4, -10], [8, -8]]) ell(sx * w / 80, sy, 2.2, 1.3, '#fff6dc');
    }
    ctx.restore();
  }

  // ---- 셰프 (정면, 조리대 뒤) ----
  const HEAD_Y = 606;
  function drawChefBody(i, x, beatPhase, mood) {
    const P = PLAYERS[i], hc = HEAD_C[P.kind];
    const bob = Math.abs(Math.sin(beatPhase * Math.PI)) * 3, hy = HEAD_Y - bob;
    // 몸통 (조리복)
    rr(x - 38, hy + 26, 76, 90, 26); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#e1e4ec'; ctx.stroke();
    circle(x - 10, hy + 62, 3, '#d4d8e2'); circle(x + 10, hy + 62, 3, '#d4d8e2'); circle(x - 10, hy + 80, 3, '#d4d8e2'); circle(x + 10, hy + 80, 3, '#d4d8e2');
    ctx.fillStyle = P.color; ctx.beginPath(); ctx.moveTo(x - 20, hy + 26); ctx.lineTo(x + 20, hy + 26); ctx.lineTo(x, hy + 48); ctx.closePath(); ctx.fill();
    // 머리 + 귀
    if (P.kind === 'bunny') { ell(x - 11, hy - 40, 7, 20, hc, -0.15); ell(x + 11, hy - 40, 7, 20, hc, 0.15); ell(x - 11, hy - 40, 3.5, 13, '#ffc4d0', -0.15); ell(x + 11, hy - 40, 3.5, 13, '#ffc4d0', 0.15); }
    if (P.kind === 'cat') { ctx.fillStyle = hc; ctx.beginPath(); ctx.moveTo(x - 27, hy - 10); ctx.lineTo(x - 23, hy - 36); ctx.lineTo(x - 8, hy - 24); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 27, hy - 10); ctx.lineTo(x + 23, hy - 36); ctx.lineTo(x + 8, hy - 24); ctx.fill(); }
    if (P.kind === 'panda') { circle(x - 22, hy - 20, 9, '#222'); circle(x + 22, hy - 20, 9, '#222'); }
    circle(x, hy, 28, hc);
    if (P.kind === 'panda') { ell(x - 10, hy + 1, 7, 9, '#222', 0.4); ell(x + 10, hy + 1, 7, 9, '#222', -0.4); }
    const eyeC = P.kind === 'panda' ? '#fff' : '#2b2420';
    if (mood > 0.5) { ctx.strokeStyle = eyeC; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x - 10, hy + 2, 4, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 10, hy + 2, 4, Math.PI, 0); ctx.stroke(); }
    else if (mood < -0.5) { ctx.strokeStyle = eyeC; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 14, hy - 2); ctx.lineTo(x - 6, hy + 3); ctx.moveTo(x + 14, hy - 2); ctx.lineTo(x + 6, hy + 3); ctx.stroke(); }
    else { circle(x - 10, hy + 1, 3.4, eyeC); circle(x + 10, hy + 1, 3.4, eyeC); }
    ell(x - 17, hy + 10, 5, 3, 'rgba(255,120,140,0.35)'); ell(x + 17, hy + 10, 5, 3, 'rgba(255,120,140,0.35)');
    if (P.kind === 'duck') ell(x, hy + 12, 10, 5, '#ff9f1c');
    else { circle(x, hy + 9, 2.6, '#ff7a8a'); ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x - 3, hy + 12, 3, 0.2, Math.PI - 0.2); ctx.arc(x + 3, hy + 12, 3, 0.2, Math.PI - 0.2); ctx.stroke(); }
    // 셰프 모자
    rr(x - 21, hy - 42, 42, 18, 4); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#e1e4ec'; ctx.lineWidth = 2; ctx.stroke();
    circle(x - 13, hy - 50, 12, '#ffffff'); circle(x + 13, hy - 50, 12, '#ffffff'); circle(x, hy - 58, 14, '#ffffff');
    ctx.fillStyle = P.color; ctx.fillRect(x - 21, hy - 30, 42, 4);
  }
  function drawChefArms(i, x, hand, beatPhase) {
    const hc = HEAD_C[PLAYERS[i].kind], sy = HEAD_Y + 40 - Math.abs(Math.sin(beatPhase * Math.PI)) * 3;
    ctx.lineCap = 'round';
    for (const [sx, hx, hy] of [[x - 32, x - 40, COUNTER_Y + 6], [x + 32, hand.x, hand.y]]) {
      ctx.strokeStyle = '#e1e4ec'; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + (sx > x ? 10 : -10), (sy + hy) / 2 + 6, hx, hy); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12; ctx.stroke();
      circle(hx, hy, 8, hc);
    }
  }

  // ---- 이펙트 ----
  let parts = [], popups = [], flying = [];
  function burst(x, y, n, colors, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = (0.3 + Math.random()) * (spd || 220);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, t: 0, life: 0.4 + Math.random() * 0.4, r: 2 + Math.random() * 3.5, c: colors[(Math.random() * colors.length) | 0] });
    }
  }
  function popup(x, y, str, color, size, sub) { popups.push({ x, y, str, c: color, size, sub, t: 0 }); }
  function updateFx(dt) {
    for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; }
    parts = parts.filter(p => p.t < p.life);
    for (const p of popups) p.t += dt; popups = popups.filter(p => p.t < 0.8);
    for (const f of flying) f.t += dt; flying = flying.filter(f => f.t < f.dur);
    for (let j = 0; j < 3; j++) { judgeHop[j] = Math.max(0, judgeHop[j] - dt * 3); judgeMood[j] *= Math.pow(0.6, dt); }
  }
  function drawFx() {
    for (const f of flying) {
      const k = f.t / f.dur;
      if (f.kind === 'half') { // 썰린 채소 반쪽
        const x = f.x0 + f.dir * 70 * k, y = f.y0 - Math.sin(Math.PI * Math.min(1, k * 1.4)) * 40 + k * k * 50;
        ctx.globalAlpha = 1 - k * k; drawVeg(f.veg, x, y, 0.75, f.dir * k * 3, false); ctx.globalAlpha = 1;
      } else if (f.kind === 'pancake') { // 심사위원에게 날아가는 팬케이크
        const x = lerp(f.x0, f.x1, ease(k)), y = lerp(f.y0, 150, ease(k)) - Math.sin(Math.PI * k) * 120;
        ctx.save(); ctx.translate(x, y); ctx.scale(1, Math.cos(f.t * 16)); ell(0, 0, f.r * lerp(1, 0.6, k), f.r * 0.32 * lerp(1, 0.6, k), f.col); ctx.restore();
      } else if (f.kind === 'fall') { // 떨어져 나가는 재료/채소
        const x = f.x0 + f.dir * 90 * k, y = f.y0 - Math.sin(Math.PI * Math.min(1, k * 2)) * 24 + k * k * 160;
        ctx.globalAlpha = 1 - k;
        if (f.veg) drawVeg(f.veg, x, y, 0.85, f.dir * k * 5, false); else drawIng(f.ing, x, y, 74, f.dir * k * 3);
        ctx.globalAlpha = 1;
      }
    }
    for (const p of parts) { ctx.globalAlpha = 1 - p.t / p.life; circle(p.x, p.y, p.r, p.c); }
    ctx.globalAlpha = 1;
    for (const p of popups) {
      const k = p.t / 0.8, sc = p.t < 0.12 ? backOut(p.t / 0.12) : 1;
      ctx.save(); ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.translate(p.x, p.y - ease(k) * 22); ctx.scale(sc, sc);
      text(p.str, 0, 0, p.size, p.c, 'center', '#ffffff', p.size * 0.22);
      if (p.sub) text(p.sub, 0, p.size * 0.8, p.size * 0.5, '#ffffff', 'center', 'rgba(0,0,0,0.55)', 4);
      ctx.restore();
    }
  }

  /* =========================================================
   * 5. 상태 · UI
   * ========================================================= */
  let screen = 'title', game = null, result = null;
  let diff = Store.get('diff', 'normal'); if (!['normal', 'long', 'challenge'].includes(diff)) diff = 'normal';
  let humans = clamp(Store.get('humans', 1) | 0, 1, 4);
  let calib = Store.get('calib', null);
  let songStart = 0, swingAt = [-9, -9, -9, -9], played = new Set(), lastStage = -1;
  let pressedBtn = null;
  const latency = () => calib != null ? calib : A.defaultLatency();
  const songTime = () => A.now() - songStart - latency();

  const BTN = {
    coop: { x: 60, y: 332, w: 205, h: 84 }, versus: { x: 275, y: 332, w: 205, h: 84 },
    h1: { x: 60, y: 456, w: 96, h: 44 }, h2: { x: 166, y: 456, w: 96, h: 44 }, h3: { x: 272, y: 456, w: 96, h: 44 }, h4: { x: 378, y: 456, w: 102, h: 44 },
    normal: { x: 60, y: 540, w: 133, h: 52 }, long: { x: 203, y: 540, w: 134, h: 52 }, challenge: { x: 347, y: 540, w: 133, h: 52 },
    practice: { x: 60, y: 618, w: 205, h: 60 }, calib: { x: 275, y: 618, w: 205, h: 60 },
    sound: { x: W - 54, y: 10, w: 42, h: 42 }, quit: { x: 12, y: 10, w: 42, h: 42 },
    retry: { x: 110, y: 760, w: 320, h: 66 }, home: { x: 110, y: 838, w: 320, h: 54 },
    cTap: { x: 70, y: 420, w: 400, h: 300 }, cMinus: { x: 70, y: 760, w: 90, h: 54 }, cPlus: { x: 380, y: 760, w: 90, h: 54 },
    cRetry: { x: 170, y: 760, w: 200, h: 54 }, cSave: { x: 110, y: 830, w: 320, h: 60 }
  };
  const inRect = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  function drawButton(b, label, sub, colA, colB, pressed, fs) {
    const dy = pressed ? 4 : 0;
    rr(b.x, b.y + 6, b.w, b.h, 20); ctx.fillStyle = colB; ctx.fill();
    rr(b.x, b.y + dy, b.w, b.h, 20);
    const gr = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); gr.addColorStop(0, colA); gr.addColorStop(1, colB);
    ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
    if (sub) {
      text(label, b.x + b.w / 2, b.y + b.h * 0.38 + dy, fs || 28, '#fff', 'center', 'rgba(0,0,0,0.2)', 5);
      text(sub, b.x + b.w / 2, b.y + b.h * 0.74 + dy, 14, 'rgba(255,255,255,0.95)');
    } else text(label, b.x + b.w / 2, b.y + b.h / 2 + dy, fs || 26, '#fff', 'center', 'rgba(0,0,0,0.2)', 5);
  }
  function chip(b, label, sub, on) {
    rr(b.x, b.y, b.w, b.h, 22); ctx.fillStyle = on ? '#4a2a6a' : 'rgba(255,255,255,0.94)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = on ? '#4a2a6a' : '#e3c4a2'; ctx.stroke();
    if (sub) { text(label, b.x + b.w / 2, b.y + 18, 19, on ? '#fff' : '#8a6a4a'); text(sub, b.x + b.w / 2, b.y + 38, 12, on ? '#e8d8ff' : '#a08a70'); }
    else text(label, b.x + b.w / 2, b.y + b.h / 2 + 1, 19, on ? '#fff' : '#8a6a4a');
  }
  function smallBtn(b, str) { rr(b.x, b.y, b.w, b.h, 14); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill(); text(str, b.x + b.w / 2, b.y + b.h / 2 + 1, 20, '#6a5a6a'); }
  function seatLabel(g, i) {
    const P = g.players[i];
    if (P.ai) return PLAYERS[i].name + (g.mode === 'practice' ? ' 선생님' : ' CPU');
    return g.humans === 1 ? '나' : (i + 1) + 'P';
  }

  function startGame(mode) {
    A.ensure();
    game = createGame(mode, diff, null, humans);
    parts = []; popups = []; flying = []; swingAt = [-9, -9, -9, -9]; played = new Set(); lastStage = -1; judgeMood = [0, 0, 0];
    songStart = A.now() + 0.6;
    A.startSong(game, songStart);
    screen = 'play';
  }
  function finishGame(g) {
    const me = g.players[0];
    const scores = g.players.map(p => p.score), top = Math.max(...scores);
    const place = 1 + scores.filter(s => s > me.score).length;
    const js = judgeScores(g), total = js.reduce((a, b) => a + b, 0);
    let best = 0, isNew = false;
    if (g.humans === 1 && g.mode !== 'practice') {
      const key = 'best.' + g.mode + '.' + g.diff, val = g.mode === 'coop' ? total : me.score;
      best = Store.get(key, 0); isNew = val > best; if (isNew) Store.set(key, val); best = Math.max(best, val);
      if (g.mode === 'versus' && place === 1) Store.set('wins.' + g.diff, Store.get('wins.' + g.diff, 0) + 1);
    }
    const avgOff = me.offsets.length ? me.offsets.reduce((a, b) => a + b, 0) / me.offsets.length : 0;
    result = { g, js, total, grade: gradeFor(total), place, winners: g.players.filter(p => p.score === top).map(p => p.i), best, isNew, avgOff, t: 0, sounds: 0 };
    screen = 'result';
  }

  function handleEvents(g) {
    for (const e of g.events) {
      if (e.type === 'judge') {
        const P = g.players[e.p], human = !P.ai, n = e.n, x = colX(e.p);
        const once = name => { const key = n.hitT.toFixed(3) + name; if (played.has(key)) return; played.add(key); A.play(name); };
        if (e.res !== 'miss') {
          if (human) once(n.course + '-' + e.res); else A.play('aihit', { v: e.res === 'nice' ? 0.3 : 0.18 });
          popup(x, 470, e.res === 'nice' ? '나이스!' : '좋아!', e.res === 'nice' ? '#ff7a1a' : '#2ec4b6', e.res === 'nice' ? 25 : 22, human ? (e.res === 'ok' ? (e.early ? '빨라요' : '늦어요') : '+2') : null);
          if (human && e.res === 'nice') { const j = (Math.random() * 3) | 0; judgeHop[j] = 1; judgeMood[j] = Math.min(1, judgeMood[j] + 0.6); }
        } else {
          if (human) once(n.course === 'flip' && e.d == null ? 'burn' : 'miss');
          popup(x, 470, e.d == null ? '놓침' : (e.d < 0 ? '빨라!' : '늦어!'), '#e5383b', 20);
          if (human) for (let j = 0; j < 3; j++) judgeMood[j] = Math.max(-1, judgeMood[j] - 0.3);
        }
        // 코스별 결과 연출
        if (n.course === 'chop') {
          if (e.res === 'nice') { flying.push({ kind: 'half', veg: n.kind, x0: x - 6, y0: BOARD_Y - 24, dir: -1, t: 0, dur: 0.6 }, { kind: 'half', veg: n.kind, x0: x + 6, y0: BOARD_Y - 24, dir: 1, t: 0, dur: 0.6 }); burst(x, BOARD_Y - 20, 10, [VEG_COL[n.kind], '#ffffff'], 180); }
          else if (e.res === 'ok') { flying.push({ kind: 'half', veg: n.kind, x0: x, y0: BOARD_Y - 24, dir: e.early ? -1 : 1, t: 0, dur: 0.7 }); burst(x, BOARD_Y - 20, 5, [VEG_COL[n.kind]], 120); }
          else flying.push({ kind: 'fall', veg: n.kind, x0: x, y0: BOARD_Y - 24, dir: e.p % 2 ? 1 : -1, t: 0, dur: 0.7 });
        }
        if (n.course === 'flip' && e.res !== 'miss') {
          flying.push({ kind: 'pancake', x0: x, y0: BOARD_Y - 16, x1: 150 + (e.p % 3) * 120, r: [0, 22, 30, 38][n.size], col: e.res === 'nice' ? '#d9913a' : (e.early ? '#ecd09a' : '#a8642a'), t: 0, dur: 0.75 });
          if (e.res === 'nice') burst(x, BOARD_Y - 20, 10, ['#ffd98a', '#ffffff'], 160);
        }
        if (n.course === 'burger') {
          if (e.res === 'miss') flying.push({ kind: 'fall', ing: n.kind, x0: x, y0: stackTop(g, e.p, n.s) - 8, dir: e.early ? 1 : -1, t: 0, dur: 0.7 });
          else burst(x, stackTop(g, e.p, n.s), e.res === 'nice' ? 10 : 4, ['#ffffff', '#ffe08a'], 140);
        }
      } else if (e.type === 'swing') { swingAt[e.p] = clock; if (!g.players[e.p].ai) A.play('swing'); }
      else if (e.type === 'stageEnd') { const pc = teamPct(g, e.s); for (let j = 0; j < 3; j++) { judgeMood[j] = pc > 0.8 ? 1 : pc > 0.6 ? 0.2 : -1; judgeHop[j] = pc > 0.8 ? 1 : 0; } }
      else if (e.type === 'end') setTimeout(() => finishGame(g), 400);
    }
    g.events.length = 0;
  }

  // ---- 박자 보정 ----
  let cal = null;
  function startCalib() { A.ensure(); const bd = 60 / 90; cal = { bd, start: A.now() + 0.5, beats: 16, taps: [], off: null, done: false, sched: 0 }; screen = 'calib'; }
  function calibSchedule() {
    if (!cal || !A.ctx) return;
    while (cal.sched < cal.beats && cal.start + cal.sched * cal.bd < A.now() + 0.15) { A.play('click', { t: cal.start + cal.sched * cal.bd, hi: cal.sched % 4 === 0 }); cal.sched++; }
    if (!cal.done && A.now() > cal.start + cal.beats * cal.bd + 0.3) {
      cal.done = true;
      if (cal.taps.length >= 5) { const s = cal.taps.slice().sort((a, b) => a - b); cal.off = clamp(s[Math.floor(s.length / 2)], -0.05, 0.35); }
    }
  }
  function calibTap(at) {
    if (!cal || cal.done) return;
    const rel = at - cal.start, n = Math.round(rel / cal.bd);
    if (n < 4 || n >= cal.beats) return;
    cal.taps.push(rel - n * cal.bd); A.play('ui');
  }

  /* =========================================================
   * 6. 코스별 조리대 그리기
   * ========================================================= */
  // 버거: 지금 쌓인 재료의 꼭대기 y
  function stackTop(g, i, s) {
    let y = STACK0;
    for (const n of g.players[i].notes) if (n.s === s && n.course === 'burger' && n.res && n.res !== 'miss') y -= ING_H[n.kind];
    return y;
  }
  const swingK = (i, dur) => { const d = clock - swingAt[i]; return d >= 0 && d < dur ? d / dur : -1; };

  // 조리대 위 물건을 그리고, 오른손 위치와 손에 든 도구 그리기 함수를 돌려줌
  function drawStation(g, st, i, t, bi) {
    const x = colX(i), P = g ? g.players[i] : null, guide = g && g.guide;
    const course = st ? st.course : 'chop';
    const sk = swingK(i, 0.22);
    if (course === 'chop') {
      ctx.fillStyle = '#c48e55'; rr(x - 50, BOARD_Y - 6, 100, 18, 6); ctx.fill(); ctx.fillStyle = '#e0ad74'; rr(x - 50, BOARD_Y - 10, 100, 14, 6); ctx.fill();
      if (g) {
        for (const n of P.notes) {
          if (n.s !== st.s || n.res === 'nice' || n.res === 'ok') continue;
          if (n.res === 'miss' && n.at != null) continue;
          if (t < n.cueT || t > n.hitT + 0.25) continue;
          const p = (t - n.cueT) / (n.hitT - n.cueT);
          if (guide && p < 1) { ctx.strokeStyle = 'rgba(255,130,30,' + (0.35 + 0.6 * p) + ')'; ctx.lineWidth = 3; const rr2 = 18 + (1 - p) * 40; ctx.beginPath(); ctx.ellipse(x, BOARD_Y - 10, rr2, rr2 * 0.45, 0, 0, 7); ctx.stroke(); }
          const y = p <= 1 ? lerp(300, BOARD_Y - 24, p * p) : BOARD_Y - 24 - Math.sin(Math.min(1, (p - 1) * 4) * Math.PI) * 26;
          if (p < 1) ell(x, BOARD_Y - 6, 10 + p * 8, 3, 'rgba(0,0,0,' + (0.1 + p * 0.15) + ')');
          drawVeg(n.kind, x + (p > 1 ? (p - 1) * 60 : 0), y, 1, (t - n.cueT) * 2.5, false);
        }
      }
      const ky = sk >= 0 ? (sk < 0.3 ? lerp(640, BOARD_Y - 14, ease(sk / 0.3)) : lerp(BOARD_Y - 14, 640, (sk - 0.3) / 0.7)) : 640 + Math.sin(bi.phase * Math.PI * 2) * 2;
      return {
        hand: { x: x + 40, y: ky + 2 },
        tool() {
          ctx.save(); ctx.translate(x + 6, ky);
          ctx.fillStyle = '#dfe4ec'; ctx.beginPath(); ctx.moveTo(22, -7); ctx.lineTo(-30, -7); ctx.quadraticCurveTo(-38, 4, -26, 8); ctx.lineTo(22, 8); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#aab2c0'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#5a3a24'; rr(22, -5, 24, 10, 4); ctx.fill();
          ctx.restore();
        }
      };
    }
    if (course === 'flip') {
      rr(x - 50, BOARD_Y - 2, 100, 14, 4); ctx.fillStyle = '#3a3f4f'; ctx.fill();
      ell(x, BOARD_Y - 2, 40, 7, '#ff6b3d'); ell(x, BOARD_Y - 2, 28, 4, '#ffd166');
      let lift = 0, tilt = 0;
      if (sk >= 0) { lift = Math.sin(sk * Math.PI) * 16; tilt = -Math.sin(sk * Math.PI) * 0.18; }
      const py = BOARD_Y - 12 - lift;
      return {
        hand: { x: x + 66, y: py + Math.sin(tilt) * 66 },
        tool() {
          ctx.save(); ctx.translate(x, py); ctx.rotate(tilt);
          ctx.fillStyle = '#5a5f6f'; rr(40, -4, 34, 8, 4); ctx.fill();
          ell(0, 0, 48, 13, '#2c3040'); ell(0, -2, 42, 10, '#41465a');
          if (g) for (const n of P.notes) {
            if (n.s !== st.s || t < n.cueT - 0.12 || n.res === 'nice' || n.res === 'ok') continue;
            if (n.res === 'miss' && t > (n.at != null ? n.at : n.hitT + 0.2) + 0.7) continue;
            const r = [0, 22, 30, 38][n.size], c = (t - n.cueT) / (n.hitT - n.cueT);
            if (t < n.cueT) { ctx.fillStyle = '#f7ebc8'; ctx.fillRect(-4, -70 + (n.cueT - t) * 100, 8, 66); continue; }
            const col = c < 1 ? mixHex('#f7ebc8', '#e3a149', c) : mixHex('#e3a149', '#3a2414', clamp((c - 1) * 2.5, 0, 1));
            const grow = Math.min(1, (t - n.cueT) / 0.12);
            ell(0, -3, r * grow, r * 0.3 * grow, col);
            if (c < 1) for (let b = 0; b < 4; b++) circle(Math.cos(b * 1.7 + n.cueT) * r * 0.5, -3 + Math.sin(b * 2.3) * r * 0.12, 1.6, 'rgba(255,255,255,' + (0.3 + 0.5 * c) + ')');
            if (c > 1.2) for (let b = 0; b < 3; b++) circle(Math.sin(t * 3 + b) * 10, -16 - ((t * 40 + b * 12) % 30), 4, 'rgba(90,90,90,0.4)');
            if (guide && c < 1) { ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, -46, 11, 0, 7); ctx.stroke(); ctx.strokeStyle = PLAYERS[i].color; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, -46, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c); ctx.stroke(); }
          }
          ctx.restore();
        }
      };
    }
    // 버거: 접시 + 아래 빵
    ell(x, BOARD_Y + 8, 54, 9, '#ffffff'); ell(x, BOARD_Y + 6, 46, 6, '#eef0f5');
    ctx.fillStyle = '#e8a24c'; rr(x - 40, STACK0, 80, 14, 7); ctx.fill();
    let y = STACK0;
    if (g) {
      for (const n of P.notes) {
        if (n.s !== st.s || n.course !== 'burger' || !n.res || n.res === 'miss') continue;
        const off = n.res === 'ok' ? clamp(n.d * 120, -12, 12) : 0, rot = n.res === 'ok' ? clamp(n.d * 1.5, -0.12, 0.12) : 0;
        drawIng(n.kind, x + off, y, 80, rot); y -= ING_H[n.kind];
      }
      for (const n of P.notes) {
        if (n.s !== st.s || n.res || t < n.cueT || t > n.hitT + 0.2) continue;
        const pts = n.hopTs.concat([n.hitT]), hops = n.hopTs.length;
        let k = 0; while (k < pts.length - 1 && t >= pts[k + 1]) k++;
        const seg = k < pts.length - 1 ? (t - pts[k]) / (pts[k + 1] - pts[k]) : 1 + (t - n.hitT) / 0.2;
        const fx = kk => x + 54 - 54 * Math.min(1, kk / hops);
        const hx = k < pts.length - 1 ? lerp(fx(k), fx(k + 1), seg) : x - (seg - 1) * 30;
        const hy = y - 30 - Math.sin(Math.PI * clamp(seg, 0, 1)) * 30 + (k >= hops - 1 ? clamp(seg, 0, 1) * 6 : 0);
        if (guide) { ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(120,80,40,0.5)'; ctx.lineWidth = 2; rr(x - 42, y - ING_H[n.kind] - 4, 84, ING_H[n.kind] + 4, 6); ctx.stroke(); ctx.setLineDash([]); }
        drawIng(n.kind, hx, hy, 74, Math.sin(t * 9) * 0.08);
      }
    }
    const top = y;
    const py = sk >= 0 ? (sk < 0.3 ? lerp(top - 56, top - 14, ease(sk / 0.3)) : lerp(top - 14, top - 56, (sk - 0.3) / 0.7)) : top - 56;
    return {
      hand: { x: x + 46, y: py },
      tool() { ctx.fillStyle = '#9aa1b3'; rr(x - 26, py - 4, 52, 8, 3); ctx.fill(); ctx.fillStyle = '#5a3a24'; rr(x + 22, py - 3, 30, 6, 3); ctx.fill(); }
    };
  }

  function drawStations(g, st, t, bi) {
    for (let i = 0; i < 4; i++) {
      let mood = 0;
      if (g) { const P = g.players[i], last = P.notes.filter(n => n.res && (n.at != null ? n.at : n.hitT + 0.2) > t - 0.6).pop(); if (last) mood = last.res === 'nice' ? 1 : last.res === 'miss' ? -1 : 0; }
      drawChefBody(i, colX(i), bi.phase, mood);
    }
    drawCounter();
    for (let i = 0; i < 4; i++) {
      const S = drawStation(g, st, i, t, bi);
      drawChefArms(i, colX(i), S.hand, bi.phase);
      S.tool();
    }
    // 이름표 (조리대 앞판)
    for (let i = 0; i < 4; i++) {
      const x = colX(i);
      rr(x - 54, 748, 108, 62, 14); ctx.fillStyle = g && !g.players[i].ai ? 'rgba(255,255,255,0.97)' : 'rgba(255,250,240,0.85)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = PLAYERS[i].color; ctx.stroke();
      smallHead(PLAYERS[i].kind, x - 34, 768, 10);
      if (g) {
        const P = g.players[i];
        text(seatLabel(g, i), x - 20, 768, seatLabel(g, i).length > 5 ? 12 : 15, '#5a4a5a', 'left');
        if (g.mode !== 'practice' || !P.ai) text(String(P.score), x, 794, 22, PLAYERS[i].color, 'center', '#fff', 3);
        else text('시범', x, 794, 15, '#a08a70');
        if (!P.ai && g.humans > 1) { rr(x - 18, 820, 36, 30, 8); ctx.fillStyle = PLAYERS[i].color; ctx.fill(); text(PLAYERS[i].key, x, 836, 18, '#fff'); }
      } else { text(PLAYERS[i].name, x - 20, 768, 15, '#5a4a5a', 'left'); text('셰프', x, 794, 14, '#a08a70'); }
    }
  }

  /* =========================================================
   * 7. 화면별 그리기
   * ========================================================= */
  function beatInfo(t, bd) { const b = t / bd; return { phase: ((b % 1) + 1) % 1, idx: Math.floor(b) }; }

  function drawPlay(time) {
    const g = game, t = songTime(), st = stageAt(g, t), lt = t - st.start, bi = beatInfo(lt, st.bd), v = view();
    drawKitchen(time);
    const inBreak = t >= st.playEnd;
    drawJudgeTable(time, null);
    // 협동: 팀 점수 막대 / 대결(혼자): 순위
    const me = g.players[0];
    if (g.mode === 'coop') {
      const pc = teamPct(g);
      rr(120, 196, 300, 22, 11); ctx.fillStyle = 'rgba(80,50,30,0.25)'; ctx.fill();
      rr(120, 196, Math.max(22, 300 * pc), 22, 11); ctx.fillStyle = pc > 0.85 ? '#ff9f1c' : pc > 0.6 ? '#2ec4b6' : '#8d99ae'; ctx.fill();
      text((g.humans === 1 ? '내 요리 ' : '팀 ') + Math.round(pc * 100) + '%', 270, 208, 15, '#ffffff', 'center', 'rgba(0,0,0,0.35)', 3);
    } else if (g.mode === 'versus' && g.humans === 1) {
      const place = 1 + g.players.filter(p => p.score > me.score).length;
      text('지금 ' + place + '위', 270, 208, 19, place === 1 ? '#ff7a1a' : '#5a3a24', 'center', '#fff', 4);
    } else if (g.mode === 'practice') text('선생님 셰프들의 타이밍을 보고 따라 해 보세요', 270, 208, 15, '#8a6a4a');
    drawStations(g, st, t, bi);
    drawFx();
    // 상단 띠
    smallBtn(BTN.quit, '✕'); smallBtn(BTN.sound, A.on ? '🔊' : '🔇');
    rr(66, 8, 408, 48, 16); ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill();
    const C = COURSES[st.course];
    text((st.s + 1) + '코스 · ' + C.emoji + ' ' + C.name, 250, 26, 19, '#5a3a24');
    text(DIFFS[g.diff].label + ' · ' + st.bpm + 'BPM' + (st.round === 2 ? ' · 스피드업!' : ''), 250, 45, 12, '#a08a70');
    for (let s = 0; s < g.stages.length; s++) circle(408 + (s - (g.stages.length - 1) / 2) * 13, 32, 4.5, s < st.s || (s === st.s && inBreak) ? '#ff9f1c' : s === st.s ? '#4a2a6a' : '#ddd6e8');
    // 코스 시작 안내 + 카운트
    if (!inBreak && lt < INTRO * st.bd) {
      const beat = lt / st.bd, k = clamp(lt / 0.35, 0, 1);
      ctx.save(); ctx.globalAlpha = beat > INTRO - 0.5 ? (INTRO - beat) * 2 : 1;
      rr(40, 300, 460, 200, 26); ctx.fillStyle = 'rgba(255,250,240,0.96)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#ffb347'; ctx.stroke();
      ctx.save(); ctx.translate(270, 348); ctx.scale(backOut(k), backOut(k)); text(C.emoji + ' ' + C.name, 0, 0, 38, '#ff7a1a', 'center', '#7a2e12', 7); ctx.restore();
      if (st.round === 2) text('스피드 업!', 430, 312, 18, '#ffffff', 'center', '#e5383b', 5);
      text(C.how, 270, 398, 18, '#5a3a24');
      if (C.how2) text(C.how2, 270, 424, 14, '#8a6a4a');
      const how = g.humans === 1 ? '맨 왼쪽 냥이가 나! 화면 아무 곳이나 탭 (PC: 스페이스바)' : '자기 칸을 탭하거나 키를 누르세요 (A · F · J · L)';
      text(how, 270, 452, 14, '#c0563a');
      if (beat >= INTRO - 4) text(String(Math.max(1, Math.ceil(INTRO - beat))), 270, 478, 30, '#4a2a6a');
      else text('곡을 들으며 박자를 느껴 보세요', 270, 478, 14, '#a08a70');
      ctx.restore();
    }
    // 코스 사이 쉬는 시간: 코스 결과
    if (inBreak) {
      const bt = t - st.playEnd, k = backOut(clamp(bt / 0.35, 0, 1));
      ctx.save(); ctx.translate(270, 420); ctx.scale(k, k); ctx.translate(-270, -420);
      rr(40, 296, 460, 250, 26); ctx.fillStyle = 'rgba(255,250,240,0.97)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#ffb347'; ctx.stroke();
      text(C.emoji + ' ' + C.name + ' 완성!', 270, 336, 28, '#7a2e12');
      if (g.mode === 'coop' || g.mode === 'practice') {
        const pc = g.mode === 'coop' ? teamPct(g, st.s) : me.stageScore[st.s] / Math.max(1, me.stageMax[st.s]);
        text((g.mode === 'coop' && g.humans > 1 ? '팀 ' : '내 요리 ') + Math.round(pc * 100) + '%', 270, 392, 44, pc > 0.85 ? '#ff7a1a' : '#2ec4b6', 'center', '#fff', 6);
        text(pc > 0.9 ? '심사위원: "환상적인 맛이야!"' : pc > 0.75 ? '심사위원: "꽤 맛있는걸?"' : pc > 0.55 ? '심사위원: "음… 나쁘지 않아"' : '심사위원: "이건 좀…"', 270, 440, 17, '#5a3a24');
      } else {
        const order = g.players.slice().sort((a, b) => b.stageScore[st.s] - a.stageScore[st.s]);
        order.forEach((P, r) => {
          const y = 382 + r * 30;
          smallHead(PLAYERS[P.i].kind, 150, y, 11);
          text(seatLabel(g, P.i), 170, y, 16, '#5a3a24', 'left');
          text('+' + P.stageScore[st.s] + '점 (합계 ' + P.score + ')', 400, y, 16, PLAYERS[P.i].color, 'right');
        });
      }
      const nx = g.stages[st.s + 1];
      text(nx ? '다음: ' + COURSES[nx.course].emoji + ' ' + COURSES[nx.course].name + (nx.round === 2 ? ' (스피드 업!)' : '') : '심사 결과 발표!', 270, 514, 17, '#a08a70');
      ctx.restore();
    }
  }

  function drawIdle(time) {
    const bi = beatInfo(time, 0.6);
    drawKitchen(time);
    drawJudgeTable(time, null);
    drawStations(null, null, 0, bi);
  }

  function drawTitle(time) {
    drawIdle(time);
    const v = view();
    ctx.fillStyle = 'rgba(40,20,30,0.5)'; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    const bounce = Math.sin(time * 2.4) * 5;
    ctx.save(); ctx.translate(270, 200 + bounce); ctx.rotate(-0.03);
    rr(-210, -82, 420, 150, 34); ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#ffb347'; ctx.stroke();
    text('쿵짝 키친', 0, -18, 68, '#ff7a1a', 'center', '#7a2e12', 12);
    text('BEAT KITCHEN', 0, 40, 24, '#e5383b', 'center', '#fff', 6);
    ctx.save(); ctx.translate(-176, -70); ctx.rotate(-0.3); circle(0, 0, 0.1, '#fff'); text('🍳', 0, 0, 36, '#000'); ctx.restore();
    ctx.restore();
    const bc = Store.get('best.coop.' + diff, 0), wins = Store.get('wins.' + diff, 0);
    drawButton(BTN.coop, '협동 요리', '넷이 힘 합쳐 별점 받기', '#ffa94d', '#f0761e', pressedBtn === 'coop', 26);
    drawButton(BTN.versus, '요리 대결', '점수로 겨뤄 셰프왕!', '#ef6b5b', '#c9402f', pressedBtn === 'versus', 26);
    text('함께 할 사람 (빈자리는 CPU 셰프)', 270, 440, 15, '#ffffff', 'center', 'rgba(0,0,0,0.5)', 4);
    for (let n = 1; n <= 4; n++) chip(BTN['h' + n], n + '명', null, humans === n);
    text('난이도', 270, 524, 15, '#ffffff', 'center', 'rgba(0,0,0,0.5)', 4);
    for (const k of ['normal', 'long', 'challenge']) chip(BTN[k], DIFFS[k].label, DIFFS[k].sub, diff === k);
    drawButton(BTN.practice, '연습', '느리게 · 선생님 시범', '#5fcbe8', '#2192c7', pressedBtn === 'practice', 22);
    drawButton(BTN.calib, '🎧 박자 보정', calib != null ? Math.round(calib * 1000) + 'ms 적용 중' : '자동', '#b49ae8', '#8a6cc9', pressedBtn === 'calib', 22);
    rr(20, 700, W - 40, 246, 22); ctx.fillStyle = 'rgba(255,248,236,0.96)'; ctx.fill();
    text('응원가 박자에 맞춰 3코스 요리 완성!', 270, 726, 19, '#5a3a24');
    text('🥕 채소 탕탕 — 떨어지는 채소를 도마에서 썰기', 270, 758, 15, '#8a6a4a');
    text('🥞 팬케이크 뒤집기 — 차례대로, 노릇할 때 뒤집기', 270, 784, 15, '#8a6a4a');
    text('🍔 버거 쌓기 — 뛰어오던 재료가 빵 위에 오면 꾹', 270, 810, 15, '#8a6a4a');
    text('딱 맞으면 나이스! 2점 · 살짝 빗나가면 1점', 270, 842, 15, '#5a3a24');
    text((DIFFS[diff].label) + ' 최고 별점 ' + bc + '/30 · 대결 1등 ' + wins + '회', 270, 870, 14, '#a08a70');
    text('PC: 스페이스바 / 여럿이면 A · F · J · L', 270, 896, 14, '#a08a70');
    text('블루투스 이어폰이면 박자 보정을 먼저 해 주세요', 270, 922, 14, '#c0563a');
    smallBtn(BTN.sound, A.on ? '🔊' : '🔇');
  }

  function drawCalib(time) {
    calibSchedule();
    const t = cal ? A.now() - cal.start : 0, bi = beatInfo(Math.max(0, t), cal ? cal.bd : 1), v = view();
    drawIdle(time);
    ctx.fillStyle = 'rgba(40,20,30,0.65)'; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    rr(40, 120, 460, 780, 30); ctx.fillStyle = 'rgba(255,250,242,0.97)'; ctx.fill();
    text('🎧 박자 보정', 270, 170, 34, '#4a2a6a');
    text('딸깍 소리에 맞춰 큰 원을 탭하세요', 270, 220, 19, '#5a3a24');
    text('처음 4번은 듣기만, 그다음 12번을 탭!', 270, 248, 16, '#8a6a4a');
    text('소리가 늦게 나오는 기기(블루투스 이어폰 등)를 맞춰 줘요', 270, 274, 14, '#a08a70');
    const n = cal ? Math.floor(t / cal.bd) : 0, active = cal && !cal.done && t >= 0, listen = n < 4;
    const p = active ? Math.max(0, 1 - bi.phase * 3) : 0, b = BTN.cTap;
    circle(270, b.y + b.h / 2, 110 + p * 18, active ? (listen ? '#c9b8f0' : '#ffa94d') : '#d9d0e6');
    circle(270, b.y + b.h / 2, 90, 'rgba(255,255,255,0.35)');
    text(!active ? (cal && cal.done ? '끝!' : '준비') : listen ? '듣기 ' + (4 - n) : '탭!', 270, b.y + b.h / 2 - 6, 46, '#ffffff', 'center', 'rgba(0,0,0,0.25)', 6);
    if (active && !listen) text(cal.taps.length + ' / 12', 270, b.y + b.h / 2 + 40, 20, '#ffffff');
    if (cal && cal.done) {
      if (cal.off != null) text('측정한 지연: ' + Math.round(cal.off * 1000) + 'ms', 270, 745, 22, '#4a2a6a');
      else text('탭이 너무 적어요. 다시 해 주세요', 270, 745, 18, '#e5383b');
      drawButton(BTN.cMinus, '-10', null, '#c9b8f0', '#9a86d0', pressedBtn === 'cMinus', 22);
      drawButton(BTN.cPlus, '+10', null, '#c9b8f0', '#9a86d0', pressedBtn === 'cPlus', 22);
      drawButton(BTN.cRetry, '다시 측정', null, '#5fcbe8', '#2192c7', pressedBtn === 'cRetry', 22);
      drawButton(BTN.cSave, cal.off != null ? '저장하고 돌아가기' : '돌아가기', null, '#ffa94d', '#f0761e', pressedBtn === 'cSave', 24);
    } else text('지금 설정: ' + (calib != null ? Math.round(calib * 1000) + 'ms' : '자동 (' + Math.round(A.defaultLatency() * 1000) + 'ms)'), 270, 760, 17, '#8a6a4a');
  }

  function drawResult(time, dt) {
    const r = result, g = r.g, me = g.players[0], v = view();
    r.t += dt;
    const signs = g.mode === 'coop' ? r.js.map((s, j) => r.t > 0.8 + j * 0.45 ? s : null) : null;
    // 심사위원 점수판 소리
    while (g.mode === 'coop' && r.sounds < 3 && r.t > 0.8 + r.sounds * 0.45) { A.play('card', { k: r.js[r.sounds] }); judgeHop[r.sounds] = 1; judgeMood[r.sounds] = r.js[r.sounds] >= 8 ? 1 : r.js[r.sounds] >= 5 ? 0.1 : -1; r.sounds++; }
    if (r.sounds === 3 && r.t > 2.3) { r.sounds = 4; A.play(g.mode === 'coop' ? (r.grade.stars >= 2 ? 'fanfare' : r.grade.stars === 1 ? 'bell' : 'sad') : (g.humans > 1 || r.place === 1 ? 'fanfare' : 'sad')); }
    if (g.mode !== 'coop' && r.sounds < 3) r.sounds = 3;
    drawKitchen(time);
    drawJudgeTable(time, signs);
    ctx.fillStyle = 'rgba(40,20,30,' + Math.min(0.45, r.t) + ')'; ctx.fillRect(v.x0, 230, v.x1 - v.x0, v.y1 - 230);
    const k = backOut(Math.min(1, r.t / 0.4));
    ctx.save(); ctx.translate(270, 560); ctx.scale(k, k); ctx.translate(-270, -560);
    rr(36, 236, 468, 676, 30); ctx.fillStyle = '#fffaf2'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#ffb347'; ctx.stroke();
    const multi = g.humans > 1;
    let rows = [];
    if (g.mode === 'coop') {
      text('오늘의 심사 결과', 270, 270, 24, '#7a2e12');
      if (r.t > 2.2) {
        const s = backOut(clamp((r.t - 2.2) / 0.3, 0, 1));
        ctx.save(); ctx.translate(270, 330); ctx.scale(s, s);
        text(r.total + ' / 30', 0, -6, 52, r.grade.color, 'center', '#fff', 8);
        ctx.restore();
        text('★'.repeat(r.grade.stars) + '☆'.repeat(3 - r.grade.stars), 270, 382, 30, '#ffb000');
        text(r.grade.title, 270, 418, 28, r.grade.color, 'center', '#fff', 5);
      } else text('심사위원이 점수를 매기는 중…', 270, 340, 18, '#a08a70');
      g.stages.forEach((st, s) => rows.push([(st.round === 2 ? '(스피드업) ' : '') + COURSES[st.course].emoji + ' ' + COURSES[st.course].name, (g.humans > 1 ? '팀 ' : '') + Math.round(teamPct(g, st.s) * 100) + '%']));
      if (g.stages.length > 3) rows = [0, 1, 2].map(c => [rows[c][0], rows[c][1].replace('팀 ', '') + ' → ' + rows[c + 3][1].replace('팀 ', '') + ' (스피드업)']);
      if (multi) g.players.filter(P => !P.ai).forEach(P => rows.push([seatLabel(g, P.i) + ' ' + PLAYERS[P.i].name, '나이스 ' + P.nice + ' · 좋아 ' + P.ok + ' · 놓침 ' + P.miss]));
      else rows.push(['내 기록', '나이스 ' + me.nice + ' · 좋아 ' + me.ok + ' · 놓침 ' + me.miss], ['최고 별점 (' + DIFFS[g.diff].label + ')', r.best + '/30' + (r.isNew ? ' 신기록!' : '')]);
    } else if (g.mode === 'versus') {
      const head = !multi ? (r.place === 1 ? '1등! 오늘의 셰프왕!' : r.place + '등') : (r.winners.length > 1 ? '공동 1등!' : seatLabel(g, r.winners[0]) + ' 셰프왕!');
      if (r.t > 1.2) { const s = backOut(clamp((r.t - 1.2) / 0.3, 0, 1)); ctx.save(); ctx.translate(270, 280); ctx.scale(s, s); text(head, 0, 0, 38, '#fff', 'center', multi || r.place === 1 ? '#ff7a1a' : '#8a6a4a', 10); ctx.restore(); }
      const grow = ease(clamp((r.t - 0.3) / 0.9, 0, 1)), top = Math.max(...g.players.map(p => p.score));
      g.players.forEach((P, i) => {
        const x = 104 + i * 111, base = 480, h = 140 * (P.score / P.max) * grow;
        rr(x - 28, base - h, 56, Math.max(h, 1), 10); ctx.fillStyle = PLAYERS[i].color; ctx.fill();
        smallHead(PLAYERS[i].kind, x, base + 24, 16);
        text(seatLabel(g, i), x, base + 54, 15, P.ai ? '#9a8a9a' : '#4a2a6a');
        text(String(Math.round(P.score * grow)), x, base - h - 14, 20, '#3b2a20');
        if (r.t > 1.2 && P.score === top) text('👑', x, base - h - 40, 22, '#000');
      });
      if (multi) rows = g.players.filter(P => !P.ai).map(P => [seatLabel(g, P.i) + ' ' + PLAYERS[P.i].name, '나이스 ' + P.nice + ' · 좋아 ' + P.ok + ' · 놓침 ' + P.miss]);
      else rows = [['나이스 · 좋아 · 놓침', me.nice + ' · ' + me.ok + ' · ' + me.miss], ['최대 연속', me.maxCombo + '번'], ['최고 점수 (' + DIFFS[g.diff].label + ')', r.best + '점' + (r.isNew ? ' 신기록!' : '')]];
    } else {
      text('연습 결과', 270, 274, 26, '#7a2e12');
      text(me.score + ' / ' + me.max, 270, 330, 50, '#ff7a1a', 'center', '#fff', 7);
      const off = r.avgOff, ox = 270 + clamp(off / 0.12, -1, 1) * 150;
      text('평균 타이밍', 270, 382, 16, '#8a7a9a');
      rr(110, 398, 320, 14, 7); ctx.fillStyle = '#eee6f5'; ctx.fill();
      rr(270 - 150 * NICE / 0.12, 398, 300 * NICE / 0.12, 14, 7); ctx.fillStyle = '#ffd98a'; ctx.fill();
      circle(ox, 405, 11, '#ff7a1a');
      text('빠름', 92, 405, 14, '#a08a70'); text('늦음', 450, 405, 14, '#a08a70');
      text(Math.abs(off) < 0.015 ? '박자 감각 최고!' : (off < 0 ? '평균 ' + Math.round(-off * 1000) + 'ms 빨라요' : '평균 ' + Math.round(off * 1000) + 'ms 늦어요'), 270, 434, 15, '#5a3a24');
      g.stages.forEach(st => rows.push([COURSES[st.course].emoji + ' ' + COURSES[st.course].name, me.stageScore[st.s] + ' / ' + me.stageMax[st.s]]));
      rows.push(['나이스 · 좋아 · 놓침', me.nice + ' · ' + me.ok + ' · ' + me.miss]);
      if (Math.abs(off) > 0.06) rows.push(['팁', '박자 보정을 해 보세요']);
    }
    const y0 = g.mode === 'versus' ? 568 : 466;
    rows.forEach((row, i) => {
      const y = y0 + i * 36;
      text(row[0], 66, y, 17, '#8a6a4a', 'left');
      text(row[1], W - 66, y, 17, /신기록/.test(row[1]) ? '#ff4f6d' : '#3b2a20', 'right');
    });
    drawButton(BTN.retry, '한 판 더', null, '#ffa94d', '#f0761e', pressedBtn === 'retry');
    drawButton(BTN.home, '처음으로', null, '#c9b8a3', '#a8957f', pressedBtn === 'home', 22);
    ctx.restore();
  }

  /* =========================================================
   * 8. 입력
   * ========================================================= */
  function toLogical(e) { return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale }; }
  function doSwing(e, seat) {
    if (!game || screen !== 'play') return;
    const P = game.players[seat];
    if (!P || P.ai) return;
    swing(game, seat, A.eventTime(e) - songStart - latency());
  }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    A.ensure();
    const p = toLogical(e);
    if (screen !== 'result' && inRect(p, BTN.sound)) { A.setOn(!A.on); return; }
    if (screen === 'play') {
      if (inRect(p, BTN.quit)) { A.stopSong(); game = null; screen = 'title'; return; }
      doSwing(e, game.humans === 1 ? 0 : clamp(Math.floor(p.x / 135), 0, 3)); return;
    }
    if (screen === 'calib') {
      if (cal && !cal.done && inRect(p, BTN.cTap)) { calibTap(A.eventTime(e)); return; }
      if (cal && cal.done) for (const k of ['cMinus', 'cPlus', 'cRetry', 'cSave']) if (inRect(p, BTN[k])) pressedBtn = k;
      return;
    }
    if (screen === 'title') {
      for (const k of ['coop', 'versus', 'practice', 'calib']) if (inRect(p, BTN[k])) pressedBtn = k;
      for (const k of ['normal', 'long', 'challenge']) if (inRect(p, BTN[k])) { diff = k; Store.set('diff', diff); A.play('ui'); }
      for (let n = 1; n <= 4; n++) if (inRect(p, BTN['h' + n])) { humans = n; Store.set('humans', n); A.play('ui'); }
      return;
    }
    if (screen === 'result') {
      if (result.t < 1.5) return;
      if (inRect(p, BTN.retry)) pressedBtn = 'retry'; else if (inRect(p, BTN.home)) pressedBtn = 'home';
    }
  });
  canvas.addEventListener('pointerup', function (e) {
    e.preventDefault();
    if (!pressedBtn) return;
    const b = pressedBtn, p = toLogical(e); pressedBtn = null;
    if (!inRect(p, BTN[b])) return;
    A.play('ui');
    if (b === 'coop' || b === 'versus' || b === 'practice') startGame(b);
    else if (b === 'calib') startCalib();
    else if (b === 'retry') startGame(result.g.mode);
    else if (b === 'home') screen = 'title';
    else if (b === 'cMinus') { if (cal.off != null) cal.off = clamp(cal.off - 0.01, -0.05, 0.35); }
    else if (b === 'cPlus') { if (cal.off != null) cal.off = clamp(cal.off + 0.01, -0.05, 0.35); }
    else if (b === 'cRetry') startCalib();
    else if (b === 'cSave') { if (cal.off != null) { calib = cal.off; Store.set('calib', calib); } cal = null; screen = 'title'; }
  });
  canvas.addEventListener('pointercancel', () => { pressedBtn = null; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  const SEAT_KEYS = { KeyA: 0, KeyF: 1, KeyJ: 2, KeyL: 3 };
  const SOLO_KEYS = ['Space', 'Enter', 'KeyJ', 'KeyF', 'KeyK', 'KeyD', 'KeyA', 'KeyL'];
  window.addEventListener('keydown', function (e) {
    const multi = screen === 'play' && game && game.humans > 1;
    if (!(multi ? e.code in SEAT_KEYS : SOLO_KEYS.includes(e.code))) return;
    e.preventDefault();
    if (e.repeat) return;
    A.ensure();
    if (screen === 'play') doSwing(e, multi ? SEAT_KEYS[e.code] : 0);
    else if (screen === 'calib' && cal && !cal.done) calibTap(A.eventTime(e));
    else if (screen === 'title' && e.code === 'Enter') { A.play('ui'); startGame('coop'); }
    else if (screen === 'result' && result.t > 1.5 && e.code === 'Enter') { A.play('ui'); startGame(result.g.mode); }
  });
  document.addEventListener('visibilitychange', function () {
    if (!A.ctx) return;
    if (document.hidden) A.ctx.suspend(); else A.ctx.resume();
  });

  /* =========================================================
   * 9. 메인 루프
   * ========================================================= */
  let last = performance.now(), clock = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = document.hidden ? 0 : Math.min(0.05, (now - last) / 1000); last = now;
    clock += dt;
    if (screen === 'play' && game) { update(game, songTime()); handleEvents(game); }
    updateFx(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
    if (screen === 'title') drawTitle(clock);
    else if (screen === 'play' && game) drawPlay(clock);
    else if (screen === 'calib') drawCalib(clock);
    else if (screen === 'result') drawResult(clock, dt);
  }
  if (document.fonts && document.fonts.load) {
    Promise.race([document.fonts.load('40px "Jua"'), new Promise(r => setTimeout(r, 1500))]).then(() => requestAnimationFrame(frame), () => requestAnimationFrame(frame));
  } else requestAnimationFrame(frame);
})();
