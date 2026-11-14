// 파도풀 안전요원 - 화면 UI
import * as THREE from 'three';
import { TOOLS, TOOL_ORDER, TYPES } from './incidents.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const _v = new THREE.Vector3();

const GUIDE = {
  whistle: ['구명조끼 없이 물에 들어감', '풀사이드에서 뛰기', '유리병 반입', '다이빙 시도', '이용객끼리 싸움', '파도 벽에 매달리기'],
  buoy: ['물속에서 허우적거림', '튜브가 뒤집혀 매달림', '다리 경련으로 가라앉음'],
  rescue: ['물에 엎드린 채 움직이지 않음'],
  broadcast: ['안전선(빨간 부표) 밖으로 나감', '보호자 없이 울고 있는 아이'],
  medic: ['넘어져 주저앉은 부상자', '얼굴이 빨갛고 비틀거림(일사병)'],
};

export class UI {
  constructor(g) {
    this.g = g; this.bubbles = []; this.arrows = new Map();
    this.wui = $('#world-ui'); this.radialEl = $('#radial');
    this._buildHud(); this._bind();
  }

  _buildHud() {
    $('#hud').innerHTML = `
      <div class="hud-l glass"><div class="shift-name" id="h-shift">1교대 · 오전 근무</div>
        <div class="timer-row"><span id="h-time">2:00</span><div class="bar"><i id="h-bar"></i></div></div></div>
      <div class="hud-c"><div class="score" id="h-score">0</div><div class="combo" id="h-combo"></div></div>
      <div class="hud-r"><div class="hearts glass" id="h-hearts"></div>
        <button class="ib glass" id="b-sound" title="소리">🔊</button><button class="ib glass" id="b-guide" title="근무 수칙">📖</button><button class="ib glass" id="b-pause" title="일시정지">⏸</button></div>
      <div class="zoom"><button class="ib glass post" id="b-post" title="반대편 감시대로 이동 (C)">🔄</button><button class="ib glass" id="b-zin">＋</button><button class="ib glass" id="b-zout">－</button></div>
      <div class="tip" id="h-tip">위험한 이용객을 눌러 대응 도구를 고르세요 · 드래그로 둘러보기 · 휠/두 손가락으로 망원경 · 🔄 반대편 감시대</div>`;
  }

  _bind() {
    const g = this.g;
    $('#b-sound').onclick = () => { g.audio.setMuted(!g.audio.muted); $('#b-sound').textContent = g.audio.muted ? '🔇' : '🔊'; };
    $('#b-pause').onclick = () => g.togglePause();
    $('#b-post').onclick = () => g.switchPost();
    $('#b-guide').onclick = () => { if (g.state === 'play') g.togglePause(true); this.showGuide(() => this.showPause()); };
    $('#b-zin').onclick = () => g.zoomBy(0.7);
    $('#b-zout').onclick = () => g.zoomBy(1 / 0.7);
    for (const b of ['#b-post', '#b-sound', '#b-pause', '#b-guide', '#b-zin', '#b-zout']) { $(b).addEventListener('pointerdown', (e) => e.stopPropagation()); }
  }

  hud(show) { $('#hud').classList.toggle('hidden', !show); }

  updateHud() {
    const g = this.g;
    const left = Math.max(0, g.shiftTime - g.elapsed);
    $('#h-time').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    $('#h-time').classList.toggle('warn', left < 15);
    $('#h-bar').style.width = `${(left / g.shiftTime) * 100}%`;
    const sc = $('#h-score'); const shown = +sc.dataset.v || 0;
    if (shown !== g.score) { const nv = Math.abs(g.score - shown) < 3 ? g.score : Math.round(shown + (g.score - shown) * 0.25); sc.dataset.v = nv; sc.textContent = nv.toLocaleString(); }
    $('#h-combo').textContent = g.combo >= 2 ? `${g.combo} 연속 성공!` : '';
    $('#h-combo').classList.toggle('on', g.combo >= 2);
    const hh = '❤️'.repeat(g.hearts) + '<span class="lost">🤍</span>'.repeat(Math.max(0, 3 - g.hearts));
    if (this._hh !== hh) { $('#h-hearts').innerHTML = hh; this._hh = hh; }
  }

  setShiftLabel(t) { $('#h-shift').textContent = t; }

