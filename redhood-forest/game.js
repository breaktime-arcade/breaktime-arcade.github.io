// 빨간망토 숲길 퍼즐 — game.js
(() => {
  'use strict';

  // ===== 기본 데이터 =====
  const N = 1, E = 2, S = 4, W = 8, H = 16; // H = 나무 구멍
  const LIB = {
    straight: [W | E, W | E], bendS: [W | E, W | S], bendN: [W | E, W | N], uturn: [E | S, W | S],
    scurve: [N | E, W | S], zcurve: [S | E, W | N], parallel: [N | S, N | S],
    holeLine: [H, N | S], holeTurnN: [H, N | E], holeTurnS: [H, S | E]
  };
  const LEVELS = [{"mode":"day","start":{"side":"T","i":0},"house":{"side":"R","i":2},"trees":[],"flowers":[],"wolf":null,"pieces":["bendN","scurve","holeLine"],"solution":[{"rot":1,"r":1,"c":1},{"rot":0,"r":0,"c":0},{"rot":1,"r":1,"c":2}]},{"mode":"day","start":{"side":"T","i":1},"house":{"side":"B","i":1},"trees":[0],"flowers":[],"wolf":null,"pieces":["holeTurnS","uturn","bendN"],"solution":[{"rot":0,"r":2,"c":0},{"rot":1,"r":1,"c":2},{"rot":1,"r":0,"c":1}]},{"mode":"day","start":{"side":"L","i":1},"house":{"side":"R","i":2},"trees":[0],"flowers":[],"wolf":null,"pieces":["uturn","zcurve","holeTurnN","holeTurnS"],"solution":[{"rot":2,"r":2,"c":0},{"rot":1,"r":1,"c":2},{"rot":1,"r":0,"c":1},{"rot":1,"r":0,"c":0}]},{"mode":"day","start":{"side":"R","i":1},"house":{"side":"L","i":2},"trees":[3],"flowers":[],"wolf":null,"pieces":["bendS","uturn","holeTurnS","holeLine"],"solution":[{"rot":1,"r":1,"c":1},{"rot":0,"r":0,"c":1},{"rot":3,"r":1,"c":2},{"rot":1,"r":1,"c":0}]},{"mode":"flower","start":{"side":"T","i":1},"house":{"side":"L","i":1},"trees":[7],"flowers":[3],"wolf":null,"pieces":["holeTurnN","uturn","straight"],"solution":[{"rot":0,"r":0,"c":0},{"rot":1,"r":0,"c":2},{"rot":0,"r":1,"c":0}]},{"mode":"flower","start":{"side":"L","i":0},"house":{"side":"T","i":2},"trees":[6],"flowers":[4],"wolf":null,"pieces":["bendN","holeLine","uturn","straight"],"solution":[{"rot":3,"r":0,"c":1},{"rot":3,"r":0,"c":0},{"rot":2,"r":2,"c":1},{"rot":1,"r":0,"c":2}]},{"mode":"flower","start":{"side":"T","i":1},"house":{"side":"B","i":2},"trees":[5],"flowers":[0,7],"wolf":null,"pieces":["zcurve","holeTurnS","parallel","bendS"],"solution":[{"rot":0,"r":0,"c":0},{"rot":1,"r":1,"c":2},{"rot":0,"r":1,"c":0},{"rot":2,"r":2,"c":0}]},{"mode":"flower","start":{"side":"B","i":0},"house":{"side":"T","i":2},"trees":[],"flowers":[8,6],"wolf":null,"pieces":["bendN","scurve","holeTurnN","zcurve"],"solution":[{"rot":0,"r":2,"c":1},{"rot":0,"r":1,"c":1},{"rot":1,"r":1,"c":0},{"rot":0,"r":0,"c":1}]},{"mode":"night","start":{"side":"L","i":2},"house":{"side":"T","i":0},"trees":[1],"flowers":[],"wolf":8,"pieces":["holeLine","bendN","scurve"],"solution":[{"rot":2,"r":0,"c":0},{"rot":0,"r":2,"c":0},{"rot":0,"r":1,"c":0}]},{"mode":"night","start":{"side":"T","i":1},"house":{"side":"L","i":2},"trees":[0],"flowers":[],"wolf":8,"pieces":["scurve","zcurve","holeLine","bendN"],"solution":[{"rot":0,"r":0,"c":1},{"rot":0,"r":1,"c":1},{"rot":1,"r":0,"c":0},{"rot":0,"r":2,"c":0}]},{"mode":"night","start":{"side":"T","i":2},"house":{"side":"L","i":2},"trees":[8],"flowers":[6],"wolf":3,"pieces":["bendS","zcurve","holeTurnS","parallel"],"solution":[{"rot":1,"r":1,"c":1},{"rot":0,"r":0,"c":1},{"rot":3,"r":1,"c":2},{"rot":1,"r":1,"c":0}]},{"mode":"night","start":{"side":"B","i":0},"house":{"side":"R","i":0},"trees":[7],"flowers":[2,5],"wolf":1,"pieces":["parallel","holeTurnN","scurve","holeLine"],"solution":[{"rot":1,"r":0,"c":1},{"rot":1,"r":0,"c":0},{"rot":1,"r":0,"c":2},{"rot":2,"r":2,"c":0}]},{"mode":"day","start":{"side":"B","i":1},"house":{"side":"R","i":0},"trees":[3,0],"flowers":[],"wolf":null,"pieces":["holeTurnS","holeTurnN","bendN","uturn"],"solution":[{"rot":0,"r":2,"c":0},{"rot":0,"r":1,"c":0},{"rot":2,"r":0,"c":1},{"rot":1,"r":1,"c":2}]},{"mode":"day","start":{"side":"B","i":2},"house":{"side":"R","i":0},"trees":[],"flowers":[],"wolf":null,"pieces":["holeTurnS","bendS","zcurve","bendN"],"solution":[{"rot":1,"r":1,"c":2},{"rot":2,"r":2,"c":0},{"rot":0,"r":1,"c":0},{"rot":2,"r":0,"c":1}]},{"mode":"day","start":{"side":"B","i":2},"house":{"side":"L","i":0},"trees":[4],"flowers":[],"wolf":null,"pieces":["bendN","bendS","zcurve","holeTurnS"],"solution":[{"rot":3,"r":0,"c":0},{"rot":2,"r":2,"c":0},{"rot":0,"r":0,"c":1},{"rot":1,"r":1,"c":2}]},{"mode":"day","start":{"side":"T","i":0},"house":{"side":"B","i":1},"trees":[2,6],"flowers":[],"wolf":null,"pieces":["bendS","holeTurnS","zcurve","bendN"],"solution":[{"rot":0,"r":1,"c":1},{"rot":2,"r":0,"c":1},{"rot":0,"r":2,"c":1},{"rot":1,"r":0,"c":0}]},{"mode":"flower","start":{"side":"L","i":1},"house":{"side":"B","i":0},"trees":[0],"flowers":[8,3],"wolf":null,"pieces":["holeLine","bendN","parallel","uturn"],"solution":[{"rot":1,"r":0,"c":0},{"rot":2,"r":2,"c":0},{"rot":1,"r":0,"c":1},{"rot":1,"r":1,"c":2}]},{"mode":"flower","start":{"side":"R","i":1},"house":{"side":"L","i":0},"trees":[2,6],"flowers":[8],"wolf":null,"pieces":["holeTurnS","holeTurnN","uturn","zcurve"],"solution":[{"rot":1,"r":0,"c":1},{"rot":1,"r":0,"c":2},{"rot":2,"r":2,"c":1},{"rot":1,"r":0,"c":0}]},{"mode":"flower","start":{"side":"R","i":0},"house":{"side":"L","i":2},"trees":[4],"flowers":[8,7,2],"wolf":null,"pieces":["bendN","holeLine","bendS","straight"],"solution":[{"rot":0,"r":2,"c":1},{"rot":1,"r":1,"c":0},{"rot":3,"r":0,"c":2},{"rot":0,"r":0,"c":0}]},{"mode":"flower","start":{"side":"T","i":0},"house":{"side":"R","i":2},"trees":[2,5],"flowers":[0,7],"wolf":null,"pieces":["bendN","holeTurnN","straight","holeLine"],"solution":[{"rot":1,"r":1,"c":0},{"rot":2,"r":1,"c":1},{"rot":0,"r":2,"c":1},{"rot":2,"r":0,"c":0}]},{"mode":"night","start":{"side":"L","i":1},"house":{"side":"R","i":1},"trees":[1,6],"flowers":[],"wolf":2,"pieces":["holeTurnS","bendS","uturn","holeTurnN"],"solution":[{"rot":2,"r":0,"c":0},{"rot":0,"r":1,"c":0},{"rot":2,"r":2,"c":1},{"rot":1,"r":0,"c":2}]},{"mode":"night","start":{"side":"B","i":1},"house":{"side":"L","i":1},"trees":[1],"flowers":[8],"wolf":6,"pieces":["holeLine","holeTurnS","uturn","parallel"],"solution":[{"rot":1,"r":0,"c":1},{"rot":0,"r":2,"c":0},{"rot":1,"r":1,"c":2},{"rot":1,"r":0,"c":0}]},{"mode":"night","start":{"side":"B","i":1},"house":{"side":"T","i":2},"trees":[8],"flowers":[],"wolf":4,"pieces":["holeTurnN","bendS","scurve","parallel"],"solution":[{"rot":3,"r":0,"c":2},{"rot":3,"r":0,"c":0},{"rot":0,"r":2,"c":0},{"rot":1,"r":0,"c":1}]},{"mode":"night","start":{"side":"R","i":2},"house":{"side":"L","i":2},"trees":[],"flowers":[6,1],"wolf":2,"pieces":["scurve","bendS","uturn","holeTurnN"],"solution":[{"rot":0,"r":1,"c":1},{"rot":1,"r":1,"c":0},{"rot":0,"r":0,"c":0},{"rot":0,"r":2,"c":1}]},{"size":4,"mode":"day","start":{"side":"L","i":0},"house":{"side":"B","i":2},"trees":[7],"flowers":[],"wolf":null,"pieces":[[6,9],[6,9],[6,9],[10,12]],"solution":[{"rot":1,"r":0,"c":0},{"rot":1,"r":1,"c":1},{"rot":0,"r":3,"c":2},{"rot":0,"r":2,"c":2}]},{"size":4,"mode":"day","start":{"side":"B","i":3},"house":{"side":"L","i":1},"trees":[12,9],"flowers":[],"wolf":null,"pieces":[[3,10],[3,12],[3,12],[6,9],[6,9],[16,5]],"solution":[{"rot":2,"r":1,"c":2},{"rot":0,"r":3,"c":2},{"rot":1,"r":0,"c":0},{"rot":0,"r":2,"c":2},{"rot":1,"r":0,"c":1},{"rot":0,"r":3,"c":0}]},{"size":4,"mode":"flower","start":{"side":"R","i":3},"house":{"side":"B","i":2},"trees":[3],"flowers":[6,13],"wolf":null,"pieces":[[3,12],[6,9],[6,9],[3,12],[10,9]],"solution":[{"rot":0,"r":2,"c":0},{"rot":1,"r":2,"c":3},{"rot":1,"r":1,"c":2},{"rot":0,"r":3,"c":1},{"rot":2,"r":1,"c":0}]},{"size":4,"mode":"flower","start":{"side":"B","i":2},"house":{"side":"T","i":0},"trees":[8,4],"flowers":[15,11],"wolf":null,"pieces":[[6,9],[3,10],[3,12],[16,5],[10,12],[6,9]],"solution":[{"rot":0,"r":3,"c":2},{"rot":2,"r":0,"c":2},{"rot":0,"r":2,"c":2},{"rot":0,"r":1,"c":0},{"rot":2,"r":0,"c":0},{"rot":0,"r":1,"c":2}]},{"size":4,"mode":"flower","start":{"side":"T","i":3},"house":{"side":"L","i":0},"trees":[12],"flowers":[13,7,15],"wolf":null,"pieces":[[10,12],[16,3],[10,12],[6,9],[6,9],[3,10],[10,10]],"solution":[{"rot":1,"r":2,"c":3},{"rot":3,"r":2,"c":0},{"rot":2,"r":3,"c":1},{"rot":0,"r":2,"c":1},{"rot":1,"r":0,"c":0},{"rot":2,"r":1,"c":1},{"rot":1,"r":0,"c":3}]},{"size":4,"mode":"night","start":{"side":"R","i":0},"house":{"side":"L","i":2},"trees":[0,15],"flowers":[],"wolf":11,"pieces":[[6,9],[3,10],[6,9],[10,12],[3,12],[16,6]],"solution":[{"rot":1,"r":0,"c":2},{"rot":1,"r":0,"c":1},{"rot":1,"r":2,"c":0},{"rot":1,"r":2,"c":1},{"rot":1,"r":0,"c":3},{"rot":1,"r":0,"c":0}]},{"size":4,"mode":"night","start":{"side":"L","i":1},"house":{"side":"R","i":1},"trees":[8],"flowers":[5],"wolf":2,"pieces":[[6,10],[3,12],[6,10],[3,12],[10,9],[16,3],[10,9]],"solution":[{"rot":1,"r":0,"c":1},{"rot":1,"r":0,"c":0},{"rot":3,"r":2,"c":1},{"rot":0,"r":2,"c":2},{"rot":0,"r":3,"c":2},{"rot":1,"r":2,"c":0},{"rot":2,"r":1,"c":2}]},{"size":4,"mode":"night","start":{"side":"T","i":2},"house":{"side":"L","i":3},"trees":[14,15],"flowers":[5,7],"wolf":13,"pieces":[[6,9],[3,10],[3,12],[10,12],[6,9],[16,6],[10,12]],"solution":[{"rot":1,"r":1,"c":2},{"rot":3,"r":1,"c":3},{"rot":0,"r":0,"c":2},{"rot":3,"r":0,"c":0},{"rot":1,"r":0,"c":1},{"rot":2,"r":3,"c":1},{"rot":1,"r":2,"c":0}]}];
  const MODE_TEXT = {
    day: '☀️ 낮 — 빨간망토가 할머니 집까지 갈 수 있게 길을 이어 주세요',
    flower: '🌸 꽃길 — 꽃을 모두 지나서 할머니 집까지 가요',
    night: '🌙 밤 — 늑대를 피해서 할머니 집까지 가요',
    nightFlower: '🌙 밤 — 늑대는 피하고, 꽃은 모두 지나가요'
  };
  const MODE_ICON = { day: '☀️', flower: '🌸', night: '🌙' };

  const rotM = m => (m & H) ? H : (((m << 1) | (m >> 3)) & 15);
  function foot(name, rot) {
    const def = typeof name === 'string' ? LIB[name] : name;
    let cells = [{ r: 0, c: 0, m: def[0] }, { r: 0, c: 1, m: def[1] }];
    for (let k = 0; k < rot; k++) cells = cells.map(x => ({ r: x.c, c: -x.r, m: rotM(x.m) }));
    const mr = Math.min(...cells.map(x => x.r)), mc = Math.min(...cells.map(x => x.c));
    return cells.map(x => ({ r: x.r - mr, c: x.c - mc, m: x.m }));
  }
  const DIRS = [[N, -1, 0], [E, 0, 1], [S, 1, 0], [W, 0, -1]];
  const opp = d => d === N ? S : d === S ? N : d === E ? W : E;

  // ===== 화면 배치 =====
  const LW = 420, BX = 75, BY = 72, BOARD = 270, P = 90; // P = 조각 그리기 기본 단위
  const TRAY_Y = 452, SLOT_W = 100, SLOT_H = 112, TS = 0.5;
  let G = 3, C = 90, K = 1, LH = 600; // G = 보드 칸 수, C = 칸 크기, K = 확대 비율

  const cv = document.getElementById('board');
  const ctx = cv.getContext('2d');
  const $ = id => document.getElementById(id);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = cv.clientWidth || LW;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * LH / LW * dpr);
  }
  window.addEventListener('resize', resize);
  function trayRows() { return pieces.length > 4 ? 2 : 1; }
  function applyGeometry() {
    G = (lv && lv.size) || 3; C = BOARD / G; K = C / P;
    LH = TRAY_Y + trayRows() * SLOT_H + 36;
    cv.style.aspectRatio = `${LW} / ${LH}`;
    resize();
  }
  function slotCenter(k) {
    const n = pieces.length, rows = trayRows(), per = Math.ceil(n / rows);
    const row = Math.floor(k / per), col = k % per, inRow = row === 0 ? per : n - per;
    const x0 = (LW - inRow * SLOT_W) / 2;
    return { x: x0 + col * SLOT_W + SLOT_W / 2, y: TRAY_Y + row * SLOT_H + SLOT_H / 2 };
  }

  // ===== 저장 =====
  const SAVE_KEY = 'redhood_forest_v1';
  let save = { stars: Array(LEVELS.length).fill(0) };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && Array.isArray(s.stars)) save.stars = LEVELS.map((_, i) => s.stars[i] || 0); } catch (e) { }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }
  const unlocked = i => i === 0 || save.stars[i - 1] > 0;

  // ===== 소리 =====
  let actx = null, muted = false;
  function tone(f, d = 0.12, type = 'sine', v = 0.15, delay = 0) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d);
    } catch (e) { }
  }
  const sfx = {
    pick: () => tone(520, 0.08, 'triangle'),
    place: () => { tone(330, 0.1, 'triangle', 0.2); tone(440, 0.1, 'triangle', 0.12, 0.05); },
    rotate: () => tone(660, 0.06, 'square', 0.06),
    bad: () => tone(160, 0.2, 'sawtooth', 0.08),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, i * 0.12)),
    step: () => tone(880 + Math.random() * 200, 0.04, 'sine', 0.04),
    wolf: () => { tone(220, 0.3, 'sawtooth', 0.08); tone(180, 0.35, 'sawtooth', 0.08, 0.1); }
  };

  // ===== 게임 상태 =====
  let lvIdx = 0, lv = null, pieces = [], hints = 0, state = 'menu';
  let down = null, drag = null, walk = null, lastEval = null, time = 0, shake = 0;

  function loadLevel(i) {
    lvIdx = i; lv = LEVELS[i];
    pieces = lv.pieces.map((name, k) => ({ name, rot: (k * 3 + i + 1) % 4, on: false, r: 0, c: 0 }));
    hints = 0; state = 'play'; walk = null; drag = null; down = null;
    applyGeometry();
    $('lvLabel').textContent = `레벨 ${i + 1}`;
    $('mode').textContent = (G === 4 ? '🌲 큰 숲 · ' : '') + (lv.mode === 'night' && lv.flowers.length ? MODE_TEXT.nightFlower : MODE_TEXT[lv.mode]);
    hideAll();
    evaluate(false);
  }

  function occupancy(exclude) {
    const own = Array(G * G).fill(-1), grid = Array(G * G).fill(0);
    pieces.forEach((p, k) => {
      if (!p.on || k === exclude) return;
      foot(p.name, p.rot).forEach(x => { const id = (p.r + x.r) * G + p.c + x.c; own[id] = k; grid[id] = x.m; });
    });
    return { own, grid };
  }
  function canPlace(k, rot, r, c) {
    const { own } = occupancy(k);
    return foot(pieces[k].name, rot).every(x => {
      const rr = r + x.r, cc = c + x.c;
      if (rr < 0 || rr >= G || cc < 0 || cc >= G) return false;
      const id = rr * G + cc;
      if (own[id] >= 0) return false;
      if (lv.trees.includes(id) && !(x.m & H)) return false;
      return true;
    });
  }
  function slotEntry(s) {
    if (s.side === 'L') return { r: s.i, c: 0, d: W };
    if (s.side === 'R') return { r: s.i, c: G - 1, d: E };
    if (s.side === 'T') return { r: 0, c: s.i, d: N };
    return { r: G - 1, c: s.i, d: S };
  }
  function trace(grid) {
    let { r, c, d } = slotEntry(lv.start); const steps = [];
    for (let g = 0; g < G * G + 2; g++) {
      const m = grid[r * G + c];
      if (!m || (m & H) || !(m & d)) return { ok: false, steps };
      const out = m & ~d; steps.push({ id: r * G + c, din: d, dout: out });
      const D = DIRS.find(x => x[0] === out); const nr = r + D[1], nc = c + D[2];
      if (nr < 0 || nr >= G || nc < 0 || nc >= G) {
        const side = out === W ? 'L' : out === E ? 'R' : out === N ? 'T' : 'B';
        const i = (side === 'L' || side === 'R') ? r : c;
        return { ok: side === lv.house.side && i === lv.house.i, steps };
      }
      r = nr; c = nc; d = opp(out);
    }
    return { ok: false, steps };
  }
  function evaluate(fromAction = true) {
    const { grid } = occupancy(-1);
    const t = trace(grid); const ids = t.steps.map(s => s.id);
    const got = lv.flowers.filter(f => ids.includes(f));
    const wolfHit = lv.wolf != null && ids.includes(lv.wolf);
    const allOn = pieces.every(p => p.on);
    const left = pieces.filter(p => !p.on).length;
    lastEval = { t, ids, got, wolfHit };
    let msg = '';
    if (wolfHit) msg = '앗, 늑대를 만나 버렸어요! 🐺 다른 길을 찾아봐요';
    else if (!allOn) msg = `남은 길 조각: ${left}개 — 탭하면 돌아가요`;
    else if (!t.ok) msg = '길이 할머니 집까지 이어지지 않았어요';
    else if (got.length < lv.flowers.length) msg = '꽃을 모두 지나가야 해요 🌸';
    else msg = '길이 완성됐어요! 🎉';
    $('msg').textContent = msg;
    if (fromAction && wolfHit) { sfx.wolf(); shake = 1; }
    if (allOn && t.ok && !wolfHit && got.length === lv.flowers.length) startWalk(t);
  }

  // ===== 좌표 도우미 =====
  const cellXY = id => ({ x: BX + (id % G) * C, y: BY + Math.floor(id / G) * C });
  function midOf(x, y, d, s = C) {
    if (d === N) return { x: x + s / 2, y };
    if (d === E) return { x: x + s, y: y + s / 2 };
    if (d === S) return { x: x + s / 2, y: y + s };
    return { x, y: y + s / 2 };
  }
  function slotPoint(s, dist) {
    if (s.side === 'L') return { x: BX - dist, y: BY + s.i * C + C / 2 };
    if (s.side === 'R') return { x: BX + BOARD + dist, y: BY + s.i * C + C / 2 };
    if (s.side === 'T') return { x: BX + s.i * C + C / 2, y: BY - dist };
    return { x: BX + s.i * C + C / 2, y: BY + BOARD + dist };
  }
  const qb = (a, c, b, t) => ({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });

  // ===== 승리 걷기 =====
  function startWalk(t) {
    state = 'walk';
    const pts = [slotPoint(lv.start, 42), slotPoint(lv.start, 0)];
    t.steps.forEach(s => {
      const { x, y } = cellXY(s.id);
      const a = midOf(x, y, s.din), b = midOf(x, y, s.dout), ctr = { x: x + C / 2, y: y + C / 2 };
      for (let k = 1; k <= 12; k++) pts.push(qb(a, ctr, b, k / 12));
    });
    pts.push(slotPoint(lv.house, 0), slotPoint(lv.house, 40));
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    walk = { pts, acc, d: 0, total: acc[acc.length - 1], lastStep: 0 };
  }
  function walkPos() {
    if (!walk) return slotPoint(lv.start, 42);
    const { pts, acc, d } = walk; let i = 1;
    while (i < acc.length - 1 && acc[i] < d) i++;
    const seg = acc[i] - acc[i - 1] || 1, t = Math.min(1, Math.max(0, (d - acc[i - 1]) / seg));
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
  }
  function finishLevel() {
    state = 'clear';
    const stars = hints === 0 ? 3 : hints === 1 ? 2 : 1;
    save.stars[lvIdx] = Math.max(save.stars[lvIdx], stars); persist();
    sfx.win();
    $('clearStars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    const last = lvIdx === LEVELS.length - 1;
    $('clearTitle').textContent = last ? '모든 레벨 완료! 🎉' : '할머니 집 도착! 🏠';
    $('clearSub').textContent = hints ? `힌트 ${hints}번 사용` : '힌트 없이 성공!';
    $('nextBtn').textContent = last ? '레벨 목록' : '다음 레벨 ▶';
    show('clearOv');
  }

  // ===== 그리기 도우미 =====
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function circle(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  function ellipse(x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }

  function drawPathCell(x, y, m) {
    const ds = [N, E, S, W].filter(d => m & d); if (ds.length !== 2) return;
    const a = midOf(x, y, ds[0], P), b = midOf(x, y, ds[1], P), c = { x: x + P / 2, y: y + P / 2 };
    ctx.lineCap = 'butt';
    [[36, '#7a4b24'], [27, '#c48a52'], [3, '#e6bf8a']].forEach(([lw, col], i) => {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.lineWidth = lw; ctx.strokeStyle = col;
      ctx.setLineDash(i === 2 ? [3, 11] : []); ctx.stroke();
    });
    ctx.setLineDash([]);
  }
  function drawHole(cx, cy) {
    circle(cx, cy, 33, '#6b8f3f');
    circle(cx, cy, 30, '#3a2614');
    circle(cx, cy + 4, 24, '#24170b');
  }
  function drawPieceLocal(p, alpha = 1) {
    const f = foot(p.name, p.rot);
    const rows = Math.max(...f.map(x => x.r)) + 1, cols = Math.max(...f.map(x => x.c)) + 1;
    ctx.save(); ctx.globalAlpha = alpha;
    rr(4, 7, cols * P - 6, rows * P - 6, 14); ctx.fillStyle = 'rgba(30,60,15,0.35)'; ctx.fill();
    rr(2, 2, cols * P - 4, rows * P - 4, 14); ctx.fillStyle = '#a8da72'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#6ea844'; ctx.stroke();
    // 풀잎 장식
    ctx.strokeStyle = '#86c25a'; ctx.lineWidth = 2;
    f.forEach((x, n) => {
      const ox = x.c * P, oy = x.r * P;
      [[14, 16], [72, 20], [18, 74], [70, 72]].forEach(([gx, gy], j) => {
        if ((j + n) % 2) return;
        ctx.beginPath(); ctx.moveTo(ox + gx - 4, oy + gy - 5); ctx.lineTo(ox + gx, oy + gy); ctx.lineTo(ox + gx + 4, oy + gy - 6); ctx.stroke();
      });
    });
    // 이음선
    ctx.setLineDash([4, 6]); ctx.strokeStyle = '#7fb84f'; ctx.lineWidth = 2; ctx.beginPath();
    if (cols === 2) { ctx.moveTo(P, 10); ctx.lineTo(P, P - 10); } else { ctx.moveTo(10, P); ctx.lineTo(P - 10, P); }
    ctx.stroke(); ctx.setLineDash([]);
    f.forEach(x => { if (x.m & H) drawHole(x.c * P + P / 2, x.r * P + P / 2); else drawPathCell(x.c * P, x.r * P, x.m); });
    ctx.restore();
  }
  function drawPieceAt(p, x, y, s, alpha) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); drawPieceLocal(p, alpha); ctx.restore(); }
  function pieceSize(p) {
    const f = foot(p.name, p.rot);
    return { w: (Math.max(...f.map(x => x.c)) + 1) * P, h: (Math.max(...f.map(x => x.r)) + 1) * P };
  }

  // ===== 캐릭터 =====
  function drawHood(x, y, s = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ellipse(0, 26, 20, 6, 'rgba(0,0,0,0.2)');
    ctx.beginPath(); ctx.moveTo(-20, 22); ctx.quadraticCurveTo(0, -4, 20, 22); ctx.closePath(); ctx.fillStyle = '#c62f2f'; ctx.fill();
    circle(0, -4, 21, '#e0473f');
    ctx.beginPath(); ctx.moveTo(-8, -22); ctx.lineTo(0, -34); ctx.lineTo(8, -22); ctx.fillStyle = '#e0473f'; ctx.fill();
    circle(0, -1, 14, '#ffdcbc');
    ctx.beginPath(); ctx.arc(0, -1, 14, Math.PI * 1.02, Math.PI * 1.98);
    ctx.quadraticCurveTo(6, -6, 0, -9); ctx.quadraticCurveTo(-6, -5, -14, -3); ctx.fillStyle = '#4a2f22'; ctx.fill();
    circle(-5, 2, 2.2, '#2b1a12'); circle(5, 2, 2.2, '#2b1a12');
    circle(-8.5, 6, 2.6, 'rgba(255,120,120,0.55)'); circle(8.5, 6, 2.6, 'rgba(255,120,120,0.55)');
    ctx.beginPath(); ctx.arc(0, 5, 4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 1.6; ctx.strokeStyle = '#8a3b2b'; ctx.stroke();
    ctx.restore();
  }
  function drawHouse(x, y) {
    ctx.save(); ctx.translate(x, y);
    ellipse(0, 28, 30, 6, 'rgba(0,0,0,0.2)');
    rr(-24, -6, 48, 34, 4); ctx.fillStyle = '#fff6e6'; ctx.fill(); ctx.strokeStyle = '#c9b48f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#9b6a3c'; rr(-7, 8, 14, 20, 6); ctx.fill();
    ctx.fillStyle = '#8fd0f0'; rr(10, 2, 10, 9, 2); ctx.fill();
    ctx.fillStyle = '#b8473a'; ctx.fillRect(12, -32, 8, 16);
    ctx.beginPath(); ctx.moveTo(-32, -4); ctx.lineTo(0, -34); ctx.lineTo(32, -4); ctx.closePath(); ctx.fillStyle = '#e24a3b'; ctx.fill();
    ctx.strokeStyle = '#b8352a'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { const yy = -26 + k * 8, hw = 8 + k * 8; ctx.beginPath(); ctx.moveTo(-hw, yy); ctx.lineTo(hw, yy); ctx.stroke(); }
    ctx.restore();
  }
  function drawWolf(x, y, hit, sc = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    if (hit) { circle(0, 0, 36 + Math.sin(time * 10) * 3, 'rgba(255,60,60,0.35)'); }
    ellipse(0, 24, 22, 6, 'rgba(0,0,0,0.25)');
    [-1, 1].forEach(sd => {
      ctx.beginPath(); ctx.moveTo(sd * 8, -14); ctx.lineTo(sd * 20, -32); ctx.lineTo(sd * 22, -8); ctx.closePath(); ctx.fillStyle = '#6c7682'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(sd * 12, -14); ctx.lineTo(sd * 19, -26); ctx.lineTo(sd * 19, -12); ctx.closePath(); ctx.fillStyle = '#f2a9b4'; ctx.fill();
    });
    circle(0, 0, 22, '#7d8895');
    ellipse(0, 9, 13, 10, '#d4dbe2');
    ellipse(0, 4, 4.5, 3.5, '#222');
    circle(-8, -6, 4.5, '#fff'); circle(8, -6, 4.5, '#fff');
    circle(-7, -5, 2.4, '#222'); circle(7, -5, 2.4, '#222');
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-13, -14); ctx.lineTo(-4, -10); ctx.moveTo(13, -14); ctx.lineTo(4, -10); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(-3, 17); ctx.lineTo(-1, 12); ctx.moveTo(1, 12); ctx.lineTo(3, 17); ctx.lineTo(5, 12); ctx.fill();
    ctx.restore();
  }
  function drawTree(x, y, sc = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ellipse(0, 24, 20, 6, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = '#7a4b24'; ctx.fillRect(-5, 12, 10, 14);
    [['#2e7a34', 24, 14], ['#3a9442', 19, 0], ['#4fae52', 14, -13]].forEach(([col, w, yy]) => {
      ctx.beginPath(); ctx.moveTo(-w, yy + 4); ctx.quadraticCurveTo(0, yy + 10, w, yy + 4); ctx.lineTo(0, yy - 18); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    });
    circle(-5, -14, 2.5, 'rgba(255,255,255,0.35)');
    ctx.restore();
  }
  function drawFlower(x, y, got, sc = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    if (got) circle(0, 0, 20 + Math.sin(time * 6) * 2, 'rgba(255,240,120,0.55)');
    const col = got ? '#ff7eb6' : '#ff9cc8';
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 + time * (got ? 1.5 : 0); circle(Math.cos(a) * 8, Math.sin(a) * 8, 6.5, col); }
    circle(0, 0, 5, '#ffd84a');
    ctx.restore();
  }
  function drawStub(s) {
    const a = slotPoint(s, 0), b = slotPoint(s, 34);
    ctx.lineCap = 'butt';
    [[36, '#7a4b24'], [27, '#c48a52']].forEach(([lw, col]) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = lw * K; ctx.strokeStyle = col; ctx.stroke(); });
  }

  // ===== 메인 그리기 =====
  const STARS = Array.from({ length: 40 }, (_, i) => ({ x: (i * 97) % LW, y: (i * 53) % 440, r: 0.6 + (i % 3) * 0.6 }));
  function draw() {
    ctx.setTransform(cv.width / LW, 0, 0, cv.height / LH, 0, 0);
    const night = lv && lv.mode === 'night';
    const g = ctx.createLinearGradient(0, 0, 0, LH);
    if (night) { g.addColorStop(0, '#1d2b55'); g.addColorStop(1, '#2d4a3a'); } else { g.addColorStop(0, '#dff4c8'); g.addColorStop(1, '#b9e39a'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    if (night) STARS.forEach((s, i) => circle(s.x, s.y, s.r, `rgba(255,255,220,${0.4 + 0.4 * Math.sin(time * 2 + i)})`));
    if (!lv) return;

    let sx = 0;
    if (shake > 0) { sx = Math.sin(time * 60) * 6 * shake; shake = Math.max(0, shake - 0.03); }
    ctx.save(); ctx.translate(sx, 0);

    // 보드
    rr(BX - 16, BY - 16, BOARD + 32, BOARD + 32, 24); ctx.fillStyle = '#8a5a30'; ctx.fill();
    rr(BX - 8, BY - 8, BOARD + 16, BOARD + 16, 18); ctx.fillStyle = '#4f8a33'; ctx.fill();
    for (let id = 0; id < G * G; id++) {
      const { x, y } = cellXY(id);
      rr(x + 4, y + 4, C - 8, C - 8, 10 * K); ctx.fillStyle = '#5c9a3d'; ctx.fill();
      ctx.setLineDash([5, 6]); ctx.strokeStyle = '#7dbb58'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    }
    drawStub(lv.start); drawStub(lv.house);

    // 놓인 조각
    pieces.forEach((p, k) => { if (p.on && !(drag && drag.k === k)) drawPieceAt(p, BX + p.c * C, BY + p.r * C, K, 1); });

    // 이어진 길 표시
    if (lastEval && state !== 'menu') {
      const full = lastEval.t.ok;
      ctx.save(); ctx.lineCap = 'round'; ctx.setLineDash([2, 12]); ctx.lineDashOffset = -time * 30;
      ctx.strokeStyle = full ? 'rgba(255,240,120,0.95)' : 'rgba(255,250,200,0.7)'; ctx.lineWidth = 6 * K;
      lastEval.t.steps.forEach(s => {
        const { x, y } = cellXY(s.id); const a = midOf(x, y, s.din), b = midOf(x, y, s.dout);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(x + C / 2, y + C / 2, b.x, b.y); ctx.stroke();
      });
      ctx.restore();
    }

    if (night) { rr(BX - 16, BY - 16, BOARD + 32, BOARD + 32, 24); ctx.fillStyle = 'rgba(20,30,80,0.18)'; ctx.fill(); }

    // 고정물
    lv.trees.forEach(id => { const { x, y } = cellXY(id); drawTree(x + C / 2, y + C / 2 - 4 * K, K); });
    lv.flowers.forEach(id => { const { x, y } = cellXY(id); drawFlower(x + C / 2, y + C / 2, lastEval && lastEval.got.includes(id), K); });
    if (lv.wolf != null) { const { x, y } = cellXY(lv.wolf); drawWolf(x + C / 2, y + C / 2, lastEval && lastEval.wolfHit, K); }
    const hp = slotPoint(lv.house, 42); drawHouse(hp.x, hp.y);
    const wp = walkPos(); drawHood(wp.x, wp.y - 4 + (state === 'walk' ? Math.abs(Math.sin(time * 12)) * -4 : Math.sin(time * 3) * 1.5), 0.9);
    ctx.restore();

    // 조각 보관함
    const n = pieces.length, per = Math.ceil(n / trayRows()), x0 = (LW - per * SLOT_W) / 2;
    rr(x0 - 8, TRAY_Y - 26, per * SLOT_W + 16, trayRows() * SLOT_H + 34, 18); ctx.fillStyle = night ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.45)'; ctx.fill();
    ctx.fillStyle = night ? '#e8f0ff' : '#3d6b25'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('길 조각 (탭: 회전 · 끌기: 놓기)', LW / 2, TRAY_Y - 8);
    pieces.forEach((p, k) => {
      const { x: cx, y: cy } = slotCenter(k);
      rr(cx - 44, cy - 44, 88, 88, 14); ctx.setLineDash([5, 5]); ctx.strokeStyle = night ? 'rgba(255,255,255,0.3)' : 'rgba(80,130,50,0.45)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      if (p.on || (drag && drag.k === k)) return;
      const sz = pieceSize(p);
      drawPieceAt(p, cx - sz.w * TS / 2, cy - sz.h * TS / 2, TS, 1);
    });

    // 드래그 중
    if (drag) {
      const p = pieces[drag.k], sz = pieceSize(p);
      const left = drag.x - drag.gx, top = drag.y - drag.gy;
      const r = Math.round((top - BY) / C), c = Math.round((left - BX) / C);
      if (canPlace(drag.k, p.rot, r, c)) {
        rr(BX + c * C + 2, BY + r * C + 2, sz.w * K - 4, sz.h * K - 4, 14 * K); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      }
      drawPieceAt(p, left, top, K, 0.92);
    }
  }

  function loop(ts) {
    const now = ts / 1000, dt = Math.min(0.05, now - (loop.last || now)); loop.last = now; time += dt;
    if (state === 'walk' && walk) {
      walk.d += dt * 190;
      if (walk.d - walk.lastStep > 22) { walk.lastStep = walk.d; sfx.step(); }
      if (walk.d >= walk.total) { walk.d = walk.total; finishLevel(); }
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ===== 입력 =====
  function toLocal(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * LW / r.width, y: (e.clientY - r.top) * LH / r.height }; }
  function boardCell(x, y) {
    const c = Math.floor((x - BX) / C), r = Math.floor((y - BY) / C);
    return (r >= 0 && r < G && c >= 0 && c < G) ? r * G + c : -1;
  }
  function trayHit(x, y) {
    for (let k = 0; k < pieces.length; k++) {
      const s = slotCenter(k);
      if (!pieces[k].on && Math.abs(x - s.x) <= SLOT_W / 2 && Math.abs(y - s.y) <= SLOT_H / 2) return k;
    }
    return -1;
  }

  cv.addEventListener('pointerdown', e => {
    if (state !== 'play') return;
    const { x, y } = toLocal(e);
    const id = boardCell(x, y);
    if (id >= 0) {
      const k = occupancy(-1).own[id];
      if (k >= 0) { const p = pieces[k]; down = { k, x, y, from: 'board', cell: id, gx: x - (BX + p.c * C), gy: y - (BY + p.r * C) }; }
    } else {
      const k = trayHit(x, y);
      if (k >= 0) { const sz = pieceSize(pieces[k]); down = { k, x, y, from: 'tray', gx: sz.w * K / 2, gy: sz.h * K / 2 + (e.pointerType === 'touch' ? 55 : 0) }; }
    }
    if (down) { try { cv.setPointerCapture(e.pointerId); } catch (er) { } e.preventDefault(); }
  });
  cv.addEventListener('pointermove', e => {
    if (!down) return;
    const { x, y } = toLocal(e);
    if (!drag && Math.hypot(x - down.x, y - down.y) > 8) {
      if (down.from === 'board') pieces[down.k].on = false;
      drag = { k: down.k, x, y, gx: down.gx, gy: down.gy }; sfx.pick();
    }
    if (drag) { drag.x = x; drag.y = y; }
  });
  function endPointer() {
    if (!down) return;
    const k = down.k, p = pieces[k];
    if (drag) {
      const left = drag.x - drag.gx, top = drag.y - drag.gy;
      const r = Math.round((top - BY) / C), c = Math.round((left - BX) / C);
      if (canPlace(k, p.rot, r, c)) { p.on = true; p.r = r; p.c = c; sfx.place(); }
      else { p.on = false; if (boardCell(drag.x, drag.y) >= 0) sfx.bad(); }
      drag = null; down = null; evaluate(); return;
    }
    // 탭 → 회전
    const nr = (p.rot + 1) % 4; sfx.rotate();
    if (down.from === 'tray') { p.rot = nr; }
    else {
      const tr = Math.floor(down.cell / G), tc = down.cell % G; let done = false;
      for (const x of foot(p.name, nr)) {
        const ar = tr - x.r, ac = tc - x.c;
        if (canPlace(k, nr, ar, ac)) { p.rot = nr; p.r = ar; p.c = ac; done = true; break; }
      }
      if (!done) { p.rot = nr; p.on = false; }
      evaluate();
    }
    down = null;
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', () => { if (drag) { pieces[drag.k].on = false; drag = null; evaluate(); } down = null; });

  // ===== 힌트 =====
  function targetCells(k) {
    const s = lv.solution[k];
    return foot(pieces[k].name, s.rot).map(x => ({ id: (s.r + x.r) * G + s.c + x.c, m: x.m }));
  }
  function isCorrect(k) {
    const p = pieces[k]; if (!p.on) return false;
    const cur = foot(p.name, p.rot).map(x => ({ id: (p.r + x.r) * G + p.c + x.c, m: x.m }));
    return targetCells(k).every(t => cur.some(c => c.id === t.id && c.m === t.m));
  }
  function useHint() {
    if (state !== 'play') return;
    const k = pieces.findIndex((_, i) => !isCorrect(i)); if (k < 0) return;
    const ids = targetCells(k).map(t => t.id);
    const { own } = occupancy(k);
    ids.forEach(id => { if (own[id] >= 0) pieces[own[id]].on = false; });
    const s = lv.solution[k]; Object.assign(pieces[k], { on: true, rot: s.rot, r: s.r, c: s.c });
    hints++; sfx.place(); evaluate();
  }

  // ===== 화면(오버레이) =====
  function show(id) { hideAll(); $(id).classList.add('show'); }
  function hideAll() { document.querySelectorAll('.ov').forEach(o => o.classList.remove('show')); }
  function openMenu() {
    const box = $('levelGrid'); box.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const b = document.createElement('button'); const open = unlocked(i);
      b.className = 'lvBtn' + (open ? '' : ' locked') + ' m-' + L.mode + (L.size === 4 ? ' big4' : '');
      b.innerHTML = `<span class="ic">${open ? MODE_ICON[L.mode] : '🔒'}</span><b>${i + 1}</b><span class="st">${'⭐'.repeat(save.stars[i]) || '&nbsp;'}</span>`;
      b.disabled = !open; b.onclick = () => loadLevel(i);
      box.appendChild(b);
    });
    show('menuOv');
  }

  $('menuBtn').onclick = openMenu;
  $('hintBtn').onclick = useHint;
  $('resetBtn').onclick = () => { if (lv) loadLevel(lvIdx); };
  $('soundBtn').onclick = () => { muted = !muted; $('soundBtn').textContent = muted ? '🔇' : '🔊'; };
  $('helpBtn').onclick = () => show('helpOv');
  $('helpClose').onclick = () => (lv && state !== 'menu') ? hideAll() : openMenu();
  $('retryBtn').onclick = () => loadLevel(lvIdx);
  $('nextBtn').onclick = () => (lvIdx < LEVELS.length - 1) ? loadLevel(lvIdx + 1) : openMenu();

  resize();
  const firstOpen = save.stars.findIndex(s => s === 0);
  lv = LEVELS[Math.max(0, firstOpen)]; lvIdx = Math.max(0, firstOpen); applyGeometry();
  openMenu();
  requestAnimationFrame(loop);
})();
