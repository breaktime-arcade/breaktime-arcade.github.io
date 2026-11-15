/* 땡 셔터 · 해질녘 심부름 대작전 · 쉬는시간 오락실 (smile-willow.tistory.com) · 무단 복제·재배포 금지 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const quantum = 100;
  const duration = 600;
  const countdown = 3000;
  const VIEW = 30;
  const ITEMS = {
    egg: { name: '계란', icon: '🥚', shop: '슈퍼' },
    milk: { name: '우유', icon: '🥛', shop: '슈퍼' },
    ramen: { name: '라면', icon: '🍜', shop: '슈퍼' },
    battery: { name: '건전지', icon: '🔋', shop: '철물점' },
    note: { name: '공책', icon: '📒', shop: '문방구' },
    sprout: { name: '콩나물', icon: '🌱', shop: '채소가게' },
    apple: { name: '사과', icon: '🍎', shop: '과일가게' },
    oil: { name: '참기름', icon: '🍶', shop: '방앗간' },
    fish: { name: '붕어빵', icon: '🐟', shop: '붕어빵', snack: true },
    odeng: { name: '어묵', icon: '🍢', shop: '분식', snack: true },
    candy: { name: '사탕', icon: '🍬', shop: '문방구', snack: true }
  };
  const LIST_POOL = ['egg', 'milk', 'ramen', 'battery', 'note', 'sprout', 'apple', 'oil'];
  const SNACKS = ['fish', 'odeng', 'candy'];
  const SHOP_STYLE = { 슈퍼: '#e8503a', 철물점: '#4a6fc9', 문방구: '#f0912a', 채소가게: '#3fa45b', 과일가게: '#d9476b', 방앗간: '#9a6236', 붕어빵: '#c9472f', 분식: '#e26a2c' };
  const PHASES = ['노을 질 무렵', '가로등 켜질 때', '마감 직전'];
  const COLORS = ['#ff6b5a', '#3fb5e8', '#ffc23d', '#7bd36a'];
  const ANIMALS = ['수달', '판다', '너구리', '다람쥐', '토끼', '펭귄'];
  const INK = '#3b2a20';
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const FONT = '"Jua","Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let view = 'home';
  let match;
  let demo;
  let soundOn = false;
  let held = null;
  let nextRepeat = 0;
  let lastDirectionTime = 0;
  let lastHud = '';

  /* ───────────── 골목 만들기 (같은 열쇠 → 같은 골목) ───────────── */
  function randomFor(key) {
    let seed = 2166136261;
    for (const ch of key) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
    if (!seed) seed = 7;
    return () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  }
  const phaseOf = (step) => (step < 200 ? 0 : step < 400 ? 1 : 2);

  function makeCourse(key) {
    const rng = randomFor(key);
    const pool = shuffle(LIST_POOL.slice(), rng);
    const list = pool.slice(0, 4);
    const queue = [];
    list.forEach((p) => queue.push(p, p, p));
    queue.push(...SNACKS, ...SNACKS, pool[4], pool[5], pool[6]);
    shuffle(queue, rng);
    for (let k = 0; k < 2; k++) {
      const j = queue.findIndex((p, i) => i >= k && list.includes(p));
      [queue[k], queue[j]] = [queue[j], queue[k]];
    }
    const shops = [];
    const obstacles = [];
    const bells = [];
    let pending = null;
    let qi = 0;
    let count = 0;
    for (let t = 26; t < 584;) {
      const phase = phaseOf(t);
      const make = (side) => {
        const product = queue[qi++ % queue.length];
        const stock = ITEMS[product].snack ? 2 : (rng() < .4 ? 2 : 1);
        const slack = phase === 0 ? 4 + Math.floor(rng() * 26) : phase === 1 ? -8 + Math.floor(rng() * 24) : -12 + Math.floor(rng() * 22);
        shops.push({ id: shops.length, t, side, product, stock, closeAt: t + slack });
        if (pending) { pending.target = shops.length - 1; pending = null; }
      };
      const side = rng() < .5 ? 0 : 3;
      make(side);
      if (phase > 0 && rng() < .38) make(3 - side);
      const gap = [30, 26, 22][phase] + Math.floor(rng() * 5);
      const mid = t + Math.floor(gap / 2);
      if (mid < 592) {
        const lanes = phase === 2 && rng() < .35 ? [1, 2] : [rng() < .5 ? 1 : 2];
        if (phase > 0 && rng() < .25) lanes.push(rng() < .5 ? 0 : 3);
        const kinds = ['puddle', 'cat', 'cart', 'scooter'];
        lanes.forEach((lane) => obstacles.push({ t: mid, lane, kind: lane === 0 || lane === 3 ? 'boxes' : kinds[Math.floor(rng() * kinds.length)] }));
      }
      count++;
      if (count % 4 === 2 && !pending) {
        const bell = { t: t + Math.max(4, Math.floor(gap * .25)), lane: rng() < .5 ? 1 : 2, target: null };
        bells.push(bell);
        pending = bell;
      }
      t += gap;
    }
    return { list, shops, obstacles, bells: bells.filter((b) => b.target !== null) };
  }

  /* ───────────── 규칙 시뮬레이션 ───────────── */
  const order = (a, b) => a.since - b.since || a.index - b.index;
  const alive = (p, t) => t - p.fall >= 10;
  function blocked(course, lane, from, to) { return course.obstacles.some((o) => o.lane === lane && o.t > from && o.t <= to); }

  function botMove(course, state, p, t, r) {
    if (r > .985) return r > .9925 ? 1 : -1;
    let goal = p.lane;
    let best = 0;
    for (const shop of course.shops) {
      if (shop.t <= t + 2) continue;
      if (shop.t > t + 22) break;
      const s = state[shop.id];
      if (s.closeAt <= shop.t + 1 || s.stock <= 0) continue;
      const value = course.list.includes(shop.product) && !p.have.has(shop.product) ? 3 : 1;
      const score = value * 10 - (shop.t - t) * .3 - Math.abs(shop.side - p.lane);
      if (score > best) { best = score; goal = shop.side; }
    }
    if (best < 12) {
      const bell = course.bells.find((b) => b.t > t + 1 && b.t <= t + 12);
      if (bell && r < .6) goal = bell.lane;
    }
    const danger = blocked(course, p.lane, t, t + 4) && r > .12;
    if (goal === p.lane) {
      if (!danger) return 0;
      const options = [p.lane - 1, p.lane + 1].filter((l) => l >= 0 && l <= 3 && !blocked(course, l, t, t + 4));
      return options.length ? Math.sign(options[Math.floor(r * 7) % options.length] - p.lane) : 0;
    }
    const d = Math.sign(goal - p.lane);
    if (blocked(course, p.lane + d, t, t + 3) && !danger) return 0;
    return danger || r < .62 ? d : 0;
  }

  function simulate(course, players, inputs, through, key) {
    const start = [1, 2, 0, 3];
    const actor = players.map((p, i) => ({ ...p, index: i, color: COLORS[i], lane: start[i], since: -10 + i, score: 0, bag: [], have: new Set(), done: false, next: 0, fall: -100 }));
    const state = course.shops.map((s) => ({ stock: s.stock, closeAt: s.closeAt, sale: false, bought: 0 }));
    const rung = new Set();
    const log = [];
    const brain = actor.map((p) => randomFor(`${key}|bot|${p.uid}`));
    let si = 0, oi = 0, bi = 0;
    for (let t = 0; t <= through; t++) {
      for (const p of actor) {
        const r = p.bot ? brain[p.index]() : 0;
        if (t < p.next || !alive(p, t)) continue;
        const d = p.bot ? botMove(course, state, p, t, r) : (inputs.get(p.uid)?.get(t) ?? 0);
        if (!d) continue;
        const lane = Math.max(0, Math.min(3, p.lane + d));
        if (lane === p.lane) continue;
        p.lane = lane; p.since = t; p.next = t + 2;
      }
      while (oi < course.obstacles.length && course.obstacles[oi].t <= t) {
        const o = course.obstacles[oi++];
        if (o.t !== t) continue;
        for (const p of actor) if (p.lane === o.lane && alive(p, t)) { p.fall = t; log.push({ t, type: 'fall', uid: p.uid, lane: p.lane, kind: o.kind }); }
      }
      while (bi < course.bells.length && course.bells[bi].t <= t) {
        const b = course.bells[bi++];
        if (b.t !== t) continue;
        const ringer = actor.filter((p) => p.lane === b.lane && alive(p, t)).sort(order)[0];
        if (!ringer) continue;
        ringer.score += 1;
        const s = state[b.target];
        s.closeAt = Math.max(s.closeAt, course.shops[b.target].t + 30);
        s.stock += 2;
        s.sale = true;
        rung.add(bi - 1);
        log.push({ t, type: 'bell', uid: ringer.uid, lane: b.lane, target: b.target });
      }
      while (si < course.shops.length && course.shops[si].t <= t) {
        const shop = course.shops[si++];
        if (shop.t !== t) continue;
        const s = state[shop.id];
        for (const p of actor.filter((a) => a.lane === shop.side).sort(order)) {
          if (!alive(p, t)) continue;
          if (t >= s.closeAt) { log.push({ t, type: 'closed', uid: p.uid, lane: p.lane, shop: shop.id }); continue; }
          if (s.stock <= 0) { log.push({ t, type: 'soldout', uid: p.uid, lane: p.lane, shop: shop.id }); continue; }
          s.stock--; s.bought++;
          const listed = course.list.includes(shop.product) && !p.have.has(shop.product);
          let gain = listed ? 3 : 1;
          p.bag.push(shop.product);
          if (listed) p.have.add(shop.product);
          let complete = false;
          if (!p.done && p.have.size === course.list.length) { p.done = true; gain += 5; complete = true; }
          p.score += gain;
          log.push({ t, type: 'buy', uid: p.uid, lane: p.lane, shop: shop.id, product: shop.product, gain, listed, complete });
        }
      }
    }
    return { actor, state, log, rung };
  }

  /* ───────────── 사운드 (코드로 만든 장터 음악·효과음) ───────────── */
  let audio, audioBus, audioMusic, audioSfx, audioVerb, audioDelay, audioNoise;
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);
  const bpm = [112, 120, 134];
  const progression = [[48, 0], [45, 1], [41, 0], [43, 0]];
  const scale = [0, 2, 4, 7, 9, 12, 14, 16];

  function unlockAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (!audioBus) {
      audioBus = audio.createGain();
      audioBus.gain.value = 0;
      const limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -12; limiter.ratio.value = 5; limiter.attack.value = .004; limiter.release.value = .2;
      audioBus.connect(limiter).connect(audio.destination);
      audioMusic = audio.createGain(); audioMusic.gain.value = .45; audioMusic.connect(audioBus);
      audioSfx = audio.createGain(); audioSfx.gain.value = .9; audioSfx.connect(audioBus);
      const len = Math.floor(audio.sampleRate * 1.4);
      const ir = audio.createBuffer(2, len, audio.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
      audioVerb = audio.createConvolver(); audioVerb.buffer = ir;
      const vo = audio.createGain(); vo.gain.value = .25; audioVerb.connect(vo).connect(audioBus);
      audioDelay = audio.createDelay(1); audioDelay.delayTime.value = .27;
      const fb = audio.createGain(); fb.gain.value = .28;
      audioDelay.connect(fb).connect(audioDelay);
      const dout = audio.createGain(); dout.gain.value = .22; audioDelay.connect(dout).connect(audioBus);
      audioNoise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const n = audioNoise.getChannelData(0);
      for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    }
    audioBus.gain.setTargetAtTime(soundOn ? .75 : 0, audio.currentTime, .03);
    if (soundOn && audio.state === 'suspended') void audio.resume().catch(() => {});
  }
  function sends(node, verb, echo) {
    if (verb) { const s = audio.createGain(); s.gain.value = verb; node.connect(s).connect(audioVerb); }
    if (echo) { const s = audio.createGain(); s.gain.value = echo; node.connect(s).connect(audioDelay); }
  }
  function voice({ type = 'sine', freq, to = freq, gain = .1, attack = .005, length = .2, when = 0, cutoff = 0, out = audioSfx, verb = 0, echo = 0, detune = 0 }) {
    const t = audio.currentTime + Math.max(0, when);
    const osc = audio.createOscillator();
    const env = audio.createGain();
    osc.type = type; osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + length);
    env.gain.setValueAtTime(.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + Math.min(attack, length * .5));
    env.gain.exponentialRampToValueAtTime(.0001, t + length);
    let node = osc;
    if (cutoff) { const f = audio.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; osc.connect(f); node = f; }
    node.connect(env).connect(out);
    sends(env, verb, echo);
    osc.start(t); osc.stop(t + length + .05);
  }
  function hiss({ freq = 1000, to = freq, type = 'bandpass', gain = .1, length = .1, when = 0, q = 1, out = audioSfx }) {
    const t = audio.currentTime + Math.max(0, when);
    const src = audio.createBufferSource();
    const f = audio.createBiquadFilter();
    const env = audio.createGain();
    src.buffer = audioNoise;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to !== freq) f.frequency.exponentialRampToValueAtTime(to, t + length);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(.0001, t + length);
    src.connect(f).connect(env).connect(out);
    src.start(t, Math.random() * .6); src.stop(t + length + .02);
  }
  function marimba(note, when, gain = .12, out = audioSfx, echo = 0) {
    voice({ freq: midi(note), gain, length: .32, when, out, echo });
    voice({ freq: midi(note) * 4, gain: gain * .25, length: .05, when, out });
  }
  function musicStep(phase, index, when) {
    const s = index % 16, bar = Math.floor(index / 16);
    const [root, minor] = progression[bar % 4];
    const chord = [0, minor ? 3 : 4, 7];
    const step = 60 / bpm[phase] / 4;
    const out = audioMusic;
    if (s % 4 === 0) voice({ type: 'triangle', freq: midi(root - 12), gain: .22, length: step * 3, when, out });
    if (s % 4 === 2) {
      voice({ type: 'triangle', freq: midi(root - 5), gain: .12, length: step * 1.5, when, out });
      chord.forEach((n, i) => voice({ type: 'sawtooth', freq: midi(root + 12 + n), gain: .026, length: step * 1.7, when, cutoff: 1500, out, detune: i * 7 - 7 }));
    }
    if (s % 8 === 4) voice({ freq: 1050, to: 800, gain: .1, length: .05, when, out });
    if (s % 2 === 1 || phase === 2) hiss({ freq: 7000, type: 'highpass', gain: s % 2 ? .035 : .02, length: .04, when, out });
    const hash = ((bar * 31 + s * 7 + phase * 13) * 2654435761 >>> 0) % 100;
    if ((s % 2 === 0 || (phase === 2 && hash < 40)) && hash < 72) {
      const note = 72 + scale[hash % scale.length] + (s === 0 ? 0 : 0);
      marimba(note - (root % 12 === 0 ? 0 : 0), when, .085, out, .18);
    }
  }
  function music(current, elapsed) {
    const ahead = elapsed + 160, end = duration * quantum;
    if (!soundOn || audio?.state !== 'running' || elapsed >= end || current.attract) { current.musicCursor = ahead; return; }
    let cursor = current.musicCursor ?? elapsed;
    if (cursor < elapsed - 200) cursor = elapsed;
    cursor = Math.max(0, cursor);
    for (let guard = 0; guard < 64; guard++) {
      const phase = Math.min(2, Math.floor(cursor / 20000));
      const origin = phase * 20000;
      const stepMs = 60000 / bpm[phase] / 4;
      const index = Math.ceil((cursor - origin) / stepMs - 1e-6);
      const at = origin + index * stepMs;
      if (phase < 2 && at >= origin + 20000) { cursor = origin + 20000; continue; }
      if (at > ahead || at >= end) break;
      musicStep(phase, index, (at - elapsed) / 1000);
      cursor = at + .5;
    }
    current.musicCursor = cursor;
  }
  function tone(event, extra) {
    if (!soundOn || audio?.state !== 'running') return;
    if (event === 'buy') {
      const notes = extra?.complete ? [72, 76, 79, 84, 88] : extra?.listed ? [76, 79, 84] : [79, 84];
      notes.forEach((n, i) => marimba(n, i * .06, .16, audioSfx, .25));
      voice({ freq: 2637, gain: .05, length: .4, when: .05, verb: .4 });
      if (extra?.complete) [60, 64, 67].forEach((n) => voice({ type: 'sawtooth', freq: midi(n), gain: .05, length: 1.1, when: .32, cutoff: 2200, verb: .5 }));
    } else if (event === 'soldout') {
      voice({ type: 'square', freq: 392, to: 370, gain: .07, length: .2, cutoff: 1200 });
      voice({ type: 'square', freq: 330, to: 260, gain: .07, length: .38, when: .2, cutoff: 1200 });
    } else if (event === 'closed') {
      for (let i = 0; i < 7; i++) hiss({ freq: 2200, gain: .1, length: .025, when: i * .032, q: 3 });
      voice({ type: 'square', freq: 110, to: 60, gain: .15, length: .18, when: .23, cutoff: 600 });
      hiss({ freq: 900, type: 'lowpass', gain: .25, length: .2, when: .23 });
    } else if (event === 'rattle') {
      for (let i = 0; i < 5; i++) hiss({ freq: 2600, gain: .035, length: .02, when: i * .035, q: 3 });
    } else if (event === 'fall') {
      voice({ freq: 140, to: 40, gain: .45, length: .3 });
      hiss({ freq: 1500, to: 200, type: 'lowpass', gain: .35, length: .3 });
      [1568, 1760, 1568, 1976].forEach((f, i) => voice({ type: 'triangle', freq: f, gain: .045, length: .08, when: .25 + i * .07 }));
    } else if (event === 'bell') {
      for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) { voice({ freq: 2650, gain: .09, length: .16, when: k * .32 + i * .055 }); voice({ freq: 3980, gain: .04, length: .1, when: k * .32 + i * .055 }); }
      [67, 72, 76, 72].forEach((n, i) => voice({ type: 'square', freq: midi(n), gain: .045, length: .18, when: .7 + i * .16, cutoff: 1800, verb: .3 }));
    } else if (event === 'move') {
      hiss({ freq: 1200, to: 2600, gain: .05, length: .08, q: 2 });
    } else if (event === 'phase') {
      [72, 76, 79, 84].forEach((n, i) => marimba(n, i * .09, .12, audioSfx, .3));
    } else if (event === 'go') {
      for (let i = 0; i < 2; i++) { voice({ freq: 2650, gain: .1, length: .2, when: i * .12 }); voice({ freq: 3980, gain: .05, length: .12, when: i * .12 }); }
    } else if (event === 'finish') {
      [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => marimba(n, i * .1, .15, audioSfx, .2));
      [48, 55, 64, 67].forEach((n) => voice({ type: 'sawtooth', freq: midi(n), gain: .04, attack: .1, length: 1.6, when: .7, cutoff: 1800, verb: .6 }));
    } else {
      marimba(84, 0, .14);
    }
  }

  /* ───────────── 그리기 도우미 ───────────── */
  function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mix(a, b, k) { const A = hexToRgb(a), B = hexToRgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`; }
  function keyed(stops, p) {
    let i = 0;
    while (i < stops.length - 2 && p > stops[i + 1][0]) i++;
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
    const k = Math.max(0, Math.min(1, (p - p0) / (p1 - p0)));
    return c0.map((c, j) => mix(c, c1[j], k));
  }
  const SKY = [[0, ['#ff9e6e', '#ffc48a', '#ffe3a6']], [.36, ['#d9709a', '#ff8f70', '#ffc38a']], [.68, ['#5a4a9a', '#b0609a', '#ff9a7a']], [1, ['#1c1f4a', '#3a3270', '#7a4f8a']]];
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function ellipse(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, Math.PI * 2); }
  const glowCache = new Map();
  function glow(color) {
    let c = glowCache.get(color);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const [R, G, B] = hexToRgb(color);
    r.addColorStop(0, `rgba(${R},${G},${B},.9)`); r.addColorStop(.35, `rgba(${R},${G},${B},.35)`); r.addColorStop(1, `rgba(${R},${G},${B},0)`);
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
    return c;
  }
  function geometry(W, H) {
    const horizon = H * .36, line = H * .86;
    const lw = (d) => W * (.04 + .135 * d);
    const y = (d) => horizon + (line - horizon) * Math.max(0, d) ** 1.5;
    const x = (b, d) => W / 2 + (b - 2) * lw(d);
    return { W, H, horizon, line, lw, x, y };
  }
  function ground(ctx, g, a, b, d1, d2) {
    ctx.beginPath();
    ctx.moveTo(g.x(a, d1), g.y(d1)); ctx.lineTo(g.x(b, d1), g.y(d1));
    ctx.lineTo(g.x(b, d2), g.y(d2)); ctx.lineTo(g.x(a, d2), g.y(d2));
    ctx.closePath();
  }
  const skylines = new Map();
  function skyline(W, horizon) {
    const key = `${W}|${horizon}`;
    let c = skylines.get(key);
    if (c) return c;
    skylines.clear();
    c = document.createElement('canvas');
    c.width = Math.ceil(W); c.height = Math.ceil(horizon * .5);
    const g = c.getContext('2d');
    const rng = randomFor('skyline');
    g.fillStyle = '#000';
    for (let x = 0; x < W;) {
      const w = 14 + rng() * 26, h = c.height * (.25 + rng() * .65);
      g.fillRect(x, c.height - h, w, h);
      if (rng() < .25) g.fillRect(x + w * .3, c.height - h - 8, 3, 8);
      if (rng() < .12) { g.fillRect(x + w * .2, c.height - h - 14, w * .5, 10); g.fillRect(x + w * .35, c.height - h - 4, 2, 4); }
      x += w + rng() * 4;
    }
    skylines.set(key, c);
    return c;
  }

  /* ───────────── 그리기: 가게·장애물·아이 ───────────── */
  function drawShop(ctx, cx, by, w, h, shop, s, step, me, course, time) {
    const item = ITEMS[shop.product];
    const color = SHOP_STYLE[item.shop];
    const lw = Math.max(1, w * .022);
    const p = Math.max(0, Math.min(1, (step - (s.closeAt - 22)) / 22));
    ctx.save();
    ctx.translate(cx - w / 2, by - h);
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(40,20,30,.22)';
    ellipse(ctx, w / 2, h, w * .6, h * .05); ctx.fill();
    rrect(ctx, 0, h * .16, w, h * .84, w * .04); ctx.fillStyle = '#f6e3c8'; ctx.fill(); ctx.stroke();
    rrect(ctx, -w * .05, 0, w * 1.1, h * .25, w * .05); ctx.fillStyle = color; ctx.fill(); ctx.stroke();
    if (h > 26) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.min(h * .16, w * .3)}px ${FONT}`;
      ctx.fillText(item.shop, w / 2, h * .135);
    }
    const ay = h * .25, ah = h * .1, n = 6;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : color;
      ctx.fillRect(i * w / n, ay, w / n + .5, ah);
      ctx.beginPath(); ctx.arc((i + .5) * w / n, ay + ah, w / n / 2, 0, Math.PI); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(w, ay); ctx.stroke();
    const dx = w * .1, dy = h * .42, dw = w * .8, dh = h * .54;
    const inside = ctx.createLinearGradient(0, dy, 0, dy + dh);
    inside.addColorStop(0, '#ffe7a8'); inside.addColorStop(1, '#eba35c');
    ctx.fillStyle = inside; ctx.fillRect(dx, dy, dw, dh);
    if (h > 18) {
      ctx.font = `${dh * .44}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(item.icon, w / 2, dy + dh * .42);
      const dots = Math.min(5, s.stock);
      for (let i = 0; i < dots; i++) { ellipse(ctx, w / 2 + (i - (dots - 1) / 2) * dw * .16, dy + dh * .85, dw * .05, dw * .05); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = lw * .6; ctx.stroke(); }
      ctx.lineWidth = lw;
    }
    if (p > 0) {
      ctx.fillStyle = '#a9b1bb'; ctx.fillRect(dx, dy, dw, dh * p);
      ctx.strokeStyle = '#7b8490'; ctx.lineWidth = Math.max(.6, lw * .5);
      for (let k = dh * .07; k < dh * p; k += dh * .08) { ctx.beginPath(); ctx.moveTo(dx, dy + k); ctx.lineTo(dx + dw, dy + k); ctx.stroke(); }
      ctx.fillStyle = '#5d646d'; ctx.fillRect(dx, dy + dh * p - dh * .05, dw, dh * .05);
      if (p >= 1 && h > 30) { ctx.fillStyle = INK; ctx.font = `${h * .1}px ${FONT}`; ctx.fillText('영업 끝', w / 2, dy + dh * .5); }
      ctx.strokeStyle = INK; ctx.lineWidth = lw;
    }
    ctx.strokeRect(dx, dy, dw, dh);
    if (p > 0 && p < 1 && h > 24) {
      ctx.fillStyle = '#fff'; rrect(ctx, w * .08, h * .3, w * .84 * (1 - p), h * .05, 2); ctx.fill();
    }
    if (s.stock <= 0 && p < 1 && h > 24) {
      ctx.save(); ctx.translate(w / 2, dy + dh * .45); ctx.rotate(-.25);
      ctx.strokeStyle = '#e8303a'; ctx.lineWidth = Math.max(1.5, w * .035);
      rrect(ctx, -w * .34, -h * .09, w * .68, h * .18, 4); ctx.stroke();
      ctx.fillStyle = '#e8303a'; ctx.font = `${h * .13}px ${FONT}`; ctx.fillText('품절', 0, 1);
      ctx.restore();
    }
    if (s.sale && p < 1 && h > 24) {
      ctx.fillStyle = '#ffd23f'; rrect(ctx, w * .55, -h * .12, w * .55, h * .14, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = `${h * .1}px ${FONT}`; ctx.fillText('떨이!', w * .825, -h * .05);
    }
    if (me && course.list.includes(shop.product) && !me.have.has(shop.product) && p < 1 && s.stock > 0) {
      const bob = reducedMotion ? 0 : Math.sin(time / 160) * h * .04;
      ctx.translate(w / 2, -h * .18 + bob);
      ctx.fillStyle = '#ffffff'; rrect(ctx, -w * .32, -h * .1, w * .64, h * .13, 8); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w * .06, h * .03); ctx.lineTo(0, h * .08); ctx.lineTo(w * .06, h * .03); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8503a'; ctx.font = `${Math.max(8, h * .09)}px ${FONT}`; ctx.fillText('쪽지!', 0, -h * .035);
    }
    ctx.restore();
  }

  function drawObstacle(ctx, cx, by, s, kind, time) {
    ctx.save();
    ctx.translate(cx, by);
    ctx.lineWidth = Math.max(1, s * .03); ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(40,20,30,.25)'; ellipse(ctx, 0, 0, s * .36, s * .07); ctx.fill();
    if (kind === 'puddle') {
      ellipse(ctx, 0, -s * .01, s * .42, s * .1); ctx.fillStyle = '#6cb4e4'; ctx.fill(); ctx.stroke();
      ellipse(ctx, -s * .12, -s * .03, s * .1, s * .025); ctx.fillStyle = '#d8f0ff'; ctx.fill();
      const r = (time / 600) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${(.7 * (1 - r)).toFixed(2)})`; ellipse(ctx, s * .1, -s * .01, s * .05 + r * s * .18, (s * .05 + r * s * .18) * .25); ctx.stroke();
    } else if (kind === 'cat') {
      ctx.fillStyle = '#f5a04a';
      ctx.beginPath(); ctx.moveTo(-s * .26, -s * .1); ctx.quadraticCurveTo(-s * .5, -s * .3, -s * .34, -s * .42); ctx.lineWidth = Math.max(2, s * .06); ctx.stroke(); ctx.strokeStyle = '#f5a04a'; ctx.lineWidth = Math.max(1, s * .04); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * .03);
      ellipse(ctx, 0, -s * .14, s * .28, s * .15); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * .1, -s * .38); ctx.lineTo(s * .14, -s * .5); ctx.lineTo(s * .22, -s * .4); ctx.moveTo(s * .26, -s * .4); ctx.lineTo(s * .34, -s * .5); ctx.lineTo(s * .36, -s * .36); ctx.fill(); ctx.stroke();
      ellipse(ctx, s * .23, -s * .3, s * .14, s * .12); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#c86f26';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * s * .1, -s * .27); ctx.lineTo(i * s * .1 + s * .03, -s * .18); ctx.stroke(); }
      ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(s * .17, -s * .3); ctx.lineTo(s * .21, -s * .29); ctx.moveTo(s * .26, -s * .29); ctx.lineTo(s * .3, -s * .3); ctx.stroke();
      if (s > 20) { ctx.fillStyle = '#fff'; ctx.font = `${s * .16}px ${FONT}`; ctx.textAlign = 'center'; const z = reducedMotion ? 0 : (time / 400) % 1; ctx.globalAlpha = 1 - z; ctx.fillText('z', s * .38, -s * .55 - z * s * .2); ctx.globalAlpha = 1; }
    } else if (kind === 'cart') {
      ctx.fillStyle = '#b07a45'; ctx.fillRect(-s * .36, -s * .42, s * .72, s * .3); ctx.strokeRect(-s * .36, -s * .42, s * .72, s * .3);
      for (let i = -2; i <= 2; i++) { ellipse(ctx, i * s * .13, -s * .46, s * .08, s * .07); ctx.fillStyle = i % 2 ? '#8ccf5a' : '#6ab64a'; ctx.fill(); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(s * .36, -s * .3); ctx.lineTo(s * .5, -s * .2); ctx.stroke();
      for (const wx of [-s * .24, s * .24]) { ellipse(ctx, wx, -s * .1, s * .1, s * .1); ctx.fillStyle = '#4a3b30'; ctx.fill(); ctx.stroke(); }
    } else if (kind === 'scooter') {
      for (const wx of [-s * .26, s * .26]) { ellipse(ctx, wx, -s * .09, s * .09, s * .09); ctx.fillStyle = '#2d2a33'; ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = '#e8503a';
      ctx.beginPath(); ctx.moveTo(-s * .32, -s * .15); ctx.lineTo(s * .3, -s * .15); ctx.lineTo(s * .22, -s * .32); ctx.lineTo(-s * .1, -s * .32); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * .22, -s * .3); ctx.lineTo(s * .28, -s * .55); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(-s * .36, -s * .62, s * .32, s * .3); ctx.strokeRect(-s * .36, -s * .62, s * .32, s * .3);
      if (s > 26) { ctx.fillStyle = '#e8503a'; ctx.font = `${s * .1}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('배달', -s * .2, -s * .47); }
    } else {
      [[-s * .2, 0, .34], [s * .16, 0, .3], [-s * .02, -s * .28, .28]].forEach(([bx, byy, k]) => {
        ctx.fillStyle = '#d4a26a'; ctx.fillRect(bx - s * k / 2, byy - s * k * .9, s * k, s * k * .9); ctx.strokeRect(bx - s * k / 2, byy - s * k * .9, s * k, s * k * .9);
        ctx.strokeStyle = '#a8763f'; ctx.beginPath(); ctx.moveTo(bx, byy - s * k * .9); ctx.lineTo(bx, byy); ctx.stroke(); ctx.strokeStyle = INK;
      });
    }
    ctx.restore();
  }

  function drawBell(ctx, cx, by, s, time) {
    ctx.save();
    ctx.translate(cx, by);
    ctx.lineWidth = Math.max(1, s * .03); ctx.strokeStyle = INK;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .5 + .3 * Math.sin(time / 150);
    ctx.drawImage(glow('#ffd23f'), -s * .5, -s * .95, s, s);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(40,20,30,.25)'; ellipse(ctx, 0, 0, s * .2, s * .05); ctx.fill();
    ctx.fillStyle = '#7a6a5e'; ctx.fillRect(-s * .03, -s * .45, s * .06, s * .45); ctx.strokeRect(-s * .03, -s * .45, s * .06, s * .45);
    const swing = reducedMotion ? 0 : Math.sin(time / 120) * .15;
    ctx.translate(0, -s * .45); ctx.rotate(swing);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.moveTo(-s * .2, 0); ctx.quadraticCurveTo(-s * .2, -s * .32, 0, -s * .34); ctx.quadraticCurveTo(s * .2, -s * .32, s * .2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ellipse(ctx, 0, s * .02, s * .05, s * .05); ctx.fill(); ctx.stroke();
    ctx.rotate(-swing);
    if (s > 22) {
      ctx.fillStyle = '#fff'; rrect(ctx, -s * .3, -s * .62, s * .6, s * .17, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8503a'; ctx.font = `${s * .12}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('떨이 종', 0, -s * .535);
    }
    ctx.restore();
  }

  function drawPole(ctx, cx, by, s, night, time) {
    ctx.save();
    ctx.translate(cx, by);
    ctx.lineWidth = Math.max(1, s * .025); ctx.strokeStyle = INK;
    ctx.fillStyle = '#6b5a50';
    ctx.fillRect(-s * .035, -s * 2.4, s * .07, s * 2.4); ctx.strokeRect(-s * .035, -s * 2.4, s * .07, s * 2.4);
    ctx.fillRect(-s * .22, -s * 2.25, s * .44, s * .05);
    const dir = cx < ctx.canvas.clientWidth / 2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(0, -s * 1.9); ctx.lineTo(dir * s * .3, -s * 1.95); ctx.stroke();
    ctx.fillStyle = night > .2 ? '#fff4b8' : '#d8d2c4';
    ellipse(ctx, dir * s * .32, -s * 1.92, s * .07, s * .04); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawKid(ctx, x, y, s, p, me, time, fallen, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(1.2, s * .035); ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(40,20,30,.28)'; ellipse(ctx, 0, 0, s * .3, s * .07); ctx.fill();
    if (fallen) ctx.rotate(.95 * (p.index % 2 ? 1 : -1));
    else ctx.rotate(tilt);
    const pedal = reducedMotion || fallen ? 0 : Math.sin(time / 85 + p.index * 2);
    const bob = pedal * s * .015;
    rrect(ctx, -s * .06, -s * .44, s * .12, s * .44, s * .06); ctx.fillStyle = '#2d2a33'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5b5f6a';
    rrect(ctx, -s * .08 + pedal * s * .06, -s * .3, s * .07, s * .16, 3); ctx.fill(); ctx.stroke();
    rrect(ctx, s * .01 - pedal * s * .06, -s * .3, s * .07, s * .16, 3); ctx.fill(); ctx.stroke();
    ctx.translate(0, bob);
    ctx.fillStyle = '#c98b4a'; rrect(ctx, -s * .24, -s * .62, s * .48, s * .2, 4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#a06a33'; ctx.beginPath(); ctx.moveTo(-s * .2, -s * .52); ctx.lineTo(s * .2, -s * .52); ctx.stroke(); ctx.strokeStyle = INK;
    const bagCount = Math.min(4, p.bag.length);
    for (let i = 0; i < bagCount; i++) { ellipse(ctx, (i - (bagCount - 1) / 2) * s * .1, -s * .66, s * .05, s * .05); ctx.fillStyle = ['#fff', '#ffd23f', '#8ccf5a', '#ff8a7a'][i]; ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.moveTo(-s * .2, -s * .62); ctx.lineTo(-s * .16, -s * 1.0); ctx.lineTo(s * .16, -s * 1.0); ctx.lineTo(s * .2, -s * .62); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * .16, -s * .95); ctx.lineTo(-s * .34, -s * .82); ctx.moveTo(s * .16, -s * .95); ctx.lineTo(s * .34, -s * .82); ctx.lineWidth = Math.max(2, s * .07); ctx.stroke(); ctx.strokeStyle = '#ffd9b5'; ctx.lineWidth = Math.max(1, s * .04); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * .035);
    ctx.beginPath(); ctx.moveTo(-s * .38, -s * .8); ctx.lineTo(s * .38, -s * .8); ctx.stroke();
    ellipse(ctx, 0, -s * 1.15, s * .18, s * .18); ctx.fillStyle = '#3b2a20'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(0, -s * 1.18, s * .19, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill(); ctx.stroke();
    ellipse(ctx, 0, -s * 1.36, s * .04, s * .04); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd9b5'; ellipse(ctx, -s * .18, -s * 1.12, s * .04, s * .05); ctx.fill(); ellipse(ctx, s * .18, -s * 1.12, s * .04, s * .05); ctx.fill();
    ctx.restore();
    if (fallen) {
      for (let i = 0; i < 3; i++) {
        const a = time / 220 + i * 2.1;
        star(ctx, x + Math.cos(a) * s * .32, y - s * 1.25 + Math.sin(a) * s * .1, s * .08, '#ffd23f');
      }
    }
    if (me) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      rrect(ctx, x - 14, y - s * 1.7 - 18, 28, 18, 8); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 5, y - s * 1.7); ctx.lineTo(x, y - s * 1.7 + 6); ctx.lineTo(x + 5, y - s * 1.7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = `13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('나', x, y - s * 1.7 - 9);
    } else if (s > 18) {
      ctx.font = `${Math.max(10, s * .2)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(p.short, x, y - s * 1.55);
      ctx.fillStyle = INK; ctx.fillText(p.short, x, y - s * 1.55);
    }
  }
  function star(ctx, x, y, r, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  }

  /* ───────────── 효과 ───────────── */
  function burst(current, kind, x, y, extra = {}) {
    const now = performance.now();
    const P = current.particles;
    const add = (p) => P.push({ born: now, rot: Math.random() * 6, spin: (Math.random() - .5) * 8, g: 0, drag: .97, size: 4, ...p });
    if (reducedMotion && kind !== 'icon') return;
    if (kind === 'dust') for (let i = 0; i < 12; i++) { const a = -Math.PI * Math.random(); add({ kind: 'dust', x, y, vx: Math.cos(a) * (40 + Math.random() * 90), vy: Math.sin(a) * (20 + Math.random() * 50), life: 500 + Math.random() * 300, size: 6 + Math.random() * 8 }); }
    if (kind === 'stars') for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.4, sp = 120 + Math.random() * 200; add({ kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 300, life: 500 + Math.random() * 400, size: 4 + Math.random() * 4, color: ['#ffd23f', '#fff', '#ff8a7a', '#8ccf5a'][i % 4] }); }
    if (kind === 'icon') add({ kind: 'icon', x, y, tx: extra.tx, ty: extra.ty, icon: extra.icon, life: 750, size: extra.size ?? 30 });
    if (kind === 'confetti') for (let i = 0; i < 110; i++) add({ kind: 'confetti', x: Math.random() * extra.W, y: -10 - Math.random() * 200, vx: (Math.random() - .5) * 60, vy: 60 + Math.random() * 120, g: 50, drag: .995, life: 2600 + Math.random() * 1500, size: 5 + Math.random() * 4, color: COLORS[i % 4] });
    if (kind === 'notes') for (let i = 0; i < 6; i++) add({ kind: 'text', text: ['♪', '♫'][i % 2], x: x + (Math.random() - .5) * 40, y, vx: (Math.random() - .5) * 60, vy: -80 - Math.random() * 60, life: 900, size: 18, color: '#ffd23f' });
    if (P.length > 260) P.splice(0, P.length - 260);
  }
  function popup(current, text, color, opts = {}) { current.popups.push({ text, color, time: performance.now(), ...opts }); }

  /* ───────────── 장면 그리기 ───────────── */
  function paint(canvas, current, frame, step, elapsed) {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(W * ratio), py = Math.round(H * ratio);
    if (canvas.width !== px || canvas.height !== py) { canvas.width = px; canvas.height = py; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const time = performance.now();
    const dt = Math.min(50, time - (current.lastPaint ?? time));
    current.lastPaint = time;
    const g = geometry(W, H);
    current.layout = g;
    const { horizon, line, x, y, lw } = g;
    const progress = Math.max(0, Math.min(1, elapsed / (duration * quantum)));
    const night = smooth(.42, 1, progress);
    const me = frame.actor.find((a) => a.uid === current.uid);
    const travel = reducedMotion ? 0 : step;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (current.shake && !reducedMotion) {
      const a = (time - current.shake.time) / 320;
      if (a < 1) { const k = current.shake.power * (1 - a) ** 2; ctx.translate((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k); }
    }

    const [top, midC, low] = keyed(SKY, progress);
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, top); sky.addColorStop(.6, midC); sky.addColorStop(1, low);
    ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, horizon + 12);
    if (night > 0) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 40; i++) { ctx.globalAlpha = night * (.4 + .6 * Math.abs(Math.sin(time / 700 + i))); ctx.fillRect(((i * 137) % 997) / 997 * W, ((i * 71) % 89) / 89 * horizon * .7, 1.6, 1.6); }
      ctx.globalAlpha = 1;
    }
    const sunY = horizon * (.45 + progress * .95);
    const sunR = Math.min(W, H) * .09;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .55 * (1 - night);
    ctx.drawImage(glow('#ffb36b'), W * .62 - sunR * 3, sunY - sunR * 3, sunR * 6, sunR * 6);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ellipse(ctx, W * .62, sunY, sunR, sunR); ctx.fillStyle = mix('#ffe08a', '#ff7a4a', progress); ctx.fill();
    if (night > .3) { ctx.globalAlpha = smooth(.3, .7, night); ellipse(ctx, W * .25, horizon * .3, sunR * .55, sunR * .55); ctx.fillStyle = '#fff6d6'; ctx.fill(); ellipse(ctx, W * .25 + sunR * .25, horizon * .3 - sunR * .12, sunR * .48, sunR * .48); ctx.fillStyle = top; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 4; i++) {
      const cx = ((i * .29 + time * .000012 * (i + 1)) % 1.3 - .15) * W, cy = horizon * (.18 + i * .12);
      ctx.globalAlpha = .7 * (1 - night * .7);
      for (const [ox, r] of [[0, 1], [.8, .8], [-.8, .7], [.3, .9]]) { ellipse(ctx, cx + ox * 18, cy, 18 * r, 9 * r); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    const sk = skyline(W, horizon);
    ctx.globalAlpha = .28 + night * .35; ctx.drawImage(sk, 0, horizon - sk.height); ctx.globalAlpha = 1;

    ctx.fillStyle = mix('#c9a07e', '#4a3f5e', night);
    ctx.fillRect(0, horizon, W, H - horizon);
    ground(ctx, g, 1, 3, 0, 1.4); ctx.fillStyle = mix('#6a6176', '#3a3550', night); ctx.fill();
    ground(ctx, g, 0, 1, 0, 1.4); ctx.fillStyle = mix('#e8c79c', '#7a6a80', night); ctx.fill();
    ground(ctx, g, 3, 4, 0, 1.4); ctx.fill();
    ctx.strokeStyle = mix('#c9a57e', '#5e5070', night); ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const d = ((i + travel * .19) % 14) / 14 * 1.4;
      ctx.beginPath(); ctx.moveTo(x(0, d), y(d)); ctx.lineTo(x(1, d), y(d)); ctx.moveTo(x(3, d), y(d)); ctx.lineTo(x(4, d), y(d)); ctx.stroke();
    }
    for (const b of [1, 3]) { ground(ctx, g, b - .05, b + .05, 0, 1.4); ctx.fillStyle = '#ffd23f'; ctx.fill(); }
    ctx.fillStyle = mix('#fff6dc', '#d8d0e8', night);
    for (let i = 0; i < 8; i++) {
      const d = ((i + travel * .19) % 8) / 8 * 1.4;
      ground(ctx, g, 1.97, 2.03, d, Math.min(1.4, d + .06)); ctx.fill();
    }
    for (const side of [0, 1]) {
      const B = side ? 4 : 0;
      const wallH = (d) => lw(d) * 2.6;
      const edge = side ? W + 10 : -10;
      ctx.beginPath();
      ctx.moveTo(x(B, 0), y(0) - wallH(0)); ctx.lineTo(x(B, 0), y(0)); ctx.lineTo(x(B, 1.4), y(1.4));
      ctx.lineTo(x(B, 1.4), H + 10); ctx.lineTo(edge, H + 10); ctx.lineTo(edge, y(1.4) - wallH(1.4)); ctx.lineTo(x(B, 1.4), y(1.4) - wallH(1.4));
      ctx.closePath();
      ctx.fillStyle = mix(side ? '#d98a5f' : '#c8735a', side ? '#5a3a58' : '#4e3350', night); ctx.fill();
      ctx.strokeStyle = 'rgba(59,42,32,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x(B, 0), y(0) - wallH(0)); ctx.lineTo(x(B, 1.4), y(1.4) - wallH(1.4)); ctx.stroke();
      const pt = (d, h) => [x(B, d), y(d) - wallH(d) * h];
      for (let i = 0; i < 10; i++) {
        const d = ((i + travel * .19 * .5 + side * .5) % 10) / 10 * 1.4;
        const d2 = d + .06;
        if (d2 > 1.4) continue;
        const lit = night > .15 && ((i * 7 + side * 3) % 5) < 3;
        for (const [h1, h2] of [[.5, .68], [.78, .94]]) {
          const q = [pt(d, h1), pt(d2, h1), pt(d2, h2), pt(d, h2)];
          ctx.beginPath(); q.forEach(([qx, qy], k) => (k ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy))); ctx.closePath();
          ctx.fillStyle = lit ? '#ffd98a' : mix('#7a4a52', '#2a2440', night); ctx.fill();
        }
        const s1 = pt(d + .12, 0), s2 = pt(d + .12, 1);
        ctx.strokeStyle = 'rgba(60,30,40,.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(...s1); ctx.lineTo(...s2); ctx.stroke();
      }
    }
    if (night > 0) { ctx.fillStyle = `rgba(26,24,64,${(night * .32).toFixed(3)})`; ctx.fillRect(0, horizon, W, H - horizon); }

    const objects = [];
    for (const shop of current.course.shops) {
      const d = 1 - (shop.t - step) / VIEW;
      if (d > .03 && d < 1.45) objects.push({ d, type: 'shop', shop });
    }
    for (const o of current.course.obstacles) {
      const d = 1 - (o.t - step) / VIEW;
      if (d > .03 && d < 1.3) objects.push({ d, type: 'obstacle', o });
    }
    current.course.bells.forEach((b, i) => {
      const d = 1 - (b.t - step) / VIEW;
      if (d > .03 && d < 1.3 && !(frame.rung.has(i) && d > 1)) objects.push({ d, type: frame.rung.has(i) ? 'rung' : 'bell', b });
    });
    const poleGap = 12;
    for (let k = Math.floor(step / poleGap) - 2; k < Math.floor(step / poleGap) + 4; k++) {
      const d = 1 - (k * poleGap + 6 - step) / VIEW;
      if (d > .03 && d < 1.45) for (const side of [0, 1]) objects.push({ d, type: 'pole', side });
    }
    objects.sort((a, b) => a.d - b.d);
    const poleTops = [[], []];
    const drawObject = (obj) => {
      const { d } = obj, by = y(d), s = lw(d);
      if (obj.type === 'shop') drawShop(ctx, x(obj.shop.side ? 4.45 : -.45, d), by, s * 1.0, s * 1.15, obj.shop, frame.state[obj.shop.id], step, me, current.course, time);
      else if (obj.type === 'obstacle') drawObstacle(ctx, x(obj.o.lane + .5, d), by, s, obj.o.kind, time);
      else if (obj.type === 'bell') drawBell(ctx, x(obj.b.lane + .5, d), by, s, time);
      else if (obj.type === 'pole') { const px2 = x(obj.side ? 4.1 : -.1, d); drawPole(ctx, px2, by, s, night, time); poleTops[obj.side].push([px2, by - s * 2.25, s, d]); }
    };
    objects.filter((o) => o.d <= 1).forEach(drawObject);

    const groups = new Map();
    frame.actor.forEach((p) => { const list = groups.get(p.lane) ?? []; list.push(p); groups.set(p.lane, list); });
    for (const p of frame.actor) {
      const target = p.lane + .5;
      const prior = current.positions.get(p.uid) ?? target;
      const k = 1 - Math.pow(1 - .3, dt / 16.7);
      const lane = reducedMotion || Math.abs(target - prior) < .01 ? target : prior + (target - prior) * k;
      current.positions.set(p.uid, lane);
      const mates = groups.get(p.lane);
      const slot = mates.indexOf(p) - (mates.length - 1) / 2;
      const shared = mates.length > 1;
      const s = lw(1) * (shared ? .42 : .52) * (p.uid === current.uid ? 1.05 : 1);
      const px2 = x(lane, 1) + slot * lw(1) * .3;
      const py2 = line + (shared ? Math.abs(slot) * 6 : 0);
      p.screen = [px2, py2, s];
    }
    [...frame.actor].sort((a, b) => a.screen[1] - b.screen[1]).forEach((p) => {
      const [px2, py2, s] = p.screen;
      if (night > .2) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = night * .5;
        ctx.drawImage(glow('#fff2b0'), px2 - s * .8, py2 - s * 1.4, s * 1.6, s * .9);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      drawKid(ctx, px2, py2, s, p, p.uid === current.uid && !current.attract, time, step - p.fall < 10, reducedMotion ? 0 : (p.lane + .5 - current.positions.get(p.uid)) * .35);
    });
    objects.filter((o) => o.d > 1).forEach(drawObject);

    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(40,30,40,.6)';
    for (const tops of poleTops) {
      tops.sort((a, b) => a[3] - b[3]);
      for (let i = 1; i < tops.length; i++) {
        const [x1, y1] = tops[i - 1], [x2, y2, s2] = tops[i];
        for (const off of [0, s2 * .08]) { ctx.beginPath(); ctx.moveTo(x1, y1 + off); ctx.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + s2 * .3 + off, x2, y2 + off); ctx.stroke(); }
      }
    }
    if (night > .15) {
      ctx.globalCompositeOperation = 'lighter';
      for (const tops of poleTops) for (const [px2, py2, s] of tops) {
        const dir = px2 < W / 2 ? 1 : -1;
        ctx.globalAlpha = night * .9;
        ctx.drawImage(glow('#ffe08a'), px2 + dir * s * .32 - s * .6, py2 + s * .33 - s * .6, s * 1.2, s * 1.2);
        ctx.globalAlpha = night * .25;
        ctx.drawImage(glow('#ffe08a'), px2 + dir * s * .3 - s * 1.2, py2 + s * 2.1 - s * .4, s * 2.4, s * .8);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    const P = current.particles;
    let n = 0;
    const sec = dt / 1000;
    for (const p of P) {
      const age = time - p.born;
      if (age > p.life) continue;
      P[n++] = p;
      const a = 1 - age / p.life;
      if (p.kind === 'icon') {
        const k = age / p.life, e = 1 - (1 - k) ** 3;
        const ix = p.x + (p.tx - p.x) * e, iy = p.y + (p.ty - p.y) * e - Math.sin(k * Math.PI) * 60;
        ctx.font = `${p.size * (1 + .4 * Math.sin(k * Math.PI))}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = k > .85 ? (1 - k) / .15 : 1;
        ctx.fillText(p.icon, ix, iy);
        ctx.globalAlpha = 1;
        continue;
      }
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * sec;
      p.x += p.vx * sec; p.y += p.vy * sec; p.rot += p.spin * sec;
      if (p.kind === 'dust') { ctx.globalAlpha = a * .7; ellipse(ctx, p.x, p.y, p.size * (1.6 - a), p.size * (1.6 - a) * .7); ctx.fillStyle = '#efe4d6'; ctx.fill(); }
      else if (p.kind === 'star') { ctx.globalAlpha = a; star(ctx, p.x, p.y, p.size, p.color); }
      else if (p.kind === 'text') { ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.font = `${p.size}px ${FONT}`; ctx.fillText(p.text, p.x, p.y); }
      else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 1.7)); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size * .3, p.size, p.size * .6); ctx.restore(); }
      ctx.globalAlpha = 1;
    }
    P.length = n;

    current.popups = current.popups.filter((p) => time - p.time < 1000);
    const centered = current.popups.filter((p) => p.x === undefined);
    if (centered.length > 3) current.popups = current.popups.filter((p) => p.x !== undefined || centered.indexOf(p) >= centered.length - 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let stack = 0;
    for (const p of [...current.popups].reverse()) {
      const a = (time - p.time) / 1000;
      const lift = p.x === undefined ? stack++ * 40 : 0;
      const pop = 1 + .5 * Math.exp(-a * 12);
      const size = (p.big ? 34 : p.small ? 15 : 22) * Math.min(1.2, Math.max(.75, W / 520)) * (p.small ? 1 : pop);
      let px2 = p.x ?? W / 2;
      const py2 = (p.y ?? H * .42) - lift - a * (p.small ? 30 : 16);
      if (p.shakeText && !reducedMotion && a < .35) px2 += (Math.random() - .5) * 8;
      ctx.globalAlpha = a < .7 ? 1 : 1 - (a - .7) / .3;
      ctx.font = `${size}px ${FONT}`;
      ctx.lineJoin = 'round'; ctx.lineWidth = size * .22; ctx.strokeStyle = INK; ctx.strokeText(p.text, px2, py2);
      ctx.lineWidth = size * .1; ctx.strokeStyle = '#fff'; ctx.strokeText(p.text, px2, py2);
      ctx.fillStyle = p.color; ctx.fillText(p.text, px2, py2);
    }
    ctx.globalAlpha = 1;

    const banner = current.banner;
    if (banner && time - banner.time < 2200 && !current.attract) {
      const a = (time - banner.time) / 2200;
      const ease = a < .12 ? a / .12 : a > .8 ? (1 - a) / .2 : 1;
      const bw = Math.min(W * .86, 420), bh = 52, bx = W / 2 - bw / 2 + (reducedMotion ? 0 : (1 - ease) * -40), by = H * .14;
      ctx.globalAlpha = ease;
      ctx.fillStyle = '#fff6e6'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      rrect(ctx, bx, by, bw, bh, 14); ctx.fill(); ctx.stroke();
      let fs = 22; ctx.font = `${fs}px ${FONT}`;
      const tw = ctx.measureText(banner.text).width;
      if (tw > bw - 24) fs = Math.max(11, fs * (bw - 24) / tw);
      ctx.fillStyle = '#e8503a'; ctx.font = `${fs}px ${FONT}`;
      ctx.fillText(banner.text, W / 2 + (bx - (W / 2 - bw / 2)), by + bh / 2 + 1);
      ctx.globalAlpha = 1;
    }
    if (current.flash && time - current.flash.time < current.flash.dur) {
      const a = 1 - (time - current.flash.time) / current.flash.dur;
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
      const [R, G, B] = hexToRgb(current.flash.color);
      v.addColorStop(0, `rgba(${R},${G},${B},0)`); v.addColorStop(1, `rgba(${R},${G},${B},${(a * current.flash.alpha).toFixed(3)})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
  }

  /* ───────────── 경기 진행 ───────────── */
  function nickname(rng, used) {
    let animal;
    do { animal = ANIMALS[Math.floor(rng() * ANIMALS.length)]; } while (used.has(animal));
    used.add(animal);
    return animal;
  }
  function newMatch(attract) {
    const key = `ddaeng-${Date.now()}-${Math.random()}`;
    const rng = randomFor(key + 'names');
    const used = new Set();
    const course = makeCourse(key);
    const errands = course.list.map((p) => ITEMS[p].name);
    const players = attract
      ? [0, 1, 2, 3].map((i) => { const a = nickname(rng, used); return { uid: `bot${i}`, nick: a, short: a, bot: true }; })
      : [{ uid: 'me', nick: '나', short: '나' }, ...[1, 2, 3].map((i) => { const a = nickname(rng, used); return { uid: `bot${i}`, nick: `${errands[i % 4]} 사러 간 ${a}`, short: a, bot: true }; })];
    return { attract, key, course, players, uid: attract ? null : 'me', start: Date.now() - (attract ? countdown + 4000 : 0), raw: {}, inputs: new Map(), version: 0, computed: -1, tick: -1,
      effectT: -1, positions: new Map(), particles: [], popups: [], phaseShown: -1, announced: '', finalized: false, endSound: false, rattled: new Set() };
  }
  function startPractice() {
    unlockSafe();
    match = newMatch(false);
    lastHud = '';
    switchView('game');
    $('overlay').hidden = true;
    buildNote();
  }
  function unlockSafe() { try { unlockAudio(); } catch { /* 소리를 쓸 수 없는 브라우저 */ } }
  function switchView(name) {
    view = name;
    $('home').hidden = name !== 'home';
    $('game').hidden = name !== 'game';
    if (name === 'home') { match = undefined; held = null; }
  }
  function move(direction) {
    const current = match;
    if (!current || view !== 'game' || current.finalized) return;
    const now = Date.now();
    const elapsed = now - current.start - countdown;
    if (elapsed < -100 || elapsed >= duration * quantum || now - lastDirectionTime < 110) return;
    let t = Math.max(0, Math.floor(elapsed / quantum) + 1);
    const own = current.raw[current.uid] ??= {};
    while (own[t] !== undefined) t++;
    if (t >= duration) return;
    lastDirectionTime = now;
    own[t] = direction;
    const timeline = new Map(Object.entries(own).map(([k, v]) => [Number(k), v]));
    current.inputs.set(current.uid, timeline);
    current.version++;
    tone('move');
  }

  function frameOf(current, whole) {
    if (whole !== current.tick || current.computed !== current.version) {
      current.tick = whole;
      current.computed = current.version;
      current.frame = simulate(current.course, current.players, current.inputs, whole, current.key);
    }
    return current.frame;
  }

  function handleEvents(current, frame, whole) {
    const g = current.layout;
    if (!g) { current.effectT = whole; return; }
    for (const e of frame.log) {
      if (e.t <= current.effectT || e.t > whole) continue;
      const p = frame.actor.find((a) => a.uid === e.uid);
      const mine = e.uid === current.uid;
      const [px, py, s] = p.screen ?? [g.W / 2, g.line, 30];
      if (e.type === 'buy') {
        const item = ITEMS[e.product];
        if (mine) {
          popup(current, e.complete ? '심부름 완료! +5' : `${item.name} +${e.gain - (e.complete ? 5 : 0)}`, e.listed ? '#ff6b5a' : '#3fa45b', { big: e.complete });
          burst(current, 'stars', px, py - s);
          const chip = document.querySelector(`#note [data-item="${e.product}"]`);
          const rect = chip?.getBoundingClientRect(), crect = $('arena').getBoundingClientRect();
          burst(current, 'icon', px, py - s, { icon: item.icon, tx: rect ? rect.left + rect.width / 2 - crect.left : 30, ty: rect ? rect.top + rect.height / 2 - crect.top : -20 });
          if (e.listed) chip?.classList.add('done');
          tone('buy', e);
          if (e.complete) { current.flash = { color: '#ffd23f', time: performance.now(), dur: 700, alpha: .45 }; tone('finish'); }
        } else {
          popup(current, item.icon, '#fff', { x: px, y: py - s * 1.9, small: true });
          if (current.attract) burst(current, 'stars', px, py - s);
        }
      } else if (e.type === 'fall') {
        burst(current, 'dust', px, py);
        if (mine) { current.shake = { time: performance.now(), power: 8 }; popup(current, '꽈당!', '#ff8a5a', { shakeText: true }); tone('fall'); current.flash = { color: '#ff5a3a', time: performance.now(), dur: 400, alpha: .3 }; }
      } else if (e.type === 'soldout' && mine) { popup(current, '품절이에요…', '#7a8ac9'); tone('soldout'); }
      else if (e.type === 'closed' && mine) { popup(current, '문 닫았어요!', '#9a8a9e'); tone('closed'); }
      else if (e.type === 'bell') {
        burst(current, 'notes', px, py - s * 1.5);
        if (!current.attract) {
          if (mine) popup(current, '떨이요~! +1', '#e8a020', { big: true });
          else popup(current, '떨이요~!', '#e8a020', { x: px, y: py - s * 1.9, small: true });
          tone('bell');
        }
      }
    }
    current.effectT = Math.max(current.effectT, whole);
  }

  function hud(current, frame, elapsed) {
    const me = frame.actor.find((a) => a.uid === current.uid);
    const before = elapsed < 0, after = elapsed >= duration * quantum;
    const seconds = Math.max(0, Math.ceil((duration * quantum - Math.max(0, elapsed)) / 1000));
    const phase = phaseOf(Math.max(0, elapsed) / quantum);
    const fallen = elapsed / quantum - me.fall < 10;
    const nextShop = current.course.shops.find((s) => s.t > elapsed / quantum && current.course.list.includes(s.product) && !me.have.has(s.product));
    const guide = before ? '곧 출발해요!' : after ? (current.finalized ? '오늘 심부름 끝!' : '장바구니를 확인하는 중…') : fallen ? '꽈당! 잠깐 일어나는 중…' : nextShop && nextShop.t - elapsed / quantum < VIEW ? `${ITEMS[nextShop.product].icon} ${ITEMS[nextShop.product].name} 파는 ${ITEMS[nextShop.product].shop}가 ${nextShop.side ? '오른쪽' : '왼쪽'}에 와요!` : '양쪽 끝 줄(인도)에 있어야 물건을 살 수 있어요.';
    const signature = `${seconds}|${guide}|${current.finalized}|${frame.actor.map((a) => a.score).join(',')}|${before ? Math.ceil(-elapsed / 1000) : 0}`;
    if (signature === lastHud) return;
    lastHud = signature;
    $('timer').textContent = `${seconds}초`;
    $('timer').classList.toggle('urgent', !before && !after && seconds <= 10);
    $('phase').textContent = PHASES[phase];
    if ($('score').dataset.v !== String(me.score)) { $('score').dataset.v = String(me.score); $('score').textContent = `${me.score}점`; $('score').classList.remove('bump'); void $('score').offsetWidth; $('score').classList.add('bump'); }
    $('guidance').textContent = guide;
    $('left').disabled = $('right').disabled = before || after;
    const ranking = [...frame.actor].sort((a, b) => b.score - a.score);
    let place = 1;
    $('ranking').replaceChildren(...ranking.map((p, i) => {
      if (i && p.score < ranking[i - 1].score) place = i + 1;
      const li = document.createElement('li');
      li.style.setProperty('--c', p.color);
      if (p.uid === current.uid) li.className = 'me';
      const name = document.createElement('span'); name.className = 'who'; name.textContent = `${place}. ${p.uid === current.uid ? '나' : p.short}`;
      const bag = document.createElement('span'); bag.className = 'bag'; bag.textContent = p.bag.map((b) => ITEMS[b].icon).join('') || '—';
      const pts = document.createElement('strong'); pts.textContent = `${p.score}점`;
      li.append(name, bag, pts);
      return li;
    }));
    const overlay = $('overlay');
    overlay.hidden = !(before || after);
    overlay.dataset.kind = before ? 'count' : current.finalized ? 'result' : 'wait';
    if (before) {
      const big = document.createElement('strong'); big.className = 'count'; big.textContent = Math.ceil(-elapsed / 1000);
      const memo = document.createElement('p'); memo.className = 'memo'; memo.textContent = `오늘 심부름: ${current.course.list.map((p) => ITEMS[p].icon + ITEMS[p].name).join(' · ')}`;
      overlay.replaceChildren(big, memo);
    } else if (after && !current.finalized) {
      const t = document.createElement('strong'); t.textContent = '땡! 셔터 내려요';
      overlay.replaceChildren(t);
    } else if (current.finalized) {
      const leaders = ranking.filter((p) => p.score === ranking[0].score);
      const title = document.createElement('strong');
      title.textContent = leaders.length > 1 ? '공동 1등!' : leaders[0].uid === current.uid ? '내가 1등!' : `${leaders[0].short} 1등!`;
      const table = document.createElement('ol'); table.className = 'result';
      place = 1;
      ranking.forEach((p, i) => {
        if (i && p.score < ranking[i - 1].score) place = i + 1;
        const li = document.createElement('li');
        li.style.setProperty('--c', p.color);
        li.style.animationDelay = `${.15 + i * .12}s`;
        const listed = current.course.list.filter((it) => p.have.has(it)).length;
        li.innerHTML = '';
        const a = document.createElement('b'); a.textContent = `${place}등 ${p.uid === current.uid ? '나' : p.short}`;
        const bag = document.createElement('span'); bag.className = 'bag'; bag.textContent = p.bag.map((b) => ITEMS[b].icon).join('') || '빈 바구니';
        const sc = document.createElement('em'); sc.textContent = `${p.score}점 · 쪽지 ${listed}/4`;
        li.append(a, bag, sc);
        if (place === 1) { const stamp = document.createElement('i'); stamp.className = 'stamp'; stamp.textContent = '참 잘했어요'; li.append(stamp); }
        table.append(li);
      });
      const again = document.createElement('button'); again.className = 'button primary'; again.type = 'button'; again.textContent = '한 판 더!';
      again.addEventListener('click', startPractice);
      const home = document.createElement('button'); home.className = 'button'; home.type = 'button'; home.textContent = '처음으로';
      home.addEventListener('click', () => switchView('home'));
      const row = document.createElement('div'); row.className = 'row'; row.append(again, home);
      overlay.replaceChildren(title, table, row);
    }
  }

  function buildNote() {
    const note = $('note');
    note.replaceChildren(...match.course.list.map((p) => {
      const li = document.createElement('li');
      li.dataset.item = p;
      li.textContent = `${ITEMS[p].icon} ${ITEMS[p].name}`;
      return li;
    }));
  }

  function tick() {
    const now = Date.now();
    if (view === 'home') {
      if (!demo || now - demo.start - countdown > duration * quantum) demo = newMatch(true);
      const elapsed = now - demo.start - countdown;
      const step = Math.max(0, Math.min(duration - 1, elapsed / quantum));
      const frame = frameOf(demo, Math.floor(step));
      handleEvents(demo, frame, Math.floor(step));
      paint($('hero'), demo, frame, step, elapsed);
      return;
    }
    if (!match) return;
    const current = match;
    const elapsed = now - current.start - countdown;
    if (held && now >= nextRepeat) { nextRepeat = now + 180; move(held.direction); }
    if (elapsed >= duration * quantum + 600) current.finalized = true;
    const step = Math.max(0, Math.min(duration - 1, elapsed / quantum));
    const whole = Math.floor(step);
    const frame = frameOf(current, whole);
    if (elapsed >= 0 && elapsed < duration * quantum) handleEvents(current, frame, whole);
    else current.effectT = Math.max(current.effectT, elapsed < 0 ? -1 : whole);
    if (elapsed >= 0 && elapsed < duration * quantum) {
      const phase = phaseOf(step);
      if (current.phaseShown !== phase) {
        current.phaseShown = phase;
        current.banner = { text: ['🌅 출발! 쪽지 물건을 사 오세요', '💡 가로등이 켜졌어요! 가게들이 문 닫기 시작해요', '⏰ 마감 직전! 서둘러요!'][phase], time: performance.now() };
        if (phase) tone('phase');
      }
      for (const shop of current.course.shops) {
        const s = frame.state[shop.id];
        const d = 1 - (shop.t - step) / VIEW;
        if (!current.rattled.has(shop.id) && step >= s.closeAt - 22 && d > .35 && d < 1) { current.rattled.add(shop.id); tone('rattle'); }
      }
    }
    const announce = elapsed < 0 ? String(Math.ceil(-elapsed / 1000)) : 'go';
    if (announce !== current.announced && elapsed < 1000) { current.announced = announce; tone(announce === 'go' ? 'go' : 'count'); }
    music(current, elapsed);
    paint($('arena'), current, frame, step, elapsed);
    if (current.finalized && !current.endSound) {
      current.endSound = true;
      tone('finish');
      burst(current, 'confetti', 0, 0, { W: current.layout?.W ?? 400 });
    }
    hud(current, frame, elapsed);
  }
  function loop() { try { tick(); } catch (error) { console.error(error); } requestAnimationFrame(loop); }

  /* ───────────── 입력 ───────────── */
  $('practice').addEventListener('click', startPractice);
  $('exit').addEventListener('click', () => switchView('home'));
  $('sound').addEventListener('click', () => {
    soundOn = !soundOn;
    $('sound').textContent = soundOn ? '🔊 소리 끄기' : '🔈 소리 켜기';
    $('sound').setAttribute('aria-pressed', String(soundOn));
    unlockSafe();
    if (soundOn) setTimeout(() => tone('go'), 80);
  });
  $('full').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { /* 전체 화면을 지원하지 않는 브라우저 */ }
  });
  for (const [id, direction] of [['left', -1], ['right', 1]]) {
    const button = $(id);
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      button.setPointerCapture(event.pointerId);
      held = { direction, id: event.pointerId };
      nextRepeat = Date.now() + 220;
      move(direction);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, (event) => { if (held?.id === event.pointerId) held = null; });
    button.addEventListener('click', (event) => { if (event.detail === 0) move(direction); });
  }
  let swipe = null;
  $('arena').addEventListener('pointerdown', (event) => { swipe = { x: event.clientX, id: event.pointerId }; });
  $('arena').addEventListener('pointerup', (event) => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    if (Math.abs(dx) > 24) move(Math.sign(dx));
    else { const r = $('arena').getBoundingClientRect(); move(event.clientX - r.left < r.width / 2 ? -1 : 1); }
    swipe = null;
  });
  const keys = { ArrowLeft: -1, ArrowRight: 1, a: -1, d: 1 };
  window.addEventListener('keydown', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (view !== 'game' || !keys[key] || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (event.repeat) return;
    held = { direction: keys[key], id: key };
    nextRepeat = Date.now() + 220;
    move(keys[key]);
  });
  window.addEventListener('keyup', (event) => { if (held?.id === event.key || held?.id === event.key.toLowerCase()) held = null; });
  window.addEventListener('blur', () => { held = null; });
  requestAnimationFrame(loop);
})();