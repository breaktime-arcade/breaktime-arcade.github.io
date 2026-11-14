/* 두뇌 서바이벌 - 최후의 1인 퀴즈쇼
 * © 쉬는시간 오락실 (smile-willow.tistory.com) · 무단 복제·배포 금지
 */
(() => {
'use strict';

/* ───────── 기본 데이터 ───────── */
const QDATA = window.QUIZ_DATA || [];
const QIDX = QDATA.map((_, i) => i);
const CATS = {
  '상식': { label: '상식', c: '#ffb13b' },
  '역사': { label: '역사', c: '#ff7b54' },
  '과학': { label: '과학', c: '#5ef2a8' },
  '지리': { label: '지리', c: '#6fd8ff' },
  '우리말': { label: '우리말', c: '#ff8ad0' },
  '속담': { label: '속담·사자성어', c: '#c9a8ff' },
  '넌센스': { label: '넌센스', c: '#ffe45c' },
  '추억': { label: '추억 7080', c: '#ffb3c7' }
};
const NAMES = ['번개머리','퀴즈요정','만물박사','동네천재','척척석사','꼼꼼이','느긋한곰','벼락치기','책벌레','호기심왕',
  '똑순이','엉뚱이','잔머리왕','찍기달인','모범생','깡다구','반짝이','수다쟁이','멍때리기','시골영재','골목대장','왕눈이'];
const TOTAL = 20, ME = 14, MAXQ = 40;
const BASE = { 1: .86, 2: .68, 3: .5 };
const SKIN = ['#ffdbb5','#f7c99b','#eeb78a','#e0a878','#ffe3c8','#f3c2a0'];
const HAIRC = ['#1d1a24','#2b2230','#3b2a20','#5a3a22','#7a4a26','#1f2438','#8a5a2b','#4a2a3a'];
const SHIRT = ['#e63946','#457b9d','#2a9d8f','#f4a261','#8338ec','#ff006e','#3a86ff','#06d6a0','#ffbe0b','#6d6875','#118ab2','#ef476f','#9b5de5','#00bbf9'];

const randLook = () => ({ skin: pick(SKIN), hair: ri(HAIR_N), hc: pick(HAIRC), shirt: pick(SHIRT) });
const HAIR_N = 8;
const rnd = Math.random, ri = n => Math.floor(rnd() * n), pick = a => a[ri(a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const $ = id => document.getElementById(id);

/* ───────── 저장 ───────── */
const store = {
  get(k, d) { try { const v = localStorage.getItem('brainsv_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('brainsv_' + k, JSON.stringify(v)); } catch (e) {} }
};

/* ───────── 소리 ───────── */
let AC = null, muted = store.get('mute', false);
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, d, type = 'sine', v = .12, t0 = 0, f2) {
  if (muted) return; const a = ac(); if (!a) return;
  const t = a.currentTime + t0, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .03);
}
const SFX = {
  tick: () => tone(1250, .05, 'square', .04),
  hurry: () => { tone(900, .09, 'square', .08); },
  click: () => tone(660, .09, 'triangle', .12),
  lock: () => tone(520, .05, 'sine', .035),
  buzzer: () => { tone(170, .55, 'sawtooth', .11); tone(176, .55, 'sawtooth', .08); },
  ding: () => { tone(1046, .16, 'triangle', .15); tone(1318, .3, 'triangle', .15, .12); },
  out: () => tone(520, .55, 'sawtooth', .06, 0, 110),
  flip: () => tone(880 + ri(300), .03, 'square', .025),
  intro: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, .2, 'triangle', .12, i * .12)),
  qstart: () => { tone(784, .1, 'square', .06); tone(1046, .18, 'square', .06, .1); },
  fanfare: () => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, .24, 'triangle', .13, i * .13)),
  sad: () => [523, 466, 415, 349].forEach((f, i) => tone(f, .32, 'triangle', .1, i * .22)),
  cheer: () => { for (let i = 0; i < 14; i++) tone(300 + ri(900), .08, 'triangle', .04, i * .045); }
};

/* ───────── 그림 (SVG) ───────── */
const HAIR = [
  c => ({ b: '', f: `<path d="M19 38 Q17 15 40 15 Q63 15 61 38 Q58 26 48 24 Q40 30 30 25 Q22 28 19 38Z" fill="${c}"/>` }),
  c => ({ b: '', f: `<path d="M19 40 Q16 14 42 14 Q64 16 61 38 Q60 30 56 26 Q44 28 34 20 Q28 30 19 40Z" fill="${c}"/>` }),
  c => ({ b: `<path d="M17 40 Q15 13 40 13 Q65 13 63 40 L64 70 Q52 74 40 70 Q28 74 16 70Z" fill="${c}"/>`,
          f: `<path d="M20 36 Q21 16 40 16 Q59 16 60 36 Q52 26 41 25 Q30 27 20 36Z" fill="${c}"/>` }),
  c => ({ b: `<path d="M16 42 Q14 13 40 13 Q66 13 64 42 L63 55 Q52 51 40 51 Q28 51 17 55Z" fill="${c}"/>`,
          f: `<path d="M20 34 Q20 15 40 15 Q60 15 60 34 L60 31 Q40 34 20 31Z" fill="${c}"/>` }),
  c => ({ b: '', f: `<path d="M21 33 Q22 17 40 17 Q58 17 59 33 Q50 23 40 23 Q30 23 21 33Z" fill="${c}" opacity=".9"/>` }),
  c => ({ b: '', f: `<path d="M19 36 L20 20 L27 24 L29 12 L36 21 L41 9 L46 20 L53 12 L54 23 L61 20 L61 36 Q52 25 40 26 Q28 25 19 36Z" fill="${c}"/>` }),
  c => ({ b: '', f: `<g fill="${c}"><circle cx="24" cy="28" r="7"/><circle cx="31" cy="20" r="8"/><circle cx="40" cy="17" r="8"/><circle cx="49" cy="20" r="8"/><circle cx="56" cy="28" r="7"/><circle cx="20" cy="36" r="5"/><circle cx="60" cy="36" r="5"/></g>` }),
  c => ({ b: `<ellipse cx="63" cy="30" rx="7" ry="13" transform="rotate(28 63 30)" fill="${c}"/>`,
          f: `<path d="M19 38 Q17 14 40 14 Q63 14 61 38 Q56 24 40 23 Q24 24 19 38Z" fill="${c}"/><circle cx="58" cy="20" r="3.5" fill="#ff5c8a"/>` })
];
function avatarSVG(p) {
  const h = HAIR[p.hair](p.hc);
  return `<svg viewBox="0 0 80 92" aria-hidden="true">${h.b}
<path d="M9 92 Q11 66 40 63 Q69 66 71 92Z" fill="${p.shirt}"/>
<path d="M33 63.5 L40 74 L47 63.5Z" fill="#fff" opacity=".9"/>
<rect x="35" y="53" width="10" height="12" rx="3" fill="${p.skin}"/>
<circle cx="20" cy="40" r="4" fill="${p.skin}"/><circle cx="60" cy="40" r="4" fill="${p.skin}"/>
<circle cx="40" cy="38" r="20" fill="${p.skin}"/>${h.f}
<g class="eyes-ok"><circle cx="33" cy="40" r="2.6" fill="#222"/><circle cx="47" cy="40" r="2.6" fill="#222"/><circle cx="33.8" cy="39.2" r=".85" fill="#fff"/><circle cx="47.8" cy="39.2" r=".85" fill="#fff"/></g>
<g class="eyes-x" stroke="#222" stroke-width="2" stroke-linecap="round"><path d="M30.5 37.5l5 5M35.5 37.5l-5 5M44.5 37.5l5 5M49.5 37.5l-5 5"/></g>
<ellipse cx="28" cy="46" rx="3.2" ry="2" fill="#ff7b9c" opacity=".45"/><ellipse cx="52" cy="46" rx="3.2" ry="2" fill="#ff7b9c" opacity=".45"/>
<path class="m-ok" d="M35 48 Q40 53 45 48" stroke="#5a2a1a" stroke-width="2" fill="none" stroke-linecap="round"/>
<path class="m-sad" d="M35 52 Q40 47 45 52" stroke="#5a2a1a" stroke-width="2" fill="none" stroke-linecap="round"/>
<path class="m-wow" d="M34 47 Q40 56 46 47Z" fill="#7a1f2b"/>
</svg>`;
}
const HOST_SVG = `<svg viewBox="0 0 160 170" aria-hidden="true">
<g class="spk"><rect x="2" y="16" width="34" height="62" rx="7" fill="#eceef6" stroke="#b9bdd0"/><circle class="cone" cx="19" cy="35" r="11" fill="#d7263d"/><circle cx="19" cy="35" r="4.5" fill="#6d0c19"/><circle class="cone" cx="19" cy="62" r="9" fill="#d7263d"/><circle cx="19" cy="62" r="3.6" fill="#6d0c19"/></g>
<g class="spk"><rect x="124" y="16" width="34" height="62" rx="7" fill="#eceef6" stroke="#b9bdd0"/><circle class="cone" cx="141" cy="35" r="11" fill="#d7263d"/><circle cx="141" cy="35" r="4.5" fill="#6d0c19"/><circle class="cone" cx="141" cy="62" r="9" fill="#d7263d"/><circle cx="141" cy="62" r="3.6" fill="#6d0c19"/></g>
<path d="M26 170 Q30 126 80 120 Q130 126 134 170Z" fill="#23306a"/>
<path d="M65 121 L80 152 L95 121Z" fill="#fff"/>
<path d="M65 121 L77 152 L57 140Z" fill="#18214f"/><path d="M95 121 L83 152 L103 140Z" fill="#18214f"/>
<path d="M68 127 L80 133 L68 139Z M92 127 L80 133 L92 139Z" fill="#e63946"/><circle cx="80" cy="133" r="3.4" fill="#a8152a"/>
<rect x="72" y="102" width="16" height="21" rx="6" fill="#f0c096"/>
<ellipse cx="46" cy="76" rx="6" ry="9" fill="#f0c096"/><ellipse cx="114" cy="76" rx="6" ry="9" fill="#f0c096"/>
<ellipse cx="80" cy="72" rx="34" ry="37" fill="#f8d2aa"/>
<path d="M45 68 Q42 32 80 31 Q118 32 115 68 Q113 50 99 45 Q84 54 66 43 Q50 49 45 68Z" fill="#1c1a26"/>
<g class="brow" stroke="#1c1a26" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M59 61 Q66 57 73 60"/><path d="M87 60 Q94 57 101 61"/></g>
<ellipse cx="66" cy="72" rx="4.2" ry="5.2" fill="#222"/><ellipse cx="94" cy="72" rx="4.2" ry="5.2" fill="#222"/>
<circle cx="67.4" cy="70.4" r="1.4" fill="#fff"/><circle cx="95.4" cy="70.4" r="1.4" fill="#fff"/>
<path d="M80 76 Q75 87 81 88" stroke="#d29a74" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<ellipse cx="56" cy="86" rx="6" ry="3.4" fill="#ff8aa0" opacity=".45"/><ellipse cx="104" cy="86" rx="6" ry="3.4" fill="#ff8aa0" opacity=".45"/>
<path class="hm-c" d="M67 94 Q80 104 93 94" stroke="#7a2b1f" stroke-width="3.2" fill="none" stroke-linecap="round"/>
<path class="hm-o" d="M67 93 Q80 113 93 93Z" fill="#7a1f2b"/>
<g transform="rotate(-18 112 140)"><rect x="108" y="128" width="9" height="30" rx="4" fill="#2b2b33"/><circle cx="112.5" cy="124" r="8" fill="#5b5d68"/><circle cx="112.5" cy="124" r="8" fill="url(#mg)"/></g>
<circle cx="106" cy="150" r="8" fill="#f0c096"/>
<defs><radialGradient id="mg"><stop offset="0" stop-color="#9aa0b5"/><stop offset="1" stop-color="#3c3e48"/></radialGradient></defs>
</svg>`;

/* ───────── 화면 요소 ───────── */
const el = {
  host: $('host'), caption: $('caption'), splash: $('splash'), chip: $('chip'), qno: $('qno'), stars: $('stars'),
  aliveN: $('aliveN'), qtext: $('qtext'), opts: $('opts'), tbar: $('tbar'), tfill: $('tfill'), tnum: $('tnum'),
  rowBack: $('rowBack'), rowFront: $('rowFront'), specBar: $('specBar')
};
el.host.innerHTML = HOST_SVG;

// LED 패널 & 전구
const LED_L = ['두뇌', '서바이벌', '최후의', '1인', '도전!'], LED_R = ['퀴즈', '쇼', '생존', '탈락', '우승'];
$('sideL').innerHTML = LED_L.map(t => `<div class="led">${t}</div>`).join('');
$('sideR').innerHTML = LED_R.map(t => `<div class="led">${t}</div>`).join('');
const leds = [...document.querySelectorAll('.led')];
let ledStep = 0, ledFast = false;
(function ledLoop() {
  ledStep++;
  leds.forEach((l, i) => l.classList.toggle('on', ledFast ? (i + ledStep) % 2 === 0 : ((i % 5) === (ledStep % 5))));
  setTimeout(ledLoop, ledFast ? 160 : 420);
})();
$('bulbs').innerHTML = '<span></span>'.repeat(22);

/* ───────── 상태 ───────── */
let G = null, GID = 0, TIMERS = [], optEls = [];
const recent = new Set(store.get('recent', []));

function wait(ms) {
  return new Promise(r => { TIMERS.push(setTimeout(r, ms * (G && G.spectate ? .45 : 1))); });
}
function clearTimers() { TIMERS.forEach(clearTimeout); TIMERS = []; }

function say(t, mood) {
  el.caption.textContent = t;
  el.host.className = 'host talk' + (mood ? ' ' + mood : '');
  clearTimeout(say._t);
  say._t = setTimeout(() => el.host.classList.remove('talk'), Math.min(2800, 400 + t.length * 60));
}
function splash(t, cls) {
  el.splash.className = 'splash'; el.splash.innerHTML = t;
  void el.splash.offsetWidth; el.splash.className = 'splash show' + (cls ? ' ' + cls : '');
}
const aliveList = () => G.cs.filter(c => c.alive);
function updateAlive() { el.aliveN.textContent = aliveList().length; }

/* ───────── 문제 고르기 ───────── */
function build(raw) {
  const [cat, diff, text, ...rest] = raw;
  if (rest.length === 1) return { cat, diff, text, ox: true, opts: ['O', 'X'], correct: rest[0] === 'O' ? 0 : 1 };
  const opts = shuffle(rest.slice());
  return { cat, diff, text, ox: false, opts, correct: opts.indexOf(rest[0]) };
}
function takeFromSet(used, lastCats, filters) {
  for (const f of filters) {
    const c = QIDX.filter(i => !used.has(i) && f(i));
    if (c.length) {
      const i = pick(c);
      used.add(i); recent.add(i);
      const arr = [...recent]; if (arr.length > 180) recent.delete(arr[0]);
      store.set('recent', [...recent]);
      lastCats.push(QDATA[i][0]); if (lastCats.length > 2) lastCats.shift();
      return { idx: i, q: build(QDATA[i]) };
    }
  }
  return null;
}
function takeFrom(filters) { const r = takeFromSet(G.used, G.lastCats, filters); return r && r.q; }
/* 문제 고르기 (혼자/함께 공용): used·lastCats는 호출 쪽에서 관리 */
function chooseQuestion(used, lastCats, qn, aliveN) {
  let pool;
  if (aliveN <= 3) pool = [3, 3, 2];
  else if (qn <= 3) pool = [1];
  else if (qn <= 6) pool = [1, 2, 2];
  else if (qn <= 10) pool = [2, 2, 3];
  else pool = [2, 3, 3];
  const d = pick(pool);
  const D = i => QDATA[i][1] === d, NC = i => !lastCats.includes(QDATA[i][0]), NR = i => !recent.has(i);
  return takeFromSet(used, lastCats, [i => D(i) && NC(i) && NR(i), i => D(i) && NC(i), i => D(i), () => true]);
}
function pickQuestion(aliveN) {
  const r = chooseQuestion(G.used, G.lastCats, G.qn + 1, aliveN);
  return r && r.q;
}
function pickRevival() {
  const OX = i => QDATA[i].length === 4, E = i => QDATA[i][1] <= 2;
  return takeFrom([i => OX(i) && E(i) && !recent.has(i), i => OX(i) && E(i), i => QDATA[i][1] === 1, () => true]);
}

/* ───────── 무대 만들기 ───────── */
function buildStage(cs) {
  cs = cs || G.cs;
  el.rowBack.innerHTML = ''; el.rowFront.innerHTML = '';
  cs.forEach(c => {
    const d = document.createElement('div');
    d.className = 'ct' + (c.me ? ' me' : '') + (c.human && !c.me ? ' human' : '');
    d.innerHTML = (c.me ? '<span class="tag">나</span>' : '') +
      `<div class="ava">${avatarSVG(c.look)}</div><div class="board"><span>?</span></div><div class="plate">${esc(c.name)}</div>`;
    c.el = d; c.bd = d.querySelector('.board');
    (c.i < 10 ? el.rowBack : el.rowFront).appendChild(d);
  });
}
function setBoard(c, txt, cls, anim) {
  c.bd.className = 'board' + (cls ? ' ' + cls : '');
  if (anim) { void c.bd.offsetWidth; c.bd.classList.add('flip'); }
  c.bd.firstChild.textContent = txt;
}
const label = (q, a) => a == null ? '–' : (q.ox ? q.opts[a] : String(a + 1));

/* ───────── 화면 문제/보기 ───────── */
function setHead(q) {
  const cat = CATS[q.cat] || { label: q.cat, c: '#ffd23f' };
  el.chip.textContent = cat.label; el.chip.style.background = cat.c;
  el.stars.innerHTML = '★'.repeat(q.diff) + '<i>' + '★'.repeat(3 - q.diff) + '</i>';
}
function renderOpts(q) {
  el.opts.className = 'opts' + (q.ox ? ' ox' : '');
  el.opts.innerHTML = '';
  optEls = q.opts.map((t, i) => {
    const b = document.createElement('button');
    b.className = 'opt' + (q.ox ? (i === 0 ? ' o' : ' x') : '');
    b.innerHTML = q.ox ? esc(t) : `<span class="no">${i + 1}</span><span>${esc(t)}</span>`;
    b.disabled = true;
    b.addEventListener('click', () => (BS.mode === 'online' ? BS.onlinePick(i) : onPick(i)));
    el.opts.appendChild(b);
    return b;
  });
}
async function typeText(t, ok) {
  el.qtext.className = 'qtext'; el.qtext.textContent = '';
  const step = G.spectate ? 4 : 2;
  for (let i = step; i < t.length + step; i += step) {
    el.qtext.textContent = t.slice(0, i);
    await wait(30); if (!ok()) return;
  }
}
function setTimerUI(frac, sec) {
  el.tfill.style.transform = `scaleX(${Math.max(0, frac)})`;
  el.tnum.textContent = sec;
  const h = sec <= 3 && frac < 1;
  el.tbar.classList.toggle('hurry', h); el.tnum.classList.toggle('hurry', h && sec > 0);
}
function runTimer(sec, id) {
  return new Promise(res => {
    G.tTotal = sec * 1000; G.tEnd = performance.now() + G.tTotal;
    let last = null; ledFast = true;
    const iv = setInterval(() => {
      if (GID !== id) { clearInterval(iv); ledFast = false; return; }
      const rem = Math.max(0, G.tEnd - performance.now()), s = Math.ceil(rem / 1000);
      setTimerUI(rem / G.tTotal, s);
      if (s !== last) { last = s; if (s > 0) (s <= 3 ? SFX.hurry : SFX.tick)(); }
      if (rem <= 0) { clearInterval(iv); ledFast = false; res(); }
    }, 50);
  });
}

/* ───────── 플레이어 입력 ───────── */
function onPick(i) {
  if (!G || G.phase !== 'answer') return;
  const me = G.cs[ME];
  if (me.ans != null || (!me.alive && !G.revMode)) return;
  me.ans = i;
  optEls[i].classList.add('sel');
  optEls.forEach(b => b.disabled = true);
  setBoard(me, label(G.q, i), 'lock', true);
  SFX.click();
  if (!G.revMode) say(pick(['좋아요, 답을 고르셨군요!', '과연 정답일까요?', '자신 있게 고르셨네요!', '선택 완료! 두근두근…']));
  G.tEnd = Math.min(G.tEnd, performance.now() + 2200);
}
document.addEventListener('keydown', e => {
  if (BS.mode !== 'single' || !G || G.phase !== 'answer' || !G.q) return;
  const k = e.key.toLowerCase();
  if (G.q.ox) { if (k === 'o' || k === '1') onPick(0); else if (k === 'x' || k === '2') onPick(1); }
  else if (['1', '2', '3', '4'].includes(k)) onPick(+k - 1);
});

/* ───────── AI 선택 ───────── */
function aiPick(c, q) { return aiPickSkill(c.skill, q); }
function aiPickSkill(skill, q) {
  let p = BASE[q.diff] + skill + (q.ox ? .05 : 0) - (q.cat === '넌센스' ? .04 : 0);
  p = Math.max(.2, Math.min(.97, p));
  if (rnd() < p) return q.correct;
  return pick(q.opts.map((_, i) => i).filter(i => i !== q.correct));
}

/* ───────── 한 문제 진행 ───────── */
async function askQuestion(q, id) {
  const ok = () => GID === id;
  const alive = aliveList();
  G.q = q; G.phase = 'intro';
  G.cs.forEach(c => { c.ans = null; setBoard(c, c.alive ? '?' : '', c.alive ? '' : 'none'); });
  setHead(q);
  el.qno.textContent = `제 ${G.qn} 문제`;
  el.qtext.className = 'qtext idle'; el.qtext.textContent = '문제를 준비하고 있습니다…';
  el.opts.innerHTML = ''; setTimerUI(1, q.ox ? 8 : 10);

  splash(`제 ${G.qn} 문제`); SFX.qstart();
  const cat = CATS[q.cat].label;
  say(q.diff === 3 && rnd() < .6 ? `이번엔 어려운 문제입니다! ${cat} 분야!` :
    pick([`제 ${G.qn} 문제! ${cat} 분야입니다.`, `자, ${G.qn}번째 문제 나갑니다! 분야는 ${cat}!`, `긴장하세요! ${cat} 문제입니다.`]));
  await wait(1500); if (!ok()) return;

  await typeText(q.text, ok); if (!ok()) return;
  renderOpts(q);
  await wait(60); if (!ok()) return;
  el.opts.classList.add('show');
  const me = G.cs[ME];
  if (me.alive) optEls.forEach(b => b.disabled = false);
  G.phase = 'answer';
  say(me.alive ? (q.ox ? '맞으면 O, 틀리면 X! 골라주세요!' : '제한 시간 안에 답을 고르세요!') : '참가자들이 답을 고르고 있습니다…');

  const T = G.spectate ? 4 : (q.ox ? 8 : 10);
  alive.forEach(c => {
    if (c.me) return;
    c.pending = aiPick(c, q);
    const at = (.7 + rnd() * (T - 1.4)) * 1000;
    TIMERS.push(setTimeout(() => {
      if (ok() && G.phase === 'answer' && c.ans == null) { c.ans = c.pending; setBoard(c, '✓', 'lock', true); SFX.lock(); }
    }, at));
  });
  await runTimer(T, id); if (!ok()) return;

  G.phase = 'closed';
  optEls.forEach(b => b.disabled = true);
  alive.forEach(c => { if (!c.me && c.ans == null) { c.ans = c.pending; setBoard(c, '✓', 'lock'); } });
  if (me.alive && me.ans == null) setBoard(me, '–', 'none');
  SFX.buzzer(); splash('마감!');
  say(pick(['그만! 정답을 공개합니다!', '시간 종료! 자, 답을 들어주세요!', '마감입니다! 모두 답판을 들어주세요!']));
  await wait(1200); if (!ok()) return;

  for (const c of alive) {
    setBoard(c, label(q, c.ans), c.ans == null ? 'none' : 'lock', true); SFX.flip();
    await wait(45); if (!ok()) return;
  }
  await wait(600); if (!ok()) return;

  el.opts.classList.add('done');
  optEls[q.correct].classList.add('correct');
  if (me.alive && me.ans != null && me.ans !== q.correct) optEls[me.ans].classList.add('wrongpick');
  SFX.ding();
  say(q.ox ? `정답은 '${q.opts[q.correct]}'입니다!` : `정답은 ${q.correct + 1}번, '${q.opts[q.correct]}'입니다!`, 'happy');
  alive.forEach(c => setBoard(c, label(q, c.ans), c.ans === q.correct ? 'ok' : 'ng'));
  if (me.alive) {
    if (me.ans != null) G.answered++;
    if (me.ans === q.correct) { G.correct++; G.survived++; splash('정답!', 'good'); }
    else me.el.classList.add('hit');
  }
  await wait(1500); if (!ok()) return;

  const wrong = alive.filter(c => c.ans !== q.correct);
  if (wrong.length === alive.length) {
    if (me.alive) G.survived++;
    splash('전원 생존!'); SFX.cheer();
    say(pick(['이런! 전원 오답입니다! 이번엔 모두 살려드릴게요.', '아무도 못 맞혔네요! 전원 생존입니다!']), 'wow');
  } else if (wrong.length === 0) {
    SFX.cheer();
    say(pick(['와! 전원 정답입니다! 모두 살아남았어요.', '대단합니다! 한 명도 틀리지 않았어요!']), 'happy');
  } else {
    SFX.out();
    for (const c of wrong) { c.alive = false; c.el.classList.remove('hit'); c.el.classList.add('out'); await wait(40); if (!ok()) return; }
    const left = alive.length - wrong.length;
    updateAlive();
    say(`${wrong.length}명 탈락! 이제 ${left}명 남았습니다.` + (left === 2 ? ' 마지막 두 사람의 대결!' : ''), wrong.length >= alive.length / 2 ? 'wow' : '');
    if (wrong.includes(me)) {
      G.justOut = true; G.rank = left + 1;
      await wait(500); if (!ok()) return;
      splash('탈락…', 'bad'); SFX.sad();
    }
  }
  me.el.classList.remove('hit');
  await wait(1700);
}

/* ───────── 패자부활전 ───────── */
async function revival(id) {
  const ok = () => GID === id;
  const me = G.cs[ME];
  const q = pickRevival();
  if (!q) return false;
  G.revUsed = true; G.revMode = true; G.q = q; G.phase = 'intro'; me.ans = null;
  setHead(q); el.qno.textContent = '패자부활전';
  el.opts.innerHTML = ''; el.qtext.className = 'qtext idle'; el.qtext.textContent = '패자부활 문제를 준비하고 있습니다…';
  setTimerUI(1, 8);
  splash('패자부활전'); SFX.intro();
  say('패자부활 찬스! 이 문제를 맞히면 다시 무대로 돌아옵니다!', 'wow');
  await wait(1900); if (!ok()) return false;
  await typeText(q.text, ok); if (!ok()) return false;
  renderOpts(q); await wait(60); if (!ok()) return false;
  el.opts.classList.add('show'); optEls.forEach(b => b.disabled = false);
  G.phase = 'answer';
  await runTimer(8, id); if (!ok()) return false;
  G.phase = 'closed'; optEls.forEach(b => b.disabled = true);
  SFX.buzzer(); await wait(900); if (!ok()) return false;
  el.opts.classList.add('done'); optEls[q.correct].classList.add('correct');
  if (me.ans != null && me.ans !== q.correct) optEls[me.ans].classList.add('wrongpick');
  G.revMode = false;
  const won = me.ans === q.correct;
  if (won) {
    me.alive = true; me.el.classList.remove('out'); G.rank = null; updateAlive();
    setBoard(me, '?', '');
    splash('부활!', 'good'); SFX.fanfare();
    say('축하합니다! 부활에 성공했어요! 다시 무대로 돌아오세요!', 'happy');
  } else {
    splash('부활 실패', 'bad'); SFX.sad();
    say('아쉽습니다! 부활에 실패했어요.');
  }
  await wait(2000);
  return won;
}

/* ───────── 탈락 후 선택 ───────── */
function outPrompt(left) {
  return new Promise(res => {
    const canRev = !G.revUsed && left >= 4;
    $('outDesc').innerHTML = `<b style="color:#ffd23f">${TOTAL}명 중 ${G.rank}위</b>로 탈락했어요.<br>남은 참가자는 ${left}명입니다.` +
      (canRev ? '<br><br>🔁 <b>패자부활 찬스</b>가 남아 있어요!<br>한 문제를 맞히면 다시 무대로 돌아옵니다.' : '');
    const box = $('outBtns'); box.innerHTML = '';
    const add = (t, cls, v) => { const b = document.createElement('button'); b.className = 'btn sm ' + cls; b.textContent = t;
      b.onclick = () => { $('ovOut').classList.remove('show'); res(v); }; box.appendChild(b); };
    if (canRev) add('패자부활 도전', 'pink', 'revive');
    add('끝까지 지켜보기', 'sub', 'watch');
    add('다시 도전', '', 'restart');
    $('ovOut').classList.add('show');
  });
}

/* ───────── 진행 루프 ───────── */
async function loop(id) {
  const ok = () => GID === id;
  updateAlive();
  splash('두뇌<br>서바이벌'); SFX.intro();
  say('두뇌 서바이벌에 오신 것을 환영합니다! 20명 중 최후의 1인은 누구일까요?', 'happy');
  await wait(2800); if (!ok()) return;

  while (true) {
    const alive = aliveList();
    if (alive.length <= 1 || G.qn >= MAXQ) return finish(alive, id);
    const q = pickQuestion(alive.length);
    if (!q) return finish(alive, id);
    G.qn++;
    await askQuestion(q, id); if (!ok()) return;

    if (G.justOut) {
      G.justOut = false;
      const left = aliveList().length;
      if (left > 1) {
        let ch = await outPrompt(left); if (!ok()) return;
        if (ch === 'revive') {
          const won = await revival(id); if (!ok()) return;
          if (!won) { ch = await outPrompt(aliveList().length); if (!ok()) return; }
        }
        if (ch === 'restart') { newGame(); return; }
        if (ch === 'watch') { G.spectate = true; el.specBar.classList.add('show'); }
      }
    }
  }
}

async function finish(alive, id) {
  const ok = () => GID === id;
  G.phase = 'end'; el.specBar.classList.remove('show');
  const me = G.cs[ME];
  el.qno.textContent = '최종 결과'; el.stars.innerHTML = '';
  el.opts.innerHTML = ''; el.qtext.className = 'qtext idle';
  if (alive.length === 1) {
    const w = alive[0];
    w.el.classList.add('win'); w.el.insertAdjacentHTML('beforeend', '<span class="crown">👑</span>');
    el.qtext.textContent = `최후의 1인: ${w.me ? '나' : w.name}`;
    splash('최후의 1인!'); SFX.fanfare();
    say(w.me ? '축하합니다! 오늘의 최후의 1인은 바로 당신입니다!' : `오늘의 최후의 1인은 '${w.name}' 님입니다! 축하합니다!`, 'happy');
  } else {
    alive.forEach(c => c.el.classList.add('win'));
    el.qtext.textContent = `${alive.length}명 공동 우승!`;
    splash('공동 우승!'); SFX.fanfare();
    say(`끝까지 살아남은 ${alive.length}명 모두 공동 우승입니다! 축하합니다!`, 'happy');
  }
  await wait(G.spectate ? 4000 : 3000); if (!ok()) return;

  const rank = me.alive ? 1 : G.rank;
  const win = me.alive;
  const best = store.get('best', null), wins = store.get('wins', 0) + (win ? 1 : 0);
  const newBest = best == null || rank < best;
  if (newBest) store.set('best', rank);
  store.set('wins', wins);
  store.set('plays', store.get('plays', 0) + 1);

  $('resTitle').textContent = win ? (alive.length === 1 ? '🏆 최후의 1인!' : '🏆 공동 우승!') : `${rank}위`;
  $('resTitle').className = 'big' + (win ? '' : ' bad');
  $('resDesc').innerHTML = win ? '20명과의 두뇌 대결에서 끝까지 살아남았어요!'
    : rank <= 3 ? '아깝다! 우승이 코앞이었어요.' : rank <= 10 ? '잘 버텼어요! 다음엔 더 높이 가 봐요.' : '아쉽네요! 다시 도전해 볼까요?';
  $('stRank').textContent = `${rank}위`;
  $('stSurv').textContent = `${G.survived}문제`;
  $('stRate').textContent = G.answered ? Math.round(G.correct / G.answered * 100) + '%' : '-';
  $('resBest').textContent = (newBest ? '🎉 최고 기록 경신! ' : '') + `최고 순위 ${Math.min(rank, best ?? rank)}위 · 우승 ${wins}회`;
  $('ovResult').classList.add('show');
}

/* ───────── 새 게임 ───────── */
function newGame() {
  GID++; clearTimers(); ledFast = false;
  ['ovTitle', 'ovOut', 'ovResult'].forEach(i => $(i).classList.remove('show'));
  el.specBar.classList.remove('show');
  const names = shuffle(NAMES.slice());
  G = { id: GID, qn: 0, used: new Set(), lastCats: [], cs: [], spectate: false, revUsed: false, revMode: false,
    correct: 0, answered: 0, survived: 0, rank: null, phase: 'idle', q: null, justOut: false, tEnd: 0, tTotal: 1 };
  for (let i = 0; i < TOTAL; i++) {
    const me = i === ME;
    G.cs.push({ i, me, name: me ? '나' : names.pop(), skill: me ? 0 : rnd() * .22 - .12, alive: true, ans: null, pending: null,
      look: { skin: pick(SKIN), hair: ri(HAIR.length), hc: pick(HAIRC), shirt: pick(SHIRT) } });
  }
  buildStage();
  el.chip.textContent = '두뇌 서바이벌'; el.chip.style.background = '';
  el.qno.textContent = '녹화 시작'; el.stars.innerHTML = '';
  el.opts.innerHTML = ''; el.qtext.className = 'qtext idle'; el.qtext.textContent = '곧 첫 문제가 시작됩니다!';
  setTimerUI(1, 10);
  loop(GID);
}

/* 대기 화면용 무대 */
function idleStage() {
  const names = shuffle(NAMES.slice());
  G = { cs: [], spectate: false };
  for (let i = 0; i < TOTAL; i++) G.cs.push({ i, me: i === ME, name: i === ME ? '나' : names.pop(), alive: true, look: randLook() });
  buildStage(); G = null;
}

/* ───────── 버튼 ───────── */
function refreshBest() {
  const best = store.get('best', null), wins = store.get('wins', 0), plays = store.get('plays', 0);
  $('bestTxt').textContent = plays ? `내 기록: 최고 ${best}위 · 우승 ${wins}회 · ${plays}판 도전` : '처음 오셨군요! 20명과 실력을 겨뤄 보세요.';
}
function setMute(m) { muted = m; store.set('mute', m); $('muteBtn').textContent = m ? '🔇' : '🔊'; }
$('muteBtn').onclick = () => { setMute(!muted); if (!muted) { ac(); SFX.click(); } };
$('startBtn').onclick = () => { ac(); newGame(); };
$('againBtn').onclick = () => newGame();
$('specRestart').onclick = () => newGame();
function goHome() {
  GID++; clearTimers(); G = null; BS.mode = 'single'; ledFast = false;
  ['ovResult', 'ovOut'].forEach(i => $(i).classList.remove('show'));
  el.specBar.classList.remove('show');
  el.chip.textContent = '두뇌 서바이벌'; el.chip.style.background = ''; el.stars.innerHTML = ''; setTimerUI(1, 10);
  refreshBest(); idleStage(); updateAliveN(TOTAL);
  el.qno.textContent = '대기 중'; el.qtext.className = 'qtext idle'; el.qtext.textContent = '곧 첫 문제가 시작됩니다!'; el.opts.innerHTML = '';
  say('두뇌 서바이벌에 오신 것을 환영합니다!');
  $('ovTitle').classList.add('show');
}
$('homeBtn').onclick = goHome;
function updateAliveN(n) { el.aliveN.textContent = n; }
$('onlineBtn').onclick = () => { ac(); if (BS.onlineStart) BS.onlineStart(); };

/* 함께 하기(online.js)와 공유하는 기능 */
const BS = window.BS = {
  mode: 'single', el, SFX, CATS, NAMES, TOTAL, MAXQ, store, rnd, ri, pick, shuffle, esc, ac,
  say, splash, buildStage, setBoard, renderOpts, setHead, setTimerUI, label, chooseQuestion, aiPickSkill, randLook,
  idleStage, goHome, updateAliveN, refreshBest,
  opts: () => optEls,
  setLedFast: v => { ledFast = v; },
  isMuted: () => muted
};

setMute(muted);
refreshBest();
idleStage();
})();