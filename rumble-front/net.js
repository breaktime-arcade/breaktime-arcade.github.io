/*!
 * 난투 전선 - 협동 레이드 네트워크 (Firebase Realtime Database)
 * © 2026 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 * 무단 복제·수정·재배포를 금지합니다.
 *
 * 방식: 방장 주도 락스텝
 *  - 모든 기기가 같은 전투를 각자 계산하고, 주고받는 건 "누가 어떤 카드를 냈나"뿐이다.
 *  - 방장이 0.15초(3틱)마다 입력 묶음(턴)을 확정해 올리고, 모두 같은 턴에 같은 입력을 적용한다.
 *  - 방장이 나가면 남은 사람 중 가장 먼저 들어온 사람이 방장을 이어받는다.
 *  - 주소 뒤에 ?local 을 붙이면 서버 없이 같은 브라우저의 여러 탭끼리 테스트할 수 있다.
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
  const ROOT = 'rumble';
  const MAXP = 4, STALE_MS = 10 * 60 * 1000;
  const TURN = 3, LAG = 2;
  const ADJ = ['날쌘', '졸린', '배고픈', '씩씩한', '수줍은', '엉뚱한', '느긋한', '용감한', '깜찍한', '튼튼한', '명랑한', '꼼꼼한'];
  const NMS = ['철수', '영희', '민수', '순이', '길동', '똘이', '말순', '영구', '덕배', '춘자', '복동', '꽃님'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clean = o => JSON.parse(JSON.stringify(o));   // Firebase는 undefined 값을 거부한다

  function load(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
      document.head.appendChild(s);
    });
  }

  /* ---------- 저장소: Firebase ---------- */
  function fbBackend() {
    let db = null, uid = null, offset = 0;
    return {
      async init() {
        if (db) return;
        if (!window.firebase) {
          await load(SDK + 'firebase-app-compat.js');
          await Promise.all([load(SDK + 'firebase-auth-compat.js'), load(SDK + 'firebase-database-compat.js')]);
        }
        const fb = window.firebase;
        if (!fb.apps.length) fb.initializeApp(CFG);
        const au = fb.auth();
        await au.setPersistence(fb.auth.Auth.Persistence.SESSION);   // 탭마다 다른 사람
        const cred = au.currentUser ? { user: au.currentUser } : await au.signInAnonymously();
        uid = cred.user.uid;
        db = fb.database();
        db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
      },
      get uid() { return uid; },
      now: () => Date.now() + offset,
      set: (p, v) => db.ref(p).set(v),
      update: (p, v) => db.ref(p).update(v),
      remove: p => db.ref(p).remove(),
      push: (p, v) => db.ref(p).push(v),
      get: p => db.ref(p).once('value').then(s => s.val()),
      on(p, cb) { const r = db.ref(p), f = s => cb(s.val()); r.on('value', f); return () => r.off('value', f); },
      onChild(p, cb) { const r = db.ref(p), f = s => cb(s.key, s.val()); r.on('child_added', f); return () => r.off('child_added', f); },
      txn: (p, fn) => db.ref(p).transaction(fn).then(r => ({ ok: r.committed, val: r.snapshot.val() })),
      onDc: p => db.ref(p).onDisconnect().remove(),
      offDc: p => db.ref(p).onDisconnect().cancel(),
    };
  }

  /* ---------- 저장소: 로컬 테스트용 (같은 브라우저 탭끼리, ?local) ----------
   * 각 탭이 같은 데이터 사본을 들고, 바뀐 내용을 BroadcastChannel로 서로 알려준다. */
  function localBackend() {
    const bc = new BroadcastChannel('rf_localdb2');
    let uid = sessionStorage.getItem('rf_uid');
    if (!uid) { uid = 'L' + Math.random().toString(36).slice(2, 9); sessionStorage.setItem('rf_uid', uid); }
    let tree = {}, synced = false;
    const parts = p => p.split('/').filter(Boolean);
    const getAt = (t, p) => { let o = t; for (const k of parts(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : o; };
    const prune = o => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { prune(o[k]); if (o[k] && typeof o[k] === 'object' && !Object.keys(o[k]).length) delete o[k]; } };
    const setAt = (t, p, v) => {
      const ks = parts(p); let o = t;
      for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
      const last = ks[ks.length - 1];
      if (v == null) delete o[last]; else o[last] = JSON.parse(JSON.stringify(v));
      prune(t);
    };
    const apply = op => { if (op.k === 'set') setAt(tree, op.p, op.v); else if (op.k === 'upd') for (const c in op.v) setAt(tree, op.p + '/' + c, op.v[c]); };
    const listeners = new Set();
    let queued = false;
    const fire = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; for (const l of [...listeners]) l(tree); }, 0); };
    const emit = op => { apply(op); bc.postMessage(op); fire(); };
    bc.onmessage = e => {
      const m = e.data;
      if (m.k === 'sync?') { bc.postMessage({ k: 'sync!', t: tree, to: m.from }); return; }
      if (m.k === 'sync!') { if (m.to === uid && !synced) { synced = true; tree = m.t || {}; fire(); } return; }
      apply(m); fire();
    };
    const dcs = new Set();
    addEventListener('pagehide', () => { for (const p of dcs) bc.postMessage({ k: 'set', p, v: null }); });
    let cnt = 0;
    const api = {
      async init() { bc.postMessage({ k: 'sync?', from: uid }); await new Promise(r => setTimeout(r, 250)); synced = true; },
      get uid() { return uid; },
      now: () => Date.now(),
      async set(p, v) { emit({ k: 'set', p, v: v == null ? null : JSON.parse(JSON.stringify(v)) }); },
      async update(p, v) { emit({ k: 'upd', p, v: JSON.parse(JSON.stringify(v)) }); },
      async remove(p) { emit({ k: 'set', p, v: null }); },
      async push(p, v) { const k = Date.now().toString(36) + (cnt++).toString(36).padStart(4, '0') + uid; await api.set(p + '/' + k, v); return { key: k }; },
      async get(p) { const v = getAt(tree, p); return v == null ? null : JSON.parse(JSON.stringify(v)); },
      on(p, cb) { let last; const l = t => { const v = getAt(t, p), s = JSON.stringify(v); if (s !== last) { last = s; cb(v == null ? null : JSON.parse(s)); } }; listeners.add(l); setTimeout(() => l(tree)); return () => listeners.delete(l); },
      onChild(p, cb) { const seen = new Set(); const l = t => { const v = getAt(t, p) || {}; for (const k of Object.keys(v)) if (!seen.has(k)) { seen.add(k); cb(k, JSON.parse(JSON.stringify(v[k]))); } }; listeners.add(l); setTimeout(() => l(tree)); return () => listeners.delete(l); },
      async txn(p, fn) { const cur = getAt(tree, p); const nv = fn(cur == null ? null : JSON.parse(JSON.stringify(cur))); if (nv === undefined) return { ok: false, val: cur }; emit({ k: 'set', p, v: nv }); return { ok: true, val: nv }; },
      onDc(p) { dcs.add(p); },
      offDc(p) { dcs.delete(p); },
      dump: () => tree,
    };
    return api;
  }

  /* ---------- 방·대기실 ---------- */
  let B = null, uid = null, nick = '', code = null;
  let room = { meta: null, players: {} }, roomOffs = [];
  let gen = 0, genOffs = [], meIdx = -1, roster = null;
  let hostRun = false, published = -1, pending = [], leftSent = new Set();
  let H = {};
  const rp = () => ROOT + '/rooms/' + code;
  const gp = () => rp() + '/g/' + gen;
  const call = (k, ...a) => { try { H[k] && H[k](...a); } catch (e) { console.error(e); } };

  function randNick() { const n = pick(ADJ) + ' ' + pick(NMS); try { sessionStorage.setItem('rf_nick', n); } catch (e) {} return n; }

  async function init() {
    if (B) return;
    const local = /[?&]local\b/.test(location.search);
    const b = local ? localBackend() : fbBackend();
    await b.init();
    B = b; uid = B.uid;
    try { nick = sessionStorage.getItem('rf_nick') || randNick(); } catch (e) { nick = randNick(); }
  }

  async function enter(c, prof) {
    code = c;
    const me = clean(Object.assign({ nm: nick, rd: false, j: B.now() }, prof));
    await B.set(rp() + '/players/' + uid, me);
    B.onDc(rp() + '/players/' + uid);
    roomOffs.push(B.on(rp() + '/meta', v => { room.meta = v; onMeta(); }));
    roomOffs.push(B.on(rp() + '/players', v => { room.players = v || {}; onPlayers(); }));
  }

  async function create(prof, stage) {
    await init();
    for (let i = 0; i < 12; i++) {
      const c = String(1000 + Math.floor(Math.random() * 9000));
      const r = await B.txn(ROOT + '/rooms/' + c + '/meta', cur => {
        if (cur && B.now() - (cur.at || 0) < STALE_MS * 3) return;     // 사용 중인 번호
        return { host: uid, state: 'wait', stage: stage || 1, at: B.now(), gen: 0 };
      });
      if (r.ok) {
        await B.remove(ROOT + '/rooms/' + c + '/players');
        await B.remove(ROOT + '/rooms/' + c + '/g');
        await enter(c, prof);
        return c;
      }
    }
    throw new Error('방을 만들지 못했어요. 다시 시도해 주세요');
  }
  async function join(c, prof) {
    await init();
    const meta = await B.get(ROOT + '/rooms/' + c + '/meta');
    if (!meta) throw new Error('그 번호의 방이 없어요');
    if (meta.state !== 'wait') throw new Error('이미 게임이 시작된 방이에요');
    const ps = (await B.get(ROOT + '/rooms/' + c + '/players')) || {};
    if (!Object.keys(ps).length) throw new Error('그 번호의 방이 없어요');
    if (Object.keys(ps).length >= MAXP) throw new Error('방이 가득 찼어요 (최대 4명)');
    await enter(c, prof);
    return c;
  }
  async function quick(prof, stage) {
    await init();
    const lob = (await B.get(ROOT + '/lobby')) || {};
    const list = Object.entries(lob).filter(([, v]) => v && v.n < MAXP && B.now() - (v.t || 0) < STALE_MS).sort((a, b) => b[1].n - a[1].n);
    for (const [c] of list) { try { return await join(c, prof); } catch (e) {} }
    return create(prof, stage);
  }
  function stopGen() { genOffs.forEach(f => f()); genOffs = []; hostRun = false; published = -1; pending = []; }
  function leave() {
    if (!B || !code) return;
    const c = code, wasAlone = Object.keys(room.players || {}).length <= 1;
    roomOffs.forEach(f => f()); roomOffs = []; stopGen();
    B.offDc(ROOT + '/rooms/' + c + '/players/' + uid);
    B.remove(ROOT + '/rooms/' + c + '/players/' + uid);
    if (wasAlone) { B.remove(ROOT + '/rooms/' + c); B.remove(ROOT + '/lobby/' + c); B.offDc(ROOT + '/lobby/' + c); }
    else if (room.meta && room.meta.host === uid) { B.remove(ROOT + '/lobby/' + c); }
    code = null; room = { meta: null, players: {} }; gen = 0; roster = null; meIdx = -1;
  }

  const isHost = () => !!(room.meta && room.meta.host === uid);
  function sortedPlayers() { return Object.entries(room.players || {}).sort((a, b) => (a[1].j || 0) - (b[1].j || 0)); }

  function onPlayers() {
    if (!code) return;
    const ps = sortedPlayers();
    // 방장이 나갔으면 가장 먼저 들어온 사람이 이어받는다
    if (room.meta && ps.length && !room.players[room.meta.host] && ps[0][0] === uid) {
      B.update(rp() + '/meta', { host: uid });
    }
    if (isHost()) {
      if (room.meta && room.meta.state === 'wait') {
        B.set(ROOT + '/lobby/' + code, { n: ps.length, stage: room.meta.stage, t: B.now(), hn: nick });
        B.onDc(ROOT + '/lobby/' + code);
      }
      // 게임 중 나간 사람은 자동 전투로 넘긴다
      if (room.meta && room.meta.state === 'play' && roster) {
        roster.forEach((r, i) => { if (!room.players[r.uid] && !leftSent.has(i)) { leftSent.add(i); pending.push({ type: 'leave', p: i }); } });
      }
    }
    call('onRoom');
  }
  function onMeta() {
    if (!code) return;
    const m = room.meta;
    if (!m) { const c = code; leave(); call('onGone', '방이 사라졌어요 (' + c + ')'); return; }
    if (m.state === 'play' && m.gen && m.gen !== gen) startGen(m);
    if (m.state === 'wait' && isHost()) {
      B.set(ROOT + '/lobby/' + code, { n: sortedPlayers().length, stage: m.stage, t: B.now(), hn: nick });
      B.onDc(ROOT + '/lobby/' + code);
    }
    call('onRoom');
  }

  /* ---------- 게임 진행 (락스텝) ---------- */
  function startGen(m) {
    stopGen();
    gen = m.gen; roster = Array.isArray(m.roster) ? m.roster : Object.values(m.roster || {});
    meIdx = roster.findIndex(r => r.uid === uid);
    leftSent = new Set();
    if (meIdx < 0) return;                         // 이번 판에 참가하지 않은 사람
    genOffs.push(B.onChild(gp() + '/t', (k, v) => { let list = []; try { list = JSON.parse(v) || []; } catch (e) {} call('onTurn', +k, list); }));
    genOffs.push(B.on(gp() + '/h', v => {
      if (!v) return;
      for (const tick in v) { const vals = Object.values(v[tick] || {}); if (vals.length > 1 && vals.some(x => x !== vals[0])) { call('onDesync'); break; } }
    }));
    call('onStart', { roster, seed: m.seed, stage: m.stage, startAt: m.startAt, me: meIdx });
  }
  // 방장이 매 프레임 호출: 필요한 턴까지 입력 묶음을 확정해 올린다
  function pump(tick, maxKnown) {
    if (!code || !gen || !isHost()) return;
    if (!hostRun) {
      hostRun = true; published = maxKnown;          // 이어받은 방장은 마지막 확정 턴 다음부터
      genOffs.push(B.onChild(gp() + '/q', (k, v) => { if (v) pending.push(v); B.remove(gp() + '/q/' + k); }));
      if (roster) roster.forEach((r, i) => { if (!room.players[r.uid] && !leftSent.has(i)) { leftSent.add(i); pending.push({ type: 'leave', p: i }); } });
    }
    const want = Math.floor(tick / TURN) + LAG;
    while (published < want) { published++; B.set(gp() + '/t/' + published, JSON.stringify(pending.splice(0))); }
  }
  function send(inp) {
    if (!code || !gen) return;
    const o = clean(inp);
    if (isHost() && hostRun) pending.push(o);
    else B.push(gp() + '/q', o);
  }
  function hash(tick, h) { if (code && gen && meIdx >= 0) B.set(gp() + '/h/' + tick + '/' + meIdx, h); }

  async function start() {
    if (!isHost()) return;
    const ps = sortedPlayers();
    if (ps.length < 2) return;
    const ros = ps.slice(0, MAXP).map(([u, p]) => ({ uid: u, nm: p.nm, cmd: p.cmd, lv: p.lv, tal: p.tal || {} }));
    const ng = (room.meta.gen || 0) + 1;
    await B.remove(rp() + '/g');
    await B.remove(ROOT + '/lobby/' + code);
    await B.update(rp() + '/meta', clean({ state: 'play', gen: ng, seed: Math.floor(Math.random() * 2147483647), startAt: B.now() + 3500, roster: ros, at: B.now() }));
  }
  function backToRoom() {
    if (!code) return;
    stopGen();
    if (isHost()) { B.update(rp() + '/meta', { state: 'wait', at: B.now() }); B.remove(rp() + '/g'); }
    if (room.players[uid]) B.update(rp() + '/players/' + uid, { rd: false });
  }

  window.RFNet = {
    hooks(h) { H = h || {}; },
    init, create, join, quick, leave, start, backToRoom, pump, send, hash,
    isHost,
    get uid() { return uid; },
    get nick() { return nick; },
    get code() { return code; },
    get room() { return room; },
    now: () => (B ? B.now() : Date.now()),
    _db: () => B,
    rerollNick() { nick = randNick(); if (code && room.players[uid]) B.update(rp() + '/players/' + uid, { nm: nick }); return nick; },
    setProfile(prof) { if (code) B.update(rp() + '/players/' + uid, clean(prof)); },
    setReady(rd) { if (code) B.update(rp() + '/players/' + uid, { rd: !!rd }); },
    setStage(n) { if (code && isHost()) B.update(rp() + '/meta', { stage: n }); },
  };
})();