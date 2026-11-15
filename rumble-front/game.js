/* 난투 전선 (Rumble Front) - 2단계 코어 완성판
 * © 쉬는시간 오락실 (smile-willow.tistory.com). 무단 복제·배포 금지.
 * 구조: 결정론 시뮬레이션(고정 틱 20Hz + 시드 난수 + 입력 큐)
 *       → PixiJS v8 (WebGPU 우선, WebGL 대체) 월드 렌더링 + Canvas2D HUD 오버레이
 */
'use strict';
(() => {
const W = 960, H = 540;
const FT = 182, FB = 428;
const TICK = 1 / 20;
const WAVES = 20, WAVE_GAP = 14, TIME_LIMIT = 360, STAR_TIME = 240;

const hud = document.getElementById('hud');
const ctx = hud.getContext('2d');
const gcv = document.getElementById('game');
let scale = 1, dpr = 1;

/* ================= 데이터 ================= */
const UNITS = {
  footman: { name: '보병', role: '근접', cost: 2, count: 3, hp: 125, atk: 14, rate: .8, range: 18, spd: 46, r: 9, kb: 2 },
  knight:  { name: '기사', role: '돌격', cost: 4, count: 1, hp: 440, atk: 30, rate: 1.1, range: 22, spd: 36, r: 13, kb: 11 },
  archer:  { name: '궁수', role: '원거리', cost: 3, count: 2, hp: 72, atk: 16, rate: 1.15, range: 170, spd: 40, r: 9, proj: 'arrow' },
  mage:    { name: '마법사', role: '광역', cost: 5, count: 1, hp: 95, atk: 34, rate: 1.9, range: 150, spd: 34, r: 10, proj: 'fire', aoe: 52 },
  priest:  { name: '사제', role: '회복', cost: 4, count: 1, hp: 115, atk: 8, rate: 1.4, range: 135, spd: 36, r: 10, proj: 'holy', heal: 26 },
  catapult:{ name: '투석기', role: '공성', cost: 6, count: 1, hp: 250, atk: 55, rate: 3.2, range: 270, spd: 22, r: 16, proj: 'rock', aoe: 60, siege: 2.6 },
};
const ENEMIES = {
  goblin: { name: '고블린', hp: 70, atk: 10, rate: .7, range: 16, spd: 56, r: 8 },
  orc:    { name: '오크 전사', hp: 270, atk: 23, rate: 1.1, range: 20, spd: 36, r: 12, kb: 4 },
  skel:   { name: '해골 궁수', hp: 60, atk: 14, rate: 1.3, range: 160, spd: 38, r: 9, proj: 'arrow' },
  wolf:   { name: '늑대 기수', hp: 170, atk: 16, rate: .8, range: 18, spd: 82, r: 12 },
  shaman: { name: '어둠 주술사', hp: 95, atk: 27, rate: 2, range: 140, spd: 32, r: 10, proj: 'dark', aoe: 45 },
  bat:    { name: '흡혈 박쥐', hp: 45, atk: 9, rate: .7, range: 16, spd: 72, r: 8, fly: true },
  golem:  { name: '돌 골렘', hp: 1100, atk: 46, rate: 1.8, range: 24, spd: 18, r: 18, kb: 8, armor: .5 },
  troll:  { name: '트롤', hp: 760, atk: 40, rate: 1.6, range: 26, spd: 26, r: 17, kb: 12, cleave: 34 },
  ogre:   { name: '오우거 군주', hp: 3300, atk: 78, rate: 2, range: 34, spd: 20, r: 26, kb: 22, cleave: 60, boss: true },
  lich:   { name: '해골 왕', hp: 3000, atk: 36, rate: 2.4, range: 170, spd: 18, r: 20, proj: 'dark', aoe: 50, boss: true, summon: true },
  dragon: { name: '어둠의 드래곤', hp: 4600, atk: 70, rate: 2, range: 40, spd: 16, r: 30, kb: 20, cleave: 60, boss: true, breath: true },
};
const POOL_W = { goblin: 3, orc: 2, skel: 2, wolf: 2, shaman: 1.2, bat: 2, golem: .7, troll: .5 };
const COST = { goblin: 1, skel: 1, bat: 1, orc: 2.2, wolf: 2.2, shaman: 2.5, golem: 5, troll: 5 };
const CMDS = {
  guardian: { name: '철벽 기사', role: '수호', hp: 950, atk: 34, rate: 1, range: 22, spd: 34, r: 14, kb: 10,
    desc: '아군이 받는 피해 -15%', ult: '불굴의 함성', ultDesc: '아군 3초 무적 + 적 밀쳐내기' },
  witch:    { name: '폭풍 마녀', role: '파괴', hp: 480, atk: 30, rate: 1.4, range: 180, spd: 34, r: 11, proj: 'bolt', aoe: 40,
    desc: '아군 원거리 사거리 +20%', ult: '번개 폭풍', ultDesc: '적 14곳에 번개 낙하' },
  druid:    { name: '숲의 사제', role: '지원', hp: 600, atk: 16, rate: 1.4, range: 150, spd: 34, r: 11, proj: 'holy', heal: 30,
    desc: '자원 회복 속도 +20%', ult: '생명의 숲', ultDesc: '아군 전체 회복 + 자원 +5' },
};
// 지휘관 특성 (Lv5 / Lv10 / Lv15 에 하나씩 선택)
const TALENTS = {
  guardian: [
    { lv: 5,  a: ['강철 갑주', '기사 체력 +20%'], b: ['선봉대', '보병 공격력 +20%'] },
    { lv: 10, a: ['굳건한 의지', '궁극기 무적 4초'], b: ['진동의 함성', '밀쳐내기 피해 2배'] },
    { lv: 15, a: ['난공불락', '기지 체력 +30%'], b: ['불사의 기사', '지휘관 부활 6초'] },
  ],
  witch: [
    { lv: 5,  a: ['화염 확산', '마법사 폭발 범위 +25%'], b: ['속사', '궁수 공격 속도 +20%'] },
    { lv: 10, a: ['천둥 군단', '번개 20줄기'], b: ['과충전', '번개 피해 +40%'] },
    { lv: 15, a: ['폭풍의 눈', '궁극기 충전 +30%'], b: ['대마녀', '지휘관 사거리·공격 +30%'] },
  ],
  druid: [
    { lv: 5,  a: ['축복', '사제 회복량 +30%'], b: ['풍요', '시작 자원 +4'] },
    { lv: 10, a: ['완전한 생명', '궁극기 회복 100%'], b: ['숲의 선물', '궁극기 자원 +8'] },
    { lv: 15, a: ['대지의 창고', '자원 최대 25'], b: ['재생의 숨결', '아군 매초 체력 1% 회복'] },
  ],
};
const CHAPTERS = [
  { name: '1장 푸른 초원', sky: ['#5aa4dd', '#cbe8f4'], mt: ['#8fa7c7', '#6f8fb3'], ground: ['#5f9e45', '#3f7a32'], road: ['#b8925a', '#c9a66b', '#a8834e'], tree: ['#2f6a35', '#3a7a3a', '#285e30'], tuft: 'rgba(40,90,30,.8)', cloud: 'rgba(255,255,255,.8)', weather: 'leaf', vig: .18 },
  { name: '2장 황혼의 황무지', sky: ['#d9683e', '#f6c58a'], mt: ['#b0705a', '#8a4a44'], ground: ['#b48a4a', '#8a6236'], road: ['#d8b47a', '#e6c48a', '#c09a5a'], tree: ['#6a4a2a', '#7a5432', '#5a3a20'], tuft: 'rgba(110,80,40,.7)', cloud: 'rgba(255,220,190,.55)', weather: 'sand', vig: .3, dead: true },
  { name: '3장 얼어붙은 고개', sky: ['#7a9ac0', '#e2eef8'], mt: ['#eef4fa', '#b8c8dc'], ground: ['#e4ecf4', '#b9c9da'], road: ['#c6d2de', '#d8e2ec', '#aebccc'], tree: ['#2a4a50', '#35585e', '#203a40'], tuft: 'rgba(150,170,190,.8)', cloud: 'rgba(255,255,255,.75)', weather: 'snow', vig: .22, snowy: true },
  { name: '4장 어둠의 화산성', sky: ['#1e0a14', '#7a2a1a'], mt: ['#3a1a1a', '#281010'], ground: ['#3c2a28', '#241614'], road: ['#5a4038', '#6a4a40', '#4a3028'], tree: ['#1a0f0f', '#2a1515', '#150a0a'], tuft: 'rgba(90,50,40,.8)', cloud: 'rgba(90,40,40,.5)', weather: 'ember', vig: .5, lava: true },
];
const ALL = ['goblin', 'orc', 'skel', 'wolf', 'shaman', 'bat', 'golem', 'troll'];
const STAGES = [null,
  { ch: 0, pool: ['goblin', 'orc', 'skel'], mini: null, boss: 'troll' },
  { ch: 0, pool: ['goblin', 'orc', 'skel', 'troll'], mini: null, boss: 'troll' },
  { ch: 0, pool: ['goblin', 'orc', 'skel', 'troll'], mini: 'troll', boss: 'ogre' },
  { ch: 1, pool: ['goblin', 'orc', 'skel', 'wolf', 'shaman', 'troll'], mini: 'troll', boss: 'ogre' },
  { ch: 1, pool: ['goblin', 'orc', 'skel', 'wolf', 'shaman', 'troll'], mini: 'troll', boss: 'lich' },
  { ch: 1, pool: ['orc', 'skel', 'wolf', 'shaman', 'troll'], mini: 'troll', boss: 'lich' },
  { ch: 2, pool: ['orc', 'skel', 'wolf', 'shaman', 'bat', 'golem', 'troll'], mini: 'golem', boss: 'lich' },
  { ch: 2, pool: ['orc', 'skel', 'wolf', 'shaman', 'bat', 'golem', 'troll'], mini: 'golem', boss: 'ogre' },
  { ch: 3, pool: ALL, mini: 'lich', boss: 'dragon' },
  { ch: 3, pool: ALL, mini: 'ogre', boss: 'dragon' },
];
const DECK = ['footman', 'knight', 'archer', 'mage', 'priest', 'catapult'];
const AUTO_ORDER = ['footman', 'archer', 'knight', 'footman', 'priest', 'mage', 'archer', 'catapult', 'knight', 'mage'];
const EVO_LV = 10;

/* ================= 저장 (게스트 ID, 기기별) ================= */
const SAVE_KEY = 'rumblefront_save_v1';
const MAXLV = 20;
const xpNeed = l => Math.round(40 * Math.pow(l, 1.35));
const lvlMult = l => (1 + .08 * (l - 1)) * (l >= EVO_LV ? 1.1 : 1);
function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
  s = s || {};
  s.guest = s.guest || ('G-' + Math.random().toString(36).slice(2, 10).toUpperCase());
  s.units = s.units || {}; DECK.forEach(k => s.units[k] = s.units[k] || { lvl: 1, xp: 0 });
  s.cmds = s.cmds || {}; Object.keys(CMDS).forEach(k => { s.cmds[k] = s.cmds[k] || { lvl: 1, xp: 0 }; s.cmds[k].tal = s.cmds[k].tal || {}; });
  s.cleared = s.cleared || 0; s.cmd = s.cmd || 'guardian'; s.stage = s.stage || 1; s.stars = s.stars || {};
  s.tipDrag = s.tipDrag || 0;
  s.pvp = s.pvp || { r: 1000, w: 0, l: 0, d: 0 };
  return s;
}
const save = loadSave();
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
function addXp(o, n) { let ups = 0; o.xp += n; while (o.lvl < MAXLV && o.xp >= xpNeed(o.lvl)) { o.xp -= xpNeed(o.lvl); o.lvl++; ups++; } if (o.lvl >= MAXLV) o.xp = 0; return ups; }
function talentsOf(cmdKey) { const c = save.cmds[cmdKey], t = {}; TALENTS[cmdKey].forEach((row, i) => { if (c.lvl >= row.lv && c.tal[i]) t[i] = c.tal[i]; }); return t; }

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ================= 시뮬레이션 (결정론) =================
 * 모든 기기가 같은 입력으로 같은 결과를 계산한다 (락스텝).
 * 그래서 이 구역에서는 Math.random·Math.hypot 등 기기마다 다를 수 있는 함수를 쓰지 않는다.
 */
const OWN_COL = ['#5faaff', '#6adf7a', '#ffa04a', '#c78aff'];
const TURN = 3, LAG = 2;              // 멀티: 3틱(0.15초)마다 한 묶음, 2묶음 앞서 확정
const hyp = (x, y) => Math.sqrt(x * x + y * y);
let G = null, ME = 0, NETMODE = false;

function profileOf(cmd) {
  const units = {}; DECK.forEach(k => units[k] = save.units[k].lvl);
  return { cmd, lv: { units, cmd: save.cmds[cmd].lvl }, tal: talentsOf(cmd), rt: save.pvp.r };
}
const PVP_LIMIT = 300;                 // 대결 제한 시간 5분
let MYTEAM = 0;
function teamAura(roster) {
  const roles = new Set(roster.map(r => r.cmd));
  return { guardian: roles.has('guardian'), witch: roles.has('witch'), druid: roles.has('druid'), trinity: roles.size === 3 };
}
// 대결 레벨 보정: 같은 병종끼리 레벨 차이를 절반만 반영
function pvpLevels(roster) {
  const avg = k => roster.reduce((a, r) => a + (k === 'cmd' ? r.lv.cmd : (r.lv.units[k] || 1)), 0) / roster.length;
  const av = { cmd: avg('cmd') }; DECK.forEach(k => av[k] = avg(k));
  return roster.map(r => { const units = {}; DECK.forEach(k => units[k] = ((r.lv.units[k] || 1) + av[k]) / 2); return Object.assign({}, r, { lv: { units, cmd: (r.lv.cmd + av.cmd) / 2 }, rawLv: r.lv }); });
}
function newGame(stage, roster, seed, opts) {
  opts = opts || {};
  const pvp = opts.mode === 'pvp';
  if (pvp) roster = pvpLevels(roster);
  const n = roster.length;
  const st = pvp ? { ch: seed % 4, pool: [], mini: null, boss: 'troll' } : STAGES[stage];
  const g = {
    mode: pvp ? 'pvp' : 'pve', stage, st, ch: st.ch, seed, tick: 0, time: 0, rng: mulberry32(seed), nextId: 1, n,
    units: [], structs: [], projs: [], spawnQ: [], inputs: [],
    waveIdx: 0, waveTimer: 4, inv: [0, 0], over: null, overT: 0, winner: -1, bossSpawned: false, lastUlt: null, reinf: 12,
    stats: { enemyKills: 0, captured: 0, bossKilled: false },
  };
  const teamOf = r => pvp ? (r.tm | 0) : 0;
  g.auraT = [teamAura(roster.filter(r => teamOf(r) === 0)), teamAura(roster.filter(r => teamOf(r) === 1))];
  g.aura = g.auraT[0];
  const tcount = [0, 0];
  g.P = roster.map((r, i) => {
    const T = r.tal || {}, team = teamOf(r);
    const p = { i, uid: r.uid, nm: r.nm, rt: r.rt, team, ti: tcount[team]++, cmdKey: r.cmd, lv: r.lv, tal: T, mana: 7, manaMax: 20, ult: 0, hero: null, heroRespawn: 0,
      cardCd: [0, 0, 0, 0, 0, 0], auto: !!r.ai, ai: !!r.ai, autoIdx: 0, left: false, stats: { kills: {}, deploys: {}, cmdKills: 0 } };
    if (r.cmd === 'druid' && T[0] === 'b') p.mana += 4;
    if (r.cmd === 'druid' && T[2] === 'a') p.manaMax = 25;
    return p;
  });
  g.tsize = tcount;
  const anyTal = (cmd, i, o, team) => g.P.some(p => p.cmdKey === cmd && p.tal[i] === o && (team == null || p.team === team));
  g.regenT = [anyTal('druid', 2, 'b', 0), anyTal('druid', 2, 'b', 1)];
  const S = (o) => { o.id = g.nextId++; o.alive = true; o.cd = 0; o.flash = 0; g.structs.push(o); return o; };
  if (pvp) {
    // 좌우 대칭 전장: [성][거점] ······ [거점][성]
    g.cap = n <= 2 ? 50 : 35;
    const bh = t => 6000 * (1 + .4 * (g.tsize[t] - 1)) * (anyTal('guardian', 2, 'a', t) ? 1.3 : 1);
    const b0 = S({ team: 0, kind: 'base', x: 64, y: 305, hp: bh(0), maxhp: bh(0), r: 38, atk: 24, range: 175, rate: 1.2, shieldable: true });
    const b1 = S({ team: 1, kind: 'base', x: W - 64, y: 305, hp: bh(1), maxhp: bh(1), r: 38, atk: 24, range: 175, rate: 1.2, shieldable: true });
    S({ team: 0, kind: 'outpost', x: 262, y: 305, hp: 3600, maxhp: 3600, r: 28, atk: 18, range: 185, rate: 1.3 });
    S({ team: 1, kind: 'outpost', x: W - 262, y: 305, hp: 3600, maxhp: 3600, r: 28, atk: 18, range: 185, rate: 1.3 });
    g.bases = [b0, b1]; g.base = b0; g.core = b1;
  } else {
    g.cap = n === 1 ? 60 : n === 2 ? 40 : 30;
    const diff = 1 + .15 * (stage - 1), sm = 1 + .7 * (n - 1);
    g.diff = diff;
    g.eMult = (1 + .09 * (stage - 1)) * (1 + .55 * (n - 1));
    g.eCount = 1 + .55 * (n - 1);
    const bhp = 2500 * (1 + .1 * (stage - 1)) * (1 + .3 * (n - 1)) * (anyTal('guardian', 2, 'a') ? 1.3 : 1);
    g.base = S({ team: 0, kind: 'base', x: 64, y: 305, hp: bhp, maxhp: bhp, r: 38, atk: 22 * (1 + .1 * (stage - 1)), range: 175, rate: 1.2 });
    S({ team: 1, kind: 'outpost', x: 612, y: 305, hp: 3200 * diff * sm, maxhp: 3200 * diff * sm, r: 28, atk: 17 * diff, range: 185, rate: 1.3 });
    S({ team: 1, kind: 'outpost', x: 748, y: 305, hp: 3600 * diff * sm, maxhp: 3600 * diff * sm, r: 28, atk: 18 * diff, range: 185, rate: 1.3 });
    g.core = S({ team: 1, kind: 'core', x: 888, y: 305, hp: 8000 * diff * sm, maxhp: 8000 * diff * sm, r: 44, atk: 26 * diff, range: 210, rate: 1.5, shieldable: true });
    g.bases = [g.base, g.core];
  }
  g.P.forEach(p => spawnHero(g, p));
  return g;
}
function soloRoster() { return [{ uid: 'me', nm: '나', ...profileOf(save.cmd) }]; }

function makeUnit(g, team, type, def, x, y, m, p) {
  const ranged = !!def.proj;
  let range = def.range, rate = def.rate, aoe = def.aoe || 0, hp = def.hp * m, atk = def.atk * m, heal = def.heal ? def.heal * m : 0;
  if (p) {
    const T = p.tal, c = p.cmdKey;
    const A = g.auraT[p.team];
    if (A.trinity) { hp *= 1.05; atk *= 1.05; heal *= 1.05; }
    if (ranged && A.witch) range *= 1.2;
    if (c === 'guardian') { if (type === 'knight' && T[0] === 'a') hp *= 1.2; if (type === 'footman' && T[0] === 'b') atk *= 1.2; }
    if (c === 'witch') { if (type === 'mage' && T[0] === 'a') aoe *= 1.25; if (type === 'archer' && T[0] === 'b') rate *= .8; if (type === 'hero_witch' && T[2] === 'b') { range *= 1.25; atk *= 1.3; } }
    if (c === 'druid' && type === 'priest' && T[0] === 'a') heal *= 1.3;
  }
  const u = {
    id: g.nextId++, team, type, o: p ? p.i : -1, x, y, vx: 0, vy: 0, hp, maxhp: hp, atk, rate, range, spd: def.spd, r: def.r,
    kb: def.kb || 0, proj: def.proj || null, aoe, heal, siege: def.siege || 1, cleave: def.cleave || 0,
    boss: !!def.boss, fly: !!def.fly, armor: def.armor || 0, summon: !!def.summon, breath: !!def.breath, sk: 4,
    cd: .3 + g.rng() * .5, target: null, flash: 0, atk_t: 0, walk: g.rng() * 4, alive: true, moving: false, evo: false,
  };
  g.units.push(u);
  return u;
}
function spawnHero(g, p) {
  const c = CMDS[p.cmdKey];
  const y = 305 + (p.ti - (g.tsize[p.team] - 1) / 2) * 44;
  const u = makeUnit(g, p.team, 'hero_' + p.cmdKey, c, p.team === 0 ? 118 : W - 118, y, lvlMult(p.lv.cmd), p);
  u.hero = true; p.hero = u;
  fxBurst(u.x, u.y - 20, '#ffe68a', 18, 120);
}

function applyInput(g, inp) {
  const pi = inp.p | 0, p = g.P[pi];
  if (!p) return;
  if (inp.type === 'card') deploy(g, pi, inp.slot | 0, inp.x, inp.y);
  else if (inp.type === 'ult') castUlt(g, pi);
  else if (inp.type === 'auto') p.auto = !p.auto;
  else if (inp.type === 'leave' && !p.left) { p.left = true; p.auto = true; banner(p.nm + ' 님이 나갔어요 · 자동 전투로 전환', '#ffb2b2'); }
}
// 소환 가능한 앞쪽 한계 (점령한 거점까지 넓어짐)
function deployMax(g, team) {
  team = team | 0;
  if (team === 0) { let m = 330; for (const s of g.structs) if (s.alive && s.team === 0 && s.kind === 'outpost') m = Math.max(m, s.x - 40); return m; }
  let m = W - 330; for (const s of g.structs) if (s.alive && s.team === 1 && s.kind === 'outpost') m = Math.min(m, s.x + 40); return m;
}
function ownCount(g, pi) { let c = 0; for (const u of g.units) if (u.o === pi && !u.hero) c++; return c; }
function deploy(g, pi, slot, px, py) {
  const p = g.P[pi], k = DECK[slot], d = UNITS[k];
  if (!d || p.mana < d.cost || p.cardCd[slot] > 0) return false;
  if (ownCount(g, pi) + d.count > g.cap) { if (pi === ME) floatTxt(UI.card(slot).x + 32, 452, '병력이 너무 많아요', '#ff9a9a', false, 0, true); return false; }
  p.mana -= d.cost; p.cardCd[slot] = .7;
  const lv = p.lv.units[k] || 1, m = lvlMult(lv);
  const placed = px != null, L = p.team === 0, lim = deployMax(g, p.team);
  const cx = placed ? (L ? Math.max(100, Math.min(lim, px)) : Math.min(W - 100, Math.max(lim, px))) : 0;
  const cy = placed ? Math.max(FT + 6, Math.min(FB - 6, py)) : 0;
  for (let i = 0; i < d.count; i++) {
    const bx = 104 + g.rng() * 24;
    const x = placed ? cx + (g.rng() - .5) * 26 : (L ? bx : W - bx);
    const y = placed ? Math.max(FT, Math.min(FB, cy + (g.rng() - .5) * 34)) : FT + 18 + g.rng() * (FB - FT - 36);
    const u = makeUnit(g, p.team, k, d, x, y, m, p);
    u.evo = lv >= EVO_LV;
    fxSpawn(u.x, u.y, placed);
  }
  p.stats.deploys[k] = (p.stats.deploys[k] || 0) + 1;
  if (pi === ME) sfx('deploy');
  return true;
}

function castUlt(g, pi) {
  const p = g.P[pi];
  if (p.ult < 100 || !p.hero || !p.hero.alive) return;
  p.ult = 0;
  const h = p.hero, T = p.tal;
  // 합동 궁극기: 다른 지휘관이 3초 안에 궁극기를 쓰면 효과 1.5배
  const combo = g.lastUlt && g.lastUlt.p !== pi && g.P[g.lastUlt.p].team === p.team && g.time - g.lastUlt.t <= 3;
  const cm = combo ? 1.5 : 1;
  g.lastUlt = { t: g.time, p: pi };
  if (combo) { banner('합동 궁극기! 효과 1.5배', '#ffe68a'); fxRing(h.x, h.y - 10, '#fff2b0', 320); }
  if (p.cmdKey === 'guardian') {
    g.inv[p.team] = Math.max(g.inv[p.team], (T[1] === 'a' ? 4 : 3) * (combo ? 1.25 : 1));
    const pm = (T[1] === 'b' ? 3 : 1.5) * cm;
    for (const e of g.units) if (e.alive && e.team !== p.team) {
      const dx = e.x - h.x, dy = e.y - h.y, d = hyp(dx, dy);
      if (d < 230) { e.vx += (e.boss ? 60 : 260) * (dx > 0 ? 1 : -1); damage(g, h, e, h.atk * pm, { nokb: true, magic: true }); }
    }
    fxRing(h.x, h.y - 10, '#ffd45c', 230); banner(p.nm === '나' ? '불굴의 함성!' : p.nm + ': 불굴의 함성!', '#ffd45c');
  } else if (p.cmdKey === 'witch') {
    const foes = g.units.filter(e => e.alive && e.team !== p.team);
    const n = T[1] === 'a' ? 20 : 14, dm = h.atk * 4.2 * (T[1] === 'b' ? 1.4 : 1) * cm;
    for (let i = 0; i < n; i++) {
      let tx, ty;
      if (foes.length) { const e = foes[Math.floor(g.rng() * foes.length)]; tx = e.x + (g.rng() - .5) * 30; ty = e.y + (g.rng() - .5) * 20; }
      else { tx = (p.team === 0 ? 420 : 120) + g.rng() * 420; ty = FT + g.rng() * (FB - FT); }
      g.spawnQ.push({ t: g.time + i * .08, bolt: true, x: tx, y: ty, dmg: dm, p: pi });
    }
    banner(p.nm === '나' ? '번개 폭풍!' : p.nm + ': 번개 폭풍!', '#c9a5ff');
  } else {
    const hr = Math.min(1, (T[1] === 'a' ? 1 : .6) * cm);
    for (const a of g.units) if (a.alive && a.team === p.team) { a.hp = Math.min(a.maxhp, a.hp + a.maxhp * hr); fxHeal(a.x, a.y - 14); }
    const mb = g.bases[p.team]; if (mb.alive) mb.hp = Math.min(mb.maxhp, mb.hp + 150 * cm);
    const mg = Math.round((T[1] === 'b' ? 8 : 5) * cm);
    for (const q of g.P) if (q.team === p.team) q.mana = Math.min(q.manaMax, q.mana + mg);    // 지원: 팀 전원에게 자원
    fxRing(h.x, h.y - 10, '#7dff9a', 400); banner((p.nm === '나' ? '' : p.nm + ': ') + '생명의 숲! 모두 자원 +' + mg, '#7dff9a');
  }
  sfx('ult');
}

function pickEnemy(g, w) {
  const pool = g.st.pool.filter(t => !(t === 'troll' && w < 4) && !(t === 'golem' && w < 3));
  let sum = 0; for (const t of pool) sum += POOL_W[t];
  let r = g.rng() * sum;
  for (const t of pool) { r -= POOL_W[t]; if (r <= 0) return t; }
  return pool[0];
}
function waveComp(g, w) {
  const list = [];
  let budget = (3 + Math.floor(w * .6) + Math.floor(g.stage * .5)) * 1.3 * g.eCount;
  while (budget > .5) { const t = pickEnemy(g, w); list.push(t); budget -= COST[t]; }
  if (g.st.mini && (w === 8 || w === 16)) for (let i = 0; i < Math.ceil(g.n / 2); i++) list.push(g.st.mini);
  return list;
}
function spawnEnemy(g, t, x, y, guard) {
  y = y != null ? y : FT + 14 + g.rng() * (FB - FT - 28);
  const u = makeUnit(g, 1, t, ENEMIES[t], x != null ? x : 846 + g.rng() * 20, y, g.eMult * (1 + .015 * Math.min(g.waveIdx, WAVES)) * (guard ? 1.1 : 1), null);
  if (u.boss || guard) { banner((guard ? '수문장 등장! ' : '보스 등장! ') + ENEMIES[t].name, '#ff6b6b'); sfx('boss'); }
  return u;
}
function spawnGuardian(g) {
  g.bossSpawned = true;
  const b = spawnEnemy(g, g.st.boss, 850, 305, true);
  b.guardian = true;
  for (let i = 0; i < 2 + Math.floor(g.stage / 4) + (g.n - 1) * 2; i++) g.spawnQ.push({ t: g.time + .5 + i * .3, enemy: pickEnemy(g, 10) });
}

/* --- 공간 해시 --- */
const CELL = 64;
let grid = new Map();
function buildGrid(g) {
  grid = new Map();
  for (const u of g.units) {
    if (!u.alive) continue;
    const k = ((u.x / CELL) | 0) * 1000 + ((u.y / CELL) | 0);
    let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(u);
  }
}
function near(x, y, rad, fn) {
  const x0 = ((x - rad) / CELL) | 0, x1 = ((x + rad) / CELL) | 0, y0 = ((y - rad) / CELL) | 0, y1 = ((y + rad) / CELL) | 0;
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const a = grid.get(cx * 1000 + cy); if (a) for (const u of a) fn(u);
  }
}
function frontStruct(g, team) {
  let best = null;
  for (const s of g.structs) {
    if (!s.alive || s.team === team) continue;
    if (team === 0) { if (!best || s.x < best.x) best = s; }
    else { if (!best || s.x > best.x) best = s; }
  }
  return best;
}
// 성의 보호막: 그 팀의 거점이 하나라도 남아 있으면 피해 90% 감소
function shielded(g, s) { return !!s.shieldable && g.structs.some(o => o.alive && o.team === s.team && o.kind === 'outpost'); }
function coreShielded(g) { return shielded(g, g.core); }
const canHit = (u, v) => !(v.fly && !u.proj && !u.kind);