  // ---------- 월드 위 UI ----------
  project(pos) {
    const g = this.g; _v.copy(pos).project(g.camera);
    return { x: (_v.x * 0.5 + 0.5) * g.W, y: (-_v.y * 0.5 + 0.5) * g.H, on: _v.z < 1 };
  }

  bubble(p, txt, dur = 1.3) {
    const e = el('div', 'bubble', txt); this.wui.appendChild(e);
    this.bubbles.push({ e, p, t: dur, max: dur });
  }

  popup(x, y, txt, cls = '') {
    const e = el('div', 'popup ' + cls, txt); e.style.left = x + 'px'; e.style.top = y + 'px';
    this.wui.appendChild(e); setTimeout(() => e.remove(), 1400);
  }

  popupAt(p, txt, cls) { const s = this.project(p.wh); this.popup(s.x, s.y - 40, txt, cls); }

  banner(txt, cls = '', dur = 3200) {
    const b = $('#banner'); b.innerHTML = txt; b.className = 'show ' + cls;
    clearTimeout(this._bt); this._bt = setTimeout(() => (b.className = ''), dur);
  }

  subtitle(txt, dur = 4500) {
    const s = $('#subtitle'); s.innerHTML = '📢 ' + txt; s.classList.add('show');
    clearTimeout(this._st); this._st = setTimeout(() => s.classList.remove('show'), dur);
  }

  flash(cls = 'red') { const v = $('#vignette'); v.className = ''; void v.offsetWidth; v.className = cls; }
  glare(on) { $('#glare').classList.toggle('on', on); }
  rain(on) { $('#rainfx').classList.toggle('on', on); }

  updateWorld(dt) {
    for (const b of [...this.bubbles]) {
      b.t -= dt;
      if (b.t <= 0 || !b.p.alive) { b.e.remove(); this.bubbles.splice(this.bubbles.indexOf(b), 1); continue; }
      const s = this.project(b.p.wh);
      b.e.style.transform = `translate(${s.x}px,${s.y - 34}px) translate(-50%,-100%) scale(${Math.min(1, (b.max - b.t) * 6)})`;
      b.e.style.opacity = Math.min(1, b.t * 3);
    }
    // 화면 밖 위험 표시 화살표
    const g = this.g, seen = new Set();
    for (const inc of g.inc.list) {
      if (!inc.marker || !inc.marker.visible) continue;
      const s = this.project(inc.marker.position);
      const m = 34;
      if (s.on && s.x > m && s.x < g.W - m && s.y > m && s.y < g.H - m) continue;
      seen.add(inc);
      let a = this.arrows.get(inc);
      if (!a) { a = el('div', 'arrow', '<i>!</i>'); this.wui.appendChild(a); this.arrows.set(inc, a); }
      let x = s.x, y = s.y; if (!s.on) { x = g.W - x; y = g.H - y; }
      const cx = g.W / 2, cy = g.H / 2, dx = x - cx, dy = y - cy;
      const k = Math.min((cx - m) / Math.abs(dx || 1), (cy - m) / Math.abs(dy || 1));
      a.style.transform = `translate(${cx + dx * k}px,${cy + dy * k}px) translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`;
      a.firstChild.style.rotate = `${-Math.atan2(dy, dx)}rad`;
    }
    for (const [inc, a] of this.arrows) if (!seen.has(inc)) { a.remove(); this.arrows.delete(inc); }
    if (this.radialP) this._placeRadial();
  }

  clearWorld() { this.wui.innerHTML = ''; this.bubbles = []; this.arrows.clear(); this.closeRadial(); }

  // ---------- 도구 메뉴 ----------
  openRadial(p) {
    const g = this.g; this.radialP = p;
    const r = this.radialEl; r.innerHTML = ''; r.classList.remove('hidden');
    TOOL_ORDER.forEach((k, i) => {
      const T = TOOLS[k];
      const b = el('button', 'tool', `<span class="ic">${T.icon}</span><span class="nm">${T.name}</span><span class="ky">${T.key}</span>`);
      b.dataset.tool = k;
      if (k === 'broadcast' && g.paBroken) b.classList.add('off');
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      b.addEventListener('click', (e) => { e.stopPropagation(); g.useTool(k); });
      r.appendChild(b);
    });
    r.appendChild(el('div', 'ring-hint', ''));
    this._placeRadial(true);
    this.setLock(g.lock > 0);
  }

