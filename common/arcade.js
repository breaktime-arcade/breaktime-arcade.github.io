/*!
 * 쉬는시간 오락실 공통 도구 (arcade.js)
 * © 쉬는시간 오락실 (smile-willow.tistory.com) · 무단 복제·배포 금지
 *
 * 각 게임 index.html 의 </body> 바로 앞에 한 줄만 넣으면 됩니다.
 *   <script src="../common/arcade.js" defer></script>
 *
 * 하는 일
 *  1) ⛶ 전체화면 버튼  (블로그 글 안에서도 크게 볼 수 있게)
 *  2) 🕹 더 많은 게임 버튼 (블로그로 이동)
 *  3) github.io 주소로 직접 들어온 방문자에게 "블로그에서 하기" 안내 띠
 *  4) 다른 탭·앱으로 이동하면 게임 소리 자동 정지 (돌아오면 다시 재생)
 *
 * 옵션 (script 태그에 붙이기)
 *   data-fs="off"       게임에 이미 전체화면 버튼이 있으면 ⛶ 버튼을 숨김
 *   data-ui="off"       버튼·안내 띠 없이 4) 소리 정지 기능만 사용
 *   data-pos="tr"       버튼 위치: tl(왼쪽 위, 기본) tr(오른쪽 위) bl(왼쪽 아래) br(오른쪽 아래) ml(왼쪽 가운데) mr(오른쪽 가운데)
 */
