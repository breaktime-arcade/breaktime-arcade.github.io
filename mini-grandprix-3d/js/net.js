/*!
 * 미니카 그랑프리 3D - 같이 달리기 (Firebase Realtime Database)
 * © 2026 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 * 무단 복제·수정·재배포를 금지합니다.
 */
const CFG = {
  apiKey: 'AIzaSyC5o_QG5ipd4mYpFwMiGvdIKe5BmD0bFy8',
  authDomain: 'breaktime-arcade-live.firebaseapp.com',
  databaseURL: 'https://breaktime-arcade-live-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'breaktime-arcade-live',
  storageBucket: 'breaktime-arcade-live.firebasestorage.app',
  messagingSenderId: '411045673216',
  appId: '1:411045673216:web:5222680b2229c0bf115be5',
};
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const ROOT = 'minigp';
const WAIT_MS = 10000, MAX = 4, SEATS = 5, STALE_MS = 10 * 60 * 1000;
const ADJ = ['날쌘', '졸린', '배고픈', '씩씩한', '수줍은', '엉뚱한', '느긋한', '용감한', '깜찍한', '튼튼한', '명랑한', '꼼꼼한'];
const NMS = ['철수', '영희', '민수', '순이', '길동', '똘이', '말순', '영구', '덕배', '춘자', '복동', '꽃님'];
const $ = (id) => document.getElementById(id);
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let db = null, uid = null, offset = 0, nick = '';
let room = null, timer = null, session = 0, step = '';
let H = null;        // 게임 쪽 콜백
let opts = null;     // { car, carName(type), themeName(key), themes:[keys] }

function load(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
    document.head.appendChild(s);
  });
}
async function boot() {
  if (db) return;
  if (!window.firebase) {
    await load(SDK + 'firebase-app-compat.js');
    await Promise.all([load(SDK + 'firebase-auth-compat.js'), load(SDK + 'firebase-database-compat.js')]);
  }
  const fb = window.firebase;
  if (!fb.apps.length) fb.initializeApp(CFG);
  const au = fb.auth();
  await au.setPersistence(fb.auth.Auth.Persistence.SESSION); // 탭마다 다른 사람
  const cred = au.currentUser ? { user: au.currentUser } : await au.signInAnonymously();
  uid = cred.user.uid;
  db = fb.database();
  db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
}
const now = () => Date.now() + offset;
const roomRef = (rid) => db.ref(ROOT + '/rooms/' + rid);
const lobbyRef = (rid) => db.ref(ROOT + '/lobby/' + (rid || ''));
const isHost = () => !!(room && room.meta && room.meta.host === uid);
const rosterOf = (m) => (m && m.roster ? (Array.isArray(m.roster) ? m.roster : Object.values(m.roster)) : []);

// ---------- 대기실 화면 ----------
function ui(title, info) { $('lb-title').textContent = title; $('lb-info').textContent = info || ''; }
function renderLobby() {
  if (!room) { $('lb-list').innerHTML = ''; return; }
  const ps = Object.entries(room.players).sort((a, b) => (a[1].j || 0) - (b[1].j || 0));
  let html = ps.map(([u, p]) => `<div class="lb-row${u === uid ? ' me' : ''}"><span>🏎️ ${esc(p.nm)}${u === uid ? ' (나)' : ''}
    <small>${esc(opts.carName(p.car))}</small></span><span class="st">${p.rd ? '준비 완료!' : '기다리는 중'}</span></div>`).join('');
  for (let i = ps.length; i < SEATS; i++) html += `<div class="lb-row empty"><span>${i < MAX ? '빈자리 · AI가 채워요' : 'AI 레이서'}</span><span></span></div>`;
  $('lb-list').innerHTML = html;
  const th = room.meta && room.meta.theme;
  $('lb-track').textContent = th ? '이번 트랙: ' + opts.themeName(th) : '';
}

// ---------- 시작 / 방 찾기 ----------
async function start(o, handlers) {
  opts = o; H = handlers;
  const my = ++session;
  $('lobby').hidden = false;
  $('lb-list').innerHTML = ''; $('lb-track').textContent = '';
  $('btn-ready').hidden = true;
  ui('연결하는 중…', '');
  try { await boot(); } catch (e) {
    console.error(e);
    ui('연결에 실패했어요', '인터넷 연결을 확인하거나, 레이스(혼자)로 즐겨주세요.');
    return;
  }
  if (my !== session) return;
  nick = pickOne(ADJ) + ' ' + pickOne(NMS);
  ui('같이 달릴 친구를 찾는 중…', '내 이름: ' + nick);
  try { await findRoom(my); } catch (e) {
    console.error(e);
    const code = String((e && (e.code || e.message)) || e);
    const denied = /permission|PERMISSION/i.test(code);
    ui('방을 찾지 못했어요', (denied ? 'Firebase 보안 규칙에서 막혔어요. ' : '잠시 후 다시 시도하거나, 레이스(혼자)로 즐겨주세요. ') +
      '[' + (step || '?') + ' / ' + code + ']');
  }
}