function findTarget(g, u) {
  const aggro = u.proj ? u.range + 60 : 120;
  let best = null, bd = 1e9;
  near(u.x, u.y, aggro, v => {
    if (v.team === u.team || !v.alive || !canHit(u, v)) return;
    const d = hyp(v.x - u.x, (v.y - u.y) * 1.3);
    if (d < aggro && d < bd) { bd = d; best = v; }
  });
  return best || frontStruct(g, u.team);
}
function findHealTarget(g, u) {
  let best = null, bh = .92;
  near(u.x, u.y, u.range + 30, v => {
    if (v.team !== u.team || !v.alive || v === u) return;
    const r = v.hp / v.maxhp;
    if (r < bh && hyp(v.x - u.x, v.y - u.y) < u.range + 30) { bh = r; best = v; }
  });
  return best;
}
function distTo(u, t) {
  if (t.kind) return Math.abs(u.x - t.x) - t.r - u.r;
  return hyp(t.x - u.x, t.y - u.y) - t.r - u.r;
}

function step(g) {
  buildGrid(g);
  if (g.inputs.length) {
    const now = g.inputs.filter(i => i.t <= g.tick);
    g.inputs = g.inputs.filter(i => i.t > g.tick);
    for (const i of now) applyInput(g, i);
  }
  const dt = TICK;
  g.tick++; g.time = g.tick * dt;
  if (g.over) { g.overT += dt; return; }

  const caps = [0, 0];
  for (const s of g.structs) if (s.alive && s.kind === 'outpost') caps[s.team]++;
  if (g.mode === 'pvp') caps[0] = caps[1] = 0, g.structs.forEach(s => { if (s.alive && s.kind === 'outpost' && s.captured) caps[s.team]++; });
  for (const p of g.P) {
    p.mana = Math.min(p.manaMax, p.mana + dt * .58 * (g.auraT[p.team].druid ? 1.2 : 1) * (1 + .15 * caps[p.team]));
    for (let i = 0; i < 6; i++) p.cardCd[i] = Math.max(0, p.cardCd[i] - dt);
    if (p.hero && p.hero.alive) p.ult = Math.min(100, p.ult + dt * 1.7 * (p.cmdKey === 'witch' && p.tal[2] === 'a' ? 1.3 : 1));
  }
  g.inv[0] = Math.max(0, g.inv[0] - dt); g.inv[1] = Math.max(0, g.inv[1] - dt);
  if (g.tick % 20 === 0) for (const a of g.units) if (a.alive && g.regenT[a.team] && !a.kind) a.hp = Math.min(a.maxhp, a.hp + a.maxhp * .01);

  for (const p of g.P) {
    if (!p.auto) continue;
    const k = AUTO_ORDER[p.autoIdx % AUTO_ORDER.length], slot = DECK.indexOf(k);
    if (p.mana >= UNITS[k].cost && p.cardCd[slot] <= 0) { if (deploy(g, p.i, slot)) p.autoIdx++; else if (ownCount(g, p.i) + UNITS[k].count > g.cap) p.autoIdx++; }
    if (p.ult >= 100 && p.hero && p.hero.alive) {
      let n = 0; for (const e of g.units) if (e.alive && e.team !== p.team && Math.abs(e.x - p.hero.x) < 260) n++;
      if (n >= 6 || p.hero.hp < p.hero.maxhp * .35) castUlt(g, p.i);
    }
  }

  if (g.mode === 'pvp') {
    // 대결: 양쪽 성에서 20초마다 지원군 보병 2명
    g.reinf -= dt;
    if (g.reinf <= 0) {
      g.reinf = 20;
      for (const t of [0, 1]) for (let i = 0; i < 2; i++) { const bx = 110 + g.rng() * 20; makeUnit(g, t, 'footman', UNITS.footman, t === 0 ? bx : W - bx, FT + 40 + g.rng() * (FB - FT - 80), 1 + g.time / 300, null); }
    }
  } else g.waveTimer -= dt;
  if (g.mode !== 'pvp' && g.waveTimer <= 0) {
    g.waveIdx++;
    const w = Math.min(g.waveIdx, WAVES);
    waveComp(g, w).forEach((t, i) => g.spawnQ.push({ t: g.time + i * .28, enemy: t }));
    g.waveTimer = g.waveIdx >= WAVES ? WAVE_GAP * .8 : WAVE_GAP;
    if (g.waveIdx <= WAVES && g.waveIdx % 5 === 0) banner('웨이브 ' + g.waveIdx, '#ffb2b2');
  }
  if (g.mode !== 'pvp' && !g.bossSpawned && !coreShielded(g)) spawnGuardian(g);
  if (g.spawnQ.length) {
    const rest = [];
    for (const q of g.spawnQ) {
      if (q.t > g.time) { rest.push(q); continue; }
      if (q.enemy) spawnEnemy(g, q.enemy, q.x, q.y);
      else if (q.bolt) lightning(g, q);
    }
    g.spawnQ = rest;
  }

  for (const p of g.P) {
    if (p.hero && !p.hero.alive) {
      if (p.heroRespawn <= 0) p.heroRespawn = (p.cmdKey === 'guardian' && p.tal[2] === 'b') ? 6 : 12;
      p.heroRespawn -= dt;
      if (p.heroRespawn <= 0) spawnHero(g, p);
    }
  }

  buildGrid(g);

  for (const u of g.units) {
    if (!u.alive) continue;
    u.cd -= dt; u.flash -= dt; u.atk_t -= dt;
    if (u.summon || u.breath) {
      u.sk -= dt;
      if (u.sk <= 0) {
        u.sk = u.summon ? 10 : 7;
        if (u.summon) { for (let i = 0; i < 3; i++) g.spawnQ.push({ t: g.time + i * .15, enemy: 'skel', x: u.x + 20 + g.rng() * 30, y: Math.max(FT, Math.min(FB, u.y + (g.rng() - .5) * 90)) }); fxRing(u.x, u.y, '#b26bff', 90); banner('해골 왕이 망자를 불러낸다!', '#c9a5ff'); }
        else breath(g, u);
      }
    }
    if (!u.target || !u.target.alive || u.target.team === u.team || (g.tick + u.id) % 5 === 0) u.target = findTarget(g, u);
    let t = u.target, healing = false;
    if (u.heal) { const ht = findHealTarget(g, u); if (ht) { t = ht; healing = true; } }
    u.moving = false;
    if (t) {
      const d = healing ? hyp(t.x - u.x, t.y - u.y) - 10 : distTo(u, t);
      if (d <= u.range) {
        if (u.cd <= 0) { u.cd = u.rate; u.atk_t = .22; attack(g, u, t, healing); }
      } else {
        const tx = t.x, ty = t.kind ? u.y : t.y;
        const dx = tx - u.x, dy = ty - u.y, dd = hyp(dx, dy) || 1;
        u.x += dx / dd * u.spd * dt; u.y += dy / dd * u.spd * dt;
        u.moving = true; u.walk += dt * u.spd * .11;
      }
    }
    u.x += u.vx * dt; u.y += u.vy * dt; u.vx *= .82; u.vy *= .82;
  }

  for (const u of g.units) {
    if (!u.alive) continue;
    near(u.x, u.y, u.r + 28, v => {
      if (v.id <= u.id || !v.alive || v.fly !== u.fly) return;
      const dx = v.x - u.x, dy = v.y - u.y, d = hyp(dx, dy) || .01, min = (u.r + v.r) * .9;
      if (d < min) {
        const p = (min - d) * .5, nx = dx / d, ny = dy / d;
        const wu = v.r / (u.r + v.r), wv = u.r / (u.r + v.r);
        u.x -= nx * p * wu; u.y -= ny * p * wu * 1.4;
        v.x += nx * p * wv; v.y += ny * p * wv * 1.4;
      }
    });
  }
  for (const u of g.units) {
    if (!u.alive) continue;
    u.y = Math.max(FT, Math.min(FB, u.y));
    const f = frontStruct(g, u.team);
    if (f) {
      if (u.team === 0) u.x = Math.min(u.x, f.x - f.r - u.r * .6);
      else u.x = Math.max(u.x, f.x + f.r + u.r * .6);
    }
    u.x = Math.max(16, Math.min(944, u.x));
  }

  for (const s of g.structs) {
    if (!s.alive) continue;
    s.cd -= dt; s.flash -= dt;
    if (s.cd > 0) continue;
    let best = null, bd = s.range;
    near(s.x, s.y, s.range, v => { if (v.team !== s.team && v.alive) { const d = Math.abs(v.x - s.x) - s.r; if (d < bd) { bd = d; best = v; } } });
    if (best) { s.cd = s.rate; shoot(g, s, best, 'arrow', s.atk, 0, 1, true); }
  }

  const keep = [];
  for (const p of g.projs) {
    p.t += dt;
    if (p.tgt && p.tgt.alive) { p.tx = p.tgt.x; p.ty = p.tgt.kind ? p.ty : p.tgt.y - 12 - (p.tgt.fly ? 26 : 0); }
    if (p.t >= p.dur) impact(g, p); else keep.push(p);
  }
  g.projs = keep;

  g.units = g.units.filter(u => u.alive);
  if (g.mode === 'pvp') {
    if (!g.bases[1].alive) endGame(g, 'pvp', 0);
    else if (!g.bases[0].alive) endGame(g, 'pvp', 1);
    else if (g.time >= PVP_LIMIT) {
      // 시간 종료: 성 체력 비율 + 점령 거점으로 판정
      const sc = t => g.bases[t].hp / g.bases[t].maxhp + .3 * g.structs.filter(s => s.alive && s.kind === 'outpost' && s.team === t).length;
      const d = sc(0) - sc(1);
      endGame(g, 'pvp', Math.abs(d) < .02 ? -1 : d > 0 ? 0 : 1);
    }
  } else if (!g.core.alive) endGame(g, 'win');
  else if (!g.base.alive) endGame(g, 'lose');
  else if (g.time >= TIME_LIMIT) endGame(g, 'time');
}

function breath(g, u) {
  const dir = u.team === 1 ? -1 : 1;
  near(u.x + dir * 90, u.y, 140, v => {
    if (v.team === u.team || !v.alive) return;
    const dx = (v.x - u.x) * dir, dy = Math.abs(v.y - u.y);
    if (dx > 0 && dx < 190 && dy < 30 + dx * .45) damage(g, u, v, u.atk * 1.0, { magic: true });
  });
  fxBreath(u.x + dir * 30, u.y - 40, dir); sfx('boom');
}