(function () {
  'use strict';
  if (window.__arcadeLoaded) return;
  window.__arcadeLoaded = true;

  var BLOG = 'https://smile-willow.tistory.com/';
  // 게임 폴더 → 블로그 글 주소
  var POSTS = {
    'paint-grab': 'entry/paint-grab', 'gonggi': 'entry/gonggi', 'brain-survival': 'entry/brain-survival',
    'ddakji': 'entry/ddakji', 'jegi': 'entry/jegi', 'recess-defense': 'entry/recess-defense', 'omok': 'entry/omok',
    'apple-ten': 'entry/AppleTen', 'redhood-forest': 'entry/Red-Hood-Forest-Path', 'mini-grandprix-3d': 'entry/mini-grandprix-3d',
    'mini-grandprix-2d': 'entry/mini-grandprix-2d', 'alkkagi': 'entry/alkkagi', 'earthquake-architect': 'entry/earthquake-architect',
    'beat-kitchen': 'entry/beat-kitchen', 'orb-abductors': 'entry/orb-abductors', 'crab-bonk': 'entry/crab-bonk',
    'dust-duel': 'entry/dust-duel', 'cloud-drift': 'entry/cloud-drift', 'shifting-shelves': 'entry/shifting-shelves',
    'AntSugarVault': 'entry/AntSugarVault', 'demolition-architect': 'entry/demolition-architect', 'acorn-bank': 'entry/acorn-bank',
    'octopus-chef-orders': 'entry/octopus-chef-orders', 'cat-post-stamp-slam': 'entry/cat-post-stamp-slam',
    'duck-capsule-combo': 'entry/duck-capsule-combo', 'hamster-balloon-ride': 'entry/hamster-balloon-ride',
    'cake-half': 'entry/cake-half', 'reaction': 'entry/reaction', 'one-second-ago': 'entry/one-second-ago',
    'jjokji': 'entry/jjokji', 'ddaeng-shutter': 'entry/ddaeng-shutter',
    'rhythm-echo-class': 'entry/rhythm-echo-class', 'bunsik-merge-defense': 'entry/bunsik-merge-defense'
  };

  // 4) 백그라운드 소리 정지 ----------------------------------------------
  //   게임 코드를 고치지 않아도, 탭이 가려지면 모든 Web Audio·오디오 태그·음성 안내를 멈춘다.
  (function () {
    var ctxs = [], held = [], medias = [], heldMedia = [], SUS = null, RES = null;
    var AC = window.AudioContext || window.webkitAudioContext;
    var proto = window.BaseAudioContext ? window.BaseAudioContext.prototype : (AC && AC.prototype);
    var hidden = function () { return document.hidden || document.visibilityState === 'hidden'; };
    var reg = function (c) { if (c && ctxs.indexOf(c) < 0) { ctxs.push(c); if (hidden()) hold(c); } };
    function hold(c) {
      try { if (SUS && c.state === 'running') { if (held.indexOf(c) < 0) held.push(c); SUS.call(c); } } catch (e) {}
    }
    if (proto) {
      ['createGain', 'createOscillator', 'createBufferSource', 'createBiquadFilter', 'createDynamicsCompressor', 'createMediaElementSource'].forEach(function (m) {
        var o = proto[m]; if (typeof o !== 'function') return;
        proto[m] = function () { reg(this); return o.apply(this, arguments); };
      });
      var dd = Object.getOwnPropertyDescriptor(proto, 'destination');
      if (dd && dd.get && dd.configurable) Object.defineProperty(proto, 'destination', { configurable: true, enumerable: dd.enumerable, get: function () { reg(this); return dd.get.call(this); } });
      // suspend/resume 은 브라우저에 따라 AudioContext 쪽에 있음
      var rp = (AC && AC.prototype.resume) ? AC.prototype : proto;
      var oRes = rp.resume, oSus = rp.suspend;
      SUS = oSus; RES = oRes;
      if (oRes) rp.resume = function () { reg(this); if (hidden()) { if (held.indexOf(this) < 0) held.push(this); return Promise.resolve(); } return oRes.apply(this, arguments); };
      if (oSus) rp.suspend = function () { var i = held.indexOf(this); if (i >= 0) held.splice(i, 1); return oSus.apply(this, arguments); };
    }
    var MP = window.HTMLMediaElement && HTMLMediaElement.prototype;
    if (MP && MP.play) {
      var oPlay = MP.play;
      MP.play = function () {
        if (medias.indexOf(this) < 0) medias.push(this);
        if (hidden()) { if (heldMedia.indexOf(this) < 0) heldMedia.push(this); return Promise.resolve(); }
        return oPlay.apply(this, arguments);
      };
      MP.__arPlay = oPlay;
    }
    var ss = window.speechSynthesis;
    if (ss && ss.speak) { var oSpeak = ss.speak.bind(ss); try { ss.speak = function (u) { if (!hidden()) oSpeak(u); }; } catch (e) {} }

    var off = false;
    function goBg() {
      if (off) return; off = true;
      ctxs.forEach(hold);
      document.querySelectorAll('audio,video').forEach(function (m) { if (medias.indexOf(m) < 0) medias.push(m); });
      medias.forEach(function (m) { try { if (!m.paused) { heldMedia.push(m); m.pause(); } } catch (e) {} });
      try { if (ss) ss.cancel(); } catch (e) {}
    }
    function goFg() {
      if (!off || hidden()) return; off = false;
      held.splice(0).forEach(function (c) { try { if (RES && c.state !== 'closed') RES.call(c); } catch (e) {} });
      heldMedia.splice(0).forEach(function (m) { try { MP.__arPlay.call(m).catch(function () {}); } catch (e) {} });
    }
    document.addEventListener('visibilitychange', function () { hidden() ? goBg() : goFg(); });
    window.addEventListener('pagehide', goBg);
    window.addEventListener('pageshow', function () { if (!hidden()) goFg(); });
    document.addEventListener('freeze', goBg);
    document.addEventListener('resume', goFg);
    if (hidden()) goBg();
  })();

  var me = document.currentScript || (function () { var s = document.getElementsByTagName('script'); return s[s.length - 1]; })();
  var opt = function (k, d) { return (me && me.getAttribute('data-' + k)) || d; };
  var folder = (location.pathname.split('/').filter(Boolean)[0]) || '';
  var postUrl = POSTS[folder] ? BLOG + POSTS[folder] : BLOG;

  var inFrame = true;
  try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }

  var pos = opt('pos', 'tl');
  var V = pos.charAt(0) === 'b' ? 'bottom' : 'top', H = pos.charAt(1) === 'r' ? 'right' : 'left', MID = pos.charAt(0) === 'm';

  var css = '' +
    '.ar-dock{position:fixed;' + (MID ? 'top:50%;transform:translateY(-50%);' : V + ':8px;') + H + ':' + (MID ? '4px' : '8px') + ';z-index:2147483000;display:flex;gap:6px;flex-direction:' + (MID ? 'column' : (H === 'right' ? 'row-reverse' : 'row')) + ';pointer-events:none}' +
    '.ar-btn{pointer-events:auto;width:34px;height:34px;border-radius:50%;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(20,16,40,.55);color:#fff;font:700 16px/1 sans-serif;text-decoration:none;opacity:.6;transition:opacity .2s,transform .1s;' +
    'box-shadow:0 2px 6px rgba(0,0,0,.25);-webkit-tap-highlight-color:transparent}' +
    '.ar-btn:hover,.ar-btn:focus{opacity:1;outline:none}.ar-btn:active{transform:scale(.92)}' +
    '.ar-bar{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:2147483001;display:flex;align-items:center;gap:8px;max-width:calc(100% - 20px);' +
    'background:#2b2140;color:#fff;border-radius:999px;padding:6px 6px 6px 14px;font:700 13px/1.3 "Noto Sans KR",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3);animation:arIn .4s ease}' +
    '.ar-bar a{color:#ffd23f;text-decoration:none;white-space:nowrap}.ar-bar span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.ar-bar button{border:0;background:rgba(255,255,255,.15);color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;flex:none;font-size:12px}' +
    '@keyframes arIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}';

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    if (opt('ui', 'on') === 'off') return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var dock = document.createElement('div'); dock.className = 'ar-dock';

    // 1) 전체화면 버튼
    var root = document.documentElement;
    var fsOk = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    var isFs = function () { return !!(document.fullscreenElement || document.webkitFullscreenElement); };
    if (fsOk && opt('fs', 'on') !== 'off') {
      var fb = document.createElement('button');
      fb.className = 'ar-btn'; fb.type = 'button'; fb.title = '전체화면'; fb.setAttribute('aria-label', '전체화면'); fb.textContent = '⛶';
      fb.addEventListener('click', function (e) {
        e.stopPropagation();
        try {
          if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
          else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
        } catch (err) {}
      });
      ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { fb.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
      var sync = function () { fb.textContent = isFs() ? '✕' : '⛶'; fb.title = isFs() ? '전체화면 끄기' : '전체화면'; };
      document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
      dock.appendChild(fb);
    }

    // 2) 더 많은 게임 (블로그 안에서는 블로그 첫 화면으로, 직접 방문은 이 게임의 블로그 글로)
    var mb = document.createElement('a');
    mb.className = 'ar-btn'; mb.href = inFrame ? BLOG : postUrl; mb.target = '_top'; mb.rel = 'noopener';
    mb.title = '쉬는시간 오락실 - 더 많은 게임'; mb.setAttribute('aria-label', '더 많은 게임'); mb.textContent = '🕹';
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { mb.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    dock.appendChild(mb);
    document.body.appendChild(dock);

    // 3) 직접 방문자 안내 띠
    if (!inFrame) {
      var bar = document.createElement('div'); bar.className = 'ar-bar';
      bar.innerHTML = '<a href="' + postUrl + '" target="_top">🕹 쉬는시간 오락실 블로그에서 하기 →</a><button type="button" aria-label="닫기">✕</button>';
      bar.querySelector('button').addEventListener('click', function (e) { e.stopPropagation(); bar.remove(); });
      ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { bar.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
      document.body.appendChild(bar);
      setTimeout(function () { if (bar.parentNode) { bar.style.transition = 'opacity .6s'; bar.style.opacity = '0'; setTimeout(function () { bar.remove(); }, 700); } }, 12000);
    }
  });
})();


