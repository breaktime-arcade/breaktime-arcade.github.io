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
 *
 * 옵션 (script 태그에 붙이기)
 *   data-fs="off"       게임에 이미 전체화면 버튼이 있으면 ⛶ 버튼을 숨김
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
    'cake-half': 'entry/cake-half', 'reaction': 'entry/reaction', 'one-second-ago': 'entry/one-second-ago'
  };

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
