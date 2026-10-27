/* 탁! 알까기 — AI
 * 후보 샷(어느 알로, 어느 방향, 어느 힘)을 물리 엔진으로 미리 굴려 보고 점수가 높은 샷을 고른다.
 * 프레임마다 조금씩 계산(시간 분할)해서 화면이 멈추지 않는다.
 * 난이도는 ① 살펴보는 후보 수 ② 실행 오차 ③ 최선이 아닌 수를 고를 확률 ④ 상대 반격 예측 여부로 조절.
 */
(function () {
  const { P, Physics } = window.Alk;
  const OTHER = { black: 'white', white: 'black' };

  const LEVELS = [
    null,
    { name: '입문', n: 24,  angErr: 7,    powErr: 0.16,  pick: 0.5, ghost: false, safety: 0,   refine: 0, reply: false },
    { name: '초급', n: 60,  angErr: 3.5,  powErr: 0.09,  pick: 3,   ghost: true,  safety: 0.4, refine: 0, reply: false },
    { name: '중급', n: 130, angErr: 1.8,  powErr: 0.05,  pick: 1,   ghost: true,  safety: 0.8, refine: 0, reply: false },
    { name: '고수', n: 240, angErr: 0.9,  powErr: 0.025, pick: 1,   ghost: true,  safety: 1,   refine: 4, reply: false },
    { name: '달인', n: 320, angErr: 0.35, powErr: 0.012, pick: 1,   ghost: true,  safety: 1.2, refine: 6, reply: true },
  ];

  const D = P.R * 2;
  const alive = (w, c) => w.stones.filter((s) => s.alive && s.falling === 0 && s.color === c);
  // 가장 가까운 떨어지는 곳(판 끝·구멍)까지 거리
const edgeDist = (w, s) => Physics.dangerRays(w, s.x, s.y, 8, 96)[0].d;

  function gauss() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 맞은 알을 방향 u로 보내려면 쏘는 알이 닿아야 할 '유령 알' 위치로 조준
  function ghostAngle(s, t, ux, uy) {
    const gx = t.x - ux * D, gy = t.y - uy * D;
    const dx = gx - s.x, dy = gy - s.y;
    const l = Math.hypot(dx, dy);
    if (l < 1) return null;
    if ((dx / l) * ux + (dy / l) * uy < 0.2) return null; // 너무 얇게 깎이는 샷 제외
    return Math.atan2(dy, dx);
  }


  function candidates(w, me, L, powers) {
    const mine = alive(w, me), opp = alive(w, OTHER[me]);
    const out = [];
    for (const s of mine) {
      for (const t of opp) {
        const dx = t.x - s.x, dy = t.y - s.y, l = Math.hypot(dx, dy) || 1;
        const angs = [Math.atan2(dy, dx)];
        const px = -dy / l, py = dx / l;
        for (const b of [-0.5, -0.25, 0.25, 0.5]) {
          angs.push(Math.atan2(t.y + py * b * D - s.y, t.x + px * b * D - s.x));
        }
        if (L.ghost) {
          // 맞은 알을 가장 가까운 판 끝·구멍 쪽으로 보내는 각도 2개
          for (const r of Physics.dangerRays(w, t.x, t.y, 16).slice(0, 2)) {
            const g = ghostAngle(s, t, r.ux, r.uy);
            if (g !== null) angs.push(g);
          }
        }
        for (const a of angs) for (const p of powers) out.push({ id: s.id, ang: a, p });
      }
    }
    return out;
  }

  function simulate(w, id, ang, p) {
    const c = Physics.clone(w);
    const s = c.stones.find((x) => x.id === id);
    const v = P.MAX_SPEED * p;
    s.vx = Math.cos(ang) * v;
    s.vy = Math.sin(ang) * v;
    for (let k = 0; k < 1800; k++) {
      Physics.step(c);
      c.events.length = 0;
      if (!Physics.moving(c)) break;
    }
    for (const x of c.stones) if (x.falling > 0) x.alive = false;
    return c;
  }

  function evaluate(before, after, me, safety) {
    const op = OTHER[me];
    const own0 = Physics.count(before, me), opp0 = Physics.count(before, op);
    const own1 = Physics.count(after, me), opp1 = Physics.count(after, op);
    let sc = (opp0 - opp1) * 100 - (own0 - own1) * 130;
    if (opp1 === 0 && own1 > 0) sc += 1000;
    if (own1 === 0) sc -= 1000;
    if (safety) {
      for (const s of alive(after, me)) sc -= Math.max(0, 80 - edgeDist(after, s)) * 0.35 * safety;
      for (const s of alive(after, op)) sc += Math.max(0, 80 - edgeDist(after, s)) * 0.1 * safety;
    }
    return sc;
  }

  // 상대의 가장 좋은 반격 점수 (달인 전용)
  function* bestReply(w, me) {
    const op = OTHER[me];
    const L = { ghost: true };
    let list = shuffle(candidates(w, op, L, [0.6, 0.85, 1])).slice(0, 36);
    let best = -1e9;
    for (const c of list) {
      const a = simulate(w, c.id, c.ang, c.p);
      best = Math.max(best, evaluate(w, a, op, 0.6));
      yield;
    }
    return list.length ? best : 0;
  }

  function* think(w, me, level) {
    const L = LEVELS[level];
    let powers = level <= 1 ? [0.45, 0.7, 0.95] : [0.3, 0.45, 0.6, 0.75, 0.9, 1];
    if (w.mu < 1) powers = level <= 1 ? [0.25, 0.4, 0.6] : [0.15, 0.22, 0.3, 0.4, 0.55, 0.75];
    const cands = shuffle(candidates(w, me, L, powers)).slice(0, L.n);
    if (!cands.length) return null;

    for (const c of cands) {
      c.score = evaluate(w, simulate(w, c.id, c.ang, c.p), me, L.safety);
      yield;
    }
    cands.sort((a, b) => b.score - a.score);

    // 잘 나온 샷 주변을 미세하게 다듬기
    if (L.refine) {
      const extra = [];
      for (const c of cands.slice(0, L.refine)) {
        for (const da of [-1.2, -0.6, 0.6, 1.2]) extra.push({ id: c.id, ang: c.ang + (da * Math.PI) / 180, p: c.p });
        for (const dp of [-0.06, 0.06]) extra.push({ id: c.id, ang: c.ang, p: Math.min(1, Math.max(0.05, c.p + dp)) });
      }
      for (const c of extra) {
        c.score = evaluate(w, simulate(w, c.id, c.ang, c.p), me, L.safety);
        cands.push(c);
        yield;
      }
      cands.sort((a, b) => b.score - a.score);
    }

    // 상대 반격까지 내다보기
    if (L.reply) {
      const top = cands.slice(0, 5);
      for (const c of top) {
        const after = simulate(w, c.id, c.ang, c.p);
        if (Physics.count(after, OTHER[me]) === 0) { c.final = c.score; continue; }
        const r = yield* bestReply(after, me);
        c.final = c.score - 0.55 * r;
      }
      top.sort((a, b) => b.final - a.final);
      return top[0];
    }

    if (L.pick < 1) {
      const k = Math.max(1, Math.floor(cands.length * L.pick));
      return cands[(Math.random() * k) | 0];
    }
    return cands[(Math.random() * Math.min(L.pick, cands.length)) | 0];
  }

  function start(w, me, level) {
    return { gen: think(Physics.clone(w), me, level), done: false, result: null, level };
  }

  function tick(job, budgetMs) {
    if (job.done) return;
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      const r = job.gen.next();
      if (r.done) { job.done = true; job.result = r.value; return; }
    }
  }

  // 실제로 쏠 때 사람처럼 오차를 섞는다
  function execute(choice, level) {
    const L = LEVELS[level];
    const ang = choice.ang + (gauss() * L.angErr * Math.PI) / 180;
    const p = Math.min(1, Math.max(0.03, choice.p * (1 + gauss() * L.powErr)));
    return { id: choice.id, dx: Math.cos(ang), dy: Math.sin(ang), p };
  }

  window.Alk.AI = { LEVELS, start, tick, execute };
})();