function attack(g, u, t, healing) {
  if (healing) { shoot(g, u, t, 'holy', 0, 0, 1, false, u.heal); return; }
  if (u.proj) { shoot(g, u, t, u.proj, u.atk, u.aoe, u.siege); if (u.proj === 'arrow') sfx('bow'); return; }
  if (u.cleave) {
    const cx = t.x, cy = t.kind ? u.y : t.y;
    near(cx, cy, u.cleave + 20, v => { if (v.team !== u.team && v.alive && canHit(u, v) && hyp(v.x - cx, v.y - cy) < u.cleave + v.r) damage(g, u, v, u.atk); });
    if (t.kind) damage(g, u, t, u.atk * u.siege);
    fxSlam(cx, cy, u.boss ? '#ffb27a' : '#d8f0ff', u.cleave); sfx('slam');
  } else {
    damage(g, u, t, t.kind ? u.atk * u.siege : u.atk);
    fxHit(t.kind ? t.x - (u.team === 0 ? t.r : -t.r) : t.x, t.kind ? u.y - 12 : t.y - 12, u.team === 0 ? '#ffe9a8' : '#ff9a9a');
    if (u.evo) fxHit(t.x, t.y - 14, '#ffd45c', 4);
    sfx('hit');
  }
}

function shoot(g, src, tgt, kind, dmg, aoe, siege, fromStruct, heal) {
  const speed = { arrow: 420, fire: 270, rock: 230, holy: 320, dark: 260, bolt: 520 }[kind] || 300;
  const sx = src.x + (src.team === 0 ? 10 : -10), sy = fromStruct ? src.y - src.r - 20 : src.y - 18 - (src.fly ? 26 : 0) - (src.boss ? 20 : 0);
  const tx = tgt.kind ? tgt.x - (src.team === 0 ? tgt.r * .6 : -tgt.r * .6) : tgt.x;
  const ty = tgt.kind ? src.y - 10 : tgt.y - 12 - (tgt.fly ? 26 : 0);
  const d = hyp(tx - sx, ty - sy);
  g.projs.push({ id: g.nextId++, kind, sx, sy, tx, ty, tgt, t: 0, dur: Math.max(.12, d / speed), dmg, aoe, siege: siege || 1, team: src.team, src, heal: heal || 0, arc: kind === 'rock' ? 70 : kind === 'arrow' ? 22 : 0, magic: kind !== 'arrow' && kind !== 'rock' });
}

function impact(g, p) {
  if (p.heal) {
    if (p.tgt && p.tgt.alive) { p.tgt.hp = Math.min(p.tgt.maxhp, p.tgt.hp + p.heal); fxHeal(p.tgt.x, p.tgt.y - 16); floatTxt(p.tgt.x, p.tgt.y - 30, '+' + Math.round(p.heal), '#7dff9a'); }
    return;
  }
  if (p.aoe) {
    near(p.tx, p.ty, p.aoe + 30, v => { if (v.team !== p.team && v.alive && hyp(v.x - p.tx, (v.y - (v.fly ? 26 : 0)) - p.ty) < p.aoe + v.r) damage(g, p.src, v, p.dmg, { magic: p.magic }); });
    for (const s of g.structs) if (s.alive && s.team !== p.team && Math.abs(s.x - p.tx) < s.r + p.aoe * .6) damage(g, p.src, s, p.dmg * p.siege);
    fxExplode(p.tx, p.ty, p.kind); sfx(p.kind === 'rock' ? 'boom' : 'magic');
  } else if (p.tgt && p.tgt.alive) {
    damage(g, p.src, p.tgt, p.tgt.kind ? p.dmg * p.siege : p.dmg, { magic: p.magic });
    fxHit(p.tx, p.ty, p.kind === 'bolt' ? '#d9c2ff' : '#fff2c0', 5);
  }
}

function lightning(g, q) {
  const caster = g.P[q.p | 0];
  const src = (caster && caster.hero) || { team: caster ? caster.team : 0, kb: 0, o: q.p | 0 };
  const ct = caster ? caster.team : 0;
  near(q.x, q.y, 70, v => { if (v.team !== ct && v.alive && hyp(v.x - q.x, v.y - q.y) < 46 + v.r) damage(g, src, v, q.dmg, { magic: true }); });
  for (const s of g.structs) if (s.alive && s.team !== ct && Math.abs(s.x - q.x) < s.r + 30) damage(g, src, s, q.dmg * .8);
  fxBolt(q.x, q.y); sfx('zap');
}

function damage(g, src, t, dmg, opt) {
  if (!t.alive) return;
  opt = opt || {};
  if (t.kind) {
    if (shielded(g, t)) { dmg *= .1; fxShield(t); }
  } else {
    if (g.mode === 'pvp' || t.team === 0) { if (g.inv[t.team] > 0) dmg = 0; else if (g.auraT[t.team].guardian) dmg *= .85; }
    if (t.armor && !opt.magic) { dmg *= (1 - t.armor); if (Math.random() < .3) fxHit(t.x, t.y - 16, '#c8c8d0', 3); }
  }
  if (dmg <= 0) return;
  t.hp -= dmg; t.flash = .1;
  if (dmg >= 6) floatTxt(t.x + (Math.random() - .5) * 14, (t.kind ? t.y - t.r - 30 : t.y - t.r - 22 - (t.fly ? 26 : 0)), Math.round(dmg), null, dmg > 60, t.team);
  if (!t.kind && src && src.kb && !opt.nokb && !t.boss) {
    const dir = src.team === 0 ? 1 : -1;
    t.vx += dir * src.kb * 9; t.vy += (t.y - (src.y || t.y)) * .5;
  }
  if (t.hp <= 0) {
    if (t.kind) structDown(g, t);
    else {
      t.alive = false;
      fxDeath(t);
      if (g.mode === 'pvp' || t.team === 1) {
        if (t.team !== MYTEAM) g.stats.enemyKills++;
        if (t.boss || t.guardian) { g.stats.bossKilled = true; banner(ENEMIES[t.type].name + ' 처치!', '#ffd45c'); }
        const owner = src && src.team !== t.team && src.o >= 0 ? g.P[src.o] : null;
        if (owner) {
          if (src.hero) owner.stats.cmdKills++; else if (UNITS[src.type]) owner.stats.kills[src.type] = (owner.stats.kills[src.type] || 0) + 1;
          owner.ult = Math.min(100, owner.ult + (t.boss ? 25 : 1.4));
        }
        if (t.boss) for (const p of g.P) p.mana = Math.min(p.manaMax, p.mana + 6);
      }
      if (t.hero && t.o === ME) { const p = g.P[t.o]; banner('지휘관 쓰러짐! ' + ((p.cmdKey === 'guardian' && p.tal[2] === 'b') ? 6 : 12) + '초 후 복귀', '#ff9a9a'); }
    }
  }
}

function structDown(g, s) {
  if (s.kind === 'outpost' && (s.team === 1 || g.mode === 'pvp')) {
    s.team = 1 - s.team; s.maxhp = (g.mode === 'pvp' ? 3600 : s.maxhp) * .6; s.hp = s.maxhp * .7; s.atk *= g.mode === 'pvp' ? 1 : .8; s.captured = true;
    if (s.team === MYTEAM) { g.stats.captured++; banner('거점 점령! 자원 +15%', '#8fd0ff'); sfx('capture'); }
    else banner('거점을 빼앗겼다!', '#ff9a9a');
    fxCapture(s);
    const eb = g.bases[1 - s.team];
    if (eb && eb.shieldable && !shielded(g, eb)) banner(eb.team === MYTEAM ? '우리 성의 보호막이 사라졌다!' : (g.mode === 'pvp' ? '적 성의 보호막이 사라졌다!' : '핵심 성의 보호막이 사라졌다!'), eb.team === MYTEAM ? '#ff9a9a' : '#ffd45c');
  } else {
    s.hp = 0; s.alive = false; fxCollapse(s); sfx('boom');
  }
}

function endGame(g, res, winner) {
  if (g.over) return;
  g.over = res; g.overT = 0; g.winner = winner == null ? -1 : winner;
  const win = res === 'win' || (res === 'pvp' && g.winner === MYTEAM);
  if (g === G) { sfx(win ? 'win' : 'lose'); setTimeout(() => showResult(g), 1700); }
}

// 동기화 확인용 상태 요약값 (모든 기기에서 같아야 한다)
function stateHash(g) {
  let h = g.nextId;
  for (const u of g.units) h += u.x * 1.31 + u.y * .73 + u.hp * 1.07;
  for (const s of g.structs) h += s.hp;
  for (const p of g.P) h += p.mana * 3.1 + p.ult;
  return h.toFixed(3);
}

/* ================= 효과 (렌더 전용) ================= */
let parts = [], texts = [], banners = [], rings = [], bolts = [], corpses = [], shakeAmt = 0;
const rnd = (a, b) => a + Math.random() * (b - a);
const NOFX = { on: false };     // 헤드리스 밸런스 테스트 시 효과 생략
function shake() {}   // 화면 흔들림은 어지러움 때문에 사용하지 않음
function P(o) { if (!NOFX.on && parts.length < 1100) parts.push(o); }
function fxHit(x, y, c, n = 7) { for (let i = 0; i < n; i++) P({ x, y, vx: rnd(-140, 140), vy: rnd(-160, 40), life: rnd(.18, .35), max: .35, c, s: rnd(2, 4), g: 300, add: true }); }
function fxBurst(x, y, c, n, sp) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), v = rnd(sp * .3, sp); P({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(.3, .6), max: .6, c, s: rnd(2.5, 5), g: 0, add: true }); } }
function RG(o) { if (!NOFX.on && rings.length < 80) rings.push(o); }
function fxSpawn(x, y, placed) { fxBurst(x, y - 12, '#9fdcff', placed ? 14 : 8, 90); RG({ x, y, r: 4, R: 26, life: .35, max: .35, c: '#9fdcff' }); if (placed) P({ x, y: y - 20, vx: 0, vy: 0, life: .35, max: .35, c: '#bfe9ff', s: 60, soft: true, add: true }); }
function fxHeal(x, y) { for (let i = 0; i < 4; i++) P({ x: x + rnd(-10, 10), y: y + rnd(-6, 6), vx: 0, vy: rnd(-50, -25), life: rnd(.5, .8), max: .8, c: '#7dff9a', s: 9, plus: true, add: true }); }
function fxExplode(x, y, k) {
  const c = { fire: '#ff9a3c', rock: '#d8b48a', dark: '#b26bff', bolt: '#c9a5ff' }[k] || '#fff';
  fxBurst(x, y, c, k === 'rock' ? 22 : 18, 200);
  P({ x, y, vx: 0, vy: 0, life: .3, max: .3, c, s: k === 'rock' ? 90 : 80, soft: true, add: true });
  RG({ x, y, r: 6, R: k === 'rock' ? 64 : 54, life: .35, max: .35, c });
  if (k === 'rock') for (let i = 0; i < 10; i++) P({ x, y, vx: rnd(-120, 120), vy: rnd(-220, -80), life: rnd(.5, .8), max: .8, c: '#7a5a3a', s: rnd(3, 5), g: 600 });
}
function fxSlam(x, y, c, r) { RG({ x, y, r: 6, R: r + 18, life: .3, max: .3, c }); for (let i = 0; i < 10; i++) P({ x: x + rnd(-r, r), y: y + rnd(-8, 8), vx: rnd(-40, 40), vy: rnd(-70, -20), life: .5, max: .5, c: '#b9a58a', s: rnd(3, 5), g: 120 }); }
function fxRing(x, y, c, R) { RG({ x, y, r: 10, R, life: .7, max: .7, c, thick: true }); fxBurst(x, y, c, 40, 300); }
const DEATH_C = { goblin: '#7cc04a', orc: '#4f8a3c', skel: '#efe9d6', shaman: '#9b59ff', troll: '#8fb0c0', ogre: '#c0703a', wolf: '#8a8a9a', golem: '#9a9488', bat: '#6a3a7a', lich: '#7affc0', dragon: '#d0402a' };
function fxDeath(u) {
  if (NOFX.on) return;
  const c = u.team === 0 ? '#9fc4ff' : (DEATH_C[u.type] || '#ccc');
  const y = u.y - (u.fly ? 26 : 0);
  for (let i = 0; i < (u.boss ? 60 : 12); i++) P({ x: u.x, y: y - 10, vx: rnd(-120, 120), vy: rnd(-200, -40), life: rnd(.4, .8), max: .8, c, s: rnd(3, u.boss ? 8 : 5), g: 500 });
  P({ x: u.x, y: y - 14, vx: 0, vy: -30, life: .5, max: .5, c: '#ffffff', s: u.r * 4, add: true, soft: true });
  if (corpses.length < 60) corpses.push({ type: u.type, x: u.x, y: u.y, fly: u.fly, flip: u.team === 1, sc: SCALE_OF[u.type] || 1, life: 1, max: 1, rot: (u.team === 0 ? -1 : 1) * rnd(.9, 1.4) });
  if (u.boss) fxRing(u.x, u.y, '#ffb27a', 160);
}
function fxBolt(x, y) { if (NOFX.on) return; bolts.push({ x, y, life: .25, max: .25, seg: Array.from({ length: 9 }, () => rnd(-14, 14)) }); fxBurst(x, y, '#e6d6ff', 14, 180); RG({ x, y, r: 4, R: 50, life: .3, max: .3, c: '#c9a5ff' }); P({ x, y: y - 10, vx: 0, vy: 0, life: .25, max: .25, c: '#d8c8ff', s: 110, soft: true, add: true }); }
function fxShield(s) { if (Math.random() < .3) RG({ x: s.x, y: s.y - 30, r: s.r + 30, R: s.r + 40, life: .25, max: .25, c: '#b98cff' }); }
function fxCapture(s) { fxBurst(s.x, s.y - 40, '#8fd0ff', 60, 260); RG({ x: s.x, y: s.y, r: 10, R: 140, life: .6, max: .6, c: '#8fd0ff', thick: true }); }
function fxCollapse(s) { for (let i = 0; i < 90; i++) P({ x: s.x + rnd(-s.r, s.r), y: s.y - rnd(0, 90), vx: rnd(-160, 160), vy: rnd(-260, -40), life: rnd(.6, 1.2), max: 1.2, c: i % 3 ? '#8a7f9a' : '#ffb27a', s: rnd(3, 7), g: 500 }); fxRing(s.x, s.y - 30, '#ffb27a', 200); }
function fxBreath(x, y, dir) { for (let i = 0; i < 70; i++) { const a = rnd(-.45, .45), v = rnd(160, 380); P({ x, y, vx: Math.cos(a) * v * dir, vy: Math.sin(a) * v + 60, life: rnd(.35, .6), max: .6, c: i % 3 ? '#ff7a2a' : '#ffd45c', s: rnd(6, 14), g: 0, add: true, soft: i % 4 === 0 }); } }
function floatTxt(x, y, s, c, big, team, sx) { if (!NOFX.on && texts.length < 120) texts.push({ x, y, s: String(s), c, life: .8, max: .8, big, team, sx }); }
function banner(s, c) { if (NOFX.on) return; banners.push({ s, c, life: 2.2, max: 2.2 }); if (banners.length > 3) banners.shift(); }

/* ================= 사운드 ================= */
let AC = null, sfxCount = 0;
function initAudio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); }
function tone(f, d, type, v, f2) {
  const o = AC.createOscillator(), gn = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(gn).connect(AC.destination); o.start(t); o.stop(t + d);
}
function noise(d, v, hp) {
  const len = Math.floor(AC.sampleRate * d), b = AC.createBuffer(1, len, AC.sampleRate), a = b.getChannelData(0);
  for (let i = 0; i < len; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain();
  s.buffer = b; f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp || 900; gn.gain.value = v;
  s.connect(f).connect(gn).connect(AC.destination); s.start();
}
function sfx(k) {
  if (!AC || NOFX.on || document.hidden) return;
  if (++sfxCount > 6 && !['ult', 'win', 'lose', 'capture', 'boss', 'deploy'].includes(k)) return;
  try {
    switch (k) {
      case 'hit': noise(.06, .12, 1500); break;
      case 'bow': tone(900, .08, 'triangle', .04, 400); break;
      case 'slam': noise(.18, .3); tone(90, .2, 'sine', .25, 40); break;
      case 'boom': noise(.35, .4); tone(70, .35, 'sine', .35, 30); break;
      case 'magic': tone(600, .18, 'sine', .08, 1200); break;
      case 'zap': noise(.12, .25, 2500); tone(1400, .12, 'sawtooth', .05, 200); break;
      case 'deploy': tone(520, .09, 'square', .06, 780); break;
      case 'ult': tone(300, .5, 'sawtooth', .12, 900); noise(.4, .2, 600); break;
      case 'capture': [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, .25, 'triangle', .14), i * 90)); break;
      case 'boss': tone(110, .8, 'sawtooth', .18, 55); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .35, 'triangle', .16), i * 140)); break;
      case 'lose': [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, .4, 'sine', .16), i * 200)); break;
    }
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (AC) { document.hidden ? AC.suspend() : AC.resume(); } if (document.hidden && G && !G.over && state === 'play') pauseGame(); });

/* ================= 스프라이트 (코드로 그리는 카툰 캐릭터) ================= */
const OUT = '#1b1430';
const SPR = new Map();
const SS = 2;
function E(c, x, y, rx, ry, fill, lw = 2) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 6.2832); c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = OUT; c.stroke(); } }
function R(c, x, y, w, h, r, fill, lw = 2) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = OUT; c.stroke(); } }
function Pl(c, pts, fill, lw = 2) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = OUT; c.stroke(); } }
function L(c, x1, y1, x2, y2, col, w) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineCap = 'round'; c.lineWidth = w + 2.5; c.strokeStyle = OUT; c.stroke(); c.lineWidth = w; c.strokeStyle = col; c.stroke(); }
function glow(c, x, y, r, col) { const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); }
function legs(c, f, col, boot) {
  const s = [0, 3, 0, -3][f % 4];
  R(c, 26 + s, 44, 6, 12, 2, col); R(c, 32 - s, 44, 6, 12, 2, col);
  R(c, 25 + s, 53, 8, 4, 2, boot || '#4a3020', 1.5); R(c, 31 - s, 53, 8, 4, 2, boot || '#4a3020', 1.5);
}
const wp = f => f === 4 ? 1 : 0;

