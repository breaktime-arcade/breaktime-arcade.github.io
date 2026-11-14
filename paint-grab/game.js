/* 땅따먹기 60초 - 게임 엔진 (혼자 하기 + 공용 기능)
 * © 쉬는시간 오락실 (smile-willow.tistory.com) · 무단 복제·배포 금지
 */
(() => {
'use strict';
const N = 16, CELLS = N * N, GAME_MS = 60000, OPEN_MS = 3500;
const COLORS = ['#ff4d6d', '#3a86ff', '#2ec27e', '#ffb703', '#9b5de5', '#ff7f11', '#00b4d8', '#f15bb5'];
const SPAWN = [[1, 1], [13, 13], [13, 1], [1, 13], [7, 1], [7, 13], [1, 7], [13, 7]];
const AI_NAMES = ['붓돌이', '물감왕', '페인트곰', '색칠요정', '롤러킹', '팔레트', '크레용', '물방울', '스프레이'];
const ITEM_ICON = { bomb: '💣', bolt: '⚡', shield: '🛡️' };
const ITEM_NAME = { bomb: '폭탄', bolt: '번개', shield: '방패' };
const BASE_CD = 170, BOLT_CD = 70, EFF_MS = 5000;
const DIFF = { easy: { speed: 3.1, rand: 6 }, normal: { speed: 2.1, rand: 2.5 }, hard: { speed: 1.45, rand: .8 } };
const $ = id => document.getElementById(id);
const rnd = Math.random, ri = n => Math.floor(rnd() * n), pick = a => a[ri(a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const NB = Array.from({ length: CELLS }, (_, i) => {
  const x = i % N, y = (i / N) | 0, r = [];
  if (x > 0) r.push(i - 1); if (x < N - 1) r.push(i + 1); if (y > 0) r.push(i - N); if (y < N - 1) r.push(i + N);
  return r;
});

/* ───────── 저장 ───────── */
const store = {
  get(k, d) { try { const v = localStorage.getItem('pgrab_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pgrab_' + k, JSON.stringify(v)); } catch (e) {} }
};

/* ───────── 소리 ───────── */
let AC = null, muted = store.get('mute', false);
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, d, type = 'sine', v = .1, t0 = 0, f2) {
  if (muted) return; const a = ac(); if (!a) return;
  const t = a.currentTime + t0, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .03);
}
function noise(d, v = .2) {
  if (muted) return; const a = ac(); if (!a) return;
  const b = a.createBuffer(1, a.sampleRate * d, a.sampleRate), ch = b.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (rnd() * 2 - 1) * (1 - i / ch.length);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900; s.buffer = b; g.gain.value = v;
  s.connect(f).connect(g).connect(a.destination); s.start();
}
let lastPop = 0;
const SFX = {
  pop: () => { const t = performance.now(); if (t - lastPop < 45) return; lastPop = t; tone(500 + ri(500), .07, 'triangle', .07, 0, 900 + ri(400)); },
  steal: () => tone(320, .1, 'square', .05, 0, 640),
  bomb: () => { noise(.5, .35); tone(120, .4, 'sine', .25, 0, 40); },
  item: () => [880, 1175, 1568].forEach((f, i) => tone(f, .12, 'triangle', .1, i * .07)),
  tick: () => tone(1100, .05, 'square', .04),
  hurry: () => tone(880, .1, 'square', .07),
  go: () => { tone(784, .12, 'square', .07); tone(1046, .25, 'square', .07, .12); },
  end: () => { tone(523, .15, 'square', .07); tone(392, .4, 'square', .07, .15); },
  fanfare: () => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, .22, 'triangle', .12, i * .12)),
  sad: () => [523, 466, 415, 349].forEach((f, i) => tone(f, .3, 'triangle', .09, i * .2)),
  no: () => tone(200, .08, 'square', .04)
};

