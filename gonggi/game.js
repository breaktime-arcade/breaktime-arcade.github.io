/* 콩콩 공기 (Gonggi Pop) - 쉬는시간 오락실 */
(() => {
  'use strict';

  // ===== 설정 =====
  const LEVELS = {
    //        공중 시간  받기 판정  AI 실수 확률
    easy:   { air: 1.55, win: 0.22, aiFail: 0.11 },
    normal: { air: 1.25, win: 0.15, aiFail: 0.065 },
    hard:   { air: 1.0,  win: 0.10, aiFail: 0.035 }
  };
  const LEVEL_NAME = { easy: '쉬움', normal: '보통', hard: '어려움' };
  const STONE_COLORS = [
    ['#ff8fa8', '#e24a6e'], ['#ffd65c', '#e0a400'], ['#7cc8ff', '#2f86d6'],
    ['#8de08a', '#3aa33a'], ['#c59bff', '#7d4fd6']
  ];
  const STAGE_LABEL = ['', '1단', '2단', '3단', '4단', '꺾기'];
  const KEY_OPT = 'gonggi.opt', KEY_REC = 'gonggi.rec', KEY_SOUND = 'gonggi.sound';

  // ===== 저장소 =====
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }
  };
  function loadJSON(k, d) { try { return JSON.parse(store.get(k, '')) || d; } catch (e) { return d; } }

  // ===== 요소 =====
  const $ = id => document.getElementById(id);
  const stageEl = $('stage'), canvas = $('cv'), ctx = canvas.getContext('2d');
  const opt = Object.assign({ mode: 'solo', level: 'normal', goal: '20' }, loadJSON(KEY_OPT, {}));
  let rec = loadJSON(KEY_REC, {});
  let soundOn = store.get(KEY_SOUND, '1') === '1';

  // ===== 화면 배치 =====
  const L = { w: 1, h: 1, dpr: 1, pw: 1, ox: 0, r: 16, hx: 0, hy: 0, hr: 40, rise: 200, pileX: 0, pileY: 0 };
  function layout() {
    const rc = stageEl.getBoundingClientRect();
    L.w = Math.max(120, rc.width); L.h = Math.max(160, rc.height);
    L.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(L.w * L.dpr); canvas.height = Math.round(L.h * L.dpr);
    L.pw = Math.min(L.w, L.h * 0.9);
    L.ox = (L.w - L.pw) / 2;
    L.r = Math.max(11, Math.min(26, L.pw * 0.048));
    L.hx = L.ox + L.pw * 0.5; L.hy = L.h * 0.875;
    L.hr = Math.max(26, Math.min(L.pw * 0.12, L.h * 0.085));
    L.rise = L.h * 0.52;
    L.pileX = L.ox + L.pw * 0.1; L.pileY = L.h * 0.9;
  }
  const toPx = (u, v) => [L.ox + u * L.pw, v * L.h];

  // ===== 상태 =====
  let state = 'menu';       // menu | play | over
  let players = [], cur = 0;
  let stones = [];          // {u,v,col,where:'floor'|'hand'|'air'|'pile'|'back'|'fly', fx,fy,ft, tx,ty}
  let phase = 'idle', phaseT = 0, airT = 1.2;
  let picked = [], need = null, airStones = [];
  let backCount = 0, guide = '', banner = null;
  let pops = [], sparks = [];
  let dragging = false, fails = 0, playTime = 0;
  let ai = null, clock = 0, lastT = 0;
  const LV = () => LEVELS[opt.level];
  const P = () => players[cur];

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
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  }
  const sfx = {
    toss() { tone(300, 0.18, 'sine', 0.12, 900); },
    pick() { tone(1200, 0.05, 'square', 0.06); tone(1600, 0.04, 'sine', 0.06, 0, 0.03); },
    catch(p) { tone(p ? 880 : 660, 0.08, 'triangle', 0.22, p ? 1320 : 880); if (p) tone(1760, 0.1, 'sine', 0.08, 0, 0.06); },
    fail() { tone(392, 0.16, 'triangle', 0.16, 300); tone(262, 0.3, 'triangle', 0.14, 180, 0.15); },
    clear() { [659, 784, 988].forEach((f, i) => tone(f, 0.14, 'triangle', 0.14, 0, i * 0.09)); },
    age() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.15, 0, i * 0.08)); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, 0, i * 0.13)); },
    lose() { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, 0, i * 0.14)); },
    click() { tone(800, 0.04, 'sine', 0.08); }
  };

  // ===== 돌 위치 =====
  function handSlot(i, n) {                     // 손바닥 위 돌 자리
    const a = (i - (n - 1) / 2) * 0.55;
    return [L.hx + Math.sin(a) * L.hr * 0.5, L.hy - L.hr * 0.05 - Math.cos(a) * L.hr * 0.1];
  }
  function stonePos(s, i) {
    if (s.where === 'floor') return toPx(s.u, s.v);
    if (s.where === 'pile') { const k = pileIndex(s); return [L.pileX + (k % 2) * L.r * 1.3, L.pileY - Math.floor(k / 2) * L.r * 0.9]; }
    if (s.where === 'hand' || s.where === 'back') {
      const list = stones.filter(t => t.where === s.where);
      const k = list.indexOf(s);
      const [x, y] = handSlot(k, list.length);
      if (s.where === 'back') return [L.hx + (k - (list.length - 1) / 2) * L.r * 1.25, L.hy - L.hr * 0.2 - Math.abs(k - (list.length - 1) / 2) * L.r * 0.15];
      return [x, y];
    }
    if (s.where === 'air') {
      const h = heightAt(phaseT, airT);
      const k = airStones.indexOf(s), n = airStones.length;
      const spread = n > 1 ? (k - (n - 1) / 2) * L.r * 1.1 * (0.6 + h * 0.6) : 0;
      return [L.hx + spread, L.hy - L.hr * 0.1 - h * L.rise];
    }
    if (s.where === 'fly') {
      const t = Math.min(1, s.ft / 0.16), e = 1 - (1 - t) * (1 - t);
      return [s.fx + (s.tx - s.fx) * e, s.fy + (s.ty - s.fy) * e - Math.sin(t * Math.PI) * L.r * 1.5];
    }
    return [0, 0];
  }
  function pileIndex(s) { return stones.filter(t => t.where === 'pile').indexOf(s); }
  const heightAt = (t, T) => { const x = t / T; return Math.max(-0.25, 4 * x * (1 - x)); };

  function scatter(nFloor) {
    // nFloor개는 바닥에, 나머지는 손에
    const pts = [];
    const minD = L.r * 3.2;
    for (let i = 0; i < nFloor; i++) {
      let best = null;
      for (let tries = 0; tries < 80; tries++) {
        const u = 0.14 + Math.random() * 0.72, v = 0.2 + Math.random() * 0.33;
        const [x, y] = toPx(u, v);
        let ok = true;
        for (const p of pts) { const [px2, py2] = toPx(p[0], p[1]); if (Math.hypot(px2 - x, py2 - y) < minD) { ok = false; break; } }
        best = [u, v];
        if (ok) break;
      }
      pts.push(best);
    }
    stones.forEach((s, i) => {
      const [hx0, hy0] = [L.hx, L.hy - L.hr * 0.3];
      if (i < nFloor) {
        const [tx, ty] = toPx(pts[i][0], pts[i][1]);
        s.u = pts[i][0]; s.v = pts[i][1];
        flyTo(s, hx0, hy0, tx, ty, 'floor');
      } else { s.where = 'hand'; }
    });
  }
  function flyTo(s, fx, fy, tx, ty, then) {
    s.where = 'fly'; s.fx = fx; s.fy = fy; s.tx = tx; s.ty = ty; s.ft = 0; s.then = then;
  }

  // ===== 게임 흐름 =====
  function startGame() {
    ensureAudio();
    stones = STONE_COLORS.map(col => ({ col, where: 'hand', u: 0.5, v: 0.5 }));
    if (opt.mode === 'solo') players = [{ name: '나', face: '🙂', age: 0, stage: 1, ai: false }];
    else if (opt.mode === 'ai') players = [{ name: '나', face: '🙂', age: 0, stage: 1, ai: false }, { name: 'AI · ' + LEVEL_NAME[opt.level], face: '🤖', age: 0, stage: 1, ai: true }];
    else players = [{ name: '1P', face: '🐰', age: 0, stage: 1, ai: false }, { name: '2P', face: '🐻', age: 0, stage: 1, ai: false }];
    cur = 0; fails = 0; playTime = 0; pops = []; sparks = [];
    state = 'play';
    $('menu').classList.remove('show'); $('result').classList.remove('show'); $('confirm').classList.remove('show');
    beginTurn(true);
  }

  function beginTurn(first) {
    ai = null;
    const p = P();
    if (players.length > 1) {
      banner = { text: first ? `${p.name} 먼저!` : `${p.name} 차례`, t: 0 };
      setPhase('banner');
    } else beginStage();
    updateHud();
  }

  function beginStage() {
    const p = P();
    stones.forEach(s => { s.where = 'hand'; });
    picked = [];
    if (p.stage <= 4) {
      scatter(4);
      setPhase('scatter');
    } else {
      setPhase('kk_ready');
    }
    updateHud();
  }

  function setPhase(ph) {
    phase = ph; phaseT = 0;
    dragging = false;
    if (P() && P().ai && state === 'play') planAI();
    guide = guideText();
  }

  function guideText() {
    const p = P(); if (!p) return '';
    const who = p.ai ? 'AI가 ' : '';
    switch (phase) {
      case 'ready': return p.ai ? 'AI가 던질 준비 중' : '아무 곳이나 눌러 공깃돌을 던져요';
      case 'air': return p.ai ? 'AI가 줍는 중!' : `바닥 돌 ${needText()} 집고 → 손에서 받아요!`;
      case 'kk_ready': return p.ai ? 'AI가 꺾기 준비 중' : '꺾기! 눌러서 다섯 개를 모두 던져요';
      case 'kk_air1': return p.ai ? 'AI가 손등으로 받는 중' : '떨어질 때 눌러 손등으로 받아요!';
      case 'kk_back': return p.ai ? 'AI가 손등 돌을 띄워요' : `손등에 ${backCount}개! 눌러서 띄워요`;
      case 'kk_air2': return p.ai ? 'AI가 낚아채는 중' : '떨어질 때 눌러 낚아채요!';
      default: return who ? '' : '';
    }
  }
  function needText() {
    if (!need) return '';
    return need.length === 1 ? `${need[0]}개를` : need.join('개 또는 ') + '개를';
  }

  function allowedPick() {
    const p = P(), R = stones.filter(s => s.where === 'floor').length;
    if (p.stage === 1) return [1];
    if (p.stage === 2) return [Math.min(2, R)];
    if (p.stage === 3) return R === 4 ? [1, 3] : [R];
    return [R];
  }

  function toss() {
    if (phase !== 'ready') return;
    const thrower = stones.find(s => s.where === 'hand');
    if (!thrower) return;
    thrower.where = 'air';
    airStones = [thrower];
    airT = LV().air;
    picked = [];
    need = allowedPick();
    sfx.toss();
    setPhase('air');
  }

  function pickStone(s) {
    if (phase !== 'air' || s.where !== 'floor') return;
    const max = Math.max(...need);
    if (picked.length >= max) { fail('다른 돌을 건드렸어요!'); return; }
    const [x, y] = toPx(s.u, s.v);
    picked.push(s);
    flyTo(s, x, y, L.hx - L.hr * 0.7, L.hy - L.hr * 0.1, 'held');
    sfx.pick();
    addSpark(x, y, '#fff6b0', 6);
  }

  function catchAttempt(auto) {
    const T = airT, w = LV().win, t = phaseT;
    if (phase === 'air') {
      if (t < T - w) { fail('너무 빨리 받았어요!'); return; }
      if (!need.includes(picked.length)) {
        fail(picked.length < Math.min(...need) ? `돌을 ${Math.min(...need)}개 집어야 해요!` : '돌을 잘못 집었어요!');
        return;
      }
      const perfect = Math.abs(t - T) <= w * 0.4;
      sfx.catch(perfect);
      popText(perfect ? '완벽!' : '좋아요!', L.hx, L.hy - L.hr * 1.4, perfect ? '#ff6f91' : '#3dbb9c');
      if (perfect) addSpark(L.hx, L.hy - L.hr * 0.4, '#ffe066', 14);
      airStones.forEach(s => { s.where = 'hand'; });
      picked.forEach(s => { s.where = 'pile'; });
      picked = []; airStones = [];
      if (!stones.some(s => s.where === 'floor')) {
        stageClear();
      } else setPhase('ready');
      return;
    }
    if (phase === 'kk_air1') {
      const d = Math.abs(t - T);
      if (t < T - w * 1.6) { fail('너무 빨리 손을 댔어요!'); return; }
      let n;
      if (d <= w * 0.4) n = 5;
      else if (d <= w) n = 3 + (Math.random() < 0.5 ? 1 : 0);
      else if (d <= w * 1.6) n = 1 + (Math.random() < 0.5 ? 1 : 0);
      else n = 0;
      if (auto != null) n = auto;
      if (n <= 0) { fail('손등에 하나도 못 올렸어요!'); return; }
      backCount = n;
      stones.forEach(s => { s.where = 'pile'; });
      stones.slice(0, n).forEach(s => { s.where = 'back'; });
      airStones = [];
      sfx.catch(n === 5);
      popText(n === 5 ? '다섯 개 모두!' : `손등에 ${n}개!`, L.hx, L.hy - L.hr * 1.4, '#ff6f91');
      setPhase('kk_back');
      return;
    }
    if (phase === 'kk_air2') {
      const d = Math.abs(t - T);
      if (t < T - w * 1.3) { fail('너무 빨리 낚아챘어요!'); return; }
      let n;
      if (d <= w * 0.45) n = backCount;
      else if (d <= w * 1.2) n = Math.random() < 0.65 ? backCount : backCount - 1;
      else n = 0;
      if (auto != null) n = auto;
      if (n <= 0) { fail('하나도 못 낚아챘어요!'); return; }
      airStones = [];
      stones.forEach(s => { s.where = 'hand'; });
      gainAge(n);
    }
  }

  function tossBack() {
    if (phase !== 'kk_back') return;
    airStones = stones.filter(s => s.where === 'back');
    airStones.forEach(s => { s.where = 'air'; });
    airT = LV().air * 0.8;
    sfx.toss();
    setPhase('kk_air2');
  }
  function tossFive() {
    if (phase !== 'kk_ready') return;
    airStones = stones.slice();
    airStones.forEach(s => { s.where = 'air'; });
    airT = LV().air * 0.95;
    sfx.toss();
    setPhase('kk_air1');
  }

  function stageClear() {
    const p = P();
    sfx.clear();
    popText(`${STAGE_LABEL[p.stage]} 통과!`, L.w / 2, L.h * 0.42, '#ff6f91', true);
    p.stage++;
    updateHud();
    setPhase('wait');
    phaseNext = () => beginStage();
  }
  let phaseNext = null;

  function gainAge(n) {
    const p = P();
    p.age += n;
    sfx.age();
    popText(`+${n}살!`, L.w / 2, L.h * 0.4, '#ff6f91', true);
    addSpark(L.w / 2, L.h * 0.42, '#ffd84d', 26);
    p.stage = 1;
    updateHud();
    setPhase('wait');
    const goal = +opt.goal;
    if (p.age >= goal) phaseNext = () => finish(cur);
    else phaseNext = () => beginStage();
  }

  function fail(msg) {
    if (phase === 'fail' || phase === 'wait') return;
    sfx.fail();
    popText('아이고!', L.hx, L.hy - L.hr * 1.6, '#e24a4a', true);
    popText(msg, L.w / 2, L.h * 0.16, '#7a3b2e');
    // 공중 돌은 떨어뜨림
    airStones.forEach(s => { s.where = 'hand'; });
    picked.forEach(s => { if (s.where === 'fly' || s.where === 'held') s.where = 'hand'; });
    airStones = []; picked = [];
    fails++;
    setPhase('fail');
    phaseNext = () => {
      if (players.length > 1) { cur = (cur + 1) % players.length; beginTurn(false); }
      else beginStage();
    };
  }

  function finish(winner) {
    state = 'over'; setPhase('idle');
    const p = players[winner];
    let emoji, title, msg, info = '', newRec = false;
    if (opt.mode === 'solo') {
      emoji = '🎉'; title = `${opt.goal}살 달성!`; msg = '공기 실력이 대단해요!';
      const key = opt.level + '_' + opt.goal;
      const best = rec.solo && rec.solo[key];
      const t = Math.round(playTime);
      rec.solo = rec.solo || {};
      if (!best || t < best) { rec.solo[key] = t; newRec = !!best || true; }
      info = `걸린 시간 <b>${fmt(t)}</b> · 실수 <b>${fails}</b>번<br>최고 기록(${LEVEL_NAME[opt.level]}·${opt.goal}살): <b>${fmt(rec.solo[key])}</b>`;
      sfx.win();
    } else if (opt.mode === 'ai') {
      const won = !p.ai;
      const r = rec[opt.level] || { w: 0, l: 0 };
      if (won) r.w++; else r.l++;
      rec[opt.level] = r;
      emoji = won ? '🎉' : '😢'; title = won ? '이겼어요!' : '아쉽게 졌어요';
      msg = won ? `AI(${LEVEL_NAME[opt.level]})보다 먼저 ${opt.goal}살!` : '한 판 더 하면 이길 수 있어요!';
      info = `나 <b>${players[0].age}살</b> : AI <b>${players[1].age}살</b><br>${LEVEL_NAME[opt.level]} 전적: <b>${r.w}승 ${r.l}패</b>`;
      won ? sfx.win() : sfx.lose();
    } else {
      emoji = '🏆'; title = `${p.name} 승리!`; msg = '멋진 공기 대결이었어요!';
      info = `1P <b>${players[0].age}살</b> : 2P <b>${players[1].age}살</b>`;
      sfx.win();
    }
    store.set(KEY_REC, JSON.stringify(rec));
    $('resEmoji').textContent = emoji; $('resTitle').textContent = title;
    $('resMsg').textContent = msg; $('resInfo').innerHTML = info;
    $('resNew').classList.toggle('hidden', !newRec);
    setTimeout(() => $('result').classList.add('show'), 900);
    updateHud();
  }
  const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  // ===== AI =====
  function planAI() {
    const lv = LV();
    ai = { acts: [] };
    const A = (t, f) => ai.acts.push({ t, f });
    switch (phase) {
      case 'scatter': break;
      case 'ready': A(0.55 + Math.random() * 0.35, toss); break;
      case 'kk_ready': A(0.7 + Math.random() * 0.3, tossFive); break;
      case 'kk_back': A(0.5 + Math.random() * 0.3, tossBack); break;
      case 'air': {
        const T = airT, floor = stones.filter(s => s.where === 'floor');
        const n = need.length > 1 ? need[Math.random() < 0.5 ? 0 : 1] : need[0];
        const order = floor.slice().sort(() => Math.random() - 0.5).slice(0, n);
        order.forEach((s, i) => A(T * 0.22 + i * Math.min(0.14, T * 0.12), () => { aiPoint = { s, t: 0 }; pickStone(s); }));
        const willFail = Math.random() < lv.aiFail;
        if (willFail) {
          if (Math.random() < 0.5) A(T - lv.win * 2.2, () => catchAttempt());   // 너무 빨리
          // 나머지 절반은 받지 못하고 떨어뜨림
        } else {
          const err = (Math.random() * 2 - 1) * lv.win * 0.7;
          A(T + err, () => catchAttempt());
        }
        break;
      }
      case 'kk_air1': {
        const T = airT, roll = Math.random();
        if (roll < lv.aiFail) A(T - lv.win * 2.5, () => catchAttempt());
        else {
          const n = roll < 0.45 ? 5 : roll < 0.8 ? 4 : 3;
          A(T + (Math.random() - 0.5) * lv.win * 0.5, () => catchAttempt(n));
        }
        break;
      }
      case 'kk_air2': {
        const T = airT;
        if (Math.random() < lv.aiFail * 1.3) A(T - lv.win * 2.2, () => catchAttempt());
        else {
          const n = Math.random() < 0.75 ? backCount : Math.max(1, backCount - 1);
          A(T + (Math.random() - 0.5) * lv.win * 0.5, () => catchAttempt(n));
        }
        break;
      }
    }
  }
  let aiPoint = null;

  // ===== 입력 =====
  function ptr(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function stoneAt(x, y) {
    let best = null, bd = L.r * 1.7;
    for (const s of stones) {
      if (s.where !== 'floor') continue;
      const [sx, sy] = toPx(s.u, s.v);
      const d = Math.hypot(sx - x, sy - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  canvas.addEventListener('pointerdown', e => {
    ensureAudio();
    if (state !== 'play' || !P() || P().ai) return;
    e.preventDefault();
    const [x, y] = ptr(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    switch (phase) {
      case 'ready': toss(); break;
      case 'kk_ready': tossFive(); break;
      case 'kk_back': tossBack(); break;
      case 'kk_air1': case 'kk_air2': catchAttempt(); break;
      case 'air': {
        const s = stoneAt(x, y);
        if (s) { pickStone(s); dragging = true; }
        else catchAttempt();
        break;
      }
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging || phase !== 'air') return;
    const [x, y] = ptr(e);
    const s = stoneAt(x, y);
    if (s && !picked.includes(s)) pickStone(s);
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ===== 연출 =====
  function popText(text, x, y, color, big) { pops.push({ text, x, y, color, big, t: 0 }); }
  function addSpark(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 160;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.6 + Math.random() * 0.3, color });
    }
  }

  // ===== 상단 정보 =====
  function updateHud() {
    const show = (i) => {
      const p = players[i], chip = $('p' + i);
      if (!p) { chip.classList.add('hidden'); return; }
      chip.classList.remove('hidden');
      chip.querySelector('.face').textContent = p.face;
      $('p' + i + 'n').textContent = p.name;
      $('p' + i + 'a').textContent = `${p.age}살 · ${STAGE_LABEL[Math.min(5, p.stage)]}`;
      chip.classList.toggle('on', players.length > 1 && i === cur && state === 'play');
    };
    if (!players.length) players = [{ name: '나', face: '🙂', age: 0, stage: 1 }];
    show(0); show(1);
    $('btnSound').textContent = soundOn ? '🔊' : '🔇';
  }

  // ===== 그리기 =====
  function rr(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawMat() {
    ctx.fillStyle = '#f6e4c2'; ctx.fillRect(0, 0, L.w, L.h);
    const x = L.ox + 6, y = L.h * 0.08, w = L.pw - 12, h = L.h * 0.53;
    ctx.save();
    rr(x, y, w, h, 18); ctx.fillStyle = '#f3d79a'; ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(190,140,60,.25)'; ctx.lineWidth = 2;
    for (let i = -h; i < w; i += 14) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + h, y + h); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(190,140,60,.12)';
    for (let i = 0; i < w + h; i += 14) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i - h, y + h); ctx.stroke(); }
    ctx.fillStyle = 'rgba(230,90,110,.35)';
    ctx.fillRect(x, y + 8, w, 6); ctx.fillRect(x, y + h - 14, w, 6);
    ctx.restore();
    rr(x, y, w, h, 18); ctx.strokeStyle = '#d8a95c'; ctx.lineWidth = 3; ctx.stroke();
  }
  function drawStone(x, y, col, scale = 1, alpha = 1) {
    const r = L.r * scale;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3, b = a + Math.PI / 3;
      const x1 = Math.cos(a) * r, y1 = Math.sin(a) * r * 0.92, x2 = Math.cos(b) * r, y2 = Math.sin(b) * r * 0.92;
      if (i === 0) ctx.moveTo((x1 + x2) / 2, (y1 + y2) / 2);
      ctx.quadraticCurveTo(x2, y2, (x2 + Math.cos(b + Math.PI / 3) * r) / 2, (y2 + Math.sin(b + Math.PI / 3) * r * 0.92) / 2);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, col[0]); g.addColorStop(1, col[1]);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.38, r * 0.3, r * 0.15, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function shadow(x, y, s, a) {
    ctx.fillStyle = `rgba(90,50,10,${a})`;
    ctx.beginPath(); ctx.ellipse(x, y, L.r * s, L.r * s * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawHand(back) {
    const x = L.hx, y = L.hy, r = L.hr;
    ctx.save();
    ctx.fillStyle = '#ffd9b8'; ctx.strokeStyle = '#d9a27a'; ctx.lineWidth = 3;
    // 손목
    rr(x - r * 0.55, y + r * 0.2, r * 1.1, L.h, r * 0.3); ctx.fill(); ctx.stroke();
    // 손가락 (위쪽)
    for (let i = 0; i < 4; i++) {
      const fx = x - r * 0.6 + i * r * 0.4, len = [0.95, 1.1, 1.05, 0.85][i];
      rr(fx - r * 0.16, y - r * (0.25 + len), r * 0.32, r * (len + 0.4), r * 0.16); ctx.fill(); ctx.stroke();
      if (back) {
        ctx.fillStyle = '#ffeee6';
        rr(fx - r * 0.1, y - r * (0.2 + len), r * 0.2, r * 0.24, r * 0.08); ctx.fill();
        ctx.fillStyle = '#ffd9b8';
      }
    }
    // 엄지
    ctx.save(); ctx.translate(x + r * 0.82, y - r * 0.05); ctx.rotate(0.6);
    rr(-r * 0.17, -r * 0.55, r * 0.34, r * 0.85, r * 0.17); ctx.fill(); ctx.stroke(); ctx.restore();
    // 손바닥
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.88, r * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (!back) {
      ctx.strokeStyle = 'rgba(200,130,90,.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x - r * 0.1, y + r * 0.55, r * 0.55, Math.PI * 1.3, Math.PI * 1.75); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(200,130,90,.35)';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - r * 0.6 + i * r * 0.4, y - r * 0.45, r * 0.06, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
  function drawTimingRing() {
    if (!['air', 'kk_air1', 'kk_air2'].includes(phase)) return;
    const T = airT, w = LV().win, t = phaseT;
    const remain = Math.max(0, T - t);
    const k = remain / T;
    const R = L.hr * (0.75 + k * 1.3);
    const inWin = Math.abs(t - T) <= w;
    ctx.strokeStyle = inWin ? '#2fbf71' : 'rgba(255,111,145,.85)';
    ctx.lineWidth = inWin ? 6 : 4;
    ctx.beginPath(); ctx.arc(L.hx, L.hy - L.hr * 0.1, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(80,60,40,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(L.hx, L.hy - L.hr * 0.1, L.hr * 0.75, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawStageDots() {
    const p = P(); if (!p) return;
    const n = 5, sz = Math.min(30, L.pw / 12), gap = sz * 0.35;
    const total = n * sz + (n - 1) * gap;
    let x = L.w / 2 - total / 2;
    const y = L.h * 0.025 + 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 1; i <= n; i++) {
      const done = i < p.stage, now = i === p.stage;
      rr(x, y, sz, sz * 0.8, sz * 0.3);
      ctx.fillStyle = now ? '#ff6f91' : done ? '#3dbb9c' : '#fff';
      ctx.fill(); ctx.strokeStyle = '#d8a95c'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = now || done ? '#fff' : '#b08a60';
      ctx.font = `${Math.round(sz * 0.42)}px Jua, sans-serif`;
      ctx.fillText(i === 5 ? '꺾' : String(i), x + sz / 2, y + sz * 0.42);
      x += sz + gap;
    }
  }
  function drawGuide() {
    if (!guide || phase === 'banner') return;
    const fs = Math.max(15, Math.min(20, L.pw / 22));
    ctx.font = `${fs}px Jua, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(guide).width + 26;
    const x = L.w / 2 - tw / 2, y = L.h * 0.625;
    rr(x, y, tw, fs * 1.8, fs * 0.9);
    ctx.fillStyle = P() && P().ai ? 'rgba(80,90,130,.85)' : 'rgba(255,111,145,.92)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(guide, L.w / 2, y + fs * 0.92);
  }

  function render() {
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    drawMat();
    if (state === 'menu') {
      // 메뉴 뒤 장식
      stones.forEach((s, i) => { const [x, y] = toPx(0.25 + i * 0.12, 0.42 + Math.sin(clock * 2 + i) * 0.02); drawStone(x, y, s.col); });
      return;
    }
    drawStageDots();
    // 모은 돌 바구니
    const pileN = stones.filter(s => s.where === 'pile').length;
    if (pileN || P().stage < 5) {
      ctx.fillStyle = 'rgba(160,110,60,.18)';
      ctx.beginPath(); ctx.ellipse(L.pileX + L.r * 0.6, L.pileY + L.r * 0.6, L.r * 2, L.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(140,95,50,.7)'; ctx.font = `${Math.max(12, Math.round(L.r * 0.7))}px Jua, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('모은 돌', L.pileX + L.r * 0.6, L.pileY + L.r * 1.9);
    }
    // 바닥 돌
    stones.forEach((s, i) => {
      if (s.where !== 'floor' && s.where !== 'pile') return;
      const [x, y] = stonePos(s, i);
      shadow(x + 2, y + L.r * 0.55, 0.9, 0.18);
      drawStone(x, y, s.col);
    });
    const back = phase === 'kk_back' || phase === 'kk_air2';
    drawHand(back);
    drawTimingRing();
    // 손 위 / 날아가는 돌
    stones.forEach((s, i) => {
      if (s.where === 'hand' || s.where === 'back' || s.where === 'fly' || s.where === 'held') {
        if (s.where === 'held') return;
        const [x, y] = stonePos(s, i);
        drawStone(x, y, s.col, 0.95);
      }
    });
    // 공중 돌 (그림자는 손 위)
    const h = heightAt(phaseT, airT);
    airStones.forEach((s, i) => {
      const [x, y] = stonePos(s, i);
      shadow(x, L.hy + L.hr * 0.1, 0.9 - h * 0.4, 0.25 - h * 0.12);
      drawStone(x, y, s.col, 1 + Math.max(0, h) * 0.55);
    });
    // 집은 돌 (손 안)
    const held = stones.filter(s => s.where === 'held').length;
    if (held) {
      ctx.fillStyle = '#ff6f91'; ctx.font = `${Math.round(L.r * 1.1)}px Jua, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(`✊ ${held}`, L.hx - L.hr * 1.5, L.hy - L.hr * 0.2);
    }
    // AI 손가락
    if (aiPoint && aiPoint.t < 0.35) {
      const [x, y] = toPx(aiPoint.s.u, aiPoint.s.v);
      ctx.font = `${Math.round(L.r * 1.8)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1 - aiPoint.t / 0.35;
      ctx.fillText('👆', x + L.r * 0.3, y + L.r * 1.2);
      ctx.globalAlpha = 1;
    }
    // 반짝이
    sparks.forEach(p => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.8));
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawGuide();
    // 떠오르는 글자
    pops.forEach(p => {
      const fs = p.big ? Math.max(28, L.pw / 11) : Math.max(16, L.pw / 24);
      ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.3 - p.t) * 2));
      const y = p.y - p.t * 30, sc = p.big ? 1 + Math.max(0, 0.25 - p.t) : 1;
      ctx.save(); ctx.translate(p.x, y); ctx.scale(sc, sc);
      ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
      ctx.strokeText(p.text, 0, 0); ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
      ctx.restore(); ctx.globalAlpha = 1;
    });
    // 차례 안내
    if (phase === 'banner' && banner) {
      const a = Math.min(1, banner.t * 4, (1.2 - banner.t) * 4);
      ctx.globalAlpha = Math.max(0, a);
      const fs = Math.max(30, L.pw / 9);
      rr(L.w / 2 - L.pw * 0.38, L.h * 0.36, L.pw * 0.76, fs * 2, 22);
      ctx.fillStyle = 'rgba(255,248,236,.96)'; ctx.fill(); ctx.strokeStyle = '#ff6f91'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#ff6f91'; ctx.font = `${fs}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(banner.text, L.w / 2, L.h * 0.36 + fs);
      ctx.globalAlpha = 1;
    }
  }

  // ===== 업데이트 =====
  function update(dt) {
    clock += dt;
    if (state !== 'play') return;
    phaseT += dt;
    if (opt.mode === 'solo' && phase !== 'banner') playTime += dt;
    // 날아가는 돌
    stones.forEach(s => {
      if (s.where === 'fly') { s.ft += dt; if (s.ft >= 0.16) s.where = s.then; }
    });
    if (aiPoint) aiPoint.t += dt;
    switch (phase) {
      case 'banner': banner.t = phaseT; if (phaseT > 1.2) beginStage(); break;
      case 'scatter': if (phaseT > 0.45) setPhase('ready'); break;
      case 'air': case 'kk_air1': case 'kk_air2':
        if (phaseT > airT + LV().win * (phase === 'air' ? 1 : 1.6)) fail(phase === 'kk_air2' ? '못 낚아챘어요!' : '돌을 떨어뜨렸어요!');
        break;
      case 'fail': if (phaseT > 1.3 && phaseNext) { const f = phaseNext; phaseNext = null; f(); } break;
      case 'wait': if (phaseT > 0.9 && phaseNext) { const f = phaseNext; phaseNext = null; f(); } break;
    }
    // AI 행동 실행
    if (ai && P() && P().ai) {
      const ph = phase;
      for (const a of ai.acts) {
        if (!a.done && phaseT >= a.t) { a.done = true; a.f(); if (phase !== ph) break; }
      }
    }
    pops.forEach(p => { p.t += dt; }); pops = pops.filter(p => p.t < 1.3);
    sparks.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; });
    sparks = sparks.filter(p => p.life > 0);
  }

  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    if (canvas.width < 2) layout();
    update(dt);
    try { render(); } catch (e) { /* 다음 프레임에서 다시 그림 */ }
  }

  // ===== 메뉴 =====
  function syncMenu() {
    document.querySelectorAll('.seg').forEach(seg => {
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === opt[seg.dataset.key]));
    });
    let txt = '';
    if (opt.mode === 'solo') {
      const b = rec.solo && rec.solo[opt.level + '_' + opt.goal];
      txt = `🏆 최고 기록(${LEVEL_NAME[opt.level]}·${opt.goal}살): <b>${b ? fmt(b) : '아직 없음'}</b>`;
    } else if (opt.mode === 'ai') {
      const r = rec[opt.level] || { w: 0, l: 0 };
      txt = `🏆 ${LEVEL_NAME[opt.level]} 전적: <b>${r.w}승 ${r.l}패</b>`;
    } else txt = '한 기기로 번갈아 해요. 먼저 목표 나이가 되면 승리!';
    $('menuRec').innerHTML = txt;
  }
  document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    opt[seg.dataset.key] = b.dataset.v;
    store.set(KEY_OPT, JSON.stringify(opt));
    ensureAudio(); sfx.click(); syncMenu();
  }));
  function showMenu() {
    state = 'menu'; ai = null; phase = 'idle';
    $('result').classList.remove('show'); $('confirm').classList.remove('show');
    syncMenu(); $('menu').classList.add('show');
    players = []; updateHud();
    $('p1').classList.add('hidden');
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
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); });

  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(layout, 60); };
  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stageEl);

  // ===== 시작 =====
  stones = STONE_COLORS.map(col => ({ col, where: 'hand', u: 0.5, v: 0.5 }));
  layout();
  showMenu();
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(loop); });
})();
