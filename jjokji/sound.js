/*!
 * 쪽지 돌리기 (Secret Note) - 사운드 엔진 (Web Audio 합성)
 * © 2026 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 * 무단 복제·수정·재배포를 금지합니다.
 */
(function () {
  'use strict';
  const R = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let A = null, NB = null, BN = null;
  const M = {};
  let muted = false, musicOn = true;

  // ---------- 기본 구성 ----------
  function makeIR(dur, decay) {
    const len = Math.floor(A.sampleRate * dur), ir = A.createBuffer(2, len, A.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        lp = lp * (0.25 + 0.6 * k) + (Math.random() * 2 - 1) * (0.75 - 0.6 * k);
        d[i] = lp * Math.pow(1 - k, decay);
      }
    }
    return ir;
  }
  function bus(vol, send) {
    const g = A.createGain(); g.gain.value = vol; g.connect(M.master);
    const s = A.createGain(); s.gain.value = send; g.connect(s); s.connect(M.rev);
    return g;
  }
  function init() {
    if (A) { if (A.state === 'suspended') A.resume(); return A; }
    try { A = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    const comp = A.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    M.master = A.createGain(); M.master.gain.value = muted ? 0 : 0.9;
    M.master.connect(comp); comp.connect(A.destination);
    M.rev = A.createConvolver(); M.rev.buffer = makeIR(1.6, 2.4);
    const ro = A.createGain(); ro.gain.value = 0.55; M.rev.connect(ro); ro.connect(M.master);
    M.sfx = bus(1.0, 0.22);
    M.amb = bus(0, 0.12);
    M.clock = bus(0, 0.05);
    M.mus = bus(0, 0.16);

    NB = A.createBuffer(1, A.sampleRate * 2, A.sampleRate);
    let d = NB.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    BN = A.createBuffer(1, A.sampleRate * 2, A.sampleRate);
    d = BN.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    startAmbience();
    return A;
  }
  const ok = () => A && A.state !== 'closed';

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function nz(t, dur, out, o) {
    o = o || {};
    const s = A.createBufferSource(); s.buffer = o.brown ? BN : NB;
    const f = A.createBiquadFilter(); f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    f.Q.value = o.q || 1;
    const g = A.createGain(); env(g, t, o.a || 0.004, o.vol || 0.3, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 1.5); s.stop(t + (o.a || 0.004) + dur + 0.05);
  }
  function os(t, dur, out, o) {
    o = o || {};
    const v = A.createOscillator(); v.type = o.type || 'sine';
    v.frequency.setValueAtTime(o.f || 440, t);
    if (o.f2) v.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    if (o.detune) v.detune.value = o.detune;
    const g = A.createGain(); env(g, t, o.a || 0.004, o.vol || 0.2, dur);
    let node = v;
    if (o.lp) {
      const f = A.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + dur);
      f.Q.value = o.lq || 0.8;
      v.connect(f); node = f;
    }
    node.connect(g); g.connect(out);
    v.start(t); v.stop(t + (o.a || 0.004) + dur + 0.05);
  }
  // 성대 소리(사람 목소리 느낌): 톱니파 + 포먼트 필터 + 비브라토
  function voice(t, dur, f0, f1, forms, vol, out) {
    const v = A.createOscillator(); v.type = 'sawtooth';
    v.frequency.setValueAtTime(f0, t); v.frequency.linearRampToValueAtTime(f1, t + dur);
    const vib = A.createOscillator(); vib.frequency.value = 5.5;
    const vg = A.createGain(); vg.gain.value = f0 * 0.015; vib.connect(vg); vg.connect(v.frequency);
    const g = A.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    forms.forEach(([f, q, gn]) => {
      const b = A.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q;
      const bg = A.createGain(); bg.gain.value = gn;
      v.connect(b); b.connect(bg); bg.connect(g);
    });
    g.connect(out);
    v.start(t); vib.start(t); v.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }
  // 종 소리: 비정수배 배음 합성
  function bellTone(t, f, vol, dur, out) {
    [[1, 1], [2, 0.5], [2.76, 0.32], [4.07, 0.18], [5.43, 0.1]].forEach(([r, g], i) => {
      os(t, dur / (1 + i * 0.6), out || M.sfx, { f: f * r, vol: vol * g, a: 0.002 });
    });
  }
  // 금관 느낌: 톱니파 2개 + 필터 엔벨로프
  function brass(t, f, dur, vol, out) {
    [-7, 7].forEach(dt => os(t, dur, out || M.sfx, { type: 'sawtooth', f, detune: dt, vol: vol, a: 0.03, lp: f * 6, lp2: f * 2 }));
  }
  function grains(t, span, n, vol) {
    for (let i = 0; i < n; i++) nz(t + Math.random() * span, R(0.008, 0.02), M.sfx, { type: 'highpass', f: R(2800, 5200), vol: R(0.4, 1) * vol });
  }

  // ---------- 효과음 ----------
  const SFX = {
    chalk() { // 분필로 칠판 긁는 소리
      if (!ok()) return;
      const t = A.currentTime, dur = R(0.06, 0.13);
      nz(t, 0.012, M.sfx, { type: 'lowpass', f: 900, vol: 0.18 });
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) nz(t + (dur / n) * i, R(0.015, 0.03), M.sfx, { f: R(2400, 4200), q: 6, vol: R(0.1, 0.22) });
      nz(t, dur, M.sfx, { type: 'highpass', f: 6000, vol: 0.025 });
    },
    chalkDown() { // 분필을 분필통에 '톡 톡'
      if (!ok()) return;
      const t = A.currentTime;
      [0, 0.09].forEach((d, i) => {
        os(t + d, 0.06, M.sfx, { f: 760 - i * 90, f2: 430, vol: 0.22 });
        nz(t + d, 0.02, M.sfx, { f: 1800, q: 3, vol: 0.18 });
      });
    },
    cough() { // "에-헴!"
      if (!ok()) return;
      const t = A.currentTime;
      nz(t, 0.11, M.sfx, { f: 620, q: 4, vol: 0.55 });
      nz(t, 0.1, M.sfx, { f: 1700, q: 5, vol: 0.3 });
      voice(t, 0.12, 155, 120, [[560, 5, 2], [1800, 6, 1]], 0.25, M.sfx);
      nz(t + 0.2, 0.06, M.sfx, { type: 'highpass', f: 1800, vol: 0.18 });
      voice(t + 0.24, 0.42, 135, 112, [[530, 6, 2.2], [1850, 7, 1.1], [260, 3, 1.2]], 0.32, M.sfx);
    },
    hum() { // "음…" 하고 어깨 들썩
      if (!ok()) return;
      const t = A.currentTime;
      nz(t, 0.08, M.sfx, { type: 'highpass', f: 1500, vol: 0.08 });
      voice(t + 0.04, 0.55, 118, 98, [[250, 3, 3], [720, 4, 0.5]], 0.3, M.sfx);
      nz(t + 0.05, 0.25, M.sfx, { f: 500, f2: 300, q: 1, vol: 0.1, brown: true });
    },
    toss() { // 쪽지 휙
      if (!ok()) return;
      const t = A.currentTime;
      grains(t, 0.07, 5, 0.12);
      nz(t + 0.03, 0.3, M.sfx, { f: 650, f2: 2600, q: 1.3, vol: 0.22, a: 0.05 });
    },
    land() { // 쪽지가 책상에 툭
      if (!ok()) return;
      const t = A.currentTime;
      nz(t, 0.05, M.sfx, { f: 1300, q: 1, vol: 0.16 });
      grains(t, 0.05, 3, 0.08);
    },
    receive() { // 쪽지 펼치는 바스락 + 작은 차임
      if (!ok()) return;
      const t = A.currentTime;
      grains(t, 0.3, 9, 0.14);
      bellTone(t + 0.04, 1568, 0.07, 0.5);
    },
    turn() { // 실내화 끽 + 옷깃 스침
      if (!ok()) return;
      const t = A.currentTime;
      os(t, 0.09, M.sfx, { f: 1050, f2: 1500, vol: 0.12, type: 'triangle' });
      nz(t, 0.18, M.sfx, { f: 900, f2: 380, q: 1.2, vol: 0.32 });
    },
    caught() { // 걸렸다! 오케스트라 히트 + 팀파니
      if (!ok()) return;
      const t = A.currentTime;
      [110, 130.81, 164.81, 220].forEach(f => [-12, 12].forEach(dt =>
        os(t, 0.75, M.sfx, { type: 'sawtooth', f, detune: dt, vol: 0.09, a: 0.008, lp: 3200, lp2: 260 })));
      os(t, 0.6, M.sfx, { f: 98, f2: 52, vol: 0.6 });
      nz(t, 0.18, M.sfx, { type: 'lowpass', f: 420, vol: 0.45, brown: true });
      os(t + 0.02, 0.18, M.sfx, { type: 'triangle', f: 1760, f2: 1320, vol: 0.08 });
    },
    lose() { // 빠밤빠밤~ (슬픈 트롬본)
      if (!ok()) return;
      const t = A.currentTime;
      [[311, 0], [294, 0.32], [277, 0.64]].forEach(([f, d]) => brass(t + d, f / 2, 0.3, 0.08));
      brass(t + 0.96, 130.8, 0.9, 0.08);
    },
    win() { // 팡파르
      if (!ok()) return;
      const t = A.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) => brass(t + i * 0.13, f, 0.14, 0.07));
      [523.25, 659.25, 783.99, 1046.5].forEach(f => brass(t + 0.42, f, 0.9, 0.05));
      [2093, 2637, 3136].forEach((f, i) => bellTone(t + 0.45 + i * 0.07, f, 0.04, 0.8));
    },
    tick(go) { // 카운트다운 우드블록
      if (!ok()) return;
      const t = A.currentTime;
      os(t, 0.08, M.sfx, { f: go ? 1600 : 1200, vol: 0.28 });
      nz(t, 0.025, M.sfx, { f: 2500, q: 4, vol: 0.2 });
    },
    bell(full) { // 학교 종 "딩동댕동"
      if (!ok()) return;
      const t = A.currentTime;
      const notes = [659.25, 523.25, 587.33, 392];
      const seq = full ? notes.concat([392, 587.33, 659.25, 523.25]) : notes;
      seq.forEach((f, i) => bellTone(t + i * 0.42, f, 0.13, 1.6));
    }
  };

  // ---------- 교실 배경 (수군거림·시계·연필) ----------
  const AMB = { voices: [], nextClock: 0, tickTock: 0, nextFx: 0, started: false };
  function startAmbience() {
    // 방 울림(낮은 웅웅거림)
    const room = A.createBufferSource(); room.buffer = BN; room.loop = true;
    const rf = A.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 260;
    const rg = A.createGain(); rg.gain.value = 0.06;
    room.connect(rf); rf.connect(rg); rg.connect(M.amb); room.start();
    // 소곤소곤 목소리 4개: 노이즈 + 두 개의 포먼트 필터
    for (let i = 0; i < 4; i++) {
      const s = A.createBufferSource(); s.buffer = NB; s.loop = true;
      const b1 = A.createBiquadFilter(); b1.type = 'bandpass'; b1.Q.value = 4; b1.frequency.value = R(450, 900);
      const b2 = A.createBiquadFilter(); b2.type = 'bandpass'; b2.Q.value = 5; b2.frequency.value = R(1300, 2400);
      const g = A.createGain(); g.gain.value = 0;
      const pan = A.createStereoPanner ? A.createStereoPanner() : null;
      s.connect(b1); s.connect(b2); b1.connect(g); b2.connect(g);
      if (pan) { pan.pan.value = -0.7 + i * 0.45; g.connect(pan); pan.connect(M.amb); } else g.connect(M.amb);
      s.start(0, Math.random() * 1.5);
      AMB.voices.push({ g, b1, b2, next: 0 });
    }
    AMB.started = true;
  }
  function schedAmbience(now, st) {
    const active = Math.max(1, Math.min(4, st.alive - 1));
    AMB.voices.forEach((v, i) => {
      if (v.next < now - 0.5) v.next = now;
      while (v.next < now + 0.12) {
        const t = v.next;
        if (i >= active || Math.random() < 0.28) { v.g.gain.setTargetAtTime(0, t, 0.05); v.next = t + R(0.3, 1.3); continue; }
        const dur = R(0.07, 0.2);
        v.g.gain.setTargetAtTime(R(0.12, 0.38), t, 0.02);
        v.g.gain.setTargetAtTime(0, t + dur, 0.035);
        v.b1.frequency.setTargetAtTime(R(420, 950), t, 0.03);
        v.b2.frequency.setTargetAtTime(R(1200, 2500), t, 0.03);
        v.next = t + dur + R(0.03, 0.14);
      }
    });
    // 벽시계 째깍
    if (AMB.nextClock < now - 0.5) AMB.nextClock = now + 0.05;
    while (AMB.nextClock < now + 0.12) {
      const t = AMB.nextClock, tock = (AMB.tickTock++) % 2;
      os(t, 0.035, M.clock, { f: tock ? 1700 : 2200, vol: 0.12 });
      nz(t, 0.012, M.clock, { f: 3500, q: 3, vol: 0.1 });
      AMB.nextClock += 1;
    }
    // 가끔 연필 톡톡, 의자 삐걱
    if (AMB.nextFx < now) {
      if (AMB.nextFx) {
        const t = now + 0.05;
        if (Math.random() < 0.6) [0, 0.12, 0.2].forEach(d => nz(t + d, 0.012, M.amb, { f: R(2000, 3000), q: 4, vol: 0.18 }));
        else os(t, 0.3, M.amb, { type: 'sawtooth', f: R(180, 240), f2: R(260, 320), vol: 0.035, lp: 1100 });
      }
      AMB.nextFx = now + R(3.5, 8);
    }
  }

  // ---------- 배경 음악 (살금살금 피치카토, 인원이 줄면 빨라짐) ----------
  const MUS = { next: 0, step: 0 };
  const BASS = [110, 0, 164.81, 0, 110, 130.81, 123.47, 103.83, 110, 0, 164.81, 0, 87.31, 0, 82.41, 103.83];
  const MEL = [440, 523.25, 587.33, 659.25, 415.3, 493.88];
  function pluck(t, f, vol, out) {
    os(t, 0.22, out, { type: 'triangle', f, vol, a: 0.003, lp: 1800, lp2: 280 });
    os(t, 0.12, out, { type: 'square', f, vol: vol * 0.25, a: 0.003, lp: 1400, lp2: 300 });
  }
  function marimba(t, f, vol, out) {
    os(t, 0.25, out, { f, vol, a: 0.002 });
    os(t, 0.07, out, { f: f * 4, vol: vol * 0.25, a: 0.002 });
  }
  function schedMusic(now, st) {
    const tension = 1 - st.alive / st.total;
    const stepDur = 60 / (100 + tension * 50) / 2;
    if (MUS.next < now - 0.3) { MUS.next = now + 0.05; MUS.step = 0; }
    while (MUS.next < now + 0.15) {
      const t = MUS.next, s = MUS.step % 16;
      if (BASS[s]) pluck(t, BASS[s], 0.32, M.mus);
      if (s % 8 === 0) os(t, 0.16, M.mus, { f: 72, f2: 45, vol: 0.35 });
      if (s % 2 === 1) nz(t, 0.025, M.mus, { type: 'highpass', f: 7000, vol: 0.08 });
      if (tension > 0.5 && s % 2 === 0) nz(t + stepDur / 2, 0.02, M.mus, { type: 'highpass', f: 8000, vol: 0.05 });
      if (s % 2 === 0 && Math.random() < 0.22 + tension * 0.2) marimba(t, pick(MEL) * (Math.random() < 0.3 ? 2 : 1), 0.12, M.mus);
      MUS.next += stepDur; MUS.step++;
    }
  }

  // ---------- 매 프레임 상태 반영 ----------
  function target(p, v, tc) {
    if (p._t === v) return;
    p._t = v;
    const now = A.currentTime;
    p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.setTargetAtTime(v, now, tc);
  }
  // st = { mode, look, alive, total }
  function update(st) {
    if (!ok() || !AMB.started) return;
    const now = A.currentTime;
    const inClass = st.mode === 'play' || st.mode === 'countdown';
    target(M.amb.gain, inClass && !st.look ? 0.9 : 0, st.look ? 0.02 : 0.35);
    target(M.clock.gain, inClass ? (st.look ? 1.2 : 0.55) : 0, 0.1);
    target(M.mus.gain, musicOn && st.mode === 'play' && !st.look ? 0.75 : 0, st.look ? 0.03 : 0.4);
    if (inClass) schedAmbience(now, st);
    if (st.mode === 'play') schedMusic(now, st); else MUS.next = 0;
  }
  function setMuted(m) { muted = m; if (ok()) target(M.master.gain, m ? 0 : 0.9, 0.05); }
  function setMusic(on) { musicOn = on; }

  window.JJ_SND = Object.assign({ init, update, setMuted, setMusic }, SFX);
})();