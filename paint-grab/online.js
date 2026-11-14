/* 땅따먹기 60초 - 함께 하기(실시간) 모드
 * © 쉬는시간 오락실 (smile-willow.tistory.com) · 무단 복제·배포 금지
 *
 * Firebase Realtime Database (두뇌 서바이벌과 같은 프로젝트, pg/ 아래에 따로 저장)
 *  - pg/presence/{uid} : 접속자(닉네임, 준비)
 *  - pg/show           : 판 상태(단계, 참가자, 시간, 진행 담당 lock, 결과)
 *  - pg/cells/{칸번호}  : 칸 주인(참가자 번호)
 *  - pg/items/{id}     : 판 위 아이템
 *  - pg/eff/{번호}      : 번개·방패 효과 끝나는 시각
 */
(() => {
'use strict';
const PG = window.PG;
if (!PG) return;
const S = PG.S;
const $ = id => document.getElementById(id);
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const ROOT = 'pg';
const MAX_HUMAN = 8, FILL_TO = 4;
const WAIT_MS = window.PG_WAIT_MS || 10000;
const HB_STALE = 7000;

const ADJ = ['용감한','졸린','배고픈','똑똑한','수줍은','신나는','엉뚱한','느긋한','반짝이는','씩씩한','행복한','날쌘','귀여운',
  '꼼꼼한','명랑한','다정한','재빠른','웃는','춤추는','노래하는','깜찍한','든든한','상냥한','멋진','당당한','조용한','힘센'];
const NOUN = ['호랑이','판다','다람쥐','고양이','강아지','펭귄','수달','부엉이','토끼','코알라','햄스터','거북이','오리','여우',
  '고래','너구리','기린','사자','알파카','돌고래','병아리','참새','해달','미어캣','물개','곰돌이','치타','두더지'];
function randomNick() { let n; do { n = PG.pick(ADJ) + PG.pick(NOUN); } while (n.length > 8); return n; }

let db = null, uid = null, nick = '', offset = 0, connected = false, online = false;
let show = null, presence = {}, hostT = null, lastPK = '', castRound = null, refs = [];
const now = () => Date.now() + offset;
const arr = v => Array.isArray(v) ? v.filter(x => x != null) : (v ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
const R = p => db.ref(ROOT + '/' + p);

/* ───────── 시작/종료 ───────── */
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); });
}
async function loadSDK() {
  if (window.firebase && firebase.database) return;
  await loadScript(SDK + 'firebase-app-compat.js');
  await loadScript(SDK + 'firebase-auth-compat.js');
  await loadScript(SDK + 'firebase-database-compat.js');
}
function cfgOk() { const c = window.FIREBASE_CONFIG; return c && c.apiKey && !/^여기/.test(c.apiKey) && c.databaseURL; }

PG.onlineStart = () => {
  PG.hideAll();
  nick = randomNick();
  $('nickShow').textContent = nick;
  $('nickErr').textContent = cfgOk() ? '' : '⚠ 실시간 서버 설정(firebase-config.js)이 필요해요.';
  $('ovNick').classList.add('show');
};
$('nickRoll').onclick = () => { nick = randomNick(); $('nickShow').textContent = nick; PG.SFX.pop(); };
$('nickCancel').onclick = () => { PG.hideAll(); $('ovTitle').classList.add('show'); };
$('nickOk').onclick = async () => {
  if (!cfgOk()) { $('nickErr').textContent = '⚠ 실시간 서버 설정(firebase-config.js)이 필요해요.'; return; }
  $('nickErr').textContent = '연결 중…'; $('nickOk').disabled = true;
  try { await connect(); $('ovNick').classList.remove('show'); }
  catch (e) { console.error(e); $('nickErr').textContent = '연결에 실패했어요. 잠시 후 다시 시도해 주세요.'; leave(true); }
  finally { $('nickOk').disabled = false; }
};

function on(path, ev, fn) { const r = path.startsWith('.info') ? db.ref(path) : R(path); r.on(ev, fn); refs.push([r, ev, fn]); }