async function findRoom(my) {
  step = '대기실 읽기';
  const lob = (await lobbyRef().once('value')).val() || {};
  if (my !== session) return;
  const t = now();
  const cands = [];
  for (const [rid, e] of Object.entries(lob)) {
    if (!e || t - (e.t || 0) > STALE_MS) { lobbyRef(rid).remove(); roomRef(rid).remove().catch(() => {}); continue; }
    if (t - e.t < WAIT_MS - 1500 && (e.n || 0) < MAX) cands.push([rid, e]);
  }
  cands.sort((a, b) => a[1].t - b[1].t);
  for (const [rid] of cands) {
    step = '방 입장';
    const ref = roomRef(rid).child('meta');
    await ref.once('value');
    const r = await ref.transaction(m => {
      if (m === null) return null;
      if (m.status !== 'wait' || (m.cnt || 0) >= MAX) return;
      m.cnt = (m.cnt || 0) + 1; return m;
    });
    if (my !== session) return;
    if (r.committed && r.snapshot.val() && r.snapshot.val().status === 'wait') { await joinRoom(rid, my); return; }
  }
  // 들어갈 방이 없으면 새로 만들기 (트랙은 방마다 랜덤)
  const rid = db.ref(ROOT + '/rooms').push().key;
  const created = now();
  step = '방 만들기';
  await roomRef(rid).child('meta').set({ status: 'wait', host: uid, cnt: 1, created, waitUntil: created + WAIT_MS, theme: pickOne(opts.themes) });
  step = '대기실 등록';
  await lobbyRef(rid).set({ t: created, n: 1 });
  if (my !== session) { lobbyRef(rid).remove(); roomRef(rid).remove(); return; }
  await joinRoom(rid, my);
}

function watch(ref, ev, fn) {
  ref.on(ev, fn, err => console.error(err));
  room.offs.push(() => ref.off(ev, fn));
}

async function joinRoom(rid, my) {
  const ref = roomRef(rid);
  room = { id: rid, ref, meta: null, players: {}, started: false, starting: false, offs: [], hostGoneAt: 0, claiming: false, wasHost: false, shownTheme: null };
  const pref = ref.child('players/' + uid);
  step = '참가자 읽기';
  const cur = (await ref.child('players').once('value')).val() || {};
  const taken = new Set(Object.values(cur).map(p => String(p.nm).split(' ').pop()));
  for (let i = 0; i < 30 && taken.has(nick.split(' ').pop()); i++) nick = pickOne(ADJ) + ' ' + pickOne(NMS);
  step = '자리 등록';
  await pref.onDisconnect().remove();
  await pref.set({ nm: nick, rd: 0, car: opts.car, j: window.firebase.database.ServerValue.TIMESTAMP });
  if (my !== session) return;
  watch(ref.child('meta'), 'value', s => { if (room) { room.meta = s.val(); onMeta(); } });
  watch(ref.child('players'), 'value', s => { if (room) { room.players = s.val() || {}; onPlayers(); } });
  ui('대기실', '');
  const b = $('btn-ready'); b.hidden = false; b.disabled = false; b.textContent = '준비 완료';
  timer = setInterval(tick, 250);
}

function onMeta() {
  const m = room.meta;
  if (!m) {
    if (!room.started) { const my = session; leaveRoom(); ui('방이 사라졌어요', '다른 방을 찾는 중…'); findRoom(my).catch(console.error); }
    return;
  }
  if (!room.started && m.theme && room.shownTheme !== m.theme) { room.shownTheme = m.theme; H.onPreview(m.theme); renderLobby(); }
  if (m.status === 'start' && m.roster && !room.started) {
    const roster = rosterOf(m);
    const seat = roster.findIndex(r => r && r.u === uid);
    if (seat < 0) { const my = session; leaveRoom(); ui('방이 먼저 출발했어요', '다른 방을 찾는 중…'); findRoom(my).catch(console.error); return; }
    room.started = true;
    room.wasHost = m.host === uid;
    $('lobby').hidden = true;
    watch(room.ref.child('cars'), 'child_added', s => H.onCar(+s.key, s.val()));
    watch(room.ref.child('cars'), 'child_changed', s => H.onCar(+s.key, s.val()));
    H.onStart({ roster, me: seat, startAt: m.startAt, theme: m.theme });
    return;
  }
  if (room.started) {
    room.wasHost = m.host === uid;
    H.onControl();
  }
}

