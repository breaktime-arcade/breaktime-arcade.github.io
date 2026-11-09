/* 딱! 딱지치기 (Ddakji Slam) - 쉬는시간 오락실 */
(() => {
  'use strict';

  // ===== 데이터 =====
  const ANIMALS = [
    ['🐰', '토끼', '#ff9fb8', '#ffd7e2'], ['🐻', '곰', '#c98a5a', '#f1cfa8'], ['🐱', '고양이', '#ffc04d', '#ffe6a8'],
    ['🐶', '강아지', '#8fc7ff', '#d4ebff'], ['🐸', '개구리', '#6fcf6a', '#c9f0c0'], ['🐧', '펭귄', '#5d7bd6', '#cdd8ff'],
    ['🐼', '판다', '#7c7c8c', '#e6e6ee'], ['🦊', '여우', '#ff8a4c', '#ffd2b5'], ['🐯', '호랑이', '#f2a12e', '#fde3b0'],
    ['🐨', '코알라', '#9aa8b8', '#e2e8ef'], ['🐷', '돼지', '#ff8fa3', '#ffe0e6'], ['🐵', '원숭이', '#b07a52', '#ecd2b8']
  ];
  const TYPES = {
    //         치는 힘  버티는 힘  조준 속도  힘 속도   크기
    light:  { hit: 0.85, res: 0.82, aim: 0.42, pow: 0.62, size: 0.92, name: '가벼운 딱지' },
    normal: { hit: 1.0,  res: 1.0,  aim: 0.52, pow: 0.75, size: 1.0,  name: '보통 딱지' },
    heavy:  { hit: 1.2,  res: 1.22, aim: 0.56, pow: 0.98, size: 1.08, name: '두꺼운 딱지' }
  };
  const AI_LV = {
    easy:   { aimLo: 0.25, aimHi: 1.18, powErr: 0.15, name: '쉬움' },
    normal: { aimLo: 0.6,  aimHi: 1.06, powErr: 0.085, name: '보통' },
    hard:   { aimLo: 0.76, aimHi: 0.98, powErr: 0.045, name: '어려움' }
  };
  const SWEET = [0.72, 0.88];            // 힘 게이지 최적 구간
  const KEY_OPT = 'ddakji.opt', KEY_REC = 'ddakji.rec', KEY_COL = 'ddakji.col', KEY_SOUND = 'ddakji.sound';

  // ===== 저장소 =====
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }
  };
  const loadJSON = (k, d) => { try { return JSON.parse(store.get(k, '')) || d; } catch (e) { return d; } };
  const opt = Object.assign({ mode: 'ai', level: 'normal', type0: 'normal', type1: 'normal', pat0: 0, pat1: 1 }, loadJSON(KEY_OPT, {}));
  let rec = loadJSON(KEY_REC, { ai: {}, soloBest: 0 });
  let col = loadJSON(KEY_COL, [0, 1, 2]);
  let soundOn = store.get(KEY_SOUND, '1') === '1';
  const saveOpt = () => store.set(KEY_OPT, JSON.stringify(opt));

  // ===== 요소 =====
  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), canvas = $('cv'), ctx = canvas.getContext('2d');

  // ===== 화면 =====
  const L = { w: 1, h: 1, dpr: 1, S: 100, tx: 0, ty: 0, hx: 0, hy: 0 };
  function layout() {
    const rc = stageEl.getBoundingClientRect();
    L.w = Math.max(120, rc.width); L.h = Math.max(160, rc.height);
    L.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(L.w * L.dpr); canvas.height = Math.round(L.h * L.dpr);
    L.S = Math.max(70, Math.min(L.w * 0.48, L.h * 0.3));
    L.tx = L.w / 2; L.ty = L.h * 0.43;
    L.hx = L.w / 2; L.hy = L.h * 0.86;
  }

  // ===== 효과음 =====
  let ac = null, noiseBuf = null;
  function ensureAudio() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      } catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tone(f, d, type = 'sine', vol = 0.15, slide = 0, delay = 0) {
    if (!soundOn || !ac) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(vol, dur, freq) {
    if (!soundOn || !ac || !noiseBuf) return;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    s.connect(f).connect(g).connect(ac.destination); s.start(); s.stop(ac.currentTime + dur);
  }
  const sfx = {
    lock() { tone(900, 0.06, 'square', 0.06); },
    whoosh() { noise(0.25, 0.25, 900); },
    slam(p) { noise(0.9 * p + 0.3, 0.18, 1800); tone(120, 0.18, 'sine', 0.4, 60); },
    flip() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.15, 0, 0.12 + i * 0.07)); },
    miss() { tone(330, 0.15, 'triangle', 0.12, 220, 0.15); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, 0, i * 0.12)); },
    lose() { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, 0, i * 0.14)); },
    click() { tone(800, 0.04, 'sine', 0.08); }
  };

  // ===== 상태 =====
  let state = 'menu';           // menu | play | over
  let players = [], cur = 0, round = 1;
  let phase = 'idle', phaseT = 0;
  let aimV = 0, powV = 0, aimLock = 0, powLock = 0;
  let target = null, striker = null, lastShot = null;
  let banner = null, pops = [], dust = [], shake = 0;
  let solo = null, unlockedNow = [];
  let aiPlan = null, nextFn = null, nextAt = 0;
  let selStep = 0, clock = 0, lastT = 0;

  const P = () => players[cur];
  const other = () => players[(cur + 1) % players.length];

  // ===== 딱지 그리기 =====
  function drawDdakji(x, y, size, pat, flipA, lift, rot, alpha = 1) {
    const [emoji, , c1, c2] = ANIMALS[pat];
    const k = 0.58;                                        // 비스듬히 본 납작함
    const c = Math.cos(flipA);
    const s = size / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 그림자
    const sh = Math.max(0.3, 1 - lift / (L.S * 2));
    ctx.fillStyle = `rgba(80,45,15,${0.25 * sh})`;
    ctx.beginPath(); ctx.ellipse(x, y + s * k * 0.15, s * 1.15 * sh, s * k * 0.95 * sh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(x, y - lift);
    ctx.scale(1, k);
    ctx.rotate(rot);
    ctx.scale(1, Math.abs(c) < 0.04 ? 0.04 : Math.abs(c));
    const front = c >= 0;
    // 두께
    ctx.fillStyle = front ? '#8a5a35' : '#5a3a20';
    roundRect(-s, -s + s * 0.1, s * 2, s * 2, s * 0.12); ctx.fill();
    // 몸통: 대각선으로 접힌 네 삼각형
    const tri = [[[-s, -s], [s, -s]], [[s, -s], [s, s]], [[s, s], [-s, s]], [[-s, s], [-s, -s]]];
    const cols = front ? [c1, c2, c1, c2] : [shade(c2, -0.1), shade(c1, -0.15), shade(c2, -0.1), shade(c1, -0.15)];
    tri.forEach((e, i) => {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e[0][0], e[0][1]); ctx.lineTo(e[1][0], e[1][1]); ctx.closePath();
      ctx.fillStyle = cols[i]; ctx.fill();
    });
    ctx.strokeStyle = 'rgba(60,30,10,.55)'; ctx.lineWidth = Math.max(1.5, s * 0.03);
    roundRect(-s, -s, s * 2, s * 2, s * 0.08); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,30,10,.28)';
    ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); ctx.stroke();
    if (front) {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c1; ctx.lineWidth = s * 0.06; ctx.stroke();
      ctx.font = `${Math.round(s * 0.62)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(emoji, 0, s * 0.04);
    } else {
      // 뒷면: 접힌 날개 모양
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.55, -s * 0.55); ctx.lineTo(0, -s * 0.78); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function roundRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ===== 판정 =====
  function aimScore(e) {                  // e: 중심 0 ~ 가장자리 1, 1 넘으면 빗나감
    if (e > 1.02) return 0;
    if (e < 0.2) return 0.22;
    return Math.min(1, 0.22 + (e - 0.2) / 0.55 * 0.78);
  }
  function powScore(p) {
    if (p >= SWEET[0] && p <= SWEET[1]) return 1;
    const d = p < SWEET[0] ? SWEET[0] - p : p - SWEET[1];
    return Math.max(0.12, 1 - d * 3.2);
  }
  function flipChance(aim, pow, hitT, resT) {
    const a = aimScore(Math.abs(aim)), p = powScore(pow);
    if (a === 0) return { prob: 0, a, p, miss: true };
    const ratio = Math.pow(TYPES[hitT].hit / resT, 1.3);
    let prob = a * a * p * ratio * 0.62;
    if (a === 1 && p === 1) prob = Math.max(prob, 0.7 * ratio);
    return { prob: Math.max(0.02, Math.min(0.88, prob)), a, p, miss: false };
  }

  // ===== 진행 =====
  function newPlayer(i) {
    if (opt.mode === 'ai') return i === 0
      ? { name: '나', face: '🙂', type: opt.type0, pat: opt.pat0, wins: 0, ai: false }
      : { name: 'AI · ' + AI_LV[opt.level].name, face: '🤖', type: ['light', 'normal', 'heavy'][Math.floor(Math.random() * 3)], pat: randPat(opt.pat0), wins: 0, ai: true };
    if (opt.mode === 'pvp') return i === 0
      ? { name: '1P', face: '🐯', type: opt.type0, pat: opt.pat0, wins: 0, ai: false }
      : { name: '2P', face: '🐻', type: opt.type1, pat: opt.pat1, wins: 0, ai: false };
    return { name: '나', face: '🙂', type: opt.type0, pat: opt.pat0, wins: 0, ai: false };
  }
  function randPat(not) { let p; do { p = Math.floor(Math.random() * ANIMALS.length); } while (p === not); return p; }

  function startGame() {
    ensureAudio();
    hideAll();
    players = opt.mode === 'solo' ? [newPlayer(0)] : [newPlayer(0), newPlayer(1)];
    cur = 0; round = 1; unlockedNow = [];
    pops = []; dust = [];
    state = 'play';
    if (opt.mode === 'solo') {
      solo = { lives: 3, count: 0 };
      target = makeSoloTarget();
    } else solo = null;
    startRound();
  }
  function makeSoloTarget() {
    const n = solo.count;
    const res = Math.min(1.7, 0.8 + n * 0.06);
    const type = res < 0.92 ? 'light' : res < 1.12 ? 'normal' : 'heavy';
    return { pat: randPat(players[0].pat), type, res, a: 0, lift: 0, rot: (Math.random() - 0.5) * 0.3, flipped: false };
  }
  function startRound() {
    if (opt.mode !== 'solo') {
      cur = (round - 1) % 2;                       // 판마다 먼저 치는 사람을 바꿈
      target = targetOf(other());
    }
    striker = null; lastShot = null;
    beginTurn();
  }
  function targetOf(p) {
    return { pat: p.pat, type: p.type, res: TYPES[p.type].res, a: 0, lift: 0, rot: (Math.random() - 0.5) * 0.3, flipped: false };
  }
  function beginTurn() {
    aimV = 0; powV = 0;
    if (opt.mode === 'solo') banner = { text: solo.count ? `${solo.count + 1}번째 딱지!` : '시작!', t: 0 };
    else banner = { text: P().ai ? 'AI 차례' : (opt.mode === 'ai' ? '내 차례!' : `${P().name} 차례`), t: 0 };
    setPhase('banner');
    updateHud();
  }
  function setPhase(ph) {
    phase = ph; phaseT = 0;
    aiPlan = null;
    if (P() && P().ai && (ph === 'aim' || ph === 'power')) planAI(ph);
  }

  // 왕복 값 (삼각파)
  const tri = (t, f) => { const x = (t * f) % 1; return x < 0.5 ? x * 2 : 2 - x * 2; };
  const speedUp = () => (solo ? 1 + Math.min(0.5, solo.count * 0.03) : 1);
  function curAim() { return (tri(phaseT + 0.25 / TYPES[P().type].aim, TYPES[P().type].aim * speedUp()) * 2 - 1) * 1.3; }
  function curPow() { return tri(phaseT, TYPES[P().type].pow * speedUp()); }

  function press() {
    if (state !== 'play' || !P() || P().ai) return;
    if (phase === 'aim') lockAim(); else if (phase === 'power') lockPow();
  }
  function lockAim() {
    aimLock = curAim(); sfx.lock();
    setPhase('power');
  }
  function lockPow() {
    powLock = curPow(); sfx.lock();
    throwIt();
  }
  function throwIt() {
    const p = P();
    striker = { pat: p.pat, type: p.type, x0: L.hx, y0: L.hy, x1: L.tx + aimLock * L.S * 0.5, y1: L.ty + (Math.random() - 0.5) * L.S * 0.12, t: 0 };
    sfx.whoosh();
    setPhase('throw');
  }
  function impact() {
    const p = P();
    const r = flipChance(aimLock, powLock, p.type, target.res);
    const flipped = !r.miss && Math.random() < r.prob;
    lastShot = { flipped, r, dir: Math.sign(aimLock) || 1 };
    shake = 0.25 * (0.4 + powLock);
    sfx.slam(powLock);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 180 * (0.5 + powLock);
      dust.push({ x: striker.x1, y: striker.y1 + L.S * 0.1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.4 - 40, life: 0.5 + Math.random() * 0.4, r: 3 + Math.random() * 5 });
    }
    // 판정 문구
    let label, color = '#4a2e1e';
    if (r.miss) label = '빗나갔어요!';
    else if (r.a === 1 && r.p === 1) { label = '완벽!'; color = '#f05a4f'; }
    else if (r.prob > 0.5) { label = '좋아요!'; color = '#2f9e5b'; }
    else if (Math.abs(aimLock) < 0.3) label = '가운데는 잘 안 넘어가요';
    else if (powLock > SWEET[1]) label = '너무 셌어요!';
    else if (powLock < SWEET[0]) label = '힘이 약했어요';
    else label = '아깝다!';
    popText(label, L.w / 2, L.ty - L.S * 0.95, color, true);
    setPhase('result');
  }
  function afterResult() {
    const p = P();
    if (lastShot.flipped) {
      sfx.flip();
      popText('뒤집었다!', L.w / 2, L.ty - L.S * 0.2, '#f05a4f', true);
      if (opt.mode === 'solo') {
        solo.count++;
        if (solo.count % 5 === 0) unlockOne();
        later(1.3, () => { target = makeSoloTarget(); striker = null; beginTurn(); });
      } else {
        p.wins++;
        updateHud();
        if (p.wins >= 2) later(1.5, () => finish());
        else later(1.6, () => { round++; startRound(); });
      }
    } else {
      sfx.miss();
      if (opt.mode === 'solo') {
        solo.lives--;
        updateHud();
        if (solo.lives <= 0) later(1.3, () => finish());
        else later(1.3, () => { striker = null; target.a = 0; beginTurn(); });
      } else {
        // 차례를 넘기고, 방금 친 딱지가 바닥에 놓여 상대의 표적이 됨
        later(1.3, () => {
          cur = (cur + 1) % 2;
          target = targetOf(other());
          striker = null;
          beginTurn();
        });
      }
    }
    setPhase('wait');
  }
  function later(sec, fn) { nextFn = fn; nextAt = sec; }

  function unlockOne() {
    const locked = ANIMALS.map((_, i) => i).filter(i => !col.includes(i));
    if (!locked.length) return null;
    const i = locked[Math.floor(Math.random() * locked.length)];
    col.push(i); store.set(KEY_COL, JSON.stringify(col));
    unlockedNow.push(i);
    popText(`새 딱지! ${ANIMALS[i][0]} ${ANIMALS[i][1]}`, L.w / 2, L.h * 0.14, '#e08a00', true);
    return i;
  }

  function finish() {
    state = 'over'; phase = 'idle';
    let emoji, title, msg, info = '';
    if (opt.mode === 'solo') {
      const n = solo.count;
      const best = rec.soloBest || 0;
      const isBest = n > best;
      if (isBest) rec.soloBest = n;
      emoji = n >= 10 ? '🏆' : n >= 5 ? '🎉' : '🙂';
      title = `${n}장 뒤집기!`;
      msg = isBest && n > 0 ? '최고 기록을 새로 세웠어요!' : '다시 도전해서 기록을 깨 보세요!';
      info = `이번 기록 <b>${n}장</b><br>최고 기록 <b>${rec.soloBest}장</b>`;
      sfx.win();
    } else if (opt.mode === 'ai') {
      const won = players[0].wins >= 2;
      const r = rec.ai[opt.level] || { w: 0, l: 0 };
      won ? r.w++ : r.l++;
      rec.ai[opt.level] = r;
      if (won) unlockOne();
      emoji = won ? '🎉' : '😢'; title = won ? '이겼어요!' : '아쉽게 졌어요';
      msg = won ? `AI(${AI_LV[opt.level].name})의 딱지를 땄어요!` : '가장자리를 노려서 다시 도전!';
      info = `나 <b>${players[0].wins}</b> : <b>${players[1].wins}</b> AI<br>${AI_LV[opt.level].name} 전적: <b>${r.w}승 ${r.l}패</b>`;
      won ? sfx.win() : sfx.lose();
    } else {
      const w = players[0].wins >= 2 ? players[0] : players[1];
      emoji = '🏆'; title = `${w.name} 승리!`; msg = '딱지왕이 탄생했어요!';
      info = `1P <b>${players[0].wins}</b> : <b>${players[1].wins}</b> 2P`;
      sfx.win();
    }
    store.set(KEY_REC, JSON.stringify(rec));
    $('resEmoji').textContent = emoji; $('resTitle').textContent = title;
    $('resMsg').textContent = msg; $('resInfo').innerHTML = info;
    $('resUnlock').innerHTML = unlockedNow.map(i => `<div class="unlock">📒 새 딱지: ${ANIMALS[i][0]} ${ANIMALS[i][1]}</div>`).join('');
    setTimeout(() => $('result').classList.add('show'), 700);
    updateHud();
  }

  // ===== AI =====
  function planAI(ph) {
    const lv = AI_LV[opt.level];
    if (ph === 'aim') {
      const e = lv.aimLo + Math.random() * (lv.aimHi - lv.aimLo);
      aiPlan = { want: e * (Math.random() < 0.5 ? -1 : 1), minT: 0.6 + Math.random() * 0.5, prev: null };
    } else {
      let g = (SWEET[0] + SWEET[1]) / 2 + (Math.random() * 2 - 1) * lv.powErr * 2;
      g = Math.max(0.05, Math.min(0.99, g));
      aiPlan = { want: g, minT: 0.4 + Math.random() * 0.4, prev: null };
    }
  }
  function runAI() {
    if (!aiPlan || !P() || !P().ai) return;
    const v = phase === 'aim' ? curAim() : curPow();
    const d = v - aiPlan.want;
    if (phaseT >= aiPlan.minT && aiPlan.prev !== null && (Math.sign(d) !== Math.sign(aiPlan.prev) || Math.abs(d) < 0.015)) {
      if (phase === 'aim') { aimLock = v; sfx.lock(); setPhase('power'); }
      else { powLock = v; sfx.lock(); throwIt(); }
      return;
    }
    aiPlan.prev = d;
  }

  // ===== 업데이트 =====
  function update(dt) {
    clock += dt;
    if (shake > 0) shake = Math.max(0, shake - dt);
    dust.forEach(d => { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 120 * dt; d.life -= dt; });
    dust = dust.filter(d => d.life > 0);
    pops.forEach(p => { p.t += dt; }); pops = pops.filter(p => p.t < 1.4);
    if (state !== 'play') return;
    phaseT += dt;
    if (phase === 'banner' && phaseT > 0.9) setPhase('aim');
    if (phase === 'aim') aimV = curAim();
    if (phase === 'power') powV = curPow();
    if ((phase === 'aim' || phase === 'power') && P().ai) runAI();
    if (phase === 'throw') {
      striker.t = Math.min(1, phaseT / 0.32);
      if (phaseT >= 0.32) impact();
    }
    if (phase === 'result') {
      const t = Math.min(1, phaseT / 0.85);
      if (lastShot.flipped) {
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        target.a = Math.PI * e * lastShot.dir;
        target.lift = Math.sin(Math.PI * t) * L.S * 0.9;
        target.rot += dt * 2 * lastShot.dir;
      } else {
        const amp = lastShot.r.miss ? 0.03 : 0.35 + 0.35 * lastShot.r.prob;
        target.a = Math.sin(Math.PI * t) * amp * lastShot.dir;
        target.lift = Math.sin(Math.PI * t) * L.S * 0.12 * (lastShot.r.miss ? 0.1 : 1);
      }
      if (phaseT >= 0.85) { target.a = lastShot.flipped ? Math.PI : 0; target.lift = 0; afterResult(); }
    }
    if (phase === 'wait' && nextFn && phaseT >= nextAt) { const f = nextFn; nextFn = null; f(); }
  }

  // ===== 그리기 =====
  function drawGround() {
    const g = ctx.createLinearGradient(0, 0, 0, L.h);
    g.addColorStop(0, '#f2d6a8'); g.addColorStop(1, '#d9ae74');
    ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h);
    // 흙 알갱이
    ctx.fillStyle = 'rgba(150,100,50,.12)';
    for (let i = 0; i < 70; i++) {
      const x = (i * 97.3) % L.w, y = (i * 53.7 + (i % 7) * 31) % L.h;
      ctx.beginPath(); ctx.ellipse(x, y, 3 + (i % 4), 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 분필 원
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.ellipse(L.tx, L.ty + L.S * 0.05, L.S * 1.05, L.S * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawAimBar() {
    const w = L.S * 1.3, y = L.ty + L.S * 0.62, h = Math.max(10, L.S * 0.09);
    // 구역 색: 빗나감(회색) - 좋음(초록) - 약함(빨강) - 좋음 - 빗나감
    const seg = (a, b, col2) => {
      ctx.fillStyle = col2;
      ctx.fillRect(L.tx + a / 1.3 * w / 2, y, (b - a) / 1.3 * w / 2, h);
    };
    seg(-1.3, -1.02, '#b9a58c'); seg(-1.02, -0.7, '#4cc46e'); seg(-0.7, -0.3, '#ffd45c'); seg(-0.3, 0.3, '#ff8d7a');
    seg(0.3, 0.7, '#ffd45c'); seg(0.7, 1.02, '#4cc46e'); seg(1.02, 1.3, '#b9a58c');
    ctx.strokeStyle = 'rgba(70,40,15,.6)'; ctx.lineWidth = 2;
    roundRect(L.tx - w / 2, y, w, h, 3); ctx.stroke();
    const v = phase === 'aim' ? aimV : aimLock;
    const x = L.tx + v / 1.3 * w / 2;
    ctx.fillStyle = '#4a2e1e';
    ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x - 8, y - 14); ctx.lineTo(x + 8, y - 14); ctx.closePath(); ctx.fill();
    // 딱지 위 조준점
    const cy = L.ty;
    ctx.strokeStyle = phase === 'aim' ? '#f05a4f' : 'rgba(240,90,79,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(L.tx + v * L.S * 0.5, cy, L.S * 0.11, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(L.tx + v * L.S * 0.5 - L.S * 0.17, cy); ctx.lineTo(L.tx + v * L.S * 0.5 + L.S * 0.17, cy);
    ctx.moveTo(L.tx + v * L.S * 0.5, cy - L.S * 0.12); ctx.lineTo(L.tx + v * L.S * 0.5, cy + L.S * 0.12);
    ctx.stroke();
  }
  function drawPowBar() {
    const h = L.h * 0.38, w = Math.max(18, L.S * 0.14);
    const x = Math.min(L.w - w - 14, L.tx + L.S * 1.0), y = L.ty - h / 2;
    ctx.fillStyle = '#fff8ec'; roundRect(x - 4, y - 4, w + 8, h + 8, 10); ctx.fill();
    ctx.strokeStyle = '#c98a4b'; ctx.lineWidth = 3; ctx.stroke();
    const g = ctx.createLinearGradient(0, y + h, 0, y);
    g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#ff6b5b');
    ctx.fillStyle = g;
    const v = phase === 'power' ? powV : powLock;
    ctx.fillRect(x, y + h * (1 - v), w, h * v);
    ctx.fillStyle = 'rgba(60,190,100,.45)';
    ctx.fillRect(x - 4, y + h * (1 - SWEET[1]), w + 8, h * (SWEET[1] - SWEET[0]));
    ctx.strokeStyle = '#2f9e5b'; ctx.lineWidth = 2;
    ctx.strokeRect(x - 4, y + h * (1 - SWEET[1]), w + 8, h * (SWEET[1] - SWEET[0]));
    ctx.fillStyle = '#4a2e1e'; ctx.font = `${Math.max(13, w * 0.6)}px Jua, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('힘', x + w / 2, y + h + 22);
  }
  function drawGuide(text) {
    const fs = Math.max(15, Math.min(20, L.w / 22));
    ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width + 26, y = L.h * 0.07;
    roundRect(L.w / 2 - tw / 2, y, tw, fs * 1.8, fs * 0.9);
    ctx.fillStyle = P() && P().ai ? 'rgba(80,90,130,.88)' : 'rgba(240,90,79,.92)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(text, L.w / 2, y + fs * 0.92);
  }
  function drawSoloInfo() {
    if (!solo) return;
    const fs = Math.max(16, L.w / 24);
    ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#4a2e1e';
    ctx.fillText('❤️'.repeat(Math.max(0, solo.lives)) + '🤍'.repeat(Math.max(0, 3 - solo.lives)), 12, L.h - 22);
  }

  function render() {
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    let sx = 0, sy = 0;
    if (shake > 0) { sx = (Math.random() - 0.5) * 16 * shake; sy = (Math.random() - 0.5) * 16 * shake; }
    ctx.translate(sx, sy);
    drawGround();
    if (state === 'menu') {
      drawDdakji(L.tx - L.S * 0.55, L.ty, L.S * 0.8, opt.pat0, 0, Math.abs(Math.sin(clock * 2)) * 10, -0.2);
      drawDdakji(L.tx + L.S * 0.55, L.ty + 10, L.S * 0.8, opt.pat1 === opt.pat0 ? (opt.pat0 + 1) % 12 : opt.pat1, Math.PI * (0.5 + 0.5 * Math.sin(clock)), 0, 0.25);
      return;
    }
    if (target) {
      const size = L.S * TYPES[target.type].size;
      drawDdakji(L.tx, L.ty, size, target.pat, target.a, target.lift, target.rot);
      // 표적 정보
      ctx.font = `${Math.max(13, L.S * 0.12)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(74,46,30,.75)';
      const owner = opt.mode === 'solo' ? '' : `${other().name}의 `;
      if (phase !== 'result' && phase !== 'wait') ctx.fillText(`${owner}${TYPES[target.type].name}`, L.tx, L.ty - L.S * 0.62);
    }
    if (phase === 'aim' || phase === 'power') { drawAimBar(); }
    if (phase === 'power') drawPowBar();
    // 내 딱지 (손에 든 것 / 날아가는 것 / 바닥에 떨어진 것)
    const p = P();
    if (p && (phase === 'banner' || phase === 'aim' || phase === 'power')) {
      const bob = Math.sin(clock * 3) * 4;
      drawDdakji(L.hx, L.hy + bob, L.S * 0.62 * TYPES[p.type].size, p.pat, 0, 6, -0.15);
      ctx.font = `${Math.round(L.S * 0.32)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✋', L.hx + L.S * 0.38, L.hy + L.S * 0.12 + bob);
    }
    if (striker) {
      const t = striker.t, e = t * t;
      const x = striker.x0 + (striker.x1 - striker.x0) * e;
      const y = striker.y0 + (striker.y1 - striker.y0) * e;
      const lift = phase === 'throw' ? Math.sin(Math.PI * t) * L.S * 0.6 * (1 - t) + (1 - t) * L.S * 0.4 : 0;
      const sz = L.S * 0.62 * TYPES[striker.type].size * (1 + (1 - t) * 0.2);
      const off = phase === 'throw' ? 0 : L.S * 0.12 * (lastShot ? lastShot.dir : 1);
      drawDdakji(x + off, y + (phase === 'throw' ? 0 : L.S * 0.18), sz, striker.pat, 0, lift, 0.4 * (1 - t) + 0.15, phase === 'wait' ? 0.95 : 1);
    }
    // 흙먼지
    dust.forEach(d => {
      ctx.globalAlpha = Math.max(0, Math.min(1, d.life * 1.6));
      ctx.fillStyle = '#c69a62';
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // 안내
    if (state === 'play' && p) {
      if (phase === 'aim') drawGuide(p.ai ? 'AI가 조준 중…' : '눌러서 칠 곳을 정해요 (가장자리 노리기!)');
      else if (phase === 'power') drawGuide(p.ai ? 'AI가 힘을 모으는 중…' : '초록 칸에서 눌러 힘을 정해요');
    }
    drawSoloInfo();
    // 떠오르는 글자
    pops.forEach(pp => {
      const fs = pp.big ? Math.max(24, L.w / 13) : Math.max(16, L.w / 24);
      ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.4 - pp.t) * 2));
      const sc = 1 + Math.max(0, 0.2 - pp.t);
      ctx.save(); ctx.translate(pp.x, pp.y - pp.t * 26); ctx.scale(sc, sc);
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
      ctx.strokeText(pp.text, 0, 0); ctx.fillStyle = pp.color; ctx.fillText(pp.text, 0, 0);
      ctx.restore(); ctx.globalAlpha = 1;
    });
    // 차례 안내
    if (phase === 'banner' && banner) {
      const a = Math.max(0, Math.min(1, phaseT * 5, (0.9 - phaseT) * 5));
      ctx.globalAlpha = a;
      const fs = Math.max(30, Math.min(L.w, 500) / 9);
      roundRect(L.w / 2 - Math.min(L.w * 0.4, 220), L.h * 0.2, Math.min(L.w * 0.8, 440), fs * 2, 22);
      ctx.fillStyle = 'rgba(255,248,236,.96)'; ctx.fill(); ctx.strokeStyle = '#f05a4f'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#f05a4f'; ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(banner.text, L.w / 2, L.h * 0.2 + fs);
      ctx.globalAlpha = 1;
    }
  }
  function popText(text, x, y, color, big) { pops.push({ text, x, y, color, big, t: 0 }); }

  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    if (canvas.width < 2) layout();
    update(dt);
    try { render(); } catch (e) { /* 다음 프레임에서 다시 그림 */ }
  }

  // ===== HUD =====
  function updateHud() {
    const show = i => {
      const chip = $('p' + i), p = players[i];
      if (!p) { chip.classList.add('hidden'); return; }
      chip.classList.remove('hidden');
      $('p' + i + 'f').textContent = p.face;
      $('p' + i + 'n').textContent = p.name;
      $('p' + i + 's').textContent = solo ? `${solo.count}장 · ${'❤️'.repeat(Math.max(0, solo.lives))}` : '●'.repeat(p.wins) + '○'.repeat(Math.max(0, 2 - p.wins));
      chip.classList.toggle('on', players.length > 1 && i === cur && state === 'play');
    };
    show(0); show(1);
    $('btnSound').textContent = soundOn ? '🔊' : '🔇';
  }

  // ===== 입력 =====
  canvas.addEventListener('pointerdown', e => { ensureAudio(); e.preventDefault(); press(); });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') {
      if (state === 'play') { e.preventDefault(); ensureAudio(); press(); }
    }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ===== 메뉴·선택 화면 =====
  function hideAll() { ['menu', 'select', 'col', 'confirm', 'result'].forEach(id => $(id).classList.remove('show')); }
  function syncMenu() {
    document.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === opt[seg.dataset.key])));
    $('levelOpt').classList.toggle('hidden', opt.mode !== 'ai');
    let t;
    if (opt.mode === 'ai') { const r = rec.ai[opt.level] || { w: 0, l: 0 }; t = `🏆 ${AI_LV[opt.level].name} 전적: <b>${r.w}승 ${r.l}패</b> · 3판 2선승`; }
    else if (opt.mode === 'solo') t = `🏆 최고 기록: <b>${rec.soloBest || 0}장</b> · 목숨 3개로 연속 뒤집기`;
    else t = '한 기기로 번갈아 쳐요 · 3판 2선승';
    $('menuRec').innerHTML = t + `<br>📒 모은 딱지 <b>${col.length}</b> / 12`;
  }
  document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    opt[seg.dataset.key] = b.dataset.v; saveOpt(); ensureAudio(); sfx.click(); syncMenu();
  }));
  function showMenu() {
    state = 'menu'; phase = 'idle'; players = []; solo = null; target = null; striker = null;
    hideAll(); syncMenu(); $('menu').classList.add('show'); updateHud();
  }
  function patGrid(el, sel, onPick, readonly) {
    el.innerHTML = '';
    ANIMALS.forEach((a, i) => {
      const b = document.createElement('button');
      const has = col.includes(i);
      b.innerHTML = has ? `${a[0]}<span>${a[1]}</span>` : '🔒<span>???</span>';
      b.style.background = has ? `linear-gradient(135deg, ${a[2]} 50%, ${a[3]} 50%)` : '';
      if (!has) b.classList.add('lock');
      if (has && i === sel) b.classList.add('on');
      if (has && !readonly) b.addEventListener('click', () => { onPick(i); sfx.click(); });
      if (has && readonly) b.addEventListener('click', () => { opt.pat0 = i; saveOpt(); sfx.click(); patGrid(el, i, null, true); });
      el.appendChild(b);
    });
  }
  function showSelect(step) {
    selStep = step;
    const k = step === 0 ? 'type0' : 'type1', pk = step === 0 ? 'pat0' : 'pat1';
    if (!col.includes(opt[pk])) opt[pk] = col[step % col.length];
    $('selTitle').textContent = opt.mode === 'pvp' ? `${step + 1}P 딱지 고르기` : '내 딱지 고르기';
    $('btnSelOk').textContent = opt.mode === 'pvp' && step === 0 ? '다음' : '시작!';
    document.querySelectorAll('#types button').forEach(b => {
      b.classList.toggle('on', b.dataset.v === opt[k]);
      b.onclick = () => { opt[k] = b.dataset.v; saveOpt(); sfx.click(); showSelect(step); };
    });
    patGrid($('patGrid'), opt[pk], i => { opt[pk] = i; saveOpt(); showSelect(step); }, false);
    hideAll(); $('select').classList.add('show');
  }
  $('btnNext').addEventListener('click', () => { ensureAudio(); showSelect(0); });
  $('btnSelBack').addEventListener('click', () => { if (selStep === 1) showSelect(0); else showMenu(); });
  $('btnSelOk').addEventListener('click', () => {
    if (opt.mode === 'pvp' && selStep === 0) { showSelect(1); return; }
    startGame();
  });
  $('btnCol').addEventListener('click', () => {
    $('colCount').textContent = `${col.length} / 12 · 눌러서 내 딱지 무늬로 정해요`;
    patGrid($('colGrid'), opt.pat0, null, true);
    hideAll(); $('col').classList.add('show');
  });
  $('btnColClose').addEventListener('click', showMenu);
  $('btnAgain').addEventListener('click', startGame);
  $('btnMenu').addEventListener('click', showMenu);
  $('btnHome').addEventListener('click', () => { if (state === 'play') $('confirm').classList.add('show'); else showMenu(); });
  $('btnNo').addEventListener('click', () => $('confirm').classList.remove('show'));
  $('btnYes').addEventListener('click', showMenu);
  $('btnSound').addEventListener('click', () => {
    soundOn = !soundOn; store.set(KEY_SOUND, soundOn ? '1' : '0');
    ensureAudio(); if (soundOn) sfx.click(); updateHud();
  });

  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(layout, 60); };
  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stageEl);

  layout();
  showMenu();
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(loop); });
})();
