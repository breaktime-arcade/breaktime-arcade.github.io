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
  const SHIRTS = ['#ff8a8a', '#7cc8ff', '#ffd166'];
  const KEY_OPT = 'jegi.opt', KEY_REC = 'jegi.rec', KEY_SOUND = 'jegi.sound';

  // ===== 저장소 =====
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }
  };
  const loadJSON = (k, d) => { try { return JSON.parse(store.get(k, '')) || d; } catch (e) { return d; } };
  const opt = Object.assign({ mode: 'solo', style: 'turn', level: 'normal', jegi: 0 }, loadJSON(KEY_OPT, {}));
  let rec = Object.assign({ best: {}, ever: 0, ai: {} }, loadJSON(KEY_REC, {}));
  let soundOn = store.get(KEY_SOUND, '1') === '1';
  const saveOpt = () => store.set(KEY_OPT, JSON.stringify(opt));
  const unlocked = i => (rec.ever || 0) >= JEGIS[i].need;
  const isSim = () => opt.mode !== 'solo' && opt.style === 'sim';

  // ===== 요소 =====
  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), canvas = $('cv'), ctx = canvas.getContext('2d');

  // ===== 화면 =====
  const L = { w: 1, h: 1, dpr: 1, gy: 0 };
  function layout() {
    const rc = stageEl.getBoundingClientRect();
    L.w = Math.max(120, rc.width); L.h = Math.max(160, rc.height);
    L.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(L.w * L.dpr); canvas.height = Math.round(L.h * L.dpr);
    L.gy = L.h * 0.9;
  }
  // 레인(아이 한 명 + 제기 하나)의 위치와 크기
  function geo(l) {
    if (lanes.length <= 1) return { cx: L.w / 2, u: Math.min(L.w * 0.9, L.h * 0.75) / 100 };
    return { cx: L.w * (l.slot === 0 ? 0.27 : 0.73), u: Math.min(L.w * 0.42, L.h * 0.68) / 100 };
  }
  const footX = (l, side) => { const g = geo(l); return g.cx + (side === 'L' ? -1 : 1) * 10 * g.u; };
  const contactY = l => L.gy - 10 * geo(l).u;

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
    kick(n, perfect, slot) { const f = (slot === 1 ? 520 : 440) + Math.min(n, 40) * 9; tone(f, 0.09, 'triangle', 0.22, f * 1.6); if (perfect) tone(f * 2, 0.08, 'sine', 0.07, 0, 0.04); },
    toss() { tone(380, 0.15, 'sine', 0.12, 700); },
    fail() { tone(392, 0.16, 'triangle', 0.16, 300); tone(262, 0.3, 'triangle', 0.14, 180, 0.15); },
    tech() { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.13, 0, i * 0.07)); },
    wind() { tone(200, 0.4, 'sawtooth', 0.03, 500); },
    go() { tone(900, 0.25, 'triangle', 0.18, 1300); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, 0, i * 0.12)); },
    lose() { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, 0, i * 0.14)); },
    click() { tone(800, 0.04, 'sine', 0.08); }
  };

  // ===== 상태 =====
  let state = 'menu';                   // menu | play | over
  let players = [], lanes = [], round = 1, order = [0, 1], turnIdx = 0;
  let phase = 'idle', phaseT = 0, simTime = 0;
  let pops = [], sparks = [], winds = [], banner = null, nextFn = null, nextAt = 0;
  let ff = false, clock = 0, lastT = 0, unlockedNow = [], roundFails = [];
  const LV = () => LEVELS[opt.level];
  const techOf = n => n < 10 ? 'basic' : n < 20 ? 'both' : n < 30 ? 'one' : 'mix';
  const laneOf = pIdx => lanes.find(l => l.p === pIdx);
  const humanSolo = () => lanes.length === 1 && !players[lanes[0].p].ai;

  function newLane(pIdx, slot) {
    return { p: pIdx, slot, count: 0, jegi: null, kick: null, lastSide: 'R', st: 'hold', aiPlan: null };
  }

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
    players.forEach(p => { p.score = 0; });
    if (isSim()) {
      lanes = [newLane(0, 0), newLane(1, 1)];
      simTime = 0; roundFails = [];
      banner = { text: `${round}판 · 준비… 시작!` };
      winds = [];
      setPhase('banner');
    } else {
      order = round % 2 === 1 ? [0, 1] : [1, 0];
      turnIdx = 0;
      beginAttempt();
    }
    updateHud();
  }
  function beginAttempt() {
    const pIdx = players.length > 1 ? order[turnIdx] : 0;
    lanes = [newLane(pIdx, 0)];
    ff = false; winds = [];
    const p = players[pIdx];
    let text;
    if (players.length === 1) text = '준비!';
    else text = `${round}판 · ${p.ai ? 'AI 차례' : (opt.mode === 'ai' ? '내 차례!' : p.name + ' 차례')}`;
    banner = { text };
    setPhase('banner');
    updateHud();
  }
  function setPhase(ph) { phase = ph; phaseT = 0; }

  function toss(l) {
    if (l.st !== 'hold') return;
    l.lastSide = 'R';
    const g = geo(l);
    launch(l, g.cx + 3 * g.u, L.gy - 26 * g.u, 'R', LV().air * 1.05, false);
    sfx.toss();
  }
  function airFor(l) {
    let k = Math.max(0.62, 1 - l.count * 0.008);
    if (isSim()) k *= Math.max(0.72, 1 - simTime * 0.0035);        // 동시 대결은 시간이 갈수록 빨라짐
    return LV().air * Math.max(0.5, k);
  }
  function launch(l, x0, y0, side, T, golden) {
    const x1 = footX(l, side), y1 = contactY(l);
    const maxH = Math.max(40, y1 - L.h * 0.2);
    const H = Math.min(maxH, L.h * 0.46 * (T / 1.1)) * (golden ? 1.12 : 1);
    l.jegi = { x0, y0, x1, y1, T, H, side, golden, t: 0, windDone: false };
    l.st = 'fly';
    planAI(l);
  }
  function jegiPos(j, t) {
    const k = Math.min(1.25, t / j.T);
    const x = j.x0 + (j.x1 - j.x0) * Math.min(1, k);
    const base = j.y0 + (j.y1 - j.y0) * k;
    return [x, base - 4 * j.H * k * (1 - k)];
  }
  function nextSide(l) {
    const t = techOf(l.count);
    if (t === 'basic') return Math.random() < 0.5 ? 'L' : 'R';
    if (t === 'both') return l.lastSide === 'L' ? 'R' : 'L';
    if (t === 'one') return 'R';
    return Math.random() < 0.5 ? 'L' : 'R';
  }

  // 사람 입력: 어느 플레이어의 어느 발인지
  function press(pIdx, side) {
    if (state !== 'play' || phase !== 'play') return;
    const l = laneOf(pIdx);
    if (!l || players[l.p].ai) return;
    if (l.st === 'hold') { toss(l); return; }
    if (l.st === 'fly') tryKick(l, side);
  }
  function tryKick(l, side) {
    const j = l.jegi, w = LV().win, t = j.t;
    if (t < j.T - w) { fail(l, '너무 빨리 찼어요!'); return; }
    const tech = techOf(l.count);
    if (tech !== 'basic' && side !== j.side) { fail(l, j.side === 'L' ? '왼발로 차야 해요!' : '오른발로 차야 해요!'); return; }
    const kickSide = tech === 'basic' ? j.side : side;
    const perfect = Math.abs(t - j.T) <= w * 0.4;
    const before = techOf(l.count);
    l.count += j.golden ? 2 : 1;
    l.lastSide = kickSide;
    l.kick = { side: kickSide, t: 0 };
    sfx.kick(l.count, perfect, l.slot);
    const [x, y] = jegiPos(j, t);
    popText(j.golden ? '묘기! +2' : perfect ? '완벽!' : '통!', x, y - 34, j.golden ? '#e0a800' : perfect ? '#ff6a1f' : '#3a8fd8', j.golden);
    if (perfect || j.golden) burst(x, y, j.golden ? '#ffd84d' : '#fff3a0', j.golden ? 20 : 9);
    const after = techOf(l.count);
    if (after !== before) {
      sfx.tech();
      const g = geo(l);
      popText(`${TECH[after].name}!`, g.cx, L.h * 0.33, '#ff6a1f', true);
      popText(TECH[after].guide, g.cx, L.h * 0.33 + 40, '#4a2e1e');
    }
    players[l.p].score = l.count;
    updateHud();
    const golden = after === 'mix' && Math.random() < 0.14;
    launch(l, x, y, nextSide(l), airFor(l) * (golden ? 1.3 : 1), golden);
  }
  function fail(l, msg) {
    if (l.st !== 'fly') return;
    sfx.fail();
    const g = geo(l);
    popText('아이고!', g.cx, L.h * 0.4, '#e24a4a', true);
    popText(msg, g.cx, L.h * 0.4 + 42, '#5a3a2a');
    const [x, y] = jegiPos(l.jegi, l.jegi.t);
    l.jegi.drop = { x, y, vy: -60, vx: (Math.random() - 0.5) * 120 };
    l.st = 'fall';
    players[l.p].score = l.count;
    noteRecord(l);
    if (isSim()) simFail(l);
    else { setPhase('wait'); later(1.5, endAttempt); }
  }
  function later(sec, fn) { nextFn = fn; nextAt = sec; }
  function noteRecord(l) {
    if (players[l.p].ai) return;
    if (l.count > (rec.ever || 0)) {
      const before = rec.ever || 0;
      rec.ever = l.count;
      JEGIS.forEach((jg, i) => { if (jg.need > before && jg.need <= l.count && !unlockedNow.includes(i)) unlockedNow.push(i); });
      store.set(KEY_REC, JSON.stringify(rec));
    }
  }

  // ----- 번갈아 하기 / 혼자 하기 -----
  function endAttempt() {
    const l = lanes[0], p = players[l.p];
    if (players.length === 1) { finish(); return; }
    popText(`${p.name} ${l.count}개!`, L.w / 2, L.h * 0.26, '#ff6a1f', true);
    turnIdx++;
    if (turnIdx < 2) { setPhase('wait'); later(1.0, beginAttempt); return; }
    settleRound();
  }
  function settleRound() {
    const [a, b] = players;
    let msg;
    if (a.score > b.score) { a.wins++; msg = `${a.name} 이 판 승리!`; }
    else if (b.score > a.score) { b.wins++; msg = `${b.name} 이 판 승리!`; }
    else msg = '비겼어요!';
    banner = { text: msg };
    updateHud();
    setPhase('roundEnd');
    const done = a.wins >= 2 || b.wins >= 2 || round >= 5;
    later(1.9, () => { if (done) finish(); else { round++; startRound(); } });
  }

  // ----- 동시에 하기: 먼저 떨어뜨리면 그 판 패배 -----
  function simFail(l) {
    roundFails.push({ p: l.p, at: simTime });
    if (roundFails.length === 1) {
      // 거의 같은 순간 둘 다 떨어뜨리면 무승부: 잠깐 지켜본 뒤 판정
      setPhase('simJudge');
    }
  }
  function simJudge() {
    lanes.forEach(l => { if (l.st === 'fly') l.st = 'freeze'; });
    const [a, b] = players;
    let msg;
    if (roundFails.length >= 2 && Math.abs(roundFails[1].at - roundFails[0].at) < 0.2) msg = '동시에 떨어뜨렸어요! 비김';
    else {
      const loser = roundFails[0].p, winner = players[1 - loser];
      winner.wins++;
      msg = `${winner.name} 이 판 승리!`;
    }
    banner = { text: msg };
    updateHud();
    setPhase('roundEnd');
    const done = a.wins >= 2 || b.wins >= 2 || round >= 5;
    later(2.0, () => { if (done) finish(); else { round++; startRound(); } });
  }

  function finish() {
    state = 'over'; phase = 'idle';
    let emoji, title, msg, info;
    if (opt.mode === 'solo') {
      const count = lanes[0].count;
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
      const styleName = isSim() ? '동시에' : '번갈아';
      if (opt.mode === 'ai') {
        const key = opt.level + (isSim() ? '_sim' : '');
        const r = rec.ai[key] || { w: 0, l: 0 };
        const won = winner === a;
        if (winner) won ? r.w++ : r.l++;
        rec.ai[key] = r;
        emoji = !winner ? '🤝' : won ? '🎉' : '😢';
        title = !winner ? '무승부' : won ? '이겼어요!' : '아쉽게 졌어요';
        msg = !winner ? '막상막하였어요!' : won ? (isSim() ? 'AI보다 오래 버텼어요!' : `AI(${LV().name})보다 많이 찼어요!`) : '한 판 더 하면 이길 수 있어요!';
        info = `나 <b>${a.wins}</b> : <b>${b.wins}</b> AI<br>${LV().name} · ${styleName} 전적: <b>${r.w}승 ${r.l}패</b>`;
        won ? sfx.win() : sfx.lose();
      } else {
        emoji = winner ? '🏆' : '🤝';
        title = winner ? `${winner.name} 승리!` : '무승부';
        msg = winner ? '제기왕이 탄생했어요!' : '막상막하였어요!';
        info = `1P <b>${a.wins}</b> : <b>${b.wins}</b> 2P · ${styleName}`;
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
  function planAI(l) {
    l.aiPlan = null;
    if (!players[l.p] || !players[l.p].ai) return;
    if (l.st === 'hold') { l.aiPlan = { t: 0.6 + Math.random() * 0.4, act: () => toss(l), hold: true }; return; }
    if (l.st !== 'fly') return;
    const lv = LV(), j = l.jegi, w = lv.win;
    let pf = lv.ai[0] + l.count * lv.ai[1];
    if (isSim()) pf += simTime * lv.ai[1] * 0.5;
    if (Math.random() < pf) {
      if (Math.random() < 0.5) l.aiPlan = { t: j.T - w * (1.5 + Math.random()), act: () => tryKick(l, j.side) };
    } else {
      const err = (Math.random() * 2 - 1) * w * 0.75;
      l.aiPlan = { t: j.T + err, act: () => tryKick(l, j.side) };
    }
  }

  // ===== 바람 =====
  function blowWind(targets) {
    let any = false;
    targets.forEach(l => {
      const j = l.jegi;
      const k = j.t / j.T;
      const [x] = jegiPos(j, j.t);
      j.side = j.side === 'L' ? 'R' : 'L';
      j.x1 = footX(l, j.side);
      j.x0 = (x - j.x1 * k) / (1 - k);                     // 지금 위치는 그대로, 떨어질 곳만 바뀜
      any = true;
    });
    if (!any) return;
    sfx.wind();
    popText('바람!', L.w / 2, L.h * 0.3, '#3a8fd8', true);
    const dir = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < 7; i++) winds.push({ x: dir < 0 ? L.w : 0, y: L.h * (0.25 + Math.random() * 0.4), vx: dir * 520, life: 1 });
  }

  // ===== 업데이트 =====
  function update(dtReal) {
    clock += dtReal;
    const aiTurn = !isSim() && lanes.length === 1 && players[lanes[0].p] && players[lanes[0].p].ai;
    const dt = dtReal * (ff && aiTurn ? 2.5 : 1);
    pops.forEach(p => { p.t += dtReal; }); pops = pops.filter(p => p.t < 1.4);
    sparks.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt; }); sparks = sparks.filter(p => p.life > 0);
    winds.forEach(wd => { wd.x += wd.vx * dt; wd.life -= dt; }); winds = winds.filter(wd => wd.life > 0);
    if (state !== 'play') return;
    phaseT += dt;
    if (phase === 'banner' && phaseT > 1.2) {
      setPhase('play');
      if (isSim()) { sfx.go(); lanes.forEach(l => toss(l)); }
      else lanes.forEach(l => planAI(l));
    }
    if (phase === 'play' || phase === 'simJudge' || phase === 'wait') {
      if (isSim() && phase === 'play') simTime += dt;
      // 동시 대결 바람: 두 사람에게 같은 순간 똑같이
      if (isSim() && phase === 'play' && LV().wind > 0) {
        const ready = lanes.filter(l => l.st === 'fly' && techOf(l.count) === 'mix' && l.jegi.t > l.jegi.T * 0.3 && l.jegi.t < l.jegi.T * 0.55);
        if (ready.length && Math.random() < LV().wind * dt * 0.9) blowWind(ready);
      }
      lanes.forEach(l => {
        if (l.kick) { l.kick.t += dt; if (l.kick.t > 0.22) l.kick = null; }
        if (l.st === 'fly') {
          const j = l.jegi;
          j.t += dt;
          if (!isSim() && !j.windDone && techOf(l.count) === 'mix' && j.t > j.T * 0.42) {
            j.windDone = true;
            if (Math.random() < LV().wind) blowWind([l]);
          }
          if (l.aiPlan && !l.aiPlan.hold && j.t >= l.aiPlan.t) { const a = l.aiPlan; l.aiPlan = null; a.act(); }
          else if (l.st === 'fly' && j.t > j.T + LV().win) fail(l, '놓쳤어요!');
        } else if (l.st === 'hold' && l.aiPlan && l.aiPlan.hold && phaseT >= l.aiPlan.t && phase === 'play') {
          const a = l.aiPlan; l.aiPlan = null; a.act();
        } else if (l.st === 'fall' && l.jegi && l.jegi.drop) {
          const d = l.jegi.drop;
          d.vy += 900 * dt; d.x += d.vx * dt; d.y = Math.min(L.gy - 3 * geo(l).u, d.y + d.vy * dt);
        }
      });
    }
    if (phase === 'simJudge' && phaseT >= 0.2) simJudge();
    if ((phase === 'wait' || phase === 'roundEnd') && nextFn && phaseT >= nextAt) { const f = nextFn; nextFn = null; f(); }
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
    ctx.fillStyle = 'rgba(255,220,120,.85)';
    ctx.beginPath(); ctx.arc(L.w * 0.85, L.h * 0.12, Math.min(L.w, L.h) * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    const cx0 = (clock * 8) % (L.w + 200) - 100;
    [[cx0, L.h * 0.14], [cx0 + L.w * 0.45, L.h * 0.08]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.ellipse(x, y, 40, 14, 0, 0, Math.PI * 2); ctx.ellipse(x + 26, y - 8, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
    });
    const ry = L.gy - L.h * 0.3, rw = Math.min(L.w * 0.5, 320);
    ctx.fillStyle = '#e9dcc4'; ctx.fillRect(L.w * 0.02, ry + 18, rw * 0.9, L.gy - ry - 18);
    ctx.fillStyle = '#b07a46';
    for (let i = 0; i < 4; i++) ctx.fillRect(L.w * 0.02 + 10 + i * rw * 0.22, ry + 30, rw * 0.13, L.gy - ry - 40);
    ctx.fillStyle = '#4b5563';
    ctx.beginPath();
    ctx.moveTo(L.w * 0.02 - 30, ry + 22);
    ctx.quadraticCurveTo(L.w * 0.02 + rw * 0.45, ry - 10, L.w * 0.02 + rw * 0.9 + 30, ry + 22);
    ctx.lineTo(L.w * 0.02 + rw * 0.8, ry - 22); ctx.lineTo(L.w * 0.02 + rw * 0.1, ry - 22); ctx.closePath(); ctx.fill();
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
    ctx.fillStyle = '#c9b8a0';
    ctx.fillRect(0, L.gy - L.h * 0.06, L.w, L.h * 0.06);
    ctx.fillStyle = 'rgba(120,100,80,.25)';
    for (let x = 0; x < L.w; x += 36) for (let r = 0; r < 2; r++) { ctx.beginPath(); ctx.ellipse(x + (r ? 18 : 0), L.gy - L.h * 0.045 + r * L.h * 0.025, 15, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    const gg = ctx.createLinearGradient(0, L.gy, 0, L.h);
    gg.addColorStop(0, '#d9b07a'); gg.addColorStop(1, '#c49360');
    ctx.fillStyle = gg; ctx.fillRect(0, L.gy - 2, L.w, L.h - L.gy + 2);
  }
  function drawKid(l, menuGeo) {
    const g = menuGeo || geo(l), u = g.u, x = g.cx, gy = L.gy;
    const hipY = gy - 17 * u;
    const count = l ? l.count : 0;
    const tech = techOf(count);
    const p = l ? players[l.p] : null;
    const footPos = side => {
      const sx = side === 'L' ? -1 : 1;
      let fx = x + sx * 10 * u, fy = gy - 2 * u;
      if (l && l.kick && l.kick.side === side) {
        const k = Math.sin(Math.PI * Math.min(1, l.kick.t / 0.22));
        fx += sx * 3 * u * k; fy -= 9 * u * k;
      } else if (l && tech === 'one' && side === 'R' && l.st === 'fly') { fy -= 4 * u; fx += 2 * u; }
      return [fx, fy];
    };
    ctx.lineCap = 'round';
    ['L', 'R'].forEach(side => {
      const [fx, fy] = footPos(side);
      ctx.strokeStyle = '#4a6ea8'; ctx.lineWidth = 4.5 * u;
      ctx.beginPath(); ctx.moveTo(x + (side === 'L' ? -3.5 : 3.5) * u, hipY); ctx.lineTo(fx, fy - 2 * u); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#8c6a4a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(fx + (side === 'L' ? -1 : 1) * u, fy, 3.6 * u, 2 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    ctx.fillStyle = p && p.ai ? '#9aa6c8' : SHIRTS[l ? l.p % 3 : 0];
    rr(x - 8 * u, hipY - 16 * u, 16 * u, 17 * u, 5 * u); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 3 * u, hipY - 16 * u); ctx.lineTo(x + 1 * u, hipY - 9 * u); ctx.lineTo(x + 3 * u, hipY - 16 * u); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e24a4a'; ctx.beginPath(); ctx.ellipse(x + 2 * u, hipY - 9 * u, 2 * u, 1.2 * u, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd9b8'; ctx.lineWidth = 3.2 * u;
    const sw = Math.sin(clock * 6 + (l ? l.slot : 0)) * 1.5 * u;
    ctx.beginPath(); ctx.moveTo(x - 7 * u, hipY - 13 * u); ctx.lineTo(x - 14 * u, hipY - 6 * u + sw); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 7 * u, hipY - 13 * u); ctx.lineTo(x + 14 * u, hipY - 6 * u - sw); ctx.stroke();
    const hy = hipY - 24 * u;
    ctx.fillStyle = '#ffd9b8'; ctx.beginPath(); ctx.arc(x, hy, 8 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = l && l.slot === 1 ? '#5a3a22' : '#2d2219';
    ctx.beginPath(); ctx.arc(x, hy - 1.5 * u, 8.3 * u, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.beginPath(); ctx.arc(x, hy - 8 * u, 2.4 * u, 0, Math.PI * 2); ctx.fill();
    let lookX = 0, lookY = -0.6;
    if (l && l.jegi && l.st === 'fly') { const [jx, jy] = jegiPos(l.jegi, l.jegi.t); const dx = jx - x, dy = jy - hy, d = Math.hypot(dx, dy) || 1; lookX = dx / d; lookY = dy / d; }
    ctx.fillStyle = '#2d2219';
    [-3, 3].forEach(ex => { ctx.beginPath(); ctx.arc(x + ex * u + lookX * 1.2 * u, hy + 1 * u + lookY * 1.2 * u, 1.1 * u, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,120,120,.5)';
    [-5, 5].forEach(ex => { ctx.beginPath(); ctx.ellipse(x + ex * u, hy + 3.5 * u, 1.6 * u, 1 * u, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = '#8a3a2a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, hy + 4 * u, 1.8 * u, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    if (!l || l.st === 'hold') drawJegi(x + 14 * u, hipY - 8 * u, 0, -1, p ? p.jegi : opt.jegi, u, 0.9);
    // 동시 대결: 머리 위 이름표
    if (l && lanes.length > 1 && p) {
      const fs = Math.max(13, 4.2 * u);
      ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const t = p.name, tw = ctx.measureText(t).width + 14;
      rr(x - tw / 2, hy - 15 * u - fs, tw, fs * 1.5, fs * 0.7);
      ctx.fillStyle = p.ai ? 'rgba(80,90,130,.85)' : (l.slot === 0 ? 'rgba(255,111,111,.92)' : 'rgba(63,141,224,.92)'); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(t, x, hy - 15 * u - fs * 0.25);
    }
  }
  function drawJegi(x, y, vx, vy, design, u, scale = 1) {
    const d = JEGIS[design], s = 3.4 * u * scale;
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
  function drawRing(l) {
    if (l.st !== 'fly' || !l.jegi) return;
    const j = l.jegi, w = LV().win, remain = Math.max(0, j.T - j.t);
    const r0 = 5 * geo(l).u, R = r0 * (1 + 2.2 * remain / j.T);
    const inWin = Math.abs(j.t - j.T) <= w;
    ctx.strokeStyle = inWin ? '#2fbf71' : (j.golden ? '#e0a800' : 'rgba(255,106,31,.85)');
    ctx.lineWidth = inWin ? 6 : 4;
    ctx.beginPath(); ctx.arc(j.x1, j.y1, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(70,50,30,.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(j.x1, j.y1, r0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawLaneJegi(l) {
    if (!l.jegi) return;
    const u = geo(l).u, design = players[l.p].jegi;
    if (l.st === 'fall' && l.jegi.drop) drawJegi(l.jegi.drop.x, l.jegi.drop.y, 0, 0.1, design, u);
    else if (l.st === 'fly' || l.st === 'freeze') {
      const [x, y] = jegiPos(l.jegi, l.jegi.t), [x2, y2] = jegiPos(l.jegi, l.jegi.t + 0.02);
      if (l.jegi.golden) { ctx.fillStyle = 'rgba(255,215,0,.35)'; ctx.beginPath(); ctx.arc(x, y, 7 * u, 0, Math.PI * 2); ctx.fill(); }
      drawJegi(x, y, x2 - x, y2 - y, design, u);
    }
  }
  function drawHints() {
    if (phase !== 'play') return;
    const fs = Math.max(13, Math.min(19, L.w / 26));
    ctx.font = `${fs}px Jua, sans-serif`; ctx.textBaseline = 'middle';
    if (isSim()) {
      // 화면 가운데 구분선과 조작 안내
      if (opt.mode === 'pvp') {
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(L.w / 2, L.h * 0.22); ctx.lineTo(L.w / 2, L.h); ctx.stroke(); ctx.setLineDash([]);
      }
      lanes.forEach(l => {
        if (players[l.p].ai) return;
        const g = geo(l), need = l.st === 'fly' && techOf(l.count) !== 'basic' ? l.jegi.side : null;
        const keys = opt.mode === 'pvp' ? (l.slot === 0 ? ['A', 'D'] : ['←', '→']) : ['←', '→'];
        const half = opt.mode === 'pvp' ? L.w / 2 : L.w;
        const x0 = opt.mode === 'pvp' ? (l.slot === 0 ? 0 : L.w / 2) : 0;
        [['L', `◀ ${keys[0]}`, x0 + 10, 'left'], ['R', `${keys[1]} ▶`, x0 + half - 10, 'right']].forEach(([s, t, x, al]) => {
          ctx.textAlign = al; ctx.fillStyle = need === s ? '#ff6a1f' : 'rgba(74,46,30,.5)';
          ctx.fillText(t, x, L.h - fs);
        });
      });
      return;
    }
    const l = lanes[0]; if (!l || players[l.p].ai) return;
    const need = l.st === 'fly' && techOf(l.count) !== 'basic' ? l.jegi.side : null;
    [['L', '◀ 왼발', 14, 'left'], ['R', '오른발 ▶', L.w - 14, 'right']].forEach(([s, txt, x, al]) => {
      ctx.textAlign = al; ctx.fillStyle = need === s ? '#ff6a1f' : 'rgba(74,46,30,.45)';
      ctx.fillText(txt, x, L.h - fs);
    });
  }
  function drawTop() {
    if (state !== 'play') return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    if (isSim()) {
      const fs = Math.max(32, Math.min(L.w / 2, L.h) / 6);
      lanes.forEach(l => {
        const g = geo(l);
        ctx.font = `${fs}px Jua, sans-serif`;
        ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.strokeText(String(l.count), g.cx, L.h * 0.1);
        ctx.fillStyle = l.slot === 0 ? '#ff6a6a' : '#3f8de0'; ctx.fillText(String(l.count), g.cx, L.h * 0.1);
        const gs = Math.max(12, Math.min(16, L.w / 32));
        ctx.font = `${gs}px Jua, sans-serif`; ctx.fillStyle = 'rgba(74,46,30,.8)';
        ctx.fillText(TECH[techOf(l.count)].name, g.cx, L.h * 0.1 + fs * 0.62);
      });
      if (phase === 'play' && simTime > 20) {
        const gs = Math.max(12, Math.min(15, L.w / 34));
        ctx.font = `${gs}px Jua, sans-serif`; ctx.fillStyle = '#e24a4a';
        ctx.fillText('⚡ 점점 빨라져요!', L.w / 2, L.h * 0.2);
      }
      return;
    }
    const l = lanes[0]; if (!l) return;
    const p = players[l.p];
    const fs = Math.max(40, Math.min(L.w, L.h) / 7);
    ctx.font = `${fs}px Jua, sans-serif`;
    ctx.lineWidth = 7; ctx.strokeStyle = '#fff';
    ctx.strokeText(String(l.count), L.w / 2, L.h * 0.09 + fs * 0.3);
    ctx.fillStyle = '#ff6a1f'; ctx.fillText(String(l.count), L.w / 2, L.h * 0.09 + fs * 0.3);
    const tech = TECH[techOf(l.count)];
    const gs = Math.max(14, Math.min(18, L.w / 25));
    ctx.font = `${gs}px Jua, sans-serif`;
    let t = `${tech.name} · ${tech.guide}`;
    if (l.st === 'hold') t = p.ai ? 'AI가 제기를 띄워요' : '아무 곳이나 눌러 제기를 띄워요';
    if (p.ai && l.st === 'fly') t = ff ? '▶▶ 빨리 감는 중' : 'AI 차는 중 · 화면을 누르면 빨리 감기';
    const tw = ctx.measureText(t).width + 24, y = L.h * 0.09 + fs * 0.85;
    rr(L.w / 2 - tw / 2, y, tw, gs * 1.7, gs * 0.85);
    ctx.fillStyle = p.ai ? 'rgba(80,90,130,.85)' : 'rgba(255,138,61,.92)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(t, L.w / 2, y + gs * 0.87);
  }

  function render() {
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    drawScene();
    if (state === 'menu') {
      const u = Math.min(L.w * 0.9, L.h * 0.75) / 100;
      drawKid(null, { cx: L.w / 2, u });
      drawJegi(L.w / 2 + 10 * u, L.h * 0.45 + Math.sin(clock * 3) * L.h * 0.12, 0, Math.cos(clock * 3) * -50, opt.jegi, u, 1.2);
      return;
    }
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
    winds.forEach(wd => { ctx.globalAlpha = Math.max(0, wd.life); ctx.beginPath(); ctx.moveTo(wd.x, wd.y); ctx.lineTo(wd.x - wd.vx * 0.12, wd.y); ctx.stroke(); });
    ctx.globalAlpha = 1;
    lanes.forEach(l => drawKid(l));
    lanes.forEach(l => drawRing(l));
    lanes.forEach(l => drawLaneJegi(l));
    sparks.forEach(p => { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    drawTop();
    drawHints();
    pops.forEach(pp => {
      const fs = pp.big ? Math.min(40, Math.max(24, L.w / 14)) : Math.min(22, Math.max(14, L.w / 26));
      ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.4 - pp.t) * 2));
      ctx.save(); ctx.translate(pp.x, pp.y - pp.t * 28); const sc = 1 + Math.max(0, 0.2 - pp.t); ctx.scale(sc, sc);
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
      ctx.strokeText(pp.text, 0, 0); ctx.fillStyle = pp.color; ctx.fillText(pp.text, 0, 0);
      ctx.restore(); ctx.globalAlpha = 1;
    });
    if ((phase === 'banner' || phase === 'roundEnd') && banner) {
      const fs = Math.max(24, Math.min(L.w, 480) / 11);
      const a = phase === 'banner' ? Math.max(0, Math.min(1, phaseT * 5, (1.2 - phaseT) * 5)) : 1;
      ctx.globalAlpha = a;
      const bw = Math.min(L.w * 0.9, 480);
      rr(L.w / 2 - bw / 2, L.h * 0.34, bw, fs * 2, 22);
      ctx.fillStyle = 'rgba(255,248,236,.96)'; ctx.fill(); ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#ff6a1f'; ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(banner.text, L.w / 2, L.h * 0.34 + fs);
      if (phase === 'banner' && isSim() && opt.mode === 'pvp' && L.h > L.w) {
        ctx.font = `${Math.max(13, fs * 0.5)}px Jua, sans-serif`; ctx.fillStyle = '#4a2e1e';
        ctx.fillText('📱 휴대폰은 가로로 눕히면 더 편해요', L.w / 2, L.h * 0.34 + fs * 2.6);
      }
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
      const active = state === 'play' && players.length > 1 && (isSim() || (lanes[0] && lanes[0].p === i));
      chip.classList.toggle('on', active);
    };
    if (!players.length) { $('p0').classList.add('hidden'); $('p1').classList.add('hidden'); }
    else { show(0); show(1); }
    $('btnSound').textContent = soundOn ? '🔊' : '🔇';
  }

  // ===== 입력 =====
  canvas.addEventListener('pointerdown', e => {
    ensureAudio(); e.preventDefault();
    if (state !== 'play') return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (isSim()) {
      if (opt.mode === 'pvp') {
        const pIdx = x < 0.5 ? 0 : 1;
        const local = pIdx === 0 ? x / 0.5 : (x - 0.5) / 0.5;
        press(pIdx, local < 0.5 ? 'L' : 'R');
      } else press(0, x < 0.5 ? 'L' : 'R');
      return;
    }
    const l = lanes[0];
    if (l && players[l.p].ai) { ff = !ff; return; }
    if (l) press(l.p, x < 0.5 ? 'L' : 'R');
  });
  window.addEventListener('keydown', e => {
    if (state !== 'play') return;
    const k = e.key;
    let target = null, side = null;
    const kl = k.length === 1 ? k.toLowerCase() : k;
    if (isSim() && opt.mode === 'pvp') {
      if (kl === 'a') { target = 0; side = 'L'; } else if (kl === 'd') { target = 0; side = 'R'; }
      else if (k === 'ArrowLeft') { target = 1; side = 'L'; } else if (k === 'ArrowRight') { target = 1; side = 'R'; }
    } else {
      if (k === 'ArrowLeft' || kl === 'a') side = 'L'; else if (k === 'ArrowRight' || kl === 'd') side = 'R';
      const l = lanes[0];
      if (!isSim() && l && players[l.p].ai && (k === ' ' || k === 'Enter')) { ff = !ff; e.preventDefault(); return; }
      if ((k === ' ' || k === 'Enter') && !isSim() && l && l.st === 'hold') side = 'R';
      target = isSim() ? 0 : (l ? l.p : null);
    }
    if (side === null || target === null) return;
    e.preventDefault(); ensureAudio();
    if (e.repeat) return;
    press(target, side);
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
    $('styleOpt').classList.toggle('hidden', opt.mode === 'solo');
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
    const styleTxt = opt.style === 'sim' ? '동시에 차서 먼저 떨어뜨리면 패배' : '번갈아 차서 더 많이 찬 쪽이 승리';
    if (opt.mode === 'ai') {
      const r = rec.ai[opt.level + (opt.style === 'sim' ? '_sim' : '')] || { w: 0, l: 0 };
      t = `🏆 ${LV().name} 전적: <b>${r.w}승 ${r.l}패</b><br>${styleTxt} (3판 2선승)`;
    } else if (opt.mode === 'pvp') {
      t = `${styleTxt} (3판 2선승)` + (opt.style === 'sim' ? '<br>1P는 A·D / 화면 왼쪽, 2P는 ← → / 화면 오른쪽' : '');
    } else t = `🏆 최고 기록(${LV().name}): <b>${rec.best[opt.level] || 0}개</b>`;
    $('menuRec').innerHTML = t;
  }
  document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    opt[seg.dataset.key] = b.dataset.v; saveOpt(); ensureAudio(); sfx.click(); syncMenu();
  }));
  function showMenu() {
    state = 'menu'; phase = 'idle'; players = []; lanes = [];
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