function onPlayers() {
  if (!room.started) renderLobby();
  const m = room.meta; if (!m) return;
  if (!room.started && isHost()) lobbyRef(room.id).update({ n: Object.keys(room.players).length });
  if (m.host && !room.players[m.host]) { if (!room.hostGoneAt) room.hostGoneAt = Date.now(); } else room.hostGoneAt = 0;
  if (room.started) H.onControl();
}

async function claimHost() {
  const order = Object.entries(room.players).sort((a, b) => (a[1].j || 0) - (b[1].j || 0));
  if (!order.length || order[0][0] !== uid) return;
  room.claiming = true;
  try {
    await room.ref.child('meta/host').transaction(h => {
      if (h === null) return null;
      if (room && room.players[h]) return;
      return uid;
    });
  } catch (e) { console.error(e); }
  if (room) room.claiming = false;
}

function tick() {
  if (!room || !room.meta) return;
  const m = room.meta;
  if (room.hostGoneAt && Date.now() - room.hostGoneAt > 1500 && !room.claiming) claimHost();
  if (room.started) return;
  const left = Math.max(0, Math.ceil((m.waitUntil - now()) / 1000));
  $('lb-info').textContent = `${left}초 후 출발 · 모두 준비 완료면 바로 출발 · 빈자리는 AI가 채워요`;
  if (isHost() && m.status === 'wait') {
    const ps = Object.values(room.players);
    const allReady = ps.length > 0 && ps.every(p => p.rd);
    if (now() >= m.waitUntil || allReady || ps.length >= MAX) hostStart();
  }
}

async function hostStart() {
  if (room.starting) return;
  room.starting = true;
  const ps = Object.entries(room.players).sort((a, b) => (a[1].j || 0) - (b[1].j || 0)).slice(0, MAX);
  const roster = H.buildRoster(ps.map(([u, p]) => ({ u, nm: p.nm, car: p.car })));
  try {
    await room.ref.child('meta').update({ status: 'start', roster, startAt: now() + 4600 });
    lobbyRef(room.id).remove();
  } catch (e) { console.error(e); room.starting = false; }
}

function leaveRoom() {
  if (!room) return;
  clearInterval(timer); timer = null;
  room.offs.forEach(f => f());
  const pref = room.ref.child('players/' + uid);
  pref.onDisconnect().cancel(); pref.remove().catch(() => {});
  if (isHost()) {
    const others = Object.keys(room.players).filter(u => u !== uid);
    if (!room.started && !others.length) { lobbyRef(room.id).remove(); room.ref.remove().catch(() => {}); }
    else if (others.length) room.ref.child('meta/host').set(others.sort((a, b) => (room.players[a].j || 0) - (room.players[b].j || 0))[0]).catch(() => {});
    else if (room.started) room.ref.remove().catch(() => {});
  }
  room = null;
}

// ---------- 게임에서 부르는 함수 ----------
export const NET = {
  start,
  now,
  get active() { return !!(room && room.started); },
  get uid() { return uid; },
  isHost,
  // 이 자리를 내 화면이 조종해야 하나? (내 차, 또는 방장일 때 AI·나간 사람 자리)
  controls(slot) {
    if (!room || !room.meta) return false;
    const r = rosterOf(room.meta)[slot];
    if (!r) return false;
    if (r.u === uid) return true;
    return isHost() && (!r.u || !room.players[r.u]);
  },
  isOnline(slot) {
    if (!room || !room.meta) return false;
    const r = rosterOf(room.meta)[slot];
    return !!(r && r.u && room.players[r.u]);
  },
  sendCars(map) {
    if (!room || !room.started) return;
    const up = {};
    for (const k in map) up['cars/' + k] = map[k];
    room.ref.update(up).catch(console.error);
  },
  ready() {
    if (!room) return;
    room.ref.child('players/' + uid + '/rd').set(1);
    const b = $('btn-ready'); b.disabled = true; b.textContent = '준비됨!';
  },
  leave() { session++; leaveRoom(); $('lobby').hidden = true; },
  // 결승 후 방 정리 (마지막 사람이 나가면 지움)
  endRoom() {
    if (!room) return;
    const ref = room.ref;
    setTimeout(() => ref.remove().catch(() => {}), 120000);
  },
};