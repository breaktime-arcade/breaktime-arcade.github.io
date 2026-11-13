/*!
 * 작은 마을 성장 일기 — 메인
 * © 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildMap, polyDist } from './map.js';
import { Sim } from './sim.js';
import { World } from './world.js';
import { Villager, portrait } from './people.js';
import { YEAR_LEN, MAX_YEAR, SEASONS, SEASON_ICON, JOBS, BUILDINGS, ERAS, josa } from './data.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const SEASON_LEN = YEAR_LEN / 4;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const VILLAGE_NAMES = ['햇살마을', '구름골', '솔바람마을', '달빛마을', '하늘섬마을', '도토리골', '무지개마을', '꽃바람마을', '은하수마을', '별빛마을', '바람개비마을', '새벽골', '단풍마을', '이슬마을'];

// ───── 렌더러 ─────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
app.prepend(renderer.domElement);
const labelRenderer = new CSS2DRenderer(); labelRenderer.setSize(innerWidth, innerHeight); labelRenderer.domElement.id = 'labels';
app.insertBefore(labelRenderer.domElement, renderer.domElement.nextSibling);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 3000);
camera.position.set(70, 52, 80);

const map = buildMap();
const world = new World(renderer, camera, map);
const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.62; controls.minDistance = 6; controls.maxDistance = 220; controls.target.set(0, 1, 0);

// ───── 상태 ─────
let sim, views = [], villageName = VILLAGE_NAMES[Math.floor(Math.random() * VILLAGE_NAMES.length)];
let speed = 1, paused = false, started = false, sel = null, gameT = 0;
let groundDirty = true, lastEra = -1, portraitCache = new Map();
const famColor = (p) => (sim.families[p.surname] || {}).color || '#888';
function getPortrait(p) { const key = p.id + ':' + sim.stage(p) + (p.alive ? '' : 'x') + (p.chief ? 'c' : ''); if (!portraitCache.has(key)) portraitCache.set(key, portrait(p, sim)); return portraitCache.get(key); }

function newVillage() {
  for (const v of views) v.dispose();
  views = [];
  for (const rec of world.models.values()) world.scene.remove(rec.root);
  world.models.clear(); world.fieldList = []; world.fencePost.count = 0; world.fenceRail.count = 0; world.cropH = -1;
  world.setGraves(0); world.rail.visible = false; world.train.visible = false;
  world.grassPts.forEach(() => { }); // 풀은 유지
  sim = new Sim(map);
  sim.on(onEvent);
  // 시작 건물 반영
  for (const b of sim.buildings) world.addBuilding(b);
  $('#diary-list').innerHTML = ''; lastDiaryYear = 0;
  for (const e of sim.diary) addDiary(e);
  portraitCache.clear(); sel = null; renderCard();
  groundDirty = true; lastEra = -1;
}

// ───── 이벤트 ─────
function onEvent(type, d) {
  if (type === 'diary') { addDiary(d); if (d.banner) banner(d.banner, d.sub || ''); if (d.pos && d.prio >= 2) shot({ x: d.pos.x, z: d.pos.z, follow: d.who ? d.who[0] : undefined, dist: d.kind === 'era' ? 70 : 15, height: d.kind === 'era' ? 42 : 8, dur: 6, prio: d.prio }); }
  else if (type === 'say') views[d.id]?.say(d.text, d.dur);
  else if (type === 'emote') views[d.id]?.emote(d.e);
  else if (type === 'build:start') { if (d.repair || d.renovate) world.restartBuilding(d.b); else world.addBuilding(d.b); groundDirty = true; }
  else if (type === 'build:done') { if (!world.models.has(d.b.id) && d.b.type !== 'field') world.addBuilding(d.b); world.finishBuilding(d.b); groundDirty = true; }
  else if (type === 'build:fire') { shot({ x: d.b.x, z: d.b.z, dist: 16, height: 9, dur: 6, prio: 4 }); }
  else if (type === 'petals') { for (let i = 0; i < 4; i++) setTimeout(() => world.burst(d.x, map.h(d.x, d.z) + 4, d.z, 'petals', 60), i * 350); }
  else if (type === 'wedding') { shot({ x: 0, z: 2.2, dist: 13, height: 6, dur: 7, prio: 6 }); }
  else if (type === 'birth') { const m = sim.people[d.mom]; const h = m.home != null ? sim.buildings[m.home] : null; if (h) world.burst(h.door.x, map.h(h.door.x, h.door.z) + 2, h.door.z, 'sparkle', 30); setTimeout(() => views[d.mom]?.emote('👶'), 300); }
  else if (type === 'arrive') { if (d.by === '열기구') { world.arriveBalloon(); shot({ x: map.landing.x, z: map.landing.z, dist: 22, height: 10, dur: 7, prio: 4 }); } else shot({ x: map.station.x, z: map.station.z, dist: 26, height: 12, dur: 6, prio: 4 }); }
  else if (type === 'caravan') world.flyCaravan();
  else if (type === 'chop') { if (Math.random() < 0.3) world.burst(d.x, map.h(d.x, d.z) + 1, d.z, 'chips', 6); }
  else if (type === 'era') { groundDirty = true; }
  else if (type === 'season') { seasonToast(d.season); }
  else if (type === 'death') { world.setGraves(sim.graves.length); groundDirty = true; }
  else if (type === 'festival') { if (d.on) shot({ x: 0, z: 0, dist: 34, height: 12, dur: 8, prio: 5, orbit: 0.08 }); }
  else if (type === 'end') { setTimeout(showChronicle, 2500); }
}

// ───── 카메라 연출 ─────
const dir = { mode: 'auto', shot: null, until: 0, yaw: 0.8, tgt: new THREE.Vector3(0, 1, 0), pos: camera.position.clone() };
function shot(s) {
  if (!dir.shot || (s.prio ?? 0) >= (dir.shot.prio ?? 0) || gameT > dir.until) { dir.shot = { dist: 14, height: 7, dur: 6, prio: 0, orbit: 0.05, ...s }; dir.until = gameT + dir.shot.dur; }
}
function defaultShot() {
  if (!started) return shot({ x: 0, z: 0, dist: 118, height: 66, dur: 999, orbit: 0.035, prio: -1, wide: true });
  const r = Math.random();
  if (r < 0.4) return shot({ x: 0, z: 1, dist: 78 + Math.random() * 16, height: 42 + Math.random() * 12, dur: 10, orbit: 0.04, wide: true });
  const al = sim.alive().filter(p => !p.inside && !(p.arrival && !p.landed));
  if (!al.length) return shot({ x: 0, z: 1, dist: 90, height: 50, dur: 8, orbit: 0.04, wide: true });
  const fun = al.filter(p => p.task && ['chat', 'festival', 'play', 'build', 'farm', 'fish', 'dance'].includes(p.task.type));
  const p = (fun.length && Math.random() < 0.7 ? fun : al)[Math.floor(Math.random() * (fun.length && Math.random() < 0.7 ? fun.length : al.length))] || al[0];
  if (r < 0.6) return shot({ x: p.x, z: p.z, dist: 30, height: 18, dur: 8, orbit: 0.05 });
  shot({ follow: p.id, dist: 11 + Math.random() * 5, height: 5 + Math.random() * 3, dur: 7, orbit: 0.06 });
}
function updateCamera(dt) {
  if (dir.mode === 'free') { controls.update(); world.setTilt(0.5, 1.6); return; }
  if (dir.mode === 'follow' && sel != null && views[sel]) {
    const a = views[sel].root.position;
    const d = new THREE.Vector3().subVectors(a, controls.target).multiplyScalar(1 - Math.exp(-dt * 4)); d.y = (a.y + 1 - controls.target.y) * (1 - Math.exp(-dt * 4));
    controls.target.add(d); camera.position.add(d); controls.update(); world.setTilt(0.5, 1.2); return;
  }
  if (!dir.shot || gameT > dir.until) defaultShot();
  const s = dir.shot;
  let tx = s.x, tz = s.z;
  if (s.follow != null && views[s.follow] && views[s.follow].root.visible) { const p = views[s.follow].root.position; tx = p.x; tz = p.z; }
  const ty = Math.max(map.h(tx || 0, tz || 0), 0) + 1;
  dir.yaw += (s.orbit || 0) * dt;
  const desired = new THREE.Vector3(tx + Math.sin(dir.yaw) * s.dist, ty + s.height, tz + Math.cos(dir.yaw) * s.dist);
  dir.pos.lerp(desired, 1 - Math.exp(-dt * 1.3)); dir.tgt.lerp(new THREE.Vector3(tx, ty, tz), 1 - Math.exp(-dt * 2));
  camera.position.copy(dir.pos); camera.lookAt(dir.tgt); controls.target.copy(dir.tgt);
  world.setTilt(0.5, s.wide ? 2.6 : 1.8);
}
function setCamMode(m) {
  dir.mode = m; if (m === 'auto') { dir.pos.copy(camera.position); dir.tgt.copy(controls.target); dir.shot = null; }
  document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === m));
}
controls.addEventListener('start', () => { if (dir.mode === 'auto') setCamMode('free'); });

// ───── 일기 ─────
let lastDiaryYear = 0;
function addDiary(e) {
  const list = $('#diary-list');
  if (e.year !== lastDiaryYear) { lastDiaryYear = e.year; const h = document.createElement('div'); h.className = 'dy'; h.textContent = `📖 ${e.year}년`; list.prepend(h); }
  if (e.kind === 'year') return;
  const el = document.createElement('div'); el.className = 'de ' + e.kind;
  el.innerHTML = `<span class="di">${e.icon}</span><span class="dt">${e.text}</span><span class="ds">${SEASONS[e.season]}</span>`;
  if (e.pos) el.onclick = () => { setCamMode('auto'); shot({ x: e.pos.x, z: e.pos.z, dist: 15, height: 8, dur: 7, prio: 9 }); };
  const hdr = list.querySelector('.dy');
  hdr ? hdr.after(el) : list.prepend(el);
  requestAnimationFrame(() => el.classList.add('in'));
  while (list.children.length > 140) list.lastChild.remove();
}
let bannerT;
function banner(t, sub = '') { const b = $('#banner'); b.innerHTML = `<div class="b1">${t}</div>${sub ? `<div class="b2">${sub}</div>` : ''}`; b.className = 'show'; clearTimeout(bannerT); bannerT = setTimeout(() => b.className = '', 3200); }
function seasonToast(s) { const t = $('#season-toast'); t.textContent = `${SEASON_ICON[s]} ${SEASONS[s]}`; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }

// ───── HUD ─────
const timeline = $('#timeline');
function buildTimeline() {
  timeline.innerHTML = '<i class="fill"></i>' + [...Array(MAX_YEAR)].map((_, i) => `<b style="left:${(i / MAX_YEAR) * 100}%"></b>`).join('');
}
function updateHUD() {
  const y = sim.year, s = sim.season, al = sim.alive();
  $('#h-year').textContent = `${Math.min(y, 999)}년차`;
  $('#h-season').textContent = `${SEASON_ICON[s]} ${SEASONS[s]}`;
  $('#h-era').textContent = `${ERAS[sim.era].icon} ${ERAS[sim.era].name}`;
  $('#h-name').textContent = villageName;
  timeline.querySelector('.fill').style.width = Math.min(100, ((sim.yearF() - 1) / MAX_YEAR) * 100) + '%';
  $('#r-pop').textContent = al.length; $('#r-fam').textContent = sim.activeFamilies().length;
  $('#r-food').textContent = Math.floor(sim.res.food); $('#r-wood').textContent = Math.floor(sim.res.wood); $('#r-stone').textContent = Math.floor(sim.res.stone); $('#r-coin').textContent = Math.floor(sim.res.coin);
  $('#r-happy').textContent = Math.round(sim.happy);
  $('#r-happy-i').textContent = sim.happy > 75 ? '😄' : sim.happy > 55 ? '🙂' : sim.happy > 35 ? '😐' : '😟';
  $('#r-food').parentElement.classList.toggle('warn', sim.hungry || sim.res.food < al.length);
  // 축복
  document.querySelectorAll('.bless').forEach(b => { const cd = sim.blessCD[b.dataset.k]; b.disabled = cd > 0 || (sim.ended && !sim.endless); b.querySelector('em').textContent = cd > 0 ? `${cd}년 후` : '사용 가능'; });
  // 가문
  updateFamilies();
}
function updateFamilies() {
  const fams = sim.activeFamilies();
  const html = fams.map(f => {
    const mem = sim.alive().filter(p => p.surname === f.surname);
    const gens = new Set(mem.map(p => p.gen)).size;
    const chief = mem.some(p => p.chief);
    return `<div class="fam" data-s="${f.surname}"><i style="background:${f.color}">${f.surname}</i><div><b>${f.surname}씨 가문 ${chief ? '🎖️' : ''}</b><small>${f.n}명 · ${gens}대 · ${f.since}년 정착</small></div></div>`;
  }).join('');
  const box = $('#fam-list'); if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; box.querySelectorAll('.fam').forEach(el => el.onclick = () => openTree(el.dataset.s)); }
}

// ───── 주민 카드 ─────
const TR = [['diligence', '성실'], ['social', '사교'], ['ambition', '야망'], ['kindness', '친절'], ['creative', '창의']];
function select(id) { sel = id; if (id != null && sim.people[id].alive) { setCamMode('follow'); const p = views[id].root.position; controls.target.copy(p); camera.position.copy(p).add(new THREE.Vector3(8, 6, 10)); } renderCard(); }
window.__selp = (id) => { $('#tree').classList.remove('show'); select(id); };
function renderCard() {
  const box = $('#card');
  if (sel == null) { box.classList.remove('show'); return; }
  const p = sim.people[sel], age = Math.floor(sim.ageOf(p));
  const link = (id) => { const q = sim.people[id]; return `<a onclick="__selp(${id})"><img src="${getPortrait(q)}">${q.name}${q.alive ? '' : ' 🕯️'}</a>`; };
  const job = p.alive ? JOBS[p.job] || JOBS.farmer : null;
  box.innerHTML = `<button class="x" onclick="__selp(null)">✕</button>
    <div class="c-head"><img src="${getPortrait(p)}"><div><div class="c-name">${p.name} <span class="gen" style="background:${famColor(p)}">${p.gen}대</span></div>
    <div class="c-sub">${p.alive ? `${age}세 · ${job.icon} ${job.label}${p.chief ? ' · 🎖️ 촌장' : ''}` : `🕯️ ${p.deathYear}년 영면 · 향년 ${age}세`}</div></div></div>
    <div class="c-rel">${p.spouse != null ? `<div><span>배우자</span>${link(p.spouse)}</div>` : ''}
      ${p.father != null || p.mother != null ? `<div><span>부모</span>${[p.father, p.mother].filter(x => x != null).map(link).join('')}</div>` : ''}
      ${p.children.length ? `<div><span>자녀</span>${p.children.map(link).join('')}</div>` : ''}</div>
    <div class="c-tr">${TR.map(([k, n]) => `<div><span>${n}</span><i><s style="width:${Math.round(p.t[k] * 100)}%"></s></i></div>`).join('')}</div>
    <div class="c-log">${p.log.slice().reverse().map(l => `<div><b>${l.year}년</b>${l.text}</div>`).join('')}</div>
    <div class="c-btn"><button onclick="__tree('${p.surname}')">🌳 ${p.surname}씨 가계도</button></div>`;
  box.classList.add('show');
}
window.__tree = (s) => openTree(s);

// ───── 가계도 ─────
function openTree(surname) {
  const S = surname;
  const members = sim.people.filter(p => p.surname === S);
  const inTree = new Set(members.map(p => p.id));
  const roots = members.filter(p => (p.father == null || sim.people[p.father].surname !== S) && (p.mother == null || !inTree.has(p.mother)));
  const kidsOf = (p) => p.children.map(i => sim.people[i]).filter(c => c.surname === S);
  const W = 128, H = 118;
  const widthOf = new Map();
  const wOf = (p) => { if (widthOf.has(p.id)) return widthOf.get(p.id); const ks = kidsOf(p); const self = p.spouse != null ? 2 : 1; const w = Math.max(self, ks.reduce((s, k) => s + wOf(k), 0)); widthOf.set(p.id, w); return w; };
  const nodes = [], links = [];
  let x0 = 0;
  const place = (p, x, depth) => {
    const w = wOf(p);
    const cx = x + w / 2;
    const couple = p.spouse != null;
    nodes.push({ p, x: (cx - (couple ? 0.5 : 0)) * W, y: depth * H });
    if (couple) nodes.push({ p: sim.people[p.spouse], x: (cx + 0.5) * W, y: depth * H, spouse: true });
    let kx = x;
    for (const k of kidsOf(p)) { const kw = wOf(k); links.push({ from: { x: cx * W, y: depth * H + 52 }, to: { x: (kx + kw / 2 - (k.spouse != null ? 0.5 : 0)) * W, y: (depth + 1) * H - 8 } }); place(k, kx, depth + 1); kx += kw; }
  };
  for (const r of roots.filter(r => !roots.some(o => o.spouse === r.id && o.gender === 'M' && r.gender === 'F' && false))) { if (nodes.some(n => n.p.id === r.id)) continue; place(r, x0, 0); x0 += wOf(r) + 0.3; }
  const totalW = Math.max(...nodes.map(n => n.x)) + W, totalH = Math.max(...nodes.map(n => n.y)) + H;
  const fam = sim.families[S];
  const box = $('#tree-body');
  box.innerHTML = `<div class="tree-canvas" style="width:${totalW}px;height:${totalH}px">
    <svg width="${totalW}" height="${totalH}">${links.map(l => `<path d="M${l.from.x + W / 2},${l.from.y} C${l.from.x + W / 2},${(l.from.y + l.to.y) / 2} ${l.to.x + W / 2},${(l.from.y + l.to.y) / 2} ${l.to.x + W / 2},${l.to.y}" />`).join('')}
    ${nodes.filter(n => n.spouse).map(n => `<line x1="${n.x - W + W / 2 + 34}" y1="${n.y + 30}" x2="${n.x + W / 2 - 34}" y2="${n.y + 30}" class="mar"/>`).join('')}</svg>
    ${nodes.map(n => { const p = n.p, age = Math.floor(sim.ageOf(p)); const job = p.alive ? (JOBS[p.job] || JOBS.farmer) : null;
      return `<div class="tn ${p.alive ? '' : 'dead'} ${n.spouse ? 'sp' : ''}" style="left:${n.x}px;top:${n.y}px" onclick="__selp(${p.id})"><img src="${getPortrait(p)}"><b>${p.name}${p.chief ? '🎖️' : ''}</b><small>${p.alive ? `${age}세 · ${job.icon}${job.label}` : `🕯️ ${p.deathYear}년 · ${age}세`}</small></div>`; }).join('')}
  </div>`;
  $('#tree-title').innerHTML = `<i style="background:${fam.color}">${S}</i> ${S}씨 가문 가계도 <small>${fam.since}년 정착 · 지금까지 ${members.length}명</small>`;
  $('#tree').classList.add('show');
}
$('#tree .x').onclick = () => $('#tree').classList.remove('show');

// ───── 연대기 ─────
function showChronicle() {
  const al = sim.alive(), all = sim.people;
  const hist = sim.popHistory;
  const maxPop = Math.max(...hist.map(h => h.pop), al.length);
  const longest = all.slice().sort((a, b) => sim.ageOf(b) - sim.ageOf(a))[0];
  const desc = (p) => { let n = 0; const st = [...p.children]; const seen = new Set(); while (st.length) { const c = st.pop(); if (seen.has(c)) continue; seen.add(c); n++; st.push(...sim.people[c].children); } return n; };
  const patriarch = all.filter(p => p.gen === 1).sort((a, b) => desc(b) - desc(a))[0];
  const fams = sim.activeFamilies().slice(0, 5);
  const builtN = sim.buildings.filter(b => b.built && b.type !== 'field').length;
  const st = (i, t, v) => `<div class="st"><span>${i}</span><div><small>${t}</small><b>${v}</b></div></div>`;
  const births = all.filter(p => p.log[0] && p.log[0].text.includes('태어남')).length;
  const weds = all.filter(p => p.spouse != null && p.gender === 'M').length;
  $('#chron').innerHTML = `<div class="ch-card">
    <h2>📖 ${villageName} ${sim.year - 1}년 연대기</h2><div class="sub">세 가족의 오두막에서 시작된 이야기</div>
    <canvas id="ch-chart" width="640" height="170"></canvas>
    <div class="stats">${st('👥', '현재 주민', `${al.length}명 (최대 ${maxPop}명)`)}${st('👶', '태어난 아기', `${births}명`)}${st('💒', '결혼', `${weds}쌍`)}${st('🏘️', '가문', `${sim.activeFamilies().length}개`)}${st('🏗️', '세운 건물', `${builtN}채`)}${st('🕯️', '떠나보낸 이', `${all.filter(p => !p.alive).length}명`)}</div>
    <div class="ch-cols"><div><h4>🏆 마을의 인물</h4>
      <p>👴 최장수: <b>${longest.name}</b> (${Math.floor(sim.ageOf(longest))}세${longest.alive ? '' : ', 영면'})</p>
      ${patriarch ? `<p>🌳 가장 큰 뿌리: <b>${patriarch.name}</b> — 자손 ${desc(patriarch)}명</p>` : ''}
      ${sim.chief != null ? `<p>🎖️ 현재 촌장: <b>${sim.people[sim.chief].name}</b></p>` : ''}
      <p>🧬 최대 세대: <b>${Math.max(...all.map(p => p.gen))}대손</b>까지</p>
      <h4>🏘️ 큰 가문</h4>${fams.map(f => `<p><i class="dot" style="background:${f.color}"></i>${f.surname}씨 가문 <b>${f.n}명</b></p>`).join('')}</div>
      <div><h4>📜 마을의 발자취</h4><div class="ms">${sim.milestones.map(m => `<p><b>${m.year}년</b> ${m.icon} ${m.text}</p>`).join('')}</div></div></div>
    <div class="end-btns"><button id="go-on">계속 지켜보기 ▶</button><button id="new-v" class="ghost">🌱 새 마을 시작</button></div></div>`;
  $('#chron').classList.add('show');
  // 인구 그래프
  const cv = $('#ch-chart'), g = cv.getContext('2d'), w = cv.width, h = cv.height;
  const pts = hist.map((d, i) => ({ x: 30 + (i / Math.max(1, hist.length - 1)) * (w - 50), y: h - 24 - (d.pop / maxPop) * (h - 44) }));
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.1)'; for (let k = 0; k <= 4; k++) { const y = h - 24 - k / 4 * (h - 44); g.beginPath(); g.moveTo(30, y); g.lineTo(w - 20, y); g.stroke(); g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '11px Pretendard'; g.fillText(Math.round(maxPop * k / 4), 4, y + 4); }
  sim.milestones.filter(m => m.text.includes('시대')).forEach(m => { const x = 30 + ((m.year - 1) / Math.max(1, hist.length - 1)) * (w - 50); g.strokeStyle = 'rgba(255,210,63,.5)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, 10); g.lineTo(x, h - 24); g.stroke(); g.setLineDash([]); g.fillStyle = '#ffd23f'; g.fillText(m.icon, x - 7, 14); });
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(126,200,120,.55)'); gr.addColorStop(1, 'rgba(126,200,120,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(pts[0].x, h - 24); pts.forEach(p => g.lineTo(p.x, p.y)); g.lineTo(pts.at(-1).x, h - 24); g.fill();
  g.strokeStyle = '#8fe388'; g.lineWidth = 2.5; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText('1년', 26, h - 6); g.fillText(`${hist.length}년`, w - 40, h - 6);
  $('#go-on').onclick = () => { sim.endless = true; $('#chron').classList.remove('show'); };
  $('#new-v').onclick = () => { $('#chron').classList.remove('show'); villageName = VILLAGE_NAMES[Math.floor(Math.random() * VILLAGE_NAMES.length)]; newVillage(); openStart(); };
}

// ───── 시작 화면 ─────
function openStart() {
  started = false;
  $('#v-name').textContent = villageName;
  const fams = sim.activeFamilies();
  $('#founders').innerHTML = fams.map(f => {
    const mem = sim.alive().filter(p => p.surname === f.surname || (p.spouse != null && sim.people[p.spouse].surname === f.surname && p.gender === 'F'));
    return `<div class="fcard"><i style="background:${f.color}">${f.surname}</i><div class="fm">${mem.map(p => `<span><img src="${getPortrait(p)}"><b>${p.given}</b><small>${Math.floor(sim.ageOf(p))}세</small></span>`).join('')}</div></div>`;
  }).join('');
  $('#start').classList.add('show');
  dir.shot = null;
}
$('#reroll').onclick = () => { villageName = VILLAGE_NAMES[(VILLAGE_NAMES.indexOf(villageName) + 1 + Math.floor(Math.random() * 5)) % VILLAGE_NAMES.length]; $('#v-name').textContent = villageName; };
$('#go').onclick = () => {
  $('#start').classList.remove('show'); started = true; dir.shot = null; setCamMode('auto');
  banner(`🌱 ${villageName} 이야기 시작`, '세 가족이 하늘섬에 첫 오두막을 지었습니다');
  shot({ x: 0, z: 0, dist: 30, height: 16, dur: 7, prio: 3, orbit: 0.08 });
};

// ───── 컨트롤 ─────
function setSpeed(s) { if (s === 0) paused = !paused; else { speed = s; paused = false; } document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', paused ? b.dataset.speed === '0' : +b.dataset.speed === speed)); }
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { if (b.dataset.cam === 'auto') { sel = null; renderCard(); } setCamMode(b.dataset.cam); });
$('#btn-q').onclick = () => { const hi = world.quality !== 'high'; world.setQuality(hi ? 'high' : 'low'); $('#btn-q').textContent = hi ? '✨ 고화질' : '⚡ 저사양'; };
$('#btn-diary').onclick = () => app.classList.toggle('diary-open');
$('#btn-help').onclick = () => $('#help').classList.toggle('show'); $('#help').onclick = () => $('#help').classList.remove('show');
document.querySelectorAll('.bless').forEach(b => b.onclick = () => {
  if (!started) return;
  const ok = sim.bless(b.dataset.k);
  if (ok) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); if (b.dataset.k === 'rain') shot({ x: 16, z: 3, dist: 30, height: 16, dur: 6, prio: 5 }); }
});
addEventListener('keydown', (e) => {
  if (e.code === 'Space') { setSpeed(0); e.preventDefault(); }
  if (e.key === '1') setSpeed(1); if (e.key === '2') setSpeed(2); if (e.key === '3') setSpeed(4); if (e.key === '4') setSpeed(8);
  if (e.key === 'Escape') { sel = null; renderCard(); setCamMode('auto'); $('#tree').classList.remove('show'); }
});
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let down = null;
labelRenderer.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
labelRenderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !started) return;
  mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(views.filter(v => v.root.visible).map(v => v.root), true);
  const h = hits.find(x => x.object.userData.pid != null); if (h) select(h.object.userData.pid);
});

// ───── 지면 다시 그리기 ─────
function repaintGround() {
  const reach = map.roads.map(() => 6);
  for (const b of sim.buildings) {
    if (!b.plot || b.type === 'field') { if (b.type === 'field') reach[1] = Math.max(reach[1], Math.hypot(b.x, b.z) + 3); continue; }
    let bi = -1, bd = 1e9, bs = 0;
    map.roads.forEach((r, i) => { const q = polyDist(b.door.x, b.door.z, r); if (q.d < bd) { bd = q.d; bi = i; bs = q.s; } });
    if (bi >= 0) reach[bi] = Math.max(reach[bi], bs + 3);
  }
  if (sim.hasAny('bridge')) reach[3] = Math.max(reach[3], 22);
  if (sim.hasAny('station')) reach[3] = 99;
  if (sim.hasAny('quarry')) reach[0] = Math.max(reach[0], 18);
  world.paintGround({ buildings: sim.buildings, era: sim.era, reach, graves: sim.graves.length });
  world.setLamps(sim.era, reach);
  groundDirty = false;
}

// ───── 루프 ─────
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight); world.resize(innerWidth, innerHeight); });
const clock = new THREE.Clock();
let uiT = 0, fwT = 0, fpsAcc = 0, fpsN = 0, autoLow = false, groundT = 0;
const riverY = (p) => { const q = polyDist(p.x, p.z, map.river); return q.d < 1.6 ? map.riverY(q.s) - 0.45 : -99; };
function frame() {
  requestAnimationFrame(frame);
  const rdt = Math.min(clock.getDelta(), 0.1);
  const run = started && !paused;
  const sdt = run ? rdt * speed : 0;
  gameT += run ? sdt : rdt * 0.3;
  if (run) sim.update(sdt);
  while (views.length < sim.people.length) views.push(new Villager(sim.people[views.length], sim, world.scene));
  updateCamera(rdt);
  // 계절 계산
  const sp = (sim.t % YEAR_LEN) / SEASON_LEN, si = Math.floor(sp), sf = sp - si;
  const season = { i: si, w: smooth(0.72, 1, sf) };
  let snow = 0; if (si === 3) snow = smooth(0, 0.25, sf) * 0.9; if (si === 0) snow = 0.9 * (1 - smooth(0, 0.18, sf)); if (sim.weather === 'blizzard') snow = Math.max(snow, 1);
  let cropH = si === 0 ? 0.1 + sf * 0.4 : si === 1 ? 0.55 + sf * 0.45 : si === 2 ? (sf < 0.55 ? 1.05 : Math.max(0.02, 1.05 * (1 - (sf - 0.55) / 0.25))) : 0.02;
  const env = { dayPhase: started ? sim.dayPhase() : 0.35, season, snow, cropH, weather: sim.weather, festival: sim.festival, trees: sim.treeAlive, trainOn: sim.trainOn };
  const { night } = world.update(run ? sdt : rdt * 0.4, env);
  // 축제 불꽃놀이
  if (sim.festival && night > 0.3 && run) { fwT -= sdt; if (fwT < 0) { fwT = 0.45 + Math.random() * 0.7; world.firework((Math.random() - 0.5) * 16, 24 + Math.random() * 8, (Math.random() - 0.5) * 16); } }
  groundT += rdt; if (groundDirty && groundT > 0.5) { groundT = 0; repaintGround(); }
  const camD = camera.position.distanceTo(dir.mode === 'auto' ? dir.tgt : controls.target);
  const o = { time: performance.now() / 1000, sel, tags: camD < 34, labels: camD < 52 || sel != null, famColor, bridge: sim.has('bridge') ? map.bridge : null, riverY };
  for (const v of views) v.update(run ? sdt : rdt * 0.3, map, o);
  world.render(); labelRenderer.render(world.scene, camera);
  uiT += rdt; if (uiT > 0.3) { uiT = 0; updateHUD(); if (sel != null && Math.random() < 0.3) renderCard(); }
  fpsAcc += rdt; fpsN++; if (fpsAcc > 4) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 22 && !autoLow && !location.search.includes('noauto') && world.quality === 'high') { autoLow = true; world.setQuality('low'); $('#btn-q').textContent = '⚡ 저사양'; } }
}

buildTimeline();
newVillage();
openStart();
setSpeed(1); setCamMode('auto');
if (location.search.includes('debug')) window.__dbg = { get sim() { return sim; }, setSpeed: (v) => { speed = v; }, world, shot, showChronicle, openTree, views: () => views };
$('#loading').classList.add('hide');
frame();
