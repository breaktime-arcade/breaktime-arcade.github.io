/* 탁! 알까기 — 조준·힘 입력
 * 상대 드래그 방식: 누른 지점에서 당긴 만큼이 힘, 반대 방향이 발사 방향.
 * 손가락이 알을 가리지 않도록, 알을 고른 뒤에는 화면 어디서 당겨도 된다.
 * 정밀 모드(Shift / 두 번째 손가락 / 정밀 버튼)에서는 손 움직임이 1/4만 반영된다.
 */
(function () {
  const Alk = (window.Alk = window.Alk || {});

  const CANCEL = 0.06;    // 이보다 덜 당기면 발사 취소
  const CURVE = 1.6;      // 약한 힘 구간을 넓게 쓰는 곡선
  const MIN_P = 0.01;     // 최소 힘
  const FINE = 0.25;      // 정밀 모드 감도

  function create(canvas, api) {
    const st = {
      aiming: false, pid: null, stone: null,
      sx: 0, sy: 0,   // 당기기 시작점(화면 px)
      vx: 0, vy: 0,   // 가상 포인터 위치(정밀 모드 반영)
      lx: 0, ly: 0,   // 실제 포인터 마지막 위치
      extra: new Set(), shift: false,
    };

    function maxPull() {
      const r = canvas.getBoundingClientRect();
      return Math.max(150, Math.min(280, Math.min(r.width, r.height) * 0.45));
    }

    function isFine() {
      return st.shift || st.extra.size > 0 || api.fineLocked();
    }

    function compute() {
      const px = st.sx - st.vx, py = st.sy - st.vy;
      const len = Math.hypot(px, py);
      const raw = Math.min(1, len / maxPull());
      const cancel = raw < CANCEL;
      const q = cancel ? 0 : (raw - CANCEL) / (1 - CANCEL);
      const p = cancel ? 0 : MIN_P + (1 - MIN_P) * Math.pow(q, CURVE);
      const dx = len > 1e-6 ? px / len : 0, dy = len > 1e-6 ? py / len : -1;
      return { raw, p, cancel, dx, dy };
    }

    function stop() {
      st.aiming = false; st.pid = null; st.stone = null; st.extra.clear();
      api.onUpdate();
    }

    canvas.addEventListener('pointerdown', (e) => {
      api.onFirstInput();
      if (st.aiming) {
        if (e.button === 2) { stop(); return; }          // 우클릭 = 취소
        if (e.pointerId !== st.pid) { st.extra.add(e.pointerId); api.onUpdate(); }
        return;
      }
      if (!api.canAim() || e.button === 2) return;
      const w = api.toWorld(e.clientX, e.clientY);
      let s = api.pickStone(w.x, w.y, e.pointerType === 'touch');
      if (s) api.setSelected(s); else s = api.getSelected();
      if (!s) return;
      st.aiming = true; st.pid = e.pointerId; st.stone = s;
      st.sx = st.vx = st.lx = e.clientX;
      st.sy = st.vy = st.ly = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
      api.onUpdate();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!st.aiming || e.pointerId !== st.pid) return;
      const k = isFine() ? FINE : 1;
      st.vx += (e.clientX - st.lx) * k;
      st.vy += (e.clientY - st.ly) * k;
      st.lx = e.clientX; st.ly = e.clientY;
      api.onUpdate();
    });

    function up(e) {
      if (st.extra.has(e.pointerId)) { st.extra.delete(e.pointerId); api.onUpdate(); return; }
      if (!st.aiming || e.pointerId !== st.pid) return;
      const a = compute();
      const stone = st.stone;
      stop();
      if (e.type === 'pointerup' && !a.cancel) api.onShoot(stone, a.dx, a.dy, a.p);
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift' && !st.shift) { st.shift = true; api.onUpdate(); }
      if (e.key === 'Escape' && st.aiming) stop();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') { st.shift = false; api.onUpdate(); }
    });
    window.addEventListener('blur', () => { st.shift = false; });

    return {
      state() {
        if (!st.aiming) return { aiming: false, fine: isFine() };
        return { aiming: true, stone: st.stone, fine: isFine(), ...compute() };
      },
      cancel: stop,
    };
  }

  Alk.Input = { create };
})();