/* ───────── 상태 ───────── */
const S = {
  mode: 'idle', phase: 'idle', diff: store.get('diff', 'normal'),
  cells: new Int8Array(CELLS).fill(-1), anim: new Float64Array(CELLS), cnt: [0, 0, 0, 0, 0, 0, 0, 0],
  players: [], me: -1, eff: [], items: {}, startAt: 0, endAt: 0, lastPaint: {}, aiNext: {},
  now: () => Date.now(), backend: null, particles: [], itemNext: 0, ended: false
};
function resetBoard() {
  S.cells.fill(-1); S.anim.fill(0); S.cnt = [0, 0, 0, 0, 0, 0, 0, 0];
  S.items = {}; S.eff = []; S.lastPaint = {}; S.aiNext = {}; S.particles = []; S.ended = false;
  for (let k = 0; k < 8; k++) S.eff[k] = { bolt: 0, shield: 0 };
}
function spawnMap(n) {
  const m = {};
  for (let s = 0; s < n; s++) {
    const [x, y] = SPAWN[s];
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => { m[(y + dy) * N + x + dx] = s; });
  }
  return m;
}
function setCell(i, o, fx) {
  const p = S.cells[i];
  if (p === o) return;
  if (p >= 0) S.cnt[p]--;
  if (o >= 0) S.cnt[o]++;
  S.cells[i] = o; S.anim[i] = performance.now();
  if (fx && o >= 0) burst(i, COLORS[o], p >= 0 ? 7 : 4);
}
const itemAt = i => { for (const id in S.items) if (S.items[id] && S.items[id].i === i) return id; return null; };
const shielded = (o, t) => o >= 0 && S.eff[o] && S.eff[o].shield > t;
const cooldown = (s, t) => (S.eff[s] && S.eff[s].bolt > t ? BOLT_CD : BASE_CD);
function canPaint(s, i, t) {
  const o = S.cells[i];
  if (o === s || shielded(o, t)) return false;
  if (S.cnt[s] <= 0) return true;
  const nb = NB[i];
  for (let k = 0; k < nb.length; k++) if (S.cells[nb[k]] === s) return true;
  return false;
}
function bombCells(s, i, t) {
  const x = i % N, y = (i / N) | 0, out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
    const j = yy * N + xx, o = S.cells[j];
    if (o !== s && !shielded(o, t)) out.push(j);
  }
  return out;
}
function leader() { let b = -1, bc = -1; S.players.forEach((_, k) => { if (S.cnt[k] > bc) { bc = S.cnt[k]; b = k; } }); return b; }

/* AI: 칠할 칸 고르기 */
function aiThink(s, t) {
  const d = DIFF[S.players[s].d || 'normal'] || DIFF.normal, lead = leader();
  let best = -1, bs = -1e9;
  for (let i = 0; i < CELLS; i++) {
    if (!canPaint(s, i, t)) continue;
    const o = S.cells[i];
    let sc = o < 0 ? 3 : (o === lead && lead !== s ? 3.6 : 2.2);
    if (itemAt(i)) sc += 12;
    const nb = NB[i];
    for (let k = 0; k < nb.length; k++) if (S.cells[nb[k]] === s) sc += 1.1;
    sc += rnd() * d.rand;
    if (sc > bs) { bs = sc; best = i; }
  }
  return best;
}
function aiDelay(s, t) { const d = DIFF[S.players[s].d || 'normal'] || DIFF.normal; return cooldown(s, t) * d.speed * (.8 + rnd() * .5); }

/* 아이템 효과 (화면 연출) */
function itemFx(s, k, i) {
  const p = S.players[s]; if (!p) return;
  if (k === 'bomb') { SFX.bomb(); shake(); burst(i, COLORS[s], 26, 2.2); }
  else SFX.item();
  toast(`${s === S.me ? '내가' : esc(p.name) + ' 님이'} ${ITEM_ICON[k]} ${ITEM_NAME[k]}을(를) 먹었어요!`);
}