async function connect() {
  await loadSDK();
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth();
  try { await auth.setPersistence(firebase.auth.Auth.Persistence.NONE); } catch (e) {}
  uid = (await auth.signInAnonymously()).user.uid;
  db = firebase.database(); db.goOnline();
  online = true; lastPK = ''; castRound = null;
  S.mode = 'online'; S.backend = Online; S.now = now; S.me = -1; S.players = []; S.phase = 'lobby';
  PG.resetBoard(); PG.renderPlayers(true);
  on('.info/serverTimeOffset', 'value', s => { offset = s.val() || 0; });
  const pRef = R('presence/' + uid);
  on('.info/connected', 'value', s => {
    connected = !!s.val();
    if (connected) { pRef.onDisconnect().remove(); pRef.set({ nick, t: firebase.database.ServerValue.TIMESTAMP, ready: false }); }
  });
  on('presence', 'value', s => { presence = s.val() || {}; renderLobby(); });
  on('show', 'value', s => { show = s.val(); onShow(); });
  on('cells', 'child_added', s => PG.setCell(+s.key, s.val(), true));
  on('cells', 'child_changed', s => PG.setCell(+s.key, s.val(), true));
  on('cells', 'child_removed', s => PG.setCell(+s.key, -1, false));
  on('items', 'value', s => { S.items = s.val() || {}; });
  on('eff', 'value', s => {
    const v = s.val() || {};
    for (let k = 0; k < 8; k++) { const e = v[k] || v['s' + k] || {}; S.eff[k] = { bolt: e.bolt || 0, shield: e.shield || 0 }; }
  });
  hostT = setInterval(hostTick, 100);
  $('ovLobby').classList.add('show');
}

function leave(silent) {
  clearInterval(hostT); hostT = null;
  if (db) {
    try {
      if (show && show.lock && show.lock.uid === uid) R('show/lock').remove();
      if (uid) R('presence/' + uid).remove();
      refs.forEach(([r, ev, fn]) => r.off(ev, fn));
      setTimeout(() => db && db.goOffline(), 300);
    } catch (e) {}
  }
  refs = []; show = null; online = false;
  $('onBar').classList.remove('show');
  PG.hideAll();
  if (!silent) PG.goHome();
}
$('lobbyLeave').onclick = () => leave();
$('onBarLeave').onclick = () => leave();
$('lobbySolo').onclick = () => { leave(true); $('soloBtn').click(); };
$('lobbyReady').onclick = () => {
  if (!db || !uid || !presence[uid]) return;
  const r = !presence[uid].ready;
  R('presence/' + uid + '/ready').set(r);
  if (r) PG.SFX.pop();
};
function clearReady() { if (db && uid && presence[uid] && presence[uid].ready) R('presence/' + uid + '/ready').set(false); }

/* ───────── 내가 칠하기 (온라인) ───────── */
const EFF = (s, k) => 'eff/s' + s + '/' + k;
const Online = {
  paint(s, i) {
    const t = now();
    if (!PG.canPaint(s, i, t)) return false;
    PG.setCell(i, s, true);           // 내 화면에는 바로 반영
    R('cells/' + i).set(s);
    const id = PG.itemAt(i);
    if (id) claimItem(s, id, i);
    return true;
  }
};
function claimItem(s, id, i) {
  const it = S.items[id]; if (!it) return;
  R('items/' + id).transaction(cur => (cur ? null : undefined), (err, committed) => {
    if (err || !committed) return;
    const t = now();
    if (it.k === 'bomb') {
      const up = {};
      PG.bombCells(s, i, t).forEach(j => { up['cells/' + j] = s; PG.setCell(j, s, true); });
      up['show/fx'] = { s, k: it.k, i, t };
      db.ref(ROOT).update(up);
    } else {
      db.ref(ROOT).update({ [EFF(s, it.k)]: t + PG.EFF_MS, 'show/fx': { s, k: it.k, i, t } });
    }
  });
}

/* ───────── 진행 담당(호스트) ───────── */
function hostTick() {
  if (!db || !connected || !uid) return;
  const t = now(), lock = show && show.lock;
  if (!lock || t - lock.hb > HB_STALE) {
    R('show/lock').transaction(cur => (!cur || cur.uid === uid || now() - cur.hb > HB_STALE) ? { uid, hb: now() } : undefined);
    return;
  }
  if (lock.uid !== uid) return;
  if (t - lock.hb > 2000) R('show/lock/hb').set(t);
  try { drive(t); } catch (e) { console.error(e); }
}
function up(v) { return R('show').update(v); }

