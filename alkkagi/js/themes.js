/* 탁! 알까기 — 테마
 * 물리 데이터(마찰·판 모양·장애물)와 그리기 스타일을 함께 정의한다.
 * 좌표는 판 기준 0~600. 첫 배치 자리(흑 y=420·510, 백 y=90·180)는 비워 둔다.
 */
(function () {
  const Alk = (window.Alk = window.Alk || {});

  // 고정 시드 난수 (장식 위치가 매번 같도록)
  function seeded(seed) {
    return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  }

  const LIST = [
    {
      id: 'classic', name: '바둑판', desc: '장애물 없는 기본 판',
      swatch: 'linear-gradient(135deg,#f2c77c,#dea458)',
      mu: 1,
      style: { top: ['#f2c77c', '#dea458'], side: '#a5692a', grid: 'rgba(70,40,12,.62)', star: 'rgba(70,40,12,.8)', grain: 'rgba(140,80,20,A)' },
    },
    {
      id: 'ice', name: '꽁꽁 얼음판', desc: '잘 미끄러져요. 살살 쏘세요',
      swatch: 'linear-gradient(135deg,#eefaff,#9fd3ee)',
      mu: 0.45,
      style: { top: ['#effaff', '#a7d6ef'], side: '#5f9fc4', grid: 'rgba(60,120,170,.4)', star: 'rgba(60,120,170,.55)', grain: null, deco: 'ice' },
    },
    {
      id: 'grass', name: '잔디 마당', desc: '잘 안 굴러가요. 세게 쏘세요',
      swatch: 'linear-gradient(135deg,#9ee07a,#4f9e3c)',
      mu: 1.9,
      style: { top: ['#9fdc7c', '#5eaa47'], side: '#6b4a26', grid: 'rgba(255,255,255,.28)', star: 'rgba(255,255,255,.45)', grain: null, deco: 'grass' },
    },
    {
      id: 'maze', name: '블록 미로', desc: '나무 블록에 튕겨서 돌아가기',
      swatch: 'linear-gradient(135deg,#f2c77c 50%,#9a5b25 50%)',
      mu: 1,
      boxes: [
        { x: 30, y: 285, w: 130, h: 30 }, { x: 235, y: 285, w: 130, h: 30 }, { x: 440, y: 285, w: 130, h: 30 },
        { x: 95, y: 200, w: 30, h: 30 }, { x: 475, y: 200, w: 30, h: 30 },
        { x: 95, y: 370, w: 30, h: 30 }, { x: 475, y: 370, w: 30, h: 30 },
      ],
      style: { top: ['#f2c77c', '#dea458'], side: '#a5692a', grid: 'rgba(70,40,12,.5)', star: 'rgba(70,40,12,.7)', grain: 'rgba(140,80,20,A)' },
    },
    {
      id: 'pinball', name: '핀볼 범퍼', desc: '범퍼에 닿으면 세게 튕겨 나가요',
      swatch: 'radial-gradient(circle at 50% 50%,#ffd23f 0 22%,#ff5a6e 23% 40%,#9c84f5 41%)',
      mu: 1,
      bumpers: [
        { x: 300, y: 300, r: 26 },
        { x: 160, y: 245, r: 20 }, { x: 440, y: 245, r: 20 },
        { x: 160, y: 355, r: 20 }, { x: 440, y: 355, r: 20 },
      ],
      style: { top: ['#b9a6ff', '#8b70ee'], side: '#5a43b5', grid: 'rgba(255,255,255,.25)', star: 'rgba(255,255,255,.45)', grain: null, deco: 'pinball' },
    },
    {
      id: 'holes', name: '구멍 함정', desc: '구멍에 빠지면 탈락이에요',
      swatch: 'radial-gradient(circle at 50% 50%,#2a1a0c 0 30%,#dea458 32%)',
      mu: 1,
      holes: [
        { x: 300, y: 300, r: 36 },
        { x: 125, y: 300, r: 28 }, { x: 475, y: 300, r: 28 },
        { x: 210, y: 235, r: 18 }, { x: 390, y: 365, r: 18 },
      ],
      style: { top: ['#f2c77c', '#dea458'], side: '#a5692a', grid: 'rgba(70,40,12,.55)', star: 'rgba(70,40,12,.75)', grain: 'rgba(140,80,20,A)' },
    },
    {
      id: 'bridge', name: '풍차 다리', desc: '좁은 다리 위, 알이 움직이면 풍차가 돌아요',
      swatch: 'linear-gradient(90deg,#5fb6e6 0 30%,#dea458 30% 70%,#5fb6e6 70%)',
      mu: 1,
      regions: [
        { x: 0, y: 0, w: 600, h: 215 },
        { x: 190, y: 215, w: 220, h: 170 },
        { x: 0, y: 385, w: 600, h: 215 },
      ],
      spinners: [{ x: 300, y: 300, len: 88, th: 7, omega: 1.5, phase: 0.4, arms: 2 }],
      style: { top: ['#f2c77c', '#dea458'], side: '#a5692a', grid: 'rgba(70,40,12,.55)', star: 'rgba(70,40,12,.75)', grain: 'rgba(140,80,20,A)', water: true },
    },
  ];

  // 장식 미리 계산
  for (const t of LIST) {
    const rnd = seeded(t.id.length * 977 + 13);
    t.grainLines = [];
    for (let i = 0; i < 26; i++) {
      t.grainLines.push({ y: rnd() * 600, a: 3 + rnd() * 7, f: 0.006 + rnd() * 0.01, ph: rnd() * 6, w: 0.6 + rnd() * 1.6, o: 0.04 + rnd() * 0.07 });
    }
    t.dots = [];
    for (let i = 0; i < 40; i++) t.dots.push({ x: rnd() * 600, y: rnd() * 600, r: rnd(), k: rnd() });
  }

  Alk.Themes = {
    list: LIST,
    get: (id) => LIST.find((t) => t.id === id) || LIST[0],
  };
})();
