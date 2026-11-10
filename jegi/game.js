/* 통통 제기 (Jegi Kick) - 쉬는시간 오락실 */
(() => {
  'use strict';

  // ===== 설정 =====
  const LEVELS = {
    //        첫 체공  판정창  바람 확률  AI 실수(기본, 개당 증가)
    easy:   { air: 1.25, win: 0.2,  wind: 0,    ai: [0.02, 0.0018],   name: '쉬움' },
    normal: { air: 1.05, win: 0.14, wind: 0.12, ai: [0.01, 0.0007],   name: '보통' },
    hard:   { air: 0.9,  win: 0.1,  wind: 0.22, ai: [0.006, 0.00025], name: '어려움' },
    master: { air: 0.82, win: 0.085, wind: 0.3, ai: [0.003, 0.00012], name: '고수' }
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
  const opt = Object.assign({ mode: 'solo', style: 'turn', level: 'normal', jegi: 0, stage: 'auto' }, loadJSON(KEY_OPT, {}));
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
    if (typeof initWeather === 'function') initWeather();
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
    return { p: pIdx, slot, count: 0, jegi: null, kick: null, lastSide: 'R', st: 'hold', aiPlan: null,
             combo: 0, fever: false, face: 'focus', faceT: 0, fallT: 0, trail: [], comboT: null };
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
    round = 1; unlockedNow = []; pops = []; sparks = []; rings = [];
    setStage(opt.stage === 'auto' ? STAGE_KEYS[Math.floor(Math.random() * STAGE_KEYS.length)] : opt.stage);
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
    const diff = Math.abs(t - j.T), grade = diff <= w * 0.35 ? 'perfect' : diff <= w * 0.75 ? 'good' : 'close';
    const perfect = grade === 'perfect';
    const before = techOf(l.count);
    l.count += j.golden ? 2 : 1;
    l.lastSide = kickSide;
    l.kick = { side: kickSide, t: 0 };
    l.combo = perfect ? l.combo + 1 : 0; l.comboT = 0;
    if (l.combo >= 10 && !l.fever) { l.fever = true; const g0 = geo(l); popText('🔥 신바람!', g0.cx, L.h * 0.5, '#ffd23a', true); sfx.tech(); }
    if (!perfect) l.fever = false;
    if (perfect) { l.face = 'happy'; l.faceT = 0.4; }
    sfx.kick(l.count, perfect, l.slot);
    const [x, y] = jegiPos(j, t), gu = geo(l).u;
    const label = j.golden ? '묘기! +2' : perfect ? '완벽!' : grade === 'good' ? '좋아!' : '아슬!';
    const lc = j.golden ? '#ffd23a' : perfect ? '#ff8a3d' : grade === 'good' ? '#4f9ef0' : '#c9b8a8';
    popText(label, x, y - 34, lc, j.golden || perfect, (Math.random() - 0.5) * 0.25);
    rings.push({ x, y, t: 0, u: gu, c: perfect ? '#ffd23a' : '#ffffff', big: perfect || j.golden });
    if (perfect || j.golden) burst(x, y, j.golden ? '#ffd84d' : '#fff3a0', j.golden ? 20 : 10, perfect);
    shake = Math.max(shake, perfect ? 5 : 2.5);
    if (perfect && !isSim()) hitStop = 0.045;
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
    l.jegi.sq = 1;
  }
  function fail(l, msg) {
    if (l.st !== 'fly') return;
    sfx.fail();
    const g = geo(l);
    l.combo = 0; l.fever = false; l.fallT = 0; shake = Math.max(shake, 6);
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
    setTimeout(() => { if (state === 'over') $('result').classList.add('show'); }, 500);
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
    popText('💨 바람!', L.w / 2, L.h * 0.3, '#9fd8ff', true);
    const dir = Math.random() < 0.5 ? -1 : 1;
    windFx = { dir, t: 1.4 };
    targets.forEach(l => { l.face = 'panic'; l.faceT = 0.5; });
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
  const INK = '#2a1a10';
  const STAGES = {
    alley: { name: '골목길 노을', weather: 'dust' },
    yard: { name: '학교 운동장', weather: 'seed' },
    newyear: { name: '설날 마당', weather: 'snow' },
    park: { name: '가을 공원', weather: 'leaf' }
  };
  const STAGE_KEYS = Object.keys(STAGES);
  const PAD = 70, PADY = 50;
  let curStage = 'yard', layers = null, layerKey = '', weather = [], windFx = null, shake = 0, hitStop = 0, rings = [];
  const cam = { x: 0, y: 0 };
  const S = () => Math.max(0.6, Math.min(L.w, L.h * 1.3) / 700);
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function rr(x, y, w, h, r, g = ctx) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // 칠하고 검은 외곽선
  function ink(g, fill, lw) { if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); }

  // ----- 배경 레이어 (한 번 그려 두고 재사용) -----
  function mkLayer(draw) {
    const W = L.w + PAD * 2, H = L.h + PADY * 2, c = document.createElement('canvas');
    c.width = Math.ceil(W * L.dpr); c.height = Math.ceil(H * L.dpr);
    const g = c.getContext('2d'); g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); g.translate(PAD, PADY);
    g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g, L.w, L.h, L.gy, rng(11), S());
    return c;
  }
  function skyGrad(g, w, h, stops) {
    const gr = g.createLinearGradient(0, -PADY, 0, h);
    stops.forEach(([p, c]) => gr.addColorStop(p, c));
    g.fillStyle = gr; g.fillRect(-PAD, -PADY, w + PAD * 2, h + PADY * 2);
  }
  function sunAt(g, x, y, r, c, glow) {
    const gr = g.createRadialGradient(x, y, r * 0.6, x, y, r * 3);
    gr.addColorStop(0, glow); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  function tree(g, x, gy, hgt, s, colors, R) {
    g.beginPath(); g.moveTo(x - 7 * s, gy); g.lineTo(x - 4 * s, gy - hgt * 0.55); g.lineTo(x + 4 * s, gy - hgt * 0.55); g.lineTo(x + 7 * s, gy); g.closePath(); ink(g, '#8a5a35', 2.2 * s);
    const cy = gy - hgt * 0.72, rad = hgt * 0.3;
    [[0, 0, 1], [-0.7, 0.25, 0.75], [0.7, 0.25, 0.75], [-0.35, -0.45, 0.7], [0.4, -0.4, 0.7]].forEach(([dx, dy, k], i) => {
      g.beginPath(); g.arc(x + dx * rad, cy + dy * rad, rad * k, 0, Math.PI * 2); ink(g, colors[i % colors.length], 2.2 * s);
    });
  }
  const LAYERS = {
    alley: {
      sky(g, w, h, gy, R, s) {
        skyGrad(g, w, h, [[0, '#5a58b4'], [0.45, '#ef8a7a'], [0.85, '#ffd38c']]);
        g.fillStyle = 'rgba(255,255,255,.7)';
        for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(R() * w, R() * h * 0.25, 1.2 * s, 0, Math.PI * 2); g.fill(); }
        sunAt(g, w * 0.72, gy - h * 0.3, h * 0.08, '#ffe08a', 'rgba(255,200,120,.55)');
      },
      far(g, w, h, gy, R, s) {
        let x = -PAD;
        while (x < w + PAD) {
          const ww = (70 + R() * 70) * s, top = gy - h * (0.26 + R() * 0.1);
          g.fillStyle = '#4b4270'; g.fillRect(x, top, ww, gy - top);
          g.fillStyle = '#3a3360'; g.beginPath(); g.moveTo(x - 6 * s, top + 4 * s); g.lineTo(x + ww * 0.5, top - 22 * s); g.lineTo(x + ww + 6 * s, top + 4 * s); g.closePath(); g.fill();
          for (let k = 0; k < 3; k++) if (R() < 0.6) { g.fillStyle = R() < 0.7 ? '#ffd27a' : '#6a6290'; g.fillRect(x + ww * (0.15 + k * 0.28), top + 14 * s + R() * 16 * s, 11 * s, 11 * s); }
          if (R() < 0.35) { g.strokeStyle = '#3a3360'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(x + ww * 0.7, top - 10 * s); g.lineTo(x + ww * 0.7, top - 34 * s); g.moveTo(x + ww * 0.6, top - 30 * s); g.lineTo(x + ww * 0.8, top - 30 * s); g.stroke(); }
          x += ww + 6 * s;
        }
      },
      mid(g, w, h, gy, R, s) {
        const wt = gy - h * 0.2, we = w * 0.5;
        g.beginPath(); g.rect(-PAD, wt, we + PAD, gy - wt); ink(g, '#e4cfae', 2.5 * s);
        g.strokeStyle = 'rgba(150,110,70,.35)'; g.lineWidth = 1.5 * s;
        for (let y = wt + 14 * s, r = 0; y < gy; y += 14 * s, r++) { g.beginPath(); g.moveTo(-PAD, y); g.lineTo(we, y); g.stroke(); for (let x = -PAD + (r % 2) * 14 * s; x < we; x += 28 * s) { g.beginPath(); g.moveTo(x, y - 14 * s); g.lineTo(x, y); g.stroke(); } }
        g.beginPath(); g.rect(-PAD, wt - 9 * s, we + PAD + 6 * s, 10 * s); ink(g, '#a8805a', 2.5 * s);
        const dx = w * 0.08, dw = Math.max(46 * s, w * 0.09), dt = gy - h * 0.17;
        g.beginPath(); g.rect(dx, dt, dw, gy - dt); ink(g, '#3f6fb0', 2.5 * s);
        g.beginPath(); g.rect(dx + dw * 0.1, dt + 8 * s, dw * 0.8, (gy - dt) * 0.35); ink(g, '#5a8ad0', 1.8 * s);
        g.beginPath(); g.arc(dx + dw * 0.82, dt + (gy - dt) * 0.55, 3 * s, 0, Math.PI * 2); ink(g, '#ffd84d', 1.5 * s);
        g.beginPath(); g.rect(w * 0.26, wt + 18 * s, 44 * s, 28 * s); ink(g, '#fff6dc', 1.8 * s);
        g.fillStyle = INK; g.font = `${13 * s}px Jua, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('개조심', w * 0.26 + 22 * s, wt + 32 * s);
        [[w * 0.4, '#5fbf5a'], [w * 0.45, '#ff8aa8']].forEach(([px, c]) => {
          g.beginPath(); g.moveTo(px - 11 * s, gy - 20 * s); g.lineTo(px + 11 * s, gy - 20 * s); g.lineTo(px + 8 * s, gy); g.lineTo(px - 8 * s, gy); g.closePath(); ink(g, '#c7643a', 2 * s);
          [[-6, -26], [5, -28], [0, -34]].forEach(([a, b]) => { g.beginPath(); g.arc(px + a * s, gy + b * s, 7 * s, 0, Math.PI * 2); ink(g, c, 1.8 * s); });
        });
        const px = w * 0.86, top = gy - h * 0.62;
        g.strokeStyle = INK; g.lineWidth = 1.6 * s;
        g.beginPath(); g.moveTo(-PAD, top + 30 * s); g.quadraticCurveTo(px * 0.5, top + 70 * s, px, top + 10 * s); g.quadraticCurveTo(px + (w - px) * 0.5, top + 40 * s, w + PAD, top + 18 * s); g.stroke();
        g.beginPath(); g.moveTo(-PAD, top + 44 * s); g.quadraticCurveTo(px * 0.5, top + 86 * s, px, top + 22 * s); g.stroke();
        g.beginPath(); g.rect(px - 6 * s, top, 12 * s, gy - top); ink(g, '#8a6a4a', 2.5 * s);
        g.beginPath(); g.rect(px - 26 * s, top + 8 * s, 52 * s, 7 * s); ink(g, '#6b4e35', 2 * s);
        g.beginPath(); g.moveTo(px, top + 40 * s); g.quadraticCurveTo(px - 30 * s, top + 26 * s, px - 40 * s, top + 44 * s); g.strokeStyle = INK; g.lineWidth = 4 * s; g.stroke();
        g.beginPath(); g.moveTo(px - 52 * s, top + 44 * s); g.lineTo(px - 28 * s, top + 44 * s); g.lineTo(px - 34 * s, top + 54 * s); g.lineTo(px - 46 * s, top + 54 * s); g.closePath(); ink(g, '#ffe9a0', 2 * s);
      },
      ground(g, w, h, gy, R, s) {
        g.beginPath(); g.rect(-PAD, gy - h * 0.035, w + PAD * 2, 8 * s); ink(g, '#c9bfae', 2 * s);
        const gr = g.createLinearGradient(0, gy, 0, h + PADY); gr.addColorStop(0, '#a49a89'); gr.addColorStop(1, '#7f776b');
        g.fillStyle = gr; g.fillRect(-PAD, gy - h * 0.035 + 8 * s, w + PAD * 2, h + PADY);
        g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2 * s;
        const hx = w * 0.12, hy = gy + (h - gy) * 0.35, b = 18 * s;
        [[0, 0], [1, 0], [2, -0.5], [2, 0.5], [3, 0], [4, -0.5], [4, 0.5]].forEach(([i, k]) => g.strokeRect(hx + i * b, hy + k * b * 0.6 - b * 0.3, b, b * 0.6));
        g.strokeStyle = 'rgba(40,30,20,.25)'; g.lineWidth = 1.2 * s;
        for (let i = 0; i < 6; i++) { const x = R() * w, y = gy + R() * (h - gy); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12 * s, y + 3 * s); g.lineTo(x + 18 * s, y - 2 * s); g.stroke(); }
      }
    },
    yard: {
      sky(g, w, h, gy, R, s) { skyGrad(g, w, h, [[0, '#62b9f0'], [1, '#d8f1ff']]); sunAt(g, w * 0.86, h * 0.12, h * 0.05, '#fff1a8', 'rgba(255,240,170,.6)'); },
      far(g, w, h, gy, R, s) {
        const t = gy - h * 0.42, b = gy - h * 0.1, x0 = w * 0.04, x1 = w * 0.96;
        g.beginPath(); g.rect(x0, t, x1 - x0, b - t); ink(g, '#f3e3c3', 2.5 * s);
        g.beginPath(); g.rect(x0 - 6 * s, t - 10 * s, x1 - x0 + 12 * s, 12 * s); ink(g, '#c9705a', 2.5 * s);
        const cx = (x0 + x1) / 2;
        g.beginPath(); g.rect(cx - 30 * s, t - 40 * s, 60 * s, 40 * s); ink(g, '#f3e3c3', 2.5 * s);
        g.beginPath(); g.arc(cx, t - 20 * s, 13 * s, 0, Math.PI * 2); ink(g, '#ffffff', 2 * s);
        g.strokeStyle = INK; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(cx, t - 20 * s); g.lineTo(cx, t - 29 * s); g.moveTo(cx, t - 20 * s); g.lineTo(cx + 7 * s, t - 20 * s); g.stroke();
        const cols = Math.max(4, Math.round((x1 - x0) / (46 * s)));
        for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
          const wx = x0 + (c + 0.2) * (x1 - x0) / cols, wy = t + 12 * s + r * (b - t) * 0.45;
          if (Math.abs(wx + 13 * s - cx) < 24 * s && r === 1) continue;
          g.beginPath(); g.rect(wx, wy, (x1 - x0) / cols * 0.6, (b - t) * 0.3); ink(g, '#9ed6f5', 1.6 * s);
        }
        g.beginPath(); g.rect(cx - 16 * s, b - (b - t) * 0.4, 32 * s, (b - t) * 0.4); ink(g, '#8a5a35', 2 * s);
      },
      mid(g, w, h, gy, R, s) {
        tree(g, -10 * s, gy - h * 0.06, h * 0.42, s, ['#5aa858', '#6cbf62', '#4f9a4e'], R);
        tree(g, w + 14 * s, gy - h * 0.06, h * 0.46, s, ['#5aa858', '#6cbf62', '#4f9a4e'], R);
        const ft = gy - h * 0.12;
        g.strokeStyle = '#3f7a46'; g.lineWidth = 1.2 * s;
        for (let x = -PAD; x < w + PAD; x += 10 * s) { g.beginPath(); g.moveTo(x, ft); g.lineTo(x + 10 * s, gy - h * 0.035); g.moveTo(x + 10 * s, ft); g.lineTo(x, gy - h * 0.035); g.stroke(); }
        g.strokeStyle = INK; g.lineWidth = 2.5 * s; g.beginPath(); g.moveTo(-PAD, ft); g.lineTo(w + PAD, ft); g.stroke();
        for (let x = -PAD; x < w + PAD; x += 70 * s) { g.beginPath(); g.rect(x, ft - 4 * s, 6 * s, gy - ft); ink(g, '#5d9a5a', 1.8 * s); }
        const gx = w * 0.74, gt = gy - h * 0.2;
        g.strokeStyle = INK; g.lineWidth = 7 * s; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx, gt); g.lineTo(gx + 90 * s, gt); g.lineTo(gx + 90 * s, gy); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = 4.5 * s; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1 * s;
        for (let k = 1; k < 8; k++) { g.beginPath(); g.moveTo(gx + k * 11 * s, gt); g.lineTo(gx + k * 11 * s + 6 * s, gy - 4 * s); g.stroke(); }
        const mx = w * 0.06, mt = gy - h * 0.17;
        g.strokeStyle = INK; g.lineWidth = 6 * s; g.beginPath(); g.moveTo(mx, gy); g.lineTo(mx, mt); g.lineTo(mx + 80 * s, mt); g.lineTo(mx + 80 * s, gy); g.stroke();
        g.strokeStyle = '#e2584c'; g.lineWidth = 3.5 * s; g.stroke();
        for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(mx + k * 13.3 * s, mt - 3 * s); g.lineTo(mx + k * 13.3 * s, mt + 3 * s); g.strokeStyle = INK; g.lineWidth = 3 * s; g.stroke(); }
      },
      ground(g, w, h, gy, R, s) {
        const gr = g.createLinearGradient(0, gy - h * 0.04, 0, h + PADY); gr.addColorStop(0, '#e7c78f'); gr.addColorStop(1, '#cfa66a');
        g.fillStyle = gr; g.fillRect(-PAD, gy - h * 0.04, w + PAD * 2, h + PADY);
        g.strokeStyle = INK; g.lineWidth = 2.5 * s; g.beginPath(); g.moveTo(-PAD, gy - h * 0.04); g.lineTo(w + PAD, gy - h * 0.04); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3 * s;
        g.beginPath(); g.ellipse(w * 0.5, gy + h * 0.06, w * 0.62, h * 0.05, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
        g.fillStyle = 'rgba(120,80,40,.25)';
        for (let i = 0; i < 30; i++) { g.beginPath(); g.ellipse(R() * w, gy + R() * (h - gy), 2 * s, 1.2 * s, 0, 0, Math.PI * 2); g.fill(); }
      }
    },
    newyear: {
      sky(g, w, h, gy, R, s) { skyGrad(g, w, h, [[0, '#a3c3e6'], [1, '#eef4fa']]); sunAt(g, w * 0.2, h * 0.13, h * 0.045, '#fffbe8', 'rgba(255,255,240,.6)'); },
      far(g, w, h, gy, R, s) {
        [[0.36, '#9fb4cc', 0.7], [0.27, '#b9cadb', 1]].forEach(([hh, c, k]) => {
          g.fillStyle = c; g.beginPath(); g.moveTo(-PAD, gy);
          for (let x = -PAD; x <= w + PAD; x += 60 * s) g.lineTo(x, gy - h * hh * (0.55 + 0.45 * Math.abs(Math.sin(x * 0.004 * k + k * 3))));
          g.lineTo(w + PAD, gy); g.closePath(); g.fill();
        });
        g.fillStyle = 'rgba(255,255,255,.85)';
        for (let x = -PAD; x <= w + PAD; x += 60 * s) { const y = gy - h * 0.36 * (0.55 + 0.45 * Math.abs(Math.sin(x * 0.004 * 0.7 + 2.1))); g.beginPath(); g.ellipse(x, y + 4 * s, 18 * s, 6 * s, 0, 0, Math.PI * 2); g.fill(); }
        for (let i = 0; i < 4; i++) {
          const x = w * (0.1 + i * 0.27), y = gy - h * 0.22, ww = 90 * s;
          g.fillStyle = '#5b6472'; g.beginPath(); g.moveTo(x - ww * 0.6, y + 8 * s); g.quadraticCurveTo(x, y - 6 * s, x + ww * 0.6, y + 8 * s); g.lineTo(x + ww * 0.45, y - 8 * s); g.quadraticCurveTo(x, y - 18 * s, x - ww * 0.45, y - 8 * s); g.closePath(); g.fill();
          g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x - ww * 0.45, y - 8 * s); g.quadraticCurveTo(x, y - 18 * s, x + ww * 0.45, y - 8 * s); g.quadraticCurveTo(x, y - 12 * s, x - ww * 0.45, y - 8 * s); g.fill();
          g.fillStyle = '#e8e0d2'; g.fillRect(x - ww * 0.4, y + 6 * s, ww * 0.8, 22 * s);
        }
      },
      mid(g, w, h, gy, R, s) {
        const tx = w * 0.1, ty = gy - h * 0.05;
        g.strokeStyle = INK; g.lineCap = 'round';
        [[0, 0, 0, -0.42, 9], [0, -0.25, -0.12, -0.38, 5], [0, -0.3, 0.13, -0.46, 5], [0, -0.36, -0.06, -0.52, 4]].forEach(([a, b, c, d, lw]) => {
          g.lineWidth = (lw + 2.5) * s; g.beginPath(); g.moveTo(tx + a * h, ty + b * h); g.lineTo(tx + c * h, ty + d * h); g.stroke();
          g.strokeStyle = '#6b4a32'; g.lineWidth = lw * s; g.stroke(); g.strokeStyle = INK;
          g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(tx + c * h, ty + d * h - 2 * s, 7 * s, 3 * s, 0, 0, Math.PI * 2); g.fill();
        });
        [[-0.1, -0.36], [0.09, -0.42], [-0.02, -0.47], [0.12, -0.38]].forEach(([a, b]) => { g.beginPath(); g.arc(tx + a * h, ty + b * h, 5 * s, 0, Math.PI * 2); ink(g, '#ff8a2a', 1.6 * s); });
        const wt = gy - h * 0.15;
        g.beginPath(); g.rect(w * 0.22, wt, w * 0.5, gy - wt); ink(g, '#d2c7b6', 2.5 * s);
        for (let y = wt + 4 * s, r = 0; y < gy - 6 * s; y += 13 * s, r++) for (let x = w * 0.22 + 4 * s + (r % 2) * 10 * s; x < w * 0.72 - 10 * s; x += 22 * s) { g.beginPath(); g.ellipse(x + 8 * s, y + 5 * s, 9 * s, 5 * s, 0, 0, Math.PI * 2); ink(g, ['#bfb3a3', '#c9bfb0', '#b3a795'][(r + Math.round(x)) % 3], 1.2 * s); }
        g.beginPath(); g.moveTo(w * 0.2, wt + 2 * s); g.quadraticCurveTo(w * 0.47, wt - 10 * s, w * 0.74, wt + 2 * s); g.lineTo(w * 0.72, wt - 12 * s); g.quadraticCurveTo(w * 0.47, wt - 22 * s, w * 0.22, wt - 12 * s); g.closePath(); ink(g, '#4e5a66', 2.5 * s);
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(w * 0.22, wt - 12 * s); g.quadraticCurveTo(w * 0.47, wt - 22 * s, w * 0.72, wt - 12 * s); g.quadraticCurveTo(w * 0.47, wt - 15 * s, w * 0.22, wt - 12 * s); g.fill();
        [[0.8, 26], [0.86, 34], [0.92, 22], [0.97, 30]].forEach(([fx, r]) => {
          const x = w * fx, rad = r * s;
          g.beginPath(); g.ellipse(x, gy - rad * 0.9, rad * 0.75, rad * 0.9, 0, 0, Math.PI * 2); ink(g, '#6b4a32', 2.2 * s);
          g.beginPath(); g.ellipse(x, gy - rad * 1.75, rad * 0.5, rad * 0.16, 0, 0, Math.PI * 2); ink(g, '#ffffff', 2 * s);
        });
      },
      ground(g, w, h, gy, R, s) {
        const gr = g.createLinearGradient(0, gy - h * 0.04, 0, h + PADY); gr.addColorStop(0, '#f8fbfe'); gr.addColorStop(1, '#dfe8f2');
        g.fillStyle = gr; g.fillRect(-PAD, gy - h * 0.04, w + PAD * 2, h + PADY);
        g.strokeStyle = INK; g.lineWidth = 2.5 * s; g.beginPath(); g.moveTo(-PAD, gy - h * 0.04); g.lineTo(w + PAD, gy - h * 0.04); g.stroke();
        g.fillStyle = 'rgba(140,170,210,.25)';
        for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(R() * w, gy + R() * (h - gy), 22 * s, 4 * s, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = 'rgba(120,140,170,.35)';
        for (let i = 0; i < 8; i++) { const x = w * 0.08 + i * 26 * s, y = gy + (h - gy) * 0.55 + (i % 2) * 7 * s; g.beginPath(); g.ellipse(x, y, 4 * s, 2.4 * s, 0.3, 0, Math.PI * 2); g.fill(); }
      }
    },
    park: {
      sky(g, w, h, gy, R, s) { skyGrad(g, w, h, [[0, '#86c8ef'], [1, '#fff0d0']]); sunAt(g, w * 0.78, h * 0.14, h * 0.05, '#fff3c0', 'rgba(255,230,160,.55)'); },
      far(g, w, h, gy, R, s) {
        [[0.3, '#eab56e'], [0.22, '#d9944e']].forEach(([hh, c], k) => {
          g.fillStyle = c; g.beginPath(); g.moveTo(-PAD, gy);
          for (let x = -PAD; x <= w + PAD; x += 40 * s) g.lineTo(x, gy - h * hh * (0.6 + 0.4 * Math.sin(x * 0.006 + k * 2)));
          g.lineTo(w + PAD, gy); g.closePath(); g.fill();
        });
        for (let i = 0; i < 16; i++) { const x = R() * w, y = gy - h * (0.14 + R() * 0.08); g.fillStyle = ['#e2502b', '#f2c230', '#c96a2a'][i % 3]; g.beginPath(); g.arc(x, y, 9 * s, 0, Math.PI * 2); g.fill(); }
      },
      mid(g, w, h, gy, R, s) {
        tree(g, w * 0.04, gy - h * 0.05, h * 0.5, s, ['#f28c28', '#e2502b', '#f2c230'], R);
        tree(g, w * 0.95, gy - h * 0.05, h * 0.46, s, ['#f2c230', '#f28c28', '#e2502b'], R);
        tree(g, w * 0.24, gy - h * 0.08, h * 0.32, s, ['#e2502b', '#f28c28'], R);
        const bx = w * 0.64, by = gy - h * 0.07;
        for (let k = 0; k < 3; k++) { g.beginPath(); g.rect(bx, by - 18 * s + k * 7 * s, 90 * s, 5 * s); ink(g, '#b07a46', 1.8 * s); }
        [[bx + 8 * s], [bx + 76 * s]].forEach(([x]) => { g.beginPath(); g.rect(x, by - 4 * s, 6 * s, 18 * s); ink(g, '#3a3a3a', 1.6 * s); });
        const lx = w * 0.82, lt = gy - h * 0.36;
        g.beginPath(); g.rect(lx - 3 * s, lt, 6 * s, gy - lt - h * 0.05); ink(g, '#2f3a3a', 1.8 * s);
        g.beginPath(); g.arc(lx, lt - 6 * s, 10 * s, 0, Math.PI * 2); ink(g, '#fff3c0', 2 * s);
      },
      ground(g, w, h, gy, R, s) {
        g.fillStyle = '#b9b45a'; g.fillRect(-PAD, gy - h * 0.06, w + PAD * 2, h * 0.04);
        const gr = g.createLinearGradient(0, gy - h * 0.025, 0, h + PADY); gr.addColorStop(0, '#e6cda2'); gr.addColorStop(1, '#cfae7c');
        g.fillStyle = gr; g.fillRect(-PAD, gy - h * 0.025, w + PAD * 2, h + PADY);
        g.strokeStyle = INK; g.lineWidth = 2.5 * s; g.beginPath(); g.moveTo(-PAD, gy - h * 0.06); g.lineTo(w + PAD, gy - h * 0.06); g.stroke();
        for (let i = 0; i < 26; i++) { const x = R() * w, y = gy - h * 0.02 + R() * (h - gy); g.save(); g.translate(x, y); g.rotate(R() * 6); g.fillStyle = ['#e2502b', '#f2c230', '#f28c28'][i % 3]; g.beginPath(); g.ellipse(0, 0, 5 * s, 2.5 * s, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      }
    }
  };
  function ensureLayers() {
    const key = curStage + ':' + L.w + 'x' + L.h + '@' + L.dpr;
    if (layers && layerKey === key) return;
    const D = LAYERS[curStage];
    layers = { sky: mkLayer(D.sky), far: mkLayer(D.far), mid: mkLayer(D.mid), ground: mkLayer(D.ground) };
    layerKey = key;
  }
  function blit(c, ox, oy) { ctx.drawImage(c, -PAD + ox, -PADY + oy, L.w + PAD * 2, L.h + PADY * 2); }
  function setStage(k) { curStage = k; layers = null; initWeather(); }

  // ----- 날씨 -----
  function initWeather() {
    const type = STAGES[curStage].weather, n = Math.max(18, Math.min(70, Math.round(L.w * L.h / 9000)));
    weather = [];
    for (let i = 0; i < n; i++) weather.push(newFlake(type, true));
  }
  function newFlake(type, anywhere) {
    const d = 0.55 + Math.random() * 0.8;
    const f = { type, d, x: Math.random() * L.w, y: anywhere ? Math.random() * L.gy : -10, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 3, ph: Math.random() * 6 };
    if (type === 'snow') { f.vx = (Math.random() - 0.5) * 16; f.vy = 25 + Math.random() * 35; f.r = 1.4 + Math.random() * 2.2; }
    else if (type === 'leaf') { f.vx = 8 + Math.random() * 20; f.vy = 28 + Math.random() * 30; f.r = 4 + Math.random() * 3; f.c = ['#e2502b', '#f2c230', '#f28c28'][Math.floor(Math.random() * 3)]; }
    else if (type === 'seed') { f.vx = 14 + Math.random() * 18; f.vy = 6 + Math.random() * 12; f.r = 3 + Math.random() * 2; }
    else { f.vx = (Math.random() - 0.5) * 8; f.vy = (Math.random() - 0.5) * 8; f.r = 1.2 + Math.random() * 1.6; if (!anywhere) f.y = Math.random() * L.gy; }
    return f;
  }
  function updateWeather(dt) {
    const push = windFx ? windFx.dir * 520 * Math.min(1, windFx.t) : 0;
    if (windFx) { windFx.t -= dt; if (windFx.t <= 0) windFx = null; }
    weather.forEach((f, i) => {
      f.ph += dt;
      f.x += (f.vx + Math.sin(f.ph * 1.3) * 10 + push * (0.6 + f.d * 0.4)) * f.d * dt;
      f.y += f.vy * f.d * dt * (f.type === 'dust' ? Math.sin(f.ph * 0.7) : 1);
      f.rot += f.vr * dt * (1 + Math.abs(push) / 200);
      if (f.x > L.w + 30) f.x = -20; if (f.x < -30) f.x = L.w + 20;
      if (f.type === 'dust') { if (f.y < L.h * 0.1) f.y = L.gy * 0.9; if (f.y > L.gy) f.y = L.h * 0.15; }
      else if (f.y > L.gy + 6) weather[i] = newFlake(f.type, false);
    });
  }
  function drawWeather(front) {
    weather.forEach(f => {
      if ((f.d > 1.05) !== front) return;
      const s = f.d;
      if (f.type === 'snow') { ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * s, 0, Math.PI * 2); ctx.fill(); }
      else if (f.type === 'leaf') {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(1, 0.55 + 0.45 * Math.sin(f.ph * 3));
        ctx.fillStyle = f.c; ctx.strokeStyle = INK; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, 0, f.r * s * 1.4, f.r * s * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      } else if (f.type === 'seed') {
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + f.rot; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(a) * f.r * s, f.y + Math.sin(a) * f.r * s); ctx.stroke(); }
      } else {
        ctx.fillStyle = `rgba(255,230,150,${0.35 + 0.35 * Math.sin(f.ph * 2)})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * s, 0, Math.PI * 2); ctx.fill();
      }
    });
  }
  // 움직이는 배경 소품 (구름·연·만국기·가로등 불빛)
  function drawLive() {
    const s = S(), w = L.w, h = L.h, gy = L.gy;
    if (curStage === 'yard' || curStage === 'park') {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      const cx0 = (clock * 9) % (w + 260) - 130;
      [[cx0, h * 0.14], [cx0 + w * 0.5, h * 0.08], [cx0 - w * 0.45, h * 0.2]].forEach(([x, y]) => {
        ctx.beginPath(); ctx.ellipse(x, y, 42 * s, 15 * s, 0, 0, Math.PI * 2); ctx.ellipse(x + 26 * s, y - 9 * s, 26 * s, 15 * s, 0, 0, Math.PI * 2); ctx.ellipse(x - 24 * s, y - 4 * s, 20 * s, 12 * s, 0, 0, Math.PI * 2); ctx.fill();
      });
    }
    if (curStage === 'yard') {
      const y0 = h * 0.24, n = Math.round(w / (34 * s));
      ctx.strokeStyle = INK; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(-10, y0 - 10 * s);
      ctx.quadraticCurveTo(w / 2, y0 + 26 * s, w + 10, y0 - 10 * s); ctx.stroke();
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = -10 + t * (w + 20), y = (1 - t) * (1 - t) * (y0 - 10 * s) + 2 * (1 - t) * t * (y0 + 26 * s) + t * t * (y0 - 10 * s);
        const sw = Math.sin(clock * 3 + i) * 3 * s * (windFx ? 2.5 : 1);
        ctx.beginPath(); ctx.moveTo(x - 7 * s, y); ctx.lineTo(x + 7 * s, y); ctx.lineTo(x + sw, y + 14 * s); ctx.closePath();
        ctx.fillStyle = ['#ff5a5a', '#ffd84d', '#4fa3ff', '#5fd36b', '#b07ae0'][i % 5]; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    if (curStage === 'newyear') {
      const k1x = w * 0.72 + Math.sin(clock * 0.8) * 20 * s, k1y = h * 0.16 + Math.cos(clock * 1.1) * 10 * s;
      ctx.strokeStyle = 'rgba(42,26,16,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(k1x, k1y + 22 * s); ctx.quadraticCurveTo(k1x + 40 * s, h * 0.5, w + 20, gy); ctx.stroke();
      ctx.save(); ctx.translate(k1x, k1y); ctx.rotate(Math.sin(clock * 1.3) * 0.12);
      rr(-18 * s, -22 * s, 36 * s, 44 * s, 2); ink(ctx, '#ffffff', 2 * s);
      ctx.beginPath(); ctx.arc(0, 0, 7 * s, 0, Math.PI * 2); ink(ctx, '#bfe0ff', 1.5 * s);
      ctx.fillStyle = '#e2312b'; ctx.fillRect(-18 * s, -22 * s, 36 * s, 6 * s); ctx.fillStyle = '#3f6fd0'; ctx.fillRect(-18 * s, 16 * s, 36 * s, 6 * s);
      ctx.restore();
      const k2x = w * 0.32 + Math.cos(clock * 0.7) * 26 * s, k2y = h * 0.1 + Math.sin(clock * 0.9) * 12 * s;
      ctx.strokeStyle = 'rgba(42,26,16,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(k2x, k2y + 16 * s); ctx.quadraticCurveTo(k2x - 30 * s, h * 0.5, -20, gy); ctx.stroke();
      ctx.save(); ctx.translate(k2x, k2y); ctx.rotate(Math.sin(clock * 1.7) * 0.2);
      ctx.beginPath(); ctx.moveTo(0, -16 * s); ctx.lineTo(14 * s, 0); ctx.lineTo(0, 16 * s); ctx.lineTo(-14 * s, 0); ctx.closePath(); ink(ctx, '#ffd84d', 2 * s);
      ctx.strokeStyle = '#e2312b'; ctx.lineWidth = 2.5 * s; ctx.beginPath(); ctx.moveTo(0, 16 * s);
      for (let i = 1; i <= 6; i++) ctx.lineTo(Math.sin(clock * 5 + i) * 6 * s, 16 * s + i * 8 * s);
      ctx.stroke(); ctx.restore();
    }
    if (curStage === 'alley') {
      const lx = w * 0.86 - 40 * s, ly = gy - h * 0.62 + 50 * s, a = 0.32 + Math.sin(clock * 2.3) * 0.05;
      const gr = ctx.createRadialGradient(lx, ly, 2, lx, ly, h * 0.3);
      gr.addColorStop(0, `rgba(255,236,160,${a})`); gr.addColorStop(1, 'rgba(255,236,160,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(lx, ly, h * 0.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ----- 아이 -----
  const kneeOf = (hx, hy, fx, fy, len, side) => {
    const dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy) || 1, k = Math.sqrt(Math.max(0, len * len - d * d / 4));
    return [(hx + fx) / 2 - dy / d * k * side, (hy + fy) / 2 + dx / d * k * side];
  };
  function limb(x1, y1, x2, y2, x3, y3, w, color) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); };
    ctx.strokeStyle = INK; ctx.lineWidth = w + 2.6; path(); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; path(); ctx.stroke();
  }
  function shirtOf(l) {
    const p = l ? players[l.p] : null;
    if (p && p.ai) return '#9aa6c8';
    return SHIRTS[l ? l.p % 3 : 0];
  }
  function faceOf(l) {
    if (!l) return 'happy';
    if (l.st === 'fall') return 'fail';
    if (l.faceT > 0) return l.face;
    if (l.st === 'fly' && l.jegi && l.jegi.t > l.jegi.T + LV().win * 0.3) return 'panic';
    return 'focus';
  }
  function drawKid(l, menuGeo) {
    const g = menuGeo || geo(l), u = g.u, x = g.cx, gy = L.gy;
    const count = l ? l.count : 0, tech = techOf(count), p = l ? players[l.p] : null;
    const face = faceOf(l), fallK = l && l.st === 'fall' ? Math.min(1, (l.fallT || 0) / 0.25) : 0;
    const breathe = Math.sin(clock * 3 + (l ? l.slot : 0)) * 0.5 * u * (1 - fallK);
    const hipY = gy - 17 * u + fallK * 7.5 * u + breathe;
    const kickK = l && l.kick ? Math.sin(Math.PI * Math.min(1, l.kick.t / 0.22)) : 0, kickSide = l && l.kick ? l.kick.side : null;
    // 그림자
    ctx.fillStyle = 'rgba(40,25,10,.18)'; ctx.beginPath(); ctx.ellipse(x, gy + 0.5 * u, 14 * u, 2.6 * u, 0, 0, Math.PI * 2); ctx.fill();
    if (l && l.fever) {
      const a = 0.25 + Math.sin(clock * 8) * 0.1, gr = ctx.createRadialGradient(x, hipY - 10 * u, 2, x, hipY - 10 * u, 34 * u);
      gr.addColorStop(0, `rgba(255,215,80,${a})`); gr.addColorStop(1, 'rgba(255,215,80,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, hipY - 10 * u, 34 * u, 0, Math.PI * 2); ctx.fill();
    }
    const footPos = side => {
      const sx = side === 'L' ? -1 : 1;
      let fx = x + sx * 10 * u, fy = gy - 2 * u;
      if (kickSide === side) { fx += sx * 2 * u * kickK - sx * 3 * u * kickK; fy -= 11 * u * kickK; }
      else if (l && tech === 'one' && side === 'R' && l.st === 'fly') { fy -= 4 * u; fx += 2 * u; }
      if (fallK) { fx += sx * 6 * u * fallK; fy += 0.5 * u * fallK; }
      return [fx, fy];
    };
    ['L', 'R'].forEach(side => {
      const sx = side === 'L' ? -1 : 1, [fx, fy] = footPos(side), hx = x + sx * 3.8 * u;
      const [kx, ky] = kneeOf(hx, hipY, fx, fy - 2 * u, 8.4 * u, sx < 0 ? 1 : -1);
      limb(hx, hipY, kx, ky, fx, fy - 2 * u, 4.6 * u, '#4a6ea8');
      ctx.beginPath(); ctx.ellipse(fx + sx * 1.2 * u, fy, 3.8 * u, 2.1 * u, kickSide === side ? -sx * 0.4 * kickK : 0, 0, Math.PI * 2); ink(ctx, '#ffffff', 1.6);
      ctx.fillStyle = '#e2584c'; ctx.fillRect(fx + sx * 1.2 * u - 3 * u, fy + 0.6 * u, 6 * u, 1.2 * u);
    });
    // 윗몸 (차는 쪽 반대로 살짝 기울기)
    const lean = kickSide ? (kickSide === 'R' ? -1 : 1) * 0.1 * kickK : fallK * 0.05;
    ctx.save(); ctx.translate(x, hipY); ctx.rotate(lean); ctx.translate(-x, -hipY);
    const sh = hipY - 13 * u;
    const handPos = sx => {
      if (face === 'fail') return [x + sx * 15 * u, hipY + 1 * u];
      if (face === 'happy' && l && l.faceT > 0) return [x + sx * 11 * u, hipY - 31 * u];
      if (kickSide) { const up = (sx === 1) === (kickSide === 'L'); return up ? [x + sx * 17 * u, hipY - 17 * u * (0.6 + 0.4 * kickK)] : [x + sx * 12 * u, hipY - 3 * u]; }
      return [x + sx * 14 * u, hipY - 5 * u + Math.sin(clock * 6 + sx + (l ? l.slot : 0)) * 1.4 * u];
    };
    [-1, 1].forEach(sx => {
      const [hx2, hy2] = handPos(sx), shx = x + sx * 7 * u;
      const [ex, ey] = kneeOf(shx, sh, hx2, hy2, 6.4 * u, sx < 0 ? -1 : 1);
      limb(shx, sh, ex, ey, hx2, hy2, 3.4 * u, '#ffd9b8');
    });
    rr(x - 8 * u, hipY - 16.5 * u, 16 * u, 17.5 * u, 5 * u); ink(ctx, shirtOf(l), 2);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.moveTo(x - 3.4 * u, hipY - 16.4 * u); ctx.lineTo(x, hipY - 10 * u); ctx.lineTo(x + 3.4 * u, hipY - 16.4 * u); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 2 * u, hipY - 9 * u, 2 * u, 1.2 * u, 0.4, 0, Math.PI * 2); ink(ctx, '#e24a4a', 1.2);
    // 머리
    const hy = hipY - 24.5 * u;
    ctx.beginPath(); ctx.arc(x, hy, 8.2 * u, 0, Math.PI * 2); ink(ctx, '#ffd9b8', 2);
    ctx.fillStyle = l && l.slot === 1 ? '#5a3a22' : '#2d2219';
    ctx.beginPath(); ctx.arc(x, hy - 1.6 * u, 8.5 * u, Math.PI * 1.03, Math.PI * 1.97); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 1 * u, hy - 8.4 * u, 2.4 * u, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 2 * u, hy - 9.5 * u); ctx.quadraticCurveTo(x + 2 * u, hy - 14 * u, x + 4 * u, hy - 10 * u); ctx.lineWidth = 1.4 * u; ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,120,.55)';
    [-5.2, 5.2].forEach(ex => { ctx.beginPath(); ctx.ellipse(x + ex * u, hy + 3.6 * u, 1.7 * u, 1 * u, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.4, 0.55 * u);
    if (face === 'happy') {
      [-3, 3].forEach(ex => { ctx.beginPath(); ctx.arc(x + ex * u, hy + 1.6 * u, 1.4 * u, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); });
      ctx.beginPath(); ctx.arc(x, hy + 3.6 * u, 2.4 * u, 0, Math.PI); ctx.closePath(); ink(ctx, '#c84a3a', 1.2);
    } else if (face === 'panic') {
      [-3, 3].forEach(ex => { ctx.beginPath(); ctx.arc(x + ex * u, hy + 0.8 * u, 1.9 * u, 0, Math.PI * 2); ink(ctx, '#ffffff', 1.2); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + ex * u, hy + 0.9 * u, 0.7 * u, 0, Math.PI * 2); ctx.fill(); });
      ctx.beginPath(); ctx.ellipse(x, hy + 4.6 * u, 1.2 * u, 1.6 * u, 0, 0, Math.PI * 2); ink(ctx, '#c84a3a', 1.2);
      ctx.beginPath(); ctx.moveTo(x + 8.5 * u, hy - 4 * u); ctx.quadraticCurveTo(x + 10.5 * u, hy - 0.5 * u, x + 8.8 * u, hy + 0.5 * u); ctx.quadraticCurveTo(x + 7 * u, hy - 0.5 * u, x + 8.5 * u, hy - 4 * u); ink(ctx, '#9fd8ff', 1);
    } else if (face === 'fail') {
      [-3, 3].forEach(ex => { ctx.beginPath(); for (let a = 0; a < 9; a++) { const r = a * 0.24 * u, an = a * 1.3 + clock * 8; ctx.lineTo(x + ex * u + Math.cos(an) * r, hy + 1 * u + Math.sin(an) * r); } ctx.stroke(); });
      ctx.beginPath(); ctx.moveTo(x - 2.5 * u, hy + 4.6 * u); for (let i = 1; i <= 4; i++) ctx.lineTo(x - 2.5 * u + i * 1.25 * u, hy + 4.6 * u + (i % 2 ? -0.8 : 0.8) * u); ctx.stroke();
      for (let i = 0; i < 3; i++) { const a = clock * 4 + i * 2.1; ctx.fillStyle = '#ffd84d'; ctx.font = `${4 * u}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', x + Math.cos(a) * 9 * u, hy - 10 * u + Math.sin(a) * 2.5 * u); }
    } else {
      let lookX = 0, lookY = -0.6;
      if (l && l.jegi && l.st === 'fly') { const [jx, jy] = jegiPos(l.jegi, l.jegi.t), dx = jx - x, dy = jy - hy, d = Math.hypot(dx, dy) || 1; lookX = dx / d; lookY = dy / d; }
      [-3, 3].forEach(ex => { ctx.beginPath(); ctx.arc(x + ex * u + lookX * 1.2 * u, hy + 1 * u + lookY * 1.2 * u, 1.15 * u, 0, Math.PI * 2); ctx.fill(); });
      ctx.beginPath(); ctx.moveTo(x - 4.4 * u, hy - 2.6 * u); ctx.lineTo(x - 1.8 * u, hy - 2 * u); ctx.moveTo(x + 4.4 * u, hy - 2.6 * u); ctx.lineTo(x + 1.8 * u, hy - 2 * u); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, hy + 4 * u, 1.8 * u, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
    ctx.restore();
    if (!l || l.st === 'hold') drawJegi(x + 15 * u, hipY - 6 * u, 0, -1, p ? p.jegi : opt.jegi, u, 0.9);
    if (l && lanes.length > 1 && p) {
      const fs = Math.max(13, 4.2 * u);
      ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const t = p.name, tw = ctx.measureText(t).width + 16;
      rr(x - tw / 2, hy - 16 * u - fs, tw, fs * 1.5, fs * 0.7);
      ink(ctx, p.ai ? '#5a6488' : (l.slot === 0 ? '#ff6f6f' : '#3f8de0'), 2);
      ctx.fillStyle = '#fff'; ctx.fillText(t, x, hy - 16 * u - fs * 0.25);
    }
  }

  // ----- 제기 -----
  function drawJegi(x, y, vx, vy, design, u, scale = 1, sq = 0) {
    const d = JEGIS[design], s = 3.4 * u * scale;
    let dx = -vx, dy = -vy; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    if (Math.hypot(vx, vy) < 1) { dx = 0; dy = -1; }
    const n = d.c.length * 2, base = Math.atan2(dy, dx), wob = 0.08 + sq * 0.35;
    const strips = [];
    for (let i = 0; i < n; i++) {
      const spread = (i / (n - 1) - 0.5) * (0.9 + sq * 0.6);
      const ang = base + spread + Math.sin(clock * 12 + i) * wob;
      const L2 = s * (3.2 + (i % 3) * 0.4) * (1 - sq * 0.25);
      const mx = x + Math.cos(ang) * L2 * 0.5 + Math.sin(clock * 9 + i) * s * (0.3 + sq), my = y + Math.sin(ang) * L2 * 0.5;
      strips.push([d.c[i % d.c.length], mx, my, x + Math.cos(ang) * L2, y + Math.sin(ang) * L2]);
    }
    ctx.lineCap = 'round';
    const lw = Math.max(1.6, s * 0.34);
    strips.forEach(([, mx, my, ex, ey]) => { ctx.strokeStyle = INK; ctx.lineWidth = lw + 2.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke(); });
    strips.forEach(([c, mx, my, ex, ey]) => { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke(); });
    ctx.save(); ctx.translate(x, y); ctx.scale(1 + sq * 0.4, 1 - sq * 0.35);
    ctx.beginPath(); ctx.ellipse(0, 0, s * 1.15, s * 0.72, 0, 0, Math.PI * 2); ink(ctx, d.coin, 1.8);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-s * 0.4, -s * 0.25, s * 0.35, s * 0.15, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK; ctx.fillRect(-s * 0.25, -s * 0.18, s * 0.5, s * 0.36);
    ctx.restore();
  }
  function drawShadowAt(x, y, u) {
    const k = 1 - Math.min(1, Math.max(0, (L.gy - y) / (L.h * 0.6)));
    ctx.fillStyle = `rgba(40,25,10,${0.06 + 0.14 * k})`;
    ctx.beginPath(); ctx.ellipse(x, L.gy + 0.5 * u, 4.5 * u * (0.5 + 0.5 * k), 1.3 * u * (0.5 + 0.5 * k), 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawRing(l) {
    if (l.st !== 'fly' || !l.jegi) return;
    const j = l.jegi, w = LV().win, remain = Math.max(0, j.T - j.t);
    const r0 = 5 * geo(l).u, R = r0 * (1 + 2.2 * remain / j.T);
    const inWin = Math.abs(j.t - j.T) <= w, perfectZone = Math.abs(j.t - j.T) <= w * 0.35;
    ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(42,26,16,.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(j.x1, j.y1, r0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const col = perfectZone ? '#ffd23a' : inWin ? '#2fbf71' : (j.golden ? '#e0a800' : '#ff8a3d');
    ctx.strokeStyle = INK; ctx.lineWidth = (inWin ? 6 : 4) + 2.4; ctx.beginPath(); ctx.arc(j.x1, j.y1, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = inWin ? 6 : 4; ctx.stroke();
  }
  function drawLaneJegi(l) {
    if (!l.jegi) return;
    const u = geo(l).u, design = players[l.p].jegi;
    if (l.st === 'fall' && l.jegi.drop) { drawShadowAt(l.jegi.drop.x, l.jegi.drop.y, u); drawJegi(l.jegi.drop.x, l.jegi.drop.y, 0, 0.1, design, u); }
    else if (l.st === 'fly' || l.st === 'freeze') {
      const [x, y] = jegiPos(l.jegi, l.jegi.t), [x2, y2] = jegiPos(l.jegi, l.jegi.t + 0.02);
      drawShadowAt(x, y, u);
      const d = JEGIS[design], tr = l.trail || [];
      tr.forEach((p, i) => {
        const a = (i + 1) / (tr.length + 1);
        ctx.globalAlpha = a * (l.fever ? 0.8 : 0.45); ctx.fillStyle = l.fever ? '#ffd23a' : d.c[i % d.c.length];
        ctx.beginPath(); ctx.arc(p[0], p[1], u * (0.6 + a * 1.1), 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (l.jegi.golden || l.fever) { ctx.fillStyle = 'rgba(255,215,0,.32)'; ctx.beginPath(); ctx.arc(x, y, 8 * u, 0, Math.PI * 2); ctx.fill(); }
      drawJegi(x, y, x2 - x, y2 - y, design, u, 1, l.jegi.sq || 0);
    }
  }
  function drawHints() {
    if (phase !== 'play') return;
    const fs = Math.max(13, Math.min(19, L.w / 26));
    ctx.font = `${fs}px Jua, sans-serif`; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const txt = (t, x, y, al, hot) => { ctx.textAlign = al; ctx.lineWidth = 4; ctx.strokeStyle = hot ? INK : 'rgba(255,255,255,.7)'; ctx.strokeText(t, x, y); ctx.fillStyle = hot ? '#ffb13a' : 'rgba(74,46,30,.6)'; ctx.fillText(t, x, y); };
    if (isSim()) {
      if (opt.mode === 'pvp') {
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(L.w / 2, L.h * 0.22); ctx.lineTo(L.w / 2, L.h); ctx.stroke(); ctx.setLineDash([]);
      }
      lanes.forEach(l => {
        if (players[l.p].ai) return;
        const need = l.st === 'fly' && techOf(l.count) !== 'basic' ? l.jegi.side : null;
        const keys = opt.mode === 'pvp' ? (l.slot === 0 ? ['A', 'D'] : ['←', '→']) : ['←', '→'];
        const half = opt.mode === 'pvp' ? L.w / 2 : L.w, x0 = opt.mode === 'pvp' ? (l.slot === 0 ? 0 : L.w / 2) : 0;
        txt(`◀ ${keys[0]}`, x0 + 10, L.h - fs, 'left', need === 'L');
        txt(`${keys[1]} ▶`, x0 + half - 10, L.h - fs, 'right', need === 'R');
      });
      return;
    }
    const l = lanes[0]; if (!l || players[l.p].ai) return;
    const need = l.st === 'fly' && techOf(l.count) !== 'basic' ? l.jegi.side : null;
    txt('◀ 왼발', 14, L.h - fs, 'left', need === 'L');
    txt('오른발 ▶', L.w - 14, L.h - fs, 'right', need === 'R');
  }
  function bigNum(t, x, y, fs, color) {
    ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, fs * 0.16); ctx.strokeStyle = INK; ctx.strokeText(t, x, y + fs * 0.06);
    ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
  }
  function comboTag(l, x, y, fs) {
    if (!l || l.combo < 3) return;
    const t = l.fever ? `🔥 신바람 ${l.combo}콤보` : `${l.combo}콤보`;
    ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sc = 1 + Math.max(0, 0.25 - (l.comboT || 1)) * 1.2;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(t, 0, 0); ctx.fillStyle = l.fever ? '#ffd23a' : '#ffffff'; ctx.fillText(t, 0, 0);
    ctx.restore();
  }
  function drawTop() {
    if (state !== 'play') return;
    if (isSim()) {
      const fs = Math.max(32, Math.min(L.w / 2, L.h) / 6);
      lanes.forEach(l => {
        const g = geo(l);
        bigNum(String(l.count), g.cx, L.h * 0.1, fs, l.slot === 0 ? '#ff6f6f' : '#4f9ef0');
        const gs = Math.max(12, Math.min(16, L.w / 32));
        ctx.font = `${gs}px Jua, sans-serif`; ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(TECH[techOf(l.count)].name, g.cx, L.h * 0.1 + fs * 0.62);
        ctx.fillStyle = INK; ctx.fillText(TECH[techOf(l.count)].name, g.cx, L.h * 0.1 + fs * 0.62);
        comboTag(l, g.cx, L.h * 0.1 + fs * 0.62 + gs * 1.4, gs * 1.1);
      });
      if (phase === 'play' && simTime > 20) {
        const gs = Math.max(12, Math.min(15, L.w / 34));
        ctx.font = `${gs}px Jua, sans-serif`; ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText('⚡ 점점 빨라져요!', L.w / 2, L.h * 0.22);
        ctx.fillStyle = '#e24a4a'; ctx.fillText('⚡ 점점 빨라져요!', L.w / 2, L.h * 0.22);
      }
      return;
    }
    const l = lanes[0]; if (!l) return;
    const p = players[l.p];
    const fs = Math.max(40, Math.min(L.w, L.h) / 7);
    bigNum(String(l.count), L.w / 2, L.h * 0.09 + fs * 0.3, fs, l.fever ? '#ffd23a' : '#ff8a3d');
    const tech = TECH[techOf(l.count)];
    const gs = Math.max(14, Math.min(18, L.w / 25));
    ctx.font = `${gs}px Jua, sans-serif`;
    let t = `${tech.name} · ${tech.guide}`;
    if (l.st === 'hold') t = p.ai ? 'AI가 제기를 띄워요' : '아무 곳이나 눌러 제기를 띄워요';
    if (p.ai && l.st === 'fly') t = ff ? '▶▶ 빨리 감는 중' : 'AI 차는 중 · 화면을 누르면 빨리 감기';
    const tw = ctx.measureText(t).width + 26, y = L.h * 0.09 + fs * 0.88;
    rr(L.w / 2 - tw / 2, y + 3, tw, gs * 1.7, gs * 0.85); ctx.fillStyle = INK; ctx.fill();
    rr(L.w / 2 - tw / 2, y, tw, gs * 1.7, gs * 0.85); ink(ctx, p.ai ? '#6a76a0' : '#ff9a4d', 2.2);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, L.w / 2, y + gs * 0.87);
    comboTag(l, L.w / 2, y + gs * 2.7, gs * 1.15);
  }

  function render() {
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    ensureLayers();
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    blit(layers.sky, 0, cam.y * 0.1);
    blit(layers.far, -cam.x * 0.2, cam.y * 0.25);
    drawLive();
    blit(layers.mid, -cam.x * 0.5 + sx * 0.4, cam.y * 0.55 + sy * 0.4);
    ctx.save(); ctx.translate(-cam.x + sx, cam.y + sy);
    blit(layers.ground, 0, 0);
    if (lanes.some(l => l.fever)) {
      const a = 0.12 + Math.sin(clock * 6) * 0.05;
      ctx.fillStyle = `rgba(255,210,80,${a})`; ctx.fillRect(-PAD, -PADY, L.w + PAD * 2, L.h + PADY * 2);
    }
    drawWeather(false);
    if (state === 'menu') {
      const u = Math.min(L.w * 0.9, L.h * 0.75) / 100;
      drawKid(null, { cx: L.w / 2, u });
      const jy = L.h * 0.45 + Math.sin(clock * 3) * L.h * 0.12;
      drawShadowAt(L.w / 2 + 10 * u, jy, u);
      drawJegi(L.w / 2 + 10 * u, jy, 0, Math.cos(clock * 3) * -50, opt.jegi, u, 1.2);
      drawWeather(true);
      ctx.restore();
      return;
    }
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;
    winds.forEach(wd => { ctx.globalAlpha = Math.max(0, wd.life); ctx.beginPath(); ctx.moveTo(wd.x, wd.y); ctx.bezierCurveTo(wd.x - wd.vx * 0.05, wd.y - 8, wd.x - wd.vx * 0.09, wd.y + 8, wd.x - wd.vx * 0.13, wd.y); ctx.stroke(); });
    ctx.globalAlpha = 1;
    lanes.forEach(l => drawKid(l));
    lanes.forEach(l => drawRing(l));
    rings.forEach(r => {
      const k = r.t / 0.35; ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = r.c; ctx.lineWidth = 4 * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, r.u * (3 + k * (r.big ? 16 : 10)), 0, Math.PI * 2); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    lanes.forEach(l => drawLaneJegi(l));
    sparks.forEach(p => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.color;
      if (p.star) { ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', p.x, p.y); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    drawWeather(true);
    pops.forEach(pp => {
      const fs = pp.big ? Math.min(42, Math.max(24, L.w / 14)) : Math.min(24, Math.max(15, L.w / 24));
      ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.4 - pp.t) * 2));
      ctx.save(); ctx.translate(pp.x, pp.y - pp.t * 30);
      const sc = pp.t < 0.12 ? 0.6 + pp.t / 0.12 * 0.7 : 1.3 - Math.min(0.3, (pp.t - 0.12) * 1.5); ctx.scale(sc, sc);
      ctx.rotate(pp.rot || 0);
      ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(pp.text, 0, 0); ctx.fillStyle = pp.color; ctx.fillText(pp.text, 0, 0);
      ctx.restore(); ctx.globalAlpha = 1;
    });
    ctx.restore();
    drawTop();
    drawHints();
    if ((phase === 'banner' || phase === 'roundEnd') && banner) {
      const fs = Math.max(24, Math.min(L.w, 480) / 11);
      const a = phase === 'banner' ? Math.max(0, Math.min(1, phaseT * 5, (1.2 - phaseT) * 5)) : 1;
      ctx.globalAlpha = a;
      const bw = Math.min(L.w * 0.9, 480), by = L.h * 0.34;
      rr(L.w / 2 - bw / 2 + 4, by + 6, bw, fs * 2, 20); ctx.fillStyle = INK; ctx.fill();
      rr(L.w / 2 - bw / 2, by, bw, fs * 2, 20); ink(ctx, '#fffdf6', 3);
      ctx.fillStyle = INK;
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(L.w / 2 - bw / 2 + 26 + i * (bw - 52) / 8, by + 9, 3, 0, Math.PI * 2); ctx.fill(); }
      bigNum(banner.text, L.w / 2, by + fs * 1.05, fs * 0.92, '#ff8a3d');
      if (phase === 'banner' && isSim() && opt.mode === 'pvp' && L.h > L.w) {
        ctx.font = `${Math.max(13, fs * 0.5)}px Jua, sans-serif`; ctx.fillStyle = INK;
        ctx.fillText('📱 휴대폰은 가로로 눕히면 더 편해요', L.w / 2, by + fs * 2.6);
      }
      ctx.globalAlpha = 1;
    }
  }
  function popText(text, x, y, color, big, rot) { pops.push({ text, x, y, color, big, t: 0, rot: rot || 0 }); }
  function burst(x, y, color, n, star) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 160; sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.5 + Math.random() * 0.3, color, star }); }
  }
  // 그리기용 효과 업데이트 (메뉴에서도 돌아감)
  function updateFx(dt) {
    updateWeather(dt);
    rings.forEach(r => { r.t += dt; }); rings = rings.filter(r => r.t < 0.35);
    if (shake > 0) shake = Math.max(0, shake - dt * 30);
    let tx = 0, ty = 0;
    if (state === 'play' && lanes.length === 1 && lanes[0].st === 'fly' && lanes[0].jegi) {
      const [jx, jy] = jegiPos(lanes[0].jegi, lanes[0].jegi.t);
      ty = Math.max(0, Math.min(L.h * 0.06, (L.h * 0.5 - jy) * 0.12));
      tx = (jx - L.w / 2) * 0.05;
    }
    cam.x += (tx - cam.x) * Math.min(1, dt * 3); cam.y += (ty - cam.y) * Math.min(1, dt * 3);
    lanes.forEach(l => {
      if (l.faceT > 0) l.faceT -= dt;
      if (l.comboT != null) l.comboT += dt;
      if (l.st === 'fall') l.fallT = (l.fallT || 0) + dt;
      if (l.jegi && l.jegi.sq > 0) l.jegi.sq = Math.max(0, l.jegi.sq - dt * 5);
      if (l.st === 'fly' && l.jegi) {
        l.trail = l.trail || [];
        l.trail.push(jegiPos(l.jegi, l.jegi.t)); if (l.trail.length > 8) l.trail.shift();
      } else l.trail = [];
      if (l.fever && Math.random() < dt * 14) { const g = geo(l); sparks.push({ x: g.cx + (Math.random() - 0.5) * 30 * g.u, y: L.gy - Math.random() * 40 * g.u, vx: 0, vy: -40, life: 0.6, color: '#ffd23a', star: true }); }
    });
  }

  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    if (canvas.width < 2) layout();
    if (hitStop > 0) hitStop = Math.max(0, hitStop - dt); else update(dt);
    updateFx(dt);
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
    if (seg.dataset.key === 'stage') setStage(opt.stage === 'auto' ? STAGE_KEYS[Math.floor(Math.random() * STAGE_KEYS.length)] : opt.stage);
  }));
  function showMenu() {
    state = 'menu'; phase = 'idle'; players = []; lanes = [];
    if (opt.stage !== 'auto' && opt.stage !== curStage) setStage(opt.stage);
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
  setStage(opt.stage === 'auto' ? STAGE_KEYS[Math.floor(Math.random() * STAGE_KEYS.length)] : opt.stage);
  showMenu();
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(loop); });
})();