function drive(t) {
  const s = show || {};
  const humans = Object.keys(presence);
  switch (s.phase || 'lobby') {
    case 'lobby':
      if (humans.length >= 2) up({ phase: 'countdown', until: t + WAIT_MS });
      else if (!s.phase) up({ phase: 'lobby' });
      break;
    case 'countdown':
      if (humans.length < 2) up({ phase: 'lobby', until: null });
      else if (t >= s.until || humans.every(u => presence[u] && presence[u].ready)) startRound(t, s);
      break;
    case 'play': {
      if (!s.cast) { up({ phase: 'lobby' }); break; }
      if (t < s.startAt) break;
      // AI
      arr(s.cast).forEach((c, k) => {
        if (!c.ai || t < (S.aiNext[k] || 0)) return;
        if (S.aiNext[k] == null) { S.aiNext[k] = t + 200 + PG.rnd() * 600; return; }
        const i = PG.aiThink(k, t);
        if (i >= 0) Online.paint(k, i);
        S.aiNext[k] = t + PG.aiDelay(k, t);
      });
      // 아이템
      if (!S.itemNext || S.itemNext < s.startAt) S.itemNext = s.startAt + 5000;
      if (t >= S.itemNext) {
        const it = PG.spawnItem(t);
        if (it) R('items/' + it.id).set({ i: it.i, k: it.k });
        S.itemNext = t + 5000 + PG.rnd() * 4000;
      }
      if (t >= s.endAt + 500) {
        const st = PG.standings().map(r => ({ k: r.k, c: r.c }));
        up({ phase: 'result', until: t + 9000, scores: st });
      }
      break;
    }
    case 'result':
      if (t >= s.until) {
        db.ref(ROOT).update({ cells: null, items: null, eff: null });
        up({ phase: humans.length >= 2 ? 'countdown' : 'lobby', until: humans.length >= 2 ? t + WAIT_MS : null,
          cast: null, scores: null, startAt: null, endAt: null, fx: null });
      }
      break;
    default: up({ phase: 'lobby' });
  }
}

function startRound(t, s) {
  const list = Object.entries(presence).sort((a, b) => (a[1].t || 0) - (b[1].t || 0)).slice(0, MAX_HUMAN);
  const taken = new Set(), cast = [];
  list.forEach(([u, p]) => {
    let n = String(p.nick || '참가자').slice(0, 8), k = 2;
    while (taken.has(n)) n = String(p.nick).slice(0, 7) + (k++);
    taken.add(n); cast.push({ uid: u, name: n, ai: false });
  });
  const names = PG.shuffle(PG.AI_NAMES.filter(n => !taken.has(n)));
  while (cast.length < FILL_TO) cast.push({ ai: true, name: names.pop(), d: 'normal' });
  const startAt = t + PG.OPEN_MS, cells = PG.spawnMap(cast.length);
  S.aiNext = {}; S.itemNext = 0;
  db.ref(ROOT).update({ cells, items: null, eff: null });
  up({ phase: 'play', round: (s.round || 0) + 1, cast, startAt, endAt: startAt + PG.GAME_MS, until: null, scores: null, fx: null });
}

/* ───────── 화면 (모두 공통) ───────── */
function renderLobby() {
  if (!online) return;
  const list = Object.entries(presence).sort((a, b) => (a[1].t || 0) - (b[1].t || 0));
  $('lobbyList').innerHTML = list.map(([u, p]) => `<span class="${u === uid ? 'me' : ''}${p.ready ? ' ready' : ''}">${p.ready ? '✓ ' : ''}${PG.esc(p.nick || '?')}</span>`).join('');
  const ph = show && show.phase, n = list.length, rn = list.filter(([, p]) => p.ready).length, mine = presence[uid];
  const inLobby = !ph || ph === 'lobby' || ph === 'countdown';
  const rb = $('lobbyReady');
  rb.style.display = inLobby ? '' : 'none';
  rb.textContent = mine && mine.ready ? '준비 취소' : '준비 완료!';
  rb.className = 'btn sm ' + (mine && mine.ready ? 'white' : 'pink');
  let msg;
  if (ph === 'countdown') msg = `<b style="color:#2ec27e">${n}명</b>이 모였어요! 준비 <b>${rn}/${n}</b><br>모두 '준비 완료'를 누르면 바로 시작해요.`;
  else if (!inLobby) msg = `지금 한 판이 진행 중이에요. 끝나면 다음 판에 함께해요!<br>(접속 중 ${n}명)`;
  else msg = n >= 2 ? `<b>${n}명</b> 접속 중` : '다른 참가자를 기다리고 있어요…<br><b>2명 이상</b> 모이면 10초 뒤에 시작해요.<br>친구에게 이 페이지를 알려 주세요!';
  $('lobbyMsg').innerHTML = msg;
}

