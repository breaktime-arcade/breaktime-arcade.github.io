/* 탁! 알까기 — 물리 엔진
 * 고정 시간 간격(120Hz) 2D 원형 충돌. 난수를 쓰지 않으므로
 * 같은 입력이면 항상 같은 결과 → AI가 그대로 시뮬레이션에 재사용.
 * 테마 장애물: 판 모양(regions), 구멍(holes), 블록(boxes), 범퍼(bumpers), 풍차(spinners).
 * 풍차는 '판 위 시간'(w.t)에 따라 돌고, 이 시간은 알이 움직일 때만 흐른다.
 */
(function () {
  const Alk = (window.Alk = window.Alk || {});

  const P = {
    BOARD: 600,        // 판 크기(월드 단위)
    GRID_MARGIN: 30,   // 바깥 줄까지 여백
    GRID_N: 19,        // 19줄 바둑판
    R: 17,             // 알 반지름
    DECEL: 360,        // 바닥 마찰(일정 감속)
    DAMP: 0.35,        // 속도 비례 감속
    REST: 0.9,         // 알끼리 반발계수
    WALL_REST: 0.7,    // 블록 반발계수
    BUMP_KICK: 260,    // 범퍼가 더해 주는 속도
    SPIN_REST: 0.5,    // 풍차 반발계수
    MAX_SPEED: 1250,   // 힘 100%일 때 초기 속도
    DT: 1 / 120,
    STOP: 3,           // 이 속도 아래면 정지
    FALL_TIME: 0.45,   // 떨어지는 연출 시간(초)
  };
  P.CELL = (P.BOARD - P.GRID_MARGIN * 2) / (P.GRID_N - 1);

  function createWorld(theme) {
    const t = theme || {};
    return {
      stones: [], events: [], nextId: 1, t: 0,
      mu: t.mu || 1,
      regions: t.regions || null,
      holes: t.holes || [],
      boxes: t.boxes || [],
      bumpers: t.bumpers || [],
      spinners: t.spinners || [],
    };
  }

  function addStone(w, color, x, y) {
    const s = { id: w.nextId++, color, x, y, vx: 0, vy: 0, alive: true, falling: 0, hole: null };
    w.stones.push(s);
    return s;
  }

  // 판 위인가? 판 밖이면 'off', 구멍이면 그 구멍, 판 위면 null
  function outAt(w, x, y) {
    if (w.regions) {
      let ok = false;
      for (const r of w.regions) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { ok = true; break; }
      if (!ok) return 'off';
    } else if (x < 0 || x > P.BOARD || y < 0 || y > P.BOARD) return 'off';
    for (const h of w.holes) if ((x - h.x) ** 2 + (y - h.y) ** 2 < h.r * h.r) return h;
    return null;
  }

  function decay(speed, mu) {
    const nv = speed - (P.DECEL * mu + P.DAMP * speed) * P.DT;
    return nv <= P.STOP ? 0 : nv;
  }

  function spinnerArms(w, sp) {
    const base = sp.phase + sp.omega * w.t;
    const arms = [];
    for (let k = 0; k < sp.arms; k++) {
      const a = base + (k * Math.PI) / sp.arms;
      arms.push({ ux: Math.cos(a), uy: Math.sin(a) });
    }
    return arms;
  }

  function collideObstacles(w, s) {
    const R = P.R;
    // 블록 (축 정렬 사각형)
    for (let i = 0; i < w.boxes.length; i++) {
      const b = w.boxes[i];
      const cx = Math.max(b.x, Math.min(s.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(s.y, b.y + b.h));
      let dx = s.x - cx, dy = s.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      let nx, ny;
      if (d2 < 1e-9) {
        // 중심이 블록 안 → 가장 얕은 쪽으로 밀어냄
        const pen = [[s.x - b.x, -1, 0], [b.x + b.w - s.x, 1, 0], [s.y - b.y, 0, -1], [b.y + b.h - s.y, 0, 1]].sort((p, q) => p[0] - q[0])[0];
        nx = pen[1]; ny = pen[2];
        s.x += nx * (pen[0] + R); s.y += ny * (pen[0] + R);
      } else {
        const d = Math.sqrt(d2);
        nx = dx / d; ny = dy / d;
        s.x = cx + nx * R; s.y = cy + ny * R;
      }
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) {
        s.vx -= (1 + P.WALL_REST) * vn * nx;
        s.vy -= (1 + P.WALL_REST) * vn * ny;
        w.events.push({ type: 'wall', v: -vn, x: s.x - nx * R, y: s.y - ny * R });
      }
    }
    // 범퍼 (원)
    for (let i = 0; i < w.bumpers.length; i++) {
      const c = w.bumpers[i];
      const dx = s.x - c.x, dy = s.y - c.y, rr = c.r + R;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d, ny = dy / d;
      s.x = c.x + nx * rr; s.y = c.y + ny * rr;
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) {
        s.vx -= 2 * vn * nx; s.vy -= 2 * vn * ny;
        s.vx += nx * P.BUMP_KICK; s.vy += ny * P.BUMP_KICK;
        w.events.push({ type: 'bump', i, v: -vn, x: c.x + nx * c.r, y: c.y + ny * c.r });
      }
    }
    // 풍차 (회전하는 막대)
    for (const sp of w.spinners) {
      const rr = R + sp.th;
      for (const arm of spinnerArms(w, sp)) {
        const rx = s.x - sp.x, ry = s.y - sp.y;
        const tt = Math.max(-sp.len, Math.min(sp.len, rx * arm.ux + ry * arm.uy));
        const qx = sp.x + arm.ux * tt, qy = sp.y + arm.uy * tt;
        const dx = s.x - qx, dy = s.y - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const nx = dx / d, ny = dy / d;
        s.x = qx + nx * rr; s.y = qy + ny * rr;
        const ax = -sp.omega * (qy - sp.y), ay = sp.omega * (qx - sp.x); // 막대의 그 지점 속도
        const vn = (s.vx - ax) * nx + (s.vy - ay) * ny;
        if (vn < 0) {
          s.vx -= (1 + P.SPIN_REST) * vn * nx;
          s.vy -= (1 + P.SPIN_REST) * vn * ny;
          w.events.push({ type: 'wall', v: -vn, x: qx + nx * sp.th, y: qy + ny * sp.th });
        }
      }
    }
  }

  function step(w) {
    const dt = P.DT;
    const S = w.stones;
    const mu = w.mu;
    w.t += dt;

    // 1) 이동 + 마찰
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (!s.alive) continue;
      if (s.falling > 0) {
        if (s.hole) {
          s.x += (s.hole.x - s.x) * Math.min(1, dt * 12);
          s.y += (s.hole.y - s.y) * Math.min(1, dt * 12);
        } else {
          s.x += s.vx * dt; s.y += s.vy * dt;
          s.vx *= 0.96; s.vy *= 0.96;
        }
        s.falling += dt;
        if (s.falling >= P.FALL_TIME) s.alive = false;
        continue;
      }
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > 0) {
        const nv = decay(sp, mu);
        const k = nv / sp;
        s.vx *= k; s.vy *= k;
        s.x += s.vx * dt; s.y += s.vy * dt;
      }
    }

    // 2) 알끼리 충돌 (한 스텝 최대 이동 ≈ 12 < 지름 34 → 관통 없음)
    const D = P.R * 2;
    for (let i = 0; i < S.length; i++) {
      const a = S[i];
      if (!a.alive || a.falling > 0) continue;
      for (let j = i + 1; j < S.length; j++) {
        const b = S[j];
        if (!b.alive || b.falling > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= D * D) continue;
        let d = Math.sqrt(d2);
        let nx, ny;
        if (d < 1e-6) { nx = 1; ny = 0; d = 0; } else { nx = dx / d; ny = dy / d; }
        const push = (D - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vn > 0) {
          const j2 = ((1 + P.REST) / 2) * vn;
          a.vx -= j2 * nx; a.vy -= j2 * ny;
          b.vx += j2 * nx; b.vy += j2 * ny;
          w.events.push({ type: 'hit', v: vn, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }

    // 3) 장애물
    if (w.boxes.length || w.bumpers.length || w.spinners.length) {
      for (const s of S) if (s.alive && s.falling === 0) collideObstacles(w, s);
    }

    // 4) 판 밖·구멍 → 떨어짐 시작
    for (const s of S) {
      if (!s.alive || s.falling > 0) continue;
      const o = outAt(w, s.x, s.y);
      if (o) {
        s.falling = 1e-4;
        s.hole = o === 'off' ? null : o;
        if (s.hole) { s.vx = s.vy = 0; }
        w.events.push({ type: 'fall', color: s.color, hole: !!s.hole, x: s.x, y: s.y });
      }
    }
  }

  function moving(w) {
    for (const s of w.stones) {
      if (!s.alive) continue;
      if (s.falling > 0) return true;
      if (s.vx !== 0 || s.vy !== 0) return true;
    }
    return false;
  }

  function count(w, color) {
    let n = 0;
    for (const s of w.stones) if (s.alive && s.falling === 0 && s.color === color) n++;
    return n;
  }

  function travel(v0, mu = 1) {
    let v = v0, d = 0;
    for (let k = 0; k < 4000 && v > 0; k++) { v = decay(v, mu); d += v * P.DT; }
    return d;
  }

  function speedAfter(v0, dist, mu = 1) {
    let v = v0, d = 0;
    for (let k = 0; k < 4000 && v > 0; k++) {
      const nv = decay(v, mu);
      if (d + nv * P.DT >= dist) return nv;
      d += nv * P.DT; v = nv;
    }
    return 0;
  }

  // (x,y)에서 가장 가까운 '떨어지는 곳'까지 거리와 방향 (dirs개 방향으로 훑기)
  function dangerRays(w, x, y, dirs = 8, maxD = 300) {
    const out = [];
    for (let k = 0; k < dirs; k++) {
      const a = (k / dirs) * Math.PI * 2;
      const ux = Math.cos(a), uy = Math.sin(a);
      let d = 8;
      while (d < maxD && !outAt(w, x + ux * d, y + uy * d)) d += 8;
      out.push({ d, ux, uy });
    }
    return out.sort((p, q) => p.d - q.d);
  }

  // 깊은 복사 (장애물 데이터는 고정이라 공유)
  function clone(w) {
    return { ...w, stones: w.stones.map((s) => ({ ...s })), events: [] };
  }

  Alk.P = P;
  Alk.Physics = { createWorld, addStone, step, moving, count, travel, speedAfter, clone, outAt, dangerRays, spinnerArms };
})();