/* ───────── 혼자 하기 (로컬 진행) ───────── */
const Local = {
  paint(s, i) {
    const t = S.now();
    if (!canPaint(s, i, t)) return false;
    const was = S.cells[i];
    setCell(i, s, true);
    if (s === S.me && was >= 0) SFX.steal();
    const id = itemAt(i);
    if (id) {
      const k = S.items[id].k; delete S.items[id];
      if (k === 'bomb') bombCells(s, i, t).forEach(j => setCell(j, s, true));
      else S.eff[s][k] = t + EFF_MS;
      itemFx(s, k, i);
    }
    return true;
  }
};
function spawnItem(t) {
  if (Object.keys(S.items).length >= 3) return null;
  const free = [];
  for (let i = 0; i < CELLS; i++) if (!itemAt(i)) free.push(i);
  const empt = free.filter(i => S.cells[i] < 0);
  const i = pick(empt.length && rnd() < .7 ? empt : free);
  return { id: 'it' + t.toString(36) + ri(999), i, k: pick(['bomb', 'bomb', 'bolt', 'shield']) };
}
function startLocal() {
  S.mode = 'local'; S.backend = Local; S.now = () => Date.now();
  hideAll();
  const names = shuffle(AI_NAMES.slice());
  S.players = [{ name: '나', me: true }].concat([0, 1, 2].map(() => ({ name: names.pop(), ai: true, d: S.diff })));
  S.me = 0;
  resetBoard();
  const m = spawnMap(S.players.length);
  for (const i in m) setCell(+i, m[i], false);
  const t = S.now();
  S.phase = 'opening'; S.startAt = t + OPEN_MS; S.endAt = S.startAt + GAME_MS;
  S.itemNext = S.startAt + 5000;
  S.players.forEach((p, k) => { if (p.ai) S.aiNext[k] = S.startAt + 300 + rnd() * 500; });
  S.lastSec = null; S.lastOpenSec = null;
  renderPlayers(true);
  setStatus('내 땅에 붙은 칸을 눌러 칠하세요!');
}
function localTick(t) {
  if (S.phase === 'opening' && t >= S.startAt) S.phase = 'play';
  if (S.phase !== 'play') return;
  S.players.forEach((p, k) => {
    if (!p.ai || t < (S.aiNext[k] || 0)) return;
    const i = aiThink(k, t);
    if (i >= 0) S.backend.paint(k, i);
    S.aiNext[k] = t + aiDelay(k, t);
  });
  if (t >= S.itemNext) { const it = spawnItem(t); if (it) S.items[it.id] = { i: it.i, k: it.k }; S.itemNext = t + 5000 + rnd() * 4000; }
  if (t >= S.endAt) { S.phase = 'result'; finishLocal(); }
}
function standings() {
  return S.players.map((p, k) => ({ k, name: p.name, c: S.cnt[k], human: !p.ai })).sort((a, b) => b.c - a.c);
}
function finishLocal() {
  SFX.end(); banner('끝!');
  setTimeout(() => {
    if (S.mode !== 'local') return;
    const st = standings();
    const myPos = st.findIndex(r => r.k === S.me);
    const rank = st.filter(r => r.c > S.cnt[S.me]).length + 1;
    const pct = Math.round(S.cnt[S.me] / CELLS * 100);
    const best = store.get('best', 0), wins = store.get('wins', 0) + (rank === 1 ? 1 : 0);
    if (pct > best) store.set('best', pct);
    store.set('wins', wins); store.set('plays', store.get('plays', 0) + 1);
    if (rank === 1) SFX.fanfare(); else SFX.sad();
    showResult({
      title: rank === 1 ? '🏆 우승!' : `${rank}위`,
      desc: rank === 1 ? `판의 <b>${pct}%</b>를 내 색으로 물들였어요!` : `내 땅은 <b>${pct}%</b>. ${myPos === 1 ? '아깝다! 한 번 더!' : '다시 도전해 볼까요?'}`,
      list: st, best: (pct > best ? '🎉 최고 기록! ' : '') + `최고 점유율 ${Math.max(best, pct)}% · 우승 ${wins}회`,
      buttons: [['다시 하기', '', () => { hideAll(); startLocal(); }], ['처음으로', 'blue', goHome]]
    });
  }, 1300);
}

/* ───────── 화면 ───────── */
const cvs = $('board'), ctx = cvs.getContext('2d');
let W = 300, CS = 18, DPR = 1;
function resize() {
  const wrap = $('boardwrap').clientWidth || 300;
  const avail = window.innerHeight - 230;
  W = Math.max(260, Math.min(wrap, 600, Math.max(avail, 300)));
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cvs.style.width = W + 'px'; cvs.style.height = W + 'px';
  cvs.width = W * DPR; cvs.height = W * DPR;
  CS = W / N;
}
window.addEventListener('resize', resize);
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const DARK = COLORS.map(c => shade(c, -.25));
function burst(i, color, n, sp = 1) {
  const cx = (i % N + .5) * CS, cy = (((i / N) | 0) + .5) * CS;
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2, v = (.6 + rnd() * 1.8) * sp * CS / 10;
    S.particles.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - .5, r: (1.5 + rnd() * 2.5) * CS / 18, life: 1, c: color });
  }
  if (S.particles.length > 400) S.particles.splice(0, S.particles.length - 400);
}
let shakeT = 0;
function shake() { shakeT = performance.now(); }
const easeBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

