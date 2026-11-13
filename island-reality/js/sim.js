/*!
 * 마지막 생존자 — AI 시뮬레이션 엔진
 * © 쉬는시간 오락실. All rights reserved.
 */
import { CHARACTERS, LINES, fill, josa } from './data.js';
import { mulberry32 } from './map.js';

const iya = (n) => { const c = n.charCodeAt(n.length - 1); return n + ((c - 0xac00) % 28 ? '이야' : '야'); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 페이즈별 시계(0~1, 하루 중 위치)와 지속 시간(초, 1배속 기준)
export const PHASES = {
  dawn: { c0: 0.0, c1: 0.07, dur: 4 },
  morning: { c0: 0.07, c1: 0.3, dur: 15 },
  challenge: { c0: 0.3, c1: 0.5, dur: 0 },
  afternoon: { c0: 0.5, c1: 0.65, dur: 10 },
  evening: { c0: 0.65, c1: 0.79, dur: 8 },
  council: { c0: 0.79, c1: 0.86, dur: 0 },
  night: { c0: 0.86, c1: 1.0, dur: 4.5 },
  finale: { c0: 0.8, c1: 0.86, dur: 0 },
  end: { c0: 0.83, c1: 0.83, dur: 0 },
};

class Agent {
  constructor(def, id, rng) {
    this.id = id; this.def = def; this.name = def.name;
    this.t = {};
    for (const k in def.t) this.t[k] = clamp(def.t[k] + (rng() - 0.5) * 0.16, 0.03, 0.99);
    this.hp = 100; this.hunger = 15 + rng() * 10; this.energy = 100; this.mood = 60;
    this.x = 0; this.z = 0; this.y = null; this.face = 0; this.speed = 0;
    this.anim = 'idle'; this.prop = null; this.task = null;
    this.alive = true; this.jury = false; this.out = false; this.outDay = 0; this.outReason = '';
    this.immune = false; this.idol = false; this.wins = 0; this.contribution = 0; this.dayWork = 0;
    this.votesCast = []; this.votesRecv = 0; this.alliance = null;
    this.stumble = 0; this.cool = {};
    this.label = '…';
  }
}

export class Sim {
  constructor(map, seed = (Math.random() * 1e9) | 0) {
    this.map = map; this.seed = seed; this.rng = mulberry32(seed);
    this.listeners = [];
    this.agents = CHARACTERS.map((d, i) => new Agent(d, i, this.rng));
    const N = this.agents.length;
    this.aff = [...Array(N)].map(() => new Array(N).fill(0));
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) {
      const a = this.agents[i].t, b = this.agents[j].t;
      // 성격 궁합 + 무작위 첫인상
      const compat = (1 - Math.abs(a.diligence - b.diligence)) * 6 + (1 - Math.abs(a.aggro - b.aggro)) * 4 + b.kindness * 6 + a.kindness * 3 - 9;
      this.aff[i][j] = compat + (this.rng() - 0.5) * 24;
    }
    this.day = 1; this.phase = 'dawn'; this.phaseT = 0; this.time = 0;
    this.food = 14; this.wood = 2; this.water = 12; this.shelter = 0;
    this.storm = false; this.stormTonight = false;
    this.alliances = []; this.allianceSeq = 0;
    this.idolSpot = this.pick(map.idolSpots); this.idolInPlay = true;
    this.challenge = null; this.councilState = null; this.councilResult = null;
    this.history = { councils: [], betrayals: 0, steals: 0, fights: 0, idolPlays: 0 };
    this.winner = null; this.finaleResult = null;
    this.lastChallenge = null;
    this.timers = [];
    // 시작 위치: 해변에 흩어져 도착
    this.agents.forEach((a, i) => {
      const s = map.fireSeats[i];
      a.x = s.x + (this.rng() - 0.5) * 2; a.z = s.z + (this.rng() - 0.5) * 2;
    });
    this.enterPhase('dawn');
  }

  // ── 유틸 ──
  on(fn) { this.listeners.push(fn); }
  after(sec, fn) { this.timers.push({ at: this.time + sec, fn }); }
  emit(type, data = {}) { for (const f of this.listeners) f(type, data); }
  r() { return this.rng(); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  pickNear(a, arr, k = 4) { let best = null, bd = 1e9; for (let i = 0; i < k; i++) { const p = this.pick(arr); const d = dist(a, p); if (d < bd) { bd = d; best = p; } } return best; }
  busy(type) { return this.alive().filter(x => x.task && x.task.type === type).length; }
  alive() { return this.agents.filter(a => a.alive); }
  get(id) { return this.agents[id]; }
  phaseDur() { const p = PHASES[this.phase]; const n = this.alive().length; return (this.phase === 'morning' || this.phase === 'afternoon') ? p.dur * (0.72 + 0.28 * n / 10) : p.dur; }
  clock() {
    const p = PHASES[this.phase];
    let prog = p.dur ? clamp(this.phaseT / this.phaseDur(), 0, 1) : 0.5;
    if (this.phase === 'challenge' && this.challenge) prog = clamp(this.challenge.t / 22, 0, 1);
    if (this.phase === 'council') prog = this.councilState ? clamp(this.phaseT / 14, 0, 1) : 0;
    return p.c0 + (p.c1 - p.c0) * prog;
  }
  say(a, key, names = {}, dur = 2.6) {
    const pool = Array.isArray(key) ? key : LINES[key];
    if (!pool) return;
    const text = fill(this.pick(pool), { a: a.name, ...names });
    this.emit('say', { id: a.id, text, dur });
    return text;
  }
  sayText(a, text, dur = 2.6) { this.emit('say', { id: a.id, text, dur }); }
  emote(a, e) { this.emit('emote', { id: a.id, emoji: e }); }
  log(text, kind = 'info', icon = '•', pos = null, prio = 0, extra = {}) {
    this.emit('log', { text, kind, icon, pos, prio, day: this.day, phase: this.phase, ...extra });
  }
  addAff(i, j, v) { if (i === j) return; this.aff[i][j] = clamp(this.aff[i][j] + v, -100, 100); }
  popularity(c) {
    const al = this.alive().filter(x => x !== c);
    if (!al.length) return 0;
    return al.reduce((s, x) => s + this.aff[x.id][c.id], 0) / al.length;
  }
  threat(c) { return c.wins * 9 + this.popularity(c) * 0.35 + c.contribution * 0.06 + c.t.strength * 6 + c.t.cunning * 5; }
  allianceOf(a) { return this.alliances.find(al => al.members.includes(a.id)); }

  // ── 페이즈 ──
  enterPhase(ph) {
    this.phase = ph; this.phaseT = 0;
    this.emit('phase', { phase: ph, day: this.day });
    const al = this.alive();
    if (ph === 'dawn') {
      this.immuneReset();
      al.forEach(a => { a.dayWork = 0; a.task = null; });
      if (this.day > 1) this.meal('아침');
      al.forEach((a, i) => this.assign(a, { type: 'gather', to: this.map.fireSeats[i % 10], anim: 'idle', label: 'gather' }));
    } else if (ph === 'morning' || ph === 'afternoon') {
      al.forEach(a => { a.task = null; });
    } else if (ph === 'challenge') {
      this.startChallenge();
    } else if (ph === 'evening') {
      al.forEach((a, i) => this.assign(a, { type: 'camp', to: this.map.fireSeats[i % 10], anim: 'sit', label: 'camp', hold: true }));
      this.campT = 2.5;
      this.eveningReview();
    } else if (ph === 'council') {
      this.councilState = null;
      al.forEach((a, i) => this.assign(a, { type: 'council', to: this.map.councilSeats[i], anim: 'sit', label: 'council', hold: true }));
    } else if (ph === 'night') {
      this.meal('저녁', true);
      this.stormTonight = this.day >= 2 && this.r() < 0.3;
      al.forEach((a, i) => this.assign(a, { type: 'sleep', to: this.map.sleepSpots[i], anim: 'sleep', label: 'sleep', hold: true }));
      if (this.stormTonight) { this.storm = true; this.emit('storm', { on: true }); this.log('폭풍우가 몰려온다! 은신처가 버텨줄까?', 'bad', '⛈️', this.map.shelter, 2); }
    } else if (ph === 'finale') {
      this.startFinale();
    }
  }
  nextPhase() {
    const order = { dawn: 'morning', morning: 'challenge', challenge: 'afternoon', afternoon: 'evening', evening: 'council', night: 'dawn' };
    if (this.phase === 'night') {
      this.endNight(); this.day++;
      if (this.phase === 'end') return;
      if (this.alive().length <= 3) { this.enterPhase('finale'); return; }
    }
    this.enterPhase(order[this.phase]);
  }

  meal(label, withWater = false) {
    const al = this.alive();
    const chef = al.find(a => a.def.cook);
    let fed = 0;
    for (const a of al.sort(() => this.r() - 0.5)) {
      if (this.food >= 1) { this.food -= 1; a.hunger = clamp(a.hunger - (chef ? 42 : 34), 0, 100); fed++; a.mood += 3; }
      else { a.mood -= 8; }
      if (withWater) { if (this.water >= 1) { this.water -= 1; } else { a.hp -= 9; a.mood -= 5; } }
    }
    if (fed < al.length && al.length - fed >= 2) this.log(`${label} 식량이 모자라 ${al.length - fed}명이 굶었다…`, 'bad', '🍽️', this.map.camp, 1);
    if (withWater && this.water <= 0) this.log('마실 물이 바닥났다! 모두 탈수 증세…', 'bad', '💧', this.map.spring, 1);
    if (chef && fed && this.r() < 0.6) this.say(chef, 'cookTalk');
  }

  endNight() {
    const al = this.alive();
    const q = this.shelter;
    for (const a of al) {
      a.energy = clamp(45 + q * 0.55, 0, 100);
      if (q < 35) { a.hp -= 6; a.mood -= 6; }
      if (this.stormTonight && q < 70) { a.hp -= 12; a.mood -= 10; }
      if (a.hunger < 55) a.hp = clamp(a.hp + 10, 0, 100);
    }
    if (this.stormTonight) {
      if (q < 70) this.log('비바람에 밤새 떨었다. 모두 체력이 크게 떨어졌다.', 'bad', '🌧️', this.map.shelter, 1);
      else this.log('튼튼한 은신처 덕분에 폭풍을 버텼다!', 'good', '🛖', this.map.shelter, 1);
      this.shelter = clamp(this.shelter - (q < 70 ? 25 : 10), 0, 100);
    }
    this.storm = false; this.emit('storm', { on: false });
    if (this.idolInPlay === false && this.r() < 0.6) { this.idolInPlay = true; this.idolSpot = this.pick(this.map.idolSpots); this.log('섬 어딘가에 새로운 면책 조개가 숨겨졌다는 소문이…', 'drama', '🐚', null, 0); }
    this.checkEvac();
  }

  immuneReset() { this.agents.forEach(a => { a.immune = false; }); }

  // 저녁: 하루 일한 양 평가 + 치료
  eveningReview() {
    const al = this.alive();
    const avg = al.reduce((s, a) => s + a.dayWork, 0) / al.length;
    let lazy = null;
    for (const a of al) {
      for (const o of al) if (o !== a) {
        if (a.dayWork === 0) this.addAff(o.id, a.id, -7 * o.t.diligence);
        else if (a.dayWork >= Math.max(3, avg + 1)) this.addAff(o.id, a.id, 3 + 3 * o.t.diligence);
      }
      if (a.dayWork === 0 && (!lazy || this.r() < 0.5)) lazy = a;
    }
    if (lazy) this.log(`${josa(lazy.name, '은')} 오늘 하루 종일 빈둥거렸다… (모두의 눈총)`, 'bad', '😒', null, 0, { who: [lazy.id] });
    const nurse = al.find(a => a.def.healer);
    if (nurse) {
      const hurt = al.filter(a => a !== nurse && a.hp < 75).sort((x, y) => x.hp - y.hp)[0];
      if (hurt) { hurt.hp = clamp(hurt.hp + 18, 0, 100); this.addAff(hurt.id, nurse.id, 8); this.say(nurse, 'heal', { b: hurt.name }); this.log(`${josa(nurse.name, '이')} ${josa(hurt.name, '을')} 치료해줬다.`, 'good', '🩹', null, 0, { who: [nurse.id, hurt.id] }); }
    }
  }

  // ── 업데이트 ──
  update(dt) {
    if (this.phase === 'end') { this.time += dt; this.updateAgents(dt); return; }
    let left = dt;
    while (left > 0) { const s = Math.min(left, 0.05); this.step(s); left -= s; }
  }
  step(dt) {
    this.time += dt; this.phaseT += dt;
    const ph = this.phase;
    // 욕구
    if (ph !== 'council' && ph !== 'finale') for (const a of this.alive()) {
      a.hunger = clamp(a.hunger + dt * (ph === 'night' ? 0.2 : 0.5), 0, 100);
      if (a.hunger > 92) a.hp -= dt * 0.4;
      if (a.energy < 8) a.hp -= dt * 0.3;
      a.mood = clamp(a.mood, 0, 100);
      if (a.hp <= 0 && !a.dying) { a.dying = true; }
    }
    this.updateAgents(dt);
    if (this.timers.length) { const now = this.time; const due = this.timers.filter(t => t.at <= now); this.timers = this.timers.filter(t => t.at > now); due.forEach(t => t.fn()); }

    if (ph === 'challenge') this.updateChallenge(dt);
    else if (ph === 'evening') this.updateCamp(dt);
    else if (ph === 'council') this.updateCouncil(dt);
    else if (ph === 'finale') this.updateFinale(dt);
    else if (ph === 'morning' || ph === 'afternoon') this.updateActivity(dt);

    const p = PHASES[ph];
    if (p.dur && this.phaseT >= this.phaseDur()) {
      if (ph === 'evening' && this.alive().length <= 3) { this.enterPhase('finale'); }
      else this.nextPhase();
    }
    if (ph !== 'council' && ph !== 'finale') this.checkEvac();
  }

  checkEvac() {
    for (const a of this.alive()) if (a.hp <= 0) {
      if (this.alive().length <= 3) { a.hp = 4; continue; }
      a.hp = 0;
      this.say(a, 'evac', {}, 3);
      this.eliminate(a, 'evac');
      this.log(`${josa(a.name, '이')} 탈진으로 쓰러졌다! 의료진이 긴급 이송한다.`, 'bad', '🚑', { x: a.x, z: a.z }, 3, { who: [a.id] });
      this.emit('boat', { id: a.id });
      if (this.alive().length <= 1) this.finishGame(this.alive()[0]);
    }
  }

  eliminate(a, reason) {
    a.alive = false; a.jury = true; a.out = true; a.outDay = this.day; a.outReason = reason; a.task = null; a.idol = false; a.immune = false;
    const al = this.allianceOf(a);
    if (al) { al.members = al.members.filter(m => m !== a.id); if (al.members.length < 2) this.alliances = this.alliances.filter(x => x !== al); }
    for (const x of this.alliances) if (x.target === a.id) x.target = null;
  }

  // ── 이동/태스크 ──
  assign(a, task) {
    a.task = { stage: 'go', t: 0, dur: 4, ...task };
    a.label = task.label || task.type;
  }
  moveToward(a, tx, tz, spd, dt) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { a.speed = 0; return true; }
    const s = Math.min(d, spd * dt);
    a.x += (dx / d) * s; a.z += (dz / d) * s;
    a.face = Math.atan2(dx, dz); a.speed = spd;
    return d < 0.5;
  }
  updateAgents(dt) {
    const list = this.agents.filter(a => a.alive || a.task);
    // 간단한 분리(겹침 방지)
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!a.alive || !b.alive) continue;
      if (this.phase === 'challenge' && this.challenge && this.challenge.stage !== 'gather') continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d > 0.0001 && d < 0.85) {
        const push = (0.85 - d) * 0.5;
        if (a.speed > 0 || !a.task || a.task.stage === 'go') { a.x -= dx / d * push; a.z -= dz / d * push; }
        if (b.speed > 0 || !b.task || b.task.stage === 'go') { b.x += dx / d * push; b.z += dz / d * push; }
      }
    }
    for (const a of list) {
      if (a.stumble > 0) { a.stumble -= dt; a.anim = 'fallen'; a.speed = 0; continue; }
      const tk = a.task;
      if (!tk) { a.anim = 'idle'; a.speed = 0; a.prop = null; continue; }
      if (tk.stage === 'go') {
        let to = tk.to;
        if (tk.follow != null) { const f = this.agents[tk.follow]; to = { x: f.x, z: f.z }; }
        const run = tk.run;
        const spd = (run ? 7.6 : 4.6) * (0.55 + 0.45 * clamp(a.energy / 100, 0, 1)) * (tk.spd || 1);
        a.anim = run ? 'run' : 'walk'; a.prop = null;
        const arrived = this.moveToward(a, to.x, to.z, spd, dt);
        tk.t += dt;
        if (tk.follow != null ? dist(a, to) < 1.5 : arrived) {
          tk.stage = 'do'; tk.t = 0; a.speed = 0;
          const f = tk.to && tk.to.face;
          if (f) a.face = Math.atan2(f.x - a.x, f.z - a.z);
          a.anim = tk.anim || 'idle'; a.prop = tk.prop || null;
          tk.onArrive && tk.onArrive(a, tk);
        } else if (tk.t > (tk.timeout || 18)) { tk.onFail ? tk.onFail(a, tk) : (a.task = null); }
      } else {
        tk.t += dt;
        a.anim = tk.anim || 'idle'; a.prop = tk.prop || null;
        if (a.energy > 0 && tk.cost) a.energy = clamp(a.energy - tk.cost * dt, 0, 100);
        tk.onTick && tk.onTick(a, tk, dt);
        if (!tk.hold && tk.t >= tk.dur) { const done = tk.onDone; a.task = null; done && done(a, tk); }
      }
    }
  }

  // ── 활동 시간: 유틸리티 AI ──
  updateActivity(dt) {
    for (const a of this.alive()) {
      if (!a.task && a.stumble <= 0) this.decide(a);
    }
    // 랜덤 속마음 인터뷰
    if (this.r() < dt * 0.09) this.confessional();
  }
  confessional() {
    const al = this.alive(); if (al.length < 3) return;
    const a = this.pick(al);
    const others = al.filter(x => x !== a);
    const hate = others.reduce((m, x) => this.aff[a.id][x.id] < this.aff[a.id][m.id] ? x : m, others[0]);
    const like = others.reduce((m, x) => this.aff[a.id][x.id] > this.aff[a.id][m.id] ? x : m, others[0]);
    const thr = others.reduce((m, x) => this.threat(x) > this.threat(m) ? x : m, others[0]);
    if (this.aff[a.id][hate.id] < -30) this.say(a, 'confessHate', { c: hate.name }, 3);
    else if (a.t.cunning > 0.6) this.say(a, 'confessThreat', { c: thr.name }, 3);
    else if (this.aff[a.id][like.id] > 30) this.say(a, 'confessLike', { c: like.name }, 3);
  }

  decide(a) {
    const al = this.alive();
    const n = al.length;
    const foodNeed = clamp((n * 2 - this.food) / (n * 2), 0, 1);
    const t = a.t, R = () => this.r();
    const opts = [];
    const add = (k, u) => opts.push([k, u + R() * 22 - this.busy(k) * 7]);
    add('fish', 18 + foodNeed * 35 + t.fishing * 28 + t.diligence * 18 - (100 - a.energy) * 0.15);
    add('fruit', 14 + foodNeed * 26 + t.diligence * 12);
    add('wood', 10 + (this.wood < 6 ? 20 : 0) + t.diligence * 15 + t.strength * 10 + (a.def.survivor ? 10 : 0));
    if (this.wood >= 2 && this.shelter < 100) add('build', 12 + (this.shelter < 60 ? 20 : 5) + t.diligence * 18 + (a.def.survivor ? 12 : 0));
    add('water', 8 + (this.water < n ? 34 : 0) + t.diligence * 8);
    add('rest', 6 + (100 - a.energy) * 0.45 + (1 - t.diligence) * 38);
    add('social', 16 + t.social * 38 + (a.mood < 40 ? 8 : 0));
    if (n >= 4) add('scheme', 8 + t.cunning * 40 + (n <= 8 ? 12 : 0) - (this.allianceOf(a) && this.allianceOf(a).target != null ? 12 : 0));
    if (this.idolInPlay && !a.idol) add('idol', -4 + t.cunning * 24 + t.observe * 16 + (this.popularity(a) < -5 ? 12 : 0));
    if (a.hunger > 60 && this.food > 0) add('steal', -2 + (1 - t.kindness) * 40 + (a.hunger - 60) * 1.4);
    opts.sort((x, y) => y[1] - x[1]);
    const choice = opts[0][0];
    this['do_' + choice](a);
  }

  workDone(a, amount = 1) { a.dayWork += amount; a.contribution += amount; }

  do_fish(a) {
    const s = this.pickNear(a, this.map.fishSpots);
    this.assign(a, {
      type: 'fish', to: s, anim: 'fish', prop: 'rod', dur: 5 + this.r() * 3, cost: 1.2, label: 'fish',
      onArrive: (a) => { if (this.r() < 0.3) this.say(a, 'fish'); },
      onDone: (a) => {
        const k = a.t.fishing;
        const got = Math.floor(this.r() * (2 + k * 3.4) + k * 1.2);
        this.food += got; this.workDone(a, got > 0 ? 1 + got * 0.5 : 0.5);
        if (got >= 3) { this.say(a, 'fishGood'); this.emote(a, '🐟'); this.log(`${josa(a.name, '이')} 물고기 ${got}마리를 낚았다!`, 'good', '🎣', a, 1, { who: [a.id] }); }
        else if (got === 0) { if (this.r() < 0.5) this.say(a, 'fishBad'); }
        else this.emote(a, '🐟');
      },
    });
  }
  do_fruit(a) {
    const s = this.pickNear(a, this.map.fruitSpots);
    this.assign(a, {
      type: 'fruit', to: s, anim: 'gather', dur: 4 + this.r() * 2, cost: 0.8, label: 'fruit',
      onDone: (a) => { const got = 1 + (this.r() < 0.6 ? 1 : 0) + (this.r() < 0.2 ? 1 : 0); this.food += got; this.workDone(a, 1); this.emote(a, '🥥'); if (this.r() < 0.25) this.say(a, 'fruit'); },
    });
  }
  do_wood(a) {
    const s = this.pickNear(a, this.map.woodSpots);
    this.assign(a, {
      type: 'wood', to: s, anim: 'chop', prop: 'axe', dur: 4.5 + this.r() * 2, cost: 2.2, label: 'wood',
      onDone: (a) => { const got = 1 + Math.floor(a.t.strength * 2 + this.r()); this.wood += got; this.workDone(a, 1); this.emote(a, '🪵'); if (this.r() < 0.25) this.say(a, 'wood'); },
    });
  }
  do_build(a) {
    this.assign(a, {
      type: 'build', to: { x: this.map.shelter.x + (this.r() - 0.5) * 4, z: this.map.shelter.z + 2.6, face: this.map.shelter }, anim: 'build', prop: 'hammer', dur: 5, cost: 2, label: 'build',
      onArrive: (a) => { if (this.r() < 0.3) this.say(a, 'build'); },
      onDone: (a) => {
        if (this.wood < 2) return;
        this.wood -= 2;
        const before = this.shelter;
        this.shelter = clamp(this.shelter + 9 + a.t.diligence * 6 + (a.def.survivor ? 6 : 0), 0, 100);
        this.workDone(a, 1.5);
        for (const th of [30, 60, 100]) if (before < th && this.shelter >= th) this.log(th === 100 ? '은신처 완성! 이제 폭풍도 무섭지 않다.' : `은신처 공사 ${th}% 돌파!`, 'good', '🛖', this.map.shelter, 1, { who: [a.id] });
      },
    });
  }
  do_water(a) {
    this.assign(a, {
      type: 'water', to: { x: this.map.spring.x + 2.2, z: this.map.spring.z + 1, face: this.map.spring }, anim: 'gather', prop: 'bucket', dur: 3.5, cost: 1, label: 'water',
      onDone: (a) => { this.water += 4; this.workDone(a, 1); this.emote(a, '💧'); if (this.r() < 0.25) this.say(a, 'water'); },
    });
  }
  do_rest(a) {
    const shade = this.r() < 0.5 ? this.pickNear(a, this.map.palms) : this.map.camp;
    this.assign(a, {
      type: 'rest', to: { x: shade.x + 1.4, z: shade.z + 1.2 }, anim: 'rest', dur: 5 + this.r() * 3, label: 'rest',
      onArrive: (a) => { if (a.hunger > 70) this.say(a, 'hungry'); else if (this.r() < 0.35) this.say(a, 'rest'); },
      onTick: (a, tk, dt) => { a.energy = clamp(a.energy + dt * 7, 0, 100); },
    });
  }

  findPartner(a, mode) {
    const others = this.alive().filter(b => b !== a && (!b.task || ['rest', 'fruit', 'fish', 'wood', 'water', 'gather'].includes(b.task.type)));
    if (!others.length) return null;
    let best = null, bs = -1e9;
    for (const b of others) {
      let s = this.r() * 30 - dist(a, b) * 0.4;
      if (mode === 'friend') s += this.aff[a.id][b.id];
      if (mode === 'enemy') s -= this.aff[a.id][b.id];
      if (mode === 'ally') s += this.aff[a.id][b.id] * 1.2 + b.t.cunning * 10;
      if (s > bs) { bs = s; best = b; }
    }
    return best;
  }

  // 두 사람의 대화 시퀀스
  converse(a, b, script, onEnd) {
    const total = script.length * 1.9 + 0.8;
    const face = (x, y) => { x.face = Math.atan2(y.x - x.x, y.z - x.z); };
    b.task = { type: 'listen', stage: 'do', t: 0, dur: total + 0.5, anim: 'talk', label: 'listen' };
    b.label = 'listen';
    face(b, a);
    this.assign(a, { type: a.task.type, stage: 'do', t: 0, dur: total, anim: 'talk', label: a.task.label });
    a.task.stage = 'do';
    face(a, b);
    let idx = 0;
    a.task.onTick = (x, tk) => {
      face(a, b); face(b, a);
      while (idx < script.length && tk.t >= idx * 1.9) {
        const [who, txt] = script[idx];
        this.sayText(who === 0 ? a : b, txt, 2.1);
        idx++;
      }
    };
    a.task.onDone = () => { if (b.task && b.task.type === 'listen') b.task = null; onEnd && onEnd(); };
  }

  do_social(a) {
    const enemyMode = a.t.aggro > 0.5 && this.r() < a.t.aggro * 0.6;
    const b = this.findPartner(a, enemyMode ? 'enemy' : 'friend');
    if (!b) return this.do_rest(a);
    this.assign(a, {
      type: 'social', follow: b.id, anim: 'talk', label: 'social', timeout: 10,
      onArrive: (a) => {
        if (!b.alive || (b.task && ['social', 'listen', 'scheme'].includes(b.task.type))) { a.task = null; return; }
        const ab = this.aff[a.id][b.id];
        const names = { a: a.name, b: b.name };
        if (enemyMode && ab < 0) {
          // 말다툼
          const script = [[0, fill(this.pick(LINES.argue), names)], [1, fill(this.pick(LINES.argueRe), names)]];
          if (this.r() < 0.5) script.push([0, fill(this.pick(LINES.argue), names)]);
          this.converse(a, b, script, () => {
            const v = 8 + this.r() * 12;
            this.addAff(a.id, b.id, -v); this.addAff(b.id, a.id, -v * (1.2 - b.t.kindness * 0.5));
            this.emote(a, '💢'); this.emote(b, '💢');
            this.history.fights++;
            this.log(`${josa(a.name, '과')} ${josa(b.name, '이')} 크게 말다툼했다!`, 'bad', '💢', a, 2, { who: [a.id, b.id] });
            // 하은이 근처면 말림
            const nurse = this.alive().find(x => x.def.healer && dist(x, a) < 14);
            if (nurse && this.r() < 0.7) { this.sayText(nurse, '둘 다 그만해요!'); this.addAff(a.id, nurse.id, 3); this.addAff(b.id, nurse.id, 3); }
          });
        } else if (this.r() < 0.28 && this.alive().length > 3) {
          // 뒷담화
          const c = this.alive().filter(x => x !== a && x !== b).reduce((m, x) => this.aff[a.id][x.id] < this.aff[a.id][m.id] ? x : m);
          const nm = { ...names, c: c.name };
          this.converse(a, b, [[0, fill(this.pick(LINES.gossip), nm)], [1, fill(this.pick(LINES.gossipRe), nm)]], () => {
            const trust = clamp(this.aff[b.id][a.id] / 60, -0.5, 1);
            this.addAff(b.id, c.id, -6 * trust - 2);
            this.addAff(a.id, b.id, 3); this.addAff(b.id, a.id, 2);
            this.overhearCheck(a, c, 9);
          });
        } else {
          const friendly = ab > 18;
          const script = friendly
            ? [[0, fill(this.pick(LINES.chatFriend), names)], [1, fill(this.pick(LINES.chatFriendRe), names)]]
            : [[0, fill(this.pick(LINES.chatNeutral), names)], [1, fill(this.pick(LINES.chatNeutralRe), names)]];
          if (a.def.name === '민호' && this.r() < 0.6) script.push([0, this.pick(a.def.catch)]);
          this.converse(a, b, script, () => {
            const comp = 1 - Math.abs(a.t.social - b.t.social) * 0.5;
            const v = (3 + this.r() * 6) * comp * (0.6 + a.t.social * 0.6);
            this.addAff(a.id, b.id, v); this.addAff(b.id, a.id, v * (0.7 + b.t.kindness * 0.5));
            a.mood += 4; b.mood += 3;
            if (this.aff[a.id][b.id] > 45 && this.aff[b.id][a.id] > 45 && this.r() < 0.4) { this.emote(a, '❤️'); this.emote(b, '❤️'); this.log(`${josa(a.name, '과')} ${josa(b.name, '은')} 이제 절친이 됐다.`, 'good', '❤️', a, 1, { who: [a.id, b.id] }); }
            else this.emote(a, '😊');
          });
        }
      },
      onFail: (a) => { a.task = null; },
    });
  }

  overhearCheck(speaker, victim, range) {
    if (!victim.alive) return false;
    if (dist(speaker, victim) < range && this.r() < 0.35 + victim.t.observe * 0.4) {
      this.say(victim, 'overhear', {}, 2.4);
      this.addAff(victim.id, speaker.id, -22);
      this.emote(victim, '👀');
      this.log(`${josa(victim.name, '이')} ${josa(speaker.name, '이')} 자기 얘기를 하는 걸 엿들었다!`, 'drama', '👂', victim, 2, { who: [victim.id, speaker.id] });
      return true;
    }
    return false;
  }

  do_scheme(a) {
    const al = this.alive();
    const myAl = this.allianceOf(a);
    let b = this.findPartner(a, 'ally');
    if (!b) return this.do_rest(a);
    this.assign(a, {
      type: 'scheme', follow: b.id, anim: 'talk', label: 'scheme', timeout: 10, run: false,
      onArrive: (a) => {
        if (!b.alive || (b.task && ['social', 'listen', 'scheme'].includes(b.task.type))) { a.task = null; return; }
        const cands = al.filter(x => x.alive && x !== a && x !== b && !(myAl && myAl.members.includes(x.id)));
        if (!cands.length) { a.task = null; return; }
        const c = cands.reduce((m, x) => {
          const s = -this.aff[a.id][x.id] - this.aff[b.id][x.id] * 0.5 + this.threat(x) * a.t.cunning;
          const ms = -this.aff[a.id][m.id] - this.aff[b.id][m.id] * 0.5 + this.threat(m) * a.t.cunning;
          return s > ms ? x : m;
        });
        const names = { a: a.name, b: b.name, c: c.name };
        const accept = this.aff[b.id][a.id] > 3 && this.aff[b.id][c.id] < this.aff[b.id][a.id] - 5 && this.r() < 0.85;
        const script = [[0, fill(this.pick(LINES.scheme), names)], [1, fill(this.pick(accept ? LINES.schemeYes : LINES.schemeNo), names)]];
        this.converse(a, b, script, () => {
          if (accept) {
            this.formAlliance(a, b, c);
            this.addAff(a.id, b.id, 6); this.addAff(b.id, a.id, 6); this.addAff(a.id, c.id, -4); this.addAff(b.id, c.id, -6);
            this.emote(a, '🤝'); this.emote(b, '🤝');
          } else { this.addAff(a.id, b.id, -3); if (this.aff[b.id][c.id] > 25) { this.addAff(c.id, a.id, -12); this.addAff(b.id, a.id, -6); } }
          this.overhearCheck(a, c, 10);
        });
      },
      onFail: (a) => { a.task = null; },
    });
  }

  formAlliance(a, b, target) {
    const A = this.allianceOf(a), B = this.allianceOf(b);
    const names = ['해변', '코코넛', '불꽃', '파도', '야자수', '조개', '별빛', '갈매기', '산호'];
    if (A && B && A === B) { A.target = target.id; this.log(`🤫 ${A.name} 동맹, 오늘의 표적은 ${target.name}.`, 'drama', '🎯', a, 1, { who: [a.id, b.id, target.id] }); return; }
    if (A && !B) { A.members.push(b.id); A.target = target.id; this.log(`${josa(b.name, '이')} ${A.name} 동맹에 합류했다. 표적은 ${target.name}!`, 'drama', '🤝', a, 2, { who: [a.id, b.id, target.id] }); return; }
    if (B && !A) { B.members.push(a.id); B.target = target.id; this.log(`${josa(a.name, '이')} ${B.name} 동맹에 합류했다. 표적은 ${target.name}!`, 'drama', '🤝', a, 2, { who: [a.id, b.id, target.id] }); return; }
    if (A && B) {
      // 둘 다 다른 동맹: a가 B로 갈아탐 = 배신
      if (this.r() < a.t.cunning * (1 - a.t.loyalty)) {
        A.members = A.members.filter(m => m !== a.id);
        for (const m of A.members) this.addAff(m, a.id, -18);
        B.members.push(a.id); B.target = target.id;
        if (A.members.length < 2) this.alliances = this.alliances.filter(x => x !== A);
        this.log(`${josa(a.name, '이')} ${A.name} 동맹을 버리고 ${B.name} 동맹으로 갈아탔다!`, 'drama', '🗡️', a, 3, { who: [a.id, b.id] });
      }
      return;
    }
    const al = { id: ++this.allianceSeq, name: names[(this.allianceSeq - 1) % names.length], members: [a.id, b.id], target: target.id, color: ['#ff9f43', '#4ecdc4', '#a78bfa', '#f472b6', '#facc15', '#60a5fa'][(this.allianceSeq - 1) % 6] };
    this.alliances.push(al);
    this.log(`${josa(a.name, '과')} ${josa(b.name, '이')} '${al.name} 동맹'을 결성했다! 표적은 ${target.name}.`, 'drama', '🤝', a, 3, { who: [a.id, b.id, target.id] });
  }

  do_idol(a) {
    const near = this.r() < 0.35 + a.t.observe * 0.35;
    const spot = near ? this.idolSpot : this.pick(this.map.idolSpots);
    this.assign(a, {
      type: 'idol', to: spot, anim: 'search', dur: 4, label: 'idol',
      onArrive: (a) => { if (this.r() < 0.5) this.say(a, 'idolSearch'); },
      onDone: (a) => {
        if (this.idolInPlay && spot === this.idolSpot && this.r() < 0.45 + a.t.observe * 0.4) {
          this.idolInPlay = false; a.idol = true;
          this.say(a, 'idolFound', {}, 3.2); this.emote(a, '🐚');
          this.log(`${josa(a.name, '이')} 몰래 '면책 조개'를 찾아냈다! (아무도 모른다)`, 'drama', '🐚', a, 3, { who: [a.id] });
          // 목격자
          const w = this.alive().find(x => x !== a && dist(x, a) < 9 && this.r() < x.t.observe * 0.6);
          if (w) { this.addAff(w.id, a.id, -8); this.log(`…하지만 ${josa(w.name, '이')} 그 장면을 봤다.`, 'drama', '👀', w, 2, { who: [w.id, a.id] }); a.idolKnownBy = w.id; }
        }
      },
    });
  }

  do_steal(a) {
    this.assign(a, {
      type: 'steal', to: { x: this.map.stash.x + 1, z: this.map.stash.z + 1, face: this.map.stash }, anim: 'gather', dur: 2.2, label: 'steal',
      onArrive: (a) => { this.say(a, 'steal'); },
      onDone: (a) => {
        if (this.food <= 0) return;
        this.food -= 1; a.hunger = clamp(a.hunger - 35, 0, 100);
        this.history.steals++;
        const w = this.alive().filter(x => x !== a && dist(x, a) < 12 && x.task?.type !== 'sleep').sort((x, y) => dist(x, a) - dist(y, a))[0];
        if (w && this.r() < 0.45 + w.t.observe * 0.45) {
          this.converse(w, a, [[0, fill(this.pick(LINES.caught), { b: a.name })], [1, this.pick(LINES.caughtRe)]], null);
          this.addAff(w.id, a.id, -35);
          for (const o of this.alive()) if (o !== a && o !== w) this.addAff(o.id, a.id, -8 - o.t.diligence * 6);
          this.emote(w, '😡');
          this.log(`${josa(a.name, '이')} 공동 식량을 몰래 먹다가 ${w.name}에게 들켰다!`, 'bad', '🫣', a, 3, { who: [a.id, w.id] });
        } else {
          this.log(`${josa(a.name, '이')} 아무도 모르게 식량 하나를 먹어치웠다…`, 'drama', '🤫', a, 1, { who: [a.id] });
        }
      },
    });
  }

  // ── 저녁 캠프파이어 ──
  updateCamp(dt) {
    this.campT -= dt;
    if (this.campT > 0) return;
    this.campT = 1.6 + this.r() * 0.8;
    const al = this.alive().filter(a => a.task && a.task.type === 'camp' && a.task.stage === 'do');
    if (al.length < 2) return;
    const a = this.pick(al);
    const roll = this.r();
    const myAl = this.allianceOf(a);
    if (a.def.name === '민호' && roll < 0.5) {
      this.say(a, 'campJoke'); a.anim = 'cheer';
      this.after(1.2, () => { for (const b of al) if (b !== a && this.r() < 0.4) { this.say(b, 'campLaugh', {}, 1.6); this.addAff(b.id, a.id, 2); } });
    } else if (myAl && myAl.target != null && roll < 0.45) {
      const mate = this.agents[this.pick(myAl.members.filter(m => m !== a.id) || [a.id])];
      const tgt = this.agents[myAl.target];
      if (mate && tgt && tgt.alive) { this.sayText(a, `(속닥) ${mate.name}, 오늘은 ${iya(tgt.name)}.`, 2.4); this.overhearCheck(a, tgt, 6); }
    } else if (roll < 0.7) this.say(a, 'campTalk');
    else this.confessional();
  }

  // ── 생존 미션 ──
  startChallenge() {
    const al = this.alive();
    let type = this.r() < 0.5 ? 'race' : 'endurance';
    if (this.lastChallenge === type && this.r() < 0.7) type = type === 'race' ? 'endurance' : 'race';
    this.lastChallenge = type;
    const ch = this.challenge = { type, stage: 'gather', t: 0, winner: null, order: [], out: [] };
    if (type === 'race') {
      const c = this.map.raceCourse;
      const dx = c[1].x - c[0].x, dz = c[1].z - c[0].z, d = Math.hypot(dx, dz);
      ch.nx = -dz / d; ch.nz = dx / d;
      al.forEach((a, i) => {
        const off = (i - (al.length - 1) / 2) * 1.0;
        a.lane = off; a.wp = 1; a.finished = false;
        this.assign(a, { type: 'challenge', to: { x: c[0].x + ch.nx * off - dx / d * 1.5, z: c[0].z + ch.nz * off - dz / d * 1.5, face: c[1] }, anim: 'ready', label: 'challenge', hold: true, timeout: 30, run: true });
      });
      this.log('오늘의 생존 미션: 해변 달리기! 1등은 면책 목걸이를 받는다.', 'system', '🏁', c[0], 3, { banner: '생존 미션 · 해변 달리기' });
    } else {
      const posts = this.map.posts;
      al.forEach((a, i) => {
        a.post = posts[i]; a.onPost = false; a.fell = false; a.wobble = 0;
        this.assign(a, { type: 'challenge', to: posts[i], anim: 'ready', label: 'challenge', hold: true, timeout: 30, run: true, spd: 0.8 });
      });
      this.log('오늘의 생존 미션: 기둥 버티기! 마지막까지 버틴 사람이 면책을 얻는다.', 'system', '🪵', posts[4], 3, { banner: '생존 미션 · 기둥 버티기' });
    }
    this.emit('challenge', { type });
  }
  updateChallenge(dt) {
    const ch = this.challenge; if (!ch) return;
    ch.t += dt;
    const al = this.alive();
    if (ch.stage === 'gather') {
      const ready = al.every(a => a.task && a.task.stage === 'do');
      if (ready || ch.t > 7) {
        ch.stage = 'count'; ch.cd = 3;
        al.forEach(a => { if (a.task) { a.task.stage = 'do'; } });
        if (ch.type === 'race') { al.forEach(a => { const c = this.map.raceCourse; a.x = c[0].x + ch.nx * a.lane; a.z = c[0].z + ch.nz * a.lane; }); }
        else al.forEach(a => { a.x = a.post.x; a.z = a.post.z; a.onPost = true; a.y = a.post.top; a.task.anim = 'post'; });
        this.emit('countdown', { n: 3 });
      }
      return;
    }
    if (ch.stage === 'count') {
      const prev = Math.ceil(ch.cd);
      ch.cd -= dt;
      if (Math.ceil(ch.cd) !== prev && ch.cd > 0) this.emit('countdown', { n: Math.ceil(ch.cd) });
      if (ch.cd <= 0) { ch.stage = 'run'; ch.runT = 0; this.emit('countdown', { n: 0 }); al.forEach(a => { if (this.r() < 0.35) this.say(a, 'chStart', {}, 1.6); }); }
      return;
    }
    if (ch.stage === 'run') {
      ch.runT += dt;
      if (ch.type === 'race') this.raceTick(dt, al); else this.enduranceTick(dt, al);
    }
    if (ch.stage === 'done') {
      ch.doneT += dt;
      if (ch.doneT > 3) {
        al.forEach(a => { a.y = null; a.onPost = false; a.task = null; });
        this.challenge = null; this.nextPhase();
      }
    }
  }
  raceTick(dt, al) {
    const ch = this.challenge, c = this.map.raceCourse;
    for (const a of al) {
      if (a.finished) continue;
      if (a.stumble > 0) continue;
      const wp = c[a.wp];
      const tx = wp.x + ch.nx * a.lane, tz = wp.z + ch.nz * a.lane;
      const base = 6.0 * (0.62 + 0.45 * a.t.strength) * (0.65 + 0.35 * a.energy / 100) * (1 - a.hunger / 280);
      a.sprint = a.sprint ?? 1; if (this.r() < dt * 0.8) a.sprint = 0.88 + this.r() * 0.24;
      a.anim = 'run'; a.task.anim = 'run';
      if (this.moveToward(a, tx, tz, base * a.sprint, dt)) {
        a.wp++;
        if (a.wp >= c.length) {
          a.finished = true; ch.order.push(a.id); a.task.anim = ch.order.length === 1 ? 'cheer' : 'idle'; a.speed = 0;
          if (ch.order.length === 1) this.winChallenge(a);
        }
      }
      a.energy = clamp(a.energy - dt * 1.6, 0, 100);
      if (this.r() < dt * (0.016 + (1 - a.t.courage) * 0.02) && ch.runT > 1) {
        a.stumble = 1.1; this.say(a, 'chStumble', {}, 1.4);
        if (this.r() < 0.3) this.log(`${josa(a.name, '이')} 모래에 발이 걸려 넘어졌다!`, 'info', '💥', a, 1, { who: [a.id] });
      }
    }
    // 응원(미션 미참가 탈락자 없음) — 완주자 응원
    if (ch.order.length && this.r() < dt * 1.2) { const f = this.agents[this.pick(ch.order)]; this.say(f, 'chCheer', {}, 1.3); }
    if ((ch.order.length && ch.runT > 0 && al.every(a => a.finished)) || (ch.winner && ch.winT !== undefined && ch.runT - ch.winT > 4.5) || ch.runT > 28) {
      ch.stage = 'done'; ch.doneT = 0;
      al.forEach(a => { a.task.anim = a.id === ch.winner ? 'cheer' : 'idle'; });
    }
  }
  enduranceTick(dt, al) {
    const ch = this.challenge;
    const standing = al.filter(a => a.onPost);
    for (const a of standing) {
      const p = (0.01 + (1 - a.t.endurance) * 0.05 + a.hunger / 100 * 0.03 + (100 - a.energy) / 100 * 0.025) * (1 + ch.runT / 4);
      a.wobble = Math.min(1, (a.wobble || 0) + dt * p * 3);
      if (this.r() < dt * p * 1.0 && standing.length > 1) {
        a.onPost = false; a.fell = true; ch.out.push(a.id);
        a.y = null;
        this.say(a, 'chFall', {}, 1.4);
        this.emit('splash', { x: a.x, z: a.z });
        const sh = this.map.postShore;
        a.task = { type: 'challenge', stage: 'go', t: 0, to: { x: sh.x + (this.r() - 0.5) * 6, z: sh.z + (this.r() - 0.5) * 6, face: sh.face }, anim: 'cheer', hold: true, label: 'spectate', spd: 0.7 };
        a.label = 'spectate';
        if (standing.length - 1 <= 3) this.log(`${josa(a.name, '이')} 물에 빠졌다! 남은 사람 ${standing.length - 1}명.`, 'info', '💦', a, 1, { who: [a.id] });
        break;
      }
    }
    const left = al.filter(a => a.onPost);
    if (left.length === 1 && !ch.winner) {
      const w = left[0];
      w.task.anim = 'cheer';
      this.winChallenge(w);
      this.after(1.5, () => { w.onPost = false; w.y = null; });
      ch.stage = 'done'; ch.doneT = 0;
    }
    if (this.r() < dt * 1.0) { const s = al.filter(a => !a.onPost); if (s.length) this.say(this.pick(s), 'chCheer', {}, 1.3); }
  }
  winChallenge(a) {
    const ch = this.challenge;
    ch.winner = a.id; ch.winT = ch.runT;
    a.immune = true; a.wins++; a.contribution += 1;
    this.say(a, 'chWin', {}, 2.4); this.emote(a, '🏆');
    for (const o of this.alive()) if (o !== a) this.addAff(o.id, a.id, this.aff[o.id][a.id] > 10 ? 3 : -2);
    this.log(`${josa(a.name, '이')} 미션 우승! 오늘 밤 면책 목걸이를 차지했다.`, 'good', '🏆', a, 3, { who: [a.id] });
  }

  // ── 부족회의 ──
  updateCouncil(dt) {
    if (this.councilState) { this.phaseT = Math.min(this.phaseT, 13.9); return; }
    const al = this.alive();
    const seated = al.every(a => a.task && a.task.stage === 'do');
    if (seated || this.phaseT > 7) {
      al.forEach((a, i) => { if (!(a.task && a.task.stage === 'do')) { const s = this.map.councilSeats[i]; a.x = s.x; a.z = s.z; } });
      this.councilState = 'ceremony';
      this.councilResult = this.computeCouncil();
      this.emit('council', { result: this.councilResult });
    } else if (this.r() < dt * 0.6) { const a = this.pick(al); this.say(a, 'councilNerve', {}, 1.8); }
  }

  voteChoice(v, eligible, extra = {}) {
    const al = this.allianceOf(v);
    let best = null, bs = -1e9;
    for (const c of eligible) {
      if (c === v) continue;
      let s = -this.aff[v.id][c.id] + this.threat(c) * v.t.cunning * 0.55 + this.r() * 12;
      if (al && al.target === c.id) s += 30 * v.t.loyalty + 12;
      if (al && al.members.includes(c.id)) s -= 45 * v.t.loyalty;
      if (c.votesCast.at(-1) === v.id) s += 14;
      if (c.idolKnownBy === v.id) s -= 6; // 조개 가진 걸 알면 피함
      if (extra[c.id]) s += extra[c.id];
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }

  computeCouncil() {
    const al = this.alive();
    // 동맹 표적 갱신
    for (const A of this.alliances) {
      const elig = al.filter(c => !A.members.includes(c.id) && !c.immune);
      if (!elig.length) { A.target = null; continue; }
      const cur = A.target != null ? this.agents[A.target] : null;
      if (!cur || !cur.alive || cur.immune) {
        A.target = elig.reduce((m, c) => {
          const s = A.members.reduce((z, k) => z - this.aff[k][c.id], 0) + this.threat(c) * 2;
          const ms = A.members.reduce((z, k) => z - this.aff[k][m.id], 0) + this.threat(m) * 2;
          return s > ms ? c : m;
        }).id;
      }
    }
    const eligible = al.filter(c => !c.immune);
    // 1차 의향 → 분위기(친한 사람 따라가기) 반영 2회
    let plan = new Map(al.map(v => [v.id, this.voteChoice(v, eligible).id]));
    for (let it = 0; it < 2; it++) {
      const next = new Map();
      for (const v of al) {
        const extra = {};
        for (const u of al) if (u !== v) { const tg = plan.get(u.id); if (tg === v.id) continue; extra[tg] = (extra[tg] || 0) + (this.aff[v.id][u.id] > 20 ? 10 : 4) * (1 - v.t.cunning * 0.35); }
        next.set(v.id, this.voteChoice(v, eligible, extra).id);
      }
      plan = next;
    }
    let votes = al.map(v => {
      const t = this.agents[plan.get(v.id)];
      const A = this.allianceOf(v);
      return { voter: v.id, target: t.id, betrayal: !!(A && A.target != null && A.target !== t.id && A.members.length >= 2 && this.agents[A.target].alive && !this.agents[A.target].immune) };
    });
    // 면책 조개 사용 여부
    let idol = null;
    const holder = al.find(a => a.idol);
    if (holder) {
      const against = votes.filter(v => v.target === holder.id).length;
      const perceived = against + (this.r() - 0.5) * 2 + (this.popularity(holder) < -10 ? 1 : 0);
      if (perceived >= 1.6 || al.length <= 4) {
        idol = { holder: holder.id, saved: against };
        holder.idol = false; this.history.idolPlays++;
        votes.forEach(v => { if (v.target === holder.id) v.nullified = true; });
      }
    }
    const tally = (vs) => { const m = {}; vs.filter(v => !v.nullified).forEach(v => m[v.target] = (m[v.target] || 0) + 1); return m; };
    let t = tally(votes);
    let tie = null, drawLots = false;
    let eliminated;
    const top = (m) => { const max = Math.max(...Object.values(m)); return Object.keys(m).filter(k => m[k] === max).map(Number); };
    if (!Object.keys(t).length) {
      // 모든 표가 무효 → 재투표
      const elig2 = eligible.filter(c => c.id !== holder.id);
      const re = al.filter(v => v.id !== holder.id).map(v => ({ voter: v.id, target: this.voteChoice(v, elig2).id }));
      tie = { candidates: [], revotes: re, reason: 'void' };
      t = tally(re);
    }
    let leaders = top(t);
    if (leaders.length > 1) {
      const cands = leaders.map(id => this.agents[id]);
      const voters = al.filter(v => !leaders.includes(v.id));
      const re = voters.map(v => {
        const bonus = {}; // 동점자 중 선택
        return { voter: v.id, target: this.voteChoice(v, cands, bonus).id };
      });
      tie = { candidates: leaders, revotes: re, reason: 'tie' };
      const t2 = tally(re);
      const l2 = re.length ? top(t2) : leaders;
      if (l2.length > 1) { drawLots = true; eliminated = this.pick(l2); }
      else eliminated = l2[0];
    } else eliminated = leaders[0];
    return { day: this.day, votes, idol, tie, drawLots, eliminated, tally: t };
  }

  // 메인이 의식 연출을 마친 뒤 호출
  resolveCouncil() {
    const res = this.councilResult; if (!res) return;
    const out = this.agents[res.eliminated];
    const all = res.votes.concat(res.tie ? res.tie.revotes : []);
    // 투표 기록·감정
    for (const v of res.votes) { const vo = this.agents[v.voter]; vo.votesCast.push(v.target); this.agents[v.target].votesRecv++; }
    for (const v of all) {
      if (v.target === out.id) this.addAff(out.id, v.voter, -25);
      else this.addAff(v.target, v.voter, -14);
    }
    for (const v of res.votes) if (v.betrayal) {
      const A = this.allianceOf(this.agents[v.voter]);
      if (A) {
        for (const m of A.members) if (m !== v.voter) this.addAff(m, v.voter, -22);
        this.history.betrayals++;
        if (this.r() < 0.6) { A.members = A.members.filter(m => m !== v.voter); if (A.members.length < 2) this.alliances = this.alliances.filter(x => x !== A); }
      }
    }
    this.eliminate(out, 'vote');
    this.history.councils.push(res);
    for (const A of this.alliances) if (A.target === out.id) A.target = null;
    this.councilState = 'done'; this.councilResult = null;
    this.emit('boat', { id: out.id });
    if (this.alive().length <= 3) this.enterPhase('finale');
    else this.enterPhase('night');
  }

  // ── 파이널 ──
  startFinale() {
    const fin = this.alive();
    fin.forEach((a, i) => this.assign(a, { type: 'council', to: this.map.councilSeats[3 + i * 2], anim: 'sit', label: 'council', hold: true }));
    const jury = this.agents.filter(a => a.jury);
    jury.forEach((a, i) => {
      const s = this.map.jurySeats[i % this.map.jurySeats.length];
      a.x = s.x; a.z = s.z; a.face = Math.atan2(this.map.council.x - s.x, this.map.council.z - s.z);
      a.task = { type: 'jury', stage: 'do', t: 0, anim: 'sit', hold: true, label: 'jury' };
    });
    this.finaleState = null;
    this.log(`최후의 ${fin.length}인! 탈락자 ${jury.length}명이 배심원으로 돌아왔다.`, 'system', '⚖️', this.map.council, 4, { banner: '파이널 부족회의' });
  }
  updateFinale(dt) {
    if (this.finaleState) return;
    const fin = this.alive();
    if (this.phaseT > 3 && (fin.every(a => a.task && a.task.stage === 'do') || this.phaseT > 12)) {
      this.finaleState = 'ceremony';
      const jury = this.agents.filter(a => a.jury);
      if (!jury.length) { const w = fin.slice().sort((x, y) => this.threat(y) - this.threat(x))[0]; this.finaleResult = { votes: [], winner: w.id, tally: {}, tiebreak: null, finalists: fin.map(f => f.id) }; this.emit('finale', { result: this.finaleResult }); return; }
      const votes = jury.map(j => {
        let best = null, bs = -1e9;
        for (const f of fin) {
          let s = this.aff[j.id][f.id] + f.wins * 4 + f.contribution * 0.05 + this.r() * 16;
          if (j.votesCast.length && j.outReason === 'vote') {
            const res = this.history.councils.find(c => c.eliminated === j.id);
            if (res && res.votes.some(v => v.voter === f.id && v.target === j.id)) s -= 22 * (1 - j.t.kindness * 0.6);
          }
          if (j.t.cunning > 0.6) s += f.t.cunning * 12; // 전략 인정
          if (s > bs) { bs = s; best = f; }
        }
        return { voter: j.id, target: best.id };
      });
      const m = {}; votes.forEach(v => m[v.target] = (m[v.target] || 0) + 1);
      const max = Math.max(...Object.values(m));
      let lead = Object.keys(m).filter(k => m[k] === max).map(Number);
      let tiebreak = null;
      if (lead.length > 1) { const w = lead.map(id => this.agents[id]).sort((x, y) => y.wins - x.wins || y.contribution - x.contribution)[0]; tiebreak = w.id; lead = [w.id]; }
      this.finaleResult = { votes, winner: lead[0], tally: m, tiebreak, finalists: fin.map(f => f.id) };
      this.emit('finale', { result: this.finaleResult });
    }
  }
  resolveFinale() { this.finishGame(this.agents[this.finaleResult.winner]); }
  finishGame(w) {
    this.winner = w; this.phase = 'end';
    if (w) { w.task = { type: 'jury', stage: 'do', t: 0, anim: 'cheer', hold: true, label: 'winner' }; }
    this.emit('end', { winner: w ? w.id : null });
  }

  // ── 리포트용 ──
  pairs() {
    const al = this.agents; const out = [];
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) out.push({ a: i, b: j, v: (this.aff[i][j] + this.aff[j][i]) / 2 });
    return out;
  }
}

