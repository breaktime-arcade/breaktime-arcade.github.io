/* 두뇌 서바이벌 - 함께 하기(실시간) 모드
 * © 쉬는시간 오락실 (smile-willow.tistory.com) · 무단 복제·배포 금지
 *
 * 구조: 서버 없이 Firebase Realtime Database 하나로 동작합니다.
 *  - presence/{uid}   : 접속 중인 사람(닉네임)
 *  - show             : 지금 방송 상태(단계, 문제, 출연자, 생존 여부 …) — 모두가 같은 화면을 그림
 *  - show/lock        : 진행 담당(호스트) 표시. 호스트가 나가면 다른 사람이 자동으로 이어받음
 *  - answers/{key}/{uid} : 각자 고른 답
 */
(() => {
'use strict';
const BS = window.BS;
if (!BS) return;
const $ = id => document.getElementById(id);
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const TOTAL = BS.TOTAL, MAXQ = BS.MAXQ;
const WAIT_MS = window.BS_WAIT_MS || 30000;      // 2명 이상 모이면 시작까지 대기
const HB_STALE = 7000;      // 호스트 응답이 이 시간 넘게 없으면 교체
const BAN = ['씨발','시발','ㅅㅂ','병신','ㅂㅅ','개새','좆','존나','미친','fuck','shit','sex','섹스','운영자','관리자','admin'];

let db = null, uid = null, nick = '', offset = 0, connected = false;
let show = null, presence = {}, answers = {}, answersKey = null, answersRef = null;
let hostT = null, uiT = null, lastPK = '', castRound = null, cs = [], mySlot = -1;
let ui = {};          // 현재 문제의 화면 상태
let stat = { surv: 0, correct: 0, answered: 0, rank: null, inRound: null };
const now = () => Date.now() + offset;

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

BS.onlineStart = () => {
  $('ovTitle').classList.remove('show');
  $('nickInput').value = BS.store.get('nick', '');
  $('nickErr').textContent = cfgOk() ? '' : '⚠ 아직 실시간 서버 설정이 끝나지 않았어요. (firebase-config.js)';
  $('ovNick').classList.add('show');
  setTimeout(() => $('nickInput').focus(), 50);
};
function checkNick(n) {
  if (n.length < 2 || n.length > 8) return '닉네임은 2~8글자로 정해 주세요.';
  if (!/^[가-힣a-zA-Z0-9_]+$/.test(n)) return '한글·영문·숫자만 쓸 수 있어요. (띄어쓰기·특수문자 안 됨)';
  const low = n.toLowerCase();
  if (BAN.some(w => low.includes(w))) return '사용할 수 없는 단어가 들어 있어요.';
  return '';
}
$('nickCancel').onclick = () => { $('ovNick').classList.remove('show'); $('ovTitle').classList.add('show'); };
$('nickInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('nickOk').click(); });
$('nickOk').onclick = async () => {
  const n = $('nickInput').value.trim();
  const err = checkNick(n);
  if (err) { $('nickErr').textContent = err; return; }
  if (!cfgOk()) { $('nickErr').textContent = '⚠ 실시간 서버 설정(firebase-config.js)이 필요해요.'; return; }
  nick = n; BS.store.set('nick', n);
  $('nickErr').textContent = '연결 중…'; $('nickOk').disabled = true;
  try {
    await connect();
    $('ovNick').classList.remove('show');
  } catch (e) {
    console.error(e);
    $('nickErr').textContent = '연결에 실패했어요. 잠시 후 다시 시도해 주세요.';
    leave(true);
  } finally { $('nickOk').disabled = false; }
};

async function connect() {
  await loadSDK();
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth();
  try { await auth.setPersistence(firebase.auth.Auth.Persistence.NONE); } catch (e) {}
  const cred = await auth.signInAnonymously();
  uid = cred.user.uid;
  db = firebase.database();
  db.goOnline();
  BS.mode = 'online';
  resetLocal();
  db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
  const pRef = db.ref('presence/' + uid);
  db.ref('.info/connected').on('value', s => {
    connected = !!s.val();
    if (connected) { pRef.onDisconnect().remove(); pRef.set({ nick, t: firebase.database.ServerValue.TIMESTAMP }); }
  });
  db.ref('presence').on('value', s => { presence = s.val() || {}; renderLobby(); });
  db.ref('show').on('value', s => { show = s.val(); onShow(); });
  hostT = setInterval(hostTick, 250);
  uiT = setInterval(uiTick, 80);
  showLobby(true);
}

function leave(silent) {
  clearInterval(hostT); clearInterval(uiT); hostT = uiT = null;
  if (db) {
    try {
      if (show && show.lock && show.lock.uid === uid) db.ref('show/lock').remove();
      if (uid) db.ref('presence/' + uid).remove();
      ['.info/serverTimeOffset', '.info/connected', 'presence', 'show'].forEach(p => db.ref(p).off());
      if (answersRef) answersRef.off();
      setTimeout(() => db && db.goOffline(), 300);
    } catch (e) {}
  }
  answersRef = null; answersKey = null; show = null;
  ['ovLobby', 'ovFinal', 'ovNick'].forEach(i => $(i).classList.remove('show'));
  $('onBar').classList.remove('show');
  BS.setLedFast(false);
  if (!silent) BS.goHome();
  BS.mode = 'single';
}
$('lobbyLeave').onclick = () => leave();
$('onBarLeave').onclick = () => leave();
$('finLeave').onclick = () => leave();
$('lobbySolo').onclick = () => { leave(true); BS.mode = 'single'; $('startBtn').click(); };

function resetLocal() {
  lastPK = ''; castRound = null; cs = []; mySlot = -1; ui = {};
  stat = { surv: 0, correct: 0, answered: 0, rank: null, inRound: null };
}

/* ───────── 진행 담당(호스트) ───────── */
const enc = (c, qn) => ((c + 3) * 17 + qn * 29) % 101;
const dec = (z, qn) => { for (let c = 0; c < 4; c++) if (enc(c, qn) === z) return c; return 0; };
const aliveSlots = s => (s.alive || []).map((a, i) => a ? i : -1).filter(i => i >= 0);
function up(v) { return db.ref('show').update(v); }

function hostTick() {
  if (!db || !connected || !uid) return;
  const t = now(), lock = show && show.lock;
  if (!lock || t - lock.hb > HB_STALE) {
    db.ref('show/lock').transaction(cur => {
      if (!cur || cur.uid === uid || now() - cur.hb > HB_STALE) return { uid, hb: now() };
      return;
    });
    return;
  }
  if (lock.uid !== uid) return;
  if (t - lock.hb > 2000) db.ref('show/lock/hb').set(t);
  try { drive(t); } catch (e) { console.error(e); }
}

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
      else if (t >= s.until || humans.length >= TOTAL) startRound(t, s);
      break;
    case 'opening':
      if (t >= s.until) nextQuestion(t, s);
      break;
    case 'ask': {
      const al = aliveSlots(s);
      const hum = al.filter(i => !s.cast[i].ai);
      const ansMap = answersKey === s.key ? answers : {};
      if (t >= s.tStart && hum.length && hum.every(i => ansMap[s.cast[i].uid] != null) && s.tEnd - t > 2000) up({ tEnd: t + 2000 });
      if (t >= s.tEnd + 400) {
        const q = Object.assign({}, s.q, { correct: dec(s.z, s.qn) });
        const aiAns = {};
        al.forEach(i => { if (s.cast[i].ai) aiAns['s' + i] = BS.aiPickSkill(s.cast[i].skill || 0, q); });
        up({ phase: 'reveal', until: t + 2600, aiAns });
      }
      break;
    }
    case 'reveal':
      if (t >= s.until) settle(t, s);
      break;
    case 'result': {
      if (t < s.until) break;
      const al = aliveSlots(s);
      const humanAlive = al.some(i => !s.cast[i].ai);
      if (al.length <= 1 || s.qn >= MAXQ || !humanAlive) up({ phase: 'final', until: t + 10000, winners: al, aiOnly: !humanAlive && al.length > 1 });
      else nextQuestion(t, s);
      break;
    }
    case 'final':
      if (t >= s.until) {
        db.ref('answers').remove();
        up({ phase: humans.length >= 2 ? 'countdown' : 'lobby', until: humans.length >= 2 ? t + WAIT_MS : null,
          cast: null, alive: null, q: null, z: null, key: null, aiAns: null, ans: null, out: null, winners: null, correct: null, allWrong: null });
      }
      break;
    default:
      up({ phase: 'lobby' });
  }
}

function startRound(t, s) {
  const list = Object.entries(presence).sort((a, b) => (a[1].t || 0) - (b[1].t || 0)).slice(0, TOTAL);
  const taken = new Set(), cast = [];
  list.forEach(([u, p]) => {
    let n = String(p.nick || '참가자').slice(0, 8), k = 2;
    while (taken.has(n)) n = String(p.nick).slice(0, 7) + (k++);
    taken.add(n);
    cast.push({ uid: u, name: n, ai: false, look: BS.randLook() });
  });
  const names = BS.shuffle(BS.NAMES.filter(n => !taken.has(n)));
  while (cast.length < TOTAL) cast.push({ ai: true, name: names.pop() || ('AI' + cast.length), skill: Math.round((BS.rnd() * .22 - .12) * 100) / 100, look: BS.randLook() });
  BS.shuffle(cast);
  up({ phase: 'opening', until: t + 3800, round: (s.round || 0) + 1, cast, alive: cast.map(() => true), qn: 0, used: '', lastCats: '',
    key: null, q: null, z: null, aiAns: null, ans: null, out: null, winners: null, correct: null, allWrong: null, aiOnly: null });
}

function nextQuestion(t, s) {
  const al = aliveSlots(s);
  const used = new Set(String(s.used || '').split(',').filter(Boolean).map(Number));
  const last = String(s.lastCats || '').split(',').filter(Boolean);
  const qn = (s.qn || 0) + 1;
  const r = BS.chooseQuestion(used, last, qn, al.length);
  if (!r) { up({ phase: 'final', until: t + 10000, winners: al }); return; }
  const q = r.q, T = q.ox ? 8 : 10;
  const iEnd = t + 1600, tStart = iEnd + 400 + q.text.length * 16, tEnd = tStart + T * 1000;
  up({ phase: 'ask', qn, key: s.round + '_' + qn, q: { cat: q.cat, diff: q.diff, text: q.text, opts: q.opts, ox: q.ox, T },
    z: enc(q.correct, qn), iEnd, tStart, tEnd, used: [...used].join(','), lastCats: last.join(','),
    aiAns: null, ans: null, out: null, correct: null, allWrong: null, until: null });
}

function settle(t, s) {
  const correct = dec(s.z, s.qn), alive = (s.alive || []).slice(), al = aliveSlots(s);
  const ansMap = answersKey === s.key ? answers : {};
  const ans = {};
  al.forEach(i => {
    const c = s.cast[i];
    const a = c.ai ? (s.aiAns || {})['s' + i] : ansMap[c.uid];
    if (a != null) ans['s' + i] = a;
  });
  const wrong = al.filter(i => ans['s' + i] !== correct);
  const allWrong = wrong.length === al.length;
  const out = allWrong ? [] : wrong;
  out.forEach(i => { alive[i] = false; });
  up({ phase: 'result', until: t + 3800, correct, alive, ans, out: out.length ? out : null, allWrong });
}

/* ───────── 화면 (모든 참가자 공통) ───────── */
function showLobby(on) { $('ovLobby').classList.toggle('show', on); }
function renderLobby() {
  if (BS.mode !== 'online') return;
  const list = Object.entries(presence).sort((a, b) => (a[1].t || 0) - (b[1].t || 0));
  $('lobbyList').innerHTML = list.map(([u, p]) => `<span class="${u === uid ? 'me' : ''}">${BS.esc(p.nick || '?')}</span>`).join('');
  const ph = show && show.phase;
  const n = list.length;
  let msg;
  if (ph === 'countdown') msg = `<b style="color:#7cff9b">${n}명</b>이 모였어요! 곧 방송이 시작됩니다.`;
  else if (ph && !['lobby', 'countdown'].includes(ph)) msg = `지금 방송이 진행 중이에요. 끝나면 다음 회차에 함께 참가해요!<br>(접속 중 ${n}명)`;
  else msg = n >= 2 ? `<b style="color:#7cff9b">${n}명</b> 접속 중` : '다른 참가자를 기다리고 있어요…<br><b style="color:#ffd23f">2명 이상</b> 모이면 30초 뒤에 방송이 시작돼요.<br>친구에게 이 페이지를 알려 주세요!';
  $('lobbyMsg').innerHTML = msg;
}
const slotOfUid = u => cs.findIndex(c => c.uid === u);

function buildCast() {
  mySlot = show.cast.findIndex(c => c.uid === uid);
  cs = show.cast.map((c, i) => ({ i, me: i === mySlot, human: !c.ai, name: c.ai ? c.name : c.name, uid: c.uid || null, look: c.look || BS.randLook() }));
  BS.buildStage(cs);
  stat = { surv: 0, correct: 0, answered: 0, rank: null, inRound: mySlot >= 0 };
}
function bar(txt) { $('onBarTxt').textContent = txt; $('onBar').classList.add('show'); }

function onShow() {
  if (BS.mode !== 'online') return;
  renderLobby();
  if (!show) return;
  if (show.cast && show.round !== castRound) { castRound = show.round; buildCast(); }
  if (!show.cast) castRound = null;
  if (show.key && show.key !== answersKey) attachAnswers(show.key);
  const pk = show.phase + '|' + (show.key || show.round || '');
  if (pk !== lastPK) { lastPK = pk; enter(show.phase); }
}

function attachAnswers(key) {
  if (answersRef) answersRef.off();
  answersKey = key; answers = {};
  answersRef = db.ref('answers/' + key);
  answersRef.on('value', s => { answers = s.val() || {}; onAnswers(); });
}
function onAnswers() {
  if (!show || show.phase !== 'ask' || !cs.length) return;
  Object.keys(answers).forEach(u => {
    const i = slotOfUid(u);
    if (i < 0 || ui.locked[i]) return;
    ui.locked[i] = true;
    if (i === mySlot) BS.setBoard(cs[i], BS.label(show.q, answers[u]), 'lock', true);
    else { BS.setBoard(cs[i], '✓', 'lock', true); BS.SFX.lock(); }
  });
}

function aliveN() { return show && show.alive ? show.alive.filter(Boolean).length : TOTAL; }
function meAlive() { return mySlot >= 0 && show.alive && show.alive[mySlot]; }

function enter(ph) {
  const s = show;
  if (ph === 'lobby' || ph === 'countdown') {
    $('ovFinal').classList.remove('show'); $('onBar').classList.remove('show');
    showLobby(true); renderLobby();
    if (castRound === null && cs.length) { cs = []; BS.idleStage(); }
    BS.el.qno.textContent = '대기실'; BS.el.opts.innerHTML = ''; BS.el.qtext.className = 'qtext idle';
    BS.el.qtext.textContent = '다음 방송을 기다리고 있어요.'; BS.updateAliveN(TOTAL);
    BS.say('실시간 대기실입니다. 참가자가 모이면 방송을 시작할게요!');
    return;
  }
  showLobby(false);
  if (!s.cast) return;
  if (ph === 'opening') {
    $('ovFinal').classList.remove('show');
    const h = s.cast.filter(c => !c.ai).length;
    BS.updateAliveN(aliveN());
    BS.el.chip.textContent = '실시간 방송'; BS.el.chip.style.background = '#ff4fa3';
    BS.el.qno.textContent = `제 ${s.round} 회`; BS.el.stars.innerHTML = '';
    BS.el.opts.innerHTML = ''; BS.el.qtext.className = 'qtext idle'; BS.el.qtext.textContent = '곧 첫 문제가 시작됩니다!';
    BS.setTimerUI(1, 10);
    BS.splash('실시간<br>두뇌 서바이벌'); BS.SFX.intro();
    BS.say(`실시간 방송 시작! 오늘은 사람 ${h}명과 AI ${TOTAL - h}명이 함께합니다. 최후의 1인은 누구일까요?`, 'happy');
    if (mySlot < 0) bar('👀 관전 중 · 다음 회차에 자동으로 참가해요');
    else $('onBar').classList.remove('show');
    return;
  }
  if (ph === 'ask') {
    const q = s.q;
    ui = { typed: 0, shown: false, closed: false, lastSec: null, locked: {}, aiLock: {}, myAns: null };
    cs.forEach((c, i) => BS.setBoard(c, s.alive[i] ? '?' : '', s.alive[i] ? '' : 'none'));
    aliveSlots(s).forEach(i => { if (s.cast[i].ai) ui.aiLock[i] = s.tStart + 700 + BS.rnd() * Math.max(500, s.tEnd - s.tStart - 1400); });
    BS.setHead(q); BS.el.qno.textContent = `제 ${s.qn} 문제`;
    BS.el.qtext.className = 'qtext idle'; BS.el.qtext.textContent = '문제를 준비하고 있습니다…';
    BS.el.opts.innerHTML = ''; BS.setTimerUI(1, q.T);
    BS.updateAliveN(aliveN());
    BS.splash(`제 ${s.qn} 문제`); BS.SFX.qstart();
    const cat = (BS.CATS[q.cat] || { label: q.cat }).label;
    BS.say(q.diff === 3 ? `이번엔 어려운 문제입니다! ${cat} 분야!` : BS.pick([`제 ${s.qn} 문제! ${cat} 분야입니다.`, `자, ${s.qn}번째 문제 나갑니다! 분야는 ${cat}!`]));
    onAnswers();
    return;
  }
  if (ph === 'reveal') {
    closeOpts();
    BS.SFX.buzzer(); BS.splash('마감!');
    BS.say(BS.pick(['그만! 정답을 공개합니다!', '시간 종료! 모두 답판을 들어주세요!']));
    const list = aliveSlots(s);
    list.forEach((i, k) => setTimeout(() => {
      if (!show || show.key !== s.key) return;
      const c = s.cast[i];
      const a = c.ai ? (s.aiAns || {})['s' + i] : answers[c.uid];
      BS.setBoard(cs[i], BS.label(s.q, a), a == null ? 'none' : 'lock', true); BS.SFX.flip();
    }, 900 + k * 45));
    return;
  }
  if (ph === 'result') {
    closeOpts();
    const q = s.q, cor = s.correct, opts = BS.opts();
    BS.el.opts.classList.add('done');
    if (opts[cor]) opts[cor].classList.add('correct');
    if (ui.myAns != null && ui.myAns !== cor && opts[ui.myAns]) opts[ui.myAns].classList.add('wrongpick');
    BS.SFX.ding();
    const wasAlive = i => s.alive[i] || (s.out || []).includes(i);
    cs.forEach((c, i) => { if (wasAlive(i)) { const a = (s.ans || {})['s' + i]; BS.setBoard(c, BS.label(q, a), a === cor ? 'ok' : (a == null ? 'none' : 'ng')); } });
    BS.say(q.ox ? `정답은 '${q.opts[cor]}'입니다!` : `정답은 ${cor + 1}번, '${q.opts[cor]}'입니다!`, 'happy');
    const iWas = mySlot >= 0 && wasAlive(mySlot);
    if (iWas) {
      const mine = (s.ans || {})['s' + mySlot];
      if (mine != null) stat.answered++;
      if (mine === cor) { stat.correct++; BS.splash('정답!', 'good'); }
    }
    setTimeout(() => {
      if (!show || show.key !== s.key) return;
      const out = s.out || [];
      if (s.allWrong) {
        if (iWas) stat.surv++;
        BS.splash('전원 생존!'); BS.SFX.cheer();
        BS.say('이런! 전원 오답입니다! 이번엔 모두 살려드릴게요.', 'wow');
      } else if (!out.length) {
        if (iWas) stat.surv++;
        BS.SFX.cheer(); BS.say('와! 전원 정답입니다! 모두 살아남았어요.', 'happy');
      } else {
        BS.SFX.out();
        out.forEach((i, k) => setTimeout(() => cs[i] && cs[i].el.classList.add('out'), k * 40));
        const left = aliveN();
        BS.updateAliveN(left);
        const outHumans = out.filter(i => !s.cast[i].ai).map(i => s.cast[i].name);
        BS.say(`${out.length}명 탈락! 이제 ${left}명 남았습니다.` + (outHumans.length && !out.includes(mySlot) ? ` (${outHumans.slice(0, 3).join(', ')}${outHumans.length > 3 ? ' 외' : ''} 님 탈락)` : ''), out.length >= (left + out.length) / 2 ? 'wow' : '');
        if (iWas && out.includes(mySlot)) {
          stat.rank = left + 1;
          setTimeout(() => { BS.splash('탈락…', 'bad'); BS.SFX.sad(); }, 500);
          bar(`😢 ${stat.rank}위로 탈락 · 관전 중`);
        } else if (iWas) stat.surv++;
      }
    }, 1500);
    return;
  }
  if (ph === 'final') {
    closeOpts();
    const w = s.winners || [];
    BS.el.qno.textContent = '최종 결과'; BS.el.stars.innerHTML = ''; BS.el.opts.innerHTML = ''; BS.el.qtext.className = 'qtext idle';
    w.forEach(i => { if (cs[i]) { cs[i].el.classList.add('win'); if (w.length === 1) cs[i].el.insertAdjacentHTML('beforeend', '<span class="crown">👑</span>'); } });
    const names = w.map(i => s.cast[i].name);
    if (s.aiOnly) {
      BS.el.qtext.textContent = '사람 참가자가 모두 탈락했어요!';
      BS.splash('방송 종료'); BS.SFX.sad();
      BS.say('사람 참가자가 모두 탈락했습니다! 이번 회차는 여기까지! 다음 회차에서 다시 도전하세요.', 'wow');
    } else if (w.length === 1) {
      BS.el.qtext.textContent = `최후의 1인: ${names[0]}`;
      BS.splash('최후의 1인!'); BS.SFX.fanfare();
      BS.say(w[0] === mySlot ? '축하합니다! 오늘의 최후의 1인은 바로 당신입니다!' : `오늘의 최후의 1인은 '${names[0]}' 님입니다! 축하합니다!`, 'happy');
    } else {
      BS.el.qtext.textContent = `${w.length}명 공동 우승!`;
      BS.splash('공동 우승!'); BS.SFX.fanfare();
      BS.say(`끝까지 살아남은 ${w.length}명 모두 공동 우승입니다!`, 'happy');
    }
    setTimeout(() => { if (show && show.phase === 'final' && show.round === s.round) finalCard(s); }, 3000);
  }
}

function finalCard(s) {
  const w = s.winners || [];
  const iWon = mySlot >= 0 && w.includes(mySlot) && !s.aiOnly;
  const names = w.map(i => s.cast[i].name);
  if (mySlot >= 0) {
    const rank = iWon ? 1 : (stat.rank || (w.includes(mySlot) ? 1 : '-'));
    $('finTitle').textContent = iWon ? (w.length === 1 ? '🏆 최후의 1인!' : '🏆 공동 우승!') : (typeof rank === 'number' ? `${rank}위` : '방송 종료');
    $('finTitle').className = 'big' + (iWon ? '' : ' bad');
    $('finDesc').innerHTML = s.aiOnly ? '사람 참가자가 모두 탈락했어요. 다음 회차에서 다시 도전해요!'
      : iWon ? '실시간 참가자들을 모두 제치고 끝까지 살아남았어요!' : `이번 회차 우승: <b style="color:#ffd23f">${BS.esc(names.join(', '))}</b>`;
    $('finRank').textContent = typeof rank === 'number' ? rank + '위' : '-';
    $('finSurv').textContent = stat.surv + '문제';
    $('finRate').textContent = stat.answered ? Math.round(stat.correct / stat.answered * 100) + '%' : '-';
    $('finStats').style.display = '';
    if (iWon) BS.store.set('onlineWins', BS.store.get('onlineWins', 0) + 1);
  } else {
    $('finTitle').textContent = '방송 종료'; $('finTitle').className = 'big';
    $('finDesc').innerHTML = s.aiOnly ? '사람 참가자가 모두 탈락했어요.' : `이번 회차 우승: <b style="color:#ffd23f">${BS.esc(names.join(', '))}</b><br>다음 회차에는 함께 참가해요!`;
    $('finStats').style.display = 'none';
  }
  $('onBar').classList.remove('show');
  $('ovFinal').classList.add('show');
}

function closeOpts() {
  if (ui.closed) return;
  ui.closed = true;
  BS.opts().forEach(b => b.disabled = true);
  BS.setLedFast(false);
  if (meAlive() && ui.myAns == null && mySlot >= 0) BS.setBoard(cs[mySlot], '–', 'none');
}

/* 시간에 따라 바뀌는 부분 (문제 글자, 보기, 타이머, AI 답판) */
function uiTick() {
  if (BS.mode !== 'online' || !show) return;
  const t = now(), s = show;
  if (s.phase === 'countdown') {
    const left = Math.max(0, Math.ceil((s.until - t) / 1000));
    $('lobbyCd').textContent = left ? `${left}초 뒤 시작!` : '시작!';
  } else $('lobbyCd').textContent = '';
  if (s.phase !== 'ask' || !s.q || ui.closed) return;
  const q = s.q;
  if (t >= s.iEnd && !ui.shown) {
    const n = Math.min(q.text.length, Math.ceil((t - s.iEnd) / 16));
    if (n !== ui.typed) { ui.typed = n; BS.el.qtext.className = 'qtext'; BS.el.qtext.textContent = q.text.slice(0, n); }
  }
  if (t >= s.tStart && !ui.shown) {
    ui.shown = true;
    BS.el.qtext.className = 'qtext'; BS.el.qtext.textContent = q.text;
    BS.renderOpts({ opts: q.opts, ox: q.ox });
    setTimeout(() => BS.el.opts.classList.add('show'), 30);
    const can = meAlive() && !answers[uid];
    BS.opts().forEach(b => b.disabled = !can);
    BS.setLedFast(true);
    BS.say(meAlive() ? (q.ox ? '맞으면 O, 틀리면 X! 골라주세요!' : '제한 시간 안에 답을 고르세요!') : '참가자들이 답을 고르고 있습니다…');
  }
  if (ui.shown) {
    const rem = Math.max(0, s.tEnd - t), sec = Math.ceil(rem / 1000);
    BS.setTimerUI(rem / (q.T * 1000), sec);
    if (sec !== ui.lastSec) { ui.lastSec = sec; if (sec > 0) (sec <= 3 ? BS.SFX.hurry : BS.SFX.tick)(); }
    for (const k in ui.aiLock) {
      if (!ui.locked[k] && t >= ui.aiLock[k] && t < s.tEnd) { ui.locked[k] = true; BS.setBoard(cs[k], '✓', 'lock', true); }
    }
    if (rem <= 0) closeOpts();
  }
}

/* 내 답 보내기 */
BS.onlinePick = i => {
  const s = show;
  if (!s || s.phase !== 'ask' || !meAlive() || ui.myAns != null || ui.closed) return;
  const t = now();
  if (t < s.tStart || t > s.tEnd) return;
  ui.myAns = i; ui.locked[mySlot] = true;
  const opts = BS.opts();
  opts[i].classList.add('sel'); opts.forEach(b => b.disabled = true);
  BS.setBoard(cs[mySlot], BS.label(s.q, i), 'lock', true);
  BS.SFX.click();
  BS.say(BS.pick(['좋아요, 답을 고르셨군요!', '과연 정답일까요?', '선택 완료! 두근두근…']));
  db.ref(`answers/${s.key}/${uid}`).set(i).catch(() => {
    BS.say('앗! 시간이 지나 답이 접수되지 않았어요.');
    ui.myAns = null;
  });
};
document.addEventListener('keydown', e => {
  if (BS.mode !== 'online' || !show || show.phase !== 'ask' || !show.q) return;
  const k = e.key.toLowerCase();
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (show.q.ox) { if (k === 'o' || k === '1') BS.onlinePick(0); else if (k === 'x' || k === '2') BS.onlinePick(1); }
  else if (['1', '2', '3', '4'].includes(k)) BS.onlinePick(+k - 1);
});
window.addEventListener('pagehide', () => { if (BS.mode === 'online' && db && uid) { try { db.ref('presence/' + uid).remove(); } catch (e) {} } });
})();