  _placeRadial(first) {
    const g = this.g, p = this.radialP; if (!p || !p.alive) return this.closeRadial();
    const s = this.project(p.wh.clone().setY(p.wh.y - 0.2));
    const btns = this.radialEl.querySelectorAll('.tool');
    const h = this.radialEl.querySelector('.ring-hint');
    const dock = g.W < 700;
    this.radialEl.classList.toggle('dock', dock);
    document.body.classList.toggle('radial-open', true);
    if (dock) {
      const gap = g.W / (btns.length + 1);
      btns.forEach((b, i) => { b.style.transform = `translate(${gap * (i + 1)}px,${g.H - 92}px) translate(-50%,-50%)`; if (first) b.style.transitionDelay = `${i * 25}ms`; });
      return;
    }
    const R = 112, up = s.y > 210;
    const cx = Math.min(Math.max(s.x, R + 44), g.W - R - 44);
    btns.forEach((b, i) => {
      const ang = up ? Math.PI + (i / (btns.length - 1)) * Math.PI : Math.PI - (i / (btns.length - 1)) * Math.PI;
      const x = cx + Math.cos(ang) * R, y = s.y + Math.sin(ang) * R + (up ? -12 : 12);
      b.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      if (first) b.style.transitionDelay = `${i * 25}ms`;
    });
  }

  setLock(on, sec) {
    this.radialEl.classList.toggle('locked', on);
  }

  closeRadial() { document.body.classList.remove('radial-open'); this.radialP = null; this.radialEl.classList.add('hidden'); this.radialEl.innerHTML = ''; }