const DRAW = {
  footman(c, f) {
    legs(c, f, '#2c3e7a');
    E(c, 32, 38, 11, 11, '#3d6fd6'); R(c, 23, 39, 18, 3, 1, '#ffd45c', 0);
    E(c, 32, 23, 9, 9, '#f1c27d');
    Pl(c, [22, 22, 32, 11, 42, 22], '#9aa6bd'); R(c, 22, 20, 20, 4, 2, '#7d89a3');
    E(c, 35, 24, 1.4, 1.6, OUT, 0);
    E(c, 22, 39, 7, 8, '#2850b0'); E(c, 22, 39, 3, 3.5, '#ffd45c', 1.5);
    const a = wp(f); L(c, 40, 38, a ? 56 : 48, a ? 34 : 22, '#e8eef8', 3); L(c, 38, 39, 43, 38, '#8a5a2a', 3);
  },
  knight(c, f) {
    legs(c, f, '#7d89a3', '#3a3f55');
    E(c, 32, 37, 13, 12, '#c7d0e2'); R(c, 22, 37, 20, 4, 1, '#3d6fd6', 0);
    E(c, 32, 21, 10, 10, '#b8c2d6'); R(c, 30, 19, 12, 3, 1, OUT, 0);
    Pl(c, [30, 11, 26, 2, 36, 6], '#3d6fd6', 1.5);
    Pl(c, [14, 28, 26, 28, 26, 42, 20, 50, 14, 42], '#2850b0'); L(c, 20, 31, 20, 44, '#ffd45c', 1.5);
    const a = wp(f); L(c, 40, 38, a ? 62 : 52, a ? 36 : 18, '#f2f6ff', 4); L(c, 36, 39, 45, 37, '#ffd45c', 3);
  },
  archer(c, f) {
    legs(c, f, '#3a5a2a');
    E(c, 32, 38, 10, 11, '#3f8f4a'); L(c, 24, 32, 39, 44, '#7a4a2a', 2);
    E(c, 32, 23, 8.5, 8.5, '#f1c27d');
    Pl(c, [22, 26, 32, 11, 42, 24, 38, 18, 26, 18], '#2f6f3a'); E(c, 35, 24, 1.3, 1.5, OUT, 0);
    const a = wp(f);
    c.beginPath(); c.arc(40, 34, 13, -1.25, 1.25); c.lineWidth = 4.5; c.strokeStyle = OUT; c.stroke(); c.lineWidth = 2.5; c.strokeStyle = '#a0682a'; c.stroke();
    L(c, 44.5, 22, a ? 34 : 40, 34, '#eee', .8); L(c, a ? 34 : 40, 34, 44.5, 46, '#eee', .8);
  },
  mage(c, f) {
    const s = [0, 1, 0, -1][f % 4];
    Pl(c, [22, 54, 26, 30, 38, 30, 42, 54], '#5a3fc0'); R(c, 22, 50, 20, 4, 2, '#ffd45c', 1.5);
    E(c, 32, 23, 8.5, 8.5, '#f1c27d'); R(c, 28, 26, 9, 8, 4, '#eee', 1);
    Pl(c, [20, 19, 44, 19, 34 + s, 1], '#4a2fa8'); R(c, 20, 17, 24, 4, 2, '#3a2290');
    E(c, 35, 22, 1.3, 1.5, OUT, 0);
    const a = wp(f); L(c, 44, 52, a ? 52 : 46, a ? 20 : 18, '#8a5a2a', 2.5);
    glow(c, a ? 52 : 46, a ? 18 : 16, 9, 'rgba(120,230,255,.9)'); E(c, a ? 52 : 46, a ? 18 : 16, 3.5, 3.5, '#bff4ff', 1.5);
  },
  priest(c, f) {
    Pl(c, [22, 54, 25, 30, 39, 30, 42, 54], '#f2efe6'); R(c, 30, 30, 4, 24, 0, '#e3b53c', 0);
    E(c, 32, 23, 8.5, 8.5, '#f1c27d'); Pl(c, [22, 28, 24, 15, 32, 11, 40, 15, 42, 28, 38, 20, 26, 20], '#e8e2d0');
    E(c, 35, 23, 1.3, 1.5, OUT, 0);
    const a = wp(f); L(c, 44, 54, 45, 16, '#c08a3a', 2.5);
    glow(c, 45, 15, a ? 14 : 9, 'rgba(255,230,140,.9)'); E(c, 45, 15, 4, 4, '#fff2b0', 1.5);
  },
  catapult(c, f) {
    const a = wp(f);
    R(c, 10, 40, 44, 8, 2, '#8a5a2a'); E(c, 18, 52, 6, 6, '#6a4020'); E(c, 46, 52, 6, 6, '#6a4020');
    Pl(c, [26, 40, 32, 22, 38, 40], '#a06a34');
    c.save(); c.translate(32, 26); c.rotate(a ? .6 : -.7); R(c, -2, -24, 4, 30, 2, '#b07a40'); E(c, 0, -24, 6, 4, '#7a5030'); E(c, 0, -26, 3.5, 3.5, '#9a9aa0', 1); c.restore();
    R(c, 12, 38, 8, 4, 1, '#3d6fd6', 1);
  },
  goblin(c, f) {
    legs(c, f, '#5a4030', '#3a2a1a');
    E(c, 32, 40, 9, 9, '#8a6a3a');
    E(c, 32, 26, 9, 8, '#7cc04a'); Pl(c, [23, 25, 13, 19, 25, 29], '#7cc04a'); Pl(c, [41, 25, 51, 19, 39, 29], '#7cc04a');
    E(c, 35, 25, 2, 2, '#ffe14a', 1); R(c, 30, 30, 7, 2, 1, OUT, 0);
    const a = wp(f); L(c, 39, 40, a ? 50 : 44, a ? 38 : 30, '#c9c9d4', 2.5);
  },
  orc(c, f) {
    legs(c, f, '#4a3020', '#2a1a10');
    E(c, 32, 37, 13, 12, '#8a3b2a'); R(c, 20, 37, 24, 4, 1, '#3a2a20', 0);
    E(c, 32, 21, 10, 9.5, '#4f8a3c'); E(c, 36, 20, 2, 1.8, '#ffdd55', 1);
    Pl(c, [32, 27, 33, 22, 34.5, 27], '#fff', 1); Pl(c, [37, 27, 38, 22, 39.5, 27], '#fff', 1);
    R(c, 22, 12, 20, 4, 2, '#5a5a66');
    const a = wp(f); L(c, 42, 40, a ? 56 : 46, a ? 34 : 14, '#6a4020', 3);
    c.save(); c.translate(a ? 56 : 46, a ? 34 : 14); c.rotate(a ? .5 : -.2); Pl(c, [0, -2, 9, -8, 11, 4, 2, 6], '#c9ccd8'); c.restore();
  },
  skel(c, f) {
    const s = [0, 3, 0, -3][f % 4];
    L(c, 29 + s, 44, 29 + s, 55, '#efe9d6', 2.5); L(c, 35 - s, 44, 35 - s, 55, '#efe9d6', 2.5);
    R(c, 26, 30, 12, 15, 3, '#2a2a33'); for (let i = 0; i < 3; i++) L(c, 27, 33 + i * 4, 37, 33 + i * 4, '#efe9d6', 1.5);
    E(c, 32, 22, 9, 9, '#efe9d6'); E(c, 29, 22, 2.4, 2.8, OUT, 0); E(c, 35, 22, 2.4, 2.8, OUT, 0);
    glow(c, 35, 22, 4, 'rgba(255,80,80,.9)'); R(c, 29, 27, 7, 2, 1, OUT, 0);
    const a = wp(f);
    c.beginPath(); c.arc(40, 35, 12, -1.25, 1.25); c.lineWidth = 4.5; c.strokeStyle = OUT; c.stroke(); c.lineWidth = 2.5; c.strokeStyle = '#6a5a6a'; c.stroke();
    L(c, 44, 24, a ? 34 : 40, 35, '#ccc', .8); L(c, a ? 34 : 40, 35, 44, 46, '#ccc', .8);
  },
  wolf(c, f) {
    const s = [0, 4, 0, -4][f % 4];
    Pl(c, [12, 40, 4, 34, 8, 44], '#6a6a7a', 1.5);
    L(c, 18 + s, 46, 16 + s, 56, '#5a5a6a', 3); L(c, 24 - s, 46, 26 - s, 56, '#5a5a6a', 3);
    L(c, 38 + s, 46, 36 + s, 56, '#5a5a6a', 3); L(c, 44 - s, 46, 46 - s, 56, '#5a5a6a', 3);
    E(c, 30, 42, 17, 8, '#7a7a8a'); E(c, 30, 45, 12, 4, '#9a9aa8', 0);
    E(c, 48, 36, 8, 7, '#7a7a8a'); Pl(c, [52, 36, 60, 39, 52, 42], '#7a7a8a', 1.5); Pl(c, [44, 31, 46, 23, 50, 30], '#6a6a7a', 1.5);
    E(c, 50, 35, 1.6, 1.6, '#ff4a3a', 0);
    E(c, 28, 30, 7, 7, '#8a6a3a'); E(c, 28, 20, 6.5, 6, '#7cc04a'); Pl(c, [22, 19, 15, 15, 23, 23], '#7cc04a', 1.5); E(c, 31, 19, 1.6, 1.6, '#ffe14a', 1);
    const a = wp(f); L(c, 24, 34, a ? 58 : 50, a ? 30 : 16, '#8a5a2a', 2); Pl(c, [a ? 58 : 50, a ? 30 : 16, a ? 63 : 53, a ? 28 : 10, a ? 60 : 55, a ? 33 : 17], '#d0d4e0', 1.2);
  },
  golem(c, f) {
    const s = [0, 2, 0, -2][f % 4];
    R(c, 22 + s, 46, 8, 11, 2, '#7a7468'); R(c, 34 - s, 46, 8, 11, 2, '#7a7468');
    R(c, 16, 24, 32, 24, 5, '#8a8478'); E(c, 24, 30, 3, 2, '#5a9a4a', 0); E(c, 40, 40, 4, 2, '#5a9a4a', 0);
    R(c, 24, 9, 18, 15, 4, '#9a9488'); R(c, 28, 14, 12, 3, 1, '#1a1a22', 0);
    glow(c, 36, 15.5, 6, 'rgba(90,220,255,.95)'); R(c, 30, 15, 3, 2, 1, '#bff4ff', 0); R(c, 35, 15, 3, 2, 1, '#bff4ff', 0);
    const a = wp(f);
    R(c, 8, 28, 9, 20, 4, '#8a8478'); c.save(); c.translate(48, 30); c.rotate(a ? -1.1 : .2); R(c, -4, -2, 10, 22, 4, '#8a8478'); c.restore();
  },
  bat(c, f) {
    const up = [1, 0, -1, 0, 1][f] * 7;
    Pl(c, [30, 30, 8, 22 - up, 14, 32, 6, 36 + up * .3, 30, 36], '#4a2a5a', 1.5);
    Pl(c, [34, 30, 56, 22 - up, 50, 32, 58, 36 + up * .3, 34, 36], '#4a2a5a', 1.5);
    E(c, 32, 33, 6, 7, '#5a3a6a'); Pl(c, [28, 27, 27, 20, 31, 26], '#5a3a6a', 1); Pl(c, [36, 27, 37, 20, 33, 26], '#5a3a6a', 1);
    E(c, 30, 31, 1.4, 1.4, '#ff3a3a', 0); E(c, 34, 31, 1.4, 1.4, '#ff3a3a', 0);
  },
  shaman(c, f) {
    Pl(c, [22, 54, 26, 28, 38, 28, 42, 54], '#3a1f4f');
    Pl(c, [22, 30, 24, 14, 32, 9, 40, 14, 42, 30, 38, 20, 26, 20], '#2a1438');
    E(c, 32, 24, 7, 6, '#1a0f22', 0); E(c, 29, 24, 1.6, 1.6, '#ff3355', 0); E(c, 35, 24, 1.6, 1.6, '#ff3355', 0);
    glow(c, 32, 24, 8, 'rgba(255,40,80,.35)');
    const a = wp(f); L(c, 44, 54, a ? 52 : 46, 16, '#4a3a3a', 2.5);
    glow(c, a ? 52 : 46, 14, a ? 14 : 10, 'rgba(180,90,255,.9)'); E(c, a ? 52 : 46, 14, 4, 4, '#e0d8c8', 1.5);
  },
  troll(c, f) {
    legs(c, f, '#5f7f90', '#3a4a55');
    E(c, 30, 36, 15, 14, '#6f8fa0'); R(c, 18, 40, 24, 6, 2, '#6a4a2a');
    E(c, 34, 22, 9, 8, '#7f9fb0'); E(c, 37, 21, 1.8, 1.8, '#ffcc33', 1); R(c, 34, 26, 7, 2, 1, OUT, 0);
    E(c, 18, 38, 5, 9, '#6f8fa0');
    const a = wp(f);
    c.save(); c.translate(42, 40); c.rotate(a ? 1.2 : -.5); R(c, -3, -26, 7, 28, 3, '#7a5030'); E(c, .5, -26, 7, 8, '#8a6040'); c.restore();
  },
  ogre(c, f) {
    legs(c, f, '#6a3a20', '#3a2010');
    E(c, 31, 36, 15, 14, '#b0603a'); R(c, 17, 40, 28, 6, 2, '#4a2a1a'); E(c, 31, 44, 12, 4, '#ffd45c', 1.5);
    E(c, 33, 21, 10, 9, '#c0703a'); E(c, 36, 20, 2, 2, '#ff4422', 1);
    Pl(c, [33, 27, 34, 23, 35.5, 27], '#fff', 1); Pl(c, [38, 27, 39, 23, 40.5, 27], '#fff', 1);
    Pl(c, [24, 14, 26, 6, 29, 12, 33, 4, 37, 12, 40, 6, 42, 14], '#ffd45c', 1.5);
    const a = wp(f);
    c.save(); c.translate(44, 40); c.rotate(a ? 1.3 : -.4); R(c, -3, -28, 7, 30, 3, '#6a4020'); E(c, .5, -28, 8, 9, '#5a3a20');
    for (let i = 0; i < 5; i++) { const an = i * 1.25; Pl(c, [Math.cos(an) * 7, -28 + Math.sin(an) * 8, Math.cos(an) * 12, -28 + Math.sin(an) * 13, Math.cos(an + .3) * 7, -28 + Math.sin(an + .3) * 8], '#ddd', 1); } c.restore();
  },
  lich(c, f) {
    const s = [0, 1, 0, -1][f % 4];
    Pl(c, [18, 56, 24, 28, 40, 28, 46, 56], '#1f3a3a'); Pl(c, [24, 56, 32, 40, 40, 56], '#2f5a50', 1.5);
    Pl(c, [20, 30, 32, 26, 44, 30, 46 + s, 50, 18 - s, 50], '#3a1a3a', 1.5);
    E(c, 32, 21, 9, 9, '#e8e2cc'); E(c, 29, 21, 2.4, 2.8, OUT, 0); E(c, 35, 21, 2.4, 2.8, OUT, 0);
    glow(c, 32, 21, 9, 'rgba(90,255,180,.6)'); R(c, 29, 26, 7, 2, 1, OUT, 0);
    Pl(c, [23, 14, 25, 5, 28, 11, 32, 3, 36, 11, 39, 5, 41, 14], '#ffd45c', 1.5);
    const a = wp(f); L(c, 46, 56, a ? 54 : 48, 12, '#3a2a2a', 2.5);
    glow(c, a ? 54 : 48, 10, a ? 18 : 13, 'rgba(90,255,170,.95)'); E(c, a ? 54 : 48, 10, 4, 5, '#c8ffe6', 1.5);
  },
  dragon(c, f) {
    const up = [1, 0, -1, 0, 1][f] * 6;
    Pl(c, [8, 40, -2, 30, 2, 44, 14, 46], '#8a2420', 1.5);
    Pl(c, [26, 30, 12, 6 - up, 20, 18, 4, 14 - up, 22, 32], '#6a1a1a', 1.5);
    L(c, 22, 48, 20, 57, '#8a2420', 4); L(c, 36, 48, 38, 57, '#8a2420', 4);
    E(c, 28, 40, 16, 10, '#b0302a'); E(c, 30, 44, 11, 5, '#e8a050', 0);
    L(c, 38, 36, 46, 24, '#b0302a', 6);
    E(c, 50, 22, 8, 6, '#b0302a'); Pl(c, [54, 21, 62, 24, 54, 27], '#b0302a', 1.5);
    Pl(c, [46, 17, 44, 9, 49, 16], '#e8d8b0', 1); Pl(c, [50, 16, 51, 8, 53, 16], '#e8d8b0', 1);
    E(c, 52, 21, 1.6, 1.6, '#ffe14a', 0);
    Pl(c, [32, 30, 46, 2 - up, 44, 16, 58, 10 - up, 40, 32], '#8a2420', 1.5);
    if (wp(f)) glow(c, 62, 24, 10, 'rgba(255,140,40,.95)');
  },
  hero_guardian(c, f) {
    Pl(c, [24, 28, 40, 28, 44, 54, 20, 54], '#c0283c');
    legs(c, f, '#a88a2a', '#5a4010');
    E(c, 32, 37, 13, 12, '#e0b23c'); R(c, 22, 37, 20, 3, 1, '#fff2b0', 0);
    E(c, 32, 21, 10, 10, '#e8c25a'); R(c, 30, 19, 12, 3, 1, OUT, 0);
    Pl(c, [22, 13, 25, 5, 29, 11, 32, 3, 35, 11, 39, 5, 42, 13], '#ffe68a', 1.5);
    Pl(c, [13, 27, 26, 27, 26, 43, 19.5, 52, 13, 43], '#c0283c'); E(c, 19.5, 36, 3.5, 3.5, '#ffd45c', 1.5);
    const a = wp(f); L(c, 40, 38, a ? 63 : 52, a ? 36 : 14, '#fffbe8', 4.5); L(c, 36, 39, 45, 37, '#ffd45c', 3);
  },
  hero_witch(c, f) {
    const s = [0, 1, 0, -1][f % 4];
    Pl(c, [21, 54, 26, 29, 38, 29, 43, 54], '#7a2fd0'); Pl(c, [21, 54, 32, 44, 43, 54], '#5a1fa0', 1.5);
    E(c, 32, 23, 8.5, 8.5, '#f6d2b0'); Pl(c, [24, 20, 22, 32, 27, 26], '#ff6ad5', 1.5);
    Pl(c, [17, 19, 47, 19, 36 + s, -2, 30, 6], '#3a1470'); R(c, 17, 17, 30, 4, 2, '#2a0a55');
    E(c, 35, 23, 1.3, 1.6, OUT, 0);
    const a = wp(f); L(c, 44, 54, a ? 53 : 47, 14, '#2a1a3a', 2.5);
    glow(c, a ? 53 : 47, 12, a ? 16 : 11, 'rgba(255,240,120,.95)');
    Pl(c, [a ? 51 : 45, 6, a ? 56 : 50, 12, a ? 53 : 47, 12, a ? 55 : 49, 18, a ? 50 : 44, 11, a ? 53 : 47, 11], '#fff59a', 1);
  },
  hero_druid(c, f) {
    Pl(c, [21, 54, 25, 29, 39, 29, 43, 54], '#2f8f5a'); R(c, 21, 49, 22, 5, 2, '#7a5a2a', 1.5);
    E(c, 32, 23, 8.5, 8.5, '#f1c27d'); R(c, 27, 27, 10, 9, 4, '#e8e2d0', 1);
    L(c, 26, 16, 20, 4, '#a07a4a', 2); L(c, 22, 9, 17, 8, '#a07a4a', 1.5); L(c, 38, 16, 44, 4, '#a07a4a', 2); L(c, 42, 9, 47, 8, '#a07a4a', 1.5);
    E(c, 35, 22, 1.3, 1.5, OUT, 0);
    const a = wp(f); L(c, 45, 54, 46, 14, '#7a5a2a', 3);
    glow(c, 46, 13, a ? 16 : 11, 'rgba(140,255,160,.9)'); Pl(c, [46, 6, 51, 13, 46, 20, 41, 13], '#9dff9a', 1.5);
  },
};
const SCALE_OF = { footman: 1, knight: 1.25, archer: 1, mage: 1.05, priest: 1.05, catapult: 1.25, goblin: .85, orc: 1.15, skel: 1, wolf: 1.3, shaman: 1.05, bat: .95, golem: 1.65, troll: 1.55, ogre: 2.2, lich: 1.7, dragon: 2.9, hero_guardian: 1.35, hero_witch: 1.25, hero_druid: 1.25 };

function sprite(type, f, white) {
  const key = type + f + (white ? 'w' : '');
  let s = SPR.get(key);
  if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = 64 * SS;
  const c = s.getContext('2d'); c.scale(SS, SS); c.lineJoin = 'round';
  DRAW[type](c, f);
  if (white) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(0, 0, 64, 64); }
  SPR.set(key, s);
  return s;
}

