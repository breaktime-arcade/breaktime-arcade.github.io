/*!
 * 쪽지 돌리기 (Secret Note) - AI 반 친구
 * © 2026 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 * 무단 복제·수정·재배포를 금지합니다.
 */
(function () {
  'use strict';
  const R = (a, b) => a + Math.random() * (b - a);

  // hold: 쪽지를 들고 버티는 시간(초), react: 선생님 단서를 보고 넘기기까지 반응 시간, miss: 단서를 놓칠 확률
  const PERSONAS = {
    coward: { label: '겁쟁이',     hold: [0.05, 0.4], react: [0.18, 0.35], miss: 0.05 },
    brave:  { label: '배짱이',     hold: [3.5, 8.0],  react: [0.30, 0.55], miss: 0.15 },
    sharp:  { label: '눈치왕',     hold: [1.2, 3.5],  react: [0.12, 0.26], miss: 0.03 },
    prank:  { label: '장난꾸러기', hold: [0.6, 2.2],  react: [0.22, 0.42], miss: 0.10 },
    dreamy: { label: '멍때리기',   hold: [2.0, 5.5],  react: [0.45, 0.85], miss: 0.30 }
  };
  const ORDER = ['coward', 'brave', 'sharp', 'prank', 'dreamy'];

  // 반환값: 쪽지를 넘길 대상 id, 또는 null
  function think(s, api) {
    if (api.holder !== s.id) { s.mind = {}; return null; }
    const m = s.mind || (s.mind = {});
    const P = PERSONAS[s.persona];
    const now = api.now;

    if (m.holdUntil == null) m.holdUntil = now + R(P.hold[0], P.hold[1]);

    if (api.alarm) {
      if (!m.sawAlarm) {
        m.sawAlarm = true;
        if (Math.random() > P.miss) m.reactAt = now + R(P.react[0], P.react[1]);
      }
    } else {
      m.sawAlarm = false;
    }

    if (!api.canPass || !api.targets.length) return null;
    if (now < m.holdUntil && !(m.reactAt != null && now >= m.reactAt)) return null;

    const opts = api.targets;
    if (s.persona === 'prank') {
      const human = opts.find(id => api.isHuman(id));
      if (human != null && Math.random() < 0.7) return human;
      return opts.reduce((a, b) => (api.score(b) > api.score(a) ? b : a));
    }
    return opts[Math.floor(Math.random() * opts.length)];
  }

  window.JJ_AI = { PERSONAS, ORDER, think };
})();