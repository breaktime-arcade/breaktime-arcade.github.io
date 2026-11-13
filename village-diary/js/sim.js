/*!
 * 작은 마을 성장 일기 — 마을 시뮬레이션 (가문·세대·경제·건설)
 * © 쉬는시간 오락실. All rights reserved.
 */
import { YEAR_LEN, MAX_YEAR, SEASONS, FOUNDER_SURNAMES, SURNAMES, MALE, FEMALE, FAMILY_COLORS, SHIRTS, HAIRS, SKINS, JOBS, BUILDINGS, CIVIC_ORDER, JOB_OF, ERAS, LINES, fill, josa } from './data.js';
import { mulberry32 } from './map.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const SEASON_LEN = YEAR_LEN / 4;
const DAY_LEN = SEASON_LEN * 1.5;
const AMENITY = { well: 3, storehouse: 2, market: 5, fountain: 6, school: 4, clinic: 5, inn: 3, library: 4, townhall: 5, bakery: 3, bridge: 2, windmill: 2, station: 6 };

class Person {
  constructor(sim, o) {
    const r = () => sim.r();
    this.id = sim.people.length;
    this.surname = o.surname; this.gender = o.gender;
    this.given = o.given || sim.newGiven(o.gender);
    this.name = this.surname + this.given;
    this.birth = sim.yearF() - (o.age || 0);
    this.father = o.father ?? null; this.mother = o.mother ?? null; this.spouse = null; this.children = [];
    this.gen = o.gen || 1;
    this.home = null; this.job = null; this.alive = true; this.deathYear = null; this.cause = '';
    this.t = { diligence: r(), social: r(), ambition: r(), kindness: r(), creative: r() };
    const par = o.father != null ? sim.people[o.father] : null, mom = o.mother != null ? sim.people[o.mother] : null;
    this.look = {
      skin: par && mom ? (r() < 0.5 ? par.look.skin : mom.look.skin) : sim.pick(SKINS),
      hair: par && mom ? (r() < 0.5 ? par.look.hair : mom.look.hair) : sim.pick(HAIRS),
      shirt: sim.pick(SHIRTS), pants: sim.pick(['#3b4a63', '#5a4632', '#2f3640', '#6b5b45', '#4a5d3a', '#7a6a5a']),
      style: o.gender === 'M' ? sim.pick(['short', 'short', 'buzz', 'curly', 'side']) : sim.pick(['long', 'bob', 'bun', 'pony', 'braid']),
    };
    this.health = 100; this.x = 0; this.z = 0; this.face = 0; this.speed = 0; this.anim = 'idle'; this.prop = null;
    this.task = null; this.inside = false; this.label = 'idle';
    this.log = []; this.chief = false; this.field = null;
  }
  get age() { return this._sim.yearF() - this.birth; }
}

export class Sim {
  constructor(map, seed = (Math.random() * 1e9) | 0) {
    this.map = map; this.seed = seed; this.rng = mulberry32(seed);
    this.listeners = []; this.timers = [];
    this.people = []; this.buildings = []; this.families = {}; this.affMap = new Map();
    this.res = { food: 40, wood: 16, stone: 0, coin: 0 };
    this.t = 0; this.seasonIdx = 0; this.era = 0; this.happy = 66; this.festivalBoost = 0;
    this.diary = []; this.milestones = []; this.popHistory = []; this.firsts = {};
    this.blessCD = { rain: 0, festival: 0, love: 0, luck: 0 };
    this.harvestMult = 1; this.weather = 'clear'; this.festival = false; this.ended = false;
    this.graves = []; this.chief = null; this.surnamePool = SURNAMES.slice().sort(() => this.r() - 0.5);
    this.colorIdx = 0; this.wedding = null; this.balloon = null; this.trainOn = false;
    this.plots = map.plots.map(p => ({ ...p, used: false }));
    this.fieldPlots = map.fieldPlots.map(p => ({ ...p, used: false }));
    this.treeAlive = map.trees.map(() => true);
    this.founders();
  }

  // ── 기본 유틸 ──
  on(f) { this.listeners.push(f); }
  emit(type, d = {}) { for (const f of this.listeners) f(type, d); }
  r() { return this.rng(); }
  pick(a) { return a[Math.floor(this.rng() * a.length)]; }
  after(sec, fn) { this.timers.push({ at: this.t + sec, fn }); }
  yearF() { return 1 + this.t / YEAR_LEN; }
  get year() { return Math.floor(this.yearF()); }
  get season() { return Math.floor((this.t % YEAR_LEN) / SEASON_LEN); }
  dayPhase() { return (this.t % DAY_LEN) / DAY_LEN; }
  alive() { return this.people.filter(p => p.alive); }
  get pop() { return this.alive().length; }
  ageOf(p) { return this.yearF() - p.birth; }
  newGiven(g) {
    const used = new Set(this.alive().map(p => p.given));
    const pool = (g === 'M' ? MALE : FEMALE).filter(n => !used.has(n));
    return this.pick(pool.length ? pool : (g === 'M' ? MALE : FEMALE));
  }
  aff(a, b) { const k = a.id < b.id ? a.id + '-' + b.id : b.id + '-' + a.id; return this.affMap.get(k) || 0; }
  addAff(a, b, v) { const k = a.id < b.id ? a.id + '-' + b.id : b.id + '-' + a.id; this.affMap.set(k, clamp((this.affMap.get(k) || 0) + v, -100, 100)); }
  family(surname) {
    if (!this.families[surname]) this.families[surname] = { surname, color: FAMILY_COLORS[this.colorIdx++ % FAMILY_COLORS.length], since: this.year, founder: null };
    return this.families[surname];
  }
  write(text, icon = '•', kind = 'info', pos = null, prio = 0, extra = {}) {
    const e = { year: this.year, season: this.season, text, icon, kind, pos, prio, ...extra };
    this.diary.push(e); this.emit('diary', e); return e;
  }
  milestone(key, text, icon) { if (this.firsts[key]) return; this.firsts[key] = true; this.milestones.push({ year: this.year, season: this.season, text, icon }); }
  lifeLog(p, text) { p.log.push({ year: this.year, text }); }
  say(p, key, names = {}, dur = 2.4) { if (!p.alive || p.inside) return; const pool = LINES[key] || [key]; this.emit('say', { id: p.id, text: fill(this.pick(pool), { a: p.given, ...names }), dur }); }
  stage(p) { const a = this.ageOf(p); return a < 3 ? 'baby' : a < 7 ? 'child' : a < 18 ? 'teen' : a < 65 ? 'adult' : 'elder'; }

  // ── 사람 ──
  addPerson(o) {
    const p = new Person(this, o); p._sim = this;
    this.people.push(p); this.family(p.surname);
    return p;
  }
  marry(a, b) {
    a.spouse = b.id; b.spouse = a.id;
    this.lifeLog(a, `${josa(b.name, '과')} 결혼`); this.lifeLog(b, `${josa(a.name, '과')} 결혼`);
  }
  related(a, b) {
    if (a.father === b.id || a.mother === b.id || b.father === a.id || b.mother === a.id) return true;
    const pa = [a.father, a.mother].filter(x => x != null), pb = [b.father, b.mother].filter(x => x != null);
    if (pa.some(x => pb.includes(x))) return true;
    const gp = (p) => [p.father, p.mother].filter(x => x != null).flatMap(id => [this.people[id].father, this.people[id].mother]).filter(x => x != null);
    const ga = gp(a), gb = gp(b); return ga.some(x => gb.includes(x));
  }