/* ================= 배경·건물 그리기 (캔버스 → GPU 텍스처) ================= */
function buildBG(ch) {
  const C = CHAPTERS[ch], M = 20;
  const cv = document.createElement('canvas'); cv.width = (W + M * 2) * 2; cv.height = (H + M * 2) * 2;
  const c = cv.getContext('2d'); c.scale(2, 2); c.translate(M, M);
  let gr = c.createLinearGradient(0, -M, 0, 170); gr.addColorStop(0, C.sky[0]); gr.addColorStop(1, C.sky[1]);
  c.fillStyle = gr; c.fillRect(-M, -M, W + M * 2, 190);
  if (ch === 3) { glow(c, 760, 120, 140, 'rgba(255,90,40,.45)'); }
  if (ch === 1) { glow(c, 300, 150, 120, 'rgba(255,230,140,.55)'); E(c, 300, 150, 34, 34, 'rgba(255,240,180,.9)', 0); }
  c.fillStyle = C.cloud;
  for (let i = 0; i < 7; i++) { const x = 60 + i * 140 + Math.random() * 40, y = 30 + Math.random() * 40; for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(x + j * 16, y + (j % 2) * 5, 14 + Math.random() * 6, 0, 6.28); c.fill(); } }
  const mt = (col, base, amp, seed) => { c.fillStyle = col; c.beginPath(); c.moveTo(-M, 172); for (let x = -M; x <= W + M; x += 30) c.lineTo(x, base - Math.abs(Math.sin(x * .011 + seed)) * amp - Math.random() * 10); c.lineTo(W + M, 172); c.fill(); };
  mt(C.mt[0], 140, 60, 1); mt(C.mt[1], 156, 40, 3);
  if (ch === 3) { c.fillStyle = 'rgba(255,90,30,.8)'; for (const x of [200, 520]) { c.beginPath(); c.moveTo(x - 6, 100 - Math.abs(Math.sin(x * .011 + 1)) * 60 + 30); c.lineTo(x + 6, 100 - Math.abs(Math.sin(x * .011 + 1)) * 60 + 30); c.lineTo(x + 2, 160); c.lineTo(x - 2, 160); c.fill(); } }
  gr = c.createLinearGradient(0, 150, 0, H); gr.addColorStop(0, C.ground[0]); gr.addColorStop(1, C.ground[1]);
  c.fillStyle = gr; c.fillRect(-M, 150, W + M * 2, H - 150 + M);
  for (let x = -M; x < W + M + 20; x += 18) {
    const h = 22 + Math.random() * 18; c.fillStyle = C.tree[Math.floor(Math.random() * 3)];
    if (C.dead) { c.strokeStyle = C.tree[0]; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x, 172); c.lineTo(x, 172 - h); c.moveTo(x, 172 - h * .6); c.lineTo(x - 8, 172 - h * .9); c.moveTo(x, 172 - h * .7); c.lineTo(x + 7, 172 - h); c.stroke(); x += 18; continue; }
    c.beginPath(); c.moveTo(x - 12, 172); c.lineTo(x, 172 - h - 8); c.lineTo(x + 12, 172); c.fill();
    if (C.snowy) { c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.moveTo(x - 5, 172 - h * .6); c.lineTo(x, 172 - h - 8); c.lineTo(x + 5, 172 - h * .6); c.fill(); }
  }
  gr = c.createLinearGradient(0, FT - 8, 0, FB + 14); gr.addColorStop(0, C.road[0]); gr.addColorStop(.5, C.road[1]); gr.addColorStop(1, C.road[2]);
  c.fillStyle = gr; c.beginPath(); c.moveTo(-M, FT - 4);
  for (let x = -M; x <= W + M; x += 40) c.lineTo(x, FT - 6 + Math.sin(x * .03) * 5);
  for (let x = W + M; x >= -M; x -= 40) c.lineTo(x, FB + 12 + Math.sin(x * .025) * 6);
  c.fill();
  for (let i = 0; i < 420; i++) { c.fillStyle = Math.random() < .5 ? 'rgba(60,40,20,.16)' : 'rgba(255,240,200,.14)'; c.beginPath(); c.ellipse(Math.random() * W, FT + Math.random() * (FB - FT), rnd(2, 8), rnd(1, 3), 0, 0, 6.28); c.fill(); }
  if (C.lava) {
    c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = rnd(120, 820), y = Math.random() < .5 ? rnd(440, 470) : rnd(FT + 10, FB - 10);
      c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 5; j++) { x += rnd(10, 26); y += rnd(-8, 8); c.lineTo(x, y); }
      c.strokeStyle = 'rgba(255,120,30,.35)'; c.lineWidth = 7; c.stroke(); c.strokeStyle = '#ffb040'; c.lineWidth = 2; c.stroke();
    }
  }
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * W, y = Math.random() < .5 ? rnd(158, FT - 8) : rnd(FB + 16, 452);
    c.strokeStyle = C.tuft; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y - 6); c.moveTo(x, y); c.lineTo(x + 2, y - 7); c.stroke();
    if (ch === 0 && Math.random() < .15) { c.fillStyle = ['#ffe14a', '#ff8ad0', '#fff'][i % 3]; c.beginPath(); c.arc(x, y - 6, 2, 0, 6.28); c.fill(); }
  }
  for (let i = 0; i < 14; i++) { const x = rnd(150, 820), y = Math.random() < .5 ? rnd(160, 175) : rnd(FB + 18, 446); E(c, x, y, rnd(4, 8), rnd(3, 5), ch === 2 ? '#c8d4e0' : '#9a9aa8', 1.2); }
  return cv;
}

// 건물 상태별 텍스처 (경계 상자 안에서 그림)
const SBOX = { base: [-70, FT - 96, 120, FB - FT + 160], outpost: [-50, -140, 100, 140 + FB - 305 + 24], core: [-72, -228, 144, 228 + FB - 305 + 70] };
function drawStructTo(c, kind, state, x, y) {
  if (kind === 'base') {
    for (let i = 0; i < 5; i++) { const yy = FT - 10 + i * 56; R(c, x - 40, yy, 46, 50, 4, '#8a8aa0'); R(c, x - 44, yy - 6, 54, 10, 2, '#a5a5ba'); }
    R(c, x - 58, FT - 70, 40, FB - FT + 120, 4, '#7a7a92');
    for (let i = 0; i < 4; i++) R(c, x - 62 + i * 12, FT - 82, 9, 14, 1, '#9a9ab0');
    for (const fy of [FT - 40, FB - 10]) { L(c, x - 38, fy, x - 38, fy - 50, '#5a3a20', 2); Pl(c, [x - 37, fy - 50, x - 14, fy - 44, x - 37, fy - 36], state === 'red' ? '#d23a3a' : '#3d6fd6', 1.5); }
    for (let i = 0; i < 9; i++) { const yy = FT + 4 + i * 28; L(c, x + 12, yy + 14, x + 34, yy - 4, '#9a6a3a', 4); L(c, x + 12, yy - 4, x + 34, yy + 14, '#8a5a2a', 4); }
  } else if (kind === 'outpost') {
    if (state === 'ruin') { E(c, x, y + 40, 40, 12, '#6a5a50'); for (let i = 0; i < 6; i++) R(c, x - 30 + i * 10, y + 20 - (i % 3) * 8, 10, 16, 2, '#7a6a5a', 1.5); return; }
    const ours = state === 'ours';
    for (let i = 0; i < 10; i++) { const yy = FT + i * 26; Pl(c, [x - 8, yy + 26, x - 8, yy + 4, x - 3, yy - 4, x + 2, yy + 4, x + 2, yy + 26], '#8a5a2a', 1.5); }
    R(c, x - 22, y - 40, 44, 90, 3, '#a0703a'); L(c, x - 20, y - 36, x + 20, y + 46, '#7a5028', 3); L(c, x + 20, y - 36, x - 20, y + 46, '#7a5028', 3);
    R(c, x - 30, y - 62, 60, 26, 3, '#b8834a'); Pl(c, [x - 36, y - 62, x, y - 94, x + 36, y - 62], ours ? '#3d6fd6' : '#a02a2a');
    L(c, x, y - 94, x, y - 128, '#5a3a20', 2.5);
    Pl(c, [x + 1, y - 128, x + 28, y - 120, x + 1, y - 110], ours ? '#5fa0ff' : '#e23a3a', 1.5);
    if (ours) E(c, x, y - 50, 6, 6, '#ffd45c', 1.5);
  } else {
    if (state === 'ruin') { E(c, x, y + 40, 60, 16, '#4a3a4a'); for (let i = 0; i < 10; i++) R(c, x - 48 + i * 10, y + 10 - (i % 4) * 10, 12, 20, 2, '#5a4a5a', 1.5); return; }
    R(c, x - 50, FT - 60, 100, FB - FT + 110, 4, '#4a3a5a');
    for (let i = 0; i < 6; i++) R(c, x - 52 + i * 18, FT - 74, 12, 16, 1, '#5a4a6a');
    R(c, x - 30, y - 150, 60, 110, 4, '#3a2a4a');
    Pl(c, [x - 38, y - 150, x, y - 210, x + 38, y - 150], '#2a1a3a');
    R(c, x - 14, y + 20, 28, 40, 12, '#1a0f22');
    E(c, x, y - 120, 8, 12, '#d9a5ff', 1.5);
    for (const fy of [FT - 30, FB + 10]) { L(c, x - 40, fy, x - 40, fy - 50, '#2a1a20', 2); Pl(c, [x - 41, fy - 50, x - 64, fy - 44, x - 41, fy - 36], '#a02a2a', 1.5); }
  }
}
function structCanvas(kind, state) {
  const b = SBOX[kind], cv = document.createElement('canvas');
  cv.width = b[2] * 2; cv.height = b[3] * 2;
  const c = cv.getContext('2d'); c.scale(2, 2); c.lineJoin = 'round';
  const ox = kind === 'base' ? 64 : 0, oy = kind === 'base' ? 0 : 305;
  c.translate(-(ox + b[0]) + (kind === 'base' ? 0 : 0), -(oy + b[1]));
  if (kind !== 'base') c.translate(0, 0);
  drawStructTo(c, kind, state, ox, oy);
  return cv;
}
function miscCanvas(kind) {
  const cv = document.createElement('canvas'), c = cv.getContext('2d');
  if (kind === 'glow') { cv.width = cv.height = 64; glow(c, 32, 32, 32, 'rgba(255,255,255,1)'); }
  else if (kind === 'sq') { cv.width = cv.height = 8; c.fillStyle = '#fff'; c.fillRect(0, 0, 8, 8); }
  else if (kind === 'plus') { cv.width = cv.height = 16; c.fillStyle = '#fff'; c.fillRect(0, 6, 16, 4); c.fillRect(6, 0, 4, 16); }
  else if (kind === 'ring') { cv.width = cv.height = 128; c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 58, 0, 6.28); c.stroke(); }
  else if (kind === 'shadow') { cv.width = 64; cv.height = 24; c.scale(1, .375); const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(.7, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.beginPath(); c.arc(32, 32, 32, 0, 6.28); c.fill(); }
  else if (kind === 'arrow') { cv.width = 48; cv.height = 12; c.strokeStyle = '#3a2a1a'; c.lineWidth = 3; c.beginPath(); c.moveTo(4, 6); c.lineTo(36, 6); c.stroke(); c.fillStyle = '#e8e8f0'; c.beginPath(); c.moveTo(46, 6); c.lineTo(34, 1); c.lineTo(34, 11); c.fill(); c.fillStyle = '#e04a4a'; c.fillRect(2, 2, 8, 3); c.fillRect(2, 7, 8, 3); }
  else if (kind === 'rock') { cv.width = cv.height = 32; E(c, 16, 16, 12, 11, '#8a8a92', 3); E(c, 12, 12, 4, 3, '#aaaab2', 0); }
  else if (kind === 'vig') { cv.width = 480; cv.height = 270; const gr = c.createRadialGradient(240, 135, 80, 240, 135, 300); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,0,20,1)'); c.fillStyle = gr; c.fillRect(0, 0, 480, 270); }
  else if (kind === 'flake') { cv.width = cv.height = 16; glow(c, 8, 8, 8, 'rgba(255,255,255,1)'); }
  else if (kind === 'leaf') { cv.width = 16; cv.height = 10; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(8, 5, 7, 3.5, 0, 0, 6.28); c.fill(); }
  return cv;
}

/* ================= PixiJS 렌더러 ================= */
let app = null, RENDERER = '-';
const TEX = new Map();
function texOf(key, makeCanvas) {
  let t = TEX.get(key);
  if (!t) { t = PIXI.Texture.from(makeCanvas()); TEX.set(key, t); }
  return t;
}
const sprTex = (type, f, white) => texOf('u:' + type + f + (white ? 'w' : ''), () => sprite(type, f, white));
const misc = k => texOf('m:' + k, () => miscCanvas(k));
const hex = s => parseInt(s.slice(1), 16);
const L_ = {};
let worldViews = new Map(), structViews = new Map(), projViews = new Map(), partPool = [], ringPool = [], corpsePool = [], weather = [];
let bgSprite = null, vigSprite = null, boltG = null, curCh = -1;

let forceGL = false;
try { forceGL = /[?&]gl\b/.test(location.search) || localStorage.getItem('rumblefront_gl') === '1'; } catch (e) {}
async function initPixi() {
  if (!window.PIXI) throw new Error('nopixi');
  const opts = { canvas: gcv, width: W, height: H, antialias: true, backgroundColor: 0x0b0918, resolution: 1, autoStart: false, powerPreference: 'high-performance' };
  app = new PIXI.Application();
  try { await app.init({ ...opts, preference: forceGL ? 'webgl' : 'webgpu' }); }
  catch (e) { console.warn('WebGPU 초기화 실패, WebGL로 전환', e); app = new PIXI.Application(); await app.init({ ...opts, preference: 'webgl' }); }
  RENDERER = app.renderer.name === 'webgpu' ? 'WebGPU' : 'WebGL';
  // 기기에서 WebGPU 장치가 끊기면 WebGL로 자동 전환
  try { if (RENDERER === 'WebGPU') app.renderer.gpu.device.lost.then(() => { try { localStorage.setItem('rumblefront_gl', '1'); } catch (e) {} location.reload(); }); } catch (e) {}
  const S = app.stage;
  L_.world = new PIXI.Container(); S.addChild(L_.world);
  L_.bg = new PIXI.Container(); L_.world.addChild(L_.bg);
  L_.ground = new PIXI.Container(); L_.world.addChild(L_.ground);        // 그림자·링
  L_.units = new PIXI.Container(); L_.units.sortableChildren = true; L_.world.addChild(L_.units);
  L_.norm = new PIXI.Container(); L_.world.addChild(L_.norm);            // 파편
  L_.add = new PIXI.Container(); L_.world.addChild(L_.add);              // 빛 효과 (가산 혼합)
  L_.top = new PIXI.Container(); S.addChild(L_.top);
  boltG = new PIXI.Graphics(); boltG.blendMode = 'add'; L_.add.addChild(boltG);
  vigSprite = new PIXI.Sprite(misc('vig')); vigSprite.width = W; vigSprite.height = H; L_.top.addChild(vigSprite);
  resize();
}

function setupWorld(g) {
  for (const v of worldViews.values()) { v.sh.destroy(); v.ring.destroy(); v.c.destroy({ children: true }); } worldViews.clear();
  for (const v of structViews.values()) v.c.destroy({ children: true }); structViews.clear();
  for (const v of projViews.values()) v.destroy({ children: true }); projViews.clear();
  for (const s of [...partPool, ...ringPool, ...corpsePool, ...weather.map(w => w.sp)]) s.destroy();
  partPool = []; ringPool = []; corpsePool = []; weather = [];
  if (curCh !== g.ch) {
    if (bgSprite) { bgSprite.destroy(); TEX.get('bg') && TEX.get('bg').destroy(true); TEX.delete('bg'); }
    bgSprite = new PIXI.Sprite(texOf('bg', () => buildBG(g.ch)));
    bgSprite.scale.set(.5); bgSprite.position.set(-20, -20);
    L_.bg.addChild(bgSprite); curCh = g.ch;
  }
  vigSprite.alpha = CHAPTERS[g.ch].vig;
  for (const s of g.structs) {
    const c = new PIXI.Container();
    const sp = new PIXI.Sprite(); sp.scale.set(.5); c.addChild(sp);
    const b = SBOX[s.kind]; sp.position.set(b[0], b[1] - (s.kind === 'base' ? 0 : 0));
    const v = { c, sp, state: '' };
    if (s.kind === 'core') {
      v.orb = new PIXI.Sprite(misc('glow')); v.orb.anchor.set(.5); v.orb.tint = 0xb450ff; v.orb.blendMode = 'add'; v.orb.position.set(0, -120); c.addChild(v.orb);
      v.shield = new PIXI.Graphics(); v.shield.ellipse(0, -40, 74, 200).fill({ color: 0xb98cff, alpha: .2 }).stroke({ width: 2, color: 0xe0c8ff, alpha: .7 }); c.addChild(v.shield);
    }
    v.flash = new PIXI.Sprite(misc('glow')); v.flash.anchor.set(.5); v.flash.blendMode = 'add'; v.flash.scale.set(2.2); v.flash.position.set(0, -30); v.flash.alpha = 0; c.addChild(v.flash);
    if (s.kind === 'base') {
      c.position.set(s.x, 0); sp.position.set(b[0], b[1]); v.flash.position.set(-10, 305); c.zIndex = -1;
      if (s.x > W / 2) c.scale.x = -1;          // 오른쪽 성은 좌우 반전
      if (s.shieldable) { v.shield = new PIXI.Graphics(); v.shield.ellipse(0, 305, 70, 190).fill({ color: 0x8cc8ff, alpha: .18 }).stroke({ width: 2, color: 0xc8e4ff, alpha: .7 }); c.addChild(v.shield); }
    }
    else { c.position.set(s.x, s.y); c.zIndex = s.y + 30; }
    L_.units.addChild(c);
    structViews.set(s.id, v);
  }
}

function unitView(u) {
  let v = worldViews.get(u.id);
  if (v) return v;
  const c = new PIXI.Container();
  const sh = new PIXI.Sprite(misc('shadow')); sh.anchor.set(.5); L_.ground.addChild(sh);
  const ring = new PIXI.Sprite(misc('ring')); ring.anchor.set(.5); L_.ground.addChild(ring);
  const aura = new PIXI.Sprite(misc('glow')); aura.anchor.set(.5); aura.blendMode = 'add'; aura.visible = false; c.addChild(aura);
  const body = new PIXI.Sprite(sprTex(u.type, 0)); body.anchor.set(.5, 56 / 64); c.addChild(body);
  L_.units.addChild(c);
  v = { c, sh, ring, aura, body, seen: 0 };
  worldViews.set(u.id, v);
  return v;
}

