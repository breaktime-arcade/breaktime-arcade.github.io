// 파도풀 안전요원 - Web Audio 합성 사운드
export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.vol = 0.9; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.55; this.amb.connect(this.master);
    // 노이즈 버퍼
    const len = c.sampleRate * 3, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3; }
    this.noise = b;
    this._ambience();
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.05); }

  _src(loop = true) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = loop; return s; }

  _ambience() {
    const c = this.ctx;
    // 파도
    const n = this._src(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.4;
    this.waveG = c.createGain(); this.waveG.gain.value = 0.25;
    n.connect(lp); lp.connect(this.waveG); this.waveG.connect(this.amb); n.start();
    const lfo = c.createOscillator(); lfo.frequency.value = 0.16; const lg = c.createGain(); lg.gain.value = 0.18; lfo.connect(lg); lg.connect(this.waveG.gain); lfo.start();
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.11; const lg2 = c.createGain(); lg2.gain.value = 260; lfo2.connect(lg2); lg2.connect(lp.frequency); lfo2.start();
    // 군중 웅성거림
    const n2 = this._src(); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.9;
    const bp2 = c.createBiquadFilter(); bp2.type = 'peaking'; bp2.frequency.value = 1400; bp2.gain.value = 6;
    this.crowdG = c.createGain(); this.crowdG.gain.value = 0.06;
    n2.playbackRate.value = 0.9; n2.connect(bp); bp.connect(bp2); bp2.connect(this.crowdG); this.crowdG.connect(this.amb); n2.start();
    // 비
    const n3 = this._src(); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
    this.rainG = c.createGain(); this.rainG.gain.value = 0; n3.connect(hp); hp.connect(this.rainG); this.rainG.connect(this.amb); n3.start();
    this._chatter();
  }

  // 멀리서 들리는 아이들 환호성
  _chatter() {
    const go = () => {
      if (!this.ctx) return;
      if (!this.muted && this.crowdOn !== false) this._squeal();
      setTimeout(go, 1500 + Math.random() * 4500);
    };
    setTimeout(go, 2000);
  }

  _squeal() {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'triangle';
    const f0 = 600 + Math.random() * 500;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (1.3 + Math.random() * 0.5), t + 0.12); o.frequency.linearRampToValueAtTime(f0 * 0.9, t + 0.38);
    const v = c.createOscillator(); v.frequency.value = 22; const vg = c.createGain(); vg.gain.value = 25; v.connect(vg); vg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.5;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012 + Math.random() * 0.012, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(f); f.connect(g); g.connect(this.amb); o.start(t); v.start(t); o.stop(t + 0.45); v.stop(t + 0.45);
  }

  setWaveLevel(k) { if (this.ctx) this.waveG.gain.setTargetAtTime(0.22 + k * 0.12, this.ctx.currentTime, 0.8); }
  setCrowd(k) { if (this.ctx) this.crowdG.gain.setTargetAtTime(0.03 + k * 0.05, this.ctx.currentTime, 1); }
  rain(on) { if (this.ctx) this.rainG.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 1.2); }

  _env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }

  whistle() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    for (const [st, du] of [[0, 0.22], [0.3, 0.55]]) {
      const o = c.createOscillator(), o2 = c.createOscillator(); o.type = 'sine'; o2.type = 'sine';
      o.frequency.value = 2950; o2.frequency.value = 3150;
      const am = c.createOscillator(); am.frequency.value = 28; const amg = c.createGain(); amg.gain.value = 0.45;
      const g = c.createGain(); const out = c.createGain(); out.gain.value = 0.55;
      am.connect(amg); amg.connect(g.gain);
      g.gain.setValueAtTime(0.0001, t + st); g.gain.linearRampToValueAtTime(0.5, t + st + 0.02); g.gain.setValueAtTime(0.5, t + st + du - 0.04); g.gain.linearRampToValueAtTime(0.0001, t + st + du);
      o.connect(g); o2.connect(g); g.connect(out); out.connect(this.sfx);
      const n = this._src(false); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 3; const ng = c.createGain(); this._env(ng, t + st, 0.02, 0.12, du);
      n.connect(bp); bp.connect(ng); ng.connect(this.sfx); n.start(t + st); n.stop(t + st + du + 0.05);
      [o, o2, am].forEach((x) => { x.start(t + st); x.stop(t + st + du + 0.05); });
    }
  }

  splash(power = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const n = this._src(false); const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    const g = c.createGain(); this._env(g, t, 0.01, 0.35 * power, 0.6 + power * 0.3);
    n.connect(f); f.connect(g); g.connect(this.sfx); n.start(t, Math.random() * 2); n.stop(t + 1.2);
  }

  whoosh() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const n = this._src(false); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.45); f.frequency.exponentialRampToValueAtTime(600, t + 0.85);
    const g = c.createGain(); this._env(g, t, 0.15, 0.25, 0.85);
    n.connect(f); f.connect(g); g.connect(this.sfx); n.start(t); n.stop(t + 0.9);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, at = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); this._env(g, t, 0.01, vol, dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  success(combo = 1) { const b = 660 * Math.pow(1.03, Math.min(combo, 12)); [0, 0.07, 0.14].forEach((d, i) => this.tone(b * [1, 1.26, 1.5][i], 0.25, 'triangle', 0.16, d)); this.tone(b * 2, 0.4, 'sine', 0.08, 0.2); }
  wrong() { this.tone(180, 0.28, 'square', 0.08); this.tone(140, 0.3, 'square', 0.08, 0.12); }
  click() { this.tone(1200, 0.05, 'sine', 0.06); }
  danger() { this.tone(880, 0.12, 'sine', 0.07); this.tone(880, 0.12, 'sine', 0.07, 0.18); }
  thud() { this.tone(90, 0.25, 'sine', 0.3); this.tone(60, 0.3, 'triangle', 0.2, 0.02); }
  glass() { if (!this.ctx) return; for (let i = 0; i < 7; i++) this.tone(2500 + Math.random() * 3000, 0.12 + Math.random() * 0.2, 'sine', 0.06, i * 0.03); }

  accident() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 3; i++) { this.tone(960, 0.18, 'sawtooth', 0.07, i * 0.36); this.tone(720, 0.18, 'sawtooth', 0.07, i * 0.36 + 0.18); }
  }

  siren() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t); o.frequency.linearRampToValueAtTime(820, t + 1.2); o.frequency.linearRampToValueAtTime(820, t + 1.8); o.frequency.linearRampToValueAtTime(300, t + 2.8);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.3); g.gain.setValueAtTime(0.12, t + 2.4); g.gain.linearRampToValueAtTime(0.0001, t + 2.9);
    o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 3);
  }

  chime() { [784, 659, 523].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.14, i * 0.28)); }
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.14, i * 0.11)); this.tone(1046, 0.8, 'sine', 0.1, 0.45); }
  countdown(last) { this.tone(last ? 1320 : 880, last ? 0.4 : 0.15, 'sine', 0.15); }

  speak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; u.rate = 1.08; u.pitch = 1; u.volume = this.muted ? 0 : 0.9;
      const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith('ko')); if (v) u.voice = v;
      if (this.ctx) { this.amb.gain.setTargetAtTime(0.25, this.ctx.currentTime, 0.2); u.onend = () => this.amb.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.4); }
      setTimeout(() => speechSynthesis.speak(u), 900);
    } catch (e) { /* 무시 */ }
  }

  announce(text) { this.chime(); this.speak(text); }
}
