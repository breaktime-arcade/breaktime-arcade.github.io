/* 톡! 오목 (Tok Omok) - 쉬는시간 오락실 */
(() => {
  'use strict';
 
  // ===== 설정 =====
  const N = 15;                         // 15×15 판
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const UNDO_MAX = 3, HINT_MAX = 3;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const LEVEL_NAME = { easy: '쉬움', normal: '보통', hard: '어려움' };
  const KEY_OPT = 'omok.opt', KEY_REC = 'omok.rec', KEY_SOUND = 'omok.sound';
 
  // ===== 저장소 =====
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }
  };
  function loadJSON(k, d) { try { return JSON.parse(store.get(k, '')) || d; } catch (e) { return d; } }
 
  // ===== 요소 =====
  const $ = id => document.getElementById(id);
  const stage = $('stage'), canvas = $('board'), ctx = canvas.getContext('2d');
  const el = {
    turnStone: $('turnStone'), turnText: $('turnText'),
    btnUndo: $('btnUndo'), undoBadge: $('undoBadge'), btnHint: $('btnHint'), hintBadge: $('hintBadge'),
    btnHome: $('btnHome'), btnSound: $('btnSound'), toast: $('toast'),
    menu: $('menu'), confirm: $('confirm'), result: $('result'), menuRec: $('menuRec')
  };
 
  // ===== 상태 =====
  const opt = Object.assign({ mode: 'ai', level: 'normal', first: 'me', rule: 'free' }, loadJSON(KEY_OPT, {}));
  let rec = loadJSON(KEY_REC, {});
  let soundOn = store.get(KEY_SOUND, '1') === '1';
  let board = [], moves = [], turn = BLACK, humanColor = BLACK;
  let state = 'menu';                   // menu | playing | over
  let aiThinking = false, aiTimer = 0;
  let undoLeft = UNDO_MAX, hintLeft = HINT_MAX;
  let hover = null, pending = null, hint = null, winLine = null, forbidSet = new Set();
  let placeAnim = null, toastTimer = 0, touchTipShown = false;
  const L = { w: 0, h: 0, dpr: 1, cell: 0, ox: 0, oy: 0, size: 0 };
  let clock = 0, lastT = 0;
 
  // ===== 효과음 =====
  let ac = null;
  function ensureAudio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = 0, delay = 0) {
    if (!soundOn || !ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    tok(c) { const f = c === BLACK ? 420 : 520; tone(f, 0.07, 'triangle', 0.3, f * 0.6); tone(f * 2.6, 0.03, 'sine', 0.08); },
    bad() { tone(200, 0.15, 'square', 0.05, 140); },
    hint() { tone(700, 0.1, 'sine', 0.12); tone(1050, 0.16, 'sine', 0.12, 0, 0.1); },
    undo() { tone(600, 0.12, 'sine', 0.12, 350); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.16, 0, i * 0.12)); },
    lose() { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, 0, i * 0.14)); },
    draw() { [523, 523, 659].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, 0, i * 0.13)); },
    click() { tone(800, 0.04, 'sine', 0.08); }
  };
 
  // ===== 판 유틸 =====
  const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  function newBoard() { const b = []; for (let y = 0; y < N; y++) b.push(new Array(N).fill(EMPTY)); return b; }
 
  // (x,y)를 지나는 c색 연속 개수 (x,y에 이미 c가 놓여 있다고 가정)
  function runLen(b, x, y, dx, dy, c) {
    let n = 1;
    for (let k = 1; ; k++) { const xx = x + dx * k, yy = y + dy * k; if (!inb(xx, yy) || b[yy][xx] !== c) break; n++; }
    for (let k = 1; ; k++) { const xx = x - dx * k, yy = y - dy * k; if (!inb(xx, yy) || b[yy][xx] !== c) break; n++; }
    return n;
  }
  function winRun(b, x, y, c, renju) {
    for (const [dx, dy] of DIRS) {
      const r = runLen(b, x, y, dx, dy, c);
      if (renju && c === BLACK ? r === 5 : r >= 5) {
        let a = 0, e = 0;
        while (inb(x - dx * (a + 1), y - dy * (a + 1)) && b[y - dy * (a + 1)][x - dx * (a + 1)] === c) a++;
        while (inb(x + dx * (e + 1), y + dy * (e + 1)) && b[y + dy * (e + 1)][x + dx * (e + 1)] === c) e++;
        return [x - dx * a, y - dy * a, x + dx * e, y + dy * e];
      }
    }
    return null;
  }
 
  // ===== 렌주 금수 판정 (흑) =====
  function makesExactFive(b, x, y, dx, dy) {           // (x,y)가 빈칸일 때 흑을 두면 그 방향으로 정확히 5
    if (!inb(x, y) || b[y][x] !== EMPTY) return false;
    b[y][x] = BLACK; const r = runLen(b, x, y, dx, dy, BLACK); b[y][x] = EMPTY;
    return r === 5;
  }
  function hasFour(b, x, y, dx, dy) {                   // 이 방향에 "한 수 더 두면 정확히 5"가 되는 자리가 있는가
    for (let k = -4; k <= 4; k++) {
      if (!k) continue;
      const xx = x + dx * k, yy = y + dy * k;
      if (!inb(xx, yy) || b[yy][xx] !== EMPTY) continue;
      b[yy][xx] = BLACK; const r = runLen(b, x, y, dx, dy, BLACK); b[yy][xx] = EMPTY;
      if (r === 5) return true;
    }
    return false;
  }
  function isStraightFour(b, x, y, dx, dy) {            // (x,y)를 포함한 열린 4 (양쪽 모두 5가 되는 4)
    let a = 0, e = 0;
    while (inb(x - dx * (a + 1), y - dy * (a + 1)) && b[y - dy * (a + 1)][x - dx * (a + 1)] === BLACK) a++;
    while (inb(x + dx * (e + 1), y + dy * (e + 1)) && b[y + dy * (e + 1)][x + dx * (e + 1)] === BLACK) e++;
    if (a + e + 1 !== 4) return false;
    return makesExactFive(b, x - dx * (a + 1), y - dy * (a + 1), dx, dy) &&
           makesExactFive(b, x + dx * (e + 1), y + dy * (e + 1), dx, dy);
  }
  function hasOpenThree(b, x, y, dx, dy) {
    for (let k = -3; k <= 3; k++) {
      if (!k) continue;
      const xx = x + dx * k, yy = y + dy * k;
      if (!inb(xx, yy) || b[yy][xx] !== EMPTY) continue;
      b[yy][xx] = BLACK; const ok = isStraightFour(b, x, y, dx, dy); b[yy][xx] = EMPTY;
      if (ok) return true;
    }
    return false;
  }
  function isForbidden(b, x, y) {
    if (b[y][x] !== EMPTY) return false;
    b[y][x] = BLACK;
    let five = false, over = false;
    for (const [dx, dy] of DIRS) { const r = runLen(b, x, y, dx, dy, BLACK); if (r === 5) five = true; else if (r > 5) over = true; }
    let res = false;
    if (!five) {
      if (over) res = true;
      else {
        let fours = 0, threes = 0;
        for (const [dx, dy] of DIRS) {
          if (hasFour(b, x, y, dx, dy)) fours++;
          else if (hasOpenThree(b, x, y, dx, dy)) threes++;
        }
        res = fours >= 2 || threes >= 2;
      }
    }
    b[y][x] = EMPTY;
    return res;
  }
  const renjuOn = () => opt.rule === 'renju';
  const blocked = (b, x, y, c) => renjuOn() && c === BLACK && isForbidden(b, x, y);
 
  // ===== AI 평가 =====
  const PATS = [
    ['five', ['xxxxx']],
    ['open4', ['_xxxx_']],
    ['four', ['xxxx_', '_xxxx', 'xxx_x', 'x_xxx', 'xx_xx']],
    ['open3', ['_xxx__', '__xxx_', '_xx_x_', '_x_xx_']],
    ['three', ['xxx__', '__xxx', 'xx_x_', '_x_xx', 'x_xx_', '_xx_x', 'x__xx', 'xx__x', 'x_x_x', '_xxx_']],
    ['open2', ['__xx__', '_x_x_', '_x__x_', '__xx_', '_xx__']]
  ];
  const SCORE = { five: 1e7, open4: 2e5, four: 1.2e4, open3: 4e3, three: 600, open2: 250, two: 60, one: 10 };
 
  function lineStr(b, x, y, dx, dy, c) {
    let s = '';
    for (let k = -5; k <= 5; k++) {
      if (k === 0) { s += 'x'; continue; }
      const xx = x + dx * k, yy = y + dy * k;
      if (!inb(xx, yy)) { s += 'o'; continue; }
      const v = b[yy][xx];
      s += v === EMPTY ? '_' : v === c ? 'x' : 'o';
    }
    return s;
  }
  function covers(s, p) {
    let i = s.indexOf(p);
    while (i !== -1) { if (i <= 5 && i + p.length - 1 >= 5) return true; i = s.indexOf(p, i + 1); }
    return false;
  }
  function shapeOf(s) {
    for (const [name, list] of PATS) for (const p of list) if (covers(s, p)) return name;
    let best = 0;                                  // 막히지 않은 5칸 창에서 내 돌 수
    for (let st = 1; st <= 5; st++) {
      const w = s.substr(st, 5);
      if (w.indexOf('o') !== -1) continue;
      let m = 0; for (const ch of w) if (ch === 'x') m++;
      if (m > best) best = m;
    }
    return best >= 2 ? 'two' : best === 1 ? 'one' : '';
  }
  // c색이 (x,y)에 두었을 때의 가치
  function evalPoint(b, x, y, c) {
    if (blocked(b, x, y, c)) return -1;
    let sum = 0, fours = 0, threes = 0;
    for (const [dx, dy] of DIRS) {
      const sh = shapeOf(lineStr(b, x, y, dx, dy, c));
      if (!sh) continue;
      if (sh === 'five' && renjuOn() && c === BLACK) {           // 흑 장목은 승리가 아님
        b[y][x] = BLACK; const r = runLen(b, x, y, dx, dy, BLACK); b[y][x] = EMPTY;
        if (r !== 5) continue;
      }
      sum += SCORE[sh];
      if (sh === 'four' || sh === 'open4') fours++;
      if (sh === 'open3') threes++;
    }
    if (fours >= 2) sum += 1.5e5;
    else if (fours && threes) sum += 1e5;
    else if (threes >= 2) sum += 3e4;
    return sum;
  }
  function candidates(b) {
    const out = [];
    let any = false;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (b[y][x] !== EMPTY) { any = true; continue; }
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (inb(xx, yy) && b[yy][xx] !== EMPTY) { near = true; break; }
      }
      if (near) out.push([x, y]);
    }
    if (!any) return [[7, 7]];
    return out;
  }
  function scoreMoves(b, c, defW) {
    const o = 3 - c, list = [];
    for (const [x, y] of candidates(b)) {
      const atk = evalPoint(b, x, y, c);
      if (atk < 0) continue;                                    // 금수
      const def = Math.max(0, evalPoint(b, x, y, o));
      const center = 7 - Math.max(Math.abs(x - 7), Math.abs(y - 7));
      list.push({ x, y, atk, def, s: atk + def * defW + center });
    }
    list.sort((a, b2) => b2.s - a.s);
    return list;
  }
  // (x,y)를 지나는 줄 위에서 c가 두면 이기는 빈칸들
  function fiveSpotsNear(b, x, y, c) {
    const out = [];
    const renju = renjuOn();
    for (const [dx, dy] of DIRS) {
      for (let k = -4; k <= 4; k++) {
        if (!k) continue;
        const xx = x + dx * k, yy = y + dy * k;
        if (!inb(xx, yy) || b[yy][xx] !== EMPTY) continue;
        b[yy][xx] = c;
        const r = runLen(b, xx, yy, dx, dy, c);
        b[yy][xx] = EMPTY;
        if (renju && c === BLACK ? r === 5 : r >= 5) {
          if (!out.some(p => p[0] === xx && p[1] === yy)) out.push([xx, yy]);
        }
      }
    }
    return out;
  }
  function anyFive(b, c) {
    for (const [x, y] of candidates(b)) {
      if (b[y][x] !== EMPTY) continue;
      b[y][x] = c; const w = winRun(b, x, y, c, renjuOn()); b[y][x] = EMPTY;
      if (w) return [x, y];
    }
    return null;
  }
  // 연속으로 4를 만들어 상대가 막을 수밖에 없게 하며 이기는 수순(VCF) 찾기 → 첫 수 반환
  function findVCF(b, c, depth) {
    let nodes = 0;
    const o = 3 - c;
    function search(d) {
      if (++nodes > 2500 || d <= 0) return null;
      if (anyFive(b, o)) return null;                         // 상대가 먼저 이길 수 있으면 실패
      for (const [x, y] of candidates(b)) {
        if (b[y][x] !== EMPTY) continue;
        if (renjuOn() && c === BLACK && isForbidden(b, x, y)) continue;
        b[y][x] = c;
        if (winRun(b, x, y, c, renjuOn())) { b[y][x] = EMPTY; return [x, y]; }
        const spots = fiveSpotsNear(b, x, y, c);
        let ok = false;
        if (spots.length >= 2) ok = true;                      // 막을 곳이 둘 → 승리
        else if (spots.length === 1) {
          const [bx, by] = spots[0];
          b[by][bx] = o;
          const oppWin = winRun(b, bx, by, o, renjuOn());
          if (!oppWin && search(d - 1)) ok = true;
          b[by][bx] = EMPTY;
        }
        b[y][x] = EMPTY;
        if (ok) return [x, y];
      }
      return null;
    }
    return search(depth);
  }
 
  function bestMove(c, level) {
    const b = board;
    const list = scoreMoves(b, c, level === 'easy' ? 0.55 : 0.9);
    if (!list.length) return null;
    if (level === 'easy') {
      const win = list.find(m => m.atk >= 1e7);
      if (win && Math.random() < 0.7) return win;
      const block = list.find(m => m.def >= 1e7);
      if (block && Math.random() < 0.75) return block;
      const top = list.slice(0, Math.random() < 0.35 ? 6 : 3);
      return top[Math.floor(Math.random() * top.length)];
    }
    if (level === 'normal') {
      if (list[0].atk < 1e7 && list[0].def < 1e7) {
        const v = findVCF(b, c, 4);
        if (v) return { x: v[0], y: v[1] };
      }
      const best = list[0].s;
      const near = list.filter(m => m.s >= best * 0.97);
      return near[Math.floor(Math.random() * near.length)];
    }
    // 어려움: 바로 이기기 → 바로 막기 → 연속 4로 이기는 길(VCF) → 한 수 앞 내다보기
    if (list[0].atk >= 1e7) return list[0];
    if (list[0].def >= 1e7) return list[0];
    const o = 3 - c;
    const vcf = findVCF(b, c, 12);
    if (vcf) return list.find(m => m.x === vcf[0] && m.y === vcf[1]) || { x: vcf[0], y: vcf[1] };
    const oppVcf = findVCF(b, o, 10);
    let best = null, bestV = -Infinity;
    for (const m of list.slice(0, 10)) {
      b[m.y][m.x] = c;
      const reply = scoreMoves(b, o, 0.9);
      const oppWins = oppVcf ? !!findVCF(b, o, 10) : false;   // 이 수를 둬도 상대 연속 4가 남는가
      b[m.y][m.x] = EMPTY;
      const r = reply.length ? reply[0] : null;
      let v = m.s;
      if (oppWins) v -= 3e7;
      if (r) {
        if (r.atk >= 1e7) v -= 5e7;                             // 상대가 바로 이기는 수는 피함
        v -= r.s * 0.6;
      }
      v += Math.random() * 5;
      if (v > bestV) { bestV = v; best = m; }
    }
    return best;
  }
 
  // ===== 화면 배치 =====
  function layout() {
    const rect = stage.getBoundingClientRect();
    L.w = Math.max(1, rect.width); L.h = Math.max(1, rect.height);
    L.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(L.w * L.dpr);
    canvas.height = Math.round(L.h * L.dpr);
    const pad = 10;
    L.size = Math.floor(Math.min(L.w, L.h) - pad * 2);
    L.cell = L.size / N;
    L.ox = (L.w - L.size) / 2;
    L.oy = (L.h - L.size) / 2;
  }
  const px = i => L.ox + (i + 0.5) * L.cell;
  const py = i => L.oy + (i + 0.5) * L.cell;
  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const gx = Math.round((e.clientX - r.left - L.ox) / L.cell - 0.5);
    const gy = Math.round((e.clientY - r.top - L.oy) / L.cell - 0.5);
    return inb(gx, gy) ? { x: gx, y: gy } : null;
  }
 
  // ===== 진행 =====
  const isAIturn = () => opt.mode === 'ai' && turn !== humanColor;
  const canHuman = () => state === 'playing' && !aiThinking && !isAIturn();
 
  function toast(msg, ms = 1500) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
  }
 
  function startGame() {
    ensureAudio();
    clearTimeout(aiTimer);
    board = newBoard(); moves = []; turn = BLACK;
    humanColor = opt.first === 'ai' ? WHITE : opt.first === 'random' ? (Math.random() < 0.5 ? BLACK : WHITE) : BLACK;
    undoLeft = UNDO_MAX; hintLeft = HINT_MAX;
    hover = pending = hint = winLine = placeAnim = null;
    aiThinking = false;
    state = 'playing';
    el.menu.classList.remove('show'); el.result.classList.remove('show'); el.confirm.classList.remove('show');
    if (opt.mode === 'ai') toast(humanColor === BLACK ? '내가 흑돌, 먼저 둬요!' : 'AI가 흑돌, 먼저 둬요!');
    refreshForbid();
    updateHud();
    if (isAIturn()) scheduleAI();
  }
 
  function place(x, y) {
    const c = turn;
    board[y][x] = c;
    moves.push({ x, y, c });
    placeAnim = { x, y, t: 0 };
    hover = pending = hint = null;
    sfx.tok(c);
    const w = winRun(board, x, y, c, renjuOn());
    if (w) { winLine = w; endGame(c); return; }
    if (moves.length >= N * N) { endGame(0); return; }
    turn = 3 - c;
    refreshForbid();
    updateHud();
    if (isAIturn()) scheduleAI();
  }
 
  function tryHuman(x, y) {
    if (!canHuman()) return;
    if (board[y][x] !== EMPTY) return;
    if (renjuOn() && turn === BLACK && isForbidden(board, x, y)) {
      sfx.bad(); toast('흑돌은 여기에 둘 수 없어요 (금수)'); pending = null; return;
    }
    place(x, y);
  }
 
  function scheduleAI() {
    aiThinking = true;
    updateHud();
    const delay = 350 + Math.random() * 400;
    aiTimer = setTimeout(() => {
      if (state !== 'playing') { aiThinking = false; return; }
      const m = bestMove(turn, opt.level);
      aiThinking = false;
      if (!m) { endGame(0); return; }
      place(m.x, m.y);
    }, delay);
  }
 
  function refreshForbid() {
    forbidSet = new Set();
    if (!renjuOn() || turn !== BLACK || state !== 'playing' || isAIturn()) return;
    for (const [x, y] of candidates(board)) if (isForbidden(board, x, y)) forbidSet.add(y * N + x);
  }
 
  function undo() {
    if (!canHuman() || !moves.length) return;
    if (opt.mode === 'ai') {
      if (undoLeft <= 0) return;
      if (!moves.some(m => m.c === humanColor)) return;
      // 내 마지막 수까지 되돌림 (AI 수 + 내 수)
      while (moves.length) {
        const m = moves.pop(); board[m.y][m.x] = EMPTY;
        if (m.c === humanColor) break;
      }
      undoLeft--;
    } else {
      const m = moves.pop(); board[m.y][m.x] = EMPTY;
    }
    scheduleTurnFromMoves();
    sfx.undo();
  }
  function scheduleTurnFromMoves() {
    turn = moves.length ? 3 - moves[moves.length - 1].c : BLACK;
    hover = pending = hint = placeAnim = null;
    refreshForbid();
    updateHud();
    if (isAIturn()) scheduleAI();
  }
 
  function useHint() {
    if (!canHuman() || hintLeft <= 0) return;
    const m = bestMove(turn, 'normal');
    if (!m) return;
    hint = { x: m.x, y: m.y, t: 0 };
    hintLeft--;
    sfx.hint();
    updateHud();
  }
 
  function endGame(winner) {
    state = 'over';
    clearTimeout(aiTimer); aiThinking = false;
    forbidSet = new Set();
    let outcome = '';
    if (opt.mode === 'ai') {
      outcome = winner === 0 ? 'd' : winner === humanColor ? 'w' : 'l';
      const r = rec[opt.level] || { w: 0, l: 0, d: 0 };
      r[outcome]++;
      rec[opt.level] = r;
      store.set(KEY_REC, JSON.stringify(rec));
    }
    updateHud();
    if (winner === 0) sfx.draw();
    else if (opt.mode === 'ai' && winner !== humanColor) sfx.lose();
    else sfx.win();
    setTimeout(() => showResult(winner, outcome), 1300);
  }
 
  function showResult(winner, outcome) {
    const total = moves.length;
    let emoji, title, msg, info = `총 <b>${total}</b>수`;
    if (opt.mode === 'ai') {
      if (outcome === 'w') { emoji = '🎉'; title = '이겼어요!'; msg = `AI(${LEVEL_NAME[opt.level]})를 꺾었어요!`; }
      else if (outcome === 'l') { emoji = '😢'; title = '아쉽게 졌어요'; msg = '한 판 더 하면 이길 수 있어요!'; }
      else { emoji = '🤝'; title = '무승부'; msg = '판이 꽉 찼어요. 막상막하!'; }
      const r = rec[opt.level];
      info += `<br>${LEVEL_NAME[opt.level]} 전적: <b>${r.w}승 ${r.l}패 ${r.d}무</b>`;
    } else {
      if (winner === 0) { emoji = '🤝'; title = '무승부'; msg = '판이 꽉 찼어요!'; }
      else { emoji = '🏆'; title = (winner === BLACK ? '⚫ 흑돌' : '⚪ 백돌') + ' 승리!'; msg = '멋진 한 판이었어요!'; }
    }
    $('resEmoji').textContent = emoji;
    $('resTitle').textContent = title;
    $('resMsg').textContent = msg;
    $('resInfo').innerHTML = info;
    el.result.classList.add('show');
  }
 
  function showMenu() {
    clearTimeout(aiTimer); aiThinking = false;
    state = 'menu';
    el.result.classList.remove('show'); el.confirm.classList.remove('show');
    syncMenu();
    el.menu.classList.add('show');
    updateHud();
  }
 
  // ===== 메뉴 =====
  function syncMenu() {
    document.querySelectorAll('.seg').forEach(seg => {
      const key = seg.dataset.key;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === opt[key]));
    });
    document.querySelectorAll('.aiOnly').forEach(e => e.classList.toggle('hidden', opt.mode !== 'ai'));
    $('renjuInfo').classList.toggle('hidden', opt.rule !== 'renju');
    const r = rec[opt.level] || { w: 0, l: 0, d: 0 };
    el.menuRec.innerHTML = `🏆 ${LEVEL_NAME[opt.level]} 전적: <b>${r.w}승 ${r.l}패 ${r.d}무</b>`;
  }
  document.querySelectorAll('.seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      opt[seg.dataset.key] = b.dataset.v;
      store.set(KEY_OPT, JSON.stringify(opt));
      ensureAudio(); sfx.click();
      syncMenu();
    });
  });
 
  // ===== 상단 정보 =====
  function updateHud() {
    const c = turn;
    el.turnStone.className = c === BLACK ? 'b' : 'w';
    let text = '', dots = false;
    if (state === 'over') {
      text = '게임 끝!';
    } else if (opt.mode === 'ai') {
      if (aiThinking || isAIturn()) { text = 'AI가 생각 중'; dots = true; }
      else text = '내 차례예요';
    } else {
      text = (c === BLACK ? '흑돌' : '백돌') + ' 차례예요';
    }
    el.turnText.textContent = text;
    el.turnText.classList.toggle('dots', dots);
    const ai = opt.mode === 'ai';
    el.undoBadge.textContent = ai ? undoLeft : '∞';
    el.btnUndo.disabled = !canHuman() || !moves.length || (ai && (undoLeft <= 0 || !moves.some(m => m.c === humanColor)));
    el.hintBadge.textContent = hintLeft;
    el.btnHint.disabled = !canHuman() || hintLeft <= 0;
    el.btnSound.textContent = soundOn ? '🔊' : '🔇';
  }
 
  // ===== 입력 =====
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const c = cellAt(e);
    hover = c && canHuman() && board[c.y][c.x] === EMPTY ? c : null;
  });
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover = null; });
  canvas.addEventListener('pointerdown', e => {
    ensureAudio();
    if (!canHuman()) return;
    const c = cellAt(e);
    if (!c || board[c.y][c.x] !== EMPTY) return;
    e.preventDefault();
    if (e.pointerType === 'mouse') { tryHuman(c.x, c.y); return; }
    // 터치: 한 번 누르면 미리보기, 같은 자리를 다시 누르면 착수
    if (pending && pending.x === c.x && pending.y === c.y) { tryHuman(c.x, c.y); return; }
    if (renjuOn() && turn === BLACK && forbidSet.has(c.y * N + c.x)) { sfx.bad(); toast('흑돌은 여기에 둘 수 없어요 (금수)'); return; }
    pending = c;
    sfx.click();
    if (!touchTipShown) { toast('같은 자리를 한 번 더 누르면 놓여요'); touchTipShown = true; }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
 
  // ===== 그리기 =====
  function drawStone(x, y, r, c, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(60,30,0,.28)';
    ctx.beginPath(); ctx.arc(x + r * 0.12, y + r * 0.16, r, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    if (c === BLACK) { g.addColorStop(0, '#7a7a7a'); g.addColorStop(0.55, '#262626'); g.addColorStop(1, '#050505'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#ececec'); g.addColorStop(1, '#c4c4c4'); }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (c === WHITE) { ctx.strokeStyle = 'rgba(120,120,120,.6)'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.fillStyle = c === BLACK ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
 
  function render() {
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);
    const cell = L.cell, S = L.size, m = cell * 0.12;
 
    // 바둑판
    ctx.fillStyle = 'rgba(80,45,10,.25)';
    roundRect(L.ox - m + 4, L.oy - m + 6, S + m * 2, S + m * 2, cell * 0.4); ctx.fill();
    const g = ctx.createLinearGradient(L.ox, L.oy, L.ox + S, L.oy + S);
    g.addColorStop(0, '#f6d38f'); g.addColorStop(1, '#e2ab5a');
    ctx.fillStyle = g;
    roundRect(L.ox - m, L.oy - m, S + m * 2, S + m * 2, cell * 0.4); ctx.fill();
    ctx.strokeStyle = '#a8702f'; ctx.lineWidth = 3; ctx.stroke();
    // 나뭇결
    ctx.strokeStyle = 'rgba(170,110,40,.12)'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const yy = L.oy + S * (i + 0.5) / 9;
      ctx.beginPath(); ctx.moveTo(L.ox, yy);
      ctx.bezierCurveTo(L.ox + S * 0.3, yy - cell * 0.4, L.ox + S * 0.7, yy + cell * 0.4, L.ox + S, yy); ctx.stroke();
    }
    // 격자
    ctx.strokeStyle = 'rgba(90,55,20,.85)'; ctx.lineWidth = Math.max(1, cell * 0.04);
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      ctx.moveTo(px(0), py(i)); ctx.lineTo(px(N - 1), py(i));
      ctx.moveTo(px(i), py(0)); ctx.lineTo(px(i), py(N - 1));
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(90,55,20,.95)';
    for (const [sx, sy] of [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]) {
      ctx.beginPath(); ctx.arc(px(sx), py(sy), cell * 0.1, 0, Math.PI * 2); ctx.fill();
    }
 
    const r = cell * 0.45;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 8);
 
    // 금수 표시
    if (forbidSet.size && canHuman()) {
      ctx.strokeStyle = 'rgba(220,50,50,.75)'; ctx.lineWidth = Math.max(2, cell * 0.08); ctx.lineCap = 'round';
      const d = cell * 0.17;
      for (const k of forbidSet) {
        const x = px(k % N), y = py(Math.floor(k / N));
        ctx.beginPath(); ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d); ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d); ctx.stroke();
      }
    }
 
    // 힌트
    if (hint) {
      const x = px(hint.x), y = py(hint.y);
      ctx.fillStyle = `rgba(255,214,40,${0.35 + 0.4 * pulse})`;
      ctx.beginPath(); ctx.arc(x, y, r * 1.15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e6a800'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * (1.05 + 0.15 * pulse), 0, Math.PI * 2); ctx.stroke();
    }
 
    // 돌
    for (const mv of moves) {
      let rr = r;
      if (placeAnim && placeAnim.x === mv.x && placeAnim.y === mv.y) {
        const t = Math.min(1, placeAnim.t / 0.16);
        rr = r * (1.25 - 0.25 * t);
      }
      drawStone(px(mv.x), py(mv.y), rr, mv.c);
    }
 
    // 마지막 수
    if (moves.length) {
      const lm = moves[moves.length - 1];
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath(); ctx.arc(px(lm.x), py(lm.y), r * 0.22, 0, Math.PI * 2); ctx.fill();
    }
 
    // 미리보기
    const pv = pending || hover;
    if (pv && canHuman() && board[pv.y][pv.x] === EMPTY) {
      drawStone(px(pv.x), py(pv.y), r, turn, pending ? 0.6 : 0.45);
      if (pending) {
        ctx.strokeStyle = '#2f7de0'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px(pv.x), py(pv.y), r * 1.12, 0, Math.PI * 2); ctx.stroke();
      }
    }
 
    // 승리 줄
    if (winLine) {
      const [x1, y1, x2, y2] = winLine;
      ctx.strokeStyle = `rgba(255,59,48,${0.6 + 0.4 * pulse})`;
      ctx.lineWidth = Math.max(4, cell * 0.18); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px(x1), py(y1)); ctx.lineTo(px(x2), py(y2)); ctx.stroke();
    }
  }
  function roundRect(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
 
  function loop(t) {
    const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
    lastT = t; clock += dt;
    if (placeAnim) { placeAnim.t += dt; if (placeAnim.t > 0.3) placeAnim = null; }
    if (hint) { hint.t += dt; if (hint.t > 3) hint = null; }
    render();
    requestAnimationFrame(loop);
  }
 
  // ===== 버튼 =====
  $('btnStart').addEventListener('click', startGame);
  $('btnAgain').addEventListener('click', startGame);
  $('btnMenu').addEventListener('click', showMenu);
  el.btnUndo.addEventListener('click', undo);
  el.btnHint.addEventListener('click', useHint);
  el.btnHome.addEventListener('click', () => {
    if (state === 'playing' && moves.length) el.confirm.classList.add('show'); else showMenu();
  });
  $('btnNo').addEventListener('click', () => el.confirm.classList.remove('show'));
  $('btnYes').addEventListener('click', showMenu);
  el.btnSound.addEventListener('click', () => {
    soundOn = !soundOn;
    store.set(KEY_SOUND, soundOn ? '1' : '0');
    ensureAudio();
    if (soundOn) sfx.click();
    updateHud();
  });
 
  let resizeTimer = 0;
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 60); }
  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
 
  // ===== 시작 =====
  board = newBoard();
  layout();
  showMenu();
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(loop); });
 
})();