function onShow() {
  if (!online) return;
  renderLobby();
  if (!show) return;
  if (show.cast && show.round !== castRound) {
    castRound = show.round;
    const cast = arr(show.cast);
    S.players = cast.map(c => ({ name: c.name, ai: !!c.ai, d: c.d, uid: c.uid || null }));
    S.me = cast.findIndex(c => c.uid === uid);
    S.startAt = show.startAt; S.endAt = show.endAt;
    S.lastSec = null; S.lastOpenSec = null;
    PG.renderPlayers(true);
  }
  if (!show.cast) castRound = null;
  if (show.fx && show.fx.t !== S.lastFx) { S.lastFx = show.fx.t; PG.itemFx(show.fx.s, show.fx.k, show.fx.i); }
  const pk = show.phase + '|' + (show.round || '');
  if (pk !== lastPK) { lastPK = pk; enter(show.phase); }
}

function enter(ph) {
  if (ph === 'lobby' || ph === 'countdown') {
    $('ovResult').classList.remove('show'); $('onBar').classList.remove('show');
    $('ovLobby').classList.add('show'); renderLobby();
    S.phase = 'lobby'; S.me = -1;
    PG.setStatus('실시간 대기실이에요. 참가자가 모이면 시작해요!');
    return;
  }
  $('ovLobby').classList.remove('show');
  if (ph === 'play') {
    $('ovResult').classList.remove('show');
    clearReady();
    S.phase = 'opening';
    if (S.me < 0) { $('onBar').classList.add('show'); $('onBarTxt').textContent = '👀 관전 중 · 다음 판에 자동으로 참가해요'; }
    else $('onBar').classList.remove('show');
    PG.setStatus(S.me >= 0 ? `내 색은 <b style="color:${PG.COLORS[S.me]}">●</b> 이에요! 곧 시작해요.` : '관전 중이에요.');
    return;
  }
  if (ph === 'result') {
    S.phase = 'result'; PG.SFX.end(); PG.banner('끝!');
    const sc = (show.scores ? arr(show.scores) : null) || PG.standings().map(r => ({ k: r.k, c: r.c }));
    setTimeout(() => {
      if (!online || !show || show.phase !== 'result') return;
      const list = sc.map(r => ({ k: r.k, c: r.c, name: (S.players[r.k] || {}).name || '?' }));
      const top = list.length ? list[0].c : 0;
      const winners = list.filter(r => r.c === top).map(r => r.name);
      let title, desc;
      if (S.me >= 0) {
        const mine = (list.find(r => r.k === S.me) || { c: 0 }).c;
        const rank = list.filter(r => r.c > mine).length + 1;
        title = rank === 1 ? '🏆 우승!' : `${rank}위`;
        desc = rank === 1 ? `판의 <b>${Math.round(mine / PG.CELLS * 100)}%</b>를 차지했어요!` : `우승: <b>${PG.esc(winners.join(', '))}</b>`;
        if (rank === 1) { PG.SFX.fanfare(); PG.store.set('onlineWins', PG.store.get('onlineWins', 0) + 1); } else PG.SFX.sad();
      } else { title = '이번 판 결과'; desc = `우승: <b>${PG.esc(winners.join(', '))}</b><br>다음 판에는 함께해요!`; }
      PG.showResult({ title, desc, list, best: '잠시 후 대기실로 돌아갑니다…', buttons: [['나가기', '', () => leave()]] });
    }, 1300);
  }
}

/* 시작 시각이 되면 화면 단계 전환 (모든 참가자) */
PG.onTick = t => {
  if (!online || !show) return;
  if (show.phase === 'play' && S.phase === 'opening' && t >= show.startAt) S.phase = 'play';
  if (show.phase === 'play' && S.phase === 'play' && t >= show.endAt) S.phase = 'ended';
};
window.addEventListener('pagehide', () => { if (online && db && uid) { try { R('presence/' + uid).remove(); } catch (e) {} } });
})();