  founders() {
    const [s1, s2, s3] = FOUNDER_SURNAMES;
    const g1 = this.addPerson({ surname: s1, gender: 'M', age: 31 }), g1w = this.addPerson({ surname: this.pick(['정', '최', '한']), gender: 'F', age: 29 });
    this.marry(g1, g1w); g1w.house = null;
    const k1 = this.addPerson({ surname: s1, gender: this.r() < 0.5 ? 'M' : 'F', age: 4, father: g1.id, mother: g1w.id, gen: 2 });
    const g2 = this.addPerson({ surname: s2, gender: 'M', age: 36 }), g2w = this.addPerson({ surname: this.pick(['윤', '서', '임']), gender: 'F', age: 33 });
    this.marry(g2, g2w);
    const k2 = this.addPerson({ surname: s2, gender: 'F', age: 9, father: g2.id, mother: g2w.id, gen: 2 });
    const k3 = this.addPerson({ surname: s2, gender: 'M', age: 1, father: g2.id, mother: g2w.id, gen: 2 });
    const g3m = this.addPerson({ surname: s3, gender: 'F', age: 61 });
    const g3 = this.addPerson({ surname: s3, gender: 'M', age: 26, mother: g3m.id, gen: 2 });
    const g3d = this.addPerson({ surname: s3, gender: 'F', age: 22, mother: g3m.id, gen: 2 });
    g3m.children.push(g3.id, g3d.id); g1.children.push(k1.id); g1w.children.push(k1.id); g2.children.push(k2.id, k3.id); g2w.children.push(k2.id, k3.id);
    g3m.widow = true;
    this.families[s1].founder = g1.id; this.families[s2].founder = g2.id; this.families[s3].founder = g3m.id;
    // 정착민 가문은 아내 성씨 가문도 등록되지만 가문 목록에서는 '정착 가문' 위주로 표시
    const h1 = this.placeBuilding('hut', true), h2 = this.placeBuilding('hut', true), h3 = this.placeBuilding('hut', true);
    [g1, g1w, k1].forEach(p => this.moveIn(p, h1)); [g2, g2w, k2, k3].forEach(p => this.moveIn(p, h2)); [g3m, g3, g3d].forEach(p => this.moveIn(p, h3));
    this.placeBuilding('field', true); this.placeBuilding('field', true);
    for (const p of this.alive()) { const b = this.buildings[p.home]; p.x = b.door.x + (this.r() - 0.5) * 3; p.z = b.door.z + (this.r() - 0.5) * 3; this.lifeLog(p, '마을 개척에 참여'); }
    // 초기 호감
    const al = this.alive();
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) this.addAff(al[i], al[j], 5 + this.r() * 20);
    this.assignJobs(true);
    this.write(`${s1}씨, ${s2}씨, ${s3}씨 세 가족이 하늘섬에 첫 오두막을 지었다.`, '🛖', 'system', this.map.plaza, 3);
    this.milestone('start', '세 가족이 하늘섬에 정착', '🛖');
  }

  // ── 건물 ──
  pickPlot(zone) {
    const m = this.map;
    if (zone === 'farm') return this.fieldPlots.find(p => !p.used);
    if (zone === 'quarry') return { x: m.quarry.x - 3, z: m.quarry.z + 3, rot: Math.atan2(-m.quarry.x, -m.quarry.z) };
    if (zone === 'bridge') return { x: m.bridge.x, z: m.bridge.z, rot: m.bridge.ang };
    if (zone === 'windmill') return { x: m.windmill.x, z: m.windmill.z, rot: -1.3 };
    if (zone === 'plaza') return { x: 0, z: -6.2, rot: 0 };
    if (zone === 'center') return { x: 0, z: 0, rot: 0 };
    if (zone === 'station') return { x: m.station.x, z: m.station.z, rot: m.station.ang + Math.PI / 2 };
    const free = this.plots.filter(p => !p.used);
    if (!free.length) return null;
    if (zone === 'forest') return free.filter(p => p.x < 0).sort((a, b) => b.d - a.d)[0] || free.at(-1);
    if (zone === 'civic') return free[0];
    // 집: 광장 근처는 공공건물용으로 일부 남김
    const home = free.filter(p => p.d >= 12.5);
    return (home.length ? home : free)[Math.floor(this.r() * Math.min(3, (home.length ? home : free).length))];
  }
  placeBuilding(type, instant = false, plot = null) {
    const def = BUILDINGS[type];
    plot = plot || this.pickPlot(def.zone);
    if (!plot) return null;
    if (plot.used !== undefined) plot.used = true;
    const b = {
      id: this.buildings.length, type, x: plot.x, z: plot.z, rot: plot.rot ?? 0, plot, w: plot.w, l: plot.l,
      progress: instant ? 1 : 0, built: instant, work: def.work, residents: [], level: 0, burning: 0, startYear: this.year,
      variant: Math.floor(this.r() * 1000),
    };
    const dr = type === 'field' ? 0 : type === 'bridge' ? 0 : 2.4;
    b.door = { x: b.x + Math.sin(b.rot) * dr, z: b.z + Math.cos(b.rot) * dr };
    this.buildings.push(b);
    // 공사 부지의 나무 제거
    const rad = type === 'field' ? 3.6 : type === 'station' ? 7 : type === 'townhall' || type === 'school' ? 5 : 4.2;
    this.map.trees.forEach((t, i) => { if (this.treeAlive[i] && Math.hypot(t.x - b.x, t.z - b.z) < rad) this.treeAlive[i] = false; });
    this.emit(instant ? 'build:done' : 'build:start', { b, instant });
    return b;
  }
  homes() { return this.buildings.filter(b => ['hut', 'house', 'brick'].includes(b.type)); }
  has(type) { return this.buildings.some(b => b.type === type && b.built); }
  hasAny(type) { return this.buildings.some(b => b.type === type); }
  sites() { return this.buildings.filter(b => !b.built); }
  moveIn(p, b) {
    if (p.home != null) { const old = this.buildings[p.home]; old.residents = old.residents.filter(x => x !== p.id); }
    p.home = b.id; if (!b.residents.includes(p.id)) b.residents.push(p.id);
  }
  canPay(cost) { return Object.entries(cost).every(([k, v]) => this.res[k] >= v); }
  pay(cost) { for (const [k, v] of Object.entries(cost)) this.res[k] -= v; }

  stats() {
    const al = this.alive();
    return { pop: al.length, year: this.year, era: this.era, fields: this.buildings.filter(b => b.type === 'field').length, kids: al.filter(p => { const a = this.ageOf(p); return a >= 5 && a < 18; }).length };
  }

  // 공사 계획
  planConstruction() {
    const maxSites = 1 + this.jobCount('builder');
    let guard = 0;
    while (this.sites().length < maxSites && guard++ < 4) {
      const st = this.stats();
      const homeType = ERAS[this.era].home;
      // 1) 집 없는 가구
      const needHome = this.householdsNeedingHome();
      if (needHome.length && this.canPay(BUILDINGS[homeType].cost)) {
        const hh = needHome[0];
        this.pay(BUILDINGS[homeType].cost);
        const b = this.placeBuilding(homeType); if (!b) break;
        b.pendingFor = hh.map(p => p.id);
        this.write(`${josa(hh[0].name, '이')} 사는 새 ${BUILDINGS[homeType].label} 공사를 시작했다.`, '🔨', 'info', b, 0);
        continue;
      }
      // 2) 밭
      const farmers = this.jobCount('farmer');
      if (st.fields < Math.min(this.fieldPlots.length, Math.ceil(farmers / 2) + 1) && this.canPay(BUILDINGS.field.cost) && this.fieldPlots.some(p => !p.used)) {
        this.pay(BUILDINGS.field.cost); this.placeBuilding('field'); continue;
      }
      // 3) 공공건물
      const next = CIVIC_ORDER.find(k => !this.hasAny(k) && BUILDINGS[k].req(st));
      if (next && this.canPay(BUILDINGS[next].cost)) {
        this.pay(BUILDINGS[next].cost);
        const b = this.placeBuilding(next);
        if (b) this.write(`${BUILDINGS[next].icon} ${BUILDINGS[next].label} 공사를 시작했다!`, '🏗️', 'build', b, 1);
        continue;
      }
      // 4) 시대에 맞게 집 개축
      const old = this.homes().find(b => b.built && b.type !== homeType && ['hut', 'house'].includes(b.type) && b.type !== 'brick' && (homeType !== 'house' || b.type === 'hut'));
      if (old && this.canPay(BUILDINGS[homeType].cost) && this.res.wood > 14) {
        this.pay(BUILDINGS[homeType].cost);
        old.type = homeType; old.built = false; old.progress = 0.15; old.work = BUILDINGS[homeType].work; old.renovate = true;
        this.emit('build:start', { b: old, renovate: true });
        continue;
      }
      break;
    }
  }
  householdsNeedingHome() {
    const out = [];
    const pending = new Set(this.sites().flatMap(b => b.pendingFor || []));
    for (const p of this.alive()) {
      if (pending.has(p.id)) continue;
      if (p.home == null) { out.push(this.alive().filter(q => q.home == null && (q.id === p.id || q.spouse === p.id || q.mother === p.id || q.father === p.id))); continue; }
      // 결혼한 부부가 부모 집에 얹혀사는 경우
      if (p.spouse != null && p.gender === 'M') {
        const h = this.buildings[p.home];
        const others = h.residents.map(i => this.people[i]).filter(q => q.alive && q.id !== p.id && q.id !== p.spouse && q.father !== p.id && q.mother !== p.id && q.father !== p.spouse && q.mother !== p.spouse);
        if (others.some(q => this.ageOf(q) >= 18)) out.push([p, this.people[p.spouse]]);
      }
    }
    return out.filter(h => h.length).sort((a, b) => (a[0].home == null ? -1 : 1) - (b[0].home == null ? -1 : 1));
  }

  // ── 직업 ──
  jobCount(j) { return this.alive().filter(p => p.job === j).length; }
  assignJobs(quiet = false) {
    const al = this.alive();
    for (const p of al) {
      const st = this.stage(p);
      if (st === 'baby') p.job = 'baby'; else if (st === 'child') p.job = 'child';
      else if (st === 'teen') p.job = 'student';
      else if (st === 'elder') { if (p.job !== 'elder') { if (!quiet && p.job && JOBS[p.job].prop) this.lifeLog(p, `${JOBS[p.job].label} 일에서 은퇴`); p.job = 'elder'; } }
      else if (['baby', 'child', 'student', 'elder', null].includes(p.job)) p.job = null;
      if (p.job && JOBS[p.job].need && !this.has(JOBS[p.job].need)) p.job = null;
    }
    const adults = al.filter(p => this.stage(p) === 'adult');
    const n = adults.length;
    const siteWork = this.sites().reduce((s, b) => s + (1 - b.progress) * b.work, 0);
    const want = {};
    for (const [b, j] of Object.entries(JOB_OF)) if (this.has(b)) want[j] = b === 'market' || b === 'inn' ? 1 + (n > 26 ? 1 : 0) : 1;
    want.builder = clamp(Math.ceil(siteWork / 22) + 1, 2, Math.max(2, Math.ceil(n / 4)));
    want.woodcutter = clamp(Math.round(n / 7) + 1, 1, 4);
    if (this.has('quarry')) want.mason = clamp(Math.round(n / 8), 1, 3);
    if (n >= 8) want.fisher = n >= 22 ? 2 : 1;
    // 최소 농부
    const minFarm = Math.ceil(al.length / 3.4);
    let special = Object.values(want).reduce((a, b) => a + b, 0);
    while (special > n - minFarm && special > 0) { const k = ['fisher', 'mason', 'woodcutter', 'builder'].find(k => (want[k] || 0) > (k === 'builder' || k === 'woodcutter' ? 1 : 0)); if (!k) break; want[k]--; special--; }
    // 넘치는 사람 해제
    const cnt = {}; for (const p of adults) if (p.job) cnt[p.job] = (cnt[p.job] || 0) + 1;
    for (const p of adults.slice().sort((a, b) => a.t.diligence - b.t.diligence)) {
      if (p.job && p.job !== 'farmer' && (cnt[p.job] || 0) > (want[p.job] || 0)) { cnt[p.job]--; p.job = null; }
    }
    // 빈자리 채우기 (부모 직업 대물림 우선)
    const free = () => adults.filter(p => !p.job || p.job === 'farmer');
    for (const [j, w] of Object.entries(want)) {
      while ((cnt[j] || 0) < w) {
        const cands = free(); if (!cands.length || cands.length <= minFarm && j !== 'builder') break;
        const par = (p) => [p.father, p.mother].filter(x => x != null).map(i => this.people[i]).some(q => q.job === j || (q.lastJob === j));
        cands.sort((a, b) => (par(b) ? 2 : 0) + b.t.diligence - ((par(a) ? 2 : 0) + a.t.diligence) + (a.job === 'farmer' ? -0.3 : 0) - (b.job === 'farmer' ? -0.3 : 0));
        const p = cands[0];
        p.job = j; p.lastJob = j; cnt[j] = (cnt[j] || 0) + 1;
        if (!quiet) {
          this.lifeLog(p, `${JOBS[j].label}${josa(JOBS[j].label, '이').slice(-1)} 되었다`);
          if (par(p)) { this.write(`${josa(p.name, '이')} 부모의 뒤를 이어 ${JOBS[j].label}${['선생님', '의사', '역장', '사서'].includes(JOBS[j].label) ? '이' : ''} 되었다. (대물림)`, JOBS[j].icon, 'family', p, 1, { who: [p.id] }); }
          else if (JOB_OF && Object.values(JOB_OF).includes(j)) this.write(`${josa(p.name, '이')} 마을의 ${JOBS[j].label} 일을 맡았다.`, JOBS[j].icon, 'info', p, 0, { who: [p.id] });
        }
      }
    }
    for (const p of adults) if (!p.job) p.job = 'farmer';
    for (const p of adults) if (p.job) p.lastJob = p.job;
  }

  // ── 메인 업데이트 ──
  update(dt) {
    if (this.ended && !this.endless) return this.updatePeople(dt);
    let left = dt;
    while (left > 0) { const s = Math.min(left, 0.05); this.step(s); left -= s; }
  }
  step(dt) {
    const prevSeasonAbs = Math.floor(this.t / SEASON_LEN);
    this.t += dt;
    const nowSeasonAbs = Math.floor(this.t / SEASON_LEN);
    if (nowSeasonAbs !== prevSeasonAbs) this.onSeason(nowSeasonAbs);
    this.updatePeople(dt);
    this.updateConstruction(dt);
    if (this.timers.length) { const now = this.t; const due = this.timers.filter(x => x.at <= now); this.timers = this.timers.filter(x => x.at > now); due.forEach(x => x.fn()); }
    for (const b of this.buildings) if (b.burning > 0) { b.burning -= dt; if (b.burning <= 0) this.emit('build:fireout', { b }); }
  }

  onSeason(abs) {
    const season = abs % 4;
    const newYear = season === 0;
    if (newYear) this.onYearEnd();
    if (this.ended && !this.endless) return;
    this.emit('season', { season, year: this.year });
    this.economy(season);
    this.weather = 'clear';
    if (season === 0) {
      this.assignJobs();
      this.births(0.55);
      this.weddings();
      this.immigration();
      if (this.r() < 0.25) this.weather = 'rain';
    } else if (season === 1) {
      this.summerEvents();
      if (this.weather === 'clear' && this.r() < 0.3) this.weather = 'rain';
    } else if (season === 2) {
      this.harvest();
      this.births(0.45);
      this.weddings();
      if (this.has('fountain') || this.has('market') || this.year % 3 === 0) this.after(Math.max(0.5, DAY_LEN * 0.68 - (this.t % DAY_LEN)), () => this.startFestival(false));
      this.immigration(0.5);
    } else {
      this.weather = 'snow';
      this.winterEvents();
      this.deaths();
    }
    this.emit('weather', { type: this.weather });
    this.planConstruction();
    this.computeHappiness();
  }

  onYearEnd() {
    const y = this.year - 1;
    this.popHistory.push({ year: y, pop: this.pop, families: this.activeFamilies().length });
    for (const k in this.blessCD) this.blessCD[k] = Math.max(0, this.blessCD[k] - 1);
    this.harvestMult = 1;
    // 성장 단계 이벤트
    for (const p of this.alive()) {
      const a = Math.floor(this.ageOf(p));
      if (a === 18 && !p.adultLogged) { p.adultLogged = true; this.lifeLog(p, '어른이 되었다'); }
      if (a === 7 && !p.schoolLogged && this.has('school')) { p.schoolLogged = true; this.lifeLog(p, '학교에 입학'); }
    }
    // 촌장 선거 (4년마다)
    if (y >= 3 && (y - 3) % 4 === 0) this.election();
    // 시대 전환
    const nx = ERAS[this.era + 1];
    if (nx && nx.need(this.stats())) {
      this.era++;
      this.write(`${nx.icon} 새로운 시대 — '${nx.name}'! ${nx.desc}.`, nx.icon, 'era', this.map.plaza, 5, { banner: `${nx.icon} ${nx.name} 시대`, sub: nx.desc });
      this.milestone('era' + this.era, `'${nx.name}' 시대 시작`, nx.icon);
      this.emit('era', { era: this.era });
    }
    const pop = this.pop;
    this.write(`${y}년의 끝. 주민 ${pop}명, ${this.activeFamilies().length}개 가문이 함께 살고 있다.`, '📅', 'year', null, 0);
    if (this.year > MAX_YEAR && !this.ended) { this.ended = true; this.emit('end', {}); }
  }

  economy(season) {
    const al = this.alive(), c = (j) => this.jobCount(j);
    const eat = al.reduce((s, p) => s + (this.stage(p) === 'baby' ? 0.4 : this.stage(p) === 'child' ? 0.7 : 1), 0);
    let food = c('fisher') * 2.6 + (season < 2 ? c('farmer') * 1.1 : 0) + (season === 1 ? 2 : 0);
    if (this.has('bakery')) food += c('baker') * 2;
    if (this.has('windmill')) food += c('miller') * 1.5;
    this.res.food += food - eat;
    this.res.wood += c('woodcutter') * 3.2 * (this.has('lumbermill') ? 1.5 : 1) + 0.6;
    this.res.stone += (this.has('quarry') ? c('mason') * 2.6 : 0);
    this.res.coin += c('merchant') * 4 + c('smith') * 3 + c('innkeeper') * 4 + c('baker') * 1 + al.length * 0.15 + (this.trainOn ? 6 : 0);
    if (this.has('smithy')) this.res.wood += 0.5;
    const cap = this.has('storehouse') ? 400 : 160;
    this.res.food = Math.min(this.res.food, cap);
    const mcap = this.has('storehouse') ? 260 : 90;
    this.res.wood = Math.min(this.res.wood, mcap); this.res.stone = Math.min(this.res.stone, mcap); this.res.coin = Math.min(this.res.coin, 999);
    if (this.res.food < 0) {
      this.res.food = 0; this.hungry = true;
      for (const p of al) p.health -= 12;
      this.write('곡식 창고가 텅 비었다. 모두가 배를 곯는 계절…', '🍂', 'bad', this.map.plaza, 2);
    } else { this.hungry = false; for (const p of al) p.health = Math.min(100, p.health + 10); }
  }
  harvest() {
    const fields = this.buildings.filter(b => b.type === 'field' && b.built).length;
    const farmers = this.jobCount('farmer');
    const workers = Math.min(farmers, fields * 2.5);
    let h = workers * 13 * this.harvestMult * (this.has('windmill') ? 1.25 : 1) * (this.has('smithy') ? 1.12 : 1);
    h = Math.round(h);
    this.res.food = Math.min(this.res.food + h, this.has('storehouse') ? 400 : 160);
    const icon = this.harvestMult > 1.2 ? '🌾✨' : this.harvestMult < 0.8 ? '🥀' : '🌾';
    this.write(this.harvestMult > 1.2 ? `대풍년! 황금 들판에서 곡식 ${h}섬을 거두었다.` : this.harvestMult < 0.8 ? `가뭄 탓에 수확이 ${h}섬뿐이다…` : `가을걷이로 곡식 ${h}섬을 거두었다.`, icon, this.harvestMult < 0.8 ? 'bad' : 'good', { x: 16, z: 3 }, 1);
    this.emit('harvest', {});
  }
  computeHappiness() {
    let h = 52;
    for (const [k, v] of Object.entries(AMENITY)) if (this.has(k)) h += v;
    h += this.hungry ? -22 : this.res.food > this.pop * 2 ? 8 : 0;
    const homeless = this.alive().filter(p => p.home == null).length;
    h -= homeless * 3;
    h += this.festivalBoost; this.festivalBoost *= 0.6;
    if (this.chief != null) h += 2;
    this.happy = clamp(h, 5, 100);
  }

  // ── 인생 이벤트 ──
  births(scale) {
    const couples = this.alive().filter(p => p.gender === 'F' && p.spouse != null && this.people[p.spouse].alive && this.ageOf(p) >= 20 && this.ageOf(p) <= 42 && p.home != null);
    for (const m of couples) {
      const kids = m.children.length;
      if (kids >= 3) continue;
      const p = 0.3 * scale * (this.happy / 70) * (this.pop > 55 ? 0.5 : 1) * (this.hungry ? 0.3 : 1) * (kids === 0 ? 1.3 : kids >= 2 ? 0.55 : 1) * (this.luck ? 1.6 : 1);
      if (this.r() < p) {
        const f = this.people[m.spouse];
        const g = this.r() < 0.5 ? 'M' : 'F';
        const baby = this.addPerson({ surname: f.surname, gender: g, age: 0, father: f.id, mother: m.id, gen: Math.max(f.gen, m.gen) + 1 });
        baby.x = m.x; baby.z = m.z; baby.job = 'baby';
        f.children.push(baby.id); m.children.push(baby.id);
        this.moveIn(baby, this.buildings[m.home]);
        this.lifeLog(baby, `${f.name}·${m.name}의 ${['첫째', '둘째', '셋째', '넷째'][kids]}로 태어남`);
        this.lifeLog(m, `${baby.given} 출산`); this.lifeLog(f, `${baby.given} 탄생`);
        this.write(`${f.surname}씨 가문에 아기 '${baby.name}' 탄생! (${baby.gen}대손)`, '👶', 'birth', this.buildings[m.home].door, 2, { who: [m.id, f.id, baby.id] });
        this.emit('birth', { id: baby.id, mom: m.id, dad: f.id });
        this.after(1.0, () => this.say(f, 'baby', { c: baby.given }, 3));
        this.milestone('birth', `첫 아기 ${baby.name} 탄생`, '👶');
        if (baby.gen >= 3) this.milestone('gen3', `첫 3대손 ${baby.name} 탄생`, '🌳');
        if (baby.gen >= 4) this.milestone('gen4', `첫 4대손 ${baby.name} 탄생`, '🌳');
      }
    }
  }
  weddings(force = null) {
    const singles = this.alive().filter(p => p.spouse == null && !p.widow && this.ageOf(p) >= 20 && this.ageOf(p) <= 46);
    const men = singles.filter(p => p.gender === 'M'), women = singles.filter(p => p.gender === 'F');
    const pairs = [];
    for (const m of men) for (const w of women) {
      if (this.related(m, w) || Math.abs(this.ageOf(m) - this.ageOf(w)) > 12) continue;
      pairs.push({ m, w, s: this.aff(m, w) + (m.surname !== w.surname ? 6 : -10) + this.r() * 18 });
    }
    pairs.sort((a, b) => b.s - a.s);
    const used = new Set(); let n = 0;
    for (const pr of pairs) {
      if (used.has(pr.m.id) || used.has(pr.w.id)) continue;
      const ready = force ? true : pr.s > 38 || (this.ageOf(pr.m) > 29 && this.r() < 0.35);
      if (!ready) continue;
      used.add(pr.m.id); used.add(pr.w.id);
      this.after(1.2 + n * 2.5, () => this.holdWedding(pr.m, pr.w));
      if (++n >= (force ? 1 : 2)) break;
    }
    return n;
  }
  holdWedding(m, w) {
    if (!m.alive || !w.alive || m.spouse != null || w.spouse != null) return;
    this.marry(m, w);
    // 신부는 신랑 집으로
    if (m.home != null) this.moveIn(w, this.buildings[m.home]); else if (w.home != null) this.moveIn(m, this.buildings[w.home]);
    this.write(`${josa(m.name, '과')} ${josa(w.name, '이')} 광장에서 결혼식을 올렸다! 💐`, '💒', 'wedding', this.map.plaza, 4, { who: [m.id, w.id] });
    this.milestone('wedding', `첫 결혼식: ${m.name} ♥ ${w.name}`, '💒');
    this.wedding = { a: m.id, b: w.id, t: 0 };
    this.emit('wedding', { a: m.id, b: w.id });
    // 하객 모으기
    const guests = this.alive().filter(p => p !== m && p !== w && !p.inside && this.stage(p) !== 'baby').slice(0, 24);
    const pz = this.map.plaza;
    [m, w].forEach((p, i) => { p.inside = false; this.assign(p, { type: 'wedding', to: { x: pz.x + (i ? 0.7 : -0.7), z: pz.z + 2.2, face: { x: pz.x + (i ? -5 : 5), z: pz.z + 2.2 } }, anim: 'idle', dur: 6, run: true }); });
    guests.forEach((g, i) => { const a = (i / guests.length) * Math.PI * 2; g.inside = false; this.assign(g, { type: 'guest', to: { x: pz.x + Math.cos(a) * 5, z: pz.z + 2.2 + Math.sin(a) * 4, face: { x: pz.x, z: pz.z + 2.2 } }, anim: 'clap', dur: 6.5 }); });
    this.after(2.6, () => { [m, w].forEach(p => { p.face = Math.atan2((p === m ? w : m).x - p.x, (p === m ? w : m).z - p.z); }); this.say(m, 'wedding'); this.emit('petals', { x: pz.x, z: pz.z + 2.2 }); });
    this.after(3.6, () => { this.say(w, 'wedding'); guests.slice(0, 4).forEach(g => this.say(g, 'cheer', {}, 1.8)); });
  }
  deaths() {
    for (const p of this.alive()) {
      const a = this.ageOf(p);
      let pr = a >= 58 ? 0.012 + (a - 58) * 0.011 : 0.0008;
      if (p.health < 40) pr += 0.05;
      if (this.illness) pr *= this.has('clinic') ? 1.3 : 2.2;
      if (this.r() < pr) this.die(p, a >= 58 ? 'old' : 'ill');
    }
    this.illness = false;
  }
  die(p, cause) {
    p.alive = false; p.deathYear = this.year; p.cause = cause;
    const a = Math.floor(this.ageOf(p));
    const h = p.home != null ? this.buildings[p.home] : null;
    if (h) h.residents = h.residents.filter(x => x !== p.id);
    if (p.spouse != null) { const s = this.people[p.spouse]; if (s.alive) { s.widow = true; this.lifeLog(s, `배우자 ${josa(p.given, '과')} 사별`); } }
    if (p.chief) { p.chief = false; this.chief = null; }
    this.lifeLog(p, `향년 ${a}세로 영면`);
    const grave = this.graves.length;
    this.graves.push({ id: p.id, idx: grave });
    const kids = p.children.filter(i => this.people[i].alive).length;
    this.write(`${josa(p.name, '이')} 향년 ${a}세로 평안히 눈을 감았다.${kids ? ` 자녀 ${kids}명이 곁을 지켰다.` : ''}`, '🕯️', 'death', this.map.cemetery, 2, { who: [p.id] });
    this.milestone('death', `${p.name}, 마을의 첫 이별`, '🕯️');
    this.emit('death', { id: p.id, grave });
    this.festivalBoost -= 4;
    p.task = null; p.inside = true;
  }
  immigration(scale = 1) {
    if (this.pop >= 60) return;
    const freeHomes = 1;
    const p = (0.2 + (this.happy - 50) * 0.006 + this.era * 0.04) * scale * (this.luck ? 2 : 1) * (this.pop > 45 ? 0.5 : 1);
    if (this.r() < p && this.happy > 45 && !this.hungry) this.newcomers();
  }
  newcomers(force = false) {
    const sur = this.surnamePool.shift() || this.pick(SURNAMES);
    const kind = this.r();
    const group = [];
    const m = this.addPerson({ surname: sur, gender: 'M', age: 24 + this.r() * 14 });
    group.push(m);
    if (kind < 0.75) {
      const w = this.addPerson({ surname: this.pick(SURNAMES.filter(s => s !== sur)), gender: 'F', age: this.ageOf(m) - 2 + this.r() * 4 });
      this.marry(m, w); group.push(w);
      const nk = kind < 0.45 ? 1 + Math.floor(this.r() * 2) : 0;
      for (let i = 0; i < nk; i++) { const k = this.addPerson({ surname: sur, gender: this.r() < 0.5 ? 'M' : 'F', age: 1 + this.r() * 9, father: m.id, mother: w.id, gen: 2 }); m.children.push(k.id); w.children.push(k.id); group.push(k); }
    }
    const fam = this.family(sur); fam.founder = m.id; fam.since = this.year;
    const by = this.has('station') ? '하늘 기차' : '열기구';
    const L = this.has('station') ? { x: this.map.station.x + Math.cos(this.map.station.ang) * -3, z: this.map.station.z + Math.sin(this.map.station.ang) * -3 } : this.map.landing;
    group.forEach((q, i) => { q.home = null; q.arrival = true; q.landed = false; q.x = L.x + (i - group.length / 2) * 0.8; q.z = L.z; this.lifeLog(q, `${by}를 타고 마을에 이주`); });
    this.after(4.2, () => group.forEach(q => { q.landed = true; if (this.r() < 0.5) this.say(q, 'newcomer', {}, 2.5); }));
    this.write(`${by}를 타고 ${sur}씨 가족 ${group.length}명이 이사를 왔다!`, by === '열기구' ? '🎈' : '🚂', 'arrive', this.map.landing, 3, { who: group.map(q => q.id) });
    this.milestone('immig', `첫 이주민 ${sur}씨 가족 도착`, '🎈');
    this.emit('arrive', { ids: group.map(q => q.id), by });
    this.assignJobs(true);
    return group;
  }
  election() {
    const cands = this.alive().filter(p => this.stage(p) === 'adult' || (this.stage(p) === 'elder' && this.ageOf(p) < 75));
    if (!cands.length) return;
    const score = (c) => c.t.social * 30 + c.t.ambition * 25 + c.t.kindness * 15 + Math.min(this.ageOf(c), 60) * 0.3 + this.alive().reduce((s, o) => s + (o !== c ? this.aff(o, c) : 0), 0) / this.pop + this.r() * 12;
    const w = cands.reduce((a, b) => score(b) > score(a) ? b : a);
    if (this.chief != null) this.people[this.chief].chief = false;
    const prev = this.chief;
    this.chief = w.id; w.chief = true;
    this.lifeLog(w, '촌장으로 선출');
    this.write(prev === w.id ? `${josa(w.name, '이')} 촌장으로 다시 뽑혔다. 연임!` : `마을 선거! ${josa(w.name, '이')} 새 촌장으로 뽑혔다.`, '🎖️', 'family', w, 2, { who: [w.id] });
    this.milestone('chief', `첫 촌장 ${w.name} 선출`, '🎖️');
  }
  summerEvents() {
    const r = this.r();
    if (r < 0.13) { this.harvestMult *= 0.55; this.write('비가 한 방울도 내리지 않는다. 가뭄이다…', '☀️', 'bad', { x: 16, z: 3 }, 1); }
    else if (r < 0.3) { this.harvestMult *= 1.35; this.write('햇살과 비가 알맞다. 올해는 풍년이 들 것 같다!', '🌤️', 'good', { x: 16, z: 3 }, 0); }
    else if (r < 0.38 && this.buildings.filter(b => b.built && b.type !== 'field' && b.type !== 'bridge').length > 8) {
      const b = this.pick(this.buildings.filter(b => b.built && !['field', 'bridge', 'quarry', 'fountain', 'station'].includes(b.type)));
      b.burning = 5; this.emit('build:fire', { b });
      this.write(`${BUILDINGS[b.type].label}에 불이 났다! 주민들이 물을 날라 불을 껐다.`, '🔥', 'bad', b, 3);
      this.after(5, () => { b.built = false; b.progress = 0.35; b.repair = true; this.emit('build:start', { b, repair: true }); });
    } else if (r < 0.5) { this.festivalBoost += 6; this.write('떠돌이 악사가 들러 밤새 노래를 불러 주었다.', '🎻', 'good', this.map.plaza, 0); }
    else if (r < 0.62) { this.res.coin += 18; this.write('외지 상인의 열기구가 들러 물건을 사 갔다. (+18냥)', '🎈', 'good', this.map.landing, 1); this.emit('caravan', {}); }
  }
  winterEvents() {
    const r = this.r();
    if (r < 0.22) { this.res.food -= this.pop * 0.5; this.write('폭설이 내려 마을이 하얗게 파묻혔다. 장작과 식량이 빠르게 줄어든다.', '🌨️', 'bad', this.map.plaza, 1); this.weather = 'blizzard'; }
    else if (r < 0.34) { this.illness = true; this.write(this.has('clinic') ? '고뿔이 돌았지만 의원 덕분에 금방 나았다.' : '독감이 돌아 노인들이 많이 앓았다.', '🤧', 'bad', this.map.plaza, 1); }
  }
  startFestival(blessed) {
    this.festival = true; this.festivalBoost += blessed ? 16 : 10;
    const pz = this.map.plaza;
    this.write(blessed ? '하늘의 축복! 광장에서 성대한 축제가 열렸다. 🎆' : `${this.year}년 가을 수확 축제! 광장에 등불이 걸렸다.`, '🏮', 'festival', pz, 3, { banner: '🏮 수확 축제', sub: '오늘 밤은 모두 광장으로!' });
    this.milestone('festival', '첫 축제', '🏮');
    this.emit('festival', { on: true });
    const al = this.alive().filter(p => this.stage(p) !== 'baby');
    al.forEach((p, i) => { p.inside = false; const a = (i / al.length) * Math.PI * 2 + this.r() * 0.3, rr = 3 + (i % 3) * 1.8; this.assign(p, { type: 'festival', to: { x: pz.x + Math.cos(a) * rr, z: pz.z + Math.sin(a) * rr, face: pz }, anim: 'dance', dur: DAY_LEN * 0.3 }); });
    // 축제에서 싹트는 인연
    const singles = al.filter(p => p.spouse == null && this.ageOf(p) >= 18 && this.ageOf(p) < 45);
    for (let i = 0; i < singles.length; i++) for (let j = i + 1; j < singles.length; j++) if (singles[i].gender !== singles[j].gender) this.addAff(singles[i], singles[j], 4 + this.r() * 6);
    this.after(DAY_LEN * 0.32, () => { this.festival = false; this.emit('festival', { on: false }); });
  }

  // ── 축복 (사용자) ──
  bless(kind) {
    if (this.blessCD[kind] > 0 || this.ended && !this.endless) return false;
    this.blessCD[kind] = 5;
    if (kind === 'rain') { this.harvestMult *= 1.6; this.weather = 'rain'; this.emit('weather', { type: 'rain', blessed: true }); this.res.food += 6; this.write('하늘이 단비를 내렸다. 들판이 촉촉하게 살아난다! (올해 수확 ↑)', '🌧️', 'bless', { x: 16, z: 3 }, 4); }
    if (kind === 'festival') this.startFestival(true);
    if (kind === 'love') {
      const singles = this.alive().filter(p => p.spouse == null && !p.widow && this.ageOf(p) >= 19 && this.ageOf(p) <= 48);
      let best = null;
      for (const a of singles) for (const b of singles) if (a.gender === 'M' && b.gender === 'F' && !this.related(a, b) && Math.abs(this.ageOf(a) - this.ageOf(b)) < 14) { const s = this.aff(a, b) + this.r() * 10; if (!best || s > best.s) best = { a, b, s }; }
      if (!best) { this.blessCD[kind] = 0; this.write('인연의 바람이 불었지만, 짝을 찾을 미혼 주민이 없었다.', '💞', 'info', null, 0); return false; }
      this.addAff(best.a, best.b, 60);
      this.write(`인연의 바람이 불었다. ${josa(best.a.name, '과')} ${best.b.name}의 눈이 마주쳤다… 💞`, '💞', 'bless', best.a, 4, { who: [best.a.id, best.b.id] });
      this.emit('emote', { id: best.a.id, e: '💗' }); this.emit('emote', { id: best.b.id, e: '💗' });
      this.after(2.5, () => this.holdWedding(best.a, best.b));
    }
    if (kind === 'luck') { this.luck = true; this.newcomers(true); this.after(YEAR_LEN, () => this.luck = false); }
    return true;
  }

  // ── 공사 ──
  updateConstruction(dt) {
    for (const b of this.sites()) {
      if (b.burning > 0) continue;
      const workers = this.alive().filter(p => p.task && p.task.type === 'build' && p.task.site === b.id && p.task.stage === 'do').length;
      const ph = this.dayPhase(), day = ph > 0.07 && ph < 0.75;
      const crew = this.jobCount('builder') / Math.max(1, this.sites().length);
      const rate = (day ? crew * 1.3 : 0) + workers * 0.7;
      if (!rate) continue;
      b.progress = Math.min(1, b.progress + dt * rate / b.work);
      if (b.progress >= 1) this.complete(b);
    }
  }
  complete(b) {
    b.built = true; b.progress = 1;
    const def = BUILDINGS[b.type];
    this.emit('build:done', { b });
    if (b.pendingFor) {
      const ppl = b.pendingFor.map(i => this.people[i]).filter(p => p.alive);
      const fam = ppl.flatMap(p => [p, ...p.children.map(i => this.people[i]).filter(k => k.alive && this.ageOf(k) < 18 && k.home === p.home)]);
      [...new Set(fam)].forEach(p => this.moveIn(p, b));
      if (ppl.some(p => p.arrival)) ppl.forEach(p => p.arrival = false);
      b.pendingFor = null;
      if (ppl[0]) this.write(`${ppl[0].surname}씨네 ${def.label} 완공! ${ppl.map(p => p.given).join('·')} 가족이 이사했다.`, def.icon, 'build', b, 1, { who: ppl.map(p => p.id) });
    } else if (b.repair) {
      b.repair = false;
      this.write(`불탔던 ${def.label}을(를) 모두 힘을 모아 다시 세웠다.`, '🧱', 'build', b, 1);
    } else if (b.renovate) {
      b.renovate = false;
      if (this.r() < 0.4) this.write(`낡은 집이 번듯한 ${def.label}으로 새 단장을 마쳤다.`, def.icon, 'build', b, 0);
    } else if (b.type !== 'field') {
      this.write(`${def.icon} ${def.label} 완공! 마을이 한층 살기 좋아졌다.`, '🎉', 'build', b, 3, { banner: `${def.icon} ${def.label} 완공` });
      this.milestone('b_' + b.type, `${def.label} 완공`, def.icon);
      if (JOB_OF[b.type]) this.assignJobs();
      if (b.type === 'station') { this.trainOn = true; this.write('하늘 기차가 처음으로 마을에 도착했다! 이제 구름 너머 세상과 이어졌다.', '🚂', 'era', b, 5, { banner: '🚂 하늘 기차 개통!', sub: '구름 너머 세상과 이어졌습니다' }); }
    }
  }

  // ── 주민 행동 ──
  assign(p, task) { p.task = { stage: 'go', t: 0, dur: 4, ...task }; p.label = task.type; }
  moveToward(p, tx, tz, spd, dt) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.12) { p.speed = 0; return true; }
    const s = Math.min(d, spd * dt);
    p.x += dx / d * s; p.z += dz / d * s; p.face = Math.atan2(dx, dz); p.speed = spd;
    return d < 0.35;
  }
  updatePeople(dt) {
    const ph = this.dayPhase();
    const night = ph > 0.8 || ph < 0.07;
    const evening = ph > 0.66 && !night;
    for (const p of this.people) {
      if (!p.alive) continue;
      const st = this.stage(p);
      if (p.arrival && !p.landed) continue;    // 열기구 도착 대기
      // 밤: 귀가
      const special = p.task && ['wedding', 'guest', 'festival'].includes(p.task.type);
      if (night && !special && !p.inside) {
        if (!p.task || p.task.type !== 'home') this.goHome(p);
      } else if (!night && p.inside && !(p.task && p.task.type === 'inwork')) {
        if (ph < 0.66 || this.festival) { this.exitHome(p); }
      }
      if (p.inside && (!p.task || p.task.type !== 'inwork')) { p.anim = 'idle'; continue; }
      if (!p.task) this.decide(p, st, evening);
      this.runTask(p, dt);
    }
  }
  homeDoor(p) {
    if (p.home != null) return this.buildings[p.home].door;
    const site = this.sites().find(b => (b.pendingFor || []).includes(p.id) || (b.pendingFor || []).includes(p.spouse ?? -1) || (b.pendingFor || []).includes(p.father ?? -1));
    return site ? { x: site.door.x + 1.5, z: site.door.z + 1.5, tent: true } : { x: this.map.plaza.x + 4, z: this.map.plaza.z + 4, tent: true };
  }
  goHome(p) {
    const d = this.homeDoor(p);
    this.assign(p, { type: 'home', to: d, anim: 'idle', dur: 0.2, onDone: (p) => { p.inside = true; p.task = null; } });
  }
  exitHome(p) {
    const d = this.homeDoor(p);
    p.inside = false; p.x = d.x + (this.r() - 0.5) * 0.6; p.z = d.z + (this.r() - 0.5) * 0.6;
  }
  decide(p, st, evening) {
    const m = this.map, r = this.r();
    const near = (c, rad) => ({ x: c.x + (this.r() - 0.5) * rad, z: c.z + (this.r() - 0.5) * rad });
    if (st === 'baby') {
      const mom = p.mother != null ? this.people[p.mother] : null;
      if (mom && mom.alive && !mom.inside) return this.assign(p, { type: 'follow', follow: mom.id, anim: 'idle', dur: 2, spd: 0.9 });
      return this.goHome(p);
    }
    if (evening) {
      if (st === 'child' || r < 0.5) return this.goHome(p);
      return this.assign(p, { type: 'plaza', to: near(m.plaza, 10), anim: st === 'elder' ? 'sit' : 'idle', dur: 2 + this.r() * 2, onArrive: (p) => this.maybeChat(p, 7) });
    }
    if (st === 'child') {
      if (r < 0.35) { const f = this.alive().filter(q => q !== p && ['child', 'teen'].includes(this.stage(q)) && !q.inside); if (f.length) return this.assign(p, { type: 'play', follow: this.pick(f).id, anim: 'run', run: true, dur: 2.5, onArrive: (p) => this.r() < 0.2 && this.say(p, 'kid', {}, 1.6) }); }
      return this.assign(p, { type: 'play', to: near(r < 0.5 ? m.plaza : this.homeDoor(p), 9), anim: 'play', run: true, dur: 2 + this.r() * 2 });
    }
    if (st === 'teen') {
      const school = this.buildings.find(b => b.type === 'school' && b.built);
      if (school && this.season !== 1 && r < 0.75) return this.assign(p, { type: 'school', to: school.door, anim: 'idle', dur: 0.2, onDone: (p) => { p.inside = true; p.task = { type: 'inwork', stage: 'do', t: 0, dur: 4 + this.r() * 2, hold: false, onDone: (p) => { p.inside = false; } }; } });
      if (r < 0.5) return this.assign(p, { type: 'play', to: near(m.plaza, 12), anim: 'play', run: true, dur: 3, onArrive: (p) => this.maybeChat(p, 6) });
      p.job = p.job || 'student';
      return this.work(p, this.parentJob(p) || 'farmer', true);
    }
    if (st === 'elder') {
      if (r < 0.55) return this.assign(p, { type: 'rest', to: near(m.plaza, 9), anim: 'sit', dur: 4 + this.r() * 3, onArrive: (p) => { if (this.r() < 0.25) this.say(p, 'elder', {}, 3); this.maybeChat(p, 6); } });
      if (r < 0.75 && this.graves.length) return this.assign(p, { type: 'visit', to: near(m.cemetery, 5), anim: 'idle', dur: 3 });
      return this.assign(p, { type: 'stroll', to: near(this.homeDoor(p), 10), anim: 'idle', dur: 2, spd: 0.6 });
    }
    // 어른
    if (r < 0.14) return this.socialize(p);
    this.work(p, p.job || 'farmer');
  }
  parentJob(p) { for (const id of [p.father, p.mother]) if (id != null) { const q = this.people[id]; if (q.alive && q.job && JOBS[q.job].prop && !JOBS[q.job].need) return q.job; } return null; }
  work(p, job, helper = false) {
    const m = this.map;
    const dur = 3.5 + this.r() * 3;
    const near = (c, rad) => ({ x: c.x + (this.r() - 0.5) * rad, z: c.z + (this.r() - 0.5) * rad, face: c.face || c });
    const at = (type) => this.buildings.find(b => b.type === type && b.built);
    if (job === 'builder' || (job === 'farmer' && this.sites().length && this.r() < 0.12)) {
      const s = this.sites().filter(b => !b.burning).sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (s) { const a = this.r() * 6.28, rr = s.type === 'field' ? 2 : s.type === 'station' ? 4.5 : 2.6; return this.assign(p, { type: 'build', site: s.id, to: { x: s.x + Math.cos(a) * rr, z: s.z + Math.sin(a) * rr, face: s }, anim: 'hammer', prop: 'hammer', dur: dur + 2, onArrive: (p) => this.r() < 0.15 && this.say(p, 'build', {}, 1.8) }); }
      job = 'farmer';
    }
    if (job === 'farmer') {
      const fields = this.buildings.filter(b => b.type === 'field' && b.built);
      if (fields.length) { if (p.field == null || !fields.includes(this.buildings[p.field])) p.field = this.pick(fields).id; const f = this.buildings[p.field]; return this.assign(p, { type: 'farm', to: { x: f.x + (this.r() - 0.5) * 3.6, z: f.z + (this.r() - 0.5) * 2.8, face: { x: f.x + 5, z: f.z } }, anim: this.season === 2 ? 'harvest' : 'farm', prop: this.season === 2 ? 'basket' : 'hoe', dur, onArrive: (p) => this.r() < 0.08 && this.say(p, 'farm', {}, 1.8) }); }
    }
    if (job === 'woodcutter' || (job === 'mason' && !this.has('quarry'))) {
      let best = null, bd = 1e9; const trees = m.trees;
      for (let k = 0; k < 8; k++) { const i = Math.floor(this.r() * trees.length); if (!this.treeAlive[i]) continue; const d = dist(trees[i], p); if (d < bd) { bd = d; best = trees[i]; } }
      if (best) return this.assign(p, { type: 'chop', to: { x: best.x + 0.9, z: best.z + 0.5, face: best }, anim: 'chop', prop: 'axe', dur, onArrive: (p) => this.r() < 0.1 && this.say(p, 'chop', {}, 1.6), onDone: (p) => this.emit('chop', { x: best.x, z: best.z }) });
    }
    if (job === 'mason') return this.assign(p, { type: 'mine', to: near(m.quarry, 6), anim: 'chop', prop: 'pick', dur, onArrive: (p) => this.r() < 0.1 && this.say(p, 'mine', {}, 1.6) });
    if (job === 'fisher') {
      const rv = m.river[2 + Math.floor(this.r() * (m.river.length - 4))];
      return this.assign(p, { type: 'fish', to: { x: rv.x + 2.6, z: rv.z + 0.6, face: rv }, anim: 'fish', prop: 'rod', dur: dur + 2, onArrive: (p) => this.r() < 0.12 && this.say(p, 'fish', {}, 1.8) });
    }
    const bmap = { smith: 'smithy', baker: 'bakery', merchant: 'market', teacher: 'school', doctor: 'clinic', innkeeper: 'inn', miller: 'windmill', librarian: 'library', stationmaster: 'station' };
    if (bmap[job]) {
      const b = at(bmap[job]);
      if (b) {
        if (this.r() < 0.45 && !['market'].includes(b.type)) return this.assign(p, { type: 'shop', to: b.door, anim: 'idle', dur: 0.2, onDone: (p) => { p.inside = true; p.task = { type: 'inwork', stage: 'do', t: 0, dur: 4 + this.r() * 3, onDone: (p) => { p.inside = false; } }; } });
        return this.assign(p, { type: 'shop', to: { x: b.door.x + (this.r() - 0.5) * 2, z: b.door.z + 0.8, face: b }, anim: job === 'smith' ? 'hammer' : 'idle', prop: job === 'smith' ? 'hammer' : null, dur, onArrive: (p) => this.r() < 0.12 && this.say(p, 'shop', {}, 1.8) });
      }
    }
    return this.assign(p, { type: 'gather', to: near(this.homeDoor(p), 8), anim: 'harvest', prop: 'basket', dur });
  }
  socialize(p) {
    const others = this.alive().filter(q => q !== p && !q.inside && this.stage(q) !== 'baby' && dist(q, p) < 22 && !(q.task && ['wedding', 'guest', 'festival', 'chat', 'listen'].includes(q.task.type)));
    if (!others.length) return this.work(p, p.job || 'farmer');
    const single = p.spouse == null && this.ageOf(p) >= 18;
    const q = others.sort((a, b) => (this.aff(p, b) + (single && b.spouse == null && b.gender !== p.gender && this.ageOf(b) >= 18 ? 25 : 0) + this.r() * 20) - (this.aff(p, a) + (single && a.spouse == null && a.gender !== p.gender && this.ageOf(a) >= 18 ? 25 : 0) + this.r() * 20))[0];
    this.assign(p, { type: 'chat', follow: q.id, anim: 'talk', dur: 3, onArrive: (p) => this.chat(p, q) });
  }
  maybeChat(p, rad) {
    if (this.r() > 0.35) return;
    const q = this.alive().find(o => o !== p && !o.inside && dist(o, p) < rad && this.stage(o) !== 'baby');
    if (q) { this.addAff(p, q, 2 + this.r() * 3); if (this.r() < 0.4) this.say(p, 'chatFriend', { b: q.given }, 2); }
  }
  chat(p, q) {
    if (!q.alive || q.inside) { p.task = null; return; }
    const romance = p.spouse == null && q.spouse == null && p.gender !== q.gender && this.ageOf(p) >= 18 && this.ageOf(q) >= 18 && !this.related(p, q) && this.aff(p, q) > 15;
    q.task = { type: 'listen', stage: 'do', t: 0, dur: 3.2, anim: 'talk' };
    q.face = Math.atan2(p.x - q.x, p.z - q.z); p.face = Math.atan2(q.x - p.x, q.z - p.z);
    this.say(p, romance ? 'love' : 'chatFriend', { b: q.given }, 2);
    this.after(1.4, () => this.say(q, romance ? 'loveRe' : 'chatRe', {}, 1.8));
    const v = (3 + this.r() * 5) * (0.6 + (p.t.social + q.t.social) * 0.4) * (romance ? 1.6 : 1);
    this.addAff(p, q, v);
    if (romance && this.aff(p, q) > 40) { this.emit('emote', { id: p.id, e: '💗' }); this.emit('emote', { id: q.id, e: '💗' }); }
  }
  runTask(p, dt) {
    const tk = p.task; if (!tk) { p.anim = 'idle'; p.speed = 0; return; }
    if (tk.stage === 'go') {
      let to = tk.to;
      if (tk.follow != null) { const f = this.people[tk.follow]; if (!f.alive || f.inside) { p.task = null; return; } to = { x: f.x + (tk.type === 'follow' ? 0.9 : 0), z: f.z + (tk.type === 'follow' ? 0.6 : 0) }; }
      const st = this.stage(p);
      const base = st === 'elder' ? 2.6 : st === 'child' ? 4.2 : st === 'baby' ? 3 : 4.2;
      const spd = base * (tk.run ? 1.7 : 1) * (tk.spd || 1);
      p.anim = tk.run && st !== 'elder' ? 'run' : 'walk'; p.prop = null;
      const arrived = this.moveToward(p, to.x, to.z, spd, dt);
      tk.t += dt;
      if (tk.follow != null ? dist(p, to) < (tk.type === 'follow' ? 0.4 : 1.4) : arrived) {
        tk.stage = 'do'; tk.t = 0; p.speed = 0;
        if (tk.to && tk.to.face) p.face = Math.atan2(tk.to.face.x - p.x, tk.to.face.z - p.z);
        tk.onArrive && tk.onArrive(p, tk);
      } else if (tk.t > 14) { p.task = null; }
    } else {
      tk.t += dt;
      p.anim = tk.anim || 'idle'; p.prop = tk.prop || null; p.speed = 0;
      if (tk.type === 'follow') { const f = this.people[tk.follow]; if (f && dist(p, f) > 1.4) { tk.stage = 'go'; } }
      if (tk.t >= tk.dur) { const done = tk.onDone; p.task = null; done && done(p, tk); }
    }
  }

  activeFamilies() {
    const set = new Map();
    for (const p of this.alive()) { if (p.gender === 'F' && p.spouse != null && this.people[p.spouse].surname !== p.surname && !p.arrival) continue; set.set(p.surname, (set.get(p.surname) || 0) + 1); }
    return [...set.entries()].map(([s, n]) => ({ ...this.families[s], n })).sort((a, b) => b.n - a.n);
  }
}
