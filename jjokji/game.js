/*!
 * 쪽지 돌리기 (Secret Note) v2.0 - 혼자 하기 + 같이 하기
 * © 2026 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 * 무단 복제·수정·재배포를 금지합니다.
 */
(function () {
  'use strict';
  const W = 900, H = 760;
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const $ = id => document.getElementById(id);
  let SC = 1;

  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.style.width = Math.floor(W * s) + 'px';
    cvs.style.height = Math.floor(H * s) + 'px';
    cvs.width = Math.round(W * s * dpr);
    cvs.height = Math.round(H * s * dpr);
    SC = cvs.width / W;
  }
  addEventListener('resize', fit);
  fit();

  // ---------- 유틸 ----------
  const R = (a, b) => a + Math.random() * (b - a);
  const RI = n => Math.floor(Math.random() * n);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // ---------- 소리 (sound.js) ----------
  const S = window.JJ_SND;
  const AU = { muted: store('jj_mute') === '1', music: store('jj_music') !== '0' };
  S.setMuted(AU.muted); S.setMusic(AU.music);
  function ac() { S.init(); }

  // ---------- 데이터 ----------
  const NAMES = ['철수', '영희', '민수', '순이', '길동', '똘이', '말순', '영구', '덕배', '춘자', '복동', '꽃님'];
  const HAIR = ['#3b2a20', '#1f1f2e', '#6b3e1f', '#2d2d2d', '#8a4b2a'];
  const SHIRT = ['#5b8def', '#ef6b6b', '#5cc08a', '#f2b134', '#a77bd9', '#4fc3c9', '#f28fb6', '#8d99ae'];
  const SKIN = ['#ffd9b8', '#f7c9a0', '#ffe0c4'];
  const LESSONS = ['바른 생활 3단원', '1. 차례를 지켜요', '2. 수업 시간엔 조용히', '3. 쪽지 돌리지 않기!', '받아쓰기: 가나다라', '구구단 7 × 8 = 56', '숙제: 일기 2쪽 쓰기'];
  const CHALK_FONT = '700 25px Gaegu, "Nanum Pen Script", sans-serif';
  const READ_TIME = 1.0, FLY_TIME = 0.6, TIME_LIMIT = 150, NET_GRACE = 0.25;

  let G = null, RT = 0;
  const MSG = { text: '', until: 0 };
  function addMsg(t, d) { MSG.text = t; MSG.until = RT + (d || 1.8); }

  // 자리 배정표: humans = [{u, nm}] → 6자리(사람 6명 이하) 또는 8자리
  function buildRoster(humans) {
    const total = humans.length > 6 ? 8 : 6;
    const used = new Set(humans.map(h => String(h.nm).split(' ').pop()));
    const names = shuffle(NAMES.filter(n => !used.has(n)));
    const personas = shuffle(JJ_AI.ORDER.slice());
    const order = shuffle([...Array(total).keys()]);
    const shirts = shuffle([...Array(SHIRT.length).keys()]);
    const roster = new Array(total);
    humans.forEach((h, i) => { roster[order[i]] = { u: h.u, nm: h.nm, p: '' }; });
    let pi = 0, ni = 0;
    for (let i = 0; i < total; i++) if (!roster[i]) roster[i] = { u: '', nm: names[ni++ % names.length], p: personas[pi++ % personas.length] };
    roster.forEach((r, i) => { r.h = RI(HAIR.length); r.sh = shirts[i % shirts.length]; r.sk = RI(SKIN.length); r.g = Math.random() < 0.5 ? 1 : 0; });
    return roster;
  }

  // role: 'solo' | 'host' | 'client'
  function newGame(roster, me, role) {
    const total = roster.length, cols = total > 6 ? 4 : 3, rows = 2, gap = cols === 4 ? 200 : 250;
    const seats = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) seats.push({ c, r, x: 450 + (c - (cols - 1) / 2) * gap, y: 395 + r * 160 });
    const students = roster.map((r, i) => ({
      id: i, seat: i, name: i === me ? '나' : r.nm, uid: r.u || '', persona: r.p || null, human: !r.p, me: i === me,
      alive: true, score: 0, elimOrder: 0, elimAt: 0, mind: {},
      hair: HAIR[r.h % HAIR.length], shirt: SHIRT[r.sh % SHIRT.length], skin: SKIN[r.sk % SKIN.length], girl: !!r.g, bob: Math.random() * 6
    }));
    G = {
      role, mode: 'title', now: -3.4, cd: 3.4, startAt: 0, total, cols, rows, seats, students, me,
      note: { holder: null, flight: null, last: null, lockUntil: 0, giver: null, k: 0 },
      teacher: { state: 'write', since: 0, nextAt: 0, turnAt: 0, fake: false, tell: null, catchId: null, bubble: null, bubbleUntil: 0, judged: false },
      board: { lines: ['오늘의 공부: 눈치'], cur: '', li: 0, ci: 0, nextChar: 0 },
      culprits: [], elimCount: 0, parts: [], shake: 0, tx: 380, handX: 420, handY: 100, lastCd: 4,
      over: null, dirty: false, lastPush: -99, pendingUntil: -99
    };
  }
  const auth = () => G.role !== 'client';
  const dispName = id => (G.students[id] ? (G.students[id].me ? '나' : G.students[id].name.split(' ').pop()) : '');

  // ---------- 이벤트(소리·메시지·효과) ----------
  function emit(type, a) { playEvent(type, a); if (G.role === 'host') G.dirty = true; }
  function playEvent(type, a) {
    const quiet = document.hidden;
    if (type === 'tell') {
      if (quiet) return;
      if (a === 'cough') S.cough(); else if (a === 'shoulder') S.hum(); else S.chalkDown();
    } else if (type === 'turn') { if (!quiet) S.turn(); }
    else if (type === 'toss') { if (!quiet) S.toss(); }
    else if (type === 'land') {
      if (quiet) return;
      S.land();
      if (G.students[a] && G.students[a].me) { S.receive(); addMsg('쪽지가 왔다! 1초만 읽고 넘기자', 1.2); }
    } else if (type === 'spawn') {
      if (!quiet) S.receive();
      const s = G.students[a];
      addMsg(s && s.me ? '새 쪽지가 나한테 왔다!' : '새 쪽지가 돌기 시작했어요');
    } else if (type === 'start') { if (!quiet) S.bell(false); }
    else if (type === 'catch') {
      const s = G.students[a]; if (!s) return;
      if (!quiet) S.caught();
      G.shake = 0.45;
      const p = G.seats[s.seat];
      for (let i = 0; i < 10; i++) G.parts.push({ x: p.x, y: p.y - 100, vx: R(-160, 160), vy: R(-260, -80), life: 0.9, col: pick(['#ffd54a', '#ff7b7b', '#fff']) });
      if (s.me) {
        setTimeout(() => S.lose(), 650);
        setTimeout(() => {
          if (G.mode !== 'play') return;
          $('outRank').textContent = '현재 ' + (alive().length + 1) + '등 · 다른 친구들의 눈치 싸움을 지켜볼까요?';
          $('out').classList.remove('hide');
        }, 1300);
      } else addMsg(dispName(a) + ' 걸렸다!', 1.6);
    }
  }

  // ---------- 규칙 ----------
  const alive = () => G.students.filter(s => s.alive);
  function seatOcc(c, r) {
    const s = G.students.find(st => st.alive && G.seats[st.seat].c === c && G.seats[st.seat].r === r);
    return s ? s.id : null;
  }
  function dirTargets(id) {
    const sp = G.seats[G.students[id].seat], d = {};
    let o;
    for (let c = sp.c - 1; c >= 0; c--) if ((o = seatOcc(c, sp.r)) != null) { d.left = o; break; }
    for (let c = sp.c + 1; c < G.cols; c++) if ((o = seatOcc(c, sp.r)) != null) { d.right = o; break; }
    for (let r = sp.r - 1; r >= 0; r--) if ((o = seatOcc(sp.c, r)) != null) { d.up = o; break; }
    for (let r = sp.r + 1; r < G.rows; r++) if ((o = seatOcc(sp.c, r)) != null) { d.down = o; break; }
    if (!Object.keys(d).length) { // 고립되면 가장 가까운 친구에게
      let best = null, bd = 1e9;
      for (const s of alive()) {
        if (s.id === id) continue;
        const p = G.seats[s.seat], dd = Math.hypot(p.x - sp.x, p.y - sp.y);
        if (dd < bd) { bd = dd; best = s.id; }
      }
      if (best != null) {
        const p = G.seats[G.students[best].seat], dx = p.x - sp.x, dy = p.y - sp.y;
        d[Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')] = best;
      }
    }
    return d;
  }
  function validTargets(id) {
    let ids = [...new Set(Object.values(dirTargets(id)))];
    if (ids.length > 1 && G.note.giver != null) ids = ids.filter(x => x !== G.note.giver);
    return ids;
  }
  function canPassAt(id, at) {
    const N = G.note, T = G.teacher;
    if (G.mode !== 'play' || N.holder !== id || N.flight) return false;
    if (at < N.lockUntil - 0.05) return false;
    if (T.state === 'look' && (T.judged || at >= T.since)) return false;
    return true;
  }
  const canPass = id => canPassAt(id, G.now);
  function passNote(from, to, at) {
    if (at == null) at = G.now;
    if (!canPassAt(from, at) || !validTargets(from).includes(to)) return false;
    const N = G.note;
    const t0 = Math.min(G.now, Math.max(at, G.now - 0.4, N.lockUntil));
    N.holder = null; N.giver = from;
    N.flight = { from, to, t0, dur: FLY_TIME };
    emit('toss');
    return true;
  }
  function spawnNote() {
    const s = pick(alive());
    const N = G.note;
    N.holder = s.id; N.giver = null; N.flight = null; N.last = null; N.lockUntil = G.now + READ_TIME; N.k++;
    emit('spawn', s.id);
  }
  function interval() {
    const a = alive().length;
    return R(12, 20) * (0.55 + 0.45 * a / G.total);
  }
  function startPlay() {
    G.mode = 'play';
    if (auth()) { G.teacher.nextAt = G.now + R(7, 11); spawnNote(); }
    emit('start');
  }

  function doCatch() {
    const N = G.note, T = G.teacher, L = T.since;
    const f = N.flight, lf = N.last;
    let cid;
    if (f) cid = f.t0 + f.dur <= L ? f.to : f.from;
    else if (lf && lf.t0 <= L && lf.t0 + lf.dur > L) cid = lf.from;
    else cid = N.holder;
    N.flight = null; N.holder = null; N.last = null;
    T.judged = true;
    if (cid == null || !G.students[cid].alive) { T.catchId = null; T.bubble = '음, 조용하군.'; T.bubbleUntil = G.now + 1.5; G.dirty = true; return; }
    const s = G.students[cid];
    s.alive = false; s.elimOrder = ++G.elimCount; s.elimAt = G.now;
    T.catchId = cid; T.bubble = '@catch'; T.bubbleUntil = G.now + 2.0;
    G.culprits.push(cid);
    emit('catch', cid);
  }

  function updateTeacher() {
    const T = G.teacher, now = G.now;
    const grace = G.role === 'solo' ? 0 : NET_GRACE;
    if (T.state === 'write') {
      if (now >= T.nextAt) {
        const f = alive().length / G.total;
        T.fake = Math.random() < 0.15 + 0.25 * (1 - f);
        T.tell = pick(['chalk', 'cough', 'shoulder']);
        T.state = 'tell'; T.since = now;
        T.turnAt = now + Math.max(0.6, R(0.8, 1.5) * (0.7 + 0.3 * f));
        if (T.tell === 'cough') { T.bubble = '에헴!'; T.bubbleUntil = now + 0.8; }
        emit('tell', T.tell);
      }
    } else if (T.state === 'tell') {
      if (now >= T.turnAt) { T.state = T.fake ? 'fake' : 'turn'; T.since = now; emit('turn'); }
    } else if (T.state === 'fake') {
      if (now - T.since > 0.7) { T.state = 'write'; T.since = now; T.nextAt = now + R(3, 7); T.bubble = '흠…'; T.bubbleUntil = now + 0.8; G.dirty = true; }
    } else if (T.state === 'turn') {
      if (now - T.since >= 0.22) { T.state = 'look'; T.since = now; T.judged = false; T.catchId = null; G.dirty = true; }
    } else if (T.state === 'look') {
      if (!T.judged && now >= T.since + grace) doCatch();
      if (now - T.since >= 2.2 + grace) {
        if (alive().length <= 1) { endGame('last'); return; }
        T.state = 'write'; T.since = now; T.catchId = null; T.nextAt = now + interval();
        spawnNote();
      }
    }
  }

  function updateNote() {
    const N = G.note, f = N.flight;
    if (f && G.now - f.t0 >= f.dur) {
      N.flight = null; N.last = f;
      if (G.students[f.to].alive) {
        N.holder = f.to; N.lockUntil = f.t0 + f.dur + READ_TIME;
        emit('land', f.to);
      }
    }
  }

  function updateAI() {
    const st = G.teacher.state;
    const alarm = st === 'tell' || st === 'fake' || st === 'turn';
    const holder = G.note.flight ? null : G.note.holder;
    for (const s of G.students) {
      if (!s.alive || s.human) continue;
      const t = JJ_AI.think(s, {
        now: G.now, holder, alarm, canPass: canPass(s.id), targets: validTargets(s.id),
        isHuman: id => G.students[id].human && G.students[id].alive,
        score: id => G.students[id].score
      });
      if (t != null) passNote(s.id, t);
    }
  }

  function updateBoard() {
    const T = G.teacher, B = G.board;
    const writing = T.state === 'write' || (T.state === 'tell' && T.tell !== 'chalk');
    if (!writing || G.now < B.nextChar) return;
    const line = LESSONS[B.li % LESSONS.length];
    if (B.ci < line.length) {
      B.cur = line.slice(0, ++B.ci);
      B.nextChar = G.now + R(0.12, 0.24);
      if (line[B.ci - 1] !== ' ' && G.mode === 'play' && !document.hidden) S.chalk();
    } else {
      B.lines.push(B.cur); if (B.lines.length > 3) B.lines.shift();
      B.cur = ''; B.ci = 0; B.li++; B.nextChar = G.now + 0.9;
    }
  }

  function rankList() {
    const al = alive().sort((a, b) => b.score - a.score);
    const el = G.students.filter(s => !s.alive).sort((a, b) => b.elimOrder - a.elimOrder);
    return al.concat(el);
  }
  function endGame(why) {
    if (G.mode === 'over') return;
    G.mode = 'over'; G.over = why; G.dirty = true;
    $('out').classList.add('hide');
    if (G.role === 'host') { JJ_NET.pushState(makeSnap()); JJ_NET.endRoom(); }
    const rank = rankList();
    const me = G.students[G.me], myRank = rank.indexOf(me) + 1;
    S.bell(true);
    if (myRank === 1) { S.win(); store('jj_wins', String((+store('jj_wins') || 0) + 1)); }
    const sc = Math.floor(me.score);
    if (sc > (+store('jj_best') || 0)) store('jj_best', String(sc));
    setTimeout(() => showResult(rank, myRank, why), 1100);
  }

  function showResult(rank, myRank, why) {
    const me = G.students[G.me];
    $('resTitle').textContent = myRank === 1 ? '우승! 끝까지 살아남았어요' : me.alive ? '생존! ' + myRank + '등' : myRank + '등 · 복도에서 벌 서는 중';
    $('resWhy').textContent = why === 'time' ? '종이 울렸어요! 살아남은 친구끼리는 낙서 점수로 순위를 정해요.' : '마지막 한 명만 교실에 남았어요.';
    $('resList').innerHTML = rank.map((s, i) => {
      const label = s.me ? '나' : s.human ? s.name + ' (친구)' : JJ_AI.PERSONAS[s.persona].label + ' ' + s.name;
      return '<div class="row' + (s.me ? ' me' : '') + '"><span>' + (i + 1) + '등 · ' + label + '</span><span class="st">' +
        (s.alive ? '생존' : '복도') + ' · 낙서 ' + Math.floor(s.score) + '</span></div>';
    }).join('');
    $('result').classList.remove('hide');
  }

  // ---------- 상태 주고받기 (같이 하기) ----------
  function makeSnap() {
    const N = G.note, T = G.teacher, f = N.flight, l = N.last;
    return {
      n: { h: N.holder == null ? -1 : N.holder, g: N.giver == null ? -1 : N.giver, lu: N.lockUntil, k: N.k,
        f: f ? [f.from, f.to, f.t0] : 0, l: l ? [l.from, l.to, l.t0] : 0 },
      T: { st: T.state, si: T.since, na: T.nextAt, ta: T.turnAt, fk: T.fake ? 1 : 0, tl: T.tell || '', c: T.catchId == null ? -1 : T.catchId,
        b: T.bubble || '', bu: T.bubbleUntil, j: T.judged ? 1 : 0 },
      a: G.students.map(s => (s.alive ? 1 : 0)), eo: G.students.map(s => s.elimOrder), ea: G.students.map(s => s.elimAt),
      sc: G.students.map(s => Math.round(s.score * 10) / 10), p: G.students.map(s => s.persona || ''),
      ec: G.elimCount, cul: G.culprits.length ? G.culprits : 0, ov: G.over || ''
    };
  }
  function applySnap(s, silent) {
    if (!G || !s || !s.n || !s.T) return;
    const N = G.note, T = G.teacher;
    const prevSt = T.state, prevEc = G.elimCount, prevK = N.k, prevF = N.flight, prevH = N.holder;
    N.holder = s.n.h < 0 ? null : s.n.h; N.giver = s.n.g < 0 ? null : s.n.g; N.lockUntil = s.n.lu; N.k = s.n.k;
    N.flight = s.n.f ? { from: s.n.f[0], to: s.n.f[1], t0: s.n.f[2], dur: FLY_TIME } : null;
    N.last = s.n.l ? { from: s.n.l[0], to: s.n.l[1], t0: s.n.l[2], dur: FLY_TIME } : null;
    T.state = s.T.st; T.since = s.T.si; T.nextAt = s.T.na; T.turnAt = s.T.ta; T.fake = !!s.T.fk; T.tell = s.T.tl || null;
    T.catchId = s.T.c < 0 ? null : s.T.c; T.bubble = s.T.b || null; T.bubbleUntil = s.T.bu; T.judged = !!s.T.j;
    G.students.forEach((st, i) => {
      st.alive = !!s.a[i]; st.elimOrder = s.eo[i] || 0; st.elimAt = s.ea[i] || 0; st.score = s.sc[i] || 0;
      if (s.p) { st.persona = s.p[i] || null; st.human = !st.persona; }
    });
    G.elimCount = s.ec || 0; G.culprits = s.cul || [];
    if (!silent && G.mode === 'play') {
      if (T.state !== prevSt) {
        if (T.state === 'tell') playEvent('tell', T.tell);
        else if (T.state === 'turn' || T.state === 'fake') playEvent('turn');
      }
      if (G.elimCount > prevEc) playEvent('catch', T.catchId);
      if (N.flight && (!prevF || prevF.t0 !== N.flight.t0)) playEvent('toss');
      if (N.k !== prevK) playEvent('spawn', N.holder);
      else if (N.holder != null && N.holder !== prevH && prevF) playEvent('land', N.holder);
    }
    if (s.ov && G.mode === 'play') endGame(s.ov);
  }

  window.JJ_GAME = {
    buildRoster,
    beginMulti(o) {
      ac();
      newGame(o.roster, o.me, o.host ? 'host' : 'client');
      G.startAt = o.startAt; G.mode = 'countdown'; lastMode = 'multi';
      ['title', 'out', 'result'].forEach(id => $(id).classList.add('hide'));
    },
    onSnap(s) { if (G && G.role === 'client') applySnap(s); },
    onReq(r) {
      if (!G || G.role !== 'host' || !r) return;
      const s = G.students.find(st => st.uid && st.uid === r.u);
      if (s && s.alive) passNote(s.id, r.to, r.at);
    },
    becomeHost(snap) {
      if (!G || G.role === 'solo') return;
      if (snap) applySnap(snap, true);
      G.role = 'host'; G.dirty = true;
      G.students.forEach(s => { s.mind = {}; });
    },
    becomeClient() { if (G && G.role === 'host') G.role = 'client'; },
    onLeft(seat) {
      if (!G || G.role !== 'host' || !G.students[seat]) return;
      const s = G.students[seat];
      s.persona = 'dreamy'; s.human = false; s.mind = {}; G.dirty = true;
      addMsg(s.name.split(' ').pop() + ' 친구가 나가서 AI가 대신해요', 2);
    },
    home: () => home(),
    _dbg() {
      if (!G) return null;
      return { role: G.role, mode: G.mode, now: +(+G.now).toFixed(2), h: G.note.holder, f: !!G.note.flight, st: G.teacher.state,
        alive: G.students.map(s => (s.alive ? 1 : 0)).join(''), human: G.students.map(s => (s.human ? 1 : 0)).join(''), ec: G.elimCount, me: G.me, total: G.total };
    }
  };
  // ---------- 그리기 ----------
  function drawRoom() {
    let g = ctx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, '#f8eed6'); g.addColorStop(1, '#eedbb2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 300);
    ctx.fillStyle = '#c39a68'; ctx.fillRect(0, 294, W, 8);
    ctx.fillStyle = '#d9a96c'; ctx.fillRect(0, 302, W, 348);
    ctx.strokeStyle = 'rgba(120,70,30,.18)'; ctx.lineWidth = 2;
    for (let y = 332; y < 650; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // 창문
    ctx.fillStyle = '#8b5a2b'; rr(22, 36, 128, 136, 8); ctx.fill();
    const sg = ctx.createLinearGradient(0, 44, 0, 164);
    sg.addColorStop(0, '#8fd3ff'); sg.addColorStop(1, '#e3f6ff');
    ctx.fillStyle = sg; rr(30, 44, 112, 120, 4); ctx.fill();
    ctx.fillStyle = '#fff';
    const cx = 40 + ((RT * 6) % 120);
    circ(cx, 76, 11); ctx.fill(); circ(cx + 13, 72, 14); ctx.fill(); circ(cx + 27, 77, 10); ctx.fill();
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(86, 44); ctx.lineTo(86, 164); ctx.moveTo(30, 104); ctx.lineTo(142, 104); ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7a5a38'; ctx.font = '18px Jua, sans-serif';
    ctx.fillText('남은 친구', 86, 200);
    ctx.fillStyle = '#c0392b'; ctx.font = '34px Jua, sans-serif';
    ctx.fillText(alive().length + '명', 86, 234);

    // 시계
    const left = G.mode === 'play' || G.mode === 'over' ? Math.max(0, TIME_LIMIT - G.now) : TIME_LIMIT;
    ctx.fillStyle = '#8b5a2b'; circ(815, 76, 44); ctx.fill();
    ctx.fillStyle = '#fffdf5'; circ(815, 76, 37); ctx.fill();
    ctx.strokeStyle = '#4a3320'; ctx.lineCap = 'round';
    const ang = -Math.PI / 2 + (1 - left / TIME_LIMIT) * Math.PI * 2;
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(815, 76); ctx.lineTo(815 + Math.cos(-Math.PI / 2 + 1) * 18, 76 + Math.sin(-Math.PI / 2 + 1) * 18); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(815, 76); ctx.lineTo(815 + Math.cos(ang) * 30, 76 + Math.sin(ang) * 30); ctx.stroke();
    ctx.fillStyle = '#4a3320'; circ(815, 76, 4); ctx.fill();
    ctx.fillStyle = '#7a5a38'; ctx.font = '18px Jua, sans-serif'; ctx.fillText('남은 시간', 815, 140);
    const m = Math.floor(left / 60), s = Math.floor(left % 60);
    ctx.fillStyle = left < 20 ? '#c0392b' : '#4a3320'; ctx.font = '34px Jua, sans-serif';
    ctx.fillText(m + ':' + String(s).padStart(2, '0'), 815, 172);
    // 급훈
    ctx.fillStyle = '#8b5a2b'; rr(758, 200, 114, 50, 6); ctx.fill();
    ctx.fillStyle = '#fffdf5'; rr(764, 206, 102, 38, 4); ctx.fill();
    ctx.fillStyle = '#4a3320'; ctx.font = '20px Jua, sans-serif'; ctx.fillText('급훈: 정직', 815, 226);
  }

  function drawBoard() {
    const B = G.board;
    ctx.fillStyle = '#8b5a2b'; rr(160, 20, 580, 202, 10); ctx.fill();
    ctx.fillStyle = '#2f5d46'; rr(172, 30, 556, 180, 6); ctx.fill();
    ctx.fillStyle = '#7a4c22'; ctx.fillRect(165, 218, 570, 10);
    ctx.fillStyle = '#fff'; ctx.fillRect(250, 212, 18, 6); ctx.fillStyle = '#ffd54a'; ctx.fillRect(276, 212, 16, 6);
    ctx.font = CHALK_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    B.lines.forEach((l, i) => ctx.fillText(l, 190, 60 + i * 38));
    if (B.cur) ctx.fillText(B.cur, 190, 60 + B.lines.length * 38);
    G.handX = 196 + ctx.measureText(B.cur).width;
    G.handY = 64 + B.lines.length * 38;
    // 떠든 사람
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    rr(580, 40, 134, 160, 6); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffd54a'; ctx.fillText('떠든 사람', 647, 60);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = '700 21px Gaegu, "Nanum Pen Script", sans-serif';
    G.culprits.slice(-5).forEach((id, i) => ctx.fillText(dispName(id), 647, 90 + i * 26));
  }

  function limb(x1, y1, x2, y2, col, sk, chalk) {
    ctx.strokeStyle = col; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillStyle = sk; circ(x2, y2, 9); ctx.fill();
    if (chalk) { ctx.fillStyle = '#fff'; ctx.fillRect(x2 - 3, y2 - 15, 6, 12); }
  }

  function drawBubble(x, y, text) {
    ctx.font = '22px Jua, sans-serif';
    const w = ctx.measureText(text).width + 28;
    x = clamp(x, w / 2 + 6, W - w / 2 - 6);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#4a3320'; ctx.lineWidth = 3;
    rr(x - w / 2, y - 20, w, 40, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a3320'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  function drawTeacher() {
    const T = G.teacher, x = G.tx, base = 332;
    const sk = '#ffd9b8', suit = '#5f7a63', hair = '#2b2420';
    const j = T.state === 'tell' && T.tell === 'shoulder' ? Math.sin(RT * 55) * 3 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(x, base, 50, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3646'; rr(x - 26, base - 48, 20, 48, 5); ctx.fill(); rr(x + 6, base - 48, 20, 48, 5); ctx.fill();
    const view = T.state === 'look' ? 'front' : (T.state === 'turn' || T.state === 'fake') ? 'side' : 'back';
    const by = base - 132 + j, hy = by - 28;
    ctx.fillStyle = suit; rr(x - 44, by, 88, 92, 20); ctx.fill();

    if (view === 'back') {
      const stop = T.state === 'tell' && T.tell === 'chalk';
      const hx = stop ? x + 54 : G.handX + Math.sin(RT * 13) * 4;
      const hyy = stop ? by + 72 : G.handY + Math.cos(RT * 10) * 3;
      limb(x + 30, by + 14, hx, hyy, suit, sk, !stop);
      limb(x - 32, by + 14, x - 52, by + 74, suit, sk, false);
      ctx.fillStyle = sk; circ(x - 36, hy + 4, 8); ctx.fill(); circ(x + 36, hy + 4, 8); ctx.fill();
      ctx.fillStyle = hair; circ(x, hy, 36); ctx.fill();
      if (j) {
        ctx.strokeStyle = '#4a3320'; ctx.lineWidth = 3;
        [[-58, -6], [-64, 8], [58, -6], [64, 8]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.moveTo(x + dx, by + dy); ctx.lineTo(x + dx + (dx > 0 ? 10 : -10), by + dy - 4); ctx.stroke(); });
      }
    } else if (view === 'side') {
      limb(x + 30, by + 14, x + 48, by + 76, suit, sk, false);
      ctx.fillStyle = sk; circ(x + 4, hy, 35); ctx.fill(); circ(x + 40, hy + 8, 7); ctx.fill();
      ctx.fillStyle = hair;
      ctx.beginPath(); ctx.arc(x + 4, hy, 36, Math.PI * 0.55, Math.PI * 1.5); ctx.lineTo(x + 4, hy); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 4, hy - 6, 34, Math.PI * 1.08, Math.PI * 1.92); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 3; circ(x + 24, hy + 2, 10); ctx.stroke();
      ctx.fillStyle = '#222'; circ(x + 27, hy + 2, 3); ctx.fill();
    } else {
      ctx.fillStyle = sk; circ(x, hy, 36); ctx.fill();
      ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(x, hy - 6, 37, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
      circ(x - 14, hy + 6, 11); ctx.stroke(); circ(x + 14, hy + 6, 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 3, hy + 6); ctx.lineTo(x + 3, hy + 6); ctx.stroke();
      ctx.fillStyle = '#222'; circ(x - 14, hy + 7, 3); ctx.fill(); circ(x + 14, hy + 7, 3); ctx.fill();
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x - 26, hy - 12); ctx.lineTo(x - 6, hy - 5); ctx.moveTo(x + 26, hy - 12); ctx.lineTo(x + 6, hy - 5); ctx.stroke();
      ctx.fillStyle = '#7a2a2a'; ctx.beginPath(); ctx.ellipse(x, hy + 24, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
      if (T.catchId != null) {
        const p = G.seats[G.students[T.catchId].seat];
        const sy = by + 14, a = Math.atan2(p.y - 90 - sy, p.x - x);
        const sx = x + (Math.cos(a) >= 0 ? 30 : -30);
        const ex = sx + Math.cos(a) * 62, ey = sy + Math.sin(a) * 62;
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(a) * 70, ey + Math.sin(a) * 70); ctx.stroke();
        limb(sx, sy, ex, ey, suit, sk, false);
        limb(x - (Math.cos(a) >= 0 ? 30 : -30), sy, x - (Math.cos(a) >= 0 ? 48 : -48), by + 70, suit, sk, false);
      } else {
        limb(x + 30, by + 14, x + 48, by + 72, suit, sk, false);
        limb(x - 30, by + 14, x - 48, by + 72, suit, sk, false);
      }
    }
    if (T.bubble && G.now < T.bubbleUntil) {
      const txt = T.bubble === '@catch' ? (T.catchId == null ? '' : (G.students[T.catchId].me ? '너' : G.students[T.catchId].name) + '! 복도로 나가!') : T.bubble;
      if (txt) drawBubble(view === 'back' ? x - 110 : x + 120, hy - 40, txt);
    }
  }

  function drawFace(x, y, face) {
    ctx.strokeStyle = '#3a2a20'; ctx.fillStyle = '#3a2a20'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (face === 'sly') {
      ctx.beginPath(); ctx.arc(x - 10, y + 4, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 10, y + 4, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y + 10, 9, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else if (face === 'panic') {
      ctx.fillStyle = '#fff'; circ(x - 10, y + 2, 6); ctx.fill(); circ(x + 10, y + 2, 6); ctx.fill();
      ctx.fillStyle = '#3a2a20'; circ(x - 10, y + 2, 2.5); ctx.fill(); circ(x + 10, y + 2, 2.5); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y + 15, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7fd0ff'; ctx.beginPath(); ctx.moveTo(x + 24, y - 16); ctx.quadraticCurveTo(x + 31, y - 4, x + 24, y - 2); ctx.quadraticCurveTo(x + 17, y - 4, x + 24, y - 16); ctx.fill();
    } else if (face === 'read') {
      circ(x - 10, y + 7, 2.8); ctx.fill(); circ(x + 10, y + 7, 2.8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 5, y + 16); ctx.lineTo(x + 5, y + 16); ctx.stroke();
    } else if (face === 'sad') {
      ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 6, y + 4); ctx.moveTo(x + 14, y); ctx.lineTo(x + 6, y + 4); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y + 20, 7, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    } else {
      circ(x - 10, y + 3, 3); ctx.fill(); circ(x + 10, y + 3, 3); ctx.fill();
      if (face === 'still') { ctx.beginPath(); ctx.moveTo(x - 5, y + 14); ctx.lineTo(x + 5, y + 14); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(x, y + 9, 6, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(255,120,120,.35)'; circ(x - 18, y + 10, 5); ctx.fill(); circ(x + 18, y + 10, 5); ctx.fill();
  }

  function drawHead(s, x, y, face) {
    ctx.fillStyle = s.skin; circ(x, y, 28); ctx.fill();
    ctx.fillStyle = s.hair;
    ctx.beginPath(); ctx.arc(x, y - 3, 29, Math.PI * 1.02, Math.PI * 1.98); ctx.quadraticCurveTo(x + 10, y - 12, x, y - 8); ctx.quadraticCurveTo(x - 12, y - 14, x - 29, y - 4); ctx.fill();
    if (s.girl) {
      circ(x - 31, y + 4, 9); ctx.fill(); circ(x + 31, y + 4, 9); ctx.fill();
      ctx.fillStyle = '#ff6b8a'; circ(x - 25, y - 6, 4); ctx.fill(); circ(x + 25, y - 6, 4); ctx.fill();
    }
    drawFace(x, y, face);
  }

  function drawNotePaper(x, y, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.fillStyle = '#fffef6'; ctx.strokeStyle = '#b8a888'; ctx.lineWidth = 1.5;
    ctx.fillRect(-12, -8, 24, 16); ctx.strokeRect(-12, -8, 24, 16);
    ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(0, 1); ctx.lineTo(12, -8); ctx.stroke();
    ctx.fillStyle = '#ff6b8a'; circ(0, 3, 2.5); ctx.fill();
    ctx.restore();
  }

  function drawDesk(x, y, s, empty) {
    ctx.fillStyle = '#9c6a34'; ctx.fillRect(x - 70, y + 10, 8, 40); ctx.fillRect(x + 62, y + 10, 8, 40);
    ctx.fillStyle = '#b57a3e'; rr(x - 72, y + 10, 144, 28, 4); ctx.fill();
    ctx.fillStyle = '#d09455'; rr(x - 82, y - 10, 164, 24, 6); ctx.fill();
    const label = s.name + '  ' + Math.floor(s.score) + '점';
    ctx.font = '17px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = Math.max(100, ctx.measureText(label).width + 20);
    ctx.fillStyle = s.me ? '#ffd54a' : empty ? '#e2d6c0' : s.human ? '#bfe3ff' : '#f7ead0';
    rr(x - tw / 2, y + 13, tw, 24, 7); ctx.fill();
    ctx.fillStyle = empty ? '#9a8a75' : '#4a3320';
    ctx.fillText(label, x, y + 26);
  }

  function kidPos(s) {
    const p = G.seats[s.seat];
    const hall = { x: 170 + (s.elimOrder - 1) * Math.min(130, 690 / Math.max(1, G.total - 1)), y: 752 };
    const k = clamp((G.now - s.elimAt) / 1.2, 0, 1);
    return { x: lerp(p.x, hall.x, k), y: lerp(p.y + 30, hall.y, k), done: k >= 1, k };
  }

  function drawStanding(s, x, y, sc, armsUp) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.fillStyle = '#3a3646'; rr(-18, -40, 14, 40, 4); ctx.fill(); rr(4, -40, 14, 40, 4); ctx.fill();
    ctx.fillStyle = s.shirt; rr(-28, -96, 56, 60, 16); ctx.fill();
    ctx.strokeStyle = s.shirt; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath();
    if (armsUp) { ctx.moveTo(-22, -88); ctx.lineTo(-30, -150); ctx.moveTo(22, -88); ctx.lineTo(30, -150); }
    else { ctx.moveTo(-24, -86); ctx.lineTo(-32, -50); ctx.moveTo(24, -86); ctx.lineTo(32, -50); }
    ctx.stroke();
    ctx.fillStyle = s.skin;
    if (armsUp) { circ(-30, -152, 7); ctx.fill(); circ(30, -152, 7); ctx.fill(); }
    drawHead(s, 0, -122, 'sad');
    ctx.restore();
  }

  function drawClass() {
    const N = G.note, T = G.teacher;
    const alarm = T.state === 'tell' || T.state === 'turn' || T.state === 'fake';
    const meHold = G.mode === 'play' && N.holder === G.me && !N.flight;
    const targets = meHold ? validTargets(G.me) : [];
    const ok = meHold && canPass(G.me);
    for (let r = 0; r < G.rows; r++) {
      for (const s of G.students) {
        const p = G.seats[s.seat];
        if (p.r !== r) continue;
        if (!s.alive) {
          ctx.fillStyle = '#8a5a2a'; rr(p.x - 30, p.y - 54, 60, 46, 8); ctx.fill();
          drawDesk(p.x, p.y, s, true);
          continue;
        }
        if (s.me) { ctx.fillStyle = 'rgba(255,213,74,.28)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 40, 110, 22, 0, 0, Math.PI * 2); ctx.fill(); }
        const holding = N.holder === s.id && !N.flight;
        const locked = holding && G.now < N.lockUntil;
        let face = 'normal';
        if (holding) face = alarm ? 'panic' : locked ? 'read' : 'sly';
        else if (T.state === 'look') face = 'still';
        const bob = T.state === 'look' ? 0 : Math.sin(RT * 2 + s.bob) * 1.5;
        ctx.fillStyle = s.shirt; rr(p.x - 34, p.y - 62 + bob, 68, 64, 18); ctx.fill();
        drawHead(s, p.x, p.y - 88 + bob, face);
        drawDesk(p.x, p.y, s, false);
        ctx.fillStyle = s.skin;
        if (holding) {
          drawNotePaper(p.x, p.y - 4, Math.sin(RT * 3) * 0.1);
          circ(p.x - 16, p.y - 2, 8); ctx.fill(); circ(p.x + 16, p.y - 2, 8); ctx.fill();
        } else {
          circ(p.x - 26, p.y - 2, 8); ctx.fill(); circ(p.x + 26, p.y - 2, 8); ctx.fill();
        }
        if (locked) {
          const k = 1 - (N.lockUntil - G.now) / READ_TIME;
          ctx.strokeStyle = '#ffcf33'; ctx.lineWidth = 6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(p.x, p.y - 88, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
        }
        if (targets.includes(s.id)) {
          ctx.strokeStyle = ok ? '#2ecc71' : 'rgba(255,255,255,.7)'; ctx.lineWidth = 4; ctx.setLineDash([10, 6]);
          rr(p.x - 92, p.y - 128, 184, 176, 18); ctx.stroke(); ctx.setLineDash([]);
          if (ok) {
            const ay = p.y - 140 + Math.sin(RT * 8) * 5;
            ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.moveTo(p.x - 12, ay - 12); ctx.lineTo(p.x + 12, ay - 12); ctx.lineTo(p.x, ay + 4); ctx.closePath(); ctx.fill();
          }
        }
      }
    }
  }

  function drawFlight() {
    const f = G.note.flight; if (!f) return;
    const k = clamp((G.now - f.t0) / f.dur, 0, 1);
    const a = G.seats[G.students[f.from].seat], b = G.seats[G.students[f.to].seat];
    drawNotePaper(lerp(a.x, b.x, k), lerp(a.y - 8, b.y - 8, k) - Math.sin(k * Math.PI) * 70, k * 8);
  }

  function drawHallway() {
    ctx.fillStyle = '#c3cfd5'; ctx.fillRect(0, 650, W, 110);
    ctx.fillStyle = '#9fb0b8'; ctx.fillRect(0, 650, W, 6);
    ctx.fillStyle = '#dfe5e8'; ctx.fillRect(0, 735, W, 25);
    ctx.fillStyle = '#5f7a63'; rr(16, 668, 84, 34, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '20px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('복도', 58, 686);
    ctx.fillStyle = '#6b7f88'; ctx.font = '14px Jua, sans-serif'; ctx.fillText('벌 서는 곳', 58, 718);
    for (const s of G.students) {
      if (s.alive) continue;
      const q = kidPos(s);
      drawStanding(s, q.x, q.y, q.done ? 0.6 : 0.75, q.done);
      if (q.done) { ctx.fillStyle = '#4a3320'; ctx.font = '14px Jua, sans-serif'; ctx.fillText(s.name.split(' ').pop(), q.x + 36, 742); }
    }
  }

  function drawOverlayText() {
    if (RT < MSG.until && G.mode === 'play') {
      ctx.font = '21px Jua, sans-serif';
      const w = ctx.measureText(MSG.text).width + 30;
      ctx.fillStyle = 'rgba(40,25,10,.82)'; rr(450 - w / 2, 616, w, 32, 14); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(MSG.text, 450, 633);
    }
    for (const p of G.parts) {
      ctx.globalAlpha = clamp(p.life / 0.9, 0, 1);
      ctx.fillStyle = p.col; circ(p.x, p.y, 5); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (G.mode === 'countdown') {
      ctx.fillStyle = 'rgba(30,20,10,.45)'; ctx.fillRect(0, 0, W, H);
      const c = Math.ceil(G.cd - 0.6);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = c > 0 ? '120px Jua, sans-serif' : '80px Jua, sans-serif';
      ctx.fillText(c > 0 ? String(c) : '수업 시작!', 450, 380);
      const me = G.seats[G.students[G.me].seat];
      ctx.font = '24px Jua, sans-serif'; ctx.fillStyle = '#ffd54a';
      ctx.fillText('노란 이름표가 내 자리예요', me.x, me.y + 90);
    }
  }

  function render() {
    ctx.setTransform(SC, 0, 0, SC, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (G.shake > 0) ctx.translate(R(-6, 6) * G.shake, R(-6, 6) * G.shake);
    drawRoom(); drawBoard(); drawTeacher(); drawClass(); drawFlight(); drawHallway(); drawOverlayText();
    ctx.restore();
  }


  // ---------- 진행 ----------
  function update(dt) {
    updateParts(dt);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
    G.tx += (clamp(G.handX - 70, 250, 500) - G.tx) * Math.min(1, dt * 3);
    if (G.mode === 'title' || G.mode === 'over') return;

    if (G.role === 'solo') G.now += dt;
    else G.now = (JJ_NET.now() - G.startAt) / 1000;

    if (G.mode === 'countdown') {
      G.cd = -G.now;
      const c = Math.ceil(G.cd - 0.6);
      if (c !== G.lastCd) { G.lastCd = c; if (!document.hidden) { if (c > 0) S.tick(false); else S.tick(true); } }
      if (G.now >= 0) startPlay();
      return;
    }
    if (G.mode !== 'play') return;

    if (auth()) {
      updateTeacher(); if (G.mode !== 'play') return;
      updateNote();
      updateAI();
    }
    updateBoard();
    const N = G.note, st = G.teacher.state;
    if (N.holder != null && !N.flight && (st === 'write' || st === 'tell' || st === 'fake')) G.students[N.holder].score += dt * 10;
    if (auth() && G.now >= TIME_LIMIT) { endGame('time'); return; }
    if (G.role === 'host' && (G.dirty || G.now - G.lastPush > 0.5)) {
      G.dirty = false; G.lastPush = G.now;
      JJ_NET.pushState(makeSnap());
    }
  }

  function updateParts(dt) {
    for (const p of G.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
    G.parts = G.parts.filter(p => p.life > 0);
  }
  function soundState() {
    const st = G.teacher.state;
    S.update({ mode: G.mode, look: G.mode === 'play' && (st === 'look' || st === 'turn'), alive: alive().length, total: G.total });
  }

  // ---------- 입력 ----------
  function tryPass(to) {
    const me = G.me;
    if (G.mode !== 'play' || G.note.holder !== me || G.note.flight) return;
    if (to == null) return;
    if (!validTargets(me).includes(to)) { addMsg('방금 준 친구에겐 바로 못 돌려줘요', 1.3); return; }
    if (G.teacher.state === 'look') { addMsg('선생님이 보고 계세요!', 1.2); return; }
    if (G.now < G.note.lockUntil) { addMsg('아직 읽는 중이에요!', 1.0); return; }
    if (G.role === 'client') {
      if (G.now < G.pendingUntil) return;
      G.pendingUntil = G.now + 0.5;
      JJ_NET.sendPass(to, G.now);
    } else passNote(me, to, G.now);
  }
  cvs.addEventListener('pointerdown', e => {
    ac();
    if (!G || G.mode !== 'play') return;
    const r = cvs.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    for (const s of G.students) {
      if (!s.alive || s.me) continue;
      const p = G.seats[s.seat];
      if (x > p.x - 95 && x < p.x + 95 && y > p.y - 128 && y < p.y + 32) {
        if (G.note.holder === G.me && !G.note.flight && !Object.values(dirTargets(G.me)).includes(s.id)) { addMsg('바로 옆자리에만 넘길 수 있어요', 1.2); return; }
        tryPass(s.id); return;
      }
    }
  });
  addEventListener('keydown', e => {
    const map = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
    const dir = map[(e.key || '').toLowerCase()];
    if (!dir || !G || G.mode !== 'play') return;
    e.preventDefault();
    if (G.note.holder !== G.me) return;
    tryPass(dirTargets(G.me)[dir]);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G && G.role === 'host' && window.JJ_NET) JJ_NET.handoff();
  });

  // ---------- 화면 전환 ----------
  let lastMode = 'solo';
  function refreshBest() {
    const w = +store('jj_wins') || 0, b = +store('jj_best') || 0;
    $('best').textContent = w || b ? '우승 ' + w + '회 · 최고 낙서 점수 ' + b : '';
  }
  function hideAll() { ['title', 'out', 'result', 'lobby'].forEach(id => $(id).classList.add('hide')); }
  function startSolo() {
    ac(); lastMode = 'solo';
    const ro = buildRoster([{ u: 'me', nm: '나' }]);
    newGame(ro, ro.findIndex(r => r.u === 'me'), 'solo');
    G.mode = 'countdown';
    hideAll();
  }
  function startMulti() {
    ac(); lastMode = 'multi';
    if (G) G.mode = 'title';
    hideAll();
    JJ_NET.start();
  }
  function home() {
    if (window.JJ_NET) JJ_NET.leave();
    newGame(buildRoster([{ u: 'me', nm: '나' }]), 0, 'solo');
    hideAll();
    $('title').classList.remove('hide');
    refreshBest();
  }
  function retry() {
    if (lastMode === 'multi') { JJ_NET.leave(); startMulti(); } else startSolo();
  }
  function setMute() { $('mute').textContent = AU.muted ? '소리 끔' : '소리 켬'; $('music').textContent = AU.music ? '음악 켬' : '음악 끔'; }
  $('btnSolo').onclick = startSolo;
  $('btnMulti').onclick = startMulti;
  $('btnRetry').onclick = retry;
  $('btnRetry1').onclick = retry;
  $('btnHome').onclick = home;
  $('btnWatch').onclick = () => $('out').classList.add('hide');
  $('lbSolo').onclick = () => { JJ_NET.leave(); startSolo(); };
  $('btnLeave').onclick = home;
  $('btnReady').onclick = () => JJ_NET.ready();
  $('mute').onclick = () => { ac(); AU.muted = !AU.muted; store('jj_mute', AU.muted ? '1' : '0'); S.setMuted(AU.muted); setMute(); };
  $('music').onclick = () => { ac(); AU.music = !AU.music; store('jj_music', AU.music ? '1' : '0'); S.setMusic(AU.music); setMute(); };
  setMute();

  // ---------- 루프 ----------
  newGame(buildRoster([{ u: 'me', nm: '나' }]), 0, 'solo'); refreshBest();
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (!document.hidden) { RT += dt; update(dt); soundState(); render(); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // 탭이 숨겨져도 방장 역할은 계속 진행 (넘겨줄 친구가 없을 때 대비)
  setInterval(() => {
    if (document.hidden && G && G.role === 'host' && G.mode !== 'title') { update(0.25); }
  }, 250);
})();