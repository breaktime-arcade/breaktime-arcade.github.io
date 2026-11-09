/* 사과 게임 (Apple Ten) - 쉬는시간 오락실 */
(() => {
  'use strict';
 
  // ===== 설정 =====
  const ROWS = 10, COLS = 17;          // 데이터 기준 판 크기 (가로 화면 기준)
  const TIME_LIMIT = 120;              // 기본 모드 제한 시간(초)
  const HINTS = 3;                     // 힌트 횟수
  const GRADES = [                     // [최소 점수, 이모지, 등급, 한마디]
    [110, '👑', '사과 장인', '사과밭의 전설이 나타났어요!'],
    [80,  '🧺', '수확왕',   '바구니가 넘칠 만큼 땄어요!'],
    [50,  '🍎', '사과 농부', '어엿한 사과 농부가 됐어요!'],
    [0,   '🌱', '새싹 농부', '몇 판만 해 보면 금방 늘어요!']
  ];
  const KEY_BEST = 'appleTen.best', KEY_SOUND = 'appleTen.sound';
 
  // ===== 저장소 (막혀 있어도 게임은 동작) =====
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }
  };
 
  // ===== 요소 =====
  const $ = id => document.getElementById(id);
  const stage = $('stage'), canvas = $('board'), ctx = canvas.getContext('2d');
  const el = {
    score: $('score'), timer: $('timer'), timerFill: $('timerFill'), timerText: $('timerText'),
    btnHint: $('btnHint'), hintBadge: $('hintBadge'), btnPause: $('btnPause'), btnSound: $('btnSound'),
    cd: $('cdOverlay'), cdText: $('cdText'), pause: $('pauseOverlay'),
    menu: $('menu'), menuBest: $('menuBest'), result: $('result')
  };
 
  // ===== 상태 =====
  let grid = [];                 // grid[r][c], 0 = 빈칸
  let state = 'menu';            // menu | countdown | playing | paused | over
  let mode = 'normal';           // normal | practice
  let score = 0, timeLeft = TIME_LIMIT, hintsLeft = HINTS, hintsUsed = 0;
  let soundOn = store.get(KEY_SOUND, '1') === '1';
  const L = { w: 0, h: 0, dpr: 1, portrait: false, cell: 0, ox: 0, oy: 0, dc: COLS, dr: ROWS };
  let drag = null, shake = null, hint = null;
  let particles = [], texts = [];
  let sprites = [];
  let cdTimers = [];
  let lastT = 0, clock = 0;
 
  // ===== 효과음 (코드로 생성) =====
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
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    pop(n) {
      const base = 500 + Math.min(n, 8) * 45;
      tone(base, 0.12, 'triangle', 0.22, base * 1.8);
      if (n >= 3) tone(base * 1.5, 0.14, 'sine', 0.12, base * 2.4, 0.07);
    },
    fail() { tone(200, 0.16, 'square', 0.05, 130); },
    tick() { tone(1000, 0.05, 'sine', 0.08); },
    hint() { tone(700, 0.1, 'sine', 0.12); tone(1050, 0.16, 'sine', 0.12, 0, 0.1); },
    count() { tone(600, 0.1, 'triangle', 0.15); },
    go() { tone(900, 0.25, 'triangle', 0.18, 1300); },
    end() { [784, 659, 523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.15, 0, i * 0.11)); },
    record() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.16, 0, i * 0.12)); }
  };
 
  // ===== 판 만들기 =====
  // 합 10 짝(1+9, 2+8 …)을 약 70% 섞고, 나머지는 랜덤. 전체 합은 10의 배수로 맞춤.
  function makeGrid() {
    const n = ROWS * COLS, vals = [];
    const pairs = Math.floor(n * 0.35);
    for (let i = 0; i < pairs; i++) { const a = 1 + Math.floor(Math.random() * 9); vals.push(a, 10 - a); }
    while (vals.length < n) vals.push(1 + Math.floor(Math.random() * 9));
    for (let i = vals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [vals[i], vals[j]] = [vals[j], vals[i]];
    }
    let sum = vals.reduce((a, b) => a + b, 0), guard = 0;
    while (sum % 10 !== 0 && guard++ < 1000) {
      const i = Math.floor(Math.random() * n);
      const want = ((vals[i] - (sum % 10)) % 10 + 10) % 10;
      if (want >= 1 && want <= 9) { sum += want - vals[i]; vals[i] = want; }
    }
    grid = [];
    for (let r = 0; r < ROWS; r++) grid.push(vals.slice(r * COLS, (r + 1) * COLS));
  }
 
  // 합 10이 되는 직사각형 찾기 (누적합 사용)
  function findMoves(max) {
    const P = [];
    for (let r = 0; r <= ROWS; r++) P.push(new Array(COLS + 1).fill(0));
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        P[r + 1][c + 1] = grid[r][c] + P[r][c + 1] + P[r + 1][c] - P[r][c];
    const res = [];
    for (let r1 = 0; r1 < ROWS; r1++)
      for (let r2 = r1; r2 < ROWS; r2++)
        for (let c1 = 0; c1 < COLS; c1++)
          for (let c2 = c1; c2 < COLS; c2++) {
            const s = P[r2 + 1][c2 + 1] - P[r1][c2 + 1] - P[r2 + 1][c1] + P[r1][c1];
            if (s > 10) break;
            if (s === 10) { res.push([r1, c1, r2, c2]); if (res.length >= max) return res; }
          }
    return res;
  }
 
  // ===== 화면 배치 =====
  function layout() {
    const rect = stage.getBoundingClientRect();
    L.w = Math.max(1, rect.width); L.h = Math.max(1, rect.height);
    L.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(L.w * L.dpr);
    canvas.height = Math.round(L.h * L.dpr);
    const pad = 12;
    const cellLand = Math.floor(Math.min((L.w - pad * 2) / COLS, (L.h - pad * 2) / ROWS));
    const cellPort = Math.floor(Math.min((L.w - pad * 2) / ROWS, (L.h - pad * 2) / COLS));
    L.portrait = cellPort > cellLand;               // 사과가 더 크게 보이는 방향 선택
    L.cell = Math.max(10, L.portrait ? cellPort : cellLand);
    L.dc = L.portrait ? ROWS : COLS;
    L.dr = L.portrait ? COLS : ROWS;
    L.ox = (L.w - L.cell * L.dc) / 2;
    L.oy = (L.h - L.cell * L.dr) / 2;
    drag = null;
    buildSprites();
  }
  // 데이터 칸 → 화면 중심 좌표 (세로 화면이면 행/열을 뒤바꿔 표시)
  function cellXY(r, c) {
    const x = L.portrait ? r : c, y = L.portrait ? c : r;
    return [L.ox + (x + 0.5) * L.cell, L.oy + (y + 0.5) * L.cell];
  }
 
  // ===== 사과 그림 (미리 그려두기) =====
  function buildSprites() {
    const s = Math.max(12, Math.round(L.cell * L.dpr));
    sprites = [];
    for (let v = 1; v <= 9; v++) {
      const oc = document.createElement('canvas');
      oc.width = oc.height = s;
      drawApple(oc.getContext('2d'), s, v);
      sprites[v] = oc;
    }
  }
  function drawApple(g, s, v) {
    const cx = s * 0.5, cy = s * 0.57, rx = s * 0.41, ry = s * 0.37;
    // 그림자
    g.fillStyle = 'rgba(80,40,10,.18)';
    g.beginPath(); g.ellipse(cx, cy + ry * 0.92, rx * 0.72, ry * 0.16, 0, 0, Math.PI * 2); g.fill();
    // 몸통
    const grd = g.createRadialGradient(cx - rx * 0.35, cy - ry * 0.45, s * 0.03, cx, cy, rx * 1.15);
    grd.addColorStop(0, '#ff9b8f'); grd.addColorStop(0.5, '#e8413c'); grd.addColorStop(1, '#ad2228');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(cx, cy - ry * 0.72);
    g.bezierCurveTo(cx + rx * 0.5, cy - ry * 1.15, cx + rx * 1.1, cy - ry * 0.6, cx + rx, cy + ry * 0.05);
    g.bezierCurveTo(cx + rx * 0.95, cy + ry * 0.75, cx + rx * 0.45, cy + ry * 1.0, cx, cy + ry * 0.88);
    g.bezierCurveTo(cx - rx * 0.45, cy + ry * 1.0, cx - rx * 0.95, cy + ry * 0.75, cx - rx, cy + ry * 0.05);
    g.bezierCurveTo(cx - rx * 1.1, cy - ry * 0.6, cx - rx * 0.5, cy - ry * 1.15, cx, cy - ry * 0.72);
    g.closePath(); g.fill();
    g.lineWidth = s * 0.03; g.strokeStyle = '#8f1c22'; g.stroke();
    // 반짝임
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.ellipse(cx - rx * 0.5, cy - ry * 0.32, rx * 0.13, ry * 0.24, -0.5, 0, Math.PI * 2); g.fill();
    // 꼭지
    g.strokeStyle = '#6b3f1d'; g.lineWidth = s * 0.055; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy - ry * 0.62);
    g.quadraticCurveTo(cx + s * 0.01, cy - ry * 0.95, cx + s * 0.06, cy - ry * 1.15); g.stroke();
    // 잎
    g.save(); g.translate(cx + s * 0.15, cy - ry * 1.02); g.rotate(-0.45);
    g.fillStyle = '#56b35c'; g.beginPath(); g.ellipse(0, 0, s * 0.11, s * 0.05, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2f7d37'; g.lineWidth = s * 0.012;
    g.beginPath(); g.moveTo(-s * 0.09, 0); g.lineTo(s * 0.09, 0); g.stroke();
    g.restore();
    // 숫자
    g.font = `${Math.round(s * 0.46)}px Jua, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = s * 0.08; g.strokeStyle = '#8f1c22';
    g.strokeText(String(v), cx, cy + ry * 0.14);
    g.fillStyle = '#fff'; g.fillText(String(v), cx, cy + ry * 0.14);
  }
 
  // ===== 선택 영역 =====
  function getSelection() {
    if (!drag) return null;
    const x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1);
    const y0 = Math.min(drag.y0, drag.y1), y1 = Math.max(drag.y0, drag.y1);
    const cells = []; let sum = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (!grid[r][c]) continue;
        const [cx, cy] = cellXY(r, c);
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) { cells.push([r, c]); sum += grid[r][c]; }
      }
    return { x0, y0, x1, y1, cells, sum };
  }
 
  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('pointerdown', e => {
    if (state !== 'playing' || drag) return;
    ensureAudio();
    const p = pointerPos(e);
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pointerPos(e);
    drag.x1 = p.x; drag.y1 = p.y;
    e.preventDefault();
  });
  canvas.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pointerPos(e);
    drag.x1 = p.x; drag.y1 = p.y;
    finishDrag();
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
 
  function finishDrag() {
    const sel = getSelection();
    drag = null;
    if (!sel || state !== 'playing' || sel.cells.length === 0) return;
    if (sel.sum === 10) {
      harvest(sel);
    } else {
      shake = { x0: sel.x0, y0: sel.y0, x1: sel.x1, y1: sel.y1, t: 0 };
      sfx.fail();
    }
  }
 
  function harvest(sel) {
    const n = sel.cells.length;
    for (const [r, c] of sel.cells) {
      const [x, y] = cellXY(r, c);
      particles.push({
        v: grid[r][c], x, y,
        vx: (Math.random() - 0.5) * L.cell * 9,
        vy: -L.cell * (7 + Math.random() * 5),
        rot: 0, vr: (Math.random() - 0.5) * 10, life: 1
      });
      grid[r][c] = 0;
    }
    score += n;
    texts.push({ x: (sel.x0 + sel.x1) / 2, y: (sel.y0 + sel.y1) / 2, txt: '+' + n, life: 1, big: n >= 4 });
    sfx.pop(n);
    updateHud();
    el.score.parentElement.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
      { duration: 220 }
    );
    if (findMoves(1).length === 0) endGame('nomove');
  }
 
  // ===== 힌트 =====
  function useHint() {
    if (state !== 'playing' || hintsLeft <= 0) return;
    ensureAudio();
    const moves = findMoves(4000);
    if (!moves.length) { endGame('nomove'); return; }
    let minA = Infinity;
    for (const m of moves) minA = Math.min(minA, (m[2] - m[0] + 1) * (m[3] - m[1] + 1));
    const small = moves.filter(m => (m[2] - m[0] + 1) * (m[3] - m[1] + 1) === minA);
    const [r1, c1, r2, c2] = small[Math.floor(Math.random() * small.length)];
    const cells = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (grid[r][c]) cells.push(r * COLS + c);
    hint = { set: new Set(cells), t: 0 };
    hintsLeft--; hintsUsed++;
    sfx.hint();
    updateHud();
  }
 
  // ===== 게임 흐름 =====
  function clearCountdown() { cdTimers.forEach(clearTimeout); cdTimers = []; }
 
  function startGame(m) {
    ensureAudio();
    clearCountdown();
    mode = m;
    makeGrid();
    score = 0; timeLeft = TIME_LIMIT; hintsLeft = HINTS; hintsUsed = 0;
    particles = []; texts = []; hint = null; drag = null; shake = null;
    el.menu.classList.remove('show');
    el.result.classList.remove('show');
    el.pause.classList.remove('show');
    updateHud();
    state = 'countdown';
    el.cd.classList.add('show');
    const steps = ['3', '2', '1', '시작!'];
    steps.forEach((s, i) => {
      cdTimers.push(setTimeout(() => {
        el.cdText.textContent = s;
        el.cdText.style.animation = 'none'; void el.cdText.offsetWidth; el.cdText.style.animation = '';
        if (i < 3) sfx.count(); else sfx.go();
      }, i * 650));
    });
    cdTimers.push(setTimeout(() => {
      el.cd.classList.remove('show');
      state = 'playing';
      updateHud();
    }, steps.length * 650));
  }
 
  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused'; drag = null;
    el.pause.classList.add('show');
    updateHud();
  }
  function resumeGame() {
    if (state !== 'paused') return;
    el.pause.classList.remove('show');
    state = 'playing';
    updateHud();
  }
 
  function endGame(reason) {
    if (state !== 'playing') return;
    state = 'over'; drag = null;
    updateHud();
    setTimeout(() => showResult(reason), 750);
  }
 
  function showResult(reason) {
    const normal = mode === 'normal';
    let best = parseInt(store.get(KEY_BEST, '0'), 10) || 0;
    let newRec = false;
    if (normal && score > best) { best = score; store.set(KEY_BEST, String(best)); newRec = score > 0; }
    const g = GRADES.find(x => score >= x[0]);
    $('resReason').textContent = reason === 'time' ? '⏰ 시간 끝!' :
      (normal ? '🍂 더 이상 묶을 사과가 없어요!' : '🍂 사과를 다 땄어요! 연습 끝!');
    $('resEmoji').textContent = g[1];
    $('resGrade').textContent = g[2];
    $('resMsg').textContent = g[3];
    $('resScore').textContent = score;
    $('resBest').textContent = best;
    $('resBestBox').classList.toggle('hidden', !normal);
    $('resNew').classList.toggle('hidden', !newRec);
    $('resNote').textContent = (normal ? '' : '연습 모드 기록은 저장되지 않아요. ') +
      (hintsUsed ? `💡 힌트 ${hintsUsed}번 사용` : '');
    el.result.classList.add('show');
    if (newRec) sfx.record(); else sfx.end();
  }
 
  function showMenu() {
    clearCountdown();
    state = 'menu'; drag = null;
    el.cd.classList.remove('show');
    el.pause.classList.remove('show');
    el.result.classList.remove('show');
    el.menuBest.textContent = parseInt(store.get(KEY_BEST, '0'), 10) || 0;
    el.menu.classList.add('show');
    updateHud();
  }
 
  // ===== 상단 정보 =====
  function updateHud() {
    el.score.textContent = score;
    el.hintBadge.textContent = hintsLeft;
    el.btnHint.disabled = state !== 'playing' || hintsLeft <= 0;
    el.btnPause.disabled = state !== 'playing';
    el.btnSound.textContent = soundOn ? '🔊' : '🔇';
    updateTimer();
  }
  function updateTimer() {
    if (mode === 'practice') {
      el.timer.className = 'practice';
      el.timerFill.style.width = '100%';
      el.timerText.textContent = '연습 중 ∞';
      return;
    }
    const t = Math.max(0, timeLeft);
    el.timerFill.style.width = (t / TIME_LIMIT * 100) + '%';
    const sec = Math.ceil(t);
    el.timerText.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    el.timer.className = (t <= 10 && state === 'playing') ? 'danger' : '';
  }
 
  // ===== 그리기 =====
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
 
  function render() {
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);
    const cell = L.cell, bw = cell * L.dc, bh = cell * L.dr;
    const m = Math.max(5, cell * 0.18);
 
    // 나무 상자
    roundRect(L.ox - m, L.oy - m, bw + m * 2, bh + m * 2, m * 1.4);
    ctx.fillStyle = '#c98f52'; ctx.fill();
    roundRect(L.ox - m * 0.5, L.oy - m * 0.5, bw + m, bh + m, m);
    ctx.fillStyle = '#f3dba8'; ctx.fill();
    ctx.strokeStyle = 'rgba(160,110,60,.18)'; ctx.lineWidth = 1;
    for (let i = 1; i < L.dr; i++) {
      const y = L.oy + i * cell;
      ctx.beginPath(); ctx.moveTo(L.ox, y); ctx.lineTo(L.ox + bw, y); ctx.stroke();
    }
 
    const hideApples = state === 'countdown' || state === 'paused';
    const sel = getSelection();
    const selSet = new Set(sel ? sel.cells.map(([r, c]) => r * COLS + c) : []);
    const pulse = 0.5 + 0.5 * Math.sin(clock * 10);
 
    if (!hideApples) {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const v = grid[r] ? grid[r][c] : 0;
          const [x, y] = cellXY(r, c);
          if (!v) {
            ctx.fillStyle = 'rgba(150,100,50,.13)';
            ctx.beginPath(); ctx.arc(x, y, cell * 0.12, 0, Math.PI * 2); ctx.fill();
            continue;
          }
          const key = r * COLS + c;
          const isSel = selSet.has(key);
          const isHint = hint && hint.set.has(key);
          if (isHint) {
            ctx.fillStyle = `rgba(255,214,40,${0.35 + 0.45 * pulse})`;
            ctx.beginPath(); ctx.arc(x, y, cell * 0.52, 0, Math.PI * 2); ctx.fill();
          }
          if (isSel) {
            ctx.fillStyle = 'rgba(255,248,170,.95)';
            ctx.beginPath(); ctx.arc(x, y, cell * 0.5, 0, Math.PI * 2); ctx.fill();
          }
          const s = isSel ? 1.1 : 1;
          ctx.drawImage(sprites[v], x - cell * s / 2, y - cell * s / 2, cell * s, cell * s);
        }
    }
 
    // 드래그 네모 + 합계 말풍선
    if (sel && state === 'playing') {
      const w = sel.x1 - sel.x0, h = sel.y1 - sel.y0;
      const ok = sel.sum === 10, over = sel.sum > 10;
      ctx.fillStyle = ok ? 'rgba(80,200,100,.22)' : over ? 'rgba(232,65,60,.16)' : 'rgba(80,140,230,.14)';
      ctx.strokeStyle = ok ? '#2c9a45' : over ? '#d33' : '#3a78d8';
      ctx.lineWidth = 3;
      ctx.setLineDash(ok ? [] : [8, 5]);
      roundRect(sel.x0, sel.y0, w, h, 8); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      if (sel.cells.length) {
        const label = ok ? '10 ✔' : String(sel.sum);
        const fs = Math.max(16, Math.min(26, cell * 0.55));
        ctx.font = `${fs}px Jua, sans-serif`;
        const tw = ctx.measureText(label).width + fs;
        let bx = drag.x1 + 12, by = drag.y1 - fs * 1.9;
        bx = Math.min(Math.max(4, bx), L.w - tw - 4);
        by = Math.max(4, by);
        roundRect(bx, by, tw, fs * 1.5, fs * 0.6);
        ctx.fillStyle = ok ? '#2c9a45' : over ? '#d33' : '#fff';
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
        ctx.fillStyle = (ok || over) ? '#fff' : '#4a2e1e';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + tw / 2, by + fs * 0.78);
      }
    }
 
    // 틀렸을 때 흔들리는 네모
    if (shake) {
      const k = 1 - shake.t / 0.35;
      const off = Math.sin(shake.t * 70) * 6 * k;
      ctx.strokeStyle = `rgba(220,50,50,${k})`; ctx.lineWidth = 3;
      roundRect(shake.x0 + off, shake.y0, shake.x1 - shake.x0, shake.y1 - shake.y0, 8); ctx.stroke();
    }
 
    // 날아가는 사과
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      const s = cell * (0.8 + 0.4 * (1 - p.life));
      ctx.drawImage(sprites[p.v], -s / 2, -s / 2, s, s);
      ctx.restore();
    }
 
    // +점수 글자
    for (const t of texts) {
      const fs = Math.max(20, cell * (t.big ? 0.95 : 0.7));
      ctx.font = `${fs}px Jua, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life * 1.6));
      const y = t.y - (1 - t.life) * cell * 1.6;
      ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
      ctx.strokeText(t.txt, t.x, y);
      ctx.fillStyle = t.big ? '#ff7a00' : '#2c9a45';
      ctx.fillText(t.txt, t.x, y);
      ctx.globalAlpha = 1;
    }
  }
 
  // ===== 루프 =====
  function update(dt) {
    clock += dt;
    if (state === 'playing' && mode === 'normal') {
      const prev = Math.ceil(timeLeft);
      timeLeft -= dt;
      const now = Math.ceil(timeLeft);
      if (now < prev && now <= 10 && now > 0) sfx.tick();
      if (timeLeft <= 0) { timeLeft = 0; endGame('time'); }
      updateTimer();
    }
    if (shake) { shake.t += dt; if (shake.t > 0.35) shake = null; }
    if (hint) { hint.t += dt; if (hint.t > 2.2) hint = null; }
    const grav = L.cell * 32;
    for (const p of particles) {
      p.vy += grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt * 1.1;
    }
    particles = particles.filter(p => p.life > 0 && p.y < L.h + L.cell * 2);
    for (const t of texts) t.life -= dt * 1.1;
    texts = texts.filter(t => t.life > 0);
  }
  function loop(t) {
    const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
    lastT = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
 
  // ===== 버튼 =====
  $('btnNormal').addEventListener('click', () => startGame('normal'));
  $('btnPractice').addEventListener('click', () => startGame('practice'));
  $('btnAgain').addEventListener('click', () => startGame(mode));
  $('btnHome').addEventListener('click', showMenu);
  $('btnResume').addEventListener('click', resumeGame);
  $('btnRestart').addEventListener('click', () => startGame(mode));
  $('btnToMenu').addEventListener('click', showMenu);
  el.btnHint.addEventListener('click', useHint);
  el.btnPause.addEventListener('click', pauseGame);
  el.btnSound.addEventListener('click', () => {
    soundOn = !soundOn;
    store.set(KEY_SOUND, soundOn ? '1' : '0');
    ensureAudio();
    if (soundOn) sfx.count();
    updateHud();
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame();
    } else if ((e.key === 'h' || e.key === 'H') && state === 'playing') useHint();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('blur', () => { if (state === 'playing' && drag) drag = null; });
 
  let resizeTimer = 0;
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 60); }
  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
 
  // ===== 시작 =====
  makeGrid();               // 메뉴 뒤에 보일 사과판
  layout();
  showMenu();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('40px Jua').then(() => buildSprites()).catch(() => {});
  }
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(loop); });
})();