let frameNo = 0;
function renderWorld(dt, t) {
  const g = G; frameNo++;
  const mir = isMir();
  L_.world.scale.x = mir ? -1 : 1; L_.world.position.x = mir ? W : 0;
  // 건물 (내 편 = 파란 깃발, 상대 = 빨간 깃발)
  for (const s of g.structs) {
    const v = structViews.get(s.id);
    const state = !s.alive ? 'ruin' : s.kind === 'outpost' ? (s.team === MYTEAM ? 'ours' : 'ok') : s.kind === 'base' ? (s.team === MYTEAM ? 'ok' : 'red') : 'ok';
    if (v.state !== state) { v.state = state; v.sp.texture = texOf('s:' + s.kind + state, () => structCanvas(s.kind, state)); }
    v.flash.alpha = s.flash > 0 ? .35 : 0;
    if (v.orb) { v.orb.visible = s.alive; v.orb.scale.set(1.1 + Math.sin(t * 3) * .12); }
    if (v.shield) { v.shield.visible = s.alive && shielded(g, s); v.shield.alpha = .8 + Math.sin(t * 3) * .2; }
  }
  // 유닛
  for (const u of g.units) {
    const v = unitView(u); v.seen = frameNo;
    const sc = (SCALE_OF[u.type] || 1) * .88;
    const f = u.atk_t > 0 ? 4 : (u.moving || u.fly ? Math.floor(u.walk + (u.fly ? t * 8 : 0)) % 4 : 0);
    v.body.texture = sprTex(u.type, f, u.flash > 0);
    v.body.tint = g.mode === 'pvp' && u.team !== MYTEAM && !u.hero ? 0xffb4b4 : 0xffffff;   // 대결: 상대 병력은 붉은 빛
    const bob = u.moving ? Math.abs(Math.sin(u.walk * Math.PI)) * 1.5 : 0;
    const lift = u.fly ? 26 + Math.sin(t * 6 + u.id) * 3 : (u.type === 'dragon' ? 6 + Math.sin(t * 3) * 3 : 0);
    const lunge = u.atk_t > 0 && !u.proj ? (u.team === 0 ? 4 : -4) : 0;
    v.c.position.set(u.x + lunge, u.y - bob - lift);
    v.c.zIndex = u.y;
    v.body.scale.set((u.team === 1 ? -1 : 1) * sc / SS, sc / SS * (u.moving ? 1 : 1 + Math.sin(t * 3 + u.id) * .015));
    v.sh.position.set(u.x, u.y); v.sh.width = u.r * 2.6; v.sh.height = u.r * 1;
    v.sh.alpha = u.fly ? .5 : 1;
    v.ring.visible = !u.boss;
    v.ring.position.set(u.x, u.y); v.ring.width = u.r * 2.2; v.ring.height = u.r * .8;
    v.ring.tint = u.team === MYTEAM ? (u.hero ? 0xffd45c : hex(OWN_COL[u.o >= 0 ? g.P[u.o].ti : 0] || OWN_COL[0])) : 0xff5050; v.ring.alpha = u.hero ? 1 : .75;
    const inv = g.inv[u.team] > 0 && (g.mode === 'pvp' || u.team === 0);
    v.aura.visible = u.evo || inv || u.boss;
    if (v.aura.visible) { v.aura.tint = inv ? 0xffd45c : u.boss ? 0xff4a2a : 0xffe68a; v.aura.position.set(0, -32 * sc); v.aura.scale.set(sc * (1.2 + Math.sin(t * 4 + u.id) * .08)); v.aura.alpha = inv ? .55 : u.boss ? .35 : .4; }
  }
  for (const [id, v] of worldViews) if (v.seen !== frameNo) { v.sh.destroy(); v.ring.destroy(); v.c.destroy({ children: true }); worldViews.delete(id); }
  // 시체 (쓰러지며 사라짐)
  let ci = 0;
  for (const c of corpses) {
    c.life -= dt;
    let s = corpsePool[ci]; if (!s) { s = new PIXI.Sprite(); s.anchor.set(.5, 56 / 64); L_.units.addChild(s); corpsePool.push(s); }
    ci++;
    const k = 1 - c.life / c.max, sc = c.sc * .88 / SS;
    s.visible = true; s.texture = sprTex(c.type, 0); s.scale.set((c.flip ? -1 : 1) * sc, sc);
    s.rotation = c.rot * Math.min(1, k * 3); s.alpha = Math.max(0, 1 - k * 1.1); s.tint = 0x9a90a8;
    s.position.set(c.x, c.y - (c.fly ? 26 * (1 - Math.min(1, k * 2)) : 0) + k * 6); s.zIndex = c.y - 1;
  }
  corpses = corpses.filter(c => c.life > 0);
  for (; ci < corpsePool.length; ci++) corpsePool[ci].visible = false;
  // 투사체
  const live = new Set();
  for (const p of g.projs) {
    live.add(p.id);
    let v = projViews.get(p.id);
    if (!v) {
      v = new PIXI.Container();
      if (p.kind === 'arrow') { const a = new PIXI.Sprite(misc('arrow')); a.anchor.set(.6, .5); a.scale.set(.5); v.addChild(a); L_.norm.addChild(v); }
      else if (p.kind === 'rock') { const a = new PIXI.Sprite(misc('rock')); a.anchor.set(.5); a.scale.set(.45); v.addChild(a); L_.norm.addChild(v); }
      else {
        const col = { fire: 0xff8a28, holy: 0xffe890, dark: 0xaa50ff, bolt: 0xdcc8ff }[p.kind];
        const o = new PIXI.Sprite(misc('glow')); o.anchor.set(.5); o.tint = col; o.scale.set(p.kind === 'fire' ? .55 : .42); o.blendMode = 'add'; v.addChild(o);
        const c2 = new PIXI.Sprite(misc('glow')); c2.anchor.set(.5); c2.scale.set(.18); c2.blendMode = 'add'; v.addChild(c2);
        v.col = col; L_.add.addChild(v);
      }
      projViews.set(p.id, v);
    }
    const k = Math.min(1, p.t / p.dur);
    const x = p.sx + (p.tx - p.sx) * k, y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * p.arc;
    if (p.kind === 'arrow' || p.kind === 'rock') {
      const k2 = Math.min(1, k + .05), x2 = p.sx + (p.tx - p.sx) * k2, y2 = p.sy + (p.ty - p.sy) * k2 - Math.sin(k2 * Math.PI) * p.arc;
      v.rotation = p.kind === 'arrow' ? Math.atan2(y2 - y, x2 - x) : v.rotation + dt * 8;
    } else if (Math.random() < .7) P({ x, y, vx: rnd(-20, 20), vy: rnd(-20, 20), life: .28, max: .28, c: '#' + v.col.toString(16).padStart(6, '0'), s: 5, add: true });
    v.position.set(x, y);
  }
  for (const [id, v] of projViews) if (!live.has(id)) { v.destroy({ children: true }); projViews.delete(id); }
  // 날씨
  updateWeather(dt, t);
  // 파티클
  let pi = 0;
  for (const p of parts) {
    p.life -= dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    let s = partPool[pi];
    if (!s) { s = new PIXI.Sprite(); s.anchor.set(.5); partPool.push(s); L_.add.addChild(s); }
    pi++;
    const tex = p.plus ? misc('plus') : p.soft ? misc('glow') : p.add ? misc('glow') : misc('sq');
    if (s.texture !== tex) s.texture = tex;
    const parent = p.add ? L_.add : L_.norm;
    if (s.parent !== parent) parent.addChild(s);
    s.blendMode = p.add ? 'add' : 'normal';
    s.visible = true; s.tint = hex(p.c);
    const a = Math.max(0, p.life / p.max);
    s.alpha = p.soft ? a * .7 : a;
    const size = p.soft ? p.s * (1.4 - a * .4) : p.add && !p.plus ? p.s * 2.4 : p.s;
    s.width = size; s.height = size;
    s.position.set(p.x, p.y);
  }
  parts = parts.filter(p => p.life > 0);
  for (; pi < partPool.length; pi++) partPool[pi].visible = false;
  // 충격파 링
  let ri = 0;
  for (const r of rings) {
    r.life -= dt;
    let s = ringPool[ri]; if (!s) { s = new PIXI.Sprite(misc('ring')); s.anchor.set(.5); s.blendMode = 'add'; ringPool.push(s); L_.add.addChild(s); }
    ri++;
    const k = 1 - r.life / r.max, rad = r.r + (r.R - r.r) * k;
    s.visible = true; s.tint = hex(r.c); s.alpha = Math.max(0, r.life / r.max) * (r.thick ? 1 : .85);
    s.width = rad * 2; s.height = rad * .9; s.position.set(r.x, r.y);
  }
  rings = rings.filter(r => r.life > 0);
  for (; ri < ringPool.length; ri++) ringPool[ri].visible = false;
  // 번개
  boltG.clear();
  for (const b of bolts) {
    b.life -= dt; const a = Math.max(0, b.life / b.max);
    boltG.moveTo(b.x + b.seg[0], b.y - 300);
    for (let i = 1; i < b.seg.length; i++) boltG.lineTo(b.x + b.seg[i], b.y - 300 + i * 300 / (b.seg.length - 1));
    boltG.stroke({ width: 6, color: 0xb89cff, alpha: a * .8 });
    boltG.moveTo(b.x + b.seg[0], b.y - 300);
    for (let i = 1; i < b.seg.length; i++) boltG.lineTo(b.x + b.seg[i], b.y - 300 + i * 300 / (b.seg.length - 1));
    boltG.stroke({ width: 2, color: 0xffffff, alpha: a });
  }
  bolts = bolts.filter(b => b.life > 0);
}

function updateWeather(dt, t) {
  const kind = CHAPTERS[G.ch].weather;
  const want = { leaf: 18, sand: 50, snow: 90, ember: 60 }[kind];
  while (weather.length < want) {
    const sp = new PIXI.Sprite(misc(kind === 'leaf' ? 'leaf' : 'flake')); sp.anchor.set(.5);
    if (kind === 'ember') sp.blendMode = 'add';
    L_.add.addChild(sp);
    weather.push({ sp, x: rnd(0, W), y: rnd(-40, H), v: rnd(.6, 1.4), ph: rnd(0, 6.28) });
  }
  for (const w of weather) {
    if (kind === 'snow') { w.y += 40 * w.v * dt; w.x += Math.sin(t + w.ph) * 18 * dt - 10 * dt; w.sp.width = w.sp.height = 3 + w.v * 3; w.sp.alpha = .85; w.sp.tint = 0xffffff; }
    else if (kind === 'sand') { w.x -= 240 * w.v * dt; w.y += 20 * dt; w.sp.width = 10 + w.v * 10; w.sp.height = 1.5; w.sp.alpha = .35; w.sp.tint = 0xffe0b0; }
    else if (kind === 'ember') { w.y -= 40 * w.v * dt; w.x += Math.sin(t * 2 + w.ph) * 30 * dt; w.sp.width = w.sp.height = 2 + w.v * 3; w.sp.alpha = .5 + Math.sin(t * 6 + w.ph) * .3; w.sp.tint = 0xff8a30; }
    else { w.y += 30 * w.v * dt; w.x += (Math.sin(t * 1.5 + w.ph) * 40 - 25) * dt; w.sp.rotation = t * 2 * w.v + w.ph; w.sp.width = 8; w.sp.height = 5; w.sp.alpha = .8; w.sp.tint = [0x6aa84f, 0xa8c85a, 0xd8a84a][Math.floor(w.ph) % 3]; }
    if (w.y > H + 20) { w.y = -20; w.x = rnd(0, W + 100); }
    if (w.y < -30) { w.y = H + 10; w.x = rnd(0, W); }
    if (w.x < -30) { w.x = W + 20; w.y = rnd(0, H); }
    if (w.x > W + 120) w.x = -20;
    w.sp.position.set(w.x, w.y);
  }
}

