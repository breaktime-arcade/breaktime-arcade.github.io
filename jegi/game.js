/* 통통 제기 (Jegi Kick) - 쉬는시간 오락실 */
(() => {
  'use strict';

  // ===== 설정 =====
  const LEVELS = {
    //        첫 체공  판정창  바람 확률  AI 실수(기본, 개당 증가)
    easy:   { air: 1.25, win: 0.2,  wind: 0,    ai: [0.035, 0.0055], name: '쉬움' },
    normal: { air: 1.05, win: 0.14, wind: 0.12, ai: [0.02, 0.003],   name: '보통' },
    hard:   { air: 0.9,  win: 0.1,  wind: 0.22, ai: [0.01, 0.0017],  name: '어려움' }
  };
  const JEGIS = [
    { name: '오방색', coin: '#c9a14a', c: ['#ff4d4d', '#ffd84d', '#4fa3ff', '#ffffff', '#3a3a3a'], need: 0 },
    { name: '무지개', coin: '#d0a24a', c: ['#ff5a5a', '#ffa64d', '#ffe14d', '#5fd36b', '#4fa3ff', '#a77bff'], need: 10 },
    { name: '바다', coin: '#9fb7c9', c: ['#2f7de0', '#5fb4ff', '#a8dcff', '#ffffff'], need: 20 },
    { name: '숲', coin: '#a88a4a', c: ['#2f9e5b', '#7dd36b', '#c8f0a0', '#f2d06b'], need: 30 },
    { name: '벚꽃', coin: '#e6b0c0', c: ['#ff9fbf', '#ffd0e0', '#ffffff', '#ff7aa8'], need: 40 },
    { name: '밤하늘', coin: '#5b5f8a', c: ['#2b2d6e', '#5b5fc7', '#ffe680', '#9aa0ff'], need: 50 },
    { name: '황금', coin: '#e0b030', c: ['#ffd700', '#ffec80', '#e8a800', '#fff5c0'], need: 65 },
    { name: '불꽃', coin: '#c0502a', c: ['#ff3b1f', '#ff8a1f', '#ffd21f', '#ff5a1f'], need: 80 }
  ];
  const TECH = {
    basic: { name: '기본 차기', guide: '아무 발로나 통!' },
    both:  { name: '양발차기', guide: '왼발·오른발 번갈아!' },
    one:   { name: '헐렁이', guide: '오른발로만 계속!' },
    mix:   { name: '섞어차기', guide: '떨어지는 쪽 발로!' }
  };
  const KEY_OPT = 'jegi.opt', KEY_REC = 'jegi.rec', KEY_SOUND = 'jegi.sound';

  // ===== 저장소 =====
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }
  };
  const loadJSON = (k, d) => { try { return JSON.parse(store.get(k, '')) || d; } catch (e) { return d; } };
  const opt = Object.assign({ mode: 'solo', level: 'normal', jegi: 0 }, loadJSON(KEY_OPT, {}));
  let rec = Object.assign({ best: {}, ever: 0, ai: {} }, loadJSON(KEY_REC, {}));
  let soundOn = store.get(KEY_SOUND, '1') === '1';
  const saveOpt = () => store.set(KEY_OPT, JSON.stringify(opt));
  const unlocked = i => (rec.ever || 0) >= JEGIS[i].need;

  // ===== 요소 =====
  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), canvas = $('cv'), ctx = canvas.getContext('2d');

  // ===== 화면 =====
  const L = { w: 1, h: 1, dpr: 1, u: 4, cx: 0, gy: 0 };
  function layout() {
    const rc = stageEl.getBoundingClientRect();
    L.w = Math.max(120, rc.width); L.h = Math.max(160, rc.height);
    L.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(L.w * L.dpr); canvas.height = Math.round(L.h * L.dpr);
    L.u = Math.min(L.w * 0.9, L.h * 0.75) / 100;
    L.cx = L.w / 2; L.gy = L.h * 0.9;
  }
  const footX = side => L.cx + (side === 'L' ? -1 : 1) * 10 * L.u;
  const contactY = () => L.gy - 10 * L.u;

  // ===== 효과음 =====
  let ac = null;
  function ensureAudio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
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
  const sfx = {
    kick(n, perfect) { const f = 440 + Math.min(n, 40) * 9; tone(f, 0.09, 'triangle', 0.25, f * 1.6); if (perfect) tone(f * 2, 0.08, 'sine', 0.08, 0, 0.04); },
    toss() { tone(380, 0.15, 'sine', 0.12, 700); },
    fail() { tone(392, 0.16, 'triangle', 0.16, 300); tone(262, 0.3, 'triangle', 0.14, 180, 0.15); },
    tech() { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.13, 0, i * 0.07)); },
    wind() { tone(200, 0.4, 'sawtooth', 0.03, 500); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, 0, i * 0.12)); },
    lose() { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, 0, i * 0.14)); },
    click() { tone(800, 0.04, 'sine', 0.08); }
  };

  // ===== 상태 =====
  let state = 'menu';                   // menu | play | over
  let players = [], cur = 0, round = 1, order = [0, 1], turnIdx = 0;
  let phase = 'idle', phaseT = 0;
  let count = 0, jegi = null, kickAnim = null, lastSide = 'R';
  let pops = [], sparks = [], winds = [], banner = null, nextFn = null, nextAt = 0;
  let aiPlan = null, ff = false, clock = 0, lastT = 0, unlockedNow = [];
  const P = () => players[cur];
  const LV = () => LEVELS[opt.level];

  function techOf(n) { return n < 10 ? 'basic' : n < 20 ? 'both' : n < 30 ? 'one' : 'mix'; }

  // ===== 진행 =====
  function startGame() {
    ensureAudio();
    hideAll();
    const pat = opt.jegi;
    if (opt.mode === 'solo') players = [{ name: '나', face: '🙂', score: 0, wins: 0, ai: false, jegi: pat }];
    else if (opt.mode === 'ai') players = [
      { name: '나', face: '🙂', score: 0, wins: 0, ai: false, jegi: pat },
      { name: 'AI · ' + LV().name, face: '🤖', score: 0, wins: 0, ai: true, jegi: (pat + 3) % JEGIS.length }];
    else players = [
      { name: '1P', face: '🐰', score: 0, wins: 0, ai: false, jegi: pat },
      { name: '2P', face: '🐻', score: 0, wins: 0, ai: false, jegi: (pat + 1) % JEGIS.length }];
    round = 1; unlockedNow = []; pops = []; sparks = [];
    state = 'play';
    startRound();
  }
  function startRound() {
    order = round % 2 === 1 ? [0, 1] : [1, 0];
    players.forEach(p => { p.score = 0; });
    turnIdx = 0;
    beginAttempt();
  }
  function beginAttempt() {
    cur = players.length > 1 ? order[turnIdx] : 0;
    count = 0; jegi = null; kickAnim = null; ff = false; winds = [];
    let text;
    if (players.length === 1) text = '준비!';
    else text = `${players.length > 1 ? round + '판 · ' : ''}${P().ai ? 'AI 차례' : (opt.mode === 'ai' ? '내 차례!' : P().name + ' 차례')}`;
    banner = { text };
    setPhase('banner');
    updateHud();
  }
  function setPhase(ph) {
    phase = ph; phaseT = 0; aiPlan = null;
    if (P() && P().ai && state === 'play') planAI();
  }

  function toss() {
    if (phase !== 'ready') return;
    lastSide = 'R';
    launch(L.cx + 3 * L.u, L.gy - 26 * L.u, 'R', LV().air * 1.05, false);
    sfx.toss();
  }
  function airFor(n) { return LV().air * Math.max(0.62, 1 - n * 0.008); }
  function launch(x0, y0, side, T, golden) {
    const x1 = footX(side), y1 = contactY();
    const maxH = Math.max(40, y1 - L.h * 0.16);
    const H = Math.min(maxH, L.h * 0.46 * (T / 1.1)) * (golden ? 1.15 : 1);
    jegi = { x0, y0, x1, y1, T, H, side, golden, t: 0, windDone: false, kickedFrom: lastSide };
    setPhase('fly');
  }
  function jegiPos(j, t) {
    const k = Math.min(1.25, t / j.T);
    const x = j.x0 + (j.x1 - j.x0) * Math.min(1, k);
    const base = j.y0 + (j.y1 - j.y0) * k;
    const y = base - 4 * j.H * k * (1 - k);
    return [x, y];
  }
  function nextSide(n) {
    const t = techOf(n);
    if (t === 'basic') return Math.random() < 0.5 ? 'L' : 'R';
    if (t === 'both') return lastSide === 'L' ? 'R' : 'L';
    if (t === 'one') return 'R';
    return Math.random() < 0.5 ? 'L' : 'R';
  }

  function press(side) {
    if (state !== 'play' || !P() || P().ai) return;
    if (phase === 'ready') { toss(); return; }
    if (phase !== 'fly') return;
    tryKick(side);
  }
  function tryKick(side) {
    const j = jegi, w = LV().win, t = j.t;
    if (t < j.T - w) { fail('너무 빨리 찼어요!'); return; }
    const tech = techOf(count);
    if (tech !== 'basic' && side !== j.side) { fail(j.side === 'L' ? '왼발로 차야 해요!' : '오른발로 차야 해요!'); return; }
    const kickSide = tech === 'basic' ? j.side : side;
    const perfect = Math.abs(t - j.T) <= w * 0.4;
    const before = techOf(count);
    count += j.golden ? 2 : 1;
    lastSide = kickSide;
    kickAnim = { side: kickSide, t: 0 };
    sfx.kick(count, perfect);
    const [x, y] = jegiPos(j, t);
    popText(j.golden ? '묘기! +2' : perfect ? '완벽!' : '통!', x, y - 40, j.golden ? '#e0a800' : perfect ? '#ff6a1f' : '#3a8fd8', j.golden);
    if (perfect || j.golden) burst(x, y, j.golden ? '#ffd84d' : '#fff3a0', j.golden ? 22 : 10);
    const after = techOf(count);
    if (after !== before) {
      sfx.tech();
      popText(`${TECH[after].name}!`, L.w / 2, L.h * 0.3, '#ff6a1f', true);
      popText(TECH[after].guide, L.w / 2, L.h * 0.3 + 44, '#4a2e1e');
    }
    P().score = count;
    updateHud();
    const golden = after === 'mix' && Math.random() < 0.14;
    launch(x, y, nextSide(count), airFor(count) * (golden ? 1.35 : 1), golden);
  }
  function fail(msg) {
    if (phase !== 'fly') return;
    sfx.fail();
    popText('아이고!', L.w / 2, L.h * 0.38, '#e24a4a', true);
    popText(msg, L.w / 2, L.h * 0.38 + 46, '#5a3a2a');
    const [x, y] = jegiPos(jegi, jegi.t);
    jegi.drop = { x, y, vy: -60, vx: (Math.random() - 0.5) * 120 };
    P().score = count;
    setPhase('fall');
    later(1.5, endAttempt);
  }
  function later(sec, fn) { nextFn = fn; nextAt = sec; }

  function endAttempt() {
    const p = P();
    if (!p.ai) {
      if (count > (rec.ever || 0)) {
        const before = rec.ever || 0;
        rec.ever = count;
        JEGIS.forEach((jg, i) => { if (jg.need > before && jg.need <= count) unlockedNow.push(i); });
      }
    }
    if (players.length === 1) { finish(); return; }
    // 대결: 판 정리
    popText(`${p.name} ${count}개!`, L.w / 2, L.h * 0.24, '#ff6a1f', true);
    turnIdx++;
    if (turnIdx < 2) { later(1.0, beginAttempt); setPhase('wait'); return; }
    const [a, b] = players;
    let msg;
    if (a.score > b.score) { a.wins++; msg = `${a.name} 이 판 승리!`; }
    else if (b.score > a.score) { b.wins++; msg = `${b.name} 이 판 승리!`; }
    else msg = '비겼어요!';
    banner = { text: msg };
    updateHud();
    setPhase('roundEnd');
    const done = a.wins >= 2 || b.wins >= 2 || round >= 5;
    later(1.8, () => { if (done) finish(); else { round++; startRound(); } });
  }

  function finish() {
    state = 'over'; phase = 'idle';
    let emoji, title, msg, info;
    if (opt.mode === 'solo') {
      const best = rec.best[opt.level] || 0;
      const isBest = count > best;
      if (isBest) rec.best[opt.level] = count;
      emoji = count >= 40 ? '🏆' : count >= 20 ? '🎉' : count >= 10 ? '😄' : '🙂';
      title = `${count}개!`;
      msg = isBest && count > 0 ? '최고 기록을 새로 세웠어요!' : count >= 30 ? '제기 고수가 나타났어요!' : '다시 도전해서 기록을 깨 보세요!';
      info = `이번 기록 <b>${count}개</b> · 기술 <b>${TECH[techOf(Math.max(0, count - 1))].name}</b><br>최고 기록(${LV().name}) <b>${rec.best[opt.level]}개</b>`;
      sfx.win();
    } else {
      const [a, b] = players;
      const winner = a.wins > b.wins ? a : b.wins > a.wins ? b : null;
      if (opt.mode === 'ai') {
        const r = rec.ai[opt.level] || { w: 0, l: 0 };
        const won = winner === a;
        if (winner) won ? r.w++ : r.l++;
        rec.ai[opt.level] = r;
        emoji = !winner ? '🤝' : won ? '🎉' : '😢';
        title = !winner ? '무승부' : won ? '이겼어요!' : '아쉽게 졌어요';
        msg = won ? `AI(${LV().name})보다 많이 찼어요!` : '한 판 더 하면 이길 수 있어요!';
        info = `나 <b>${a.wins}</b> : <b>${b.wins}</b> AI<br>${LV().name} 전적: <b>${r.w}승 ${r.l}패</b>`;
        won ? sfx.win() : sfx.lose();
      } else {
        emoji = winner ? '🏆' : '🤝';
        title = winner ? `${winner.name} 승리!` : '무승부';
        msg = winner ? '제기왕이 탄생했어요!' : '막상막하였어요!';
        info = `1P <b>${a.wins}</b> : <b>${b.wins}</b> 2P`;
        sfx.win();
      }
    }
    store.set(KEY_REC, JSON.stringify(rec));
    $('resEmoji').textContent = emoji; $('resTitle').textContent = title;
    $('resMsg').textContent = msg; $('resInfo').innerHTML = info;
    $('resUnlock').innerHTML = unlockedNow.map(i => `<div class="unlock">🎀 새 제기: ${JEGIS[i].name}</div>`).join('');
    setTimeout(() => $('result').classList.add('show'), 500);
    updateHud();
  }

  // ===== AI =====
  function planAI() {
    if (phase === 'ready') { aiPlan = { t: 0.6 + Math.random() * 0.4, act: () => toss() }; return; }
    if (phase !== 'fly') return;
    const lv = LV(), j = jegi, w = lv.win;
    const pf = lv.ai[0] + count * lv.ai[1];
    if (Math.random() < pf) {
      if (Math.random() < 0.5) aiPlan = { t: j.T - w * (1.5 + Math.random()), act: () => tryKick(j.side) };
      else aiPlan = null;                                      // 놓침
    } else {
      const err = (Math.random() * 2 - 1) * w * 0.75;
      aiPlan = { t: j.T + err, act: () => tryKick(j.side) };
    }
  }

  // ===== 업데이트 =====
  function update(dtReal) {
    clock += dtReal;
    const dt = dtReal * (ff && P() && P().ai ? 2.5 : 1);
    pops.forEach(p => { p.t += dtReal; }); pops = pops.filter(p => p.t < 1.4);
    sparks.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt; }); sparks = sparks.filter(p => p.life > 0);
    winds.forEach(wd => { wd.x += wd.vx * dt; wd.life -= dt; }); winds = winds.filter(wd => wd.life > 0);
    if (state !== 'play') return;
    phaseT += dt;
    if (kickAnim) { kickAnim.t += dt; if (kickAnim.t > 0.22) kickAnim = null; }
    if (phase === 'banner' && phaseT > 1.0) setPhase('ready');
    if (phase === 'fly') {
      jegi.t += dt;
      // 바람: 섞어차기에서 떨어질 방향이 바뀜
      if (!jegi.windDone && techOf(count) === 'mix' && jegi.t > jegi.T * 0.42) {
        jegi.windDone = true;
        if (Math.random() < LV().wind) {
          const [x] = jegiPos(jegi, jegi.t);
          const ns = jegi.side === 'L' ? 'R' : 'L';
          const k = jegi.t / jegi.T;
          jegi.side = ns; jegi.x1 = footX(ns);
          jegi.x0 = (x - jegi.x1 * k) / (1 - k);             // 지금 위치는 그대로, 떨어질 곳만 바뀜
          sfx.wind();
          popText('바람!', L.w / 2, L.h * 0.33, '#3a8fd8', true);
          for (let i = 0; i < 6; i++) winds.push({ x: ns === 'L' ? L.w : 0, y: L.h * (0.25 + Math.random() * 0.4), vx: ns === 'L' ? -500 : 500, life: 1 });
        }
      }
      if (jegi.t > jegi.T + LV().win) fail('놓쳤어요!');
    }
    if (phase === 'fall' && jegi && jegi.drop) {
      const d = jegi.drop;
      d.vy += 900 * dt; d.x += d.vx * dt; d.y = Math.min(L.gy - 3 * L.u, d.y + d.vy * dt);
    }
    if (aiPlan && P() && P().ai) {
      if ((phase === 'ready' && phaseT >= aiPlan.t) || (phase === 'fly' && jegi.t >= aiPlan.t)) { const a2 = aiPlan; aiPlan = null; a2.act(); }
    }
    if ((phase === 'wait' || phase === 'fall' || phase === 'roundEnd') && nextFn && phaseT >= nextAt) { const f = nextFn; nextFn = null; f(); }
  }

  // ===== 그리기 =====
  function rr(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawScene() {
    const g = ctx.createLinearGradient(0, 0, 0, L.gy);
    g.addColorStop(0, '#9fd3f5'); g.addColorStop(1, '#e8f6ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h);
    // 해
    ctx.fillStyle = 'rgba(255,220,120,.85)';
    ctx.beginPath(); ctx.arc(L.w * 0.85, L.h * 0.12, Math.min(L.w, L.h) * 0.06, 0, Math.PI * 2); ctx.fill();
    // 구름
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    const cx0 = (clock * 8) % (L.w + 200) - 100;
    [[cx0, L.h * 0.14], [cx0 + L.w * 0.45, L.h * 0.08]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.ellipse(x, y, 40, 14, 0, 0, Math.PI * 2); ctx.ellipse(x + 26, y - 8, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
    });
    // 한옥 지붕
    const ry = L.gy - L.h * 0.3, rw = Math.min(L.w * 0.5, 320);
    ctx.fillStyle = '#e9dcc4'; ctx.fillRect(L.w * 0.02, ry + 18, rw * 0.9, L.gy - ry - 18);
    ctx.fillStyle = '#b07a46';
    for (let i = 0; i < 4; i++) ctx.fillRect(L.w * 0.02 + 10 + i * rw * 0.22, ry + 30, rw * 0.13, L.gy - ry - 40);
    ctx.fillStyle = '#4b5563';
    ctx.beginPath();
    ctx.moveTo(L.w * 0.02 - 30, ry + 22);
    ctx.quadraticCurveTo(L.w * 0.02 + rw * 0.45, ry - 10, L.w * 0.02 + rw * 0.9 + 30, ry + 22);
    ctx.lineTo(L.w * 0.02 + rw * 0.8, ry - 22); ctx.lineTo(L.w * 0.02 + rw * 0.1, ry - 22); ctx.closePath(); ctx.fill();
    // 감나무
    const tx = L.w * 0.86, ty = L.gy;
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - L.h * 0.3); ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(tx, ty - L.h * 0.2); ctx.lineTo(tx - 50, ty - L.h * 0.3); ctx.moveTo(tx, ty - L.h * 0.25); ctx.lineTo(tx + 40, ty - L.h * 0.34); ctx.stroke();
    ctx.fillStyle = '#5aa858';
    ctx.beginPath(); ctx.ellipse(tx, ty - L.h * 0.34, 70, 42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8a2a';
    [[-40, -0.33], [-10, -0.37], [25, -0.32], [45, -0.36], [5, -0.3], [-25, -0.38]].forEach(([dx, dy]) => {
      ctx.beginPath(); ctx.arc(tx + dx, ty + L.h * dy, 6, 0, Math.PI * 2); ctx.fill();
    });
    // 돌담
    ctx.fillStyle = '#c9b8a0';
    ctx.fillRect(0, L.gy - L.h * 0.06, L.w, L.h * 0.06);
    ctx.fillStyle = 'rgba(120,100,80,.25)';
    for (let x = 0; x < L.w; x += 36) for (let r = 0; r < 2; r++) { ctx.beginPath(); ctx.ellipse(x + (r ? 18 : 0), L.gy - L.h * 0.045 + r * L.h * 0.025, 15, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    // 마당
    const gg = ctx.createLinearGradient(0, L.gy, 0, L.h);
    gg.addColorStop(0, '#d9b07a'); gg.addColorStop(1, '#c49360');
    ctx.fillStyle = gg; ctx.fillRect(0, L.gy - 2, L.w, L.h - L.gy + 2);
  }
  function drawKid(p) {
    const u = L.u, x = L.cx, gy = L.gy;
    const hipY = gy - 17 * u;
    const tech = techOf(count);
    const footPos = side => {
      const sx = side === 'L' ? -1 : 1;
      let fx = x + sx * 10 * u, fy = gy - 2 * u;
      if (kickAnim && kickAnim.side === side) {
        const k = Math.sin(Math.PI * Math.min(1, kickAnim.t / 0.22));
        fx += sx * 3 * u * k; fy -= 9 * u * k;
      } else if (tech === 'one' && side === 'R' && phase === 'fly') { fy -= 4 * u; fx += 2 * u; }
      return [fx, fy];
    };
    ctx.lineCap = 'round';
    // 다리
    ['L', 'R'].forEach(side => {
      const [fx, fy] = footPos(side);
      ctx.strokeStyle = '#4a6ea8'; ctx.lineWidth = 4.5 * u;
      ctx.beginPath(); ctx.moveTo(x + (side === 'L' ? -3.5 : 3.5) * u, hipY); ctx.lineTo(fx, fy - 2 * u); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#8c6a4a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(fx + (side === 'L' ? -1 : 1) * u, fy, 3.6 * u, 2 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    // 몸통 (저고리)
    const colors = ['#ff8a8a', '#ffd166', '#7cc8ff'];
    ctx.fillStyle = p && p.ai ? '#9aa6c8' : colors[cur % 3];
    rr(x - 8 * u, hipY - 16 * u, 16 * u, 17 * u, 5 * u); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 3 * u, hipY - 16 * u); ctx.lineTo(x + 1 * u, hipY - 9 * u); ctx.lineTo(x + 3 * u, hipY - 16 * u); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e24a4a'; ctx.beginPath(); ctx.ellipse(x + 2 * u, hipY - 9 * u, 2 * u, 1.2 * u, 0.4, 0, Math.PI * 2); ctx.fill();
    // 팔
    ctx.strokeStyle = '#ffd9b8'; ctx.lineWidth = 3.2 * u;
    const sw = Math.sin(clock * 6) * 1.5 * u;
    ctx.beginPath(); ctx.moveTo(x - 7 * u, hipY - 13 * u); ctx.lineTo(x - 14 * u, hipY - 6 * u + sw); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 7 * u, hipY - 13 * u); ctx.lineTo(x + 14 * u, hipY - 6 * u - sw); ctx.stroke();
    // 머리
    const hy = hipY - 24 * u;
    ctx.fillStyle = '#ffd9b8'; ctx.beginPath(); ctx.arc(x, hy, 8 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2d2219';
    ctx.beginPath(); ctx.arc(x, hy - 1.5 * u, 8.3 * u, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.beginPath(); ctx.arc(x, hy - 8 * u, 2.4 * u, 0, Math.PI * 2); ctx.fill();
    // 얼굴 (제기를 올려다봄)
    let lookX = 0, lookY = -0.6;
    if (jegi && phase === 'fly') { const [jx, jy] = jegiPos(jegi, jegi.t); const dx = jx - x, dy = jy - hy, d = Math.hypot(dx, dy) || 1; lookX = dx / d; lookY = dy / d; }
    ctx.fillStyle = '#2d2219';
    [-3, 3].forEach(ex => { ctx.beginPath(); ctx.arc(x + ex * u + lookX * 1.2 * u, hy + 1 * u + lookY * 1.2 * u, 1.1 * u, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,120,120,.5)';
    [-5, 5].forEach(ex => { ctx.beginPath(); ctx.ellipse(x + ex * u, hy + 3.5 * u, 1.6 * u, 1 * u, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = '#8a3a2a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, hy + 4 * u, 1.8 * u, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    if (phase === 'ready' || phase === 'banner') {
      // 손에 든 제기
      drawJegi(x + 14 * u, hipY - 8 * u, 0, -1, p ? p.jegi : opt.jegi, 0.9);
    }
  }
  function drawJegi(x, y, vx, vy, design, scale = 1) {
    const d = JEGIS[design], s = 3.4 * L.u * scale;
    // 술은 움직임 반대 방향으로 날림
    let dx = -vx, dy = -vy; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    if (Math.hypot(vx, vy) < 1) { dx = 0; dy = -1; }
    const n = d.c.length * 2;
    for (let i = 0; i < n; i++) {
      const spread = (i / (n - 1) - 0.5) * 0.9;
      const ang = Math.atan2(dy, dx) + spread + Math.sin(clock * 12 + i) * 0.08;
      const L2 = s * (3.2 + (i % 3) * 0.4);
      ctx.strokeStyle = d.c[i % d.c.length]; ctx.lineWidth = Math.max(1.5, s * 0.32); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y);
      const mx = x + Math.cos(ang) * L2 * 0.5 + Math.sin(clock * 9 + i) * s * 0.3, my = y + Math.sin(ang) * L2 * 0.5;
      ctx.quadraticCurveTo(mx, my, x + Math.cos(ang) * L2, y + Math.sin(ang) * L2);
      ctx.stroke();
    }
    ctx.fillStyle = d.coin; ctx.strokeStyle = 'rgba(80,50,20,.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, s * 1.1, s * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(60,40,20,.7)'; ctx.fillRect(x - s * 0.25, y - s * 0.18, s * 0.5, s * 0.36);
  }
  function drawRing() {
    if (phase !== 'fly' || !jegi) return;
    const j = jegi, w = LV().win, remain = Math.max(0, j.T - j.t);
    const r0 = 5 * L.u, R = r0 * (1 + 2.2 * remain / j.T);
    const inWin = Math.abs(j.t - j.T) <= w;
    const x = j.x1, y = j.y1;
    ctx.strokeStyle = inWin ? '#2fbf71' : (j.golden ? '#e0a800' : 'rgba(255,106,31,.85)');
    ctx.lineWidth = inWin ? 6 : 4;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(70,50,30,.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawSideHints() {
    if (!(phase === 'fly' || phase === 'ready')) return;
    const tech = techOf(count);
    const need = phase === 'fly' && tech !== 'basic' ? jegi.side : null;
    const fs = Math.max(14, Math.min(20, L.w / 24));
    ctx.font = `${fs}px Jua, sans-serif`; ctx.textBaseline = 'middle';
    [['L', '◀ 왼발', 14, 'left'], ['R', '오른발 ▶', L.w - 14, 'right']].forEach(([s, txt, x, al]) => {
      ctx.textAlign = al;
      const on = need === s;
      ctx.fillStyle = on ? '#ff6a1f' : 'rgba(74,46,30,.45)';
      ctx.fillText(txt, x, L.h - fs);
    });
  }
  function drawTop() {
    if (state !== 'play') return;
    const fs = Math.max(40, Math.min(L.w, L.h) / 7);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${fs}px Jua, sans-serif`;
    ctx.lineWidth = 7; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
    ctx.strokeText(String(count), L.w / 2, L.h * 0.09 + fs * 0.3);
    ctx.fillStyle = '#ff6a1f'; ctx.fillText(String(count), L.w / 2, L.h * 0.09 + fs * 0.3);
    const tech = TECH[techOf(count)];
    const gs = Math.max(14, Math.min(18, L.w / 25));
    ctx.font = `${gs}px Jua, sans-serif`;
    let t = `${tech.name} · ${tech.guide}`;
    if (phase === 'ready') t = P().ai ? 'AI가 제기를 띄워요' : '아무 곳이나 눌러 제기를 띄워요';
    if (P() && P().ai && phase === 'fly') t = ff ? '▶▶ 빨리 감는 중' : `AI 차는 중 · 화면을 누르면 빨리 감기`;
    const tw = ctx.measureText(t).width + 24, y = L.h * 0.09 + fs * 0.85;
    rr(L.w / 2 - tw / 2, y, tw, gs * 1.7, gs * 0.85);
    ctx.fillStyle = P() && P().ai ? 'rgba(80,90,130,.85)' : 'rgba(255,138,61,.92)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(t, L.w / 2, y + gs * 0.87);
  }

  function render() {
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    drawScene();
    if (state === 'menu') {
      const y = L.h * 0.45 + Math.sin(clock * 3) * L.h * 0.12;
      drawKid(null);
      drawJegi(L.cx + 10 * L.u, y, 0, Math.cos(clock * 3) * -50, opt.jegi, 1.2);
      return;
    }
    // 바람 줄
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
    winds.forEach(wd => { ctx.globalAlpha = Math.max(0, wd.life); ctx.beginPath(); ctx.moveTo(wd.x, wd.y); ctx.lineTo(wd.x - wd.vx * 0.12, wd.y); ctx.stroke(); });
    ctx.globalAlpha = 1;
    drawKid(P());
    drawRing();
    if (jegi) {
      if (phase === 'fall' && jegi.drop) drawJegi(jegi.drop.x, jegi.drop.y, 0, 0.1, P().jegi);
      else if (phase === 'fly') {
        const [x, y] = jegiPos(jegi, jegi.t), [x2, y2] = jegiPos(jegi, jegi.t + 0.02);
        if (jegi.golden) { ctx.fillStyle = 'rgba(255,215,0,.35)'; ctx.beginPath(); ctx.arc(x, y, 7 * L.u, 0, Math.PI * 2); ctx.fill(); }
        drawJegi(x, y, x2 - x, y2 - y, P().jegi);
      }
    }
    sparks.forEach(p => { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    drawTop();
    drawSideHints();
    pops.forEach(pp => {
      const fs = pp.big ? Math.min(44, Math.max(26, L.w / 13)) : Math.min(24, Math.max(16, L.w / 24));
      ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.4 - pp.t) * 2));
      ctx.save(); ctx.translate(pp.x, pp.y - pp.t * 28); const sc = 1 + Math.max(0, 0.2 - pp.t); ctx.scale(sc, sc);
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
      ctx.strokeText(pp.text, 0, 0); ctx.fillStyle = pp.color; ctx.fillText(pp.text, 0, 0);
      ctx.restore(); ctx.globalAlpha = 1;
    });
    if ((phase === 'banner' || phase === 'roundEnd') && banner) {
      const fs = Math.max(28, Math.min(L.w, 480) / 10);
      const a = phase === 'banner' ? Math.max(0, Math.min(1, phaseT * 5, (1.0 - phaseT) * 5)) : 1;
      ctx.globalAlpha = a;
      const bw = Math.min(L.w * 0.86, 460);
      rr(L.w / 2 - bw / 2, L.h * 0.34, bw, fs * 2, 22);
      ctx.fillStyle = 'rgba(255,248,236,.96)'; ctx.fill(); ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#ff6a1f'; ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(banner.text, L.w / 2, L.h * 0.34 + fs);
      ctx.globalAlpha = 1;
    }
  }
  function popText(text, x, y, color, big) { pops.push({ text, x, y, color, big, t: 0 }); }
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 160; sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.5 + Math.random() * 0.3, color }); }
  }

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
      $('p' + i + 'f').textContent = p.face; $('p' + i + 'n').textContent = p.name;
      $('p' + i + 's').textContent = players.length > 1 ? `${p.score}개 · ${'●'.repeat(p.wins)}${'○'.repeat(Math.max(0, 2 - p.wins))}` : `${p.score}개 · 최고 ${rec.best[opt.level] || 0}`;
      chip.classList.toggle('on', players.length > 1 && i === cur && state === 'play');
    };
    if (!players.length) { $('p0').classList.add('hidden'); $('p1').classList.add('hidden'); }
    else { show(0); show(1); }
    $('btnSound').textContent = soundOn ? '🔊' : '🔇';
  }

  // ===== 입력 =====
  canvas.addEventListener('pointerdown', e => {
    ensureAudio(); e.preventDefault();
    if (state !== 'play') return;
    if (P() && P().ai) { ff = !ff; return; }
    const r = canvas.getBoundingClientRect();
    press(e.clientX - r.left < r.width / 2 ? 'L' : 'R');
  });
  window.addEventListener('keydown', e => {
    if (state !== 'play') return;
    const k = e.key;
    let s = null;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') s = 'L';
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') s = 'R';
    else if (k === ' ' || k === 'Enter') { if (phase === 'ready') s = 'R'; else if (P() && P().ai) { ff = !ff; e.preventDefault(); return; } }
    if (!s) return;
    e.preventDefault(); ensureAudio();
    if (e.repeat) return;
    press(s);
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ===== 메뉴 =====
  function hideAll() { ['menu', 'confirm', 'result'].forEach(id => $(id).classList.remove('show')); }
  function jegiIcon(i) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d'), d = JEGIS[i];
    d.c.forEach((col, k) => {
      g.strokeStyle = col; g.lineWidth = 5; g.lineCap = 'round';
      const a = -Math.PI / 2 + (k / (d.c.length - 1) - 0.5) * 1.2;
      g.beginPath(); g.moveTo(32, 46); g.quadraticCurveTo(32 + Math.cos(a) * 14 + 4, 46 + Math.sin(a) * 14, 32 + Math.cos(a) * 34, 46 + Math.sin(a) * 34); g.stroke();
    });
    g.fillStyle = d.coin; g.beginPath(); g.ellipse(32, 48, 12, 7, 0, 0, Math.PI * 2); g.fill();
    return c;
  }
  function syncMenu() {
    document.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === opt[seg.dataset.key])));
    if (!unlocked(opt.jegi)) opt.jegi = 0;
    const box = $('jegis'); box.innerHTML = '';
    JEGIS.forEach((d, i) => {
      const b = document.createElement('button');
      if (unlocked(i)) {
        b.appendChild(jegiIcon(i)); b.title = d.name;
        if (i === opt.jegi) b.classList.add('on');
        b.addEventListener('click', () => { opt.jegi = i; saveOpt(); sfx.click(); syncMenu(); });
      } else { b.classList.add('lock'); b.textContent = d.need; b.title = `${d.need}개 넘기면 열려요`; }
      box.appendChild(b);
    });
    $('jegiLabel').textContent = `내 제기: ${JEGIS[opt.jegi].name} (잠긴 제기의 숫자만큼 차면 열려요)`;
    let t;
    if (opt.mode === 'ai') { const r = rec.ai[opt.level] || { w: 0, l: 0 }; t = `🏆 ${LV().name} 전적: <b>${r.w}승 ${r.l}패</b> · 번갈아 차서 더 많이 찬 쪽이 이겨요 (3판 2선승)`; }
    else if (opt.mode === 'pvp') t = '번갈아 차서 더 많이 찬 쪽이 이겨요 (3판 2선승)';
    else t = `🏆 최고 기록(${LV().name}): <b>${rec.best[opt.level] || 0}개</b>`;
    $('menuRec').innerHTML = t;
  }
  document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    opt[seg.dataset.key] = b.dataset.v; saveOpt(); ensureAudio(); sfx.click(); syncMenu();
  }));
  function showMenu() {
    state = 'menu'; phase = 'idle'; players = []; jegi = null; count = 0;
    hideAll(); syncMenu(); $('menu').classList.add('show'); updateHud();
  }
  $('btnStart').addEventListener('click', startGame);
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
