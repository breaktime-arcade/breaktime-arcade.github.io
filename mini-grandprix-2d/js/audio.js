// =============================================================
//  사운드: Web Audio로 직접 합성 (외부 파일 없음)
// =============================================================
class GameAudio {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // 엔진: 톱니파 + 사각파 → 저역통과
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0.0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    this.osc1.connect(this.engFilter); this.osc2.connect(g2); g2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.osc1.start(); this.osc2.start();

    // 타이어 끼익: 노이즈 → 대역통과
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    this.skidFilter = ctx.createBiquadFilter(); this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1400; this.skidFilter.Q.value = 6;
    this.skidGain = ctx.createGain(); this.skidGain.gain.value = 0;
    n.connect(this.skidFilter); this.skidFilter.connect(this.skidGain); this.skidGain.connect(this.master);
    n.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  update(speed, throttle, skid) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // 가상의 기어: 속도 구간마다 회전수가 올라갔다 떨어짐
    const gearSpan = 8.5;
    const gearPos = (speed % gearSpan) / gearSpan;
    const gear = Math.floor(speed / gearSpan);
    const rpm = 0.25 + gearPos * 0.75 * (1 - gear * 0.05);
    const f = 55 + rpm * 120 + gear * 8;
    this.osc1.frequency.setTargetAtTime(f, t, 0.03);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(400 + throttle * 900 + rpm * 500, t, 0.05);
    this.engGain.gain.setTargetAtTime(0.06 + throttle * 0.07 + Math.min(speed, 30) * 0.002, t, 0.05);
    this.skidGain.gain.setTargetAtTime(skid * 0.22, t, 0.04);
    this.skidFilter.frequency.setTargetAtTime(1200 + skid * 600, t, 0.05);
  }

  // 충돌음: 낮은 쿵 + 노이즈
  bump(power, high = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const vol = Math.min(1, power);
    const o = ctx.createOscillator(); o.type = high ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(high ? 700 : 140, t);
    o.frequency.exponentialRampToValueAtTime(high ? 300 : 45, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.55 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.15 : 0.3));
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.35);
    if (!high) {
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.4 * vol, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      n.connect(f); f.connect(ng); ng.connect(this.master); n.start(t); n.stop(t + 0.25);
    }
  }

  // 부스터: 위로 휘몰아치는 바람 소리 + 낮은 붕
  boost(vol = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t); n.stop(t + 1.2);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.6);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.25 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.9);
  }

  beep(freq, dur = 0.18) { this.jingle([[freq, dur]]); }

  // 젤리 범퍼: 통~
  boing() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(660, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(330, t + 0.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4);
  }

  // 효과음: 짧은 멜로디
  jingle(notes) {
    if (!this.ctx) return;
    const ctx = this.ctx; let t = ctx.currentTime;
    for (const [freq, dur] of notes) {
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.value = freq;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.95);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
      t += dur;
    }
  }
}