/* ================= HUD (Canvas2D 오버레이) ================= */
const hpCol = r => r > .5 ? '#7dff6a' : r > .25 ? '#ffd45c' : '#ff5a5a';
function bar(x, y, w, h, r, col, back) { ctx.fillStyle = back || 'rgba(0,0,0,.55)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); ctx.fillStyle = col; ctx.fillRect(x, y, w * Math.max(0, r), h); }
function text(s, x, y, size, col, align = 'center', stroke = 3, weight = 800) {
  ctx.font = `${weight} ${size}px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = 'rgba(20,12,40,.95)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
const UI = {
  ult: { x: 230, y: 497, r: 32 },
  card: i => ({ x: 276 + i * 68, y: 460, w: 64, h: 74 }),
  auto: { x: 692, y: 470, w: 52, h: 54 },
  speed: { x: 846, y: 474, w: 44, h: 44 },
  pause: { x: 900, y: 474, w: 44, h: 44 },
};
let speedMul = 1, drag = null;
const CARD_COL = { footman: ['#4a6ad0', '#22306a'], knight: ['#7a8ab0', '#2a3050'], archer: ['#3a9a5a', '#1a4a2a'], mage: ['#7a4ad8', '#2a1a60'], priest: ['#d8c070', '#5a4a1a'], catapult: ['#b07a40', '#4a2a10'] };

// 대결에서 오른쪽 팀이면 화면을 좌우로 뒤집어, 누구나 자기 군대가 왼쪽에 보이게 한다
const isMir = () => !!(G && G.mode === 'pvp' && MYTEAM === 1);
const X = x => isMir() ? W - x : x;
const screenDeployMax = g => isMir() ? W - deployMax(g, 1) : deployMax(g, 0);
function drawOverlay(dt, t) {
  const g = G, pvp = g.mode === 'pvp';
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // 체력바
  for (const s of g.structs) if (s.alive) {
    const bw = s.kind === 'core' ? 90 : s.kind === 'base' && pvp ? 80 : 60, by = s.kind === 'core' ? s.y - 228 : s.kind === 'base' ? FT - 96 : s.y - 140;
    bar(X(s.x) - bw / 2, by, bw, 7, s.hp / s.maxhp, s.team === MYTEAM ? '#5fb0ff' : '#ff5a5a');
  }
  for (const u of g.units) {
    if (!(u.hp < u.maxhp || u.hero || u.boss || u.guardian)) continue;
    const sz = 64 * (SCALE_OF[u.type] || 1) * .88, lift = u.fly ? 26 : 0, ux = X(u.x), mine = u.team === MYTEAM;
    const big = u.boss || u.guardian, bw = big ? 70 : u.hero ? 34 : Math.max(16, u.r * 2);
    const by = u.y - lift - sz * .9 - 6;
    bar(ux - bw / 2, by, bw, big ? 5 : 3, u.hp / u.maxhp, mine ? (u.hero ? '#ffd45c' : '#7dff6a') : '#ff5a5a');
    if (big) text(ENEMIES[u.type].name, ux, by - 9, 11, '#ffb2b2', 'center', 3);
    if (u.evo) text('★', ux + bw / 2 + 5, by + 1, 9, '#ffd45c', 'center', 2);
    // 지휘관 머리 위 이름 (협동·대결). 내 지휘관은 ▼, 적은 빨간색
    if (u.hero && g.n > 1) {
      const q = g.P[u.o], me = u.o === ME, nm = (me ? '▼ ' : '') + q.nm;
      const col = mine ? OWN_COL[q.ti] : '#ff6b6b';
      ctx.font = '800 12px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
      const tw = ctx.measureText(nm).width + 12, ty = by - 11;
      ctx.fillStyle = 'rgba(15,10,35,.7)'; ctx.beginPath(); ctx.roundRect(ux - tw / 2, ty - 8, tw, 16, 8); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = me ? 2 : 1.2; ctx.stroke();
      text(nm, ux, ty, 12, me ? '#ffffff' : col, 'center', 0);
    }
  }
  for (const tx of texts) {
    tx.life -= dt; tx.y -= 40 * dt;
    ctx.globalAlpha = Math.min(1, tx.life / tx.max * 2);
    const pop = tx.big ? 1 + Math.max(0, (tx.life - tx.max + .12)) * 4 : 1;
    const col = tx.c || (tx.team === MYTEAM ? '#ff8a8a' : tx.big ? '#ffd45c' : '#ffffff');
    text(tx.s, tx.sx ? tx.x : X(tx.x), tx.y, (tx.big ? 15 : 11) * pop, col, 'center', 3);
  }
  ctx.globalAlpha = 1;
  texts = texts.filter(t => t.life > 0);
  // 끌어놓기 안내 (화면 좌표)
  if (drag && drag.moved) {
    const mx = screenDeployMax(g), ok = drag.x <= mx && drag.y >= FT - 30 && drag.y <= FB + 20;
    ctx.fillStyle = 'rgba(95,170,255,.13)'; ctx.fillRect(100, FT - 6, mx - 100, FB - FT + 12);
    ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(160,210,255,.8)'; ctx.lineWidth = 2; ctx.strokeRect(100, FT - 6, mx - 100, FB - FT + 12); ctx.setLineDash([]);
    const k = DECK[drag.slot];
    ctx.globalAlpha = ok ? .8 : .4;
    ctx.drawImage(sprite(k, 0), drag.x - 36, drag.y - 60, 72, 72);
    ctx.globalAlpha = 1;
    if (!ok) text('여기에는 놓을 수 없어요', drag.x, drag.y - 66, 12, '#ff9a9a');
  }
  drawHUD(t);
  drawBanners(dt);
  if (g.over) {
    const k = Math.min(1, g.overT / 1);
    const win = g.over === 'win' || (g.over === 'pvp' && g.winner === MYTEAM), draw = g.over === 'pvp' && g.winner === -1;
    ctx.fillStyle = `rgba(10,6,24,${.45 * k})`; ctx.fillRect(0, 0, W, H);
    text(win ? '승리!' : draw ? '무승부' : g.over === 'time' ? '시간 초과' : '패배', W / 2, H / 2 - 30, 54 * (0.6 + .4 * k), win ? '#ffd45c' : draw ? '#d0c8ff' : '#ff7b8b', 'center', 6);
  }
}

function drawHUD(t) {
  const g = G, P = g.P[ME];
  let gr = ctx.createLinearGradient(0, 446, 0, H); gr.addColorStop(0, 'rgba(20,14,40,.0)'); gr.addColorStop(.25, 'rgba(20,14,40,.88)'); gr.addColorStop(1, 'rgba(10,8,24,.96)');
  ctx.fillStyle = gr; ctx.fillRect(0, 440, W, H - 440);
  R(ctx, 14, 470, 18, 18, 3, '#e0a030', 1.5);
  const myBase = g.bases[MYTEAM];
  bar(38, 473, 150, 12, myBase.hp / myBase.maxhp, '#ffa62b', 'rgba(0,0,0,.6)');
  text(Math.max(0, Math.round(myBase.hp)).toLocaleString(), 186, 479, 12, '#fff', 'right', 3);
  R(ctx, 14, 496, 18, 18, 9, '#3d8bff', 1.5);
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(37, 498, 152, 14);
  const cw = 150 / P.manaMax;
  for (let i = 0; i < P.manaMax; i++) {
    const fill = Math.max(0, Math.min(1, P.mana - i));
    ctx.fillStyle = 'rgba(80,140,255,.25)'; ctx.fillRect(38 + i * cw, 499, cw - 1, 12);
    if (fill > 0) { ctx.fillStyle = fill >= 1 ? '#4aa8ff' : 'rgba(74,168,255,.55)'; ctx.fillRect(38 + i * cw, 499 + 12 * (1 - fill), cw - 1, 12 * fill); }
  }
  text(Math.floor(P.mana) + '/' + P.manaMax, 186, 523, 12, '#bfe0ff', 'right', 3);
  if (P.mana >= P.manaMax) text('자원 최대!', 70, 523, 10, '#ffd45c', 'center', 3);
  const u = UI.ult, ready = P.ult >= 100 && P.hero && P.hero.alive;
  ctx.save();
  ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, 6.28); ctx.fillStyle = '#2a2458'; ctx.fill();
  ctx.beginPath(); ctx.arc(u.x, u.y, u.r - 2, 0, 6.28); ctx.clip();
  ctx.drawImage(sprite('hero_' + P.cmdKey, 0), u.x - 34, u.y - 36, 68, 68);
  if (!P.hero || !P.hero.alive) { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(u.x - 40, u.y - 40, 80, 80); }
  ctx.restore();
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, 6.28); ctx.stroke();
  ctx.strokeStyle = ready ? '#ffd45c' : '#8a7aff'; ctx.beginPath(); ctx.arc(u.x, u.y, u.r, -Math.PI / 2, -Math.PI / 2 + 6.283 * P.ult / 100); ctx.stroke();
  if (ready) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, u.x, u.y, u.r + 10 + Math.sin(t * 6) * 3, 'rgba(255,212,92,.35)'); ctx.restore(); text('궁극기!', u.x, u.y + u.r - 2, 11, '#ffd45c', 'center', 3); }
  else if (!P.hero || !P.hero.alive) text(Math.ceil(Math.max(0, P.heroRespawn)) + '초', u.x, u.y, 14, '#fff');
  DECK.forEach((k, i) => {
    const c = UI.card(i), d = UNITS[k], can = P.mana >= d.cost && P.cardCd[i] <= 0;
    const hx = (x, y, w, h) => { ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h * .2); ctx.lineTo(x + w, y + h * .8); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h * .8); ctx.lineTo(x, y + h * .2); ctx.closePath(); };
    const lift = drag && drag.slot === i ? -6 : 0;
    ctx.save(); ctx.translate(0, lift);
    hx(c.x, c.y, c.w, c.h);
    const cg = ctx.createLinearGradient(0, c.y, 0, c.y + c.h), col = CARD_COL[k];
    cg.addColorStop(0, col[0]); cg.addColorStop(1, col[1]); ctx.fillStyle = cg; ctx.fill();
    const evo = P.lv.units[k] >= EVO_LV;
    ctx.lineWidth = 2.5; ctx.strokeStyle = !can ? '#4a4470' : evo ? '#ffd45c' : '#e8e0ff'; ctx.stroke();
    ctx.clip();
    ctx.drawImage(sprite(k, 0), c.x - 6, c.y + 2, 76, 76);
    if (!can) { ctx.fillStyle = 'rgba(10,8,24,.55)'; ctx.fillRect(c.x, c.y, c.w, c.h); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(c.x + 10, c.y + 12 + lift, 10, 0, 6.28); ctx.fillStyle = P.mana >= d.cost ? '#3d8bff' : '#3a3a5a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    text(String(d.cost), c.x + 10, c.y + 12.5 + lift, 12, '#fff', 'center', 2);
    text((evo ? '★' : '') + 'Lv' + P.lv.units[k], c.x + c.w / 2, c.y + c.h - 9 + lift, 10, evo ? '#ffd45c' : '#bfe9ff', 'center', 3);
    if (d.count > 1) text('×' + d.count, c.x + c.w - 9, c.y + 14 + lift, 10, '#fff', 'center', 3);
  });
  const a = UI.auto;
  R(ctx, a.x, a.y, a.w, a.h, 10, P.auto ? '#ffb21f' : '#2a2458', 2);
  text('AUTO', a.x + a.w / 2, a.y + a.h / 2, 12, P.auto ? '#2b1600' : '#bbb', 'center', P.auto ? 0 : 2);
  const left = Math.max(0, (g.mode === 'pvp' ? PVP_LIMIT : TIME_LIMIT) - g.time), mm = Math.floor(left / 60), ss = Math.floor(left % 60);
  E(ctx, 764, 496, 10, 10, '#ffd45c', 2); L(ctx, 764, 496, 764, 490, OUT, .8); L(ctx, 764, 496, 768, 498, OUT, .8);
  text(String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'), 805, 497, 17, left < 60 ? '#ff7b7b' : '#fff', 'center', 3);
  const sp = UI.speed; ctx.globalAlpha = NETMODE ? .35 : 1; R(ctx, sp.x, sp.y, sp.w, sp.h, 10, '#2a2458', 2); text('▶', sp.x + sp.w / 2, sp.y + 17, 14, '#fff', 'center', 0); text('x' + (NETMODE ? 1 : speedMul), sp.x + sp.w / 2, sp.y + 34, 10, '#ffd45c', 'center', 2); ctx.globalAlpha = 1;
  const pp = UI.pause; R(ctx, pp.x, pp.y, pp.w, pp.h, 10, '#2a2458', 2); ctx.fillStyle = '#fff'; ctx.fillRect(pp.x + 15, pp.y + 13, 5, 18); ctx.fillRect(pp.x + 24, pp.y + 13, 5, 18);
  const w = Math.min(g.waveIdx, WAVES);
  ctx.fillStyle = 'rgba(15,10,35,.6)'; ctx.beginPath(); ctx.roundRect(W / 2 - 120, 6, 240, 44, 12); ctx.fill();
  ctx.font = '800 17px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  const pvp = g.mode === 'pvp', A = g.auraT[MYTEAM], inv = g.inv[MYTEAM];
  const s1 = pvp ? '[대결]' : '[일반]', s2 = pvp ? ' ' + g.tsize[0] + ' : ' + g.tsize[1] : ' ' + g.stage + ' 스테이지', tw = ctx.measureText(s1 + s2).width;
  text(s1, W / 2 - tw / 2, 21, 17, pvp ? '#ff9a9a' : '#ffd45c', 'left', 3); text(s2, W / 2 - tw / 2 + ctx.measureText(s1).width, 21, 17, '#fff', 'left', 3);
  if (pvp) text(g.reinf < 3 ? '지원군 도착!' : '지원군까지 ' + Math.ceil(g.reinf) + '초', W / 2, 40, 12, '#d0c8ff', 'center', 3);
  else text('[웨이브 ' + w + '/' + WAVES + ']', W / 2, 40, 12, '#d0c8ff', 'center', 3);
  if (g.n > 1) {
    // 팀원 목록 (내 편 먼저, 색 = 병력 테두리 색 / 상대는 빨간색)
    const order = g.P.slice().sort((a, b) => (a.team === MYTEAM ? 0 : 1) - (b.team === MYTEAM ? 0 : 1) || a.i - b.i);
    order.forEach((q, k) => {
      const i = q.i, y = 14 + k * 17;
      ctx.fillStyle = q.team === MYTEAM ? OWN_COL[q.ti] : '#ff5a5a'; ctx.beginPath(); ctx.arc(18, y, 5, 0, 6.28); ctx.fill();
      text((i === ME ? '▶' : '') + q.nm.slice(0, 6), 28, y, 11, i === ME ? '#fff' : '#d8d0ff', 'left', 3);
      const hr = q.hero && q.hero.alive ? q.hero.hp / q.hero.maxhp : 0;
      bar(104, y - 3, 40, 5, hr, hr ? '#ffd45c' : '#555');
      text(CMDS[q.cmdKey].role, 162, y, 10, '#c9bfff', 'center', 3);
      if (q.left) text('자동', 182, y, 10, '#ff9a9a', 'left', 3); else if (q.auto) text('AUTO', 182, y, 10, '#ffd45c', 'left', 3);
    });
    const ly = 16 + g.n * 17;
    if (A.trinity) text('삼위일체 +5%', 14, ly, 11, '#ffe68a', 'left', 3);
    if (inv > 0) text('무적 ' + inv.toFixed(1) + '초', A.trinity ? 104 : 14, ly, 11, '#ffe68a', 'left', 3);
  } else {
    text(CMDS[P.cmdKey].name + ' Lv' + Math.round(P.lv.cmd), 14, 18, 12, '#ffd45c', 'left', 3);
    if (inv > 0) text('무적 ' + inv.toFixed(1) + '초', 14, 36, 12, '#ffe68a', 'left', 3);
    else text(pvp ? 'AI와 연습 대결' : CHAPTERS[g.ch].name, 14, 36, 11, '#d0c8ff', 'left', 3);
  }
  if (pvp) {
    const eb = g.bases[1 - MYTEAM];
    text('적 성 ' + Math.max(0, Math.round(eb.hp / eb.maxhp * 100)) + '%', W - 14, 18, 12, '#ff9a9a', 'right', 3);
    text(shielded(g, eb) ? '적 거점을 점령하면 성 공격 가능' : '적 성: 공격 가능!', W - 14, 36, 12, shielded(g, eb) ? '#c9a5ff' : '#ffd45c', 'right', 3);
  } else {
    const op = g.structs.filter(s => s.kind === 'outpost' && s.team === 0).length;
    text('거점 점령 ' + op + '/2', W - 14, 18, 12, op === 2 ? '#8fd0ff' : '#fff', 'right', 3);
    text(coreShielded(g) ? '핵심 성: 보호막' : '핵심 성: 공격 가능!', W - 14, 36, 12, coreShielded(g) ? '#c9a5ff' : '#ffd45c', 'right', 3);
  }
}
function drawBanners(dt) {
  let y = 92;
  for (const b of banners) {
    b.life -= dt;
    const k = b.life / b.max, pop = k > .85 ? 1 + (k - .85) * 3 : 1;
    ctx.globalAlpha = Math.min(1, k * 3);
    ctx.font = '800 20px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    const bw = ctx.measureText(b.s).width + 50;
    ctx.fillStyle = 'rgba(15,10,35,.55)'; ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, y - 16, bw, 32, 10); ctx.fill();
    text(b.s, W / 2, y, 20 * pop, b.c, 'center', 4);
    y += 38;
  }
  ctx.globalAlpha = 1;
  banners = banners.filter(b => b.life > 0);
}

/* ================= 메인 루프 ================= */
let state = 'lobby', last = 0, acc = 0, paused = false;
const perf = { sim: 0, n: 0 };
// 멀티: 확정된 입력 묶음(턴)
let netTurns = new Set(), netMaxTurn = -1, netStartAt = 0, netDesync = false;

function queueInput(inp) {
  if (!G || G.over) return;
  inp.p = ME;
  if (NETMODE) { window.RFNet.send(inp); return; }
  inp.t = G.tick + 1; G.inputs.push(inp);
}
function onNetTurn(k, list) {
  if (!G || netTurns.has(k)) return;
  netTurns.add(k); if (k > netMaxTurn) netMaxTurn = k;
  for (const i of list) G.inputs.push(Object.assign({}, i, { t: k * TURN }));
}

function loop(ts) {
  requestAnimationFrame(loop);
  const now = ts / 1000, dt = Math.min(.05, now - (last || now)); last = now;
  sfxCount = 0;
  if (state !== 'play' || !G || !app) return;
  let rdt = 0;
  if (NETMODE) {
    const wait = netStartAt - window.RFNet.now();
    if (wait <= 0) {
      if (!G.over || G.overT < 3) window.RFNet.pump(G.tick, netMaxTurn);
      acc += Math.min(.25, now - (G.lastNow || now)); G.lastNow = now;   // 느린 기기도 실제 시간 기준으로 진행
      let n = 0;
      const t0 = performance.now();
      // 확정된 턴이 있을 때만 진행. 너무 뒤처졌으면 빠르게 따라잡는다.
      while (n < 8 && netTurns.has((G.tick / TURN) | 0)) {
        const ahead = (netMaxTurn + 1) * TURN - G.tick;
        if (acc >= TICK) acc -= TICK; else if (ahead <= TURN * (LAG + 2)) break;
        step(G); n++;
        if (G.tick % 100 === 0) window.RFNet.hash(G.tick, stateHash(G));
      }
      if (n) { perf.sim += (performance.now() - t0) / n; perf.n++; }
      if (acc > TICK * 3) acc = TICK * 3;
      rdt = dt;
    } else { G.countdown = Math.ceil(wait / 1000); }
  } else if (!paused) {
    acc += dt * speedMul * (G.over ? .35 : 1);
    let n = 0;
    const t0 = performance.now();
    while (acc >= TICK && n < 8) { step(G); acc -= TICK; n++; }
    if (n) { perf.sim += (performance.now() - t0) / n; perf.n++; }
    rdt = dt * speedMul;
  }
  renderWorld(rdt, now);
  app.renderer.render(app.stage);
  drawOverlay(rdt, now);
  if (NETMODE && netStartAt - window.RFNet.now() > 0) {
    ctx.fillStyle = 'rgba(10,6,24,.45)'; ctx.fillRect(0, 0, W, H);
    text('곧 시작해요', W / 2, H / 2 - 50, 20, '#d0c8ff', 'center', 4);
    text(String(G.countdown || ''), W / 2, H / 2, 64, '#ffd45c', 'center', 6);
  }
  if (netDesync) text('⚠ 동기화 오류가 감지됐어요', W / 2, 62, 12, '#ff9a9a', 'center', 3);
}

/* ================= 입력 (탭 = 기지 앞 소환, 끌어놓기 = 원하는 위치 소환) ================= */
function toLogical(e) { const r = hud.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
const inR = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const myP = () => G && G.P[ME];
hud.addEventListener('pointerdown', e => {
  if (state !== 'play' || !G || paused) return;
  initAudio();
  const p = toLogical(e);
  if (inR(p, UI.pause)) { pauseGame(); return; }
  if (NETMODE && netStartAt > window.RFNet.now()) return;
  for (let i = 0; i < 6; i++) if (inR(p, UI.card(i))) {
    drag = { slot: i, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, id: e.pointerId };
    try { hud.setPointerCapture(e.pointerId); } catch (er) {}
    return;
  }
  if (hyp(p.x - UI.ult.x, p.y - UI.ult.y) < UI.ult.r + 4) { if (myP().ult >= 100) { queueInput({ type: 'ult' }); if (navigator.vibrate) navigator.vibrate([20, 30, 40]); } return; }
  if (inR(p, UI.auto)) { queueInput({ type: 'auto' }); return; }
  if (inR(p, UI.speed) && !NETMODE) { speedMul = speedMul === 1 ? 2 : 1; return; }
});
hud.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const p = toLogical(e); drag.x = p.x; drag.y = p.y;
  if (hyp(p.x - drag.sx, p.y - drag.sy) > 14) drag.moved = true;
});
function endDrag(e, cancel) {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const d = drag; drag = null;
  if (cancel || !G) return;
  const card = UNITS[DECK[d.slot]];
  if (myP().mana < card.cost) { floatTxt(UI.card(d.slot).x + 32, 452, '자원 부족', '#ff9a9a', false, 0, true); return; }
  if (!d.moved) { queueInput({ type: 'card', slot: d.slot }); if (navigator.vibrate) navigator.vibrate(12); return; }
  if (d.x <= screenDeployMax(G) && d.y >= FT - 30 && d.y <= FB + 20) { queueInput({ type: 'card', slot: d.slot, x: Math.round(X(d.x)), y: Math.round(d.y) }); if (navigator.vibrate) navigator.vibrate(15); }
}
hud.addEventListener('pointerup', e => endDrag(e));
hud.addEventListener('pointercancel', e => endDrag(e, true));
window.addEventListener('keydown', e => {
  if (state !== 'play' || !G || e.target.tagName === 'INPUT') return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 6) queueInput({ type: 'card', slot: n - 1 });
  else if (e.key === 'q' || e.key === ' ') queueInput({ type: 'ult' });
  else if (e.key === 'a') queueInput({ type: 'auto' });
  else if (e.key === 'Escape') paused ? resumeGame() : pauseGame();
});

/* ================= 화면 전환 / 로비 ================= */
const $ = id => document.getElementById(id);
function show(id, on) { $(id).classList.toggle('on', on); }
// 멀티에서는 게임을 멈출 수 없으므로 메뉴만 연다
function pauseGame() { if (state !== 'play' || !G || G.over) return; if (!NETMODE) paused = true; drag = null; $('pauseTitle').textContent = NETMODE ? '메뉴' : '일시정지'; $('toLobby').textContent = NETMODE ? '방 나가기' : '로비로'; show('pause', true); }
function resumeGame() { paused = false; last = 0; show('pause', false); }
$('resume').onclick = resumeGame;
$('toLobby').onclick = () => { paused = false; show('pause', false); if (NETMODE) leaveCoop(); else toLobby(); };
$('resLobby').onclick = () => { show('result', false); if (NETMODE) leaveCoop(); else toLobby(); };
$('resRetry').onclick = () => { show('result', false); if (NETMODE) backToRoom(); else if (G && G.mode === 'pvp') startPvpAI(); else startGame(); };
$('talClose').onclick = () => { show('talent', false); buildLobby(); };

function miniCanvas(type, size) { const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(sprite(type, 0), 0, 0, size, size); return c; }
const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);
function buildLobby() {
  $('gid').innerHTML = '게스트 ' + save.guest + ' · 기록은 이 기기에 저장 · <u id="gfx">그래픽 ' + RENDERER + '</u>';
  $('gfx').onclick = () => { if (!confirm(RENDERER === 'WebGPU' ? '화면이 이상하면 WebGL 모드로 바꿔요. 바꿀까요?' : 'WebGPU 모드(지원 기기만)로 바꿀까요?')) return; try { localStorage.setItem('rumblefront_gl', RENDERER === 'WebGPU' ? '1' : '0'); } catch (e) {} location.reload(); };
  const cm = $('cmds'); cm.innerHTML = '';
  Object.keys(CMDS).forEach(k => {
    const c = CMDS[k], el = document.createElement('div'), lv = save.cmds[k].lvl;
    el.className = 'cmd' + (save.cmd === k ? ' sel' : '');
    el.appendChild(miniCanvas('hero_' + k, 128));
    const tl = TALENTS[k].map((r, i) => lv >= r.lv ? (save.cmds[k].tal[i] ? '●' : '○') : '·').join('');
    el.insertAdjacentHTML('beforeend', `<b>${c.name}</b><span class="role">${c.role}</span><span class="lv">Lv ${lv} <span class="xb2"><i style="width:${lv >= MAXLV ? 100 : save.cmds[k].xp / xpNeed(lv) * 100}%"></i></span></span><span class="d">${c.desc}<br>궁극기: ${c.ult}</span><button class="tbtn">특성 ${tl}</button>`);
    el.onclick = ev => { save.cmd = k; writeSave(); if (ev.target.classList.contains('tbtn')) openTalents(k); else buildLobby(); };
    cm.appendChild(el);
  });
  const st = $('stages'); st.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const el = document.createElement('div'), lock = i > save.cleared + 1;
    el.className = 'stg' + (save.stage === i ? ' sel' : '') + (lock ? ' lock' : '') + ' ch' + STAGES[i].ch;
    el.innerHTML = lock ? '🔒' : `${i}<small>${starStr(save.stars[i] || 0)}</small>`;
    if (!lock) el.onclick = () => { save.stage = i; writeSave(); buildLobby(); };
    st.appendChild(el);
  }
  const S = STAGES[save.stage];
  $('stInfo').innerHTML = `<b>${CHAPTERS[S.ch].name}</b> · 수문장: ${ENEMIES[S.boss].name}<br><span>등장: ${S.pool.map(t => ENEMIES[t].name).join(', ')}</span>`;
  const dk = $('deck'); dk.innerHTML = '';
  DECK.forEach(k => {
    const o = save.units[k], el = document.createElement('div'); el.className = 'dk' + (o.lvl >= EVO_LV ? ' evo' : '');
    el.appendChild(miniCanvas(k, 96));
    el.insertAdjacentHTML('beforeend', `<span>${UNITS[k].name}</span><span style="color:${o.lvl >= EVO_LV ? '#ffd45c' : '#9fe7ff'}">${o.lvl >= EVO_LV ? '★' : ''}Lv ${o.lvl}</span><div class="xb"><i style="width:${o.lvl >= MAXLV ? 100 : o.xp / xpNeed(o.lvl) * 100}%"></i></div>`);
    dk.appendChild(el);
  });
}
function openTalents(k) {
  const c = save.cmds[k];
  $('talTitle').textContent = CMDS[k].name + ' 특성 (Lv ' + c.lvl + ')';
  $('talRows').innerHTML = '';
  TALENTS[k].forEach((row, i) => {
    const lock = c.lvl < row.lv, el = document.createElement('div'); el.className = 'trow' + (lock ? ' lock' : '');
    el.innerHTML = `<span class="tlv">Lv ${row.lv}</span>` + ['a', 'b'].map(o => `<div class="topt${c.tal[i] === o ? ' sel' : ''}" data-o="${o}"><b>${row[o][0]}</b><span>${row[o][1]}</span></div>`).join('');
    if (!lock) el.querySelectorAll('.topt').forEach(b => b.onclick = () => { c.tal[i] = b.dataset.o; writeSave(); openTalents(k); });
    $('talRows').appendChild(el);
  });
  show('talent', true);
}
function toLobby() {
  state = 'lobby'; G = null; NETMODE = false; ME = 0; MYTEAM = 0; drag = null; paused = false;
  for (const id of ['coop', 'result', 'pause', 'talent']) show(id, false);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, hud.width, hud.height);
  buildLobby(); show('lobby', true);
}

async function goFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen && matchMedia('(pointer:coarse)').matches) await el.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (e) {}
}
function beginPlay(g) {
  parts = []; texts = []; banners = []; rings = []; bolts = []; corpses = [];
  G = g; setupWorld(G);
  state = 'play'; paused = false; acc = 0; last = 0; drag = null;
  for (const id of ['lobby', 'coop', 'result', 'pause']) show(id, false);
  if (g.mode === 'pvp') {
    banner('대결 ' + g.tsize[0] + ' : ' + g.tsize[1] + ' · ' + CHAPTERS[g.ch].name.slice(3), '#ff9a9a');
    setTimeout(() => G === g && banner('상대 거점을 빼앗고 적 성을 무너뜨려라!', '#fff'), 1200);
  } else {
    banner(CHAPTERS[G.ch].name + ' · ' + G.stage + ' 스테이지', '#ffd45c');
    setTimeout(() => G === g && banner(g.n > 1 ? '함께 거점을 점령하고 핵심 성을 무너뜨려라!' : '거점 2곳을 점령하고 핵심 성을 무너뜨려라!', '#fff'), 1200);
  }
  if (save.tipDrag < 3) { save.tipDrag++; writeSave(); setTimeout(() => G === g && banner('카드를 끌어서 원하는 곳에 소환할 수 있어요', '#9fdcff'), 2600); }
}
function startGame() {
  if (!app) return;
  initAudio();
  NETMODE = false; ME = 0; MYTEAM = 0;
  beginPlay(newGame(save.stage, soloRoster(), (Date.now() & 0x7fffffff)));
}
$('startBtn').onclick = () => { goFullscreen(); startGame(); };

function grantXp(g, P, win, bonus) {
  const rows = [];
  const cx = Math.round((30 + P.stats.cmdKills * 3 + (win ? 80 : 20) + (g.mode === 'pvp' ? 30 : g.stage * 6) + (g.stats.bossKilled ? 30 : 0)) * bonus);
  const co = save.cmds[P.cmdKey], before = co.lvl, cu = addXp(co, cx);
  const newTal = TALENTS[P.cmdKey].some(r => before < r.lv && co.lvl >= r.lv);
  rows.push({ name: CMDS[P.cmdKey].name, o: co, xp: cx, up: cu, note: newTal ? '새 특성 열림!' : '' });
  DECK.forEach(k => {
    const dep = P.stats.deploys[k] || 0, kl = P.stats.kills[k] || 0;
    const x = Math.round((dep * 4 + kl * 3 + (dep ? (win ? 25 : 8) : 0) + (g.mode === 'pvp' ? 5 : g.stage) * (dep ? 2 : 0)) * bonus);
    const o = save.units[k], b0 = o.lvl, up = x ? addXp(o, x) : 0;
    rows.push({ name: UNITS[k].name, o, xp: x, up, note: b0 < EVO_LV && o.lvl >= EVO_LV ? '진화!' : '' });
  });
  writeSave();
  $('resXp').innerHTML = rows.map(r => `<div class="xpi"><b>${r.name} <span style="color:#9fe7ff">Lv ${r.o.lvl}</span></b><span>경험치 +${r.xp}</span>${r.up ? `<span class="up">레벨 업! ▲${r.up}</span>` : ''}${r.note ? `<span class="up" style="color:#ffd45c">${r.note}</span>` : ''}<div class="xb"><i style="width:${r.o.lvl >= MAXLV ? 100 : r.o.xp / xpNeed(r.o.lvl) * 100}%"></i></div></div>`).join('');
}
// 대결 결과: 랭크 점수(엘로 방식, 팀 평균 점수 기준)
function showPvpResult(g) {
  const P = g.P[ME], win = g.winner === MYTEAM, draw = g.winner === -1;
  $('resTitle').textContent = win ? '승리!' : draw ? '무승부' : '패배';
  $('resTitle').className = win ? 'win' : 'lose';
  $('resStars').innerHTML = '';
  const eb = g.bases[1 - MYTEAM], mb = g.bases[MYTEAM];
  let st = `${Math.floor(g.time / 60)}분 ${Math.floor(g.time % 60)}초 · 내 성 ${Math.max(0, Math.round(mb.hp / mb.maxhp * 100))}% · 적 성 ${Math.max(0, Math.round(eb.hp / eb.maxhp * 100))}%`;
  st += '<br><small>' + g.P.map(q => `${q.team === MYTEAM ? '🔵' : '🔴'} ${esc(q.nm)} 처치 ${Object.values(q.stats.kills).reduce((a, b) => a + b, 0) + q.stats.cmdKills}`).join(' · ') + '</small>';
  if (g.online) {
    const R = save.pvp, avg = t => { const a = g.P.filter(q => q.team === t).map(q => q.uid === P.uid ? R.r : (q.rt || 1000)); return a.reduce((x, y) => x + y, 0) / a.length; };
    const roster = g.P;
    roster.forEach(q => { if (q.rt == null) q.rt = 1000; });
    const exp = 1 / (1 + Math.pow(10, (avg(1 - MYTEAM) - avg(MYTEAM)) / 400));
    const delta = Math.round(32 * ((win ? 1 : draw ? .5 : 0) - exp));
    R.r = Math.max(100, R.r + delta); if (win) R.w++; else if (draw) R.d++; else R.l++;
    st += `<br><b style="color:${delta >= 0 ? '#7dff9a' : '#ff9a9a'}">랭크 점수 ${R.r} (${delta >= 0 ? '+' : ''}${delta})</b>`;
    window.RFNet.rankPut(save.guest, { nm: P.nm, r: R.r, w: R.w, l: R.l, t: Date.now() }).catch(() => {});
  } else st += '<br><small>AI 연습 대결은 랭크 점수에 반영되지 않아요</small>';
  $('resStat').innerHTML = st;
  grantXp(g, P, win, (win ? 1.5 : 1) * (g.online ? 1 : .6));
  $('resLobby').textContent = g.online ? '나가기' : '로비로';
  $('resRetry').textContent = g.online ? '방으로' : '다시 하기';
  show('result', true);
}
function showResult(g) {
  if (G !== g) return;
  if (g.mode === 'pvp') { showPvpResult(g); return; }
  const win = g.over === 'win', P = g.P[ME];
  const stars = win ? 1 + (g.base.hp / g.base.maxhp >= .6 ? 1 : 0) + (g.time <= STAR_TIME ? 1 : 0) : 0;
  $('resTitle').textContent = win ? '승리!' : g.over === 'time' ? '시간 초과' : '패배';
  $('resTitle').className = win ? 'win' : 'lose';
  $('resStars').innerHTML = win ? `<span class="${stars >= 1 ? 'on' : ''}">★</span><span class="${stars >= 2 ? 'on' : ''}">★</span><span class="${stars >= 3 ? 'on' : ''}">★</span>` : '';
  let st = `처치 ${g.stats.enemyKills} · 거점 ${g.stats.captured}/2 · ${Math.floor(g.time / 60)}분 ${Math.floor(g.time % 60)}초`;
  if (g.n > 1) st += '<br><small>' + g.P.map(q => `${esc(q.nm)} 처치 ${Object.values(q.stats.kills).reduce((a, b) => a + b, 0) + q.stats.cmdKills}`).join(' · ') + '</small>';
  else if (win) st += `<br><small>★ 승리 · ★ 기지 체력 60% 이상 · ★ 4분 안에 승리</small>`;
  $('resStat').innerHTML = st;
  if (win && g.stage > save.cleared) save.cleared = g.stage;
  if (win) save.stars[g.stage] = Math.max(save.stars[g.stage] || 0, stars);
  if (win && g.n === 1 && save.stage < 10) save.stage = Math.min(10, g.stage + 1);
  const bonus = (1 + stars * .1) * (g.n > 1 ? 1.2 : 1);       // 협동 보너스 20%
  const rows = [];
  const cx = Math.round((30 + P.stats.cmdKills * 3 + (win ? 80 : 20) + g.stage * 6 + (g.stats.bossKilled ? 30 : 0)) * bonus);
  const co = save.cmds[P.cmdKey], before = co.lvl, cu = addXp(co, cx);
  const newTal = TALENTS[P.cmdKey].some(r => before < r.lv && co.lvl >= r.lv);
  rows.push({ name: CMDS[P.cmdKey].name, o: co, xp: cx, up: cu, note: newTal ? '새 특성 열림!' : '' });
  DECK.forEach(k => {
    const dep = P.stats.deploys[k] || 0, kl = P.stats.kills[k] || 0;
    const x = Math.round((dep * 4 + kl * 3 + (dep ? (win ? 25 : 8) : 0) + g.stage * (dep ? 2 : 0)) * bonus);
    const o = save.units[k], b0 = o.lvl, up = x ? addXp(o, x) : 0;
    rows.push({ name: UNITS[k].name, o, xp: x, up, note: b0 < EVO_LV && o.lvl >= EVO_LV ? '진화!' : '' });
  });
  writeSave();
  $('resXp').innerHTML = rows.map(r => `<div class="xpi"><b>${r.name} <span style="color:#9fe7ff">Lv ${r.o.lvl}</span></b><span>경험치 +${r.xp}</span>${r.up ? `<span class="up">레벨 업! ▲${r.up}</span>` : ''}${r.note ? `<span class="up" style="color:#ffd45c">${r.note}</span>` : ''}<div class="xb"><i style="width:${r.o.lvl >= MAXLV ? 100 : r.o.xp / xpNeed(r.o.lvl) * 100}%"></i></div></div>`).join('');
  $('resLobby').textContent = g.n > 1 ? '나가기' : '로비로';
  $('resRetry').textContent = g.n > 1 ? '방으로' : '다시 하기';
  show('result', true);
}

/* ================= 협동 레이드 (대기실) ================= */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CMD_KEYS = Object.keys(CMDS);
let coopBusy = false, ROOM_MODE = 'coop';
function coopMsg(t, err) { const m = $('cpMsg'); m.textContent = t || ''; m.style.color = err ? '#ff9a9a' : '#bfe0ff'; }
function coopScreen(which) { $('cpEntry').style.display = which === 'entry' ? '' : 'none'; $('cpRoom').style.display = which === 'room' ? '' : 'none'; }
async function openCoop(mode) {
  if (!app) return;
  ROOM_MODE = mode || 'coop';
  const pvp = ROOM_MODE === 'pvp';
  $('cpTitle').textContent = pvp ? '⚔️ 대결 (1:1 · 2:2)' : '🤝 협동 레이드';
  $('cpQuick').textContent = pvp ? '빠른 대결' : '빠른 참가';
  $('cpAI').style.display = pvp ? '' : 'none';
  $('cpRank').style.display = pvp ? '' : 'none';
  $('cpTip').textContent = pvp ? '내 군대는 언제나 왼쪽! 레벨 차이는 절반만 반영돼요. 상대 거점을 빼앗아야 성을 공격할 수 있어요.' : '최대 4명이 한 전장에서 함께 싸워요. 인원이 많을수록 적도 강해져요.';
  show('coop', true); coopScreen('entry'); coopMsg('서버에 연결하는 중…');
  try { await window.RFNet.init(); coopMsg(''); $('cpNick').textContent = window.RFNet.nick; if (pvp) loadRank(); }
  catch (e) { console.error(e); coopMsg('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', true); }
}
async function loadRank() {
  const R = save.pvp;
  $('cpRank').innerHTML = `<div class="rk-me">내 랭크 점수 <b>${R.r}</b> · ${R.w}승 ${R.l}패${R.d ? ' ' + R.d + '무' : ''}</div><div class="rk-list">순위표 불러오는 중…</div>`;
  try {
    const top = await window.RFNet.rankTop(10);
    $('cpRank').querySelector('.rk-list').innerHTML = top.length ? top.map((o, i) => `<div class="${o.id === save.guest ? 'me' : ''}"><span>${i + 1}</span><b>${esc(o.nm || '?')}</b><em>${o.r}</em><small>${o.w || 0}승 ${o.l || 0}패</small></div>`).join('') : '<div>아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</div>';
  } catch (e) { $('cpRank').querySelector('.rk-list').textContent = '순위표를 불러오지 못했어요'; }
}
async function coopDo(fn) {
  if (coopBusy) return; coopBusy = true;
  try { await fn(); } catch (e) { console.warn(e); coopMsg(e.message || '문제가 생겼어요', true); }
  coopBusy = false;
}
const myProfile = () => profileOf(save.cmd);
$('coopBtn').onclick = () => { goFullscreen(); openCoop('coop'); };
$('pvpBtn').onclick = () => { goFullscreen(); openCoop('pvp'); };
$('cpAI').onclick = () => startPvpAI();
$('cpTeam').onclick = () => {
  const N = window.RFNet, ps = Object.values(N.room.players || {}), me = (N.room.players || {})[N.uid];
  if (!me) return;
  const to = me.tm ? 0 : 1;
  if (ps.filter(p => (p.tm | 0) === to).length >= 2) { coopMsg('그 팀은 이미 2명이에요', true); return; }
  N.setTeam(to);
};
$('cpBack').onclick = () => { if (window.RFNet.code) window.RFNet.leave(); show('coop', false); toLobby(); };
$('cpReroll').onclick = () => { $('cpNick').textContent = window.RFNet.rerollNick(); };
$('cpCreate').onclick = () => coopDo(async () => { coopMsg('방을 만드는 중…'); await window.RFNet.create(myProfile(), Math.min(save.stage, save.cleared + 1), ROOM_MODE); coopScreen('room'); coopMsg(''); renderRoom(); });
$('cpQuick').onclick = () => coopDo(async () => { coopMsg(ROOM_MODE === 'pvp' ? '상대를 찾는 중…' : '함께할 방을 찾는 중…'); await window.RFNet.quick(myProfile(), Math.min(save.stage, save.cleared + 1), ROOM_MODE); coopScreen('room'); coopMsg(''); renderRoom(); });
$('cpJoin').onclick = () => coopDo(async () => {
  const c = $('cpCode').value.replace(/\D/g, '');
  if (c.length !== 4) throw new Error('방 번호 4자리를 입력해 주세요');
  coopMsg('들어가는 중…'); await window.RFNet.join(c, myProfile()); coopScreen('room'); coopMsg(''); renderRoom();
});
$('cpLeave').onclick = () => { window.RFNet.leave(); coopScreen('entry'); coopMsg('방에서 나왔어요'); };
$('cpCmd').onclick = () => {
  save.cmd = CMD_KEYS[(CMD_KEYS.indexOf(save.cmd) + 1) % CMD_KEYS.length]; writeSave();
  window.RFNet.setProfile(myProfile());
};
$('cpStPrev').onclick = () => { const r = window.RFNet.room; if (r.meta && r.meta.stage > 1) window.RFNet.setStage(r.meta.stage - 1); };
$('cpStNext').onclick = () => { const r = window.RFNet.room; if (r.meta && r.meta.stage < Math.min(10, save.cleared + 1)) window.RFNet.setStage(r.meta.stage + 1); };
$('cpGo').onclick = () => {
  const N = window.RFNet;
  if (N.isHost()) { if (canStart()) N.start(); }
  else { const me = (N.room.players || {})[N.uid]; N.setReady(!(me && me.rd)); }
};
function canStart() {
  const N = window.RFNet, r = N.room;
  if (!r.meta) return false;
  const ps = Object.entries(r.players || {});
  const allReady = ps.length >= 2 && ps.every(([u, p]) => u === r.meta.host || p.rd);
  if (r.meta.mode !== 'pvp') return allReady;
  const n0 = ps.filter(e => !e[1].tm).length, n1 = ps.length - n0;
  return allReady && n0 === n1 && n0 <= 2;
}
function slotHtml(e, i, host, col) {
  const N = window.RFNet;
  if (!e) return `<div class="slot empty"><span>빈자리</span><small>방 번호를 알려주세요</small></div>`;
  const [u, p] = e, c = CMDS[p.cmd] || CMDS.guardian;
  return `<div class="slot${u === N.uid ? ' me' : ''}" style="border-color:${col}"><canvas data-cmd="${p.cmd}" width="96" height="96"></canvas><b>${esc(p.nm)}${u === N.uid ? ' (나)' : ''}</b><span>${c.name} · <i class="rl">${c.role}</i> · Lv ${p.lv ? p.lv.cmd : 1}</span><em class="${u === host ? 'host' : p.rd ? 'rd' : ''}">${u === host ? '방장' : p.rd ? '준비 완료' : '준비 중'}</em></div>`;
}
function renderRoom() {
  const N = window.RFNet, r = N.room;
  if (!N.code || !r.meta) return;
  if (state === 'play' && !(G && G.over)) return;
  const pvp = r.meta.mode === 'pvp';
  $('cpTitle').textContent = pvp ? '⚔️ 대결 (1:1 · 2:2)' : '🤝 협동 레이드';
  $('cpRoomCode').textContent = N.code;
  const ps = Object.entries(r.players || {}).sort((a, b) => (a[1].j || 0) - (b[1].j || 0));
  const host = r.meta.host;
  let html = '';
  if (pvp) {
    const t0 = ps.filter(e => !e[1].tm), t1 = ps.filter(e => e[1].tm);
    html = `<div class="team blue"><h3>파랑 팀</h3>${[0, 1].map(i => slotHtml(t0[i], i, host, OWN_COL[i])).join('')}</div><div class="vs">VS</div><div class="team red"><h3>빨강 팀</h3>${[0, 1].map(i => slotHtml(t1[i], i, host, '#ff6b6b')).join('')}</div>`;
  } else for (let i = 0; i < 4; i++) html += slotHtml(ps[i], i, host, OWN_COL[i]);
  $('cpSlots').className = pvp ? 'slots pvp' : 'slots';
  $('cpSlots').innerHTML = html;
  $('cpSlots').querySelectorAll('canvas').forEach(cv => cv.getContext('2d').drawImage(sprite('hero_' + cv.dataset.cmd, 0), 0, 0, 96, 96));
  if (pvp) {
    $('cpSyn').innerHTML = '<small>1:1 또는 2:2로 팀 인원을 맞추면 시작할 수 있어요 · 레벨 차이는 절반만 반영</small>';
  } else {
    const roles = new Set(ps.map(e => e[1].cmd));
    $('cpSyn').innerHTML = CMD_KEYS.map(k => `<span class="${roles.has(k) ? 'on' : ''}">${CMDS[k].role}</span>`).join('') + (roles.size === 3 ? '<b>삼위일체! 전원 +5%</b>' : '<small>수호·파괴·지원이 모이면 삼위일체 보너스</small>');
  }
  $('cpStageRow').style.display = pvp ? 'none' : '';
  $('cpTeam').style.display = pvp ? '' : 'none';
  const S = STAGES[r.meta.stage] || STAGES[1];
  $('cpStage').textContent = r.meta.stage + ' 스테이지';
  $('cpStInfo').textContent = CHAPTERS[S.ch].name + ' · 수문장 ' + ENEMIES[S.boss].name + (ps.length > 1 ? ` · 적 강화 ×${(1 + .55 * (ps.length - 1)).toFixed(2)}` : '');
  const isHost = N.isHost();
  $('cpStPrev').style.visibility = $('cpStNext').style.visibility = isHost ? 'visible' : 'hidden';
  const me = (r.players || {})[N.uid];
  if (isHost) {
    const ok = canStart();
    $('cpGo').textContent = ps.length < 2 ? (pvp ? '상대를 기다리는 중' : '함께할 사람을 기다리는 중') : ok ? '시작!' : pvp ? '팀 인원·준비를 맞추면 시작' : '모두 준비하면 시작';
    $('cpGo').disabled = !ok;
  } else { $('cpGo').disabled = false; $('cpGo').textContent = me && me.rd ? '준비 취소' : '준비'; }
}
function startOnline(cfg) {
  if (!app) return;
  initAudio();
  ME = cfg.me; NETMODE = true; MYTEAM = cfg.mode === 'pvp' ? (cfg.roster[cfg.me].tm | 0) : 0;
  netTurns = new Set(); netMaxTurn = -1; netStartAt = cfg.startAt; netDesync = false;
  const g = newGame(cfg.stage, cfg.roster, cfg.seed, { mode: cfg.mode });
  g.online = true;
  beginPlay(g);
}
function startPvpAI() {
  if (!app) return;
  initAudio();
  if (window.RFNet.code) window.RFNet.leave();
  NETMODE = false; ME = 0; MYTEAM = 0;
  const me = Object.assign({ uid: 'me', nm: window.RFNet.nick || '나', tm: 0 }, profileOf(save.cmd));
  const ai = { uid: 'ai', nm: 'AI ' + CMDS[CMD_KEYS[Date.now() % 3]].name, tm: 1, ai: true, cmd: CMD_KEYS[Date.now() % 3], lv: JSON.parse(JSON.stringify(me.lv)), tal: {} };
  beginPlay(newGame(1, [me, ai], (Date.now() & 0x7fffffff), { mode: 'pvp' }));
}
function backToRoom() {
  const N = window.RFNet;
  state = 'lobby'; G = null; NETMODE = false; ME = 0;
  if (!N.code) { toLobby(); return; }
  if (N.isHost()) N.backToRoom();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, hud.width, hud.height);
  show('lobby', true); show('coop', true); coopScreen('room'); renderRoom();
}
function leaveCoop() {
  window.RFNet.leave();
  toLobby();
}
window.RFNet && window.RFNet.hooks({
  onRoom: renderRoom,
  onStart: startOnline,
  onTurn: onNetTurn,
  onDesync: () => { netDesync = true; },
  onGone: msg => { if (state === 'play' && NETMODE) return; coopScreen('entry'); coopMsg(msg, true); },
});

/* ================= 화면 크기 / 방향 ================= */
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  scale = Math.min(innerWidth / W, innerHeight / H);
  const cw = Math.round(W * scale), ch = Math.round(H * scale);
  for (const c of [gcv, hud]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
  hud.width = Math.round(cw * dpr); hud.height = Math.round(ch * dpr);
  if (app) { app.renderer.resize(cw, ch, dpr); app.stage.scale.set(scale); gcv.style.width = cw + 'px'; gcv.style.height = ch + 'px'; }
  const portrait = innerHeight > innerWidth && matchMedia('(pointer:coarse)').matches;
  show('rotate', portrait);
  if (portrait && state === 'play') pauseGame();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

resize(); buildLobby(); requestAnimationFrame(loop);
$('startBtn').disabled = true; $('startBtn').textContent = '불러오는 중…';
initPixi().then(() => { $('startBtn').disabled = false; $('startBtn').textContent = '출전!'; buildLobby(); })
  .catch(e => { console.error(e); $('startBtn').textContent = '그래픽 엔진을 불러오지 못했어요 (새로고침)'; });

// 테스트·디버그용 (락스텝 검증에도 사용)
window.__RF = { get MYTEAM() { return MYTEAM; }, newGame, step, stateHash, soloRoster, get G() { return G; }, get ME() { return ME; }, startGame, save, UNITS, DECK, NOFX, perf, get renderer() { return RENDERER; }, get app() { return app; }, STAGES, get netMaxTurn() { return netMaxTurn; } };
})();