function render() {
  const pn = performance.now(), t = S.now();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  let sx = 0, sy = 0;
  if (pn - shakeT < 300) { const k = (1 - (pn - shakeT) / 300) * 5; sx = (rnd() - .5) * k; sy = (rnd() - .5) * k; }
  ctx.clearRect(0, 0, W, W);
  ctx.save(); ctx.translate(sx, sy);
  const g = Math.max(1, CS * .07), rad = CS * .22;
  const play = S.phase === 'play' && S.me >= 0;
  for (let i = 0; i < CELLS; i++) {
    const x = (i % N) * CS, y = ((i / N) | 0) * CS, o = S.cells[i];
    if (o < 0) {
      ctx.fillStyle = ((i % N) + ((i / N) | 0)) % 2 ? '#f4ede1' : '#efe6d6';
      rr(x + g, y + g, CS - 2 * g, CS - 2 * g, rad); ctx.fill();
      continue;
    }
    const age = pn - S.anim[i];
    const sc = age < 220 ? .55 + .45 * easeBack(Math.min(1, age / 220)) : 1;
    const w = (CS - 2 * g) * sc, off = (CS - w) / 2;
    ctx.fillStyle = DARK[o]; rr(x + off, y + off + CS * .05, w, w, rad); ctx.fill();
    ctx.fillStyle = COLORS[o]; rr(x + off, y + off, w, w - CS * .05, rad); ctx.fill();
    if (shielded(o, t)) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(1.5, CS * .1); rr(x + off + 2, y + off + 2, w - 4, w - 4 - CS * .05, rad * .8); ctx.stroke(); }
  }
  // 칠할 수 있는 칸 안내
  if (play && S.cnt[S.me] > 0) {
    ctx.strokeStyle = COLORS[S.me]; ctx.globalAlpha = .55 + .25 * Math.sin(pn / 180); ctx.lineWidth = Math.max(1.2, CS * .08);
    ctx.setLineDash([CS * .18, CS * .12]);
    for (let i = 0; i < CELLS; i++) {
      if (!canPaint(S.me, i, t)) continue;
      const x = (i % N) * CS, y = ((i / N) | 0) * CS;
      rr(x + g * 1.6, y + g * 1.6, CS - 3.2 * g, CS - 3.2 * g, rad); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // 아이템
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.round(CS * .72)}px sans-serif`;
  for (const id in S.items) {
    const it = S.items[id]; if (!it) continue;
    const x = (it.i % N + .5) * CS, y = (((it.i / N) | 0) + .5) * CS + Math.sin(pn / 220 + it.i) * CS * .08;
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x, y, CS * .46, 0, 7); ctx.fill();
    ctx.fillText(ITEM_ICON[it.k] || '?', x, y + 1);
  }
  // 시작 전 이름표
  if (S.phase === 'opening') {
    ctx.font = `900 ${Math.round(Math.max(11, CS * .62))}px 'Noto Sans KR',sans-serif`;
    S.players.forEach((p, k) => {
      const [x0, y0] = SPAWN[k], x = (x0 + 1) * CS, y = (y0 + (y0 > 8 ? -0.6 : 2.6)) * CS;
      const txt = (k === S.me ? '▼ 나' : p.name);
      const w = ctx.measureText(txt).width + 12;
      ctx.fillStyle = k === S.me ? '#2b2140' : 'rgba(255,255,255,.92)'; rr(x - w / 2, y - CS * .45, w, CS * .9, CS * .3); ctx.fill();
      ctx.fillStyle = k === S.me ? '#ffd23f' : COLORS[k]; ctx.fillText(txt, x, y + 1);
    });
  }
  // 물감 튀기기
  for (let k = S.particles.length - 1; k >= 0; k--) {
    const q = S.particles[k];
    q.x += q.vx; q.y += q.vy; q.vy += .12; q.vx *= .96; q.life -= .035;
    if (q.life <= 0) { S.particles.splice(k, 1); continue; }
    ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* 점수 막대, 참가자 목록, 타이머 */
let lastUI = 0;
function renderPlayers(force) {
  const box = $('players');
  if (force || box.children.length !== S.players.length) {
    box.innerHTML = S.players.map((p, k) => `<div class="pc${k === S.me ? ' me' : ''}${!p.ai && k !== S.me && S.mode === 'online' ? ' human' : ''}" data-k="${k}"><span class="dot" style="background:${COLORS[k]}"></span><span class="nm">${esc(k === S.me ? p.name + ' (나)' : p.name)}</span><span class="pct">0%</span></div>`).join('');
    $('scorebar').innerHTML = S.players.map((p, k) => `<i data-k="${k}" class="${k === S.me ? 'me' : ''}" style="background:${COLORS[k]};width:0"></i>`).join('');
  }
}
function updateUI(t) {
  if (performance.now() - lastUI < 120) return;
  lastUI = performance.now();
  [...$('scorebar').children].forEach(el => { el.style.width = (S.cnt[+el.dataset.k] / CELLS * 100) + '%'; });
  [...$('players').children].forEach(el => {
    const k = +el.dataset.k, e = S.eff[k] || {};
    el.querySelector('.pct').textContent = Math.round(S.cnt[k] / CELLS * 100) + '%' + (e.bolt > t ? ' ⚡' : '') + (e.shield > t ? ' 🛡️' : '');
  });
  // 타이머
  let sec = 60;
  if (S.phase === 'play') sec = Math.max(0, Math.ceil((S.endAt - t) / 1000));
  else if (S.phase === 'result' || S.phase === 'ended') sec = 0;
  $('tsec').textContent = sec;
  $('timer').classList.toggle('hurry', S.phase === 'play' && sec <= 10);
  if (S.phase === 'play' && sec !== S.lastSec) { S.lastSec = sec; if (sec <= 10 && sec > 0) SFX.hurry(); }
  // 시작 카운트다운
  if (S.phase === 'opening') {
    const s = Math.ceil((S.startAt - t) / 1000);
    if (s !== S.lastOpenSec && s >= 1 && s <= 3) { S.lastOpenSec = s; banner(String(s)); SFX.tick(); }
  } else if (S.phase === 'play' && S.lastOpenSec !== 0) { S.lastOpenSec = 0; banner('시작!'); SFX.go(); }
  // 내 효과
  if (S.me >= 0 && S.phase === 'play') {
    const e = S.eff[S.me] || {}, b = [];
    if (e.bolt > t) b.push(`<span class="badge bolt">⚡ 번개 ${Math.ceil((e.bolt - t) / 1000)}</span>`);
    if (e.shield > t) b.push(`<span class="badge shield">🛡️ 방패 ${Math.ceil((e.shield - t) / 1000)}</span>`);
    const html = b.length ? b.join(' ') : (S.cnt[S.me] ? '점선 칸을 눌러 땅을 넓히세요!' : '땅을 모두 잃었어요! 아무 칸이나 눌러 다시 시작!');
    if ($('status').innerHTML !== html) $('status').innerHTML = html;
  }
}
function setStatus(h) { $('status').innerHTML = h; }
function banner(txt, small) {
  const b = $('banner'); b.className = 'banner'; b.textContent = txt; void b.offsetWidth; b.className = 'banner show' + (small ? ' small' : '');
}
function toast(html) {
  const box = $('toasts'), d = document.createElement('div');
  d.className = 'toast'; d.innerHTML = html; box.appendChild(d);
  setTimeout(() => d.remove(), 2300);
  while (box.children.length > 3) box.firstChild.remove();
}

/* ───────── 입력 ───────── */
let down = false, hover = -1;
function cellAt(e) {
  const r = cvs.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / (r.width / N)), y = Math.floor((e.clientY - r.top) / (r.height / N));
  return x < 0 || y < 0 || x >= N || y >= N ? -1 : y * N + x;
}
function myPaint(i) {
  if (i < 0 || S.phase !== 'play' || S.me < 0 || !S.backend) return;
  const t = S.now();
  if (t - (S.lastPaint[S.me] || 0) < cooldown(S.me, t)) return;
  if (!canPaint(S.me, i, t)) return;
  S.lastPaint[S.me] = t;
  if (S.backend.paint(S.me, i) !== false) SFX.pop();
}
cvs.addEventListener('pointerdown', e => { ac(); down = true; hover = cellAt(e); try { cvs.setPointerCapture(e.pointerId); } catch (x) {} myPaint(hover); e.preventDefault(); });
cvs.addEventListener('pointermove', e => { if (!down) return; hover = cellAt(e); myPaint(hover); });
['pointerup', 'pointercancel'].forEach(ev => cvs.addEventListener(ev, () => { down = false; hover = -1; }));

/* ───────── 메인 루프 ───────── */
function loop() {
  const t = S.now();
  if (S.mode === 'local') localTick(t);
  if (PG.onTick) PG.onTick(t);
  if (down && hover >= 0) myPaint(hover);
  render();
  if (S.mode !== 'idle') updateUI(t);
  requestAnimationFrame(loop);
}

/* ───────── 오버레이 ───────── */
function hideAll() { ['ovTitle', 'ovNick', 'ovLobby', 'ovResult'].forEach(i => $(i).classList.remove('show')); }
function showResult(o) {
  $('resTitle').textContent = o.title;
  $('resDesc').innerHTML = o.desc || '';
  $('resRank').innerHTML = (o.list || []).map((r, idx, arr) => {
    const rank = arr.filter(x => x.c > r.c).length + 1;
    return `<li class="${r.k === S.me ? 'me' : ''}"><span class="no">${rank === 1 ? '👑' : rank}</span><span class="dot" style="background:${COLORS[r.k]}"></span><span class="nm">${esc(r.name)}${r.k === S.me ? ' (나)' : ''}</span><span class="pc2">${Math.round(r.c / CELLS * 100)}%</span></li>`;
  }).join('');
  $('resBest').textContent = o.best || '';
  const box = $('resBtns'); box.innerHTML = '';
  (o.buttons || []).forEach(([txt, cls, fn]) => { const b = document.createElement('button'); b.className = 'btn sm ' + cls; b.textContent = txt; b.onclick = fn; box.appendChild(b); });
  $('ovResult').classList.add('show');
}
function refreshBest() {
  const best = store.get('best', 0), wins = store.get('wins', 0), plays = store.get('plays', 0);
  $('bestTxt').textContent = plays ? `내 기록: 최고 점유율 ${best}% · 우승 ${wins}회 · ${plays}판` : '처음 오셨군요! AI 3명과 땅을 다퉈 보세요.';
}
function idleBoard() {
  S.mode = 'idle'; S.phase = 'idle'; S.me = -1; S.players = [];
  resetBoard();
  // 대기 화면용 무늬
  const m = spawnMap(4);
  for (const i in m) setCell(+i, m[i], false);
  for (let k = 0; k < 70; k++) { const i = ri(CELLS); setCell(i, ri(4), false); }
  $('players').innerHTML = ''; $('scorebar').innerHTML = '';
  $('tsec').textContent = 60; $('timer').classList.remove('hurry');
  setStatus('내 땅에 붙은 칸을 눌러 칠하세요!');
}
function goHome() {
  hideAll(); idleBoard(); refreshBest();
  $('onBar').classList.remove('show');
  $('ovTitle').classList.add('show');
}
function setMute(m) { muted = m; store.set('mute', m); $('muteBtn').textContent = m ? '🔇' : '🔊'; }
$('muteBtn').onclick = () => { setMute(!muted); if (!muted) { ac(); SFX.pop(); } };
[...$('diffSeg').children].forEach(b => {
  b.classList.toggle('on', b.dataset.d === S.diff);
  b.onclick = () => { S.diff = b.dataset.d; store.set('diff', S.diff); [...$('diffSeg').children].forEach(x => x.classList.toggle('on', x === b)); };
});
$('soloBtn').onclick = () => { ac(); startLocal(); };
$('onlineBtn').onclick = () => { ac(); if (PG.onlineStart) PG.onlineStart(); };

/* 함께 하기(online.js)와 공유 */
const PG = window.PG = {
  S, N, CELLS, COLORS, AI_NAMES, ITEM_ICON, GAME_MS, OPEN_MS, EFF_MS, store, SFX, rnd, ri, pick, shuffle, esc,
  resetBoard, spawnMap, setCell, itemAt, shielded, cooldown, canPaint, bombCells, aiThink, aiDelay, itemFx, spawnItem,
  standings, renderPlayers, setStatus, banner, toast, hideAll, showResult, goHome, idleBoard, refreshBest, ac,
  onTick: null, onlineStart: null
};

setMute(muted);
resize();
idleBoard();
refreshBest();
requestAnimationFrame(loop);
setTimeout(resize, 300);
})();