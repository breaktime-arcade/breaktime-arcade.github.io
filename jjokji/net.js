/*!
 * 쪽지 돌리기 (Secret Note) - 같이 하기 (Firebase Realtime Database)
 * © 2026 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 * 무단 복제·수정·재배포를 금지합니다.
 */
(function () {
  'use strict';
  const CFG = {
    apiKey: 'AIzaSyC5o_QG5ipd4mYpFwMiGvdIKe5BmD0bFy8',
    authDomain: 'breaktime-arcade-live.firebaseapp.com',
    databaseURL: 'https://breaktime-arcade-live-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'breaktime-arcade-live',
    storageBucket: 'breaktime-arcade-live.firebasestorage.app',
    messagingSenderId: '411045673216',
    appId: '1:411045673216:web:5222680b2229c0bf115be5'
  };
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const ROOT = 'jjokji';
  const WAIT_MS = 10000, MAX = 8, STALE_MS = 10 * 60 * 1000;
  const ADJ = ['날쌘', '졸린', '배고픈', '씩씩한', '수줍은', '엉뚱한', '느긋한', '용감한', '깜찍한', '튼튼한', '명랑한', '꼼꼼한'];
  const NMS = ['철수', '영희', '민수', '순이', '길동', '똘이', '말순', '영구', '덕배', '춘자', '복동', '꽃님'];
  const $ = id => document.getElementById(id);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  let db = null, uid = null, offset = 0, nick = '';
  let room = null, timer = null, session = 0;

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
    if (!firebase.apps.length) firebase.initializeApp(CFG);
    const au = firebase.auth();
    // 탭마다 다른 익명 사용자 (같은 브라우저 두 탭으로도 함께하기 가능)
    await au.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    const cred = au.currentUser ? { user: au.currentUser } : await au.signInAnonymously();
    uid = cred.user.uid;
    db = firebase.database();
    db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
  }
  const now = () => Date.now() + offset;
  const roomRef = rid => db.ref(ROOT + '/rooms/' + rid);
  const lobbyRef = rid => db.ref(ROOT + '/lobby/' + (rid || ''));
  const isHost = () => !!(room && room.meta && room.meta.host === uid);

  // ---------- 대기실 화면 ----------
  function ui(title, info) { $('lbTitle').textContent = title; $('lbInfo').textContent = info || ''; }
  function renderLobby() {
    if (!room) { $('lbList').innerHTML = ''; return; }
    const ps = Object.entries(room.players).sort((a, b) => (a[1].j || 0) - (b[1].j || 0));
    let html = ps.map(([u, p]) => '<div class="row' + (u === uid ? ' me' : '') + '"><span>' + esc(p.nm) + (u === uid ? ' (나)' : '') +
      '</span><span class="st">' + (p.rd ? '준비 완료!' : '기다리는 중') + '</span></div>').join('');
    for (let i = ps.length; i < 6; i++) html += '<div class="row"><span class="st">빈자리 · AI 친구</span><span></span></div>';
    $('lbList').innerHTML = html;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---------- 시작 / 방 찾기 ----------
  async function start() {
    const my = ++session;
    $('lobby').classList.remove('hide');
    $('lbList').innerHTML = '';
    $('btnReady').classList.add('hide');
    ui('연결하는 중…', '');
    try { await boot(); } catch (e) {
      console.error(e);
      ui('연결에 실패했어요', '인터넷 연결을 확인하거나, 혼자 하기로 즐겨주세요.');
      return;
    }
    if (my !== session) return;
    nick = pick(ADJ) + ' ' + pick(NMS);
    ui('친구를 찾는 중…', '내 이름: ' + nick);
    try { await findRoom(my); } catch (e) {
      console.error(e);
      ui('방을 찾지 못했어요', '잠시 후 다시 시도하거나, 혼자 하기로 즐겨주세요.');
    }
  }

  async function findRoom(my) {
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
    // 들어갈 방이 없으면 새로 만들기
    const rid = db.ref(ROOT + '/rooms').push().key;
    const created = now();
    await roomRef(rid).child('meta').set({ status: 'wait', host: uid, cnt: 1, created, waitUntil: created + WAIT_MS });
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
    room = { id: rid, ref, meta: null, players: {}, started: false, starting: false, offs: [], hostGoneAt: 0, claiming: false, wasHost: false, left: new Set(), lastSnap: null };
    const pref = ref.child('players/' + uid);
    // 같은 방 안에서 이름이 겹치지 않게
    const cur = (await ref.child('players').once('value')).val() || {};
    const taken = new Set(Object.values(cur).map(p => String(p.nm).split(' ').pop()));
    for (let i = 0; i < 30 && taken.has(nick.split(' ').pop()); i++) nick = pick(ADJ) + ' ' + pick(NMS);
    await pref.onDisconnect().remove();
    await pref.set({ nm: nick, rd: 0, j: firebase.database.ServerValue.TIMESTAMP });
    if (my !== session) return;
    watch(ref.child('meta'), 'value', s => { room && (room.meta = s.val(), onMeta()); });
    watch(ref.child('players'), 'value', s => { room && (room.players = s.val() || {}, onPlayers()); });
    ui('대기실', '');
    const b = $('btnReady'); b.classList.remove('hide'); b.disabled = false; b.textContent = '준비 완료';
    timer = setInterval(tick, 250);
  }

  function onMeta() {
    const m = room.meta;
    if (!m) {
      if (!room.started) { const my = session; leaveRoom(); ui('방이 사라졌어요', '다른 방을 찾는 중…'); findRoom(my).catch(console.error); }
      return;
    }
    if (m.status === 'start' && m.roster && !room.started) {
      const roster = Array.isArray(m.roster) ? m.roster : Object.values(m.roster);
      const seat = roster.findIndex(r => r && r.u === uid);
      if (seat < 0) { const my = session; leaveRoom(); ui('방이 먼저 시작했어요', '다른 방을 찾는 중…'); findRoom(my).catch(console.error); return; }
      room.started = true;
      $('lobby').classList.add('hide');
      watch(room.ref.child('s'), 'value', s => {
        const v = s.val(); if (!v || !room) return;
        room.lastSnap = v;
        if (!isHost()) JJ_GAME.onSnap(v);
      });
      watch(room.ref.child('req'), 'child_added', s => {
        if (!isHost()) return;
        const v = s.val(); s.ref.remove();
        JJ_GAME.onReq(v);
      });
      room.wasHost = m.host === uid;
      JJ_GAME.beginMulti({ roster, me: seat, startAt: m.startAt, host: room.wasHost });
      return;
    }
    if (room.started) {
      if (m.host === uid && !room.wasHost) { room.wasHost = true; JJ_GAME.becomeHost(room.lastSnap); checkLeft(); }
      else if (m.host !== uid && room.wasHost) { room.wasHost = false; JJ_GAME.becomeClient(); }
    }
  }

  function onPlayers() {
    if (!room.started) renderLobby();
    const m = room.meta; if (!m) return;
    if (!room.started && isHost()) lobbyRef(room.id).update({ n: Object.keys(room.players).length });
    if (m.host && !room.players[m.host]) { if (!room.hostGoneAt) room.hostGoneAt = Date.now(); } else room.hostGoneAt = 0;
    checkLeft();
  }
  // 방장만: 게임 중 나간 사람 자리는 AI가 대신
  function checkLeft() {
    const m = room && room.meta;
    if (!m || !room.started || !isHost() || !m.roster) return;
    const roster = Array.isArray(m.roster) ? m.roster : Object.values(m.roster);
    roster.forEach((r, i) => {
      if (r && r.u && r.u !== uid && !room.players[r.u] && !room.left.has(r.u)) { room.left.add(r.u); JJ_GAME.onLeft(i); }
    });
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
    $('lbInfo').textContent = left + '초 후 시작 · 빈자리는 AI 친구가 채워요 (최대 8명)';
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
    const roster = JJ_GAME.buildRoster(ps.map(([u, p]) => ({ u, nm: p.nm })));
    try {
      await room.ref.child('meta').update({ status: 'start', roster, startAt: now() + 3400 });
      lobbyRef(room.id).remove();
    } catch (e) { console.error(e); room.starting = false; }
  }

  function leaveRoom() {
    if (!room) return;
    clearInterval(timer); timer = null;
    room.offs.forEach(f => f());
    const pref = room.ref.child('players/' + uid);
    pref.onDisconnect().cancel(); pref.remove().catch(() => {});
    if (!room.started && isHost() && Object.keys(room.players).length <= 1) {
      lobbyRef(room.id).remove(); room.ref.remove().catch(() => {});
    }
    room = null;
  }

  // ---------- 게임에서 부르는 함수 ----------
  window.JJ_NET = {
    start,
    now,
    leave() { session++; leaveRoom(); $('lobby').classList.add('hide'); },
    ready() {
      if (!room) return;
      room.ref.child('players/' + uid + '/rd').set(1);
      const b = $('btnReady'); b.disabled = true; b.textContent = '준비됨!';
    },
    pushState(s) { if (room && isHost()) room.ref.child('s').set(s).catch(console.error); },
    sendPass(to, at) { if (room) room.ref.child('req').push({ u: uid, to, at }).catch(console.error); },
    endRoom() {
      if (!room) return;
      const ref = room.ref;
      setTimeout(() => ref.remove().catch(() => {}), 15000);
    },
    handoff() {
      if (!room || !room.started || !isHost()) return;
      const others = Object.entries(room.players).filter(([u]) => u !== uid).sort((a, b) => (a[1].j || 0) - (b[1].j || 0));
      if (others.length) room.ref.child('meta/host').set(others[0][0]);
    }
  };
})();