/* ===== 실시간 접속자 출석 (쉬는시간 오락실) ===== */
(function () {
  var DB = 'https://breaktime-arcade-live-default-rtdb.asia-southeast1.firebasedatabase.app';
  var game = (location.pathname.split('/')[1] || '').toLowerCase();   // 예: /ddakji/ → ddakji
  if (!/^[a-z0-9-]{1,40}$/.test(game) || game === 'common') return;

  var id;
  try { id = sessionStorage.getItem('ba_pid'); } catch (e) {}
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { sessionStorage.setItem('ba_pid', id); } catch (e) {}
  }
  var base = DB + '/presence/' + game;
  var url = base + '/' + id + '.json';
  var timer = null;

  function beat() {
    fetch(url, { method: 'PUT', keepalive: true,
      body: JSON.stringify({ t: { '.sv': 'timestamp' } }) }).catch(function () {});
    if (Math.random() < 0.1) sweep();          // 가끔 오래된 기록 청소
  }
  function sweep() {
    var cut = Date.now() - 180000;             // 3분 넘은 기록
    fetch(base + '.json?orderBy=' + encodeURIComponent('"t"') + '&endAt=' + cut)
      .then(function (r) { return r.json(); })
      .then(function (old) {
        if (!old) return;
        var patch = {};
        Object.keys(old).forEach(function (k) { patch[k] = null; });
        if (Object.keys(patch).length)
          fetch(base + '.json', { method: 'PATCH', body: JSON.stringify(patch) });
      }).catch(function () {});
  }
  function start() { if (timer) return; beat(); timer = setInterval(beat, 30000); }
  function leave() {
    clearInterval(timer); timer = null;
    fetch(url, { method: 'DELETE', keepalive: true }).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () { document.hidden ? leave() : start(); });
  window.addEventListener('pagehide', leave);
  if (!document.hidden) start();
})();
