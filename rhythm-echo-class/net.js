/*!
 * 쉬는시간 짝짝! 리듬교실 — 4인 실시간 대결 네트워크 (Firebase Realtime Database)
 * © 2026 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 *
 * 방식
 *  - 방 하나(RTDB `rhythm_rooms/rooms/{코드}`)에 최대 4명. 방장이 곡(seed·BPM·마디 수)과
 *    시작 시각(serverTimeOffset 기준)을 확정하면, 모두 같은 박자 패턴을 각자 계산해 동시에 연주한다.
 *  - 주고받는 것은 "내 점수·콤보·최근 판정"뿐이라 대역폭이 아주 작다.
 *  - 방장이 나가면 방이 사라지고(onDisconnect), 참가자가 나가면 그 자리만 정리된다.
 *  - 주소 뒤에 ?local 을 붙이면 서버 없이 같은 브라우저의 탭끼리 시험할 수 있다.
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
  const ROOT = 'rhythm_rooms';
  const MAXP = 4;
  const SEAT_COLORS = ['#ff6b7a', '#4ad6c4', '#a78bfa', '#ffcf5c'];
  const QUICK_STALE = 10 * 60 * 1000;
  const DONE_WAIT_MS = 2000;
  const ADJ = ['날쌘', '졸린', '배고픈', '씩씩한', '수줍은', '엉뚱한', '느긋한', '용감한', '깜찍한', '튼튼한', '명랑한', '꼼꼼한'];
  const NMS = ['철수', '영희', '민수', '순이', '길동', '똘이', '말순', '영구', '덕배', '춘자', '복동', '꽃님'];
  // AI 라이벌은 피버 배율을 쓰지 않으므로, 사람과 비슷한 점수대가 되도록 보정한다
  const AI_BOOST = 1.5;
  const NICK_KEY = 'rhythm-echo-class.nick';
  const AI_KEY = 'rhythm-echo-class.duelai';
  const LOCAL = /[?&]local\b/.test(location.search);

  const $ = (id) => document.getElementById(id);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clean = (o) => JSON.parse(JSON.stringify(o == null ? null : o));   // Firebase는 undefined를 거부한다
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CODE_A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function code4() {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_A[Math.floor(Math.random() * CODE_A.length)];
    return s;
  }
  function load(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
      document.head.appendChild(s);
    });
  }

  /* ---------- 저장소: Firebase ---------- */
  function fbBackend() {
    let db = null, uid = null, offset = 0, readyP = null;
    return {
      get uid() { return uid; },
      now: () => Date.now() + offset,
      init() {
        if (readyP) return readyP;
        readyP = (async () => {
          if (!window.firebase) {
            await load(SDK + 'firebase-app-compat.js');
            await Promise.all([load(SDK + 'firebase-auth-compat.js'), load(SDK + 'firebase-database-compat.js')]);
          }
          const fb = window.firebase;
          if (!fb.apps.length) fb.initializeApp(CFG);
          const au = fb.auth();
          // 탭마다 다른 익명 사용자 (한 브라우저의 두 탭으로도 대결 가능)
          await au.setPersistence(fb.auth.Auth.Persistence.SESSION);
          const cred = au.currentUser ? { user: au.currentUser } : await au.signInAnonymously();
          uid = cred.user.uid;
          db = fb.database();
          await new Promise((res) => {
            let done = false;
            const fin = () => { if (!done) { done = true; res(); } };
            db.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; fin(); });
            setTimeout(fin, 2500);
          });
        })();
        return readyP;
      },
      set: (p, v) => db.ref(p).set(v),
      update: (p, v) => db.ref(p).update(v),
      remove: (p) => db.ref(p).remove(),
      get: (p) => db.ref(p).once('value').then((s) => s.val()),
      on(p, cb) {
        const r = db.ref(p);
        const f = (s) => cb(s.val());
        r.on('value', f, (e) => { console.error(e); cb(null, e); });
        return () => r.off('value', f);
      },
      txn: (p, fn) => db.ref(p).transaction(fn).then((r) => ({ ok: r.committed, val: r.snapshot.val() })),
      onDc: (p) => { db.ref(p).onDisconnect().remove(); },
      offDc: (p) => { db.ref(p).onDisconnect().cancel(); }
    };
  }

  /* ---------- 저장소: 같은 브라우저 탭끼리 (?local) ---------- */
  function localBackend() {
    const bc = new BroadcastChannel('rh_class_localdb');
    let uid = sessionStorage.getItem('rh_uid');
    if (!uid) { uid = 'L' + Math.random().toString(36).slice(2, 9); sessionStorage.setItem('rh_uid', uid); }
    let tree = {}, synced = false;
    const parts = (p) => String(p).split('/').filter(Boolean);
    const getAt = (t, p) => {
      let o = t;
      for (const k of parts(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; }
      return o === undefined ? null : o;
    };
    const prune = (o) => {
      if (o && typeof o === 'object') {
        for (const k of Object.keys(o)) { prune(o[k]); if (o[k] && typeof o[k] === 'object' && !Object.keys(o[k]).length) delete o[k]; }
      }
    };
    const setAt = (t, p, v) => {
      const ks = parts(p); let o = t;
      for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
      const last = ks[ks.length - 1];
      if (v == null) delete o[last]; else o[last] = JSON.parse(JSON.stringify(v));
      prune(t);
    };
    const apply = (op) => {
      if (op.k === 'set') setAt(tree, op.p, op.v);
      else if (op.k === 'upd') for (const c in op.v) setAt(tree, op.p + '/' + c, op.v[c]);
    };
    const listeners = new Set();
    let queued = false;
    const fire = () => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; for (const l of [...listeners]) l(tree); }, 0);
    };
    const emit = (op) => { apply(op); bc.postMessage(op); fire(); };
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.k === 'sync?') { bc.postMessage({ k: 'sync!', t: tree, to: m.from }); return; }
      if (m.k === 'sync!') { if (m.to === uid && !synced) { synced = true; tree = m.t || {}; fire(); } return; }
      apply(m); fire();
    };
    const dcs = new Set();
    addEventListener('pagehide', () => { for (const p of dcs) bc.postMessage({ k: 'set', p, v: null }); });
    let cnt = 0;
    const api = {
      async init() { bc.postMessage({ k: 'sync?', from: uid }); await sleep(220); synced = true; },
      get uid() { return uid; },
      now: () => Date.now(),
      async set(p, v) { emit({ k: 'set', p, v: v == null ? null : clean(v) }); },
      async update(p, v) { emit({ k: 'upd', p, v: clean(v) }); },
      async remove(p) { emit({ k: 'set', p, v: null }); },
      async get(p) { const v = getAt(tree, p); return v == null ? null : clean(v); },
      on(p, cb) {
        let last;
        const l = (t) => {
          const v = getAt(t, p), s = JSON.stringify(v);
          if (s !== last) { last = s; cb(v == null ? null : JSON.parse(s)); }
        };
        listeners.add(l); setTimeout(() => l(tree));
        return () => listeners.delete(l);
      },
      async txn(p, fn) {
        const cur = getAt(tree, p);
        const nv = fn(cur == null ? null : clean(cur));
        if (nv === undefined) return { ok: false, val: cur };
        emit({ k: 'set', p, v: nv == null ? null : clean(nv) });
        return { ok: true, val: nv };
      },
      onDc(p) { dcs.add(p); },
      offDc(p) { dcs.delete(p); }
    };
    return api;
  }

  /* ---------- 상태 ---------- */
  const R = {
    backend: null, me: { uid: '', nm: '' }, nick: '',
    code: null, players: {}, lastSeen: {}, meta: null,
    host: false, view: 'idle',      // idle | entry | room | play | result
    offs: [], startedRound: 0,
    ai: [], aiTimer: 0, reportTimer: 0, pending: null, keepTimer: 0,
    chart: { notes: 0, dur: 1 },
    hooks: {}, busy: false, lastErr: ''
  };

  const roomPath = (c) => ROOT + '/rooms/' + (c || R.code);
  const lobbyPath = (c) => ROOT + '/lobby/' + (c || R.code);
  const myPlayerPath = () => roomPath() + '/players/' + R.me.uid;
  const b = () => R.backend;

  /* ---------- UI ---------- */
  function showOnly(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    const el = $(id);
    if (el) el.classList.add('show');
  }
  function status(msg, warn) {
    const el = $('duelStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('warn', !!warn);
  }
  function readNick() {
    let n = R.nick;
    if (!n) {
      try { n = localStorage.getItem(NICK_KEY) || ''; } catch (e) { n = ''; }
      if (!n) n = pick(ADJ) + ' ' + pick(NMS);
      R.nick = n;
    }
    return n;
  }
  function saveNick(v) {
    R.nick = String(v || '').trim().slice(0, 10) || pick(ADJ) + ' ' + pick(NMS);
    try { localStorage.setItem(NICK_KEY, R.nick); } catch (e) { /* 무시 */ }
    return R.nick;
  }
  function aiOn() {
    try { return localStorage.getItem(AI_KEY) !== '0'; } catch (e) { return true; }
  }
  function saveAi(v) {
    try { localStorage.setItem(AI_KEY, v ? '1' : '0'); } catch (e) { /* 무시 */ }
  }

  function showEntry() {
    R.view = 'entry';
    $('duelMain').classList.remove('hidden');
    $('duelRoom').classList.add('hidden');
    status('');
    const n = readNick();
    if ($('duelNick') && !$('duelNick').value) $('duelNick').value = n;
    if ($('duelCode')) $('duelCode').value = '';
  }

  function renderRoom() {
    const ps = Object.entries(R.players).map(([u, p]) => ({ u, nm: p.nm, seat: p.seat | 0, ai: !!p.ai }));
    const bySeat = [0, 1, 2, 3].map((s) => ps.find((p) => p.seat === s) || null);
    $('duelSlots').innerHTML = bySeat.map((p, i) => {
      const dot = '<span class="dot" style="background:' + SEAT_COLORS[i] + '"></span>';
      if (!p) return '<div class="slot empty">' + dot + '<span class="nm">빈자리</span></div>';
      const me = p.u === R.me.uid;
      const isHost = !!(R.meta && R.meta.host === p.u);
      return '<div class="slot' + (me ? ' me' : '') + '">' + dot +
        '<span class="nm">' + esc(p.nm) + (me ? ' (나)' : '') + '</span>' +
        (p.ai ? '<span class="tag">AI</span>' : '') +
        (isHost ? '<span class="tag host">방장</span>' : '') + '</div>';
    }).join('');
    $('duelCodeShow').textContent = R.code || '----';

    const startBtn = $('btnStart');
    startBtn.disabled = !R.host;
    startBtn.textContent = R.host ? '게임 시작' : '방장이 시작해요';
    const aiBox = $('duelAI');
    aiBox.disabled = !R.host;
    aiBox.checked = aiOn();

    if (R.host) {
      status(ps.length >= 2
        ? '모두 모였어요! 게임 시작을 눌러 주세요.'
        : '혼자여도 시작할 수 있어요. AI 라이벌이 빈자리를 채워요.');
    } else {
      status('방장이 시작하기를 기다리는 중… (지금 ' + ps.length + '명)');
    }
  }

  function fail(e) {
    const code = String((e && (e.code || e.message)) || e);
    R.lastErr = code;
    const denied = /permission|PERMISSION|denied/i.test(code);
    const msg = denied
      ? 'Firebase 규칙에서 막혔어요. Realtime Database 규칙에 rhythm_rooms 경로를 추가해 주세요. (README 참고)'
      : '연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
    status(msg + ' [' + code.slice(0, 60) + ']', true);
    console.error('[rhythm-duel]', e);
  }

  async function ensureBackend() {
    if (R.backend) return R.backend;
    R.backend = LOCAL ? localBackend() : fbBackend();
    await R.backend.init();
    R.me.uid = R.backend.uid;
    return R.backend;
  }

  /* ---------- 방 만들기 / 들어가기 ---------- */
  async function createRoom(quick) {
    const bk = await ensureBackend();
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = code4();
      const exists = await bk.get(roomPath(code)).catch(() => null);
      if (exists) continue;
      const t = bk.now();
      await bk.set(roomPath(code) + '/meta', {
        host: R.me.uid, cnt: 1, status: 'wait', created: t, quick: quick ? 1 : 0,
        round: 0, seed: 0, bpm: 110, pairs: 8, startAt: 0, restartBy: ''
      });
      await bk.set(lobbyPath(code), { t, n: 1, q: quick ? 1 : 0 });
      await joinRoom(code, true);
      return true;
    }
    throw new Error('방 코드를 만들지 못했어요');
  }

  async function joinRoom(code, isHost) {
    const bk = await ensureBackend();
    R.code = code;
    R.players = {};
    R.lastSeen = {};
    R.startedRound = 0;
    R.meta = null;
    // 자리(seat) 정하기
    const cur = (await bk.get(roomPath(code) + '/players').catch(() => null)) || {};
    const taken = new Set(Object.values(cur).map((p) => p && p.seat | 0));
    let seat = 0;
    for (let i = 0; i < MAXP; i++) if (!taken.has(i)) { seat = i; break; }

    R.me.nm = readNick();
    await bk.onDc(roomPath(code) + '/players/' + R.me.uid);
    await bk.set(roomPath(code) + '/players/' + R.me.uid,
      { nm: R.me.nm, seat, j: bk.now(), ai: 0 });
    if (isHost) {
      // 방장이 사라지면 방 전체가 정리된다 (onDisconnect)
      await bk.onDc(roomPath(code));
    }
    watch(bk, roomPath(code) + '/meta', (m) => onMeta(m));
    watch(bk, roomPath(code) + '/players', (ps) => onPlayers(ps));
    if (R.keepTimer) clearInterval(R.keepTimer);
    R.keepTimer = setInterval(() => {
      if (R.host && R.view === 'room' && R.meta && R.meta.status === 'wait') {
        b().update(lobbyPath(), { t: b().now() }).catch(() => {});
      }
    }, 30000);

    R.view = 'room';
    $('duelMain').classList.add('hidden');
    $('duelRoom').classList.remove('hidden');
    renderRoom();
  }

  function watch(bk, p, cb) {
    const off = bk.on(p, cb);
    if (off) R.offs.push(off);
  }

  function onMeta(m, err) {
    if (err) { fail(err); return; }
    if (!R.code) return;
    R.meta = m;
    R.host = !!(m && m.host === R.me.uid);
    if (!m) {
      if (R.view === 'room' || R.view === 'play') roomLost('방장이 방을 닫았어요');
      return;
    }
    if (m.status === 'play' && (m.round | 0) !== R.startedRound) {
      R.startedRound = m.round | 0;
      beginRound(m);
      return;
    }
    if (R.view === 'room') renderRoom();
    if (m.status === 'result' && R.host && m.restartBy && m.restartBy !== R.me.uid && R.hooks.restartRequest) {
      const who = (R.players[m.restartBy] || R.lastSeen[m.restartBy] || {});
      R.hooks.restartRequest(who.nm || '친구');
    }
  }

  function onPlayers(ps) {
    const next = ps || {};
    Object.keys(next).forEach((u) => { R.lastSeen[u] = next[u]; });
    R.players = next;
    if (R.host && R.code && R.view !== 'play' && R.meta && R.meta.status === 'wait') {
      b().update(lobbyPath(), { n: Object.keys(next).length, t: b().now() }).catch(() => {});
    }
    if (R.view === 'room') renderRoom();
    if (R.view === 'play' || R.view === 'result') {
      if (R.hooks.onPlayers) R.hooks.onPlayers(listPlayers());
    }
    if (R.meta && R.meta.restartBy && R.meta.restartBy !== R.me.uid && R.host && R.view === 'result') {
      const who = (next[R.meta.restartBy] || {});
      if (R.hooks.restartRequest) R.hooks.restartRequest(who.nm || '친구');
    }
  }

  function listPlayers() {
    const all = Object.assign({}, R.lastSeen, R.players);
    return Object.entries(all).map(([u, p]) => {
      const s = (p && p.s) || {};
      return {
        u, nm: (p && p.nm) || '친구', seat: (p && p.seat) | 0, ai: !!(p && p.ai),
        me: u === R.me.uid,
        score: s.sc || 0, combo: s.cb || 0, maxCombo: s.mx || 0,
        acc: s.ac == null ? 0 : s.ac / 10, lastJudge: s.jd || '', judgeAt: s.jt || 0,
        done: !!s.done, out: !R.players[u]
      };
    }).filter((p) => !p.out || p.score > 0 || p.me)
      .sort((x, y) => x.seat - y.seat);
  }

  async function quickMatch() {
    if (R.busy) return;
    R.busy = true;
    status('친구를 찾는 중…');
    try {
      const bk = await ensureBackend();
      saveNick($('duelNick') ? $('duelNick').value : '');
      const lob = (await bk.get(ROOT + '/lobby').catch(() => null)) || {};
      const t = bk.now();
      const cands = [];
      for (const [code, e] of Object.entries(lob)) {
        if (!e) continue;
        if ((e.n || 0) >= MAXP || (e.n || 0) < 1) continue;
        if (t - (e.t || 0) > QUICK_STALE) {
          // 오래된 목록은 방 정보를 확인해서, 정말 사라진 방만 목록에서 지운다
          const m = await bk.get(roomPath(code) + '/meta').catch(() => null);
          if (!m || m.status !== 'wait') bk.remove(lobbyPath(code)).catch(() => {});
          continue;
        }
        cands.push([code, e]);
      }
      cands.sort((a, c) => (a[1].t || 0) - (c[1].t || 0));
      for (const [code] of cands) {
        const r = await bk.txn(roomPath(code) + '/meta', (m) => {
          if (m == null) return null;
          if (m.status !== 'wait') return undefined;
          if ((m.cnt || 0) >= MAXP) return undefined;
          m.cnt = (m.cnt || 0) + 1;
          return m;
        }).catch(() => ({ ok: false }));
        if (r.ok) {
          const ps = (await bk.get(roomPath(code) + '/players').catch(() => null)) || {};
          if (Object.keys(ps).length >= MAXP) { continue; }
          await joinRoom(code, false);
          return;
        }
      }
      await createRoom(true);
    } catch (e) {
      fail(e);
    } finally {
      R.busy = false;
    }
  }

  async function makeRoom() {
    if (R.busy) return;
    R.busy = true;
    status('방을 만드는 중…');
    try {
      await ensureBackend();
      saveNick($('duelNick') ? $('duelNick').value : '');
      await createRoom(false);
    } catch (e) {
      fail(e);
    } finally {
      R.busy = false;
    }
  }

  async function joinByCode() {
    if (R.busy) return;
    const code = String(($('duelCode') && $('duelCode').value) || '').trim().toUpperCase();
    if (code.length !== 4) { status('방 코드 4자리를 입력해 주세요.', true); return; }
    R.busy = true;
    status('방에 들어가는 중…');
    try {
      await ensureBackend();
      saveNick($('duelNick') ? $('duelNick').value : '');
      const meta = await b().get(roomPath(code) + '/meta').catch(() => null);
      if (!meta) { status('그런 방이 없어요. 코드를 다시 확인해 주세요.', true); return; }
      if (meta.status !== 'wait') { status('이미 시작한 방이에요. 새 방을 만들거나 빠른 매칭을 해 주세요.', true); return; }
      const r = await b().txn(roomPath(code) + '/meta', (m) => {
        if (m == null) return null;
        if (m.status !== 'wait' || (m.cnt || 0) >= MAXP) return undefined;
        m.cnt = (m.cnt || 0) + 1;
        return m;
      });
      if (!r.ok) { status('방이 가득 찼어요.', true); return; }
      await joinRoom(code, false);
    } catch (e) {
      fail(e);
    } finally {
      R.busy = false;
    }
  }

  /* ---------- AI 라이벌 ---------- */
  function stopAI() {
    if (R.aiTimer) { clearInterval(R.aiTimer); R.aiTimer = 0; }
    R.ai = [];
  }

  async function startAI(m, roster) {
    stopAI();
    const bk = b();
    const ais = roster.filter((r) => r.ai);
    if (!ais.length) return;
    const total = Math.max(8, R.chart.notes || 40);
    const dur = Math.max(4, R.chart.dur || 40);
    R.ai = ais.map((r) => ({
      u: r.u, idx: 0, score: 0, combo: 0, max: 0, pr: 0, gd: 0, ms: 0,
      skill: 0.80 + Math.random() * 0.16, jd: '', jt: 0, sent: ''
    }));
    let lastSend = 0;
    R.aiTimer = setInterval(async () => {
      const el = (bk.now() - m.startAt) / 1000;
      const frac = clamp(el / dur, 0, 1);
      const target = Math.floor(frac * total);
      R.ai.forEach((a) => {
        let guard = 0;
        while (a.idx < target && guard++ < 12) {
          a.idx++;
          const r = Math.random();
          let g;
          if (r < a.skill) g = 'PERFECT';
          else if (r < a.skill + (1 - a.skill) * 0.66) g = 'GOOD';
          else g = 'MISS';
          if (g === 'MISS') { a.combo = 0; a.ms++; }
          else {
            a.combo++;
            if (a.combo > a.max) a.max = a.combo;
            if (g === 'PERFECT') a.pr++; else a.gd++;
          }
          const base = g === 'PERFECT' ? 100 : g === 'GOOD' ? 55 : 0;
          const mult = (1 + Math.min(a.combo, 50) * 0.012) * AI_BOOST;
          a.score += Math.round(base * mult);
          if (Math.random() < 0.45) { a.jd = g; a.jt = bk.now(); }
        }
        if (frac >= 1 && a.idx >= total && !a.doneSent) { a.doneSent = true; a.jd = ''; }
      });
      const nowMs = bk.now();
      if (nowMs - lastSend < 600) return;
      lastSend = nowMs;
      for (const a of R.ai) {
        const tot = a.pr + a.gd + a.ms;
        const ac = tot ? Math.round(((a.pr + a.gd * 0.6) / tot) * 1000) : 0;
        const s = { sc: a.score, cb: a.combo, mx: a.max, ac, pr: a.pr, gd: a.gd, ms: a.ms, jd: a.jd, jt: a.jt, done: !!a.doneSent };
        const key = JSON.stringify(s);
        if (key === a.sent) continue;
        a.sent = key;
        bk.update(roomPath() + '/players/' + a.u + '/s', s).catch(() => {});
      }
    }, 500);
  }

  async function addAIPlayers() {
    const bk = b();
    const ps = Object.entries(R.players);
    const taken = new Set(ps.map(([, p]) => p.seat | 0));
    if (ps.length >= MAXP) return;
    const names = NMS.slice().sort(() => Math.random() - 0.5);
    let k = 0;
    for (let seat = 0; seat < MAXP; seat++) {
      if (taken.has(seat)) continue;
      const u = 'ai_seat' + seat;
      const nm = 'AI ' + names[k++ % names.length];
      await bk.set(roomPath() + '/players/' + u, { nm, seat, ai: 1, j: bk.now() });
    }
  }

  async function hostStart() {
    if (!R.host || !R.code || R.busy) return;
    R.busy = true;
    try {
      const bk = b();
      const meCount = Object.keys(R.players).length;
      if (!aiOn()) {
        // AI 라이벌을 꺼 두었으면 이전 라운드의 AI 자리를 정리한다
        for (const [u, p] of Object.entries(R.players)) {
          if (p && p.ai) await bk.remove(roomPath() + '/players/' + u).catch(() => {});
        }
        R.players = (await bk.get(roomPath() + '/players').catch(() => null)) || R.players;
      }
      if (aiOn() && meCount < MAXP) await addAIPlayers();
      R.players = (await bk.get(roomPath() + '/players').catch(() => null)) || R.players;
      const total = Object.keys(R.players).length;
      if (total < 2) { status('한 명 더 오거나, AI 라이벌 채우기를 켜 주세요.', true); return; }
      const seed = (Math.random() * 1000000000) | 0;
      const round = ((R.meta && R.meta.round) | 0) + 1;
      // 새 라운드는 0점부터: 지난 라운드 점수를 지운다
      await Promise.all(Object.keys(R.players).map((u) =>
        bk.remove(roomPath() + '/players/' + u + '/s').catch(() => {})));
      await bk.update(roomPath() + '/meta', {
        status: 'play', round, seed, bpm: 110, pairs: 8,
        startAt: bk.now() + 3800, restartBy: ''
      });
      await bk.remove(lobbyPath()).catch(() => {});
    } catch (e) {
      fail(e);
    } finally {
      R.busy = false;
    }
  }

  function beginRound(m) {
    R.view = 'play';
    const roster = Object.entries(R.players)
      .map(([u, p]) => ({ u, nm: p.nm, seat: p.seat | 0, ai: !!p.ai }))
      .sort((a, c) => a.seat - c.seat);
    const me = roster.find((r) => r.u === R.me.uid) || { seat: 0 };
    R.lastSeen = {};
    // 로비 화면을 내린다 (게임 화면은 HUD·3D가 그린다)
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    if (R.hooks.startRound) {
      R.hooks.startRound({
        seed: m.seed | 0, bpm: m.bpm || 110, pairs: m.pairs || 8,
        startAt: m.startAt || (b().now() + 1000),
        me: { uid: R.me.uid, seat: me.seat }, host: R.host, round: m.round | 0,
        roster, players: listPlayers(), local: LOCAL
      });
    }
    if (R.host) startAI(m, roster);
    // 점수 보고 타이머
    if (R.reportTimer) clearInterval(R.reportTimer);
    R.reportTimer = setInterval(() => {
      if (R.pending) { const s = R.pending; R.pending = null; flushStats(s); }
    }, 320);
  }

  function flushStats(s) {
    if (!R.code || !R.backend || !s) return Promise.resolve();
    return b().update(roomPath() + '/players/' + R.me.uid + '/s', clean(s)).catch(() => {});
  }

  /* ---------- 게임이 부르는 것들 ---------- */
  function attach(hooks) {
    R.hooks = hooks || {};
  }

  function setChart(info) {
    R.chart = { notes: Math.max(1, info.notes | 0), dur: Math.max(1, info.dur || 40) };
  }

  function report(stats) {
    if (!R.code) return;
    R.pending = stats;
  }

  async function finishRound(stats) {
    if (!R.code) return { ranking: buildRanking(R.players, null), note: '방이 닫혔어요' };
    if (R.reportTimer) { clearInterval(R.reportTimer); R.reportTimer = 0; }
    R.pending = null;
    stopAI();
    R.view = 'result';
    const meS = Object.assign({}, stats, { done: true });
    await flushStats(meS).catch(() => {});
    // 다른 사람의 최종 기록이 올라올 때까지 잠깐 기다린다
    const bk = b();
    const t0 = Date.now();
    let ps = {};
    for (;;) {
      ps = (await bk.get(roomPath() + '/players').catch(() => null)) || {};
      const others = Object.entries(ps).filter(([u, p]) => u !== R.me.uid && p && !p.ai);
      const waiting = others.some(([, p]) => !(p.s && p.s.done));
      if (!waiting || Date.now() - t0 > DONE_WAIT_MS) break;
      await sleep(180);
    }
    R.players = ps;
    if (R.host) {
      bk.update(roomPath() + '/meta', { status: 'result' }).catch(() => {});
      bk.remove(lobbyPath()).catch(() => {});
    }
    return { ranking: buildRanking(ps, R.lastSeen), note: '' };
  }

  function buildRanking(ps, seen) {
    const all = Object.assign({}, seen || {}, ps || {});
    const list = Object.entries(all).map(([u, p]) => {
      const s = (p && p.s) || ((seen && seen[u] && seen[u].s) || {});
      return {
        u, nm: (p && p.nm) || (seen && seen[u] && seen[u].nm) || '친구',
        seat: (p && p.seat) | 0, ai: !!(p && p.ai), me: u === R.me.uid,
        score: s.sc || 0, maxCombo: s.mx || 0,
        acc: s.ac == null ? 0 : Math.round(s.ac / 10),
        perfect: s.pr || 0, miss: s.ms || 0, done: !!s.done,
        out: !(ps && ps[u])
      };
    }).filter((p) => !p.out || p.score > 0);
    list.sort((a, c) => (c.score - a.score) || (c.acc - a.acc) || (a.seat - c.seat));
    list.forEach((p, i) => { p.rank = i + 1; });
    return list;
  }

  function requestRestart() {
    if (!R.code) return;
    if (R.host) { hostStart(); return; }
    b().update(roomPath() + '/meta', { restartBy: R.me.uid }).catch(() => {});
    if (R.hooks.restartAsked) R.hooks.restartAsked();
  }

  async function leave() {
    const code = R.code;
    const wasHost = R.host;
    const bk = R.backend;
    if (R.keepTimer) { clearInterval(R.keepTimer); R.keepTimer = 0; }
    if (R.reportTimer) { clearInterval(R.reportTimer); R.reportTimer = 0; }
    stopAI();
    R.offs.forEach((f) => { try { f(); } catch (e) { /* 무시 */ } });
    R.offs = [];
    R.code = null; R.players = {}; R.meta = null; R.host = false; R.pending = null;
    R.startedRound = 0;
    if (bk && code) {
      try {
        await bk.offDc(roomPath(code) + '/players/' + R.me.uid);
        if (wasHost) {
          await bk.offDc(roomPath(code));
          await bk.remove(roomPath(code));
          await bk.remove(lobbyPath(code));
        } else {
          await bk.remove(roomPath(code) + '/players/' + R.me.uid);
        }
      } catch (e) { /* 무시 */ }
    }
    R.view = 'entry';
    showOnly('duel');
    showEntry();
    if (R.hooks.onLeave) R.hooks.onLeave();
  }

  function roomLost(msg) {
    R.offs.forEach((f) => { try { f(); } catch (e) { /* 무시 */ } });
    R.offs = [];
    if (R.keepTimer) { clearInterval(R.keepTimer); R.keepTimer = 0; }
    if (R.reportTimer) { clearInterval(R.reportTimer); R.reportTimer = 0; }
    stopAI();
    const players = R.lastSeen;
    R.code = null; R.meta = null; R.host = false; R.pending = null;
    if (R.hooks.roomLost) R.hooks.roomLost(msg || '방이 닫혔어요', buildRanking(players, players));
  }

  function open() {
    if (R.code) {
      showOnly('duel');
      $('duelMain').classList.add('hidden');
      $('duelRoom').classList.remove('hidden');
      if ($('duelNick')) $('duelNick').value = readNick();
      renderRoom();
      return;
    }
    showOnly('duel');
    showEntry();
  }

  /* ---------- 배선 ---------- */
  function bind() {
    const nickEl = $('duelNick');
    if (nickEl) {
      nickEl.value = readNick();
      nickEl.addEventListener('input', () => saveNick(nickEl.value));
      nickEl.addEventListener('change', () => { nickEl.value = saveNick(nickEl.value); });
    }
    const codeEl = $('duelCode');
    if (codeEl) {
      codeEl.addEventListener('input', () => {
        codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      });
      codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinByCode(); });
    }
    if ($('btnQuick')) $('btnQuick').addEventListener('click', quickMatch);
    if ($('btnMake')) $('btnMake').addEventListener('click', makeRoom);
    if ($('btnJoin')) $('btnJoin').addEventListener('click', joinByCode);
    if ($('btnStart')) $('btnStart').addEventListener('click', hostStart);
    if ($('btnLeave')) $('btnLeave').addEventListener('click', () => leave());
    if ($('btnDuelBack')) $('btnDuelBack').addEventListener('click', () => {
      if (R.code) { leave().then(() => R.hooks.onBack && R.hooks.onBack()); }
      else { showOnly('title'); if (R.hooks.onBack) R.hooks.onBack(); }
    });
    if ($('duelAI')) $('duelAI').addEventListener('change', (e) => saveAi(e.target.checked));
    if ($('btnCopy')) {
      $('btnCopy').addEventListener('click', async () => {
        const code = R.code || '';
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(code);
          else {
            const ta = document.createElement('textarea');
            ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta);
          }
          $('btnCopy').textContent = '복사됨';
          setTimeout(() => { const c = $('btnCopy'); if (c) c.textContent = '복사'; }, 1400);
        } catch (e) {
          status('코드: ' + code + ' (직접 적어 주세요)', true);
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.RhythmDuel = {
    local: LOCAL,
    attach, open, setChart, report, finishRound, requestRestart, leave,
    now: () => (R.backend ? R.backend.now() : Date.now()),
    isActive: () => !!R.code,
    view: () => R.view,
    me: () => ({ uid: R.me.uid, nm: R.me.nm || readNick(), seat: (R.players[R.me.uid] || {}).seat | 0 }),
    players: () => listPlayers(),
    roomCode: () => R.code,
    isHost: () => R.host,
    beginRoundDirect: (m) => beginRound(m),      // 검증용
    __state: () => ({ code: R.code, view: R.view, host: R.host, meta: R.meta, players: R.players, local: LOCAL })
  };
})();