  // ---------- 화면 ----------
  screen(html, cls = '') {
    const s = $('#screens'); s.className = 'show ' + cls; s.innerHTML = `<div class="panel">${html}</div>`;
    s.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.g.audio.click()));
    return s;
  }
  hideScreen() { $('#screens').className = ''; $('#screens').innerHTML = ''; }

  showTitle() {
    const best = this.g.best;
    const s = this.screen(`
      <div class="title-art"><div class="sun"></div><div class="wv w1"></div><div class="wv w2"></div><div class="wv w3"></div><div class="buoy-ic">🛟</div></div>
      <h1>파도풀 안전요원</h1>
      <p class="sub">높은 감시탑 위의 당신, 오늘도 무사히 근무를 마칠 수 있을까요?</p>
      <div class="btns"><button class="big primary" id="s-start">🏖️ 근무 시작</button><button class="big" id="s-guide">📖 근무 수칙</button></div>
      ${best ? `<p class="best">최고 기록 <b>${best.toLocaleString()}</b>점</p>` : ''}
      <p class="foot">총 5교대 · 교대당 2분 · 사고 3번이면 근무 종료</p>`, 'title');
    s.querySelector('#s-start').onclick = () => this.g.startGame();
    s.querySelector('#s-guide').onclick = () => this.showGuide(() => this.showTitle());
  }

  showGuide(back) {
    let rows = '';
    for (const k of TOOL_ORDER) {
      const T = TOOLS[k];
      rows += `<div class="g-row"><div class="g-tool"><span>${T.icon}</span><b>${T.name}</b><i>${T.key}</i></div><ul>${GUIDE[k].map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
    }
    const s = this.screen(`<h2>📖 안전요원 근무 수칙</h2>
      <div class="g-grid">${rows}</div>
      <div class="g-tips">
        <p>✅ <b>물에 들어간 이용객은 모두 구명조끼(주황색)나 튜브를 착용</b>해야 해요.</p>
        <p>⚠️ 구명조끼를 입고 웃으며 팔을 흔드는 사람은 <b>장난</b>일 수 있어요. 잘못 지적하면 감점!</p>
        <p>⏱️ 오래 방치하면 머리 위에 <b style="color:#ff3b30">!</b> 표시가 뜨고, 더 늦으면 사고가 나요.</p>
        <p>🖱️ 사람을 눌러 도구 선택 · 드래그로 둘러보기 · 휠/두 손가락으로 망원경 · 숫자키 1~5</p>
        <p>🔄 버튼(또는 C키)으로 <b>왼쪽·오른쪽 감시대</b>를 오가며 멀리 있는 곳을 살피세요.</p>
      </div>
      <div class="btns"><button class="big primary" id="g-back">확인</button></div>`, 'guide');
    s.querySelector('#g-back').onclick = back;
  }

  showIntro(n, cfg, isNew, go) {
    const news = isNew.map((k) => `<span class="chip">${TOOLS[TYPES[k].tool].icon} ${TYPES[k].name}</span>`).join('');
    const evs = (cfg.events || []).map((e) => `<span class="chip ev">${e.label}</span>`).join('');
    const s = this.screen(`
      <div class="shift-no">${n}교대</div>
      <h2>${cfg.icon} ${cfg.name}</h2>
      <p class="sub">이용객 약 <b>${cfg.people}명</b> · 근무 시간 2분</p>
      ${news ? `<div class="sec">새로운 위험 상황</div><div class="chips">${news}</div>` : ''}
      ${evs ? `<div class="sec">예상되는 돌발 상황</div><div class="chips">${evs}</div>` : ''}
      <div class="btns"><button class="big primary" id="i-go">근무 시작</button></div>`, 'intro');
    s.querySelector('#i-go').onclick = go;
  }

  countdown(cb) {
    const c = el('div', 'count', '3'); document.body.appendChild(c);
    let n = 3; this.g.audio.countdown(false);
    const it = setInterval(() => {
      n--; if (n > 0) { c.textContent = n; this.g.audio.countdown(false); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
      else { clearInterval(it); c.textContent = '근무 시작!'; this.g.audio.countdown(true); c.classList.add('go'); setTimeout(() => c.remove(), 700); cb(); }
    }, 750);
  }

  showResult(n, st, grade, last, onNext) {
    const s = this.screen(`
      <div class="shift-no">${n}교대 근무 종료</div>
      <div class="grade g-${grade}">${grade}</div>
      <div class="stats">
        <div><span>구조·대응 성공</span><b>${st.ok}</b></div>
        <div><span>사고 발생</span><b class="${st.acc ? 'bad' : ''}">${st.acc}</b></div>
        <div><span>잘못된 대응</span><b>${st.wrong + st.falseA}</b></div>
        <div><span>최고 연속 성공</span><b>${st.maxCombo}</b></div>
        <div class="tot"><span>이번 교대 점수</span><b>${st.score.toLocaleString()}</b></div>
      </div>
      <div class="btns"><button class="big primary" id="r-next">${last ? '최종 결과 보기' : '다음 교대로'}</button></div>`, 'result');
    s.querySelector('#r-next').onclick = onNext;
  }

  showFinal(total, grade, title, cleared, best, stats) {
    const s = this.screen(`
      <div class="shift-no">${cleared ? '오늘 근무 완료! 🎉' : '근무 종료'}</div>
      <h2>${title}</h2>
      <div class="grade g-${grade}">${grade}</div>
      <div class="stats">
        <div><span>완료한 교대</span><b>${stats.shifts} / 5</b></div>
        <div><span>총 대응 성공</span><b>${stats.ok}</b></div>
        <div><span>총 사고</span><b>${stats.acc}</b></div>
        <div class="tot"><span>최종 점수</span><b>${total.toLocaleString()}</b></div>
        <div><span>최고 기록</span><b>${best.toLocaleString()}</b></div>
      </div>
      <div class="btns"><button class="big primary" id="f-again">다시 근무하기</button><button class="big" id="f-title">처음으로</button></div>`, 'final');
    s.querySelector('#f-again').onclick = () => this.g.startGame();
    s.querySelector('#f-title').onclick = () => this.g.toTitle();
  }

  showPause() {
    const s = this.screen(`<h2>⏸ 일시정지</h2>
      <div class="btns col"><button class="big primary" id="p-go">계속 근무하기</button><button class="big" id="p-guide">📖 근무 수칙</button><button class="big" id="p-quit">처음으로</button></div>`, 'pause');
    s.querySelector('#p-go').onclick = () => this.g.togglePause(false);
    s.querySelector('#p-guide').onclick = () => this.showGuide(() => this.showPause());
    s.querySelector('#p-quit').onclick = () => this.g.toTitle();
  }
}
