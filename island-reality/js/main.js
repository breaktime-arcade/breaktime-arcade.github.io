/*!
 * 마지막 생존자 — AI 무인도 리얼리티 (메인)
 * © 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildMap } from './map.js';
import { Sim } from './sim.js';
import { World } from './world.js';
import { ActorView, portrait } from './actors.js';
import { CHARACTERS, LINES, PHASE_LABEL, ACTION_LABEL, fill, josa } from './data.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');

// ───────── 렌더러 ─────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.id = 'labels';
app.insertBefore(labelRenderer.domElement, renderer.domElement.nextSibling);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.3, 2000);
camera.position.set(60, 45, 70);

const map = buildMap();
const world = new World(renderer, camera, map);
const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 4; controls.maxDistance = 170;
controls.target.set(0, 2, 5);

const PORTRAITS = CHARACTERS.map(d => portrait(d, 96));
const IMGS = PORTRAITS.map(src => { const i = new Image(); i.src = src; return i; });

// ───────── 상태 ─────────
let sim, actors = [];
let speed = 1, paused = false;
let fav = null, sel = null;
let started = false, ceremony = false;
let gameT = 0;
const waits = [];
const wait = (sec) => new Promise(res => waits.push({ left: sec, res }));

function newSeason() {
  actors.forEach(a => world.scene.remove(a.root));
  sim = new Sim(map, (Math.random() * 1e9) | 0);
  actors = sim.agents.map(a => new ActorView(a, world.scene));
  sim.on(onSimEvent);
  ceremony = false; sel = null;
  $('#log-list').innerHTML = '';
  buildCast();
  world.stormTarget = 0;
}

// ───────── 카메라 연출 ─────────
const dir = { mode: 'auto', shot: null, until: 0, yaw: 0.7, tgt: new THREE.Vector3(0, 2, 5), pos: new THREE.Vector3(60, 45, 70), nextIdle: 0 };
function shot(s) {
  if (!dir.shot || (s.prio ?? 0) >= (dir.shot.prio ?? 0) || gameT > dir.until) {
    dir.shot = { dist: 12, height: 5, dur: 5, prio: 0, orbit: 0.06, ...s };
    dir.until = gameT + dir.shot.dur;
    if (s.yaw != null) dir.yaw = s.yaw;
  }
}
function defaultShot() {
  const ph = sim.phase;
  const al = sim.alive();
  if (!started) return shot({ x: 0, z: 2, dist: 92, height: 46, dur: 999, orbit: 0.04, prio: -1 });
  if (ph === 'challenge' && sim.challenge) {
    if (sim.challenge.type === 'race') {
      const lead = al.filter(a => !a.finished).sort((a, b) => (b.wp || 0) - (a.wp || 0))[0] || al[0];
      return shot({ follow: lead.id, dist: 15, height: 7, dur: 3, orbit: 0.02 });
    }
    const p = map.posts[4];
    return shot({ x: p.x, z: p.z, dist: 19, height: 7, dur: 6, orbit: 0.05 });
  }
  if (ph === 'evening') return shot({ x: map.camp.x, z: map.camp.z, dist: 13, height: 5.5, dur: 6, orbit: 0.08 });
  if (ph === 'council' || ph === 'finale' || ph === 'end') return shot({ x: map.council.x, z: map.council.z, dist: 12.5, height: 6, dur: 8, orbit: 0.03, yaw: ph === 'council' ? Math.PI - 0.35 : Math.PI * 0.62 });
  if (ph === 'night') return shot({ x: map.shelter.x, z: map.shelter.z, dist: 18, height: 8, dur: 6, orbit: 0.05 });
  if (ph === 'dawn') return shot({ x: map.camp.x, z: map.camp.z, dist: 22, height: 10, dur: 5, orbit: 0.06 });
  // 활동: 흥미로운 사람 위주
  if (Math.random() < 0.18) return shot({ x: 0, z: 4, dist: 80, height: 40, dur: 6, orbit: 0.05 });
  const cand = al.filter(a => a.task && ['social', 'listen', 'scheme', 'idol', 'steal'].includes(a.task.type) && a.task.stage === 'do');
  const pick = cand.length ? cand[Math.floor(Math.random() * cand.length)] : al[Math.floor(Math.random() * al.length)];
  if (pick) shot({ follow: pick.id, dist: 10 + Math.random() * 4, height: 4 + Math.random() * 3, dur: 6, orbit: 0.07 });
}
function updateCamera(dt) {
  if (dir.mode === 'free') { controls.update(); return; }
  if (dir.mode === 'follow' && sel != null) {
    const a = actors[sel].root.position;
    const d = new THREE.Vector3().subVectors(a, controls.target).setY(0).multiplyScalar(1 - Math.exp(-dt * 4));
    controls.target.add(d); camera.position.add(d);
    controls.target.y += (a.y + 1.4 - controls.target.y) * (1 - Math.exp(-dt * 4));
    controls.update(); return;
  }
  if (!dir.shot || gameT > dir.until) defaultShot();
  const s = dir.shot;
  let tx = s.x, tz = s.z, ty = s.y;
  if (s.follow != null) { const p = actors[s.follow].root.position; tx = p.x; tz = p.z; ty = p.y + 1.3; }
  if (ty == null) ty = Math.max(map.h(tx, tz), 0) + 1.4;
  dir.yaw += (s.orbit || 0) * dt;
  const desired = new THREE.Vector3(tx + Math.sin(dir.yaw) * s.dist, ty + s.height, tz + Math.cos(dir.yaw) * s.dist);
  const ground = Math.max(map.h(desired.x, desired.z), 0) + 1.5;
  if (desired.y < ground) desired.y = ground;
  const k = 1 - Math.exp(-dt * 1.6);
  dir.pos.lerp(desired, k); dir.tgt.lerp(new THREE.Vector3(tx, ty, tz), 1 - Math.exp(-dt * 2.4));
  camera.position.copy(dir.pos); camera.lookAt(dir.tgt);
  controls.target.copy(dir.tgt);
}
function setCamMode(m) {
  dir.mode = m;
  if (m === 'auto') { dir.pos.copy(camera.position); dir.tgt.copy(controls.target); dir.shot = null; }
  document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === m));
}
controls.addEventListener('start', () => { if (dir.mode === 'auto') setCamMode('free'); });

// ───────── UI: 출연자 목록 ─────────
const castRows = [];
function buildCast() {
  const box = $('#cast-list'); box.innerHTML = ''; castRows.length = 0;
  sim.agents.forEach((a, i) => {
    const r = document.createElement('div'); r.className = 'cast-row';
    r.innerHTML = `<img src="${PORTRAITS[i]}"><div class="cr-main"><div class="cr-top"><b>${a.name}</b><span class="cr-icons"></span></div>
      <div class="bars"><i class="hp"><s></s></i><i class="hu"><s></s></i></div><div class="cr-act"></div></div>`;
    r.onclick = () => select(a.id);
    box.appendChild(r);
    castRows.push({ r, icons: r.querySelector('.cr-icons'), hp: r.querySelector('.hp s'), hu: r.querySelector('.hu s'), act: r.querySelector('.cr-act') });
  });
}
function updateCast() {
  sim.agents.forEach((a, i) => {
    const c = castRows[i];
    c.r.classList.toggle('out', !a.alive);
    c.r.classList.toggle('fav', fav === a.id);
    c.r.classList.toggle('sel', sel === a.id);
    let ic = '';
    if (fav === a.id) ic += '⭐';
    if (a.immune && a.alive) ic += '🏅';
    if (a.idol && a.alive) ic += '🐚';
    if (a.wins) ic += `<em>🏆${a.wins}</em>`;
    const al = sim.allianceOf(a); if (al && a.alive) ic += `<u style="background:${al.color}" title="${al.name} 동맹"></u>`;
    if (c.icons.innerHTML !== ic) c.icons.innerHTML = ic;
    c.hp.style.width = Math.max(0, a.hp) + '%';
    c.hu.style.width = (100 - a.hunger) + '%';
    const act = a.alive ? (ACTION_LABEL[a.label] || '…') : a.outReason === 'evac' ? `🚑 ${a.outDay}일차 이송` : `⛵ ${a.outDay}일차 탈락`;
    if (c.act.textContent !== act) c.act.textContent = act;
  });
}

// ───────── UI: 상세 카드 ─────────
const TRAITS = [['strength', '힘'], ['endurance', '지구력'], ['social', '사교성'], ['diligence', '성실함'], ['cunning', '전략'], ['kindness', '친절함']];
function select(id) {
  sel = sel === id ? null : id;
  if (sel != null) { setCamMode('follow'); const p = actors[sel].root.position; controls.target.copy(p).add(new THREE.Vector3(0, 1.4, 0)); camera.position.copy(p).add(new THREE.Vector3(7, 5, 9)); }
  else setCamMode('auto');
  renderDetail();
}
function renderDetail() {
  const box = $('#detail');
  if (sel == null) { box.classList.remove('show'); return; }
  const a = sim.agents[sel];
  const others = sim.agents.filter(o => o !== a);
  const best = others.slice().sort((x, y) => sim.aff[a.id][y.id] - sim.aff[a.id][x.id]);
  const al = sim.allianceOf(a);
  const relRow = (o) => { const v = Math.round(sim.aff[a.id][o.id]); return `<span class="rel ${v >= 0 ? 'p' : 'n'}"><img src="${PORTRAITS[o.id]}">${o.name} ${v > 0 ? '+' : ''}${v}</span>`; };
  box.innerHTML = `<button class="x" onclick="window.__sel(null)">✕</button>
   <div class="d-head"><img src="${PORTRAITS[a.id]}"><div><div class="d-name">${a.def.icon} ${a.name} <small>${a.def.job}</small></div><div class="d-tag">${a.def.tag}</div></div></div>
   <p class="d-desc">${a.def.desc}</p>
   <div class="d-traits">${TRAITS.map(([k, n]) => `<div><span>${n}</span><i><s style="width:${Math.round(a.t[k] * 100)}%"></s></i></div>`).join('')}</div>
   <div class="d-stat">❤️ 체력 ${Math.round(Math.max(0, a.hp))} · 🍖 배고픔 ${Math.round(a.hunger)} · ⚡ 기력 ${Math.round(a.energy)}</div>
   <div class="d-stat">🏆 미션 ${a.wins}승 · 🗳️ 받은 표 ${a.votesRecv} · 🛠️ 기여 ${Math.round(a.contribution)}</div>
   ${al && a.alive ? `<div class="d-stat">🤝 <b style="color:${al.color}">${al.name} 동맹</b> · ${al.members.filter(m => m !== a.id).map(m => sim.agents[m].name).join(', ')}${al.target != null ? ` · 표적 ${sim.agents[al.target].name}` : ''}</div>` : ''}
   ${a.idol && a.alive ? `<div class="d-stat secret">🐚 면책 조개를 몰래 갖고 있다!</div>` : ''}
   <div class="d-rel"><div>💚 좋아함</div>${best.slice(0, 2).map(relRow).join('')}</div>
   <div class="d-rel"><div>💢 싫어함</div>${best.slice(-2).reverse().map(relRow).join('')}</div>`;
  box.classList.add('show');
}
window.__sel = (v) => { sel = null; setCamMode('auto'); renderDetail(); };

// ───────── UI: 로그·배너 ─────────
function addLog(d) {
  const list = $('#log-list');
  const el = document.createElement('div'); el.className = 'log ' + d.kind;
  el.innerHTML = `<span class="li">${d.icon}</span><span class="lt">${d.text}</span><span class="lm">${d.day}일 ${PHASE_LABEL[d.phase]?.slice(0, 2) || ''}</span>`;
  if (d.pos) el.onclick = () => { setCamMode('auto'); shot({ x: d.pos.x, z: d.pos.z, dist: 11, height: 5, dur: 6, prio: 9 }); };
  list.prepend(el);
  while (list.children.length > 70) list.lastChild.remove();
  requestAnimationFrame(() => el.classList.add('in'));
}
let bannerT = null;
function banner(text, sub = '', cls = '') {
  const b = $('#banner');
  b.className = 'show ' + cls; b.innerHTML = `<div class="b1">${text}</div>${sub ? `<div class="b2">${sub}</div>` : ''}`;
  clearTimeout(bannerT); bannerT = setTimeout(() => b.className = '', 2800 / Math.max(1, speed * 0.7));
}
function countdown(n) {
  const c = $('#countdown');
  c.textContent = n > 0 ? n : '시작!';
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
}

// ───────── 시뮬레이션 이벤트 ─────────
function onSimEvent(type, d) {
  if (type === 'log') {
    addLog(d);
    if (d.banner) banner(d.banner);
    if (d.pos && d.prio >= 2 && !ceremony) shot({ x: d.pos.x, z: d.pos.z, follow: d.who ? d.who[0] : undefined, dist: 9.5, height: 4, dur: 5.5, prio: d.prio });
    if (d.icon === '🐚' && d.who) { const p = actors[d.who[0]].root.position; world.burst(p.x, p.y + 1.5, p.z, 'sparkle', 40); }
  } else if (type === 'say') actors[d.id].say(d.text, d.dur);
  else if (type === 'emote') actors[d.id].emote(d.emoji);
  else if (type === 'phase') onPhase(d.phase);
  else if (type === 'storm') world.stormTarget = d.on ? 1 : 0;
  else if (type === 'countdown') { countdown(d.n); }
  else if (type === 'splash') world.burst(d.x, 0.2, d.z, 'splash', 36);
  else if (type === 'council') runCouncil(d.result);
  else if (type === 'finale') runFinale(d.result);
  else if (type === 'boat') boatAway(d.id);
  else if (type === 'end') { }
}
function onPhase(ph) {
  dir.shot = null;
  $('#phase-label').textContent = `${sim.day}일차 · ${PHASE_LABEL[ph]}`;
  if (ph === 'dawn' && started) banner(`🌅 ${sim.day}일차`, `생존자 ${sim.alive().length}명`, 'day');
  if (ph === 'evening') banner('🔥 저녁 캠프파이어');
  if (ph === 'night' && started) { }
}

async function boatAway(id) {
  const act = actors[id];
  await wait(0.2);
  act.onBoat = true;
  if (!ceremony) shot({ x: world.boat.position.x, z: world.boat.position.z, dist: 14, height: 6, dur: 5, prio: 5 });
  world.sailAway(() => { act.onBoat = false; });
}

// ───────── 부족회의 연출 ─────────
const CU = $('#council');
function voteCard(v, opts = {}) {
  const t = sim.agents[v.target];
  const el = document.createElement('div'); el.className = 'vcard';
  el.innerHTML = `<div class="inner"><div class="front">🗳️</div><div class="back"><img src="${PORTRAITS[t.id]}"><b>${t.name}</b>${v.nullified ? '<em class="stamp">무효</em>' : ''}${v.betrayal ? '<em class="betray">배신표</em>' : ''}</div></div>`;
  return el;
}
function tallyBar(m) {
  const box = CU.querySelector('.tally');
  box.innerHTML = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([id, n]) => `<span><img src="${PORTRAITS[id]}">${sim.agents[id].name} <b>${n}</b></span>`).join('');
}
async function revealVotes(votes, title, ceremonial = true) {
  CU.querySelector('.ctitle').textContent = title;
  const row = CU.querySelector('.cards'); row.innerHTML = '';
  CU.querySelector('.tally').innerHTML = '';
  const cards = votes.map(v => { const c = voteCard(v); row.appendChild(c); return c; });
  await wait(0.9);
  const m = {};
  for (let i = 0; i < votes.length; i++) {
    const v = votes[i];
    cards[i].classList.add('flip');
    const tgt = actors[v.target];
    if (!v.nullified) m[v.target] = (m[v.target] || 0) + 1;
    tallyBar(m);
    shot({ follow: v.target, dist: 6.5, height: 1.8, dur: 1.4, prio: 20, orbit: 0 });
    if (v.nullified) tgt.emote('🛡️'); else if (Math.random() < 0.35) tgt.emote(['😨', '😳', '😐', '😬'][Math.floor(Math.random() * 4)]);
    if (v.betrayal) { actors[v.voter].emote('🗡️'); }
    await wait(i >= votes.length - 2 ? 1.6 : 1.05);
  }
  return m;
}
function orderVotes(votes, elimId) {
  const v = votes.slice().sort(() => Math.random() - 0.5);
  // 탈락 확정표는 마지막에
  const idx = v.map((x, i) => [x, i]).filter(([x]) => x.target === elimId && !x.nullified).map(([, i]) => i).pop();
  if (idx != null) { const [x] = v.splice(idx, 1); v.push(x); }
  // 무효표는 앞쪽
  return v.sort((a, b) => (b.nullified ? 1 : 0) - (a.nullified ? 1 : 0));
}
async function runCouncil(res) {
  ceremony = true;
  shot({ x: map.council.x, z: map.council.z, dist: 12, height: 6, dur: 4, prio: 30, orbit: 0.04, yaw: Math.PI - 0.4 });
  banner(`🔥 ${res.day}일차 부족회의`, '오늘 밤, 한 명이 섬을 떠납니다.', 'council');
  await wait(2.4);
  // 투표 중 속마음
  const voters = res.votes.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  for (const v of voters) {
    const a = sim.agents[v.voter], t = sim.agents[v.target];
    actors[a.id].say(v.betrayal ? `💭 미안해, 동맹보다 ${josa(t.name, '이')} 더 위험해.` : sim.aff[a.id][t.id] < -25 ? `💭 ${t.name}, 잘 가.` : `💭 미안해 ${t.name}… 게임이야.`, 1.8);
    shot({ follow: a.id, dist: 6, height: 1.8, dur: 1.7, prio: 25, orbit: 0 });
    await wait(1.7);
  }
  CU.classList.add('show');
  CU.querySelector('.cnote').textContent = '';
  if (res.idol) {
    const h = sim.agents[res.idol.holder];
    CU.classList.remove('show');
    shot({ follow: h.id, dist: 6, height: 2, dur: 3, prio: 40, orbit: 0.1 });
    actors[h.id].say(fill(LINES.idolPlay[Math.floor(Math.random() * 2)], {}), 2.6);
    await wait(1.0);
    const p = actors[h.id].root.position; world.burst(p.x, p.y + 1.5, p.z, 'sparkle', 70);
    banner(`🐚 면책 조개 발동!`, `${h.name}에게 던진 표는 모두 무효가 됩니다.`, 'idol');
    addLog({ text: `${josa(h.name, '이')} 면책 조개를 사용했다! ${h.name}에게 간 표 ${res.idol.saved}장 무효.`, kind: 'drama', icon: '🐚', day: res.day, phase: 'council', pos: p });
    await wait(2.8);
    CU.classList.add('show');
  }
  const ordered = orderVotes(res.votes, res.eliminated);
  await revealVotes(ordered, '개표를 시작하겠습니다');
  if (res.tie) {
    CU.querySelector('.cnote').textContent = res.tie.reason === 'void' ? '모든 표가 무효! 재투표합니다.' : `동점! ${res.tie.candidates.map(i => sim.agents[i].name).join(' vs ')} — 나머지 사람들이 재투표합니다.`;
    banner(res.tie.reason === 'void' ? '전원 무효표!' : '⚖️ 동점!', '재투표를 진행합니다', 'tie');
    await wait(2.4);
    if (res.tie.revotes.length) await revealVotes(orderVotes(res.tie.revotes, res.eliminated), '재투표 결과');
    if (res.drawLots) { CU.querySelector('.cnote').textContent = '또다시 동점… 운명의 제비뽑기!'; banner('🎲 제비뽑기!', '운명에 맡깁니다', 'tie'); await wait(2.6); }
  }
  const out = sim.agents[res.eliminated];
  const nth = sim.agents.filter(a => a.out).length + 1;
  CU.querySelector('.cnote').innerHTML = `<b>${nth}번째 탈락자는… ${out.name}</b>`;
  shot({ follow: out.id, dist: 5.5, height: 1.6, dur: 5, prio: 50, orbit: 0.08 });
  await wait(1.2);
  CU.classList.remove('show');
  banner(`⛵ ${out.name} 탈락`, `${out.def.job} · ${res.day}일차`, 'out');
  const betrayer = res.votes.find(v => v.target === out.id && sim.allianceOf(out)?.members.includes(v.voter)) || res.votes.find(v => v.target === out.id && sim.aff[out.id][v.voter] > 25);
  actors[out.id].say(betrayer ? fill(LINES.elimBitter[Math.floor(Math.random() * 3)], { c: sim.agents[betrayer.voter].name }) : LINES.elimCalm[Math.floor(Math.random() * 3)], 3);
  actors[out.id].emote(betrayer ? '😤' : '🥲');
  addLog({ text: `${res.day}일차 부족회의: ${josa(out.name, '이')} ${Object.values(res.tally).length ? (res.tally[out.id] || 0) + '표로' : ''} 탈락했다.`, kind: 'out', icon: '⛵', day: res.day, phase: 'council', pos: map.council });
  if (res.votes.some(v => v.betrayal)) addLog({ text: `배신표 발생! ${res.votes.filter(v => v.betrayal).map(v => sim.agents[v.voter].name).join(', ')}의 표가 동맹과 달랐다.`, kind: 'drama', icon: '🗡️', day: res.day, phase: 'council', pos: map.council });
  await wait(3.2);
  ceremony = false;
  sim.resolveCouncil();
}

// ───────── 파이널 ─────────
async function runFinale(res) {
  ceremony = true;
  banner('⚖️ 파이널 부족회의', '배심원들이 마지막 생존자를 뽑습니다', 'council');
  await wait(2.5);
  for (const id of res.finalists) {
    const a = sim.agents[id];
    shot({ follow: id, dist: 5.5, height: 1.8, dur: 2.6, prio: 40, orbit: 0.05 });
    actors[id].say(LINES.finalSpeech[Math.floor(Math.random() * LINES.finalSpeech.length)], 2.4);
    await wait(2.6);
  }
  CU.classList.add('show'); CU.querySelector('.cnote').textContent = '';
  const ord = res.votes.slice().sort(() => Math.random() - 0.5);
  const w = res.winner;
  const wi = ord.map((v, i) => v.target === w ? i : -1).filter(i => i >= 0).pop();
  if (wi != null) ord.push(ord.splice(wi, 1)[0]);
  await revealVotes(ord, '배심원 투표 개표');
  if (res.tiebreak != null) { CU.querySelector('.cnote').textContent = '동점! 미션 우승이 더 많은 사람이 우승합니다.'; await wait(2.4); }
  const W = sim.agents[w];
  CU.querySelector('.cnote').innerHTML = `<b>마지막 생존자는… ${W.name}!</b>`;
  await wait(1.6);
  CU.classList.remove('show');
  ceremony = false;
  sim.resolveFinale();
  actors[w].say(LINES.winner[Math.floor(Math.random() * 3)], 3.5);
  const p = actors[w].root.position;
  for (let i = 0; i < 4; i++) setTimeout(() => world.burst(p.x + (Math.random() - 0.5) * 3, p.y + 2, p.z + (Math.random() - 0.5) * 3, 'confetti', 120), i * 450);
  shot({ follow: w, dist: 7, height: 2.5, dur: 999, prio: 99, orbit: 0.25 });
  banner(`👑 ${W.name} 우승!`, '마지막 생존자', 'win');
  addLog({ text: `${josa(W.name, '이')} 배심원 ${res.tally[w] || 0}표를 받아 최종 우승했다!`, kind: 'good', icon: '👑', day: sim.day, phase: 'finale', pos: p });
  await wait(4.5);
  showEnd();
}

// ───────── 종료 화면 ─────────
function showEnd() {
  sel = null; renderDetail(); $('#graph').classList.remove('show');
  const W = sim.winner;
  const outs = sim.agents.filter(a => a.out).sort((a, b) => a.outDay - b.outDay);
  const fin = sim.agents.filter(a => a.alive && a !== W);
  const rankOf = (a) => a === W ? 1 : fin.includes(a) ? 2 : (sim.agents.length - outs.indexOf(a));
  const F = sim.agents[fav];
  let pred;
  if (F === W) pred = `<div class="pred hit">🎉 적중! 응원한 <b>${F.name}</b>이(가) 우승했어요!</div>`;
  else pred = `<div class="pred miss">응원한 <b>${F.name}</b> — 최종 ${rankOf(F)}위${F.out ? ` (${F.outDay}일차 ${F.outReason === 'evac' ? '이송' : '탈락'})` : ' (결승 진출)'}</div>`;
  const by = (f) => sim.agents.slice().sort((a, b) => f(b) - f(a))[0];
  const champ = by(a => a.wins), hated = by(a => a.votesRecv), worker = by(a => a.contribution);
  const pairs = sim.pairs().sort((a, b) => b.v - a.v);
  const bf = pairs[0], en = pairs.at(-1);
  const st = (ic, t, v) => `<div class="st"><span>${ic}</span><div><small>${t}</small><b>${v}</b></div></div>`;
  $('#end').innerHTML = `<div class="end-card">
    <div class="crown">👑</div><img class="wimg" src="${PORTRAITS[W.id]}">
    <h2>마지막 생존자 · ${W.name}</h2><div class="sub">${W.def.job} · ${W.def.tag} · ${sim.day}일 생존</div>
    ${pred}
    <div class="stats">
      ${st('🏆', '미션왕', `${champ.name} (${champ.wins}승)`)}
      ${st('🛠️', '일꾼왕', worker.name)}
      ${st('🎯', '최다 득표', `${hated.name} (${hated.votesRecv}표)`)}
      ${st('❤️', '최고의 짝꿍', `${sim.agents[bf.a].name} & ${sim.agents[bf.b].name}`)}
      ${st('💢', '최악의 앙숙', `${sim.agents[en.a].name} & ${sim.agents[en.b].name}`)}
      ${st('🗡️', '배신 · 🐚 조개', `${sim.history.betrayals}번 · ${sim.history.idolPlays}번`)}
    </div>
    <div class="timeline">${outs.map(a => `<span><img src="${PORTRAITS[a.id]}">${a.outDay}일 ${a.name}${a.outReason === 'evac' ? '🚑' : ''}</span>`).join('')}${fin.map(a => `<span class="fin"><img src="${PORTRAITS[a.id]}">결승 ${a.name}</span>`).join('')}<span class="win"><img src="${PORTRAITS[W.id]}">우승 ${W.name}</span></div>
    <div class="end-btns"><button id="again">🔁 새 시즌 시작</button><button id="watch" class="ghost">계속 구경하기</button></div>
  </div>`;
  $('#end').classList.add('show');
  $('#again').onclick = () => { $('#end').classList.remove('show'); newSeason(); openStart(); };
  $('#watch').onclick = () => { $('#end').classList.remove('show'); };
}

// ───────── 시작 화면 ─────────
function openStart() {
  started = false; fav = null;
  const grid = $('#start-grid'); grid.innerHTML = '';
  CHARACTERS.forEach((d, i) => {
    const c = document.createElement('button'); c.className = 'scard';
    c.innerHTML = `<img src="${PORTRAITS[i]}"><b>${d.icon} ${d.name}</b><small>${d.job}</small><em>${d.tag}</em><p>${d.desc}</p>`;
    c.onclick = () => { fav = i; grid.querySelectorAll('.scard').forEach((x, k) => x.classList.toggle('on', k === i)); $('#go').disabled = false; $('#go').textContent = `⭐ ${d.name} 응원하고 시즌 시작`; };
    grid.appendChild(c);
  });
  $('#go').disabled = true; $('#go').textContent = '응원할 출연자를 골라주세요';
  $('#start').classList.add('show');
  dir.shot = null;
}
$('#go').onclick = () => {
  if (fav == null) return;
  $('#start').classList.remove('show');
  started = true; dir.shot = null; setCamMode('auto');
  banner('🏝️ 시즌 시작!', '10명의 AI가 무인도에 도착했습니다', 'day');
  addLog({ text: `시즌 시작! 당신은 ${josa(sim.agents[fav].name, '을')} 응원합니다.`, kind: 'system', icon: '⭐', day: 1, phase: 'dawn', pos: { x: sim.agents[fav].x, z: sim.agents[fav].z } });
  shot({ follow: fav, dist: 8, height: 3, dur: 4, prio: 10, orbit: 0.15 });
};
$('#rand').onclick = () => { const i = Math.floor(Math.random() * 10); $('#start-grid').children[i].click(); };

// ───────── 컨트롤 ─────────
function setSpeed(s) {
  if (s === 0) paused = !paused; else { speed = s; paused = false; }
  document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', paused ? b.dataset.speed === '0' : +b.dataset.speed === speed));
}
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { if (b.dataset.cam === 'auto') { sel = null; renderDetail(); } setCamMode(b.dataset.cam); });
$('#btn-graph').onclick = () => { $('#graph').classList.toggle('show'); drawGraph(); };
$('#graph .x').onclick = () => $('#graph').classList.remove('show');
$('#btn-q').onclick = () => { const hi = world.quality !== 'high'; world.setQuality(hi ? 'high' : 'low'); $('#btn-q').textContent = hi ? '✨ 고화질' : '⚡ 저사양'; };
$('#btn-log').onclick = () => app.classList.toggle('log-open');
$('#btn-help').onclick = () => $('#help').classList.toggle('show');
$('#help').onclick = () => $('#help').classList.remove('show');
addEventListener('keydown', (e) => {
  if (e.code === 'Space') { setSpeed(0); e.preventDefault(); }
  if (e.key === '1') setSpeed(1); if (e.key === '2') setSpeed(2); if (e.key === '3') setSpeed(4);
  if (e.key === 'Escape') { sel = null; renderDetail(); setCamMode('auto'); }
});

// 3D 클릭 선택
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downXY = null;
labelRenderer.domElement.addEventListener('pointerdown', e => downXY = [e.clientX, e.clientY]);
labelRenderer.domElement.addEventListener('pointerup', e => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 5 || !started) return;
  mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(actors.filter(a => a.root.visible).map(a => a.root), true);
  const h = hits.find(x => x.object.userData.agentId != null);
  if (h) select(h.object.userData.agentId);
});

// ───────── 관계도 ─────────
function drawGraph() {
  if (!$('#graph').classList.contains('show')) return;
  const cv = $('#graph canvas'), g = cv.getContext('2d');
  const W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  g.scale(devicePixelRatio, devicePixelRatio);
  const w = W / devicePixelRatio, h = H / devicePixelRatio, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.38;
  const P = sim.agents.map((a, i) => { const ang = -Math.PI / 2 + i / 10 * Math.PI * 2; return { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R }; });
  // 동맹 영역
  for (const A of sim.alliances) {
    g.strokeStyle = A.color; g.lineWidth = 14; g.globalAlpha = 0.22; g.lineJoin = 'round';
    g.beginPath(); A.members.forEach((m, k) => k ? g.lineTo(P[m].x, P[m].y) : g.moveTo(P[m].x, P[m].y)); if (A.members.length > 2) g.closePath(); g.stroke();
    g.globalAlpha = 1;
  }
  for (const p of sim.pairs()) {
    const A = sim.agents[p.a], B = sim.agents[p.b];
    if (Math.abs(p.v) < 14) continue;
    const dim = (!A.alive || !B.alive) ? 0.25 : 1;
    const t = Math.min(1, (Math.abs(p.v) - 14) / 50);
    g.strokeStyle = p.v > 0 ? `rgba(80,220,140,${(0.25 + t * 0.7) * dim})` : `rgba(255,90,90,${(0.25 + t * 0.7) * dim})`;
    g.lineWidth = 1 + t * 5; g.setLineDash(p.v > 0 ? [] : [6, 4]);
    g.beginPath(); g.moveTo(P[p.a].x, P[p.a].y);
    const mx = (P[p.a].x + P[p.b].x) / 2, my = (P[p.a].y + P[p.b].y) / 2;
    g.quadraticCurveTo(mx + (cx - mx) * 0.25, my + (cy - my) * 0.25, P[p.b].x, P[p.b].y); g.stroke();
  }
  g.setLineDash([]);
  sim.agents.forEach((a, i) => {
    const p = P[i], r = 24;
    g.save(); g.globalAlpha = a.alive ? 1 : 0.35;
    g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.closePath(); g.save(); g.clip(); if (IMGS[i].complete) g.drawImage(IMGS[i], p.x - r, p.y - r, r * 2, r * 2); g.restore();
    g.lineWidth = 3; g.strokeStyle = fav === i ? '#ffd23f' : a.immune && a.alive ? '#ffe680' : 'rgba(255,255,255,.85)'; g.stroke();
    g.fillStyle = '#fff'; g.font = '700 13px Pretendard, sans-serif'; g.textAlign = 'center'; g.fillText(a.name + (a.alive ? '' : ' (탈락)'), p.x, p.y + r + 16);
    g.restore();
  });
}
$('#graph canvas').onclick = (e) => {
  const r = e.target.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
  const w = r.width, h = r.height, R = Math.min(w, h) * 0.38;
  sim.agents.forEach((a, i) => { const ang = -Math.PI / 2 + i / 10 * Math.PI * 2; if (Math.hypot(x - (w / 2 + Math.cos(ang) * R), y - (h / 2 + Math.sin(ang) * R)) < 26 && a.alive) { $('#graph').classList.remove('show'); select(i); } });
};

// ───────── HUD ─────────
function updateHUD() {
  const al = sim.alive().length;
  $('#alive').textContent = `생존 ${al}/10`;
  const pl = `${sim.day}일차 · ${PHASE_LABEL[sim.phase]}`; if ($('#phase-label').textContent !== pl) $('#phase-label').textContent = pl;
  $('#r-food').textContent = sim.food; $('#r-wood').textContent = sim.wood; $('#r-water').textContent = sim.water; $('#r-shelter').textContent = Math.round(sim.shelter) + '%';
  $('#dayprog s').style.width = (sim.clock() * 100).toFixed(1) + '%';
  $('#r-food').parentElement.classList.toggle('warn', sim.food < al);
  $('#r-water').parentElement.classList.toggle('warn', sim.water < al);
}

// ───────── 루프 ─────────
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight); world.resize(innerWidth, innerHeight);
});
const clock = new THREE.Clock();
let uiT = 0, graphT = 0, fpsAcc = 0, fpsN = 0, autoLowered = false;
function frame() {
  requestAnimationFrame(frame);
  const rdt = Math.min(clock.getDelta(), 0.1);
  const run = started && !paused;
  const sdt = run ? rdt * speed : 0;
  gameT += sdt || rdt * 0.2;
  if (run) {
    sim.update(sdt);
    for (const w of waits.slice()) { w.left -= sdt; if (w.left <= 0) { waits.splice(waits.indexOf(w), 1); w.res(); } }
  }
  updateCamera(rdt);
  const focus = new THREE.Vector3(dir.tgt.x, 0, dir.tgt.z);
  const ph = sim.phase;
  world.setShelter(sim.shelter); world.setFood(sim.food); world.setWood(sim.wood);
  world.update(run ? sdt : rdt * 0.3, started ? sim.clock() : 0.3, {
    focus: camera.position.clone().lerp(dir.tgt, 0.7).setY(0),
    campFire: ph === 'evening' || ph === 'night' || ph === 'dawn',
    councilFire: ph === 'council' || ph === 'finale' || ph === 'end',
  });
  const camD = camera.position.distanceTo(dir.mode === 'auto' ? dir.tgt : controls.target);
  const opts = { fav, sel, boat: world.boat, boatSeat: world.boatSeat, tagAlpha: camD > 55 ? 0 : camD > 35 ? 0.55 : 1 };
  for (const a of actors) a.update(run ? sdt : rdt * 0.3, map, opts);
  world.render();
  labelRenderer.render(world.scene, camera);
  uiT += rdt; graphT += rdt;
  if (uiT > 0.25) { uiT = 0; updateCast(); updateHUD(); if (sel != null) renderDetail(); }
  if (graphT > 0.6) { graphT = 0; drawGraph(); }
  // 자동 화질 조정
  fpsAcc += rdt; fpsN++;
  if (fpsAcc > 4) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 24 && !autoLowered && !location.search.includes('noauto') && world.quality === 'high') { autoLowered = true; world.setQuality('low'); $('#btn-q').textContent = '⚡ 저사양'; } }
}

newSeason();
openStart();
if (location.search.includes('debug')) window.__dbg = { get sim() { return sim; }, setSpeed: (v) => { speed = v; }, world, actors, shot };
setSpeed(1);
setCamMode('auto');
$('#loading').classList.add('hide');
frame();
